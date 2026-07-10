const {
  ROLE_TEMPLATES,
  SYSTEM_ROLE,
  ORCHESTRATOR_PROTOCOL_VERSION,
  ORCHESTRATOR_TRANSPORT_SENDER_ID,
  ROLE_CAPABILITY_PROFILES,
  GLOBAL_ORCHESTRATOR_POLICY,
  PROGRAMS,
  DEFAULT_TASK_ROLE_IDS,
  PROJECT_MEMORY_VERSION,
  PROJECT_MEMORY_TASK_LIMIT,
  PROJECT_MEMORY_ITEM_LIMIT,
  MCP_TOOL_NAMES,
  MODEL_PROVIDER_PRESETS,
  AGENT_PERMISSION_POLICIES,
  SETTINGS_SECTIONS,
  LANGUAGE_OPTIONS,
  resources: I18N_RESOURCES,
  AGENT_POOL_CLEANUP_POLICY,
  SUBTASK_STATUS_DEFS,
  AGENT_RELAY_STAGES,
  KERNEL_PHASE_DEFS,
  COMMAND_RISK_RULES
} = window.COSS_CONFIG;

const defaultState = {
  activeProjectId: null,
  projects: [],
  activeWorldId: "",
  activeSidebarSection: "projects",
  worlds: [],
  deletedProjectIds: [],
  settings: {
    agentProvider: "claude",
    agentFallbackToShell: true,
    agentPermissionMode: "confirm",
    agentAutoWorkflowEnabled: true,
    agentAutoWorkflowPaused: false,
    agentMcpAutoConfigEnabled: false,
    codeBuddyApiKey: "",
    language: "zh-CN",
    userProfile: {
      displayName: "本地用户",
      avatarDataUrl: ""
    },
    agentPromptTemplate:
      "你是 CosS 工作区中的{{roleName}}。\n" +
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
      "CosS 使用任务调度器按步骤推进协作。你不能直接给其他角色分配任务，不能发明不存在的角色，也不能绕过共享任务板。\n" +
      "开始工作前优先读取任务板并领取当前步骤；长任务中保持进度更新；完成后必须提交结果。\n" +
      "只完成当前步骤。当前步骤完成后，系统会启动预先规划好的下一位协作者。",
    modelProvider: "system",
    modelConfigs: createDefaultModelConfigs()
  }
};

const APP_VERSION = "v0.11.0";
const appSessionId = `appsession-${Date.now()}-${Math.random().toString(16).slice(2)}`;

let state = structuredClone(defaultState);

function getAppLanguage() {
  const language = state?.settings?.language || defaultState.settings.language;
  return LANGUAGE_OPTIONS.some((item) => item.id === language) ? language : defaultState.settings.language;
}

function syncI18nLanguage(language = getAppLanguage()) {
  if (!window.i18next) {
    return;
  }
  if (!window.i18next.isInitialized) {
    window.i18next.init({
      lng: language,
      fallbackLng: defaultState.settings.language,
      resources: I18N_RESOURCES,
      returnEmptyString: false
    });
    return;
  }
  window.i18next.changeLanguage(language);
}

function interpolateText(template, values = {}) {
  return String(template || "").replace(/{{\s*(\w+)\s*}}/g, (_match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : ""
  ));
}

function t(key, fallback = key, values = {}) {
  if (window.i18next?.isInitialized) {
    return window.i18next.t(key, { defaultValue: fallback, ...values });
  }
  const template = I18N_RESOURCES[getAppLanguage()]?.translation?.[key]
    || I18N_RESOURCES[defaultState.settings.language]?.translation?.[key]
    || fallback;
  return interpolateText(template, values);
}

function getDefaultAgentPromptTemplate() {
  return t("agent.prompt.default.template", I18N_RESOURCES[defaultState.settings.language]?.translation?.["agent.prompt.default.template"] || "");
}

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
const DEFAULT_BROWSER_URL = "about:blank";
const PRODUCT_HELP_URL = "https://github.com/xiaolizi0v0/CosS";
const PRODUCT_DOCS_URL = "https://github.com/xiaolizi0v0/CosS/blob/main/docs/help.md";
const PRODUCT_PRIVACY_URL = "https://github.com/xiaolizi0v0/CosS/blob/main/docs/privacy.md";
const PRODUCT_LICENSE_URL = "https://github.com/xiaolizi0v0/CosS/blob/main/docs/license.md";
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
let sidebarCollapsed = false;
let sidebarWidth = 216;
let sidebarResizeState = null;
let sidebarCollapseTimer = null;
const SIDEBAR_MIN_WIDTH = 216;
const SIDEBAR_MAX_WIDTH = 360;
let pendingTaskPlanDraft = null;
let messageComposerDefaults = {};
let messageTimelineFilters = { taskId: "", query: "" };
let messageFlowSelection = { roleId: "", edgeKey: "" };
let selectedTimelineItemId = "";
let messageTimelineScrollLeft = 0;
let globalSearchQuery = "";
let agentBlueprintNodePositions = {};
let agentBlueprintDragState = null;
let agentBlueprintRouteCache = new Map();
let taskViewOpen = false;
let pendingFileOperation = null;
let taskRoleFilter = "";
let taskListFilters = { query: "", roleId: "", status: "", model: "", includeArchived: false };
let selectedTaskListTaskId = "";
let taskListScrollState = { windowContent: 0, items: 0, detail: 0 };

const appRoot = document.getElementById("app");
const agentPoolCleanupTimers = new Map();

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

const WORLD_MAP_DEFAULT = { key: "default-meadow", width: 64, height: 64, tileSize: 32 };
const WORLD_AGENT_POSITIONS = [
  { x: 12, y: 15 }, { x: 25, y: 20 }, { x: 40, y: 15 },
  { x: 15, y: 30 }, { x: 32, y: 32 }, { x: 50, y: 28 },
  { x: 20, y: 45 }, { x: 35, y: 48 }, { x: 48, y: 45 },
  { x: 28, y: 38 }
];
const WORLD_DEFAULT_OBJECTS = [
  { id: "announcement-board", type: "board", name: "公告栏", x: 30, y: 29, width: 3, height: 2, action: "publish-world-task" },
  { id: "chat-square", type: "building", name: "群聊屋", x: 20, y: 18, width: 4, height: 3, action: "open-world-chat" },
  { id: "spawn-plaza", type: "plot", name: "角色创建点", x: 42, y: 26, width: 5, height: 4, action: "create-world-agent" }
];
const WORLD_AGENT_STATUSES = new Set(["idle", "planning", "running", "waiting", "done", "blocked", "failed"]);

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
    const isLegacySystemDefault = id === "system"
      && (current.baseUrl === "http://10.21.1.45:22845/v1" || current.modelName === "agent-brain");
    settings.modelConfigs[id] = {
      baseUrl: preset.locked ? preset.baseUrl : (isLegacySystemDefault ? preset.baseUrl : (current.baseUrl || preset.baseUrl)),
      modelName: preset.locked ? preset.modelName : (isLegacySystemDefault ? preset.modelName : (current.modelName || preset.modelName)),
      apiKey: preset.locked || isLegacySystemDefault ? "" : (current.apiKey || "")
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

function getModelDisplayName(config) {
  return config?.modelName || (config?.id === "system" ? t("model.displayName.empty", "未填写模型名称") : "");
}

function getModelEndpointDisplay(config) {
  return config?.baseUrl || (config?.id === "system" ? t("model.baseUrl.empty", "未填写 Base URL") : "");
}

function getModelCredentialDisplay(config) {
  if (config?.apiKeyRequired) {
    return t("model.apiKey.status", "API key {{status}}", { status: config.apiKey ? t("model.apiKey.statusFilled", "已填写") : t("model.apiKey.statusEmpty", "未填写") });
  }
  return config?.apiKey ? t("model.apiKey.filled", "API key 已填写") : t("model.apiKey.empty", "API key 可选");
}

function canUseModelProvider(provider) {
  const config = getModelConfig(provider);
  const hasRequiredEndpoint = Boolean(String(config.baseUrl || "").trim() && String(config.modelName || "").trim());
  return hasRequiredEndpoint && (!config.apiKeyRequired || Boolean(config.apiKey));
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
    return t("model.secret.empty", "未填写");
  }
  return value.length <= 6 ? t("model.secret.masked", "已填写") : `${value.slice(0, 3)}...${value.slice(-3)}`;
}

function getRole(roleId) {
  if (roleId === SYSTEM_ROLE.id) {
    return SYSTEM_ROLE;
  }
  return ROLE_TEMPLATES.find((role) => role.id === roleId) || ROLE_TEMPLATES[0];
}

function trRoleName(role) {
  return role ? t(`role.${role.id}.name`, role.name) : "";
}
function trRoleCategory(role) {
  return role ? t(`role.${role.id}.category`, role.category) : "";
}
function trRoleDescription(role) {
  return role ? t(`role.${role.id}.description`, role.description) : "";
}
function getRoleName(roleId) {
  const role = getRole(roleId);
  return role ? trRoleName(role) : String(roleId || "");
}
function getRoleCategoryLabel(roleId) {
  const role = getRole(roleId);
  return role ? trRoleCategory(role) : "";
}

function getProject() {
  return state.projects.find((project) => project.id === state.activeProjectId) || null;
}

const TASK_LAYOUT_PRESETS = [
  { id: "split-two", label: t("layout.split-two", "两列") },
  { id: "main-narrow", label: t("layout.main-narrow", "主列加窄列") },
  { id: "main-stack", label: t("layout.main-stack", "主列加上下分割") },
  { id: "four-grid", label: t("layout.four-grid", "四宫格") },
  { id: "three-columns", label: t("layout.three-columns", "三列") },
  { id: "center-focus", label: t("layout.center-focus", "中间主列") }
];

function normalizeLayoutPreset(value) {
  return TASK_LAYOUT_PRESETS.some((preset) => preset.id === value) ? value : "split-two";
}

function createDesktopState(name, options = {}) {
  const desktopName = name || t("desktop.defaultName", "主对话");
  const taskIds = uniqueStrings([...(options.taskIds || []), options.taskId || ""]);
  return {
    id: options.id || uid("desktop"),
    name: desktopName,
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
      createDesktopState(t("desktop.defaultName", "主对话"), {
        id: DEFAULT_DESKTOP_ID,
        createdAt: project.createdAt || new Date().toISOString()
      })
    ];
  }

  project.desktops = project.desktops.map((desktop, index) => ({
    id: desktop.id || (index === 0 ? DEFAULT_DESKTOP_ID : uid("desktop")),
    name: desktop.name || (index === 0 ? t("desktop.defaultName", "主对话") : t("desktop.conversationIndex", "对话 {{index}}", { index: index + 1 })),
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
  const modelName = String(task?.model?.modelName || task?.model?.provider || "");
  return modelName === "agent-brain" || modelName === "system" || !modelName ? t("model.userCustom", "用户自定义模型") : modelName;
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
      ...getTaskSubtaskPairs(task).flatMap(({ subtask }) => [getRoleName(subtask.roleId), subtask.title, subtask.description])
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
      title: step.title || subtask.title || t("common.step", "步骤 {{index}}", { index: index + 1 }),
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
      title: subtask.title || current.title || t("common.step", "步骤 {{index}}", { index: index + 1 }),
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
        t("policy.rule.noDirectAssign", "不允许 Agent 直接给其他 Agent 分配任务"),
        t("policy.rule.sharedTaskBoard", "所有结果必须写回共享任务板"),
        t("policy.rule.confirmHighRisk", "中高风险动作必须等待用户或调度器确认"),
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
      name: getRoleName(roleId)
    })),
    subtasks: subtasks.slice(0, 12).map((subtask) => ({
      id: subtask.id || "",
      roleId: subtask.roleId || "",
      roleName: getRoleName(subtask.roleId),
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
        roleName: artifact.roleId ? getRoleName(artifact.roleId) : "",
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
        roleName: decision.roleId ? getRoleName(decision.roleId) : "",
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
  return body || t("memory.empty", "暂无项目记忆。点击“刷新记忆”会根据当前项目任务、产物和决策生成摘要。");
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
  return getRoleName(roleId) || roleId;
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
  nextState.worlds = (Array.isArray(nextState.worlds) ? nextState.worlds : []).map(ensureWorldShape);
  nextState.activeWorldId = typeof nextState.activeWorldId === "string" ? nextState.activeWorldId : "";
  nextState.activeSidebarSection = (nextState.activeSidebarSection === "worlds" || nextState.activeSidebarSection === "projects") ? nextState.activeSidebarSection : "projects";
  nextState.deletedProjectIds = uniqueStrings(nextState.deletedProjectIds || []);
  nextState.settings ||= {};
  nextState.settings.agentProvider = normalizeAgentProvider(nextState.settings.agentProvider);
  nextState.settings.agentFallbackToShell = nextState.settings.agentFallbackToShell !== false;
  nextState.settings.agentPermissionMode = normalizeAgentPermissionMode(nextState.settings.agentPermissionMode);
  nextState.settings.agentAutoWorkflowEnabled = nextState.settings.agentAutoWorkflowEnabled !== false;
  nextState.settings.agentAutoWorkflowPaused = nextState.settings.agentAutoWorkflowPaused === true;
  nextState.settings.agentMcpAutoConfigEnabled = nextState.settings.agentMcpAutoConfigEnabled === true;
  if (!nextState.settings.agentAutoWorkflowEnabled) {
    nextState.settings.agentAutoWorkflowPaused = false;
  }
  nextState.settings.codeBuddyApiKey ||= "";
  nextState.settings.language = LANGUAGE_OPTIONS.some((item) => item.id === nextState.settings.language) ? nextState.settings.language : "zh-CN";
  nextState.settings.userProfile = {
    displayName: String(nextState.settings.userProfile?.displayName || t("account.defaultName", "本地用户")).trim().slice(0, 32) || t("account.defaultName", "本地用户"),
    avatarDataUrl: String(nextState.settings.userProfile?.avatarDataUrl || "")
  };
  nextState.settings.agentPromptTemplate = ensureAgentPromptMcpInstructions(
    ensureAgentPromptPermissionPlaceholders(nextState.settings.agentPromptTemplate || getDefaultAgentPromptTemplate())
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
      get label() { return t("risk.command.empty.label", "空命令"); },
      get description() { return t("risk.command.empty.description", "未输入可执行命令。"); }
    };
  }

  const matches = COMMAND_RISK_RULES.filter((rule) => rule.pattern.test(trimmed));
  if (matches.length === 0) {
    return {
      requiresApproval: false,
      severity: "low",
      get label() { return t("risk.command.normal.label", "普通命令"); },
      get description() { return t("risk.command.normal.description", "未命中当前高风险规则。"); }
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
  const program = PROGRAMS[programType];
  if (!program) {
    return t("program.default", "程序");
  }
  return t(`program.${programType}`, program.label);
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
      stored.worlds = Array.isArray(stored.worlds) ? stored.worlds : [];
      state = stored;
      refreshStateStorageStamp().catch((error) => {
        recordAppLog("state.storage-stamp.refresh.error", { error: error.message }, "warn");
      });
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
    activeWorldId: "",
    activeSidebarSection: "projects",
    worlds: [],
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
  const source = String(template || getDefaultAgentPromptTemplate());
  if (source.includes("{{agentPermissionInstructions}}")) {
    return source;
  }
  return `${source.trim()}\n\nAgent 权限模式：{{agentPermissionLabel}}\n{{agentPermissionInstructions}}`;
}

function ensureAgentPromptMcpInstructions(template) {
  const source = String(template || getDefaultAgentPromptTemplate())
    .replace(/\n*当系统提示 `mcp__coss: Still connecting; call WaitForMcpServers to wait for it` 时，必须先调用 WaitForMcpServers 等待 mcp__coss 连接完成。/g, "")
    .replace(/\n*If the agent runtime says `mcp__coss: Still connecting; call WaitForMcpServers to wait for it`, call WaitForMcpServers first and wait for mcp__coss to become ready\./g, "")
    .trim();
  const waitInstructions =
    t("agent.prompt.mcpRetry.notice", "\n\n当系统提示 `mcp__coss: Still connecting` 时，请等待几秒后重新搜索或直接重试 coss 工具；只有当前 Agent 后端明确提供等待工具时才调用该工具。") +
    t("agent.prompt.mcpRetry.retry", "\n不要因为 ToolSearch 暂时找不到 coss_get_context、coss_list_roles 或 coss_pool_read 就停止工作；至少等待并重试 3 次。无法继续时输出 COSS_AGENT_STATUS:running 并说明原因，完成时输出 COSS_AGENT_STATUS:done。");
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
    promptTemplateVersion: "v0.11.0",
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
    t("kernel.dispatch.title", "CosS Kernel 调度任务板：{{title}}", { title: task.title || task.goal }),
    t("kernel.dispatch.taskId", "任务ID：{{taskId}}", { taskId: task.id }),
    t("kernel.dispatch.stepId", "步骤ID：{{stepId}}", { stepId: step.id }),
    t("kernel.dispatch.targetRole", "目标角色：{{name}} ({{id}})", { name: role.name, id: role.id }),
    t("kernel.dispatch.stepTitle", "步骤标题：{{title}}", { title: step.title }),
    t("kernel.dispatch.stepDesc", "步骤说明：{{description}}", { description: step.description }),
    "",
    t("kernel.dispatch.rules.title", "中央线性调度规则："),
    t("kernel.dispatch.rule1", "1. 不要直接把任务分配给其他 Agent，不要自行创建不存在的角色。"),
    t("kernel.dispatch.rule2", "2. 只能使用 coss_get_task_board、coss_pool_claim、coss_claim_step、coss_heartbeat_step、coss_get_kernel_events、coss_submit_result、coss_acquire_lock、coss_release_lock、coss_request_approval 等 CosS MCP 工具回写结果。"),
    t("kernel.dispatch.rule3", "3. 只处理当前 Step；完成后调用 coss_submit_result({ status: \"done\" })，Kernel 会自动启动预先规划好的下一步。"),
    t("kernel.dispatch.rule4", "4. 高风险动作、发出邮件、删除文件、支付、系统设置修改等必须走 coss_request_approval 或等待用户确认。"),
    t("kernel.dispatch.rule5", "5. 输出必须结构化；不要只在终端自然语言回复。"),
    "",
    t("kernel.dispatch.allowedCapabilities", "允许能力：{{capabilities}}", { capabilities: step.allowedCapabilities.join(", ") || "none" })
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

  // 先落盘任务板，再写 Agent 消息池；启动恢复必须尽快对外可见。
  await saveState();
  await persistAgentPoolMessages(project, createdMessages, reason);
  recordAppLog("kernel.dispatch.repaired", {
    projectId: project.id,
    reason,
    messageIds: createdMessages.map((message) => message.id),
    count: createdMessages.length
  }, "warn");
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
    .map((item) => getRoleName(item))
    .join("、") || t("planning.downstreamFallback", "下游角色");
  return [
    t("kernel.dispatch.taskId", "任务ID：{{taskId}}", { taskId: task.id }),
    t("planning.goal", "任务目标：{{goal}}", { goal: task.goal || task.title }),
    t("planning.currentStep", "{{role}} 当前步骤：{{step}}", { role: role.name, step: subtask?.title || t("planning.defaultStepTitle", "请先梳理需求、验收标准和协作边界。") }),
    t("planning.executionDesc", "执行说明：{{description}}", { description: subtask?.description || t("planning.defaultExecDesc", "请先输出 PRD、字段约束、验收标准、角色分工和需要下游角色确认的问题。") }),
    t("planning.downstreamRoles", "后续预规划角色：{{roles}}", { roles: downstreamRoleNames }),
    "",
    t("planning.startAsRole", "请先作为 {{role}} Agent 开始工作，不要直接跳过到下游实现角色。", { role: role.name }),
    t("planning.preferMcp", "请优先使用 CosS MCP 工具调用 CosS，而不是只在终端自然语言回复。"),
    t("planning.schedulerRule", "CosS 使用任务调度器按步骤推进协作，Agent 不能直接给其他 Agent 分配任务。"),
    t("planning.requiredTools", "必须优先尝试工具：coss_get_context、coss_get_task_board、coss_list_roles、coss_pool_read、coss_pool_claim、coss_claim_step、coss_heartbeat_step、coss_get_kernel_events、coss_submit_result。"),
    t("planning.beforeWork", "开始工作前，请读取共享任务板和自己的角色消息池，开始当前步骤；处理过程中及时提交进度和结果。"),
    t("planning.mcpRetry", "如果看到系统提示 `mcp__coss: Still connecting`，请等待 5-10 秒后用 ToolSearch queries: coss、mcp、inbox 重试，或直接重试 mcp__coss__coss_get_context。"),
    t("planning.toolSearchRetry", "不要因为 ToolSearch 暂时找不到 coss_get_context、coss_list_roles、coss_pool_read 等工具就停止；至少等待并重试 3 次。"),
    t("planning.recommendedOrder", "推荐顺序：coss_get_context -> coss_get_task_board -> coss_pool_read -> coss_pool_claim -> coss_claim_step -> coss_heartbeat_step -> coss_submit_result。"),
    t("planning.completeRole", "完成 {{role}} 阶段后，请写清楚结果、产物、风险和交付说明；是否启动 {{downstream}} 由系统根据预规划步骤决定。", { role: role.name, downstream: downstreamRoleNames })
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
    setProjectModalStatus(t("project.create.status.pickerUnavailable", "当前运行环境无法打开文件夹选择器。"));
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = t("project.create.status.choosing", "选择中...");
  }

  try {
    const result = await window.cossAPI.selectProjectDirectory(input.value.trim());
    if (result?.ok && result.path) {
      input.value = result.path;
      setProjectModalStatus(t("project.create.status.pathSelected", "已选择项目保存路径。"), "ready");
    } else if (result?.canceled) {
      setProjectModalStatus(t("project.create.status.chooseCanceled", "已取消选择文件夹。"), "muted");
    } else {
      setProjectModalStatus(result?.error || t("project.create.status.pathFailed", "未能选择项目保存路径。"));
    }
  } catch (error) {
    setProjectModalStatus(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = t("project.create.chooseFolder", "选择文件夹");
    }
  }
}

function createProjectFromModal() {
  const name = document.getElementById("projectName")?.value.trim();
  const projectPath = document.getElementById("projectPath")?.value.trim();
  if (!name) {
    setProjectModalStatus(t("project.create.validation.nameRequired", "请填写项目名称。"));
    return;
  }

  if (!projectPath) {
    setProjectModalStatus(t("project.create.validation.pathRequired", "请先指定项目保存路径。"));
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
      <h2>${escapeHtml(t("project.delete.title", "删除项目"))}</h2>
      <p>${escapeHtml(t("project.delete.desc", "这会从 CosS 项目列表中移除该项目，项目文件夹不会被删除。"))}</p>
      <div class="message-empty">
        <strong>${escapeHtml(project.name)}</strong>
        <p>${escapeHtml(project.path || "")}</p>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.cancel", "取消"))}</button>
        <button class="secondary-button danger" data-action="confirm-delete-project" data-project-id="${escapeHtml(project.id)}">${escapeHtml(t("project.delete.confirm", "删除项目"))}</button>
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
    title: t("taskList.title", "{{name}}任务列表", { name: activeConversation?.name || t("taskList.currentConversation", "当前对话") })
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

  const desktop = createDesktopState(name || t("desktop.conversationIndex", "对话 {{index}}", { index: getProjectDesktops(project).length + 1 }));
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
    summary: t("task.plan.fallback.summary", "使用本地规则生成任务步骤。"),
    error,
    neededAgentRoleIds: ["product-manager", "tech-lead"],
    firstRoundRoleIds: ["product-manager"],
    subtasks: [
      {
        id: "step-1",
        roleId: "product-manager",
        title: t("task.plan.fallback.step1.title", "确认需求和验收标准"),
        description: t("task.plan.fallback.step1.description", "先把用户目标整理成可执行需求、边界和验收标准。"),
        dependsOn: [],
        status: "idle",
        riskLevel: "low",
        order: 1,
        isEntryStep: true
      },
      {
        id: "step-2",
        roleId: "tech-lead",
        title: t("task.plan.fallback.step2.title", "制定技术方案和执行边界"),
        description: t("task.plan.fallback.step2.description", "基于需求文档制定实现方案、影响范围和交付顺序。"),
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
    return { ok: false, error: t("task.plan.error.serviceUnavailable", "当前运行环境未提供任务规划服务。") };
  }
  if (!String(activeModel.baseUrl || "").trim() || !String(activeModel.modelName || "").trim()) {
    return { ok: false, error: t("task.plan.error.modelConfigRequired", "请先在模型设置中填写用户自定义模型的 Base URL 和模型名称。") };
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
    submitButton.textContent = t("task.create.generating", "正在生成计划...");
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
    title: String(subtask.title || t("task.subtask.defaultTitle", "子任务 {{index}}", { index: index + 1 })).trim() || t("task.subtask.defaultTitle", "子任务 {{index}}", { index: index + 1 }),
    description: String(subtask.description || t("task.subtask.defaultDescription", "请根据任务目标补充执行步骤。")).trim() || t("task.subtask.defaultDescription", "请根据任务目标补充执行步骤。"),
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
      error: llmResult?.ok ? "" : (llmResult?.error || t("task.plan.error.modelFailed", "模型规划失败。")),
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
  const taskDesktop = createDesktopState(task.title || t("desktop.taskDesktop", "任务桌面"), {
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
      t("subtask.statusUpdate", "{{role}} 将子任务「{{title}}」更新为：{{status}}。", { role: getRoleName(subtask.roleId), title: subtask.title, status: SUBTASK_STATUS_DEFS[status].label }),
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
    return `<span class="relay-stage-chip ${escapeHtml(getRelayStageClass(stage))}">${escapeHtml(getRoleName(roleId))} · ${escapeHtml(getRelayStageLabel(stage))}</span>`;
  });
  const sourceChip = message.fromRoleId && message.toRoleIds?.length
    ? `<span class="relay-stage-chip delegated">${escapeHtml(getRoleName(message.fromRoleId))} · ${escapeHtml(getRelayStageLabel("delegated"))}</span>`
    : "";
  return `<div class="relay-stage-list">${sourceChip}${targetChips.join("")}</div>`;
}

function getFlowRoleLabel(roleId) {
  return roleId === "human" ? t("role.human.label", "人工") : getRoleName(roleId);
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
      activeDelivery.lastFeedback = t("delivery.feedback.waitingConfirm", "Agent 正在等待人工确认。");
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
      activeDelivery.lastFeedback = t("delivery.feedback.structuredEvent", "Agent 已产生结构化事件。");
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
    idle: t("status.idle", "空闲"),
    thinking: t("status.thinking", "分析"),
    working: t("status.working", "执行"),
    talking: t("status.talking", "协作"),
    waiting: t("status.waiting", "等待"),
    blocked: t("status.blocked", "阻塞"),
    done: t("status.done", "完成"),
    failed: t("status.failed", "失败")
  }[status] || t("status.idle", "空闲");
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
  const defaultPath = getProject()?.path || "";
  renderModal(`
    <div class="modal">
      <h2>${escapeHtml(t("project.create.title", "新建项目"))}</h2>
      <p>${escapeHtml(t("project.create.desc", "每个项目都会启动一个独立工作区，保存自己的程序、角色和任务状态。"))}</p>
      <div class="form-grid">
        <div class="field">
          <label for="projectName">${escapeHtml(t("project.create.name.label", "项目名称"))}</label>
          <input id="projectName" value="${escapeHtml(t("project.create.name.default", "新项目"))}" />
        </div>
        <div class="field">
          <label for="projectPath">${escapeHtml(t("project.create.path.label", "项目路径"))}</label>
          <div class="path-picker-row">
            <input id="projectPath" value="${escapeHtml(defaultPath)}" placeholder="${escapeHtml(t("project.create.path.placeholder", "请选择项目保存路径"))}" />
            <button class="secondary-button" data-action="choose-project-directory">${escapeHtml(t("project.create.chooseFolder", "选择文件夹"))}</button>
          </div>
          <div id="projectPathStatus" class="form-status muted">${escapeHtml(t("project.create.path.placeholder", "请选择项目保存路径"))}</div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.cancel", "取消"))}</button>
        <button class="primary-button" data-action="create-project">${escapeHtml(t("project.create.submit", "创建并打开"))}</button>
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
      <h2>${escapeHtml(t("task.create.title", "新建任务"))}</h2>
      <p>${escapeHtml(t("task.create.desc", "系统会先生成任务计划，确认后才会分派给角色。当前模型：{{model}}。", { model: `${activeModel.label} / ${getModelDisplayName(activeModel)}` }))}</p>
      <div class="field">
        <label for="taskGoal">${escapeHtml(t("task.create.goal.label", "任务目标"))}</label>
        <textarea id="taskGoal" placeholder="${escapeHtml(t("task.create.goal.placeholder", "请输入任务目标，例如：优化首页加载速度"))}"></textarea>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.cancel", "取消"))}</button>
        <button class="primary-button" data-action="create-task">${escapeHtml(t("task.create.generatePlan", "生成计划"))}</button>
      </div>
    </div>
  `);
}

function renderTaskPlanPreviewModal(draft) {
  const plan = draft.taskPlan;
  const sourceLabel = draft.llmResult?.ok ? t("task.plan.source.ai", "智能规划") : t("task.plan.source.local", "本地规则");
  const neededAgentRoleIds = uniqueRoleIds(plan.neededAgentRoleIds || []);
  const firstRoundRoleIds = getInitialCoordinatorRoleIds(plan, { subtasks: plan.subtasks || [] });
  const neededAgentLabel = neededAgentRoleIds.map((roleId) => getRoleName(roleId)).join("、");
  const firstRoundLabel = firstRoundRoleIds.map((roleId) => getRoleName(roleId)).join("、");
  renderModal(`
    <div class="modal task-plan-modal">
      <h2>${escapeHtml(t("task.plan.confirm.title", "确认任务计划"))}</h2>
      <p>${escapeHtml(t("task.plan.confirm.desc", "系统会按步骤执行任务。每一步完成后，再自动开始下一步。"))}</p>
      <div class="task-plan-summary">
        <strong>${escapeHtml(sourceLabel)} · ${escapeHtml(draft.activeModel.label)} / ${escapeHtml(getModelDisplayName(draft.activeModel))}</strong>
        <span>${escapeHtml(plan.summary || t("task.plan.summary.default", "模型已生成任务计划。"))}</span>
        <span>${escapeHtml(t("task.plan.neededAgents", "需要 Agent：{{agents}}", { agents: neededAgentLabel || t("task.plan.autoSelect", "系统自动选择") }))}</span>
        <span>${escapeHtml(t("task.plan.entryAgents", "入口 Agent：{{agents}}", { agents: firstRoundLabel || t("task.plan.autoSelect", "系统自动选择") }))}</span>
        ${draft.llmResult?.ok ? "" : `<em>${escapeHtml(draft.llmResult?.error || t("task.plan.fallbackNotice", "模型规划失败，已使用本地规则。"))}</em>`}
      </div>
      <div class="task-plan-list">
        ${plan.subtasks.map((subtask, index) => `
          <div class="task-plan-item editable" data-plan-index="${index}">
            <div class="task-plan-index">${index + 1}</div>
            <div>
              <div class="task-plan-edit-grid">
                <label>
                  <span>${escapeHtml(t("task.plan.role.label", "角色"))}</span>
                  <select data-plan-field="roleId" data-plan-index="${index}">
                    ${ROLE_TEMPLATES.map((role) => `<option value="${escapeHtml(role.id)}" ${role.id === subtask.roleId ? "selected" : ""}>${escapeHtml(role.name)}</option>`).join("")}
                  </select>
                </label>
                <label>
                  <span>${escapeHtml(t("task.plan.subtaskTitle.label", "子任务标题"))}</span>
                  <input value="${escapeHtml(subtask.title)}" data-plan-field="title" data-plan-index="${index}" />
                </label>
              </div>
              <label class="task-plan-description">
                <span>${escapeHtml(t("task.plan.subtaskDescription.label", "子任务描述"))}</span>
                <textarea data-plan-field="description" data-plan-index="${index}">${escapeHtml(subtask.description)}</textarea>
              </label>
              <div class="task-plan-dependency">
                ${escapeHtml(t("task.plan.dependency.label", "依赖：{{deps}}", { deps: subtask.dependsOn?.length ? subtask.dependsOn.join("、") : t("task.plan.dependency.firstStep", "第一步") }))}
              </div>
              <div class="task-plan-item-actions">
                <button class="secondary-button compact" data-action="delete-task-plan-subtask" data-plan-index="${index}" ${plan.subtasks.length <= 1 ? "disabled" : ""}>${escapeHtml(t("task.plan.deleteSubtask", "删除子任务"))}</button>
              </div>
            </div>
          </div>
        `).join("")}
      </div>
      <div class="task-plan-edit-actions">
        <button class="secondary-button" data-action="add-task-plan-subtask">${escapeHtml(t("task.plan.addSubtask", "新增子任务"))}</button>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="show-create-task">${escapeHtml(t("task.plan.back", "返回修改"))}</button>
        <button class="primary-button" data-action="confirm-task-plan">${escapeHtml(t("task.plan.confirmDispatch", "确认并分派"))}</button>
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
    title: t("taskList.untitledStep", "待命名步骤"),
    description: t("taskList.stepDesc", "请填写该步骤的执行说明。")
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
  return taskId ? t("taskList.taskId", "任务ID：{{taskId}}", { taskId }) : t("taskList.noTask", "未关联任务");
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
    return t("kernel.autoWorkflow.off", "未开启");
  }
  return state.settings.agentAutoWorkflowPaused ? t("kernel.autoWorkflow.paused", "已中止") : t("kernel.autoWorkflow.running", "运行中");
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
      title: `${getRoleName(roleId)} Agent(${getAgentProviderLabel(state.settings.agentProvider)})`
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
        delivery.lastFeedback = t("kernel.autoWorkflow.userPaused", "用户已暂停 Kernel 自动调度。");
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
  const taskLabel = message.taskId ? getMessageTaskLabel(message.taskId) : t("taskList.privateChat", "私聊");
  const agentProvider = normalizeAgentProvider(targetWindow.agentProvider || state.settings.agentProvider);
  const provider = getAgentProviderLabel(agentProvider);
  const permissionPolicy = getAgentPermissionPolicy();
  const poolPath = message.agentPoolPaths?.[targetWindow.roleId] || getAgentPoolMessagePath(targetWindow.roleId, message.id);
  const mcpRetryLines = agentProvider === "codebuddy"
    ? [
        t("delivery.prompt.mcpRetryCodebuddy1", "CodeBuddy Code 后端如果显示 `mcp__coss: Still connecting` 或 `/mcp` 中 coss 为 Disconnected，请等待 5-10 秒后用 ToolSearch queries: coss、mcp、inbox 重试；不要搜索或调用当前后端不存在的等待工具。"),
        t("delivery.prompt.mcpRetryCodebuddy2", "如果 coss 工具仍未暴露，请继续完成当前角色工作并输出 COSS_AGENT_EVENT:{\"status\":\"running\",\"message\":\"MCP disconnected; 当前进度说明\",\"toRoleIds\":[]} 作为降级留痕。")
      ]
    : [
        t("delivery.prompt.mcpRetryOther1", "如果系统提示 `mcp__coss: Still connecting`，请等待几秒后重新搜索或调用 coss 工具；只有当前后端明确提供等待工具时才调用该工具。"),
        t("delivery.prompt.mcpRetryOther2", "不要因为 ToolSearch 暂时没有找到 coss 工具就停止；请至少等待并重试 3 次。")
      ];
  const autoWorkflowLines = message.autoWorkflow || message.source === "agent-event"
    ? [
        t("delivery.prompt.autoWorkflow1", "这是 CosS Kernel 分配的上游任务上下文。"),
        t("delivery.prompt.autoWorkflow2", "请先阅读消息中提到的交接文档、产物路径或注意事项，再继续你的角色工作。"),
        t("delivery.prompt.autoWorkflow3", "完成自己的部分后，请通过 coss_submit_result({ status: \"done\" }) 提交结果，由 Kernel 启动下一步。")
      ]
    : [];
  return stripTerminalControlChars([
    t("delivery.prompt.title", "请处理来自 CosS 协作时间线的指令。"),
    t("delivery.prompt.targetRole", "目标角色：{{name}}", { name: toRole.name }),
    t("delivery.prompt.fromRole", "发送角色：{{name}}", { name: fromRole.name }),
    t("delivery.prompt.agentProvider", "Agent 后端：{{provider}}", { provider }),
    t("delivery.prompt.permissionMode", "Agent 权限模式：{{label}}", { label: permissionPolicy.label }),
    t("delivery.prompt.channel", "频道：{{label}}", { label: taskLabel }),
    t("delivery.prompt.messageId", "消息ID：{{id}}", { id: message.id }),
    t("delivery.prompt.poolPath", "角色消息池：{{path}}", { path: poolPath }),
    t("delivery.prompt.messageSource", "消息来源：{{source}}", { source: message.source || "manual" }),
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
    t("delivery.prompt.preferMcp", "必须优先使用 CosS MCP 工具调用 CosS，而不是只在终端自然语言回复。"),
    t("delivery.prompt.requiredTools", "请按需调用：coss_get_context、coss_get_task_board、coss_list_roles、coss_pool_read、coss_pool_claim、coss_claim_step、coss_heartbeat_step、coss_release_step、coss_get_kernel_events、coss_submit_result、coss_acquire_lock、coss_release_lock、coss_request_approval。"),
    ...mcpRetryLines,
    t("delivery.prompt.recommendedOrder", "推荐开始顺序：先 coss_get_context，再 coss_get_task_board，再 coss_pool_read，处理本条消息前调用 coss_pool_claim，开始执行子任务时调用 coss_claim_step。"),
    t("delivery.prompt.submitResult", "完成自己的 Step 时优先调用 coss_submit_result({ status: \"done\" })；不要直接发给其他角色，也不要创建未在任务板中的角色。"),
    t("delivery.prompt.fallbackEvent", "如果当前 Agent 后端暂时无法使用 MCP，再输出 COSS_AGENT_EVENT:{\"status\":\"running\",\"message\":\"你的结构化进度或无法继续的原因\",\"toRoleIds\":[]}。"),
    t("delivery.prompt.agentStates", "Agent 只能使用三种状态：COSS_AGENT_STATUS:running 或 COSS_AGENT_STATUS:done；默认未开始就是 idle。")
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
      t("delivery.file.title", "# CosS Agent 投递指令"),
      "",
      t("delivery.file.intro", "请把本文档作为本次投递的唯一新增任务上下文。不要把终端输入框中的提示、示例或残留文字当成用户指令。"),
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
  delivery.lastFeedback = t("delivery.feedback.submittedNoResponse", "已提交但尚未检测到 Agent 响应，可重试投递或查看终端。");
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
    pending: t("delivery.status.pending", "待调度"),
    sent: t("delivery.status.sent", "已提交"),
    submitted: t("delivery.status.submitted", "已提交"),
    responded: t("delivery.status.responded", "Agent 已响应"),
    waiting: t("delivery.status.waiting", "等待人工确认"),
    failed: t("delivery.status.failed", "调度失败"),
    canceled: t("delivery.status.canceled", "已取消")
  }[normalizeDeliveryStatus(status)] || status;
}

function getDeliveryMethodLabel(method) {
  return {
    "bracketed-paste": "Bracketed Paste",
    "delivery-file-interactive": t("delivery.method.delivery-file-interactive", "任务文件 + 交互提交")
  }[method] || method || t("delivery.status.notSent", "未提交");
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
    ? t("delivery.feedback.fileSubmitted", "指令文件已生成并提交给 CodeBuddy，等待 Agent 输出。")
    : t("delivery.feedback.terminalSubmitted", "指令已写入终端，等待 Agent 输出。");
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
      excerpt: t("delivery.feedback.dispatched", "CosS 已调度任务，等待终端输出。"),
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
    delivery.lastFeedback = t("delivery.feedback.waitingConfirm", "Agent 正在等待人工确认。");
  } else if (!isStartupOutputForExistingDelivery && !isDeliverySystemFeedback(excerpt) && !["responded", "waiting"].includes(delivery.status)) {
    delivery.status = "responded";
    delivery.respondedAt = now;
    delivery.stuckDetectedAt = "";
    if (deliveryStuckTimers.has(delivery.id)) {
      clearTimeout(deliveryStuckTimers.get(delivery.id));
      deliveryStuckTimers.delete(delivery.id);
    }
    delivery.lastFeedback = t("delivery.feedback.terminalOutput", "Agent 已产生终端输出。");
  } else if (isDeliveryInstructionEcho(excerpt)) {
    delivery.lastFeedback = "CodeBuddy delivery instruction entered; waiting for Agent output.";
  } else if (isPasteOnlyTerminalFeedback(excerpt)) {
    delivery.lastFeedback = t("delivery.feedback.pastedNoOutput", "终端已接收粘贴文本，尚未检测到 Agent 输出。");
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
          getRoleName(message.fromRoleId),
          ...message.toRoleIds.map((roleId) => getRoleName(roleId)),
          message.content,
          message.source,
          getMessageTaskLabel(message.taskId)
        ].join(" ").toLowerCase().includes(query);
      }
      const event = item.event;
      return [
        getRoleName(event.roleId),
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
      title: `Agent · ${getRoleName(event.roleId)}`,
      subtitle: `${event.status || event.type || "event"}${toolSuffix}`,
      summary: event.message || event.sessionId || t("delivery.event.default", "Agent 输出了状态事件。")
    };
  }

  const message = item.message;
  return {
    title: getRoleName(message.fromRoleId),
    subtitle: message.toRoleIds.map((roleId) => getRoleName(roleId)).join("、"),
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
      <div class="message-branch-targets" aria-label="${escapeHtml(t("nav.branchTargets", "分叉接收角色"))}">
        ${item.message.toRoleIds.map((roleId) => `<span>${escapeHtml(getRoleName(roleId))}</span>`).join("")}
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
    return `<div class="message-empty">${escapeHtml(t("nav.selectTimelineNode", "请选择时间轴节点查看详情。"))}</div>`;
  }

  if (item.kind === "agent-event") {
    const event = item.event;
    const toNames = event.toRoleIds.length > 0
      ? ` → ${event.toRoleIds.map((roleId) => getRoleName(roleId)).join("、")}`
      : "";
    return `
      <div class="message-row timeline-row agent-timeline-row ${escapeHtml(normalizeAgentEventStatus(event.status) || event.status || "running")}" data-agent-event-id="${escapeHtml(event.id)}">
        <div class="message-row-head">
          <strong>${escapeHtml(t("timeline.agentEvent", "Agent 事件"))} · ${escapeHtml(getRoleName(event.roleId))}${escapeHtml(toNames)}</strong>
          <span>${escapeHtml(formatDateTime(event.receivedAt))}</span>
        </div>
        <div class="message-meta">
          <span>${escapeHtml(event.taskId ? getMessageTaskLabel(event.taskId) : t("taskList.sessionEvent", "会话事件"))}</span>
          <span>${escapeHtml(event.status || "event")}</span>
          <span>${escapeHtml(event.structured ? "structured-event" : event.type || "status")}</span>
          ${event.toolName ? `<span>${escapeHtml(event.toolName)}</span>` : ""}
        </div>
        <p>${escapeHtml(event.message || event.sessionId || t("delivery.event.default", "Agent 输出了状态事件。"))}</p>
      </div>
    `;
  }

  const message = item.message;
  const fromRole = getRole(message.fromRoleId);
  const toNames = message.toRoleIds.map((roleId) => getRoleName(roleId)).join("、");
  const channelLabel = message.channelType === "task" ? getMessageTaskLabel(message.taskId) : t("taskList.privateChat", "私聊");
  const refs = getOutputRefsForMessage(project, message.id);
  const injectedLabel = message.injectedWindowIds?.length
    ? `<span>${escapeHtml(t("taskList.injected", "已注入 {{count}} 个终端", { count: message.injectedWindowIds.length }))}</span>`
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
        ${refs.length ? `<span>${escapeHtml(t("taskList.outputRefs", "{{count}} 条输出引用", { count: refs.length }))}</span>` : ""}
      </div>
      ${renderRelayStageChips(project, message)}
      <p>${escapeHtml(message.content)}</p>
      <div class="message-row-actions">
        ${refs.length ? `<button class="secondary-button compact" data-action="show-terminal-output-refs" data-message-id="${escapeHtml(message.id)}">${escapeHtml(t("taskList.viewOutput", "查看输出"))}</button>` : ""}
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
      <div class="message-empty">${escapeHtml(t("nav.noEvents", "暂无协作事件。发送一条消息，创建任务，或等待 Agent 输出结构化事件。"))}</div>
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
      <div class="message-timeline-scroll" aria-label="${escapeHtml(t("nav.timelineAria", "协作横向时间轴"))}">
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
        getRoleName(message.fromRoleId),
        ...(message.toRoleIds || []).map((roleId) => getRoleName(roleId)),
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
    : t("agent.flow.relatedMessages", "{{role}} 相关消息", { role: selectedRole.label });
  const hint = selectedEdge
    ? t("agent.flow.hint.edge", "点击边后显示该角色流向上的消息列表。")
    : t("agent.flow.hint.node", "点击节点后，时间线已筛选为该角色相关消息。");
  const messageRows = messages.length
    ? messages.slice(-8).reverse().map((message) => `
      <button class="agent-flow-message-item" data-action="select-message-timeline-node" data-timeline-item-id="message:${escapeHtml(message.id)}">
        <strong>${escapeHtml(getFlowRoleLabel(getFlowMessageFromId(message)))} -> ${escapeHtml(message.toRoleIds.map((roleId) => getRoleName(roleId)).join("、"))}</strong>
        <span>${escapeHtml(formatDateTime(message.createdAt))}</span>
        <p>${escapeHtml(message.content)}</p>
        <small>${escapeHtml(message.taskId ? getMessageTaskLabel(message.taskId) : t("taskList.privateChat", "私聊"))} · ${escapeHtml(message.source || "manual")}</small>
      </button>
    `).join("")
    : `<div class="agent-flow-empty">${escapeHtml(t("agent.flow.empty.noMessages", "当前筛选下暂无消息。"))}</div>`;

  return `
    <div class="agent-flow-selection">
      <div class="agent-flow-selection-head">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(hint)}</span>
        </div>
        <button class="secondary-button compact" data-action="clear-agent-flow-selection">${escapeHtml(t("agent.flow.clearFilter", "清除筛选"))}</button>
      </div>
      <div class="agent-flow-message-list">${messageRows}</div>
    </div>
  `;
}

function getAgentBlueprintPositionKey(projectId, roleId) {
  return `${projectId || "project"}:${roleId || "human"}`;
}

function getAgentBlueprintAutoLayout(graph) {
  const nodeIds = graph.nodes.map((node) => node.id);
  const outgoing = new Map(nodeIds.map((id) => [id, []]));
  const incoming = new Map(nodeIds.map((id) => [id, []]));
  graph.edges.forEach((edge) => {
    if (!outgoing.has(edge.fromId) || !incoming.has(edge.toId)) {
      return;
    }
    outgoing.get(edge.fromId).push(edge.toId);
    incoming.get(edge.toId).push(edge.fromId);
  });

  const inDegree = new Map(nodeIds.map((id) => [id, incoming.get(id).length]));
  const queue = nodeIds.filter((id) => inDegree.get(id) === 0);
  const ordered = [];
  while (queue.length > 0) {
    const id = queue.shift();
    ordered.push(id);
    outgoing.get(id).forEach((nextId) => {
      inDegree.set(nextId, inDegree.get(nextId) - 1);
      if (inDegree.get(nextId) === 0) {
        queue.push(nextId);
      }
    });
  }
  nodeIds.forEach((id) => {
    if (!ordered.includes(id)) {
      ordered.push(id);
    }
  });

  const layerById = new Map(nodeIds.map((id) => [id, 0]));
  ordered.forEach((id) => {
    outgoing.get(id).forEach((nextId) => {
      layerById.set(nextId, Math.max(layerById.get(nextId), layerById.get(id) + 1));
    });
  });

  let layers = [];
  nodeIds.forEach((id) => {
    const layer = layerById.get(id) || 0;
    layers[layer] ||= [];
    layers[layer].push(id);
  });
  layers = layers.filter(Boolean);
  const sortByBarycenter = (ids, neighborMap, neighborLayer) => ids
    .map((id, index) => {
      const neighbors = neighborMap.get(id) || [];
      const neighborPositions = neighbors
        .map((neighborId) => neighborLayer.indexOf(neighborId))
        .filter((position) => position >= 0);
      return {
        id,
        index,
        barycenter: neighborPositions.length
          ? neighborPositions.reduce((sum, position) => sum + position, 0) / neighborPositions.length
          : index
      };
    })
    .sort((a, b) => a.barycenter - b.barycenter || a.index - b.index)
    .map((item) => item.id);

  for (let pass = 0; pass < 4; pass += 1) {
    for (let layer = 1; layer < layers.length; layer += 1) {
      layers[layer] = sortByBarycenter(layers[layer], incoming, layers[layer - 1]);
    }
    for (let layer = layers.length - 2; layer >= 0; layer -= 1) {
      layers[layer] = sortByBarycenter(layers[layer], outgoing, layers[layer + 1]);
    }
  }

  const positions = new Map();
  layers.forEach((ids, layer) => {
    const columnY = 38 + Math.max(0, 3 - ids.length) * 44;
    ids.forEach((id, index) => {
      positions.set(id, {
        x: 44 + layer * 260,
        y: columnY + index * 124
      });
    });
  });
  return positions;
}

function getAgentBlueprintNodePosition(node) {
  return {
    x: Number.parseFloat(node.style.left) || 0,
    y: Number.parseFloat(node.style.top) || 0,
    width: node.offsetWidth || 164,
    height: node.offsetHeight || 78
  };
}

function deCasteljauPoint(p0, p1, p2, p3, t) {
  const lerp = (a, b) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const ab = lerp(p0, p1);
  const bc = lerp(p1, p2);
  const cd = lerp(p2, p3);
  const abbc = lerp(ab, bc);
  const bccd = lerp(bc, cd);
  return lerp(abbc, bccd);
}

function getCubicBlueprintSegment(points, index, tension = 0.92) {
  const previous = points[index - 1] || points[index];
  const current = points[index];
  const next = points[index + 1];
  const afterNext = points[index + 2] || next;
  const currentLength = Math.hypot(next.x - current.x, next.y - current.y);
  const previousLength = Math.hypot(current.x - previous.x, current.y - previous.y) || currentLength;
  const nextLength = Math.hypot(afterNext.x - next.x, afterNext.y - next.y) || currentLength;
  const handleA = Math.min(currentLength * 0.42, previousLength * 0.38, 82) * tension;
  const handleB = Math.min(currentLength * 0.42, nextLength * 0.38, 82) * tension;
  const previousVectorLength = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
  const nextVectorLength = Math.hypot(afterNext.x - current.x, afterNext.y - current.y) || 1;
  return {
    p0: current,
    p1: {
      x: current.x + ((next.x - previous.x) / previousVectorLength) * handleA,
      y: current.y + ((next.y - previous.y) / previousVectorLength) * handleA
    },
    p2: {
      x: next.x - ((afterNext.x - current.x) / nextVectorLength) * handleB,
      y: next.y - ((afterNext.y - current.y) / nextVectorLength) * handleB
    },
    p3: next
  };
}

function sampleCubicBlueprintPath(points, samplesPerSegment = 10) {
  const cleanPoints = points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
  if (cleanPoints.length < 2) {
    return { d: "", samples: [] };
  }

  const commands = [`M ${cleanPoints[0].x} ${cleanPoints[0].y}`];
  const samples = [cleanPoints[0]];
  for (let index = 0; index < cleanPoints.length - 1; index += 1) {
    const segment = getCubicBlueprintSegment(cleanPoints, index);
    commands.push(`C ${segment.p1.x} ${segment.p1.y}, ${segment.p2.x} ${segment.p2.y}, ${segment.p3.x} ${segment.p3.y}`);
    const segmentSamples = Math.max(6, Math.min(18, Math.ceil(Math.hypot(segment.p3.x - segment.p0.x, segment.p3.y - segment.p0.y) / 28), samplesPerSegment));
    for (let step = 1; step <= segmentSamples; step += 1) {
      samples.push(deCasteljauPoint(segment.p0, segment.p1, segment.p2, segment.p3, step / segmentSamples));
    }
  }

  return {
    d: commands.join(" "),
    samples
  };
}

function buildRoundedBlueprintPath(points) {
  return sampleCubicBlueprintPath(points).d;
}

function inflateBlueprintRect(rect, margin = 24) {
  return {
    ...rect,
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2
  };
}

function uniqueSortedNumbers(values) {
  return Array.from(new Set(values.map((value) => Math.round(value)).filter((value) => Number.isFinite(value))))
    .sort((a, b) => a - b);
}

function pointInsideRect(point, rect) {
  return point.x > rect.x && point.x < rect.x + rect.width && point.y > rect.y && point.y < rect.y + rect.height;
}

function segmentIntersectsRect(a, b, rect) {
  if (a.y === b.y) {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return a.y > rect.y && a.y < rect.y + rect.height && maxX > rect.x && minX < rect.x + rect.width;
  }
  if (a.x === b.x) {
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return a.x > rect.x && a.x < rect.x + rect.width && maxY > rect.y && minY < rect.y + rect.height;
  }
  return true;
}

function getBlueprintDirection(a, b) {
  return a.x === b.x ? "v" : "h";
}

function getPolylineMidpoint(points) {
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = Math.abs(points[index].x - points[index - 1].x) + Math.abs(points[index].y - points[index - 1].y);
    lengths.push(length);
    total += length;
  }
  let cursor = 0;
  const target = total / 2;
  for (let index = 1; index < points.length; index += 1) {
    const length = lengths[index - 1];
    if (cursor + length >= target) {
      const ratio = length ? (target - cursor) / length : 0;
      return {
        x: points[index - 1].x + (points[index].x - points[index - 1].x) * ratio,
        y: points[index - 1].y + (points[index].y - points[index - 1].y) * ratio
      };
    }
    cursor += length;
  }
  return points[Math.floor(points.length / 2)] || points[0];
}

function routeBlueprintOrthogonalPath(start, end, obstacles, bounds, edgeIndex = 0) {
  const startedAt = performance.now();
  const timeoutMs = 18;
  const edgeOffset = (edgeIndex % 5) * 10;
  const xValues = [bounds.left, bounds.right, start.x, end.x, start.x + 34 + edgeOffset, end.x - 34 - edgeOffset];
  const yValues = [bounds.top, bounds.bottom, start.y, end.y];
  obstacles.forEach((rect) => {
    xValues.push(rect.x, rect.x + rect.width, rect.x - 18 - edgeOffset, rect.x + rect.width + 18 + edgeOffset);
    yValues.push(rect.y, rect.y + rect.height, rect.y - 18 - edgeOffset, rect.y + rect.height + 18 + edgeOffset);
  });
  const xs = uniqueSortedNumbers(xValues).filter((value) => value >= bounds.left && value <= bounds.right);
  const ys = uniqueSortedNumbers(yValues).filter((value) => value >= bounds.top && value <= bounds.bottom);
  const points = [];
  const pointMap = new Map();
  const pointKey = (x, y) => `${x},${y}`;
  xs.forEach((x) => {
    ys.forEach((y) => {
      const point = { x, y };
      if (obstacles.some((rect) => pointInsideRect(point, rect))) {
        return;
      }
      pointMap.set(pointKey(x, y), points.length);
      points.push(point);
    });
  });
  const startKey = pointKey(start.x, start.y);
  const endKey = pointKey(end.x, end.y);
  if (!pointMap.has(startKey) || !pointMap.has(endKey)) {
    return null;
  }

  const clearSegment = (a, b) => !obstacles.some((rect) => segmentIntersectsRect(a, b, rect));
  const getNeighbors = (index) => {
    const point = points[index];
    const neighbors = [];
    const xIndex = xs.indexOf(point.x);
    const yIndex = ys.indexOf(point.y);
    [xIndex - 1, xIndex + 1].forEach((nextXIndex) => {
      if (nextXIndex < 0 || nextXIndex >= xs.length) {
        return;
      }
      const nextIndex = pointMap.get(pointKey(xs[nextXIndex], point.y));
      if (Number.isInteger(nextIndex) && clearSegment(point, points[nextIndex])) {
        neighbors.push(nextIndex);
      }
    });
    [yIndex - 1, yIndex + 1].forEach((nextYIndex) => {
      if (nextYIndex < 0 || nextYIndex >= ys.length) {
        return;
      }
      const nextIndex = pointMap.get(pointKey(point.x, ys[nextYIndex]));
      if (Number.isInteger(nextIndex) && clearSegment(point, points[nextIndex])) {
        neighbors.push(nextIndex);
      }
    });
    return neighbors;
  };

  const startIndex = pointMap.get(startKey);
  const endIndex = pointMap.get(endKey);
  const startState = `${startIndex}|`;
  const queue = [{ state: startState, index: startIndex, previousDirection: "", cost: 0, priority: 0 }];
  const costs = new Map([[startState, 0]]);
  const parents = new Map();
  let bestState = "";
  const heuristic = (point) => Math.abs(point.x - end.x) + Math.abs(point.y - end.y);
  while (queue.length > 0 && performance.now() - startedAt < timeoutMs) {
    queue.sort((a, b) => a.priority - b.priority);
    const current = queue.shift();
    if (current.index === endIndex) {
      bestState = current.state;
      break;
    }
    getNeighbors(current.index).forEach((nextIndex) => {
      const direction = getBlueprintDirection(points[current.index], points[nextIndex]);
      const bendPenalty = current.previousDirection && current.previousDirection !== direction ? 42 : 0;
      const stepCost = Math.abs(points[current.index].x - points[nextIndex].x) + Math.abs(points[current.index].y - points[nextIndex].y) + bendPenalty;
      const nextCost = current.cost + stepCost;
      const nextState = `${nextIndex}|${direction}`;
      if (costs.has(nextState) && costs.get(nextState) <= nextCost) {
        return;
      }
      costs.set(nextState, nextCost);
      parents.set(nextState, current.state);
      queue.push({
        state: nextState,
        index: nextIndex,
        previousDirection: direction,
        cost: nextCost,
        priority: nextCost + heuristic(points[nextIndex])
      });
    });
  }
  if (!bestState) {
    return null;
  }

  const route = [];
  let cursor = bestState;
  while (cursor) {
    const index = Number(cursor.split("|")[0]);
    route.push(points[index]);
    cursor = parents.get(cursor);
  }
  return route.reverse();
}

function fallbackBlueprintRoute(from, to, allRects = [], edgeIndex = 0) {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const allBottom = Math.max(...allRects.map((rect) => rect.y + rect.height), from.y + from.height, to.y + to.height);
  const laneY = allBottom + 62 + (edgeIndex % 4) * 22;
  return [
    { x: startX, y: startY },
    { x: startX + 42, y: startY },
    { x: startX + 42, y: laneY },
    { x: endX - 42, y: laneY },
    { x: endX - 42, y: endY },
    { x: endX, y: endY }
  ];
}

function getUnrealBlueprintSpline(start, end, edgeIndex = 0) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const absDeltaX = Math.abs(deltaX);
  const absDeltaY = Math.abs(deltaY);
  const sideOffset = (edgeIndex % 4) * 10;
  const tangent = Math.max(96, Math.min(360, absDeltaX * 0.55 + absDeltaY * 0.18 + sideOffset));
  const startDir = { x: tangent, y: 0 };
  const endDir = { x: -tangent, y: 0 };
  const p0 = start;
  const p1 = { x: start.x + startDir.x, y: start.y + startDir.y };
  const p2 = { x: end.x + endDir.x, y: end.y + endDir.y };
  const p3 = end;
  const samples = [];
  for (let step = 0; step <= 24; step += 1) {
    samples.push(deCasteljauPoint(p0, p1, p2, p3, step / 24));
  }
  return {
    d: `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`,
    samples
  };
}

function getAgentBlueprintRoute(from, to, allRects = [], edgeIndex = 0) {
  // 端点对齐到端口中心（端口在节点边缘外 1px），避免连线插入节点内部
  const start = { x: from.x + from.width + 1, y: from.y + from.height / 2 };
  const end = { x: to.x - 1, y: to.y + to.height / 2 };
  const cacheKey = JSON.stringify({ style: "ue-spline", start, end, edgeIndex });
  let spline = agentBlueprintRouteCache.get(cacheKey);
  if (!spline) {
    spline = getUnrealBlueprintSpline(start, end, edgeIndex);
    agentBlueprintRouteCache.set(cacheKey, spline);
    if (agentBlueprintRouteCache.size > 240) {
      agentBlueprintRouteCache = new Map(Array.from(agentBlueprintRouteCache.entries()).slice(-160));
    }
  }
  const midpoint = spline.samples[Math.floor(spline.samples.length / 2)] || getPolylineMidpoint([start, end]);
  return {
    d: spline.d,
    labelX: midpoint.x,
    labelY: midpoint.y - 8,
    minY: Math.min(...spline.samples.map((point) => point.y), start.y, end.y),
    maxY: Math.max(...spline.samples.map((point) => point.y), start.y, end.y)
  };
}

function getAgentBlueprintPath(fromNode, toNode, edgeIndex = 0) {
  const canvas = fromNode.closest(".agent-blueprint-canvas");
  const allRects = Array.from(canvas?.querySelectorAll(".agent-blueprint-node") || []).map((node) => ({
    id: node.dataset.roleId || "",
    ...getAgentBlueprintNodePosition(node)
  }));
  return getAgentBlueprintRoute(
    { id: fromNode.dataset.roleId || "", ...getAgentBlueprintNodePosition(fromNode) },
    { id: toNode.dataset.roleId || "", ...getAgentBlueprintNodePosition(toNode) },
    allRects,
    edgeIndex
  );
}

function updateAgentBlueprintLinks(canvas) {
  if (!canvas) {
    return;
  }

  let routeMaxY = 0;
  canvas.querySelectorAll(".agent-blueprint-link").forEach((link) => {
    const fromNode = canvas.querySelector(`.agent-blueprint-node[data-role-id="${CSS.escape(link.dataset.fromRoleId || "")}"]`);
    const toNode = canvas.querySelector(`.agent-blueprint-node[data-role-id="${CSS.escape(link.dataset.toRoleId || "")}"]`);
    if (!fromNode || !toNode) {
      return;
    }

    const path = getAgentBlueprintPath(fromNode, toNode, Number(link.dataset.edgeIndex || 0));
    routeMaxY = Math.max(routeMaxY, path.maxY || 0);
    link.querySelectorAll(".agent-blueprint-link-hit, .agent-blueprint-link-line").forEach((node) => node.setAttribute("d", path.d));
    link.querySelector(".agent-blueprint-link-label")?.setAttribute("x", path.labelX);
    link.querySelector(".agent-blueprint-link-label")?.setAttribute("y", path.labelY);
  });
  if (routeMaxY) {
    updateAgentBlueprintCanvasSize(canvas, 0, routeMaxY);
  }
}

function renderAgentFlowGraph(project) {
  const graph = getAgentFlowGraph(project);
  if (graph.nodes.length === 0) {
    return `
      <div class="agent-flow-panel agent-blueprint-panel">
        <div class="agent-flow-header">
          <strong>${escapeHtml(t("agent.flow.blueprint.title", "角色消息池蓝图"))}</strong>
          <span>${escapeHtml(t("agent.flow.blueprint.waiting", "等待首条角色消息写入消息池"))}</span>
        </div>
      </div>
    `;
  }
  const selectedRoleId = graph.nodes.some((node) => node.id === messageFlowSelection.roleId) ? messageFlowSelection.roleId : "";
  const selectedEdgeKey = graph.edges.some((edge) => edge.key === messageFlowSelection.edgeKey) ? messageFlowSelection.edgeKey : "";
  const hasSelection = Boolean(selectedRoleId || selectedEdgeKey);
  const nodeWidth = 164;
  const nodeHeight = 78;
  const autoLayoutPositions = getAgentBlueprintAutoLayout(graph);
  const nodePositions = new Map();
  graph.nodes.forEach((node, index) => {
    const saved = agentBlueprintNodePositions[getAgentBlueprintPositionKey(project.id, node.id)];
    nodePositions.set(node.id, saved || autoLayoutPositions.get(node.id) || {
      x: 44 + index * 260,
      y: 38
    });
  });
  const nodePositionBounds = Array.from(nodePositions.values());
  // 画布尺寸只跟随真实节点边界，避免用 sqrt(N) 网格公式强行撑出空白
  const maxNodeX = Math.max(44 + nodeWidth, ...nodePositionBounds.map((position) => position.x + nodeWidth));
  const maxNodeY = Math.max(38 + nodeHeight, ...nodePositionBounds.map((position) => position.y + nodeHeight));
  const nodeRects = graph.nodes.map((node) => ({ id: node.id, ...(nodePositions.get(node.id) || { x: 0, y: 0 }), width: nodeWidth, height: nodeHeight }));
  const edgeRoutes = graph.edges.map((edge, index) => {
    const from = nodePositions.get(edge.fromId) || { x: 0, y: 0 };
    const to = nodePositions.get(edge.toId) || { x: 0, y: 0 };
    return getAgentBlueprintRoute(
      { id: edge.fromId, ...from, width: nodeWidth, height: nodeHeight },
      { id: edge.toId, ...to, width: nodeWidth, height: nodeHeight },
      nodeRects,
      index
    );
  });
  const routeMaxY = Math.max(...edgeRoutes.map((route) => route.maxY), maxNodeY);
  const blueprintWidth = Math.max(680, maxNodeX + 80);
  const blueprintHeight = Math.max(260, routeMaxY + 80);
  const edgePaths = graph.edges.map((edge, index) => {
    const route = edgeRoutes[index];
    return `
      <g class="agent-blueprint-link link-${index % 5} ${edge.key === selectedEdgeKey ? "selected" : ""}"
        data-action="select-agent-flow-edge"
        data-flow-edge-key="${escapeHtml(edge.key)}"
        data-from-role-id="${escapeHtml(edge.fromId)}"
        data-to-role-id="${escapeHtml(edge.toId)}"
        data-edge-index="${index}"
        aria-pressed="${edge.key === selectedEdgeKey ? "true" : "false"}">
        <path class="agent-blueprint-link-hit" d="${escapeHtml(route.d)}"></path>
        <path class="agent-blueprint-link-line" d="${escapeHtml(route.d)}" marker-end="url(#agentBlueprintArrow)"></path>
        <text class="agent-blueprint-link-label" x="${route.labelX}" y="${route.labelY}">${edge.count}</text>
      </g>
    `;
  }).join("");
  const roleNodes = graph.nodes.map((node, index) => {
    const position = nodePositions.get(node.id) || { x: 0, y: 0 };
    const selected = node.id === selectedRoleId;
    return `
      <button class="agent-blueprint-node node-${index % 5} ${selected ? "selected" : ""}"
        style="left:${position.x}px; top:${position.y}px;"
        title="${escapeHtml(node.label)}"
        data-action="select-agent-flow-role"
        data-role-id="${escapeHtml(node.id)}"
        data-position-key="${escapeHtml(getAgentBlueprintPositionKey(project.id, node.id))}"
        aria-pressed="${selected ? "true" : "false"}">
        <span class="agent-blueprint-port in" aria-hidden="true"></span>
        <span class="agent-blueprint-port out" aria-hidden="true"></span>
        <strong>${escapeHtml(node.label)}</strong>
        <small><span>${escapeHtml(t("agent.flow.sent", "发 {{count}}", { count: node.sent }))}</span><span>${escapeHtml(t("agent.flow.received", "收 {{count}}", { count: node.received }))}</span></small>
      </button>
    `;
  }).join("");
  const edgeLegend = graph.edges.length
    ? graph.edges.slice(-5).reverse().map((edge) => `
      <button class="agent-blueprint-edge-chip ${edge.key === selectedEdgeKey ? "selected" : ""}"
        data-action="select-agent-flow-edge"
        data-flow-edge-key="${escapeHtml(edge.key)}">
        ${escapeHtml(getFlowRoleLabel(edge.fromId))} → ${escapeHtml(getFlowRoleLabel(edge.toId))}<span>${edge.count}</span>
      </button>
    `).join("")
    : `<div class="agent-flow-empty">${escapeHtml(t("agent.flow.empty.noNodes", "已有角色节点，暂无角色之间的交接消息。"))}</div>`;
  return `
    <div class="agent-flow-panel agent-blueprint-panel">
      <div class="agent-flow-header">
        <strong>${escapeHtml(t("agent.flow.blueprint.title", "角色消息池蓝图"))}</strong>
        <span>${escapeHtml(t("agent.flow.blueprint.summary", "{{nodes}} 个节点 · {{edges}} 条连接{{filtered}}", { nodes: graph.nodes.length, edges: graph.edges.length, filtered: hasSelection ? t("agent.flow.blueprint.filtered", " · 已筛选") : "" }))}</span>
        <button class="secondary-button compact" data-action="auto-layout-agent-blueprint">${escapeHtml(t("agent.flow.autoLayout", "自动整理"))}</button>
        ${hasSelection ? `<button class="secondary-button compact" data-action="clear-agent-flow-selection">${escapeHtml(t("agent.flow.clear", "清除"))}</button>` : ""}
      </div>
      <div class="agent-blueprint-wrap">
        <div class="agent-blueprint-canvas" data-project-id="${escapeHtml(project.id)}" style="width:${blueprintWidth}px; height:${blueprintHeight}px;">
          <svg class="agent-blueprint-svg" width="${blueprintWidth}" height="${blueprintHeight}" viewBox="0 0 ${blueprintWidth} ${blueprintHeight}" aria-hidden="true">
            <defs>
              <pattern id="agentBlueprintGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(82, 103, 140, 0.10)" stroke-width="1" />
              </pattern>
              <marker id="agentBlueprintArrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" class="agent-blueprint-arrow-head"></path>
              </marker>
            </defs>
            <rect class="agent-blueprint-grid" width="100%" height="100%" fill="url(#agentBlueprintGrid)"></rect>
            ${edgePaths}
          </svg>
          ${roleNodes}
        </div>
      </div>
      <div class="agent-blueprint-legend">${edgeLegend}</div>
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
    attachAgentBlueprintDragHandlers();
    updateAgentBlueprintLinks(list.querySelector(".agent-blueprint-canvas"));
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

function autoLayoutAgentBlueprint() {
  const project = getProject();
  if (!project) {
    return;
  }

  const prefix = `${project.id}:`;
  Object.keys(agentBlueprintNodePositions).forEach((key) => {
    if (key.startsWith(prefix)) {
      delete agentBlueprintNodePositions[key];
    }
  });
  agentBlueprintRouteCache.clear();
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
        <h2>${escapeHtml(t("nav.messageCenter", "消息中心"))}</h2>
        <p>${escapeHtml(t("nav.noProject.title", "请先创建或选择一个项目。"))}</p>
        <div class="modal-actions">
          <button class="primary-button" data-action="close-modal">${escapeHtml(t("common.ok", "确定"))}</button>
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
      <h2>${escapeHtml(t("nav.timeline", "任务协作时间线"))}</h2>
      <p>${escapeHtml(t("nav.timeline.desc", "这里展示任务进展、协作者状态、审批记录和系统事件。"))}</p>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.close", "关闭"))}</button>
      </div>
      <div class="message-filterbar">
        <label>
          <span>${escapeHtml(t("nav.search", "搜索"))}</span>
          <input id="messageTimelineSearch" value="${escapeHtml(messageTimelineFilters.query || "")}" placeholder="${escapeHtml(t("nav.search.placeholder", "搜索角色、消息、状态"))}">
        </label>
        <label>
          <span>${escapeHtml(t("nav.taskFilter", "任务筛选"))}</span>
          <select id="messageTimelineTaskFilter">
            <option value="">${escapeHtml(t("nav.taskFilter.all", "全部"))}</option>
            ${filterTaskOptions}
          </select>
        </label>
      </div>
      <div class="message-list" data-message-timeline-list>
        ${renderMessageRows(project)}
      </div>
    </div>
  `);
  attachAgentBlueprintDragHandlers();
  updateAgentBlueprintLinks(document.querySelector(".agent-blueprint-canvas"));
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
      <h2>${escapeHtml(t("nav.terminalOutputRefs", "终端输出引用"))}</h2>
      <p>${escapeHtml(t("nav.terminalOutputRefs.desc", "这些输出来自 Kernel 调度的 Agent 终端，点击对应窗口可回到角色程序继续查看。"))}</p>
      <div class="task-plan-summary">
        <strong>${escapeHtml(getRoleName(message.fromRoleId))} → ${escapeHtml(message.toRoleIds.map((roleId) => getRoleName(roleId)).join("、"))}</strong>
        <span>${escapeHtml(message.content)}</span>
      </div>
      <div class="terminal-ref-list">
        ${refs.length ? refs.map((ref) => `
          <div class="terminal-ref-row">
            <div class="message-row-head">
              <strong>${escapeHtml(getRoleName(ref.roleId))} · ${escapeHtml(formatDateTime(ref.updatedAt))}</strong>
              <button class="secondary-button compact" data-action="focus-terminal-ref-window" data-window-id="${escapeHtml(ref.windowId)}">${escapeHtml(t("nav.locateWindow", "定位窗口"))}</button>
            </div>
            <pre>${escapeHtml(ref.excerpt)}</pre>
          </div>
        `).join("") : `<div class="message-empty">${escapeHtml(t("nav.terminalOutputRefs.empty", "暂无终端输出引用。"))}</div>`}
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="show-message-center">${escapeHtml(t("nav.backToTimeline", "返回时间线"))}</button>
        <button class="primary-button" data-action="close-modal">${escapeHtml(t("common.close", "关闭"))}</button>
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
    <div class="modal about-modal" role="dialog" aria-label="${escapeHtml(t("about.title", "关于 CosS"))}">
      <div class="about-titlebar">
        <div class="about-titlebar-title">
          <img class="about-titlebar-icon" src="./Logo.png" alt="" aria-hidden="true" draggable="false" />
          <span>${escapeHtml(t("about.title", "关于 CosS"))}</span>
        </div>
        <button class="about-close-button" type="button" data-action="close-modal" aria-label="${escapeHtml(t("common.close", "关闭"))}">×</button>
      </div>
      <div class="about-main">
        <img class="about-main-logo" src="./Logo.png" alt="CosS" draggable="false" />
        <h2>CosS</h2>
        <p class="about-version">${escapeHtml(t("about.version", "版本 {{version}}", { version: appInfo.version || APP_VERSION.replace(/^v/, "") }))}</p>
        <p class="about-copyright">© CosS</p>
      </div>
      <div class="about-footer">
        <button class="about-ok-button" type="button" data-action="close-modal">${escapeHtml(t("common.ok", "确定"))}</button>
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
            <strong>${escapeHtml(trRoleName(role))}</strong>
            <span>${escapeHtml(trRoleDescription(role))}</span>
            <div class="role-meta">${escapeHtml(trRoleCategory(role))} · ${role.claude ? escapeHtml(t("role.meta.claudeEnabled", "可使用 Claude Code")) : escapeHtml(t("role.meta.noTerminal", "无需终端"))}</div>
          </button>
        `;
      }

      return `
        <div class="role-card terminal-role-card">
          <strong>${escapeHtml(trRoleName(role))}</strong>
          <span>${escapeHtml(trRoleDescription(role))}</span>
          <div class="role-meta">${escapeHtml(trRoleCategory(role))} · ${escapeHtml(t("role.meta.agentProvider", "Agent 当前使用 {{provider}}", { provider: getAgentProviderLabel(state.settings.agentProvider) }))}</div>
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
      <h2>${escapeHtml(t("programPicker.title", "选择{{program}}角色", { program: getProgramLabel(type) }))}</h2>
      <p>${type === "terminal" ? escapeHtml(t("programPicker.desc.terminal", "终端会以角色身份运行，可选择普通 PowerShell 或 Agent。Agent 当前使用 {{provider}}，可在系统设置中切换。", { provider: getAgentProviderLabel(state.settings.agentProvider) })) : escapeHtml(t("programPicker.desc.other", "程序会以角色身份运行，任务分派和协作状态都会绑定到这个角色。"))}</p>
      <div class="role-grid">${cards}</div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.cancel", "取消"))}</button>
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
  closeFeedbackModal();
  document.querySelector(".modal-backdrop")?.remove();
}

function closeFeedbackModal() {
  document.querySelector(".feedback-modal-backdrop")?.remove();
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function searchHaystackMatches(query, values) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return true;
  }
  return values.join(" ").toLowerCase().includes(normalizedQuery);
}

function getSearchResultScore(query, values) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return 0;
  }
  const normalizedValues = values.map((value) => String(value || "").toLowerCase());
  if (normalizedValues.some((value) => value === normalizedQuery)) {
    return 100;
  }
  if (normalizedValues.some((value) => value.startsWith(normalizedQuery))) {
    return 70;
  }
  return normalizedValues.some((value) => value.includes(normalizedQuery)) ? 30 : 0;
}

function buildGlobalSearchResults(query = globalSearchQuery) {
  const normalizedQuery = normalizeSearchText(query);
  const activeProjectId = state.activeProjectId || "";
  const results = [];
  const pushResult = (result, haystack) => {
    if (!searchHaystackMatches(normalizedQuery, haystack)) {
      return;
    }
    results.push({
      ...result,
      score: getSearchResultScore(normalizedQuery, haystack) + (result.projectId === activeProjectId ? 8 : 0)
    });
  };

  state.projects.forEach((project) => {
    ensureProjectShape(project);
    pushResult({
      kind: "project",
      projectId: project.id,
      title: project.name || t("search.result.untitledProject", "未命名项目"),
      subtitle: project.path || t("search.result.noPath", "未设置项目路径"),
      meta: `${t("search.result.taskCount", "{{count}} 个任务", { count: project.tasks.length })} · ${t("search.result.windowCount", "{{count}} 个窗口", { count: project.windows.length })}`,
      actionLabel: t("search.result.openProject", "打开项目")
    }, [project.name, project.path, project.id]);

    project.windows.forEach((win) => {
      const role = getRole(win.roleId);
      pushResult({
        kind: "window",
        projectId: project.id,
        windowId: win.id,
        desktopId: win.desktopId || "",
        title: win.title || PROGRAMS[win.type]?.label || t("search.result.window", "窗口"),
        subtitle: `${project.name} · ${role.name} · ${PROGRAMS[win.type]?.label || win.type}`,
        meta: win.minimized ? t("search.result.minimized", "已最小化") : t("search.result.running", "运行中"),
        actionLabel: t("search.result.locateWindow", "定位窗口")
      }, [project.name, project.path, win.title, win.type, role.name, win.filePath, win.url, win.browserTabs?.map((tab) => `${tab.title} ${tab.url}`).join(" ")]);
    });

    project.tasks.forEach((task) => {
      const roleNames = getTaskRoleIds(task).map((roleId) => getRoleName(roleId)).join("、");
      pushResult({
        kind: "task",
        projectId: project.id,
        taskId: task.id,
        desktopId: getTaskConversationId(task),
        title: task.title || t("search.result.untitledTask", "未命名任务"),
        subtitle: task.goal || t("search.result.noGoal", "无任务目标"),
        meta: `${project.name} · ${roleNames || t("search.result.unassigned", "未分配角色")} · ${SUBTASK_STATUS_DEFS[getTaskStatusValue(task)]?.label || getTaskStatusValue(task)}`,
        actionLabel: t("search.result.viewTask", "查看任务")
      }, [project.name, project.path, task.title, task.goal, task.model?.modelName, roleNames, ...(task.subtasks || []).flatMap((subtask) => [subtask.title, subtask.description, getRoleName(subtask.roleId)])]);
    });

    project.messages.forEach((message) => {
      const fromRole = getRoleName(message.fromRoleId);
      const toRoles = message.toRoleIds.map((roleId) => getRoleName(roleId)).join("、");
      pushResult({
        kind: "message",
        timelineKind: "message",
        projectId: project.id,
        itemId: message.id,
        taskId: message.taskId || "",
        title: `${fromRole} → ${toRoles}`,
        subtitle: message.content || t("search.result.emptyMessage", "空消息"),
        meta: `${project.name} · ${getMessageTaskLabel(message.taskId)} · ${formatDateTime(message.createdAt)}`,
        actionLabel: t("search.result.viewMessage", "查看消息")
      }, [project.name, project.path, fromRole, toRoles, message.content, message.source, getMessageTaskLabel(message.taskId)]);
    });

    project.agentEvents.forEach((event) => {
      const roleName = getRoleName(event.roleId);
      pushResult({
        kind: "event",
        timelineKind: "agent-event",
        projectId: project.id,
        itemId: event.id,
        taskId: event.taskId || "",
        title: t("search.result.agentEvent", "Agent 事件 · {{name}}", { name: roleName }),
        subtitle: event.message || event.sessionId || event.status || t("search.result.statusEvent", "状态事件"),
        meta: `${project.name} · ${event.provider || "agent"} · ${formatDateTime(event.receivedAt)}`,
        actionLabel: t("search.result.viewEvent", "查看事件")
      }, [project.name, project.path, roleName, event.provider, event.status, event.type, event.toolName, event.message, event.sessionId, getMessageTaskLabel(event.taskId)]);
    });
  });

  return results
    .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title), "zh-CN"))
    .slice(0, normalizedQuery ? 80 : 28);
}

function renderGlobalSearchResults(query = globalSearchQuery) {
  const results = buildGlobalSearchResults(query);
  const normalizedQuery = normalizeSearchText(query);
  if (results.length === 0) {
    return `<div class="global-search-empty">${escapeHtml(normalizedQuery ? t("search.empty.withQuery", "没有找到匹配结果。可以搜索项目、任务、消息、角色、窗口标题或文件路径。") : t("search.empty.noQuery", "输入关键词后搜索项目、任务、消息、事件和窗口。"))}</div>`;
  }

  const kindLabels = {
    project: t("search.kind.project", "项目"),
    task: t("search.kind.task", "任务"),
    message: t("search.kind.message", "消息"),
    event: t("search.kind.event", "事件"),
    window: t("search.kind.window", "窗口")
  };
  return results.map((item) => `
    <button class="global-search-result" data-action="open-search-result"
      data-result-kind="${escapeHtml(item.kind)}"
      data-project-id="${escapeHtml(item.projectId || "")}"
      data-window-id="${escapeHtml(item.windowId || "")}"
      data-task-id="${escapeHtml(item.taskId || "")}"
      data-desktop-id="${escapeHtml(item.desktopId || "")}"
      data-item-id="${escapeHtml(item.itemId || "")}"
      data-timeline-kind="${escapeHtml(item.timelineKind || "")}">
      <span class="global-search-kind">${escapeHtml(kindLabels[item.kind] || t("search.kind.result", "结果"))}</span>
      <span class="global-search-main">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.subtitle)}</span>
        <em>${escapeHtml(item.meta || "")}</em>
      </span>
      <span class="global-search-action">${escapeHtml(item.actionLabel || t("search.action.open", "打开"))}</span>
    </button>
  `).join("");
}

function refreshGlobalSearchResults() {
  const list = document.querySelector("[data-global-search-results]");
  const count = document.querySelector("[data-global-search-count]");
  const results = buildGlobalSearchResults(globalSearchQuery);
  if (list) {
    list.innerHTML = renderGlobalSearchResults(globalSearchQuery);
  }
  if (count) {
    count.textContent = t("search.count", "{{count}} 个结果", { count: results.length });
  }
}

function showSearchModal() {
  closeMenus();
  const results = buildGlobalSearchResults(globalSearchQuery);
  renderModal(`
    <div class="modal global-search-modal">
      <div class="global-search-head">
        <div>
          <h2>${escapeHtml(t("search.title", "搜索"))}</h2>
          <p>${escapeHtml(t("search.desc", "搜索项目、任务、消息、Agent 事件、窗口标题和文件路径。"))}</p>
        </div>
        <button class="settings-close" title="${escapeHtml(t("common.close", "关闭"))}" data-action="close-modal">×</button>
      </div>
      <label class="global-search-box">
        <span>${icon("search")}</span>
        <input id="globalSearchInput" value="${escapeHtml(globalSearchQuery)}" placeholder="${escapeHtml(t("search.placeholder", "输入关键词，例如任务标题、角色、路径或消息内容"))}" autocomplete="off" />
      </label>
      <div class="global-search-summary" data-global-search-count>${escapeHtml(t("search.count", "{{count}} 个结果", { count: results.length }))}</div>
      <div class="global-search-results" data-global-search-results>
        ${renderGlobalSearchResults(globalSearchQuery)}
      </div>
    </div>
  `);
  setTimeout(() => document.getElementById("globalSearchInput")?.focus(), 0);
}

function openSearchResult(target) {
  const projectId = target.dataset.projectId || "";
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) {
    closeModal();
    return;
  }

  const kind = target.dataset.resultKind || "";
  closeModal();
  if (state.activeProjectId !== project.id) {
    state.activeProjectId = project.id;
    project.lastOpenedAt = new Date().toISOString();
  }

  if (kind === "project") {
    saveState();
    bootWorkspace(project.id);
    return;
  }

  const desktopId = target.dataset.desktopId || "";
  if (desktopId && getProjectDesktops(project).some((desktop) => desktop.id === desktopId)) {
    project.activeDesktopId = desktopId;
  }

  if (kind === "window") {
    saveState();
    focusWindow(target.dataset.windowId || "");
    return;
  }

  if (kind === "task") {
    const taskId = target.dataset.taskId || "";
    const task = project.tasks.find((item) => item.id === taskId);
    taskListFilters = { query: "", roleId: "", status: "", model: "", includeArchived: Boolean(task?.archived) };
    selectedTaskListTaskId = taskId;
    saveState();
    openTaskListWindow();
    return;
  }

  if (kind === "message" || kind === "event") {
    const timelineKind = target.dataset.timelineKind || (kind === "event" ? "agent-event" : "message");
    selectedTimelineItemId = `${timelineKind}:${target.dataset.itemId || ""}`;
    messageTimelineFilters = { ...messageTimelineFilters, taskId: target.dataset.taskId || "", query: "" };
    messageFlowSelection = { roleId: "", edgeKey: "" };
    saveState();
    showMessageCenterModal({ filterTaskId: target.dataset.taskId || "" });
    return;
  }

  saveState();
  render();
}

function renderSeverityLabel(severity) {
  return {
    high: t("risk.severity.high", "高风险"),
    medium: t("risk.severity.medium", "需确认"),
    low: t("risk.severity.low", "低风险")
  }[severity] || t("risk.severity.unknown", "未知");
}

function renderCommandStatus(status) {
  return {
    pending: t("risk.status.pending", "等待确认"),
    approved: t("risk.status.approved", "已确认执行"),
    executed: t("risk.status.executed", "已执行"),
    rejected: t("risk.status.rejected", "已拒绝")
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
      <h2>${escapeHtml(t("risk.command.title", "命令执行需要确认"))}</h2>
      <p>${escapeHtml(t("risk.command.desc", "{{role}} 即将执行一个 {{severity}} 命令。请确认它符合当前项目目标。", { role: role.name, severity: renderSeverityLabel(assessment.severity) }))}</p>
      <div class="risk-summary ${assessment.severity}">
        <strong>${escapeHtml(assessment.label)}</strong>
        <span>${escapeHtml(assessment.description)}</span>
      </div>
      <pre class="command-preview">${escapeHtml(pendingCommandApproval.command)}</pre>
      <div class="modal-actions">
        <button class="secondary-button" data-action="reject-command">${escapeHtml(t("risk.command.reject", "拒绝执行"))}</button>
        <button class="primary-button" data-action="approve-command">${escapeHtml(t("risk.command.approve", "确认执行"))}</button>
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
  view?.term?.writeln(`\x1b[33m${t("risk.command.blocked", "CosS 已阻止该命令，未发送 Enter 执行。")}\x1b[0m`);
  updateCommandLog(pendingCommandApproval.logId, "rejected");
  pendingCommandApproval = null;
  closeModal();
}

function renderCommandStatus(status) {
  return {
    pending: t("risk.status.pending", "等待确认"),
    approved: t("risk.status.approved", "已确认执行"),
    "session-approved": t("risk.status.session-approved", "本会话已授权"),
    "approved-by-grant": t("risk.status.approved-by-grant", "会话授权执行"),
    executed: t("risk.status.executed", "已执行"),
    rejected: t("risk.status.rejected", "已拒绝")
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
      <h2>${escapeHtml(t("risk.command.title", "命令执行需要确认"))}</h2>
      <p>${escapeHtml(t("risk.command.descExtended", "{{role}} 即将执行一个 {{severity}} 命令。你可以只允许本次执行，也可以在当前会话内允许同一角色执行同类命令。", { role: role.name, severity: renderSeverityLabel(assessment.severity) }))}</p>
      <div class="risk-summary ${assessment.severity}">
        <strong>${escapeHtml(assessment.label)}</strong>
        <span>${escapeHtml(assessment.description)}</span>
      </div>
      <pre class="command-preview">${escapeHtml(pendingCommandApproval.command)}</pre>
      <div class="modal-actions">
        <button class="secondary-button" data-action="reject-command">${escapeHtml(t("risk.command.reject", "拒绝执行"))}</button>
        <button class="secondary-button" data-action="approve-command-session">${escapeHtml(t("risk.command.approveSession", "本会话允许同类命令"))}</button>
        <button class="primary-button" data-action="approve-command">${escapeHtml(t("risk.command.approveOnce", "允许一次"))}</button>
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
        ${escapeHtml(t("claudeCode.notTested", "尚未检测 Claude Code 环境。"))}
      </div>
    `;
  }

  const headline = status.installed ? t("claudeCode.available", "Claude Code 已可用") : t("claudeCode.notFound", "未检测到 Claude Code");
  const detail = status.installed
    ? (status.version || status.versionError || t("claudeCode.versionPresent", "claude 命令存在，但未返回版本信息。"))
    : `${status.autoInstallDisabled ? t("claudeCode.autoInstall.off", "当前环境已关闭自动安装。") : t("claudeCode.autoInstall.on", "创建 Claude Code 角色终端时会尝试自动安装。")} ${t("claudeCode.recommended", "推荐命令：{{command}}", { command: status.installCommand })}`;

  return `
    <div class="claude-status ${status.installed ? "ready" : "missing"}" data-claude-status>
      <strong>${escapeHtml(headline)}</strong>
      <span>${escapeHtml(t("claudeCode.command", "命令：{{command}}", { command: status.command }))}</span>
      <span>${escapeHtml(detail)}</span>
      ${renderAgentAuthLines(status.auth)}
      <span>${escapeHtml(t("claudeCode.checkedAt", "检测时间：{{time}}", { time: formatDateTime(status.checkedAt) }))}</span>
    </div>
  `;
}

function renderCodexStatus(status) {
  if (!status) {
    return `
      <div class="claude-status empty" data-codex-status>
        ${escapeHtml(t("codex.notTested", "尚未检测 Codex CLI 环境。"))}
      </div>
    `;
  }

  const headline = status.runnable ? t("codex.available", "Codex CLI 已可用") : t("codex.notFound", "未检测到可运行的 Codex CLI");
  const npmDetail = status.npm?.usable
    ? t("codex.npm.ok", "npm 可用：{{version}}（{{command}}）", { version: status.npm.version || t("model.secret.masked", "已检测"), command: status.npm.command || "npm" })
    : t("codex.npm.fail", "npm 不可用：{{error}}", { error: status.npm?.errorDetail || t("model.secret.empty", "未返回版本信息") });
  const npmCandidates = status.npm?.candidates?.length
    ? t("codex.npm.candidates", "npm 候选：{{candidates}}", { candidates: status.npm.candidates.join(" | ") })
    : "";
  const lookupDetail = status.lookupPaths?.length
    ? t("codex.path.hit", "PATH 命中：{{paths}}", { paths: status.lookupPaths.join(" | ") })
    : t("codex.path.miss", "PATH 未命中 codex。");
  const detail = status.runnable
    ? (status.version || t("codex.versionPresent", "codex 命令存在，但未返回版本信息。"))
    : `${status.autoInstallDisabled ? t("codex.autoInstall.off", "当前已关闭 Codex 自动安装。") : t("codex.autoInstall.on", "创建 Codex Agent 时会尝试自动安装。")} ${t("codex.recommended", "推荐命令：{{command}}", { command: status.installCommand })}`;

  return `
    <div class="claude-status ${status.runnable ? "ready" : "missing"}" data-codex-status>
      <strong>${escapeHtml(headline)}</strong>
      <span>${escapeHtml(t("codex.command", "命令：{{command}}", { command: status.command || "codex" }))}</span>
      <span>${escapeHtml(detail)}</span>
      <span>${escapeHtml(npmDetail)}</span>
      ${npmCandidates ? `<span>${escapeHtml(npmCandidates)}</span>` : ""}
      <span>${escapeHtml(lookupDetail)}</span>
      ${status.hasWindowsAppsPackagePath ? `<span>${escapeHtml(t("codex.windowsApps", "检测到 WindowsApps 中的 OpenAI Codex 应用包路径，它可能不能作为 CLI 直接启动。"))}</span>` : ""}
      ${status.errorDetail ? `<span>${escapeHtml(t("common.error", "错误：{{error}}", { error: status.errorDetail }))}</span>` : ""}
      ${renderAgentAuthLines(status.auth)}
      <span>${escapeHtml(t("codex.checkedAt", "检测时间：{{time}}", { time: formatDateTime(status.checkedAt) }))}</span>
    </div>
  `;
}

function renderCodeBuddyStatus(status) {
  if (!status) {
    return `
      <div class="claude-status empty" data-codebuddy-status>
        ${escapeHtml(t("codeBuddy.notTested", "尚未检测 CodeBuddy Code CLI 环境。"))}
      </div>
    `;
  }

  const headline = status.runnable ? t("codeBuddy.available", "CodeBuddy Code CLI 已可用") : t("codeBuddy.notFound", "未检测到可运行的 CodeBuddy Code CLI");
  const npmDetail = status.npm?.usable
    ? t("codeBuddy.npm.ok", "npm 可用：{{version}}（{{command}}）", { version: status.npm.version || t("model.secret.masked", "已检测"), command: status.npm.command || "npm" })
    : t("codeBuddy.npm.fail", "npm 不可用：{{error}}", { error: status.npm?.errorDetail || t("model.secret.empty", "未返回版本信息") });
  const npmCandidates = status.npm?.candidates?.length
    ? t("codeBuddy.npm.candidates", "npm 候选：{{candidates}}", { candidates: status.npm.candidates.join(" | ") })
    : "";
  const lookupDetail = status.lookupPaths?.length
    ? t("codeBuddy.path.hit", "PATH 命中：{{paths}}", { paths: status.lookupPaths.join(" | ") })
    : t("codeBuddy.path.miss", "PATH 未命中 codebuddy 或 cbc。");
  const detail = status.runnable
    ? (status.version || t("codeBuddy.versionPresent", "codebuddy 命令存在，但未返回版本信息。"))
    : `${status.autoInstallDisabled ? t("codeBuddy.autoInstall.off", "当前已关闭 CodeBuddy Code 自动安装。") : t("codeBuddy.autoInstall.on", "创建 CodeBuddy Agent 时会尝试自动安装。")} ${t("codeBuddy.recommended", "推荐命令：{{command}}", { command: status.installCommand })}`;

  return `
    <div class="claude-status ${status.runnable ? "ready" : "missing"}" data-codebuddy-status>
      <strong>${escapeHtml(headline)}</strong>
      <span>${escapeHtml(t("codeBuddy.command", "命令：{{command}}", { command: status.command || "codebuddy" }))}</span>
      <span>${escapeHtml(detail)}</span>
      <span>${escapeHtml(npmDetail)}</span>
      ${npmCandidates ? `<span>${escapeHtml(npmCandidates)}</span>` : ""}
      <span>${escapeHtml(lookupDetail)}</span>
      ${status.errorDetail ? `<span>${escapeHtml(t("common.error", "错误：{{error}}", { error: status.errorDetail }))}</span>` : ""}
      ${renderAgentAuthLines(status.auth)}
      <span>${escapeHtml(t("codeBuddy.checkedAt", "检测时间：{{time}}", { time: formatDateTime(status.checkedAt) }))}</span>
    </div>
  `;
}

function renderAgentAuthLines(auth) {
  if (!auth) {
    return "";
  }

  const sourceLabels = {
    env: t("agentLogin.source.env", "环境变量"),
    config: t("agentLogin.source.config", "配置文件"),
    "config-present": t("agentLogin.source.configPresent", "配置文件存在但未发现登录凭据"),
    missing: t("agentLogin.source.missing", "未发现配置")
  };
  const credentialPath = auth.authPath || auth.configPath || "";
  const lines = [
    t("agentLogin.summary", "登录状态：{{status}} · {{source}}", { status: auth.loggedIn ? t("agentLogin.status.loggedIn", "已检测到登录凭据") : t("agentLogin.status.loggedOut", "未检测到登录凭据"), source: sourceLabels[auth.source] || auth.source || t("agentLogin.source.unknown", "未知来源") }),
    credentialPath ? t("agentLogin.credentialPath", "凭据路径：{{path}}", { path: credentialPath }) + (auth.configExists === false ? t("agentLogin.credentialPath.missing.suffix", "（不存在）") : "") : "",
    auth.homePath ? t("agentLogin.homePath", "主目录：{{path}}", { path: auth.homePath }) : "",
    Array.isArray(auth.envKeys) && auth.envKeys.length ? t("agentLogin.envKeys", "命中环境变量：{{keys}}", { keys: auth.envKeys.join(", ") }) : "",
    auth.configError ? t("agentLogin.configError", "配置读取错误：{{error}}", { error: auth.configError }) : ""
  ].filter(Boolean);

  return lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
}

function renderAgentLoginTestStatus(provider) {
  const normalized = normalizeAgentProvider(provider);
  const status = agentLoginTestStatuses[normalized];
  const attr = `data-agent-login-status="${escapeHtml(normalized)}"`;
  if (!status) {
    return `<div class="model-connectivity-status idle" ${attr}>${escapeHtml(t("agentLogin.notTested", "尚未测试 {{provider}} 远程登录态。", { provider: getAgentProviderLabel(normalized) }))}</div>`;
  }
  if (status.state === "testing") {
    return `<div class="model-connectivity-status testing" ${attr}>${escapeHtml(t("agentLogin.testing", "正在测试远程登录态..."))}</div>`;
  }
  if (status.ok) {
    return `
      <div class="model-connectivity-status ready" ${attr}>
        <strong>${escapeHtml(t("agentLogin.ok", "远程登录态可用"))}</strong>
        <span>${escapeHtml(status.message || t("agentLogin.ok.default", "远程 API 校验通过。"))} · ${escapeHtml(formatDateTime(status.checkedAt))}</span>
      </div>
    `;
  }
  return `
    <div class="model-connectivity-status missing" ${attr}>
      <strong>${escapeHtml(status.skipped ? t("agentLogin.skipped", "远程登录态未测试") : t("agentLogin.failed", "远程登录态不可用"))}</strong>
      <span>${escapeHtml(status.message || status.error || t("agentLogin.failed.default", "远程 API 校验失败。"))}${status.checkedAt ? ` · ${escapeHtml(formatDateTime(status.checkedAt))}` : ""}</span>
    </div>
  `;
}

function renderLogRows() {
  const logs = getProjectCommandLogs().slice(0, 60);
  if (logs.length === 0) {
    return `<div class="empty-log">${escapeHtml(t("commandAudit.empty", "暂无命令日志。角色终端执行命令后会在这里记录。"))}</div>`;
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
      <h2>${escapeHtml(t("commandAudit.title", "命令审计与运行环境"))}</h2>
      <p>${escapeHtml(t("commandAudit.desc", "这里记录角色终端执行过的命令，并提供 Agent 运行环境检测。"))}</p>
      <section class="log-section">
        <div class="log-section-title">
          <strong>${escapeHtml(t("commandAudit.claudeEnv", "Claude Code 环境"))}</strong>
          <button class="secondary-button" data-action="check-claude">${escapeHtml(t("commandAudit.recheck", "重新检测"))}</button>
        </div>
        <div id="claudeStatusMount">${renderClaudeStatus(latestClaudeStatus)}</div>
      </section>
      <section class="log-section">
        <div class="log-section-title">
          <strong>${escapeHtml(t("commandAudit.commandLog", "终端命令日志"))}</strong>
          <span>${escapeHtml(t("common.count.items", "{{count}} 条", { count: getProjectCommandLogs().length }))}</span>
        </div>
        <div class="log-list">${renderLogRows()}</div>
      </section>
      <div class="modal-actions">
        <button class="primary-button" data-action="close-modal">${escapeHtml(t("common.close", "关闭"))}</button>
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
      <span>${escapeHtml(getModelDisplayName(config))}</span>
      <small>${config.locked ? escapeHtml(t("model.noApiKey", "无需 API key")) : config.apiKeyRequired ? `${escapeHtml(t("model.field.apiKey", "API key"))}：${escapeHtml(renderMaskedSecret(config.apiKey))}` : `${escapeHtml(t("model.field.apiKey", "API key"))}：${config.apiKey ? escapeHtml(renderMaskedSecret(config.apiKey)) : escapeHtml(t("common.optional", "可选"))}`}</small>
      <em>${active ? escapeHtml(t("model.currentlyUsed", "当前使用")) : usable ? escapeHtml(t("model.switchable", "可切换")) : escapeHtml(t("model.needApiKey", "需填写 API key"))}</em>
    </button>
  `;
}

function renderModelConnectivityStatus(provider) {
  const id = normalizeModelProvider(provider);
  const status = modelConnectivityStatuses[id];
  if (!status) {
    return `<div class="model-connectivity-status idle" data-model-connectivity-status="${escapeHtml(id)}">${escapeHtml(t("model.connectivity.idle", "尚未测试连通性。"))}</div>`;
  }

  if (status.state === "testing") {
    return `<div class="model-connectivity-status testing" data-model-connectivity-status="${escapeHtml(id)}">${escapeHtml(t("model.connectivity.testing", "正在测试连通性..."))}</div>`;
  }

  if (status.ok) {
    const latencyText = Number.isFinite(status.latencyMs) ? ` · ${status.latencyMs}ms` : "";
    return `
      <div class="model-connectivity-status ready" data-model-connectivity-status="${escapeHtml(id)}">
        <strong>${escapeHtml(t("model.connectivity.ok", "连通性正常"))}</strong>
        <span>${escapeHtml(status.modelName || "")}${latencyText} · ${escapeHtml(formatDateTime(status.checkedAt))}</span>
      </div>
    `;
  }

  return `
    <div class="model-connectivity-status missing" data-model-connectivity-status="${escapeHtml(id)}">
      <strong>${escapeHtml(t("model.connectivity.failed", "连通性失败"))}</strong>
      <span>${escapeHtml(status.error || t("model.connectivity.unavailable", "模型接口不可用。"))}${status.checkedAt ? ` · ${escapeHtml(formatDateTime(status.checkedAt))}` : ""}</span>
    </div>
  `;
}

function renderModelSettingsSection() {
  const activeModel = getActiveModelConfig();
  const editingModel = getModelConfig(modelEditorProvider);
  const canActivateEditingModel = canUseModelProvider(editingModel.id);
  const modelConfigMissingReason = !String(editingModel.baseUrl || "").trim() || !String(editingModel.modelName || "").trim()
    ? t("model.config.needBaseUrl", "该模型需要先填写 Base URL 和模型名称，才允许切换为当前模型。")
    : t("model.config.needApiKey", "该模型需要先填写 API key，才允许切换为当前模型。");
  const modelFieldReadonly = editingModel.locked ? "readonly" : "";
  const apiKeyPlaceholder = editingModel.apiKeyRequired ? t("model.apiKey.placeholder.required", "填写后才可以切换到该模型") : t("model.apiKey.placeholder.optional", "可选，按模型服务要求填写");
  const apiKeyField = editingModel.locked
    ? `<div class="field"><label>API Key</label><input value="${escapeHtml(t("model.apiKey.noKey", "该模型无需 API key"))}" readonly /></div>`
    : `
      <div class="field">
        <label for="modelApiKey">API Key</label>
        <input id="modelApiKey" type="password" autocomplete="off" placeholder="${escapeHtml(apiKeyPlaceholder)}" value="${escapeHtml(editingModel.apiKey)}" data-model-provider="${editingModel.id}" data-model-field="apiKey" />
      </div>
    `;

  return `
    <div class="settings-section-title">
      <strong>${escapeHtml(t("model.config.title", "模型配置"))}</strong>
      <span>${escapeHtml(t("model.config.desc", "可填写用户自定义模型服务，也可以切换到下方预设模型。"))}</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("model.current.title", "当前模型"))}</strong>
        <span>${escapeHtml(activeModel.label)} · ${escapeHtml(getModelEndpointDisplay(activeModel))} · ${escapeHtml(getModelDisplayName(activeModel))} · ${escapeHtml(getModelCredentialDisplay(activeModel))}</span>
      </div>
      <span class="settings-value">${escapeHtml(getModelDisplayName(activeModel))}</span>
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
          <button class="secondary-button" data-action="test-model-connectivity" data-provider="${editingModel.id}">${escapeHtml(t("model.action.test", "测试连通性"))}</button>
          <button class="primary-button" data-action="set-model-provider" data-provider="${editingModel.id}">${escapeHtml(state.settings.modelProvider === editingModel.id ? t("model.current.title", "当前模型") : t("model.action.set", "设为当前模型"))}</button>
        </div>
      </div>
      <div class="model-config-grid">
        <div class="field">
          <label for="modelBaseUrl">Base URL</label>
          <input id="modelBaseUrl" value="${escapeHtml(getModelEndpointDisplay(editingModel))}" ${modelFieldReadonly} data-model-provider="${editingModel.id}" data-model-field="baseUrl" />
        </div>
        <div class="field">
          <label for="modelName">${escapeHtml(t("model.field.modelName", "模型名称"))}</label>
          <input id="modelName" value="${escapeHtml(getModelDisplayName(editingModel))}" ${modelFieldReadonly} data-model-provider="${editingModel.id}" data-model-field="modelName" />
        </div>
        ${apiKeyField}
      </div>
      <div class="model-config-note ${canActivateEditingModel ? "ready" : "missing"}">
        ${canActivateEditingModel ? escapeHtml(t("model.config.canActivate", "该模型配置可以切换使用。")) : escapeHtml(modelConfigMissingReason)}
      </div>
      ${renderModelConnectivityStatus(editingModel.id)}
    </div>
  `;
}

function renderSettingsNav() {
  return SETTINGS_SECTIONS.map((section) => `
    <button class="${activeSettingsSection === section.id ? "active" : ""}" data-action="set-settings-section" data-section="${section.id}">
      ${icon(section.icon)}${escapeHtml(t(`settings.${section.id}`, section.label))}
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

function getUserProfile() {
  state.settings ||= {};
  state.settings.userProfile ||= { displayName: t("account.defaultName", "本地用户"), avatarDataUrl: "" };
  return state.settings.userProfile;
}

function renderUserAvatar(sizeClass = "") {
  const profile = getUserProfile();
  const name = String(profile.displayName || t("account.defaultName", "本地用户")).trim() || t("account.defaultName", "本地用户");
  const initial = Array.from(name)[0] || t("account.initial", "本");
  const avatar = String(profile.avatarDataUrl || "");
  return `<div class="avatar ${escapeHtml(sizeClass)}">${avatar ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}" />` : `<span>${escapeHtml(initial)}</span>`}</div>`;
}

function renderAccountSettingsSection() {
  const profile = getUserProfile();
  return `
    <div class="account-settings-panel">
      <div class="settings-row account-avatar-row">
        <div>
          <strong>${escapeHtml(t("account.avatar", "用户头像"))}</strong>
          <span>${escapeHtml(t("account.avatar.desc", "用于侧边栏和本地工作区身份展示。"))}</span>
        </div>
        <div class="account-avatar-actions">
          ${renderUserAvatar("large")}
          <input id="accountAvatarInput" type="file" accept="image/*" hidden />
          <button class="secondary-button" data-action="choose-account-avatar">${escapeHtml(t("account.changeAvatar", "更换头像"))}</button>
          <button class="secondary-button" data-action="clear-account-avatar" ${profile.avatarDataUrl ? "" : "disabled"}>${escapeHtml(t("account.remove", "移除"))}</button>
        </div>
      </div>
      <div class="settings-row account-name-row">
        <div>
          <strong>${escapeHtml(t("account.name", "用户名"))}</strong>
          <span>${escapeHtml(t("account.name.desc", "修改后会显示在左下角账户区域。"))}</span>
        </div>
        <div class="settings-inline-field">
          <input id="accountDisplayName" maxlength="32" value="${escapeHtml(profile.displayName || t("account.defaultName", "本地用户"))}" placeholder="${escapeHtml(t("account.name.placeholder", "请输入用户名"))}" />
        </div>
      </div>
    </div>
  `;
}

function renderHelpActionItem({ label, action, url = "", external = false }) {
  return `
    <button class="help-action-item" data-action="${escapeHtml(action)}" ${url ? `data-url="${escapeHtml(url)}"` : ""}>
      <span class="help-action-label">${escapeHtml(label)}</span>
      ${external ? `<span class="help-action-external" aria-hidden="true">${icon("external")}</span>` : ""}
    </button>
  `;
}

function renderHelpSettingsSection() {
  return `
    <div class="help-settings-panel">
      <div class="help-action-list">
        ${renderHelpActionItem({ label: t("help.docs", "帮助文档"), action: "open-product-url", url: PRODUCT_DOCS_URL, external: true })}
        ${renderHelpActionItem({ label: t("help.feedback", "意见反馈"), action: "show-feedback-modal" })}
        ${renderHelpActionItem({ label: t("help.contact", "联系我们"), action: "open-product-url", url: PRODUCT_HELP_URL, external: true })}
      </div>
      <div class="help-open-source-links">
        <button data-action="open-product-url" data-url="${escapeHtml(PRODUCT_LICENSE_URL)}">${escapeHtml(t("help.license", "开源许可"))}</button>
        <span>|</span>
        <button data-action="open-product-url" data-url="${escapeHtml(PRODUCT_HELP_URL)}">${escapeHtml(t("help.home", "项目主页"))}</button>
      </div>
    </div>
  `;
}

function showFeedbackModal() {
  let backdrop = document.querySelector(".feedback-modal-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "feedback-modal-backdrop";
    document.body.appendChild(backdrop);
  }
  backdrop.innerHTML = `
    <div class="modal feedback-modal">
      <div class="feedback-modal-head">
        <h2>${escapeHtml(t("feedback.title", "意见反馈"))}</h2>
        <button class="feedback-close-button" type="button" data-action="close-feedback-modal" aria-label="${escapeHtml(t("common.close", "关闭"))}">×</button>
      </div>
      <div class="feedback-input-card">
        <textarea id="feedbackContent" maxlength="300" placeholder="${escapeHtml(t("feedback.placeholder", "你可以描述你遇到的问题"))}"></textarea>
        <div class="feedback-input-footer">
          <button class="feedback-upload-button" type="button" data-action="choose-feedback-images">
            ${icon("image")}<span data-feedback-image-count>${escapeHtml(t("feedback.uploadImages", "上传图片 ({{count}}/4)", { count: 0 }))}</span>
          </button>
          <span class="feedback-char-count" data-feedback-char-count>0/300</span>
        </div>
        <input id="feedbackImageInput" type="file" accept="image/*" multiple hidden />
      </div>
      <div class="feedback-submit-row">
        <label class="feedback-log-consent">
          <input id="feedbackUploadLogs" type="checkbox" checked />
          <span class="feedback-checkbox" aria-hidden="true">${icon("check")}</span>
          <span>${escapeHtml(t("feedback.uploadLogsConsent", "上传日志，仅用于排查问题，可能包含对话记录、设备信息等数据。详情请查阅"))} <button type="button" data-action="open-product-url" data-url="${escapeHtml(PRODUCT_PRIVACY_URL)}">${escapeHtml(t("feedback.privacyStatement", "隐私保护声明"))}</button></span>
        </label>
        <button class="feedback-submit-button" type="button" data-action="submit-feedback">${escapeHtml(t("feedback.submit", "提交"))}</button>
      </div>
    </div>
  `;
}

function updateAccountDisplayName(value) {
  const profile = getUserProfile();
  profile.displayName = String(value || "").trimStart().slice(0, 32) || t("account.defaultName", "本地用户");
  saveState();
  document.querySelectorAll(".profile-name").forEach((node) => {
    node.textContent = profile.displayName;
  });
}

function updateAccountAvatarFromFile(file) {
  if (!file || !file.type?.startsWith("image/")) {
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const profile = getUserProfile();
    profile.avatarDataUrl = String(reader.result || "");
    saveState();
    render();
    showSettingsModal();
  });
  reader.readAsDataURL(file);
}

function updateFeedbackCounters() {
  const textarea = document.getElementById("feedbackContent");
  const charCounter = document.querySelector("[data-feedback-char-count]");
  if (textarea && charCounter) {
    charCounter.textContent = `${Math.min(textarea.value.length, 300)}/300`;
  }
  const fileInput = document.getElementById("feedbackImageInput");
  const imageCounter = document.querySelector("[data-feedback-image-count]");
  if (fileInput && imageCounter) {
    imageCounter.textContent = t("feedback.uploadImages", "上传图片 ({{count}}/4)", { count: Math.min(fileInput.files?.length || 0, 4) });
  }
}

async function openProductUrl(url = PRODUCT_HELP_URL) {
  const targetUrl = normalizeBrowserUrl(url || PRODUCT_HELP_URL);
  try {
    if (window.cossAPI?.openExternalUrl) {
      await window.cossAPI.openExternalUrl(targetUrl);
      return;
    }
  } catch (error) {
    recordAppLog("help.open-url.failed", { url: targetUrl, error: error.message }, "warn");
  }
  if (getProject()) {
    openPopupUrlInsideCosSBrowser(targetUrl);
  } else {
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }
}

function renderMemorySettingsSection() {
  const project = getProject();
  if (!project) {
    return renderSettingsPlaceholder(t("memory.title", "记忆"), t("memory.noProject", "当前没有打开的项目。"), [t("memory.noProject.hint", "先创建或选择一个项目")]);
  }
  const memory = ensureProjectMemoryShape(project);
  const taskCount = memory.taskHistory.length;
  const artifactCount = memory.artifacts.length;
  const decisionCount = memory.decisions.length;
  const updatedAt = memory.updatedAt ? formatDateTime(memory.updatedAt) : t("memory.notRefreshed", "尚未刷新");
  return `
    <div class="settings-section-title">
      <strong>${escapeHtml(t("memory.title.projectMemory", "项目记忆"))}</strong>
      <span>${escapeHtml(t("memory.desc", "项目记忆会在新建任务时提供给任务规划和协作者，帮助延续项目背景与既有决策。"))}</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("memory.currentProject", "当前项目"))}</strong>
        <span>${escapeHtml(project.name)} · ${escapeHtml(project.path || "")}</span>
      </div>
      <button class="settings-toggle-button" data-action="toggle-project-memory" aria-pressed="${memory.enabled !== false}">
        <span class="settings-toggle ${memory.enabled !== false ? "on" : ""}"></span>
      </button>
    </div>
    <div class="settings-row project-memory-actions-row">
      <div>
        <strong>${escapeHtml(t("memory.status", "记忆状态"))}</strong>
        <span>${escapeHtml(t("memory.status.summary", "{{enabled}} · {{taskCount}} 个任务摘要 · {{artifactCount}} 个产物 · {{decisionCount}} 条决策 · {{updatedAt}}", { enabled: memory.enabled !== false ? t("memory.status.on", "已开启") : t("memory.status.off", "已关闭"), taskCount, artifactCount, decisionCount, updatedAt }))}</span>
      </div>
      <div class="settings-action-stack">
        <button class="secondary-button" data-action="refresh-project-memory">${escapeHtml(t("memory.refresh", "刷新记忆"))}</button>
        <button class="secondary-button" data-action="save-project-memory">${escapeHtml(t("memory.save", "保存备注"))}</button>
        <button class="secondary-button danger" data-action="clear-project-memory">${escapeHtml(t("memory.clear", "清空"))}</button>
      </div>
    </div>
    <div class="project-memory-panel">
      <label for="projectMemoryManualNotes">${escapeHtml(t("memory.manualNotes.label", "手写项目备注"))}</label>
      <textarea id="projectMemoryManualNotes" spellcheck="false" placeholder="${escapeHtml(t("memory.manualNotes.placeholder", "例如：项目技术栈、接口约定、目录规范、已确认的限制条件。"))}">${escapeHtml(memory.manualNotes || "")}</textarea>
      <div class="project-memory-help">${escapeHtml(t("memory.manualNotes.help", "这部分会被原样放入新任务规划提示词，适合记录架构选择、目录约定、已确认边界和不要重复的事项。"))}</div>
    </div>
    <div class="project-memory-panel">
      <label>${escapeHtml(t("memory.autoSummary", "自动摘要"))}</label>
      <pre class="project-memory-summary">${escapeHtml(formatProjectMemoryForDisplay(memory))}</pre>
    </div>
  `;
}

function renderSystemSettingsSection() {
  const activeModel = getActiveModelConfig();
  return `
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("system.version", "应用版本"))}</strong>
        <span>${escapeHtml(t("system.version.desc", "当前 CosS 桌面应用版本。"))}</span>
      </div>
      <span class="settings-value">${APP_VERSION}</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("system.workspace", "默认工作区路径"))}</strong>
        <span>${escapeHtml(t("system.workspace.desc", "新项目会在创建时选择工作区路径。"))}</span>
      </div>
      <span class="settings-value">${escapeHtml(t("system.workspace.value", "创建项目时选择"))}</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("system.language", "语言"))}</strong>
        <span>${escapeHtml(t("system.language.desc", "设置应用界面显示语言。"))}</span>
      </div>
      <div class="settings-inline-field">
        <select id="appLanguageSelect">
          ${LANGUAGE_OPTIONS.map((language) => `<option value="${escapeHtml(language.id)}" ${state.settings.language === language.id ? "selected" : ""}>${escapeHtml(language.label)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("system.model", "当前模型摘要"))}</strong>
        <span>${escapeHtml(t("system.model.summary", "{{label}} · {{modelName}}。完整配置请进入“模型”。", { label: activeModel.label, modelName: activeModel.modelName }))}</span>
      </div>
      <button class="secondary-button" data-action="set-settings-section" data-section="model">${escapeHtml(t("system.model.open", "打开模型"))}</button>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("system.agent", "Agent 摘要"))}</strong>
        <span>${escapeHtml(t("system.agent.summary", "当前 Agent 后端为 {{provider}}。终端后端与环境检测请进入“智能体设置”。", { provider: getAgentProviderLabel(state.settings.agentProvider) }))}</span>
      </div>
      <button class="secondary-button" data-action="set-settings-section" data-section="agent">${escapeHtml(t("system.agent.open", "打开智能体"))}</button>
    </div>
  `;
}

function renderMcpConfigStatus() {
  if (!mcpConfigStatus) {
    return `
      <div class="model-connectivity-status idle" data-mcp-config-status>
        <strong>${escapeHtml(t("mcpConfig.notDetected", "尚未检测当前项目协作配置"))}</strong>
        <span>${escapeHtml(t("mcpConfig.notDetected.desc", "点击“检测配置”可检查当前项目的 Agent 协作能力是否可用。"))}</span>
      </div>
    `;
  }

  if (mcpConfigStatus.state === "writing" || mcpConfigStatus.state === "checking") {
    return `
      <div class="model-connectivity-status testing" data-mcp-config-status>
        <strong>${escapeHtml(mcpConfigStatus.state === "checking" ? t("mcpConfig.checking", "正在检测协作配置") : t("mcpConfig.generating", "正在生成协作配置"))}</strong>
        <span>${escapeHtml(mcpConfigStatus.message || t("common.pleaseWait", "请稍候..."))}</span>
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
      <strong>${escapeHtml(mcpConfigStatus.ok ? t("mcpConfig.healthy", "项目协作配置健康") : t("mcpConfig.needFix", "项目协作配置需要修复"))}</strong>
      <span>${escapeHtml(mcpConfigStatus.error || t("mcpConfig.checkedAt", "检测时间{{time}}", { time: checkedAt }))}</span>
      <span>.mcp.json：${rootReady ? escapeHtml(t("mcpConfig.discoverable", "可发现")) : root.exists ? root.valid ? escapeHtml(t("mcpConfig.serverMismatch", "coss server 不匹配")) : escapeHtml(t("mcpConfig.parseFailed", "解析失败：{{error}}", { error: root.error || t("mcpConfig.jsonInvalid", "JSON 无效") })) : escapeHtml(t("mcpConfig.missing", "缺失"))}${root.path ? ` · ${escapeHtml(root.path)}` : ""}</span>
      <span>.coss/mcp/coss-mcp.json：${cossReady ? escapeHtml(t("mcpConfig.synced", "已同步")) : coss.exists ? coss.valid ? escapeHtml(t("mcpConfig.contentMismatch", "内容不匹配")) : escapeHtml(t("mcpConfig.parseFailed", "解析失败：{{error}}", { error: coss.error || t("mcpConfig.jsonInvalid", "JSON 无效") })) : escapeHtml(t("mcpConfig.missing", "缺失"))}${coss.path ? ` · ${escapeHtml(coss.path)}` : ""}</span>
      <div class="mcp-agent-discovery-list">
        ${providers.map(([label, ready]) => `<span class="${ready ? "ready" : "missing"}">${escapeHtml(label)}：${ready ? escapeHtml(t("mcpConfig.discoverable", "可发现")) : escapeHtml(t("mcpConfig.needsFix", "待修复"))}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderAgentSettingsSection() {
  return `
    <div class="settings-row agent-provider-row">
      <div>
        <strong>${escapeHtml(t("agent.terminal.title", "Agent 终端"))}</strong>
        <span>${escapeHtml(t("agent.terminal.desc", "选择创建角色 Agent 时默认使用的终端后端��"))}</span>
      </div>
      <div class="agent-provider-switch">
        ${renderAgentProviderOption("claude", "Claude Code", t("agent.provider.claude.desc", "适合 Claude Code 交互式开发任务。"))}
        ${renderAgentProviderOption("codex", "Codex", t("agent.provider.codex.desc", "适合 Codex CLI 代码代理任务。"))}
        ${renderAgentProviderOption("codebuddy", "CodeBuddy Code", t("agent.provider.codebuddy.desc", "适合 CodeBuddy Code 代码代理任务。"))}
      </div>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.collabConfig.title", "Agent 协作配置"))}</strong>
        <span>${escapeHtml(t("agent.collabConfig.desc", "为当前项目启用 Agent 协作能力，支持任务进展同步、审批和结果回传。"))}</span>
      </div>
      <div class="settings-action-stack">
        <button class="settings-toggle-button" data-action="toggle-agent-mcp-auto-config" aria-pressed="${state.settings.agentMcpAutoConfigEnabled === true}" title="${escapeHtml(t("agent.mcpAutoConfig.title", "创建 Agent 终端时自动维护项目协作配置"))}">
          <span class="settings-toggle ${state.settings.agentMcpAutoConfigEnabled === true ? "on" : ""}"></span>
        </button>
        <button class="secondary-button" data-action="check-project-mcp-config">${escapeHtml(t("mcpConfig.detect", "检测配置"))}</button>
        <button class="secondary-button" data-action="write-project-mcp-config">${escapeHtml(t("agent.collabConfig.fix", "生成/修复"))}</button>
        <button class="secondary-button" data-action="show-mcp-audit">${escapeHtml(t("agent.collabConfig.audit", "查看审计"))}</button>
      </div>
    </div>
    <div class="settings-status-slot">${renderMcpConfigStatus()}</div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.claude.autoDetect", "Claude Code 自动检测"))}</strong>
        <span>${escapeHtml(t("agent.claude.autoDetect.desc", "创建 Agent 终端时，如果选择 Claude Code，会沿用自动检测与 winget 安装流程。"))}</span>
      </div>
      <button class="secondary-button" data-action="check-claude">${escapeHtml(t("commandAudit.recheck", "重新检测"))}</button>
    </div>
    <div class="settings-status-slot" id="claudeStatusMount">${renderClaudeStatus(latestClaudeStatus)}</div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.claude.loginTest", "Claude Code 登录测试"))}</strong>
        <span>${escapeHtml(t("agent.loginTest.desc", "手动调用远程 API 校验当前凭据是否可用；没有 API key 时只显示跳过原因。"))}</span>
      </div>
      <button class="secondary-button" data-action="test-agent-login" data-provider="claude">${escapeHtml(t("agent.loginTest.button", "测试登录态"))}</button>
    </div>
    <div class="settings-status-slot" id="claudeLoginTestMount">${renderAgentLoginTestStatus("claude")}</div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.codex.command", "Codex 命令"))}</strong>
        <span>${escapeHtml(t("agent.codex.command.desc", "默认查找 codex；不可运行时会通过 npm 自动安装 Codex CLI。需要自定义路径时，可设置环境变量 COSS_CODEX_COMMAND。"))}</span>
      </div>
      <span class="settings-value">codex</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.codex.autoDetect", "Codex 自动检测"))}</strong>
        <span>${escapeHtml(t("agent.codex.autoDetect.desc", "检测 codex、npm、PATH 命中路径和 WindowsApps 应用包冲突。"))}</span>
      </div>
      <button class="secondary-button" data-action="check-codex">${escapeHtml(t("commandAudit.recheck", "重新检测"))}</button>
    </div>
    <div class="settings-status-slot" id="codexStatusMount">${renderCodexStatus(latestCodexStatus)}</div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.codex.loginTest", "Codex 登录测试"))}</strong>
        <span>${escapeHtml(t("agent.codex.loginTest.desc", "手动调用 OpenAI/Codex 远程 API 校验当前凭据是否可用；没有 key 时只显示跳过原因。"))}</span>
      </div>
      <button class="secondary-button" data-action="test-agent-login" data-provider="codex">${escapeHtml(t("agent.loginTest.button", "测试登录态"))}</button>
    </div>
    <div class="settings-status-slot" id="codexLoginTestMount">${renderAgentLoginTestStatus("codex")}</div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.codeBuddy.command", "CodeBuddy Code 命令"))}</strong>
        <span>${escapeHtml(t("agent.codeBuddy.command.desc", "默认查找 codebuddy，并兼容 cbc；不可运行时会通过 npm 自动安装 CodeBuddy Code CLI。需要自定义路径时，可设置环境变量 COSS_CODEBUDDY_COMMAND。"))}</span>
      </div>
      <span class="settings-value">codebuddy</span>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.codeBuddy.apiKey", "CodeBuddy Code API Key"))}</strong>
        <span>${escapeHtml(t("agent.codeBuddy.apiKey.desc", "创建 CodeBuddy Agent 终端时会写入 CODEBUDDY_API_KEY 环境变量；该值需要用户自行填写。"))}</span>
      </div>
      <div class="settings-inline-field">
        <input type="password" autocomplete="off" placeholder="${escapeHtml(t("agent.codeBuddyApiKey.placeholder", "填写 CodeBuddy API Key"))}" value="${escapeHtml(state.settings.codeBuddyApiKey || "")}" data-codebuddy-api-key />
      </div>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.codeBuddy.autoDetect", "CodeBuddy Code 自动检测"))}</strong>
        <span>${escapeHtml(t("agent.codeBuddy.autoDetect.desc", "检测 codebuddy、cbc、npm 和 PATH 命中路径。"))}</span>
      </div>
      <button class="secondary-button" data-action="check-codebuddy">${escapeHtml(t("commandAudit.recheck", "重新检测"))}</button>
    </div>
    <div class="settings-status-slot" id="codeBuddyStatusMount">${renderCodeBuddyStatus(latestCodeBuddyStatus)}</div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.codeBuddy.loginTest", "CodeBuddy Code 登录测试"))}</strong>
        <span>${escapeHtml(t("agent.codeBuddy.loginTest.desc", "手动调用 CodeBuddy 兼容远程接口校验当前 API Key 是否可用；没有 key 时只显示跳过原因。"))}</span>
      </div>
      <button class="secondary-button" data-action="test-agent-login" data-provider="codebuddy">${escapeHtml(t("agent.loginTest.button", "测试登录态"))}</button>
    </div>
    <div class="settings-status-slot" id="codeBuddyLoginTestMount">${renderAgentLoginTestStatus("codebuddy")}</div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.promptTemplate.title", "Agent 角色提示词模板"))}</strong>
        <span>${escapeHtml(t("agent.promptTemplate.desc", "创建 Claude Code、Codex 或 CodeBuddy Agent 终端时，会把模板渲染后写入 COSS_ROLE_PROMPT，并同步会话与任务上下文。"))}</span>
      </div>
      <button class="secondary-button" data-action="reset-agent-prompt-template">${escapeHtml(t("agent.promptTemplate.reset", "恢复默认"))}</button>
    </div>
    <div class="settings-code-editor">
      <textarea data-agent-prompt-template spellcheck="false">${escapeHtml(state.settings.agentPromptTemplate || getDefaultAgentPromptTemplate())}</textarea>
      <div class="settings-code-help">
        ${escapeHtml(t("agent.promptTemplate.help", "支持占位符：{{roleName}}、{{roleDescription}}、{{projectName}}、{{workspace}}、{{agentProvider}}、{{agentPermissionLabel}}、{{agentPermissionInstructions}}、{{sessionId}}、{{taskTitle}}、{{taskGoal}}、{{subtaskTitle}}、{{subtaskDescription}}。"))}
      </div>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("agent.fallbackToShell.title", "Agent 失败回退到 PowerShell"))}</strong>
        <span>${escapeHtml(t("agent.fallbackToShell.desc", "关闭后，Agent 启动或安装失败时只保留错误日志窗口，不进入普通 PowerShell 提示符。"))}</span>
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
        <strong>${escapeHtml(t("security.permissionMode.title", "Agent 权限模式"))}</strong>
        <span>${escapeHtml(t("security.permissionMode.desc", "当前模式：{{label}}。新建 Agent 终端和后续任务投递都会携带该权限说明。", { label: activePolicy.label }))}</span>
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
        <strong>${escapeHtml(t("security.terminalConfirm.title", "终端安全确认"))}</strong>
        <span>${escapeHtml(t("security.terminalConfirm.desc", "高风险命令会在执行前弹出确认窗口，并写入命令审计日志。"))}</span>
      </div>
      <span class="settings-toggle on"></span>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("security.auditLog.title", "命令审计日志"))}</strong>
        <span>${escapeHtml(t("security.auditLog.desc", "查看角色终端的高风险命令、确认状态和执行记录。"))}</span>
      </div>
      <button class="secondary-button" data-action="show-logs">${escapeHtml(t("security.auditLog.open", "打开日志"))}</button>
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
      <strong>${escapeHtml(storageOperationStatus.title || (storageOperationStatus.ok ? t("storage.operationComplete", "操作完成") : t("storage.operationFailed", "操作失败")))}</strong>
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
        <strong>${escapeHtml(t("storage.sqlite.title", "SQLite 状态存储"))}</strong>
        <span>${escapeHtml(info ? (info.sqliteEnabled ? t("storage.sqlite.enabled", "当前工作区状态已使用 SQLite 文件保存。") : info.sqliteReason) : t("storage.notRead", "尚未读取存储信息。"))}</span>
      </div>
      <button class="secondary-button" data-action="refresh-storage-info">${escapeHtml(t("common.refresh", "刷新"))}</button>
    </div>
    <div class="settings-status-slot storage-status-card" data-storage-info>
      ${
        info
          ? `
            <strong>${escapeHtml(info.mode)} · Schema ${escapeHtml(info.schemaVersion)}</strong>
            <span>${escapeHtml(t("storage.sqlite.path", "SQLite：{{path}} · {{size}} · {{time}}", { path: info.sqlitePath || t("storage.sqlite.disabled", "未启用"), size: formatFileSize(info.sqliteSize), time: formatDateTime(info.sqliteModifiedAt) }))}</span>
            <span>${escapeHtml(t("storage.jsonSnapshot", "JSON 兼容快照：{{path}} · {{size}}", { path: info.statePath || "", size: formatFileSize(info.stateSize) }))}</span>
            <span>${escapeHtml(t("storage.backupDir", "备份目录：{{path}} · {{count}} 个备份", { path: info.backupDirectory || "", count: info.backupCount || 0 }))}</span>
          `
          : escapeHtml(t("storage.clickRefresh", "点击刷新读取 SQLite、JSON 快照和备份信息。"))
      }
    </div>
    ${renderStorageOperationStatus()}
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("storage.export.title", "导出状态数据"))}</strong>
        <span>${escapeHtml(t("storage.export.desc", "导出当前 SQLite 中的工作区状态，便于迁移到其他机器或人工备份。"))}</span>
      </div>
      <button class="secondary-button" data-action="export-storage-state">${escapeHtml(t("storage.export.button", "导出"))}</button>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("storage.import.title", "导入状态数据"))}</strong>
        <span>${escapeHtml(t("storage.import.desc", "导入前会自动创建备份，导入后会写入 SQLite 并刷新 JSON 兼容快照。"))}</span>
      </div>
      <button class="secondary-button" data-action="import-storage-state">${escapeHtml(t("storage.import.button", "导入"))}</button>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("storage.backup.title", "立即创建备份"))}</strong>
        <span>${escapeHtml(t("storage.backup.desc", "把当前 SQLite 状态文件复制到备份目录，保留最近 12 个备份。"))}</span>
      </div>
      <button class="secondary-button" data-action="create-storage-backup">${escapeHtml(t("storage.backup.button", "创建备份"))}</button>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("storage.diagnostics.title", "导出诊断包"))}</strong>
        <span>${escapeHtml(t("storage.diagnostics.desc", "包含存储摘要、脱敏状态快照和近期日志，用于排查异常恢复或协作问题。"))}</span>
      </div>
      <button class="secondary-button" data-action="export-diagnostics-package">${escapeHtml(t("storage.diagnostics.button", "导出诊断包"))}</button>
    </div>
    <div class="settings-row">
      <div>
        <strong>${escapeHtml(t("storage.openDataDir.title", "打开数据目录"))}</strong>
        <span>${escapeHtml(t("storage.openDataDir.desc", "查看 SQLite、JSON 快照、备份、诊断包和日志目录。"))}</span>
      </div>
      <button class="secondary-button" data-action="open-storage-directory">${escapeHtml(t("storage.openDataDir.button", "打开目录"))}</button>
    </div>
    <div class="storage-backup-list">
      <strong>${escapeHtml(t("storage.recentBackups", "最近备份"))}</strong>
      ${
        backups.length
          ? backups.map((backup) => `
              <div class="storage-backup-item">
                <span>${escapeHtml(backup.name)}</span>
                <em>${escapeHtml(backup.type)} · ${formatFileSize(backup.size)} · ${escapeHtml(formatDateTime(backup.createdAt))}</em>
              </div>
            `).join("")
          : `<span class="muted-text">${escapeHtml(t("storage.noBackups", "暂无备份。"))}</span>`
      }
    </div>
  `;
}

function renderSettingsContent() {
  return {
    account: renderAccountSettingsSection,
    system: renderSystemSettingsSection,
    agent: renderAgentSettingsSection,
    memory: renderMemorySettingsSection,
    model: renderModelSettingsSection,
    data: renderStorageSettingsSection,
    security: renderSecuritySettingsSection,
    help: renderHelpSettingsSection
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
        <button class="settings-close" title="${escapeHtml(t("common.close", "关闭"))}" data-action="close-modal">×</button>
        <h2>${escapeHtml(t(`settings.${activeSection.id}`, activeSection.label))}</h2>
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
    mount.innerHTML = `<div class="claude-status empty" data-claude-status>${escapeHtml(t("app.loading.claude", "正在检测 Claude Code 环境..."))}</div>`;
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
      title: t("storage.readFailed", "读取存储信息失败"),
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
    mount.innerHTML = `<div class="claude-status empty" data-codex-status>${escapeHtml(t("app.loading.codex", "正在检测 Codex CLI 环境..."))}</div>`;
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
    mount.innerHTML = `<div class="claude-status empty" data-codebuddy-status>${escapeHtml(t("app.loading.codebuddy", "正在检测 CodeBuddy Code 环境..."))}</div>`;
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
      error: "当前运行环境未暴露 协作配置检测接口。"
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
    mcpConfigStatus = result || { ok: false, error: "协作配置检测无返回。" };
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
      error: "当前运行环境未暴露 协作配置生成接口。"
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
        error: result?.error || "协作配置生成失败。"
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
      <h2>${escapeHtml(t("security.mcpAudit.title", "协作工具审计"))}</h2>
      <p>${eventsCount === null
        ? escapeHtml(t("security.mcpAudit.loading", "正在读取最近的协作工具日志。"))
        : escapeHtml(t("security.mcpAudit.summary", "最近 {{count}} 条协作工具事件。可按角色、任务、工具和关键词过滤。", { count: eventsCount }))}</p>
      <div class="mcp-audit-filterbar">
        <label>
          <span>${escapeHtml(t("taskList.filter.role", "角色"))}</span>
          <select id="mcpAuditRoleFilter">
            <option value="">${escapeHtml(t("taskList.filter.allRoles", "全部角色"))}</option>
            ${roleOptions}
          </select>
        </label>
        <label>
          <span>${escapeHtml(t("security.mcpAudit.task", "任务"))}</span>
          <select id="mcpAuditTaskFilter">
            <option value="">${escapeHtml(t("security.mcpAudit.allTasks", "全部任务"))}</option>
            ${taskOptions}
          </select>
        </label>
        <label>
          <span>${escapeHtml(t("security.mcpAudit.tool", "工具"))}</span>
          <select id="mcpAuditToolFilter">
            <option value="">${escapeHtml(t("security.mcpAudit.allTools", "全部工具"))}</option>
            ${toolOptions}
          </select>
        </label>
        <label>
          <span>${escapeHtml(t("nav.search", "搜索"))}</span>
          <input id="mcpAuditQueryFilter" value="${escapeHtml(mcpAuditFilters.query || "")}" placeholder="${escapeHtml(t("security.mcpAudit.queryPlaceholder", "事件、payload、错误"))}">
        </label>
        <button class="secondary-button compact" data-action="apply-mcp-audit-filters">${escapeHtml(t("common.apply", "应用"))}</button>
      </div>
      ${body}
      <div class="modal-actions">
        <button class="secondary-button" data-action="show-settings">${escapeHtml(t("security.mcpAudit.backToSettings", "返回设置"))}</button>
        <button class="secondary-button" data-action="show-mcp-audit">${escapeHtml(t("common.refresh", "刷新"))}</button>
        <button class="primary-button" data-action="close-modal">${escapeHtml(t("common.close", "关闭"))}</button>
      </div>
    </div>
  `;

  renderModal(`
    ${renderAuditShell(`<div class="message-empty">${escapeHtml(t("common.loading", "正在读取..."))}</div>`)}
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
      <h2>${escapeHtml(t("mcpConfig.enable.title", "启用 Agent 协作配置"))}</h2>
      <p>${escapeHtml(t("mcpConfig.enable.desc", "当前项目的 Agent 协作配置尚未就绪。生成后，协作者可以同步任务进展并回传结果。"))}</p>
      <div class="model-connectivity-status missing">
        <strong>${escapeHtml(task?.title || t("task.create.title", "新任务"))} · ${escapeHtml(t("mcpConfig.needFix", "项目协作配置需要修复"))}</strong>
        <span>${escapeHtml(status?.error || t("mcpConfig.missingOrMismatch", "项目协作配置缺失或不匹配。"))}</span>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("mcpConfig.later", "暂不处理"))}</button>
        <button class="secondary-button" data-action="open-agent-settings">${escapeHtml(t("system.agent.open", "打开智能体设置"))}</button>
        <button class="primary-button" data-action="write-task-mcp-config">${escapeHtml(t("mcpConfig.fixConfig", "生成/修复配置"))}</button>
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

  if (!String(config.baseUrl || "").trim() || !String(config.modelName || "").trim()) {
    recordAppLog("model.connectivity.skipped", {
      provider: config.id,
      modelName: config.modelName,
      reason: "missing-endpoint-or-model"
    }, "warn");
    modelConnectivityStatuses[config.id] = {
      ok: false,
      checkedAt: new Date().toISOString(),
      error: "请先填写 Base URL 和模型名称再测试连通性。"
    };
    refreshSettingsModalIfOpen();
    return;
  }

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
    get label() { return t("menu.file", "文件"); },
    items: [
      { get label() { return t("menu.file.newWindow", "新建窗口"); }, command: "new-window", shortcut: "Ctrl+N" },
      { get label() { return t("menu.file.newTask", "新建任务"); }, command: "show-create-task", shortcut: "Ctrl+Shift+T" },
      { get label() { return t("menu.file.newProject", "新建项目"); }, command: "show-create-project", shortcut: "Ctrl+Shift+N" },
      { type: "separator" },
      { get label() { return t("nav.settings", "设置"); }, command: "show-settings", shortcut: "Ctrl+," },
      { type: "separator" },
      { get label() { return t("menu.file.closeWindow", "关闭窗口"); }, command: "close-window", shortcut: "Ctrl+W" }
    ]
  },
  {
    id: "edit",
    get label() { return t("menu.edit", "编辑"); },
    items: [
      { get label() { return t("menu.edit.undo", "撤销(U)"); }, command: "edit-undo", shortcut: "Ctrl+Z" },
      { get label() { return t("menu.edit.redo", "重做(R)"); }, command: "edit-redo", shortcut: "Ctrl+Y" },
      { type: "separator" },
      { get label() { return t("menu.edit.cut", "剪切(T)"); }, command: "edit-cut", shortcut: "Ctrl+X" },
      { get label() { return t("menu.edit.copy", "复制(C)"); }, command: "edit-copy", shortcut: "Ctrl+C" },
      { get label() { return t("menu.edit.paste", "粘贴(P)"); }, command: "edit-paste", shortcut: "Ctrl+V" },
      { type: "separator" },
      { get label() { return t("menu.edit.selectAll", "全选(A)"); }, command: "edit-select-all", shortcut: "Ctrl+A" }
    ]
  },
  {
    id: "help",
    get label() { return t("menu.help", t("settings.help", "帮助")); },
    items: [
      { get label() { return t("menu.help.openLogs", "打开日志目录"); }, command: "open-log-directory" },
      { get label() { return t("about.title", "关于 CosS"); }, command: "show-about" }
    ]
  }
];

function renderAppTitlebar() {
  return `
    <header class="app-titlebar">
      <div class="app-titlebar-left">
        <div class="app-titlemark">
          <img class="app-title-icon" src="./Logo.png" alt="" aria-hidden="true" draggable="false" />
          <span class="app-title-text">CosS</span>
        </div>
        <nav class="app-menu-bar" aria-label="${escapeHtml(t("menu.appMenu", "应用菜单"))}">
          ${APP_MENU_DEFINITIONS.map(renderAppMenuButton).join("")}
        </nav>
      </div>
      <div class="app-window-controls" aria-label="${escapeHtml(t("window.controls", "窗口控制"))}">
        <button class="app-window-control" title="${escapeHtml(t("window.minimize", "最小化"))}" data-action="window-control" data-window-action="minimize" aria-label="${escapeHtml(t("window.minimize", "最小化"))}">-</button>
        <button class="app-window-control" title="${escapeHtml(isWindowMaximized ? t("window.restore", "还原") : t("window.maximize", "最大化"))}" data-action="window-control" data-window-action="toggle-maximize" aria-label="${escapeHtml(isWindowMaximized ? t("window.restore", "还原") : t("window.maximize", "最大化"))}">${isWindowMaximized ? "❐" : "□"}</button>
        <button class="app-window-control close" title="${escapeHtml(t("common.close", "关闭"))}" data-action="window-control" data-window-action="close" aria-label="${escapeHtml(t("common.close", "关闭"))}">×</button>
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
  syncI18nLanguage();
  document.documentElement.lang = getAppLanguage();
  document.documentElement.dir = getAppLanguage() === "ar-SA" ? "rtl" : "ltr";
  const project = getProject();
  const sidebarContent = sidebarCollapsed ? "" : `${renderSidebar(project)}<div class="sidebar-resizer" data-sidebar-resizer title="${escapeHtml(t("sidebar.resizer.title", "拖动调整侧边栏宽度"))}"></div>`;
  captureTaskListScrollState();
  hydratedBrowserViews.clear();

  // innerHTML 会销毁所有 DOM（包括 Phaser canvas），必须先销毁引擎实例
  if (worldEngineInstance) {
    worldEngineInstance.destroy();
    worldEngineInstance = null;
  }

  appRoot.innerHTML = `
    <div class="app-frame">
      ${renderAppTitlebar()}
      <main class="app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}" style="--sidebar-width:${sidebarWidth}px;">
        ${sidebarContent}
        ${renderWorkspace(project)}
      </main>
      ${contextMenu ? renderContextMenu() : ""}
      ${roleMenu ? renderRoleMenu() : ""}
    </div>
  `;

  attachWindowFocusHandlers();
  attachWindowDragHandlers();
  attachSidebarResizeHandlers();
  attachAgentBlueprintDragHandlers();
  hydrateTerminalWindows();
  hydrateBrowserViews();
  restoreTaskListScrollState();
  mountWorldEngineIfNeeded();
}

let worldEngineInstance = null;

function mountWorldEngineIfNeeded() {
  const shell = document.querySelector(".world-canvas-shell");
  const currentWorldId = shell?.closest("[data-world-id]")?.dataset?.worldId;
  const world = currentWorldId ? getWorldById(currentWorldId) : null;

  if (!shell || !world) {
    if (worldEngineInstance) {
      worldEngineInstance.destroy();
      worldEngineInstance = null;
    }
    return;
  }

  if (worldEngineInstance) {
    worldEngineInstance.updateWorld(world, {
      selectedAgentId: worldEngineInstance.selectedAgentId || ""
    });
    return;
  }

  const existingPhaserCanvas = shell.querySelector("canvas");
  if (existingPhaserCanvas) {
    shell.querySelector(".world-engine-placeholder")?.remove();
  } else {
    const placeholder = shell.querySelector(".world-engine-placeholder");
    if (placeholder) placeholder.remove();
  }

  if (window.CossWorldEngine?.mountWorldGame) {
    worldEngineInstance = window.CossWorldEngine.mountWorldGame(shell, world, {
      onObjectClick(object) {
        handleWorldObjectAction(object);
      },
      onAgentClick(agent) {
        if (agent?.roleId) {
          showWorldAgentActionModal(agent.roleId);
        }
      },
      onAgentDoubleClick(agent) {
        // Optional double-click behavior
      },
      onMapClick(point) {
        // Optional map click behavior
      },
      onCameraChange(camera) {
        // Camera change callback
      }
    });
  }
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
  const showingWorlds = state.activeSidebarSection === "worlds";

  const projects = state.projects
    .map((item) => {
      const createdLabel = formatProjectCreatedTime(item);
      const createdTitle = formatDateTime(item.createdAt || item.lastOpenedAt || "");
      return `
      <div class="project-item ${item.id === state.activeProjectId ? "active" : ""}">
        <button class="project-open" data-action="select-project" data-project-id="${item.id}" title="${escapeHtml(item.name)}">
          <span class="nav-icon">${icon("file")}</span>
          <span class="project-name">${escapeHtml(item.name)}</span>
          <span class="project-time" title="${escapeHtml(createdTitle ? t("project.createdAt", "创建于 {{time}}", { time: createdTitle }) : t("project.createdAtUnknown", "创建时间未知"))}">${escapeHtml(createdLabel)}</span>
        </button>
        <button class="project-delete" title="${escapeHtml(t("project.delete.tooltip", "删除项目"))}" data-action="show-delete-project" data-project-id="${escapeHtml(item.id)}">×</button>
      </div>
    `;
    })
    .join("");

  const worldItems = state.worlds.length ? state.worlds.map((item) => `
    <div class="project-item ${item.id === state.activeWorldId ? "active" : ""}">
      <button class="project-open" data-action="select-world" data-world-id="${escapeHtml(item.id)}" title="${escapeHtml(item.name)}">
        <span class="nav-icon">${icon("globe")}</span>
        <span class="project-name">${escapeHtml(item.name)}</span>
      </button>
      <button class="project-delete" title="${escapeHtml(t("world.delete.tooltip", "删除世界"))}" data-action="show-delete-world" data-world-id="${escapeHtml(item.id)}">×</button>
    </div>
  `).join("") : "";

  const listTitle = showingWorlds ? t("nav.worlds", "世界") : t("nav.projects", "项目");
  const plusAction = showingWorlds ? "show-create-world" : "show-create-project";

  return `
    <aside class="sidebar">
      <div class="brand-row">
        <div class="brand"><span>CosS</span> <span class="brand-version">${APP_VERSION}</span></div>
        <div class="icon-strip">
          <button class="icon-button" title="${escapeHtml(t("nav.newProject", "新建项目"))}" data-action="show-create-project">${icon("new")}</button>
          <button class="icon-button" title="${escapeHtml(t("nav.search", "搜索"))}" data-action="show-search">${icon("search")}</button>
          <button class="icon-button sidebar-toggle-button" title="${escapeHtml(t("nav.hideSidebar", "隐藏侧边栏"))}" data-action="toggle-sidebar">${icon("sidebar")}</button>
        </div>
      </div>
      <nav class="nav">
        <button class="nav-item" data-action="show-create-task"><span class="nav-icon">${icon("clock")}</span>${escapeHtml(t("nav.newTask", "新建任务"))}</button>
        <button class="nav-item" data-action="show-message-center"><span class="nav-icon">${icon("assistant")}</span>${escapeHtml(t("nav.messages", "消息"))}</button>
        <button class="nav-item ${!showingWorlds ? "active" : ""}" data-action="show-project-list"><span class="nav-icon">${icon("cube")}</span>${escapeHtml(t("nav.projects", "项目"))}</button>
        <button class="nav-item ${showingWorlds ? "active" : ""}" data-action="show-world-list"><span class="nav-icon">${icon("globe")}</span>${escapeHtml(t("nav.worlds", "世界"))}</button>
      </nav>
      <div class="section-title">
        <span>${escapeHtml(listTitle)} (${(showingWorlds ? state.worlds : state.projects).length})</span>
        <button class="icon-button" title="${escapeHtml(showingWorlds ? t("world.create.title", "新建世界") : t("nav.newProject", "新建项目"))}" data-action="${escapeHtml(plusAction)}">${icon("plus")}</button>
      </div>
      <div class="project-list">
        ${showingWorlds
          ? (worldItems || `<div class="project-list-empty">${escapeHtml(t("world.list.empty", "暂无世界"))}</div>`)
          : (projects || `<div class="project-list-empty">${escapeHtml(t("nav.noProjects", "暂无项目"))}</div>`)
        }
      </div>
      <div class="sidebar-footer">
        <div class="profile-name">${escapeHtml(getUserProfile().displayName || t("account.defaultName", "本地用户"))}</div>
        <button class="icon-button" title="${escapeHtml(t("nav.notifications", "通知"))}">${icon("bell")}</button>
        <button class="icon-button" title="${escapeHtml(t("nav.settings", "设置"))}" data-action="show-settings">${icon("gear")}</button>
        ${renderUserAvatar()}
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
  const world = getWorld();

  // 当侧边栏显示世界列表时，渲染世界主页
  if (state.activeSidebarSection === "worlds") {
    const agents = world?.agents || [];
    const chatCount = world?.chatMessages?.length || 0;
    return `
      <section class="workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}">
        ${sidebarCollapsed ? `<button class="sidebar-floating-toggle sidebar-toggle-button" title="${escapeHtml(t("nav.showSidebar", "显示侧边栏"))}" data-action="toggle-sidebar">${icon("sidebar")}</button>` : ""}
        <div class="workspace-topbar">
          <div class="project-heading">
            <h1 class="workspace-title">${world ? escapeHtml(world.name) : escapeHtml(t("world.noWorld", "未选择世界"))}</h1>
            <div class="workspace-subtitle">${world ? `${escapeHtml(world.path || "")} · ${escapeHtml(t("world.home.subtitle", "2D Agent 世界 MVP2.0"))} · ${escapeHtml(t("world.home.agentCount", "{{count}} 个角色 Agent", { count: agents.length }))}` : escapeHtml(t("world.createToStart", "创建世界后进入 2D Agent 世界"))}</div>
          </div>
          <div class="workspace-actions">
            ${world ? `<button class="secondary-button" data-action="show-world-chat">${icon("assistant")}${escapeHtml(t("world.chat.title", "群聊"))}<span class="button-badge">${chatCount}</span></button><button class="secondary-button" data-action="show-world-task-publisher">${icon("plus")}${escapeHtml(t("world.task.publish", "发布任务"))}</button>` : ""}
            <button class="secondary-button" data-action="show-create-world">${icon("plus")}${escapeHtml(t("world.create.title", "新建世界"))}</button>
          </div>
        </div>
        ${world ? `
        <div class="world-stage" data-world-id="${escapeHtml(world.id)}">
          <div class="world-canvas-shell" data-world-canvas>
            <div class="world-engine-placeholder">
              <div class="pixel-map" role="img" aria-label="${escapeHtml(t("world.home.aria", "世界主页，像素小人代表角色 Agent"))}">
                <div class="world-empty-intro">
                  <strong>${escapeHtml(t("world.home.title", "世界主页"))}</strong>
                  <span>${escapeHtml(t("world.home.desc", "这是世界概念的 MVP：一个 2D 卡通像素场景，角色 Agent 以像素小人形式常驻在世界中。"))}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        ` : `
        <div class="world-stage empty">
          <div class="empty-state">
            <h2>${escapeHtml(t("world.empty.title", "创建一个世界开始"))}</h2>
            <p>${escapeHtml(t("world.empty.desc", "世界会保存自己的名称和文件夹，并展示角色 Agent 的 2D 像素主页。"))}</p>
            <button class="primary-button" data-action="show-create-world">${icon("plus")}${escapeHtml(t("world.create.title", "新建世界"))}</button>
          </div>
        </div>
        `}
      </section>
    `;
  }

  const isBooting = project && bootingProjectId === project.id;
  const activeDesktop = project ? getActiveDesktop(project) : null;
  const visibleWindows = project ? getVisibleWindows(project) : [];
  const windows = visibleWindows.map(renderProgramWindow).join("");
  const collabOverlay = project ? renderCollabOverlay(project) : "";
  const desktopCount = project ? getProjectDesktops(project).length : 0;
  const activeProgramCount = project ? getDesktopWindows(project).length : 0;
  const activeConversationTaskCount = project ? getConversationTasks(project).length : 0;

  return `
    <section class="workspace ${sidebarCollapsed ? "sidebar-collapsed" : ""}" data-active-desktop-id="${escapeHtml(activeDesktop?.id || "")}">
      ${sidebarCollapsed ? `<button class="sidebar-floating-toggle sidebar-toggle-button" title="${escapeHtml(t("nav.showSidebar", "显示侧边栏"))}" data-action="toggle-sidebar">${icon("sidebar")}</button>` : ""}
      <div class="workspace-topbar">
        <div class="project-heading">
          <h1 class="workspace-title">${project ? escapeHtml(project.name) : escapeHtml(t("desktop.noProject", "未选择项目"))}</h1>
          <div class="workspace-subtitle">${project ? `${escapeHtml(project.path)} · ${escapeHtml(activeDesktop?.name || t("desktop.defaultName", "主对话"))} · ${escapeHtml(t("workspace.programs", "{{count}} 个程序", { count: activeProgramCount }))} · ${escapeHtml(t("workspace.conversationTasks", "{{count}} 个对话任务", { count: activeConversationTaskCount }))} · ${escapeHtml(t("workspace.conversations", "{{count}} 个对话", { count: desktopCount }))} · ${escapeHtml(t("workspace.projectTasks", "{{count}} 个项目任务", { count: project.tasks.length }))}` : escapeHtml(t("desktop.createToStart", "创建项目后启动工作区"))}</div>
        </div>
        <div class="workspace-actions">
          <button class="secondary-button" data-action="show-message-center">${icon("assistant")}${escapeHtml(t("context.messageCenter", "消息中心"))}</button>
          <button class="secondary-button task-view-toggle" data-action="show-task-view">${icon("layout")}${escapeHtml(t("desktop.conversationView", "对话视图"))}</button>
          <button class="secondary-button" data-action="open-task-list-window">${icon("task")}${escapeHtml(t("context.taskList", "任务列表"))}</button>
          <button class="secondary-button" data-action="show-role-picker" data-type="terminal">${icon("terminal")}${escapeHtml(t("context.newTerminal", "新建终端"))}</button>
          <button class="secondary-button" data-action="show-create-task">${icon("task")}${escapeHtml(t("context.newTask", "新建任务"))}</button>
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
        <h2>${escapeHtml(t("emptyState.noProject.title", "创建一个项目开始"))}</h2>
        <p>${escapeHtml(t("emptyState.noProject.desc", "项目会拥有独立的工作区、角色程序、任务历史和协作状态。"))}</p>
        <button class="primary-button" data-action="show-create-project">${icon("plus")}${escapeHtml(t("nav.newProject", "新建项目"))}</button>
      </div>
    `;
  }

  return `
    <div class="empty-state">
      <h2>${escapeHtml(t("emptyState.projectReady.title", "{{name}} 已开机", { name: project.name }))}</h2>
      <p>${escapeHtml(t("emptyState.projectReady.desc", "在桌面空白处右键创建终端、浏览器、文件或任务。创建程序时会先选择角色。"))}</p>
      <button class="primary-button" data-action="show-role-picker" data-type="terminal">${icon("terminal")}${escapeHtml(t("emptyState.createTerminal", "创建角色终端"))}</button>
    </div>
  `;
}

function renderBootScreen(project) {
  return `
    <div class="boot-screen">
      <div class="boot-panel">
        <div class="boot-logo"></div>
        <h2>${escapeHtml(project.name)} 工作区开机中</h2>
        <p>${escapeHtml(t("app.loading.projectConfig", "正在加载项目配置、角色模板、消息通道和桌面布局。"))}</p>
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
      <button class="dock-button" title="${escapeHtml(t("nav.search", "搜索"))}" data-action="show-search">${icon("search")}</button>
      <button class="dock-button task-view-toggle" title="${escapeHtml(t("desktop.conversationView", "对话视图"))}" data-action="show-task-view">${icon("layout")}</button>
      <button class="dock-button" title="${escapeHtml(t("context.taskList", "任务列表"))}" data-action="open-task-list-window">${icon("task")}</button>
      <button class="dock-button" title="${escapeHtml(t("context.newTerminal", "新建终端"))}" data-action="show-role-picker" data-type="terminal">${icon("terminal")}</button>
      <button class="dock-button" title="${escapeHtml(t("context.newBrowser", "新建浏览器"))}" data-action="show-role-picker" data-type="browser">${icon("globe")}</button>
      <button class="dock-button" title="${escapeHtml(t("context.newFile", "新建文件"))}" data-action="show-role-picker" data-type="file">${icon("file")}</button>
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
      <div class="task-view-panel" role="dialog" aria-label="${escapeHtml(t("desktop.conversationView", "对话视图"))}" data-no-focus="true">
        <div class="task-view-head">
          <div>
            <strong>${escapeHtml(t("desktop.conversationView", "对话视图"))}</strong>
            <span>${escapeHtml(t("desktop.conversationView.desc", "一个对话是一组持续工作的桌面程序；同一对话内可连续发布任务并复用已有角色程序。"))}</span>
          </div>
          <button class="secondary-button compact" data-action="create-desktop">${escapeHtml(t("desktop.newConversation", "新建对话"))}</button>
        </div>
        <div class="snap-layout-strip" aria-label="${escapeHtml(t("window.layout", "窗口布局"))}">
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
          <button class="window-control" title="${escapeHtml(t("window.minimize", "最小化"))}" data-action="minimize-window" data-window-id="${win.id}" data-no-drag="true" data-no-focus="true" aria-label="${escapeHtml(t("window.minimize", "最小化"))}">&#8211;</button>
          <button class="window-control" title="${escapeHtml(win.maximized ? t("window.restore", "还原") : t("window.maximize", "最大化"))}" data-action="toggle-maximize-window" data-window-id="${win.id}" data-no-drag="true" data-no-focus="true" aria-label="${escapeHtml(win.maximized ? t("window.restore", "还原窗口") : t("window.maximize", "最大化窗口"))}">${win.maximized ? "&#10064;" : "&#9633;"}</button>
          <button class="window-control" title="${escapeHtml(t("common.close", "关闭"))}" data-action="close-window" data-window-id="${win.id}" data-no-drag="true" data-no-focus="true" aria-label="${escapeHtml(t("window.close", "关闭窗口"))}">×</button>
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
        ? t("collab.statusWithRelay", "协作状态：{{status}}；Agent 接力阶段：{{label}}", { status: getStatusLabel(status), label: relayStage.label })
        : t("collab.status", "协作状态：{{status}}", { status: getStatusLabel(status) });
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
        ${escapeHtml(t("terminal.starting", "正在启动 {{role}} {{mode}}...", { role: role.name, mode: modeLabel }))}
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
              <span>${escapeHtml(tab.title || tab.url || t("browser.newTab", "新标签"))}</span>
            </button>
            ${win.browserTabs.length > 1 ? `<button class="browser-tab-close" title="${escapeHtml(t("browser.closeTab", "关闭标签"))}" data-action="browser-close-tab" data-window-id="${escapeHtml(win.id)}" data-tab-id="${escapeHtml(tab.id)}">×</button>` : ""}
          </div>
        `).join("")}
        <button class="icon-button" title="${escapeHtml(t("browser.newTab", "新标签"))}" data-action="browser-new-tab" data-window-id="${escapeHtml(win.id)}">+</button>
      </div>
      <div class="browser-bar">
        <button class="icon-button" title="${escapeHtml(t("browser.back", "后退"))}" data-action="browser-back" data-window-id="${escapeHtml(win.id)}">‹</button>
        <button class="icon-button" title="${escapeHtml(t("browser.forward", "前进"))}" data-action="browser-forward" data-window-id="${escapeHtml(win.id)}">›</button>
        <button class="icon-button" title="${escapeHtml(t("browser.reload", "刷新"))}" data-action="browser-reload" data-window-id="${escapeHtml(win.id)}">${icon("refresh")}</button>
        <input class="browser-address" data-browser-address="${escapeHtml(win.id)}" value="${escapeHtml(url)}" />
        <button class="primary-button compact" data-action="browser-go" data-window-id="${escapeHtml(win.id)}">${escapeHtml(t("browser.go", "打开"))}</button>
        <button class="secondary-button compact" data-action="browser-bookmark" data-window-id="${escapeHtml(win.id)}">${escapeHtml(bookmarks.includes(url) ? t("browser.bookmarked", "已收藏") : t("browser.bookmark", "收藏"))}</button>
      </div>
      <div class="browser-quick-links">
        <span>${escapeHtml(t("browser.bookmarks", "收藏"))}</span>
        ${bookmarks.slice(-5).reverse().map((item) => `<button data-action="browser-open-bookmark" data-window-id="${escapeHtml(win.id)}" data-url="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("") || `<em>${escapeHtml(t("browser.noBookmarks", "暂无"))}</em>`}
        <span>${escapeHtml(t("browser.history", "历史"))}</span>
        ${history.map((item) => `<button data-action="browser-open-history" data-window-id="${escapeHtml(win.id)}" data-url="${escapeHtml(item.url)}">${escapeHtml(item.title || item.url)}</button>`).join("") || `<em>${escapeHtml(t("browser.noBookmarks", "暂无"))}</em>`}
      </div>
      <div class="browser-status" data-browser-status="${escapeHtml(win.id)}">${escapeHtml(win.browserStatus || t("browser.ready", "{{role}} 浏览器就绪", { role: role.name }))}</div>
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
  const dirtyLabel = win.fileDirty ? t("file.unsaved", "未保存") : t("file.saved", "已保存");
  const pathLabel = win.filePath || t("file.noFile", "未选择文件");
  return t("file.footer", "{{path}} · 第 {{line}} 行，第 {{column}} 列 · {{lines}} 行 · {{chars}} 字符 · {{dirty}} · Ctrl+S 保存", { path: pathLabel, line: metrics.line, column: metrics.column, lines: metrics.lines, chars: metrics.chars, dirty: dirtyLabel });
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
          <input class="file-path-input" data-file-path="${escapeHtml(win.id)}" value="${escapeHtml(win.filePath || "")}" placeholder="${escapeHtml(t("file.placeholder.path", "输入项目内文件路径，例如 README.md"))}" />
          <button class="secondary-button compact" data-action="file-open" data-window-id="${escapeHtml(win.id)}">${escapeHtml(t("file.open", "打开"))}</button>
          <button class="secondary-button compact" data-action="file-pick" data-window-id="${escapeHtml(win.id)}">${escapeHtml(t("file.pick", "选择"))}</button>
          <button class="primary-button compact" data-action="file-save" data-window-id="${escapeHtml(win.id)}">${escapeHtml(t("file.save", "保存"))}</button>
          <button class="secondary-button compact" data-action="file-save-as" data-window-id="${escapeHtml(win.id)}">${escapeHtml(t("file.saveAs", "另存为"))}</button>
          <button class="secondary-button compact" data-action="file-create-folder" data-window-id="${escapeHtml(win.id)}">${escapeHtml(t("file.newFolder", "新建文件夹"))}</button>
          <button class="secondary-button compact" data-action="file-rename" data-window-id="${escapeHtml(win.id)}">${escapeHtml(t("file.rename", "重命名"))}</button>
          <button class="secondary-button compact danger" data-action="file-delete" data-window-id="${escapeHtml(win.id)}">${escapeHtml(t("file.delete", "删除"))}</button>
        </div>
        <div class="file-status ${win.fileError ? "error" : ""}" data-file-status="${escapeHtml(win.id)}">
          ${escapeHtml(win.fileError || win.fileStatus || t("file.editorReady", "{{role}} 文件编辑器 · {{path}}", { role: role.name, path: project ? project.path : t("file.noProject", "未选择项目") }))}
        </div>
      </div>
      <div class="file-editor-layout">
        <aside class="file-list">
          <div class="file-list-title">
            <span>${escapeHtml(t("file.projectFiles", "项目文件"))}</span>
            <button class="icon-button" title="${escapeHtml(t("file.refreshList", "刷新文件列表"))}" data-action="file-refresh-list" data-window-id="${escapeHtml(win.id)}">${icon("refresh")}</button>
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
                : `<div class="file-list-empty">${escapeHtml(t("file.listEmpty", "点击刷新或输入路径打开项目文件。"))}</div>`
            }
          </div>
        </aside>
        <section class="file-editor-pane">
          <div class="file-editor-main">
            <pre class="file-editor-lines" data-file-lines="${escapeHtml(win.id)}">${escapeHtml(renderFileLineNumbers(fileDraft))}</pre>
            <textarea class="file-editor-textarea" data-file-editor="${escapeHtml(win.id)}" spellcheck="false" placeholder="${escapeHtml(t("file.placeholder.editor", "打开或新建项目内文本文件。"))}">${escapeHtml(fileDraft)}</textarea>
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
    return `<div class="browser-blank">${escapeHtml(t("task.content.empty", "当前对话暂无任务。右键空白处或点击新建任务后，会在这个对话中持续追加任务。"))}</div>`;
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
        <span>${escapeHtml(t("task.filter.role", "角色过滤"))}</span>
        <select id="taskRoleFilter">
          <option value="">${escapeHtml(t("task.filter.allRoles", "全部角色"))}</option>
          ${availableRoleIds.map((roleId) => `<option value="${escapeHtml(roleId)}" ${roleId === taskRoleFilter ? "selected" : ""}>${escapeHtml(getRoleName(roleId))}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
  const taskCards = filteredPairs
    .map(({ task, subtask }) => {
      const kernelState = getSubtaskKernelProjection(task, subtask);
      const leaseLabel = kernelState.step?.lease?.expiresAt
        ? t("task.lease.validUntil", "有效期至 {{time}}", { time: formatDateTime(kernelState.step.lease.expiresAt) })
        : t("task.lease.unset", "未设置有效期");
      return `
      <div class="task-card ${escapeHtml(kernelState.status)} kernel-phase-${escapeHtml(kernelState.phase)}">
        <div class="task-card-head">
          <div class="task-role">${escapeHtml(getRoleName(subtask.roleId))} · ${escapeHtml(task.title)} · ${escapeHtml(getTaskModelName(task))}</div>
          <div class="task-chip-group">${renderKernelPhaseChip(kernelState.phase, kernelState)}${renderSubtaskStatusChip(kernelState.status)}</div>
        </div>
        <div class="task-title">${escapeHtml(subtask.title)}</div>
        <div class="task-desc">${escapeHtml(subtask.description)}</div>
        <div class="task-desc">${escapeHtml(t("task.currentStep", "当前步骤：{{step}}", { step: kernelState.step?.id || t("task.stepPending", "待分配") }))} · ${escapeHtml(leaseLabel)}</div>
        <div class="task-desc">${escapeHtml(t("task.planSource", "规划来源：{{source}}", { source: task.planner?.status === "success" ? t("task.planSource.ai", "智能规划") : t("task.planSource.local", "本地规则") }))}</div>
        ${renderSubtaskActions(task.id, subtask)}
      </div>
    `;
    })
    .join("");

  return `${roleFilter}${taskCards || `<div class="message-empty">${escapeHtml(t("task.content.noSubtasks", "当前角色暂无子任务。"))}</div>`}${renderRecentAgentEvents(project)}`;
}

function renderTaskListFilters(project, tasks) {
  const roleIds = uniqueRoleIds(tasks.flatMap((task) => getTaskRoleIds(task)));
  const statuses = uniqueStrings(tasks.map(getTaskStatusValue));
  const models = uniqueStrings(tasks.map(getTaskModelName));
  return `
    <div class="task-list-filters">
      <label>
        <span>${escapeHtml(t("taskList.filter.search", "搜索"))}</span>
        <input id="taskListSearch" value="${escapeHtml(taskListFilters.query)}" placeholder="${escapeHtml(t("taskList.filter.searchPlaceholder", "任务、角色、说明"))}" />
      </label>
      <label>
        <span>${escapeHtml(t("taskList.filter.role", "角色"))}</span>
        <select id="taskListRoleFilter">
          <option value="">${escapeHtml(t("taskList.filter.allRoles", "全部角色"))}</option>
          ${roleIds.map((roleId) => `<option value="${escapeHtml(roleId)}" ${roleId === taskListFilters.roleId ? "selected" : ""}>${escapeHtml(getRoleName(roleId))}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>${escapeHtml(t("taskList.filter.status", "状态"))}</span>
        <select id="taskListStatusFilter">
          <option value="">${escapeHtml(t("taskList.filter.allStatuses", "全部状态"))}</option>
          ${statuses.map((status) => `<option value="${escapeHtml(status)}" ${status === taskListFilters.status ? "selected" : ""}>${escapeHtml(SUBTASK_STATUS_DEFS[status]?.label || status)}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>${escapeHtml(t("taskList.filter.model", "模型"))}</span>
        <select id="taskListModelFilter">
          <option value="">${escapeHtml(t("taskList.filter.allModels", "全部模型"))}</option>
          ${models.map((model) => `<option value="${escapeHtml(model)}" ${model === taskListFilters.model ? "selected" : ""}>${escapeHtml(model)}</option>`).join("")}
        </select>
      </label>
      <label class="task-list-check">
        <input id="taskListIncludeArchived" type="checkbox" ${taskListFilters.includeArchived ? "checked" : ""} />
        <span>${escapeHtml(t("taskList.filter.showArchived", "显示归档"))}</span>
      </label>
    </div>
  `;
}

function renderTaskListDetail(project, task) {
  if (!task) {
    return `
      <aside class="task-list-detail">
        <div class="message-empty">${escapeHtml(t("taskList.selectTask", "选择一个任务查看详情。"))}</div>
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
          <strong>${escapeHtml(task.title || t("taskList.untitledTask", "未命名任务"))}</strong>
          <span>${escapeHtml(task.goal || "")}</span>
        </div>
        ${renderSubtaskStatusChip(status)}
      </div>
      <div class="task-detail-actions">
        <button class="secondary-button compact" data-action="show-message-center">${escapeHtml(t("taskList.viewTimeline", "查看时间线"))}</button>
        ${task.archived
          ? `<button class="secondary-button compact" data-action="restore-task" data-task-id="${escapeHtml(task.id)}">${escapeHtml(t("taskList.restoreTask", "恢复任务"))}</button>`
          : `<button class="secondary-button compact" data-action="archive-task" data-task-id="${escapeHtml(task.id)}">${escapeHtml(t("taskList.archiveTask", "归档任务"))}</button>`}
      </div>
      <div class="task-detail-metrics">
        <span>idle ${projection.counts.idle || 0}</span>
        <span>running ${projection.activeCount || 0}</span>
        <span>done ${projection.counts.done || 0}</span>
        <span>locks ${projection.activeLocks.length}</span>
        <span>approvals ${projection.pendingApprovals.length}</span>
        <span>events ${projection.events.length}</span>
        <span>${escapeHtml(t("taskList.metrics.subtasks", "子任务 {{done}}/{{total}}", { done: doneCount, total: task.subtasks?.length || 0 }))}</span>
        <span>${escapeHtml(t("taskList.metrics.messages", "消息 {{count}}", { count: messages.length }))}</span>
        <span>${escapeHtml(t("taskList.metrics.deliveries", "投递 {{count}}", { count: deliveries.length }))}</span>
        <span>${escapeHtml(t("taskList.metrics.outputs", "输出 {{count}}", { count: refs.length }))}</span>
        <span>${escapeHtml(getTaskModelName(task))}</span>
      </div>
      <div class="task-detail-section">
        <strong>${escapeHtml(t("taskList.detail.subtasks", "子任务"))}</strong>
        ${(task.subtasks || []).map((subtask) => {
          const kernelState = getSubtaskKernelProjection(task, subtask);
          return `
          <div class="task-detail-subtask ${escapeHtml(kernelState.status)} kernel-phase-${escapeHtml(kernelState.phase)}">
            <span>${escapeHtml(getRoleName(subtask.roleId))}</span>
            <strong>${escapeHtml(subtask.title)}</strong>
            <span class="task-chip-group">${renderKernelPhaseChip(kernelState.phase, kernelState)}${renderSubtaskStatusChip(kernelState.status)}</span>
            <p>${escapeHtml(subtask.description || "")}</p>
            <p>${escapeHtml(t("task.currentStep", "当前步骤：{{step}}", { step: kernelState.step?.id || t("task.stepPending", "待分配") }))}</p>
            ${renderSubtaskActions(task.id, subtask)}
          </div>
        `;
        }).join("")}
      </div>
      <div class="task-detail-section">
        <strong>${escapeHtml(t("taskList.detail.deliveries", "关联投递"))}</strong>
        ${deliveries.length
          ? deliveries.slice(0, 5).map((delivery) => `
            <div class="task-detail-linkrow">
              <span>${escapeHtml(getRoleName(delivery.roleId))} · ${escapeHtml(getDeliveryStatusLabel(delivery.status))}</span>
              <span>${escapeHtml(delivery.submissionMethod || "pending")}</span>
            </div>
          `).join("")
          : `<div class="message-empty">${escapeHtml(t("taskList.detail.noDeliveries", "暂无投递。"))}</div>`}
      </div>
      <div class="task-detail-section">
        <strong>${escapeHtml(t("taskList.detail.recentMessages", "最近消息"))}</strong>
        ${messages.length
          ? messages.slice(-4).reverse().map((message) => `
            <div class="task-detail-message">
              <span>${escapeHtml(getRoleName(message.fromRoleId))} -> ${escapeHtml(message.toRoleIds.map((roleId) => getRoleName(roleId)).join("、"))}</span>
              <p>${escapeHtml(message.content)}</p>
            </div>
          `).join("")
          : `<div class="message-empty">${escapeHtml(t("taskList.detail.noMessages", "暂无消息。"))}</div>`}
      </div>
    </aside>
  `;
}

function renderTaskListContent() {
  const project = getProject();
  const conversation = getActiveDesktop(project);

  if (!project) {
    return `<div class="browser-blank">${escapeHtml(t("taskList.noProject", "请先选择项目。"))}</div>`;
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
        <strong>${escapeHtml(t("taskList.title", "{{name}}任务列表", { name: conversation?.name || t("taskList.currentConversation", "当前对话") }))}</strong>
        <span>${escapeHtml(t("taskList.header.summary", "{{visible}}/{{total}} 个任务 · {{subtasks}} 个子任务 · {{archived}} 个归档", { visible: visibleTasks.length, total: allTasks.length, subtasks: totalSubtasks, archived: archivedCount }))}</span>
      </div>
      ${renderTaskListFilters(project, allTasks)}
      ${
        allTasks.length === 0
          ? `<div class="browser-blank">${escapeHtml(t("taskList.empty.noTasks", "当前对话还没有任务。点击右上角“新建任务”后，任务会持续追加到这个对话中。"))}</div>`
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
                          <strong>${escapeHtml(task.title || t("taskList.taskIndex", "任务 {{index}}", { index: index + 1 }))}</strong>
                          <span>${escapeHtml(task.goal || "")}</span>
                        </div>
                        ${renderSubtaskStatusChip(status)}
                      </div>
                      <div class="task-list-meta">
                        <span>${escapeHtml(getTaskModelName(task))}</span>
                        <span>running ${projection.activeCount || 0}</span>
                        <span>locks ${projection.activeLocks.length}</span>
                        <span>approvals ${projection.pendingApprovals.length}</span>
                        <span>${escapeHtml(t("taskList.subtasksDone", "{{done}}/{{total}} 已完成", { done: doneCount, total: task.subtasks?.length || 0 }))}</span>
                        <span>${escapeHtml(formatDateTime(task.confirmedAt || task.createdAt))}</span>
                        ${task.archived ? `<span>${escapeHtml(t("taskList.archived", "已归档"))}</span>` : ""}
                      </div>
                      <div class="task-list-subtasks">
                        ${(task.subtasks || []).map((subtask) => {
                          const kernelState = getSubtaskKernelProjection(task, subtask);
                          return `
                          <span class="task-list-subtask ${escapeHtml(kernelState.status)} kernel-phase-${escapeHtml(kernelState.phase)}">
                            ${escapeHtml(getRoleName(subtask.roleId))} · ${escapeHtml(subtask.title)}
                          </span>
                        `;
                        }).join("")}
                      </div>
                    </button>
                  `;
                }).join("") : `<div class="message-empty">${escapeHtml(t("taskList.noMatchingTasks", "没有匹配当前筛选条件的任务。"))}</div>`}
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
        <strong>${escapeHtml(t("agent.events.title", "Agent 会话事件"))}</strong>
        <span>${escapeHtml(t("agent.events.recent", "最近 {{count}} 条", { count: events.length }))}</span>
      </div>
      ${events.map((event) => `
        <div class="agent-event-row ${escapeHtml(normalizeAgentEventStatus(event.status) || event.status || "running")}">
          <strong>${escapeHtml(getRoleName(event.roleId))} · ${escapeHtml(event.provider || "agent")}</strong>
          <span>${escapeHtml(event.status || "event")} · ${escapeHtml(formatDateTime(event.receivedAt))}</span>
          <p>${escapeHtml(event.message || event.sessionId || t("delivery.event.default", "Agent 输出了状态事件。"))}</p>
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
  const executeLabel = status === "done" ? t("task.action.reExecute", "重新执行") : t("task.action.execute", "执行");
  const canExecuteSubtask = task && canManuallyExecuteKernelSubtask(task, subtask);
  const executeButton = canExecuteSubtask
    ? `<button class="primary-button compact" data-action="execute-kernel-subtask" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}">${escapeHtml(executeLabel)}</button>`
    : "";
  const button = (label, nextStatus, kind = "secondary") => (
    `<button class="${kind}-button compact" data-action="set-subtask-status" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}" data-status="${escapeHtml(nextStatus)}">${escapeHtml(label)}</button>`
  );
  const url = getSubtaskTaskUrl(task, subtask);
  const taskUrlButton = url
    ? `<button class="secondary-button compact" data-action="open-task-url" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}">${escapeHtml(t("task.action.openUrl", "打开任务 URL"))}</button>`
    : "";
  let actions = {
    idle: [button(t("task.action.start", "开始执行"), "running", "primary")],
    running: [button(t("task.action.markDone", "标记完成"), "done", "primary")],
    done: [button(t("task.action.reopen", "重新打开"), "idle")]
  }[status] || [];
  if (!canExecuteSubtask || status !== "running") {
    actions = [];
  }
  return `<div class="task-actions">${[executeButton, ...actions, taskUrlButton].join("")}</div>`;
}

function renderCollabPopover(win, collaborators, status, relayStage = getAgentRelayStageForWindow(win)) {
  const names = collaborators.map((role) => role.name).join("、") || t("collab.noCollaborators", "暂无协作对象");
  const project = getProject();
  const taskContext = getTaskContextForWindow(win, project);
  const kernelStep = (taskContext.taskId
    ? (project?.tasks || []).filter((task) => task.id === taskContext.taskId)
    : getConversationTasks(project, win.desktopId))
    .flatMap((task) => getTaskKernelProjection(task).steps.map((step) => ({ task, step })))
    .filter(({ step }) => step.roleId === win.roleId)
    .sort((a, b) => new Date(b.step.lease?.heartbeatAt || b.step.updatedAt || 0).getTime() - new Date(a.step.lease?.heartbeatAt || a.step.updatedAt || 0).getTime())[0];
  const kernelLine = kernelStep
    ? `<div>${escapeHtml(t("collab.currentStep", "当前步骤：{{step}}", { step: kernelStep.step.id }))} · ${renderKernelPhaseChip(kernelStep.step.phase, kernelStep.step)}${kernelStep.step.lease?.expiresAt ? ` · ${escapeHtml(t("task.lease.validUntil", "有效期至 {{time}}", { time: formatDateTime(kernelStep.step.lease.expiresAt) }))}` : ""}</div>`
    : "";
  const messages = `${kernelLine}${(project?.messages || [])
    .filter((message) => message.fromRoleId === win.roleId || message.toRoleIds.includes(win.roleId))
    .slice(-3)
    .map((message) => `<div>${escapeHtml(getRoleName(message.fromRoleId))}：${escapeHtml(message.content)}</div>`)
    .join("")}`;

  return `
    <div class="collab-popover">
      <strong>${escapeHtml(getStatusLabel(status))}</strong>
      ${normalizeTerminalMode(win.terminalMode) === "agent" ? `<div>${escapeHtml(t("collab.relayStage", "Agent 接力阶段：{{label}}", { label: relayStage.label }))}</div>` : ""}
      <div>${escapeHtml(t("collab.collaborators", "协作对象：{{names}}", { names }))}</div>
      ${messages || `<div>${escapeHtml(t("collab.noMessages", "还没有消息。"))}</div>`}
      <button class="secondary-button compact" data-action="show-message-center" data-role-id="${escapeHtml(win.roleId)}">${escapeHtml(t("collab.viewTimeline", "查看时间线"))}</button>
    </div>
  `;
}

function renderContextMenu() {
  return `
    <div class="context-menu" style="left:${contextMenu.x}px; top:${contextMenu.y}px;">
      <button data-action="role-menu" data-type="terminal">${icon("terminal")}${escapeHtml(t("context.newTerminal", "新建终端"))}</button>
      <button data-action="role-menu" data-type="browser">${icon("globe")}${escapeHtml(t("context.newBrowser", "新建浏览器"))}</button>
      <button data-action="role-menu" data-type="file">${icon("file")}${escapeHtml(t("context.newFile", "新建文件"))}</button>
      <button data-action="open-task-list-window">${icon("task")}${escapeHtml(t("context.taskList", "任务列表"))}</button>
      <button data-action="show-create-task">${icon("task")}${escapeHtml(t("context.newTask", "新建任务"))}</button>
      <button data-action="show-message-center">${icon("assistant")}${escapeHtml(t("context.messageCenter", "消息中心"))}</button>
      <div class="menu-divider"></div>
      <button data-action="refresh-workspace">${icon("refresh")}${escapeHtml(t("context.refreshDesktop", "刷新桌面"))}</button>
      <button data-action="show-settings">${icon("gear")}${escapeHtml(t("context.systemSettings", "系统设置"))}</button>
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
      get title() { return t("file.op.createFolder.title", "新建文件夹"); },
      get label() { return t("file.op.createFolder.label", "项目内文件夹路径"); },
      defaultValue: baseDir ? `${baseDir}/new-folder` : "new-folder",
      get confirmLabel() { return t("common.create", "创建"); }
    },
    "save-as": {
      get title() { return t("file.op.saveAs.title", "另存为"); },
      get label() { return t("file.op.saveAs.label", "新的项目内文件路径"); },
      defaultValue: currentPath || "untitled.md",
      get confirmLabel() { return t("file.op.saveAs.confirm", "另存为"); }
    },
    rename: {
      get title() { return t("file.op.rename.title", "重命名"); },
      get label() { return t("file.op.rename.label", "新的项目内路径"); },
      defaultValue: currentPath,
      get confirmLabel() { return t("file.op.rename.confirm", "重命名"); }
    },
    delete: {
      get title() { return t("common.delete", "删除"); },
      get label() { return t("file.op.delete.label", "将删除的项目内路径"); },
      defaultValue: currentPath,
      get confirmLabel() { return t("file.op.delete.confirm", "确认删除"); },
      danger: true
    }
  }[operation];

  if (!config || (!config.defaultValue && operation !== "create-folder")) {
    setFileStatus(windowId, t("file.op.selectFirst", "请先选择文件或文件夹。"), "error");
    return;
  }

  pendingFileOperation = { windowId, operation, fromPath: currentPath };
  renderModal(`
    <div class="modal file-operation-modal">
      <h2>${escapeHtml(config.title)}</h2>
      <p>${escapeHtml(t("file.op.pathMustBeInProject", "路径必须位于当前项目目录内：{{path}}", { path: project.path }))}</p>
      <div class="field">
        <label for="fileOperationPath">${escapeHtml(config.label)}</label>
        <input id="fileOperationPath" value="${escapeHtml(config.defaultValue)}" ${operation === "delete" ? "readonly" : ""} />
      </div>
      <div id="fileOperationStatus" class="form-status muted">${escapeHtml(operation === "delete" ? t("file.op.deleteWarning", "删除操作不可撤销，请确认路径无误。") : t("file.op.confirmWrite", "确认后会写入项目文件系统。"))}</div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.cancel", "取消"))}</button>
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

    const inputDisposable = term.onData((data) => {
      handleTerminalInput(win, inputState, term, data);
      // Workaround for xterm.js IME composition bug on Windows: the textarea is
      // not cleared after composition ends (only on blur/Ctrl+C/Enter), so stale
      // composed text lingers and gets re-emitted on subsequent keystrokes,
      // causing the first composed character (e.g. "中") to repeat indefinitely.
      // Clearing it here resets composition positions for the next input.
      if (term.textarea) {
        term.textarea.value = "";
      }
    });
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

function clampSidebarWidth(value) {
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, value));
}

function updateSidebarWidth(width) {
  sidebarWidth = clampSidebarWidth(width);
  document.querySelector(".app-shell")?.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
}

function updateSidebarResize(event) {
  if (!sidebarResizeState) {
    return;
  }

  const deltaX = event.clientX - sidebarResizeState.startX;
  const rawWidth = sidebarResizeState.startWidth + deltaX;
  const shouldPreviewCollapse = rawWidth < SIDEBAR_MIN_WIDTH && deltaX < -8;
  sidebarResizeState.lastDeltaX = deltaX;
  if (Math.abs(deltaX) > 2) {
    sidebarResizeState.hasDragged = true;
  }

  const shell = document.querySelector(".app-shell");
  if (shouldPreviewCollapse) {
    sidebarResizeState.collapsing = true;
    shell?.style.setProperty("--sidebar-width", `${SIDEBAR_MIN_WIDTH}px`);
    shell?.classList.add("sidebar-collapsing");
    return;
  }

  if (sidebarResizeState.collapsing) {
    sidebarResizeState.collapsing = false;
    shell?.classList.remove("sidebar-collapsing");
  }
  updateSidebarWidth(rawWidth);
}

function animateSidebarCollapse() {
  if (sidebarCollapsed || sidebarCollapseTimer) {
    return;
  }

  const shell = document.querySelector(".app-shell");
  if (!shell) {
    sidebarCollapsed = true;
    render();
    return;
  }

  shell.style.setProperty("--sidebar-width", `${sidebarWidth}px`);
  void shell.offsetWidth;
  shell.classList.add("sidebar-collapsing");
  sidebarCollapseTimer = setTimeout(() => {
    sidebarCollapsed = true;
    sidebarCollapseTimer = null;
    document.body.classList.remove("sidebar-resizing");
    render();
  }, 210);
}

function finishSidebarResize() {
  if (!sidebarResizeState) {
    return;
  }

  const shouldCollapse = Boolean(sidebarResizeState.collapsing);
  document.body.classList.remove("sidebar-resizing");
  sidebarResizeState = null;
  if (shouldCollapse) {
    sidebarWidth = SIDEBAR_MIN_WIDTH;
    sidebarCollapsed = true;
    render();
    return;
  }

  document.querySelector(".app-shell")?.classList.remove("sidebar-collapsing");
}

function attachSidebarResizeHandlers() {
  document.querySelectorAll("[data-sidebar-resizer]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || sidebarCollapsed) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      sidebarResizeState = {
        startX: event.clientX,
        startWidth: sidebarWidth,
        lastDeltaX: 0,
        hasDragged: false,
        collapsing: false
      };
      document.body.classList.add("sidebar-resizing");
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", updateSidebarResize);
    handle.addEventListener("pointerup", finishSidebarResize);
    handle.addEventListener("pointercancel", finishSidebarResize);
  });
}

function updateAgentBlueprintCanvasSize(canvas, x, y) {
  const svg = canvas?.querySelector(".agent-blueprint-svg");
  if (!canvas || !svg) {
    return;
  }

  const renderedRect = canvas.getBoundingClientRect();
  const renderedWidth = Math.ceil(renderedRect.width || canvas.clientWidth || 0);
  const renderedHeight = Math.ceil(renderedRect.height || canvas.clientHeight || 0);
  const nextWidth = Math.max(Number.parseFloat(canvas.style.width) || 0, renderedWidth, x + 220);
  const nextHeight = Math.max(Number.parseFloat(canvas.style.height) || 0, renderedHeight, y + 130);
  canvas.style.width = `${nextWidth}px`;
  canvas.style.height = `${nextHeight}px`;
  svg.setAttribute("width", nextWidth);
  svg.setAttribute("height", nextHeight);
  svg.setAttribute("viewBox", `0 0 ${nextWidth} ${nextHeight}`);
}

function updateAgentBlueprintDrag(event) {
  if (!agentBlueprintDragState) {
    return;
  }

  const deltaX = event.clientX - agentBlueprintDragState.startX;
  const deltaY = event.clientY - agentBlueprintDragState.startY;
  if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
    agentBlueprintDragState.moved = true;
    agentBlueprintDragState.node.dataset.blueprintDragged = "true";
  }

  const x = Math.max(16, agentBlueprintDragState.originX + deltaX);
  const y = Math.max(16, agentBlueprintDragState.originY + deltaY);
  agentBlueprintDragState.node.style.left = `${x}px`;
  agentBlueprintDragState.node.style.top = `${y}px`;
  if (agentBlueprintDragState.positionKey) {
    agentBlueprintNodePositions[agentBlueprintDragState.positionKey] = { x, y };
  }
  updateAgentBlueprintCanvasSize(agentBlueprintDragState.canvas, x, y);
  updateAgentBlueprintLinks(agentBlueprintDragState.canvas);
}

function finishAgentBlueprintDrag() {
  if (!agentBlueprintDragState) {
    return;
  }

  agentBlueprintDragState.node.classList.remove("dragging");
  if (!agentBlueprintDragState.moved) {
    delete agentBlueprintDragState.node.dataset.blueprintDragged;
  }
  agentBlueprintDragState = null;
}

function attachAgentBlueprintDragHandlers() {
  document.querySelectorAll(".agent-blueprint-node").forEach((node) => {
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      const canvas = node.closest(".agent-blueprint-canvas");
      if (!canvas) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      agentBlueprintDragState = {
        node,
        canvas,
        positionKey: node.dataset.positionKey || "",
        startX: event.clientX,
        startY: event.clientY,
        originX: Number.parseFloat(node.style.left) || 0,
        originY: Number.parseFloat(node.style.top) || 0,
        moved: false
      };
      node.classList.add("dragging");
      node.setPointerCapture(event.pointerId);
    });

    node.addEventListener("pointermove", updateAgentBlueprintDrag);
    node.addEventListener("pointerup", finishAgentBlueprintDrag);
    node.addEventListener("pointercancel", finishAgentBlueprintDrag);
  });
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

  if (action === "toggle-sidebar") {
    sidebarResizeState = null;
    document.body.classList.remove("sidebar-resizing");
    closeMenus();
    if (sidebarCollapsed) {
      if (sidebarCollapseTimer) {
        clearTimeout(sidebarCollapseTimer);
        sidebarCollapseTimer = null;
      }
      sidebarCollapsed = false;
      updateSidebarWidth(sidebarWidth);
      render();
    } else {
      animateSidebarCollapse();
    }
    return;
  }

  if (action === "show-search") {
    showSearchModal();
    return;
  }

  if (action === "open-search-result") {
    openSearchResult(target);
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

  if (action === "open-product-url") {
    openProductUrl(target.dataset.url || PRODUCT_HELP_URL);
    return;
  }

  if (action === "show-feedback-modal") {
    showFeedbackModal();
    return;
  }

  if (action === "close-feedback-modal") {
    closeFeedbackModal();
    return;
  }

  if (action === "choose-feedback-images") {
    document.getElementById("feedbackImageInput")?.click();
    return;
  }

  if (action === "submit-feedback") {
    recordAppLog("help.feedback.submitted", {
      length: String(document.getElementById("feedbackContent")?.value || "").length,
      imageCount: Math.min(document.getElementById("feedbackImageInput")?.files?.length || 0, 4),
      uploadLogs: Boolean(document.getElementById("feedbackUploadLogs")?.checked)
    });
    closeFeedbackModal();
    return;
  }

  if (action === "choose-account-avatar") {
    document.getElementById("accountAvatarInput")?.click();
    return;
  }

  if (action === "clear-account-avatar") {
    getUserProfile().avatarDataUrl = "";
    saveState();
    render();
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
      ensureAgentPromptPermissionPlaceholders(getDefaultAgentPromptTemplate())
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
    const blueprintNode = target.closest(".agent-blueprint-node");
    if (blueprintNode?.dataset.blueprintDragged === "true") {
      delete blueprintNode.dataset.blueprintDragged;
      return;
    }
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

  if (action === "auto-layout-agent-blueprint") {
    autoLayoutAgentBlueprint();
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

  // 世界空间 action
  if (action === "show-world-chat") {
    showWorldChatModal();
    return;
  }

  if (action === "scroll-to-bottom") {
    const chatList = document.querySelector(".world-chat-list");
    if (chatList) {
      chatList.scrollTop = chatList.scrollHeight;
    }
    const indicator = document.querySelector(".world-chat-new-msg");
    if (indicator) {
      indicator.classList.remove("visible");
    }
    return;
  }

  // 群聊筛选 action
  if (action === "filter-task" || action === "filter-role") {
    const modal = document.querySelector(".world-chat-modal");
    if (!modal) return;
    const key = action === "filter-task" ? "filterTask" : "filterRole";
    modal.dataset[key] = target.value;
    updateWorldChatModal(modal.dataset.worldChatTaskId || "");
    return;
  }

  if (action === "filter-mode") {
    const modal = document.querySelector(".world-chat-modal");
    if (!modal) return;
    const mode = target.dataset.mode;
    modal.dataset.filterMode = mode;
    // 更新按钮 active 状态
    modal.querySelectorAll(".world-chat-filter-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
    // 历史记录才显示筛选下拉
    const filterExtras = modal.querySelector(".world-chat-filter-extras");
    if (filterExtras) {
      filterExtras.style.display = mode === "history" ? "" : "none";
    }
    updateWorldChatModal(modal.dataset.worldChatTaskId || "");
    return;
  }

  if (action === "show-world-task-publisher") {
    showWorldTaskPublisherModal();
    return;
  }

  if (action === "show-world-agent-actions") {
    showWorldAgentActionModal(target.dataset.roleId);
    return;
  }

  if (action === "publish-world-task") {
    const goal = document.getElementById("worldTaskGoal")?.value?.trim();
    if (!goal) {
      setWorldTaskStatus(t("world.task.validation.empty", "请填写任务内容。"));
      return;
    }
    publishWorldTask(goal);
    return;
  }

  if (action === "create-world-agent") {
    const roleId = target.dataset.roleId;
    if (roleId) {
      createWorldAgent(roleId, Number(target.dataset.x), Number(target.dataset.y));
    }
    return;
  }

  // 世界导航 action
  if (action === "show-world-list") {
    showWorldList();
    return;
  }

  if (action === "show-project-list") {
    state.activeSidebarSection = "projects";
    saveState();
    render();
    return;
  }

  if (action === "show-create-world") {
    showCreateWorldModal();
    return;
  }

  if (action === "create-world") {
    createWorldFromModal();
    return;
  }

  if (action === "select-world") {
    selectWorld(target.dataset.worldId);
    return;
  }

  if (action === "show-delete-world") {
    showDeleteWorldModal(target.dataset.worldId);
    return;
  }

  if (action === "confirm-delete-world") {
    deleteWorld(target.dataset.worldId);
    return;
  }

  if (action === "choose-world-directory") {
    chooseWorldDirectoryFromModal();
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

  if (inputTarget?.id === "globalSearchInput") {
    globalSearchQuery = inputTarget.value;
    refreshGlobalSearchResults();
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

  if (inputTarget?.id === "feedbackContent") {
    updateFeedbackCounters();
    return;
  }

  if (inputTarget?.id === "accountDisplayName") {
    updateAccountDisplayName(inputTarget.value);
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

  if (target.id === "feedbackImageInput") {
    updateFeedbackCounters();
    return;
  }

  if (target.id === "accountAvatarInput") {
    updateAccountAvatarFromFile(target.files?.[0]);
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

  if (target.id === "appLanguageSelect") {
    state.settings.language = LANGUAGE_OPTIONS.some((item) => item.id === target.value) ? target.value : "zh-CN";
    saveState();
    render();
    showSettingsModal();
    return;
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
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    showSearchModal();
    return;
  }

  const globalSearchInput = event.target instanceof Element ? event.target.closest("#globalSearchInput") : null;
  if (globalSearchInput && event.key === "Enter") {
    event.preventDefault();
    const firstResult = document.querySelector(".global-search-result");
    if (firstResult) {
      openSearchResult(firstResult);
    }
    return;
  }

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

// select 元素用 change 事件触发 data-action
document.addEventListener("change", (event) => {
  const target = event.target instanceof Element ? event.target.closest("select[data-action]") : null;
  if (!target) return;
  const action = target.dataset.action;

  // 处理筛选下拉
  if (action === "filter-task" || action === "filter-role") {
    const modal = document.querySelector(".world-chat-modal");
    if (!modal) return;
    const key = action === "filter-task" ? "filterTask" : "filterRole";
    modal.dataset[key] = target.value;
    updateWorldChatModal(modal.dataset.worldChatTaskId || "");
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
    sidebar: `<svg viewBox="0 0 24 24"><rect x="4.5" y="5.5" width="15" height="13" rx="3"/><path d="M9.5 5.5v13"/></svg>`,
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
    doc: `<svg viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/><path d="M9.5 12h5M9.5 15h5M9.5 18h3"/></svg>`,
    chat: `<svg viewBox="0 0 24 24"><path d="M5 6.5A4.5 4.5 0 0 1 9.5 2h5A4.5 4.5 0 0 1 19 6.5v4A4.5 4.5 0 0 1 14.5 15H11l-5 4v-4.6A4.5 4.5 0 0 1 5 10.5z"/><path d="M9 7h6M9 10h4"/></svg>`,
    contact: `<svg viewBox="0 0 24 24"><path d="M7 8h8l-3-3M15 16H7l3 3"/><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v13a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 18.5z"/></svg>`,
    external: `<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/><path d="M10 14 18 6M13 6h5v5"/></svg>`,
    image: `<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m7 17 4-4 3 3 2-2 3 3"/></svg>`,
    check: `<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>`,
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

function setAppLoadingStep(message) {
  const loadingText = document.getElementById("appLoadingText");
  if (loadingText) {
    loadingText.textContent = message;
  }
}

async function tryAutoInstallAgent(name, statusGetter, installFn) {
  const status = typeof statusGetter === "function" ? statusGetter() : null;
  const available = status ? (status.installed || status.runnable) : false;
  if (available || status?.autoInstallDisabled) {
    return;
  }
  try {
    const result = await installFn();
    if (result && result.ok) {
      console.log(`${name} auto-install succeeded, refreshing status...`);
    } else {
      console.warn(`${name} auto-install returned:`, result);
    }
  } catch (error) {
    console.warn(`${name} auto-install failed:`, error);
  }
}

async function runStartupConfigurationLoad() {
  setAppLoadingStep(t("app.loading.workspace", "正在加载工作区状态..."));
  await loadState();
  // 先显示可交互的工作区，环境探测等非关键任务完成后再刷新对应状态。
  render();
  // 启动期间外部 MCP/存储恢复可能晚于首次状态读取，再做一次幂等修复。
  setTimeout(() => {
    repairAllReadyKernelDispatches("startup-repair").catch((error) => {
      recordAppLog("kernel.dispatch.startup-repair.error", { error: error.message }, "warn");
    });
  }, 0);

  setAppLoadingStep(t("app.loading.windows", "正在读取窗口状态..."));
  try {
    isWindowMaximized = Boolean(await window.cossAPI?.isWindowMaximized?.());
  } catch {
    isWindowMaximized = false;
  }

  setAppLoadingStep(t("app.loading.claude", "正在检测 Claude Code 环境..."));
  await checkClaudeStatus();
  if (latestClaudeStatus && !latestClaudeStatus.installed && !latestClaudeStatus.autoInstallDisabled) {
    setAppLoadingStep(t("app.loading.claude.installing", "未检测到 Claude Code 环境，正在自动安装..."));
    await tryAutoInstallAgent("Claude Code", () => latestClaudeStatus, () => window.cossAPI?.installClaude?.());
    await checkClaudeStatus();
  }

  setAppLoadingStep(t("app.loading.codex", "正在检测 Codex CLI 环境..."));
  await checkCodexStatus();
  if (latestCodexStatus && !latestCodexStatus.runnable && !latestCodexStatus.autoInstallDisabled) {
    setAppLoadingStep(t("app.loading.codex.installing", "未检测到 Codex CLI 环境，正在自动安装..."));
    await tryAutoInstallAgent("Codex CLI", () => latestCodexStatus, () => window.cossAPI?.installCodex?.());
    await checkCodexStatus();
  }

  setAppLoadingStep(t("app.loading.codebuddy", "正在检测 CodeBuddy Code 环境..."));
  await checkCodeBuddyStatus();
  if (latestCodeBuddyStatus && !latestCodeBuddyStatus.runnable && !latestCodeBuddyStatus.autoInstallDisabled) {
    setAppLoadingStep(t("app.loading.codebuddy.installing", "未检测到 CodeBuddy Code 环境，正在自动安装..."));
    await tryAutoInstallAgent("CodeBuddy Code", () => latestCodeBuddyStatus, () => window.cossAPI?.installCodeBuddy?.());
    await checkCodeBuddyStatus();
  }

  setAppLoadingStep(t("app.loading.storage", "正在读取存储与项目配置..."));
  await refreshStorageInfo({ rerender: false });
  if (state.activeProjectId) {
    await checkCurrentProjectMcpConfig({ rerender: false });
  }

  setAppLoadingStep(t("app.loading.desktop", "正在准备桌面..."));
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
}

runStartupConfigurationLoad().catch((error) => {
  console.error("Failed to load CosS startup configuration", error);
  setAppLoadingStep(t("app.loading.failed", "启动配置加载失败：{{error}}", { error: error.message }));
  setTimeout(() => {
    render();
  }, 900);
});
