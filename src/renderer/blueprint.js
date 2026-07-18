(function exposeBlueprintWorkspace(global) {
  const NODE_CATEGORIES = [
    { id: "lifecycle", label: "生命周期", color: "#2563eb" },
    { id: "ai", label: "AI 与协作", color: "#7c3aed" },
    { id: "action", label: "工具与动作", color: "#0891b2" },
    { id: "data", label: "数据处理", color: "#0f766e" },
    { id: "flow", label: "流程控制", color: "#d97706" },
    { id: "human", label: "人工协作", color: "#db2777" },
    { id: "reliability", label: "可靠性", color: "#dc2626" }
  ];

  const NODE_TYPES = [
    ["task-start", "任务开始", "lifecycle", "接收任务目标、变量和附件", "开始"],
    ["task-finish", "任务完成", "lifecycle", "汇总产物并结束任务", "完成"],
    ["task-fail", "任务失败", "lifecycle", "以结构化错误终止任务", "失败"],
    ["planner", "规划器", "ai", "把目标拆成可执行步骤", "规划"],
    ["agent-task", "Agent 任务", "ai", "指派角色完成一个任务步骤", "执行"],
    ["context-lens", "上下文镜头", "ai", "为下游节点裁剪和聚焦上下文", "镜头"],
    ["knowledge-retrieve", "知识检索", "ai", "从文件、记忆或索引检索证据", "检索"],
    ["evaluator", "评价器", "ai", "按量化标准评价阶段结果", "评价"],
    ["synthesizer", "汇总器", "ai", "合并多个 Agent 结果形成结论", "汇总"],
    ["mcp-tool", "MCP 工具", "action", "调用已连接的 MCP 工具", "工具"],
    ["file", "文件", "action", "读取、写入、移动或检查工作区文件", "文件"],
    ["shell", "命令", "action", "在工作目录执行受控命令", "命令"],
    ["browser", "浏览器", "action", "浏览网页并提取页面信息", "浏览"],
    ["artifact", "交付物", "action", "登记文件、链接或文本交付物", "交付"],
    ["variable-set", "变量", "data", "读取、写入或更新运行变量", "变量"],
    ["data-transform", "变换", "data", "映射、筛选或重组数据", "变换"],
    ["template", "模板", "data", "使用变量渲染文本模板", "模板"],
    ["parse-extract", "解析与提取", "data", "从文本或结构化数据提取字段", "解析"],
    ["split", "拆分", "data", "把集合或长文本拆成多个项目", "拆分"],
    ["merge", "合并与聚合", "data", "合并分支数据并计算聚合结果", "合并"],
    ["schema-validate", "Schema 验证", "data", "按 Schema 校验输入输出", "校验"],
    ["condition", "条件分支", "flow", "按表达式选择后续路径", "判断"],
    ["switch", "多路分支", "flow", "按值路由到多个出口", "路由"],
    ["parallel", "并行", "flow", "同时启动多条独立分支", "并行"],
    ["join", "汇合", "flow", "等待指定并行分支完成", "汇合"],
    ["for-each", "逐项执行", "flow", "遍历集合并执行同一分支", "逐项"],
    ["delay", "等待", "flow", "等待时长或指定时间", "等待"],
    ["human-input", "人工输入", "human", "暂停并向用户收集信息", "询问"],
    ["approval", "人工审批", "human", "等待用户批准或驳回", "审批"],
    ["review-edit", "人工审阅与编辑", "human", "让用户审阅并修改阶段结果", "审阅"],
    ["deliverable-gate", "交付质量门", "human", "按验收清单决定是否允许交付", "质量"],
    ["error-catch", "错误捕获", "reliability", "捕获错误并进入补救流程", "捕获"]
  ].map(([id, name, category, description, verb]) => ({ id, name, category, description, verb }));

  const TYPE_MAP = Object.fromEntries(NODE_TYPES.map((item) => [item.id, item]));
  const CATEGORY_MAP = Object.fromEntries(NODE_CATEGORIES.map((item) => [item.id, item]));
  const FLOW_PORT_SCHEMAS = {
    "task-start": { inputs: [], outputs: [["exec-out", "开始"]] },
    "task-finish": { inputs: [["exec-in", "完成"]], outputs: [] },
    "task-fail": { inputs: [["exec-in", "失败"]], outputs: [] },
    condition: { inputs: [["exec-in", "执行"]], outputs: [["true", "是"], ["false", "否"]] },
    switch: { inputs: [["exec-in", "执行"]], outputs: [["case", "匹配"], ["default", "默认"]] },
    parallel: { inputs: [["exec-in", "执行"]], outputs: [["branch-a", "分支 A"], ["branch-b", "分支 B"]] },
    join: { inputs: [["branch-a", "分支 A"], ["branch-b", "分支 B"]], outputs: [["exec-out", "继续"]] }
  };
  const DATA_PORT_SCHEMAS = {
    "task-start": { outputs: [["goal", "任务目标", "text"], ["variables", "变量", "object"]] },
    "task-finish": { inputs: [["result", "最终结果", "any"]] },
    planner: { inputs: [["goal", "目标", "text"]], outputs: [["plan", "计划", "object"]] },
    "agent-task": { inputs: [["instruction", "指令", "text"], ["context", "上下文", "any"]], outputs: [["result", "结果", "any"]] },
    "context-lens": { inputs: [["context", "上下文", "any"]], outputs: [["focused", "聚焦上下文", "any"]] },
    "knowledge-retrieve": { inputs: [["query", "查询", "text"]], outputs: [["documents", "文档", "array"]] },
    evaluator: { inputs: [["candidate", "候选结果", "any"]], outputs: [["score", "评分", "number"]] },
    synthesizer: { inputs: [["items", "多项结果", "array"]], outputs: [["result", "汇总结果", "any"]] },
    "mcp-tool": { inputs: [["arguments", "参数", "object"]], outputs: [["result", "结果", "any"]] },
    file: { inputs: [["content", "内容", "any"]], outputs: [["file", "文件结果", "any"]] },
    shell: { inputs: [["stdin", "输入", "text"]], outputs: [["stdout", "输出", "text"]] },
    browser: { inputs: [["url", "地址", "text"]], outputs: [["content", "页面内容", "text"]] },
    artifact: { inputs: [["source", "产物", "any"]], outputs: [["artifact", "交付物", "object"]] },
    "variable-set": { inputs: [["value", "值", "any"]], outputs: [["value", "变量值", "any"]] },
    "data-transform": { inputs: [["input", "输入", "any"]], outputs: [["output", "输出", "any"]] },
    template: { inputs: [["variables", "变量", "object"]], outputs: [["text", "文本", "text"]] },
    "parse-extract": { inputs: [["source", "源内容", "any"]], outputs: [["fields", "字段", "object"]] },
    split: { inputs: [["collection", "集合", "any"]], outputs: [["items", "项目", "array"]] },
    merge: { inputs: [["items", "项目", "array"]], outputs: [["result", "合并结果", "any"]] },
    "schema-validate": { inputs: [["value", "待校验值", "any"]], outputs: [["valid", "有效值", "any"]] },
    condition: { inputs: [["value", "判断值", "any"]] },
    switch: { inputs: [["value", "路由值", "any"]] },
    "for-each": { inputs: [["items", "集合", "array"]], outputs: [["results", "逐项结果", "array"]] },
    "human-input": { outputs: [["answer", "用户回答", "any"]] },
    "review-edit": { inputs: [["draft", "草稿", "any"]], outputs: [["approved", "审阅结果", "any"]] }
  };
  const PORT_TYPE_COLORS = { flow: "#475569", any: "#d946ef", text: "#d946ef", object: "#f59e0b", array: "#22c55e", number: "#38bdf8" };

  function getNodePorts(node) {
    const flow = FLOW_PORT_SCHEMAS[node.type] || { inputs: [["exec-in", "执行"]], outputs: [["exec-out", "继续"]] };
    const data = DATA_PORT_SCHEMAS[node.type] || {};
    const build = (items, direction, dataType) => (items || []).map(([id, label, type]) => ({ id, label, direction, dataType: type || dataType }));
    return {
      inputs: [...build(flow.inputs, "input", "flow"), ...build(data.inputs, "input", "any")],
      outputs: [...build(flow.outputs, "output", "flow"), ...build(data.outputs, "output", "any")]
    };
  }

  function getNodeHeight(node) {
    const ports = getNodePorts(node);
    return Math.max(116, 70 + Math.max(ports.inputs.length, ports.outputs.length, 2) * 23);
  }

  function getNodePortPoint(node, portId, direction) {
    const ports = getNodePorts(node)[direction === "input" ? "inputs" : "outputs"];
    const index = Math.max(0, ports.findIndex((port) => port.id === portId));
    return { x: node.x + (direction === "input" ? 16 : 192), y: node.y + 76 + index * 23 };
  }

  function getDefaultPortId(node, direction, dataType = "flow") {
    const ports = getNodePorts(node)[direction === "input" ? "inputs" : "outputs"];
    return (ports.find((port) => port.dataType === dataType) || ports[0])?.id || "";
  }
  const NODE_PROPERTY_SCHEMAS = {
    "task-start": [["inputSchema", "任务输入 Schema", "textarea"], ["defaults", "默认输入(JSON)", "textarea"]],
    "task-finish": [["outputMapping", "最终输出映射", "textarea"], ["completionMessage", "完成消息", "text"]],
    "task-fail": [["errorCode", "错误代码", "text"], ["errorMessage", "失败消息", "textarea"]],
    planner: [["planningMode", "规划模式", "select", "linear|adaptive|graph"], ["maxSteps", "最大步骤数", "number"]],
    "agent-task": [["roleId", "执行角色 ID", "text"], ["provider", "Agent Provider", "select", "inherit|claude|codex|codebuddy"], ["model", "模型（可选）", "text"], ["permissionMode", "权限模式", "select", "confirm|workspace-write|read-only"]],
    "context-lens": [["provider", "Agent Provider", "select", "inherit|claude|codex|codebuddy"], ["include", "包含范围", "textarea"], ["tokenBudget", "上下文预算", "number"]],
    "knowledge-retrieve": [["provider", "Agent Provider", "select", "inherit|claude|codex|codebuddy"], ["sources", "检索源", "textarea"], ["topK", "返回条数", "number"]],
    evaluator: [["provider", "Agent Provider", "select", "inherit|claude|codex|codebuddy"], ["criteria", "评价标准", "textarea"], ["passScore", "通过分数", "number"]],
    synthesizer: [["provider", "Agent Provider", "select", "inherit|claude|codex|codebuddy"], ["strategy", "汇总策略", "select", "consensus|ranked|merge"], ["outputFormat", "输出格式", "text"]],
    "mcp-tool": [["serverName", "MCP Server 名称", "text"], ["toolName", "工具名称", "text"], ["arguments", "参数模板(JSON)", "textarea"]],
    file: [["operation", "文件操作", "select", "read|write|append|move|delete|exists"], ["path", "路径模板", "text"], ["toPath", "移动目标路径", "text"], ["content", "写入内容模板", "textarea"]],
    shell: [["command", "命令模板", "textarea"], ["workingDirectory", "工作目录", "text"]],
    browser: [["url", "起始地址", "text"], ["mode", "执行模式", "select", "extract-text|extract-selector|actions|open"], ["selector", "CSS 选择器", "text"], ["actions", "动作序列(JSON)", "textarea"], ["maxChars", "最大提取字符", "number"], ["objective", "浏览目标", "textarea"]],
    artifact: [["artifactType", "交付物类型", "select", "file|link|text|report"], ["source", "产物来源", "text"]],
    "variable-set": [["variableName", "变量名", "text"], ["valueExpression", "值表达式", "textarea"]],
    "data-transform": [["expression", "转换表达式", "textarea"], ["language", "表达式语言", "select", "template|jsonata|javascript"]],
    template: [["templateText", "模板内容", "textarea"], ["outputVariable", "输出变量", "text"]],
    "parse-extract": [["sourceFormat", "源格式", "select", "text|json|markdown|csv"], ["extractRules", "提取规则", "textarea"]],
    split: [["splitMode", "拆分方式", "select", "items|lines|delimiter|chunks"], ["chunkSize", "分块大小", "number"]],
    merge: [["mergeMode", "合并方式", "select", "array|object|text|aggregate"], ["separator", "文本分隔符", "text"]],
    "schema-validate": [["schema", "Schema(JSON)", "textarea"], ["failureMode", "失败策略", "select", "error|branch|warn"]],
    condition: [["expression", "条件表达式", "textarea"], ["missingValue", "缺失值处理", "select", "false|error|null"]],
    switch: [["valueExpression", "取值表达式", "text"], ["cases", "分支规则(JSON)", "textarea"]],
    parallel: [["maxConcurrency", "最大并发数", "number"], ["failureMode", "失败策略", "select", "fail-fast|wait-all|ignore"]],
    join: [["waitMode", "等待模式", "select", "all|any|count"], ["requiredCount", "需要完成数", "number"]],
    "for-each": [["itemsExpression", "集合表达式", "text"], ["bodyNodeId", "子图开始节点", "node-select"], ["endNodeId", "子图结束节点", "node-select"], ["itemVariable", "当前项变量名", "text"], ["maxConcurrency", "最大并发数", "number"], ["failureMode", "失败策略", "select", "fail-fast|continue"]],
    delay: [["durationMs", "等待毫秒数", "number"], ["untilExpression", "等待到指定时间", "text"]],
    "human-input": [["question", "向用户提问", "textarea"], ["responseSchema", "回答 Schema", "textarea"]],
    approval: [["approvalMessage", "审批说明", "textarea"], ["approvers", "审批人", "text"]],
    "review-edit": [["reviewInstructions", "审阅说明", "textarea"], ["editableFields", "可编辑字段", "text"]],
    "deliverable-gate": [["checklist", "验收清单", "textarea"], ["requireAll", "必须全部通过", "checkbox"]],
    "error-catch": [["errorTypes", "捕获错误类型", "text"], ["exposeError", "输出错误详情", "checkbox"]]
  };
  const EXECUTION_INSTRUCTION_NODE_TYPES = new Set(["agent-task", "context-lens", "knowledge-retrieve", "evaluator", "synthesizer"]);

  function renderInstructionEditor(node, esc, text = (_key, fallback) => fallback) {
    if (!EXECUTION_INSTRUCTION_NODE_TYPES.has(node.type)) return "";
    const label = node.type === "evaluator" ? text("field.evaluationInstruction", "评价指令") : text("field.executionInstruction", "执行指令");
    const placeholder = node.type === "evaluator" ? text("field.evaluationInstructionPlaceholder", "描述评价标准和评分方式") : text("field.executionInstructionPlaceholder", "描述该节点需要完成什么");
    return `<div class="field"><label>${esc(label)}</label><textarea class="blueprint-instruction" data-blueprint-field="instruction" placeholder="${esc(placeholder)}">${esc(node.instruction)}</textarea></div>`;
  }

  function createNode(type, createId, index = 0) {
    const definition = TYPE_MAP[type] || TYPE_MAP["agent-task"];
    return {
      id: createId("bp-node"),
      type: definition.id,
      name: definition.name,
      description: definition.description,
      enabled: true,
      x: 72 + (index % 4) * 232,
      y: 72 + Math.floor(index / 4) * 148,
      timeoutMs: 0,
      retryCount: 0,
      instruction: "",
      config: {}
    };
  }

  function createBlueprint(name, path, createId) {
    const blueprint = {
      id: createId("blueprint"),
      name: String(name || "新蓝图").trim() || "新蓝图",
      description: "使用可视化节点编排并完成用户任务。",
      path: String(path || ""),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
      tasks: [],
      variables: [],
      groups: [],
      ui: { selectedNodeId: "", selectedNodeIds: [], selectedEdgeId: "", pendingFromNodeId: "", pendingFromPortId: "", paletteCategory: "all", zoom: 1, panMode: false, snapToGrid: true }
    };
    const start = createNode("task-start", createId, 0);
    const planner = createNode("planner", createId, 1);
    const agent = createNode("agent-task", createId, 2);
    const finish = createNode("task-finish", createId, 3);
    start.x = 64; start.y = 190;
    planner.x = 306; planner.y = 100;
    agent.x = 548; agent.y = 100;
    finish.x = 790; finish.y = 190;
    agent.instruction = "根据规划完成当前任务，并提交可验证的结果。";
    blueprint.nodes.push(start, planner, agent, finish);
    blueprint.edges.push(
      { id: createId("bp-edge"), from: start.id, to: planner.id, label: "" },
      { id: createId("bp-edge"), from: planner.id, to: agent.id, label: "" },
      { id: createId("bp-edge"), from: agent.id, to: finish.id, label: "" }
    );
    return blueprint;
  }

  function generateBlueprintFromTask(draft = {}, createId) {
    const goal = String(draft.goal || "").trim() || "完成用户任务";
    const lower = goal.toLowerCase();
    const hasFileInput = /(文件|目录|项目|package\.json|readme|读取|分析代码|代码库)/i.test(goal);
    const hasBrowser = /(网页|网站|网址|浏览器|搜索网页|在线资料|http)/i.test(goal);
    const hasCommand = /(命令|运行|执行|构建|编译|测试|npm|pnpm|yarn|git)/i.test(goal);
    const hasReview = /(检查|验证|评估|审核|质量|验收|测试)/i.test(goal);
    const hasOutput = /(生成|写入|保存|导出|报告|文档|文件|交付)/i.test(goal) || Boolean(draft.outputPath);
    const needsApproval = draft.allowSideEffects !== false && (hasCommand || hasOutput || (hasBrowser && /(点击|填写|提交|登录)/i.test(goal)));
    const blueprint = createBlueprint(draft.name || `任务蓝图 · ${goal.slice(0, 18)}`, draft.workspace || draft.path || "", createId);
    blueprint.description = String(draft.description || `根据任务自动生成：${goal}`);
    blueprint.generation = {
      source: "rule-engine",
      goal,
      mode: String(draft.mode || "review"),
      capabilities: { hasFileInput, hasBrowser, hasCommand, hasReview, hasOutput, needsApproval },
      generatedAt: new Date().toISOString()
    };
    blueprint.nodes = [];
    blueprint.edges = [];
    blueprint.tasks = [];
    blueprint.variables = [];
    blueprint.groups = [];
    blueprint.ui.selectedNodeId = "";
    blueprint.ui.selectedNodeIds = [];
    blueprint.ui.selectedEdgeId = "";
    const addNode = (type, name, instruction = "", config = {}) => {
      const node = createNode(type, createId, blueprint.nodes.length);
      node.name = name;
      node.description = `${name}：${goal}`;
      node.instruction = instruction;
      node.config = { ...node.config, ...config };
      blueprint.nodes.push(node);
      return node;
    };
    const addFlow = (from, to, label = "") => {
      if (!from || !to) return null;
      const fromPort = getDefaultPortId(from, "output", "flow");
      const toPort = getDefaultPortId(to, "input", "flow");
      const edge = { id: createId("bp-edge"), from: from.id, to: to.id, fromPort, toPort, kind: "flow", label };
      blueprint.edges.push(edge);
      return edge;
    };
    const addData = (from, fromPort, to, toPort) => {
      if (!from || !to) return null;
      const edge = { id: createId("bp-edge"), from: from.id, to: to.id, fromPort, toPort, kind: "data", label: "" };
      blueprint.edges.push(edge);
      return edge;
    };

    const start = addNode("task-start", "任务开始", "接收用户任务目标。");
    const planner = addNode("planner", "拆解执行计划", "将用户目标拆解为可执行步骤。", { planningMode: "linear", maxSteps: 8 });
    addFlow(start, planner);
    let previous = planner;
    const contextSources = [];
    if (hasFileInput) {
      const file = addNode("file", "读取项目文件", "读取任务所需的项目文件。", { operation: "read", path: draft.inputPath || (lower.includes("package.json") ? "package.json" : "README.md") });
      addFlow(previous, file);
      previous = file;
      contextSources.push({ node: file, port: "file" });
    }
    if (hasBrowser) {
      const browser = addNode("browser", "收集网页资料", "提取任务所需的网页信息。", { url: draft.url || "https://example.com", mode: "extract-text", maxChars: 12000 });
      addFlow(previous, browser);
      previous = browser;
      contextSources.push({ node: browser, port: "content" });
    }
    if (hasCommand) {
      const shell = addNode("shell", "执行检查命令", "执行与任务相关的检查命令。", { command: draft.command || (/(测试|test)/i.test(goal) ? "npm test" : "git status --short"), workingDirectory: "" });
      if (needsApproval) {
        const approval = addNode("approval", "确认执行命令", "执行命令前请确认副作用和工作目录。", { approvalMessage: "即将执行蓝图生成的检查命令，请确认。", approvers: "用户" });
        addFlow(previous, approval);
        addFlow(approval, shell);
      } else addFlow(previous, shell);
      previous = shell;
      contextSources.push({ node: shell, port: "stdout" });
    }
    const agent = addNode("agent-task", "完成核心任务", "根据上游计划和上下文完成节点职责，输出可验证的结果。", {
      provider: "inherit",
      permissionMode: draft.allowSideEffects === false ? "read-only" : "confirm",
      roleId: "assistant"
    });
    addFlow(previous, agent);
    addData(start, "goal", planner, "goal");
    addData(planner, "plan", agent, "context");
    contextSources.forEach((source) => addData(source.node, source.port, agent, "context"));
    previous = agent;
    if (hasReview) {
      const evaluator = addNode("evaluator", "检查结果质量", "按任务目标检查上游结果是否完整、准确、可交付。", { provider: "inherit", criteria: "结果必须覆盖任务目标，并包含可验证的完成证据。", passScore: 80 });
      addFlow(previous, evaluator);
      addData(agent, "result", evaluator, "candidate");
      previous = evaluator;
    }
    let artifactSource = agent;
    if (hasOutput) {
      if (needsApproval) {
        const approval = addNode("approval", "确认交付操作", "写入或导出交付物前请确认目标路径。", { approvalMessage: "即将生成或写入交付物，请确认。", approvers: "用户" });
        addFlow(previous, approval);
        previous = approval;
      }
      const writer = addNode("file", "生成任务交付物", "", { operation: "write", path: draft.outputPath || "blueprint-output.md", content: "{{input.output}}" });
      addFlow(previous, writer);
      addData(agent, "result", writer, "content");
      previous = writer;
      artifactSource = writer;
      const artifact = addNode("artifact", "登记交付物", "登记生成的文件或报告。", { artifactType: draft.outputType || "file", source: draft.outputPath || "blueprint-output.md" });
      addFlow(previous, artifact);
      addData(writer, "file", artifact, "source");
      previous = artifact;
      addData(artifact, "artifact", null, "result");
    }
    const finish = addNode("task-finish", "任务完成", "汇总并报告任务结果。", { completionMessage: "自动生成的蓝图已完成任务。", outputMapping: "{{input}}" });
    addFlow(previous, finish);
    if (!hasOutput) addData(artifactSource, "result", finish, "result");
    else {
      const artifactNode = blueprint.nodes.find((node) => node.type === "artifact");
      if (artifactNode) addData(artifactNode, "artifact", finish, "result");
    }
    autoLayout(blueprint);
    ensureBlueprintShape(blueprint);
    return blueprint;
  }

  function ensureBlueprintShape(blueprint) {
    if (!blueprint || typeof blueprint !== "object") return null;
    blueprint.id = String(blueprint.id || "");
    blueprint.name = String(blueprint.name || "未命名蓝图");
    blueprint.description = String(blueprint.description || "");
    blueprint.path = String(blueprint.path || "");
    blueprint.version = Math.max(1, Number(blueprint.version) || 1);
    blueprint.nodes = Array.isArray(blueprint.nodes) ? blueprint.nodes : [];
    blueprint.edges = Array.isArray(blueprint.edges) ? blueprint.edges : [];
    blueprint.tasks = Array.isArray(blueprint.tasks) ? blueprint.tasks : [];
    blueprint.variables = Array.isArray(blueprint.variables) ? blueprint.variables : [];
    blueprint.groups = (Array.isArray(blueprint.groups) ? blueprint.groups : []).map((group, index) => ({
      id: String(group?.id || `bp-group-${index}`),
      name: String(group?.name || "节点分组"),
      nodeIds: [...new Set((Array.isArray(group?.nodeIds) ? group.nodeIds : []).map(String))],
      color: String(group?.color || "#6b8afd"),
      collapsed: group?.collapsed === true
    }));
    blueprint.ui = blueprint.ui && typeof blueprint.ui === "object" ? blueprint.ui : {};
    blueprint.ui.selectedNodeId = String(blueprint.ui.selectedNodeId || "");
    blueprint.ui.selectedNodeIds = [...new Set((Array.isArray(blueprint.ui.selectedNodeIds) ? blueprint.ui.selectedNodeIds : [])
      .map((value) => String(value || "")).filter(Boolean))];
    blueprint.ui.selectedEdgeId = String(blueprint.ui.selectedEdgeId || "");
    blueprint.ui.pendingFromNodeId = String(blueprint.ui.pendingFromNodeId || "");
    blueprint.ui.pendingFromPortId = String(blueprint.ui.pendingFromPortId || "");
    blueprint.ui.activeTaskId = String(blueprint.ui.activeTaskId || "");
    blueprint.ui.paletteCategory = String(blueprint.ui.paletteCategory || "all");
    blueprint.ui.zoom = Math.min(2, Math.max(0.5, Number(blueprint.ui.zoom) || 1));
    blueprint.ui.panMode = blueprint.ui.panMode === true;
    blueprint.ui.snapToGrid = blueprint.ui.snapToGrid !== false;
    blueprint.nodes.forEach((node, index) => {
      node.id = String(node.id || "bp-node-" + index);
      node.type = TYPE_MAP[node.type] ? node.type : "agent-task";
      node.name = String(node.name || TYPE_MAP[node.type].name);
      node.description = String(node.description || "");
      node.enabled = node.enabled !== false;
      node.x = Number.isFinite(Number(node.x)) ? Number(node.x) : 72 + (index % 4) * 232;
      node.y = Number.isFinite(Number(node.y)) ? Number(node.y) : 72 + Math.floor(index / 4) * 148;
      node.timeoutMs = Math.max(0, Number(node.timeoutMs) || 0);
      node.retryCount = Math.max(0, Number(node.retryCount) || 0);
      node.instruction = String(node.instruction || "");
      node.config = node.config && typeof node.config === "object" ? node.config : {};
    });
    const generatedGoal = String(blueprint.generation?.goal || "").trim();
    if (blueprint.generation?.source === "rule-engine" && generatedGoal) {
      const legacyInstruction = "完成以下目标：" + generatedGoal + "\n结合所有上游输入，输出可验证的结果。";
      const normalizeGeneratedAgentInstruction = (node) => {
        if (node?.type === "agent-task" && String(node.instruction || "").trim() === legacyInstruction) {
          node.instruction = "根据上游计划和上下文完成节点职责，输出可验证的结果。";
        }
      };
      blueprint.nodes.forEach(normalizeGeneratedAgentInstruction);
      blueprint.tasks.forEach((task) => task.definition?.nodes?.forEach(normalizeGeneratedAgentInstruction));
    }
    const ids = new Set(blueprint.nodes.map((node) => node.id));
    blueprint.ui.selectedNodeIds = blueprint.ui.selectedNodeIds.filter((nodeId) => ids.has(nodeId));
    if (blueprint.ui.selectedNodeId && !ids.has(blueprint.ui.selectedNodeId)) blueprint.ui.selectedNodeId = "";
    blueprint.edges = blueprint.edges.filter((edge) => edge && ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to)
      .map((edge, index) => ({
        id: String(edge.id || "bp-edge-" + index),
        from: String(edge.from),
        to: String(edge.to),
        fromPort: String(edge.fromPort || getDefaultPortId(blueprint.nodes.find((node) => node.id === edge.from), "output", "flow")),
        toPort: String(edge.toPort || getDefaultPortId(blueprint.nodes.find((node) => node.id === edge.to), "input", "flow")),
        kind: String(edge.kind || "flow"),
        label: String(edge.label || "")
      }));
    blueprint.groups.forEach((group) => { group.nodeIds = group.nodeIds.filter((nodeId) => ids.has(nodeId)); });
    return blueprint;
  }

  function validateBlueprint(blueprint) {
    ensureBlueprintShape(blueprint);
    const issues = [];
    const nodes = blueprint.nodes.filter((node) => node.enabled !== false);
    const ids = new Set(nodes.map((node) => node.id));
    const edges = blueprint.edges.filter((edge) => edge.kind !== "data" && ids.has(edge.from) && ids.has(edge.to));
    const starts = nodes.filter((node) => node.type === "task-start");
    const finishes = nodes.filter((node) => node.type === "task-finish");
    if (starts.length !== 1) issues.push({ level: "error", code: "start-count", message: "需要且只能有 1 个任务开始节点，当前为 " + starts.length + " 个。" });
    if (!finishes.length) issues.push({ level: "error", code: "finish-missing", message: "至少需要 1 个任务完成节点。" });
    if (starts[0] && edges.some((edge) => edge.to === starts[0].id)) issues.push({ level: "error", code: "start-incoming", nodeId: starts[0].id, message: "任务开始节点不能有入口连接。" });
    finishes.forEach((finish) => {
      if (edges.some((edge) => edge.from === finish.id)) issues.push({ level: "error", code: "finish-outgoing", nodeId: finish.id, message: "任务完成节点不能有出口连接。" });
    });
    const reachable = new Set(starts.map((node) => node.id));
    let changed = true;
    while (changed) {
      changed = false;
      edges.forEach((edge) => {
        if (reachable.has(edge.from) && !reachable.has(edge.to)) {
          reachable.add(edge.to);
          changed = true;
        }
      });
    }
    nodes.forEach((node) => {
      if (!reachable.has(node.id)) issues.push({ level: "warning", code: "unreachable", nodeId: node.id, message: "节点“" + node.name + "”无法从任务开始到达。" });
      if (node.type !== "task-finish" && node.type !== "task-fail" && !edges.some((edge) => edge.from === node.id)) {
        issues.push({ level: "warning", code: "dead-end", nodeId: node.id, message: "节点“" + node.name + "”没有后续连接。" });
      }
      if (node.type === "agent-task" && !node.instruction.trim()) {
        issues.push({ level: "warning", code: "instruction-empty", nodeId: node.id, message: "Agent 任务“" + node.name + "”尚未填写执行指令。" });
      }
    });
    if (starts[0] && finishes.length && !finishes.some((node) => reachable.has(node.id))) {
      issues.push({ level: "error", code: "finish-unreachable", message: "当前流程无法到达任何任务完成节点。" });
    }
    const visiting = new Set();
    const visited = new Set();
    let hasCycle = false;
    function visit(nodeId) {
      if (visiting.has(nodeId)) { hasCycle = true; return; }
      if (visited.has(nodeId) || hasCycle) return;
      visiting.add(nodeId);
      edges.filter((edge) => edge.from === nodeId).forEach((edge) => visit(edge.to));
      visiting.delete(nodeId);
      visited.add(nodeId);
    }
    nodes.forEach((node) => visit(node.id));
    if (hasCycle) issues.push({ level: "error", code: "cycle", message: "检测到回环连接；重复执行应使用“逐项执行”节点显式表达。" });
    return { ok: !issues.some((issue) => issue.level === "error"), issues };
  }

  function autoLayout(blueprint) {
    ensureBlueprintShape(blueprint);
    const flowEdges = blueprint.edges.filter((edge) => edge.kind !== "data");
    const incoming = new Map(blueprint.nodes.map((node) => [node.id, 0]));
    flowEdges.forEach((edge) => incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1));
    const queue = blueprint.nodes.filter((node) => node.type === "task-start" || incoming.get(node.id) === 0);
    const depth = new Map(queue.map((node) => [node.id, 0]));
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor];
      flowEdges.filter((edge) => edge.from === node.id).forEach((edge) => {
        const nextDepth = (depth.get(node.id) || 0) + 1;
        if (!depth.has(edge.to) || nextDepth > depth.get(edge.to)) depth.set(edge.to, nextDepth);
        const next = blueprint.nodes.find((candidate) => candidate.id === edge.to);
        if (next && !queue.includes(next)) queue.push(next);
      });
    }
    blueprint.nodes.forEach((node) => {
      if (!depth.has(node.id)) depth.set(node.id, Math.max(0, ...depth.values()) + 1);
    });
    const columns = new Map();
    blueprint.nodes.forEach((node) => {
      const level = Math.min(depth.get(node.id) || 0, 8);
      if (!columns.has(level)) columns.set(level, []);
      columns.get(level).push(node);
    });
    columns.forEach((column, level) => column.forEach((node, row) => {
      node.x = 64 + level * 238;
      node.y = 72 + row * 168;
    }));
    blueprint.updatedAt = new Date().toISOString();
  }

  function getCanvasSize(blueprint) {
    const maxX = Math.max(1100, ...blueprint.nodes.map((node) => node.x + 300));
    const maxY = Math.max(680, ...blueprint.nodes.map((node) => node.y + getNodeHeight(node) + 100));
    return { width: maxX, height: maxY };
  }

  function getGroupBounds(blueprint, group) {
    const nodes = blueprint.nodes.filter((node) => group.nodeIds.includes(node.id));
    if (!nodes.length) return { x: 40, y: 40, width: 240, height: 100 };
    const minX = Math.min(...nodes.map((node) => node.x));
    const minY = Math.min(...nodes.map((node) => node.y));
    const maxX = Math.max(...nodes.map((node) => node.x + 208));
    const maxY = Math.max(...nodes.map((node) => node.y + getNodeHeight(node)));
    return { x: Math.max(8, minX - 28), y: Math.max(8, minY - 42), width: maxX - minX + 56, height: maxY - minY + 70 };
  }

  function createRenderer({ escapeHtml, icon, translate } = {}) {
    const esc = escapeHtml || ((value) => String(value));
    const tr = translate || ((_key, fallback) => fallback);
    const text = (key, fallback, values = {}) => tr(`blueprint.${key}`, fallback, values);
    const categoryLabel = (category) => text(`category.${category.id}`, category.label);
    const nodeDefinition = (definition) => ({
      ...definition,
      name: text(`node.${definition.id}.name`, definition.name),
      description: text(`node.${definition.id}.description`, definition.description),
      verb: text(`node.${definition.id}.verb`, definition.verb)
    });
    const portLabel = (port) => text(`port.${port.id}`, port.label);
    const propertyLabel = (key, label) => text(`property.${key}`, label);
    const displayNodeName = (node, definition) => node.name === definition.name
      ? nodeDefinition(definition).name
      : node.name;

    function renderPalette(blueprint) {
      const category = blueprint.ui.paletteCategory || "all";
      const visible = category === "all" ? NODE_TYPES : NODE_TYPES.filter((item) => item.category === category);
      return `
        <aside class="blueprint-palette">
          <div class="blueprint-panel-heading"><strong>${esc(text("palette.title", "节点库"))}</strong><span>${visible.length} ${esc(text("count.nodes", "个"))}</span></div>
          <label class="blueprint-search"><span>⌕</span><input data-blueprint-search placeholder="${esc(text("palette.search", "搜索节点"))}" /></label>
          <div class="blueprint-category-tabs">
            <button class="${category === "all" ? "active" : ""}" data-action="set-blueprint-category" data-category="all">${esc(text("category.all", "全部"))}</button>
            ${NODE_CATEGORIES.map((item) => `<button class="${category === item.id ? "active" : ""}" data-action="set-blueprint-category" data-category="${item.id}">${esc(categoryLabel(item))}</button>`).join("")}
          </div>
          <div class="blueprint-node-library">
            ${visible.map((item) => `
              <button class="blueprint-library-item" data-action="add-blueprint-node" data-node-type="${item.id}" data-blueprint-node-search="${esc((item.name + " " + item.description + " " + nodeDefinition(item).name + " " + nodeDefinition(item).description).toLowerCase())}">
                <span class="blueprint-library-icon" style="--node-color:${CATEGORY_MAP[item.category].color}">${esc(nodeDefinition(item).verb.slice(0, 1))}</span>
                <span><strong>${esc(nodeDefinition(item).name)}</strong><small>${esc(nodeDefinition(item).description)}</small></span>
                <b>＋</b>
              </button>
            `).join("")}
          </div>
        </aside>
      `;
    }

    function renderGraph(blueprint) {
      const size = getCanvasSize(blueprint);
      const zoom = Math.min(2, Math.max(0.5, Number(blueprint.ui.zoom) || 1));
      const selectedNodeIds = new Set(blueprint.ui.selectedNodeIds || []);
      if (blueprint.ui.selectedNodeId) selectedNodeIds.add(blueprint.ui.selectedNodeId);
      const collapsedGroups = blueprint.groups.filter((group) => group.collapsed).map((group) => ({ group, bounds: getGroupBounds(blueprint, group) }));
      const collapsedNodeIds = new Set(collapsedGroups.flatMap(({ group }) => group.nodeIds));
      const collapsedGroupByNode = new Map(collapsedGroups.flatMap(({ group, bounds }) => group.nodeIds.map((nodeId) => [nodeId, { group, bounds }])));
      const nodeById = new Map(blueprint.nodes.map((node) => [node.id, node]));
      const activeTask = blueprint.tasks.find((task) => task.id === blueprint.ui.activeTaskId) || null;
      return `
        <section class="blueprint-stage">
          <div class="blueprint-stage-toolbar">
            <span><strong>${esc(text("graph.title", "流程画布"))}</strong> · ${blueprint.nodes.length} ${esc(text("count.nodes", "个节点"))} · ${blueprint.edges.length} ${esc(text("count.edges", "条连接"))}</span>
            <div class="blueprint-toolbar-actions">
              <span class="blueprint-toolbar-group">
                <button class="secondary-button compact" data-action="undo-blueprint" title="撤销 (Ctrl+Z)">↶</button>
                <button class="secondary-button compact" data-action="redo-blueprint" title="重做 (Ctrl+Y)">↷</button>
                <button class="secondary-button compact" data-action="copy-blueprint-selection" title="${esc(text("toolbar.copy.title", "复制 (Ctrl+C)"))}">${esc(text("toolbar.copy", "复制"))}</button>
                <button class="secondary-button compact" data-action="paste-blueprint-selection" title="${esc(text("toolbar.paste.title", "粘贴 (Ctrl+V)"))}">${esc(text("toolbar.paste", "粘贴"))}</button>
                <button class="secondary-button compact" data-action="duplicate-blueprint-selection" title="${esc(text("toolbar.duplicate.title", "重复 (Ctrl+D)"))}">${esc(text("toolbar.duplicate", "重复"))}</button>
              </span>
              <span class="blueprint-toolbar-group">
                <button class="secondary-button compact" data-action="zoom-out-blueprint" title="${esc(text("toolbar.zoomOut", "缩小"))}">−</button>
                <button class="secondary-button compact blueprint-zoom-value" data-action="reset-blueprint-zoom" title="${esc(text("toolbar.resetZoom", "重置为 100%"))}">${Math.round(zoom * 100)}%</button>
                <button class="secondary-button compact" data-action="zoom-in-blueprint" title="${esc(text("toolbar.zoomIn", "放大"))}">＋</button>
                <button class="secondary-button compact" data-action="fit-blueprint-view" title="${esc(text("toolbar.fit", "适应全部节点"))}">${esc(text("toolbar.fitShort", "适应"))}</button>
                <button class="secondary-button compact ${blueprint.ui.panMode ? "active" : ""}" data-action="toggle-blueprint-pan" title="${esc(text("toolbar.pan.title", "拖动画布 (Space)"))}">${esc(text("toolbar.pan", "平移"))}</button>
                <button class="secondary-button compact ${blueprint.ui.snapToGrid ? "active" : ""}" data-action="toggle-blueprint-snap" title="${esc(text("toolbar.snap.title", "拖动时吸附到 24px 网格"))}">${esc(text("toolbar.snap", "吸附"))}</button>
              </span>
              <span class="blueprint-toolbar-group">
                <button class="secondary-button compact" data-action="align-blueprint-left" title="${esc(text("toolbar.alignLeft.title", "左对齐所选节点"))}">${esc(text("toolbar.alignLeft", "左齐"))}</button>
                <button class="secondary-button compact" data-action="distribute-blueprint-horizontal" title="${esc(text("toolbar.distributeHorizontal.title", "横向均匀分布"))}">${esc(text("toolbar.distributeHorizontal", "横分"))}</button>
                <button class="secondary-button compact" data-action="group-blueprint-selection" title="${esc(text("toolbar.group.title", "把所选节点建立分组"))}">${esc(text("toolbar.group", "分组"))}</button>
              </span>
              ${blueprint.ui.pendingFromNodeId ? `<button class="secondary-button compact" data-action="cancel-blueprint-edge">${esc(text("toolbar.cancelLink", "取消连线"))}</button>` : ""}
              <button class="secondary-button compact" data-action="delete-blueprint-selection">${esc(text("toolbar.deleteSelection", "删除所选"))}</button>
              <button class="secondary-button compact" data-action="auto-layout-blueprint">${esc(text("toolbar.autoLayout", "自动整理"))}</button>
            </div>
          </div>
          <div class="blueprint-canvas-viewport" data-blueprint-viewport>
            <div class="blueprint-canvas ${blueprint.ui.panMode ? "pan-mode" : ""}" style="width:${size.width}px;height:${size.height}px;zoom:${zoom}" data-blueprint-canvas>
              <svg class="blueprint-canvas-svg" aria-hidden="true">
                <defs><marker id="blueprintArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z"></path></marker></defs>
                ${blueprint.edges.map((edge) => {
                  const from = nodeById.get(edge.from);
                  const to = nodeById.get(edge.to);
                  if (!from || !to) return "";
                  const fromGroup = collapsedGroupByNode.get(from.id);
                  const toGroup = collapsedGroupByNode.get(to.id);
                  if (fromGroup?.group.id && fromGroup.group.id === toGroup?.group.id) return "";
                  const start = fromGroup
                    ? { x: fromGroup.bounds.x + 220, y: fromGroup.bounds.y + 31 }
                    : getNodePortPoint(from, edge.fromPort || getDefaultPortId(from, "output", "flow"), "output");
                  const end = toGroup
                    ? { x: toGroup.bounds.x, y: toGroup.bounds.y + 31 }
                    : getNodePortPoint(to, edge.toPort || getDefaultPortId(to, "input", "flow"), "input");
                  const x1 = start.x;
                  const y1 = start.y;
                  const x2 = end.x;
                  const y2 = end.y;
                  const offset = Math.max(60, Math.abs(x2 - x1) * 0.45);
                  return `<path class="blueprint-edge kind-${esc(edge.kind || "flow")} ${blueprint.ui.selectedEdgeId === edge.id ? "selected" : ""}" data-action="select-blueprint-edge" data-edge-id="${esc(edge.id)}" d="M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}" marker-end="url(#blueprintArrow)"></path>`;
                }).join("")}
                <path class="blueprint-edge-preview" data-blueprint-edge-preview d=""></path>
              </svg>
              ${blueprint.groups.map((group) => {
                const bounds = getGroupBounds(blueprint, group);
                return `<section class="blueprint-group ${group.collapsed ? "collapsed" : ""}" style="left:${bounds.x}px;top:${bounds.y}px;width:${group.collapsed ? 220 : bounds.width}px;height:${group.collapsed ? 62 : bounds.height}px;--group-color:${esc(group.color)}" data-blueprint-group-id="${esc(group.id)}">
                  <button class="blueprint-group-header" data-action="toggle-blueprint-group" data-group-id="${esc(group.id)}"><strong>${esc(group.name)}</strong><span>${group.nodeIds.length} ${esc(text("count.nodes", "个节点"))} · ${esc(text(group.collapsed ? "group.expand" : "group.collapse", group.collapsed ? "展开" : "折叠"))}</span></button>
                </section>`;
              }).join("")}
              ${blueprint.nodes.map((node) => {
                if (collapsedNodeIds.has(node.id)) return "";
                const definition = TYPE_MAP[node.type];
                const category = CATEGORY_MAP[definition.category];
                const localizedDefinition = nodeDefinition(definition);
                const localizedCategory = categoryLabel(category);
                const nodeTitle = displayNodeName(node, definition);
                const ports = getNodePorts(node);
                const incoming = blueprint.edges.filter((edge) => edge.to === node.id).length;
                const outgoing = blueprint.edges.filter((edge) => edge.from === node.id).length;
                return `
                  <article class="blueprint-node ${selectedNodeIds.has(node.id) ? "selected" : ""} ${node.enabled ? "" : "disabled"} run-${activeTask?.nodeRuns?.[node.id]?.status || "idle"}" style="left:${node.x}px;top:${node.y}px;height:${getNodeHeight(node)}px;--node-color:${category.color}" data-blueprint-node-id="${esc(node.id)}">
                    <button class="blueprint-node-main" data-action="select-blueprint-node" data-node-id="${esc(node.id)}">
                      <span class="blueprint-node-type">${esc(localizedCategory)} · ${esc(localizedDefinition.name)}</span>
                      <strong>${esc(nodeTitle)}</strong>
                      <small>${activeTask ? `${esc(text("status.runningPrefix", "运行："))}${esc(text(`status.${activeTask.nodeRuns?.[node.id]?.status || "idle"}`, activeTask.nodeRuns?.[node.id]?.status || "idle"))}` : `${esc(text("status.incoming", "收"))} ${incoming} · ${esc(text("status.outgoing", "发"))} ${outgoing}`}</small>
                    </button>
                    ${ports.inputs.map((port, index) => {
                      const connected = blueprint.edges.some((edge) => edge.to === node.id && (edge.toPort || getDefaultPortId(node, "input", "flow")) === port.id);
                      const label = portLabel(port);
                      return `<div class="blueprint-pin-row input" style="top:${64 + index * 23}px"><button class="blueprint-port input type-${esc(port.dataType)} ${connected ? "connected" : "unconnected"}" style="--port-color:${PORT_TYPE_COLORS[port.dataType] || PORT_TYPE_COLORS.any}" data-action="complete-blueprint-edge" data-node-id="${esc(node.id)}" data-port-id="${esc(port.id)}" data-port-type="${esc(port.dataType)}" title="${esc(label)} · ${esc(text(connected ? "port.connectedInput" : "port.unconnectedInput", connected ? "已连接输入" : "未连接输入"))}"></button><span>${esc(label)}</span></div>`;
                    }).join("")}
                    ${ports.outputs.map((port, index) => {
                      const connected = blueprint.edges.some((edge) => edge.from === node.id && (edge.fromPort || getDefaultPortId(node, "output", "flow")) === port.id);
                      const label = portLabel(port);
                      return `<div class="blueprint-pin-row output" style="top:${64 + index * 23}px"><span>${esc(label)}</span><button class="blueprint-port output type-${esc(port.dataType)} ${connected ? "connected" : "unconnected"} ${blueprint.ui.pendingFromNodeId === node.id && blueprint.ui.pendingFromPortId === port.id ? "pending" : ""}" style="--port-color:${PORT_TYPE_COLORS[port.dataType] || PORT_TYPE_COLORS.any}" data-action="begin-blueprint-edge" data-node-id="${esc(node.id)}" data-port-id="${esc(port.id)}" data-port-type="${esc(port.dataType)}" title="${esc(label)} · ${esc(text(connected ? "port.connectedOutput" : "port.unconnectedOutput", connected ? "已连接输出" : "未连接输出"))}，${esc(text("port.dragHint", "可拖拽创建连接"))}"></button></div>`;
                    }).join("")}
                  </article>
                `;
              }).join("")}
              ${blueprint.nodes.length ? "" : `<div class="blueprint-canvas-empty"><strong>${esc(text("canvas.empty.title", "把节点添加到画布"))}</strong><span>${esc(text("canvas.empty.desc", "从左侧节点库选择一个节点开始。"))}</span></div>`}
            </div>
          </div>
          <div class="blueprint-minimap" data-blueprint-minimap title="点击定位画布">
            <svg viewBox="0 0 ${size.width} ${size.height}" preserveAspectRatio="none" aria-label="${esc(text("minimap.title", "画布小地图"))}">
              ${blueprint.nodes.map((node) => `<rect x="${node.x}" y="${node.y}" width="208" height="${getNodeHeight(node)}" class="${selectedNodeIds.has(node.id) ? "selected" : ""}"></rect>`).join("")}
              <rect class="blueprint-minimap-viewport" data-blueprint-minimap-viewport x="0" y="0" width="1" height="1"></rect>
            </svg>
          </div>
        </section>
      `;
    }

    function renderInspector(blueprint) {
      const selectedNodeIds = [...new Set([...(blueprint.ui.selectedNodeIds || []), blueprint.ui.selectedNodeId].filter(Boolean))]
        .filter((nodeId) => blueprint.nodes.some((item) => item.id === nodeId));
      if (selectedNodeIds.length > 1) {
        return `
          <aside class="blueprint-inspector blueprint-multi-inspector">
            <div class="blueprint-panel-heading"><strong>${esc(text("inspector.multi", "多选节点"))}</strong><span>${selectedNodeIds.length} ${esc(text("count.items", "个"))}</span></div>
            <div class="blueprint-empty-hint"><b>◇</b><strong>${esc(text("inspector.selected", "已选择 {{count}} 个节点", { count: selectedNodeIds.length }))}</strong><span>${esc(text("inspector.multiHint", "可以整体拖动、复制、重复或删除所选节点。"))}</span></div>
            <div class="blueprint-multi-actions"><button class="secondary-button" data-action="align-blueprint-left">${esc(text("align.left", "左对齐"))}</button><button class="secondary-button" data-action="align-blueprint-top">${esc(text("align.top", "顶对齐"))}</button><button class="secondary-button" data-action="distribute-blueprint-horizontal">${esc(text("distribute.horizontal", "横向分布"))}</button><button class="secondary-button" data-action="distribute-blueprint-vertical">${esc(text("distribute.vertical", "纵向分布"))}</button></div>
            <button class="secondary-button full" data-action="group-blueprint-selection">${esc(text("group.create", "建立节点分组"))}</button>
            <button class="secondary-button full" data-action="copy-blueprint-selection">${esc(text("selection.copy", "复制所选"))}</button>
            <button class="secondary-button full" data-action="duplicate-blueprint-selection">${esc(text("selection.duplicate", "重复所选"))}</button>
            <button class="secondary-button danger full" data-action="delete-blueprint-selection">${esc(text("selection.delete", "删除所选"))}</button>
          </aside>
        `;
      }
      const node = blueprint.nodes.find((item) => item.id === blueprint.ui.selectedNodeId);
      const edge = blueprint.edges.find((item) => item.id === blueprint.ui.selectedEdgeId);
      if (node) {
        const definition = TYPE_MAP[node.type];
        const visiblePropertySchema = (NODE_PROPERTY_SCHEMAS[node.type] || []).filter(([key]) => {
          if (node.type === "file") {
            if (key === "content") return ["write", "append"].includes(node.config.operation || "read");
            if (key === "toPath") return node.config.operation === "move";
          }
          if (node.type === "browser") {
            if (key === "selector") return ["extract-selector"].includes(node.config.mode || "extract-text");
            if (key === "actions") return node.config.mode === "actions";
          }
          return true;
        });
        const propertyFields = visiblePropertySchema.map(([key, label, fieldType, options]) => {
          const value = node.config[key] ?? "";
          const localizedLabel = propertyLabel(key, label);
          if (fieldType === "select") return `<div class="field"><label>${esc(localizedLabel)}</label><select data-blueprint-config-field="${esc(key)}">${String(options || "").split("|").map((option) => `<option value="${esc(option)}" ${String(value) === option ? "selected" : ""}>${esc(text(`option.${option}`, option))}</option>`).join("")}</select></div>`;
          if (fieldType === "node-select") return `<div class="field"><label>${esc(localizedLabel)}</label><select data-blueprint-config-field="${esc(key)}"><option value="">${esc(text("field.selectNode", "请选择节点"))}</option>${blueprint.nodes.filter((candidate) => candidate.id !== node.id).map((candidate) => `<option value="${esc(candidate.id)}" ${String(value) === candidate.id ? "selected" : ""}>${esc(candidate.name)} · ${esc(candidate.id)}</option>`).join("")}</select></div>`;
          if (fieldType === "textarea") return `<div class="field"><label>${esc(localizedLabel)}</label><textarea data-blueprint-config-field="${esc(key)}">${esc(value)}</textarea></div>`;
          if (fieldType === "checkbox") return `<label class="blueprint-check"><input type="checkbox" data-blueprint-config-field="${esc(key)}" ${value === true ? "checked" : ""} /> ${esc(localizedLabel)}</label>`;
          return `<div class="field"><label>${esc(localizedLabel)}</label><input type="${fieldType === "number" ? "number" : "text"}" data-blueprint-config-field="${esc(key)}" value="${esc(value)}" /></div>`;
        }).join("");
        const specialActions = node.type === "mcp-tool"
          ? `<button class="secondary-button full" data-action="discover-blueprint-mcp-tools">${esc(text("action.discoverMcp", "发现 Server 工具"))}</button>` : "";
        return `
          <aside class="blueprint-inspector">
            <div class="blueprint-panel-heading"><strong>${esc(text("inspector.node", "节点属性"))}</strong><span>${esc(nodeDefinition(definition).name)}</span></div>
            <div class="field"><label>${esc(text("field.name", "节点名称"))}</label><input data-blueprint-field="name" value="${esc(node.name)}" /></div>
            <div class="field"><label>${esc(text("field.description", "说明"))}</label><textarea data-blueprint-field="description">${esc(node.description)}</textarea></div>
            ${renderInstructionEditor(node, esc, text)}
            <div class="blueprint-property-section"><strong>${esc(text("inspector.specific", "专属属性"))}</strong><span>${esc(nodeDefinition(definition).name)} ${esc(text("inspector.executionConfig", "的执行配置"))}</span></div>
            ${propertyFields}
            ${specialActions}
            <div class="blueprint-field-row">
              <div class="field"><label>${esc(text("field.timeout", "超时（毫秒，0 使用节点默认值）"))}</label><input type="number" min="0" data-blueprint-field="timeoutMs" value="${node.timeoutMs}" /></div>
              <div class="field"><label>${esc(text("field.retryCount", "重试次数"))}</label><input type="number" min="0" data-blueprint-field="retryCount" value="${node.retryCount}" /></div>
            </div>
            <label class="blueprint-check"><input type="checkbox" data-blueprint-field="enabled" ${node.enabled ? "checked" : ""} /> ${esc(text("field.enabled", "启用此节点"))}</label>
            <div class="blueprint-inspector-note"><strong>${esc(text("field.nodeId", "节点 ID"))}</strong><code>${esc(node.id)}</code><span>${esc(text("field.type", "类型："))}${esc(node.type)}</span></div>
          </aside>
        `;
      }
      if (edge) {
        const from = blueprint.nodes.find((nodeItem) => nodeItem.id === edge.from);
        const to = blueprint.nodes.find((nodeItem) => nodeItem.id === edge.to);
        return `
          <aside class="blueprint-inspector">
            <div class="blueprint-panel-heading"><strong>${esc(text("inspector.edge", "连接属性"))}</strong><span>${esc(text("inspector.flowEdge", "流程边"))}</span></div>
            <div class="blueprint-route-card"><strong>${esc(from?.name || text("unknownNode", "未知节点"))}</strong><span>→</span><strong>${esc(to?.name || text("unknownNode", "未知节点"))}</strong></div>
            <div class="field"><label>${esc(text("field.edgeLabel", "连接标签"))}</label><input data-blueprint-edge-field="label" value="${esc(edge.label)}" placeholder="${esc(text("field.edgeLabelPlaceholder", "可选，例如：通过"))}" /></div>
            <button class="secondary-button danger full" data-action="delete-blueprint-selection">${esc(text("selection.deleteEdge", "删除连接"))}</button>
          </aside>
        `;
      }
      return `
        <aside class="blueprint-inspector blueprint-inspector-empty">
          <div class="blueprint-panel-heading"><strong>${esc(text("inspector.title", "属性检查器"))}</strong><span>${esc(text("inspector.none", "未选择"))}</span></div>
          <div class="blueprint-empty-hint"><b>◇</b><strong>${esc(text("inspector.select", "选择节点或连接"))}</strong><span>${esc(text("inspector.hint", "在画布中选择元素后，可在这里编辑名称、指令、超时和重试策略。"))}</span></div>
        </aside>
      `;
    }

    function renderWorkspace(blueprint, sidebarCollapsed) {
      const sidebarRestoreButton = sidebarCollapsed
        ? `<button class="sidebar-floating-toggle sidebar-toggle-button" title="${esc(tr("nav.showSidebar", "显示侧边栏"))}" data-action="toggle-sidebar">${typeof icon === "function" ? icon("sidebar") : "☰"}</button>`
        : "";
      if (!blueprint) {
        return `
          <section class="workspace blueprint-workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}">
            ${sidebarRestoreButton}
            <div class="workspace-topbar">
              <div class="project-heading"><h1 class="workspace-title">${esc(text("workspace.title", "蓝图工作区"))}</h1><div class="workspace-subtitle">${esc(text("workspace.subtitle", "通过节点和连接编排可重复执行的用户任务"))}</div></div>
              <button class="primary-button" data-action="show-create-blueprint">＋ ${esc(text("action.new", "新建蓝图"))}</button>
            </div>
            <div class="blueprint-empty-state"><div><b>◇</b><h2>${esc(text("empty.title", "创建你的第一张任务蓝图"))}</h2><p>${esc(text("empty.desc", "将规划、Agent、工具、分支和人工审批组合成完整工作流。"))}</p><div class="blueprint-empty-actions"><button class="secondary-button" data-action="show-generate-blueprint">✦ ${esc(text("action.generate", "根据任务生成蓝图"))}</button><button class="primary-button" data-action="show-create-blueprint">＋ ${esc(text("action.new", "新建蓝图"))}</button></div></div></div>
          </section>
        `;
      }
      const validation = validateBlueprint(blueprint);
      return `
        <section class="workspace blueprint-workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}" data-blueprint-id="${esc(blueprint.id)}" tabindex="-1">
          ${sidebarRestoreButton}
          <div class="workspace-topbar blueprint-topbar">
            <div class="project-heading">
              <div class="blueprint-title-row"><h1 class="workspace-title">${esc(blueprint.name)}</h1><span class="blueprint-version">v${blueprint.version}</span></div>
              <div class="workspace-subtitle">${esc(blueprint.description || text("workspace.description", "通过可视化流程完成用户任务"))}</div>
            </div>
            <div class="workspace-actions">
              <span class="blueprint-validation-pill ${validation.ok ? "ok" : "error"}">${esc(text(validation.ok ? "validation.valid" : "validation.fix", validation.ok ? "结构有效" : "需要修复"))} · ${validation.issues.length}</span>
              <button class="secondary-button" data-action="show-blueprint-tasks">${esc(text("action.taskRecords", "任务记录"))} ${blueprint.tasks.length}</button>
              <button class="secondary-button" data-action="validate-blueprint">${esc(text("action.validate", "检查蓝图"))}</button>
              <button class="secondary-button" data-action="show-generate-blueprint">✦ ${esc(text("action.generate", "根据任务生成蓝图"))}</button>
              <button class="primary-button" data-action="show-blueprint-task">＋ ${esc(text("action.createTask", "使用蓝图创建任务"))}</button>
            </div>
          </div>
          <div class="blueprint-editor">
            ${renderPalette(blueprint)}
            ${renderGraph(blueprint)}
            ${renderInspector(blueprint)}
          </div>
        </section>
      `;
    }

    return { renderWorkspace };
  }

  global.COSS_BLUEPRINT = Object.freeze({
    NODE_CATEGORIES,
    NODE_TYPES,
    TYPE_MAP,
    CATEGORY_MAP,
    NODE_PROPERTY_SCHEMAS,
    PORT_TYPE_COLORS,
    getNodePorts,
    getNodeHeight,
    getNodePortPoint,
    getDefaultPortId,
    getGroupBounds,
    createNode,
    createBlueprint,
    generateBlueprintFromTask,
    ensureBlueprintShape,
    validateBlueprint,
    autoLayout,
    createRenderer
  });
})(window);
