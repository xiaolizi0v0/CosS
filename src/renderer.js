const ROLE_TEMPLATES = [
  {
    id: "product-manager",
    name: "产品经理",
    category: "规划",
    description: "把用户需求转化为可开发、可验收的任务。",
    programs: ["task", "file", "browser"],
    claude: false,
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
    programs: ["file", "browser", "task"],
    claude: false,
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

const PROGRAMS = {
  terminal: { label: "终端", icon: ">" },
  browser: { label: "浏览器", icon: "◎" },
  file: { label: "文件", icon: "□" },
  task: { label: "任务", icon: "✓" }
};

const DEFAULT_TASK_ROLE_IDS = ["product-manager", "frontend-engineer", "backend-engineer", "qa-engineer", "tech-lead"];

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
  settings: {
    agentProvider: "claude",
    agentFallbackToShell: true,
    agentPromptTemplate:
      "你是 CosS 类桌面工作区中的{{roleName}}。\n" +
      "角色 ID：{{roleId}}\n" +
      "角色职责：{{roleDescription}}\n" +
      "项目：{{projectName}}\n" +
      "工作目录：{{workspace}}\n" +
      "当前任务：{{taskTitle}}\n" +
      "子任务：{{subtaskTitle}}\n" +
      "子任务说明：{{subtaskDescription}}\n\n" +
      "请只在当前项目范围内工作。执行高风险命令、删除文件、修改依赖或访问敏感信息前，先说明风险并等待用户确认。\n" +
      "你可以和其他角色协作；完成或阻塞任务时，请在终端输出 COSS_AGENT_STATUS:done 或 COSS_AGENT_STATUS:blocked。\n" +
      "需要把协作消息写回 CosS 时，可输出 COSS_AGENT_EVENT:{\"status\":\"running\",\"message\":\"给其他角色的协作消息\",\"toRoleIds\":[\"product-manager\"]}。",
    modelProvider: "system",
    modelConfigs: createDefaultModelConfigs()
  }
};

const APP_VERSION = "v0.5.3";

let state = structuredClone(defaultState);
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
const hydratedBrowserViews = new Set();
let pendingCommandApproval = null;
let latestClaudeStatus = null;
let latestCodexStatus = null;
let modelEditorProvider = "system";
let activeSettingsSection = "system";
const modelConnectivityStatuses = {};
const agentLoginTestStatuses = {};
let openAppMenuId = null;
let isWindowMaximized = false;
let pendingTaskPlanDraft = null;
let messageComposerDefaults = {};
let messageTimelineFilters = { taskId: "", query: "" };
let taskViewOpen = false;
let pendingFileOperation = null;

const SUBTASK_STATUS_DEFS = {
  pending: { label: "待执行", windowStatus: "waiting" },
  running: { label: "执行中", windowStatus: "working" },
  done: { label: "已完成", windowStatus: "done" },
  blocked: { label: "已阻塞", windowStatus: "blocked" }
};

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

function nowTimeLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
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
  const legacyMap = {
    wide: "split-two",
    single: "split-two",
    left: "three-columns",
    right: "split-two",
    "left-wide": "main-stack",
    "right-stack": "main-stack",
    "focus-side": "center-focus"
  };
  const normalized = legacyMap[value] || value;
  return TASK_LAYOUT_PRESETS.some((preset) => preset.id === normalized) ? normalized : "split-two";
}

function createDesktopState(name = "主桌面", options = {}) {
  return {
    id: options.id || uid("desktop"),
    name,
    taskId: options.taskId || "",
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
      createDesktopState("主桌面", {
        id: DEFAULT_DESKTOP_ID,
        createdAt: project.createdAt || new Date().toISOString()
      })
    ];
  }

  project.desktops = project.desktops.map((desktop, index) => ({
    id: desktop.id || (index === 0 ? DEFAULT_DESKTOP_ID : uid("desktop")),
    name: desktop.name || (index === 0 ? "主桌面" : `桌面 ${index + 1}`),
    taskId: desktop.taskId || "",
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

function getVisibleWindows(project = getProject()) {
  return getDesktopWindows(project).filter((win) => !win.minimized);
}

function normalizeSubtaskStatus(value) {
  return SUBTASK_STATUS_DEFS[value] ? value : "pending";
}

function deriveTaskStatus(subtasks = []) {
  if (subtasks.length === 0) {
    return "planned";
  }
  if (subtasks.every((subtask) => normalizeSubtaskStatus(subtask.status) === "done")) {
    return "done";
  }
  if (subtasks.some((subtask) => normalizeSubtaskStatus(subtask.status) === "blocked")) {
    return "blocked";
  }
  if (subtasks.some((subtask) => normalizeSubtaskStatus(subtask.status) === "running")) {
    return "running";
  }
  return "planned";
}

function ensureTaskShape(task) {
  task.subtasks ||= [];
  task.subtasks.forEach((subtask) => {
    subtask.status = normalizeSubtaskStatus(subtask.status);
    subtask.createdAt ||= task.createdAt || new Date().toISOString();
    subtask.updatedAt ||= subtask.createdAt;
  });
  task.status = deriveTaskStatus(task.subtasks);
  return task;
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
    content: String(message.content || "").trim().slice(0, 500),
    taskId,
    source: message.source || (taskId ? "task-plan" : "manual"),
    status: message.status || "sent",
    readBy: uniqueRoleIds(message.readBy || [fromRoleId]),
    injectedWindowIds: uniqueStrings(message.injectedWindowIds || []),
    injectedAt: message.injectedAt || "",
    createdAt: message.createdAt || new Date().toISOString()
  };
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
    message: String(event.message || "").trim().slice(0, 500),
    receivedAt: event.receivedAt || new Date().toISOString()
  };
}

function normalizeDeliveryStatus(value) {
  return ["pending", "sent", "failed", "canceled"].includes(value) ? value : "pending";
}

function ensureAgentDeliveryShape(delivery) {
  return {
    id: delivery.id || uid("delivery"),
    messageId: delivery.messageId || "",
    windowId: delivery.windowId || "",
    roleId: getRole(delivery.roleId).id,
    taskId: delivery.taskId || "",
    status: normalizeDeliveryStatus(delivery.status),
    attempts: Number.isFinite(Number(delivery.attempts)) ? Number(delivery.attempts) : 0,
    createdAt: delivery.createdAt || new Date().toISOString(),
    updatedAt: delivery.updatedAt || delivery.createdAt || new Date().toISOString(),
    sentAt: delivery.sentAt || "",
    canceledAt: delivery.canceledAt || "",
    lastError: String(delivery.lastError || "").slice(0, 300)
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

function ensureBrowserWindowShape(win) {
  const legacyUrl = normalizeBrowserUrl(win.browserUrl || DEFAULT_BROWSER_URL);
  if (!Array.isArray(win.browserTabs) || win.browserTabs.length === 0) {
    win.browserTabs = [{
      id: uid("tab"),
      url: legacyUrl,
      title: win.browserTitle || legacyUrl,
      status: win.browserStatus || "ready",
      createdAt: new Date().toISOString()
    }];
  }
  win.browserTabs = win.browserTabs.map((tab, index) => ({
    id: tab.id || uid("tab"),
    url: normalizeBrowserUrl(tab.url || (index === 0 ? legacyUrl : DEFAULT_BROWSER_URL)),
    title: tab.title || "",
    status: tab.status || "ready",
    createdAt: tab.createdAt || new Date().toISOString()
  })).slice(0, 8);
  if (!win.browserTabs.some((tab) => tab.id === win.activeBrowserTabId)) {
    win.activeBrowserTabId = win.browserTabs[0].id;
  }
  const activeTab = getActiveBrowserTab(win);
  win.browserUrl = activeTab?.url || legacyUrl;
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
  project.agentEvents ||= [];
  project.agentDeliveries ||= [];
  project.terminalOutputRefs ||= [];
  ensureProjectDesktops(project);
  project.tasks.forEach(ensureTaskShape);
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

    if (win.terminalMode === "claude" || win.terminalMode === "codex") {
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
  nextState.settings ||= {};
  nextState.settings.agentProvider = normalizeAgentProvider(nextState.settings.agentProvider);
  nextState.settings.agentFallbackToShell = nextState.settings.agentFallbackToShell !== false;
  nextState.settings.agentPromptTemplate ||= defaultState.settings.agentPromptTemplate;
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
      description: "未命中 v0.2 高风险规则。"
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

function createCommandLog(win, command, assessment, status) {
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
    requiresApproval: Boolean(assessment.requiresApproval),
    ruleIds: assessment.ruleIds || []
  }, assessment.requiresApproval ? "warn" : "info");
  saveState();
  return log;
}

function updateCommandLog(logId, status) {
  const project = getProject();
  const log = project?.commandLogs?.find((item) => item.id === logId);
  if (!log) {
    return;
  }

  log.status = status;
  log.resolvedAt = new Date().toISOString();
  recordAppLog("command.status.changed", {
    projectId: project.id,
    logId,
    windowId: log.windowId,
    roleId: log.roleId,
    status
  });
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

async function saveState() {
  if (window.cossAPI?.saveState) {
    await window.cossAPI.saveState(state);
    return;
  }

  localStorage.setItem("coss-state", JSON.stringify(state));
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
    settings: { ...defaultState.settings }
  };
  await saveState();
}

function createProjectState(name, projectPath) {
  const id = uid("project");
  const createdAt = new Date().toISOString();
  const defaultDesktop = createDesktopState("主桌面", {
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
    agentEvents: [],
    agentDeliveries: [],
    terminalOutputRefs: []
  };
}

function createWindowState(type, roleId, x = 260, y = 108, options = {}) {
  const role = getRole(roleId);
  const terminalMode = normalizeTerminalMode(options.terminalMode);
  const agentProvider = normalizeAgentProvider(options.agentProvider || state.settings?.agentProvider);
  const terminalLabel = {
    agent: `Agent(${agentProvider === "codex" ? "Codex" : "Claude Code"})`,
    shell: "PowerShell"
  }[terminalMode];
  const title =
    type === "terminal"
      ? `${role.name} ${terminalLabel}`
      : `${role.name}${getProgramLabel(type)}`;
  const sizes = {
    terminal: [500, 338],
    browser: [640, 420],
    file: [560, 390],
    task: [500, 360]
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
  return ["agent", "shell"].includes(value) ? value : "shell";
}

function normalizeAgentProvider(value) {
  return value === "codex" ? "codex" : "claude";
}

function findTaskForDesktop(project, desktopId) {
  return project?.tasks?.find((task) => task.desktopId === desktopId) || null;
}

function findSubtaskForRole(task, roleId) {
  return task?.subtasks?.find((subtask) => subtask.roleId === roleId) || null;
}

function getTaskContextForWindow(win, project = getProject()) {
  const task = findTaskForDesktop(project, win.desktopId);
  const subtask = findSubtaskForRole(task, win.roleId);
  return {
    taskId: task?.id || "",
    taskTitle: task?.title || "",
    taskGoal: task?.goal || "",
    subtaskId: subtask?.id || "",
    subtaskTitle: subtask?.title || "",
    subtaskDescription: subtask?.description || "",
    subtaskStatus: subtask?.status || ""
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
    promptTemplateVersion: "v0.5",
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

function getActiveBrowserTab(win) {
  return win?.browserTabs?.find((tab) => tab.id === win.activeBrowserTabId) || win?.browserTabs?.[0] || null;
}

function setActiveBrowserTabState(win, patch) {
  const tab = getActiveBrowserTab(win);
  if (!tab) {
    return null;
  }
  Object.assign(tab, patch);
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
    createdAt: options.createdAt || new Date().toISOString()
  });
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

  const desktop = createDesktopState(name || `桌面 ${getProjectDesktops(project).length + 1}`);
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
  saveState();
  render();
}

function createFallbackTaskPlan(activeModel, error = "") {
  return {
    ok: false,
    source: "local-fallback",
    summary: "使用本地规则生成任务拆解。",
    error,
    subtasks: [
      {
        id: uid("subtask"),
        roleId: "product-manager",
        title: "确认需求和验收标准",
        description: "把用户目标整理成可执行的验收清单。"
      },
      {
        id: uid("subtask"),
        roleId: "backend-engineer",
        title: "确认接口和数据边界",
        description: "检查或实现任务所需的后端能力。"
      },
      {
        id: uid("subtask"),
        roleId: "frontend-engineer",
        title: "实现用户界面和交互",
        description: "完成页面、状态和接口联调。"
      },
      {
        id: uid("subtask"),
        roleId: "qa-engineer",
        title: "验证核心流程",
        description: "覆盖成功、失败、空状态和异常流程。"
      },
      {
        id: uid("subtask"),
        roleId: "tech-lead",
        title: "审查实现和风险",
        description: "检查代码质量、权限边界和测试缺口。"
      }
    ],
    messages: [
      {
        fromRoleId: "product-manager",
        toRoleIds: ["frontend-engineer", "backend-engineer", "qa-engineer"],
        content: error
          ? `模型规划失败，已使用本地规则拆解。失败原因：${error}`
          : `任务已拆解，当前规划模型：${activeModel.label} / ${activeModel.modelName}。`
      },
      {
        fromRoleId: "frontend-engineer",
        toRoleIds: ["backend-engineer"],
        content: "需要接口字段、错误码和登录态约定。"
      },
      {
        fromRoleId: "qa-engineer",
        toRoleIds: ["frontend-engineer", "backend-engineer"],
        content: "测试会覆盖成功、失败、空表单和网络异常。"
      },
      {
        fromRoleId: "tech-lead",
        toRoleIds: DEFAULT_TASK_ROLE_IDS.filter((roleId) => roleId !== "tech-lead"),
        content: "实现完成后进入技术审查。"
      }
    ]
  };
}

function normalizeTaskPlanResult(plan, fallbackPlan) {
  const allowedRoles = new Set(ROLE_TEMPLATES.map((role) => role.id));
  const placeholderTexts = new Set(["一句话总结", "子任务标题", "子任务描述", "角色ID", "协作消息"]);
  const isPlaceholder = (value) => placeholderTexts.has(String(value || "").trim());
  const subtasks = (Array.isArray(plan?.subtasks) ? plan.subtasks : [])
    .map((item) => ({
      id: item.id || uid("subtask"),
      roleId: allowedRoles.has(item.roleId) ? item.roleId : "product-manager",
      title: String(item.title || "").trim().slice(0, 80),
      description: String(item.description || "").trim().slice(0, 260),
      status: normalizeSubtaskStatus(item.status)
    }))
    .filter((item) => item.title && item.description && !isPlaceholder(item.title) && !isPlaceholder(item.description));

  if (subtasks.length < 3) {
    return fallbackPlan;
  }

  const messages = (Array.isArray(plan?.messages) ? plan.messages : [])
    .map((item) => ({
      fromRoleId: allowedRoles.has(item.fromRoleId) ? item.fromRoleId : "product-manager",
      toRoleIds: Array.isArray(item.toRoleIds)
        ? item.toRoleIds.filter((roleId) => allowedRoles.has(roleId)).slice(0, 6)
        : [],
      content: String(item.content || "").trim().slice(0, 260)
    }))
    .filter((item) => item.content && item.toRoleIds.length > 0);

  return {
    ok: Boolean(plan?.ok),
    source: plan?.source || "llm",
    summary: isPlaceholder(plan?.summary) ? "" : String(plan?.summary || "").trim(),
    plannedAt: plan?.plannedAt,
    usage: plan?.usage || null,
    subtasks,
    messages: messages.length > 0
      ? messages
      : [{
          fromRoleId: "product-manager",
          toRoleIds: subtasks.map((item) => item.roleId).filter((roleId, index, list) => roleId !== "product-manager" && list.indexOf(roleId) === index),
          content: plan?.summary || "模型已生成任务拆解，请各角色确认执行范围。"
        }]
  };
}

function getRoleIdsFromTaskPlan(plan) {
  const ids = new Set(DEFAULT_TASK_ROLE_IDS);
  plan.subtasks.forEach((subtask) => ids.add(subtask.roleId));
  plan.messages.forEach((message) => {
    ids.add(message.fromRoleId);
    message.toRoleIds.forEach((roleId) => ids.add(roleId));
  });
  return Array.from(ids);
}

async function requestTaskPlan(goal, project, activeModel) {
  if (!window.cossAPI?.planTask) {
    return { ok: false, error: "当前运行环境未暴露 LLM Gateway。" };
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
  let llmResult;
  try {
    llmResult = await requestTaskPlan(goal, project, activeModel);
  } catch (error) {
    llmResult = { ok: false, error: error.message };
  }
  const fallbackPlan = createFallbackTaskPlan(activeModel, llmResult?.ok === false ? llmResult.error : "");
  const taskPlan = llmResult?.ok ? normalizeTaskPlanResult(llmResult, fallbackPlan) : fallbackPlan;
  pendingTaskPlanDraft = {
    id: uid("taskdraft"),
    projectId: project.id,
    goal,
    activeModel,
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
  const { goal, activeModel, llmResult, taskPlan } = draft;
  const createdAt = new Date().toISOString();
  const subtasks = taskPlan.subtasks.map((subtask, index) => ({
    ...subtask,
    roleId: getRole(subtask.roleId).id,
    title: String(subtask.title || `子任务 ${index + 1}`).trim() || `子任务 ${index + 1}`,
    description: String(subtask.description || "请根据任务目标补充执行步骤。").trim() || "请根据任务目标补充执行步骤。",
    status: "pending",
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
      usage: taskPlan.usage || null
    },
    subtasks
  });
}

function confirmTaskPlan() {
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
  getProjectDesktops(project);
  project.desktops.push(taskDesktop);
  project.activeDesktopId = taskDesktop.id;
  project.messages.push(...taskPlan.messages.map((message) => (
    createMessage(message.fromRoleId, message.toRoleIds, message.content, task.id, {
      source: "task-plan",
      channelType: "task"
    })
  )));

  ensureRoleWindowsForTask(project, selectedRoles, taskDesktop.id);
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
    count: taskPlan.messages.length
  });
  render();
}

function updateSubtaskStatus(taskId, subtaskId, nextStatus) {
  const project = getProject();
  const task = project?.tasks.find((item) => item.id === taskId);
  const subtask = task?.subtasks.find((item) => item.id === subtaskId);
  const status = normalizeSubtaskStatus(nextStatus);
  if (!project || !task || !subtask) {
    return;
  }

  subtask.status = status;
  subtask.updatedAt = new Date().toISOString();
  task.status = deriveTaskStatus(task.subtasks);
  task.updatedAt = subtask.updatedAt;

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

function normalizeAgentEventStatus(status) {
  return {
    running: "running",
    done: "done",
    blocked: "blocked",
    failed: "blocked"
  }[status] || "";
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
  if (storedEvent.structured && storedEvent.message) {
    let toRoleIds = uniqueRoleIds(storedEvent.toRoleIds).filter((roleId) => roleId !== fromRoleId);
    if (toRoleIds.length === 0) {
      toRoleIds = uniqueRoleIds(["product-manager", "tech-lead"]).filter((roleId) => roleId !== fromRoleId);
    }
    if (toRoleIds.length > 0) {
      createdMessage = appendProjectMessage(
        project,
        createMessage(fromRoleId, toRoleIds, storedEvent.message, storedEvent.taskId || null, {
          source: "agent-event",
          channelType: storedEvent.taskId ? "task" : "direct",
          createdAt: storedEvent.receivedAt,
          readBy: [fromRoleId]
        })
      );
    }
  }

  if (status) {
    win.status = SUBTASK_STATUS_DEFS[status]?.windowStatus || (status === "failed" ? "blocked" : "working");
    if (win.agentSession) {
      win.agentSession.lastEventAt = storedEvent.receivedAt;
    }
  }

  const task = project.tasks.find((item) => item.id === storedEvent.taskId) || findTaskForDesktop(project, win.desktopId);
  const subtask = task?.subtasks.find((item) => item.id === storedEvent.subtaskId)
    || task?.subtasks.find((item) => item.roleId === win.roleId && normalizeSubtaskStatus(item.status) !== "done")
    || task?.subtasks.find((item) => item.roleId === win.roleId);
  if (task && subtask && status) {
    subtask.status = status;
    subtask.updatedAt = storedEvent.receivedAt;
    task.status = deriveTaskStatus(task.subtasks);
    task.updatedAt = storedEvent.receivedAt;
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
  }
  saveState();
  render();
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
  render();
}

function openRoleMenu(type, anchorElement) {
  pendingProgramType = type;
  const rect = anchorElement.getBoundingClientRect();
  roleMenu = {
    x: rect.right + 8,
    y: rect.top
  };
  render();
}

function closeMenus() {
  contextMenu = null;
  roleMenu = null;
  openAppMenuId = null;
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
  const sourceLabel = draft.llmResult?.ok ? "LLM Gateway" : "本地降级";
  renderModal(`
    <div class="modal task-plan-modal">
      <h2>确认任务计划</h2>
      <p>请先检查模型拆解结果。确认后，CosS 才会创建任务、分派角色并打开对应程序。</p>
      <div class="task-plan-summary">
        <strong>${escapeHtml(sourceLabel)} · ${escapeHtml(draft.activeModel.label)} / ${escapeHtml(draft.activeModel.modelName)}</strong>
        <span>${escapeHtml(plan.summary || "模型已生成任务计划。")}</span>
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
  const task = getProject()?.tasks.find((item) => item.id === taskId);
  return task ? `任务：${task.title}` : "私聊";
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

function getRunningAgentWindowsForRole(project, roleId, taskId = "") {
  return (project?.windows || [])
    .filter((win) => win.type === "terminal")
    .filter((win) => normalizeTerminalMode(win.terminalMode) === "agent")
    .filter((win) => win.roleId === roleId)
    .filter((win) => terminalBackendIds.has(win.id))
    .sort((a, b) => {
      const aMatchesTask = taskId && (a.agentSession?.taskId === taskId || getTaskContextForWindow(a, project).taskId === taskId);
      const bMatchesTask = taskId && (b.agentSession?.taskId === taskId || getTaskContextForWindow(b, project).taskId === taskId);
      if (aMatchesTask !== bMatchesTask) {
        return aMatchesTask ? -1 : 1;
      }
      return normalizeZIndex(b.z) - normalizeZIndex(a.z);
    });
}

function getInjectableWindowsForMessage(project, message) {
  return uniqueRoleIds(message?.toRoleIds || [])
    .flatMap((roleId) => getRunningAgentWindowsForRole(project, roleId, message?.taskId || ""));
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
  const taskLabel = message.taskId ? getMessageTaskLabel(message.taskId) : "私聊";
  const provider = targetWindow.agentProvider === "codex" ? "Codex" : "Claude Code";
  return stripTerminalControlChars([
    "请处理来自 CosS 协作时间线的指令。",
    `目标角色：${toRole.name}`,
    `发送角色：${fromRole.name}`,
    `Agent 后端：${provider}`,
    `频道：${taskLabel}`,
    `消息来源：${message.source || "manual"}`,
    "",
    message.content,
    "",
    "请基于当前项目上下文继续处理；需要同步进度时输出 COSS_AGENT_EVENT:{\"status\":\"running\",\"message\":\"你的进度或阻塞说明\",\"toRoleIds\":[\"product-manager\"]}。",
    "完成或阻塞时输出 COSS_AGENT_STATUS:done 或 COSS_AGENT_STATUS:blocked。"
  ].join("\n"));
}

function sendPastedTerminalInstruction(windowId, content) {
  const sanitized = stripTerminalControlChars(content);
  if (!sanitized || !window.cossAPI?.sendTerminalInput) {
    return Promise.resolve(false);
  }
  return window.cossAPI.sendTerminalInput(windowId, `\x1b[200~${sanitized}\x1b[201~\r`);
}

function getDeliveriesForMessage(project, messageId) {
  return (project?.agentDeliveries || []).filter((delivery) => delivery.messageId === messageId);
}

function getOutputRefsForMessage(project, messageId) {
  return (project?.terminalOutputRefs || []).filter((ref) => ref.messageId === messageId);
}

function queueAgentDeliveriesForMessage(messageId, options = {}) {
  const project = getProject();
  const message = project?.messages?.find((item) => item.id === messageId);
  if (!project || !message) {
    return { ok: false, queuedCount: 0, reason: "message-not-found" };
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
      && ["pending", "sent"].includes(delivery.status)
    ));
    if (existing) {
      queued.push(existing);
      continue;
    }
    const delivery = ensureAgentDeliveryShape({
      id: uid("delivery"),
      messageId: message.id,
      windowId: targetWindow.id,
      roleId: targetWindow.roleId,
      taskId: message.taskId || "",
      status: "pending",
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
      queuedCount: queued.length
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

async function confirmAgentDelivery(deliveryId) {
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

  const payload = buildTerminalInstructionPayload(message, targetWindow);
  const ok = await sendPastedTerminalInstruction(targetWindow.id, payload);
  const now = new Date().toISOString();
  delivery.attempts += 1;
  delivery.updatedAt = now;
  if (!ok) {
    delivery.status = "failed";
    delivery.lastError = "terminal-write-failed";
    recordAppLog("agent.delivery.failed", {
      projectId: project.id,
      deliveryId: delivery.id,
      messageId: message.id,
      windowId: targetWindow.id,
      reason: delivery.lastError
    }, "error");
    saveState();
    render();
    return { ok: false, reason: delivery.lastError };
  }

  delivery.status = "sent";
  delivery.sentAt = now;
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
      excerpt: "CosS 已确认投递，等待终端输出。",
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
    contentLength: message.content.length
  });
  saveState();
  render();
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
  if (!project || !delivery || !["failed", "canceled"].includes(delivery.status)) {
    return false;
  }
  delivery.status = "pending";
  delivery.lastError = "";
  delivery.updatedAt = new Date().toISOString();
  recordAppLog("agent.delivery.retried", {
    projectId: project.id,
    deliveryId,
    messageId: delivery.messageId,
    windowId: delivery.windowId
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
  if (!delivery || delivery.status !== "sent") {
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
  recordAppLog("agent.delivery.output-referenced", {
    projectId: project.id,
    deliveryId: delivery.id,
    messageId: delivery.messageId,
    windowId,
    excerptLength: excerpt.length
  });
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
        event.message,
        getMessageTaskLabel(event.taskId)
      ].join(" ").toLowerCase().includes(query);
    })
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 120);
}

function renderMessageRows(project) {
  const timeline = getProjectTimelineEvents(project);
  if (timeline.length === 0) {
    return `<div class="message-empty">暂无协作事件。发送一条消息，创建任务，或等待 Agent 输出结构化事件。</div>`;
  }

  return timeline
    .map((item) => {
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
            </div>
            <p>${escapeHtml(event.message || event.sessionId || "Agent 输出了状态事件。")}</p>
          </div>
        `;
      }

      const message = item.message;
      const fromRole = getRole(message.fromRoleId);
      const toNames = message.toRoleIds.map((roleId) => getRole(roleId).name).join("、");
      const channelLabel = message.channelType === "task" ? getMessageTaskLabel(message.taskId) : "私聊";
      const injectableWindows = getInjectableWindowsForMessage(project, message);
      const deliveries = getDeliveriesForMessage(project, message.id);
      const refs = getOutputRefsForMessage(project, message.id);
      const injectedLabel = message.injectedWindowIds?.length
        ? `<span>已注入 ${message.injectedWindowIds.length} 个终端</span>`
        : "";
      const deliverySummary = deliveries.length
        ? `<span>投递 ${deliveries.filter((item) => item.status === "sent").length}/${deliveries.length}</span>`
        : "";
      const deliveryRows = deliveries.length ? `
        <div class="delivery-list">
          ${deliveries.map((delivery) => `
            <div class="delivery-row ${escapeHtml(delivery.status)}">
              <span>${escapeHtml(getRole(delivery.roleId).name)} · ${escapeHtml(delivery.status)}</span>
              <span>${escapeHtml(formatDateTime(delivery.updatedAt))}</span>
              <div class="delivery-actions">
                ${delivery.status === "pending" ? `
                  <button class="secondary-button compact" data-action="confirm-agent-delivery" data-delivery-id="${escapeHtml(delivery.id)}">确认投递</button>
                  <button class="secondary-button compact" data-action="cancel-agent-delivery" data-delivery-id="${escapeHtml(delivery.id)}">取消</button>
                ` : ""}
                ${["failed", "canceled"].includes(delivery.status) ? `
                  <button class="secondary-button compact" data-action="retry-agent-delivery" data-delivery-id="${escapeHtml(delivery.id)}">重试</button>
                ` : ""}
              </div>
              ${delivery.lastError ? `<em>${escapeHtml(delivery.lastError)}</em>` : ""}
            </div>
          `).join("")}
        </div>
      ` : "";
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
            ${deliverySummary}
            ${refs.length ? `<span>${refs.length} 条输出引用</span>` : ""}
          </div>
          <p>${escapeHtml(message.content)}</p>
          ${deliveryRows}
          <div class="message-row-actions">
            ${injectableWindows.length > 0 ? `<button class="secondary-button compact" data-action="inject-message-terminal" data-message-id="${escapeHtml(message.id)}">加入投递队列</button>` : ""}
            ${refs.length ? `<button class="secondary-button compact" data-action="show-terminal-output-refs" data-message-id="${escapeHtml(message.id)}">查看输出</button>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function refreshMessageTimelineList() {
  const list = document.querySelector("[data-message-timeline-list]");
  const project = getProject();
  if (list && project) {
    list.innerHTML = renderMessageRows(project);
  }
}

function showMessageCenterModal(defaults = {}) {
  closeMenus();
  const project = getProject();
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

  messageComposerDefaults = { ...messageComposerDefaults, ...defaults };
  if (Object.prototype.hasOwnProperty.call(defaults, "filterTaskId")) {
    messageTimelineFilters = { ...messageTimelineFilters, taskId: defaults.filterTaskId || "" };
  }
  ensureProjectShape(project);
  const { fromRoleId, toRoleId } = getDefaultMessageRoles(messageComposerDefaults);
  const selectedTaskId = messageComposerDefaults.taskId || "";
  const selectedFilterTaskId = messageTimelineFilters.taskId || "";
  const taskOptions = project.tasks
    .map((task) => `<option value="${escapeHtml(task.id)}" ${task.id === selectedTaskId ? "selected" : ""}>${escapeHtml(task.title)}</option>`)
    .join("");
  const filterTaskOptions = project.tasks
    .map((task) => `<option value="${escapeHtml(task.id)}" ${task.id === selectedFilterTaskId ? "selected" : ""}>${escapeHtml(task.title)}</option>`)
    .join("");

  renderModal(`
    <div class="modal message-center-modal">
      <h2>v0.5.3 协作时间线</h2>
      <p>消息和 Agent 结构化事件会保存在当前项目中，用于驱动协作角标、任务群聊和角色私聊。</p>
      <div class="message-composer">
        <div class="field">
          <label for="messageFromRole">发送角色</label>
          <select id="messageFromRole" data-action="message-from-role">${renderRoleSelectOptions(fromRoleId)}</select>
        </div>
        <div class="field">
          <label for="messageToRole">接收角色</label>
          <select id="messageToRole">${renderRoleSelectOptions(toRoleId, fromRoleId)}</select>
        </div>
        <div class="field">
          <label for="messageTaskId">消息频道</label>
          <select id="messageTaskId">
            <option value="">私聊</option>
            ${taskOptions}
          </select>
        </div>
        <div class="field message-content-field">
          <label for="messageContent">消息内容</label>
          <textarea id="messageContent" placeholder="输入角色之间需要同步的上下文、阻塞点或交接事项。"></textarea>
          <div id="messageStatus" class="form-status muted">选择发送角色和接收角色后即可发送。</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">关闭</button>
        <button class="primary-button" data-action="send-role-message">发送消息</button>
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
}

function setMessageStatus(message, type = "error") {
  const status = document.getElementById("messageStatus");
  if (!status) {
    return;
  }
  status.className = `form-status ${type}`;
  status.textContent = message;
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
      <p>这些输出来自已确认投递的 Agent 终端，点击对应窗口可回到角色程序继续查看。</p>
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

function sendRoleMessageFromModal() {
  const project = getProject();
  const fromRoleId = document.getElementById("messageFromRole")?.value;
  const toRoleId = document.getElementById("messageToRole")?.value;
  const taskId = document.getElementById("messageTaskId")?.value || null;
  const content = document.getElementById("messageContent")?.value.trim();

  if (!project || !fromRoleId || !toRoleId || !content) {
    setMessageStatus("请完整填写发送角色、接收角色和消息内容。");
    return;
  }
  if (fromRoleId === toRoleId) {
    setMessageStatus("发送角色和接收角色不能相同。");
    return;
  }

  const message = createMessage(fromRoleId, [toRoleId], content, taskId, {
    source: "manual",
    channelType: taskId ? "task" : "direct"
  });
  appendProjectMessage(project, message);

  messageComposerDefaults = { fromRoleId, toRoleId, taskId: taskId || "" };
  saveState();
  recordAppLog("role.message.sent", {
    projectId: project.id,
    messageId: message.id,
    fromRoleId,
    toRoleIds: message.toRoleIds,
    channelType: message.channelType,
    taskId: message.taskId,
    contentLength: message.content.length
  });
  render();
  showMessageCenterModal(messageComposerDefaults);
  setMessageStatus("消息已发送。", "ready");
}

function getTaskAndSubtask(taskId, subtaskId) {
  const project = getProject();
  const task = project?.tasks.find((item) => item.id === taskId);
  const subtask = task?.subtasks.find((item) => item.id === subtaskId);
  return { project, task, subtask };
}

function buildSubtaskInstructionContent(task, subtask) {
  return [
    `任务：${task.title}`,
    `子任务：${subtask.title}`,
    `目标角色：${getRole(subtask.roleId).name}`,
    `执行说明：${subtask.description}`,
    "",
    "请基于以上上下文开始处理，并在遇到阻塞时同步给相关角色。"
  ].join("\n");
}

function showSubtaskInstructionModal(taskId, subtaskId) {
  closeMenus();
  const { project, task, subtask } = getTaskAndSubtask(taskId, subtaskId);
  if (!project || !task || !subtask) {
    return;
  }

  const toRoleId = getRole(subtask.roleId).id;
  const defaultFromRoleId = toRoleId === "product-manager" ? "tech-lead" : "product-manager";
  const injectableWindows = getRunningAgentWindowsForRole(project, toRoleId, task.id);
  renderModal(`
    <div class="modal subtask-instruction-modal">
      <h2>发送给角色</h2>
      <p>把当前子任务上下文写入协作消息，角色终端可据此继续处理。</p>
      <div class="message-composer">
        <div class="field">
          <label for="instructionFromRole">发送角色</label>
          <select id="instructionFromRole">${renderRoleSelectOptions(defaultFromRoleId, toRoleId)}</select>
        </div>
        <div class="field">
          <label for="instructionToRole">接收角色</label>
          <select id="instructionToRole">${renderRoleSelectOptions(toRoleId, defaultFromRoleId)}</select>
        </div>
        <div class="field">
          <label>任务频道</label>
          <input value="${escapeHtml(task.title)}" disabled>
        </div>
        <div class="field message-content-field">
          <label for="instructionContent">指令内容</label>
          <textarea id="instructionContent">${escapeHtml(buildSubtaskInstructionContent(task, subtask))}</textarea>
          <label class="checkbox-line">
            <input id="instructionInjectTerminal" type="checkbox" ${injectableWindows.length > 0 ? "checked" : "disabled"}>
            <span>${injectableWindows.length > 0 ? `同时注入 ${getRole(toRoleId).name} 的运行中 Agent 终端` : `未找到 ${getRole(toRoleId).name} 的运行中 Agent 终端`}</span>
          </label>
          <div id="instructionStatus" class="form-status muted">发送后会写入当前任务的协作时间线。</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">取消</button>
        <button class="primary-button" data-action="send-subtask-instruction" data-task-id="${escapeHtml(task.id)}" data-subtask-id="${escapeHtml(subtask.id)}">发送指令</button>
      </div>
    </div>
  `);
}

function setInstructionStatus(message, type = "error") {
  const status = document.getElementById("instructionStatus");
  if (!status) {
    return;
  }
  status.className = `form-status ${type}`;
  status.textContent = message;
}

async function sendSubtaskInstructionFromModal(taskId, subtaskId) {
  const { project, task, subtask } = getTaskAndSubtask(taskId, subtaskId);
  const fromRoleId = document.getElementById("instructionFromRole")?.value;
  const toRoleId = document.getElementById("instructionToRole")?.value;
  const content = document.getElementById("instructionContent")?.value.trim();
  const injectTerminal = document.getElementById("instructionInjectTerminal")?.checked;

  if (!project || !task || !subtask || !fromRoleId || !toRoleId || !content) {
    setInstructionStatus("请完整填写发送角色、接收角色和指令内容。");
    return;
  }
  if (fromRoleId === toRoleId) {
    setInstructionStatus("发送角色和接收角色不能相同。");
    return;
  }

  const message = appendProjectMessage(
    project,
    createMessage(fromRoleId, [toRoleId], content, task.id, {
      source: "task-instruction",
      channelType: "task"
    })
  );
  task.updatedAt = message.createdAt;
  messageComposerDefaults = { fromRoleId, toRoleId, taskId: task.id };
  messageTimelineFilters = { taskId: task.id, query: "" };
  saveState();
  recordAppLog("task.instruction.sent", {
    projectId: project.id,
    taskId: task.id,
    subtaskId: subtask.id,
    messageId: message.id,
    fromRoleId,
    toRoleIds: message.toRoleIds,
    source: message.source
  });
  let injectResult = { ok: false, queuedCount: 0, reason: "not-requested" };
  if (injectTerminal) {
    injectResult = await injectMessageIntoAgentTerminals(message.id, { limit: 1 });
  }
  render();
  showMessageCenterModal({ ...messageComposerDefaults, filterTaskId: task.id });
  const injectSuffix = injectTerminal
    ? (injectResult.ok ? `并已加入 ${injectResult.queuedCount} 个待确认投递。` : "但未找到可投递的运行中 Agent 终端。")
    : "";
  setMessageStatus(`任务指令已发送。${injectSuffix}`, injectTerminal && !injectResult.ok ? "warn" : "ready");
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
          <div class="role-meta">${role.category} · Agent 当前使用 ${state.settings.agentProvider === "codex" ? "Codex" : "Claude Code"}</div>
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
      <p>${type === "terminal" ? `终端会以角色身份运行，可选择普通 PowerShell 或 Agent。Agent 当前使用 ${state.settings.agentProvider === "codex" ? "Codex" : "Claude Code"}，可在系统设置中切换。` : "程序会以角色身份运行，后续任务分派和协作状态都绑定到这个角色。"}</p>
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

  window.cossAPI?.sendTerminalInput?.(pendingCommandApproval.windowId, "\r");
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
  window.cossAPI?.sendTerminalInput?.(pendingCommandApproval.windowId, "\u0015");
  view?.term?.writeln("");
  view?.term?.writeln("\x1b[33mCosS 已阻止该命令，未发送 Enter 执行。\x1b[0m");
  updateCommandLog(pendingCommandApproval.logId, "rejected");
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
    return `<div class="model-connectivity-status idle" ${attr}>尚未测试 ${normalized === "codex" ? "Codex" : "Claude Code"} 远程登录态。</div>`;
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
      <h2>v0.2 命令审计与环境</h2>
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
      <strong>v0.3 模型配置</strong>
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
        <span>当前 Agent 后端为 ${state.settings.agentProvider === "codex" ? "Codex" : "Claude Code"}。终端后端与环境检测请进入“智能体设置”。</span>
      </div>
      <button class="secondary-button" data-action="set-settings-section" data-section="agent">打开智能体</button>
    </div>
  `;
}

function renderAgentSettingsSection() {
  return `
    <div class="settings-row">
      <div>
        <strong>Agent 终端</strong>
        <span>选择创建角色 Agent 时默认使用的终端后端。</span>
      </div>
      <div class="agent-provider-switch">
        ${renderAgentProviderOption("claude", "Claude Code", "适合 Claude Code 交互式开发任务。")}
        ${renderAgentProviderOption("codex", "Codex", "适合 Codex CLI 代码代理任务。")}
      </div>
    </div>
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
        <strong>Agent 角色提示词模板</strong>
        <span>创建 Claude Code 或 Codex Agent 终端时，会把模板渲染后写入 COSS_ROLE_PROMPT，并同步会话与任务上下文。</span>
      </div>
      <button class="secondary-button" data-action="reset-agent-prompt-template">恢复默认</button>
    </div>
    <div class="settings-code-editor">
      <textarea data-agent-prompt-template spellcheck="false">${escapeHtml(state.settings.agentPromptTemplate || defaultState.settings.agentPromptTemplate)}</textarea>
      <div class="settings-code-help">
        支持占位符：{{roleName}}、{{roleDescription}}、{{projectName}}、{{workspace}}、{{agentProvider}}、{{sessionId}}、{{taskTitle}}、{{taskGoal}}、{{subtaskTitle}}、{{subtaskDescription}}。
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
  return `
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

function renderSettingsContent() {
  return {
    account: () => renderSettingsPlaceholder("账户管理", "账户登录、团队身份和同步能力将在后续版本接入。", ["本地模式继续可用", "后续支持团队空间和权限"]),
    system: renderSystemSettingsSection,
    agent: renderAgentSettingsSection,
    memory: () => renderSettingsPlaceholder("记忆", "这里将管理项目记忆、角色记忆和可清理的上下文缓存。", ["项目记忆开关", "角色长期记忆", "记忆导出与清理"]),
    model: renderModelSettingsSection,
    assistant: () => renderSettingsPlaceholder("助理设置", "这里将配置全局助理行为、默认语气和任务确认策略。", ["默认助理角色", "任务确认策略", "自动总结"]),
    personalization: () => renderSettingsPlaceholder("个性化", "这里将配置主题、字号、桌面背景和窗口偏好。", ["浅色/深色主题", "工作区背景", "窗口默认尺寸"]),
    data: () => renderSettingsPlaceholder("数据管理", "这里将管理本地工作区数据、备份、导入和导出。", ["状态文件位置", "备份与恢复", "清理缓存"]),
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

async function testAgentLogin(provider) {
  const normalized = normalizeAgentProvider(provider);
  agentLoginTestStatuses[normalized] = { state: "testing" };
  const mountId = normalized === "codex" ? "codexLoginTestMount" : "claudeLoginTestMount";
  const mount = document.getElementById(mountId);
  if (mount) {
    mount.innerHTML = renderAgentLoginTestStatus(normalized);
  }

  try {
    const result = await window.cossAPI.testAgentLogin(normalized);
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
}

function renderSidebar(project) {
  const projects = state.projects
    .map((item) => `
      <button class="project-item ${item.id === state.activeProjectId ? "active" : ""}" data-action="select-project" data-project-id="${item.id}">
        <span class="nav-icon">${icon("file")}</span>
        <span class="project-name">${escapeHtml(item.name)}</span>
        <span class="project-time">${nowTimeLabel()}</span>
      </button>
    `)
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
        ${projects || `<div class="project-item">暂无项目</div>`}
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

  return `
    <section class="workspace" data-active-desktop-id="${escapeHtml(activeDesktop?.id || "")}">
      <div class="workspace-topbar">
        <div class="project-heading">
          <h1 class="workspace-title">${project ? escapeHtml(project.name) : "未选择项目"}</h1>
          <div class="workspace-subtitle">${project ? `${escapeHtml(project.path)} · ${escapeHtml(activeDesktop?.name || "主桌面")} · ${activeProgramCount} 个程序 · ${desktopCount} 个桌面 · ${project.tasks.length} 个任务` : "创建项目后启动工作区"}</div>
        </div>
        <div class="workspace-actions">
          <button class="secondary-button" data-action="show-message-center">${icon("assistant")}消息中心</button>
          <button class="secondary-button task-view-toggle" data-action="show-task-view">${icon("layout")}任务视图</button>
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
      <button class="dock-button task-view-toggle" title="任务视图" data-action="show-task-view">${icon("layout")}</button>
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
      <div class="task-view-panel" role="dialog" aria-label="任务视图" data-no-focus="true">
        <div class="task-view-head">
          <div>
            <strong>任务视图</strong>
            <span>把不同任务分组放到独立桌面，切换时只显示当前桌面的程序。</span>
          </div>
          <button class="secondary-button compact" data-action="create-desktop">新建桌面</button>
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
            const previewWindows = windows.slice(0, 4);
            return `
              <button class="desktop-card ${desktop.id === activeDesktopId ? "active" : ""}" data-action="switch-desktop" data-desktop-id="${escapeHtml(desktop.id)}">
                <span class="desktop-card-title">${escapeHtml(desktop.name)}</span>
                <span class="desktop-card-meta">${windows.length} 个程序</span>
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
    task: renderTaskContent
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
      return `
        <div class="collab-overlay-item ${win.maximized ? "maximized" : ""}"
          data-window-id="${win.id}"
          style="${renderCollabOverlayStyle(win)}">
          <button class="collab-badge ${status}" title="协作状态：${getStatusLabel(status)}" data-action="toggle-popover" data-window-id="${win.id}">
            ${collaborators.length || statusSymbol(status)}
          </button>
          ${activePopoverWindowId === win.id ? renderCollabPopover(win, collaborators, status) : ""}
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
    agent: `Agent(${agentProvider === "codex" ? "Codex" : "Claude Code"})`,
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
          <button class="browser-tab ${tab.id === win.activeBrowserTabId ? "active" : ""}" data-action="browser-switch-tab" data-window-id="${escapeHtml(win.id)}" data-tab-id="${escapeHtml(tab.id)}">
            <span>${escapeHtml(tab.title || tab.url || "新标签")}</span>
          </button>
        `).join("")}
        <button class="icon-button" title="新标签" data-action="browser-new-tab" data-window-id="${escapeHtml(win.id)}">+</button>
        ${win.browserTabs.length > 1 ? `<button class="icon-button" title="关闭当前标签" data-action="browser-close-tab" data-window-id="${escapeHtml(win.id)}">×</button>` : ""}
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

function renderFileContent(win) {
  const role = getRole(win.roleId);
  const project = getProject();
  const fileList = Array.isArray(win.fileList) ? win.fileList : [];
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
        <textarea class="file-editor-textarea" data-file-editor="${escapeHtml(win.id)}" spellcheck="false" placeholder="打开或新建项目内文本文件。">${escapeHtml(win.fileDraft || "")}</textarea>
      </div>
    </div>
  `;
}

function renderTaskContent() {
  const project = getProject();
  const tasks = project?.tasks || [];
  if (tasks.length === 0) {
    return `<div class="browser-blank">暂无任务。右键桌面创建任务后会在这里显示拆解结果。</div>`;
  }

  const taskCards = tasks
    .flatMap((task) => task.subtasks.map((subtask) => ({ task, subtask })))
    .map(({ task, subtask }) => `
      <div class="task-card ${escapeHtml(normalizeSubtaskStatus(subtask.status))}">
        <div class="task-card-head">
          <div class="task-role">${escapeHtml(getRole(subtask.roleId).name)} · ${escapeHtml(task.title)} · ${escapeHtml(task.model?.modelName || "agent-brain")}</div>
          ${renderSubtaskStatusChip(subtask.status)}
        </div>
        <div class="task-title">${escapeHtml(subtask.title)}</div>
        <div class="task-desc">${escapeHtml(subtask.description)}</div>
        <div class="task-desc">规划来源：${escapeHtml(task.planner?.status === "success" ? "LLM Gateway" : "本地降级")}</div>
        ${renderSubtaskActions(task.id, subtask)}
      </div>
    `)
    .join("");

  return `${taskCards}${renderRecentAgentEvents(project)}`;
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
  const button = (label, nextStatus, kind = "secondary") => (
    `<button class="${kind}-button compact" data-action="set-subtask-status" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}" data-status="${escapeHtml(nextStatus)}">${escapeHtml(label)}</button>`
  );
  const instructionButton = `<button class="secondary-button compact" data-action="show-subtask-instruction" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}">发送给角色</button>`;
  const url = getSubtaskTaskUrl(task, subtask);
  const taskUrlButton = url
    ? `<button class="secondary-button compact" data-action="open-task-url" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}">打开任务 URL</button>`
    : "";
  const actions = {
    pending: [button("开始执行", "running", "primary")],
    running: [button("标记完成", "done", "primary"), button("标记阻塞", "blocked")],
    blocked: [button("继续执行", "running", "primary"), button("标记完成", "done")],
    done: [button("重新打开", "pending")]
  }[status] || [];
  return `<div class="task-actions">${[...actions, instructionButton, taskUrlButton].join("")}</div>`;
}

function renderCollabPopover(win, collaborators, status) {
  const names = collaborators.map((role) => role.name).join("、") || "暂无协作对象";
  const messages = (getProject()?.messages || [])
    .filter((message) => message.fromRoleId === win.roleId || message.toRoleIds.includes(win.roleId))
    .slice(-3)
    .map((message) => `<div>${escapeHtml(getRole(message.fromRoleId).name)}：${escapeHtml(message.content)}</div>`)
    .join("");

  return `
    <div class="collab-popover">
      <strong>${escapeHtml(getStatusLabel(status))}</strong>
      <div>协作对象：${escapeHtml(names)}</div>
      ${messages || "<div>还没有消息。</div>"}
      <button class="secondary-button compact" data-action="show-message-center" data-role-id="${escapeHtml(win.roleId)}">发送消息</button>
    </div>
  `;
}

function renderContextMenu() {
  return `
    <div class="context-menu" style="left:${contextMenu.x}px; top:${contextMenu.y}px;">
      <button data-action="role-menu" data-type="terminal">${icon("terminal")}新建终端</button>
      <button data-action="role-menu" data-type="browser">${icon("globe")}新建浏览器</button>
      <button data-action="role-menu" data-type="file">${icon("file")}新建文件</button>
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

function closeBrowserTab(windowId) {
  const win = getWindowState(windowId);
  if (!win) {
    return;
  }
  ensureBrowserWindowShape(win);
  if (win.browserTabs.length <= 1) {
    return;
  }
  const closingTabId = win.activeBrowserTabId;
  const closingIndex = win.browserTabs.findIndex((tab) => tab.id === closingTabId);
  win.browserTabs = win.browserTabs.filter((tab) => tab.id !== closingTabId);
  win.activeBrowserTabId = win.browserTabs[Math.max(0, closingIndex - 1)]?.id || win.browserTabs[0].id;
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

function openPopupUrlInsideCosSBrowser(url, sourceWindowId = "") {
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
  navigateBrowserWindow(targetWindow.id, url);
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
    window.cossAPI?.disposeTerminal?.(windowId);
  }
}

function disposeTerminalsOutsideActiveWorkspace(activeIds) {
  for (const windowId of Array.from(terminalViews.keys())) {
    if (!activeIds.has(windowId)) {
      cleanupTerminalView(windowId, false);
    }
  }

  for (const windowId of Array.from(terminalBackendIds)) {
    if (!activeIds.has(windowId)) {
      cleanupTerminalView(windowId, true);
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

    cleanupTerminalView(win.id, false);
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
        term.write(data);
        recordTerminalOutputReference(win.id, data);
      }
    });
    const unsubscribeExit = window.cossAPI.onTerminalExit(({ id, exitCode }) => {
      if (id === win.id) {
        term.writeln("");
        term.writeln(`\x1b[33m进程已退出，代码 ${exitCode ?? "unknown"}。关闭并重新创建终端可启动新会话。\x1b[0m`);
        terminalBackendIds.delete(win.id);
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
      resizeObserver
    });

    requestAnimationFrame(() => {
      fit();
      if (focusedWindowId === win.id) {
        term.focus();
      }
    });

    if (!terminalBackendIds.has(win.id)) {
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
          cols: term.cols,
          rows: term.rows
        })
        .then((result) => {
          if (win.agentSession && result?.agentSession) {
            win.agentSession = {
              ...win.agentSession,
              ...result.agentSession,
              lastStartedAt: new Date().toISOString(),
              resumeCount: Number(win.agentSession.resumeCount || 0) + 1,
              lastActiveMode: result.activeMode || ""
            };
            saveState();
          }
        })
        .catch((error) => {
          terminalBackendIds.delete(win.id);
          term.writeln(`\x1b[31m终端启动失败：${error.message}\x1b[0m`);
        });
    }
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
    task: { width: 360, height: 260 }
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
    const shouldRefreshFloatingUi = Boolean(contextMenu || roleMenu || activePopoverWindowId || openAppMenuId || taskViewOpen);
    closeMenus();
    activePopoverWindowId = null;
    if (!clickTarget?.closest(".task-view-panel")) {
      taskViewOpen = false;
    }
    if (shouldRefreshFloatingUi || (!clickTarget?.closest(".program-window") && !clickTarget?.closest(".modal-backdrop"))) {
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
    const shouldRefreshFloatingUi = Boolean(contextMenu || roleMenu || activePopoverWindowId || openAppMenuId || taskViewOpen);
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
    closeBrowserTab(target.dataset.windowId);
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

  if (action === "toggle-agent-fallback") {
    state.settings.agentFallbackToShell = state.settings.agentFallbackToShell === false;
    recordAppLog("settings.agent-fallback.changed", {
      enabled: state.settings.agentFallbackToShell !== false
    });
    saveState();
    showSettingsModal();
    return;
  }

  if (action === "reset-agent-prompt-template") {
    state.settings.agentPromptTemplate = defaultState.settings.agentPromptTemplate;
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

  if (action === "test-agent-login") {
    testAgentLogin(target.dataset.provider);
    return;
  }

  if (action === "create-task") {
    createTaskFromModal();
    return;
  }

  if (action === "send-role-message") {
    sendRoleMessageFromModal();
    return;
  }

  if (action === "show-subtask-instruction") {
    showSubtaskInstructionModal(target.dataset.taskId, target.dataset.subtaskId);
    return;
  }

  if (action === "open-task-url") {
    openTaskUrlForSubtask(target.dataset.taskId, target.dataset.subtaskId);
    return;
  }

  if (action === "send-subtask-instruction") {
    sendSubtaskInstructionFromModal(target.dataset.taskId, target.dataset.subtaskId);
    return;
  }

  if (action === "inject-message-terminal") {
    injectMessageIntoAgentTerminals(target.dataset.messageId).then((result) => {
      showMessageCenterModal(messageComposerDefaults);
      setMessageStatus(
        result.ok ? `已加入 ${result.queuedCount} 个待确认投递。` : "未找到可投递的运行中 Agent 终端。",
        result.ok ? "ready" : "warn"
      );
    });
    return;
  }

  if (action === "confirm-agent-delivery") {
    confirmAgentDelivery(target.dataset.deliveryId).then(() => showMessageCenterModal(messageComposerDefaults));
    return;
  }

  if (action === "cancel-agent-delivery") {
    cancelAgentDelivery(target.dataset.deliveryId);
    showMessageCenterModal(messageComposerDefaults);
    return;
  }

  if (action === "retry-agent-delivery") {
    retryAgentDelivery(target.dataset.deliveryId);
    showMessageCenterModal(messageComposerDefaults);
    return;
  }

  if (action === "show-terminal-output-refs") {
    showTerminalOutputRefsModal(target.dataset.messageId);
    return;
  }

  if (action === "focus-terminal-ref-window") {
    closeModal();
    focusWindow(target.dataset.windowId);
    return;
  }

  if (action === "confirm-task-plan") {
    confirmTaskPlan();
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

  const agentPromptTemplate = event.target instanceof Element ? event.target.closest("[data-agent-prompt-template]") : null;
  if (agentPromptTemplate) {
    state.settings.agentPromptTemplate = agentPromptTemplate.value;
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
    }
  }
});

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
  if (state.activeProjectId) {
    bootWorkspace(state.activeProjectId);
  }
});
