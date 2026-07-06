const ROLE_TEMPLATES = [
  {
    id: "product-manager",
    name: "产品经理",
    category: "规划",
    description: "把用户需求转化为可开发、可验收的任务。",
    programs: ["terminal", "task", "file", "browser"],
    claude: true,
    collaborators: ["tech-lead", "frontend-engineer", "backend-engineer", "qa-engineer"]
  },
  {
    id: "tech-lead",
    name: "技术负责人",
    category: "规划",
    description: "把控技术方案、代码质量和角色协作边界。",
    programs: ["terminal", "file", "task"],
    claude: true,
    collaborators: ["frontend-engineer", "backend-engineer", "qa-engineer", "ai-agent-engineer"]
  },
  {
    id: "frontend-engineer",
    name: "前端工程师",
    category: "开发",
    description: "负责界面、交互、前端状态和前端工程化。",
    programs: ["terminal", "browser", "file"],
    claude: true,
    collaborators: ["backend-engineer", "qa-engineer", "product-manager"]
  },
  {
    id: "backend-engineer",
    name: "后端工程师",
    category: "开发",
    description: "负责接口、业务逻辑、数据模型和权限控制。",
    programs: ["terminal", "file", "task"],
    claude: true,
    collaborators: ["frontend-engineer", "qa-engineer", "devops-engineer"]
  },
  {
    id: "qa-engineer",
    name: "测试工程师",
    category: "质量",
    description: "验证功能是否符合需求和验收标准。",
    programs: ["browser", "terminal", "task"],
    claude: true,
    collaborators: ["frontend-engineer", "backend-engineer", "product-manager"]
  },
  {
    id: "ai-agent-engineer",
    name: "AI/Agent 工程师",
    category: "开发",
    description: "负责模型、Agent、工具调用和任务编排能力。",
    programs: ["terminal", "file", "task"],
    claude: true,
    collaborators: ["tech-lead", "backend-engineer", "security-engineer"]
  },
  {
    id: "devops-engineer",
    name: "DevOps 工程师",
    category: "基础设施",
    description: "负责构建、部署、CI/CD、环境和发布流水线。",
    programs: ["terminal", "task"],
    claude: true,
    collaborators: ["backend-engineer", "qa-engineer", "tech-lead"]
  },
  {
    id: "technical-writer",
    name: "技术文档工程师",
    category: "文档",
    description: "负责开发文档、API 文档和技术说明。",
    programs: ["terminal", "file", "browser", "task"],
    claude: true,
    collaborators: ["product-manager", "tech-lead", "backend-engineer"]
  },
  {
    id: "security-engineer",
    name: "安全工程师",
    category: "安全",
    description: "识别权限边界、命令执行和敏感数据风险。",
    programs: ["terminal", "file", "task"],
    claude: true,
    collaborators: ["backend-engineer", "devops-engineer", "ai-agent-engineer"]
  }
];

const SYSTEM_ROLE = {
  id: "system",
  name: "系统",
  category: "Kernel",
  description: "CosS Kernel 系统调度器。",
  programs: [],
  claude: false,
  collaborators: []
};
const ORCHESTRATOR_PROTOCOL_VERSION = "0.10.0";
const ORCHESTRATOR_TRANSPORT_SENDER_ID = SYSTEM_ROLE.id;
const ROLE_CAPABILITY_PROFILES = {
  "product-manager": ["requirements.define", "acceptance.define", "workflow.propose", "artifact.write_docs"],
  "tech-lead": ["architecture.design", "workflow.propose", "code.review", "risk.assess", "artifact.write_docs"],
  "frontend-engineer": ["code.frontend", "ui.implement", "browser.inspect", "artifact.write_code"],
  "backend-engineer": ["code.backend", "api.implement", "data.model", "artifact.write_code"],
  "qa-engineer": ["test.plan", "test.execute", "browser.inspect", "artifact.write_report"],
  "ai-agent-engineer": ["agent.design", "mcp.integrate", "workflow.propose", "artifact.write_code"],
  "devops-engineer": ["build.configure", "deploy.prepare", "ci.configure", "artifact.write_code"],
  "technical-writer": ["docs.write", "artifact.write_docs", "requirements.summarize"],
  "security-engineer": ["security.review", "risk.assess", "policy.check", "artifact.write_report"]
};
const GLOBAL_ORCHESTRATOR_POLICY = {
  directAgentMessaging: false,
  capabilitySandbox: true,
  sharedTaskBoard: true,
  resourceLocks: true,
  structuredResultsOnly: true,
  durableWorkflow: true,
  eventSourcing: true,
  stepLeases: true,
  dryRunBeforeHighRisk: true,
  userConfirmationForHighRisk: true,
  centralArbitration: true
};

const PROGRAMS = {
  terminal: { label: "终端", icon: ">" },
  browser: { label: "浏览器", icon: "◎" },
  file: { label: "文件", icon: "□" },
  task: { label: "任务", icon: "✓" },
  "task-list": { label: "任务列表", icon: "☰" }
};

const DEFAULT_TASK_ROLE_IDS = ["product-manager", "frontend-engineer", "backend-engineer", "qa-engineer", "tech-lead"];
const PROJECT_MEMORY_VERSION = "0.10.0";
const PROJECT_MEMORY_TASK_LIMIT = 8;
const PROJECT_MEMORY_ITEM_LIMIT = 20;
const MCP_TOOL_NAMES = [
  "coss_get_context",
  "coss_list_roles",
  "coss_get_task_board",
  "coss_pool_read",
  "coss_pool_claim",
  "coss_list_tasks",
  "coss_claim_task",
  "coss_claim_step",
  "coss_heartbeat_step",
  "coss_release_step",
  "coss_get_kernel_events",
  "coss_report_status",
  "coss_submit_result",
  "coss_acquire_lock",
  "coss_release_lock",
  "coss_request_approval"
];

const MODEL_PROVIDER_PRESETS = {
  system: {
    id: "system",
    label: "系统默认",
    description: "内网默认系统模型，无需 API key。",
    baseUrl: "http://10.21.1.45:22845/v1",
    modelName: "agent-brain",
    apiKeyRequired: true,
    locked: false
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek API",
    description: "使用 DeepSeek 兼容接口，需要用户填写 API key。",
    baseUrl: "https://api.deepseek.com/v1",
    modelName: "deepseek-chat",
    apiKeyRequired: true
  },
  glm: {
    id: "glm",
    label: "GLM",
    description: "使用智谱 GLM 接口，需要用户填写 API key。",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelName: "glm-4-plus",
    apiKeyRequired: true
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    description: "使用 OpenAI 兼容接口，需要用户填写 API key。",
    baseUrl: "https://api.openai.com/v1",
    modelName: "gpt-4.1",
    apiKeyRequired: true
  },
  "claude-code": {
    id: "claude-code",
    label: "Claude Code",
    description: "用于后续 Claude Code/Claude API 编排，需要用户填写 API key。",
    baseUrl: "https://api.anthropic.com/v1",
    modelName: "claude-sonnet-4-20250514",
    apiKeyRequired: true
  }
};

const AGENT_PERMISSION_POLICIES = {
  readonly: {
    id: "readonly",
    label: "只读模式",
    description: "Agent 只能阅读、分析和给出建议，不应改文件、安装依赖或执行破坏性命令。",
    instruction: "当前 CosS Agent 权限模式：只读模式。只能阅读和分析项目内容，不能创建、修改、删除文件，不能安装依赖，不能运行部署、格式化磁盘或其他写入/破坏性命令。如确需修改，请先说明原因并等待用户调整权限。"
  },
  confirm: {
    id: "confirm",
    label: "每次编辑确认",
    description: "任何文件写入、依赖安装、删除、部署等操作都需要先说明风险并等待确认。",
    instruction: "当前 CosS Agent 权限模式：每次编辑确认。执行任何文件写入、依赖安装、删除、部署、网络发布或高风险命令前，必须先说明计划、影响范围和风险，并等待用户确认。"
  },
  sessionEdit: {
    id: "sessionEdit",
    label: "本会话允许编辑",
    description: "Agent 可在当前项目内创建和修改文件；安装依赖、删除、部署仍需确认。",
    instruction: "当前 CosS Agent 权限模式：本会话允许编辑。可以在当前项目目录内创建和修改文件；安装依赖、删除文件、部署、格式化磁盘、访问敏感信息或其他高风险操作仍必须先等待用户确认。"
  },
  sessionInstall: {
    id: "sessionInstall",
    label: "本会话允许编辑与安装依赖",
    description: "Agent 可在当前项目内编辑文件并安装依赖；删除、部署和破坏性命令仍需确认。",
    instruction: "当前 CosS Agent 权限模式：本会话允许编辑与安装依赖。可以在当前项目目录内创建/修改文件并安装必要依赖；删除文件、部署、格式化磁盘、清理大范围目录、访问敏感信息或其他破坏性操作仍必须先等待用户确认。"
  }
};

const SETTINGS_SECTIONS = [
  { id: "account", label: "账户管理", icon: "user" },
  { id: "system", label: "系统设置", icon: "gear" },
  { id: "agent", label: "智能体设置", icon: "assistant" },
  { id: "memory", label: "记忆", icon: "clock" },
  { id: "model", label: "模型", icon: "cube" },
  { id: "assistant", label: "助理设置", icon: "assistant" },
  { id: "personalization", label: "个性化", icon: "sparkles" },
  { id: "data", label: "数据管理", icon: "database" },
  { id: "security", label: "安全中心", icon: "shield" },
  { id: "help", label: "帮助与反馈", icon: "help" }
];

const defaultState = {
  activeProjectId: null,
  projects: [],
  deletedProjectIds: [],
  settings: {
    agentProvider: "claude",
    agentFallbackToShell: true,
    agentPermissionMode: "confirm",
    agentAutoWorkflowEnabled: true,
    agentAutoWorkflowPaused: false,
    agentMcpAutoConfigEnabled: false,
    codeBuddyApiKey: "",
    agentPromptTemplate:
      "你是 CosS 类桌面工作区中的{{roleName}}。\n" +
      "角色 ID：{{roleId}}\n" +
      "角色职责：{{roleDescription}}\n" +
      "项目：{{projectName}}\n" +
      "工作目录：{{workspace}}\n" +
      "Agent 权限模式：{{agentPermissionLabel}}\n" +
      "{{agentPermissionInstructions}}\n" +
      "当前任务：{{taskTitle}}\n" +
      "子任务：{{subtaskTitle}}\n" +
      "子任务说明：{{subtaskDescription}}\n\n" +
      "请只在当前项目范围内工作。执行高风险命令、删除文件、修改依赖或访问敏感信息前，先说明风险并等待用户确认。\n" +
      "CosS v0.10 使用中央 Kernel 线性调度。你不能直接给其他 Agent 分配任务，不能发明不存在的角色，也不能绕过共享任务板。\n" +
      "开始工作前优先使用 coss_get_task_board、coss_pool_claim、coss_claim_step；长任务中使用 coss_heartbeat_step；完成后必须使用 coss_submit_result({ status: \"done\" }) 提交结构化结果。\n" +
      "只完成当前 Step。Kernel 会在当前 Step 完成后启动预先规划好的下一个 Agent。",
    modelProvider: "system",
    modelConfigs: createDefaultModelConfigs()
  }
};

const APP_VERSION = "v0.10.0";
const appSessionId = `appsession-${Date.now()}-${Math.random().toString(16).slice(2)}`;

let state = structuredClone(defaultState);
let saveStateInFlight = false;
let saveStateDirty = false;
let saveStatePromise = Promise.resolve();
let stateStorageStamp = "";
let externalStateRefreshTimer = null;
let pendingExternalStateRefreshReason = "";
let pendingKernelAutoWorkflowTimer = null;
let bootingProjectId = null;
let contextMenu = null;
let roleMenu = null;
let pendingProgramType = null;
let focusedWindowId = null;
let activePopoverWindowId = null;
let dragState = null;
let zSeed = 20;
const WINDOW_Z_BASE = 20;
const WINDOW_Z_MAX = 9990;
const DEFAULT_BROWSER_URL = "https://example.com";
const DEFAULT_DESKTOP_ID = "desktop-main";
const MAXIMIZED_WINDOW_STYLE = "left:16px; top:66px; width:calc(100% - 32px); height:calc(100% - 150px);";
const terminalViews = new Map();
const terminalBackendIds = new Set();
const terminalBackendReadyIds = new Set();
const terminalBackendActiveModes = new Map();
const terminalBackendReadyAt = new Map();
const terminalRecentOutput = new Map();
const deliveryStuckTimers = new Map();
const agentDeliveryDrainTimers = new Map();
const hydratedBrowserViews = new Set();
let pendingCommandApproval = null;
let latestClaudeStatus = null;
let latestCodexStatus = null;
let latestCodeBuddyStatus = null;
let latestStorageInfo = null;
let mcpConfigStatus = null;
let mcpAuditFilters = { roleId: "", taskId: "", tool: "", query: "" };
let storageOperationStatus = null;
let modelEditorProvider = "system";
let activeSettingsSection = "system";
const modelConnectivityStatuses = {};
const agentLoginTestStatuses = {};
let openAppMenuId = null;
let isWindowMaximized = false;
let pendingTaskPlanDraft = null;
let messageComposerDefaults = {};
let messageTimelineFilters = { taskId: "", query: "" };
let messageFlowSelection = { roleId: "", edgeKey: "" };
let selectedTimelineItemId = "";
let messageTimelineScrollLeft = 0;
let taskViewOpen = false;
let pendingFileOperation = null;
let taskRoleFilter = "";
let taskListFilters = { query: "", roleId: "", status: "", model: "", includeArchived: false };
let selectedTaskListTaskId = "";
let taskListScrollState = { windowContent: 0, items: 0, detail: 0 };

const AGENT_POOL_CLEANUP_POLICY = {
  maxFilesPerRole: 160,
  maxAgeDays: 21,
  batchSize: 40
};

const SUBTASK_STATUS_DEFS = {
  idle: { label: "空闲", windowStatus: "idle" },
  running: { label: "执行中", windowStatus: "working" },
  done: { label: "完成", windowStatus: "done" }
};

const AGENT_RELAY_STAGES = {
  idle: { label: "空闲", symbol: "闲", className: "idle" },
  running: { label: "执行中", symbol: "行", className: "executing" },
  done: { label: "完成", symbol: "完", className: "completed" }
};

const KERNEL_PHASE_DEFS = {
  idle: { label: "空闲", status: "idle", relayStage: "idle" },
  running: { label: "执行中", status: "running", relayStage: "running" },
  done: { label: "完成", status: "done", relayStage: "done" }
};

const agentPoolCleanupTimers = new Map();

const COMMAND_RISK_RULES = [
  {
    id: "delete-files",
    severity: "high",
    label: "文件删除",
    description: "可能删除项目文件或系统文件。",
    pattern: /\b(remove-item|rm|del|erase|rmdir|rd)\b/i
  },
  {
    id: "dependency-install",
    severity: "medium",
    label: "依赖或软件安装",
    description: "会改变本机或项目依赖环境。",
    pattern: /\b(winget|npm|pnpm|yarn|pip|choco|scoop|cargo|dotnet)\s+(install|i|add|update|upgrade)\b/i
  },
  {
    id: "environment-change",
    severity: "high",
    label: "环境变量或注册表修改",
    description: "可能影响当前用户或系统环境。",
    pattern: /\b(setx|reg\s+add|\[environment\]::setenvironmentvariable)\b|\$env:[\w()\\.-]+\s*=/i
  },
  {
    id: "deployment",
    severity: "high",
    label: "发布或部署",
    description: "可能把本地变更发布到远程环境。",
    pattern: /\b(git\s+push|npm\s+publish|docker\s+push|kubectl\s+(apply|delete)|terraform\s+(apply|destroy))\b/i
  },
  {
    id: "script-execution",
    severity: "medium",
    label: "动态脚本执行",
    description: "可能执行下载或拼接生成的代码。",
    pattern: /\b(iex|invoke-expression|powershell\s+-encodedcommand)\b|(\|\s*(powershell|pwsh|sh|bash)\b)/i
  }
];

const appRoot = document.getElementById("app");

function isSameLocalDate(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatProjectCreatedTime(project) {
  const value = project?.createdAt || project?.lastOpenedAt || "";
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  if (isSameLocalDate(date, new Date())) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDefaultModelConfigs() {
  return Object.fromEntries(
    Object.entries(MODEL_PROVIDER_PRESETS).map(([id, preset]) => [
      id,
      {
        baseUrl: preset.baseUrl,
        modelName: preset.modelName,
        apiKey: ""
      }
    ])
  );
}

function normalizeModelProvider(value) {
  return MODEL_PROVIDER_PRESETS[value] ? value : "system";
}

function ensureModelSettings(settings) {
  settings.modelProvider = normalizeModelProvider(settings.modelProvider);
  settings.modelConfigs ||= {};

  Object.entries(MODEL_PROVIDER_PRESETS).forEach(([id, preset]) => {
    const current = settings.modelConfigs[id] || {};
    settings.modelConfigs[id] = {
      baseUrl: preset.locked ? preset.baseUrl : (current.baseUrl || preset.baseUrl),
      modelName: preset.locked ? preset.modelName : (current.modelName || preset.modelName),
      apiKey: preset.locked ? "" : (current.apiKey || "")
    };
  });

  const activePreset = MODEL_PROVIDER_PRESETS[settings.modelProvider];
  const activeConfig = settings.modelConfigs[settings.modelProvider];
  if (activePreset?.apiKeyRequired && !activeConfig?.apiKey) {
    settings.modelProvider = "system";
  }

  modelEditorProvider = normalizeModelProvider(modelEditorProvider || settings.modelProvider);
  return settings;
}

function getModelConfig(provider = state.settings.modelProvider) {
  const id = normalizeModelProvider(provider);
  const preset = MODEL_PROVIDER_PRESETS[id];
  const config = state.settings.modelConfigs?.[id] || {};

  return {
    id,
    label: preset.label,
    description: preset.description,
    baseUrl: config.baseUrl || preset.baseUrl,
    modelName: config.modelName || preset.modelName,
    apiKey: preset.locked ? "" : (config.apiKey || ""),
    apiKeyRequired: Boolean(preset.apiKeyRequired),
    locked: Boolean(preset.locked)
  };
}

function getActiveModelConfig() {
  return getModelConfig(state.settings.modelProvider);
}

function canUseModelProvider(provider) {
  const config = getModelConfig(provider);
  return !config.apiKeyRequired || Boolean(config.apiKey);
}

function updateModelConfigField(provider, field, value) {
  const id = normalizeModelProvider(provider);
  const preset = MODEL_PROVIDER_PRESETS[id];
  if (!preset || preset.locked || !["baseUrl", "modelName", "apiKey"].includes(field)) {
    return;
  }

  state.settings.modelConfigs ||= createDefaultModelConfigs();
  state.settings.modelConfigs[id] ||= {
    baseUrl: preset.baseUrl,
    modelName: preset.modelName,
    apiKey: ""
  };
  state.settings.modelConfigs[id][field] = value;
  delete modelConnectivityStatuses[id];
  saveState();
}

function renderMaskedSecret(value) {
  if (!value) {
    return "未填写";
  }
  return value.length <= 6 ? "已填写" : `${value.slice(0, 3)}...${value.slice(-3)}`;
}

function getRole(roleId) {
  if (roleId === SYSTEM_ROLE.id) {
    return SYSTEM_ROLE;
  }
  return ROLE_TEMPLATES.find((role) => role.id === roleId) || ROLE_TEMPLATES[0];
}

function getProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || null;
}

const TASK_LAYOUT_PRESETS = [
  { id: "split-two", label: "两列" },
  { id: "main-narrow", label: "主列加窄列" },
  { id: "main-stack", label: "主列加上下分割" },
  { id: "four-grid", label: "四宫格" },
  { id: "three-columns", label: "三列" },
  { id: "center-focus", label: "中间主列" }
];

function normalizeLayoutPreset(value) {
  return TASK_LAYOUT_PRESETS.some((preset) => preset.id === value) ? value : "split-two";
}

function createDesktopState(name = "主对话", options = {}) {
  const taskIds = uniqueStrings([...(options.taskIds || []), options.taskId || ""]);
  return {
    id: options.id || uid("desktop"),
    name,
    taskId: options.taskId || "",
    taskIds,
    lastTaskId: options.lastTaskId || options.taskId || taskIds[0] || "",
    layoutPreset: normalizeLayoutPreset(options.layoutPreset),
    createdAt: options.createdAt || new Date().toISOString()
  };
}

function ensureProjectDesktops(project) {
  if (!project) {
    return [];
  }

  if (!Array.isArray(project.desktops) || project.desktops.length === 0) {
    project.desktops = [
      createDesktopState("主对话", {
        id: DEFAULT_DESKTOP_ID,
        createdAt: project.createdAt || new Date().toISOString()
      })
    ];
  }

  project.desktops = project.desktops.map((desktop, index) => ({
    id: desktop.id || (index === 0 ? DEFAULT_DESKTOP_ID : uid("desktop")),
    name: desktop.name || (index === 0 ? "主对话" : `对话 ${index + 1}`),
    taskId: desktop.taskId || "",
    taskIds: uniqueStrings([...(desktop.taskIds || []), desktop.taskId || ""]),
    lastTaskId: desktop.lastTaskId || desktop.taskId || desktop.taskIds?.[0] || "",
    layoutPreset: normalizeLayoutPreset(desktop.layoutPreset),
    createdAt: desktop.createdAt || project.createdAt || new Date().toISOString()
  }));

  const hasActiveDesktop = project.desktops.some((desktop) => desktop.id === project.activeDesktopId);
  if (!project.activeDesktopId || !hasActiveDesktop) {
    project.activeDesktopId = project.desktops[0].id;
  }

  return project.desktops;
}

function getProjectDesktops(project = getProject()) {
  return ensureProjectDesktops(project);
}

function getActiveDesktop(project = getProject()) {
  const desktops = getProjectDesktops(project);
  return desktops.find((desktop) => desktop.id === project?.activeDesktopId) || desktops[0] || null;
}

function getActiveDesktopId(project = getProject()) {
  return getActiveDesktop(project)?.id || DEFAULT_DESKTOP_ID;
}

function isWindowOnActiveDesktop(win, project = getProject()) {
  return win.desktopId === getActiveDesktopId(project);
}

function getDesktopWindows(project, desktopId = getActiveDesktopId(project)) {
  return (project?.windows || []).filter((win) => win.desktopId === desktopId);
}

function getTaskConversationId(task) {
  return task?.conversationId || task?.desktopId || "";
}

function setTaskConversation(task, desktopId) {
  task.desktopId = desktopId;
  task.conversationId = desktopId;
}

function getConversationTasks(project, desktopId = getActiveDesktopId(project)) {
  return (project?.tasks || []).filter((task) => getTaskConversationId(task) === desktopId);
}

function getTaskSubtaskPairs(task) {
  return (task?.subtasks || []).map((subtask) => ({ task, subtask }));
}

function getTaskDoneCount(task) {
  return getTaskKernelProjection(task).doneCount;
}

function getTaskRoleIds(task) {
  return getTaskKernelProjection(task).roleIds;
}

function getTaskStatusValue(task) {
  return getTaskKernelProjection(task).status;
}

function getTaskModelName(task) {
  return String(task?.model?.modelName || task?.model?.provider || "agent-brain");
}

function getFilteredConversationTasks(project, desktopId = getActiveDesktopId(project)) {
  const query = String(taskListFilters.query || "").trim().toLowerCase();
  const roleId = taskListFilters.roleId || "";
  const status = taskListFilters.status || "";
  const model = taskListFilters.model || "";
  return getConversationTasks(project, desktopId).filter((task) => {
    if (!taskListFilters.includeArchived && task.archived) {
      return false;
    }
    if (roleId && !getTaskRoleIds(task).includes(roleId)) {
      return false;
    }
    if (status && getTaskStatusValue(task) !== status) {
      return false;
    }
    if (model && getTaskModelName(task) !== model) {
      return false;
    }
    if (!query) {
      return true;
    }
    const searchable = [
      task.title,
      task.goal,
      task.planner?.summary,
      getTaskModelName(task),
      ...getTaskSubtaskPairs(task).flatMap(({ subtask }) => [getRole(subtask.roleId).name, subtask.title, subtask.description])
    ].join(" ").toLowerCase();
    return searchable.includes(query);
  });
}

function getTaskMessages(project, taskId) {
  return (project?.messages || []).filter((message) => message.taskId === taskId);
}

function getTaskDeliveries(project, taskId) {
  return (project?.agentDeliveries || []).filter((delivery) => delivery.taskId === taskId);
}

function getTaskOutputRefs(project, taskId) {
  return (project?.terminalOutputRefs || []).filter((ref) => ref.taskId === taskId);
}

function syncConversationTaskIds(project) {
  if (!project) {
    return;
  }
  const desktops = getProjectDesktops(project);
  const fallbackDesktopId = desktops[0]?.id || DEFAULT_DESKTOP_ID;
  project.tasks.forEach((task) => {
    if (!getTaskConversationId(task)) {
      setTaskConversation(task, task.desktopId || fallbackDesktopId);
    } else if (!task.conversationId) {
      task.conversationId = task.desktopId;
    } else if (!task.desktopId) {
      task.desktopId = task.conversationId;
    }
  });
  desktops.forEach((desktop) => {
    const taskIds = uniqueStrings([
      ...(desktop.taskIds || []),
      desktop.taskId || "",
      ...project.tasks
        .filter((task) => getTaskConversationId(task) === desktop.id)
        .map((task) => task.id)
    ]);
    desktop.taskIds = taskIds;
    desktop.taskId = desktop.taskId || taskIds[0] || "";
    desktop.lastTaskId = taskIds.includes(desktop.lastTaskId) ? desktop.lastTaskId : taskIds[0] || "";
  });
}

function getVisibleWindows(project = getProject()) {
  return getDesktopWindows(project).filter((win) => !win.minimized);
}

function normalizeSubtaskStatus(value) {
  return SUBTASK_STATUS_DEFS[value] ? value : "idle";
}

function deriveTaskStatus(subtasks = []) {
  if (subtasks.length === 0) {
    return "planned";
  }
  if (subtasks.every((subtask) => normalizeSubtaskStatus(subtask.status) === "done")) {
    return "done";
  }
  if (subtasks.some((subtask) => normalizeSubtaskStatus(subtask.status) === "running")) {
    return "running";
  }
  return "planned";
}

function normalizeKernelPhase(value, fallbackStatus = "idle") {
  const phase = String(value || "").trim();
  if (KERNEL_PHASE_DEFS[phase]) {
    return phase;
  }
  const status = normalizeSubtaskStatus(fallbackStatus);
  if (status === "done") {
    return "done";
  }
  if (status === "running") {
    return "running";
  }
  return "idle";
}

function kernelPhaseToStatus(phase) {
  return KERNEL_PHASE_DEFS[normalizeKernelPhase(phase)]?.status || "idle";
}

function isLeaseExpired(lease) {
  const expiresAt = new Date(lease?.expiresAt || 0).getTime();
  return Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < Date.now();
}

function stableKernelIdPart(value, fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function getSubtaskFallbackKey(subtask, index) {
  return [
    index,
    stableKernelIdPart(subtask?.roleId, "role"),
    stableKernelIdPart(subtask?.title, "title"),
    stableKernelIdPart(subtask?.description, "desc")
  ].join(":");
}

function getStepFallbackKey(step, index) {
  return [
    index,
    stableKernelIdPart(step?.roleId, "role"),
    stableKernelIdPart(step?.title, "title"),
    stableKernelIdPart(step?.description, "desc")
  ].join(":");
}

function getStableSubtaskId(task, subtask, index, current = {}) {
  const existingId = String(subtask?.id || current.subtaskId || "").trim();
  if (existingId) {
    return existingId;
  }
  const taskPart = stableKernelIdPart(task?.id || task?.title, "task");
  const rolePart = stableKernelIdPart(subtask?.roleId || current.roleId, "role");
  const titlePart = stableKernelIdPart(subtask?.title || current.title, "step");
  return `subtask-${taskPart}-${String(index + 1).padStart(2, "0")}-${rolePart}-${titlePart}`;
}

function getTaskKernelSteps(task) {
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  subtasks.forEach((subtask, index) => {
    subtask.id = getStableSubtaskId(task, subtask, index);
  });
  const subtaskById = new Map(subtasks.map((subtask) => [subtask.id, subtask]));
  const rawSteps = Array.isArray(task?.orchestrator?.steps) && task.orchestrator.steps.length > 0
    ? task.orchestrator.steps
    : subtasks.map((subtask, index) => ({
      id: `step-${subtask.id}`,
      subtaskId: subtask.id,
      roleId: subtask.roleId,
      title: subtask.title,
      description: subtask.description,
      status: subtask.status,
      phase: normalizeKernelPhase("", subtask.status),
      isEntryStep: Boolean(subtask.isEntryStep) || index === 0,
      updatedAt: subtask.updatedAt,
      createdAt: subtask.createdAt
    }));

  return rawSteps.map((step, index) => {
    const subtask = subtaskById.get(step.subtaskId) || subtasks[index] || {};
    const status = normalizeSubtaskStatus(step.status || subtask.status);
    const phase = normalizeKernelPhase(step.phase, status);
    const expiredLease = isLeaseExpired(step.lease);
    return {
      ...step,
      subtask,
      roleId: getRole(step.roleId || subtask.roleId).id,
      title: step.title || subtask.title || `Step ${index + 1}`,
      description: step.description || subtask.description || "",
      phase: expiredLease && phase === "running" ? "idle" : phase,
      status: expiredLease ? "idle" : kernelPhaseToStatus(phase),
      leaseExpired: expiredLease
    };
  });
}

function getTaskKernelProjection(task) {
  const steps = getTaskKernelSteps(task);
  const counts = Object.fromEntries(Object.keys(KERNEL_PHASE_DEFS).map((phase) => [phase, 0]));
  steps.forEach((step) => {
    counts[step.phase] = (counts[step.phase] || 0) + 1;
  });
  const total = steps.length;
  const activeCount = counts.running || 0;
  const activeLocks = (task?.orchestrator?.locks || []).filter((lock) => lock.status === "locked");
  const pendingApprovals = (task?.orchestrator?.approvals || []).filter((approval) => approval.status === "pending");
  const events = Array.isArray(task?.orchestrator?.events) ? task.orchestrator.events : [];
  const status = total === 0
    ? "planned"
    : counts.done === total
        ? "done"
        : activeCount > 0
          ? "running"
          : "planned";
  return {
    version: task?.orchestrator?.version || ORCHESTRATOR_PROTOCOL_VERSION,
    architecture: task?.orchestrator?.kernel?.architecture || "durable-workflow-kernel",
    status,
    total,
    doneCount: counts.done,
    activeCount,
    counts,
    steps,
    roleIds: uniqueRoleIds(steps.map((step) => step.roleId)),
    activeLocks,
    pendingApprovals,
    events,
    staleLeases: steps.filter((step) => step.leaseExpired)
  };
}

function getSubtaskKernelProjection(task, subtask) {
  const projection = getTaskKernelProjection(task);
  const step = projection.steps.find((item) => item.subtaskId === subtask?.id)
    || projection.steps.find((item) => item.roleId === subtask?.roleId)
    || null;
  return {
    step,
    phase: step?.phase || normalizeKernelPhase("", subtask?.status),
    status: step?.status || normalizeSubtaskStatus(subtask?.status),
    leaseExpired: Boolean(step?.leaseExpired)
  };
}

function getCurrentKernelStep(task) {
  const orchestrator = ensureTaskOrchestrator(task);
  const steps = orchestrator?.steps || [];
  if (steps.length === 0) {
    return null;
  }

  const currentStepId = orchestrator.sharedState?.currentStep || "";
  const currentStep = steps.find((step) => step.id === currentStepId || step.subtaskId === currentStepId) || null;
  if (currentStep && normalizeKernelPhase(currentStep.phase, currentStep.status) !== "done") {
    return currentStep;
  }

  const doneStepIds = new Set(steps
    .filter((step) => normalizeKernelPhase(step.phase, step.status) === "done")
    .flatMap((step) => [step.id, step.subtaskId])
    .filter(Boolean));
  const readyStep = steps.find((step) => (
    normalizeKernelPhase(step.phase, step.status) !== "done"
    && uniqueStrings(step.dependsOn || []).every((dependencyId) => doneStepIds.has(dependencyId))
  ));
  return readyStep || steps.find((step) => normalizeKernelPhase(step.phase, step.status) !== "done") || currentStep || steps[0];
}

function canManuallyExecuteKernelSubtask(task, subtask) {
  const step = getSubtaskKernelProjection(task, subtask).step;
  const currentStep = getCurrentKernelStep(task);
  if (!step || !currentStep) {
    return false;
  }
  return step.id === currentStep.id || step.subtaskId === currentStep.subtaskId;
}

function kernelPhaseToRelayStage(phase) {
  return KERNEL_PHASE_DEFS[normalizeKernelPhase(phase)]?.relayStage || "idle";
}

function subtaskStatusToKernelPhase(status) {
  return {
    idle: "idle",
    running: "running",
    done: "done"
  }[normalizeSubtaskStatus(status)] || "idle";
}

function appendRendererKernelEvent(project, task, event = {}) {
  const now = event.createdAt || new Date().toISOString();
  const record = {
    id: event.id || uid("kernel-event"),
    protocolVersion: ORCHESTRATOR_PROTOCOL_VERSION,
    type: String(event.type || "renderer.kernel.event"),
    projectId: project?.id || event.projectId || "",
    taskId: task?.id || event.taskId || "",
    roleId: event.roleId || "",
    stepId: event.stepId || "",
    subtaskId: event.subtaskId || "",
    payload: event.payload && typeof event.payload === "object" ? event.payload : {},
    createdAt: now
  };

  if (task) {
    const orchestrator = ensureTaskOrchestrator(task);
    orchestrator.events.push(record);
    orchestrator.events = orchestrator.events.slice(-240);
  }

  if (project) {
    project.kernelEvents ||= [];
    project.kernelEvents.push(record);
    project.kernelEvents = project.kernelEvents.slice(-1000);
  }

  return record;
}

function findKernelStepForSubtask(task, subtask) {
  const orchestrator = ensureTaskOrchestrator(task);
  return orchestrator?.steps.find((step) => step.subtaskId === subtask?.id)
    || orchestrator?.steps.find((step) => step.roleId === subtask?.roleId)
    || null;
}

function setTaskStatusFromKernelProjection(task) {
  task.status = getTaskKernelProjection(task).status || deriveTaskStatus(task.subtasks);
  return task.status;
}

function applyKernelStepStatusAction(project, task, subtask, nextStatus, options = {}) {
  if (!project || !task || !subtask) {
    return null;
  }

  const now = options.at || new Date().toISOString();
  const status = normalizeSubtaskStatus(nextStatus);
  const previousStatus = normalizeSubtaskStatus(subtask.status);
  const phase = normalizeKernelPhase(options.phase || subtaskStatusToKernelPhase(status), status);
  const previousPhase = getSubtaskKernelProjection(task, subtask).phase;
  const step = findKernelStepForSubtask(task, subtask);

  if (step) {
    step.status = status;
    step.phase = phase;
    step.updatedAt = now;
    if (options.renewLease || phase === "running") {
      const leaseMs = Number(task.orchestrator?.kernel?.leaseMs) || 300000;
      const nowMs = new Date(now).getTime();
      const leaseBaseMs = Number.isFinite(nowMs) ? nowMs : Date.now();
      step.lease = {
        ownerRoleId: step.claimedBy || step.roleId,
        acquiredAt: step.lease?.acquiredAt || now,
        heartbeatAt: now,
        expiresAt: new Date(leaseBaseMs + leaseMs).toISOString()
      };
    }
    if (["idle", "done"].includes(phase) && step.lease) {
      step.lease = null;
    }
    task.orchestrator.sharedState.currentStep = step.id;
  }

  subtask.status = status;
  subtask.updatedAt = now;
  subtask.lastStatusChangedAt = now;
  task.updatedAt = now;
  setTaskStatusFromKernelProjection(task);

  return appendRendererKernelEvent(project, task, {
    type: options.type || "renderer.step.status.changed",
    roleId: subtask.roleId,
    stepId: step?.id || "",
    subtaskId: subtask.id,
    createdAt: now,
    payload: {
      previousStatus,
      status,
      previousPhase,
      phase,
      source: options.source || "renderer",
      eventId: options.eventId || ""
    }
  });
}

function getRoleCapabilities(roleId) {
  return [...(ROLE_CAPABILITY_PROFILES[getRole(roleId).id] || [])];
}

function normalizeRiskLevel(value) {
  return ["low", "medium", "high"].includes(value) ? value : "low";
}

function getOrchestratorSenderRoleId(targetRoleId) {
  getRole(targetRoleId);
  return ORCHESTRATOR_TRANSPORT_SENDER_ID;
}

function ensureTaskOrchestrator(task) {
  if (!task) {
    return null;
  }
  const now = task.updatedAt || task.createdAt || new Date().toISOString();
  const existing = task.orchestrator && typeof task.orchestrator === "object" ? task.orchestrator : {};
  const existingSteps = Array.isArray(existing.steps) ? existing.steps : [];
  const stepsBySubtaskId = new Map(existingSteps
    .filter((step) => step?.subtaskId)
    .map((step) => [step.subtaskId, step]));
  const stepsByFallbackKey = new Map(existingSteps.map((step, index) => [getStepFallbackKey(step, index), step]));
  const steps = (task.subtasks || []).map((subtask, index) => {
    const current = stepsBySubtaskId.get(subtask.id) || stepsByFallbackKey.get(getSubtaskFallbackKey(subtask, index)) || {};
    subtask.id = getStableSubtaskId(task, subtask, index, current);
    const roleId = getRole(subtask.roleId).id;
    return {
      id: current.id || `step-${subtask.id}`,
      subtaskId: subtask.id,
      roleId,
      title: subtask.title || current.title || `步骤 ${index + 1}`,
      description: subtask.description || current.description || "",
      status: normalizeSubtaskStatus(current.status || subtask.status),
      phase: normalizeKernelPhase(current.phase || normalizeSubtaskStatus(subtask.status), subtask.status),
      dependsOn: uniqueStrings(current.dependsOn || subtask.dependsOn || []),
      isEntryStep: Boolean(current.isEntryStep || subtask.isEntryStep) || index === 0,
      assignedMessageId: current.assignedMessageId || subtask.assignedMessageId || "",
      claimedBy: current.claimedBy || "",
      lease: current.lease && typeof current.lease === "object" ? current.lease : null,
      riskLevel: normalizeRiskLevel(current.riskLevel || subtask.riskLevel),
      allowedCapabilities: getRoleCapabilities(roleId),
      source: current.source || subtask.source || "orchestrator",
      createdAt: current.createdAt || subtask.createdAt || now,
      updatedAt: current.updatedAt || subtask.updatedAt || now
    };
  });
  task.orchestrator = {
    version: ORCHESTRATOR_PROTOCOL_VERSION,
    mode: "central-orchestrator",
    owner: "CosS Kernel",
    kernel: {
      version: ORCHESTRATOR_PROTOCOL_VERSION,
      architecture: "durable-workflow-kernel",
      eventStore: "sqlite-event-sourcing",
      executionModel: "central-orchestrator",
      leaseMs: Number(existing.kernel?.leaseMs) || 300000,
      projections: ["task-board", "agent-status", "timeline", "role-flow"]
    },
    policy: {
      ...GLOBAL_ORCHESTRATOR_POLICY,
      ...(existing.policy || {})
    },
    capabilities: ROLE_TEMPLATES.reduce((acc, role) => {
      acc[role.id] = getRoleCapabilities(role.id);
      return acc;
    }, {}),
    sharedState: {
      currentStep: existing.sharedState?.currentStep || "",
      artifacts: Array.isArray(existing.sharedState?.artifacts) ? existing.sharedState.artifacts : [],
      constraints: uniqueStrings([
        "不允许 Agent 直接给其他 Agent 分配任务",
        "所有结果必须写回共享任务板",
        "中高风险动作必须等待用户或调度器确认",
        ...(existing.sharedState?.constraints || [])
      ]),
      decisions: Array.isArray(existing.sharedState?.decisions) ? existing.sharedState.decisions : []
    },
    locks: Array.isArray(existing.locks) ? existing.locks : [],
    approvals: Array.isArray(existing.approvals) ? existing.approvals : [],
    events: Array.isArray(existing.events) ? existing.events.slice(-120) : [],
    steps
  };
  return task.orchestrator;
}

function ensureTaskShape(task) {
  task.desktopId ||= task.conversationId || "";
  task.conversationId ||= task.desktopId || "";
  task.archived = Boolean(task.archived);
  task.archivedAt ||= "";
  task.subtasks ||= [];
  task.subtasks.forEach((subtask, index) => {
    subtask.id = getStableSubtaskId(task, subtask, index);
    subtask.status = normalizeSubtaskStatus(subtask.status);
    subtask.createdAt ||= task.createdAt || new Date().toISOString();
    subtask.updatedAt ||= subtask.createdAt;
    subtask.lastStatusChangedAt ||= subtask.updatedAt;
  });
  ensureTaskOrchestrator(task);
  setTaskStatusFromKernelProjection(task);
  return task;
}

function createEmptyProjectMemory(enabled = true) {
  return {
    version: PROJECT_MEMORY_VERSION,
    enabled,
    manualNotes: "",
    summary: "",
    taskHistory: [],
    decisions: [],
    artifacts: [],
    updatedAt: "",
    lastSource: ""
  };
}

function ensureProjectMemoryShape(project) {
  if (!project) {
    return createEmptyProjectMemory();
  }
  const existing = project.memory && typeof project.memory === "object" ? project.memory : {};
  project.memory = {
    ...createEmptyProjectMemory(existing.enabled !== false),
    ...existing,
    enabled: existing.enabled !== false,
    manualNotes: String(existing.manualNotes || "").slice(0, 6000),
    summary: String(existing.summary || "").slice(0, 12000),
    taskHistory: Array.isArray(existing.taskHistory) ? existing.taskHistory.slice(-PROJECT_MEMORY_ITEM_LIMIT) : [],
    decisions: Array.isArray(existing.decisions) ? existing.decisions.slice(-PROJECT_MEMORY_ITEM_LIMIT) : [],
    artifacts: Array.isArray(existing.artifacts) ? existing.artifacts.slice(-PROJECT_MEMORY_ITEM_LIMIT) : [],
    updatedAt: existing.updatedAt || "",
    lastSource: existing.lastSource || ""
  };
  return project.memory;
}

function compactMemoryText(value, limit = 220) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function summarizeProjectTaskForMemory(task) {
  ensureTaskShape(task);
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : [];
  const doneCount = subtasks.filter((subtask) => normalizeSubtaskStatus(subtask.status) === "done").length;
  const roleIds = uniqueRoleIds([
    ...(task.planner?.neededAgentRoleIds || []),
    ...subtasks.map((subtask) => subtask.roleId)
  ]);
  return {
    id: task.id || "",
    title: compactMemoryText(task.title || task.goal, 80),
    goal: compactMemoryText(task.goal || task.title, 240),
    status: task.status || deriveTaskStatus(subtasks),
    createdAt: task.createdAt || "",
    updatedAt: task.updatedAt || task.createdAt || "",
    modelName: task.model?.modelName || task.model?.provider || "",
    summary: compactMemoryText(task.planner?.summary || "", 240),
    doneCount,
    totalCount: subtasks.length,
    roles: roleIds.map((roleId) => ({
      id: roleId,
      name: getRole(roleId).name
    })),
    subtasks: subtasks.slice(0, 12).map((subtask) => ({
      id: subtask.id || "",
      roleId: subtask.roleId || "",
      roleName: getRole(subtask.roleId).name,
      title: compactMemoryText(subtask.title, 100),
      description: compactMemoryText(subtask.description, 260),
      status: normalizeSubtaskStatus(subtask.status)
    }))
  };
}

function collectProjectMemoryArtifacts(project) {
  return (project.tasks || [])
    .flatMap((task) => {
      const artifacts = task.orchestrator?.sharedState?.artifacts || [];
      return artifacts.map((artifact) => ({
        taskId: task.id || "",
        taskTitle: compactMemoryText(task.title || task.goal, 80),
        roleId: artifact.roleId || "",
        roleName: artifact.roleId ? getRole(artifact.roleId).name : "",
        stepId: artifact.stepId || "",
        path: compactMemoryText(artifact.path || artifact.url, 260),
        type: compactMemoryText(artifact.type || "file", 40),
        description: compactMemoryText(artifact.description || artifact.summary, 220),
        createdAt: artifact.createdAt || task.updatedAt || task.createdAt || ""
      }));
    })
    .filter((artifact) => artifact.path)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, PROJECT_MEMORY_ITEM_LIMIT);
}

function collectProjectMemoryDecisions(project) {
  return (project.tasks || [])
    .flatMap((task) => {
      const decisions = task.orchestrator?.sharedState?.decisions || [];
      return decisions.map((decision) => ({
        id: decision.id || "",
        taskId: task.id || "",
        taskTitle: compactMemoryText(task.title || task.goal, 80),
        roleId: decision.roleId || "",
        roleName: decision.roleId ? getRole(decision.roleId).name : "",
        stepId: decision.stepId || "",
        summary: compactMemoryText(decision.summary || decision.message, 500),
        createdAt: decision.createdAt || task.updatedAt || task.createdAt || ""
      }));
    })
    .filter((decision) => decision.summary)
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, PROJECT_MEMORY_ITEM_LIMIT);
}

function buildProjectMemorySummary(project, taskHistory, decisions, artifacts) {
  const lines = [
    `Project: ${project?.name || "Untitled project"}`,
    `Path: ${project?.path || ""}`
  ];
  if (taskHistory.length > 0) {
    lines.push("Recent tasks:");
    taskHistory.forEach((task, index) => {
      lines.push(`${index + 1}. [${task.status}] ${task.title || task.goal} (${task.doneCount}/${task.totalCount} done)`);
      if (task.summary) {
        lines.push(`   Summary: ${task.summary}`);
      }
      const doneSubtasks = task.subtasks
        .filter((subtask) => subtask.status === "done")
        .slice(0, 4)
        .map((subtask) => `${subtask.roleName}: ${subtask.title}`)
        .join("; ");
      if (doneSubtasks) {
        lines.push(`   Done: ${doneSubtasks}`);
      }
    });
  }
  if (artifacts.length > 0) {
    lines.push("Known artifacts:");
    artifacts.slice(0, 8).forEach((artifact) => {
      lines.push(`- ${artifact.path}${artifact.description ? `: ${artifact.description}` : ""}`);
    });
  }
  if (decisions.length > 0) {
    lines.push("Recent decisions:");
    decisions.slice(0, 8).forEach((decision) => {
      lines.push(`- ${decision.roleName || decision.roleId}: ${decision.summary}`);
    });
  }
  return lines.join("\n").slice(0, 12000);
}

function rebuildProjectMemory(project, source = "auto") {
  const memory = ensureProjectMemoryShape(project);
  const taskHistory = (project.tasks || [])
    .slice(0, PROJECT_MEMORY_TASK_LIMIT)
    .map(summarizeProjectTaskForMemory);
  const decisions = collectProjectMemoryDecisions(project);
  const artifacts = collectProjectMemoryArtifacts(project);
  memory.version = PROJECT_MEMORY_VERSION;
  memory.taskHistory = taskHistory;
  memory.decisions = decisions;
  memory.artifacts = artifacts;
  memory.summary = buildProjectMemorySummary(project, taskHistory, decisions, artifacts);
  memory.updatedAt = new Date().toISOString();
  memory.lastSource = source;
  return memory;
}

function buildProjectMemoryForPlanner(project) {
  const memory = rebuildProjectMemory(project, "planner-context");
  if (memory.enabled === false) {
    return { enabled: false };
  }
  return {
    enabled: true,
    version: memory.version,
    manualNotes: memory.manualNotes,
    summary: memory.summary,
    taskHistory: memory.taskHistory.slice(0, PROJECT_MEMORY_TASK_LIMIT),
    decisions: memory.decisions.slice(0, 10),
    artifacts: memory.artifacts.slice(0, 10),
    updatedAt: memory.updatedAt
  };
}

function formatProjectMemoryForPrompt(projectMemory = {}) {
  if (!projectMemory || projectMemory.enabled === false) {
    return "";
  }
  const lines = [];
  if (projectMemory.manualNotes) {
    lines.push("Manual project notes:", projectMemory.manualNotes);
  }
  if (projectMemory.summary) {
    lines.push("Auto project memory:", projectMemory.summary);
  }
  return lines.join("\n").trim().slice(0, 14000);
}

function formatProjectMemoryForDisplay(memory = {}) {
  const body = formatProjectMemoryForPrompt(memory);
  return body || "暂无项目记忆。点击“刷新记忆”会根据当前项目任务、产物和决策生成摘要。";
}

function uniqueRoleIds(roleIds = []) {
  const allowedRoles = new Set(ROLE_TEMPLATES.map((role) => role.id));
  return Array.from(new Set((Array.isArray(roleIds) ? roleIds : [roleIds]).filter((roleId) => allowedRoles.has(roleId))));
}

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function getMessageChannelId(fromRoleId, toRoleIds, taskId = null) {
  if (taskId) {
    return `task:${taskId}`;
  }
  return `direct:${[fromRoleId, ...uniqueRoleIds(toRoleIds)].sort().join(":")}`;
}

function ensureMessageShape(message) {
  const fromRoleId = getRole(message.fromRoleId).id;
  const toRoleIds = uniqueRoleIds(message.toRoleIds).filter((roleId) => roleId !== fromRoleId);
  const normalizedToRoleIds = toRoleIds.length > 0 ? toRoleIds : [ROLE_TEMPLATES.find((role) => role.id !== fromRoleId)?.id || "product-manager"];
  const taskId = message.taskId || null;
  const channelType = message.channelType || (taskId ? "task" : "direct");

  return {
    id: message.id || uid("msg"),
    type: message.type || "role-message",
    channelType,
    channelId: message.channelId || getMessageChannelId(fromRoleId, normalizedToRoleIds, taskId),
    fromRoleId,
    toRoleIds: normalizedToRoleIds,
    content: String(message.content || "").trim().slice(0, 4000),
    taskId,
    source: message.source || (taskId ? "task-plan" : "manual"),
    status: message.status || "sent",
    readBy: uniqueRoleIds(message.readBy || [fromRoleId]),
    injectedWindowIds: uniqueStrings(message.injectedWindowIds || []),
    injectedAt: message.injectedAt || "",
    autoWorkflow: Boolean(message.autoWorkflow),
    autoWorkflowStatus: String(message.autoWorkflowStatus || "").slice(0, 80),
    autoWorkflowDispatchedAt: message.autoWorkflowDispatchedAt || "",
    autoWorkflowStoppedAt: message.autoWorkflowStoppedAt || "",
    agentPoolPaths: message.agentPoolPaths && typeof message.agentPoolPaths === "object" ? { ...message.agentPoolPaths } : {},
    agentPoolStatus: String(message.agentPoolStatus || "idle").slice(0, 40),
    subtaskRefs: message.subtaskRefs && typeof message.subtaskRefs === "object" ? { ...message.subtaskRefs } : {},
    createdAt: message.createdAt || new Date().toISOString()
  };
}

function getRoleNameSafe(roleId) {
  return getRole(roleId).name || roleId;
}

function firstMeaningfulLine(value, fallback = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || fallback;
}

function createDownstreamSubtasksFromMessage(project, message, options = {}) {
  recordAppLog("orchestrator.direct_subtask_creation.skipped", {
    projectId: project?.id || "",
    taskId: message?.taskId || "",
    messageId: message?.id || "",
    source: message?.source || "",
    reason: "v0.10 Kernel owns downstream task creation"
  }, "warn");
  return [];
}
function sanitizeAgentPoolFileName(value) {
  return String(value || uid("msg"))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || uid("msg");
}

function getAgentPoolMessagePath(roleId, messageId) {
  return `.coss/agent-pools/${getRole(roleId).id}/inbox/${sanitizeAgentPoolFileName(messageId)}.json`;
}

function buildAgentPoolEnvelope(project, message, roleId) {
  return {
    schemaVersion: 1,
    id: message.id,
    projectId: project.id,
    roleId: getRole(roleId).id,
    fromRoleId: message.fromRoleId,
    toRoleIds: message.toRoleIds || [],
    taskId: message.taskId || "",
    channelType: message.channelType || (message.taskId ? "task" : "direct"),
    channelId: message.channelId || getMessageChannelId(message.fromRoleId, message.toRoleIds || [], message.taskId || ""),
    source: message.source || "manual",
    status: message.agentPoolStatus || "idle",
    content: message.content || "",
    createdAt: message.createdAt || new Date().toISOString(),
    startedAt: "",
    runningBy: "",
    messageRef: {
      projectMessageId: message.id
    }
  };
}

async function persistAgentPoolMessages(project, messages = [], reason = "message-created") {
  if (!project?.path || !window.cossAPI?.writeProjectFile) {
    return { ok: false, reason: "project-file-api-unavailable", count: 0 };
  }
  const list = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
  let count = 0;
  const errors = [];
  for (const message of list) {
    const shapedMessage = ensureMessageShape(message);
    message.agentPoolPaths ||= shapedMessage.agentPoolPaths || {};
    message.agentPoolStatus ||= shapedMessage.agentPoolStatus || "idle";
    for (const roleId of uniqueRoleIds(message.toRoleIds || [])) {
      const filePath = getAgentPoolMessagePath(roleId, message.id);
      const envelope = buildAgentPoolEnvelope(project, message, roleId);
      try {
        const result = await window.cossAPI.writeProjectFile({
          projectPath: project.path,
          filePath,
          content: `${JSON.stringify(envelope, null, 2)}\n`
        });
        if (result?.ok) {
          message.agentPoolPaths[roleId] = filePath;
          count += 1;
        } else {
          errors.push({ roleId, messageId: message.id, error: result?.error || "write-failed" });
        }
      } catch (error) {
        errors.push({ roleId, messageId: message.id, error: error.message });
      }
    }
  }
  recordAppLog(errors.length ? "agent.pool.persist.partial" : "agent.pool.persisted", {
    projectId: project.id,
    reason,
    messageIds: list.map((message) => message.id),
    count,
    errors
  }, errors.length ? "warn" : "info");
  scheduleAgentPoolCleanup(project.id);
  return { ok: errors.length === 0, count, errors };
}

function isMessagePoolActive(project, message, roleId) {
  if (!message) {
    return false;
  }
  if (isKernelDispatchMessageForCompletedWork(project, message)) {
    return false;
  }
  const activeStatuses = new Set(["preparing", "queued", "terminal-ready-queued", "external-queued", "submitted"]);
  if (message.toRoleIds?.includes(roleId) && !(message.readBy || []).includes(roleId)) {
    return true;
  }
  if (message.autoWorkflow && activeStatuses.has(message.autoWorkflowStatus || "")) {
    return true;
  }
  return (project.agentDeliveries || []).some((delivery) => (
    delivery.messageId === message.id
    && delivery.roleId === roleId
    && ["pending", "sent", "submitted", "responded", "waiting"].includes(delivery.status)
  ));
}

function getKernelDispatchMessageTask(project, message) {
  if (!project || !message?.taskId) {
    return null;
  }
  return (project.tasks || []).find((task) => task.id === message.taskId) || null;
}

function getKernelDispatchMessageLinkedSubtaskIds(project, message, task = getKernelDispatchMessageTask(project, message)) {
  const explicitIds = uniqueStrings([
    ...Object.values(message?.subtaskRefs || {}),
    ...(project?.agentDeliveries || [])
      .filter((delivery) => delivery.messageId === message?.id)
      .map((delivery) => delivery.subtaskId)
  ]);
  if (explicitIds.length > 0) {
    return explicitIds;
  }

  const orchestrator = task ? ensureTaskOrchestrator(task) : null;
  const byAssignedMessage = (orchestrator?.steps || [])
    .filter((step) => step.assignedMessageId === message?.id)
    .map((step) => step.subtaskId || step.id);
  if (byAssignedMessage.length > 0) {
    return uniqueStrings(byAssignedMessage);
  }

  return [];
}

function getKernelDispatchMessageLinkedWork(project, message) {
  const task = getKernelDispatchMessageTask(project, message);
  const orchestrator = task ? ensureTaskOrchestrator(task) : null;
  const subtaskIds = getKernelDispatchMessageLinkedSubtaskIds(project, message, task);
  const subtasks = subtaskIds
    .map((subtaskId) => (task?.subtasks || []).find((subtask) => subtask.id === subtaskId))
    .filter(Boolean);
  const steps = (orchestrator?.steps || []).filter((step) => (
    subtaskIds.includes(step.subtaskId)
    || subtaskIds.includes(step.id)
    || step.assignedMessageId === message?.id
  ));
  return { task, subtasks, steps };
}

function isKernelDispatchMessageForCompletedWork(project, message) {
  if (!project || !message || (message.source || "") !== "orchestrator-dispatch") {
    return false;
  }

  const { task, subtasks, steps } = getKernelDispatchMessageLinkedWork(project, message);
  if (!task) {
    return false;
  }

  const taskProjection = getTaskKernelProjection(task);
  if (taskProjection.status === "done" || task.status === "done") {
    return true;
  }

  if (subtasks.length > 0 && subtasks.every((subtask) => normalizeSubtaskStatus(subtask.status) === "done")) {
    return true;
  }

  if (steps.length > 0 && steps.every((step) => normalizeKernelPhase(step.phase, step.status) === "done")) {
    return true;
  }

  return false;
}

function markKernelDispatchMessageCompleted(project, message, reason = "completed-work") {
  if (!isKernelDispatchMessageForCompletedWork(project, message)) {
    return false;
  }

  const now = new Date().toISOString();
  let changed = false;
  if (message.autoWorkflowStatus !== "completed") {
    message.autoWorkflowStatus = "completed";
    message.autoWorkflowStoppedAt ||= now;
    message.agentPoolStatus = "done";
    changed = true;
  }

  (project.agentDeliveries || [])
    .filter((delivery) => (
      delivery.messageId === message.id
      && ["pending", "sent", "submitted", "responded", "waiting"].includes(delivery.status)
    ))
    .forEach((delivery) => {
      delivery.status = "completed";
      delivery.completionStatus ||= "done";
      delivery.completedAt ||= now;
      delivery.updatedAt = now;
      changed = true;
    });

  if (changed) {
    recordAppLog("agent.workflow.completed-message-finalized", {
      projectId: project.id,
      messageId: message.id,
      taskId: message.taskId || "",
      reason
    });
  }

  return changed;
}

function finalizeCompletedKernelDispatchMessages(project, reason = "completed-work-scan") {
  if (!project) {
    return 0;
  }
  return (project.messages || []).reduce((count, message) => (
    markKernelDispatchMessageCompleted(project, message, reason) ? count + 1 : count
  ), 0);
}

function scheduleAgentPoolCleanup(projectId, delayMs = 1500) {
  if (!projectId || !window.cossAPI?.deleteProjectFile) {
    return;
  }
  if (agentPoolCleanupTimers.has(projectId)) {
    clearTimeout(agentPoolCleanupTimers.get(projectId));
  }
  const timer = setTimeout(() => {
    agentPoolCleanupTimers.delete(projectId);
    cleanupAgentPoolFiles(projectId).catch((error) => {
      recordAppLog("agent.pool.cleanup.error", { projectId, error: error.message }, "error");
    });
  }, delayMs);
  agentPoolCleanupTimers.set(projectId, timer);
}

async function cleanupAgentPoolFiles(projectIdOrProject = state.activeProjectId, options = {}) {
  const project = typeof projectIdOrProject === "object"
    ? projectIdOrProject
    : state.projects.find((item) => item.id === projectIdOrProject);
  if (!project?.path || !window.cossAPI?.deleteProjectFile) {
    return { ok: false, reason: "file-delete-api-unavailable", deletedCount: 0 };
  }

  const policy = { ...AGENT_POOL_CLEANUP_POLICY, ...(options.policy || {}) };
  const cutoffMs = Date.now() - policy.maxAgeDays * 24 * 60 * 60 * 1000;
  const byRole = new Map();
  (project.messages || []).forEach((message) => {
    Object.entries(message.agentPoolPaths || {}).forEach(([roleId, filePath]) => {
      if (!filePath) {
        return;
      }
      const list = byRole.get(roleId) || [];
      list.push({
        roleId,
        filePath,
        message,
        time: new Date(message.createdAt || 0).getTime() || 0,
        active: isMessagePoolActive(project, message, roleId)
      });
      byRole.set(roleId, list);
    });
  });

  const candidates = [];
  byRole.forEach((items) => {
    const inactive = items
      .filter((item) => !item.active)
      .sort((a, b) => b.time - a.time);
    inactive.forEach((item, index) => {
      const tooOld = item.time > 0 && item.time < cutoffMs;
      const overLimit = index >= policy.maxFilesPerRole;
      if (options.force || tooOld || overLimit) {
        candidates.push(item);
      }
    });
  });

  const deleted = [];
  const errors = [];
  for (const item of candidates.slice(0, policy.batchSize)) {
    try {
      const result = await window.cossAPI.deleteProjectFile({
        projectPath: project.path,
        filePath: item.filePath
      });
      if (result?.ok) {
        deleted.push(item.filePath);
        delete item.message.agentPoolPaths[item.roleId];
        if (Object.keys(item.message.agentPoolPaths || {}).length === 0) {
          item.message.agentPoolStatus = "cleaned";
        }
      } else {
        errors.push({ path: item.filePath, error: result?.error || "delete-failed" });
      }
    } catch (error) {
      errors.push({ path: item.filePath, error: error.message });
    }
  }

  if (deleted.length > 0) {
    await saveState();
  }
  recordAppLog("agent.pool.cleanup.completed", {
    projectId: project.id,
    deletedCount: deleted.length,
    skippedActiveCount: Array.from(byRole.values()).flat().filter((item) => item.active).length,
    remainingCandidates: Math.max(0, candidates.length - deleted.length),
    errors
  }, errors.length ? "warn" : "info");
  return { ok: errors.length === 0, deletedCount: deleted.length, deleted, errors };
}

function ensureAgentEventShape(event) {
  const roleId = getRole(event.roleId || event.fromRoleId).id;
  const fromRoleId = getRole(event.fromRoleId || roleId).id;
  return {
    id: event.id || uid("agent-event"),
    type: String(event.type || "status").trim().slice(0, 40) || "status",
    structured: Boolean(event.structured),
    windowId: event.windowId || "",
    roleId,
    fromRoleId,
    toRoleIds: uniqueRoleIds(event.toRoleIds || []).filter((item) => item !== fromRoleId),
    provider: String(event.provider || "").trim(),
    sessionId: String(event.sessionId || "").trim(),
    taskId: event.taskId || "",
    subtaskId: event.subtaskId || "",
    status: normalizeAgentEventStatus(event.status) || String(event.status || "").trim(),
    toolName: String(event.toolName || "").trim().slice(0, 80),
    message: String(event.message || "").trim().slice(0, 500),
    receivedAt: event.receivedAt || new Date().toISOString()
  };
}

function normalizeDeliveryStatus(value) {
  return ["pending", "sent", "submitted", "responded", "waiting", "completed", "failed", "canceled"].includes(value) ? value : "pending";
}

function ensureAgentDeliveryShape(delivery) {
  return {
    id: delivery.id || uid("delivery"),
    messageId: delivery.messageId || "",
    windowId: delivery.windowId || "",
    roleId: getRole(delivery.roleId).id,
    taskId: delivery.taskId || "",
    subtaskId: delivery.subtaskId || "",
    status: normalizeDeliveryStatus(delivery.status),
    attempts: Number.isFinite(Number(delivery.attempts)) ? Number(delivery.attempts) : 0,
    createdAt: delivery.createdAt || new Date().toISOString(),
    updatedAt: delivery.updatedAt || delivery.createdAt || new Date().toISOString(),
    sentAt: delivery.sentAt || "",
    submittedAt: delivery.submittedAt || delivery.sentAt || "",
    respondedAt: delivery.respondedAt || "",
    completedAt: delivery.completedAt || "",
    completionStatus: String(delivery.completionStatus || "").slice(0, 40),
    waitingAt: delivery.waitingAt || "",
    canceledAt: delivery.canceledAt || "",
    submissionProvider: delivery.submissionProvider ? normalizeAgentProvider(delivery.submissionProvider) : "",
    submissionMethod: String(delivery.submissionMethod || "").slice(0, 80),
    submissionDetail: String(delivery.submissionDetail || "").slice(0, 240),
    permissionMode: normalizeAgentPermissionMode(delivery.permissionMode || state.settings?.agentPermissionMode),
    permissionLabel: String(delivery.permissionLabel || getAgentPermissionPolicy(delivery.permissionMode || state.settings?.agentPermissionMode).label).slice(0, 80),
    responseWatchStartedAt: delivery.responseWatchStartedAt || "",
    stuckCheckAt: delivery.stuckCheckAt || "",
    stuckDetectedAt: delivery.stuckDetectedAt || "",
    lastFeedback: String(delivery.lastFeedback || "").slice(0, 160),
    lastError: String(delivery.lastError || "").slice(0, 300),
    autoWorkflow: Boolean(delivery.autoWorkflow),
    autoWorkflowSourceEventId: String(delivery.autoWorkflowSourceEventId || ""),
    deliveryFilePath: String(delivery.deliveryFilePath || ""),
    deliveryFileAbsolutePath: String(delivery.deliveryFileAbsolutePath || "")
  };
}

function ensureTerminalOutputRefShape(ref) {
  return {
    id: ref.id || uid("termref"),
    messageId: ref.messageId || "",
    deliveryId: ref.deliveryId || "",
    windowId: ref.windowId || "",
    roleId: getRole(ref.roleId).id,
    taskId: ref.taskId || "",
    excerpt: String(ref.excerpt || "").slice(0, 1200),
    createdAt: ref.createdAt || new Date().toISOString(),
    updatedAt: ref.updatedAt || ref.createdAt || new Date().toISOString()
  };
}

function ensureCommandApprovalGrantShape(grant) {
  const ruleIds = uniqueStrings(grant.ruleIds || []).sort();
  return {
    id: grant.id || uid("cmdgrant"),
    scope: grant.scope || "app-session",
    appSessionId: grant.appSessionId || appSessionId,
    roleId: getRole(grant.roleId).id,
    ruleIds,
    riskLabel: String(grant.riskLabel || "").slice(0, 80),
    severity: grant.severity || "medium",
    sampleCommand: String(grant.sampleCommand || "").slice(0, 500),
    useCount: Number.isFinite(Number(grant.useCount)) ? Number(grant.useCount) : 0,
    createdAt: grant.createdAt || new Date().toISOString(),
    lastUsedAt: grant.lastUsedAt || grant.createdAt || new Date().toISOString()
  };
}

function ensureBrowserWindowShape(win) {
  if (!Array.isArray(win.browserTabs) || win.browserTabs.length === 0) {
    win.browserTabs = [{
      id: uid("tab"),
      url: DEFAULT_BROWSER_URL,
      title: DEFAULT_BROWSER_URL,
      status: "ready",
      createdAt: new Date().toISOString()
    }];
  }
  win.browserTabs = win.browserTabs.map((tab, index) => ({
    id: tab.id || uid("tab"),
    url: normalizeBrowserUrl(tab.url || DEFAULT_BROWSER_URL),
    title: tab.title || "",
    favicon: tab.favicon || getBrowserFaviconUrl(tab.url || DEFAULT_BROWSER_URL),
    status: tab.status || "ready",
    createdAt: tab.createdAt || new Date().toISOString()
  })).slice(0, 8);
  if (!win.browserTabs.some((tab) => tab.id === win.activeBrowserTabId)) {
    win.activeBrowserTabId = win.browserTabs[0].id;
  }
  const activeTab = getActiveBrowserTab(win);
  win.browserUrl = activeTab?.url || DEFAULT_BROWSER_URL;
  win.browserStatus ||= activeTab?.status || "ready";
  win.browserTitle ||= activeTab?.title || "";
  win.browserBookmarks = uniqueStrings(win.browserBookmarks || []).slice(-40);
  win.browserHistory = (Array.isArray(win.browserHistory) ? win.browserHistory : [])
    .map((item) => ({
      url: normalizeBrowserUrl(item.url || item),
      title: String(item.title || "").slice(0, 120),
      visitedAt: item.visitedAt || new Date().toISOString()
    }))
    .filter((item) => item.url)
    .slice(-80);
  return win;
}

function ensureProjectShape(project) {
  project.windows ||= [];
  project.tasks ||= [];
  project.messages ||= [];
  project.commandLogs ||= [];
  project.commandApprovalGrants ||= [];
  project.agentEvents ||= [];
  project.agentDeliveries ||= [];
  project.terminalOutputRefs ||= [];
  project.tasks.forEach(ensureTaskShape);
  ensureProjectMemoryShape(project);
  ensureProjectDesktops(project);
  syncConversationTaskIds(project);
  project.messages = project.messages
    .map(ensureMessageShape)
    .filter((message) => message.content && message.toRoleIds.length > 0);
  project.agentEvents = project.agentEvents
    .map(ensureAgentEventShape)
    .filter((event) => event.message || event.status || event.sessionId)
    .slice(-240);
  const messageIds = new Set(project.messages.map((message) => message.id));
  project.agentDeliveries = project.agentDeliveries
    .map(ensureAgentDeliveryShape)
    .filter((delivery) => messageIds.has(delivery.messageId))
    .slice(-300);
  project.terminalOutputRefs = project.terminalOutputRefs
    .map(ensureTerminalOutputRefShape)
    .filter((ref) => messageIds.has(ref.messageId))
    .slice(-300);
  project.commandApprovalGrants = project.commandApprovalGrants
    .map(ensureCommandApprovalGrantShape)
    .filter((grant) => grant.scope === "app-session" && grant.appSessionId === appSessionId && grant.ruleIds.length > 0)
    .slice(-80);
  project.windows.forEach((win) => {
    win.desktopId ||= getActiveDesktopId(project);
    win.minimized = Boolean(win.minimized);
    win.maximized = Boolean(win.maximized);
    win.restoreBounds ||= null;
  });
  project.windows.forEach((win) => {
    if (win.type !== "terminal") {
      return;
    }

    if (win.terminalMode === "claude" || win.terminalMode === "codex" || win.terminalMode === "codebuddy") {
      win.agentProvider ||= win.terminalMode;
      win.terminalMode = "agent";
    }
    if (win.terminalMode === "agent") {
      win.agentProvider = normalizeAgentProvider(win.agentProvider);
      win.agentSession = ensureAgentSessionShape(win, project);
    }
  });
  project.windows.forEach((win) => {
    if (win.type === "browser") {
      ensureBrowserWindowShape(win);
    }
    if (win.type === "file") {
      win.filePath ||= "";
      win.fileDraft ||= "";
      win.fileLoaded = Boolean(win.fileLoaded);
      win.fileDirty = Boolean(win.fileDirty);
      win.fileStatus ||= "";
      win.fileError ||= "";
      win.fileList ||= [];
      win.fileListLoaded = Boolean(win.fileListLoaded);
    }
  });
  return project;
}

function ensureStateShape(nextState) {
  nextState.deletedProjectIds = uniqueStrings(nextState.deletedProjectIds || []);
  nextState.settings ||= {};
  nextState.settings.agentProvider = normalizeAgentProvider(nextState.settings.agentProvider);
  nextState.settings.agentFallbackToShell = nextState.settings.agentFallbackToShell !== false;
  nextState.settings.agentPermissionMode = normalizeAgentPermissionMode(nextState.settings.agentPermissionMode);
  nextState.settings.agentAutoWorkflowEnabled = true;
  nextState.settings.agentAutoWorkflowPaused = nextState.settings.agentAutoWorkflowPaused === true;
  nextState.settings.agentMcpAutoConfigEnabled = nextState.settings.agentMcpAutoConfigEnabled === true;
  if (!nextState.settings.agentAutoWorkflowEnabled) {
    nextState.settings.agentAutoWorkflowPaused = false;
  }
  nextState.settings.codeBuddyApiKey ||= "";
  nextState.settings.agentPromptTemplate = ensureAgentPromptMcpInstructions(
    ensureAgentPromptPermissionPlaceholders(nextState.settings.agentPromptTemplate || defaultState.settings.agentPromptTemplate)
  );
  ensureModelSettings(nextState.settings);
  (nextState.projects || []).forEach(ensureProjectShape);
  return nextState;
}

function getProjectCommandLogs(project = getProject()) {
  if (!project) {
    return [];
  }

  return ensureProjectShape(project).commandLogs;
}

function getProjectCommandApprovalGrants(project = getProject()) {
  if (!project) {
    return [];
  }

  return ensureProjectShape(project).commandApprovalGrants;
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function assessCommandRisk(command) {
  const trimmed = command.trim();
  if (!trimmed) {
    return {
      requiresApproval: false,
      severity: "low",
      label: "空命令",
      description: "未输入可执行命令。"
    };
  }

  const matches = COMMAND_RISK_RULES.filter((rule) => rule.pattern.test(trimmed));
  if (matches.length === 0) {
    return {
      requiresApproval: false,
      severity: "low",
      label: "普通命令",
      description: "未命中当前高风险规则。"
    };
  }

  const highRisk = matches.find((rule) => rule.severity === "high");
  const primary = highRisk || matches[0];
  return {
    requiresApproval: true,
    severity: primary.severity,
    label: primary.label,
    description: primary.description,
    ruleIds: matches.map((rule) => rule.id),
    matchedLabels: matches.map((rule) => rule.label)
  };
}

function createCommandLog(win, command, assessment, status, extra = {}) {
  const project = getProject();
  if (!project) {
    return null;
  }

  const role = getRole(win.roleId);
  const log = {
    id: uid("cmdlog"),
    type: "terminal-command",
    windowId: win.id,
    roleId: role.id,
    roleName: role.name,
    command,
    severity: assessment.severity,
    riskLabel: assessment.label,
    riskDescription: assessment.description,
    status,
    grantId: extra.grantId || "",
    grantScope: extra.grantScope || "",
    createdAt: new Date().toISOString()
  };
  const logs = getProjectCommandLogs(project);
  logs.unshift(log);
  if (logs.length > 200) {
    logs.length = 200;
  }
  recordAppLog("command.logged", {
    projectId: project.id,
    windowId: win.id,
    roleId: role.id,
    roleName: role.name,
    command,
    severity: assessment.severity,
    riskLabel: assessment.label,
    status,
    grantId: log.grantId,
    grantScope: log.grantScope,
    requiresApproval: Boolean(assessment.requiresApproval),
    ruleIds: assessment.ruleIds || []
  }, assessment.requiresApproval ? "warn" : "info");
  saveState();
  return log;
}

function updateCommandLog(logId, status, patch = {}) {
  const project = getProject();
  const log = project?.commandLogs?.find((item) => item.id === logId);
  if (!log) {
    return;
  }

  log.status = status;
  Object.assign(log, patch);
  log.resolvedAt = new Date().toISOString();
  recordAppLog("command.status.changed", {
    projectId: project.id,
    logId,
    windowId: log.windowId,
    roleId: log.roleId,
    status,
    grantId: log.grantId || "",
    grantScope: log.grantScope || ""
  });
  saveState();
}

function getCommandGrantKey(roleId, assessment) {
  return `${getRole(roleId).id}:${uniqueStrings(assessment.ruleIds || []).sort().join("+")}`;
}

function findCommandApprovalGrant(win, assessment) {
  const grants = getProjectCommandApprovalGrants();
  const key = getCommandGrantKey(win.roleId, assessment);
  return grants.find((grant) => `${grant.roleId}:${grant.ruleIds.join("+")}` === key) || null;
}

function createCommandApprovalGrant(win, assessment, command) {
  const project = getProject();
  if (!project) {
    return null;
  }

  const grants = getProjectCommandApprovalGrants(project);
  const role = getRole(win.roleId);
  const key = getCommandGrantKey(role.id, assessment);
  const existing = grants.find((grant) => `${grant.roleId}:${grant.ruleIds.join("+")}` === key);
  if (existing) {
    existing.lastUsedAt = new Date().toISOString();
    existing.useCount += 1;
    return existing;
  }

  const grant = ensureCommandApprovalGrantShape({
    id: uid("cmdgrant"),
    roleId: role.id,
    ruleIds: assessment.ruleIds || [],
    riskLabel: assessment.label,
    severity: assessment.severity,
    sampleCommand: command,
    useCount: 1,
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString()
  });
  grants.unshift(grant);
  if (grants.length > 80) {
    grants.length = 80;
  }
  recordAppLog("command.approval-grant.created", {
    projectId: project.id,
    windowId: win.id,
    roleId: role.id,
    grantId: grant.id,
    ruleIds: grant.ruleIds,
    riskLabel: grant.riskLabel,
    scope: grant.scope
  }, "warn");
  saveState();
  return grant;
}

function markCommandApprovalGrantUsed(grant, win, assessment, command) {
  if (!grant) {
    return;
  }

  grant.lastUsedAt = new Date().toISOString();
  grant.useCount = Number(grant.useCount || 0) + 1;
  recordAppLog("command.approval-grant.used", {
    projectId: state.activeProjectId,
    windowId: win.id,
    roleId: getRole(win.roleId).id,
    grantId: grant.id,
    command,
    ruleIds: assessment.ruleIds || []
  }, "warn");
  saveState();
}

function getProgramLabel(programType) {
  return PROGRAMS[programType]?.label || "程序";
}

function normalizeZIndex(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return WINDOW_Z_BASE;
  }
  return Math.max(1, Math.min(parsed, WINDOW_Z_MAX));
}

function rebuildWindowStack(project, frontWindowId = null) {
  const windows = project?.windows || [];
  if (windows.length === 0) {
    zSeed = WINDOW_Z_BASE;
    return;
  }

  const ordered = [...windows].sort((a, b) => normalizeZIndex(a.z) - normalizeZIndex(b.z));
  const frontWindow = frontWindowId ? ordered.find((win) => win.id === frontWindowId) : null;
  const stack = frontWindow
    ? [...ordered.filter((win) => win.id !== frontWindowId), frontWindow]
    : ordered;

  stack.forEach((win, index) => {
    win.z = WINDOW_Z_BASE + index + 1;
  });
  zSeed = WINDOW_Z_BASE + stack.length;
}

function normalizeStoredWindowStacks(nextState) {
  ensureStateShape(nextState);
  (nextState.projects || []).forEach((project) => {
    rebuildWindowStack(project);
  });
  const allZ = (nextState.projects || []).flatMap((project) => project.windows || []).map((win) => normalizeZIndex(win.z));
  zSeed = Math.max(WINDOW_Z_BASE, ...allZ);
}

function reconcileAgentWorkflowAfterStateRefresh(previousState, nextState, reason = "external") {
  if (nextState?.settings?.agentAutoWorkflowEnabled !== true || nextState.settings.agentAutoWorkflowPaused === true) {
    return;
  }

  const previousProjects = new Map((previousState?.projects || []).map((project) => [project.id, project]));
  let releasedCount = 0;
  let scheduledCount = 0;

  (nextState.projects || []).forEach((project) => {
    const previousProject = previousProjects.get(project.id);
    const previousMessageIds = new Set((previousProject?.messages || []).map((message) => message.id));
    const previousEventIds = new Set((previousProject?.agentEvents || []).map((event) => event.id));

    (project.agentEvents || []).forEach((event) => {
      if (previousEventIds.has(event.id)) {
        return;
      }
      const status = normalizeAgentEventStatus(event.status);
      if (status !== "done") {
        return;
      }
      const roleId = getRole(event.roleId || event.fromRoleId).id;
      const windows = (project.windows || []).filter((win) => (
        win.type === "terminal"
        && normalizeTerminalMode(win.terminalMode) === "agent"
        && win.roleId === roleId
        && (!event.taskId || win.agentSession?.taskId === event.taskId || getTaskContextForWindow(win, project).taskId === event.taskId)
      ));
      windows.forEach((win) => {
        const activeDelivery = getActiveAgentDeliveryForWindow(project, win.id);
        if (!activeDelivery || (event.taskId && activeDelivery.taskId && activeDelivery.taskId !== event.taskId)) {
          return;
        }
        activeDelivery.status = "completed";
        activeDelivery.completedAt = event.receivedAt || new Date().toISOString();
        activeDelivery.completionStatus = status;
        activeDelivery.respondedAt ||= activeDelivery.completedAt;
        activeDelivery.stuckDetectedAt = "";
        activeDelivery.lastFeedback = `Completed from external ${event.type || "agent"} event.`;
        if (win.lastAgentDeliveryId === activeDelivery.id) {
          win.lastAgentDeliveryId = "";
          win.lastInjectedMessageId = "";
        }
        releasedCount += 1;
        scheduleAgentDeliveryQueueDrain(win.id, 350);
      });
    });

    (project.messages || []).forEach((message) => {
      if (previousMessageIds.has(message.id)) {
        return;
      }
      if (!["orchestrator-dispatch"].includes(message.source || "")) {
        return;
      }
      if (!message.toRoleIds?.length || message.autoWorkflowStatus) {
        return;
      }
      message.autoWorkflow = true;
      message.autoWorkflowStatus = "external-queued";
      scheduledCount += 1;
      setTimeout(() => scheduleAgentAutoWorkflow(message.id, `external:${reason}`), 0);
    });
  });

  if (releasedCount > 0 || scheduledCount > 0) {
    recordAppLog("agent.workflow.external-reconciled", {
      reason,
      releasedCount,
      scheduledCount
    });
    saveState();
  }
}

async function refreshStateStorageStamp() {
  if (!window.cossAPI?.getStateMeta) {
    return "";
  }
  try {
    const meta = await window.cossAPI.getStateMeta();
    stateStorageStamp = meta?.stamp || "";
    return stateStorageStamp;
  } catch {
    return stateStorageStamp;
  }
}

async function refreshStateFromExternalStorage(reason = "external") {
  if (!window.cossAPI?.loadState || saveStateInFlight || saveStateDirty) {
    return false;
  }
  const previousState = state;
  const loaded = await window.cossAPI.loadState();
  if (!loaded?.projects?.length) {
    return false;
  }
  normalizeStoredWindowStacks(loaded);
  state = loaded;
  await refreshStateStorageStamp();
  reconcileAgentWorkflowAfterStateRefresh(previousState, state, reason);
  await repairAllReadyKernelDispatches(`external:${reason}`);
  recordAppLog("state.external-refreshed", {
    reason,
    projects: Array.isArray(state.projects) ? state.projects.length : 0
  });
  render();
  setTimeout(() => resumePendingKernelAutoWorkflowMessages(`external:${reason}`), 350);
  return true;
}

function startExternalStateRefresh() {
  if (externalStateRefreshTimer || !window.cossAPI?.getStateMeta || !window.cossAPI?.loadState) {
    return;
  }
  externalStateRefreshTimer = setInterval(async () => {
    try {
      const meta = await window.cossAPI.getStateMeta();
      const nextStamp = meta?.stamp || "";
      if (nextStamp && stateStorageStamp && nextStamp !== stateStorageStamp) {
        if (saveStateInFlight || saveStateDirty) {
          pendingExternalStateRefreshReason ||= "storage-stamp-changed-during-save";
          return;
        }
        await refreshStateFromExternalStorage("storage-stamp-changed");
      } else if (nextStamp && !stateStorageStamp) {
        stateStorageStamp = nextStamp;
        if (!saveStateInFlight && !saveStateDirty) {
          await refreshStateFromExternalStorage("storage-stamp-initialized");
        }
      }
    } catch {
      // External refresh is best-effort. Normal UI interaction should continue.
    }
  }, 1500);
}

async function saveState() {
  saveStateDirty = true;
  if (saveStateInFlight) {
    return saveStatePromise;
  }

  saveStateInFlight = true;
  saveStatePromise = (async () => {
    while (saveStateDirty) {
      saveStateDirty = false;
      const snapshot = structuredClone(state);
      if (window.cossAPI?.saveState) {
        await window.cossAPI.saveState(snapshot);
        await refreshStateStorageStamp();
      } else {
        localStorage.setItem("coss-state", JSON.stringify(snapshot));
      }
    }
  })()
    .catch((error) => {
      console.warn("Failed to save CosS state", error);
    })
    .finally(() => {
      saveStateInFlight = false;
      if (saveStateDirty) {
        saveState();
      } else if (pendingExternalStateRefreshReason) {
        const reason = pendingExternalStateRefreshReason;
        pendingExternalStateRefreshReason = "";
        setTimeout(() => {
          refreshStateFromExternalStorage(reason).catch((error) => {
            recordAppLog("state.external-refresh-after-save.error", {
              reason,
              error: error.message
            }, "error");
          });
        }, 0);
      }
    });

  return saveStatePromise;
}

function recordAppLog(eventName, payload = {}, level = "info") {
  window.cossAPI?.logEvent?.(eventName, payload, level).catch(() => {});
}

async function loadState() {
  const stored = window.cossAPI?.loadState
    ? await window.cossAPI.loadState()
    : JSON.parse(localStorage.getItem("coss-state") || "null");

  if (stored?.projects?.length) {
    normalizeStoredWindowStacks(stored);
    state = stored;
    await refreshStateStorageStamp();
    await repairAllReadyKernelDispatches("state-load");
    return;
  }

  const demo = createProjectState("AI 协作工作台", "D:\\CosS");
  demo.windows = [
    createWindowState("terminal", "frontend-engineer", 310, 96, { terminalMode: "shell" }),
    createWindowState("browser", "qa-engineer", 795, 126)
  ];
  demo.messages = [
    createMessage("frontend-engineer", ["backend-engineer", "qa-engineer"], "前端页面等待接口字段确认。")
  ];
  state = {
    activeProjectId: demo.id,
    projects: [demo],
    deletedProjectIds: [],
    settings: { ...defaultState.settings }
  };
  await saveState();
  await refreshStateStorageStamp();
}

function createProjectState(name, projectPath) {
  const id = uid("project");
  const createdAt = new Date().toISOString();
  const defaultDesktop = createDesktopState("主对话", {
    id: DEFAULT_DESKTOP_ID,
    createdAt
  });
  return {
    id,
    name,
    path: projectPath || "D:\\CosS",
    createdAt,
    lastOpenedAt: createdAt,
    status: "online",
    desktops: [defaultDesktop],
    activeDesktopId: defaultDesktop.id,
    windows: [],
    tasks: [],
    messages: [],
    commandLogs: [],
    commandApprovalGrants: [],
    agentEvents: [],
    agentDeliveries: [],
    terminalOutputRefs: [],
    memory: createEmptyProjectMemory(true)
  };
}

function createWindowState(type, roleId, x = 260, y = 108, options = {}) {
  const role = getRole(roleId);
  const terminalMode = normalizeTerminalMode(options.terminalMode);
  const agentProvider = normalizeAgentProvider(options.agentProvider || state.settings?.agentProvider);
  const terminalLabel = {
    agent: `Agent(${getAgentProviderLabel(agentProvider)})`,
    shell: "PowerShell"
  }[terminalMode];
  const title = options.title || (type === "terminal"
      ? `${role.name} ${terminalLabel}`
      : `${role.name}${getProgramLabel(type)}`);
  const sizes = {
    terminal: [500, 338],
    browser: [640, 420],
    file: [560, 390],
    task: [500, 360],
    "task-list": [820, 500]
  };
  const [width, height] = sizes[type] || [440, 300];

  const win = {
    id: uid("window"),
    type,
    roleId,
    title,
    x,
    y,
    width,
    height,
    z: ++zSeed,
    status: "idle",
    terminalMode: type === "terminal" ? terminalMode : undefined,
    agentProvider: type === "terminal" && terminalMode === "agent" ? agentProvider : undefined,
    minimized: false,
    maximized: false,
    restoreBounds: null,
    desktopId: options.desktopId || getActiveDesktopId(getProject())
  };
  if (type === "browser") {
    win.browserUrl = options.browserUrl || DEFAULT_BROWSER_URL;
    win.browserStatus = "ready";
    win.browserTitle = "";
    win.browserTabs = [{
      id: uid("tab"),
      url: normalizeBrowserUrl(win.browserUrl),
      title: "",
      favicon: getBrowserFaviconUrl(win.browserUrl),
      status: "ready",
      createdAt: new Date().toISOString()
    }];
    win.activeBrowserTabId = win.browserTabs[0].id;
    win.browserBookmarks = [];
    win.browserHistory = [];
  }
  if (type === "file") {
    win.filePath = options.filePath || "";
    win.fileDraft = "";
    win.fileLoaded = false;
    win.fileDirty = false;
    win.fileStatus = "";
    win.fileError = "";
    win.fileList = [];
    win.fileListLoaded = false;
  }
  if (type === "terminal" && terminalMode === "agent") {
    win.agentSession = ensureAgentSessionShape(win, getProject());
  }
  return win;
}

function normalizeTerminalMode(value) {
  return ["agent", "shell"].includes(value) ? value : ["claude", "codex", "codebuddy"].includes(value) ? "agent" : "shell";
}

function normalizeAgentProvider(value) {
  return ["claude", "codex", "codebuddy"].includes(value) ? value : "claude";
}

function normalizeAgentPermissionMode(value) {
  return Object.prototype.hasOwnProperty.call(AGENT_PERMISSION_POLICIES, value) ? value : "confirm";
}

function getAgentPermissionPolicy(value = state.settings.agentPermissionMode) {
  return AGENT_PERMISSION_POLICIES[normalizeAgentPermissionMode(value)] || AGENT_PERMISSION_POLICIES.confirm;
}

function ensureAgentPromptPermissionPlaceholders(template) {
  const source = String(template || defaultState.settings.agentPromptTemplate);
  if (source.includes("{{agentPermissionInstructions}}")) {
    return source;
  }
  return `${source.trim()}\n\nAgent 权限模式：{{agentPermissionLabel}}\n{{agentPermissionInstructions}}`;
}

function ensureAgentPromptMcpInstructions(template) {
  const source = String(template || defaultState.settings.agentPromptTemplate)
    .replace(/\n*当系统提示 `mcp__coss: Still connecting; call WaitForMcpServers to wait for it` 时，必须先调用 WaitForMcpServers 等待 mcp__coss 连接完成。/g, "")
    .replace(/\n*If the agent runtime says `mcp__coss: Still connecting; call WaitForMcpServers to wait for it`, call WaitForMcpServers first and wait for mcp__coss to become ready\./g, "")
    .trim();
  const waitInstructions =
    "\n\n当系统提示 `mcp__coss: Still connecting` 时，请等待几秒后重新搜索或直接重试 coss 工具；只有当前 Agent 后端明确提供等待工具时才调用该工具。" +
    "\n不要因为 ToolSearch 暂时找不到 coss_get_context、coss_list_roles 或 coss_pool_read 就停止工作；至少等待并重试 3 次。无法继续时输出 COSS_AGENT_STATUS:running 并说明原因，完成时输出 COSS_AGENT_STATUS:done。";
  if (source.includes("mcp__coss: Still connecting") && source.includes("至少等待并重试 3 次")) {
    return source;
  }
  if (source.includes("COSS_MCP_SERVER")) {
    return `${source}${waitInstructions}`;
  }
  return `${source}\n\nCosS MCP is available for reliable automation. Prefer MCP tools over terminal paste when possible.\n` +
    "MCP command is stored in COSS_MCP_SERVER. Current context is stored in COSS_MCP_USER_DATA, COSS_MCP_PROJECT_ID, COSS_MCP_ROLE_ID, COSS_MCP_TASK_ID, and COSS_MCP_SESSION_ID.\n" +
    "CosS v0.10 uses a central linear workflow Kernel. Use coss_get_context, coss_get_task_board, coss_list_roles, coss_pool_read, coss_pool_claim, coss_claim_step, coss_heartbeat_step, coss_get_kernel_events, and coss_submit_result. Do not directly dispatch other Agents. Complete only your assigned step; the Kernel will start the next preplanned step after your result is done. Agent states are idle, running, and done only." +
    waitInstructions;
}

function getAgentProviderLabel(provider) {
  return {
    claude: "Claude Code",
    codex: "Codex",
    codebuddy: "CodeBuddy Code"
  }[normalizeAgentProvider(provider)] || "Claude Code";
}

function findTaskForDesktop(project, desktopId) {
  return getConversationTasks(project, desktopId)[0] || null;
}

function findSubtaskForRole(task, roleId) {
  return task?.subtasks?.find((subtask) => subtask.roleId === roleId) || null;
}

function getTaskContextForWindow(win, project = getProject()) {
  const task = findTaskForDesktop(project, win.desktopId);
  const subtask = findSubtaskForRole(task, win.roleId);
  const projectMemory = ensureProjectMemoryShape(project);
  const memoryText = projectMemory.enabled === false ? "" : formatProjectMemoryForPrompt(projectMemory);
  return {
    taskId: task?.id || "",
    taskTitle: task?.title || "",
    taskGoal: task?.goal || "",
    subtaskId: subtask?.id || "",
    subtaskTitle: subtask?.title || "",
    subtaskDescription: subtask?.description || "",
    subtaskStatus: subtask?.status || "",
    projectMemoryEnabled: projectMemory.enabled !== false,
    projectMemorySummary: memoryText,
    projectMemoryUpdatedAt: projectMemory.updatedAt || ""
  };
}

function ensureAgentSessionShape(win, project = getProject()) {
  const role = getRole(win.roleId);
  const taskContext = getTaskContextForWindow(win, project);
  const provider = normalizeAgentProvider(win.agentProvider || state.settings?.agentProvider);
  const createdAt = win.agentSession?.createdAt || new Date().toISOString();
  return {
    sessionId: win.agentSession?.sessionId || uid("agent-session"),
    provider,
    roleId: role.id,
    roleName: role.name,
    workspace: project?.path || "D:\\CosS",
    projectId: project?.id || "",
    projectName: project?.name || "",
    taskId: taskContext.taskId,
    subtaskId: taskContext.subtaskId,
    sessionName: win.agentSession?.sessionName || `CosS-${project?.name || "Project"}-${role.name}-${provider}`,
    promptTemplateVersion: "v0.10.0",
    createdAt,
    lastStartedAt: win.agentSession?.lastStartedAt || "",
    resumeCount: Number.isFinite(Number(win.agentSession?.resumeCount)) ? Number(win.agentSession.resumeCount) : 0,
    lastActiveMode: win.agentSession?.lastActiveMode || "",
    lastEventAt: win.agentSession?.lastEventAt || ""
  };
}

function normalizeBrowserUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return DEFAULT_BROWSER_URL;
  }
  if (/^(about:|data:|file:|https?:)/i.test(raw)) {
    return raw;
  }
  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(raw)) {
    return `http://${raw}`;
  }
  return `https://${raw}`;
}

function getBrowserFaviconUrl(value) {
  try {
    const url = new URL(normalizeBrowserUrl(value));
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `${url.origin}/favicon.ico`;
    }
  } catch {
    return "";
  }
  return "";
}

function getActiveBrowserTab(win) {
  return win?.browserTabs?.find((tab) => tab.id === win.activeBrowserTabId) || win?.browserTabs?.[0] || null;
}

function setActiveBrowserTabState(win, patch) {
  const tab = getActiveBrowserTab(win);
  if (!tab) {
    return null;
  }
  Object.assign(tab, patch);
  if (patch.url && !patch.favicon) {
    tab.favicon = getBrowserFaviconUrl(patch.url);
  }
  win.browserUrl = tab.url;
  win.browserTitle = tab.title || win.browserTitle || "";
  win.browserStatus = tab.status || win.browserStatus || "ready";
  return tab;
}

function pushBrowserHistory(win, url, title = "") {
  const normalizedUrl = normalizeBrowserUrl(url);
  if (!normalizedUrl || normalizedUrl === "about:blank") {
    return;
  }
  win.browserHistory ||= [];
  const last = win.browserHistory[win.browserHistory.length - 1];
  if (last?.url !== normalizedUrl) {
    win.browserHistory.push({
      url: normalizedUrl,
      title: title || normalizedUrl,
      visitedAt: new Date().toISOString()
    });
  } else {
    last.title = title || last.title;
    last.visitedAt = new Date().toISOString();
  }
  win.browserHistory = win.browserHistory.slice(-80);
}

function extractFirstUrl(value) {
  const match = String(value || "").match(/https?:\/\/[^\s"'<>]+/i);
  return match ? match[0].replace(/[),.;]+$/, "") : "";
}

function createMessage(fromRoleId, toRoleIds, content, taskId = null, options = {}) {
  return ensureMessageShape({
    id: uid("msg"),
    fromRoleId,
    toRoleIds,
    content,
    taskId,
    channelType: options.channelType,
    channelId: options.channelId,
    source: options.source,
    status: options.status,
    readBy: options.readBy,
    subtaskRefs: options.subtaskRefs,
    createdAt: options.createdAt || new Date().toISOString()
  });
}

function buildOrchestratorDispatchContent(task, step) {
  const role = getRole(step.roleId);
  const memoryText = formatProjectMemoryForPrompt(task.projectMemorySnapshot || {});
  const memoryLines = memoryText
    ? ["", "Project memory for this task:", memoryText]
    : [];
  const lines = [
    `CosS Kernel 调度任务板：${task.title || task.goal}`,
    `任务ID：${task.id}`,
    `步骤ID：${step.id}`,
    `目标角色：${role.name} (${role.id})`,
    `步骤标题：${step.title}`,
    `步骤说明：${step.description}`,
    "",
    "中央线性调度规则：",
    "1. 不要直接把任务分配给其他 Agent，不要自行创建不存在的角色。",
    "2. 只能使用 coss_get_task_board、coss_pool_claim、coss_claim_step、coss_heartbeat_step、coss_get_kernel_events、coss_submit_result、coss_acquire_lock、coss_release_lock、coss_request_approval 等 CosS MCP 工具回写结果。",
    "3. 只处理当前 Step；完成后调用 coss_submit_result({ status: \"done\" })，Kernel 会自动启动预先规划好的下一步。",
    "4. 高风险动作、发出邮件、删除文件、支付、系统设置修改等必须走 coss_request_approval 或等待用户确认。",
    "5. 输出必须结构化；不要只在终端自然语言回复。",
    "",
    `允许能力：${step.allowedCapabilities.join(", ") || "none"}`
  ];
  return lines.concat(memoryLines).join("\n");
}

function createOrchestratorDispatchMessage(task, step) {
  const orchestrator = task?.orchestrator || ensureTaskOrchestrator(task);
  const message = createMessage(
    getOrchestratorSenderRoleId(step.roleId),
    [step.roleId],
    buildOrchestratorDispatchContent(task, step),
    task.id,
    {
      source: "orchestrator-dispatch",
      channelType: "task",
      subtaskRefs: { [step.roleId]: step.subtaskId }
    }
  );
  step.assignedMessageId = message.id;
  step.status = "idle";
  step.phase = "idle";
  step.lease = null;
  step.updatedAt = message.createdAt;
  if (orchestrator?.sharedState) {
    orchestrator.sharedState.currentStep = step.id;
  }
  const subtask = task?.subtasks?.find((item) => item.id === step.subtaskId);
  if (subtask) {
    subtask.assignedMessageId = message.id;
    subtask.updatedAt = message.createdAt;
  }
  return message;
}

function isKernelStepReadyForRendererDispatch(task, step) {
  if (!task || !step || getTaskKernelProjection(task).status === "done" || step.assignedMessageId || normalizeKernelPhase(step.phase, step.status) !== "idle") {
    return false;
  }
  const subtask = (task.subtasks || []).find((item) => item.id === step.subtaskId);
  if (subtask && normalizeSubtaskStatus(subtask.status) === "done") {
    return false;
  }
  const orchestrator = ensureTaskOrchestrator(task);
  return uniqueStrings(step.dependsOn || []).every((dependencyId) => {
    const dependency = (orchestrator.steps || []).find((item) => item.id === dependencyId || item.subtaskId === dependencyId);
    return dependency && normalizeKernelPhase(dependency.phase, dependency.status) === "done";
  });
}

async function repairReadyKernelDispatches(project, reason = "kernel-dispatch-repair") {
  if (!project) {
    return [];
  }

  const createdMessages = [];
  (project.tasks || []).forEach((task) => {
    const orchestrator = ensureTaskOrchestrator(task);
    const taskCreatedCount = createdMessages.length;
    (orchestrator.steps || [])
      .filter((step) => isKernelStepReadyForRendererDispatch(task, step))
      .slice(0, 1)
      .forEach((step) => {
        const message = createOrchestratorDispatchMessage(task, step);
        project.messages ||= [];
        project.messages.push(message);
        createdMessages.push(message);
        appendRendererKernelEvent(project, task, {
          type: "step.dispatched",
          roleId: step.roleId,
          stepId: step.id,
          subtaskId: step.subtaskId,
          payload: {
            messageId: message.id,
            source: "renderer-ready-step-repair",
            reason
          }
        });
      });
    if (createdMessages.length > taskCreatedCount) {
      setTaskStatusFromKernelProjection(task);
    }
  });

  if (createdMessages.length === 0) {
    return [];
  }

  await persistAgentPoolMessages(project, createdMessages, reason);
  recordAppLog("kernel.dispatch.repaired", {
    projectId: project.id,
    reason,
    messageIds: createdMessages.map((message) => message.id),
    count: createdMessages.length
  }, "warn");
  saveState();
  scheduleAgentAutoWorkflowForMessages(createdMessages, reason);
  return createdMessages;
}

async function repairAllReadyKernelDispatches(reason = "kernel-dispatch-repair") {
  const projects = Array.isArray(state.projects) ? state.projects : [];
  const repaired = [];
  for (const project of projects) {
    const messages = await repairReadyKernelDispatches(project, reason);
    repaired.push(...messages);
  }
  if (repaired.length > 0) {
    render();
  }
  return repaired;
}

function getInitialCoordinatorRoleId(taskPlan, task) {
  const modelRoleId = uniqueRoleIds(taskPlan?.firstRoundRoleIds || [])[0];
  if (modelRoleId) {
    return modelRoleId;
  }

  const availableRoleIds = new Set(ROLE_TEMPLATES.map((role) => role.id));
  if (availableRoleIds.has("product-manager")) {
    return "product-manager";
  }

  const plannedRoleIds = uniqueRoleIds([
    ...(taskPlan?.subtasks || []).map((subtask) => subtask.roleId),
    ...(task?.subtasks || []).map((subtask) => subtask.roleId)
  ]);
  const planningRole = plannedRoleIds.find((roleId) => ["规划", "文档"].includes(getRole(roleId).category));
  return planningRole || plannedRoleIds[0] || ROLE_TEMPLATES[0]?.id || "product-manager";
}

function getInitialCoordinatorRoleIds(taskPlan, task) {
  const modelRoleIds = uniqueRoleIds(taskPlan?.firstRoundRoleIds || [])
    .filter((roleId) => task.subtasks.some((subtask) => subtask.roleId === roleId) || ROLE_TEMPLATES.some((role) => role.id === roleId));
  if (modelRoleIds.length > 0) {
    return modelRoleIds.slice(0, 3);
  }
  return [getInitialCoordinatorRoleId(taskPlan, task)];
}

function getKickoffSenderRoleId(targetRoleId, taskPlan) {
  const candidateRoleIds = uniqueRoleIds([
    "tech-lead",
    ...(taskPlan?.messages || []).map((message) => message.fromRoleId),
    ...(taskPlan?.subtasks || []).map((subtask) => subtask.roleId),
    "product-manager"
  ]).filter((roleId) => roleId !== targetRoleId);
  return candidateRoleIds[0] || ROLE_TEMPLATES.find((role) => role.id !== targetRoleId)?.id || targetRoleId;
}

function buildInitialCoordinatorContent(task, roleId, subtask = null) {
  const role = getRole(roleId);
  const downstreamRoleNames = uniqueRoleIds([...(task.planner?.neededAgentRoleIds || []), ...task.subtasks.map((item) => item.roleId)])
    .filter((item) => item !== roleId)
    .map((item) => getRole(item).name)
    .join("、") || "下游角色";
  return [
    `任务ID：${task.id}`,
    `任务目标：${task.goal || task.title}`,
    `${role.name} Kernel Step：${subtask?.title || "请先梳理需求、验收标准和协作边界。"}`,
    `执行说明：${subtask?.description || "请先输出 PRD、字段约束、验收标准、角色分工和需要下游角色确认的问题。"}`,
    `后续预规划角色：${downstreamRoleNames}`,
    "",
    `请先作为 ${role.name} Agent 开始工作，不要直接跳过到下游实现角色。`,
    "请优先使用 CosS MCP 工具调用 CosS，而不是只在终端自然语言回复。",
    "CosS v0.10 使用中央 Kernel 线性调度，Agent 不能直接给其他 Agent 分配任务。",
    "必须优先尝试工具：coss_get_context、coss_get_task_board、coss_list_roles、coss_pool_read、coss_pool_claim、coss_claim_step、coss_heartbeat_step、coss_get_kernel_events、coss_submit_result。",
    "开始工作前，请通过 MCP 读取共享任务板和自己的角色消息池，开始自己的 Kernel Step；处理过程中通过 MCP 提交结构化结果。",
    "如果看到系统提示 `mcp__coss: Still connecting`，请等待 5-10 秒后用 ToolSearch queries: coss、mcp、inbox 重试，或直接重试 mcp__coss__coss_get_context。",
    "不要因为 ToolSearch 暂时找不到 coss_get_context、coss_list_roles、coss_pool_read 等工具就停止；至少等待并重试 3 次。",
    "推荐顺序：coss_get_context -> coss_get_task_board -> coss_pool_read -> coss_pool_claim -> coss_claim_step -> coss_heartbeat_step -> coss_submit_result。",
    `完成 ${role.name} 阶段后，请写清楚结构化结果、产物、风险和交付说明；是否启动 ${downstreamRoleNames} 由 CosS Kernel 根据预规划步骤决定。`
  ].join("\n");
}

function createInitialTaskKickoffMessages(task, taskPlan) {
  const orchestrator = ensureTaskOrchestrator(task);
  return (orchestrator?.steps || [])
    .filter((step) => !step.assignedMessageId)
    .filter((step) => uniqueStrings(step.dependsOn || []).length === 0)
    .slice(0, 1)
    .map((step) => createOrchestratorDispatchMessage(task, step));
}

function appendProjectMessage(project, message) {
  if (!project || !message?.content) {
    return null;
  }
  project.messages ||= [];
  project.messages.push(ensureMessageShape(message));
  if (project.messages.length > 500) {
    project.messages.splice(0, project.messages.length - 500);
  }
  return project.messages[project.messages.length - 1];
}

function setActiveProject(projectId) {
  state.activeProjectId = projectId;
  const project = getProject();
  if (project) {
    project.lastOpenedAt = new Date().toISOString();
    bootWorkspace(project.id);
    recordAppLog("project.selected", {
      projectId: project.id,
      name: project.name,
      path: project.path
    });
  }
  saveState();
  render();
}

function bootWorkspace(projectId) {
  bootingProjectId = projectId;
  render();
  setTimeout(() => {
    if (bootingProjectId === projectId) {
      bootingProjectId = null;
      render();
    }
  }, 900);
}

function setProjectModalStatus(message, type = "error") {
  const status = document.getElementById("projectPathStatus");
  if (!status) {
    return;
  }

  status.className = `form-status ${type}`;
  status.textContent = message;
}

async function chooseProjectDirectoryFromModal() {
  const input = document.getElementById("projectPath");
  const button = document.querySelector('[data-action="choose-project-directory"]');
  if (!input || !window.cossAPI?.selectProjectDirectory) {
    setProjectModalStatus("当前运行环境无法打开文件夹选择器。");
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "选择中...";
  }

  try {
    const result = await window.cossAPI.selectProjectDirectory(input.value.trim());
    if (result?.ok && result.path) {
      input.value = result.path;
      setProjectModalStatus("已选择项目保存路径。", "ready");
    } else if (result?.canceled) {
      setProjectModalStatus("已取消选择文件夹。", "muted");
    } else {
      setProjectModalStatus(result?.error || "未能选择项目保存路径。");
    }
  } catch (error) {
    setProjectModalStatus(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "选择文件夹";
    }
  }
}

function createProjectFromModal() {
  const name = document.getElementById("projectName")?.value.trim();
  const projectPath = document.getElementById("projectPath")?.value.trim();
  if (!name) {
    setProjectModalStatus("请填写项目名称。");
    return;
  }

  if (!projectPath) {
    setProjectModalStatus("请先指定项目保存路径。");
    return;
  }

  const project = createProjectState(name, projectPath);
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  closeModal();
  bootWorkspace(project.id);
  saveState();
  recordAppLog("project.created", { projectId: project.id, name: project.name, path: project.path });
  render();
}

function showDeleteProjectModal(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    return;
  }

  renderModal(`
    <div class="modal">
      <h2>删除项目</h2>
      <p>这会从 CosS 项目列表中移除「${escapeHtml(project.name)}」，并关闭该项目的所有程序窗口。项目文件夹不会被删除。</p>
      <div class="message-empty">
        <strong>${escapeHtml(project.name)}</strong>
        <p>${escapeHtml(project.path || "")}</p>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">取消</button>
        <button class="secondary-button danger" data-action="confirm-delete-project" data-project-id="${escapeHtml(project.id)}">删除项目</button>
      </div>
    </div>
  `);
}

function cleanupProjectRuntime(project) {
  (project?.windows || []).forEach((win) => {
    if (win.type === "terminal") {
      cleanupTerminalView(win.id, true);
    }
    if (win.type === "browser") {
      for (const key of Array.from(hydratedBrowserViews)) {
        if (key.startsWith(`${win.id}:`)) {
          hydratedBrowserViews.delete(key);
        }
      }
    }
  });
}

async function deleteProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    closeModal();
    return false;
  }

  cleanupProjectRuntime(project);
  state.deletedProjectIds = uniqueStrings([...(state.deletedProjectIds || []), projectId]);
  state.projects = state.projects.filter((item) => item.id !== projectId);
  if (state.activeProjectId === projectId) {
    state.activeProjectId = state.projects[0]?.id || "";
    focusedWindowId = null;
    taskViewOpen = false;
    bootingProjectId = null;
  }
  closeModal();
  recordAppLog("project.deleted", {
    projectId,
    name: project.name,
    path: project.path,
    deletedFiles: false
  });
  await saveState();
  render();
  return true;
}

function createProgram(type, roleId, options = {}) {
  const project = getProject();
  if (!project) {
    return;
  }

  const desktopId = options.desktopId || getActiveDesktopId(project);
  const offset = getDesktopWindows(project, desktopId).length * 18;
  const win = createWindowState(type, roleId, 260 + offset, 98 + offset, {
    ...options,
    desktopId
  });
  project.windows.push(win);
  focusedWindowId = win.id;
  rebuildWindowStack(project, win.id);
  pendingProgramType = null;
  roleMenu = null;
  saveState();
  recordAppLog("program.created", {
    projectId: project.id,
    windowId: win.id,
    type: win.type,
    roleId: win.roleId,
    terminalMode: win.terminalMode,
    agentProvider: win.agentProvider,
    desktopId: win.desktopId
  });
  render();
  return win;
}

function openTaskListWindow() {
  const project = getProject();
  if (!project) {
    return null;
  }

  const desktopId = getActiveDesktopId(project);
  const existing = project.windows.find((win) => win.type === "task-list" && win.desktopId === desktopId);
  if (existing) {
    focusWindow(existing.id);
    return existing;
  }

  const activeConversation = getActiveDesktop(project);
  const win = createProgram("task-list", "product-manager", {
    desktopId,
    title: `${activeConversation?.name || "当前对话"}任务列表`
  });
  recordAppLog("task-list.opened", {
    projectId: project.id,
    conversationId: desktopId,
    windowId: win?.id || "",
    taskCount: getConversationTasks(project, desktopId).length
  });
  return win;
}

function selectTaskListTask(taskId) {
  selectedTaskListTaskId = taskId || "";
  render();
}

function setTaskArchived(taskId, archived) {
  const project = getProject();
  const task = project?.tasks.find((item) => item.id === taskId);
  if (!project || !task) {
    return false;
  }
  task.archived = Boolean(archived);
  task.archivedAt = task.archived ? new Date().toISOString() : "";
  task.updatedAt = task.archivedAt || new Date().toISOString();
  if (selectedTaskListTaskId === taskId && task.archived && !taskListFilters.includeArchived) {
    selectedTaskListTaskId = "";
  }
  recordAppLog(task.archived ? "task.archived" : "task.restored", {
    projectId: project.id,
    taskId,
    conversationId: getTaskConversationId(task)
  });
  saveState();
  render();
  return true;
}

function closeWindow(windowId) {
  const project = getProject();
  if (!project) {
    return;
  }

  const win = project.windows.find((item) => item.id === windowId);
  if (pendingCommandApproval?.windowId === windowId) {
    pendingCommandApproval = null;
    closeModal();
  }
  if (win?.type === "terminal") {
    cleanupTerminalView(windowId, true);
  }
  if (win?.type === "browser") {
    for (const key of Array.from(hydratedBrowserViews)) {
      if (key.startsWith(`${windowId}:`)) {
        hydratedBrowserViews.delete(key);
      }
    }
  }

  project.windows = project.windows.filter((win) => win.id !== windowId);
  if (focusedWindowId === windowId) {
    focusedWindowId = getVisibleWindows(project)
      .sort((a, b) => normalizeZIndex(b.z) - normalizeZIndex(a.z))[0]?.id || null;
  }
  if (win) {
    recordAppLog("program.closed", {
      projectId: project.id,
      windowId: win.id,
      type: win.type,
      roleId: win.roleId,
      terminalMode: win.terminalMode,
      agentProvider: win.agentProvider,
      desktopId: win.desktopId
    });
  }
  saveState();
  render();
}

function minimizeWindow(windowId) {
  const project = getProject();
  const win = project?.windows.find((item) => item.id === windowId);
  if (!project || !win) {
    return;
  }

  win.minimized = true;
  if (focusedWindowId === windowId) {
    focusedWindowId = getVisibleWindows(project)
      .filter((item) => item.id !== windowId)
      .sort((a, b) => normalizeZIndex(b.z) - normalizeZIndex(a.z))[0]?.id || null;
  }
  recordAppLog("program.minimized", {
    projectId: project.id,
    windowId: win.id,
    desktopId: win.desktopId
  });
  saveState();
  render();
}

function toggleMaximizeWindow(windowId) {
  const project = getProject();
  const win = project?.windows.find((item) => item.id === windowId);
  if (!project || !win) {
    return;
  }

  if (win.maximized) {
    const bounds = win.restoreBounds || {};
    win.x = Number.isFinite(bounds.x) ? bounds.x : win.x;
    win.y = Number.isFinite(bounds.y) ? bounds.y : win.y;
    win.width = Number.isFinite(bounds.width) ? bounds.width : win.width;
    win.height = Number.isFinite(bounds.height) ? bounds.height : win.height;
    win.maximized = false;
    win.restoreBounds = null;
  } else {
    win.restoreBounds = {
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height
    };
    win.maximized = true;
    win.minimized = false;
  }

  focusedWindowId = win.id;
  rebuildWindowStack(project, win.id);
  recordAppLog("program.maximized.changed", {
    projectId: project.id,
    windowId: win.id,
    desktopId: win.desktopId,
    maximized: win.maximized
  });
  saveState();
  render();
}

function syncFocusedWindowStyles(project, windowId) {
  project.windows.forEach((win) => {
    const node = document.querySelector(`.program-window[data-window-id="${win.id}"]`);
    if (!node) {
      return;
    }

    node.classList.toggle("focused", win.id === windowId);
    node.style.zIndex = `${normalizeZIndex(win.z)}`;
  });

  document.querySelectorAll(".dock-button[data-window-id]").forEach((button) => {
    button.classList.toggle("active", button.dataset.windowId === windowId);
  });
}

function focusWindow(windowId, options = {}) {
  const project = getProject();
  const win = project?.windows.find((item) => item.id === windowId);
  if (!win) {
    return;
  }

  let changedVisibility = false;
  if (win.desktopId && project.activeDesktopId !== win.desktopId) {
    project.activeDesktopId = win.desktopId;
    taskViewOpen = false;
    changedVisibility = true;
  }
  if (win.minimized) {
    win.minimized = false;
    changedVisibility = true;
  }

  const isAlreadyStrictlyTop = project.windows.every((item) => item.id === windowId || normalizeZIndex(item.z) < normalizeZIndex(win.z));
  if (!changedVisibility && focusedWindowId === windowId && isAlreadyStrictlyTop) {
    return;
  }

  focusedWindowId = windowId;
  rebuildWindowStack(project, windowId);
  saveState();
  if (options.render === false) {
    syncFocusedWindowStyles(project, windowId);
    return;
  }

  render();
}

function getWindowState(windowId) {
  const project = getProject();
  return project?.windows.find((item) => item.id === windowId) || null;
}

function switchDesktop(desktopId) {
  const project = getProject();
  if (!project || !getProjectDesktops(project).some((desktop) => desktop.id === desktopId)) {
    return;
  }

  project.activeDesktopId = desktopId;
  const topWindow = getVisibleWindows(project)
    .sort((a, b) => normalizeZIndex(b.z) - normalizeZIndex(a.z))[0];
  focusedWindowId = topWindow?.id || null;
  taskViewOpen = false;
  recordAppLog("desktop.switched", {
    projectId: project.id,
    desktopId
  });
  saveState();
  render();
}

function createProjectDesktop(name = "") {
  const project = getProject();
  if (!project) {
    return;
  }

  const desktop = createDesktopState(name || `对话 ${getProjectDesktops(project).length + 1}`);
  project.desktops.push(desktop);
  project.activeDesktopId = desktop.id;
  focusedWindowId = null;
  taskViewOpen = false;
  recordAppLog("desktop.created", {
    projectId: project.id,
    desktopId: desktop.id,
    name: desktop.name,
    source: "manual"
  });
  recordAppLog("conversation.created", {
    projectId: project.id,
    conversationId: desktop.id,
    name: desktop.name,
    source: "manual"
  });
  saveState();
  render();
}

function createFallbackTaskPlan(activeModel, error = "") {
  return {
    ok: false,
    source: "local-fallback",
    summary: "使用本地规则生成 Kernel Step 图。",
    error,
    neededAgentRoleIds: ["product-manager", "tech-lead"],
    firstRoundRoleIds: ["product-manager"],
    subtasks: [
      {
        id: "step-1",
        roleId: "product-manager",
        title: "确认需求和验收标准",
        description: "先把用户目标整理成可执行的需求、验收标准、协作边界和需要交接给下游 Agent 的问题。",
        dependsOn: [],
        status: "idle",
        riskLevel: "low",
        order: 1,
        isEntryStep: true
      },
      {
        id: "step-2",
        roleId: "tech-lead",
        title: "制定技术方案和执行边界",
        description: "基于需求文档制定架构、接口、依赖、资源锁和下游执行顺序。",
        dependsOn: ["step-1"],
        status: "idle",
        riskLevel: "low",
        order: 2,
        isEntryStep: false
      }
    ],
    messages: []
  };
}

function normalizeTaskPlanResult(plan, fallbackPlan) {
  const allowedRoles = new Set(ROLE_TEMPLATES.map((role) => role.id));
  const placeholderTexts = new Set(["一句话总结", "子任务标题", "子任务描述", "角色ID", "协作消息"]);
  const isPlaceholder = (value) => placeholderTexts.has(String(value || "").trim());
  const readRoleList = (...keys) => {
    for (const key of keys) {
      if (Array.isArray(plan?.[key])) {
        const values = uniqueRoleIds(plan[key]).filter((roleId) => allowedRoles.has(roleId));
        if (values.length > 0) {
          return values;
        }
      }
    }
    return [];
  };
  const rawSubtasks = (Array.isArray(plan?.subtasks) ? plan.subtasks : [])
    .map((item, index) => {
      const id = String(item.id || item.stepId || `step-${index + 1}`)
        .trim()
        .replace(/[^\w.-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || `step-${index + 1}`;
      return {
        id,
        roleId: allowedRoles.has(item.roleId) ? item.roleId : "product-manager",
        title: String(item.title || "").trim().slice(0, 80),
        description: String(item.description || "").trim().slice(0, 500),
        dependsOn: Array.isArray(item.dependsOn)
          ? item.dependsOn.map((value) => String(value || "").trim()).filter(Boolean)
          : Array.isArray(item.dependencies)
            ? item.dependencies.map((value) => String(value || "").trim()).filter(Boolean)
            : [],
        riskLevel: normalizeRiskLevel(item.riskLevel),
        status: normalizeSubtaskStatus(item.status),
        order: Number(item.order) || index + 1,
        isEntryStep: Boolean(item.isEntryStep)
      };
    })
    .filter((item) => item.title && item.description && !isPlaceholder(item.title) && !isPlaceholder(item.description));

  const subtasks = rawSubtasks.map((item, index) => {
    return {
      ...item,
      id: `step-${index + 1}`,
      dependsOn: index === 0 ? [] : [`step-${index}`],
      isEntryStep: index === 0,
      status: "idle",
      order: index + 1
    };
  });
  const effectiveFirstRoundRoleIds = subtasks[0]?.roleId ? [subtasks[0].roleId] : [];
  if (effectiveFirstRoundRoleIds.length < 1 || subtasks.length < 1) {
    return fallbackPlan;
  }

  const neededAgentRoleIds = uniqueRoleIds([
    ...readRoleList("neededAgentRoleIds", "agentRoleIds", "terminalRoleIds", "involvedRoleIds"),
    ...subtasks.map((item) => item.roleId)
  ]).filter((roleId) => allowedRoles.has(roleId));

  return {
    ok: Boolean(plan?.ok),
    source: plan?.source || "llm",
    summary: isPlaceholder(plan?.summary) ? "" : String(plan?.summary || "").trim(),
    plannedAt: plan?.plannedAt,
    usage: plan?.usage || null,
    neededAgentRoleIds,
    firstRoundRoleIds: effectiveFirstRoundRoleIds,
    subtasks,
    messages: []
  };
}

function getRoleIdsFromTaskPlan(plan) {
  const ids = new Set(uniqueRoleIds(plan.neededAgentRoleIds || []));
  (plan.firstRoundRoleIds || []).forEach((roleId) => ids.add(roleId));
  plan.subtasks.forEach((subtask) => ids.add(subtask.roleId));
  return uniqueRoleIds(Array.from(ids));
}

async function requestTaskPlan(goal, project, activeModel, projectMemory = null) {
  if (!window.cossAPI?.planTask) {
    return { ok: false, error: "当前运行环境未暴露 Kernel Planner。" };
  }

  return window.cossAPI.planTask({
    goal,
    projectName: project.name,
    model: {
      provider: activeModel.id,
      baseUrl: activeModel.baseUrl,
      modelName: activeModel.modelName,
      apiKey: activeModel.apiKey
    },
    projectMemory,
    roles: ROLE_TEMPLATES.map((role) => ({
      id: role.id,
      name: role.name,
      category: role.category,
      description: role.description
    }))
  });
}

async function createTaskFromModal() {
  const project = getProject();
  const goal = document.getElementById("taskGoal")?.value.trim();
  if (!project || !goal) {
    return;
  }

  const submitButton = document.querySelector('[data-action="create-task"]');
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "正在生成计划...";
  }

  const activeModel = getActiveModelConfig();
  const projectMemory = buildProjectMemoryForPlanner(project);
  let llmResult;
  try {
    llmResult = await requestTaskPlan(goal, project, activeModel, projectMemory);
  } catch (error) {
    llmResult = { ok: false, error: error.message };
  }
  const fallbackPlan = createFallbackTaskPlan(activeModel, llmResult?.ok === false ? llmResult.error : "");
  const taskPlan = llmResult?.ok ? normalizeTaskPlanResult(llmResult, fallbackPlan) : fallbackPlan;
  pendingTaskPlanDraft = {
    id: uid("taskdraft"),
    projectId: project.id,
    conversationId: getActiveDesktopId(project),
    goal,
    activeModel,
    projectMemory,
    llmResult,
    taskPlan,
    createdAt: new Date().toISOString()
  };
  const plannerLevel = llmResult?.ok ? "info" : "warn";
  recordAppLog("task.plan.generated", {
    projectId: project.id,
    plannerStatus: llmResult?.ok ? "success" : "fallback",
    modelProvider: activeModel.id,
    modelName: activeModel.modelName,
    subtasks: taskPlan.subtasks.length,
    error: llmResult?.ok ? "" : (llmResult?.error || "")
  }, plannerLevel);
  if (!llmResult?.ok) {
    recordAppLog("task.plan.failed", {
      projectId: project.id,
      goal: goal.slice(0, 240),
      modelProvider: activeModel.id,
      modelName: activeModel.modelName,
      error: llmResult?.error || "unknown"
    }, "warn");
  }
  renderTaskPlanPreviewModal(pendingTaskPlanDraft);
}

function buildTaskFromDraft(draft) {
  const taskId = uid("task");
  const { goal, activeModel, projectMemory, llmResult, taskPlan } = draft;
  const createdAt = new Date().toISOString();
  const subtasks = taskPlan.subtasks.map((subtask, index) => ({
    ...subtask,
    roleId: getRole(subtask.roleId).id,
    title: String(subtask.title || `子任务 ${index + 1}`).trim() || `子任务 ${index + 1}`,
    description: String(subtask.description || "请根据任务目标补充执行步骤。").trim() || "请根据任务目标补充执行步骤。",
    dependsOn: uniqueStrings(subtask.dependsOn || []),
    riskLevel: normalizeRiskLevel(subtask.riskLevel),
    order: Number(subtask.order) || index + 1,
    isEntryStep: Boolean(subtask.isEntryStep),
    status: "idle",
    createdAt,
    updatedAt: createdAt
  }));
  return ensureTaskShape({
    id: taskId,
    title: goal.slice(0, 32),
    goal,
    status: "planned",
    createdAt,
    confirmedAt: createdAt,
    projectMemorySnapshot: projectMemory || null,
    model: {
      provider: activeModel.id,
      label: activeModel.label,
      baseUrl: activeModel.baseUrl,
      modelName: activeModel.modelName,
      apiKeyRequired: activeModel.apiKeyRequired,
      hasApiKey: Boolean(activeModel.apiKey)
    },
    planner: {
      status: llmResult?.ok ? "success" : "fallback",
      source: taskPlan.source,
      summary: taskPlan.summary,
      error: llmResult?.ok ? "" : (llmResult?.error || "模型规划失败。"),
      plannedAt: llmResult?.plannedAt || draft.createdAt || createdAt,
      confirmedAt: createdAt,
      usage: taskPlan.usage || null,
      neededAgentRoleIds: uniqueRoleIds(taskPlan.neededAgentRoleIds || []),
      firstRoundRoleIds: uniqueRoleIds(taskPlan.firstRoundRoleIds || [])
    },
    subtasks
  });
}

async function confirmTaskPlan() {
  const project = getProject();
  const draft = pendingTaskPlanDraft;
  if (!project || !draft || draft.projectId !== project.id) {
    pendingTaskPlanDraft = null;
    closeModal();
    return;
  }

  const taskPlan = draft.taskPlan;
  const selectedRoles = getRoleIdsFromTaskPlan(taskPlan);
  const task = buildTaskFromDraft(draft);
  const taskDesktop = createDesktopState(task.title || "任务桌面", {
    taskId: task.id
  });
  task.desktopId = taskDesktop.id;

  project.tasks.unshift(task);
  rebuildProjectMemory(project, "task-created");
  getProjectDesktops(project);
  project.desktops.push(taskDesktop);
  project.activeDesktopId = taskDesktop.id;
  const taskPlanMessages = taskPlan.messages.map((message) => (
    createMessage(message.fromRoleId, message.toRoleIds, message.content, task.id, {
      source: "task-plan",
      channelType: "task"
    })
  ));
  const kickoffMessages = createInitialTaskKickoffMessages(task, taskPlan);
  const createdMessages = [...kickoffMessages, ...taskPlanMessages];
  project.messages.push(...createdMessages);

  ensureRoleWindowsForTask(project, selectedRoles, taskDesktop.id);
  await persistAgentPoolMessages(project, createdMessages, "task-plan-confirm");
  ensureAgentAutoWorkflowRunning("task-plan-confirm");
  closeModal();
  pendingTaskPlanDraft = null;
  saveState();
  recordAppLog("desktop.created", {
    projectId: project.id,
    desktopId: taskDesktop.id,
    name: taskDesktop.name,
    taskId: task.id,
    source: "task-plan"
  });
  recordAppLog("task.created", {
    projectId: project.id,
    taskId: task.id,
    title: task.title,
    desktopId: taskDesktop.id,
    plannerStatus: task.planner.status,
    modelProvider: task.model.provider
  });
  recordAppLog("role.messages.created", {
    projectId: project.id,
    taskId: task.id,
    source: "task-plan",
    count: createdMessages.length,
    kickoffCount: kickoffMessages.length,
    planMessageCount: taskPlanMessages.length,
    firstRoundRoleIds: kickoffMessages.flatMap((message) => message.toRoleIds)
  });
  render();
  scheduleAgentAutoWorkflowForMessages(kickoffMessages, "task-kickoff");
  setTimeout(() => {
    ensureProjectMcpConfigAfterTaskCreated(task);
  }, 150);
}

async function confirmTaskPlanInConversation() {
  const project = getProject();
  const draft = pendingTaskPlanDraft;
  if (!project || !draft || draft.projectId !== project.id) {
    pendingTaskPlanDraft = null;
    closeModal();
    return;
  }

  const taskPlan = draft.taskPlan;
  const selectedRoles = getRoleIdsFromTaskPlan(taskPlan);
  const task = buildTaskFromDraft(draft);
  getProjectDesktops(project);
  const conversation = project.desktops.find((desktop) => desktop.id === draft.conversationId) || getActiveDesktop(project);
  const conversationId = conversation?.id || getActiveDesktopId(project);
  setTaskConversation(task, conversationId);

  project.tasks.unshift(task);
  rebuildProjectMemory(project, "conversation-task-created");
  if (conversation) {
    conversation.taskIds = uniqueStrings([task.id, ...(conversation.taskIds || [])]);
    conversation.taskId = conversation.taskId || task.id;
    conversation.lastTaskId = task.id;
  }
  project.activeDesktopId = conversationId;
  const taskPlanMessages = taskPlan.messages.map((message) => (
    createMessage(message.fromRoleId, message.toRoleIds, message.content, task.id, {
      source: "task-plan",
      channelType: "task"
    })
  ));
  const kickoffMessages = createInitialTaskKickoffMessages(task, taskPlan);
  const createdMessages = [...kickoffMessages, ...taskPlanMessages];
  project.messages.push(...createdMessages);

  ensureRoleWindowsForTask(project, selectedRoles, conversationId);
  await persistAgentPoolMessages(project, createdMessages, "conversation-task-confirm");
  ensureAgentAutoWorkflowRunning("conversation-task-confirm");
  closeModal();
  pendingTaskPlanDraft = null;
  saveState();
  recordAppLog("conversation.task.added", {
    projectId: project.id,
    conversationId,
    conversationName: conversation?.name || "",
    taskId: task.id,
    source: "task-plan",
    reusedProgramCount: getDesktopWindows(project, conversationId).length
  });
  recordAppLog("task.created", {
    projectId: project.id,
    taskId: task.id,
    title: task.title,
    desktopId: conversationId,
    conversationId,
    plannerStatus: task.planner.status,
    modelProvider: task.model.provider
  });
  recordAppLog("role.messages.created", {
    projectId: project.id,
    taskId: task.id,
    source: "task-plan",
    count: createdMessages.length,
    kickoffCount: kickoffMessages.length,
    planMessageCount: taskPlanMessages.length,
    firstRoundRoleIds: kickoffMessages.flatMap((message) => message.toRoleIds)
  });
  render();
  scheduleAgentAutoWorkflowForMessages(kickoffMessages, "task-kickoff");
  setTimeout(() => {
    ensureProjectMcpConfigAfterTaskCreated(task);
  }, 150);
}

async function executeKernelSubtask(taskId, subtaskId) {
  const project = getProject();
  const task = project?.tasks.find((item) => item.id === taskId);
  const subtask = task?.subtasks.find((item) => item.id === subtaskId);
  if (!project || !task || !subtask) {
    return { ok: false, reason: "subtask-not-found" };
  }
  if (!canManuallyExecuteKernelSubtask(task, subtask)) {
    recordAppLog("kernel.step.manual-execute.rejected", {
      projectId: project.id,
      taskId,
      subtaskId,
      reason: "step-not-dispatched"
    }, "warn");
    return { ok: false, reason: "step-not-dispatched" };
  }

  const orchestrator = ensureTaskOrchestrator(task);
  const step = findKernelStepForSubtask(task, subtask);
  if (!orchestrator || !step) {
    return { ok: false, reason: "kernel-step-not-found" };
  }

  const roleId = getRole(step.roleId || subtask.roleId).id;
  const desktopId = getTaskConversationId(task) || getActiveDesktopId(project);
  const previousMessageId = step.assignedMessageId || subtask.assignedMessageId || "";
  const now = new Date().toISOString();
  let releasedCount = 0;
  let canceledCount = 0;

  project.agentDeliveries ||= [];
  project.agentDeliveries.forEach((delivery) => {
    const sameStep = delivery.taskId === task.id
      && (delivery.subtaskId === subtask.id || (previousMessageId && delivery.messageId === previousMessageId));
    if (!sameStep) {
      return;
    }
    const status = normalizeDeliveryStatus(delivery.status);
    if (status === "pending") {
      delivery.status = "canceled";
      delivery.canceledAt = now;
      delivery.updatedAt = now;
      delivery.lastFeedback = "Canceled by manual Kernel subtask execution.";
      canceledCount += 1;
      return;
    }
    if (isAgentDeliveryInProgress(delivery)) {
      const win = project.windows.find((item) => item.id === delivery.windowId);
      if (win && releaseActiveAgentDelivery(project, win, delivery, "manual-subtask-execute")) {
        releasedCount += 1;
      }
    }
  });

  step.assignedMessageId = "";
  step.claimedBy = "";
  step.lease = null;
  step.status = "idle";
  step.phase = "idle";
  step.updatedAt = now;
  subtask.assignedMessageId = "";
  subtask.status = "idle";
  subtask.updatedAt = now;
  task.updatedAt = now;
  setTaskStatusFromKernelProjection(task);

  ensureRoleWindowsForTask(project, [roleId], desktopId);
  const message = createOrchestratorDispatchMessage(task, step);
  project.messages ||= [];
  project.messages.push(message);
  appendRendererKernelEvent(project, task, {
    type: "renderer.step.manual-dispatch",
    roleId,
    stepId: step.id,
    subtaskId: subtask.id,
    payload: {
      messageId: message.id,
      previousMessageId,
      releasedCount,
      canceledCount,
      source: "manual-execute-button"
    }
  });
  await persistAgentPoolMessages(project, [message], "manual-subtask-execute");
  ensureAgentAutoWorkflowRunning("manual-subtask-execute");
  recordAppLog("kernel.step.manual-execute", {
    projectId: project.id,
    taskId: task.id,
    subtaskId: subtask.id,
    stepId: step.id,
    roleId,
    messageId: message.id,
    previousMessageId,
    releasedCount,
    canceledCount
  });
  saveState();
  render();
  scheduleAgentAutoWorkflowForMessages([message], "manual-subtask-execute");
  return { ok: true, messageId: message.id };
}

function updateSubtaskStatus(taskId, subtaskId, nextStatus) {
  const project = getProject();
  const task = project?.tasks.find((item) => item.id === taskId);
  const subtask = task?.subtasks.find((item) => item.id === subtaskId);
  const status = normalizeSubtaskStatus(nextStatus);
  if (!project || !task || !subtask) {
    return;
  }
  const previousStatus = normalizeSubtaskStatus(subtask.status);
  if (status === previousStatus) {
    recordAppLog("subtask.status.unchanged", {
      projectId: project.id,
      taskId,
      subtaskId,
      status
    });
    return;
  }

  applyKernelStepStatusAction(project, task, subtask, status, {
    type: "renderer.step.status.changed",
    source: "manual-task-action",
    renewLease: status === "running"
  });

  const windowStatus = SUBTASK_STATUS_DEFS[status].windowStatus;
  project.windows
    .filter((win) => win.roleId === subtask.roleId)
    .forEach((win) => {
      win.status = windowStatus;
    });

  const statusMessageTargets = uniqueRoleIds(["product-manager", "tech-lead"]).filter((roleId) => roleId !== subtask.roleId);
  if (statusMessageTargets.length > 0) {
    const statusMessage = createMessage(
      subtask.roleId,
      statusMessageTargets,
      `${getRole(subtask.roleId).name} 将子任务「${subtask.title}」更新为：${SUBTASK_STATUS_DEFS[status].label}。`,
      task.id,
      {
        source: "task-status",
        channelType: "task"
      }
    );
    project.messages.push(statusMessage);
    recordAppLog("role.message.system-created", {
      projectId: project.id,
      taskId: task.id,
      messageId: statusMessage.id,
      source: statusMessage.source,
      status
    });
  }

  saveState();
  recordAppLog("subtask.status.changed", {
    projectId: project.id,
    taskId,
    subtaskId,
    status
  });
  render();
}

function ensureRoleWindowsForTask(project, roleIds, desktopId = getActiveDesktopId(project)) {
  let lastCreatedWindowId = null;
  roleIds.forEach((roleId, index) => {
    const exists = project.windows.some((win) => win.roleId === roleId && win.desktopId === desktopId);
    if (exists) {
      return;
    }

    const role = getRole(roleId);
    const type = role.programs.includes("terminal") ? "terminal" : "task";
    const terminalMode = type === "terminal" ? "agent" : "shell";
    const win = createWindowState(type, roleId, 250 + index * 34, 116 + index * 24, {
      terminalMode,
      agentProvider: state.settings.agentProvider,
      desktopId
    });
    win.status = "waiting";
    project.windows.push(win);
    lastCreatedWindowId = win.id;
  });

  if (lastCreatedWindowId) {
    rebuildWindowStack(project, lastCreatedWindowId);
  }
}

function getCollaboratorsForWindow(win) {
  const project = getProject();
  if (!project) {
    return [];
  }

  const collaborators = new Set();
  project.messages.forEach((message) => {
    if (message.fromRoleId === win.roleId) {
      message.toRoleIds.forEach((roleId) => collaborators.add(roleId));
    }
    if (message.toRoleIds.includes(win.roleId)) {
      collaborators.add(message.fromRoleId);
    }
  });
  collaborators.delete(win.roleId);

  return Array.from(collaborators).map(getRole);
}

function getWindowStatus(win) {
  const collaborators = getCollaboratorsForWindow(win);
  if (collaborators.length > 0) {
    return "talking";
  }
  return win.status || "idle";
}

function getRelayStageDef(stage) {
  return AGENT_RELAY_STAGES[stage] || AGENT_RELAY_STAGES.idle;
}

function getRelayStageLabel(stage) {
  return getRelayStageDef(stage).label;
}

function getRelayStageSymbol(stage) {
  return getRelayStageDef(stage).symbol;
}

function getRelayStageClass(stage) {
  return getRelayStageDef(stage).className;
}

function getMessageRelayStageForRole(project, message, roleId) {
  const normalizedRoleId = getRole(roleId).id;
  const deliveries = (project?.agentDeliveries || []).filter((delivery) => (
    delivery.messageId === message.id && delivery.roleId === normalizedRoleId
  ));
  if (deliveries.some((delivery) => ["completed"].includes(delivery.status))) {
    return "done";
  }
  if (deliveries.some((delivery) => ["submitted", "responded", "waiting", "sent"].includes(delivery.status))) {
    return "running";
  }
  if ((message.readBy || []).includes(normalizedRoleId) || message.agentPoolStatus === "running") {
    return "running";
  }
  if (message.agentPoolPaths?.[normalizedRoleId]) {
    return "idle";
  }
  return "idle";
}

function getAgentRelayStageForWindow(win) {
  const project = getProject();
  if (!project || normalizeTerminalMode(win.terminalMode) !== "agent") {
    const fallbackStatus = getWindowStatus(win);
    const fallbackStage = fallbackStatus === "done" ? "done" : "idle";
    return {
      stage: fallbackStage,
      label: getRelayStageLabel(fallbackStage),
      className: getRelayStageClass(fallbackStage),
      symbol: getRelayStageSymbol(fallbackStage)
    };
  }

  const taskContext = getTaskContextForWindow(win, project);
  const roleId = win.roleId;
  const candidates = [];
  const addCandidate = (stage, time, source = "") => {
    const ms = new Date(time || 0).getTime();
    candidates.push({
      stage,
      time: Number.isFinite(ms) ? ms : 0,
      source
    });
  };

  const kernelTasks = taskContext.taskId
    ? (project.tasks || []).filter((task) => task.id === taskContext.taskId)
    : getConversationTasks(project, win.desktopId);
  kernelTasks.forEach((task) => {
    getTaskKernelProjection(task).steps
      .filter((step) => step.roleId === roleId)
      .forEach((step) => {
        addCandidate(
          kernelPhaseToRelayStage(step.phase),
          step.lease?.heartbeatAt || step.updatedAt || task.updatedAt || task.createdAt,
          `kernel-step:${step.id}`
        );
      });
  });

  (project.messages || []).forEach((message) => {
    if (taskContext.taskId && message.taskId && message.taskId !== taskContext.taskId) {
      return;
    }
    if (message.toRoleIds?.includes(roleId)) {
      addCandidate(getMessageRelayStageForRole(project, message, roleId), message.injectedAt || message.createdAt, `message:${message.id}`);
    }
    if (message.fromRoleId === roleId && (message.toRoleIds || []).length > 0) {
      addCandidate("running", message.createdAt, `outgoing:${message.id}`);
    }
  });

  (project.agentDeliveries || [])
    .filter((delivery) => delivery.windowId === win.id || delivery.roleId === roleId)
    .filter((delivery) => !taskContext.taskId || !delivery.taskId || delivery.taskId === taskContext.taskId)
    .forEach((delivery) => {
      if (["pending"].includes(delivery.status)) {
        addCandidate("idle", delivery.updatedAt || delivery.createdAt, `delivery:${delivery.id}`);
      } else if (["submitted", "sent", "responded", "waiting"].includes(delivery.status)) {
        addCandidate("running", delivery.updatedAt || delivery.submittedAt || delivery.createdAt, `delivery:${delivery.id}`);
      } else if (delivery.status === "completed") {
        addCandidate("done", delivery.completedAt || delivery.updatedAt || delivery.createdAt, `delivery:${delivery.id}`);
      } else if (delivery.status === "failed") {
        addCandidate("running", delivery.updatedAt || delivery.createdAt, `delivery:${delivery.id}`);
      }
    });

  (project.agentEvents || [])
    .filter((event) => event.roleId === roleId || event.fromRoleId === roleId)
    .filter((event) => !taskContext.taskId || !event.taskId || event.taskId === taskContext.taskId)
    .forEach((event) => {
      const status = normalizeAgentEventStatus(event.status);
      if (status === "running") {
        addCandidate("running", event.receivedAt, `event:${event.id}`);
      } else if (status === "done") {
        addCandidate("done", event.receivedAt, `event:${event.id}`);
      }
    });

  const activeDelivery = getActiveAgentDeliveryForWindow(project, win.id);
  if (activeDelivery) {
    addCandidate("running", new Date().toISOString(), `active:${activeDelivery.id}`);
  }

  const selected = candidates
    .filter((item) => item.stage && item.stage !== "idle")
    .sort((a, b) => b.time - a.time)[0] || { stage: "idle", time: 0, source: "" };
  return {
    ...selected,
    label: getRelayStageLabel(selected.stage),
    className: getRelayStageClass(selected.stage),
    symbol: getRelayStageSymbol(selected.stage)
  };
}

function renderRelayStageChips(project, message) {
  const targetChips = uniqueRoleIds(message.toRoleIds || []).map((roleId) => {
    const stage = getMessageRelayStageForRole(project, message, roleId);
    return `<span class="relay-stage-chip ${escapeHtml(getRelayStageClass(stage))}">${escapeHtml(getRole(roleId).name)} · ${escapeHtml(getRelayStageLabel(stage))}</span>`;
  });
  const sourceChip = message.fromRoleId && message.toRoleIds?.length
    ? `<span class="relay-stage-chip delegated">${escapeHtml(getRole(message.fromRoleId).name)} · ${escapeHtml(getRelayStageLabel("delegated"))}</span>`
    : "";
  return `<div class="relay-stage-list">${sourceChip}${targetChips.join("")}</div>`;
}

function getFlowRoleLabel(roleId) {
  return roleId === "human" ? "人工" : getRole(roleId).name;
}

function getFlowMessageFromId(message) {
  return message.source === "manual" ? "human" : message.fromRoleId;
}

function getFlowEdgeKey(fromId, toId) {
  return `${fromId || "human"}->${toId || ""}`;
}

function parseFlowEdgeKey(edgeKey = "") {
  const [fromId = "", toId = ""] = String(edgeKey).split("->");
  return { fromId, toId };
}

function messageMatchesFlowEdge(message, edgeKey) {
  if (!edgeKey) {
    return true;
  }
  const fromId = getFlowMessageFromId(message);
  return uniqueRoleIds(message.toRoleIds || []).some((toRoleId) => (
    getFlowEdgeKey(fromId, toRoleId) === edgeKey
  ));
}

function messageMatchesFlowRole(message, roleId) {
  if (!roleId) {
    return true;
  }
  return getFlowMessageFromId(message) === roleId || uniqueRoleIds(message.toRoleIds || []).includes(roleId);
}

function itemMatchesMessageFlowSelection(item, selection = messageFlowSelection) {
  const roleId = selection.roleId || "";
  const edgeKey = selection.edgeKey || "";
  if (!roleId && !edgeKey) {
    return true;
  }

  if (item.kind === "message") {
    return edgeKey
      ? messageMatchesFlowEdge(item.message, edgeKey)
      : messageMatchesFlowRole(item.message, roleId);
  }

  const event = item.event;
  if (edgeKey) {
    const { fromId, toId } = parseFlowEdgeKey(edgeKey);
    return (event.fromRoleId || event.roleId) === fromId && uniqueRoleIds(event.toRoleIds || []).includes(toId);
  }

  return event.roleId === roleId
    || event.fromRoleId === roleId
    || uniqueRoleIds(event.toRoleIds || []).includes(roleId);
}

function normalizeAgentEventStatus(status) {
  return ["idle", "running", "done"].includes(status) ? status : "";
}

function applyAgentEventToState(event) {
  const project = getProject();
  const win = project?.windows.find((item) => item.id === event.id);
  if (!project || !win) {
    return false;
  }

  project.agentEvents ||= [];
  const status = normalizeAgentEventStatus(event.status);
  const fromRoleId = getRole(event.fromRoleId || event.roleId || win.roleId).id;
  const storedEvent = ensureAgentEventShape({
    id: uid("agent-event"),
    type: event.type || "status",
    structured: Boolean(event.structured),
    windowId: win.id,
    roleId: event.roleId || win.roleId,
    fromRoleId,
    toRoleIds: event.toRoleIds || [],
    provider: event.provider || win.agentProvider || "",
    sessionId: event.sessionId || win.agentSession?.sessionId || "",
    taskId: event.taskId || win.agentSession?.taskId || "",
    subtaskId: event.subtaskId || win.agentSession?.subtaskId || "",
    status: status || event.status || "",
    message: String(event.message || "").slice(0, 500),
    receivedAt: event.receivedAt || new Date().toISOString()
  });
  project.agentEvents.push(storedEvent);
  project.agentEvents = project.agentEvents.slice(-120);

  let createdMessage = null;
  if (storedEvent.structured && storedEvent.type !== "structured-parse-error" && storedEvent.message) {
    const rawTargets = Array.isArray(storedEvent.toRoleIds) ? storedEvent.toRoleIds : [];
    const invalidTargets = rawTargets
      .map((roleId) => String(roleId || "").trim())
      .filter((roleId) => roleId && !ROLE_TEMPLATES.some((role) => role.id === roleId));
    let toRoleIds = uniqueRoleIds(rawTargets).filter((roleId) => roleId !== fromRoleId);
    if (invalidTargets.length > 0) {
      recordAppLog("agent.event.invalid_target_roles", {
        projectId: project.id,
        windowId: win.id,
        fromRoleId,
        invalidTargets: Array.from(new Set(invalidTargets)),
        allowedRoleIds: ROLE_TEMPLATES.map((role) => role.id),
        taskId: storedEvent.taskId || ""
      }, "warn");
    }
    if (toRoleIds.length > 0) {
      const eventTask = project.tasks.find((item) => item.id === (storedEvent.taskId || win.agentSession?.taskId || ""));
      const orchestrator = ensureTaskOrchestrator(eventTask);
      orchestrator?.events.push({
        id: uid("orch-event"),
        type: "agent-suggested-downstream",
        roleId: fromRoleId,
        suggestedRoleIds: toRoleIds,
        message: storedEvent.message,
        createdAt: storedEvent.receivedAt
      });
      if (orchestrator?.events.length > 120) {
        orchestrator.events = orchestrator.events.slice(-120);
      }
    recordAppLog("orchestrator.direct_agent_message.ignored", {
        projectId: project.id,
        taskId: storedEvent.taskId || "",
        fromRoleId,
        suggestedRoleIds: toRoleIds,
        reason: "Agents may suggest downstream roles, but CosS Kernel must schedule them."
      }, "warn");
    }
  }

  const activeDeliveryForSubtask = project.agentDeliveries?.find((delivery) => delivery.id === win.lastAgentDeliveryId);
  const activeMessageForSubtask = project.messages?.find((message) => message.id === activeDeliveryForSubtask?.messageId);
  const task = project.tasks.find((item) => item.id === storedEvent.taskId)
    || project.tasks.find((item) => item.id === activeDeliveryForSubtask?.taskId)
    || findTaskForDesktop(project, win.desktopId);
  const subtask = task?.subtasks.find((item) => item.id === storedEvent.subtaskId)
    || task?.subtasks.find((item) => item.id === activeDeliveryForSubtask?.subtaskId)
    || task?.subtasks.find((item) => activeMessageForSubtask?.id && item.sourceMessageId === activeMessageForSubtask.id && item.roleId === win.roleId)
    || task?.subtasks.find((item) => activeMessageForSubtask?.subtaskRefs?.[win.roleId] && item.id === activeMessageForSubtask.subtaskRefs[win.roleId])
    || task?.subtasks.find((item) => item.roleId === win.roleId && normalizeSubtaskStatus(item.status) !== "done")
    || task?.subtasks.find((item) => item.roleId === win.roleId);
  const ignoresWaitingResume = false;

  if (status && !ignoresWaitingResume) {
    win.status = SUBTASK_STATUS_DEFS[status]?.windowStatus || "working";
    if (win.agentSession) {
      win.agentSession.lastEventAt = storedEvent.receivedAt;
    }
  } else if (ignoresWaitingResume) {
    recordAppLog("agent.event.status_ignored", {
      projectId: project.id,
      windowId: win.id,
      taskId: task?.id || "",
      subtaskId: subtask?.id || "",
      status,
      reason: "waiting-requires-manual-resume"
    }, "warn");
  }

  if (task && subtask && status && !ignoresWaitingResume) {
    applyKernelStepStatusAction(project, task, subtask, status, {
      at: storedEvent.receivedAt,
      type: "renderer.agent-event.status",
      source: "agent-event",
      renewLease: status === "running",
      eventId: storedEvent.id
    });
  }

  const activeDelivery = activeDeliveryForSubtask || project.agentDeliveries?.find((delivery) => delivery.id === win.lastAgentDeliveryId);
  if (activeDelivery && subtask) {
    activeDelivery.subtaskId ||= subtask.id;
  }
  if (activeDelivery && ["sent", "submitted", "responded", "waiting"].includes(activeDelivery.status) && !ignoresWaitingResume) {
    const previousDeliveryStatus = activeDelivery.status;
    if (status === "waiting") {
      activeDelivery.status = "waiting";
      activeDelivery.waitingAt = storedEvent.receivedAt;
      activeDelivery.lastFeedback = "Agent 正在等待人工确认。";
    } else if (status === "done") {
      activeDelivery.status = "completed";
      activeDelivery.completedAt = storedEvent.receivedAt;
      activeDelivery.completionStatus = status;
      activeDelivery.respondedAt ||= storedEvent.receivedAt;
      activeDelivery.stuckDetectedAt = "";
      activeDelivery.lastFeedback = "Agent completed this delivery.";
      if (deliveryStuckTimers.has(activeDelivery.id)) {
        clearTimeout(deliveryStuckTimers.get(activeDelivery.id));
        deliveryStuckTimers.delete(activeDelivery.id);
      }
      if (win.lastAgentDeliveryId === activeDelivery.id) {
        win.lastAgentDeliveryId = "";
        win.lastInjectedMessageId = "";
      }
    } else if (["running"].includes(status) && activeDelivery.status !== "responded") {
      activeDelivery.status = "responded";
      activeDelivery.respondedAt = storedEvent.receivedAt;
      activeDelivery.lastFeedback = "Agent 已产生结构化事件。";
    }
    activeDelivery.updatedAt = storedEvent.receivedAt;
    if (activeDelivery.status !== previousDeliveryStatus) {
      recordAppLog("agent.delivery.status.changed", {
        projectId: project.id,
        deliveryId: activeDelivery.id,
        messageId: activeDelivery.messageId,
        windowId: win.id,
        previousStatus: previousDeliveryStatus,
        status: activeDelivery.status,
        source: "agent-event"
      });
    }
  }

  recordAppLog("agent.event.applied", {
    projectId: project.id,
    windowId: win.id,
    roleId: win.roleId,
    provider: storedEvent.provider,
    sessionId: storedEvent.sessionId,
    taskId: task?.id || "",
    subtaskId: subtask?.id || "",
    status: storedEvent.status,
    type: storedEvent.type,
    structured: storedEvent.structured,
    messageId: createdMessage?.id || ""
  });
  if (createdMessage) {
    recordAppLog("role.message.agent-created", {
      projectId: project.id,
      taskId: createdMessage.taskId || "",
      messageId: createdMessage.id,
      fromRoleId: createdMessage.fromRoleId,
      toRoleIds: createdMessage.toRoleIds,
      source: createdMessage.source
    });
    persistAgentPoolMessages(project, [createdMessage], "agent-event")
      .then(() => saveState())
      .catch((error) => {
        recordAppLog("agent.pool.persist.error", {
          projectId: project.id,
          messageId: createdMessage.id,
          error: error.message
        }, "error");
      });
    scheduleAgentAutoWorkflow(createdMessage.id, storedEvent.id);
  }
  saveState();
  render();
  if (status === "done" && !ignoresWaitingResume) {
    scheduleAgentDeliveryQueueDrain(win.id, 350);
  }
  return true;
}

function getStatusLabel(status) {
  return {
    idle: "空闲",
    thinking: "分析",
    working: "执行",
    talking: "协作",
    waiting: "等待",
    blocked: "阻塞",
    done: "完成",
    failed: "失败"
  }[status] || "空闲";
}

function openContextMenu(event) {
  event.preventDefault();
  contextMenu = {
    x: event.clientX,
    y: event.clientY
  };
  roleMenu = null;
  refreshFloatingMenus();
}

function openRoleMenu(type, anchorElement) {
  pendingProgramType = type;
  const rect = anchorElement.getBoundingClientRect();
  roleMenu = {
    x: rect.right + 8,
    y: rect.top
  };
  refreshFloatingMenus();
}

function closeMenus() {
  contextMenu = null;
  roleMenu = null;
  openAppMenuId = null;
  refreshFloatingMenus();
}

function refreshFloatingMenus() {
  const frame = appRoot?.querySelector(".app-frame");
  if (!frame) {
    return;
  }
  frame.querySelectorAll(":scope > .context-menu, :scope > .role-menu").forEach((node) => node.remove());
  const floatingMarkup = [
    contextMenu ? renderContextMenu() : "",
    roleMenu ? renderRoleMenu() : ""
  ].join("");
  if (floatingMarkup.trim()) {
    frame.insertAdjacentHTML("beforeend", floatingMarkup);
  }
}

function showCreateProjectModal() {
  closeMenus();
  const defaultPath = getProject()?.path || "D:\\CosS";
  renderModal(`
    <div class="modal">
      <h2>新建项目</h2>
      <p>每个项目都会启动一个独立的类桌面工作区，保存自己的程序、角色和任务状态。</p>
      <div class="form-grid">
        <div class="field">
          <label for="projectName">项目名称</label>
          <input id="projectName" value="新项目" />
        </div>
        <div class="field">
          <label for="projectPath">项目路径</label>
          <div class="path-picker-row">
            <input id="projectPath" value="${escapeHtml(defaultPath)}" />
            <button class="secondary-button" data-action="choose-project-directory">选择文件夹</button>
          </div>
          <div id="projectPathStatus" class="form-status muted">请选择项目保存路径，CosS 会在该路径启动对应工作区。</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">取消</button>
        <button class="primary-button" data-action="create-project">创建并开机</button>
      </div>
    </div>
  `);
}

function showCreateTaskModal() {
  closeMenus();
  const activeModel = getActiveModelConfig();
  pendingTaskPlanDraft = null;
  renderModal(`
    <div class="modal">
      <h2>新建任务</h2>
      <p>系统会先生成任务计划，确认后才会分派给角色。当前模型：${escapeHtml(activeModel.label)} / ${escapeHtml(activeModel.modelName)}。</p>
      <div class="field">
        <label for="taskGoal">任务目标</label>
        <textarea id="taskGoal">实现用户登录页面，并接入后端登录接口。</textarea>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">取消</button>
        <button class="primary-button" data-action="create-task">生成计划</button>
      </div>
    </div>
  `);
}

function renderTaskPlanPreviewModal(draft) {
  const plan = draft.taskPlan;
  const sourceLabel = draft.llmResult?.ok ? "Kernel Planner" : "本地降级";
  const neededAgentRoleIds = uniqueRoleIds(plan.neededAgentRoleIds || []);
  const firstRoundRoleIds = getInitialCoordinatorRoleIds(plan, { subtasks: plan.subtasks || [] });
  const neededAgentLabel = neededAgentRoleIds.map((roleId) => getRole(roleId).name).join("、");
  const firstRoundLabel = firstRoundRoleIds.map((roleId) => getRole(roleId).name).join("、");
  renderModal(`
    <div class="modal task-plan-modal">
      <h2>确认 Kernel 线性工作流</h2>
      <p>Kernel Planner 会在创建任务时生成完整线性 Step；CosS 每次只投递一个 Step，当前 Agent 完成后再启动下一步。</p>
      <div class="task-plan-summary">
        <strong>${escapeHtml(sourceLabel)} · ${escapeHtml(draft.activeModel.label)} / ${escapeHtml(draft.activeModel.modelName)}</strong>
        <span>${escapeHtml(plan.summary || "模型已生成任务计划。")}</span>
        <span>需要 Agent：${escapeHtml(neededAgentLabel || "系统自动选择")}</span>
        <span>入口 Agent：${escapeHtml(firstRoundLabel || "系统自动选择")}</span>
        ${draft.llmResult?.ok ? "" : `<em>${escapeHtml(draft.llmResult?.error || "模型规划失败，已使用本地规则。")}</em>`}
      </div>
      <div class="task-plan-list">
        ${plan.subtasks.map((subtask, index) => `
          <div class="task-plan-item editable" data-plan-index="${index}">
            <div class="task-plan-index">${index + 1}</div>
            <div>
              <div class="task-plan-edit-grid">
                <label>
                  <span>角色</span>
                  <select data-plan-field="roleId" data-plan-index="${index}">
                    ${ROLE_TEMPLATES.map((role) => `<option value="${escapeHtml(role.id)}" ${role.id === subtask.roleId ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("")}
                  </select>
                </label>
                <label>
                  <span>子任务标题</span>
                  <input value="${escapeHtml(subtask.title)}" data-plan-field="title" data-plan-index="${index}" />
                </label>
              </div>
              <label class="task-plan-description">
                <span>子任务描述</span>
                <textarea data-plan-field="description" data-plan-index="${index}">${escapeHtml(subtask.description)}</textarea>
              </label>
              <div class="task-plan-dependency">
                依赖：${subtask.dependsOn?.length ? escapeHtml(subtask.dependsOn.join("、")) : "入口 Step"}
              </div>
              <div class="task-plan-item-actions">
                <button class="secondary-button compact" data-action="delete-task-plan-subtask" data-plan-index="${index}" ${plan.subtasks.length <= 1 ? "disabled" : ""}>删除子任务</button>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="task-plan-edit-actions">
        <button class="secondary-button" data-action="add-task-plan-subtask">新增子任务</button>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="show-create-task">返回修改</button>
        <button class="primary-button" data-action="confirm-task-plan">确认并分派</button>
      </div>
    </div>
  `);
}

function updatePendingTaskPlanField(index, field, value) {
  if (!pendingTaskPlanDraft?.taskPlan?.subtasks?.[index] || !["roleId", "title", "description"].includes(field)) {
    return;
  }
  const subtask = pendingTaskPlanDraft.taskPlan.subtasks[index];
  if (field === "roleId") {
    subtask.roleId = getRole(value).id;
  } else {
    subtask[field] = String(value || "").trimStart().slice(0, field === "title" ? 80 : 260);
  }
  recordAppLog("task.plan.edited", {
    projectId: pendingTaskPlanDraft.projectId,
    draftId: pendingTaskPlanDraft.id,
    index,
    field
  });
}

function addPendingTaskPlanSubtask() {
  if (!pendingTaskPlanDraft?.taskPlan) {
    return;
  }
  const roleId = ROLE_TEMPLATES.find((role) => role.id !== "product-manager")?.id || "frontend-engineer";
  pendingTaskPlanDraft.taskPlan.subtasks.push({
    roleId,
    title: "新子任务",
    description: "请补充该子任务的执行说明。"
  });
  recordAppLog("task.plan.subtask.added", {
    projectId: pendingTaskPlanDraft.projectId,
    draftId: pendingTaskPlanDraft.id,
    count: pendingTaskPlanDraft.taskPlan.subtasks.length
  });
  renderTaskPlanPreviewModal(pendingTaskPlanDraft);
}

function deletePendingTaskPlanSubtask(index) {
  if (!pendingTaskPlanDraft?.taskPlan || pendingTaskPlanDraft.taskPlan.subtasks.length <= 1) {
    return;
  }
  pendingTaskPlanDraft.taskPlan.subtasks.splice(index, 1);
  recordAppLog("task.plan.subtask.deleted", {
    projectId: pendingTaskPlanDraft.projectId,
    draftId: pendingTaskPlanDraft.id,
    index,
    count: pendingTaskPlanDraft.taskPlan.subtasks.length
  });
  renderTaskPlanPreviewModal(pendingTaskPlanDraft);
}

function getMessageTaskLabel(taskId) {
  return taskId ? `任务ID：${taskId}` : "私聊";
}

function getCurrentTaskFilterId(project = getProject()) {
  if (!project) {
    return "";
  }
  const focusedWindow = project.windows.find((win) => win.id === focusedWindowId);
  if (focusedWindow?.agentSession?.taskId) {
    return focusedWindow.agentSession.taskId;
  }
  const activeDesktop = getActiveDesktop(project);
  if (activeDesktop?.lastTaskId) {
    return activeDesktop.lastTaskId;
  }
  if (activeDesktop?.taskId) {
    return activeDesktop.taskId;
  }
  return findTaskForDesktop(project, activeDesktop?.id)?.id || "";
}

function renderRoleSelectOptions(selectedRoleId, excludedRoleId = "") {
  return ROLE_TEMPLATES
    .filter((role) => role.id !== excludedRoleId)
    .map((role) => `<option value="${escapeHtml(role.id)}" ${role.id === selectedRoleId ? "selected" : ""}>${escapeHtml(role.name)}</option>`)
    .join("");
}

function getDefaultMessageRoles(defaults = {}) {
  const project = getProject();
  const focusedWindow = project?.windows.find((win) => win.id === focusedWindowId);
  const fromRoleId = getRole(defaults.fromRoleId || focusedWindow?.roleId || "product-manager").id;
  const collaborators = project?.messages
    ?.filter((message) => message.fromRoleId === fromRoleId || message.toRoleIds.includes(fromRoleId))
    .flatMap((message) => message.fromRoleId === fromRoleId ? message.toRoleIds : [message.fromRoleId])
    .filter((roleId) => roleId !== fromRoleId) || [];
  const toRoleId = getRole(defaults.toRoleId || collaborators[0] || ROLE_TEMPLATES.find((role) => role.id !== fromRoleId)?.id || "frontend-engineer").id;
  return { fromRoleId, toRoleId };
}

function getAgentWindowsForRole(project, roleId, taskId = "", options = {}) {
  const task = taskId ? project?.tasks?.find((item) => item.id === taskId) : null;
  const conversationId = getTaskConversationId(task);
  const windows = (project?.windows || [])
    .filter((win) => win.type === "terminal")
    .filter((win) => normalizeTerminalMode(win.terminalMode) === "agent")
    .filter((win) => win.roleId === roleId)
    .filter((win) => !conversationId || win.desktopId === conversationId || win.agentSession?.taskId === taskId)
    .sort((a, b) => {
      const aMatchesTask = taskId && (a.agentSession?.taskId === taskId || getTaskContextForWindow(a, project).taskId === taskId);
      const bMatchesTask = taskId && (b.agentSession?.taskId === taskId || getTaskContextForWindow(b, project).taskId === taskId);
      if (aMatchesTask !== bMatchesTask) {
        return aMatchesTask ? -1 : 1;
      }
      const aMatchesConversation = conversationId && a.desktopId === conversationId;
      const bMatchesConversation = conversationId && b.desktopId === conversationId;
      if (aMatchesConversation !== bMatchesConversation) {
        return aMatchesConversation ? -1 : 1;
      }
      return normalizeZIndex(b.z) - normalizeZIndex(a.z);
    });
  return options.requireInjectable
    ? windows.filter((win) => isAgentTerminalInjectable(win))
    : windows;
}

function getRunningAgentWindowsForRole(project, roleId, taskId = "") {
  return getAgentWindowsForRole(project, roleId, taskId, { requireInjectable: true });
}

function isAgentDeliveryInProgress(delivery) {
  return ["sent", "submitted", "responded", "waiting"].includes(normalizeDeliveryStatus(delivery?.status));
}

function getDeliveryTimeMs(delivery) {
  const value = delivery?.updatedAt || delivery?.submittedAt || delivery?.sentAt || delivery?.createdAt || "";
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function getTaskForDelivery(project, delivery) {
  if (!project || !delivery?.taskId) {
    return null;
  }
  return (project.tasks || []).find((task) => task.id === delivery.taskId) || null;
}

function shouldAutoReleaseActiveDelivery(project, win, delivery, options = {}) {
  if (!project || !win || !delivery || !isAgentDeliveryInProgress(delivery)) {
    return false;
  }
  const status = normalizeDeliveryStatus(delivery.status);
  if (status === "waiting") {
    return false;
  }
  if (options.force === true) {
    return true;
  }
  if (delivery.stuckDetectedAt) {
    return true;
  }
  const task = getTaskForDelivery(project, delivery);
  if (task && normalizeSubtaskStatus(task.status) === "done") {
    return true;
  }
  if (["idle", "done"].includes(win.status || "")) {
    return true;
  }
  const ageMs = Date.now() - getDeliveryTimeMs(delivery);
  if (status === "responded" && ageMs > 15000) {
    return true;
  }
  if (status === "submitted" && ageMs > 60000 && isCodeBuddyTerminalPromptReady(win)) {
    return true;
  }
  return false;
}

function releaseActiveAgentDelivery(project, win, delivery, reason = "auto-release") {
  if (!project || !win || !delivery) {
    return false;
  }
  const now = new Date().toISOString();
  const previousStatus = delivery.status;
  delivery.status = reason === "task-ended" || previousStatus === "responded" ? "completed" : "failed";
  delivery.completedAt ||= now;
  delivery.completionStatus ||= reason;
  delivery.updatedAt = now;
  delivery.stuckDetectedAt = "";
  delivery.lastFeedback = `Released stale active delivery before continuing queue: ${reason}.`;
  if (delivery.status === "failed") {
    delivery.lastError = `Released before next Agent delivery: ${reason}.`;
  }
  if (win.lastAgentDeliveryId === delivery.id) {
    win.lastAgentDeliveryId = "";
    win.lastInjectedMessageId = "";
  }
  if (deliveryStuckTimers.has(delivery.id)) {
    clearTimeout(deliveryStuckTimers.get(delivery.id));
    deliveryStuckTimers.delete(delivery.id);
  }
  recordAppLog("agent.delivery.active-released", {
    projectId: project.id,
    windowId: win.id,
    roleId: win.roleId,
    deliveryId: delivery.id,
    messageId: delivery.messageId,
    previousStatus,
    status: delivery.status,
    reason
  }, "warn");
  return true;
}

function getActiveAgentDeliveryForWindow(project, windowId, excludeDeliveryId = "") {
  return (project?.agentDeliveries || []).find((delivery) => (
    delivery.windowId === windowId
    && delivery.id !== excludeDeliveryId
    && isAgentDeliveryInProgress(delivery)
  )) || null;
}

function getPendingAutoWorkflowDeliveriesForWindow(project, windowId) {
  return (project?.agentDeliveries || [])
    .filter((delivery) => (
      delivery.windowId === windowId
      && delivery.autoWorkflow
      && normalizeDeliveryStatus(delivery.status) === "pending"
      && project.messages?.some((message) => message.id === delivery.messageId)
    ))
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
}

function getPreferredAgentWindowForRole(project, roleId, taskId = "") {
  const windows = getRunningAgentWindowsForRole(project, roleId, taskId);
  if (windows.length === 0) {
    return null;
  }
  return windows.find((win) => !getActiveAgentDeliveryForWindow(project, win.id)) || windows[0];
}

function isAgentTerminalInjectable(win) {
  if (!win || !terminalBackendReadyIds.has(win.id)) {
    return false;
  }
  const activeMode = String(terminalBackendActiveModes.get(win.id) || "").toLowerCase();
  if (["error", "installing", "static", "shell"].includes(activeMode)) {
    return false;
  }
  return true;
}

function getTerminalRecentOutput(windowId) {
  return stripTerminalControlChars(terminalRecentOutput.get(windowId) || "");
}

function isCodeBuddyTerminalPromptReady(win) {
  if (!isCodeBuddyAgentWindow(win)) {
    return true;
  }
  if (String(terminalBackendActiveModes.get(win.id) || "").toLowerCase() === "mock") {
    return true;
  }
  const recentOutput = getTerminalRecentOutput(win.id);
  if (!recentOutput) {
    return false;
  }
  return /CodeBuddy Code|Recent activity|Press\s+(?:Esc|Ctrl|\/)|^\s*>/im.test(recentOutput);
}

async function waitForAgentTerminalInteractiveReady(win, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAgentTerminalInjectable(win)) {
      await wait(120);
      continue;
    }
    if (isCodeBuddyTerminalPromptReady(win)) {
      if (isCodeBuddyAgentWindow(win)) {
        await wait(700);
      }
      return true;
    }
    await wait(160);
  }
  return isAgentTerminalInjectable(win) && (!isCodeBuddyAgentWindow(win) || isCodeBuddyTerminalPromptReady(win));
}

function getInjectableWindowsForMessage(project, message) {
  return uniqueRoleIds(message?.toRoleIds || [])
    .map((roleId) => getPreferredAgentWindowForRole(project, roleId, message?.taskId || ""))
    .filter(Boolean);
}

function isAgentAutoWorkflowActive() {
  return state.settings.agentAutoWorkflowEnabled === true && state.settings.agentAutoWorkflowPaused !== true;
}

function getAgentAutoWorkflowStatusLabel() {
  if (!state.settings.agentAutoWorkflowEnabled) {
    return "未开启";
  }
  return state.settings.agentAutoWorkflowPaused ? "已中止" : "运行中";
}

function ensureAgentAutoWorkflowRunning(reason = "auto-start") {
  state.settings ||= {};
  const wasEnabled = state.settings.agentAutoWorkflowEnabled === true;
  const wasPaused = state.settings.agentAutoWorkflowPaused === true;
  state.settings.agentAutoWorkflowEnabled = true;
  state.settings.agentAutoWorkflowPaused = false;
  if (!wasEnabled || wasPaused) {
    recordAppLog("agent.workflow.auto-started", {
      projectId: state.activeProjectId || "",
      reason,
      wasEnabled,
      wasPaused
    });
  }
}

async function waitForAutoWorkflowTargets(message, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  const project = getProject();
  const roleIds = uniqueRoleIds(message?.toRoleIds || []);
  while (Date.now() < deadline) {
    const ready = roleIds.every((roleId) => getRunningAgentWindowsForRole(project, roleId, message?.taskId || "").length > 0);
    if (ready) {
      return true;
    }
    await wait(120);
  }
  return roleIds.every((roleId) => getRunningAgentWindowsForRole(project, roleId, message?.taskId || "").length > 0);
}

async function waitForAutoWorkflowTargetInteractivity(message, timeoutMs = 14000) {
  const project = getProject();
  const targets = getInjectableWindowsForMessage(project, message);
  if (targets.length === 0) {
    return { ok: false, reason: "no-injectable-agent-terminal" };
  }

  const deadline = Date.now() + timeoutMs;
  for (const win of targets) {
    const remaining = Math.max(1200, deadline - Date.now());
    const ready = await waitForAgentTerminalInteractiveReady(win, remaining);
    if (!ready) {
      return {
        ok: false,
        reason: isCodeBuddyAgentWindow(win) ? "codebuddy-prompt-not-ready" : "agent-terminal-not-ready",
        windowId: win.id,
        roleId: win.roleId
      };
    }
  }

  return { ok: true, targets };
}

async function ensureAutoWorkflowAgentTargets(message) {
  const project = getProject();
  if (!project || !message) {
    return { ok: false, reason: "missing-project-or-message" };
  }

  const task = message.taskId ? project.tasks.find((item) => item.id === message.taskId) : null;
  const desktopId = getTaskConversationId(task) || getActiveDesktopId(project);
  const createdWindowIds = [];
  uniqueRoleIds(message.toRoleIds || []).forEach((roleId) => {
    const existing = getAgentWindowsForRole(project, roleId, message.taskId || "", { requireInjectable: false });
    if (existing.length > 0) {
      return;
    }

    const win = createProgram("terminal", roleId, {
      terminalMode: "agent",
      agentProvider: state.settings.agentProvider,
      desktopId,
      title: `${getRole(roleId).name} Agent(${getAgentProviderLabel(state.settings.agentProvider)})`
    });
    if (win) {
      createdWindowIds.push(win.id);
      recordAppLog("agent.workflow.terminal-created", {
        projectId: project.id,
        messageId: message.id,
        roleId,
        windowId: win.id,
        desktopId
      });
    }
  });

  const ready = await waitForAutoWorkflowTargets(message, 12000);
  const interactive = ready
    ? await waitForAutoWorkflowTargetInteractivity(message)
    : { ok: false, reason: "target-agent-not-ready", targets: [] };
  return {
    ok: ready && interactive.ok,
    createdWindowIds,
    reason: ready ? (interactive.reason || "") : "target-agent-not-ready",
    targetWindowIds: interactive.targets?.map((win) => win.id) || []
  };
}

function stopAgentAutoWorkflow(reason = "user-stop") {
  const project = getProject();
  state.settings.agentAutoWorkflowPaused = true;
  let canceledCount = 0;
  if (project?.agentDeliveries) {
    const now = new Date().toISOString();
    project.agentDeliveries.forEach((delivery) => {
      if (delivery.autoWorkflow && delivery.status === "pending") {
        delivery.status = "canceled";
        delivery.canceledAt = now;
        delivery.updatedAt = now;
        delivery.lastFeedback = "用户已暂停 Kernel 自动调度。";
        canceledCount += 1;
      }
    });
  }
  recordAppLog("agent.workflow.stopped", {
    projectId: project?.id || "",
    reason,
    canceledCount
  }, "warn");
  saveState();
  render();
}

function scheduleAgentDeliveryQueueDrain(windowId, delayMs = 250) {
  if (!windowId || !state.settings.agentAutoWorkflowEnabled) {
    return;
  }
  if (agentDeliveryDrainTimers.has(windowId)) {
    clearTimeout(agentDeliveryDrainTimers.get(windowId));
  }
  const timer = setTimeout(() => {
    agentDeliveryDrainTimers.delete(windowId);
    drainAgentDeliveryQueueForWindow(windowId).catch((error) => {
      recordAppLog("agent.workflow.queue-drain.error", {
        projectId: state.activeProjectId || "",
        windowId,
        error: error.message
      }, "error");
    });
  }, delayMs);
  agentDeliveryDrainTimers.set(windowId, timer);
}

async function drainAgentDeliveryQueueForWindow(windowId) {
  if (!isAgentAutoWorkflowActive()) {
    return { ok: false, reason: "auto-workflow-inactive" };
  }
  const project = getProject();
  const win = project?.windows?.find((item) => item.id === windowId);
  if (!project || !win) {
    return { ok: false, reason: "window-not-found" };
  }
  let activeDelivery = getActiveAgentDeliveryForWindow(project, windowId);
  if (activeDelivery && shouldAutoReleaseActiveDelivery(project, win, activeDelivery)) {
    const task = getTaskForDelivery(project, activeDelivery);
    const reason = task && normalizeSubtaskStatus(task.status) === "done"
      ? "task-ended"
      : (activeDelivery.stuckDetectedAt ? "stuck-detected" : "stale-active-delivery");
    releaseActiveAgentDelivery(project, win, activeDelivery, reason);
    activeDelivery = null;
    saveState();
  }
  if (activeDelivery) {
    recordAppLog("agent.workflow.queue-drain.waiting", {
      projectId: project.id,
      windowId,
      roleId: win.roleId,
      activeDeliveryId: activeDelivery.id,
      activeMessageId: activeDelivery.messageId
    });
    return { ok: false, reason: "agent-window-busy" };
  }

  const pendingDelivery = getPendingAutoWorkflowDeliveriesForWindow(project, windowId)[0];
  if (!pendingDelivery) {
    return { ok: false, reason: "no-pending-delivery" };
  }

  const ready = await waitForAgentTerminalInteractiveReady(win, 5000);
  if (!ready) {
    pendingDelivery.lastFeedback = "Queued; target Agent terminal is not interactive yet.";
    pendingDelivery.updatedAt = new Date().toISOString();
    recordAppLog("agent.workflow.queue-drain.not-ready", {
      projectId: project.id,
      windowId,
      roleId: win.roleId,
      deliveryId: pendingDelivery.id,
      messageId: pendingDelivery.messageId
    }, "warn");
    saveState();
    scheduleAgentDeliveryQueueDrain(windowId, 2000);
    return { ok: false, reason: "agent-terminal-not-ready" };
  }

  const message = project.messages.find((item) => item.id === pendingDelivery.messageId);
  const result = await confirmAgentDelivery(pendingDelivery.id, {
    autoWorkflow: true,
    sourceEventId: pendingDelivery.autoWorkflowSourceEventId || "queue-drain"
  });
  if (result?.ok && message) {
    message.autoWorkflow = true;
    message.autoWorkflowStatus = "submitted";
    message.autoWorkflowDispatchedAt = new Date().toISOString();
    recordAppLog("agent.workflow.queue-drained", {
      projectId: project.id,
      windowId,
      roleId: win.roleId,
      deliveryId: pendingDelivery.id,
      messageId: pendingDelivery.messageId
    });
    saveState();
    render();
  }
  return result;
}

function getPendingKernelAutoWorkflowMessages(project = getProject()) {
  if (!project) {
    return [];
  }
  finalizeCompletedKernelDispatchMessages(project, "pending-kernel-scan");
  const retryStatuses = new Set([
    "",
    "disabled",
    "paused",
    "stopped",
    "target-agent-not-ready",
    "no-running-agent-terminal",
    "no-injectable-agent-terminal",
    "agent-terminal-not-ready",
    "codebuddy-prompt-not-ready",
    "queue-failed",
    "delivery-not-confirmed",
    "external-queued",
    "queued",
    "preparing",
    "terminal-ready-queued"
  ]);
  const activeDeliveryStatuses = new Set(["pending", "sent", "submitted", "responded", "waiting", "completed"]);
  return (project.messages || []).filter((message) => {
    if ((message.source || "") !== "orchestrator-dispatch" || !message.toRoleIds?.length) {
      return false;
    }
    if (isKernelDispatchMessageForCompletedWork(project, message)) {
      return false;
    }
    if (!retryStatuses.has(message.autoWorkflowStatus || "")) {
      return false;
    }
    return !(project.agentDeliveries || []).some((delivery) => (
      delivery.messageId === message.id
      && activeDeliveryStatuses.has(delivery.status)
    ));
  });
}

function resumePendingKernelAutoWorkflowMessages(reason = "auto-workflow-resume") {
  if (!isAgentAutoWorkflowActive()) {
    return [];
  }
  const project = getProject();
  const finalizedCount = finalizeCompletedKernelDispatchMessages(project, reason);
  const messages = getPendingKernelAutoWorkflowMessages(project);
  if (messages.length === 0) {
    if (finalizedCount > 0) {
      saveState();
      render();
    }
    return [];
  }
  messages.forEach((message) => {
    message.autoWorkflow = true;
    message.autoWorkflowStatus = "queued";
  });
  recordAppLog("agent.workflow.pending-kernel-messages-resumed", {
    projectId: project.id,
    reason,
    messageIds: messages.map((message) => message.id),
    count: messages.length
  });
  saveState();
  messages.forEach((message) => scheduleAgentAutoWorkflow(message.id, reason));
  return messages;
}

function startPendingKernelAutoWorkflowPump() {
  if (pendingKernelAutoWorkflowTimer) {
    return;
  }
  pendingKernelAutoWorkflowTimer = setInterval(() => {
    if (!isAgentAutoWorkflowActive() || saveStateInFlight || saveStateDirty) {
      return;
    }
    try {
      const messages = resumePendingKernelAutoWorkflowMessages("kernel-sequence-pump");
      if (messages.length > 0) {
        recordAppLog("agent.workflow.kernel-sequence-pump.dispatched", {
          projectId: getProject()?.id || "",
          messageIds: messages.map((message) => message.id),
          count: messages.length
        });
      }
    } catch (error) {
      recordAppLog("agent.workflow.kernel-sequence-pump.error", {
        projectId: state.activeProjectId || "",
        error: error.message
      }, "error");
    }
  }, 1200);
}

function resumeAgentAutoWorkflow() {
  state.settings.agentAutoWorkflowEnabled = true;
  state.settings.agentAutoWorkflowPaused = false;
  recordAppLog("agent.workflow.resumed", {
    projectId: state.activeProjectId || ""
  });
  saveState();
  render();
  resumePendingKernelAutoWorkflowMessages("manual-resume");
  getProject()?.windows
    ?.filter((win) => normalizeTerminalMode(win.terminalMode) === "agent")
    .forEach((win) => scheduleAgentDeliveryQueueDrain(win.id, 200));
}

async function autoDispatchAgentMessage(messageId, sourceEventId = "") {
  const project = getProject();
  const message = project?.messages?.find((item) => item.id === messageId);
  if (!project || !message) {
    return { ok: false, reason: "message-not-found" };
  }
  if (markKernelDispatchMessageCompleted(project, message, `auto-dispatch:${sourceEventId || "unknown"}`)) {
    saveState();
    render();
    return { ok: false, reason: "completed-work" };
  }

  if (!state.settings.agentAutoWorkflowEnabled) {
    return { ok: false, reason: "disabled" };
  }
  if (state.settings.agentAutoWorkflowPaused) {
    message.autoWorkflow = true;
    message.autoWorkflowStatus = "paused";
    message.autoWorkflowStoppedAt = new Date().toISOString();
    saveState();
    recordAppLog("agent.workflow.auto-dispatch.skipped", {
      projectId: project.id,
      messageId,
      sourceEventId,
      reason: "paused"
    }, "warn");
    return { ok: false, reason: "paused" };
  }

  message.autoWorkflow = true;
  message.autoWorkflowStatus = "preparing";
  saveState();
  recordAppLog("agent.workflow.auto-dispatch.started", {
    projectId: project.id,
    messageId,
    sourceEventId,
    fromRoleId: message.fromRoleId,
    toRoleIds: message.toRoleIds,
    taskId: message.taskId || ""
  });

  const missingPoolPath = uniqueRoleIds(message.toRoleIds || []).some((roleId) => !message.agentPoolPaths?.[roleId]);
  if (missingPoolPath) {
    await persistAgentPoolMessages(project, [message], "auto-dispatch-backfill");
    saveState();
  }

  const targetResult = await ensureAutoWorkflowAgentTargets(message);
  if (!targetResult.ok || !isAgentAutoWorkflowActive()) {
    message.autoWorkflowStatus = state.settings.agentAutoWorkflowPaused ? "stopped" : targetResult.reason || "target-not-ready";
    message.autoWorkflowStoppedAt = new Date().toISOString();
    saveState();
    render();
    recordAppLog("agent.workflow.auto-dispatch.skipped", {
      projectId: project.id,
      messageId,
      sourceEventId,
      reason: message.autoWorkflowStatus,
      createdWindowIds: targetResult.createdWindowIds || []
    }, "warn");
    return { ok: false, reason: message.autoWorkflowStatus };
  }

  const queueResult = queueAgentDeliveriesForMessage(messageId, {
    limit: 8,
    autoWorkflow: true,
    sourceEventId
  });
  if (!queueResult.ok) {
    message.autoWorkflowStatus = queueResult.reason || "queue-failed";
    saveState();
    render();
    recordAppLog("agent.workflow.auto-dispatch.failed", {
      projectId: project.id,
      messageId,
      sourceEventId,
      reason: message.autoWorkflowStatus
    }, "warn");
    return queueResult;
  }

  let confirmedCount = 0;
  let deferredCount = 0;
  for (const deliveryId of queueResult.deliveryIds || []) {
    if (!isAgentAutoWorkflowActive()) {
      break;
    }
    const result = await confirmAgentDelivery(deliveryId, {
      autoWorkflow: true,
      sourceEventId
    });
    if (result?.ok) {
      confirmedCount += 1;
    } else if (result?.deferred) {
      deferredCount += 1;
    }
  }

  message.autoWorkflowStatus = isAgentAutoWorkflowActive()
    ? (confirmedCount > 0 ? "submitted" : (deferredCount > 0 ? "queued" : "delivery-not-confirmed"))
    : "stopped";
  if (confirmedCount > 0) {
    message.autoWorkflowDispatchedAt = new Date().toISOString();
  }
  saveState();
  render();
  recordAppLog("agent.workflow.auto-dispatched", {
    projectId: project.id,
    messageId,
    sourceEventId,
    queuedCount: queueResult.queuedCount,
    confirmedCount,
    deferredCount,
    status: message.autoWorkflowStatus,
    stopped: !isAgentAutoWorkflowActive()
  });
  return {
    ok: confirmedCount > 0 || deferredCount > 0,
    queuedCount: queueResult.queuedCount,
    confirmedCount,
    deferredCount
  };
}

function scheduleAgentAutoWorkflow(messageId, sourceEventId = "") {
  if (!state.settings.agentAutoWorkflowEnabled) {
    return;
  }
  setTimeout(() => {
    autoDispatchAgentMessage(messageId, sourceEventId).catch((error) => {
      recordAppLog("agent.workflow.auto-dispatch.error", {
        projectId: state.activeProjectId || "",
        messageId,
        sourceEventId,
        error: error.message
      }, "error");
    });
  }, 0);
}

function scheduleAgentAutoWorkflowForMessages(messages, sourceEventId = "") {
  const project = getProject();
  const finalizedCount = finalizeCompletedKernelDispatchMessages(project, `schedule:${sourceEventId || "unknown"}`);
  const list = (messages || []).filter((message) => (
    message?.id
    && !isKernelDispatchMessageForCompletedWork(project, message)
    && message.autoWorkflowStatus !== "completed"
  ));
  if (!state.settings.agentAutoWorkflowEnabled || list.length === 0) {
    if (finalizedCount > 0) {
      saveState();
      render();
    }
    return;
  }

  recordAppLog("agent.workflow.batch-scheduled", {
    projectId: state.activeProjectId || "",
    sourceEventId,
    messageIds: list.map((message) => message.id),
    count: list.length
  });
  list.forEach((message) => scheduleAgentAutoWorkflow(message.id, sourceEventId));
}

function resumeAutoWorkflowMessagesForWindow(win, reason = "terminal-ready") {
  if (!win || !state.settings.agentAutoWorkflowEnabled || state.settings.agentAutoWorkflowPaused) {
    return;
  }
  const project = getProject();
  if (!project) {
    return;
  }
  const finalizedCount = finalizeCompletedKernelDispatchMessages(project, reason);
  const taskContext = getTaskContextForWindow(win, project);
  const retryStatuses = new Set([
    "target-agent-not-ready",
    "no-running-agent-terminal",
    "queue-failed",
    "delivery-not-confirmed",
    "external-queued",
    "queued",
    "preparing"
  ]);
  const messages = (project.messages || []).filter((message) => (
    message.toRoleIds?.includes(win.roleId)
    && (message.autoWorkflow || ["orchestrator-dispatch"].includes(message.source || ""))
    && (!message.taskId || !taskContext.taskId || message.taskId === taskContext.taskId)
    && !isKernelDispatchMessageForCompletedWork(project, message)
    && (!message.autoWorkflowStatus || retryStatuses.has(message.autoWorkflowStatus))
    && !(project.agentDeliveries || []).some((delivery) => (
      delivery.messageId === message.id
      && delivery.windowId === win.id
      && ["pending", "sent", "submitted", "responded", "waiting", "completed"].includes(delivery.status)
    ))
  ));
  if (messages.length === 0) {
    if (finalizedCount > 0) {
      saveState();
      render();
    }
    scheduleAgentDeliveryQueueDrain(win.id, 250);
    return;
  }
  recordAppLog("agent.workflow.terminal-ready-resume", {
    projectId: project.id,
    windowId: win.id,
    roleId: win.roleId,
    reason,
    messageIds: messages.map((message) => message.id),
    count: messages.length
  });
  messages.forEach((message) => {
    message.autoWorkflow = true;
    message.autoWorkflowStatus = "terminal-ready-queued";
    scheduleAgentAutoWorkflow(message.id, reason);
  });
  saveState();
  scheduleAgentDeliveryQueueDrain(win.id, 350);
}

function stripTerminalControlChars(value) {
  return String(value || "")
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

function buildTerminalInstructionPayload(message, targetWindow) {
  const project = getProject();
  const fromRole = getRole(message.fromRoleId);
  const toRole = getRole(targetWindow.roleId);
  const taskContext = getTaskContextForWindow(targetWindow, project);
  const projectMemoryLines = taskContext.projectMemorySummary
    ? ["Project memory:", taskContext.projectMemorySummary, ""]
    : [];
  const taskLabel = message.taskId ? getMessageTaskLabel(message.taskId) : "私聊";
  const agentProvider = normalizeAgentProvider(targetWindow.agentProvider || state.settings.agentProvider);
  const provider = getAgentProviderLabel(agentProvider);
  const permissionPolicy = getAgentPermissionPolicy();
  const poolPath = message.agentPoolPaths?.[targetWindow.roleId] || getAgentPoolMessagePath(targetWindow.roleId, message.id);
  const mcpRetryLines = agentProvider === "codebuddy"
    ? [
        "CodeBuddy Code 后端如果显示 `mcp__coss: Still connecting` 或 `/mcp` 中 coss 为 Disconnected，请等待 5-10 秒后用 ToolSearch queries: coss、mcp、inbox 重试；不要搜索或调用当前后端不存在的等待工具。",
        "如果 coss 工具仍未暴露，请继续完成当前角色工作并输出 COSS_AGENT_EVENT:{\"status\":\"running\",\"message\":\"MCP disconnected; 当前进度说明\",\"toRoleIds\":[]} 作为降级留痕。"
      ]
    : [
        "如果系统提示 `mcp__coss: Still connecting`，请等待几秒后重新搜索或调用 coss 工具；只有当前后端明确提供等待工具时才调用该工具。",
        "不要因为 ToolSearch 暂时没有找到 coss 工具就停止；请至少等待并重试 3 次。"
      ];
  const autoWorkflowLines = message.autoWorkflow || message.source === "agent-event"
    ? [
        "这是 CosS Kernel 分配的上游任务上下文。",
        "请先阅读消息中提到的交接文档、产物路径或注意事项，再继续你的角色工作。",
        "完成自己的部分后，请通过 coss_submit_result({ status: \"done\" }) 提交结果，由 Kernel 启动下一步。"
      ]
    : [];
  return stripTerminalControlChars([
    "请处理来自 CosS 协作时间线的指令。",
    `目标角色：${toRole.name}`,
    `发送角色：${fromRole.name}`,
    `Agent 后端：${provider}`,
    `Agent 权限模式：${permissionPolicy.label}`,
    `频道：${taskLabel}`,
    `消息ID：${message.id}`,
    `角色消息池：${poolPath}`,
    `消息来源：${message.source || "manual"}`,
    "",
    permissionPolicy.instruction,
    "",
    ...autoWorkflowLines,
    ...(autoWorkflowLines.length ? [""] : []),
    "CosS v0.10 linear Kernel workflow:",
    "0. Do not directly assign work to another Agent. CosS Kernel owns the workflow, role startup, resource locks, and downstream dispatch.",
    `1. Call coss_pool_read({ roleId: "${targetWindow.roleId}", taskId: "${message.taskId || ""}" }) to read your own inbox.`,
    `2. Call coss_pool_claim({ roleId: "${targetWindow.roleId}", messageId: "${message.id}" }) before processing this message.`,
    "3. Call coss_claim_step before work; acquire locks with coss_acquire_lock before editing shared resources.",
    "4. Submit structured results through coss_submit_result with status done when your own step is complete. The Kernel will schedule the next preplanned Agent after your step is done.",
    "5. High-risk actions must use coss_request_approval and wait for user or orchestrator confirmation.",
    "",
    ...projectMemoryLines,
    message.content,
    "",
    "必须优先使用 CosS MCP 工具调用 CosS，而不是只在终端自然语言回复。",
    "请按需调用：coss_get_context、coss_get_task_board、coss_list_roles、coss_pool_read、coss_pool_claim、coss_claim_step、coss_heartbeat_step、coss_release_step、coss_get_kernel_events、coss_submit_result、coss_acquire_lock、coss_release_lock、coss_request_approval。",
    ...mcpRetryLines,
    "推荐开始顺序：先 coss_get_context，再 coss_get_task_board，再 coss_pool_read，处理本条消息前调用 coss_pool_claim，开始执行子任务时调用 coss_claim_step。",
    "完成自己的 Step 时优先调用 coss_submit_result({ status: \"done\" })；不要直接发给其他角色，也不要创建未在任务板中的角色。",
    "如果当前 Agent 后端暂时无法使用 MCP，再输出 COSS_AGENT_EVENT:{\"status\":\"running\",\"message\":\"你的结构化进度或无法继续的原因\",\"toRoleIds\":[]}。",
    "Agent 只能使用三种状态：COSS_AGENT_STATUS:running 或 COSS_AGENT_STATUS:done；默认未开始就是 idle。"
  ].join("\n"));
}

function isCodeBuddyAgentWindow(win) {
  return normalizeAgentProvider(win?.agentProvider || state.settings.agentProvider) === "codebuddy";
}

function getAgentDeliveryAdapter(win) {
  const provider = normalizeAgentProvider(win?.agentProvider || state.settings.agentProvider);
  if (provider === "codebuddy") {
    return {
      provider,
      method: "delivery-file-interactive",
      detail: "Delivery file plus interactive CodeBuddy submit"
    };
  }
  return {
    provider,
    method: "bracketed-paste",
    detail: `${getAgentProviderLabel(provider)} bracketed paste`
  };
}

function sanitizeDeliveryFileName(value) {
  return String(value || uid("delivery"))
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || uid("delivery");
}

async function writeAgentDeliveryInstructionFile(project, delivery, content) {
  if (!window.cossAPI?.writeProjectFile || !project?.path) {
    return { ok: false, error: "file-api-unavailable" };
  }

  const filePath = `.coss/deliveries/${sanitizeDeliveryFileName(delivery.id)}.md`;
  const result = await window.cossAPI.writeProjectFile({
    projectPath: project.path,
    filePath,
    content: [
      "# CosS Agent 投递指令",
      "",
      "请把本文档作为本次投递的唯一新增任务上下文。不要把终端输入框中的提示、示例或残留文字当成用户指令。",
      "",
      content,
      ""
    ].join("\n")
  });

  if (result?.ok) {
    delivery.deliveryFilePath = result.path || filePath;
    delivery.deliveryFileAbsolutePath = result.absolutePath || "";
  }
  return result || { ok: false, error: "empty-result" };
}

async function sendPastedTerminalInstruction(windowId, content, adapter = null) {
  const sanitized = stripTerminalControlChars(content);
  if (!sanitized || !window.cossAPI?.sendTerminalInput) {
    return { ok: false, error: "terminal-input-unavailable" };
  }
  const ok = await window.cossAPI.sendTerminalInput(windowId, `\x01\x0b\x1b[200~${sanitized}\x1b[201~\r`);
  return {
    ok,
    provider: adapter?.provider || "",
    method: adapter?.method || "bracketed-paste",
    detail: adapter?.detail || "Bracketed paste",
    error: ok ? "" : "terminal-write-failed"
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendTerminalInputChunks(windowId, chunks, delayMs = 80) {
  if (!window.cossAPI?.sendTerminalInput) {
    return false;
  }
  for (const chunk of chunks) {
    const isStep = chunk && typeof chunk === "object";
    const data = isStep ? String(chunk.data || "") : String(chunk || "");
    const delayAfter = isStep && Number.isFinite(Number(chunk.delayAfter))
      ? Number(chunk.delayAfter)
      : delayMs;
    if (data) {
      const ok = await window.cossAPI.sendTerminalInput(windowId, data);
      if (!ok) {
        return false;
      }
    }
    if (delayAfter > 0) {
      await wait(delayAfter);
    }
  }
  return true;
}

function chunkTerminalText(value, size = 48) {
  const text = String(value || "");
  const chunks = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

async function sendAgentDeliveryInstruction(project, delivery, targetWindow, content) {
  const sanitized = stripTerminalControlChars(content);
  if (!sanitized || !window.cossAPI?.sendTerminalInput) {
    return { ok: false, error: "terminal-input-unavailable" };
  }

  const adapter = getAgentDeliveryAdapter(targetWindow);
  delivery.submissionProvider = adapter.provider;
  delivery.submissionMethod = adapter.method;
  delivery.submissionDetail = adapter.detail;

  if (adapter.provider !== "codebuddy") {
    return sendPastedTerminalInstruction(targetWindow.id, sanitized, adapter);
  }

  const fileResult = await writeAgentDeliveryInstructionFile(project, delivery, sanitized);
  if (!fileResult?.ok) {
    delivery.lastError = fileResult?.error || "delivery-file-write-failed";
    return {
      ok: false,
      provider: adapter.provider,
      method: adapter.method,
      detail: adapter.detail,
      error: delivery.lastError
    };
  }

  const fileRef = delivery.deliveryFileAbsolutePath || delivery.deliveryFilePath;
  const instruction = stripTerminalControlChars(
    `请读取并执行 CosS 投递文件：${fileRef}。以该文件为唯一新增指令，忽略输入框已有提示或示例；执行中只使用 COSS_AGENT_STATUS:running，完成时输出 COSS_AGENT_STATUS:done。`
  );
  const instructionChunks = chunkTerminalText(instruction).map((data) => ({ data, delayAfter: 45 }));
  const ok = await sendTerminalInputChunks(targetWindow.id, [
    { data: "\x05", delayAfter: 90 },
    { data: "\x15", delayAfter: 90 },
    { data: "\x0b", delayAfter: 160 },
    ...instructionChunks,
    { data: "", delayAfter: 800 },
    { data: "\r", delayAfter: 220 },
    { data: "\x1b[13u", delayAfter: 0 }
  ]);
  return {
    ok,
    provider: adapter.provider,
    method: adapter.method,
    detail: adapter.detail,
    deliveryFilePath: delivery.deliveryFilePath,
    deliveryFileAbsolutePath: delivery.deliveryFileAbsolutePath,
    error: ok ? "" : "terminal-write-failed"
  };
}

function getDeliveriesForMessage(project, messageId) {
  return (project?.agentDeliveries || []).filter((delivery) => delivery.messageId === messageId);
}

function getOutputRefsForMessage(project, messageId) {
  return (project?.terminalOutputRefs || []).filter((ref) => ref.messageId === messageId);
}

function getOutputRefsForDelivery(project, deliveryId) {
  return (project?.terminalOutputRefs || []).filter((ref) => ref.deliveryId === deliveryId);
}

function isPasteOnlyTerminalFeedback(excerpt) {
  return /^\s*\[Pasted text #\d+(?:(?:\s*\+\s*|\s*:\s*)\d+ lines)?\]\s*$/i.test(String(excerpt || "").trim());
}

function isDeliveryInstructionEcho(excerpt) {
  const text = stripTerminalControlChars(excerpt);
  return /璇疯鍙栧苟鎵ц CosS 鎶曢€掓枃浠|请读取并执行 CosS 投递文件/.test(text);
}

function isDeliverySystemFeedback(excerpt) {
  const text = stripTerminalControlChars(excerpt);
  if (!text) {
    return true;
  }
  if (/CosS[\s\S]{0,120}terminal/i.test(text) && /(工作目录|请求模式|权限模式|会话|COSS_|宸ヤ綔|璇锋眰|鏉冮檺|浼氳瘽)/i.test(text)) {
    return true;
  }
  if (/(CodeBuddy Code|Tips for getting started|Recent activity|for shortcuts|Press\s+(?:Esc|Ctrl|\/)|Open Web UI)/i.test(text)) {
    return true;
  }
  if (/(shortcut|shortcuts)/i.test(text) || /^\s*[>?]\s*$/.test(text) || /^\s*[>?]\s*for\s+\w+/i.test(text)) {
    return true;
  }
  if (isPasteOnlyTerminalFeedback(text) || isDeliveryInstructionEcho(text)) {
    return true;
  }
  return /CosS/i.test(text) && /(投递|delivery|确认|等待|submitted|confirmed|waiting|鎶曢|纭|绛夊緟)/i.test(text);
}

function hasRealDeliveryOutput(project, delivery) {
  return getOutputRefsForDelivery(project, delivery.id).some((ref) => (
    String(ref.excerpt || "")
      .split(/\r?\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .some((line) => !isDeliverySystemFeedback(line))
  ));
}

function scheduleDeliveryStuckCheck(deliveryId, delayMs = 12000) {
  if (deliveryStuckTimers.has(deliveryId)) {
    clearTimeout(deliveryStuckTimers.get(deliveryId));
  }
  const timer = setTimeout(() => {
    deliveryStuckTimers.delete(deliveryId);
    markDeliveryIfStuck(deliveryId);
  }, delayMs);
  deliveryStuckTimers.set(deliveryId, timer);
}

function markDeliveryIfStuck(deliveryId) {
  const project = getProject();
  const delivery = project?.agentDeliveries?.find((item) => item.id === deliveryId);
  if (!project || !delivery || delivery.status !== "submitted") {
    return false;
  }
  if (hasRealDeliveryOutput(project, delivery)) {
    return false;
  }

  const now = new Date().toISOString();
  delivery.stuckCheckAt = now;
  delivery.stuckDetectedAt = now;
  delivery.updatedAt = now;
  delivery.lastFeedback = "已提交但尚未检测到 Agent 响应，可重试投递或查看终端。";
  recordAppLog("agent.delivery.stuck.detected", {
    projectId: project.id,
    deliveryId: delivery.id,
    messageId: delivery.messageId,
    windowId: delivery.windowId,
    provider: delivery.submissionProvider || "",
    method: delivery.submissionMethod || ""
  }, "warn");
  saveState();
  refreshMessageTimelineList();
  if (delivery.autoWorkflow && delivery.windowId) {
    scheduleAgentDeliveryQueueDrain(delivery.windowId, 300);
  }
  return true;
}

function isAgentApprovalPromptOutput(excerpt) {
  const text = stripTerminalControlChars(excerpt);
  return [
    /do you want to (?:create|edit|modify|overwrite|update|write|delete|run|execute)\b[\s\S]{0,600}\?/i,
    /(?:yes,\s*)?allow (?:all )?(?:edits|changes|commands)/i,
    /(?:需要|是否).{0,80}(?:确认|批准|允许|授权)/
  ].some((pattern) => pattern.test(text));
}

function getDeliveryStatusLabel(status) {
  return {
    pending: "待调度",
    sent: "已提交",
    submitted: "已提交",
    responded: "Agent 已响应",
    waiting: "等待人工确认",
    failed: "调度失败",
    canceled: "已取消"
  }[normalizeDeliveryStatus(status)] || status;
}

function getDeliveryMethodLabel(method) {
  return {
    "bracketed-paste": "Bracketed Paste",
    "delivery-file-interactive": "任务文件 + 交互提交"
  }[method] || method || "未提交";
}

function queueAgentDeliveriesForMessage(messageId, options = {}) {
  const project = getProject();
  const message = project?.messages?.find((item) => item.id === messageId);
  if (!project || !message) {
    return { ok: false, queuedCount: 0, reason: "message-not-found" };
  }
  if (markKernelDispatchMessageCompleted(project, message, "queue-delivery")) {
    saveState();
    render();
    return { ok: false, queuedCount: 0, reason: "completed-work" };
  }

  project.agentDeliveries ||= [];
  const targets = getInjectableWindowsForMessage(project, message).slice(0, options.limit || 4);
  if (targets.length === 0) {
    recordAppLog("agent.delivery.queue.skipped", {
      projectId: project.id,
      messageId: message.id,
      taskId: message.taskId || "",
      toRoleIds: message.toRoleIds,
      reason: "no-running-agent-terminal"
    }, "warn");
    return { ok: false, queuedCount: 0, reason: "no-running-agent-terminal" };
  }

  const now = new Date().toISOString();
  const queued = [];
  for (const targetWindow of targets) {
    const existing = project.agentDeliveries.find((delivery) => (
      delivery.messageId === message.id
      && delivery.windowId === targetWindow.id
      && ["pending", "sent", "submitted", "responded", "waiting", "completed"].includes(delivery.status)
    ));
    if (existing) {
      existing.subtaskId ||= message.subtaskRefs?.[targetWindow.roleId] || "";
      if (options.autoWorkflow) {
        existing.autoWorkflow = true;
        existing.autoWorkflowSourceEventId ||= options.sourceEventId || "";
      }
      queued.push(existing);
      continue;
    }
    const delivery = ensureAgentDeliveryShape({
      id: uid("delivery"),
      messageId: message.id,
      windowId: targetWindow.id,
      roleId: targetWindow.roleId,
      taskId: message.taskId || "",
      subtaskId: message.subtaskRefs?.[targetWindow.roleId] || "",
      status: "pending",
      submissionProvider: normalizeAgentProvider(targetWindow.agentProvider || state.settings.agentProvider),
      permissionMode: state.settings.agentPermissionMode,
      permissionLabel: getAgentPermissionPolicy().label,
      autoWorkflow: Boolean(options.autoWorkflow),
      autoWorkflowSourceEventId: options.sourceEventId || "",
      createdAt: now,
      updatedAt: now
    });
    project.agentDeliveries.push(delivery);
    queued.push(delivery);
  }

  if (queued.length > 0) {
    recordAppLog("agent.delivery.queued", {
      projectId: project.id,
      messageId: message.id,
      taskId: message.taskId || "",
      source: message.source,
      fromRoleId: message.fromRoleId,
      toRoleIds: message.toRoleIds,
      deliveryIds: queued.map((delivery) => delivery.id),
      windowIds: queued.map((delivery) => delivery.windowId),
      queuedCount: queued.length,
      autoWorkflow: Boolean(options.autoWorkflow),
      sourceEventId: options.sourceEventId || ""
    });
    saveState();
    render();
  }

  return {
    ok: queued.length > 0,
    queuedCount: queued.length,
    deliveryIds: queued.map((delivery) => delivery.id),
    reason: queued.length > 0 ? "" : "terminal-write-failed"
  };
}

function injectMessageIntoAgentTerminals(messageId, options = {}) {
  return Promise.resolve(queueAgentDeliveriesForMessage(messageId, options));
}

async function confirmAgentDelivery(deliveryId, options = {}) {
  const project = getProject();
  const delivery = project?.agentDeliveries?.find((item) => item.id === deliveryId);
  const message = project?.messages?.find((item) => item.id === delivery?.messageId);
  const targetWindow = project?.windows?.find((win) => win.id === delivery?.windowId);
  if (!project || !delivery || !message || !targetWindow) {
    return { ok: false, reason: "delivery-not-found" };
  }
  if (delivery.status !== "pending") {
    return { ok: false, reason: `delivery-${delivery.status}` };
  }

  let activeDelivery = getActiveAgentDeliveryForWindow(project, targetWindow.id, delivery.id);
  if (activeDelivery && shouldAutoReleaseActiveDelivery(project, targetWindow, activeDelivery, { force: options.force === true })) {
    const task = getTaskForDelivery(project, activeDelivery);
    const reason = options.force === true
      ? "manual-force-confirm"
      : (task && normalizeSubtaskStatus(task.status) === "done"
        ? "task-ended"
        : (activeDelivery.stuckDetectedAt ? "stuck-detected" : "stale-active-delivery"));
    releaseActiveAgentDelivery(project, targetWindow, activeDelivery, reason);
    activeDelivery = null;
    saveState();
  }
  if (activeDelivery) {
    delivery.lastFeedback = `Queued behind active delivery ${activeDelivery.id}.`;
    delivery.updatedAt = new Date().toISOString();
    recordAppLog("agent.delivery.deferred.busy", {
      projectId: project.id,
      deliveryId: delivery.id,
      messageId: message.id,
      windowId: targetWindow.id,
      roleId: targetWindow.roleId,
      activeDeliveryId: activeDelivery.id,
      activeMessageId: activeDelivery.messageId
    }, "warn");
    saveState();
    render();
    return {
      ok: false,
      deferred: true,
      reason: "agent-window-busy",
      activeDeliveryId: activeDelivery.id
    };
  }

  const olderPendingDelivery = getPendingAutoWorkflowDeliveriesForWindow(project, targetWindow.id)
    .find((item) => (
      item.id !== delivery.id
      && new Date(item.createdAt || 0).getTime() <= new Date(delivery.createdAt || 0).getTime()
    ));
  if (olderPendingDelivery) {
    delivery.lastFeedback = `Queued behind pending delivery ${olderPendingDelivery.id}.`;
    delivery.updatedAt = new Date().toISOString();
    recordAppLog("agent.delivery.deferred.ordered", {
      projectId: project.id,
      deliveryId: delivery.id,
      messageId: message.id,
      windowId: targetWindow.id,
      roleId: targetWindow.roleId,
      olderDeliveryId: olderPendingDelivery.id,
      olderMessageId: olderPendingDelivery.messageId
    }, "warn");
    saveState();
    render();
    scheduleAgentDeliveryQueueDrain(targetWindow.id, 500);
    return {
      ok: false,
      deferred: true,
      reason: "older-delivery-pending",
      olderDeliveryId: olderPendingDelivery.id
    };
  }

  const payload = buildTerminalInstructionPayload(message, targetWindow);
  const submission = await sendAgentDeliveryInstruction(project, delivery, targetWindow, payload);
  const ok = submission?.ok;
  const now = new Date().toISOString();
  delivery.attempts += 1;
  delivery.updatedAt = now;
  delivery.submissionProvider = submission?.provider || delivery.submissionProvider || normalizeAgentProvider(targetWindow.agentProvider || state.settings.agentProvider);
  delivery.submissionMethod = submission?.method || delivery.submissionMethod || "";
  delivery.submissionDetail = submission?.detail || delivery.submissionDetail || "";
  delivery.permissionMode = normalizeAgentPermissionMode(state.settings.agentPermissionMode);
  delivery.permissionLabel = getAgentPermissionPolicy(delivery.permissionMode).label;
  if (!ok) {
    delivery.status = "failed";
    delivery.lastError ||= submission?.error || "terminal-write-failed";
    recordAppLog("agent.delivery.failed", {
      projectId: project.id,
      deliveryId: delivery.id,
      messageId: message.id,
      windowId: targetWindow.id,
      provider: delivery.submissionProvider,
      method: delivery.submissionMethod,
      reason: delivery.lastError
    }, "error");
    saveState();
    render();
    return { ok: false, reason: delivery.lastError };
  }

  delivery.status = "submitted";
  delivery.sentAt = now;
  delivery.submittedAt = now;
  delivery.responseWatchStartedAt = now;
  delivery.stuckCheckAt = "";
  delivery.stuckDetectedAt = "";
  delivery.lastFeedback = isCodeBuddyAgentWindow(targetWindow)
    ? "指令文件已生成并提交给 CodeBuddy，等待 Agent 输出。"
    : "指令已写入终端，等待 Agent 输出。";
  delivery.lastError = "";
  message.injectedWindowIds = uniqueStrings([...(message.injectedWindowIds || []), targetWindow.id]);
  message.injectedAt = now;
  targetWindow.status = "working";
  targetWindow.lastInjectedMessageId = message.id;
  targetWindow.lastAgentDeliveryId = delivery.id;
  targetWindow.agentSession = ensureAgentSessionShape(targetWindow, project);
  targetWindow.agentSession.lastEventAt = now;
  project.terminalOutputRefs ||= [];
  if (!project.terminalOutputRefs.some((ref) => ref.deliveryId === delivery.id && ref.windowId === targetWindow.id)) {
    project.terminalOutputRefs.push(ensureTerminalOutputRefShape({
      id: uid("termref"),
      messageId: message.id,
      deliveryId: delivery.id,
      windowId: targetWindow.id,
      roleId: targetWindow.roleId,
      taskId: message.taskId || "",
      excerpt: "CosS 已调度任务，等待终端输出。",
      createdAt: now,
      updatedAt: now
    }));
  }
  recordAppLog("agent.delivery.confirmed", {
    projectId: project.id,
    deliveryId: delivery.id,
    messageId: message.id,
    taskId: message.taskId || "",
    windowId: targetWindow.id,
    roleId: targetWindow.roleId,
    provider: delivery.submissionProvider,
    method: delivery.submissionMethod,
    permissionMode: delivery.permissionMode,
    permissionLabel: delivery.permissionLabel,
    deliveryFilePath: delivery.deliveryFilePath || "",
    contentLength: message.content.length,
    autoWorkflow: Boolean(options.autoWorkflow || delivery.autoWorkflow),
    sourceEventId: options.sourceEventId || delivery.autoWorkflowSourceEventId || ""
  });
  saveState();
  render();
  scheduleDeliveryStuckCheck(delivery.id);
  return { ok: true, deliveryId: delivery.id, windowId: targetWindow.id };
}

function cancelAgentDelivery(deliveryId) {
  const project = getProject();
  const delivery = project?.agentDeliveries?.find((item) => item.id === deliveryId);
  if (!project || !delivery || delivery.status !== "pending") {
    return false;
  }
  delivery.status = "canceled";
  delivery.canceledAt = new Date().toISOString();
  delivery.updatedAt = delivery.canceledAt;
  recordAppLog("agent.delivery.canceled", {
    projectId: project.id,
    deliveryId,
    messageId: delivery.messageId,
    windowId: delivery.windowId
  });
  saveState();
  render();
  return true;
}

function retryAgentDelivery(deliveryId) {
  const project = getProject();
  const delivery = project?.agentDeliveries?.find((item) => item.id === deliveryId);
  const canRetrySubmitted = delivery?.status === "submitted" && Boolean(delivery.stuckDetectedAt);
  if (!project || !delivery || (!["failed", "canceled"].includes(delivery.status) && !canRetrySubmitted)) {
    return false;
  }
  delivery.status = "pending";
  delivery.lastError = "";
  delivery.lastFeedback = "";
  delivery.stuckCheckAt = "";
  delivery.stuckDetectedAt = "";
  delivery.updatedAt = new Date().toISOString();
  recordAppLog("agent.delivery.retried", {
    projectId: project.id,
    deliveryId,
    messageId: delivery.messageId,
    windowId: delivery.windowId,
    fromStatus: canRetrySubmitted ? "submitted-stuck" : "failed-or-canceled"
  });
  saveState();
  render();
  return true;
}

function recordTerminalOutputReference(windowId, data) {
  const project = getProject();
  const win = project?.windows?.find((item) => item.id === windowId);
  if (!project || !win?.lastInjectedMessageId || !win?.lastAgentDeliveryId) {
    return;
  }
  const excerpt = stripTerminalControlChars(data).slice(0, 600);
  if (!excerpt || excerpt.length < 2) {
    return;
  }
  const delivery = project.agentDeliveries?.find((item) => item.id === win.lastAgentDeliveryId);
  if (!delivery || !["sent", "submitted", "responded", "waiting"].includes(delivery.status)) {
    return;
  }

  project.terminalOutputRefs ||= [];
  const now = new Date().toISOString();
  let ref = project.terminalOutputRefs.find((item) => item.deliveryId === delivery.id && item.windowId === windowId);
  if (ref) {
    ref.excerpt = `${ref.excerpt}\n${excerpt}`.trim().slice(-1200);
    ref.updatedAt = now;
  } else {
    ref = ensureTerminalOutputRefShape({
      id: uid("termref"),
      messageId: delivery.messageId,
      deliveryId: delivery.id,
      windowId,
      roleId: win.roleId,
      taskId: delivery.taskId || "",
      excerpt,
      createdAt: now,
      updatedAt: now
    });
    project.terminalOutputRefs.push(ref);
  }
  project.terminalOutputRefs = project.terminalOutputRefs.slice(-300);

  const previousDeliveryStatus = delivery.status;
  const backendReadyAt = terminalBackendReadyAt.get(windowId) || "";
  const backendReadyAtMs = backendReadyAt ? new Date(backendReadyAt).getTime() : 0;
  const deliverySentAtMs = new Date(delivery.sentAt || delivery.submittedAt || delivery.createdAt || 0).getTime();
  const isStartupOutputForExistingDelivery = Boolean(
    backendReadyAtMs
    && Number.isFinite(deliverySentAtMs)
    && deliverySentAtMs > 0
    && deliverySentAtMs < backendReadyAtMs
    && Date.now() - backendReadyAtMs < 4000
  );
  if (isAgentApprovalPromptOutput(excerpt)) {
    delivery.status = "waiting";
    delivery.waitingAt = now;
    delivery.stuckDetectedAt = "";
    if (deliveryStuckTimers.has(delivery.id)) {
      clearTimeout(deliveryStuckTimers.get(delivery.id));
      deliveryStuckTimers.delete(delivery.id);
    }
    delivery.lastFeedback = "Agent 正在等待人工确认。";
  } else if (!isStartupOutputForExistingDelivery && !isDeliverySystemFeedback(excerpt) && !["responded", "waiting"].includes(delivery.status)) {
    delivery.status = "responded";
    delivery.respondedAt = now;
    delivery.stuckDetectedAt = "";
    if (deliveryStuckTimers.has(delivery.id)) {
      clearTimeout(deliveryStuckTimers.get(delivery.id));
      deliveryStuckTimers.delete(delivery.id);
    }
    delivery.lastFeedback = "Agent 已产生终端输出。";
  } else if (isDeliveryInstructionEcho(excerpt)) {
    delivery.lastFeedback = "CodeBuddy delivery instruction entered; waiting for Agent output.";
  } else if (isPasteOnlyTerminalFeedback(excerpt)) {
    delivery.lastFeedback = "终端已接收粘贴文本，尚未检测到 Agent 输出。";
  }
  delivery.updatedAt = now;

  recordAppLog("agent.delivery.output-referenced", {
    projectId: project.id,
    deliveryId: delivery.id,
    messageId: delivery.messageId,
    windowId,
    excerptLength: excerpt.length,
    deliveryStatus: delivery.status
  });
  if (delivery.status !== previousDeliveryStatus) {
    recordAppLog("agent.delivery.status.changed", {
      projectId: project.id,
      deliveryId: delivery.id,
      messageId: delivery.messageId,
      windowId,
      previousStatus: previousDeliveryStatus,
      status: delivery.status
    });
  }
  saveState();
  refreshMessageTimelineList();
}

function getProjectTimelineEvents(project) {
  ensureProjectShape(project);
  const messageItems = (project.messages || []).map((message) => ({
    kind: "message",
    id: message.id,
    taskId: message.taskId || "",
    time: message.createdAt,
    message
  }));
  const agentItems = (project.agentEvents || []).map((event) => ({
    kind: "agent-event",
    id: event.id,
    taskId: event.taskId || "",
    time: event.receivedAt,
    event
  }));
  const query = String(messageTimelineFilters.query || "").trim().toLowerCase();
  const taskId = messageTimelineFilters.taskId || "";

  return [...messageItems, ...agentItems]
    .filter((item) => !taskId || item.taskId === taskId)
    .filter((item) => itemMatchesMessageFlowSelection(item))
    .filter((item) => {
      if (!query) {
        return true;
      }
      if (item.kind === "message") {
        const message = item.message;
        return [
          getRole(message.fromRoleId).name,
          ...message.toRoleIds.map((roleId) => getRole(roleId).name),
          message.content,
          message.source,
          getMessageTaskLabel(message.taskId)
        ].join(" ").toLowerCase().includes(query);
      }
      const event = item.event;
      return [
        getRole(event.roleId).name,
        event.provider,
        event.status,
        event.type,
        event.toolName,
        event.message,
        getMessageTaskLabel(event.taskId)
      ].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 120);
}

function getTimelineItemKey(item) {
  return `${item.kind}:${item.id}`;
}

function getTimelineItemDate(item) {
  return new Date(item.time || 0);
}

function getTimelineItemLabel(item) {
  if (item.kind === "agent-event") {
    const event = item.event;
    const toolSuffix = event.toolName ? ` · ${event.toolName}` : "";
    return {
      title: `Agent · ${getRole(event.roleId).name}`,
      subtitle: `${event.status || event.type || "event"}${toolSuffix}`,
      summary: event.message || event.sessionId || "Agent 输出了状态事件。"
    };
  }

  const message = item.message;
  return {
    title: getRole(message.fromRoleId).name,
    subtitle: message.toRoleIds.map((roleId) => getRole(roleId).name).join("、"),
    summary: message.content
  };
}

function renderTimelineNode(item, isSelected, index, total) {
  const key = getTimelineItemKey(item);
  const labels = getTimelineItemLabel(item);
  const statusClass = item.kind === "agent-event"
    ? normalizeAgentEventStatus(item.event.status) || item.event.status || "running"
    : "message";
  const nodeClasses = [
    "message-timeline-node",
    item.kind,
    item.kind === "agent-event" ? "agent-timeline-row" : "",
    statusClass,
    isSelected ? "active" : "",
    item.kind === "message" && item.message.toRoleIds.length > 1 ? "branching" : ""
  ].filter(Boolean).join(" ");
  const timeLabel = formatDateTime(item.time);
  const branchTargets = item.kind === "message" && item.message.toRoleIds.length > 1
    ? `
      <div class="message-branch-targets" aria-label="分叉接收角色">
        ${item.message.toRoleIds.map((roleId) => `<span>${escapeHtml(getRole(roleId).name)}</span>`).join("")}
      </div>
    `
    : "";
  const singleTarget = item.kind === "message" && item.message.toRoleIds.length === 1
    ? `<div class="message-node-target">${escapeHtml(labels.subtitle)}</div>`
    : "";

  return `
    <button class="${escapeHtml(nodeClasses)}"
      data-action="select-message-timeline-node"
      data-timeline-item-id="${escapeHtml(key)}"
      style="--node-index:${index}; --node-count:${total};"
      aria-pressed="${isSelected ? "true" : "false"}">
      <span class="message-node-time">${escapeHtml(timeLabel)}</span>
      <span class="message-node-dot"></span>
      <span class="message-node-title">${escapeHtml(labels.title)}</span>
      <span class="message-node-summary">${escapeHtml(labels.summary)}</span>
      ${singleTarget}
      ${branchTargets}
    </button>
  `;
}

function renderTimelineDetail(project, item) {
  if (!item) {
    return `<div class="message-empty">请选择时间轴节点查看详情。</div>`;
  }

  if (item.kind === "agent-event") {
    const event = item.event;
    const toNames = event.toRoleIds.length > 0
      ? ` → ${event.toRoleIds.map((roleId) => getRole(roleId).name).join("、")}`
      : "";
    return `
      <div class="message-row timeline-row agent-timeline-row ${escapeHtml(normalizeAgentEventStatus(event.status) || event.status || "running")}" data-agent-event-id="${escapeHtml(event.id)}">
        <div class="message-row-head">
          <strong>Agent 事件 · ${escapeHtml(getRole(event.roleId).name)}${escapeHtml(toNames)}</strong>
          <span>${escapeHtml(formatDateTime(event.receivedAt))}</span>
        </div>
        <div class="message-meta">
          <span>${escapeHtml(event.taskId ? getMessageTaskLabel(event.taskId) : "会话事件")}</span>
          <span>${escapeHtml(event.status || "event")}</span>
          <span>${escapeHtml(event.structured ? "structured-event" : event.type || "status")}</span>
          ${event.toolName ? `<span>${escapeHtml(event.toolName)}</span>` : ""}
        </div>
        <p>${escapeHtml(event.message || event.sessionId || "Agent 输出了状态事件。")}</p>
      </div>
    `;
  }

  const message = item.message;
  const fromRole = getRole(message.fromRoleId);
  const toNames = message.toRoleIds.map((roleId) => getRole(roleId).name).join("、");
  const channelLabel = message.channelType === "task" ? getMessageTaskLabel(message.taskId) : "私聊";
  const refs = getOutputRefsForMessage(project, message.id);
  const injectedLabel = message.injectedWindowIds?.length
    ? `<span>已注入 ${message.injectedWindowIds.length} 个终端</span>`
    : "";

  return `
    <div class="message-row timeline-row" data-message-id="${escapeHtml(message.id)}">
      <div class="message-row-head">
        <strong>${escapeHtml(fromRole.name)} → ${escapeHtml(toNames)}</strong>
        <span>${escapeHtml(formatDateTime(message.createdAt))}</span>
      </div>
      <div class="message-meta">
        <span>${escapeHtml(channelLabel)}</span>
        <span>${escapeHtml(message.source || "manual")}</span>
        ${injectedLabel}
        ${refs.length ? `<span>${refs.length} 条输出引用</span>` : ""}
      </div>
      ${renderRelayStageChips(project, message)}
      <p>${escapeHtml(message.content)}</p>
      <div class="message-row-actions">
        ${refs.length ? `<button class="secondary-button compact" data-action="show-terminal-output-refs" data-message-id="${escapeHtml(message.id)}">查看输出</button>` : ""}
      </div>
    </div>
  `;
}

function normalizeAgentFlowSelection(project) {
  if (!messageFlowSelection.roleId && !messageFlowSelection.edgeKey) {
    return false;
  }
  const graph = getAgentFlowGraph(project);
  const roleOk = !messageFlowSelection.roleId || graph.nodes.some((node) => node.id === messageFlowSelection.roleId);
  const edgeOk = !messageFlowSelection.edgeKey || graph.edges.some((edge) => edge.key === messageFlowSelection.edgeKey);
  if (roleOk && edgeOk) {
    return false;
  }
  messageFlowSelection = { roleId: "", edgeKey: "" };
  return true;
}

function renderMessageRows(project) {
  normalizeAgentFlowSelection(project);
  const timeline = getProjectTimelineEvents(project);
  if (timeline.length === 0) {
    selectedTimelineItemId = "";
    return `
      ${renderAgentFlowGraph(project)}
      <div class="message-empty">暂无协作事件。发送一条消息，创建任务，或等待 Agent 输出结构化事件。</div>
    `;
  }

  const timelineKeys = new Set(timeline.map(getTimelineItemKey));
  if (!selectedTimelineItemId || !timelineKeys.has(selectedTimelineItemId)) {
    selectedTimelineItemId = getTimelineItemKey(timeline[0]);
  }

  const chronological = [...timeline].sort((a, b) => getTimelineItemDate(a).getTime() - getTimelineItemDate(b).getTime());
  const selectedItem = timeline.find((item) => getTimelineItemKey(item) === selectedTimelineItemId) || timeline[0];

  return `
    ${renderAgentFlowGraph(project)}
    <div class="message-timeline-shell">
      <div class="message-timeline-scroll" aria-label="协作横向时间轴">
        <div class="message-timeline-track" style="--timeline-count:${chronological.length};">
          ${chronological.map((item, index) => renderTimelineNode(item, getTimelineItemKey(item) === selectedTimelineItemId, index, chronological.length)).join("")}
        </div>
      </div>
      <div class="message-timeline-detail" data-message-timeline-detail>
        ${renderTimelineDetail(project, selectedItem)}
      </div>
    </div>
  `;
}

function getAgentFlowGraph(project) {
  const taskId = messageTimelineFilters.taskId || "";
  const query = String(messageTimelineFilters.query || "").trim().toLowerCase();
  const nodes = new Map();
  const edges = new Map();
  const addNode = (roleId, source = "") => {
    const id = roleId || "human";
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        label: getFlowRoleLabel(id),
        source,
        sent: 0,
        received: 0
      });
    }
    return nodes.get(id);
  };

  (project?.messages || [])
    .filter((message) => !taskId || message.taskId === taskId)
    .filter((message) => {
      if (!query) {
        return true;
      }
      return [
        getRole(message.fromRoleId).name,
        ...(message.toRoleIds || []).map((roleId) => getRole(roleId).name),
        message.content,
        message.source
      ].join(" ").toLowerCase().includes(query);
    })
    .forEach((message) => {
      const fromId = getFlowMessageFromId(message);
      const fromNode = addNode(fromId, message.source || "");
      fromNode.sent += 1;
      uniqueRoleIds(message.toRoleIds || []).forEach((toRoleId) => {
        const toNode = addNode(toRoleId, message.source || "");
        toNode.received += 1;
        const key = getFlowEdgeKey(fromId, toRoleId);
        const edge = edges.get(key) || {
          key,
          fromId,
          toId: toRoleId,
          count: 0,
          latestAt: "",
          taskIds: new Set(),
          sources: new Set(),
          messages: []
        };
        edge.count += 1;
        if (!edge.latestAt || new Date(message.createdAt || 0).getTime() > new Date(edge.latestAt || 0).getTime()) {
          edge.latestAt = message.createdAt || edge.latestAt;
        }
        if (message.taskId) {
          edge.taskIds.add(message.taskId);
        }
        if (message.source) {
          edge.sources.add(message.source);
        }
        edge.messages.push(message);
        edges.set(key, edge);
      });
    });

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values())
      .map((edge) => ({
        ...edge,
        taskIds: Array.from(edge.taskIds),
        sources: Array.from(edge.sources),
        messages: edge.messages.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
      }))
      .sort((a, b) => new Date(a.latestAt || 0).getTime() - new Date(b.latestAt || 0).getTime())
  };
}

function getVisibleFlowMessages(graph) {
  const byId = new Map();
  graph.edges.forEach((edge) => {
    edge.messages.forEach((message) => byId.set(message.id, message));
  });
  return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
}

function renderAgentFlowSelection(project, graph) {
  const selectedEdge = messageFlowSelection.edgeKey
    ? graph.edges.find((edge) => edge.key === messageFlowSelection.edgeKey)
    : null;
  const selectedRole = messageFlowSelection.roleId
    ? graph.nodes.find((node) => node.id === messageFlowSelection.roleId)
    : null;
  if (!selectedEdge && !selectedRole) {
    return "";
  }

  const messages = selectedEdge
    ? selectedEdge.messages
    : getVisibleFlowMessages(graph).filter((message) => messageMatchesFlowRole(message, selectedRole.id));
  const title = selectedEdge
    ? `${getFlowRoleLabel(selectedEdge.fromId)} -> ${getFlowRoleLabel(selectedEdge.toId)}`
    : `${selectedRole.label} 相关消息`;
  const hint = selectedEdge
    ? "点击边后显示该角色流向上的消息列表。"
    : "点击节点后，时间线已筛选为该角色相关消息。";
  const messageRows = messages.length
    ? messages.slice(-8).reverse().map((message) => `
      <button class="agent-flow-message-item" data-action="select-message-timeline-node" data-timeline-item-id="message:${escapeHtml(message.id)}">
        <strong>${escapeHtml(getFlowRoleLabel(getFlowMessageFromId(message)))} -> ${escapeHtml(message.toRoleIds.map((roleId) => getRole(roleId).name).join("、"))}</strong>
        <span>${escapeHtml(formatDateTime(message.createdAt))}</span>
        <p>${escapeHtml(message.content)}</p>
        <small>${escapeHtml(message.taskId ? getMessageTaskLabel(message.taskId) : "私聊")} · ${escapeHtml(message.source || "manual")}</small>
      </button>
    `).join("")
    : `<div class="agent-flow-empty">当前筛选下暂无消息。</div>`;

  return `
    <div class="agent-flow-selection">
      <div class="agent-flow-selection-head">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(hint)}</span>
        </div>
        <button class="secondary-button compact" data-action="clear-agent-flow-selection">清除筛选</button>
      </div>
      <div class="agent-flow-message-list">${messageRows}</div>
    </div>
  `;
}

function renderAgentFlowGraph(project) {
  const graph = getAgentFlowGraph(project);
  if (graph.nodes.length === 0) {
    return `
      <div class="agent-flow-panel">
        <div class="agent-flow-header">
          <strong>角色消息池流向</strong>
          <span>等待首条角色消息写入消息池</span>
        </div>
      </div>
    `;
  }
  const selectedRoleId = graph.nodes.some((node) => node.id === messageFlowSelection.roleId) ? messageFlowSelection.roleId : "";
  const selectedEdgeKey = graph.edges.some((edge) => edge.key === messageFlowSelection.edgeKey) ? messageFlowSelection.edgeKey : "";
  const hasSelection = Boolean(selectedRoleId || selectedEdgeKey);
  const roleNodes = graph.nodes.map((node, index) => `
    <button class="agent-flow-node node-${index % 5} ${node.id === selectedRoleId ? "selected" : ""}"
      title="${escapeHtml(node.label)}"
      data-action="select-agent-flow-role"
      data-role-id="${escapeHtml(node.id)}"
      aria-pressed="${node.id === selectedRoleId ? "true" : "false"}">
      <span class="agent-flow-dot"></span>
      <strong>${escapeHtml(node.label)}</strong>
      <small>发 ${node.sent} / 收 ${node.received}</small>
    </button>
  `).join("");
  const edgeRows = graph.edges.length
    ? graph.edges.map((edge, index) => `
      <button class="agent-flow-edge edge-${index % 5} ${edge.key === selectedEdgeKey ? "selected" : ""}"
        data-action="select-agent-flow-edge"
        data-flow-edge-key="${escapeHtml(edge.key)}"
        data-from-role-id="${escapeHtml(edge.fromId)}"
        data-to-role-id="${escapeHtml(edge.toId)}"
        aria-pressed="${edge.key === selectedEdgeKey ? "true" : "false"}">
        <span>${escapeHtml(graph.nodes.find((node) => node.id === edge.fromId)?.label || getFlowRoleLabel(edge.fromId))}</span>
        <i></i>
        <span>${escapeHtml(graph.nodes.find((node) => node.id === edge.toId)?.label || getFlowRoleLabel(edge.toId))}</span>
        <em>${edge.count}</em>
      </button>
    `).join("")
    : `<div class="agent-flow-empty">已有角色节点，暂无角色之间的交接消息。</div>`;
  return `
    <div class="agent-flow-panel">
      <div class="agent-flow-header">
        <strong>角色消息池流向</strong>
        <span>${graph.nodes.length} 个节点 · ${graph.edges.length} 条流向${hasSelection ? " · 已筛选" : ""}</span>
        ${hasSelection ? `<button class="secondary-button compact" data-action="clear-agent-flow-selection">清除</button>` : ""}
      </div>
      <div class="agent-flow-body">
        <div class="agent-flow-nodes">${roleNodes}</div>
        <div class="agent-flow-edges">${edgeRows}</div>
      </div>
      ${renderAgentFlowSelection(project, graph)}
    </div>
  `;
}

function getMessageTimelineScroller() {
  return document.querySelector(".message-timeline-scroll");
}

function captureMessageTimelineScroll() {
  const scroller = getMessageTimelineScroller();
  if (scroller) {
    messageTimelineScrollLeft = scroller.scrollLeft;
  }
  return messageTimelineScrollLeft;
}

function restoreMessageTimelineScroll(scrollLeft = messageTimelineScrollLeft) {
  const apply = () => {
    const scroller = getMessageTimelineScroller();
    if (!scroller) {
      return;
    }
    const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollLeft = Math.min(Math.max(0, scrollLeft), maxScrollLeft);
    messageTimelineScrollLeft = scroller.scrollLeft;
  };
  apply();
  requestAnimationFrame(apply);
}

function refreshMessageTimelineList() {
  const list = document.querySelector("[data-message-timeline-list]");
  const project = getProject();
  if (list && project) {
    const scrollLeft = captureMessageTimelineScroll();
    list.innerHTML = renderMessageRows(project);
    restoreMessageTimelineScroll(scrollLeft);
  }
}

function selectMessageTimelineNode(itemId) {
  const project = getProject();
  if (!project || !itemId) {
    return;
  }

  const timeline = getProjectTimelineEvents(project);
  const selectedItem = timeline.find((item) => getTimelineItemKey(item) === itemId);
  if (!selectedItem) {
    return;
  }

  selectedTimelineItemId = itemId;
  document.querySelectorAll(".message-timeline-node").forEach((node) => {
    const isActive = node instanceof HTMLElement && node.dataset.timelineItemId === selectedTimelineItemId;
    node.classList.toggle("active", isActive);
    node.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  const detail = document.querySelector("[data-message-timeline-detail]");
  if (detail) {
    detail.innerHTML = renderTimelineDetail(project, selectedItem);
  }
}

function selectAgentFlowRole(roleId) {
  if (!roleId) {
    return;
  }
  const sameSelection = messageFlowSelection.roleId === roleId && !messageFlowSelection.edgeKey;
  messageFlowSelection = sameSelection
    ? { roleId: "", edgeKey: "" }
    : { roleId, edgeKey: "" };
  selectedTimelineItemId = "";
  refreshMessageTimelineList();
}

function selectAgentFlowEdge(edgeKey) {
  if (!edgeKey) {
    return;
  }
  const sameSelection = messageFlowSelection.edgeKey === edgeKey && !messageFlowSelection.roleId;
  messageFlowSelection = sameSelection
    ? { roleId: "", edgeKey: "" }
    : { roleId: "", edgeKey };
  selectedTimelineItemId = "";
  refreshMessageTimelineList();
}

function clearAgentFlowSelection() {
  messageFlowSelection = { roleId: "", edgeKey: "" };
  selectedTimelineItemId = "";
  refreshMessageTimelineList();
}

function showMessageCenterModal(defaults = {}) {
  closeMenus();
  const project = getProject();
  const modalWasOpen = Boolean(document.querySelector(".message-center-modal"));
  const timelineScrollLeft = modalWasOpen ? captureMessageTimelineScroll() : 0;
  if (!project) {
    renderModal(`
      <div class="modal message-center-modal">
        <h2>消息中心</h2>
        <p>请先创建或选择一个项目。</p>
        <div class="modal-actions">
          <button class="primary-button" data-action="close-modal">确定</button>
        </div>
      </div>
    `);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(defaults, "filterTaskId")) {
    messageTimelineFilters = { ...messageTimelineFilters, taskId: defaults.filterTaskId || "" };
  } else if (!modalWasOpen) {
    const currentTaskId = messageComposerDefaults.taskId || getCurrentTaskFilterId(project);
    messageTimelineFilters = { ...messageTimelineFilters, taskId: currentTaskId || "", query: "" };
    messageFlowSelection = { roleId: "", edgeKey: "" };
    messageTimelineScrollLeft = 0;
  }
  ensureProjectShape(project);
  const selectedFilterTaskId = messageTimelineFilters.taskId || "";
  const filterTaskOptions = project.tasks
    .map((task) => `<option value="${escapeHtml(task.id)}" ${task.id === selectedFilterTaskId ? "selected" : ""}>${escapeHtml(task.title)}</option>`)
    .join("");

  renderModal(`
    <div class="modal message-center-modal">
      <h2>v0.10 Kernel 时间线</h2>
      <p>这里只展示中央调度器、Agent 结构化结果、资源锁、审批和任务板事件。</p>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">关闭</button>
      </div>
      <div class="message-filterbar">
        <label>
          <span>搜索</span>
          <input id="messageTimelineSearch" value="${escapeHtml(messageTimelineFilters.query || "")}" placeholder="搜索角色、消息、状态">
        </label>
        <label>
          <span>任务筛选</span>
          <select id="messageTimelineTaskFilter">
            <option value="">全部</option>
            ${filterTaskOptions}
          </select>
        </label>
      </div>
      <div class="message-list" data-message-timeline-list>
        ${renderMessageRows(project)}
      </div>
    </div>
  `);
  if (modalWasOpen) {
    restoreMessageTimelineScroll(timelineScrollLeft);
  }
}

function showTerminalOutputRefsModal(messageId) {
  const project = getProject();
  const message = project?.messages?.find((item) => item.id === messageId);
  const refs = getOutputRefsForMessage(project, messageId);
  if (!project || !message) {
    return;
  }

  renderModal(`
    <div class="modal terminal-output-ref-modal">
      <h2>终端输出引用</h2>
      <p>这些输出来自 Kernel 调度的 Agent 终端，点击对应窗口可回到角色程序继续查看。</p>
      <div class="task-plan-summary">
        <strong>${escapeHtml(getRole(message.fromRoleId).name)} → ${escapeHtml(message.toRoleIds.map((roleId) => getRole(roleId).name).join("、"))}</strong>
        <span>${escapeHtml(message.content)}</span>
      </div>
      <div class="terminal-ref-list">
        ${refs.length ? refs.map((ref) => `
          <div class="terminal-ref-row">
            <div class="message-row-head">
              <strong>${escapeHtml(getRole(ref.roleId).name)} · ${escapeHtml(formatDateTime(ref.updatedAt))}</strong>
              <button class="secondary-button compact" data-action="focus-terminal-ref-window" data-window-id="${escapeHtml(ref.windowId)}">定位窗口</button>
            </div>
            <pre>${escapeHtml(ref.excerpt)}</pre>
          </div>
        `).join("") : `<div class="message-empty">暂无终端输出引用。</div>`}
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="show-message-center">返回时间线</button>
        <button class="primary-button" data-action="close-modal">关闭</button>
      </div>
    </div>
  `);
}

async function showAboutModal() {
  closeMenus();
  let appInfo = { version: APP_VERSION.replace(/^v/, ""), logDirectory: "", userData: "" };
  try {
    appInfo = window.cossAPI?.getAppInfo ? await window.cossAPI.getAppInfo() : appInfo;
  } catch (error) {
    appInfo = { ...appInfo, error: error.message };
  }

  renderModal(`
    <div class="modal about-modal">
      <h2>关于 CosS</h2>
      <p>CosS 是一个面向多角色 AI 协作的 Windows 类桌面工作区。</p>
      <div class="about-list">
        <div><strong>当前版本</strong><span>v${escapeHtml(appInfo.version || APP_VERSION.replace(/^v/, ""))}</span></div>
        <div><strong>日志目录</strong><span>${escapeHtml(appInfo.logDirectory || "未获取")}</span></div>
        <div><strong>用户数据</strong><span>${escapeHtml(appInfo.userData || "未获取")}</span></div>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="open-log-directory">打开日志目录</button>
        <button class="primary-button" data-action="close-modal">确定</button>
      </div>
    </div>
  `);
}

async function openLogDirectoryFromRenderer() {
  if (!window.cossAPI?.openLogDirectory) {
    return;
  }

  try {
    const result = await window.cossAPI.openLogDirectory();
    if (!result?.ok) {
      recordAppLog("logs.open-directory.renderer-failed", { error: result?.error || "unknown" }, "error");
    }
  } catch (error) {
    recordAppLog("logs.open-directory.renderer-failed", { error: error.message }, "error");
  }
}

function showRolePicker(type) {
  closeMenus();
  const candidates = ROLE_TEMPLATES.filter((role) => role.programs.includes(type));
  const cards = candidates
    .map((role) => {
      if (type !== "terminal") {
        return `
          <button class="role-card" data-action="select-role" data-type="${type}" data-role-id="${role.id}">
            <strong>${role.name}</strong>
            <span>${role.description}</span>
            <div class="role-meta">${role.category} · ${role.claude ? "可使用 Claude Code" : "无需终端"}</div>
          </button>
        `;
      }

      return `
        <div class="role-card terminal-role-card">
          <strong>${role.name}</strong>
          <span>${role.description}</span>
          <div class="role-meta">${role.category} · Agent 当前使用 ${getAgentProviderLabel(state.settings.agentProvider)}</div>
          <div class="role-card-actions">
            <button class="secondary-button" data-action="select-role" data-type="terminal" data-role-id="${role.id}" data-terminal-mode="shell">
              PowerShell
            </button>
            <button class="primary-button" data-action="select-role" data-type="terminal" data-role-id="${role.id}" data-terminal-mode="agent">
              Agent
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  renderModal(`
    <div class="modal">
      <h2>选择${getProgramLabel(type)}角色</h2>
      <p>${type === "terminal" ? `终端会以角色身份运行，可选择普通 PowerShell 或 Agent。Agent 当前使用 ${getAgentProviderLabel(state.settings.agentProvider)}，可在系统设置中切换。` : "程序会以角色身份运行，后续任务分派和协作状态都绑定到这个角色。"}</p>
      <div class="role-grid">${cards}</div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">取消</button>
      </div>
    </div>
  `);
}

function renderModal(content) {
  let backdrop = document.querySelector(".modal-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    document.body.appendChild(backdrop);
  }
  backdrop.innerHTML = content;
}

function closeModal() {
  pendingTaskPlanDraft = null;
  pendingFileOperation = null;
  document.querySelector(".modal-backdrop")?.remove();
}

function renderSeverityLabel(severity) {
  return {
    high: "高风险",
    medium: "需确认",
    low: "低风险"
  }[severity] || "未知";
}

function renderCommandStatus(status) {
  return {
    pending: "等待确认",
    approved: "已确认执行",
    executed: "已执行",
    rejected: "已拒绝"
  }[status] || status;
}

function showCommandApprovalModal() {
  if (!pendingCommandApproval) {
    return;
  }

  const role = getRole(pendingCommandApproval.roleId);
  const assessment = pendingCommandApproval.assessment;
  renderModal(`
    <div class="modal command-approval">
      <h2>命令执行需要确认</h2>
      <p>${escapeHtml(role.name)} 即将执行一个 ${renderSeverityLabel(assessment.severity)} 命令。请确认它符合当前项目目标。</p>
      <div class="risk-summary ${assessment.severity}">
        <strong>${escapeHtml(assessment.label)}</strong>
        <span>${escapeHtml(assessment.description)}</span>
      </div>
      <pre class="command-preview">${escapeHtml(pendingCommandApproval.command)}</pre>
      <div class="modal-actions">
        <button class="secondary-button" data-action="reject-command">拒绝执行</button>
        <button class="primary-button" data-action="approve-command">确认执行</button>
      </div>
    </div>
  `);
}

function approvePendingCommand() {
  if (!pendingCommandApproval) {
    return;
  }

  window.cossAPI?.sendTerminalInput?.(pendingCommandApproval.windowId, "\r", {
    bypassPermissionGuard: true,
    clearInputGuard: true,
    reason: "renderer-approved"
  });
  updateCommandLog(pendingCommandApproval.logId, "approved");
  pendingCommandApproval = null;
  closeModal();
}

function rejectPendingCommand() {
  if (!pendingCommandApproval) {
    closeModal();
    return;
  }

  const view = terminalViews.get(pendingCommandApproval.windowId);
  window.cossAPI?.sendTerminalInput?.(pendingCommandApproval.windowId, "\u0015", {
    bypassPermissionGuard: true,
    clearInputGuard: true,
    reason: "renderer-rejected"
  });
  view?.term?.writeln("");
  view?.term?.writeln("\x1b[33mCosS 已阻止该命令，未发送 Enter 执行。\x1b[0m");
  updateCommandLog(pendingCommandApproval.logId, "rejected");
  pendingCommandApproval = null;
  closeModal();
}

function renderCommandStatus(status) {
  return {
    pending: "等待确认",
    approved: "已确认执行",
    "session-approved": "本会话已授权",
    "approved-by-grant": "会话授权执行",
    executed: "已执行",
    rejected: "已拒绝"
  }[status] || status;
}

function showCommandApprovalModal() {
  if (!pendingCommandApproval) {
    return;
  }

  const role = getRole(pendingCommandApproval.roleId);
  const assessment = pendingCommandApproval.assessment;
  renderModal(`
    <div class="modal command-approval">
      <h2>命令执行需要确认</h2>
      <p>${escapeHtml(role.name)} 即将执行一个 ${renderSeverityLabel(assessment.severity)} 命令。你可以只允许本次执行，也可以在当前会话内允许同一角色执行同类命令。</p>
      <div class="risk-summary ${assessment.severity}">
        <strong>${escapeHtml(assessment.label)}</strong>
        <span>${escapeHtml(assessment.description)}</span>
      </div>
      <pre class="command-preview">${escapeHtml(pendingCommandApproval.command)}</pre>
      <div class="modal-actions">
        <button class="secondary-button" data-action="reject-command">拒绝执行</button>
        <button class="secondary-button" data-action="approve-command-session">本会话允许同类命令</button>
        <button class="primary-button" data-action="approve-command">允许一次</button>
      </div>
    </div>
  `);
}

function approvePendingCommand(options = {}) {
  if (!pendingCommandApproval) {
    return;
  }

  const win = getWindowState(pendingCommandApproval.windowId);
  let grant = null;
  if (options.remember && win) {
    grant = createCommandApprovalGrant(win, pendingCommandApproval.assessment, pendingCommandApproval.command);
  }

  window.cossAPI?.sendTerminalInput?.(pendingCommandApproval.windowId, "\r", {
    bypassPermissionGuard: true,
    clearInputGuard: true,
    reason: options.remember ? "renderer-session-approved" : "renderer-approved",
    grantId: grant?.id || ""
  });
  updateCommandLog(
    pendingCommandApproval.logId,
    options.remember ? "session-approved" : "approved",
    grant ? { grantId: grant.id, grantScope: grant.scope } : {}
  );
  pendingCommandApproval = null;
  closeModal();
}

function renderClaudeStatus(status) {
  if (!status) {
    return `
      <div class="claude-status empty" data-claude-status>
        尚未检测 Claude Code 环境。
      </div>
    `;
  }

  const headline = status.installed ? "Claude Code 已可用" : "未检测到 Claude Code";
  const detail = status.installed
    ? (status.version || status.versionError || "claude 命令存在，但未返回版本信息。")
    : `${status.autoInstallDisabled ? "当前测试环境禁用了自动安装。" : "创建 Claude Code 角色终端时会尝试自动安装。"} 推荐命令：${status.installCommand}`;

  return `
    <div class="claude-status ${status.installed ? "ready" : "missing"}" data-claude-status>
      <strong>${escapeHtml(headline)}</strong>
      <span>命令：${escapeHtml(status.command)}</span>
      <span>${escapeHtml(detail)}</span>
      ${renderAgentAuthLines(status.auth)}
      <span>检测时间：${escapeHtml(formatDateTime(status.checkedAt))}</span>
    </div>
  `;
}

function renderCodexStatus(status) {
  if (!status) {
    return `
      <div class="claude-status empty" data-codex-status>
        尚未检测 Codex CLI 环境。
      </div>
    `;
  }

  const headline = status.runnable ? "Codex CLI 已可用" : "未检测到可运行的 Codex CLI";
  const npmDetail = status.npm?.usable
    ? `npm 可用：${status.npm.version || "已检测"}（${status.npm.command || "npm"}）`
    : `npm 不可用：${status.npm?.errorDetail || "未返回版本信息"}`;
  const npmCandidates = status.npm?.candidates?.length
    ? `npm 候选：${status.npm.candidates.join(" | ")}`
    : "";
  const lookupDetail = status.lookupPaths?.length
    ? `PATH 命中：${status.lookupPaths.join(" | ")}`
    : "PATH 未命中 codex。";
  const detail = status.runnable
    ? (status.version || "codex 命令存在，但未返回版本信息。")
    : `${status.autoInstallDisabled ? "当前环境禁用了 Codex 自动安装。" : "创建 Codex Agent 时会尝试自动安装。"} 推荐命令：${status.installCommand}`;

  return `
    <div class="claude-status ${status.runnable ? "ready" : "missing"}" data-codex-status>
      <strong>${escapeHtml(headline)}</strong>
      <span>命令：${escapeHtml(status.command || "codex")}</span>
      <span>${escapeHtml(detail)}</span>
      <span>${escapeHtml(npmDetail)}</span>
      ${npmCandidates ? `<span>${escapeHtml(npmCandidates)}</span>` : ""}
      <span>${escapeHtml(lookupDetail)}</span>
      ${status.hasWindowsAppsPackagePath ? `<span>${escapeHtml("检测到 WindowsApps 中的 OpenAI Codex 应用包路径，它可能不能作为 CLI 直接启动。")}</span>` : ""}
      ${status.errorDetail ? `<span>${escapeHtml(`错误：${status.errorDetail}`)}</span>` : ""}
      ${renderAgentAuthLines(status.auth)}
      <span>检测时间：${escapeHtml(formatDateTime(status.checkedAt))}</span>
    </div>
  `;
}

function renderCodeBuddyStatus(status) {
  if (!status) {
    return `
      <div class="claude-status empty" data-codebuddy-status>
        尚未检测 CodeBuddy Code CLI 环境。
      </div>
    `;
  }

  const headline = status.runnable ? "CodeBuddy Code CLI 已可用" : "未检测到可运行的 CodeBuddy Code CLI";
  const npmDetail = status.npm?.usable
    ? `npm 可用：${status.npm.version || "已检测"}（${status.npm.command || "npm"}）`
    : `npm 不可用：${status.npm?.errorDetail || "未返回版本信息"}`;
  const npmCandidates = status.npm?.candidates?.length
    ? `npm 候选：${status.npm.candidates.join(" | ")}`
    : "";
  const lookupDetail = status.lookupPaths?.length
    ? `PATH 命中：${status.lookupPaths.join(" | ")}`
    : "PATH 未命中 codebuddy 或 cbc。";
  const detail = status.runnable
    ? (status.version || "codebuddy 命令存在，但未返回版本信息。")
    : `${status.autoInstallDisabled ? "当前环境禁用了 CodeBuddy Code 自动安装。" : "创建 CodeBuddy Agent 时会尝试自动安装。"} 推荐命令：${status.installCommand}`;

  return `
    <div class="claude-status ${status.runnable ? "ready" : "missing"}" data-codebuddy-status>
      <strong>${escapeHtml(headline)}</strong>
      <span>命令：${escapeHtml(status.command || "codebuddy")}</span>
      <span>${escapeHtml(detail)}</span>
      <span>${escapeHtml(npmDetail)}</span>
      ${npmCandidates ? `<span>${escapeHtml(npmCandidates)}</span>` : ""}
      <span>${escapeHtml(lookupDetail)}</span>
      ${status.errorDetail ? `<span>${escapeHtml(`错误：${status.errorDetail}`)}</span>` : ""}
      ${renderAgentAuthLines(status.auth)}
      <span>检测时间：${escapeHtml(formatDateTime(status.checkedAt))}</span>
    </div>
  `;
}

function renderAgentAuthLines(auth) {
  if (!auth) {
    return "";
  }

  const sourceLabels = {
    env: "环境变量",
    config: "配置文件",
    "config-present": "配置文件存在但未发现登录凭据",
    missing: "未发现配置"
  };
  const credentialPath = auth.authPath || auth.configPath || "";
  const lines = [
    `登录状态：${auth.loggedIn ? "已检测到登录凭据" : "未检测到登录凭据"} · ${sourceLabels[auth.source] || auth.source || "未知来源"}`,
    credentialPath ? `凭据路径：${credentialPath}${auth.configExists === false ? "（不存在）" : ""}` : "",
    auth.homePath ? `主目录：${auth.homePath}` : "",
    Array.isArray(auth.envKeys) && auth.envKeys.length ? `命中环境变量：${auth.envKeys.join(", ")}` : "",
    auth.configError ? `配置读取错误：${auth.configError}` : ""
  ].filter(Boolean);

  return lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
}

function renderAgentLoginTestStatus(provider) {
  const normalized = normalizeAgentProvider(provider);
  const status = agentLoginTestStatuses[normalized];
  const attr = `data-agent-login-status="${escapeHtml(normalized)}"`;
  if (!status) {
    return `<div class="model-connectivity-status idle" ${attr}>尚未测试 ${getAgentProviderLabel(normalized)} 远程登录态。</div>`;
  }
  if (status.state === "testing") {
    return `<div class="model-connectivity-status testing" ${attr}>正在测试远程登录态...</div>`;
  }
  if (status.ok) {
    return `
      <div class="model-connectivity-status ready" ${attr}>
        <strong>远程登录态可用</strong>
        <span>${escapeHtml(status.message || "远程 API 校验通过。")} · ${escapeHtml(formatDateTime(status.checkedAt))}</span>
      </div>
    `;
  }
  return `
    <div class="model-connectivity-status missing" ${attr}>
      <strong>${status.skipped ? "远程登录态未测试" : "远程登录态不可用"}</strong>
      <span>${escapeHtml(status.message || status.error || "远程 API 校验失败。")}${status.checkedAt ? ` · ${escapeHtml(formatDateTime(status.checkedAt))}` : ""}</span>
    </div>
  `;
}

function renderLogRows() {
  const logs = getProjectCommandLogs().slice(0, 60);
  if (logs.length === 0) {
    return `<div class="empty-log">暂无命令日志。角色终端执行命令后会在这里记录。</div>`;
  }

  return logs
    .map((log) => `
      <div class="log-item">
        <div class="log-item-main">
          <strong>${escapeHtml(log.command)}</strong>
          <span>${escapeHtml(log.roleName)} · ${escapeHtml(log.riskLabel)} · ${escapeHtml(formatDateTime(log.createdAt))}</span>
        </div>
        <span class="status-chip ${escapeHtml(log.status)}">${escapeHtml(renderCommandStatus(log.status))}</span>
      </div>
    `)
    .join("");
}

function showLogsModal() {
  renderModal(`
    <div class="modal log-panel">
      <h2>命令审计与环境</h2>
      <p>这里记录角色终端执行过的命令，并提供 Claude Code 环境重新检测。</p>
      <section class="log-section">
        <div class="log-section-title">
          <strong>Claude Code 环境</strong>
          <button class="secondary-button" data-action="check-claude">重新检测</button>
        </div>
        <div id="claudeStatusMount">${renderClaudeStatus(latestClaudeStatus)}</div>
      </section>
      <section class="log-section">
        <div class="log-section-title">
          <strong>终端命令日志</strong>
          <span>${getProjectCommandLogs().length} 条</span>
        </div>
        <div class="log-list">${renderLogRows()}</div>
      </section>
      <div class="modal-actions">
        <button class="primary-button" data-action="close-modal">关闭</button>
      </div>
    </div>
  `);
}

function renderAgentProviderOption(value, label, description) {
  const active = state.settings.agentProvider === value;
  return `
    <button class="agent-provider-option ${active ? "active" : ""}" data-action="set-agent-provider" data-provider="${value}">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(description)}</span>
    </button>
  `;
}

function renderAgentPermissionOption(policy) {
  const active = normalizeAgentPermissionMode(state.settings.agentPermissionMode) === policy.id;
  return `
    <button class="permission-policy-option ${active ? "active" : ""}" data-action="set-agent-permission-mode" data-permission-mode="${escapeHtml(policy.id)}">
      <strong>${escapeHtml(policy.label)}</strong>
      <span>${escapeHtml(policy.description)}</span>
    </button>
  `;
}

function renderModelProviderOption(provider) {
  const config = getModelConfig(provider);
  const active = state.settings.modelProvider === config.id;
  const editing = modelEditorProvider === config.id;
  const usable = canUseModelProvider(config.id);
  return `
    <button class="model-provider-option ${active ? "active" : ""} ${editing ? "editing" : ""}" data-action="edit-model-provider" data-provider="${config.id}">
      <strong>${escapeHtml(config.label)}</strong>
      <span>${escapeHtml(config.modelName)}</span>
      <small>${config.locked ? "无需 API key" : `API key：${escapeHtml(renderMaskedSecret(config.apiKey))}`}</small>
      <em>${active ? "当前使用" : usable ? "可切换" : "需填写 API key"}</em>
    </button>
  `;
}

function renderModelConnectivityStatus(provider) {
  const id = normalizeModelProvider(provider);
  const status = modelConnectivityStatuses[id];
  if (!status) {
    return `<div class="model-connectivity-status idle" data-model-connectivity-status="${escapeHtml(id)}">尚未测试连通性。</div>`;
  }

  if (status.state === "testing") {
    return `<div class="model-connectivity-status testing" data-model-connectivity-status="${escapeHtml(id)}">正在测试连通性...</div>`;
  }

  if (status.ok) {
    const latencyText = Number.isFinite(status.latencyMs) ? ` · ${status.latencyMs}ms` : "";
    return `
      <div class="model-connectivity-status ready" data-model-connectivity-status="${escapeHtml(id)}">
        <strong>连通性正常</strong>
        <span>${escapeHtml(status.modelName || "")}${latencyText} · ${escapeHtml(formatDateTime(status.checkedAt))}</span>
      </div>
    `;
  }

  return `
    <div class="model-connectivity-status missing" data-model-connectivity-status="${escapeHtml(id)}">
      <strong>连通性失败</strong>
      <span>${escapeHtml(status.error || "模型接口不可用。")}${status.checkedAt ? ` · ${escapeHtml(formatDateTime(status.checkedAt))}` : ""}</span>
    </div>
  `;
}

function renderModelSettingsSection() {
  const activeModel = getActiveModelConfig();
  const editingModel = getModelConfig(modelEditorProvider);
  const canActivateEditingModel = canUseModelProvider(editingModel.id);
  const apiKeyField = editingModel.locked
    ? `<div class="field"><label>API Key</label><input value="系统模型无需 API key" readonly /></div>`
    : `
      <div class="field">
        <label for="modelApiKey">API Key</label>
        <input id="modelApiKey" type="password" autocomplete="off" placeholder="填写后才可以切换到该模型" value="${escapeHtml(editingModel.apiKey)}" data-model-provider="${editingModel.id}" data-model-field="apiKey" />
      </div>
    `;

  return `
    <div class="settings-section-title">
      <strong>模型配置</strong>
      <span>默认系统模型固定为 ${escapeHtml(MODEL_PROVIDER_PRESETS.system.baseUrl)} / ${escapeHtml(MODEL_PROVIDER_PRESETS.system.modelName)}。</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>当前系统模型</strong>
        <span>${escapeHtml(activeModel.label)} · ${escapeHtml(activeModel.baseUrl)} · ${escapeHtml(activeModel.modelName)}${activeModel.apiKeyRequired ? ` · API key ${activeModel.apiKey ? "已填写" : "未填写"}` : " · 无需 API key"}</span>
      </div>
      <span class="settings-value">${escapeHtml(activeModel.modelName)}</span>
    </div>
    <div class="model-provider-grid">
      ${Object.keys(MODEL_PROVIDER_PRESETS).map(renderModelProviderOption).join("")}
    </div>
    <div class="model-config-panel">
      <div class="model-config-heading">
        <div>
          <strong>${escapeHtml(editingModel.label)}</strong>
          <span>${escapeHtml(editingModel.description)}</span>
        </div>
        <div class="model-config-actions">
          <button class="secondary-button" data-action="test-model-connectivity" data-provider="${editingModel.id}">测试连通性</button>
          <button class="primary-button" data-action="set-model-provider" data-provider="${editingModel.id}">${state.settings.modelProvider === editingModel.id ? "当前模型" : "设为当前模型"}</button>
        </div>
      </div>
      <div class="model-config-grid">
        <div class="field">
          <label for="modelBaseUrl">Base URL</label>
          <input id="modelBaseUrl" value="${escapeHtml(editingModel.baseUrl)}" ${editingModel.locked ? "readonly" : ""} data-model-provider="${editingModel.id}" data-model-field="baseUrl" />
        </div>
        <div class="field">
          <label for="modelName">模型名称</label>
          <input id="modelName" value="${escapeHtml(editingModel.modelName)}" ${editingModel.locked ? "readonly" : ""} data-model-provider="${editingModel.id}" data-model-field="modelName" />
        </div>
        ${apiKeyField}
      </div>
      <div class="model-config-note ${canActivateEditingModel ? "ready" : "missing"}">
        ${canActivateEditingModel ? "该模型配置可以切换使用。" : "该模型需要先填写 API key，才允许切换为当前模型。"}
      </div>
      ${renderModelConnectivityStatus(editingModel.id)}
    </div>
  `;
}

function renderSettingsNav() {
  return SETTINGS_SECTIONS.map((section) => `
    <button class="${activeSettingsSection === section.id ? "active" : ""}" data-action="set-settings-section" data-section="${section.id}">
      ${icon(section.icon)}${escapeHtml(section.label)}
    </button>
  `).join("");
}

function renderSettingsPlaceholder(title, description, items = []) {
  return `
    <div class="settings-empty-panel">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
      ${items.length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
    </div>
  `;
}

function renderMemorySettingsSection() {
  const project = getProject();
  if (!project) {
    return renderSettingsPlaceholder("记忆", "当前没有打开的项目。", ["先创建或选择一个项目"]);
  }
  const memory = ensureProjectMemoryShape(project);
  const taskCount = memory.taskHistory.length;
  const artifactCount = memory.artifacts.length;
  const decisionCount = memory.decisions.length;
  const updatedAt = memory.updatedAt ? formatDateTime(memory.updatedAt) : "尚未刷新";
  return `
    <div class="settings-section-title">
      <strong>项目记忆</strong>
      <span>项目记忆会在新建任务时提供给 Kernel Planner，并通过 MCP 上下文提供给 Agent，避免每个新任务都像新项目一样重新规划。</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>当前项目</strong>
        <span>${escapeHtml(project.name)} · ${escapeHtml(project.path || "")}</span>
      </div>
      <button class="settings-toggle-button" data-action="toggle-project-memory" aria-pressed="${memory.enabled !== false}">
        <span class="settings-toggle ${memory.enabled !== false ? "on" : ""}"></span>
      </button>
    </div>
    <div class="settings-row project-memory-actions-row">
      <div>
        <strong>记忆状态</strong>
        <span>${memory.enabled !== false ? "已开启" : "已关闭"} · ${taskCount} 个任务摘要 · ${artifactCount} 个产物 · ${decisionCount} 条决策 · ${escapeHtml(updatedAt)}</span>
      </div>
      <div class="settings-action-stack">
        <button class="secondary-button" data-action="refresh-project-memory">刷新记忆</button>
        <button class="secondary-button" data-action="save-project-memory">保存备注</button>
        <button class="secondary-button danger" data-action="clear-project-memory">清空</button>
      </div>
    </div>
    <div class="project-memory-panel">
      <label for="projectMemoryManualNotes">手写项目备注</label>
      <textarea id="projectMemoryManualNotes" spellcheck="false" placeholder="例如：本项目已选 React + Vite；后端接口前缀为 /api；不要重复创建脚手架。">${escapeHtml(memory.manualNotes || "")}</textarea>
      <div class="project-memory-help">这部分会被原样放入新任务规划提示词，适合记录架构选择、目录约定、已确认边界和不要重复的事项。</div>
    </div>
    <div class="project-memory-panel">
      <label>自动摘要</label>
      <pre class="project-memory-summary">${escapeHtml(formatProjectMemoryForDisplay(memory))}</pre>
    </div>
  `;
}

function renderSystemSettingsSection() {
  const activeModel = getActiveModelConfig();
  return `
    <div class="settings-row">
      <div>
        <strong>应用版本</strong>
        <span>当前 CosS 桌面应用版本。</span>
      </div>
      <span class="settings-value">${APP_VERSION}</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>默认工作区路径</strong>
        <span>新项目默认工作区仍使用当前 CosS 工作目录，后续可在这里配置全局默认路径。</span>
      </div>
      <span class="settings-value">D:\\CosS</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>当前模型摘要</strong>
        <span>${escapeHtml(activeModel.label)} · ${escapeHtml(activeModel.modelName)}。完整配置请进入“模型”。</span>
      </div>
      <button class="secondary-button" data-action="set-settings-section" data-section="model">打开模型</button>
    </div>
    <div class="settings-row">
      <div>
        <strong>Agent 摘要</strong>
        <span>当前 Agent 后端为 ${getAgentProviderLabel(state.settings.agentProvider)}。终端后端与环境检测请进入“智能体设置”。</span>
      </div>
      <button class="secondary-button" data-action="set-settings-section" data-section="agent">打开智能体</button>
    </div>
  `;
}

function renderMcpConfigStatus() {
  if (!mcpConfigStatus) {
    return `
      <div class="model-connectivity-status idle" data-mcp-config-status>
        <strong>尚未检测当前项目 MCP 配置</strong>
        <span>点击“检测配置”可检查 .mcp.json、.coss/mcp/coss-mcp.json 以及 Claude Code / Codex / CodeBuddy Code 的项目可发现状态。</span>
      </div>
    `;
  }

  if (mcpConfigStatus.state === "writing" || mcpConfigStatus.state === "checking") {
    return `
      <div class="model-connectivity-status testing" data-mcp-config-status>
        <strong>${mcpConfigStatus.state === "checking" ? "正在检测 MCP 配置" : "正在生成 MCP 配置"}</strong>
        <span>${escapeHtml(mcpConfigStatus.message || "请稍候...")}</span>
      </div>
    `;
  }

  const root = mcpConfigStatus.rootConfig || {};
  const coss = mcpConfigStatus.cossConfig || {};
  const rootReady = root.exists && root.valid && root.matches;
  const cossReady = coss.exists && coss.valid && coss.matches && coss.metaMatches !== false;
  const providers = [
    ["Claude Code", rootReady],
    ["Codex", rootReady],
    ["CodeBuddy Code", rootReady]
  ];
  const checkedAt = mcpConfigStatus.checkedAt ? ` · ${formatDateTime(mcpConfigStatus.checkedAt)}` : "";

  return `
    <div class="model-connectivity-status ${mcpConfigStatus.ok ? "ready" : "missing"}" data-mcp-config-status>
      <strong>${mcpConfigStatus.ok ? "项目 MCP 配置健康" : "项目 MCP 配置需要修复"}</strong>
      <span>${escapeHtml(mcpConfigStatus.error || `检测时间${checkedAt}`)}</span>
      <span>.mcp.json：${rootReady ? "可发现" : root.exists ? root.valid ? "coss server 不匹配" : `解析失败：${root.error || "JSON 无效"}` : "缺失"}${root.path ? ` · ${root.path}` : ""}</span>
      <span>.coss/mcp/coss-mcp.json：${cossReady ? "已同步" : coss.exists ? coss.valid ? "内容不匹配" : `解析失败：${coss.error || "JSON 无效"}` : "缺失"}${coss.path ? ` · ${coss.path}` : ""}</span>
      <div class="mcp-agent-discovery-list">
        ${providers.map(([label, ready]) => `<span class="${ready ? "ready" : "missing"}">${escapeHtml(label)}：${ready ? "可发现" : "待修复"}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderAgentSettingsSection() {
  return `
    <div class="settings-row agent-provider-row">
      <div>
        <strong>Agent 终端</strong>
        <span>选择创建角色 Agent 时默认使用的终端后端。</span>
      </div>
      <div class="agent-provider-switch">
        ${renderAgentProviderOption("claude", "Claude Code", "适合 Claude Code 交互式开发任务。")}
        ${renderAgentProviderOption("codex", "Codex", "适合 Codex CLI 代码代理任务。")}
        ${renderAgentProviderOption("codebuddy", "CodeBuddy Code", "适合 CodeBuddy Code 代码代理任务。")}
      </div>
    </div>
    <div class="settings-row">
      <div>
        <strong>CosS MCP 工具层</strong>
        <span>为当前项目生成 v0.10 Kernel MCP 配置，让 Agent 通过任务板、租约步骤、结构化结果、资源锁和审批完成协作。</span>
      </div>
      <div class="settings-action-stack">
        <button class="settings-toggle-button" data-action="toggle-agent-mcp-auto-config" aria-pressed="${state.settings.agentMcpAutoConfigEnabled === true}" title="创建 Agent 终端时自动维护项目 MCP 配置">
          <span class="settings-toggle ${state.settings.agentMcpAutoConfigEnabled === true ? "on" : ""}"></span>
        </button>
        <button class="secondary-button" data-action="check-project-mcp-config">检测配置</button>
        <button class="secondary-button" data-action="write-project-mcp-config">生成/修复</button>
        <button class="secondary-button" data-action="show-mcp-audit">查看审计</button>
      </div>
    </div>
    <div class="settings-status-slot">${renderMcpConfigStatus()}</div>
    <div class="settings-row">
      <div>
        <strong>Claude Code 自动检测</strong>
        <span>创建 Agent 终端时，如果选择 Claude Code，会沿用自动检测与 winget 安装流程。</span>
      </div>
      <button class="secondary-button" data-action="check-claude">重新检测</button>
    </div>
    <div class="settings-status-slot" id="claudeStatusMount">${renderClaudeStatus(latestClaudeStatus)}</div>
    <div class="settings-row">
      <div>
        <strong>Claude Code 登录测试</strong>
        <span>手动调用远程 API 校验当前凭据是否可用；没有 API key 时只显示跳过原因。</span>
      </div>
      <button class="secondary-button" data-action="test-agent-login" data-provider="claude">测试登录态</button>
    </div>
    <div class="settings-status-slot" id="claudeLoginTestMount">${renderAgentLoginTestStatus("claude")}</div>
    <div class="settings-row">
      <div>
        <strong>Codex 命令</strong>
        <span>默认查找 codex；不可运行时会通过 npm 自动安装 Codex CLI。需要自定义路径时，可设置环境变量 COSS_CODEX_COMMAND。</span>
      </div>
      <span class="settings-value">codex</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>Codex 自动检测</strong>
        <span>检测 codex、npm、PATH 命中路径和 WindowsApps 应用包冲突。</span>
      </div>
      <button class="secondary-button" data-action="check-codex">重新检测</button>
    </div>
    <div class="settings-status-slot" id="codexStatusMount">${renderCodexStatus(latestCodexStatus)}</div>
    <div class="settings-row">
      <div>
        <strong>Codex 登录测试</strong>
        <span>手动调用 OpenAI/Codex 远程 API 校验当前凭据是否可用；没有 key 时只显示跳过原因。</span>
      </div>
      <button class="secondary-button" data-action="test-agent-login" data-provider="codex">测试登录态</button>
    </div>
    <div class="settings-status-slot" id="codexLoginTestMount">${renderAgentLoginTestStatus("codex")}</div>
    <div class="settings-row">
      <div>
        <strong>CodeBuddy Code 命令</strong>
        <span>默认查找 codebuddy，并兼容 cbc；不可运行时会通过 npm 自动安装 CodeBuddy Code CLI。需要自定义路径时，可设置环境变量 COSS_CODEBUDDY_COMMAND。</span>
      </div>
      <span class="settings-value">codebuddy</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>CodeBuddy Code API Key</strong>
        <span>创建 CodeBuddy Agent 终端时会写入 CODEBUDDY_API_KEY 环境变量；该值需要用户自行填写。</span>
      </div>
      <div class="settings-inline-field">
        <input type="password" autocomplete="off" placeholder="填写 CodeBuddy API Key" value="${escapeHtml(state.settings.codeBuddyApiKey || "")}" data-codebuddy-api-key />
      </div>
    </div>
    <div class="settings-row">
      <div>
        <strong>CodeBuddy Code 自动检测</strong>
        <span>检测 codebuddy、cbc、npm 和 PATH 命中路径。</span>
      </div>
      <button class="secondary-button" data-action="check-codebuddy">重新检测</button>
    </div>
    <div class="settings-status-slot" id="codeBuddyStatusMount">${renderCodeBuddyStatus(latestCodeBuddyStatus)}</div>
    <div class="settings-row">
      <div>
        <strong>CodeBuddy Code 登录测试</strong>
        <span>手动调用 CodeBuddy 兼容远程接口校验当前 API Key 是否可用；没有 key 时只显示跳过原因。</span>
      </div>
      <button class="secondary-button" data-action="test-agent-login" data-provider="codebuddy">测试登录态</button>
    </div>
    <div class="settings-status-slot" id="codeBuddyLoginTestMount">${renderAgentLoginTestStatus("codebuddy")}</div>
    <div class="settings-row">
      <div>
        <strong>Agent 角色提示词模板</strong>
        <span>创建 Claude Code、Codex 或 CodeBuddy Agent 终端时，会把模板渲染后写入 COSS_ROLE_PROMPT，并同步会话与任务上下文。</span>
      </div>
      <button class="secondary-button" data-action="reset-agent-prompt-template">恢复默认</button>
    </div>
    <div class="settings-code-editor">
      <textarea data-agent-prompt-template spellcheck="false">${escapeHtml(state.settings.agentPromptTemplate || defaultState.settings.agentPromptTemplate)}</textarea>
      <div class="settings-code-help">
        支持占位符：{{roleName}}、{{roleDescription}}、{{projectName}}、{{workspace}}、{{agentProvider}}、{{agentPermissionLabel}}、{{agentPermissionInstructions}}、{{sessionId}}、{{taskTitle}}、{{taskGoal}}、{{subtaskTitle}}、{{subtaskDescription}}。
      </div>
    </div>
    <div class="settings-row">
      <div>
        <strong>Agent 失败回退到 PowerShell</strong>
        <span>关闭后，Agent 启动或安装失败时只保留错误日志窗口，不进入普通 PowerShell 提示符。</span>
      </div>
      <button class="settings-toggle-button" data-action="toggle-agent-fallback" aria-pressed="${state.settings.agentFallbackToShell !== false}">
        <span class="settings-toggle ${state.settings.agentFallbackToShell !== false ? "on" : ""}"></span>
      </button>
    </div>
  `;
}

function renderSecuritySettingsSection() {
  const activePolicy = getAgentPermissionPolicy();
  return `
    <div class="settings-row permission-policy-row">
      <div>
        <strong>Agent 权限模式</strong>
        <span>当前模式：${escapeHtml(activePolicy.label)}。新建 Agent 终端和后续任务投递都会携带该权限说明。</span>
      </div>
      <div class="permission-policy-grid">
        ${Object.values(AGENT_PERMISSION_POLICIES).map(renderAgentPermissionOption).join("")}
      </div>
    </div>
    <div class="settings-status-slot permission-policy-status">
      <strong>${escapeHtml(activePolicy.label)}</strong>
      <span>${escapeHtml(activePolicy.instruction)}</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>终端安全确认</strong>
        <span>高风险命令会在执行前弹出确认窗口，并写入命令审计日志。</span>
      </div>
      <span class="settings-toggle on"></span>
    </div>
    <div class="settings-row">
      <div>
        <strong>命令审计日志</strong>
        <span>查看角色终端的高风险命令、确认状态和执行记录。</span>
      </div>
      <button class="secondary-button" data-action="show-logs">打开日志</button>
    </div>
  `;
}

function formatFileSize(size) {
  const value = Number(size) || 0;
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

function renderStorageOperationStatus() {
  if (!storageOperationStatus) {
    return "";
  }
  return `
    <div class="model-connectivity-status ${storageOperationStatus.ok ? "ready" : "missing"}" data-storage-operation-status>
      <strong>${escapeHtml(storageOperationStatus.title || (storageOperationStatus.ok ? "操作完成" : "操作失败"))}</strong>
      <span>${escapeHtml(storageOperationStatus.message || "")}</span>
    </div>
  `;
}

function renderStorageSettingsSection() {
  const info = latestStorageInfo;
  const backups = info?.backups || [];
  return `
    <div class="settings-row">
      <div>
        <strong>SQLite 状态存储</strong>
        <span>${info ? (info.sqliteEnabled ? "当前工作区状态已使用 SQLite 文件保存。" : info.sqliteReason) : "尚未读取存储信息。"}</span>
      </div>
      <button class="secondary-button" data-action="refresh-storage-info">刷新</button>
    </div>
    <div class="settings-status-slot storage-status-card" data-storage-info>
      ${
        info
          ? `
            <strong>${escapeHtml(info.mode)} · Schema ${escapeHtml(info.schemaVersion)}</strong>
            <span>SQLite：${escapeHtml(info.sqlitePath || "未启用")} · ${formatFileSize(info.sqliteSize)} · ${escapeHtml(formatDateTime(info.sqliteModifiedAt))}</span>
            <span>JSON 兼容快照：${escapeHtml(info.statePath || "")} · ${formatFileSize(info.stateSize)}</span>
            <span>备份目录：${escapeHtml(info.backupDirectory || "")} · ${info.backupCount || 0} 个备份</span>
          `
          : "点击刷新读取 SQLite、JSON 快照和备份信息。"
      }
    </div>
    ${renderStorageOperationStatus()}
    <div class="settings-row">
      <div>
        <strong>导出状态数据</strong>
        <span>导出当前 SQLite 中的工作区状态，便于迁移到其他机器或人工备份。</span>
      </div>
      <button class="secondary-button" data-action="export-storage-state">导出</button>
    </div>
    <div class="settings-row">
      <div>
        <strong>导入状态数据</strong>
        <span>导入前会自动创建备份，导入后会写入 SQLite 并刷新 JSON 兼容快照。</span>
      </div>
      <button class="secondary-button" data-action="import-storage-state">导入</button>
    </div>
    <div class="settings-row">
      <div>
        <strong>立即创建备份</strong>
        <span>把当前 SQLite 状态文件复制到备份目录，保留最近 ${escapeHtml(12)} 个备份。</span>
      </div>
      <button class="secondary-button" data-action="create-storage-backup">创建备份</button>
    </div>
    <div class="settings-row">
      <div>
        <strong>导出诊断包</strong>
        <span>包含存储摘要、脱敏状态快照和近期日志，用于排查异常恢复或协作问题。</span>
      </div>
      <button class="secondary-button" data-action="export-diagnostics-package">导出诊断包</button>
    </div>
    <div class="settings-row">
      <div>
        <strong>打开数据目录</strong>
        <span>查看 SQLite、JSON 快照、备份、诊断包和日志目录。</span>
      </div>
      <button class="secondary-button" data-action="open-storage-directory">打开目录</button>
    </div>
    <div class="storage-backup-list">
      <strong>最近备份</strong>
      ${
        backups.length
          ? backups.map((backup) => `
              <div class="storage-backup-item">
                <span>${escapeHtml(backup.name)}</span>
                <em>${escapeHtml(backup.type)} · ${formatFileSize(backup.size)} · ${escapeHtml(formatDateTime(backup.createdAt))}</em>
              </div>
            `).join("")
          : `<span class="muted-text">暂无备份。</span>`
      }
    </div>
  `;
}

function renderSettingsContent() {
  return {
    account: () => renderSettingsPlaceholder("账户管理", "账户登录、团队身份和同步能力将在后续版本接入。", ["本地模式继续可用", "后续支持团队空间和权限"]),
    system: renderSystemSettingsSection,
    agent: renderAgentSettingsSection,
    memory: () => renderSettingsPlaceholder("记忆", "这里将管理项目记忆、角色记忆和可清理的上下文缓存。", ["项目记忆开关", "角色长期记忆", "记忆导出与清理"]),
    memory: renderMemorySettingsSection,
    model: renderModelSettingsSection,
    assistant: () => renderSettingsPlaceholder("助理设置", "这里将配置全局助理行为、默认语气和任务确认策略。", ["默认助理角色", "任务确认策略", "自动总结"]),
    personalization: () => renderSettingsPlaceholder("个性化", "这里将配置主题、字号、桌面背景和窗口偏好。", ["浅色/深色主题", "工作区背景", "窗口默认尺寸"]),
    data: renderStorageSettingsSection,
    security: renderSecuritySettingsSection,
    help: () => renderSettingsPlaceholder("帮助与反馈", "这里将放置使用说明、问题反馈和诊断信息。", ["快捷入口", "诊断包", "反馈记录"])
  }[activeSettingsSection]?.() || renderSystemSettingsSection();
}

function showSettingsModal() {
  const activeSection = SETTINGS_SECTIONS.find((section) => section.id === activeSettingsSection) || SETTINGS_SECTIONS[1];
  renderModal(`
    <div class="settings-shell">
      <aside class="settings-nav">
        ${renderSettingsNav()}
      </aside>
      <section class="settings-panel">
        <button class="settings-close" title="关闭" data-action="close-modal">×</button>
        <h2>${escapeHtml(activeSection.label)}</h2>
        <div class="settings-list">
          ${renderSettingsContent()}
        </div>
      </section>
    </div>
  `);
}

async function checkClaudeStatus() {
  const mount = document.getElementById("claudeStatusMount");
  if (mount) {
    mount.innerHTML = `<div class="claude-status empty" data-claude-status>正在检测 Claude Code 环境...</div>`;
  }

  try {
    latestClaudeStatus = await window.cossAPI.getClaudeStatus();
  } catch (error) {
    latestClaudeStatus = {
      command: "claude",
      installed: false,
      version: "",
      versionError: error.message,
      autoInstallDisabled: false,
      installCommand: "winget install Anthropic.ClaudeCode",
      checkedAt: new Date().toISOString()
    };
  }

  const nextMount = document.getElementById("claudeStatusMount");
  if (nextMount) {
    nextMount.innerHTML = renderClaudeStatus(latestClaudeStatus);
  }
}

async function refreshStorageInfo({ rerender = true } = {}) {
  if (!window.cossAPI?.getStorageInfo) {
    latestStorageInfo = null;
    return null;
  }

  try {
    latestStorageInfo = await window.cossAPI.getStorageInfo();
  } catch (error) {
    storageOperationStatus = {
      ok: false,
      title: "读取存储信息失败",
      message: error.message
    };
  }

  if (rerender && activeSettingsSection === "data") {
    showSettingsModal();
  }
  return latestStorageInfo;
}

async function runStorageOperation(actionName, operation) {
  storageOperationStatus = {
    ok: true,
    title: actionName,
    message: "正在执行..."
  };
  showSettingsModal();

  try {
    const result = await operation();
    storageOperationStatus = {
      ok: Boolean(result?.ok),
      title: result?.ok ? `${actionName}完成` : `${actionName}未完成`,
      message: result?.canceled
        ? "用户已取消。"
        : result?.error || result?.path || result?.backupPath || "操作已完成。"
    };
    await refreshStorageInfo({ rerender: false });
    showSettingsModal();
    return result;
  } catch (error) {
    storageOperationStatus = {
      ok: false,
      title: `${actionName}失败`,
      message: error.message
    };
    showSettingsModal();
    return { ok: false, error: error.message };
  }
}

async function checkCodexStatus() {
  const mount = document.getElementById("codexStatusMount");
  if (mount) {
    mount.innerHTML = `<div class="claude-status empty" data-codex-status>正在检测 Codex CLI 环境...</div>`;
  }

  try {
    latestCodexStatus = await window.cossAPI.getCodexStatus();
  } catch (error) {
    latestCodexStatus = {
      command: "codex",
      requestedCommand: "codex",
      lookupPaths: [],
      runnable: false,
      version: "",
      errorDetail: error.message,
      hasWindowsAppsPackagePath: false,
      installCommand: "npm.cmd install -g @openai/codex",
      npm: { command: "npm.cmd", candidates: ["npm.cmd"], usable: false, version: "", errorDetail: error.message },
      autoInstallDisabled: false,
      checkedAt: new Date().toISOString()
    };
  }

  const nextMount = document.getElementById("codexStatusMount");
  if (nextMount) {
    nextMount.innerHTML = renderCodexStatus(latestCodexStatus);
  }
}

async function checkCodeBuddyStatus() {
  const mount = document.getElementById("codeBuddyStatusMount");
  if (mount) {
    mount.innerHTML = `<div class="claude-status empty" data-codebuddy-status>正在检测 CodeBuddy Code CLI 环境...</div>`;
  }

  try {
    latestCodeBuddyStatus = await window.cossAPI.getCodeBuddyStatus({
      apiKey: state.settings.codeBuddyApiKey || ""
    });
  } catch (error) {
    latestCodeBuddyStatus = {
      command: "codebuddy",
      requestedCommand: "codebuddy",
      lookupPaths: [],
      runnable: false,
      version: "",
      errorDetail: error.message,
      installCommand: "npm.cmd install -g @tencent-ai/codebuddy-code",
      npm: { command: "npm.cmd", candidates: ["npm.cmd"], usable: false, version: "", errorDetail: error.message },
      autoInstallDisabled: false,
      checkedAt: new Date().toISOString()
    };
  }

  const nextMount = document.getElementById("codeBuddyStatusMount");
  if (nextMount) {
    nextMount.innerHTML = renderCodeBuddyStatus(latestCodeBuddyStatus);
  }
}

async function testAgentLogin(provider) {
  const normalized = normalizeAgentProvider(provider);
  agentLoginTestStatuses[normalized] = { state: "testing" };
  const mountId = {
    claude: "claudeLoginTestMount",
    codex: "codexLoginTestMount",
    codebuddy: "codeBuddyLoginTestMount"
  }[normalized] || "claudeLoginTestMount";
  const mount = document.getElementById(mountId);
  if (mount) {
    mount.innerHTML = renderAgentLoginTestStatus(normalized);
  }

  try {
    const result = await window.cossAPI.testAgentLogin({
      provider: normalized,
      apiKey: normalized === "codebuddy" ? state.settings.codeBuddyApiKey || "" : ""
    });
    agentLoginTestStatuses[normalized] = result || { ok: false, message: "远程登录态测试无返回。" };
  } catch (error) {
    agentLoginTestStatuses[normalized] = {
      ok: false,
      skipped: false,
      provider: normalized,
      checkedAt: new Date().toISOString(),
      message: error.message
    };
  }

  const nextMount = document.getElementById(mountId);
  if (nextMount) {
    nextMount.innerHTML = renderAgentLoginTestStatus(normalized);
  }
}

function refreshSettingsModalIfOpen() {
  if (document.querySelector(".settings-shell")) {
    showSettingsModal();
  }
}

function getCurrentProjectMcpRequest() {
  const project = getProject();
  if (!project?.path) {
    return null;
  }
  return {
    projectId: project.id,
    projectPath: project.path
  };
}

async function checkCurrentProjectMcpConfig({ rerender = true } = {}) {
  const request = getCurrentProjectMcpRequest();
  if (!request) {
    mcpConfigStatus = {
      ok: false,
      error: "请先创建或选择一个带项目路径的工作区。"
    };
    if (rerender) {
      refreshSettingsModalIfOpen();
    }
    return { ok: false, error: mcpConfigStatus.error };
  }

  if (!window.cossAPI?.checkProjectMcpConfig) {
    mcpConfigStatus = {
      ok: false,
      error: "当前运行环境未暴露 MCP 配置检测接口。"
    };
    if (rerender) {
      refreshSettingsModalIfOpen();
    }
    return { ok: false, error: mcpConfigStatus.error };
  }

  mcpConfigStatus = {
    state: "checking",
    message: `正在检测 ${request.projectPath}`
  };
  if (rerender) {
    refreshSettingsModalIfOpen();
  }

  try {
    const result = await window.cossAPI.checkProjectMcpConfig(request);
    mcpConfigStatus = result || { ok: false, error: "MCP 配置检测无返回。" };
    recordAppLog("settings.mcp-project-config.checked", {
      projectId: request.projectId,
      ok: Boolean(result?.ok),
      rootConfigMatches: Boolean(result?.rootConfig?.matches),
      cossConfigMatches: Boolean(result?.cossConfig?.matches),
      error: result?.ok ? "" : (result?.error || "")
    }, result?.ok ? "info" : "warn");
    if (rerender) {
      refreshSettingsModalIfOpen();
    }
    return mcpConfigStatus;
  } catch (error) {
    mcpConfigStatus = {
      ok: false,
      error: error.message
    };
    recordAppLog("settings.mcp-project-config.check.failed", {
      projectId: request.projectId,
      error: error.message
    }, "error");
    if (rerender) {
      refreshSettingsModalIfOpen();
    }
    return { ok: false, error: error.message };
  }
}

async function writeCurrentProjectMcpConfig() {
  const request = getCurrentProjectMcpRequest();
  if (!request) {
    mcpConfigStatus = {
      ok: false,
      error: "请先创建或选择一个带项目路径的工作区。"
    };
    refreshSettingsModalIfOpen();
    return { ok: false, error: mcpConfigStatus.error };
  }

  if (!window.cossAPI?.writeProjectMcpConfig) {
    mcpConfigStatus = {
      ok: false,
      error: "当前运行环境未暴露 MCP 配置生成接口。"
    };
    refreshSettingsModalIfOpen();
    return { ok: false, error: mcpConfigStatus.error };
  }

  mcpConfigStatus = {
    state: "writing",
    message: `正在写入 ${request.projectPath}`
  };
  refreshSettingsModalIfOpen();

  try {
    const result = await window.cossAPI.writeProjectMcpConfig(request);
    if (result?.ok) {
      await checkCurrentProjectMcpConfig({ rerender: false });
    } else {
      mcpConfigStatus = {
        ok: false,
        error: result?.error || "MCP 配置生成失败。"
      };
    }
    recordAppLog("settings.mcp-project-config.completed", {
      projectId: request.projectId,
      ok: Boolean(result?.ok),
      rootConfigPath: result?.rootConfigPath || "",
      cossConfigPath: result?.cossConfigPath || "",
      error: result?.ok ? "" : (result?.error || "")
    }, result?.ok ? "info" : "warn");
    refreshSettingsModalIfOpen();
    return result;
  } catch (error) {
    mcpConfigStatus = {
      ok: false,
      error: error.message
    };
    recordAppLog("settings.mcp-project-config.failed", {
      projectId: request.projectId,
      error: error.message
    }, "error");
    refreshSettingsModalIfOpen();
    return { ok: false, error: error.message };
  }
}

async function showMcpAuditModal() {
  closeMenus();
  const project = getProject();
  const taskOptions = (project?.tasks || [])
    .map((task) => `<option value="${escapeHtml(task.id)}" ${mcpAuditFilters.taskId === task.id ? "selected" : ""}>${escapeHtml(task.title)}</option>`)
    .join("");
  const roleOptions = ROLE_TEMPLATES
    .map((role) => `<option value="${escapeHtml(role.id)}" ${mcpAuditFilters.roleId === role.id ? "selected" : ""}>${escapeHtml(role.name)}</option>`)
    .join("");
  const toolOptions = MCP_TOOL_NAMES
    .map((name) => `<option value="${escapeHtml(name)}" ${mcpAuditFilters.tool === name ? "selected" : ""}>${escapeHtml(name)}</option>`)
    .join("");
  const renderAuditShell = (body, eventsCount = null) => `
    <div class="modal mcp-audit-modal">
      <h2>MCP 工具审计</h2>
      <p>${eventsCount === null
        ? "正在读取最近的 mcp.* 日志事件。"
        : `最近 ${eventsCount} 条 MCP 事件。可按角色、任务、工具和关键词过滤。`}</p>
      <div class="mcp-audit-filterbar">
        <label>
          <span>角色</span>
          <select id="mcpAuditRoleFilter">
            <option value="">全部角色</option>
            ${roleOptions}
          </select>
        </label>
        <label>
          <span>任务</span>
          <select id="mcpAuditTaskFilter">
            <option value="">全部任务</option>
            ${taskOptions}
          </select>
        </label>
        <label>
          <span>工具</span>
          <select id="mcpAuditToolFilter">
            <option value="">全部工具</option>
            ${toolOptions}
          </select>
        </label>
        <label>
          <span>搜索</span>
          <input id="mcpAuditQueryFilter" value="${escapeHtml(mcpAuditFilters.query || "")}" placeholder="事件、payload、错误">
        </label>
        <button class="secondary-button compact" data-action="apply-mcp-audit-filters">应用</button>
      </div>
      ${body}
      <div class="modal-actions">
        <button class="secondary-button" data-action="show-settings">返回设置</button>
        <button class="secondary-button" data-action="show-mcp-audit">刷新</button>
        <button class="primary-button" data-action="close-modal">关闭</button>
      </div>
    </div>
  `;

  renderModal(`
    ${renderAuditShell(`<div class="message-empty">正在读取...</div>`)}
  `);

  try {
    const result = window.cossAPI?.getMcpAuditEvents
      ? await window.cossAPI.getMcpAuditEvents({ limit: 80, ...mcpAuditFilters })
      : { ok: false, error: "当前运行环境未暴露 MCP 审计接口。", events: [] };
    const events = result?.events || [];
    renderModal(`
      ${renderAuditShell(`
        <div class="mcp-audit-list">
          ${events.length ? events.map((entry) => `
            <div class="mcp-audit-row ${escapeHtml(entry.level || "info")}">
              <div>
                <strong>${escapeHtml(entry.event || "")}</strong>
                <span>${escapeHtml(formatDateTime(entry.timestamp || ""))} · ${escapeHtml(entry.level || "info")} · ${escapeHtml(entry.fileName || "")}</span>
              </div>
              <pre>${escapeHtml(JSON.stringify(entry.payload || {}, null, 2))}</pre>
            </div>
          `).join("") : `<div class="message-empty">${escapeHtml(result?.error || "暂无 MCP 审计事件。")}</div>`}
        </div>
      `, events.length)}
    `);
  } catch (error) {
    renderModal(`
      ${renderAuditShell(`<div class="message-empty">${escapeHtml(error.message)}</div>`, 0)}
    `);
  }
}

function showTaskMcpConfigPrompt(task, status) {
  renderModal(`
    <div class="modal">
      <h2>为本次任务启用 MCP 自动协作</h2>
      <p>当前项目 MCP 配置尚未就绪。生成后，Claude Code、Codex、CodeBuddy Code 可通过 CosS MCP 工具读取任务、领取消息、续租步骤和回传结构化结果。</p>
      <div class="model-connectivity-status missing">
        <strong>${escapeHtml(task?.title || "新任务")} · MCP 配置待修复</strong>
        <span>${escapeHtml(status?.error || ".mcp.json 或 .coss/mcp/coss-mcp.json 缺失/不匹配。")}</span>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">暂不处理</button>
        <button class="secondary-button" data-action="open-agent-settings">打开智能体设置</button>
        <button class="primary-button" data-action="write-task-mcp-config">生成/修复配置</button>
      </div>
    </div>
  `);
}

async function ensureProjectMcpConfigAfterTaskCreated(task) {
  const project = getProject();
  if (!project?.path || !task) {
    return;
  }

  if (state.settings.agentMcpAutoConfigEnabled) {
    const result = await writeCurrentProjectMcpConfig();
    recordAppLog("task.mcp-config.auto-maintained", {
      projectId: project.id,
      taskId: task.id,
      ok: Boolean(result?.ok),
      error: result?.ok ? "" : (result?.error || "")
    }, result?.ok ? "info" : "warn");
    return;
  }

  const status = await checkCurrentProjectMcpConfig({ rerender: false });
  if (!status?.ok) {
    recordAppLog("task.mcp-config.prompted", {
      projectId: project.id,
      taskId: task.id,
      reason: status?.error || "not-ready"
    }, "warn");
    showTaskMcpConfigPrompt(task, status);
  }
}

async function testModelConnectivity(provider) {
  const config = getModelConfig(provider);
  modelEditorProvider = config.id;

  if (config.apiKeyRequired && !config.apiKey) {
    recordAppLog("model.connectivity.skipped", {
      provider: config.id,
      modelName: config.modelName,
      reason: "missing-api-key"
    }, "warn");
    modelConnectivityStatuses[config.id] = {
      ok: false,
      checkedAt: new Date().toISOString(),
      error: "请先填写 API key 再测试连通性。"
    };
    refreshSettingsModalIfOpen();
    return;
  }

  if (!window.cossAPI?.testModelConnectivity) {
    recordAppLog("model.connectivity.skipped", {
      provider: config.id,
      modelName: config.modelName,
      reason: "api-unavailable"
    }, "error");
    modelConnectivityStatuses[config.id] = {
      ok: false,
      checkedAt: new Date().toISOString(),
      error: "当前运行环境未暴露模型连通性检测接口。"
    };
    refreshSettingsModalIfOpen();
    return;
  }

  modelConnectivityStatuses[config.id] = { state: "testing" };
  refreshSettingsModalIfOpen();

  try {
    const result = await window.cossAPI.testModelConnectivity({
      model: {
        provider: config.id,
        baseUrl: config.baseUrl,
        modelName: config.modelName,
        apiKey: config.apiKey
      }
    });
    recordAppLog("model.connectivity.completed", {
      provider: config.id,
      modelName: config.modelName,
      ok: Boolean(result.ok),
      latencyMs: result.latencyMs,
      error: result.ok ? "" : (result.error || "")
    }, result.ok ? "info" : "warn");
    modelConnectivityStatuses[config.id] = result.ok
      ? {
          ok: true,
          checkedAt: result.checkedAt,
          latencyMs: result.latencyMs,
          modelName: result.modelName || config.modelName,
          baseUrl: result.baseUrl || config.baseUrl,
          source: result.source || "llm"
        }
      : {
          ok: false,
          checkedAt: result.checkedAt || new Date().toISOString(),
          latencyMs: result.latencyMs,
          error: result.error || "模型接口不可用。"
        };
  } catch (error) {
    modelConnectivityStatuses[config.id] = {
      ok: false,
      checkedAt: new Date().toISOString(),
      error: error.message
    };
  }

  refreshSettingsModalIfOpen();
}

function handleAppMenuAction(payload) {
  const action = payload?.action;
  if (action === "show-create-project") {
    showCreateProjectModal();
    return;
  }

  if (action === "show-create-task") {
    showCreateTaskModal();
    return;
  }

  if (action === "show-settings") {
    activeSettingsSection = "system";
    showSettingsModal();
    return;
  }

  if (action === "show-about") {
    showAboutModal();
  }
}

const APP_MENU_DEFINITIONS = [
  {
    id: "file",
    label: "文件",
    items: [
      { label: "新建窗口", command: "new-window", shortcut: "Ctrl+N" },
      { label: "新建任务", command: "show-create-task", shortcut: "Ctrl+Shift+T" },
      { label: "新建项目", command: "show-create-project", shortcut: "Ctrl+Shift+N" },
      { type: "separator" },
      { label: "设置", command: "show-settings", shortcut: "Ctrl+," },
      { type: "separator" },
      { label: "关闭窗口", command: "close-window", shortcut: "Ctrl+W" }
    ]
  },
  {
    id: "edit",
    label: "编辑",
    items: [
      { label: "撤销(U)", command: "edit-undo", shortcut: "Ctrl+Z" },
      { label: "重做(R)", command: "edit-redo", shortcut: "Ctrl+Y" },
      { type: "separator" },
      { label: "剪切(T)", command: "edit-cut", shortcut: "Ctrl+X" },
      { label: "复制(C)", command: "edit-copy", shortcut: "Ctrl+C" },
      { label: "粘贴(P)", command: "edit-paste", shortcut: "Ctrl+V" },
      { type: "separator" },
      { label: "全选(A)", command: "edit-select-all", shortcut: "Ctrl+A" }
    ]
  },
  {
    id: "help",
    label: "帮助",
    items: [
      { label: "打开日志目录", command: "open-log-directory" },
      { label: "关于 CosS", command: "show-about" }
    ]
  }
];

function renderAppTitlebar() {
  return `
    <header class="app-titlebar">
      <div class="app-titlebar-left">
        <div class="app-titlemark">
          <span class="app-title-icon" aria-hidden="true"></span>
          <span class="app-title-text">CosS</span>
        </div>
        <nav class="app-menu-bar" aria-label="应用菜单">
          ${APP_MENU_DEFINITIONS.map(renderAppMenuButton).join("")}
        </nav>
      </div>
      <div class="app-window-controls" aria-label="窗口控制">
        <button class="app-window-control" title="最小化" data-action="window-control" data-window-action="minimize" aria-label="最小化">-</button>
        <button class="app-window-control" title="${isWindowMaximized ? "还原" : "最大化"}" data-action="window-control" data-window-action="toggle-maximize" aria-label="${isWindowMaximized ? "还原" : "最大化"}">${isWindowMaximized ? "❐" : "□"}</button>
        <button class="app-window-control close" title="关闭" data-action="window-control" data-window-action="close" aria-label="关闭">×</button>
      </div>
    </header>
  `;
}

function renderAppMenuButton(menu) {
  const open = openAppMenuId === menu.id;
  return `
    <div class="app-menu-slot">
      <button class="app-menu-button ${open ? "active" : ""}" data-action="toggle-app-menu" data-menu-id="${menu.id}" aria-expanded="${open}">
        ${escapeHtml(menu.label)}
      </button>
      ${open ? renderAppMenuDropdown(menu) : ""}
    </div>
  `;
}

function renderAppMenuDropdown(menu) {
  return `
    <div class="app-menu-dropdown" data-menu-dropdown="${escapeHtml(menu.id)}">
      ${menu.items.map((item) => {
        if (item.type === "separator") {
          return `<div class="app-menu-separator"></div>`;
        }
        return `
          <button class="app-menu-item" data-action="custom-menu-command" data-command="${escapeHtml(item.command)}">
            <span>${escapeHtml(item.label)}</span>
            ${item.shortcut ? `<kbd>${escapeHtml(item.shortcut)}</kbd>` : ""}
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function runEditCommand(command) {
  const commandMap = {
    "edit-undo": "undo",
    "edit-redo": "redo",
    "edit-cut": "cut",
    "edit-copy": "copy",
    "edit-paste": "paste",
    "edit-select-all": "selectAll"
  };
  const browserCommand = commandMap[command];
  if (browserCommand) {
    document.execCommand(browserCommand);
  }
}

async function executeCustomMenuCommand(command) {
  openAppMenuId = null;

  if (command?.startsWith("edit-")) {
    runEditCommand(command);
    render();
    return;
  }

  if (command === "new-window") {
    await window.cossAPI?.createAppWindow?.();
    render();
    return;
  }

  if (command === "close-window") {
    await window.cossAPI?.controlWindow?.("close");
    return;
  }

  if (command === "show-create-project") {
    showCreateProjectModal();
    render();
    return;
  }

  if (command === "show-create-task") {
    showCreateTaskModal();
    render();
    return;
  }

  if (command === "show-settings") {
    activeSettingsSection = "system";
    showSettingsModal();
    render();
    return;
  }

  if (command === "open-log-directory") {
    await openLogDirectoryFromRenderer();
    render();
    return;
  }

  if (command === "show-about") {
    await showAboutModal();
    render();
  }
}

function render() {
  const project = getProject();
  captureTaskListScrollState();
  hydratedBrowserViews.clear();
  appRoot.innerHTML = `
    <div class="app-frame">
      ${renderAppTitlebar()}
      <main class="app-shell">
        ${renderSidebar(project)}
        ${renderWorkspace(project)}
      </main>
      ${contextMenu ? renderContextMenu() : ""}
      ${roleMenu ? renderRoleMenu() : ""}
    </div>
  `;
  attachWindowFocusHandlers();
  attachWindowDragHandlers();
  hydrateTerminalWindows();
  hydrateBrowserViews();
  restoreTaskListScrollState();
}

function captureTaskListScrollState() {
  const windowContent = document.querySelector(".program-window.task-list .window-content");
  const items = document.querySelector(".task-list-items");
  const detail = document.querySelector(".task-list-detail");
  taskListScrollState = {
    windowContent: Number.isFinite(windowContent?.scrollTop) ? windowContent.scrollTop : taskListScrollState.windowContent,
    items: Number.isFinite(items?.scrollTop) ? items.scrollTop : taskListScrollState.items,
    detail: Number.isFinite(detail?.scrollTop) ? detail.scrollTop : taskListScrollState.detail
  };
}

function restoreTaskListScrollState() {
  const stateToRestore = { ...taskListScrollState };
  requestAnimationFrame(() => {
    const windowContent = document.querySelector(".program-window.task-list .window-content");
    const items = document.querySelector(".task-list-items");
    const detail = document.querySelector(".task-list-detail");
    if (windowContent) {
      windowContent.scrollTop = stateToRestore.windowContent || 0;
    }
    if (items) {
      items.scrollTop = stateToRestore.items || 0;
    }
    if (detail) {
      detail.scrollTop = stateToRestore.detail || 0;
    }
  });
}

function renderSidebar(project) {
  const projects = state.projects
    .map((item) => {
      const createdLabel = formatProjectCreatedTime(item);
      const createdTitle = formatDateTime(item.createdAt || item.lastOpenedAt || "");
      return `
      <div class="project-item ${item.id === state.activeProjectId ? "active" : ""}">
        <button class="project-open" data-action="select-project" data-project-id="${item.id}" title="${escapeHtml(item.name)}">
          <span class="nav-icon">${icon("file")}</span>
          <span class="project-name">${escapeHtml(item.name)}</span>
          <span class="project-time" title="${escapeHtml(createdTitle ? `创建于 ${createdTitle}` : "创建时间未知")}">${escapeHtml(createdLabel)}</span>
        </button>
        <button class="project-delete" title="删除项目" data-action="show-delete-project" data-project-id="${escapeHtml(item.id)}">×</button>
      </div>
    `;
    })
    .join("");

  return `
    <aside class="sidebar">
      <div class="brand-row">
        <div class="brand">CosS <span class="brand-version">${APP_VERSION}</span></div>
        <div class="icon-strip">
          <button class="icon-button" title="新建项目" data-action="show-create-project">${icon("new")}</button>
          <button class="icon-button" title="搜索">${icon("search")}</button>
          <button class="icon-button" title="菜单">${icon("menu")}</button>
        </div>
      </div>
      <nav class="nav">
        <button class="nav-item" data-action="show-create-task"><span class="nav-icon">${icon("clock")}</span>新建任务</button>
        <button class="nav-item" data-action="show-message-center"><span class="nav-icon">${icon("assistant")}</span>消息</button>
        <button class="nav-item active"><span class="nav-icon">${icon("cube")}</span>项目</button>
        <button class="nav-item" data-action="show-logs"><span class="nav-icon">${icon("shield")}</span>日志</button>
        <button class="nav-item disabled"><span class="nav-icon">${icon("user")}</span>专家</button>
        <button class="nav-item disabled"><span class="nav-icon">${icon("bolt")}</span>自动化</button>
        <button class="nav-item disabled"><span class="nav-icon">${icon("more")}</span>更多</button>
      </nav>
      <div class="section-title">
        <span>项目 (${state.projects.length})</span>
        <button class="icon-button" title="新建项目" data-action="show-create-project">${icon("plus")}</button>
      </div>
      <div class="project-list">
        ${projects || `<div class="project-list-empty">暂无项目</div>`}
      </div>
      <div class="sidebar-footer">
        <div class="profile-name">Mood_01</div>
        <button class="icon-button" title="通知">${icon("bell")}</button>
        <button class="icon-button" title="设置" data-action="show-settings">${icon("gear")}</button>
        <div class="avatar"></div>
      </div>
    </aside>
  `;
}

function renderProgramWindowStyle(win) {
  const zIndex = normalizeZIndex(win.z);
  if (win.maximized) {
    return `${MAXIMIZED_WINDOW_STYLE} z-index:${zIndex};`;
  }

  return `left:${win.x}px; top:${win.y}px; width:${win.width}px; height:${win.height}px; z-index:${zIndex};`;
}

function renderCollabOverlayStyle(win) {
  if (win.maximized) {
    return "right:42px; bottom:76px;";
  }

  return `left:${win.x + win.width - 46}px; top:${win.y + win.height - 46}px;`;
}

function renderResizeHandles(win) {
  const directions = ["n", "e", "s", "w", "ne", "nw", "se", "sw"];
  return directions
    .map((direction) => (
      `<span class="resize-handle ${direction}" data-resize-handle="${direction}" data-window-id="${escapeHtml(win.id)}" data-no-focus="true" data-no-drag="true"></span>`
    ))
    .join("");
}

function renderWorkspace(project) {
  const isBooting = project && bootingProjectId === project.id;
  const activeDesktop = project ? getActiveDesktop(project) : null;
  const visibleWindows = project ? getVisibleWindows(project) : [];
  const windows = visibleWindows.map(renderProgramWindow).join("");
  const collabOverlay = project ? renderCollabOverlay(project) : "";
  const desktopCount = project ? getProjectDesktops(project).length : 0;
  const activeProgramCount = project ? getDesktopWindows(project).length : 0;
  const activeConversationTaskCount = project ? getConversationTasks(project).length : 0;

  return `
    <section class="workspace" data-active-desktop-id="${escapeHtml(activeDesktop?.id || "")}">
      <div class="workspace-topbar">
        <div class="project-heading">
          <h1 class="workspace-title">${project ? escapeHtml(project.name) : "未选择项目"}</h1>
          <div class="workspace-subtitle">${project ? `${escapeHtml(project.path)} · ${escapeHtml(activeDesktop?.name || "主对话")} · ${activeProgramCount} 个程序 · ${activeConversationTaskCount} 个对话任务 · ${desktopCount} 个对话 · ${project.tasks.length} 个项目任务` : "创建项目后启动工作区"}</div>
        </div>
        <div class="workspace-actions">
          <button class="secondary-button" data-action="show-message-center">${icon("assistant")}消息中心</button>
          <button class="secondary-button task-view-toggle" data-action="show-task-view">${icon("layout")}对话视图</button>
          <button class="secondary-button" data-action="open-task-list-window">${icon("task")}任务列表</button>
          <button class="secondary-button" data-action="show-role-picker" data-type="terminal">${icon("terminal")}新建终端</button>
          <button class="secondary-button" data-action="show-create-task">${icon("task")}新建任务</button>
        </div>
      </div>
      <div class="desktop ${windows ? "" : "empty"}" data-action="desktop" oncontextmenu="return false;">
        ${windows || renderEmptyState(project)}
      </div>
      ${collabOverlay}
      ${project && taskViewOpen ? renderTaskView(project) : ""}
      ${renderDock(project)}
      ${isBooting ? renderBootScreen(project) : ""}
    </section>
  `;
}

function renderEmptyState(project) {
  if (!project) {
    return `
      <div class="empty-state">
        <h2>创建一个项目开始</h2>
        <p>项目会拥有独立的工作区、角色程序、任务历史和协作状态。</p>
        <button class="primary-button" data-action="show-create-project">${icon("plus")}新建项目</button>
      </div>
    `;
  }

  return `
    <div class="empty-state">
      <h2>${escapeHtml(project.name)} 已开机</h2>
      <p>在桌面空白处右键创建终端、浏览器、文件或任务。创建程序时会先选择角色。</p>
      <button class="primary-button" data-action="show-role-picker" data-type="terminal">${icon("terminal")}创建角色终端</button>
    </div>
  `;
}

function renderBootScreen(project) {
  return `
    <div class="boot-screen">
      <div class="boot-panel">
        <div class="boot-logo"></div>
        <h2>${escapeHtml(project.name)} 工作区开机中</h2>
        <p>正在加载项目配置、角色模板、消息通道和桌面布局。</p>
        <div class="progress-track"><div class="progress-bar"></div></div>
      </div>
    </div>
  `;
}

function renderDock(project) {
  const running = getDesktopWindows(project);
  const buttons = running
    .map((win) => `
      <button class="dock-button ${focusedWindowId === win.id ? "active" : ""} ${win.minimized ? "minimized" : ""}" title="${escapeHtml(win.title)}" data-action="focus-window" data-window-id="${win.id}">
        ${PROGRAMS[win.type]?.icon || "□"}
      </button>
    `)
    .join("");

  return `
    <div class="dock">
      <button class="dock-button" title="搜索">${icon("search")}</button>
      <button class="dock-button task-view-toggle" title="对话视图" data-action="show-task-view">${icon("layout")}</button>
      <button class="dock-button" title="任务列表" data-action="open-task-list-window">${icon("task")}</button>
      <button class="dock-button" title="新建终端" data-action="show-role-picker" data-type="terminal">${icon("terminal")}</button>
      <button class="dock-button" title="新建浏览器" data-action="show-role-picker" data-type="browser">${icon("globe")}</button>
      <button class="dock-button" title="新建文件" data-action="show-role-picker" data-type="file">${icon("file")}</button>
      ${buttons}
    </div>
  `;
}

function renderTaskView(project) {
  const desktops = getProjectDesktops(project);
  const activeDesktopId = getActiveDesktopId(project);
  const activeLayoutPreset = normalizeLayoutPreset(getActiveDesktop(project)?.layoutPreset);

  return `
    <div class="task-view-backdrop" data-action="close-task-view">
      <div class="task-view-panel" role="dialog" aria-label="对话视图" data-no-focus="true">
        <div class="task-view-head">
          <div>
            <strong>对话视图</strong>
            <span>一个对话是一组持续工作的桌面程序；同一对话内可连续发布任务并复用已有角色程序。</span>
          </div>
          <button class="secondary-button compact" data-action="create-desktop">新建对话</button>
        </div>
        <div class="snap-layout-strip" aria-label="窗口布局">
          ${TASK_LAYOUT_PRESETS.map((layout) => `
            <button class="snap-layout-button ${activeLayoutPreset === layout.id ? "active" : ""}" data-action="select-layout-preset" data-layout="${layout.id}" title="${escapeHtml(layout.label)}">
              <span class="snap-layout ${layout.id}" aria-hidden="true">
                <i></i><i></i><i></i><i></i>
              </span>
            </button>
          `).join("")}
        </div>
        <div class="desktop-switcher">
          ${desktops.map((desktop) => {
            const windows = getDesktopWindows(project, desktop.id);
            const tasks = getConversationTasks(project, desktop.id);
            const previewWindows = windows.slice(0, 4);
            return `
              <button class="desktop-card ${desktop.id === activeDesktopId ? "active" : ""}" data-action="switch-desktop" data-desktop-id="${escapeHtml(desktop.id)}">
                <span class="desktop-card-title">${escapeHtml(desktop.name)}</span>
                <span class="desktop-card-meta">${windows.length} 个程序 · ${tasks.length} 个任务</span>
                <span class="desktop-card-preview">
                  ${previewWindows.map((win, index) => `<i style="--i:${index};" title="${escapeHtml(win.title)}"></i>`).join("")}
                </span>
              </button>
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderProgramWindow(win) {
  const status = getWindowStatus(win);
  const collaborators = getCollaboratorsForWindow(win);
  const content = {
    terminal: renderTerminalContent,
    browser: renderBrowserContent,
    file: renderFileContent,
    task: renderTaskContent,
    "task-list": renderTaskListContent
  }[win.type]?.(win) || "";

  return `
    <article class="program-window ${win.type} ${focusedWindowId === win.id ? "focused" : ""} ${win.maximized ? "maximized" : ""}"
      data-window-id="${win.id}"
      style="${renderProgramWindowStyle(win)}">
      <div class="window-titlebar" data-drag-handle="true" data-window-id="${win.id}">
        <div class="traffic-lights"><span></span><span></span><span></span></div>
        <div class="window-title">${escapeHtml(win.title)}</div>
        <div class="window-controls" data-no-drag="true" data-no-focus="true">
          <button class="window-control" title="最小化" data-action="minimize-window" data-window-id="${win.id}" data-no-drag="true" data-no-focus="true" aria-label="最小化窗口">&#8211;</button>
          <button class="window-control" title="${win.maximized ? "还原" : "最大化"}" data-action="toggle-maximize-window" data-window-id="${win.id}" data-no-drag="true" data-no-focus="true" aria-label="${win.maximized ? "还原窗口" : "最大化窗口"}">${win.maximized ? "&#10064;" : "&#9633;"}</button>
          <button class="window-control" title="关闭" data-action="close-window" data-window-id="${win.id}" data-no-drag="true" data-no-focus="true" aria-label="关闭窗口">×</button>
        </div>
      </div>
      <div class="window-content">${content}</div>
      ${renderResizeHandles(win)}
    </article>
  `;
}

function renderCollabOverlay(project) {
  const badges = getVisibleWindows(project)
    .map((win) => {
      const status = getWindowStatus(win);
      const collaborators = getCollaboratorsForWindow(win);
      const relayStage = getAgentRelayStageForWindow(win);
      const isAgentWindow = win.type === "terminal" && normalizeTerminalMode(win.terminalMode) === "agent";
      const relayClass = isAgentWindow ? `relay-${relayStage.className || getRelayStageClass(relayStage.stage)}` : "";
      const badgeTitle = isAgentWindow
        ? `协作状态：${getStatusLabel(status)}；Agent 接力阶段：${relayStage.label}`
        : `协作状态：${getStatusLabel(status)}`;
      const badgeContent = isAgentWindow
        ? (relayStage.symbol || getRelayStageSymbol(relayStage.stage))
        : (collaborators.length || statusSymbol(status));
      return `
        <div class="collab-overlay-item ${win.maximized ? "maximized" : ""}"
          data-window-id="${win.id}"
          style="${renderCollabOverlayStyle(win)}">
          <button class="collab-badge ${status} ${relayClass}" title="${escapeHtml(badgeTitle)}" data-action="toggle-popover" data-window-id="${win.id}" data-relay-stage="${escapeHtml(relayStage.stage || "idle")}">
            ${escapeHtml(badgeContent)}
          </button>
          ${activePopoverWindowId === win.id ? renderCollabPopover(win, collaborators, status, relayStage) : ""}
        </div>
      `;
    })
    .join("");

  return `<div class="collab-overlay">${badges}</div>`;
}

function renderTerminalContent(win) {
  const role = getRole(win.roleId);
  const agentProvider = normalizeAgentProvider(win.agentProvider || state.settings.agentProvider);
  const modeLabel = {
    agent: `Agent(${getAgentProviderLabel(agentProvider)})`,
    shell: "PowerShell"
  }[normalizeTerminalMode(win.terminalMode)];
  return `
    <div class="terminal-mount" data-terminal-id="${win.id}" data-role-name="${escapeHtml(role.name)}">
      <div class="terminal-loading">
        正在启动 ${escapeHtml(role.name)} ${modeLabel}...
      </div>
    </div>
  `;
}

function renderBrowserContent(win) {
  const role = getRole(win.roleId);
  ensureBrowserWindowShape(win);
  const activeTab = getActiveBrowserTab(win);
  const url = normalizeBrowserUrl(activeTab?.url || win.browserUrl || DEFAULT_BROWSER_URL);
  const bookmarks = uniqueStrings(win.browserBookmarks || []);
  const history = (win.browserHistory || []).slice(-5).reverse();
  const partition = `persist:coss-${state.activeProjectId || "default"}-${role.id}`;
  return `
    <div class="browser-program">
      <div class="browser-tabs">
        ${win.browserTabs.map((tab) => `
          <div class="browser-tab-shell ${tab.id === win.activeBrowserTabId ? "active" : ""}">
            <button class="browser-tab ${tab.id === win.activeBrowserTabId ? "active" : ""}" data-action="browser-switch-tab" data-window-id="${escapeHtml(win.id)}" data-tab-id="${escapeHtml(tab.id)}">
              ${tab.favicon ? `<img class="browser-tab-favicon" src="${escapeHtml(tab.favicon)}" alt="" />` : `<span class="browser-tab-fallback"></span>`}
              <span>${escapeHtml(tab.title || tab.url || "新标签")}</span>
            </button>
            ${win.browserTabs.length > 1 ? `<button class="browser-tab-close" title="关闭标签" data-action="browser-close-tab" data-window-id="${escapeHtml(win.id)}" data-tab-id="${escapeHtml(tab.id)}">×</button>` : ""}
          </div>
        `).join("")}
        <button class="icon-button" title="新标签" data-action="browser-new-tab" data-window-id="${escapeHtml(win.id)}">+</button>
      </div>
      <div class="browser-bar">
        <button class="icon-button" title="后退" data-action="browser-back" data-window-id="${escapeHtml(win.id)}">‹</button>
        <button class="icon-button" title="前进" data-action="browser-forward" data-window-id="${escapeHtml(win.id)}">›</button>
        <button class="icon-button" title="刷新" data-action="browser-reload" data-window-id="${escapeHtml(win.id)}">${icon("refresh")}</button>
        <input class="browser-address" data-browser-address="${escapeHtml(win.id)}" value="${escapeHtml(url)}" />
        <button class="primary-button compact" data-action="browser-go" data-window-id="${escapeHtml(win.id)}">打开</button>
        <button class="secondary-button compact" data-action="browser-bookmark" data-window-id="${escapeHtml(win.id)}">${bookmarks.includes(url) ? "已收藏" : "收藏"}</button>
      </div>
      <div class="browser-quick-links">
        <span>收藏</span>
        ${bookmarks.slice(-5).reverse().map((item) => `<button data-action="browser-open-bookmark" data-window-id="${escapeHtml(win.id)}" data-url="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("") || "<em>暂无</em>"}
        <span>历史</span>
        ${history.map((item) => `<button data-action="browser-open-history" data-window-id="${escapeHtml(win.id)}" data-url="${escapeHtml(item.url)}">${escapeHtml(item.title || item.url)}</button>`).join("") || "<em>暂无</em>"}
      </div>
      <div class="browser-status" data-browser-status="${escapeHtml(win.id)}">${escapeHtml(win.browserStatus || `${role.name} 浏览器就绪`)}</div>
      <webview class="browser-webview"
        data-browser-webview="${escapeHtml(win.id)}"
        data-browser-tab-id="${escapeHtml(activeTab?.id || "")}"
        src="${escapeHtml(url)}"
        partition="${escapeHtml(partition)}"
        allowpopups="false"></webview>
    </div>
  `;
}

function getFileEditorMetrics(content, cursorIndex = 0) {
  const text = String(content || "");
  const safeCursor = Math.max(0, Math.min(Number(cursorIndex) || 0, text.length));
  const beforeCursor = text.slice(0, safeCursor);
  const lines = Math.max(1, text.split(/\r\n|\r|\n/).length);
  const line = beforeCursor.split(/\r\n|\r|\n/).length;
  const lastBreak = Math.max(beforeCursor.lastIndexOf("\n"), beforeCursor.lastIndexOf("\r"));
  const column = safeCursor - lastBreak;
  return {
    line,
    column,
    lines,
    chars: text.length
  };
}

function renderFileLineNumbers(content) {
  const metrics = getFileEditorMetrics(content);
  return Array.from({ length: metrics.lines }, (_item, index) => String(index + 1)).join("\n");
}

function renderFileEditorFooter(win, content = win.fileDraft || "", cursorIndex = 0) {
  const metrics = getFileEditorMetrics(content, cursorIndex);
  const dirtyLabel = win.fileDirty ? "未保存" : "已保存";
  const pathLabel = win.filePath || "未选择文件";
  return `${pathLabel} · 第 ${metrics.line} 行，第 ${metrics.column} 列 · ${metrics.lines} 行 · ${metrics.chars} 字符 · ${dirtyLabel} · Ctrl+S 保存`;
}

function syncFileEditorChrome(windowId) {
  const win = getWindowState(windowId);
  const editor = document.querySelector(`[data-file-editor="${CSS.escape(windowId)}"]`);
  if (!win || !editor) {
    return;
  }

  const content = String(editor.value || "");
  const lines = document.querySelector(`[data-file-lines="${CSS.escape(windowId)}"]`);
  if (lines) {
    lines.textContent = renderFileLineNumbers(content);
    lines.scrollTop = editor.scrollTop;
  }
  const footer = document.querySelector(`[data-file-footer="${CSS.escape(windowId)}"]`);
  if (footer) {
    footer.textContent = renderFileEditorFooter(win, content, editor.selectionStart || 0);
  }
}

function renderFileContent(win) {
  const role = getRole(win.roleId);
  const project = getProject();
  const fileList = Array.isArray(win.fileList) ? win.fileList : [];
  const fileDraft = String(win.fileDraft || "");
  return `
    <div class="real-file-editor" data-file-window="${escapeHtml(win.id)}">
      <div class="file-toolbar">
        <div class="file-path-row">
          <input class="file-path-input" data-file-path="${escapeHtml(win.id)}" value="${escapeHtml(win.filePath || "")}" placeholder="输入项目内文件路径，例如 README.md" />
          <button class="secondary-button compact" data-action="file-open" data-window-id="${escapeHtml(win.id)}">打开</button>
          <button class="secondary-button compact" data-action="file-pick" data-window-id="${escapeHtml(win.id)}">选择</button>
          <button class="primary-button compact" data-action="file-save" data-window-id="${escapeHtml(win.id)}">保存</button>
          <button class="secondary-button compact" data-action="file-save-as" data-window-id="${escapeHtml(win.id)}">另存为</button>
          <button class="secondary-button compact" data-action="file-create-folder" data-window-id="${escapeHtml(win.id)}">新建文件夹</button>
          <button class="secondary-button compact" data-action="file-rename" data-window-id="${escapeHtml(win.id)}">重命名</button>
          <button class="secondary-button compact danger" data-action="file-delete" data-window-id="${escapeHtml(win.id)}">删除</button>
        </div>
        <div class="file-status ${win.fileError ? "error" : ""}" data-file-status="${escapeHtml(win.id)}">
          ${escapeHtml(win.fileError || win.fileStatus || `${role.name} 文件编辑器 · ${project ? project.path : "未选择项目"}`)}
        </div>
      </div>
      <div class="file-editor-layout">
        <aside class="file-list">
          <div class="file-list-title">
            <span>项目文件</span>
            <button class="icon-button" title="刷新文件列表" data-action="file-refresh-list" data-window-id="${escapeHtml(win.id)}">${icon("refresh")}</button>
          </div>
          <div class="file-list-items">
            ${
              fileList.length
                ? fileList.slice(0, 120).map((file) => `
                    <button class="file-list-item ${file.path === win.filePath ? "active" : ""} ${file.type === "directory" ? "folder" : ""}"
                      data-action="${file.type === "directory" ? "file-select-list-path" : "file-open-list-item"}"
                      data-window-id="${escapeHtml(win.id)}"
                      data-file-path-value="${escapeHtml(file.path)}">
                      <span>${file.type === "directory" ? "[dir] " : ""}${escapeHtml(file.path)}</span>
                    </button>
                  `).join("")
                : `<div class="file-list-empty">点击刷新或输入路径打开项目文件。</div>`
            }
          </div>
        </aside>
        <section class="file-editor-pane">
          <div class="file-editor-main">
            <pre class="file-editor-lines" data-file-lines="${escapeHtml(win.id)}">${escapeHtml(renderFileLineNumbers(fileDraft))}</pre>
            <textarea class="file-editor-textarea" data-file-editor="${escapeHtml(win.id)}" spellcheck="false" placeholder="打开或新建项目内文本文件。">${escapeHtml(fileDraft)}</textarea>
          </div>
          <div class="file-editor-footer" data-file-footer="${escapeHtml(win.id)}">${escapeHtml(renderFileEditorFooter(win, fileDraft))}</div>
        </section>
      </div>
    </div>
  `;
}

function renderTaskContent() {
  const project = getProject();
  const tasks = project ? getConversationTasks(project) : [];
  if (tasks.length === 0) {
    return `<div class="browser-blank">当前对话暂无任务。右键空白处或点击新建任务后，会在这个对话中持续追加任务。</div>`;
  }

  const pairs = tasks.flatMap((task) => task.subtasks.map((subtask) => ({ task, subtask })));
  const availableRoleIds = uniqueRoleIds(pairs.map(({ subtask }) => subtask.roleId));
  if (taskRoleFilter && !availableRoleIds.includes(taskRoleFilter)) {
    taskRoleFilter = "";
  }
  const filteredPairs = taskRoleFilter
    ? pairs.filter(({ subtask }) => subtask.roleId === taskRoleFilter)
    : pairs;
  const roleFilter = `
    <div class="task-filterbar">
      <label>
        <span>角色过滤</span>
        <select id="taskRoleFilter">
          <option value="">全部角色</option>
          ${availableRoleIds.map((roleId) => `<option value="${escapeHtml(roleId)}" ${roleId === taskRoleFilter ? "selected" : ""}>${escapeHtml(getRole(roleId).name)}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
  const taskCards = filteredPairs
    .map(({ task, subtask }) => {
      const kernelState = getSubtaskKernelProjection(task, subtask);
      const leaseLabel = kernelState.step?.lease?.expiresAt
        ? `lease ${formatDateTime(kernelState.step.lease.expiresAt)}`
        : "no lease";
      return `
      <div class="task-card ${escapeHtml(kernelState.status)} kernel-phase-${escapeHtml(kernelState.phase)}">
        <div class="task-card-head">
          <div class="task-role">${escapeHtml(getRole(subtask.roleId).name)} · ${escapeHtml(task.title)} · ${escapeHtml(task.model?.modelName || "agent-brain")}</div>
          <div class="task-chip-group">${renderKernelPhaseChip(kernelState.phase, kernelState)}${renderSubtaskStatusChip(kernelState.status)}</div>
        </div>
        <div class="task-title">${escapeHtml(subtask.title)}</div>
        <div class="task-desc">${escapeHtml(subtask.description)}</div>
        <div class="task-desc">Kernel Step: ${escapeHtml(kernelState.step?.id || "pending")} · ${escapeHtml(leaseLabel)}</div>
        <div class="task-desc">规划来源：${escapeHtml(task.planner?.status === "success" ? "Kernel Planner" : "本地降级")}</div>
        ${renderSubtaskActions(task.id, subtask)}
      </div>
    `;
    })
    .join("");

  return `${roleFilter}${taskCards || `<div class="message-empty">当前角色暂无子任务。</div>`}${renderRecentAgentEvents(project)}`;
}

function renderTaskListFilters(project, tasks) {
  const roleIds = uniqueRoleIds(tasks.flatMap((task) => getTaskRoleIds(task)));
  const statuses = uniqueStrings(tasks.map(getTaskStatusValue));
  const models = uniqueStrings(tasks.map(getTaskModelName));
  return `
    <div class="task-list-filters">
      <label>
        <span>搜索</span>
        <input id="taskListSearch" value="${escapeHtml(taskListFilters.query)}" placeholder="任务、角色、说明" />
      </label>
      <label>
        <span>角色</span>
        <select id="taskListRoleFilter">
          <option value="">全部角色</option>
          ${roleIds.map((roleId) => `<option value="${escapeHtml(roleId)}" ${roleId === taskListFilters.roleId ? "selected" : ""}>${escapeHtml(getRole(roleId).name)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>状态</span>
        <select id="taskListStatusFilter">
          <option value="">全部状态</option>
          ${statuses.map((status) => `<option value="${escapeHtml(status)}" ${status === taskListFilters.status ? "selected" : ""}>${escapeHtml(SUBTASK_STATUS_DEFS[status]?.label || status)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>模型</span>
        <select id="taskListModelFilter">
          <option value="">全部模型</option>
          ${models.map((model) => `<option value="${escapeHtml(model)}" ${model === taskListFilters.model ? "selected" : ""}>${escapeHtml(model)}</option>`).join("")}
        </select>
      </label>
      <label class="task-list-check">
        <input id="taskListIncludeArchived" type="checkbox" ${taskListFilters.includeArchived ? "checked" : ""} />
        <span>显示归档</span>
      </label>
    </div>
  `;
}

function renderTaskListDetail(project, task) {
  if (!task) {
    return `
      <aside class="task-list-detail">
        <div class="message-empty">选择一个任务查看详情。</div>
      </aside>
    `;
  }

  const messages = getTaskMessages(project, task.id);
  const deliveries = getTaskDeliveries(project, task.id);
  const refs = getTaskOutputRefs(project, task.id);
  const projection = getTaskKernelProjection(task);
  const status = projection.status;
  const doneCount = projection.doneCount;
  return `
    <aside class="task-list-detail">
      <div class="task-detail-head">
        <div>
          <strong>${escapeHtml(task.title || "未命名任务")}</strong>
          <span>${escapeHtml(task.goal || "")}</span>
        </div>
        ${renderSubtaskStatusChip(status)}
      </div>
      <div class="task-detail-actions">
        <button class="secondary-button compact" data-action="show-message-center">查看时间线</button>
        ${task.archived
          ? `<button class="secondary-button compact" data-action="restore-task" data-task-id="${escapeHtml(task.id)}">恢复任务</button>`
          : `<button class="secondary-button compact" data-action="archive-task" data-task-id="${escapeHtml(task.id)}">归档任务</button>`}
      </div>
      <div class="task-detail-metrics">
        <span>idle ${projection.counts.idle || 0}</span>
        <span>running ${projection.activeCount || 0}</span>
        <span>done ${projection.counts.done || 0}</span>
        <span>locks ${projection.activeLocks.length}</span>
        <span>approvals ${projection.pendingApprovals.length}</span>
        <span>events ${projection.events.length}</span>
        <span>子任务 ${doneCount}/${task.subtasks?.length || 0}</span>
        <span>消息 ${messages.length}</span>
        <span>投递 ${deliveries.length}</span>
        <span>输出 ${refs.length}</span>
        <span>${escapeHtml(getTaskModelName(task))}</span>
      </div>
      <div class="task-detail-section">
        <strong>子任务</strong>
        ${(task.subtasks || []).map((subtask) => {
          const kernelState = getSubtaskKernelProjection(task, subtask);
          return `
          <div class="task-detail-subtask ${escapeHtml(kernelState.status)} kernel-phase-${escapeHtml(kernelState.phase)}">
            <span>${escapeHtml(getRole(subtask.roleId).name)}</span>
            <strong>${escapeHtml(subtask.title)}</strong>
            <span class="task-chip-group">${renderKernelPhaseChip(kernelState.phase, kernelState)}${renderSubtaskStatusChip(kernelState.status)}</span>
            <p>${escapeHtml(subtask.description || "")}</p>
            <p>Kernel Step: ${escapeHtml(kernelState.step?.id || "pending")}</p>
            ${renderSubtaskActions(task.id, subtask)}
          </div>
        `;
        }).join("")}
      </div>
      <div class="task-detail-section">
        <strong>关联投递</strong>
        ${deliveries.length
          ? deliveries.slice(0, 5).map((delivery) => `
            <div class="task-detail-linkrow">
              <span>${escapeHtml(getRole(delivery.roleId).name)} · ${escapeHtml(getDeliveryStatusLabel(delivery.status))}</span>
              <span>${escapeHtml(delivery.submissionMethod || "pending")}</span>
            </div>
          `).join("")
          : `<div class="message-empty">暂无投递。</div>`}
      </div>
      <div class="task-detail-section">
        <strong>最近消息</strong>
        ${messages.length
          ? messages.slice(-4).reverse().map((message) => `
            <div class="task-detail-message">
              <span>${escapeHtml(getRole(message.fromRoleId).name)} -> ${escapeHtml(message.toRoleIds.map((roleId) => getRole(roleId).name).join("、"))}</span>
              <p>${escapeHtml(message.content)}</p>
            </div>
          `).join("")
          : `<div class="message-empty">暂无消息。</div>`}
      </div>
    </aside>
  `;
}

function renderTaskListContent() {
  const project = getProject();
  const conversation = getActiveDesktop(project);

  if (!project) {
    return `<div class="browser-blank">请先选择项目。</div>`;
  }

  const allTasks = getConversationTasks(project);
  const visibleTasks = getFilteredConversationTasks(project);
  const totalSubtasks = allTasks.reduce((sum, task) => sum + (task.subtasks?.length || 0), 0);
  const archivedCount = allTasks.filter((task) => task.archived).length;

  if (selectedTaskListTaskId && !visibleTasks.some((task) => task.id === selectedTaskListTaskId)) {
    selectedTaskListTaskId = "";
  }
  const selectedTask = visibleTasks.find((task) => task.id === selectedTaskListTaskId) || visibleTasks[0] || null;
  selectedTaskListTaskId = selectedTask?.id || "";

  return `
    <div class="task-list-program">
      <div class="task-list-head">
        <strong>${escapeHtml(conversation?.name || "当前对话")}任务列表</strong>
        <span>${visibleTasks.length}/${allTasks.length} 个任务 · ${totalSubtasks} 个子任务 · ${archivedCount} 个归档</span>
      </div>
      ${renderTaskListFilters(project, allTasks)}
      ${
        allTasks.length === 0
          ? `<div class="browser-blank">当前对话还没有任务。点击右上角“新建任务”后，任务会持续追加到这个对话中。</div>`
          : `
            <div class="task-list-layout">
              <div class="task-list-items">
                ${visibleTasks.length ? visibleTasks.map((task, index) => {
                  const projection = getTaskKernelProjection(task);
                  const status = projection.status;
                  const doneCount = projection.doneCount;
                  return `
                    <button class="task-list-item ${selectedTask?.id === task.id ? "active" : ""} ${task.archived ? "archived" : ""}" data-action="select-task-list-task" data-task-id="${escapeHtml(task.id)}">
                      <div class="task-list-row-head">
                        <div>
                          <strong>${escapeHtml(task.title || `任务 ${index + 1}`)}</strong>
                          <span>${escapeHtml(task.goal || "")}</span>
                        </div>
                        ${renderSubtaskStatusChip(status)}
                      </div>
                      <div class="task-list-meta">
                        <span>${escapeHtml(getTaskModelName(task))}</span>
                        <span>running ${projection.activeCount || 0}</span>
                        <span>locks ${projection.activeLocks.length}</span>
                        <span>approvals ${projection.pendingApprovals.length}</span>
                        <span>${doneCount}/${task.subtasks?.length || 0} 已完成</span>
                        <span>${escapeHtml(formatDateTime(task.confirmedAt || task.createdAt))}</span>
                        ${task.archived ? `<span>已归档</span>` : ""}
                      </div>
                      <div class="task-list-subtasks">
                        ${(task.subtasks || []).map((subtask) => {
                          const kernelState = getSubtaskKernelProjection(task, subtask);
                          return `
                          <span class="task-list-subtask ${escapeHtml(kernelState.status)} kernel-phase-${escapeHtml(kernelState.phase)}">
                            ${escapeHtml(getRole(subtask.roleId).name)} · ${escapeHtml(subtask.title)}
                          </span>
                        `;
                        }).join("")}
                      </div>
                    </button>
                  `;
                }).join("") : `<div class="message-empty">没有匹配当前筛选条件的任务。</div>`}
              </div>
              ${renderTaskListDetail(project, selectedTask)}
            </div>
          `
      }
    </div>
  `;
}

function renderRecentAgentEvents(project) {
  const events = (project?.agentEvents || []).slice(-6).reverse();
  if (events.length === 0) {
    return "";
  }

  return `
    <div class="agent-event-panel">
      <div class="agent-event-panel-title">
        <strong>Agent 会话事件</strong>
        <span>最近 ${events.length} 条</span>
      </div>
      ${events.map((event) => `
        <div class="agent-event-row ${escapeHtml(normalizeAgentEventStatus(event.status) || event.status || "running")}">
          <strong>${escapeHtml(getRole(event.roleId).name)} · ${escapeHtml(event.provider || "agent")}</strong>
          <span>${escapeHtml(event.status || "event")} · ${escapeHtml(formatDateTime(event.receivedAt))}</span>
          <p>${escapeHtml(event.message || event.sessionId || "Agent 输出了状态事件。")}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSubtaskStatusChip(status) {
  const normalized = normalizeSubtaskStatus(status);
  return `<span class="subtask-status ${escapeHtml(normalized)}">${escapeHtml(SUBTASK_STATUS_DEFS[normalized].label)}</span>`;
}

function renderKernelPhaseChip(phase, options = {}) {
  const normalized = normalizeKernelPhase(phase, options.status || "pending");
  const def = KERNEL_PHASE_DEFS[normalized] || KERNEL_PHASE_DEFS.idle;
  const expired = options.leaseExpired === true;
  return `<span class="kernel-phase-chip ${escapeHtml(normalized)} ${expired ? "expired" : ""}">${escapeHtml(expired ? "租约过期" : def.label)}</span>`;
}

function getSubtaskTaskUrl(task, subtask) {
  return extractFirstUrl([
    task?.goal || "",
    task?.title || "",
    subtask?.description || "",
    subtask?.title || ""
  ].join("\n"));
}

function openTaskUrlForSubtask(taskId, subtaskId) {
  const project = getProject();
  const task = project?.tasks.find((item) => item.id === taskId);
  const subtask = task?.subtasks.find((item) => item.id === subtaskId);
  const url = getSubtaskTaskUrl(task, subtask);
  if (!project || !task || !subtask || !url) {
    return;
  }

  const desktopId = task.desktopId || getActiveDesktopId(project);
  let browserWindow = project.windows.find((win) => (
    win.type === "browser"
    && win.roleId === subtask.roleId
    && win.desktopId === desktopId
  ));
  if (!browserWindow) {
    browserWindow = createProgram("browser", subtask.roleId, {
      desktopId,
      browserUrl: url
    });
  }
  if (!browserWindow) {
    return;
  }
  project.activeDesktopId = desktopId;
  ensureBrowserWindowShape(browserWindow);
  setActiveBrowserTabState(browserWindow, { url: normalizeBrowserUrl(url), title: "任务 URL", status: "ready" });
  pushBrowserHistory(browserWindow, url, "任务 URL");
  focusWindow(browserWindow.id, { render: false });
  recordAppLog("browser.task-url.opened", {
    projectId: project.id,
    taskId,
    subtaskId,
    roleId: subtask.roleId,
    windowId: browserWindow.id,
    url
  });
  saveState();
  render();
}

function renderSubtaskActions(taskId, subtask) {
  const project = getProject();
  const task = project?.tasks.find((item) => item.id === taskId);
  const status = normalizeSubtaskStatus(subtask.status);
  const executeLabel = status === "done" ? "重新执行" : "执行";
  const canExecuteSubtask = task && canManuallyExecuteKernelSubtask(task, subtask);
  const executeButton = canExecuteSubtask
    ? `<button class="primary-button compact" data-action="execute-kernel-subtask" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}">${escapeHtml(executeLabel)}</button>`
    : "";
  const button = (label, nextStatus, kind = "secondary") => (
    `<button class="${kind}-button compact" data-action="set-subtask-status" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}" data-status="${escapeHtml(nextStatus)}">${escapeHtml(label)}</button>`
  );
  const url = getSubtaskTaskUrl(task, subtask);
  const taskUrlButton = url
    ? `<button class="secondary-button compact" data-action="open-task-url" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}">打开任务 URL</button>`
    : "";
  let actions = {
    idle: [button("开始执行", "running", "primary")],
    running: [button("标记完成", "done", "primary")],
    done: [button("重新打开", "idle")]
  }[status] || [];
  if (!canExecuteSubtask || status !== "running") {
    actions = [];
  }
  return `<div class="task-actions">${[executeButton, ...actions, taskUrlButton].join("")}</div>`;
}

function renderCollabPopover(win, collaborators, status, relayStage = getAgentRelayStageForWindow(win)) {
  const names = collaborators.map((role) => role.name).join("、") || "暂无协作对象";
  const project = getProject();
  const taskContext = getTaskContextForWindow(win, project);
  const kernelStep = (taskContext.taskId
    ? (project?.tasks || []).filter((task) => task.id === taskContext.taskId)
    : getConversationTasks(project, win.desktopId))
    .flatMap((task) => getTaskKernelProjection(task).steps.map((step) => ({ task, step })))
    .filter(({ step }) => step.roleId === win.roleId)
    .sort((a, b) => new Date(b.step.lease?.heartbeatAt || b.step.updatedAt || 0).getTime() - new Date(a.step.lease?.heartbeatAt || a.step.updatedAt || 0).getTime())[0];
  const kernelLine = kernelStep
    ? `<div>Kernel Step: ${escapeHtml(kernelStep.step.id)} · ${renderKernelPhaseChip(kernelStep.step.phase, kernelStep.step)}${kernelStep.step.lease?.expiresAt ? ` · lease ${escapeHtml(formatDateTime(kernelStep.step.lease.expiresAt))}` : ""}</div>`
    : "";
  const messages = `${kernelLine}${(project?.messages || [])
    .filter((message) => message.fromRoleId === win.roleId || message.toRoleIds.includes(win.roleId))
    .slice(-3)
    .map((message) => `<div>${escapeHtml(getRole(message.fromRoleId).name)}：${escapeHtml(message.content)}</div>`)
    .join("")}`;

  return `
    <div class="collab-popover">
      <strong>${escapeHtml(getStatusLabel(status))}</strong>
      ${normalizeTerminalMode(win.terminalMode) === "agent" ? `<div>Agent 接力阶段：${escapeHtml(relayStage.label)}</div>` : ""}
      <div>协作对象：${escapeHtml(names)}</div>
      ${messages || "<div>还没有消息。</div>"}
      <button class="secondary-button compact" data-action="show-message-center" data-role-id="${escapeHtml(win.roleId)}">查看时间线</button>
    </div>
  `;
}

function renderContextMenu() {
  return `
    <div class="context-menu" style="left:${contextMenu.x}px; top:${contextMenu.y}px;">
      <button data-action="role-menu" data-type="terminal">${icon("terminal")}新建终端</button>
      <button data-action="role-menu" data-type="browser">${icon("globe")}新建浏览器</button>
      <button data-action="role-menu" data-type="file">${icon("file")}新建文件</button>
      <button data-action="open-task-list-window">${icon("task")}任务列表</button>
      <button data-action="show-create-task">${icon("task")}新建任务</button>
      <button data-action="show-message-center">${icon("assistant")}消息中心</button>
      <div class="menu-divider"></div>
      <button data-action="refresh-workspace">${icon("refresh")}刷新桌面</button>
      <button data-action="show-settings">${icon("gear")}系统设置</button>
    </div>
  `;
}

function renderRoleMenu() {
  const candidates = ROLE_TEMPLATES.filter((role) => role.programs.includes(pendingProgramType));
  return `
    <div class="role-menu" style="left:${roleMenu.x}px; top:${roleMenu.y}px;">
      ${candidates.map((role) => `
        ${
          pendingProgramType === "terminal"
            ? `
              <button data-action="select-role" data-type="terminal" data-role-id="${role.id}" data-terminal-mode="shell">
                ${icon("terminal")}${escapeHtml(role.name)} PowerShell
              </button>
              <button data-action="select-role" data-type="terminal" data-role-id="${role.id}" data-terminal-mode="agent">
                ${icon("terminal")}${escapeHtml(role.name)} Agent
              </button>
            `
            : `
              <button data-action="select-role" data-type="${pendingProgramType}" data-role-id="${role.id}">
                ${role.claude ? icon("terminal") : icon("user")}${escapeHtml(role.name)}
              </button>
            `
        }
      `).join("")}
    </div>
  `;
}

function getBrowserWebview(windowId) {
  return document.querySelector(`[data-browser-webview="${CSS.escape(windowId)}"]`);
}

function setBrowserStatus(windowId, message, status = "ready") {
  const win = getWindowState(windowId);
  if (win) {
    win.browserStatus = message;
    setActiveBrowserTabState(win, { status: message });
  }
  const node = document.querySelector(`[data-browser-status="${CSS.escape(windowId)}"]`);
  if (node) {
    node.textContent = message;
    node.dataset.status = status;
  }
}

function navigateBrowserWindow(windowId, rawUrl = null) {
  const win = getWindowState(windowId);
  const webview = getBrowserWebview(windowId);
  const input = document.querySelector(`[data-browser-address="${CSS.escape(windowId)}"]`);
  if (!win || !webview) {
    return;
  }

  const url = normalizeBrowserUrl(rawUrl ?? input?.value ?? win.browserUrl);
  setActiveBrowserTabState(win, { url, status: `正在打开 ${url}` });
  if (input) {
    input.value = url;
  }
  setBrowserStatus(windowId, `正在打开 ${url}`, "loading");
  pushBrowserHistory(win, url);
  recordAppLog("browser.navigate", { projectId: state.activeProjectId, windowId, url });
  saveState();
  try {
    if (typeof webview.loadURL === "function") {
      webview.loadURL(url);
    } else {
      webview.setAttribute("src", url);
    }
  } catch (error) {
    setBrowserStatus(windowId, `打开失败：${error.message}`, "error");
    recordAppLog("browser.navigate.failed", { projectId: state.activeProjectId, windowId, url, error: error.message }, "error");
  }
}

function runBrowserCommand(windowId, command) {
  const webview = getBrowserWebview(windowId);
  if (!webview) {
    return;
  }
  try {
    if (command === "reload") {
      webview.reload();
    } else if (command === "back" && webview.canGoBack?.()) {
      webview.goBack();
    } else if (command === "forward" && webview.canGoForward?.()) {
      webview.goForward();
    }
    recordAppLog("browser.command", { projectId: state.activeProjectId, windowId, command });
  } catch (error) {
    setBrowserStatus(windowId, `浏览器命令失败：${error.message}`, "error");
    recordAppLog("browser.command.failed", { projectId: state.activeProjectId, windowId, command, error: error.message }, "error");
  }
}

function createBrowserTab(windowId, url = DEFAULT_BROWSER_URL) {
  const win = getWindowState(windowId);
  if (!win) {
    return;
  }
  ensureBrowserWindowShape(win);
  const tab = {
    id: uid("tab"),
    url: normalizeBrowserUrl(url),
    title: "",
    favicon: getBrowserFaviconUrl(url),
    status: "ready",
    createdAt: new Date().toISOString()
  };
  win.browserTabs.push(tab);
  win.browserTabs = win.browserTabs.slice(-8);
  win.activeBrowserTabId = tab.id;
  recordAppLog("browser.tab.created", { projectId: state.activeProjectId, windowId, tabId: tab.id, url: tab.url });
  saveState();
  render();
}

function switchBrowserTab(windowId, tabId) {
  const win = getWindowState(windowId);
  if (!win || !win.browserTabs?.some((tab) => tab.id === tabId)) {
    return;
  }
  win.activeBrowserTabId = tabId;
  const tab = getActiveBrowserTab(win);
  win.browserUrl = tab?.url || win.browserUrl;
  win.browserStatus = tab?.status || "ready";
  recordAppLog("browser.tab.switched", { projectId: state.activeProjectId, windowId, tabId });
  saveState();
  render();
}

function closeBrowserTab(windowId, tabId = "") {
  const win = getWindowState(windowId);
  if (!win) {
    return;
  }
  ensureBrowserWindowShape(win);
  if (win.browserTabs.length <= 1) {
    return;
  }
  const closingTabId = tabId || win.activeBrowserTabId;
  const closingIndex = win.browserTabs.findIndex((tab) => tab.id === closingTabId);
  if (closingIndex < 0) {
    return;
  }
  win.browserTabs = win.browserTabs.filter((tab) => tab.id !== closingTabId);
  if (win.activeBrowserTabId === closingTabId) {
    win.activeBrowserTabId = win.browserTabs[Math.max(0, closingIndex - 1)]?.id || win.browserTabs[0].id;
  }
  recordAppLog("browser.tab.closed", { projectId: state.activeProjectId, windowId, tabId: closingTabId });
  saveState();
  render();
}

function toggleBrowserBookmark(windowId) {
  const win = getWindowState(windowId);
  const tab = getActiveBrowserTab(win);
  if (!win || !tab?.url) {
    return;
  }
  win.browserBookmarks ||= [];
  const url = normalizeBrowserUrl(tab.url);
  if (win.browserBookmarks.includes(url)) {
    win.browserBookmarks = win.browserBookmarks.filter((item) => item !== url);
  } else {
    win.browserBookmarks.push(url);
    win.browserBookmarks = uniqueStrings(win.browserBookmarks).slice(-40);
  }
  recordAppLog("browser.bookmark.toggled", { projectId: state.activeProjectId, windowId, url, saved: win.browserBookmarks.includes(url) });
  saveState();
  render();
}

function openBrowserUrlInWindow(windowId, url, newTab = false) {
  if (newTab) {
    createBrowserTab(windowId, url);
    return;
  }
  navigateBrowserWindow(windowId, url);
}

function openPopupUrlInsideCosSBrowser(url, sourceWindowId = "", options = {}) {
  const project = getProject();
  if (!project || !url) {
    return;
  }

  const sourceWindow = sourceWindowId ? project.windows.find((win) => win.id === sourceWindowId) : null;
  const focusedBrowser = project.windows.find((win) => win.id === focusedWindowId && win.type === "browser");
  const visibleBrowser = getVisibleWindows(project)
    .filter((win) => win.type === "browser")
    .sort((a, b) => normalizeZIndex(b.z) - normalizeZIndex(a.z))[0];
  let targetWindow = sourceWindow?.type === "browser" ? sourceWindow : focusedBrowser || visibleBrowser;

  if (!targetWindow) {
    targetWindow = createProgram("browser", "product-manager", {
      browserUrl: url,
      desktopId: getActiveDesktopId(project)
    });
  }

  if (!targetWindow) {
    return;
  }

  focusWindow(targetWindow.id, { render: false });
  if (options.currentTab) {
    navigateBrowserWindow(targetWindow.id, url);
  } else {
    createBrowserTab(targetWindow.id, url);
  }
  recordAppLog("browser.popup.redirected", {
    projectId: project.id,
    windowId: targetWindow.id,
    sourceWindowId,
    url
  });
}

function hydrateBrowserViews() {
  document.querySelectorAll("webview[data-browser-webview]").forEach((webview) => {
    const windowId = webview.dataset.browserWebview;
    const tabId = webview.dataset.browserTabId || "";
    const hydrationKey = `${windowId}:${tabId}`;
    if (!windowId || hydratedBrowserViews.has(hydrationKey)) {
      return;
    }
    hydratedBrowserViews.add(hydrationKey);
    webview.addEventListener("did-start-loading", () => {
      setBrowserStatus(windowId, "正在加载页面...", "loading");
    });
    webview.addEventListener("new-window", (event) => {
      event.preventDefault?.();
      if (event.url) {
        openPopupUrlInsideCosSBrowser(event.url, windowId);
      }
    });
    webview.addEventListener("did-stop-loading", () => {
      const url = webview.getURL?.() || webview.getAttribute("src") || "";
      const title = webview.getTitle?.() || "";
      const win = getWindowState(windowId);
      if (win) {
        setActiveBrowserTabState(win, {
          url: url || win.browserUrl,
          title,
          status: title ? `已加载：${title}` : "页面已加载"
        });
        pushBrowserHistory(win, url || win.browserUrl, title);
        saveState();
      }
      const input = document.querySelector(`[data-browser-address="${CSS.escape(windowId)}"]`);
      if (input && url) {
        input.value = url;
      }
      setBrowserStatus(windowId, title ? `已加载：${title}` : "页面已加载");
    });
    webview.addEventListener("did-navigate", (event) => {
      const win = getWindowState(windowId);
      if (win && event.url) {
        setActiveBrowserTabState(win, { url: event.url });
        pushBrowserHistory(win, event.url);
      }
    });
    webview.addEventListener("did-navigate-in-page", (event) => {
      const win = getWindowState(windowId);
      if (win && event.url) {
        setActiveBrowserTabState(win, { url: event.url });
        pushBrowserHistory(win, event.url);
      }
    });
    webview.addEventListener("did-fail-load", (event) => {
      if (event.errorCode === -3) {
        return;
      }
      setBrowserStatus(windowId, `页面加载失败：${event.errorDescription || event.errorCode}`, "error");
      recordAppLog("browser.load.failed", {
        projectId: state.activeProjectId,
        windowId,
        url: event.validatedURL || event.url || "",
        errorCode: event.errorCode,
        errorDescription: event.errorDescription || ""
      }, "warn");
    });
  });
}

function setFileStatus(windowId, message, type = "ready") {
  const win = getWindowState(windowId);
  if (win) {
    win.fileStatus = type === "error" ? "" : message;
    win.fileError = type === "error" ? message : "";
  }
  const node = document.querySelector(`[data-file-status="${CSS.escape(windowId)}"]`);
  if (node) {
    node.textContent = message;
    node.classList.toggle("error", type === "error");
  }
}

async function refreshFileList(windowId) {
  const project = getProject();
  const win = getWindowState(windowId);
  if (!project || !win || !window.cossAPI?.listProjectFiles) {
    return;
  }
  setFileStatus(windowId, "正在读取项目文件列表...", "ready");
  const result = await window.cossAPI.listProjectFiles(project.path);
  if (!result?.ok) {
    win.fileListLoaded = true;
    win.fileList = [];
    setFileStatus(windowId, result?.error || "读取项目文件列表失败。", "error");
    saveState();
    render();
    return;
  }
  win.fileList = result.files || [];
  win.fileListLoaded = true;
  win.fileStatus = result.truncated ? "文件列表已截断显示。" : `已读取 ${win.fileList.length} 个文本文件。`;
  win.fileError = "";
  saveState();
  recordAppLog("file.list.loaded", { projectId: project.id, windowId, count: win.fileList.length });
  render();
}

async function openFileInWindow(windowId, filePath = null) {
  const project = getProject();
  const win = getWindowState(windowId);
  if (!project || !win || !window.cossAPI?.readProjectFile) {
    return;
  }
  const input = document.querySelector(`[data-file-path="${CSS.escape(windowId)}"]`);
  const targetPath = String(filePath ?? input?.value ?? win.filePath ?? "").trim();
  if (!targetPath) {
    setFileStatus(windowId, "请先输入或选择项目内文件路径。", "error");
    return;
  }
  setFileStatus(windowId, `正在打开 ${targetPath}...`, "ready");
  const result = await window.cossAPI.readProjectFile({
    projectPath: project.path,
    filePath: targetPath
  });
  if (!result?.ok) {
    setFileStatus(windowId, result?.error || "打开文件失败。", "error");
    saveState();
    render();
    return;
  }
  win.filePath = result.path;
  win.fileDraft = result.content || "";
  win.fileLoaded = true;
  win.fileDirty = false;
  win.fileStatus = `已打开 ${result.path} · ${result.size} bytes`;
  win.fileError = "";
  saveState();
  recordAppLog("file.opened", { projectId: project.id, windowId, path: result.path, size: result.size });
  render();
}

async function pickFileForWindow(windowId) {
  const project = getProject();
  const win = getWindowState(windowId);
  if (!project || !win || !window.cossAPI?.selectProjectFile) {
    return;
  }
  const result = await window.cossAPI.selectProjectFile({
    projectPath: project.path,
    currentPath: win.filePath || ""
  });
  if (result?.ok && result.path) {
    await openFileInWindow(windowId, result.path);
  } else if (!result?.canceled) {
    setFileStatus(windowId, result?.error || "选择文件失败。", "error");
  }
}

async function saveFileFromWindow(windowId) {
  const project = getProject();
  const win = getWindowState(windowId);
  if (!project || !win || !window.cossAPI?.writeProjectFile) {
    return;
  }
  const pathInput = document.querySelector(`[data-file-path="${CSS.escape(windowId)}"]`);
  const editor = document.querySelector(`[data-file-editor="${CSS.escape(windowId)}"]`);
  const targetPath = String(pathInput?.value || win.filePath || "").trim();
  const content = String(editor?.value ?? win.fileDraft ?? "");
  if (!targetPath) {
    setFileStatus(windowId, "请先输入项目内保存路径。", "error");
    return;
  }
  const result = await window.cossAPI.writeProjectFile({
    projectPath: project.path,
    filePath: targetPath,
    content
  });
  if (!result?.ok) {
    setFileStatus(windowId, result?.error || "保存文件失败。", "error");
    saveState();
    render();
    return;
  }
  win.filePath = result.path;
  win.fileDraft = content;
  win.fileLoaded = true;
  win.fileDirty = false;
  win.fileStatus = `已保存 ${result.path} · ${result.size} bytes`;
  win.fileError = "";
  saveState();
  recordAppLog("file.saved.renderer", { projectId: project.id, windowId, path: result.path, size: result.size });
  await refreshFileList(windowId);
}

function selectFileListPath(windowId, filePath) {
  const win = getWindowState(windowId);
  if (!win) {
    return;
  }
  win.filePath = filePath || "";
  win.fileStatus = `已选择 ${win.filePath}`;
  win.fileError = "";
  const input = document.querySelector(`[data-file-path="${CSS.escape(windowId)}"]`);
  if (input) {
    input.value = win.filePath;
  }
  setFileStatus(windowId, win.fileStatus, "ready");
  saveState();
}

function showFileOperationModal(windowId, operation) {
  const project = getProject();
  const win = getWindowState(windowId);
  if (!project || !win) {
    return;
  }
  const currentPath = String(document.querySelector(`[data-file-path="${CSS.escape(windowId)}"]`)?.value || win.filePath || "").trim();
  const baseDir = currentPath && /[/\\]/.test(currentPath) ? currentPath.replace(/[/\\][^/\\]*$/, "") : "";
  const config = {
    "create-folder": {
      title: "新建文件夹",
      label: "项目内文件夹路径",
      defaultValue: baseDir ? `${baseDir}/new-folder` : "new-folder",
      confirmLabel: "创建"
    },
    "save-as": {
      title: "另存为",
      label: "新的项目内文件路径",
      defaultValue: currentPath || "untitled.md",
      confirmLabel: "另存为"
    },
    rename: {
      title: "重命名",
      label: "新的项目内路径",
      defaultValue: currentPath,
      confirmLabel: "重命名"
    },
    delete: {
      title: "删除",
      label: "将删除的项目内路径",
      defaultValue: currentPath,
      confirmLabel: "确认删除",
      danger: true
    }
  }[operation];

  if (!config || (!config.defaultValue && operation !== "create-folder")) {
    setFileStatus(windowId, "请先选择文件或文件夹。", "error");
    return;
  }

  pendingFileOperation = { windowId, operation, fromPath: currentPath };
  renderModal(`
    <div class="modal file-operation-modal">
      <h2>${escapeHtml(config.title)}</h2>
      <p>路径必须位于当前项目目录内：${escapeHtml(project.path)}</p>
      <div class="field">
        <label for="fileOperationPath">${escapeHtml(config.label)}</label>
        <input id="fileOperationPath" value="${escapeHtml(config.defaultValue)}" ${operation === "delete" ? "readonly" : ""} />
      </div>
      <div id="fileOperationStatus" class="form-status muted">${operation === "delete" ? "删除操作不可撤销，请确认路径无误。" : "确认后会写入项目文件系统。"}</div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">取消</button>
        <button class="${config.danger ? "secondary-button danger" : "primary-button"}" data-action="confirm-file-operation">${escapeHtml(config.confirmLabel)}</button>
      </div>
    </div>
  `);
}

function setFileOperationStatus(message, type = "error") {
  const status = document.getElementById("fileOperationStatus");
  if (!status) {
    return;
  }
  status.className = `form-status ${type}`;
  status.textContent = message;
}

function createFolderFromWindow(windowId) {
  showFileOperationModal(windowId, "create-folder");
}

function saveFileAsFromWindow(windowId) {
  showFileOperationModal(windowId, "save-as");
}

function renameFileFromWindow(windowId) {
  showFileOperationModal(windowId, "rename");
}

function deleteFileFromWindow(windowId) {
  showFileOperationModal(windowId, "delete");
}

async function confirmFileOperationFromModal() {
  const operation = pendingFileOperation;
  const targetPath = document.getElementById("fileOperationPath")?.value.trim();
  if (!operation || !targetPath) {
    setFileOperationStatus("请填写项目内路径。");
    return;
  }
  const project = getProject();
  const win = getWindowState(operation.windowId);
  if (!project || !win) {
    setFileOperationStatus("当前项目或窗口不存在。");
    return;
  }

  const windowId = operation.windowId;
  if (operation.operation === "create-folder") {
    if (!window.cossAPI?.createProjectFolder) {
      setFileOperationStatus("当前运行环境不支持新建文件夹。");
      return;
    }
    const result = await window.cossAPI.createProjectFolder({
      projectPath: project.path,
      folderPath: targetPath
    });
    if (!result?.ok) {
      setFileOperationStatus(result?.error || "新建文件夹失败。");
      return;
    }
    pendingFileOperation = null;
    closeModal();
    win.filePath = result.path;
    setFileStatus(windowId, `已创建文件夹 ${result.path}`, "ready");
    recordAppLog("file.folder.created.renderer", { projectId: project.id, windowId, path: result.path });
    await refreshFileList(windowId);
    return;
  }

  if (operation.operation === "save-as") {
    if (!window.cossAPI?.writeProjectFile) {
      setFileOperationStatus("当前运行环境不支持保存文件。");
      return;
    }
    const editor = document.querySelector(`[data-file-editor="${CSS.escape(windowId)}"]`);
    const content = String(editor?.value ?? win.fileDraft ?? "");
    const result = await window.cossAPI.writeProjectFile({
      projectPath: project.path,
      filePath: targetPath,
      content
    });
    if (!result?.ok) {
      setFileOperationStatus(result?.error || "另存为失败。");
      return;
    }
    pendingFileOperation = null;
    closeModal();
    win.filePath = result.path;
    win.fileDraft = content;
    win.fileLoaded = true;
    win.fileDirty = false;
    setFileStatus(windowId, `已另存为 ${result.path}`, "ready");
    recordAppLog("file.saved-as.renderer", { projectId: project.id, windowId, path: result.path, size: result.size });
    await refreshFileList(windowId);
    return;
  }

  if (operation.operation === "rename") {
    if (!window.cossAPI?.renameProjectFile || !operation.fromPath) {
      setFileOperationStatus("请先选择要重命名的文件或文件夹。");
      return;
    }
    const result = await window.cossAPI.renameProjectFile({
      projectPath: project.path,
      fromPath: operation.fromPath,
      toPath: targetPath
    });
    if (!result?.ok) {
      setFileOperationStatus(result?.error || "重命名失败。");
      return;
    }
    pendingFileOperation = null;
    closeModal();
    win.filePath = result.path;
    setFileStatus(windowId, `已重命名为 ${result.path}`, "ready");
    recordAppLog("file.renamed.renderer", { projectId: project.id, windowId, fromPath: operation.fromPath, path: result.path });
    await refreshFileList(windowId);
    return;
  }

  if (operation.operation === "delete") {
    if (!window.cossAPI?.deleteProjectFile || !operation.fromPath) {
      setFileOperationStatus("请先选择要删除的文件或文件夹。");
      return;
    }
    const result = await window.cossAPI.deleteProjectFile({
      projectPath: project.path,
      filePath: operation.fromPath
    });
    if (!result?.ok) {
      setFileOperationStatus(result?.error || "删除失败。");
      return;
    }
    pendingFileOperation = null;
    closeModal();
    win.filePath = "";
    win.fileDraft = "";
    win.fileLoaded = false;
    win.fileDirty = false;
    setFileStatus(windowId, `已删除 ${result.path}`, "ready");
    recordAppLog("file.deleted.renderer", { projectId: project.id, windowId, path: result.path });
    await refreshFileList(windowId);
  }
}

function cleanupTerminalView(windowId, disposeBackend = false) {
  const view = terminalViews.get(windowId);
  if (view) {
    view.resizeObserver?.disconnect();
    view.unsubscribeData?.();
    view.unsubscribeExit?.();
    view.inputDisposable?.dispose?.();
    view.resizeDisposable?.dispose?.();
    view.fitAddon?.dispose?.();
    view.term?.dispose?.();
    terminalViews.delete(windowId);
  }

  if (disposeBackend && terminalBackendIds.has(windowId)) {
    terminalBackendIds.delete(windowId);
    terminalBackendReadyIds.delete(windowId);
    terminalBackendActiveModes.delete(windowId);
    terminalBackendReadyAt.delete(windowId);
    terminalRecentOutput.delete(windowId);
    window.cossAPI?.disposeTerminal?.(windowId);
  }
}

function disposeTerminalsOutsideActiveWorkspace(activeIds) {
  for (const windowId of Array.from(terminalViews.keys())) {
    if (!activeIds.has(windowId)) {
      cleanupTerminalView(windowId, false);
    }
  }
}

function sendBufferedTerminalInput(win, data) {
  if (data) {
    window.cossAPI.sendTerminalInput(win.id, data);
  }
}

function handleTerminalInput(win, inputState, term, data) {
  let passthrough = "";

  for (const char of data) {
    if (char === "\r" || char === "\n") {
      const command = inputState.commandBuffer.trim();
      const assessment = assessCommandRisk(command);

      if (command && assessment.requiresApproval) {
        sendBufferedTerminalInput(win, passthrough);
        const grant = findCommandApprovalGrant(win, assessment);
        if (grant) {
          markCommandApprovalGrantUsed(grant, win, assessment, command);
          createCommandLog(win, command, assessment, "approved-by-grant", {
            grantId: grant.id,
            grantScope: grant.scope
          });
          window.cossAPI?.sendTerminalInput?.(win.id, char, {
            bypassPermissionGuard: true,
            clearInputGuard: true,
            reason: "renderer-session-grant",
            grantId: grant.id
          });
          inputState.commandBuffer = "";
          return;
        }
        const log = createCommandLog(win, command, assessment, "pending");
        pendingCommandApproval = {
          windowId: win.id,
          roleId: win.roleId,
          command,
          assessment,
          logId: log?.id || null
        };
        inputState.commandBuffer = "";
        showCommandApprovalModal();
        return;
      }

      if (command) {
        createCommandLog(win, command, assessment, "executed");
      }
      passthrough += char;
      inputState.commandBuffer = "";
      continue;
    }

    if (char === "\u0003" || char === "\u0015") {
      inputState.commandBuffer = "";
      passthrough += char;
      continue;
    }

    if (char === "\u007f" || char === "\b") {
      inputState.commandBuffer = inputState.commandBuffer.slice(0, -1);
      passthrough += char;
      continue;
    }

    if (char >= " " || char === "\t") {
      inputState.commandBuffer += char;
    }
    passthrough += char;
  }

  sendBufferedTerminalInput(win, passthrough);
}

function hydrateTerminalWindows() {
  const project = getProject();
  const terminalWindows = getVisibleWindows(project).filter((win) => win.type === "terminal");
  const activeTerminalIds = new Set(terminalWindows.map((win) => win.id));

  disposeTerminalsOutsideActiveWorkspace(activeTerminalIds);

  if (!window.Terminal || !window.FitAddon?.FitAddon || !window.cossAPI) {
    return;
  }

  terminalWindows.forEach((win) => {
    const mount = document.querySelector(`[data-terminal-id="${win.id}"]`);
    if (!mount) {
      return;
    }

    const existingView = terminalViews.get(win.id);
    if (existingView?.mount === mount) {
      requestAnimationFrame(() => {
        try {
          existingView.fitAddon?.fit();
          window.cossAPI.resizeTerminal(win.id, existingView.term.cols, existingView.term.rows);
          if (focusedWindowId === win.id) {
            existingView.term.focus();
          }
        } catch (error) {
          console.warn("Failed to refit existing terminal", error);
        }
      });
      return;
    }

    if (existingView) {
      let reattached = false;
      try {
        existingView.resizeObserver?.disconnect();
        mount.innerHTML = "";
        if (existingView.term.element) {
          mount.appendChild(existingView.term.element);
        } else {
          existingView.term.open(mount);
        }
        existingView.mount = mount;
        existingView.resizeObserver = new ResizeObserver(() => {
          try {
            existingView.fitAddon?.fit();
            window.cossAPI.resizeTerminal(win.id, existingView.term.cols, existingView.term.rows);
          } catch (error) {
            console.warn("Failed to refit reattached terminal", error);
          }
        });
        existingView.resizeObserver.observe(mount);
        reattached = true;
      } catch (error) {
        console.warn("Failed to reattach terminal view", error);
        cleanupTerminalView(win.id, false);
      }

      if (reattached) {
        requestAnimationFrame(() => {
          try {
            existingView.fitAddon?.fit();
            window.cossAPI.resizeTerminal(win.id, existingView.term.cols, existingView.term.rows);
            if (focusedWindowId === win.id) {
              existingView.term.focus();
            }
          } catch (error) {
            console.warn("Failed to refit reattached terminal", error);
          }
        });
        return;
      }
    }

    mount.innerHTML = "";

    const role = getRole(win.roleId);
    const term = new window.Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "Consolas, 'Cascadia Mono', 'Microsoft YaHei UI', monospace",
      fontSize: 12,
      lineHeight: 1.25,
      scrollback: 2000,
      theme: {
        background: "#11131a",
        foreground: "#d8deea",
        cursor: "#d8deea",
        selectionBackground: "#35507a",
        black: "#11131a",
        red: "#ff6b7a",
        green: "#5fe39b",
        yellow: "#ffd166",
        blue: "#75a7ff",
        magenta: "#c792ea",
        cyan: "#5ed6d6",
        white: "#edf2ff"
      }
    });
    const fitAddon = new window.FitAddon.FitAddon();
    const inputState = { commandBuffer: "" };
    term.loadAddon(fitAddon);
    term.open(mount);

    const fit = () => {
      try {
        fitAddon.fit();
        window.cossAPI.resizeTerminal(win.id, term.cols, term.rows);
      } catch (error) {
        console.warn("Failed to fit terminal", error);
      }
    };

    const inputDisposable = term.onData((data) => handleTerminalInput(win, inputState, term, data));
    const resizeDisposable = term.onResize(({ cols, rows }) => {
      window.cossAPI.resizeTerminal(win.id, cols, rows);
    });
    const unsubscribeData = window.cossAPI.onTerminalData(({ id, data }) => {
      if (id === win.id) {
        terminalRecentOutput.set(id, `${terminalRecentOutput.get(id) || ""}${data}`.slice(-5000));
        term.write(data);
        recordTerminalOutputReference(win.id, data);
      }
    });
    const unsubscribeExit = window.cossAPI.onTerminalExit(({ id, exitCode }) => {
      if (id === win.id) {
        term.writeln("");
        term.writeln(`\x1b[33m进程已退出，代码 ${exitCode ?? "unknown"}。关闭并重新创建终端可启动新会话。\x1b[0m`);
        terminalBackendIds.delete(win.id);
        terminalBackendReadyIds.delete(win.id);
        terminalBackendActiveModes.delete(win.id);
        terminalBackendReadyAt.delete(win.id);
      }
    });
    const resizeObserver = new ResizeObserver(() => fit());

    resizeObserver.observe(mount);
    terminalViews.set(win.id, {
      term,
      fitAddon,
      inputState,
      inputDisposable,
      resizeDisposable,
      unsubscribeData,
      unsubscribeExit,
      resizeObserver,
      mount
    });

    requestAnimationFrame(() => {
      fit();
      if (focusedWindowId === win.id) {
        term.focus();
      }
    });

    const backendWasKnown = terminalBackendIds.has(win.id);
    terminalBackendIds.add(win.id);
    if (normalizeTerminalMode(win.terminalMode) === "agent") {
      win.agentSession = ensureAgentSessionShape(win, project);
    }
    const taskContext = getTaskContextForWindow(win, project);
    window.cossAPI
      .createTerminal({
        id: win.id,
        cwd: project?.path,
        projectId: project?.id || "",
        projectName: project?.name || "",
        roleId: role.id,
        roleName: role.name,
        roleDescription: role.description,
        useClaude: role.claude,
        terminalMode: win.terminalMode || "shell",
        agentProvider: win.agentProvider || state.settings.agentProvider,
        agentSession: win.agentSession || null,
        taskContext,
        rolePromptTemplate: state.settings.agentPromptTemplate,
        agentFallbackToShell: state.settings.agentFallbackToShell !== false,
        agentPermissionMode: state.settings.agentPermissionMode,
        agentMcpAutoConfigEnabled: state.settings.agentMcpAutoConfigEnabled === true,
        codeBuddyApiKey: state.settings.codeBuddyApiKey || "",
        cols: term.cols,
        rows: term.rows
      })
      .then((result) => {
        const activeMode = String(result?.activeMode || result?.mode || "").toLowerCase();
        terminalBackendActiveModes.set(win.id, activeMode);
        if (!["error", "installing", "static", "shell"].includes(activeMode)) {
          terminalBackendReadyIds.add(win.id);
          terminalBackendReadyAt.set(win.id, Date.now());
          if (normalizeTerminalMode(win.terminalMode) === "agent") {
            resumeAutoWorkflowMessagesForWindow(win, result?.reattached ? "terminal-reattached" : "terminal-ready");
          }
        } else {
          terminalBackendReadyIds.delete(win.id);
          terminalBackendReadyAt.delete(win.id);
        }
        if (result?.reattached && result.transcript) {
          term.reset();
          term.write(result.transcript);
          terminalRecentOutput.set(win.id, String(result.transcript || "").slice(-5000));
        }
        if (win.agentSession && result?.agentSession) {
          win.agentSession = {
            ...win.agentSession,
            ...result.agentSession,
            lastStartedAt: result.reattached ? win.agentSession.lastStartedAt : new Date().toISOString(),
            resumeCount: Number(win.agentSession.resumeCount || 0) + (result.reattached ? 0 : 1),
            lastActiveMode: result.activeMode || ""
          };
          saveState();
        }
      })
      .catch((error) => {
        if (!backendWasKnown) {
          terminalBackendIds.delete(win.id);
        }
        terminalBackendReadyIds.delete(win.id);
        terminalBackendActiveModes.delete(win.id);
        terminalBackendReadyAt.delete(win.id);
        term.writeln(`\x1b[31m终端启动失败：${error.message}\x1b[0m`);
      });
  });
}

function attachWindowFocusHandlers() {
  document.querySelectorAll(".program-window").forEach((windowNode) => {
    windowNode.addEventListener("pointerdown", (event) => {
      const focusTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (event.button !== 0 || focusTarget?.closest("[data-no-focus]")) {
        return;
      }

      focusWindow(windowNode.dataset.windowId, { render: false });
    });
  });
}

function getWindowMinSize(win) {
  const defaults = {
    terminal: { width: 360, height: 240 },
    browser: { width: 440, height: 300 },
    file: { width: 440, height: 300 },
    task: { width: 360, height: 260 },
    "task-list": { width: 680, height: 360 }
  };
  return defaults[win.type] || { width: 320, height: 220 };
}

function syncWindowGeometry(win) {
  const node = document.querySelector(`.program-window[data-window-id="${win.id}"]`);
  if (node) {
    node.style.left = `${win.x}px`;
    node.style.top = `${win.y}px`;
    node.style.width = `${win.width}px`;
    node.style.height = `${win.height}px`;
  }

  const overlayNode = document.querySelector(`.collab-overlay-item[data-window-id="${win.id}"]`);
  if (overlayNode) {
    overlayNode.style.left = `${win.x + win.width - 46}px`;
    overlayNode.style.top = `${win.y + win.height - 46}px`;
  }
}

function getWorkspaceLayoutBounds() {
  const workspace = document.querySelector(".workspace");
  const width = Math.max(760, workspace?.clientWidth || 960);
  const height = Math.max(520, workspace?.clientHeight || 640);
  return {
    x: 32,
    y: 78,
    width: Math.max(420, width - 64),
    height: Math.max(280, height - 170)
  };
}

function gridLayoutSlots(bounds, count, columns) {
  const gap = 12;
  const cols = Math.max(1, Math.min(columns, count || 1));
  const rows = Math.max(1, Math.ceil((count || 1) / cols));
  const slotWidth = (bounds.width - gap * (cols - 1)) / cols;
  const slotHeight = (bounds.height - gap * (rows - 1)) / rows;

  return Array.from({ length: count }, (_item, index) => ({
    x: bounds.x + (index % cols) * (slotWidth + gap),
    y: bounds.y + Math.floor(index / cols) * (slotHeight + gap),
    width: slotWidth,
    height: slotHeight
  }));
}

function layoutSlotsForPreset(layoutPreset, bounds, count) {
  const gap = 12;
  if (count <= 1) {
    return [{ ...bounds }];
  }

  const preset = normalizeLayoutPreset(layoutPreset);
  const halfWidth = (bounds.width - gap) / 2;
  const halfHeight = (bounds.height - gap) / 2;
  const thirdWidth = (bounds.width - gap * 2) / 3;
  const narrowWidth = Math.round((bounds.width - gap * 2) * 0.22);
  const centerWidth = bounds.width - narrowWidth * 2 - gap * 2;
  const mainWidth = Math.round((bounds.width - gap) * 0.68);
  const sideWidth = bounds.width - mainWidth - gap;
  const stackedSideHeight = (bounds.height - gap) / 2;

  const layouts = {
    "split-two": [
      { x: bounds.x, y: bounds.y, width: halfWidth, height: bounds.height },
      { x: bounds.x + halfWidth + gap, y: bounds.y, width: halfWidth, height: bounds.height }
    ],
    "main-narrow": [
      { x: bounds.x, y: bounds.y, width: mainWidth, height: bounds.height },
      { x: bounds.x + mainWidth + gap, y: bounds.y, width: sideWidth, height: bounds.height }
    ],
    "main-stack": [
      { x: bounds.x, y: bounds.y, width: mainWidth, height: bounds.height },
      { x: bounds.x + mainWidth + gap, y: bounds.y, width: sideWidth, height: stackedSideHeight },
      { x: bounds.x + mainWidth + gap, y: bounds.y + stackedSideHeight + gap, width: sideWidth, height: stackedSideHeight }
    ],
    "four-grid": [
      { x: bounds.x, y: bounds.y, width: halfWidth, height: halfHeight },
      { x: bounds.x + halfWidth + gap, y: bounds.y, width: halfWidth, height: halfHeight },
      { x: bounds.x, y: bounds.y + halfHeight + gap, width: halfWidth, height: halfHeight },
      { x: bounds.x + halfWidth + gap, y: bounds.y + halfHeight + gap, width: halfWidth, height: halfHeight }
    ],
    "three-columns": [
      { x: bounds.x, y: bounds.y, width: thirdWidth, height: bounds.height },
      { x: bounds.x + thirdWidth + gap, y: bounds.y, width: thirdWidth, height: bounds.height },
      { x: bounds.x + (thirdWidth + gap) * 2, y: bounds.y, width: thirdWidth, height: bounds.height }
    ],
    "center-focus": [
      { x: bounds.x, y: bounds.y, width: narrowWidth, height: bounds.height },
      { x: bounds.x + narrowWidth + gap, y: bounds.y, width: centerWidth, height: bounds.height },
      { x: bounds.x + narrowWidth + gap + centerWidth + gap, y: bounds.y, width: narrowWidth, height: bounds.height }
    ]
  };

  const slots = layouts[preset] || layouts["split-two"];
  if (count <= slots.length) {
    return slots.slice(0, count);
  }

  return gridLayoutSlots(bounds, count, Math.min(3, count));
}

function applyLayoutPreset(layoutPreset) {
  const project = getProject();
  if (!project) {
    return;
  }

  const desktopId = getActiveDesktopId(project);
  const desktop = getProjectDesktops(project).find((item) => item.id === desktopId);
  const windows = getDesktopWindows(project, desktopId)
    .filter((win) => !win.minimized)
    .sort((a, b) => normalizeZIndex(a.z) - normalizeZIndex(b.z));
  if (!desktop) {
    return;
  }

  desktop.layoutPreset = normalizeLayoutPreset(layoutPreset);

  if (windows.length > 0) {
    const bounds = getWorkspaceLayoutBounds();
    const slots = layoutSlotsForPreset(desktop.layoutPreset, bounds, windows.length);
    windows.forEach((win, index) => {
      const slot = slots[index] || bounds;
      const minSize = getWindowMinSize(win);
      win.maximized = false;
      win.restoreBounds = null;
      win.minimized = false;
      win.x = Math.round(slot.x);
      win.y = Math.round(slot.y);
      win.width = Math.max(minSize.width, Math.round(slot.width));
      win.height = Math.max(minSize.height, Math.round(slot.height));
    });
    rebuildWindowStack(project, windows[windows.length - 1]?.id);
    focusedWindowId = windows[windows.length - 1]?.id || focusedWindowId;
  }

  recordAppLog("desktop.layout-preset.applied", {
    projectId: project.id,
    desktopId: desktop.id,
    layout: desktop.layoutPreset,
    windowCount: windows.length
  });
  saveState();
  render();
}

function updateWindowDrag(event) {
  const project = getProject();
  const win = project?.windows.find((item) => item.id === dragState?.windowId);
  if (!win || win.maximized) {
    return;
  }

  const deltaX = event.clientX - dragState.startX;
  const deltaY = event.clientY - dragState.startY;

  if (dragState.type === "resize") {
    const minSize = getWindowMinSize(win);
    const direction = dragState.direction || "";
    let nextX = dragState.originX;
    let nextY = dragState.originY;
    let nextWidth = dragState.originWidth;
    let nextHeight = dragState.originHeight;

    if (direction.includes("e")) {
      nextWidth = Math.max(minSize.width, dragState.originWidth + deltaX);
    }
    if (direction.includes("s")) {
      nextHeight = Math.max(minSize.height, dragState.originHeight + deltaY);
    }
    if (direction.includes("w")) {
      nextWidth = Math.max(minSize.width, dragState.originWidth - deltaX);
      nextX = dragState.originX + (dragState.originWidth - nextWidth);
    }
    if (direction.includes("n")) {
      nextHeight = Math.max(minSize.height, dragState.originHeight - deltaY);
      nextY = dragState.originY + (dragState.originHeight - nextHeight);
    }

    win.x = Math.max(12, nextX);
    win.y = Math.max(58, nextY);
    win.width = nextWidth;
    win.height = nextHeight;
    syncWindowGeometry(win);
    return;
  }

  win.x = Math.max(12, dragState.originX + deltaX);
  win.y = Math.max(58, dragState.originY + deltaY);
  syncWindowGeometry(win);
}

function finishWindowDrag() {
  if (!dragState) {
    return;
  }

  const project = getProject();
  const win = project?.windows.find((item) => item.id === dragState.windowId);
  if (win) {
    recordAppLog(dragState.type === "resize" ? "program.resized" : "program.moved", {
      projectId: project.id,
      windowId: win.id,
      desktopId: win.desktopId,
      x: win.x,
      y: win.y,
      width: win.width,
      height: win.height
    });
  }

  dragState = null;
  saveState();
}

function attachWindowDragHandlers() {
  document.querySelectorAll("[data-drag-handle]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      const dragTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (
        event.button !== 0 ||
        dragTarget?.closest("[data-no-drag], button, input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      const project = getProject();
      const win = project?.windows.find((item) => item.id === handle.dataset.windowId);
      if (!win || win.maximized) {
        return;
      }

      focusWindow(win.id, { render: false });
      dragState = {
        type: "move",
        windowId: win.id,
        startX: event.clientX,
        startY: event.clientY,
        originX: win.x,
        originY: win.y
      };
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", updateWindowDrag);
    handle.addEventListener("pointerup", finishWindowDrag);
    handle.addEventListener("pointercancel", finishWindowDrag);
  });

  document.querySelectorAll("[data-resize-handle]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      const project = getProject();
      const win = project?.windows.find((item) => item.id === handle.dataset.windowId);
      if (!win || win.maximized) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      focusWindow(win.id, { render: false });
      dragState = {
        type: "resize",
        direction: handle.dataset.resizeHandle,
        windowId: win.id,
        startX: event.clientX,
        startY: event.clientY,
        originX: win.x,
        originY: win.y,
        originWidth: win.width,
        originHeight: win.height
      };
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", updateWindowDrag);
    handle.addEventListener("pointerup", finishWindowDrag);
    handle.addEventListener("pointercancel", finishWindowDrag);
  });
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) {
    const clickTarget = event.target instanceof Element ? event.target : event.target?.parentElement;
    const shouldRefreshFloatingUi = Boolean(activePopoverWindowId || openAppMenuId || taskViewOpen);
    closeMenus();
    activePopoverWindowId = null;
    if (!clickTarget?.closest(".task-view-panel")) {
      taskViewOpen = false;
    }
    if (shouldRefreshFloatingUi) {
      render();
    }
    return;
  }

  const action = target.dataset.action;

  if (action === "toggle-app-menu") {
    openAppMenuId = openAppMenuId === target.dataset.menuId ? null : target.dataset.menuId;
    contextMenu = null;
    roleMenu = null;
    render();
    return;
  }

  if (action === "custom-menu-command") {
    executeCustomMenuCommand(target.dataset.command);
    return;
  }

  if (action === "window-control") {
    const windowAction = target.dataset.windowAction;
    window.cossAPI?.controlWindow?.(windowAction).then((result) => {
      if (windowAction === "toggle-maximize" && typeof result?.maximized === "boolean") {
        isWindowMaximized = result.maximized;
        render();
      }
    });
    return;
  }

  if (action === "desktop") {
    const shouldRefreshFloatingUi = Boolean(activePopoverWindowId || openAppMenuId || taskViewOpen);
    closeMenus();
    activePopoverWindowId = null;
    taskViewOpen = false;
    if (shouldRefreshFloatingUi) {
      render();
    }
    return;
  }

  if (action === "show-task-view") {
    taskViewOpen = !taskViewOpen;
    closeMenus();
    activePopoverWindowId = null;
    render();
    return;
  }

  if (action === "close-task-view") {
    if (target.classList.contains("task-view-backdrop") && event.target !== target) {
      return;
    }
    taskViewOpen = false;
    render();
    return;
  }

  if (action === "switch-desktop") {
    switchDesktop(target.dataset.desktopId);
    return;
  }

  if (action === "create-desktop") {
    createProjectDesktop();
    return;
  }

  if (action === "open-task-list-window") {
    closeMenus();
    openTaskListWindow();
    return;
  }

  if (action === "select-task-list-task") {
    selectTaskListTask(target.dataset.taskId);
    return;
  }

  if (action === "archive-task") {
    setTaskArchived(target.dataset.taskId, true);
    return;
  }

  if (action === "restore-task") {
    setTaskArchived(target.dataset.taskId, false);
    return;
  }

  if (action === "select-layout-preset") {
    applyLayoutPreset(target.dataset.layout);
    return;
  }

  if (action === "show-create-project") {
    showCreateProjectModal();
    return;
  }

  if (action === "create-project") {
    createProjectFromModal();
    return;
  }

  if (action === "choose-project-directory") {
    chooseProjectDirectoryFromModal();
    return;
  }

  if (action === "select-project") {
    setActiveProject(target.dataset.projectId);
    return;
  }

  if (action === "show-delete-project") {
    showDeleteProjectModal(target.dataset.projectId);
    return;
  }

  if (action === "confirm-delete-project") {
    deleteProject(target.dataset.projectId);
    return;
  }

  if (action === "show-role-picker") {
    showRolePicker(target.dataset.type);
    return;
  }

  if (action === "role-menu") {
    openRoleMenu(target.dataset.type, target);
    return;
  }

  if (action === "select-role") {
    createProgram(target.dataset.type, target.dataset.roleId, {
      terminalMode: target.dataset.terminalMode,
      agentProvider: target.dataset.terminalMode === "agent" ? state.settings.agentProvider : undefined
    });
    closeModal();
    return;
  }

  if (action === "browser-go") {
    navigateBrowserWindow(target.dataset.windowId);
    return;
  }

  if (action === "browser-new-tab") {
    createBrowserTab(target.dataset.windowId);
    return;
  }

  if (action === "browser-close-tab") {
    closeBrowserTab(target.dataset.windowId, target.dataset.tabId || "");
    return;
  }

  if (action === "browser-switch-tab") {
    switchBrowserTab(target.dataset.windowId, target.dataset.tabId);
    return;
  }

  if (action === "browser-bookmark") {
    toggleBrowserBookmark(target.dataset.windowId);
    return;
  }

  if (action === "browser-open-history" || action === "browser-open-bookmark") {
    openBrowserUrlInWindow(target.dataset.windowId, target.dataset.url);
    return;
  }

  if (action === "browser-reload") {
    runBrowserCommand(target.dataset.windowId, "reload");
    return;
  }

  if (action === "browser-back") {
    runBrowserCommand(target.dataset.windowId, "back");
    return;
  }

  if (action === "browser-forward") {
    runBrowserCommand(target.dataset.windowId, "forward");
    return;
  }

  if (action === "file-refresh-list") {
    refreshFileList(target.dataset.windowId);
    return;
  }

  if (action === "file-open") {
    openFileInWindow(target.dataset.windowId);
    return;
  }

  if (action === "file-open-list-item") {
    openFileInWindow(target.dataset.windowId, target.dataset.filePathValue);
    return;
  }

  if (action === "file-select-list-path") {
    selectFileListPath(target.dataset.windowId, target.dataset.filePathValue);
    return;
  }

  if (action === "file-pick") {
    pickFileForWindow(target.dataset.windowId);
    return;
  }

  if (action === "file-save") {
    saveFileFromWindow(target.dataset.windowId);
    return;
  }

  if (action === "file-save-as") {
    saveFileAsFromWindow(target.dataset.windowId);
    return;
  }

  if (action === "file-create-folder") {
    createFolderFromWindow(target.dataset.windowId);
    return;
  }

  if (action === "file-rename") {
    renameFileFromWindow(target.dataset.windowId);
    return;
  }

  if (action === "file-delete") {
    deleteFileFromWindow(target.dataset.windowId);
    return;
  }

  if (action === "confirm-file-operation") {
    confirmFileOperationFromModal();
    return;
  }

  if (action === "show-create-task") {
    showCreateTaskModal();
    return;
  }

  if (action === "show-message-center") {
    showMessageCenterModal({ fromRoleId: target.dataset.roleId || undefined });
    return;
  }

  if (action === "show-logs") {
    showLogsModal();
    checkClaudeStatus();
    return;
  }

  if (action === "show-settings") {
    closeMenus();
    activeSettingsSection = "system";
    showSettingsModal();
    return;
  }

  if (action === "open-agent-settings") {
    closeMenus();
    activeSettingsSection = "agent";
    showSettingsModal();
    checkCurrentProjectMcpConfig();
    return;
  }

  if (action === "show-about") {
    showAboutModal();
    return;
  }

  if (action === "open-log-directory") {
    openLogDirectoryFromRenderer();
    return;
  }

  if (action === "set-settings-section") {
    activeSettingsSection = SETTINGS_SECTIONS.some((section) => section.id === target.dataset.section)
      ? target.dataset.section
      : "system";
    showSettingsModal();
    if (activeSettingsSection === "data") {
      refreshStorageInfo();
    }
    return;
  }

  if (action === "refresh-storage-info") {
    refreshStorageInfo();
    return;
  }

  if (action === "toggle-project-memory") {
    const project = getProject();
    if (project) {
      const memory = ensureProjectMemoryShape(project);
      memory.enabled = memory.enabled === false;
      memory.updatedAt = new Date().toISOString();
      memory.lastSource = "settings-toggle";
      recordAppLog("project.memory.toggled", {
        projectId: project.id,
        enabled: memory.enabled !== false
      });
      saveState();
    }
    showSettingsModal();
    return;
  }

  if (action === "refresh-project-memory") {
    const project = getProject();
    if (project) {
      rebuildProjectMemory(project, "settings-refresh");
      recordAppLog("project.memory.refreshed", {
        projectId: project.id,
        taskCount: project.memory?.taskHistory?.length || 0,
        artifactCount: project.memory?.artifacts?.length || 0,
        decisionCount: project.memory?.decisions?.length || 0
      });
      saveState();
    }
    showSettingsModal();
    return;
  }

  if (action === "save-project-memory") {
    const project = getProject();
    if (project) {
      const memory = ensureProjectMemoryShape(project);
      memory.manualNotes = String(document.getElementById("projectMemoryManualNotes")?.value || "").slice(0, 6000);
      rebuildProjectMemory(project, "settings-save");
      recordAppLog("project.memory.manual-notes.saved", {
        projectId: project.id,
        length: memory.manualNotes.length
      });
      saveState();
    }
    showSettingsModal();
    return;
  }

  if (action === "clear-project-memory") {
    const project = getProject();
    if (project) {
      project.memory = createEmptyProjectMemory(true);
      project.memory.updatedAt = new Date().toISOString();
      project.memory.lastSource = "settings-clear";
      recordAppLog("project.memory.cleared", {
        projectId: project.id
      }, "warn");
      saveState();
    }
    showSettingsModal();
    return;
  }

  if (action === "create-storage-backup") {
    runStorageOperation("创建备份", () => window.cossAPI.createStorageBackup());
    return;
  }

  if (action === "export-storage-state") {
    runStorageOperation("导出状态数据", () => window.cossAPI.exportStorageState());
    return;
  }

  if (action === "import-storage-state") {
    runStorageOperation("导入状态数据", async () => {
      const result = await window.cossAPI.importStorageState();
      if (result?.ok) {
        const loaded = await window.cossAPI.loadState();
        if (loaded?.projects?.length) {
          normalizeStoredWindowStacks(loaded);
          state = loaded;
        }
      }
      return result;
    });
    return;
  }

  if (action === "export-diagnostics-package") {
    runStorageOperation("导出诊断包", () => window.cossAPI.exportDiagnosticsPackage());
    return;
  }

  if (action === "open-storage-directory") {
    runStorageOperation("打开数据目录", () => window.cossAPI.openStorageDirectory());
    return;
  }

  if (action === "set-agent-provider") {
    state.settings.agentProvider = normalizeAgentProvider(target.dataset.provider);
    recordAppLog("settings.agent-provider.changed", {
      provider: state.settings.agentProvider
    });
    saveState();
    showSettingsModal();
    return;
  }

  if (action === "set-agent-permission-mode") {
    state.settings.agentPermissionMode = normalizeAgentPermissionMode(target.dataset.permissionMode);
    const policy = getAgentPermissionPolicy();
    recordAppLog("settings.agent-permission.changed", {
      mode: policy.id,
      label: policy.label
    });
    saveState();
    showSettingsModal();
    return;
  }

  if (action === "toggle-agent-fallback") {
    state.settings.agentFallbackToShell = state.settings.agentFallbackToShell === false;
    recordAppLog("settings.agent-fallback.changed", {
      enabled: state.settings.agentFallbackToShell !== false
    });
    saveState();
    showSettingsModal();
    return;
  }

  if (action === "toggle-agent-mcp-auto-config") {
    state.settings.agentMcpAutoConfigEnabled = state.settings.agentMcpAutoConfigEnabled !== true;
    recordAppLog("settings.agent-mcp-auto-config.changed", {
      enabled: state.settings.agentMcpAutoConfigEnabled === true
    });
    saveState();
    showSettingsModal();
    return;
  }

  if (action === "check-project-mcp-config") {
    checkCurrentProjectMcpConfig();
    return;
  }

  if (action === "write-project-mcp-config") {
    writeCurrentProjectMcpConfig();
    return;
  }

  if (action === "write-task-mcp-config") {
    writeCurrentProjectMcpConfig().then(() => {
      activeSettingsSection = "agent";
      showSettingsModal();
    });
    return;
  }

  if (action === "show-mcp-audit") {
    showMcpAuditModal();
    return;
  }

  if (action === "apply-mcp-audit-filters") {
    mcpAuditFilters = {
      roleId: document.getElementById("mcpAuditRoleFilter")?.value || "",
      taskId: document.getElementById("mcpAuditTaskFilter")?.value || "",
      tool: document.getElementById("mcpAuditToolFilter")?.value || "",
      query: document.getElementById("mcpAuditQueryFilter")?.value.trim() || ""
    };
    showMcpAuditModal();
    return;
  }

  if (action === "reset-agent-prompt-template") {
    state.settings.agentPromptTemplate = ensureAgentPromptMcpInstructions(
      ensureAgentPromptPermissionPlaceholders(defaultState.settings.agentPromptTemplate)
    );
    recordAppLog("settings.agent-prompt-template.reset", {
      length: state.settings.agentPromptTemplate.length
    });
    saveState();
    showSettingsModal();
    return;
  }

  if (action === "edit-model-provider") {
    modelEditorProvider = normalizeModelProvider(target.dataset.provider);
    showSettingsModal();
    return;
  }

  if (action === "set-model-provider") {
    const provider = normalizeModelProvider(target.dataset.provider);
    modelEditorProvider = provider;
    if (canUseModelProvider(provider)) {
      state.settings.modelProvider = provider;
      const config = getModelConfig(provider);
      recordAppLog("settings.model-provider.changed", {
        provider,
        modelName: config.modelName,
        baseUrl: config.baseUrl,
        hasApiKey: Boolean(config.apiKey)
      });
      saveState();
    } else {
      const config = getModelConfig(provider);
      recordAppLog("settings.model-provider.rejected", {
        provider,
        modelName: config.modelName,
        reason: "missing-api-key"
      }, "warn");
    }
    showSettingsModal();
    return;
  }

  if (action === "test-model-connectivity") {
    testModelConnectivity(target.dataset.provider);
    return;
  }

  if (action === "check-claude") {
    checkClaudeStatus();
    return;
  }

  if (action === "check-codex") {
    checkCodexStatus();
    return;
  }

  if (action === "check-codebuddy") {
    checkCodeBuddyStatus();
    return;
  }

  if (action === "test-agent-login") {
    testAgentLogin(target.dataset.provider);
    return;
  }

  if (action === "create-task") {
    createTaskFromModal();
    return;
  }

  if (action === "open-task-url") {
    openTaskUrlForSubtask(target.dataset.taskId, target.dataset.subtaskId);
    return;
  }

  if (action === "show-terminal-output-refs") {
    showTerminalOutputRefsModal(target.dataset.messageId);
    return;
  }

  if (action === "select-message-timeline-node") {
    selectMessageTimelineNode(target.dataset.timelineItemId || "");
    return;
  }

  if (action === "select-agent-flow-role") {
    selectAgentFlowRole(target.dataset.roleId || "");
    return;
  }

  if (action === "select-agent-flow-edge") {
    selectAgentFlowEdge(target.dataset.flowEdgeKey || "");
    return;
  }

  if (action === "clear-agent-flow-selection") {
    clearAgentFlowSelection();
    return;
  }

  if (action === "focus-terminal-ref-window") {
    closeModal();
    focusWindow(target.dataset.windowId);
    return;
  }

  if (action === "confirm-task-plan") {
    confirmTaskPlanInConversation().catch((error) => {
      recordAppLog("task.confirm.error", { error: error.message }, "error");
    });
    return;
  }

  if (action === "add-task-plan-subtask") {
    addPendingTaskPlanSubtask();
    return;
  }

  if (action === "delete-task-plan-subtask") {
    deletePendingTaskPlanSubtask(Number(target.dataset.planIndex));
    return;
  }

  if (action === "set-subtask-status") {
    updateSubtaskStatus(target.dataset.taskId, target.dataset.subtaskId, target.dataset.status);
    return;
  }

  if (action === "execute-kernel-subtask") {
    executeKernelSubtask(target.dataset.taskId, target.dataset.subtaskId).catch((error) => {
      recordAppLog("kernel.step.manual-execute.error", {
        taskId: target.dataset.taskId || "",
        subtaskId: target.dataset.subtaskId || "",
        error: error.message
      }, "error");
    });
    return;
  }

  if (action === "close-modal") {
    pendingTaskPlanDraft = null;
    if (pendingCommandApproval) {
      rejectPendingCommand();
    } else {
      closeModal();
    }
    return;
  }

  if (action === "approve-command") {
    approvePendingCommand();
    return;
  }

  if (action === "approve-command-session") {
    approvePendingCommand({ remember: true });
    return;
  }

  if (action === "reject-command") {
    rejectPendingCommand();
    return;
  }

  if (action === "close-window") {
    event.preventDefault();
    event.stopPropagation();
    closeWindow(target.dataset.windowId);
    return;
  }

  if (action === "minimize-window") {
    event.preventDefault();
    event.stopPropagation();
    minimizeWindow(target.dataset.windowId);
    return;
  }

  if (action === "toggle-maximize-window") {
    event.preventDefault();
    event.stopPropagation();
    toggleMaximizeWindow(target.dataset.windowId);
    return;
  }

  if (action === "focus-window") {
    focusWindow(target.dataset.windowId);
    return;
  }

  if (action === "toggle-popover") {
    activePopoverWindowId = activePopoverWindowId === target.dataset.windowId ? null : target.dataset.windowId;
    render();
    return;
  }

  if (action === "refresh-workspace") {
    bootWorkspace(state.activeProjectId);
    closeMenus();
    return;
  }
});

document.addEventListener("input", (event) => {
  const inputTarget = event.target instanceof Element ? event.target : null;
  const planField = inputTarget?.closest("[data-plan-field]");
  if (planField) {
    updatePendingTaskPlanField(Number(planField.dataset.planIndex), planField.dataset.planField, planField.value);
    return;
  }

  if (inputTarget?.id === "messageTimelineSearch") {
    messageTimelineFilters = {
      ...messageTimelineFilters,
      query: inputTarget.value
    };
    refreshMessageTimelineList();
    return;
  }

  if (inputTarget?.id === "taskListSearch") {
    taskListFilters = {
      ...taskListFilters,
      query: inputTarget.value
    };
    selectedTaskListTaskId = "";
    render();
    return;
  }

  const agentPromptTemplate = event.target instanceof Element ? event.target.closest("[data-agent-prompt-template]") : null;
  if (agentPromptTemplate) {
    state.settings.agentPromptTemplate = agentPromptTemplate.value;
    saveState();
    return;
  }

  const codeBuddyApiKey = event.target instanceof Element ? event.target.closest("[data-codebuddy-api-key]") : null;
  if (codeBuddyApiKey) {
    state.settings.codeBuddyApiKey = codeBuddyApiKey.value;
    delete agentLoginTestStatuses.codebuddy;
    saveState();
    return;
  }

  const target = event.target instanceof Element ? event.target.closest("[data-model-field]") : null;
  if (target) {
    const provider = normalizeModelProvider(target.dataset.modelProvider);
    updateModelConfigField(provider, target.dataset.modelField, target.value);
    const statusMount = document.querySelector(`[data-model-connectivity-status="${provider}"]`);
    if (statusMount) {
      statusMount.outerHTML = renderModelConnectivityStatus(provider);
    }
    return;
  }

  const fileEditor = event.target instanceof Element ? event.target.closest("[data-file-editor]") : null;
  if (fileEditor) {
    const win = getWindowState(fileEditor.dataset.fileEditor);
    if (win) {
      win.fileDraft = fileEditor.value;
      win.fileDirty = true;
      win.fileError = "";
      win.fileStatus = win.filePath ? `正在编辑 ${win.filePath}，尚未保存。` : "正在编辑新文件，尚未保存。";
      const status = document.querySelector(`[data-file-status="${CSS.escape(win.id)}"]`);
      if (status) {
        status.textContent = win.fileStatus;
        status.classList.remove("error");
      }
      syncFileEditorChrome(win.id);
    }
  }
});

document.addEventListener("scroll", (event) => {
  const fileEditor = event.target instanceof Element ? event.target.closest("[data-file-editor]") : null;
  if (fileEditor) {
    const lines = document.querySelector(`[data-file-lines="${CSS.escape(fileEditor.dataset.fileEditor)}"]`);
    if (lines) {
      lines.scrollTop = fileEditor.scrollTop;
    }
  }

  const scroller = event.target instanceof Element ? event.target.closest(".message-timeline-scroll") : null;
  if (scroller) {
    messageTimelineScrollLeft = scroller.scrollLeft;
  }
}, true);

document.addEventListener("change", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }

  const planField = target.closest("[data-plan-field]");
  if (planField) {
    updatePendingTaskPlanField(Number(planField.dataset.planIndex), planField.dataset.planField, planField.value);
    return;
  }

  if (target.id === "messageFromRole") {
    messageComposerDefaults = {
      ...messageComposerDefaults,
      fromRoleId: target.value,
      toRoleId: ""
    };
    showMessageCenterModal(messageComposerDefaults);
  }

  if (target.id === "messageTimelineTaskFilter") {
    messageTimelineFilters = {
      ...messageTimelineFilters,
      taskId: target.value
    };
    refreshMessageTimelineList();
  }

  if (target.id === "taskRoleFilter") {
    taskRoleFilter = target.value;
    render();
    return;
  }

  if (target.id === "taskListRoleFilter") {
    taskListFilters = {
      ...taskListFilters,
      roleId: target.value
    };
    selectedTaskListTaskId = "";
    render();
    return;
  }

  if (target.id === "taskListStatusFilter") {
    taskListFilters = {
      ...taskListFilters,
      status: target.value
    };
    selectedTaskListTaskId = "";
    render();
    return;
  }

  if (target.id === "taskListModelFilter") {
    taskListFilters = {
      ...taskListFilters,
      model: target.value
    };
    selectedTaskListTaskId = "";
    render();
    return;
  }

  if (target.id === "taskListIncludeArchived") {
    taskListFilters = {
      ...taskListFilters,
      includeArchived: Boolean(target.checked)
    };
    selectedTaskListTaskId = "";
    render();
  }
});

document.addEventListener("contextmenu", (event) => {
  const desktop = event.target.closest(".desktop");
  if (desktop) {
    openContextMenu(event);
  }
});

document.addEventListener("keydown", (event) => {
  const browserAddress = event.target instanceof Element ? event.target.closest("[data-browser-address]") : null;
  if (browserAddress && event.key === "Enter") {
    event.preventDefault();
    navigateBrowserWindow(browserAddress.dataset.browserAddress, browserAddress.value);
    return;
  }

  const fileEditor = event.target instanceof Element ? event.target.closest("[data-file-editor]") : null;
  if (fileEditor && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveFileFromWindow(fileEditor.dataset.fileEditor);
    return;
  }

  if (event.key === "Escape") {
    if (pendingCommandApproval) {
      rejectPendingCommand();
      return;
    }

    closeMenus();
    closeModal();
    activePopoverWindowId = null;
    render();
  }
});

document.addEventListener("keyup", (event) => {
  const fileEditor = event.target instanceof Element ? event.target.closest("[data-file-editor]") : null;
  if (fileEditor) {
    syncFileEditorChrome(fileEditor.dataset.fileEditor);
  }
});

document.addEventListener("click", (event) => {
  const fileEditor = event.target instanceof Element ? event.target.closest("[data-file-editor]") : null;
  if (fileEditor) {
    syncFileEditorChrome(fileEditor.dataset.fileEditor);
  }
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusSymbol(status) {
  return {
    idle: "i",
    thinking: "...",
    working: ">",
    talking: "↔",
    waiting: "!",
    blocked: "!",
    done: "✓",
    failed: "×"
  }[status] || "i";
}

function icon(name) {
  const icons = {
    new: `<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 14h6M12 11v6"/></svg>`,
    search: `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>`,
    menu: `<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h9"/></svg>`,
    clock: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/></svg>`,
    assistant: `<svg viewBox="0 0 24 24"><rect x="6" y="7" width="12" height="10" rx="2"/><path d="M9 7V5h6v2M9 12h.01M15 12h.01"/></svg>`,
    cube: `<svg viewBox="0 0 24 24"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12 4 7.5M12 12l8-4.5M12 12v9"/></svg>`,
    user: `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>`,
    bolt: `<svg viewBox="0 0 24 24"><path d="M13 2 5 14h6l-1 8 9-13h-6z"/></svg>`,
    more: `<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></svg>`,
    plus: `<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>`,
    bell: `<svg viewBox="0 0 24 24"><path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7"/><path d="M10 21h4"/></svg>`,
    gear: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.8-1L14.4 3h-4.8l-.3 3.1a7 7 0 0 0-1.8 1l-2.4-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.8 1l.3 3.1h4.8l.3-3.1a7 7 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5q.1-.5.1-1"/></svg>`,
    shield: `<svg viewBox="0 0 24 24"><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="m9 12 2 2 4-5"/></svg>`,
    sparkles: `<svg viewBox="0 0 24 24"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/><path d="M5 13l.7 1.8L8 15.5l-2.3.7L5 18l-.7-1.8L2 15.5l2.3-.7z"/></svg>`,
    database: `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>`,
    help: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 0 1 4.6 1c0 1.8-2.4 2.1-2.4 4"/><path d="M12 18h.01"/></svg>`,
    terminal: `<svg viewBox="0 0 24 24"><path d="m7 8 4 4-4 4"/><path d="M13 16h5"/></svg>`,
    task: `<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/><path d="M5 20h14"/></svg>`,
    globe: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>`,
    file: `<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v6h-6"/></svg>`,
    layout: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="15" width="7" height="5" rx="1.5"/><rect x="14" y="15" width="7" height="5" rx="1.5"/></svg>`
  };

  return `<span class="inline-icon">${icons[name] || icons.file}</span>`;
}

const style = document.createElement("style");
style.textContent = `
  .inline-icon,
  .nav-icon svg,
  .icon-button svg,
  .dock-button svg {
    display: inline-grid;
    width: 17px;
    height: 17px;
    place-items: center;
  }

  svg {
    width: 17px;
    height: 17px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
`;
document.head.appendChild(style);

window.cossAPI?.onAppMenuAction?.(handleAppMenuAction);
window.cossAPI?.onWindowMaximized?.((maximized) => {
  isWindowMaximized = Boolean(maximized);
  render();
});
window.cossAPI?.onBrowserOpenUrl?.((payload) => {
  openPopupUrlInsideCosSBrowser(payload?.url || "");
});
window.cossAPI?.onAgentEvent?.((event) => {
  applyAgentEventToState(event);
});

loadState().then(async () => {
  try {
    isWindowMaximized = Boolean(await window.cossAPI?.isWindowMaximized?.());
  } catch {
    isWindowMaximized = false;
  }
  render();
  startExternalStateRefresh();
  startPendingKernelAutoWorkflowPump();
  if (state.activeProjectId) {
    bootWorkspace(state.activeProjectId);
  }
  setTimeout(() => {
    resumePendingKernelAutoWorkflowMessages("state-load");
    getProject()?.windows
      ?.filter((win) => normalizeTerminalMode(win.terminalMode) === "agent")
      .forEach((win) => scheduleAgentDeliveryQueueDrain(win.id, 350));
  }, 900);
});
