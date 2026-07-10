const { contextBridge, ipcRenderer } = require("electron");
// Sandbox preload scripts cannot require arbitrary local modules. Keep this
// small mirror aligned with src/shared/ipc-contracts.cjs; main.cjs and tests
// use the shared source of truth directly.
const IPC_CHANNELS = Object.freeze({
  STATE_LOAD: "state:load", STATE_SAVE: "state:save", STATE_META: "state:meta",
  MCP_INFO: "mcp:info", MCP_CHECK_PROJECT_CONFIG: "mcp:check-project-config",
  MCP_WRITE_PROJECT_CONFIG: "mcp:write-project-config", MCP_AUDIT_EVENTS: "mcp:audit-events",
  LLM_PLAN_TASK: "llm:plan-task", LLM_TEST_MODEL: "llm:test-model",
  APP_INFO: "app:info", APP_OPEN_EXTERNAL_URL: "app:open-external-url", APP_LOG_EVENT: "app:log-event",
  WORLD_AGENT_RUN: "world-agent:run", TERMINAL_CREATE: "terminal:create",
  TERMINAL_INPUT: "terminal:input", TERMINAL_RESIZE: "terminal:resize", TERMINAL_DISPOSE: "terminal:dispose"
});
const IPC_EVENTS = Object.freeze({
  APP_MENU_ACTION: "app-menu:action", WINDOW_MAXIMIZED: "window:maximized",
  BROWSER_OPEN_URL: "browser:open-url", TERMINAL_DATA: "terminal:data",
  TERMINAL_EXIT: "terminal:exit", TERMINAL_AGENT_EVENT: "terminal:agent-event"
});

contextBridge.exposeInMainWorld("cossAPI", {
  loadState: () => ipcRenderer.invoke(IPC_CHANNELS.STATE_LOAD),
  saveState: (state) => ipcRenderer.invoke(IPC_CHANNELS.STATE_SAVE, state),
  getStateMeta: () => ipcRenderer.invoke(IPC_CHANNELS.STATE_META),
  getMcpInfo: (context) => ipcRenderer.invoke(IPC_CHANNELS.MCP_INFO, context),
  checkProjectMcpConfig: (request) => ipcRenderer.invoke(IPC_CHANNELS.MCP_CHECK_PROJECT_CONFIG, request),
  writeProjectMcpConfig: (request) => ipcRenderer.invoke(IPC_CHANNELS.MCP_WRITE_PROJECT_CONFIG, request),
  getMcpAuditEvents: (request) => ipcRenderer.invoke(IPC_CHANNELS.MCP_AUDIT_EVENTS, request),
  planTask: (request) => ipcRenderer.invoke(IPC_CHANNELS.LLM_PLAN_TASK, request),
  testModelConnectivity: (request) => ipcRenderer.invoke(IPC_CHANNELS.LLM_TEST_MODEL, request),
  getAppInfo: () => ipcRenderer.invoke(IPC_CHANNELS.APP_INFO),
  openExternalUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.APP_OPEN_EXTERNAL_URL, url),
  logEvent: (eventName, payload, level) => ipcRenderer.invoke(IPC_CHANNELS.APP_LOG_EVENT, eventName, payload, level),
  openLogDirectory: () => ipcRenderer.invoke("logs:open-directory"),
  getStorageInfo: () => ipcRenderer.invoke("storage:info"),
  createStorageBackup: () => ipcRenderer.invoke("storage:backup"),
  exportStorageState: (request) => ipcRenderer.invoke("storage:export", request),
  importStorageState: (request) => ipcRenderer.invoke("storage:import", request),
  exportDiagnosticsPackage: (request) => ipcRenderer.invoke("storage:diagnostics", request),
  openStorageDirectory: () => ipcRenderer.invoke("storage:open-directory"),
  selectProjectDirectory: (currentPath) => ipcRenderer.invoke("dialog:select-project-directory", currentPath),
  selectProjectFile: (request) => ipcRenderer.invoke("dialog:select-project-file", request),
  listProjectFiles: (projectPath) => ipcRenderer.invoke("files:list", projectPath),
  readProjectFile: (request) => ipcRenderer.invoke("files:read", request),
  writeProjectFile: (request) => ipcRenderer.invoke("files:write", request),
  createProjectFolder: (request) => ipcRenderer.invoke("files:create-folder", request),
  renameProjectFile: (request) => ipcRenderer.invoke("files:rename", request),
  deleteProjectFile: (request) => ipcRenderer.invoke("files:delete", request),
  createAppWindow: () => ipcRenderer.invoke("window:new"),
  controlWindow: (action) => ipcRenderer.invoke("window:control", action),
  isWindowMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onAppMenuAction: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_EVENTS.APP_MENU_ACTION, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.APP_MENU_ACTION, listener);
  },
  onWindowMaximized: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on(IPC_EVENTS.WINDOW_MAXIMIZED, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.WINDOW_MAXIMIZED, listener);
  },
  onBrowserOpenUrl: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_EVENTS.BROWSER_OPEN_URL, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.BROWSER_OPEN_URL, listener);
  },
  getClaudeStatus: () => ipcRenderer.invoke("claude:status"),
  installClaude: () => ipcRenderer.invoke("agent:install-claude"),
  installCodex: () => ipcRenderer.invoke("agent:install-codex"),
  installCodeBuddy: () => ipcRenderer.invoke("agent:install-codebuddy"),
  getCodexStatus: () => ipcRenderer.invoke("codex:status"),
  getCodeBuddyStatus: (request) => ipcRenderer.invoke("codebuddy:status", request),
  testAgentLogin: (request) => ipcRenderer.invoke("agent:login-test", request),
  runWorldAgent: (request) => ipcRenderer.invoke(IPC_CHANNELS.WORLD_AGENT_RUN, request),
  createTerminal: (options) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_CREATE, options),
  sendTerminalInput: (id, data, options) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_INPUT, id, data, options),
  resizeTerminal: (id, cols, rows) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_RESIZE, id, cols, rows),
  disposeTerminal: (id) => ipcRenderer.invoke(IPC_CHANNELS.TERMINAL_DISPOSE, id),
  onTerminalData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_EVENTS.TERMINAL_DATA, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.TERMINAL_DATA, listener);
  },
  onTerminalExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_EVENTS.TERMINAL_EXIT, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.TERMINAL_EXIT, listener);
  },
  onAgentEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on(IPC_EVENTS.TERMINAL_AGENT_EVENT, listener);
    return () => ipcRenderer.removeListener(IPC_EVENTS.TERMINAL_AGENT_EVENT, listener);
  }
});
