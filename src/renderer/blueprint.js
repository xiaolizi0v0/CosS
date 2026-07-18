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
      ui: { selectedNodeId: "", selectedEdgeId: "", pendingFromNodeId: "", paletteCategory: "all" }
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
    blueprint.ui = blueprint.ui && typeof blueprint.ui === "object" ? blueprint.ui : {};
    blueprint.ui.selectedNodeId = String(blueprint.ui.selectedNodeId || "");
    blueprint.ui.selectedEdgeId = String(blueprint.ui.selectedEdgeId || "");
    blueprint.ui.pendingFromNodeId = String(blueprint.ui.pendingFromNodeId || "");
    blueprint.ui.activeTaskId = String(blueprint.ui.activeTaskId || "");
    blueprint.ui.paletteCategory = String(blueprint.ui.paletteCategory || "all");
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
    const ids = new Set(blueprint.nodes.map((node) => node.id));
    blueprint.edges = blueprint.edges.filter((edge) => edge && ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to)
      .map((edge, index) => ({
        id: String(edge.id || "bp-edge-" + index),
        from: String(edge.from),
        to: String(edge.to),
        label: String(edge.label || "")
      }));
    return blueprint;
  }

  function validateBlueprint(blueprint) {
    ensureBlueprintShape(blueprint);
    const issues = [];
    const nodes = blueprint.nodes.filter((node) => node.enabled !== false);
    const ids = new Set(nodes.map((node) => node.id));
    const edges = blueprint.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
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
    const incoming = new Map(blueprint.nodes.map((node) => [node.id, 0]));
    blueprint.edges.forEach((edge) => incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1));
    const queue = blueprint.nodes.filter((node) => node.type === "task-start" || incoming.get(node.id) === 0);
    const depth = new Map(queue.map((node) => [node.id, 0]));
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const node = queue[cursor];
      blueprint.edges.filter((edge) => edge.from === node.id).forEach((edge) => {
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
      node.y = 72 + row * 132;
    }));
    blueprint.updatedAt = new Date().toISOString();
  }

  function getCanvasSize(blueprint) {
    const maxX = Math.max(1100, ...blueprint.nodes.map((node) => node.x + 270));
    const maxY = Math.max(680, ...blueprint.nodes.map((node) => node.y + 180));
    return { width: maxX, height: maxY };
  }

  function createRenderer({ escapeHtml, icon, translate } = {}) {
    const esc = escapeHtml || ((value) => String(value));
    const tr = translate || ((_key, fallback) => fallback);

    function renderPalette(blueprint) {
      const category = blueprint.ui.paletteCategory || "all";
      const visible = category === "all" ? NODE_TYPES : NODE_TYPES.filter((item) => item.category === category);
      return `
        <aside class="blueprint-palette">
          <div class="blueprint-panel-heading"><strong>节点库</strong><span>${visible.length} 个</span></div>
          <label class="blueprint-search"><span>⌕</span><input data-blueprint-search placeholder="搜索节点" /></label>
          <div class="blueprint-category-tabs">
            <button class="${category === "all" ? "active" : ""}" data-action="set-blueprint-category" data-category="all">全部</button>
            ${NODE_CATEGORIES.map((item) => `<button class="${category === item.id ? "active" : ""}" data-action="set-blueprint-category" data-category="${item.id}">${esc(item.label)}</button>`).join("")}
          </div>
          <div class="blueprint-node-library">
            ${visible.map((item) => `
              <button class="blueprint-library-item" data-action="add-blueprint-node" data-node-type="${item.id}" data-blueprint-node-search="${esc((item.name + " " + item.description).toLowerCase())}">
                <span class="blueprint-library-icon" style="--node-color:${CATEGORY_MAP[item.category].color}">${esc(item.verb.slice(0, 1))}</span>
                <span><strong>${esc(item.name)}</strong><small>${esc(item.description)}</small></span>
                <b>＋</b>
              </button>
            `).join("")}
          </div>
        </aside>
      `;
    }

    function renderGraph(blueprint) {
      const size = getCanvasSize(blueprint);
      const nodeById = new Map(blueprint.nodes.map((node) => [node.id, node]));
      const activeTask = blueprint.tasks.find((task) => task.id === blueprint.ui.activeTaskId) || null;
      return `
        <section class="blueprint-stage">
          <div class="blueprint-stage-toolbar">
            <span><strong>流程画布</strong> · ${blueprint.nodes.length} 个节点 · ${blueprint.edges.length} 条连接</span>
            <div>
              ${blueprint.ui.pendingFromNodeId ? `<button class="secondary-button compact" data-action="cancel-blueprint-edge">取消连线</button>` : ""}
              <button class="secondary-button compact" data-action="delete-blueprint-selection">删除所选</button>
              <button class="secondary-button compact" data-action="auto-layout-blueprint">自动整理</button>
            </div>
          </div>
          <div class="blueprint-canvas-viewport" data-blueprint-viewport>
            <div class="blueprint-canvas" style="width:${size.width}px;height:${size.height}px" data-blueprint-canvas>
              <svg class="blueprint-canvas-svg" aria-hidden="true">
                <defs><marker id="blueprintArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z"></path></marker></defs>
                ${blueprint.edges.map((edge) => {
                  const from = nodeById.get(edge.from);
                  const to = nodeById.get(edge.to);
                  if (!from || !to) return "";
                  const x1 = from.x + 184;
                  const y1 = from.y + 46;
                  const x2 = to.x;
                  const y2 = to.y + 46;
                  const offset = Math.max(60, Math.abs(x2 - x1) * 0.45);
                  return `<path class="blueprint-edge ${blueprint.ui.selectedEdgeId === edge.id ? "selected" : ""}" data-action="select-blueprint-edge" data-edge-id="${esc(edge.id)}" d="M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}" marker-end="url(#blueprintArrow)"></path>`;
                }).join("")}
              </svg>
              ${blueprint.nodes.map((node) => {
                const definition = TYPE_MAP[node.type];
                const category = CATEGORY_MAP[definition.category];
                const incoming = blueprint.edges.filter((edge) => edge.to === node.id).length;
                const outgoing = blueprint.edges.filter((edge) => edge.from === node.id).length;
                return `
                  <article class="blueprint-node ${blueprint.ui.selectedNodeId === node.id ? "selected" : ""} ${node.enabled ? "" : "disabled"} run-${activeTask?.nodeRuns?.[node.id]?.status || "idle"}" style="left:${node.x}px;top:${node.y}px;--node-color:${category.color}" data-blueprint-node-id="${esc(node.id)}">
                    <button class="blueprint-port input" data-action="complete-blueprint-edge" data-node-id="${esc(node.id)}" title="连接到此节点"></button>
                    <button class="blueprint-node-main" data-action="select-blueprint-node" data-node-id="${esc(node.id)}">
                      <span class="blueprint-node-type">${esc(category.label)} · ${esc(definition.name)}</span>
                      <strong>${esc(node.name)}</strong>
                      <small>${activeTask ? `运行：${esc(activeTask.nodeRuns?.[node.id]?.status || "idle")}` : `收 ${incoming} · 发 ${outgoing}`}</small>
                    </button>
                    <button class="blueprint-port output ${blueprint.ui.pendingFromNodeId === node.id ? "pending" : ""}" data-action="begin-blueprint-edge" data-node-id="${esc(node.id)}" title="从此节点创建连接"></button>
                  </article>
                `;
              }).join("")}
              ${blueprint.nodes.length ? "" : `<div class="blueprint-canvas-empty"><strong>把节点添加到画布</strong><span>从左侧节点库选择一个节点开始。</span></div>`}
            </div>
          </div>
        </section>
      `;
    }

    function renderInspector(blueprint) {
      const node = blueprint.nodes.find((item) => item.id === blueprint.ui.selectedNodeId);
      const edge = blueprint.edges.find((item) => item.id === blueprint.ui.selectedEdgeId);
      if (node) {
        const definition = TYPE_MAP[node.type];
        const propertyFields = (NODE_PROPERTY_SCHEMAS[node.type] || []).map(([key, label, fieldType, options]) => {
          const value = node.config[key] ?? "";
          if (fieldType === "select") return `<div class="field"><label>${esc(label)}</label><select data-blueprint-config-field="${esc(key)}">${String(options || "").split("|").map((option) => `<option value="${esc(option)}" ${String(value) === option ? "selected" : ""}>${esc(option)}</option>`).join("")}</select></div>`;
          if (fieldType === "node-select") return `<div class="field"><label>${esc(label)}</label><select data-blueprint-config-field="${esc(key)}"><option value="">请选择节点</option>${blueprint.nodes.filter((candidate) => candidate.id !== node.id).map((candidate) => `<option value="${esc(candidate.id)}" ${String(value) === candidate.id ? "selected" : ""}>${esc(candidate.name)} · ${esc(candidate.id)}</option>`).join("")}</select></div>`;
          if (fieldType === "textarea") return `<div class="field"><label>${esc(label)}</label><textarea data-blueprint-config-field="${esc(key)}">${esc(value)}</textarea></div>`;
          if (fieldType === "checkbox") return `<label class="blueprint-check"><input type="checkbox" data-blueprint-config-field="${esc(key)}" ${value === true ? "checked" : ""} /> ${esc(label)}</label>`;
          return `<div class="field"><label>${esc(label)}</label><input type="${fieldType === "number" ? "number" : "text"}" data-blueprint-config-field="${esc(key)}" value="${esc(value)}" /></div>`;
        }).join("");
        const specialActions = node.type === "mcp-tool"
          ? `<button class="secondary-button full" data-action="discover-blueprint-mcp-tools">发现 Server 工具</button>` : "";
        return `
          <aside class="blueprint-inspector">
            <div class="blueprint-panel-heading"><strong>节点属性</strong><span>${esc(definition.name)}</span></div>
            <div class="field"><label>节点名称</label><input data-blueprint-field="name" value="${esc(node.name)}" /></div>
            <div class="field"><label>说明</label><textarea data-blueprint-field="description">${esc(node.description)}</textarea></div>
            <div class="field"><label>执行指令 / 模板</label><textarea class="blueprint-instruction" data-blueprint-field="instruction" placeholder="描述该节点应完成什么">${esc(node.instruction)}</textarea></div>
            <div class="blueprint-property-section"><strong>专属属性</strong><span>${esc(definition.name)} 的执行配置</span></div>
            ${propertyFields}
            ${specialActions}
            <div class="blueprint-field-row">
              <div class="field"><label>超时（毫秒）</label><input type="number" min="0" data-blueprint-field="timeoutMs" value="${node.timeoutMs}" /></div>
              <div class="field"><label>重试次数</label><input type="number" min="0" data-blueprint-field="retryCount" value="${node.retryCount}" /></div>
            </div>
            <label class="blueprint-check"><input type="checkbox" data-blueprint-field="enabled" ${node.enabled ? "checked" : ""} /> 启用此节点</label>
            <div class="blueprint-inspector-note"><strong>节点 ID</strong><code>${esc(node.id)}</code><span>类型：${esc(node.type)}</span></div>
          </aside>
        `;
      }
      if (edge) {
        const from = blueprint.nodes.find((nodeItem) => nodeItem.id === edge.from);
        const to = blueprint.nodes.find((nodeItem) => nodeItem.id === edge.to);
        return `
          <aside class="blueprint-inspector">
            <div class="blueprint-panel-heading"><strong>连接属性</strong><span>流程边</span></div>
            <div class="blueprint-route-card"><strong>${esc(from?.name || "未知节点")}</strong><span>→</span><strong>${esc(to?.name || "未知节点")}</strong></div>
            <div class="field"><label>连接标签</label><input data-blueprint-edge-field="label" value="${esc(edge.label)}" placeholder="可选，例如：通过" /></div>
            <button class="secondary-button danger full" data-action="delete-blueprint-selection">删除连接</button>
          </aside>
        `;
      }
      return `
        <aside class="blueprint-inspector blueprint-inspector-empty">
          <div class="blueprint-panel-heading"><strong>属性检查器</strong><span>未选择</span></div>
          <div class="blueprint-empty-hint"><b>◇</b><strong>选择节点或连接</strong><span>在画布中选择元素后，可在这里编辑名称、指令、超时和重试策略。</span></div>
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
              <div class="project-heading"><h1 class="workspace-title">蓝图工作区</h1><div class="workspace-subtitle">通过节点和连接编排可重复执行的用户任务</div></div>
              <button class="primary-button" data-action="show-create-blueprint">＋ 新建蓝图</button>
            </div>
            <div class="blueprint-empty-state"><div><b>◇</b><h2>创建你的第一张任务蓝图</h2><p>将规划、Agent、工具、分支和人工审批组合成完整工作流。</p><button class="primary-button" data-action="show-create-blueprint">＋ 新建蓝图</button></div></div>
          </section>
        `;
      }
      const validation = validateBlueprint(blueprint);
      return `
        <section class="workspace blueprint-workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}" data-blueprint-id="${esc(blueprint.id)}">
          ${sidebarRestoreButton}
          <div class="workspace-topbar blueprint-topbar">
            <div class="project-heading">
              <div class="blueprint-title-row"><h1 class="workspace-title">${esc(blueprint.name)}</h1><span class="blueprint-version">v${blueprint.version}</span></div>
              <div class="workspace-subtitle">${esc(blueprint.description || "通过可视化流程完成用户任务")}</div>
            </div>
            <div class="workspace-actions">
              <span class="blueprint-validation-pill ${validation.ok ? "ok" : "error"}">${validation.ok ? "结构有效" : "需要修复"} · ${validation.issues.length}</span>
              <button class="secondary-button" data-action="show-blueprint-tasks">任务记录 ${blueprint.tasks.length}</button>
              <button class="secondary-button" data-action="validate-blueprint">检查蓝图</button>
              <button class="primary-button" data-action="show-blueprint-task">＋ 使用蓝图创建任务</button>
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
    createNode,
    createBlueprint,
    ensureBlueprintShape,
    validateBlueprint,
    autoLayout,
    createRenderer
  });
})(window);
