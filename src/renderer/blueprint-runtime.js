(function exposeBlueprintRuntime(global) {
  const TERMINAL_NODE_STATES = new Set(["completed", "failed", "skipped"]);
  const HUMAN_NODE_TYPES = new Set(["human-input", "approval", "review-edit", "deliverable-gate"]);
  const AI_NODE_TYPES = new Set(["agent-task", "context-lens", "knowledge-retrieve", "evaluator", "synthesizer"]);
  const PASS_THROUGH_TYPES = new Set(["parallel", "join", "for-each", "error-catch"]);

  function getPath(source, path) {
    return String(path || "").split(".").filter(Boolean).reduce((value, key) => value?.[key], source);
  }

  function parseLooseValue(value) {
    const text = String(value ?? "").trim();
    if (!text) return "";
    if (text === "true") return true;
    if (text === "false") return false;
    if (text === "null") return null;
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try { return JSON.parse(text); } catch { return text; }
    }
    return value;
  }

  function createBlueprintRuntime({
    createId,
    now = () => new Date(),
    validateBlueprint,
    adapters = {},
    onChange = () => undefined
  } = {}) {
    const activeRuns = new Set();

    function getExecutionBlueprint(blueprint, task) {
      if (!task?.definition?.nodes || !task?.definition?.edges) return blueprint;
      return { ...blueprint, nodes: task.definition.nodes, edges: task.definition.edges, version: task.definition.version || task.blueprintVersion };
    }

    function timestamp() {
      return now().toISOString();
    }

    function ensureTask(blueprint, task) {
      const executionBlueprint = getExecutionBlueprint(blueprint, task);
      task.status = String(task.status || "ready");
      task.goal = String(task.goal || "");
      task.workspace = String(task.workspace || blueprint.path || "");
      task.blueprintVersion = Math.max(1, Number(task.blueprintVersion) || blueprint.version || 1);
      task.createdAt ||= timestamp();
      task.updatedAt ||= task.createdAt;
      task.startedAt = String(task.startedAt || "");
      task.completedAt = String(task.completedAt || "");
      task.currentNodeId = String(task.currentNodeId || "");
      task.queue = Array.isArray(task.queue) ? task.queue.filter(Boolean) : [];
      task.events = Array.isArray(task.events) ? task.events : [];
      task.artifacts = Array.isArray(task.artifacts) ? task.artifacts : [];
      task.pending = task.pending && typeof task.pending === "object" ? task.pending : null;
      task.context = task.context && typeof task.context === "object" ? task.context : {};
      task.context.input = task.context.input && typeof task.context.input === "object" ? task.context.input : {};
      task.context.variables = task.context.variables && typeof task.context.variables === "object" ? task.context.variables : {};
      task.context.nodes = task.context.nodes && typeof task.context.nodes === "object" ? task.context.nodes : {};
      task.nodeRuns = task.nodeRuns && typeof task.nodeRuns === "object" ? task.nodeRuns : {};
      executionBlueprint.nodes.forEach((node) => {
        const run = task.nodeRuns[node.id] && typeof task.nodeRuns[node.id] === "object" ? task.nodeRuns[node.id] : {};
        task.nodeRuns[node.id] = {
          status: String(run.status || "idle"),
          attempts: Math.max(0, Number(run.attempts) || 0),
          startedAt: String(run.startedAt || ""),
          completedAt: String(run.completedAt || ""),
          output: run.output ?? null,
          error: String(run.error || ""),
          approvedAt: String(run.approvedAt || ""),
          resumeAt: String(run.resumeAt || ""),
          instances: Array.isArray(run.instances) ? run.instances : [],
          durationMs: Math.max(0, Number(run.durationMs) || 0)
        };
      });
      if (["completed", "failed", "canceled"].includes(task.status)) {
        const terminalEvents = new Map();
        task.events.forEach((event) => {
          if (!event?.nodeId) return;
          if (["node.completed", "node.resolved"].includes(event.type)) terminalEvents.set(event.nodeId, { status: "completed", at: event.at });
          if (["node.failed", "node.rejected", "node.error-caught"].includes(event.type)) terminalEvents.set(event.nodeId, { status: "failed", at: event.at });
        });
        Object.entries(task.nodeRuns).forEach(([nodeId, run]) => {
          if (!["running", "waiting", "idle"].includes(run.status)) return;
          const terminal = terminalEvents.get(nodeId);
          if (!terminal) return;
          run.status = terminal.status;
          run.completedAt ||= String(terminal.at || task.completedAt || "");
        });
      }
      return task;
    }

    function createTask(blueprint, draft = {}) {
      const task = {
        id: createId("blueprint-task"),
        goal: String(draft.goal || "").trim(),
        workspace: String(draft.workspace || blueprint.path || ""),
        blueprintVersion: blueprint.version,
        status: "ready",
        createdAt: timestamp(),
        updatedAt: timestamp(),
        startedAt: "",
        completedAt: "",
        currentNodeId: "",
        queue: [],
        events: [],
        artifacts: [],
        pending: null,
        context: { input: draft.input || {}, variables: {}, nodes: {} },
        nodeRuns: {}
      };
      task.definition = JSON.parse(JSON.stringify({ version: blueprint.version, nodes: blueprint.nodes, edges: blueprint.edges, variables: blueprint.variables || [] }));
      ensureTask(blueprint, task);
      return task;
    }

    function addEvent(task, type, node, detail = {}, level = "info") {
      let storedDetail = detail;
      try {
        const serialized = JSON.stringify(detail);
        if (serialized.length > 2400) storedDetail = { summary: serialized.slice(0, 2400) + "…", truncated: true };
      } catch {
        storedDetail = { summary: String(detail).slice(0, 2400) };
      }
      task.events.push({
        id: createId("bp-event"),
        type,
        level,
        nodeId: node?.id || "",
        nodeName: node?.name || "",
        at: timestamp(),
        detail: storedDetail
      });
      if (task.events.length > 500) task.events.splice(0, task.events.length - 500);
      task.updatedAt = timestamp();
    }

    function notify(blueprint, task, reason) {
      task.updatedAt = timestamp();
      blueprint.updatedAt = task.updatedAt;
      return Promise.resolve(onChange(blueprint, task, reason));
    }

    function compile(blueprint) {
      const validation = validateBlueprint(blueprint);
      if (!validation.ok) {
        const error = new Error(validation.issues.filter((issue) => issue.level === "error").map((issue) => issue.message).join(" "));
        error.code = "BLUEPRINT_INVALID";
        throw error;
      }
      const enabledNodes = blueprint.nodes.filter((node) => node.enabled !== false);
      const ids = new Set(enabledNodes.map((node) => node.id));
      const validEdges = blueprint.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
      return {
        nodes: enabledNodes,
        nodeById: new Map(enabledNodes.map((node) => [node.id, node])),
        edges: validEdges.filter((edge) => edge.kind !== "data"),
        dataEdges: validEdges.filter((edge) => edge.kind === "data"),
        start: enabledNodes.find((node) => node.type === "task-start")
      };
    }

    function getIncomingOutput(task, graph, node) {
      const inputEdges = graph.dataEdges?.some((edge) => edge.to === node.id) ? graph.dataEdges : graph.edges;
      const sources = inputEdges.filter((edge) => edge.to === node.id)
        .map((edge) => task.context.nodes[edge.from]?.output)
        .filter((value) => value !== undefined);
      if (!sources.length) return task.context.input;
      return sources.length === 1 ? sources[0] : sources;
    }

    function getTemplateScope(task, graph, node) {
      return {
        goal: task.goal,
        workspace: task.workspace,
        input: getIncomingOutput(task, graph, node),
        variables: task.context.variables,
        nodes: task.context.nodes,
        task: { id: task.id, goal: task.goal, workspace: task.workspace }
      };
    }

    function renderTemplate(template, scope) {
      return String(template || "").replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, path) => {
        const value = getPath(scope, path);
        if (value === undefined || value === null) return "";
        return typeof value === "object" ? JSON.stringify(value) : String(value);
      });
    }

    function evaluateExpression(expression, scope) {
      const rendered = renderTemplate(expression, scope).trim();
      const comparison = rendered.match(/^(.+?)\s*(===|==|!==|!=|>=|<=|>|<)\s*(.+)$/);
      if (comparison) {
        const left = parseLooseValue(comparison[1].trim());
        const right = parseLooseValue(comparison[3].trim());
        return {
          "===": left === right,
          "==": left == right,
          "!==": left !== right,
          "!=": left != right,
          ">=": left >= right,
          "<=": left <= right,
          ">": left > right,
          "<": left < right
        }[comparison[2]];
      }
      const direct = getPath(scope, rendered);
      return Boolean(direct === undefined ? parseLooseValue(rendered) : direct);
    }

    function needsSideEffectApproval(node) {
      if (AI_NODE_TYPES.has(node.type)) return true;
      if (node.type === "browser" && node.config.mode === "actions") return true;
      if (node.type === "shell") return true;
      if (node.type === "file") return !["read", "exists"].includes(node.config.operation || "read");
      return node.type === "mcp-tool";
    }

    function describeSideEffect(node) {
      if (AI_NODE_TYPES.has(node.type)) return "即将启动 Agent：" + String(node.config.provider || "inherit") + " / " + String(node.config.roleId || node.name);
      if (node.type === "browser") return "即将执行浏览器点击或填写动作：" + String(node.config.url || node.instruction || "未填写地址");
      if (node.type === "shell") return "即将执行命令：" + String(node.config.command || node.instruction || "未填写命令");
      if (node.type === "file") return "即将执行文件操作：" + String(node.config.operation || "read") + " " + String(node.config.path || "未填写路径");
      if (node.type === "mcp-tool") return "即将调用 MCP 工具：" + String(node.config.toolName || "未选择工具");
      return "节点“" + node.name + "”即将执行有副作用的操作。";
    }

    function markSkipped(task, graph, nodeId) {
      const run = task.nodeRuns[nodeId];
      if (!run || run.status !== "idle") return;
      run.status = "skipped";
      run.completedAt = timestamp();
      graph.edges.filter((edge) => edge.from === nodeId).forEach((edge) => {
        const incoming = graph.edges.filter((candidate) => candidate.to === edge.to);
        if (incoming.every((candidate) => task.nodeRuns[candidate.from]?.status === "skipped")) {
          markSkipped(task, graph, edge.to);
        }
      });
    }

    function selectOutgoingEdges(task, graph, node, output) {
      const outgoing = graph.edges.filter((edge) => edge.from === node.id);
      if (!outgoing.length) return [];
      if (node.type === "condition") {
        const answer = Boolean(output?.condition);
        const match = outgoing.find((edge) => {
          const label = edge.label.trim().toLowerCase();
          return answer ? ["true", "yes", "是", "通过"].includes(label) : ["false", "no", "否", "未通过"].includes(label);
        });
        return [match || outgoing[answer ? 0 : Math.min(1, outgoing.length - 1)]].filter(Boolean);
      }
      if (node.type === "switch") {
        const value = String(output?.value ?? "");
        return [outgoing.find((edge) => edge.label === value) || outgoing.find((edge) => ["default", "默认"].includes(edge.label.toLowerCase())) || outgoing[0]].filter(Boolean);
      }
      if (HUMAN_NODE_TYPES.has(node.type) && output?.decision) {
        const decision = String(output.decision).toLowerCase();
        return [outgoing.find((edge) => edge.label.toLowerCase() === decision)
          || outgoing.find((edge) => decision === "approved" ? ["通过", "批准", "true"].includes(edge.label) : ["驳回", "拒绝", "false"].includes(edge.label))
          || outgoing[0]].filter(Boolean);
      }
      return outgoing;
    }

    function getForEachSubgraphNodeIds(graph, node) {
      const startId = node.config.bodyNodeId;
      const endId = node.config.endNodeId || startId;
      if (!startId || !graph.nodeById.has(startId)) return [];
      const result = new Set();
      const queue = [startId];
      while (queue.length && result.size < 120) {
        const current = queue.shift();
        if (result.has(current)) continue;
        result.add(current);
        if (current === endId) continue;
        graph.edges.filter((edge) => edge.from === current).forEach((edge) => {
          if (edge.to !== node.id && !result.has(edge.to)) queue.push(edge.to);
        });
      }
      return Array.from(result);
    }

    function routeAfter(task, graph, node, output) {
      if (node.type === "for-each" && node.config.bodyNodeId) {
        const subgraphNodeIds = getForEachSubgraphNodeIds(graph, node);
        subgraphNodeIds.forEach((subgraphNodeId) => {
          const subgraphRun = task.nodeRuns[subgraphNodeId];
          if (subgraphRun?.status === "idle") {
            subgraphRun.status = "skipped";
            subgraphRun.completedAt = timestamp();
            subgraphRun.output = { executedBy: node.id, instanceCount: output?.instances?.length || 0 };
          }
          task.context.nodes[subgraphNodeId] = { output, completedAt: subgraphRun?.completedAt || timestamp(), executedBy: node.id };
        });
        const exitNodeId = node.config.endNodeId || node.config.bodyNodeId;
        graph.edges.filter((edge) => edge.from === exitNodeId).forEach((edge) => {
          const nextRun = task.nodeRuns[edge.to];
          if (nextRun?.status === "idle" && !task.queue.includes(edge.to)) task.queue.push(edge.to);
        });
        return;
      }
      const outgoing = graph.edges.filter((edge) => edge.from === node.id);
      const selected = selectOutgoingEdges(task, graph, node, output);
      const selectedIds = new Set(selected.map((edge) => edge.id));
      outgoing.filter((edge) => !selectedIds.has(edge.id)).forEach((edge) => markSkipped(task, graph, edge.to));
      selected.forEach((edge) => {
        const run = task.nodeRuns[edge.to];
        if (run?.status === "idle" && !task.queue.includes(edge.to)) task.queue.push(edge.to);
      });
    }

    function isJoinReady(task, graph, node) {
      if (node.type !== "join") return true;
      const incoming = graph.edges.filter((edge) => edge.to === node.id);
      const terminal = incoming.filter((edge) => TERMINAL_NODE_STATES.has(task.nodeRuns[edge.from]?.status));
      const mode = node.config.waitMode || "all";
      if (mode === "any") return terminal.some((edge) => task.nodeRuns[edge.from]?.status === "completed");
      if (mode === "count") return terminal.filter((edge) => task.nodeRuns[edge.from]?.status === "completed").length >= Math.max(1, Number(node.config.requiredCount) || 1);
      return terminal.length === incoming.length;
    }

    async function executeNode(blueprint, task, graph, node, run, options = {}) {
      const scope = options.scope || getTemplateScope(task, graph, node);
      const input = scope.input;
      const instruction = renderTemplate(node.instruction, scope);
      switch (node.type) {
        case "task-start":
          return { goal: task.goal, workspace: task.workspace, input: task.context.input };
        case "task-finish":
          return { goal: task.goal, result: input, artifacts: task.artifacts };
        case "task-fail":
          throw new Error(renderTemplate(node.config.errorMessage || instruction || "蓝图进入失败终止节点。", scope));
        case "planner":
          return adapters.plan ? adapters.plan({ blueprint, task, node, scope, instruction }) : Promise.reject(new Error("未配置规划器适配器。"));
        case "variable-set": {
          const name = String(node.config.variableName || node.name || "value").trim();
          const value = parseLooseValue(renderTemplate(node.config.valueExpression || instruction, scope));
          if (options.foreach) scope.variables[name] = value;
          else task.context.variables[name] = value;
          return { name, value };
        }
        case "template":
          return renderTemplate(node.config.templateText || instruction, scope);
        case "condition":
          return { condition: evaluateExpression(node.config.expression || instruction, scope), expression: node.config.expression || instruction };
        case "switch":
          return { value: renderTemplate(node.config.valueExpression || instruction, scope) };
        case "parse-extract": {
          const source = typeof input === "string" ? input : JSON.stringify(input);
          if ((node.config.sourceFormat || "text") === "json") return JSON.parse(source);
          return source;
        }
        case "split": {
          const source = Array.isArray(input) ? input : String(input ?? "");
          if (Array.isArray(source)) return source;
          const delimiter = node.config.splitMode === "delimiter" ? (node.config.delimiter || ",") : "\n";
          return source.split(delimiter).filter((item) => item !== "");
        }
        case "merge":
          return Array.isArray(input) ? (node.config.mergeMode === "text" ? input.join(node.config.separator || "\n") : input.flat()) : input;
        case "schema-validate": {
          const schema = parseLooseValue(node.config.schema || "{}");
          const missing = Array.isArray(schema?.required) ? schema.required.filter((key) => input?.[key] === undefined) : [];
          if (missing.length) throw new Error("Schema 验证失败，缺少字段：" + missing.join("、"));
          return { valid: true, value: input };
        }
        case "data-transform":
          return input;
        case "for-each": {
          let items = input;
          const expression = renderTemplate(node.config.itemsExpression || "", scope).trim();
          if (expression) {
            const scoped = getPath(scope, expression);
            items = scoped === undefined ? parseLooseValue(expression) : scoped;
          }
          if (!Array.isArray(items)) throw new Error("For Each 输入必须是数组。");
          if (items.length > 500) throw new Error("For Each 单次最多处理 500 项。");
          const body = graph.nodeById.get(node.config.bodyNodeId);
          if (!body) throw new Error("For Each 尚未选择逐项执行节点。");
          if (body.id === node.id || body.type === "for-each") throw new Error("For Each 不能把自身或另一个 For Each 作为直接执行节点。");
          const endNodeId = node.config.endNodeId || body.id;
          if (!graph.nodeById.has(endNodeId)) throw new Error("For Each 子图结束节点不存在。");
          const subgraphNodeIds = getForEachSubgraphNodeIds(graph, node);
          if (!subgraphNodeIds.includes(endNodeId)) throw new Error("For Each 子图无法到达结束节点。");
          const sideEffectNode = subgraphNodeIds.map((id) => graph.nodeById.get(id)).find((candidate) => needsSideEffectApproval(candidate));
          if (sideEffectNode && !run.approvedAt) {
            return { wait: true, pendingType: "side-effect", message: "For Each 将对 " + items.length + " 项运行子图。" + describeSideEffect(sideEffectNode), itemCount: items.length };
          }
          const variableName = String(node.config.itemVariable || "item").trim() || "item";
          const concurrency = Math.min(12, Math.max(1, Number(node.config.maxConcurrency) || 1));
          const failureMode = node.config.failureMode || "fail-fast";
          run.instances = items.map((item, index) => ({ id: createId("bp-instance"), index, item, status: "idle", attempts: 0, output: null, error: "", steps: [], startedAt: "", completedAt: "" }));
          let cursor = 0;
          async function worker() {
            while (cursor < run.instances.length) {
              const instance = run.instances[cursor++];
              instance.status = "running";
              instance.startedAt = timestamp();
              const itemScope = { ...scope, input: instance.item, item: instance.item, index: instance.index, variables: { ...scope.variables, [variableName]: instance.item }, nodes: { ...scope.nodes } };
              const maxAttempts = Math.max(1, (Number(node.retryCount) || 0) + 1);
              while (instance.attempts < maxAttempts) {
                instance.attempts += 1;
                try {
                  instance.steps = [];
                  let current = body;
                  let stepInput = instance.item;
                  let guard = 0;
                  while (current && guard < 120) {
                    guard += 1;
                    if (HUMAN_NODE_TYPES.has(current.type) || current.type === "delay") throw new Error("For Each 子图暂不支持人工或等待节点：" + current.name);
                    const stepScope = { ...itemScope, input: stepInput };
                    const stepRun = { status: "running", attempts: 1, approvedAt: run.approvedAt, instances: [] };
                    const step = { nodeId: current.id, nodeName: current.name, status: "running", output: null, error: "" };
                    instance.steps.push(step);
                    try {
                      step.output = await executeNode(blueprint, task, graph, current, stepRun, { scope: stepScope, foreach: true });
                      if (step.output?.wait) throw new Error("For Each 子图节点不能进入等待状态。");
                      step.status = "completed";
                      itemScope.nodes[current.id] = { output: step.output };
                      stepInput = step.output;
                    } catch (error) {
                      step.status = "failed";
                      step.error = error.message;
                      throw error;
                    }
                    if (current.id === endNodeId) break;
                    const nextEdges = selectOutgoingEdges(task, graph, current, step.output);
                    if (nextEdges.length !== 1) throw new Error("For Each 子图每个实例当前只支持确定的单一路径，节点“" + current.name + "”得到 " + nextEdges.length + " 条路径。");
                    current = graph.nodeById.get(nextEdges[0].to);
                    if (!current || !subgraphNodeIds.includes(current.id)) throw new Error("For Each 子图路径越过了结束边界。");
                  }
                  if (!current || current.id !== endNodeId) throw new Error("For Each 子图未在限制步数内到达结束节点。");
                  instance.output = stepInput;
                  instance.status = "completed";
                  instance.completedAt = timestamp();
                  break;
                } catch (error) {
                  instance.error = error.message;
                  if (instance.attempts >= maxAttempts) {
                    instance.status = "failed";
                    instance.completedAt = timestamp();
                    if (failureMode === "fail-fast") throw error;
                  }
                }
              }
            }
          }
          await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => worker()));
          const failed = run.instances.filter((instance) => instance.status === "failed").length;
          return { items, results: run.instances.map((instance) => instance.output), instances: run.instances, failed, completed: run.instances.length - failed };
        }
        case "delay": {
          const durationMs = Math.max(0, Number(node.config.durationMs) || 0);
          if (durationMs > 0 && !run.resumeAt) {
            run.resumeAt = new Date(Date.now() + durationMs).toISOString();
            return { wait: true, pendingType: "timer", message: "等待至 " + run.resumeAt, resumeAt: run.resumeAt };
          }
          if (run.resumeAt && Date.now() < new Date(run.resumeAt).getTime()) {
            return { wait: true, pendingType: "timer", message: "等待至 " + run.resumeAt, resumeAt: run.resumeAt };
          }
          return { waitedMs: durationMs };
        }
        case "file":
          return adapters.file ? adapters.file({ blueprint, task, node, scope, input, instruction }) : Promise.reject(new Error("未配置文件适配器。"));
        case "shell":
          return adapters.command ? adapters.command({ blueprint, task, node, scope, input, instruction }) : Promise.reject(new Error("未配置命令适配器。"));
        case "browser":
          return adapters.browser ? adapters.browser({ blueprint, task, node, scope, input, instruction }) : Promise.reject(new Error("未配置浏览器适配器。"));
        case "mcp-tool":
          return adapters.mcp ? adapters.mcp({ blueprint, task, node, scope, input, instruction }) : { wait: true, pendingType: "adapter", message: "MCP 工具节点需要连接对应工具后继续。", input };
        case "artifact": {
          const artifact = {
            id: createId("bp-artifact"),
            nodeId: node.id,
            type: node.config.artifactType || "text",
            source: renderTemplate(node.config.source || "", scope),
            value: input,
            createdAt: timestamp()
          };
          task.artifacts.push(artifact);
          return artifact;
        }
        case "error-catch":
          return task.context.lastError || { message: "没有可捕获的错误。" };
        case "evaluator": {
          if (!adapters.agent) throw new Error("未配置 AI 评价适配器。");
          const result = await adapters.agent({ blueprint, task, node, scope, input, instruction: instruction || "请按以下标准评价输入并给出分数：" + (node.config.criteria || "") });
          return { result, passScore: Number(node.config.passScore) || 0 };
        }
        default:
          if (AI_NODE_TYPES.has(node.type)) {
            if (!adapters.agent) throw new Error("未配置 Agent 适配器。");
            return adapters.agent({ blueprint, task, node, scope, input, instruction });
          }
          if (PASS_THROUGH_TYPES.has(node.type)) return input;
          return input;
      }
    }

    async function pump(blueprint, task) {
      ensureTask(blueprint, task);
      if (activeRuns.has(task.id)) return task;
      activeRuns.add(task.id);
      try {
        const executionBlueprint = getExecutionBlueprint(blueprint, task);
        const graph = compile(executionBlueprint);
        let iterations = 0;
        let deferred = 0;
        while (task.status === "running" && task.queue.length && iterations < 256) {
          iterations += 1;
          const nodeId = task.queue.shift();
          const node = graph.nodeById.get(nodeId);
          const run = task.nodeRuns[nodeId];
          if (!node || !run || TERMINAL_NODE_STATES.has(run.status)) continue;
          if (!isJoinReady(task, graph, node)) {
            task.queue.push(nodeId);
            deferred += 1;
            if (deferred >= task.queue.length) break;
            continue;
          }
          deferred = 0;
          task.currentNodeId = node.id;
          if (HUMAN_NODE_TYPES.has(node.type)) {
            run.status = "waiting";
            task.status = "waiting";
            task.pending = { type: node.type, nodeId: node.id, message: node.instruction || node.description || "等待用户处理。" };
            addEvent(task, "node.waiting", node, task.pending);
            await notify(blueprint, task, "node-waiting");
            break;
          }
          if (needsSideEffectApproval(node) && !run.approvedAt) {
            run.status = "waiting";
            task.status = "waiting";
            task.pending = { type: "side-effect", nodeId: node.id, message: describeSideEffect(node) + " 需要用户批准。" };
            addEvent(task, "node.approval-required", node, task.pending, "warn");
            await notify(blueprint, task, "approval-required");
            break;
          }
          run.status = "running";
          run.attempts += 1;
          run.startedAt = timestamp();
          addEvent(task, "node.started", node, { attempt: run.attempts });
          await notify(blueprint, task, "node-started");
          const started = Date.now();
          try {
            const output = await executeNode(executionBlueprint, task, graph, node, run);
            if (output?.wait) {
              run.status = "waiting";
              task.status = "waiting";
              task.pending = { type: output.pendingType || "waiting", nodeId: node.id, message: output.message || "节点正在等待。", resumeAt: output.resumeAt || "" };
              addEvent(task, "node.waiting", node, task.pending);
              await notify(blueprint, task, "node-waiting");
              break;
            }
            run.status = "completed";
            run.completedAt = timestamp();
            run.durationMs = Date.now() - started;
            run.output = output;
            run.error = "";
            task.context.nodes[node.id] = { output, completedAt: run.completedAt };
            addEvent(task, "node.completed", node, { durationMs: run.durationMs, output });
            if (node.type === "task-finish") {
              task.status = "completed";
              task.completedAt = timestamp();
              task.currentNodeId = "";
              addEvent(task, "task.completed", node, { artifacts: task.artifacts.length });
              await notify(blueprint, task, "task-completed");
              break;
            }
            routeAfter(task, graph, node, output);
            await notify(blueprint, task, "node-completed");
          } catch (error) {
            run.durationMs = Date.now() - started;
            run.error = error.message;
            if (run.attempts <= Math.max(0, Number(node.retryCount) || 0)) {
              run.status = "idle";
              task.queue.unshift(node.id);
              addEvent(task, "node.retrying", node, { attempt: run.attempts, error: error.message }, "warn");
              await notify(blueprint, task, "node-retrying");
              continue;
            }
            const catchEdge = graph.edges.find((edge) => edge.from === node.id && (
              graph.nodeById.get(edge.to)?.type === "error-catch" || ["error", "错误", "异常"].includes(edge.label.trim().toLowerCase())
            ));
            if (catchEdge) {
              run.status = "failed";
              run.completedAt = timestamp();
              task.context.lastError = { nodeId: node.id, nodeName: node.name, message: error.message, at: timestamp() };
              task.context.nodes[node.id] = { error: task.context.lastError, completedAt: run.completedAt };
              if (!task.queue.includes(catchEdge.to)) task.queue.unshift(catchEdge.to);
              addEvent(task, "node.error-caught", node, { error: error.message, catchNodeId: catchEdge.to }, "warn");
              await notify(blueprint, task, "node-error-caught");
              continue;
            }
            run.status = "failed";
            run.completedAt = timestamp();
            task.status = "failed";
            task.completedAt = timestamp();
            task.currentNodeId = node.id;
            task.context.lastError = { nodeId: node.id, message: error.message, at: timestamp() };
            addEvent(task, "node.failed", node, { error: error.message }, "error");
            await notify(blueprint, task, "node-failed");
            break;
          }
        }
        if (task.status === "running" && !task.queue.length) {
          task.status = "failed";
          task.completedAt = timestamp();
          addEvent(task, "task.deadlock", null, { message: "执行队列为空，但未到达任务完成节点。" }, "error");
          await notify(blueprint, task, "task-deadlock");
        }
        return task;
      } finally {
        activeRuns.delete(task.id);
      }
    }

    async function start(blueprint, task) {
      ensureTask(blueprint, task);
      if (!["ready", "paused", "failed"].includes(task.status)) return task;
      const graph = compile(getExecutionBlueprint(blueprint, task));
      if (task.status === "failed") {
        Object.values(task.nodeRuns).forEach((run) => {
          if (run.status === "failed") { run.status = "idle"; run.error = ""; }
        });
        if (task.currentNodeId && !task.queue.includes(task.currentNodeId)) task.queue.unshift(task.currentNodeId);
      }
      task.status = "running";
      task.startedAt ||= timestamp();
      task.completedAt = "";
      task.pending = null;
      if (!task.queue.length) task.queue.push(graph.start.id);
      addEvent(task, "task.started", graph.start, { goal: task.goal });
      await notify(blueprint, task, "task-started");
      return pump(blueprint, task);
    }

    async function continueTask(blueprint, task) {
      ensureTask(blueprint, task);
      if (task.pending?.type === "timer") {
        const run = task.nodeRuns[task.pending.nodeId];
        if (task.pending.resumeAt && Date.now() < new Date(task.pending.resumeAt).getTime()) return task;
        if (run) {
          run.status = "idle";
          task.queue.unshift(task.pending.nodeId);
        }
      } else if (task.pending) {
        return task;
      }
      task.pending = null;
      task.status = "running";
      await notify(blueprint, task, "task-continued");
      return pump(blueprint, task);
    }

    async function resolvePending(blueprint, task, payload = {}) {
      ensureTask(blueprint, task);
      const pending = task.pending;
      const executionBlueprint = getExecutionBlueprint(blueprint, task);
      const node = executionBlueprint.nodes.find((item) => item.id === pending?.nodeId);
      const run = node ? task.nodeRuns[node.id] : null;
      if (!pending || !node || !run) return task;
      if (pending.type === "side-effect") {
        if (payload.approved !== true) {
          run.status = "failed";
          run.error = payload.reason || "用户拒绝执行有副作用的操作。";
          task.status = "failed";
          task.completedAt = timestamp();
          task.pending = null;
          addEvent(task, "node.rejected", node, { error: run.error }, "warn");
          await notify(blueprint, task, "node-rejected");
          return task;
        }
        run.status = "idle";
        run.approvedAt = timestamp();
        task.pending = null;
        task.status = "running";
        task.queue.unshift(node.id);
        addEvent(task, "node.approved", node);
        await notify(blueprint, task, "node-approved");
        return pump(blueprint, task);
      }
      const output = pending.type === "approval" || pending.type === "deliverable-gate"
        ? { decision: payload.approved === true ? "approved" : "rejected", comment: String(payload.value || "") }
        : { value: payload.value ?? "", decision: payload.approved === false ? "rejected" : "approved" };
      run.status = "completed";
      run.completedAt = timestamp();
      run.output = output;
      task.context.nodes[node.id] = { output, completedAt: run.completedAt };
      task.pending = null;
      task.status = "running";
      addEvent(task, "node.resolved", node, output);
      const graph = compile(executionBlueprint);
      routeAfter(task, graph, node, output);
      await notify(blueprint, task, "node-resolved");
      return pump(blueprint, task);
    }

    async function pause(blueprint, task) {
      if (task.status !== "running") return task;
      task.status = "paused";
      addEvent(task, "task.paused", null);
      await notify(blueprint, task, "task-paused");
      return task;
    }

    async function cancel(blueprint, task) {
      if (["completed", "failed", "canceled"].includes(task.status)) return task;
      task.status = "canceled";
      task.completedAt = timestamp();
      task.pending = null;
      addEvent(task, "task.canceled", null, {}, "warn");
      await notify(blueprint, task, "task-canceled");
      return task;
    }

    async function rerunNode(blueprint, task, nodeId) {
      ensureTask(blueprint, task);
      if (task.status === "running") return task;
      const executionBlueprint = getExecutionBlueprint(blueprint, task);
      const graph = compile(executionBlueprint);
      const node = graph.nodeById.get(nodeId);
      if (!node) throw new Error("找不到要重跑的节点。");
      const affected = new Set([nodeId]);
      const queue = [nodeId];
      while (queue.length) {
        const current = queue.shift();
        graph.edges.filter((edge) => edge.from === current).forEach((edge) => {
          if (!affected.has(edge.to)) { affected.add(edge.to); queue.push(edge.to); }
        });
      }
      affected.forEach((id) => {
        const run = task.nodeRuns[id];
        if (run) task.nodeRuns[id] = { status: "idle", attempts: 0, startedAt: "", completedAt: "", output: null, error: "", approvedAt: "", resumeAt: "", instances: [], durationMs: 0 };
        delete task.context.nodes[id];
      });
      task.artifacts = task.artifacts.filter((artifact) => !affected.has(artifact.nodeId));
      task.queue = [nodeId];
      task.pending = null;
      task.currentNodeId = nodeId;
      task.status = "running";
      task.completedAt = "";
      addEvent(task, "task.node-rerun", node, { affectedNodeIds: Array.from(affected) }, "warn");
      await notify(blueprint, task, "node-rerun");
      return pump(blueprint, task);
    }

    return {
      ensureTask,
      createTask,
      compile,
      renderTemplate,
      evaluateExpression,
      start,
      continueTask,
      resolvePending,
      pause,
      cancel,
      rerunNode,
      pump
    };
  }

  global.COSS_BLUEPRINT_RUNTIME = Object.freeze({ createBlueprintRuntime });
})(window);
