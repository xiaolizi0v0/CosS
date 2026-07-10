/**
 * Single source of truth for the Electron IPC surface.
 * Keep channel names stable: persisted workspaces and third-party MCP clients
 * depend on the current protocol.
 */
const IPC_CHANNELS = Object.freeze({
  STATE_LOAD: "state:load",
  STATE_SAVE: "state:save",
  STATE_META: "state:meta",
  MCP_INFO: "mcp:info",
  MCP_CHECK_PROJECT_CONFIG: "mcp:check-project-config",
  MCP_WRITE_PROJECT_CONFIG: "mcp:write-project-config",
  MCP_AUDIT_EVENTS: "mcp:audit-events",
  LLM_PLAN_TASK: "llm:plan-task",
  LLM_TEST_MODEL: "llm:test-model",
  APP_INFO: "app:info",
  APP_OPEN_EXTERNAL_URL: "app:open-external-url",
  APP_LOG_EVENT: "app:log-event",
  LOGS_OPEN_DIRECTORY: "logs:open-directory",
  STORAGE_INFO: "storage:info",
  STORAGE_BACKUP: "storage:backup",
  STORAGE_EXPORT: "storage:export",
  STORAGE_IMPORT: "storage:import",
  STORAGE_DIAGNOSTICS: "storage:diagnostics",
  STORAGE_OPEN_DIRECTORY: "storage:open-directory",
  DIALOG_SELECT_PROJECT_DIRECTORY: "dialog:select-project-directory",
  DIALOG_SELECT_PROJECT_FILE: "dialog:select-project-file",
  FILES_LIST: "files:list",
  FILES_READ: "files:read",
  FILES_WRITE: "files:write",
  FILES_CREATE_FOLDER: "files:create-folder",
  FILES_RENAME: "files:rename",
  FILES_DELETE: "files:delete",
  WINDOW_NEW: "window:new",
  WINDOW_CONTROL: "window:control",
  WINDOW_IS_MAXIMIZED: "window:is-maximized",
  CLAUDE_STATUS: "claude:status",
  AGENT_INSTALL_CLAUDE: "agent:install-claude",
  AGENT_INSTALL_CODEX: "agent:install-codex",
  AGENT_INSTALL_CODEBUDDY: "agent:install-codebuddy",
  CODEX_STATUS: "codex:status",
  CODEBUDDY_STATUS: "codebuddy:status",
  AGENT_LOGIN_TEST: "agent:login-test",
  WORLD_AGENT_RUN: "world-agent:run",
  TERMINAL_CREATE: "terminal:create",
  TERMINAL_INPUT: "terminal:input",
  TERMINAL_RESIZE: "terminal:resize",
  TERMINAL_DISPOSE: "terminal:dispose"
});

const IPC_EVENTS = Object.freeze({
  APP_MENU_ACTION: "app-menu:action",
  WINDOW_MAXIMIZED: "window:maximized",
  BROWSER_OPEN_URL: "browser:open-url",
  TERMINAL_DATA: "terminal:data",
  TERMINAL_EXIT: "terminal:exit",
  TERMINAL_AGENT_EVENT: "terminal:agent-event"
});

module.exports = { IPC_CHANNELS, IPC_EVENTS };
