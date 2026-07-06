const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("cossAPI", {
  loadState: () => ipcRenderer.invoke("state:load"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
  getStateMeta: () => ipcRenderer.invoke("state:meta"),
  getMcpInfo: (context) => ipcRenderer.invoke("mcp:info", context),
  checkProjectMcpConfig: (request) => ipcRenderer.invoke("mcp:check-project-config", request),
  writeProjectMcpConfig: (request) => ipcRenderer.invoke("mcp:write-project-config", request),
  getMcpAuditEvents: (request) => ipcRenderer.invoke("mcp:audit-events", request),
  planTask: (request) => ipcRenderer.invoke("llm:plan-task", request),
  testModelConnectivity: (request) => ipcRenderer.invoke("llm:test-model", request),
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  openExternalUrl: (url) => ipcRenderer.invoke("app:open-external-url", url),
  logEvent: (eventName, payload, level) => ipcRenderer.invoke("app:log-event", eventName, payload, level),
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
    ipcRenderer.on("app-menu:action", listener);
    return () => ipcRenderer.removeListener("app-menu:action", listener);
  },
  onWindowMaximized: (callback) => {
    const listener = (_event, maximized) => callback(maximized);
    ipcRenderer.on("window:maximized", listener);
    return () => ipcRenderer.removeListener("window:maximized", listener);
  },
  onBrowserOpenUrl: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("browser:open-url", listener);
    return () => ipcRenderer.removeListener("browser:open-url", listener);
  },
  getClaudeStatus: () => ipcRenderer.invoke("claude:status"),
  installClaude: () => ipcRenderer.invoke("agent:install-claude"),
  installCodex: () => ipcRenderer.invoke("agent:install-codex"),
  installCodeBuddy: () => ipcRenderer.invoke("agent:install-codebuddy"),
  getCodexStatus: () => ipcRenderer.invoke("codex:status"),
  getCodeBuddyStatus: (request) => ipcRenderer.invoke("codebuddy:status", request),
  testAgentLogin: (request) => ipcRenderer.invoke("agent:login-test", request),
  createTerminal: (options) => ipcRenderer.invoke("terminal:create", options),
  sendTerminalInput: (id, data, options) => ipcRenderer.invoke("terminal:input", id, data, options),
  resizeTerminal: (id, cols, rows) => ipcRenderer.invoke("terminal:resize", id, cols, rows),
  disposeTerminal: (id) => ipcRenderer.invoke("terminal:dispose", id),
  onTerminalData: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:data", listener);
    return () => ipcRenderer.removeListener("terminal:data", listener);
  },
  onTerminalExit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:exit", listener);
    return () => ipcRenderer.removeListener("terminal:exit", listener);
  },
  onAgentEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("terminal:agent-event", listener);
    return () => ipcRenderer.removeListener("terminal:agent-event", listener);
  }
});
