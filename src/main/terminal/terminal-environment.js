/**
 * Terminal Environment — 环境变量与 Shell 配置管理
 *
 * 参考 VS Code 的 terminalEnvironment.ts：
 * - Shell 检测与解析
 * - 环境变量构建
 * - Agent 环境注入
 * - 平台适配
 */

const path = require("path");
const fs = require("fs");
const childProcess = require("child_process");

// ============================================================================
// Shell resolution
// ============================================================================

function getShellCommand(platform = process.platform, env = process.env) {
  if (platform === "win32") {
    return {
      file: "powershell.exe",
      args: ["-NoLogo"]
    };
  }

  return {
    file: env.SHELL || "/bin/bash",
    args: []
  };
}

function resolveCommandOnPath(commandName, env = process.env) {
  const pathValue = env.PATH || env.Path || "";
  const extensions = process.platform === "win32"
    ? (env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];

  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory,
        process.platform === "win32"
          ? `${commandName}${extension.toLowerCase()}`
          : commandName);
      if (fs.existsSync(candidate)) return candidate;

      const upperCandidate = path.join(directory,
        process.platform === "win32"
          ? `${commandName}${extension.toUpperCase()}`
          : commandName);
      if (upperCandidate !== candidate && fs.existsSync(upperCandidate)) return upperCandidate;
    }
  }
  return "";
}

function commandExists(command, env = process.env) {
  if (command.includes("\\") || command.includes("/") || path.isAbsolute(command)) {
    return fs.existsSync(command);
  }

  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = childProcess.spawnSync(checker, [command], {
    encoding: "utf8",
    env,
    windowsHide: true
  });
  return result.status === 0;
}

// ============================================================================
// Case-insensitive env access (for Windows)
// ============================================================================

function getCaseInsensitiveEnvValue(env, key) {
  const match = Object.keys(env).find((name) => name.toLowerCase() === key.toLowerCase());
  return match ? env[match] : undefined;
}

function getCaseInsensitiveEnvKey(env, key, fallback = key) {
  return Object.keys(env).find((name) => name.toLowerCase() === key.toLowerCase()) || fallback;
}

function expandWindowsEnvVars(value, env) {
  return String(value || "").replace(/%([^%]+)%/g, (match, name) =>
    getCaseInsensitiveEnvValue(env, name) || match);
}

// ============================================================================
// Windows PATH expansion
// ============================================================================

function readWindowsRegistryPath(rootKey) {
  const result = childProcess.spawnSync("reg.exe", ["query", rootKey, "/v", "Path"], {
    encoding: "utf8",
    windowsHide: true
  });

  if (result.status !== 0) return "";

  const match = String(result.stdout || "").match(/^\s*Path\s+REG_\w+\s+(.+)$/im);
  return match ? match[1].trim() : "";
}

function mergePathValues(env, values) {
  const seen = new Set();
  const entries = [];

  values
    .flatMap((value) => expandWindowsEnvVars(value, env).split(";"))
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        entries.push(item);
      }
    });

  return entries.join(";");
}

let _windowsEnvCache = null;

function getWindowsShellEnv() {
  if (process.platform !== "win32") {
    return { ...process.env };
  }

  if (_windowsEnvCache) {
    return { ..._windowsEnvCache };
  }

  const env = { ...process.env };
  const pathKey = getCaseInsensitiveEnvKey(env, "Path", "Path");
  const currentPath = env[pathKey] || "";
  const machinePath = readWindowsRegistryPath("HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment");
  const userPath = readWindowsRegistryPath("HKCU\\Environment");
  const localAppData = env.LOCALAPPDATA || path.join(env.USERPROFILE || "", "AppData", "Local");
  const appData = env.APPDATA || path.join(env.USERPROFILE || "", "AppData", "Roaming");

  const pathValue = mergePathValues(env, [
    currentPath,
    machinePath,
    userPath,
    path.join(localAppData, "Microsoft", "WinGet", "Links"),
    path.join(localAppData, "Microsoft", "WindowsApps"),
    path.join(appData, "npm")
  ]);

  Object.keys(env)
    .filter((key) => key.toLowerCase() === "path" && key !== pathKey)
    .forEach((key) => delete env[key]);
  env[pathKey] = pathValue;
  _windowsEnvCache = env;
  return { ..._windowsEnvCache };
}

function getShellEnv(overrides = {}) {
  return {
    ...getWindowsShellEnv(),
    ...overrides
  };
}

// ============================================================================
// Agent terminal environment
// ============================================================================

function buildAgentEnvironment(options = {}) {
  const {
    roleId = "",
    roleName = "",
    rolePrompt = "",
    terminalMode = "shell",
    agentProvider = "claude",
    permissionPolicy = {},
    agentSession = {},
    projectId = "",
    projectName = "",
    taskContext = {},
    mcpServer = {},
    codeBuddyApiKey = "",
    cwd = ""
  } = options;

  return {
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    COSS_ROLE_ID: roleId,
    COSS_ROLE_NAME: roleName,
    COSS_ROLE_PROMPT: rolePrompt,
    COSS_TERMINAL_MODE: terminalMode,
    COSS_AGENT_PROVIDER: agentProvider,
    COSS_AGENT_PERMISSION_MODE: permissionPolicy.id || "",
    COSS_AGENT_PERMISSION_LABEL: permissionPolicy.label || "",
    COSS_AGENT_PERMISSION_INSTRUCTIONS: permissionPolicy.instruction || "",
    COSS_AGENT_SESSION_ID: agentSession.sessionId || "",
    COSS_AGENT_SESSION_NAME: agentSession.sessionName || "",
    COSS_PROJECT_ID: projectId || agentSession.projectId || "",
    COSS_PROJECT_NAME: projectName || agentSession.projectName || "",
    COSS_TASK_ID: taskContext.taskId || agentSession.taskId || "",
    COSS_SUBTASK_ID: taskContext.subtaskId || agentSession.subtaskId || "",
    COSS_TASK_TITLE: taskContext.taskTitle || "",
    COSS_SUBTASK_TITLE: taskContext.subtaskTitle || "",
    COSS_PROJECT_MEMORY: taskContext.projectMemorySummary || "",
    COSS_PROJECT_MEMORY_UPDATED_AT: taskContext.projectMemoryUpdatedAt || "",
    COSS_MCP_SERVER: `${mcpServer.command || ""} ${(mcpServer.args || []).map((a) => JSON.stringify(a)).join(" ")}`,
    COSS_MCP_COMMAND: mcpServer.command || "",
    COSS_MCP_ARGS: JSON.stringify(mcpServer.args || []),
    COSS_MCP_SERVER_PATH: mcpServer.serverPath || "",
    COSS_MCP_USER_DATA: mcpServer.userData || "",
    COSS_MCP_PROJECT_ID: mcpServer.projectId || "",
    COSS_MCP_ROLE_ID: mcpServer.roleId || "",
    COSS_MCP_TASK_ID: mcpServer.taskId || "",
    COSS_MCP_SESSION_ID: mcpServer.sessionId || ""
  };
}

// ============================================================================
// Terminal configuration helpers
// ============================================================================

function normalizeTerminalSize(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeCwd(cwd) {
  if (typeof cwd === "string" && fs.existsSync(cwd)) {
    const stat = fs.statSync(cwd);
    if (stat.isDirectory()) return cwd;
  }
  return process.cwd();
}

function normalizeTerminalMode(value) {
  return value === "agent" || value === "claude" || value === "codex" || value === "codebuddy"
    ? "agent"
    : "shell";
}

function normalizeAgentProvider(value) {
  return ["claude", "codex", "codebuddy"].includes(value) ? value : "claude";
}

// ============================================================================
// Terminal profile (参考 VS Code 的 ITerminalProfile)
// ============================================================================

function createTerminalProfile(options = {}) {
  return Object.freeze({
    profileName: options.profileName || "Default",
    shell: options.shell || getShellCommand(),
    cwd: options.cwd || process.cwd(),
    env: options.env || {},
    colorTheme: options.colorTheme || "default",
    fontFamily: options.fontFamily || "Consolas, 'Cascadia Mono', monospace",
    fontSize: options.fontSize || 12,
    scrollback: options.scrollback || 2000,
    terminalMode: options.terminalMode || "shell",
    agentProvider: options.agentProvider || "claude"
  });
}

module.exports = {
  getShellCommand,
  resolveCommandOnPath,
  commandExists,
  getCaseInsensitiveEnvValue,
  getCaseInsensitiveEnvKey,
  expandWindowsEnvVars,
  getWindowsShellEnv,
  getShellEnv,
  buildAgentEnvironment,
  normalizeTerminalSize,
  normalizeCwd,
  normalizeTerminalMode,
  normalizeAgentProvider,
  createTerminalProfile,

  // For cache reset (e.g., after PATH changes)
  resetWindowsEnvCache() { _windowsEnvCache = null; }
};
