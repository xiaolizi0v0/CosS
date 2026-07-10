const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require("electron");
const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs");
const childProcess = require("child_process");
const { IPC_CHANNELS, IPC_EVENTS } = require("./shared/ipc-contracts.cjs");
const { STATE_SCHEMA_VERSION } = require("./shared/state-contracts.cjs");
const { ARCHITECTURE_VERSION } = require("./shared/architecture.cjs");
const { createStorageService } = require("./main/services/storage-service.cjs");
const { createLlmService } = require("./main/services/llm-service.cjs");
const { registerIpcHandlers } = require("./main/ipc/register-ipc.cjs");

let nodePty = null;
let initSqlJs = null;

try {
  nodePty = require("node-pty");
} catch (error) {
  console.warn("node-pty is unavailable, falling back to pipe-based shells.", error);
}

try {
  initSqlJs = require("sql.js");
} catch (error) {
  console.warn("sql.js is unavailable, falling back to JSON state storage.", error);
}

const dataFileName = "coss-workspace-state.json";
const sqliteFileName = "coss-workspace.sqlite";
const storageSchemaVersion = 1;
const maxStateBackups = 12;
const appVersion = (() => {
  try {
    return require("../package.json").version;
  } catch {
    return "0.11.0";
  }
})();
const terminalSessions = new Map();
const terminalTranscripts = new Map();
const terminalWebContents = new Map();
const agentOutputEventKeys = new Map();
const terminalProcessTreeSnapshotDelaysMs = [500, 2000, 5000];
const claudeCodeWingetPackage = "Anthropic.ClaudeCode";
const codexNpmPackage = "@openai/codex";
const codeBuddyNpmPackage = "@tencent-ai/codebuddy-code";
const agentPermissionPolicies = {
  readonly: {
    id: "readonly",
    label: "只读模式",
    instruction: "当前 CosS Agent 权限模式：只读模式。只能阅读和分析项目内容，不能创建、修改、删除文件，不能安装依赖，不能运行部署、格式化磁盘或其他写入/破坏性命令。如确需修改，请先说明原因并等待用户调整权限。"
  },
  confirm: {
    id: "confirm",
    label: "每次编辑确认",
    instruction: "当前 CosS Agent 权限模式：每次编辑确认。执行任何文件写入、依赖安装、删除、部署、网络发布或高风险命令前，必须先说明计划、影响范围和风险，并等待用户确认。"
  },
  sessionEdit: {
    id: "sessionEdit",
    label: "本会话允许编辑",
    instruction: "当前 CosS Agent 权限模式：本会话允许编辑。可以在当前项目目录内创建和修改文件；安装依赖、删除文件、部署、格式化磁盘、访问敏感信息或其他高风险操作仍必须先等待用户确认。"
  },
  sessionInstall: {
    id: "sessionInstall",
    label: "本会话允许编辑与安装依赖",
    instruction: "当前 CosS Agent 权限模式：本会话允许编辑与安装依赖。可以在当前项目目录内创建/修改文件并安装必要依赖；删除文件、部署、格式化磁盘、清理大范围目录、访问敏感信息或其他破坏性操作仍必须先等待用户确认。"
  },
  worldFullAccess: {
    id: "worldFullAccess",
    label: "世界 Agent 完全访问",
    instruction: "当前 CosS 世界 Agent 权限模式：完全访问。你运行在从 0 开始的隔离世界 CLI 内核中，不复用任何项目终端会话；可直接使用终端完成角色任务。涉及真实外部发布、删除用户数据、付款、发送消息给外部人员等不可逆动作时仍需遵守系统与用户授权边界。"
  }
};
const terminalPermissionRiskRules = [
  {
    id: "delete-files",
    category: "delete",
    severity: "high",
    label: "文件删除",
    pattern: /\b(remove-item|rm|del|erase|rmdir|rd)\b/i
  },
  {
    id: "dependency-install",
    category: "install",
    severity: "medium",
    label: "依赖或软件安装",
    pattern: /\b(winget|npm|pnpm|yarn|pip|choco|scoop|cargo|dotnet)\s+(install|i|add|update|upgrade)\b/i
  },
  {
    id: "file-write",
    category: "write",
    severity: "medium",
    label: "文件写入",
    pattern: /\b(set-content|add-content|out-file|new-item|copy-item|move-item)\b|(^|[^>])>\s*[^&|]/i
  },
  {
    id: "environment-change",
    category: "environment",
    severity: "high",
    label: "环境变量或注册表修改",
    pattern: /\b(setx|reg\s+add|\[environment\]::setenvironmentvariable)\b|\$env:[\w()\\.-]+\s*=/i
  },
  {
    id: "deployment",
    category: "deployment",
    severity: "high",
    label: "发布或部署",
    pattern: /\b(git\s+push|npm\s+publish|docker\s+push|kubectl\s+(apply|delete)|terraform\s+(apply|destroy))\b/i
  },
  {
    id: "script-execution",
    category: "script",
    severity: "medium",
    label: "动态脚本执行",
    pattern: /\b(iex|invoke-expression|powershell\s+-encodedcommand)\b|(\|\s*(powershell|pwsh|sh|bash)\b)/i
  }
];
const defaultLlmRequestTimeoutMs = 60000;
const llmService = createLlmService({
  sanitizeLogText,
  getTimeout: () => getLlmRequestTimeoutMs(),
  appendLogEvent,
  summarizePlanRequest,
  summarizeModelConfig,
  serializeError
});
const {
  findBalancedJsonObject,
  handlePlanTask,
  handleTestModelConnectivity
} = llmService;
const maxEditableFileBytes = 1024 * 1024 * 2;
const fileListLimit = 240;
let windowsEnvCache = null;
const cossMainWindowIds = new Set();
let creatingCosSMainWindow = false;
let lastStateBackupAt = 0;
let sqlJsRuntimePromise = null;

if (process.env.COSS_TEST_USER_DATA) {
  app.setPath("userData", process.env.COSS_TEST_USER_DATA);
}

const storageService = createStorageService({
  app,
  processEnv: process.env,
  dataFileName,
  sqliteFileName
});

function getDataFilePath() {
  return storageService.getDataFilePath();
}

function getSqliteFilePath() {
  return storageService.getSqliteFilePath();
}

function getStorageDirectory() {
  return storageService.getStorageDirectory();
}

function getStateBackupDirectory() {
  return storageService.getBackupDirectory();
}

function getDiagnosticsDirectory() {
  return storageService.getDiagnosticsDirectory();
}

function getLogDirectory() {
  return storageService.getLogDirectory();
}

function getLogFilePath(date = new Date()) {
  return storageService.getLogFilePath(date);
}

function appendLogEvent(eventName, payload = {}, level = "info") {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event: eventName,
    appVersion,
    payload
  };

  try {
    fs.mkdirSync(getLogDirectory(), { recursive: true });
    fs.appendFileSync(getLogFilePath(), `${JSON.stringify(entry)}\n`, "utf8");
  } catch (error) {
    console.warn("Failed to write CosS log", error);
  }

  return entry;
}

function sanitizeLogText(value, maxLength = 240) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getLlmRequestTimeoutMs() {
  const value = Number.parseInt(process.env.COSS_LLM_TIMEOUT_MS || "", 10);
  if (Number.isFinite(value) && value >= 1000) {
    return value;
  }
  return defaultLlmRequestTimeoutMs;
}

function serializeError(error) {
  const serialized = {
    name: error?.name || "",
    message: error?.message || String(error || "unknown error"),
    stack: typeof error?.stack === "string" ? error.stack.split("\n").slice(0, 8).join("\n") : "",
    code: error?.code || "",
    errno: Number.isFinite(error?.errno) ? error.errno : undefined
  };
  for (const key of ["Pa", "errnoCode", "sqlCode"]) {
    if (error && Object.prototype.hasOwnProperty.call(error, key)) {
      serialized[key] = error[key];
    }
  }
  return serialized;
}

function isExitedPtyResizeError(error) {
  const message = String(error?.message || error || "");
  const stack = String(error?.stack || "");
  return message.includes("Cannot resize a pty that has already exited")
    || (message.includes("resize") && message.includes("pty") && stack.includes("node-pty"));
}

function handleMainUncaughtException(error) {
  if (isExitedPtyResizeError(error)) {
    appendLogEvent("terminal.resize.ignored-after-exit", {
      error: serializeError(error)
    }, "warn");
    return;
  }
  process.removeListener("uncaughtException", handleMainUncaughtException);
  throw error;
}

process.on("uncaughtException", handleMainUncaughtException);

function summarizeModelConfig(model = {}) {
  return {
    provider: model.provider || model.id || "",
    baseUrl: sanitizeLogText(model.baseUrl, 180),
    modelName: sanitizeLogText(model.modelName, 80),
    hasApiKey: Boolean(model.apiKey)
  };
}

function summarizePlanRequest(request = {}) {
  return {
    projectName: sanitizeLogText(request.projectName, 100),
    goal: sanitizeLogText(request.goal, 240),
    roleCount: Array.isArray(request.roles) ? request.roles.length : 0,
    imageCount: Array.isArray(request.attachments) ? request.attachments.filter((item) => item?.type === "image").length : 0,
    timeoutMs: getLlmRequestTimeoutMs(),
    model: summarizeModelConfig(request.model || {})
  };
}

function getTargetWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function getAppIconPath() {
  const icoPath = path.join(__dirname, "app-icon.ico");
  if (process.platform === "win32" && fs.existsSync(icoPath)) {
    return icoPath;
  }
  const pngPath = path.join(__dirname, "Logo.png");
  return fs.existsSync(pngPath) ? pngPath : "";
}

function sendMenuAction(action, payload = {}) {
  const win = getTargetWindow();
  if (!win || win.isDestroyed()) {
    return;
  }

  appendLogEvent("menu.action", { action });
  win.webContents.send(IPC_EVENTS.APP_MENU_ACTION, { action, payload });
}

function getClaudeConfigPath() {
  return process.env.COSS_CLAUDE_CONFIG_PATH || path.join(app.getPath("home"), ".claude.json");
}

async function readState() {
  const sqlitePath = getSqliteFilePath();
  const filePath = getDataFilePath();
  let db = null;

  try {
    try {
      db = await Promise.race([
        openSqliteDatabase(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("sqlite open timeout")), 5000))
      ]);
    } catch (sqliteError) {
      appendLogEvent("storage.sqlite.timeout", { error: sqliteError.message }, "warn");
      const jsonState = readStateFile(filePath);
      if (jsonState.ok) {
        appendLogEvent("storage.state.loaded", { mode: "json-timeout-fallback", filePath }, "warn");
        return jsonState.state;
      }
      throw sqliteError;
    }
    const sqliteState = readWorkspaceStateFromDb(db);
    if (sqliteState) {
      const jsonState = readStateFile(filePath);
      if (jsonState.ok && isJsonStateNewerThanSqlite(
        jsonState.state,
        sqliteState,
        safeFileStat(filePath),
        safeFileStat(sqlitePath)
      )) {
        writeWorkspaceStateToDb(db, jsonState.state);
        persistSqliteDatabase(db);
        appendLogEvent("storage.state.loaded", {
          mode: "json-newer-than-sqlite",
          schemaVersion: storageSchemaVersion,
          filePath,
          sqlitePath,
          recovered: true
        }, "warn");
        return jsonState.state;
      }
      appendLogEvent("storage.state.loaded", {
        mode: "sqlite",
        schemaVersion: storageSchemaVersion,
        filePath: sqlitePath,
        recovered: false
      });
      return sqliteState;
    }

    const jsonState = readStateFile(filePath);
    if (jsonState.ok) {
      writeWorkspaceStateToDb(db, jsonState.state);
      persistSqliteDatabase(db);
      appendLogEvent("storage.state.migrated", {
        from: filePath,
        to: sqlitePath,
        mode: "json-to-sqlite"
      });
      return jsonState.state;
    }

    return null;
  } catch (error) {
    const quarantinePath = fs.existsSync(sqlitePath) ? quarantineInvalidStateFile(sqlitePath, error.message) : "";
    appendLogEvent("storage.sqlite.read.failed", { filePath: sqlitePath, quarantinePath, error: serializeError(error) }, "error");
    const recovered = await recoverSqliteStateFromBackup();
    if (recovered) {
      return recovered;
    }
  } finally {
    closeSqliteDatabase(db);
  }

  const primary = readStateFile(filePath);
  if (primary.ok) {
    appendLogEvent("storage.state.loaded", {
      mode: "json-fallback",
      schemaVersion: storageSchemaVersion,
      filePath,
      recovered: false
    });
    return primary.state;
  }
  if (primary.exists) {
    const quarantinePath = quarantineInvalidStateFile(filePath, primary.error);
    appendLogEvent("state.read.failed", { filePath, quarantinePath, error: primary.error }, "error");
  }

  const latestBackup = getLatestStateBackupPath();
  if (!latestBackup) {
    return null;
  }

  const backup = readStateFile(latestBackup);
  if (!backup.ok) {
    appendLogEvent("storage.state.recovery.failed", { backupPath: latestBackup, error: backup.error }, "error");
    return null;
  }

  try {
    writeJsonAtomic(filePath, backup.state);
    appendLogEvent("storage.state.recovered", {
      filePath,
      backupPath: latestBackup,
      quarantineUsed: Boolean(primary.exists)
    }, "warn");
  } catch (error) {
    appendLogEvent("storage.state.recovery.write-failed", {
      filePath,
      backupPath: latestBackup,
      error: serializeError(error)
    }, "error");
  }

  return backup.state;
}

async function writeState(state) {
  const filePath = getDataFilePath();
  const sqlitePath = getSqliteFilePath();
  state.updatedAt = new Date().toISOString();
  const projectCount = Array.isArray(state?.projects) ? state.projects.length : 0;
  let backupPath = "";
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    backupPath = createStateBackup("before-write");
    writeJsonAtomic(filePath, state);
  } catch (error) {
    appendLogEvent("state.write.failed", { filePath, error: serializeError(error) }, "error");
    throw error;
  }

  if (!initSqlJs) {
    return {
      ok: true,
      mode: "json",
      schemaVersion: storageSchemaVersion,
      filePath,
      sqliteEnabled: false,
      backupPath
    };
  }

  let db = null;
  try {
    db = await openSqliteDatabase();
    writeWorkspaceStateToDb(db, state);
    persistSqliteDatabase(db);
    return {
      ok: true,
      mode: "sqlite",
      schemaVersion: storageSchemaVersion,
      filePath: sqlitePath,
      jsonMirrorPath: filePath,
      backupPath
    };
  } catch (error) {
    appendLogEvent("storage.sqlite.write.failed", {
      filePath: sqlitePath,
      jsonMirrorPath: filePath,
      projects: projectCount,
      error: serializeError(error)
    }, "error");
    return {
      ok: true,
      mode: "json-fallback",
      schemaVersion: storageSchemaVersion,
      filePath,
      sqlitePath,
      sqliteEnabled: true,
      sqliteError: serializeError(error),
      backupPath
    };
  } finally {
    closeSqliteDatabase(db);
  }
}

function normalizeTerminalSize(value, fallback, min, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function normalizeCwd(cwd) {
  if (typeof cwd === "string" && fs.existsSync(cwd)) {
    const stat = fs.statSync(cwd);
    if (stat.isDirectory()) {
      return cwd;
    }
  }

  return process.cwd();
}

function getShellCommand() {
  if (process.platform === "win32") {
    return {
      file: "powershell.exe",
      args: ["-NoLogo"]
    };
  }

  return {
    file: process.env.SHELL || "/bin/bash",
    args: []
  };
}

function getCaseInsensitiveEnvValue(env, key) {
  const match = Object.keys(env).find((name) => name.toLowerCase() === key.toLowerCase());
  return match ? env[match] : undefined;
}

function getCaseInsensitiveEnvKey(env, key, fallback = key) {
  return Object.keys(env).find((name) => name.toLowerCase() === key.toLowerCase()) || fallback;
}

function expandWindowsEnvVars(value, env) {
  return String(value || "").replace(/%([^%]+)%/g, (match, name) => getCaseInsensitiveEnvValue(env, name) || match);
}

function readWindowsRegistryPath(rootKey) {
  const result = childProcess.spawnSync("reg.exe", ["query", rootKey, "/v", "Path"], {
    encoding: "utf8",
    windowsHide: true
  });

  if (result.status !== 0) {
    return "";
  }

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

function getWindowsShellEnv() {
  if (process.platform !== "win32") {
    return { ...process.env };
  }

  if (windowsEnvCache) {
    return { ...windowsEnvCache };
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
  windowsEnvCache = env;
  return { ...windowsEnvCache };
}

function getShellEnv(overrides = {}) {
  return {
    ...getWindowsShellEnv(),
    ...overrides
  };
}

function safeFileStat(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    };
  } catch {
    return { exists: false, size: 0, modifiedAt: "" };
  }
}

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
}

function renameAtomicWithRetry(tempPath, filePath, context = {}) {
  const maxAttempts = Math.max(1, Number(context.maxAttempts) || 6);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.renameSync(tempPath, filePath);
      return;
    } catch (error) {
      const retryable = ["EPERM", "EACCES", "EBUSY"].includes(error?.code);
      if (!retryable || attempt >= maxAttempts) {
        throw error;
      }
      sleepSync(Math.min(30 * attempt, 180));
    }
  }
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  cleanupStaleAtomicTempFiles(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
    renameAtomicWithRetry(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Best effort cleanup only.
    }
    throw error;
  }
}

function writeFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  cleanupStaleAtomicTempFiles(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`);
  fs.mkdirSync(dir, { recursive: true });
  try {
    fs.writeFileSync(tempPath, data);
    renameAtomicWithRetry(tempPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // Best effort cleanup only.
    }
    throw error;
  }
}

function cleanupStaleAtomicTempFiles(filePath, maxAgeMs = 60 * 60 * 1000) {
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath);
  const now = Date.now();
  try {
    if (!fs.existsSync(dir)) {
      return;
    }
    fs.readdirSync(dir)
      .filter((name) => name.startsWith(`${baseName}.`) && name.endsWith(".tmp"))
      .forEach((name) => {
        const tempPath = path.join(dir, name);
        const stat = fs.statSync(tempPath);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.unlinkSync(tempPath);
        }
      });
  } catch (error) {
    appendLogEvent("storage.atomic-temp.cleanup.failed", {
      filePath,
      error: serializeError(error)
    }, "warn");
  }
}

async function getSqlJsRuntime() {
  if (!initSqlJs) {
    appendLogEvent("storage.sqljs.unavailable", {}, "warn");
    throw new Error("sql.js 依赖不可用。");
  }

  if (!sqlJsRuntimePromise) {
    appendLogEvent("storage.sqljs.loading", {}, "info");
    const distDir = path.dirname(require.resolve("sql.js/dist/sql-wasm.js"));
    sqlJsRuntimePromise = Promise.race([
      initSqlJs({
        locateFile: (fileName) => path.join(distDir, fileName)
      }).then((SQL) => {
        appendLogEvent("storage.sqljs.loaded", {}, "info");
        return SQL;
      }),
      new Promise((_, reject) => setTimeout(() => {
        appendLogEvent("storage.sqljs.timeout", {}, "error");
        reject(new Error("sql.js WASM 加载超时"));
      }, 8000))
    ]);
  }

  return sqlJsRuntimePromise;
}

function ensureSqliteSchema(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", ["schema_version", String(storageSchemaVersion)]);
  db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", ["app_version", appVersion]);
  db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", ["updated_at", now]);
}

async function openSqliteDatabase() {
  const SQL = await getSqlJsRuntime();
  const sqlitePath = getSqliteFilePath();
  let db;
  if (fs.existsSync(sqlitePath)) {
    db = new SQL.Database(fs.readFileSync(sqlitePath));
  } else {
    db = new SQL.Database();
  }
  ensureSqliteSchema(db);
  return db;
}

function readWorkspaceStateFromDb(db) {
  const rows = db.exec("SELECT value FROM app_state WHERE key = 'workspace_state' LIMIT 1");
  const value = rows?.[0]?.values?.[0]?.[0];
  if (!value) {
    return null;
  }
  const state = JSON.parse(value);
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("SQLite 中的工作区状态不是有效对象。");
  }
  return state;
}

function writeWorkspaceStateToDb(db, state) {
  const now = new Date().toISOString();
  db.run(
    "INSERT OR REPLACE INTO app_state (key, value, updated_at) VALUES (?, ?, ?)",
    ["workspace_state", JSON.stringify(state), now]
  );
  db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", ["updated_at", now]);
}

function persistSqliteDatabase(db) {
  writeFileAtomic(getSqliteFilePath(), Buffer.from(db.export()));
}

function closeSqliteDatabase(db) {
  if (!db || typeof db.close !== "function") {
    return;
  }
  try {
    db.close();
  } catch (error) {
    appendLogEvent("storage.sqlite.close.failed", { error: serializeError(error) }, "warn");
  }
}

function readStateFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return { ok: false, exists: false, state: null, error: "" };
  }

  try {
    const state = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new Error("状态文件不是有效对象。");
    }
    return { ok: true, exists: true, state, error: "" };
  } catch (error) {
    return { ok: false, exists: true, state: null, error: error.message };
  }
}

function cloneStateValue(value) {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function getTimestampMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function getStateFreshnessMs(state, fileStat = {}) {
  return Math.max(getTimestampMs(state?.updatedAt), getTimestampMs(fileStat.modifiedAt));
}

function isJsonStateNewerThanSqlite(jsonState, sqliteState, jsonStat = {}, sqliteStat = {}) {
  const jsonFreshness = getStateFreshnessMs(jsonState, jsonStat);
  const sqliteFreshness = getStateFreshnessMs(sqliteState, sqliteStat);
  return jsonFreshness > sqliteFreshness + 2;
}

function mergeUniqueStrings(...lists) {
  const result = [];
  lists.flat().forEach((value) => {
    const item = String(value || "").trim();
    if (item && !result.includes(item)) {
      result.push(item);
    }
  });
  return result;
}

const durableSubtaskStatusRank = {
  idle: 0,
  running: 1,
  done: 2
};

const durableStepPhaseRank = {
  idle: 0,
  running: 1,
  done: 2
};

function pickDurableProgressValue(incomingValue, durableValue, rankMap) {
  const incomingRank = rankMap[String(incomingValue || "").trim()] ?? -1;
  const durableRank = rankMap[String(durableValue || "").trim()] ?? -1;
  return durableRank > incomingRank ? durableValue : incomingValue;
}

function mergeRecordsById(incomingRecords = [], durableRecords = [], mergeRecord = null) {
  const result = [];
  const indexById = new Map();
  (Array.isArray(incomingRecords) ? incomingRecords : []).forEach((record) => {
    if (!record?.id) {
      result.push(cloneStateValue(record));
      return;
    }
    indexById.set(record.id, result.length);
    result.push(cloneStateValue(record));
  });

  (Array.isArray(durableRecords) ? durableRecords : []).forEach((record) => {
    if (!record?.id) {
      return;
    }
    const existingIndex = indexById.get(record.id);
    if (existingIndex === undefined) {
      indexById.set(record.id, result.length);
      result.push(cloneStateValue(record));
      return;
    }
    result[existingIndex] = mergeRecord
      ? mergeRecord(result[existingIndex], record)
      : { ...cloneStateValue(record), ...result[existingIndex] };
  });
  return result;
}

function normalizeDeletedProjectIds(state = {}) {
  return new Set(
    (Array.isArray(state?.deletedProjectIds) ? state.deletedProjectIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );
}

function mergeDurableMessage(incomingMessage, durableMessage) {
  return {
    ...incomingMessage,
    agentPoolPaths: {
      ...(durableMessage.agentPoolPaths || {}),
      ...(incomingMessage.agentPoolPaths || {})
    },
    readBy: mergeUniqueStrings(durableMessage.readBy || [], incomingMessage.readBy || []),
    injectedWindowIds: mergeUniqueStrings(durableMessage.injectedWindowIds || [], incomingMessage.injectedWindowIds || []),
    autoWorkflow: Boolean(incomingMessage.autoWorkflow || durableMessage.autoWorkflow),
    autoWorkflowStatus: incomingMessage.autoWorkflowStatus || durableMessage.autoWorkflowStatus || "",
    autoWorkflowDispatchedAt: incomingMessage.autoWorkflowDispatchedAt || durableMessage.autoWorkflowDispatchedAt || "",
    autoWorkflowStoppedAt: incomingMessage.autoWorkflowStoppedAt || durableMessage.autoWorkflowStoppedAt || "",
    agentPoolStatus: incomingMessage.agentPoolStatus || durableMessage.agentPoolStatus || "idle",
    subtaskRefs: {
      ...(durableMessage.subtaskRefs || {}),
      ...(incomingMessage.subtaskRefs || {})
    }
  };
}

function mergeDurableSubtask(incomingSubtask, durableSubtask) {
  const status = pickDurableProgressValue(incomingSubtask.status, durableSubtask.status, durableSubtaskStatusRank);
  return {
    ...incomingSubtask,
    status,
    assignedMessageId: incomingSubtask.assignedMessageId || durableSubtask.assignedMessageId || "",
    dependsOn: mergeUniqueStrings(durableSubtask.dependsOn || [], incomingSubtask.dependsOn || []),
    updatedAt: getTimestampMs(durableSubtask.updatedAt) > getTimestampMs(incomingSubtask.updatedAt)
      ? durableSubtask.updatedAt
      : incomingSubtask.updatedAt,
    lastStatusChangedAt: getTimestampMs(durableSubtask.lastStatusChangedAt) > getTimestampMs(incomingSubtask.lastStatusChangedAt)
      ? durableSubtask.lastStatusChangedAt
      : incomingSubtask.lastStatusChangedAt
  };
}

function getStepMergeKey(step) {
  return step?.id || (step?.subtaskId ? `subtask:${step.subtaskId}` : "");
}

function mergeDurableStep(incomingStep, durableStep) {
  const phase = pickDurableProgressValue(incomingStep.phase || incomingStep.status, durableStep.phase || durableStep.status, durableStepPhaseRank);
  const status = pickDurableProgressValue(incomingStep.status, durableStep.status, durableSubtaskStatusRank);
  const durableLeaseNewer = getTimestampMs(durableStep.lease?.heartbeatAt) > getTimestampMs(incomingStep.lease?.heartbeatAt);
  const durableUpdatedNewer = getTimestampMs(durableStep.updatedAt) > getTimestampMs(incomingStep.updatedAt);
  return {
    ...incomingStep,
    phase,
    status,
    assignedMessageId: incomingStep.assignedMessageId || durableStep.assignedMessageId || "",
    claimedBy: incomingStep.claimedBy || durableStep.claimedBy || "",
    lease: phase === "done"
      ? null
      : (durableLeaseNewer || !incomingStep.lease ? cloneStateValue(durableStep.lease || incomingStep.lease || null) : incomingStep.lease),
    dependsOn: mergeUniqueStrings(durableStep.dependsOn || [], incomingStep.dependsOn || []),
    allowedCapabilities: mergeUniqueStrings(durableStep.allowedCapabilities || [], incomingStep.allowedCapabilities || []),
    updatedAt: durableUpdatedNewer ? durableStep.updatedAt : incomingStep.updatedAt
  };
}

function mergeDurableOrchestrator(incomingOrchestrator = {}, durableOrchestrator = {}) {
  const merged = {
    ...cloneStateValue(durableOrchestrator || {}),
    ...cloneStateValue(incomingOrchestrator || {})
  };
  const incomingSteps = Array.isArray(incomingOrchestrator.steps) ? incomingOrchestrator.steps : [];
  const durableSteps = Array.isArray(durableOrchestrator.steps) ? durableOrchestrator.steps : [];
  const resultSteps = [];
  const stepIndex = new Map();
  incomingSteps.forEach((step) => {
    const key = getStepMergeKey(step);
    if (key) {
      stepIndex.set(key, resultSteps.length);
    }
    resultSteps.push(cloneStateValue(step));
  });
  durableSteps.forEach((step) => {
    const key = getStepMergeKey(step);
    const existingIndex = key ? stepIndex.get(key) : undefined;
    if (existingIndex === undefined) {
      if (key) {
        stepIndex.set(key, resultSteps.length);
      }
      resultSteps.push(cloneStateValue(step));
      return;
    }
    resultSteps[existingIndex] = mergeDurableStep(resultSteps[existingIndex], step);
  });
  merged.steps = resultSteps;
  merged.events = mergeRecordsById(incomingOrchestrator.events || [], durableOrchestrator.events || []);
  merged.locks = mergeRecordsById(incomingOrchestrator.locks || [], durableOrchestrator.locks || []);
  merged.approvals = mergeRecordsById(incomingOrchestrator.approvals || [], durableOrchestrator.approvals || []);
  merged.sharedState = {
    ...(durableOrchestrator.sharedState || {}),
    ...(incomingOrchestrator.sharedState || {}),
    artifacts: mergeRecordsById(incomingOrchestrator.sharedState?.artifacts || [], durableOrchestrator.sharedState?.artifacts || []),
    decisions: mergeRecordsById(incomingOrchestrator.sharedState?.decisions || [], durableOrchestrator.sharedState?.decisions || []),
    constraints: mergeUniqueStrings(durableOrchestrator.sharedState?.constraints || [], incomingOrchestrator.sharedState?.constraints || [])
  };
  return merged;
}

function mergeDurableTask(incomingTask, durableTask) {
  const merged = {
    ...incomingTask,
    status: pickDurableProgressValue(incomingTask.status, durableTask.status, durableSubtaskStatusRank),
    updatedAt: getTimestampMs(durableTask.updatedAt) > getTimestampMs(incomingTask.updatedAt)
      ? durableTask.updatedAt
      : incomingTask.updatedAt
  };
  merged.subtasks = mergeRecordsById(incomingTask.subtasks || [], durableTask.subtasks || [], mergeDurableSubtask);
  merged.orchestrator = mergeDurableOrchestrator(incomingTask.orchestrator || {}, durableTask.orchestrator || {});
  return merged;
}

function mergeDurableProject(incomingProject, durableProject) {
  const merged = {
    ...incomingProject,
    messages: mergeRecordsById(incomingProject.messages || [], durableProject.messages || [], mergeDurableMessage),
    agentEvents: mergeRecordsById(incomingProject.agentEvents || [], durableProject.agentEvents || []),
    agentDeliveries: mergeRecordsById(incomingProject.agentDeliveries || [], durableProject.agentDeliveries || []),
    terminalOutputRefs: mergeRecordsById(incomingProject.terminalOutputRefs || [], durableProject.terminalOutputRefs || []),
    kernelEvents: mergeRecordsById(incomingProject.kernelEvents || [], durableProject.kernelEvents || []),
    commandLogs: mergeRecordsById(incomingProject.commandLogs || [], durableProject.commandLogs || [])
  };
  merged.tasks = mergeRecordsById(incomingProject.tasks || [], durableProject.tasks || [], mergeDurableTask);
  return merged;
}

function mergeStateForRendererSave(incomingState, durableState) {
  if (!incomingState || !durableState || !Array.isArray(durableState.projects)) {
    return cloneStateValue(incomingState);
  }
  const merged = cloneStateValue(incomingState);
  const deletedProjectIds = new Set([
    ...normalizeDeletedProjectIds(durableState),
    ...normalizeDeletedProjectIds(incomingState)
  ]);
  const projects = [];
  const projectIndex = new Map();
  (merged.projects || []).forEach((project) => {
    if (!project?.id || deletedProjectIds.has(project.id)) {
      return;
    }
    projectIndex.set(project.id, projects.length);
    projects.push(project);
  });
  (durableState.projects || []).forEach((project) => {
    if (!project?.id || deletedProjectIds.has(project.id)) {
      return;
    }
    const index = projectIndex.get(project.id);
    if (index === undefined) {
      projectIndex.set(project.id, projects.length);
      projects.push(cloneStateValue(project));
      return;
    }
    projects[index] = mergeDurableProject(projects[index], project);
  });
  merged.projects = projects;
  merged.settings = {
    ...(durableState.settings || {}),
    ...(incomingState.settings || {})
  };
  const activeProjectId = [incomingState.activeProjectId, durableState.activeProjectId]
    .map((id) => String(id || "").trim())
    .find((id) => id && !deletedProjectIds.has(id) && projects.some((project) => project.id === id));
  merged.activeProjectId = activeProjectId || projects[0]?.id || null;
  merged.deletedProjectIds = [...deletedProjectIds];
  merged.updatedAt = new Date().toISOString();
  return merged;
}

function getStateBackupFiles() {
  const backupDirectory = getStateBackupDirectory();
  try {
    if (!fs.existsSync(backupDirectory)) {
      return [];
    }
    return fs.readdirSync(backupDirectory)
      .filter((name) => (
        (name.startsWith("coss-workspace-state.") && name.endsWith(".json")) ||
        (name.startsWith("coss-workspace.") && name.endsWith(".sqlite"))
      ))
      .map((name) => {
        const filePath = path.join(backupDirectory, name);
        const stat = fs.statSync(filePath);
        return {
          name,
          path: filePath,
          type: name.endsWith(".sqlite") ? "sqlite" : "json",
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          timestamp: stat.mtime.getTime()
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    appendLogEvent("storage.backup.list.failed", { error: serializeError(error) }, "error");
    return [];
  }
}

function pruneStateBackups() {
  getStateBackupFiles().slice(maxStateBackups).forEach((backup) => {
    try {
      fs.unlinkSync(backup.path);
    } catch (error) {
      appendLogEvent("storage.backup.prune.failed", { path: backup.path, error: serializeError(error) }, "warn");
    }
  });
}

function createStateBackup(reason = "manual", options = {}) {
  const sqlitePath = getSqliteFilePath();
  const jsonPath = getDataFilePath();
  const sourcePath = fs.existsSync(sqlitePath) ? sqlitePath : jsonPath;
  if (!fs.existsSync(sourcePath)) {
    return "";
  }
  try {
    if (!fs.statSync(sourcePath).isFile()) {
      appendLogEvent("storage.backup.skipped", { sourcePath, reason: "source-not-file" }, "warn");
      return "";
    }
  } catch (error) {
    appendLogEvent("storage.backup.skipped", { sourcePath, reason: "source-stat-failed", error: serializeError(error) }, "warn");
    return "";
  }

  const now = Date.now();
  if (!options.force && reason === "before-write" && now - lastStateBackupAt < 30000) {
    return "";
  }

  const backupDirectory = getStateBackupDirectory();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const extension = path.extname(sourcePath) || ".json";
  const baseName = extension === ".sqlite" ? "coss-workspace" : "coss-workspace-state";
  const backupPath = path.join(backupDirectory, `${baseName}.${stamp}.${reason}${extension}`);
  try {
    fs.mkdirSync(backupDirectory, { recursive: true });
    fs.copyFileSync(sourcePath, backupPath);
    lastStateBackupAt = now;
    pruneStateBackups();
    appendLogEvent("storage.backup.created", { path: backupPath, sourcePath, reason });
    return backupPath;
  } catch (error) {
    appendLogEvent("storage.backup.create.failed", { sourcePath, backupPath, reason, error: serializeError(error) }, "warn");
    return "";
  }
}

function getLatestStateBackupPath() {
  return getStateBackupFiles()[0]?.path || "";
}

async function recoverSqliteStateFromBackup() {
  const backups = getStateBackupFiles();
  for (const backup of backups) {
    let db = null;
    try {
      if (backup.type === "sqlite") {
        fs.copyFileSync(backup.path, getSqliteFilePath());
        db = await openSqliteDatabase();
        const state = readWorkspaceStateFromDb(db);
        if (state) {
          writeJsonAtomic(getDataFilePath(), state);
          appendLogEvent("storage.sqlite.recovered", { backupPath: backup.path }, "warn");
          return state;
        }
      } else {
        const parsed = readStateFile(backup.path);
        if (parsed.ok) {
          db = await openSqliteDatabase();
          writeWorkspaceStateToDb(db, parsed.state);
          persistSqliteDatabase(db);
          writeJsonAtomic(getDataFilePath(), parsed.state);
          appendLogEvent("storage.sqlite.recovered", { backupPath: backup.path, mode: "json-backup-to-sqlite" }, "warn");
          return parsed.state;
        }
      }
    } catch (error) {
      appendLogEvent("storage.sqlite.recover-attempt.failed", {
        backupPath: backup.path,
        error: serializeError(error)
      }, "warn");
    } finally {
      closeSqliteDatabase(db);
    }
  }

  return null;
}

function quarantineInvalidStateFile(filePath, errorMessage = "") {
  if (!fs.existsSync(filePath)) {
    return "";
  }

  try {
    const backupDirectory = getStateBackupDirectory();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const extension = path.extname(filePath) || ".json";
    const baseName = extension === ".sqlite" ? "coss-workspace" : "coss-workspace-state";
    const targetPath = path.join(backupDirectory, `${baseName}.${stamp}.invalid${extension}`);
    fs.mkdirSync(backupDirectory, { recursive: true });
    fs.copyFileSync(filePath, targetPath);
    appendLogEvent("storage.state.quarantined", { filePath, targetPath, error: errorMessage }, "error");
    return targetPath;
  } catch (error) {
    appendLogEvent("storage.state.quarantine.failed", { filePath, error: serializeError(error) }, "error");
    return "";
  }
}

function getStorageInfo() {
  const statePath = getDataFilePath();
  const sqlitePath = getSqliteFilePath();
  const stateStat = safeFileStat(statePath);
  const sqliteStat = safeFileStat(sqlitePath);
  const backups = getStateBackupFiles();
  return {
    mode: initSqlJs ? "sqlite" : "json-fallback",
    sqliteEnabled: Boolean(initSqlJs),
    sqliteReason: initSqlJs ? "SQLite 已启用，使用 sql.js WASM 数据库文件。" : "sql.js 依赖不可用，已回退到 JSON 状态文件。",
    schemaVersion: storageSchemaVersion,
    appVersion,
    storageDirectory: getStorageDirectory(),
    sqlitePath,
    sqliteExists: sqliteStat.exists,
    sqliteSize: sqliteStat.size,
    sqliteModifiedAt: sqliteStat.modifiedAt,
    statePath,
    stateExists: stateStat.exists,
    stateSize: stateStat.size,
    stateModifiedAt: stateStat.modifiedAt,
    backupDirectory: getStateBackupDirectory(),
    backupCount: backups.length,
    latestBackupPath: backups[0]?.path || "",
    backups: backups.slice(0, 8),
    logDirectory: getLogDirectory(),
    diagnosticsDirectory: getDiagnosticsDirectory()
  };
}

function getStateMeta() {
  const stateStat = safeFileStat(getDataFilePath());
  const sqliteStat = safeFileStat(getSqliteFilePath());
  return {
    storageDirectory: getStorageDirectory(),
    statePath: getDataFilePath(),
    stateModifiedAt: stateStat.modifiedAt,
    stateSize: stateStat.size,
    sqlitePath: getSqliteFilePath(),
    sqliteModifiedAt: sqliteStat.modifiedAt,
    sqliteSize: sqliteStat.size,
    stamp: [
      stateStat.modifiedAt,
      stateStat.size,
      sqliteStat.modifiedAt,
      sqliteStat.size
    ].join("|")
  };
}

function resolveCommandOnPath(commandName) {
  const pathValue = process.env.PATH || process.env.Path || "";
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, process.platform === "win32" ? `${commandName}${extension.toLowerCase()}` : commandName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const upperCandidate = path.join(directory, process.platform === "win32" ? `${commandName}${extension.toUpperCase()}` : commandName);
      if (upperCandidate !== candidate && fs.existsSync(upperCandidate)) {
        return upperCandidate;
      }
    }
  }
  return "";
}

function resolveNodeCommandForMcp() {
  const configured = String(process.env.COSS_NODE_COMMAND || "").trim();
  if (configured) {
    return configured;
  }

  const npmNode = String(process.env.npm_node_execpath || "").trim();
  if (npmNode && fs.existsSync(npmNode)) {
    return npmNode;
  }

  const currentExecutable = process.execPath || "";
  if (currentExecutable && /^node(?:\.exe)?$/i.test(path.basename(currentExecutable))) {
    return currentExecutable;
  }

  return resolveCommandOnPath("node") || "node";
}

function getMcpServerInfo(context = {}) {
  const serverPath = path.join(__dirname, "coss-mcp-server.cjs");
  const command = resolveNodeCommandForMcp();
  const args = [
    serverPath,
    "--user-data",
    getStorageDirectory()
  ];
  if (context.projectId) {
    args.push("--project-id", context.projectId);
  }
  if (context.roleId) {
    args.push("--role-id", context.roleId);
  }
  if (context.taskId) {
    args.push("--task-id", context.taskId);
  }
  if (context.sessionId) {
    args.push("--session-id", context.sessionId);
  }
  return {
    name: "coss-mcp",
    command,
    args,
    serverPath,
    cwd: path.dirname(path.dirname(serverPath)),
    userData: getStorageDirectory(),
    projectId: context.projectId || "",
    roleId: context.roleId || "",
    taskId: context.taskId || "",
    sessionId: context.sessionId || ""
  };
}

function buildMcpServerEntry(context = {}) {
  const info = getMcpServerInfo(context);
  const env = {
    COSS_MCP_USER_DATA: info.userData
  };
  if (info.projectId) {
    env.COSS_MCP_PROJECT_ID = info.projectId;
  }

  return {
    type: "stdio",
    description: "CosS v0.10 Kernel MCP tools for durable task context, leased steps, structured results, locks, approvals, and projections.",
    defer_loading: false,
    command: info.command,
    args: info.args,
    env
  };
}

function readProjectMcpJsonConfig(filePath) {
  if (!fs.existsSync(filePath)) {
    return { data: {}, backupPath: "" };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(".mcp.json must be a JSON object");
    }
    return { data: parsed, backupPath: "" };
  } catch (error) {
    const backupPath = `${filePath}.invalid-${Date.now()}.bak`;
    fs.copyFileSync(filePath, backupPath);
    appendLogEvent("mcp.project-config.invalid-backed-up", {
      filePath,
      backupPath,
      error: serializeError(error)
    }, "warn");
    return { data: {}, backupPath };
  }
}

function writeProjectMcpConfig(_event, request = {}) {
  try {
    const root = getProjectRoot(request.projectPath);
    const projectId = String(request.projectId || "").trim();
    const generatedAt = new Date().toISOString();
    const serverEntry = buildMcpServerEntry({ projectId });
    const rootConfigPath = path.join(root, ".mcp.json");
    const cossConfigPath = path.join(root, ".coss", "mcp", "coss-mcp.json");
    const existingRootConfig = readProjectMcpJsonConfig(rootConfigPath);
    const rootConfig = existingRootConfig.data;
    const existingServers = rootConfig.mcpServers && typeof rootConfig.mcpServers === "object" && !Array.isArray(rootConfig.mcpServers)
      ? rootConfig.mcpServers
      : {};

    rootConfig.mcpServers = {
      ...existingServers,
      coss: serverEntry
    };

    const cossConfig = {
      generatedBy: "CosS",
      appVersion,
      generatedAt,
      projectId,
      projectPath: root,
      mcpServers: {
        coss: serverEntry
      },
      tools: [
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
      ],
      note: "CosS v0.10 Agents must use the Kernel task board, leased step claiming, structured results, locks, and approvals."
    };

    writeJsonAtomic(cossConfigPath, cossConfig);
    writeJsonAtomic(rootConfigPath, rootConfig);
    appendLogEvent("mcp.project-config.written", {
      projectPath: root,
      projectId,
      rootConfigPath,
      cossConfigPath,
      backupPath: existingRootConfig.backupPath,
      serverName: "coss"
    });

    return {
      ok: true,
      projectPath: root,
      projectId,
      rootConfigPath,
      cossConfigPath,
      backupPath: existingRootConfig.backupPath,
      server: serverEntry
    };
  } catch (error) {
    appendLogEvent("mcp.project-config.write.failed", {
      projectPath: request.projectPath,
      projectId: request.projectId,
      error: serializeError(error)
    }, "error");
    return { ok: false, error: error.message };
  }
}

function readJsonConfigSnapshot(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      path: filePath,
      exists: false,
      valid: false,
      error: "",
      data: null,
      modifiedAt: "",
      size: 0
    };
  }

  const stat = fs.statSync(filePath);
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const isObject = data && typeof data === "object" && !Array.isArray(data);
    return {
      path: filePath,
      exists: true,
      valid: isObject,
      error: isObject ? "" : "JSON root is not an object.",
      data: isObject ? data : null,
      modifiedAt: stat.mtime.toISOString(),
      size: stat.size
    };
  } catch (error) {
    return {
      path: filePath,
      exists: true,
      valid: false,
      error: error.message,
      data: null,
      modifiedAt: stat.mtime.toISOString(),
      size: stat.size
    };
  }
}

function areStringArraysEqual(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  return left.every((item, index) => String(item) === String(right[index]));
}

function getMcpServerMatchStatus(actual, expected) {
  const server = actual && typeof actual === "object" && !Array.isArray(actual) ? actual : null;
  if (!server) {
    return {
      hasServer: false,
      commandMatches: false,
      argsMatches: false,
      envMatches: false,
      matches: false,
      command: "",
      args: [],
      env: {}
    };
  }

  const env = server.env && typeof server.env === "object" && !Array.isArray(server.env) ? server.env : {};
  const expectedEnv = expected.env || {};
  const envMatches = Object.keys(expectedEnv).every((key) => String(env[key] || "") === String(expectedEnv[key] || ""));
  const typeMatches = String(server.type || "stdio") === String(expected.type || "stdio");
  const commandMatches = String(server.command || "") === String(expected.command || "");
  const argsMatches = areStringArraysEqual(server.args || [], expected.args || []);

  return {
    hasServer: true,
    typeMatches,
    commandMatches,
    argsMatches,
    envMatches,
    matches: typeMatches && commandMatches && argsMatches && envMatches,
    type: String(server.type || ""),
    command: String(server.command || ""),
    args: Array.isArray(server.args) ? server.args : [],
    env
  };
}

function checkProjectMcpConfig(_event, request = {}) {
  try {
    const root = getProjectRoot(request.projectPath);
    const projectId = String(request.projectId || "").trim();
    const expectedServer = buildMcpServerEntry({ projectId });
    const rootConfigPath = path.join(root, ".mcp.json");
    const cossConfigPath = path.join(root, ".coss", "mcp", "coss-mcp.json");
    const rootSnapshot = readJsonConfigSnapshot(rootConfigPath);
    const cossSnapshot = readJsonConfigSnapshot(cossConfigPath);
    const rootServerStatus = getMcpServerMatchStatus(rootSnapshot.data?.mcpServers?.coss, expectedServer);
    const cossServerStatus = getMcpServerMatchStatus(cossSnapshot.data?.mcpServers?.coss, expectedServer);
    const cossMetaMatches = cossSnapshot.valid
      && String(cossSnapshot.data?.projectId || "") === projectId
      && String(cossSnapshot.data?.generatedBy || "") === "CosS";
    const ok = rootSnapshot.valid
      && cossSnapshot.valid
      && rootServerStatus.matches
      && cossServerStatus.matches
      && cossMetaMatches;

    const result = {
      ok,
      projectPath: root,
      projectId,
      checkedAt: new Date().toISOString(),
      rootConfig: {
        path: rootConfigPath,
        exists: rootSnapshot.exists,
        valid: rootSnapshot.valid,
        error: rootSnapshot.error,
        modifiedAt: rootSnapshot.modifiedAt,
        size: rootSnapshot.size,
        ...rootServerStatus
      },
      cossConfig: {
        path: cossConfigPath,
        exists: cossSnapshot.exists,
        valid: cossSnapshot.valid,
        error: cossSnapshot.error,
        modifiedAt: cossSnapshot.modifiedAt,
        size: cossSnapshot.size,
        metaMatches: cossMetaMatches,
        ...cossServerStatus
      },
      expectedServer,
      fixAvailable: true
    };

    appendLogEvent("mcp.project-config.checked", {
      projectPath: root,
      projectId,
      ok,
      rootConfig: {
        exists: result.rootConfig.exists,
        valid: result.rootConfig.valid,
        matches: result.rootConfig.matches
      },
      cossConfig: {
        exists: result.cossConfig.exists,
        valid: result.cossConfig.valid,
        matches: result.cossConfig.matches,
        metaMatches: result.cossConfig.metaMatches
      }
    }, ok ? "info" : "warn");

    return result;
  } catch (error) {
    appendLogEvent("mcp.project-config.check.failed", {
      projectPath: request.projectPath,
      projectId: request.projectId,
      error: serializeError(error)
    }, "error");
    return { ok: false, error: error.message, fixAvailable: false };
  }
}

function readMcpAuditEvents(_event, request = {}) {
  const limit = Math.min(Math.max(Number.parseInt(request.limit || "80", 10) || 80, 1), 200);
  const roleId = String(request.roleId || "").trim();
  const taskId = String(request.taskId || "").trim();
  const tool = String(request.tool || "").trim().toLowerCase();
  const query = String(request.query || "").trim().toLowerCase();
  const logDirectory = getLogDirectory();
  const matchesAuditFilters = (entry) => {
    const payload = entry.payload || {};
    const text = JSON.stringify({ event: entry.event, payload }).toLowerCase();
    if (roleId) {
      const roleValues = [
        payload.roleId,
        payload.fromRoleId,
        ...(Array.isArray(payload.toRoleIds) ? payload.toRoleIds : [])
      ].map((value) => String(value || ""));
      if (!roleValues.includes(roleId)) {
        return false;
      }
    }
    if (taskId && String(payload.taskId || "") !== taskId) {
      return false;
    }
    if (tool) {
      const payloadTool = String(payload.tool || payload.toolName || "").toLowerCase();
      if (payloadTool !== tool && !String(entry.event || "").toLowerCase().includes(tool)) {
        return false;
      }
    }
    if (query && !text.includes(query)) {
      return false;
    }
    return true;
  };

  try {
    if (!fs.existsSync(logDirectory)) {
      return { ok: true, logDirectory, events: [] };
    }

    const files = fs.readdirSync(logDirectory)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .reverse()
      .slice(0, 8);
    const events = [];

    for (const fileName of files) {
      const filePath = path.join(logDirectory, fileName);
      const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).filter(Boolean).reverse();
      for (const line of lines) {
        if (events.length >= limit) {
          break;
        }
        try {
          const entry = JSON.parse(line);
          if (String(entry.event || "").startsWith("mcp.") && matchesAuditFilters(entry)) {
            events.push({
              timestamp: entry.timestamp || "",
              level: entry.level || "info",
              event: entry.event || "",
              payload: entry.payload || {},
              fileName
            });
          }
        } catch {
          // Ignore malformed log lines in the audit reader.
        }
      }
      if (events.length >= limit) {
        break;
      }
    }

    appendLogEvent("mcp.audit-events.read", { count: events.length, limit, roleId, taskId, tool, query });
    return { ok: true, logDirectory, events, filters: { roleId, taskId, tool, query } };
  } catch (error) {
    appendLogEvent("mcp.audit-events.read.failed", {
      logDirectory,
      error: serializeError(error)
    }, "error");
    return { ok: false, logDirectory, error: error.message, events: [] };
  }
}

function normalizeExportedStatePayload(payload) {
  const value = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
  if (!value) {
    throw new Error("导入文件不是有效 JSON 对象。");
  }
  const state = value.type === "coss-state-export" ? value.state : value;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new Error("导入文件不包含有效 CosS 状态。");
  }
  return state;
}

function getDialogOwner(event) {
  return event?.sender ? (BrowserWindow.fromWebContents(event.sender) || getTargetWindow()) : getTargetWindow();
}

async function pickSavePath(event, options, mockEnvKey) {
  if (mockEnvKey && process.env[mockEnvKey]) {
    return { canceled: false, filePath: process.env[mockEnvKey] };
  }
  const owner = getDialogOwner(event);
  return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options);
}

async function pickOpenPath(event, options, mockEnvKey) {
  if (mockEnvKey && process.env[mockEnvKey]) {
    return { canceled: false, filePaths: [process.env[mockEnvKey]] };
  }
  const owner = getDialogOwner(event);
  return owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options);
}

async function exportStorageState(event, request = {}) {
  const state = await readState() || {};
  const defaultPath = path.join(getStorageDirectory(), `coss-state-export-${new Date().toISOString().slice(0, 10)}.json`);
  const targetPath = request.targetPath || request.path || "";
  const dialogResult = targetPath
    ? { canceled: false, filePath: targetPath }
    : await pickSavePath(event, {
      title: "导出 CosS 状态数据",
      defaultPath,
      filters: [{ name: "CosS State Export", extensions: ["json"] }]
    }, "COSS_MOCK_STORAGE_EXPORT_PATH");

  if (dialogResult.canceled || !dialogResult.filePath) {
    appendLogEvent("storage.export.canceled");
    return { ok: false, canceled: true };
  }

  const payload = {
    type: "coss-state-export",
    appVersion,
    schemaVersion: storageSchemaVersion,
    exportedAt: new Date().toISOString(),
    state
  };
  writeJsonAtomic(dialogResult.filePath, payload);
  const stat = safeFileStat(dialogResult.filePath);
  appendLogEvent("storage.export.succeeded", { path: dialogResult.filePath, size: stat.size });
  return { ok: true, path: dialogResult.filePath, size: stat.size };
}

async function importStorageState(event, request = {}) {
  const sourcePath = request.sourcePath || request.path || "";
  const dialogResult = sourcePath
    ? { canceled: false, filePaths: [sourcePath] }
    : await pickOpenPath(event, {
      title: "导入 CosS 状态数据",
      properties: ["openFile"],
      filters: [{ name: "CosS State Export", extensions: ["json"] }]
    }, "COSS_MOCK_STORAGE_IMPORT_PATH");

  if (dialogResult.canceled || !dialogResult.filePaths?.[0]) {
    appendLogEvent("storage.import.canceled");
    return { ok: false, canceled: true };
  }

  const importPath = dialogResult.filePaths[0];
  try {
    const payload = JSON.parse(fs.readFileSync(importPath, "utf8"));
    const state = normalizeExportedStatePayload(payload);
    const backupPath = createStateBackup("before-import", { force: true });
    const writeResult = await writeState(state);
    appendLogEvent("storage.import.succeeded", {
      path: importPath,
      backupPath,
      mode: writeResult.mode,
      projects: Array.isArray(state.projects) ? state.projects.length : 0
    });
    return {
      ok: true,
      path: importPath,
      backupPath,
      mode: writeResult.mode,
      projects: Array.isArray(state.projects) ? state.projects.length : 0
    };
  } catch (error) {
    appendLogEvent("storage.import.failed", { path: importPath, error: serializeError(error) }, "error");
    return { ok: false, path: importPath, error: error.message };
  }
}

function redactDiagnosticValue(value, keyName = "") {
  if (Array.isArray(value)) {
    return value.map((item) => redactDiagnosticValue(item, keyName));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactDiagnosticValue(child, key)]));
  }
  if (/api.?key|token|secret|password|credential/i.test(keyName) && value) {
    return "[redacted]";
  }
  return value;
}

function readRecentLogLines(maxLines = 300) {
  const logDirectory = getLogDirectory();
  try {
    if (!fs.existsSync(logDirectory)) {
      return [];
    }
    return fs.readdirSync(logDirectory)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .slice(-3)
      .flatMap((name) => fs.readFileSync(path.join(logDirectory, name), "utf8").split(/\r?\n/).filter(Boolean))
      .slice(-maxLines);
  } catch (error) {
    return [`failed to read logs: ${error.message}`];
  }
}

async function exportDiagnosticsPackage(event, request = {}) {
  const defaultPath = path.join(getDiagnosticsDirectory(), `coss-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const targetPath = request.targetPath || request.path || "";
  const dialogResult = targetPath
    ? { canceled: false, filePath: targetPath }
    : await pickSavePath(event, {
      title: "导出 CosS 诊断资料",
      defaultPath,
      filters: [{ name: "CosS Diagnostics", extensions: ["json"] }]
    }, "COSS_MOCK_DIAGNOSTICS_EXPORT_PATH");

  if (dialogResult.canceled || !dialogResult.filePath) {
    appendLogEvent("storage.diagnostics.canceled");
    return { ok: false, canceled: true };
  }

  const payload = {
    type: "coss-diagnostics",
    appVersion,
    exportedAt: new Date().toISOString(),
    storage: getStorageInfo(),
    state: redactDiagnosticValue(await readState() || {}),
    recentLogs: readRecentLogLines()
  };
  writeJsonAtomic(dialogResult.filePath, payload);
  const stat = safeFileStat(dialogResult.filePath);
  appendLogEvent("storage.diagnostics.exported", { path: dialogResult.filePath, size: stat.size });
  return { ok: true, path: dialogResult.filePath, size: stat.size };
}

function createManualStateBackup() {
  try {
    const backupPath = createStateBackup("manual", { force: true });
    return { ok: Boolean(backupPath), path: backupPath, storage: getStorageInfo() };
  } catch (error) {
    appendLogEvent("storage.backup.manual.failed", { error: serializeError(error) }, "error");
    return { ok: false, error: error.message, storage: getStorageInfo() };
  }
}

async function openStorageDirectory() {
  const storageDirectory = getStorageDirectory();
  fs.mkdirSync(storageDirectory, { recursive: true });
  appendLogEvent("storage.open-directory", { path: storageDirectory });

  if (process.env.COSS_DISABLE_OPEN_STORAGE_DIR === "1") {
    return { ok: true, path: storageDirectory, skipped: true };
  }

  const error = await shell.openPath(storageDirectory);
  if (error) {
    appendLogEvent("storage.open-directory.failed", { path: storageDirectory, error }, "error");
  }
  return { ok: !error, path: storageDirectory, error };
}

function ensureClaudeOnboardingCompleted() {
  const filePath = getClaudeConfigPath();
  let config = {};
  let changed = false;
  let backupPath = "";

  try {
    if (fs.existsSync(filePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          config = parsed;
        } else {
          changed = true;
        }
      } catch (_error) {
        backupPath = `${filePath}.invalid-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        fs.copyFileSync(filePath, backupPath);
        changed = true;
      }
    } else {
      changed = true;
    }

    if (config.hasCompletedOnboarding !== true) {
      config.hasCompletedOnboarding = true;
      changed = true;
    }

    if (changed) {
      writeJsonAtomic(filePath, config);
    }

    return {
      path: filePath,
      configured: true,
      changed,
      backupPath,
      error: ""
    };
  } catch (error) {
    return {
      path: filePath,
      configured: false,
      changed: false,
      backupPath,
      error: error.message
    };
  }
}

function readJsonFileSafe(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return { exists: false, data: null, error: "" };
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { exists: true, data, error: "" };
  } catch (error) {
    return { exists: true, data: null, error: error.message };
  }
}

function objectHasAuthSignal(value, depth = 0, trustedKeyContext = false) {
  if (!value || depth > 4) {
    return false;
  }

  if (typeof value === "string") {
    return trustedKeyContext && value.trim().length >= 12;
  }

  if (Array.isArray(value)) {
    return value.some((item) => objectHasAuthSignal(item, depth + 1, trustedKeyContext));
  }

  if (typeof value !== "object") {
    return false;
  }

  return Object.entries(value).some(([key, item]) => {
    const normalizedKey = key.toLowerCase();
    const interestingKey = /(auth|token|apikey|api_key|account|user|email|oauth|session|refresh|access|subscription|organization|org)/.test(normalizedKey);
    return objectHasAuthSignal(item, depth + 1, trustedKeyContext || interestingKey);
  });
}

function summarizeAuthState({ configPath, configResult, envKeys = [], label = "agent" }) {
  const envPresent = envKeys.filter((key) => Boolean(process.env[key]));
  const hasConfigSignal = objectHasAuthSignal(configResult.data);
  const configured = Boolean(configResult.exists && !configResult.error);

  return {
    label,
    configured,
    loggedIn: Boolean(envPresent.length > 0 || hasConfigSignal),
    source: envPresent.length > 0 ? "env" : hasConfigSignal ? "config" : configured ? "config-present" : "missing",
    configPath,
    configExists: Boolean(configResult.exists),
    configError: configResult.error || "",
    envKeys: envPresent,
    checkedAt: new Date().toISOString()
  };
}

function getCodexHomePath() {
  return process.env.COSS_CODEX_HOME || path.join(app.getPath("home"), ".codex");
}

function getCodexAuthPath() {
  return process.env.COSS_CODEX_AUTH_PATH || path.join(getCodexHomePath(), "auth.json");
}

function getCodexConfigPath() {
  return process.env.COSS_CODEX_CONFIG_PATH || path.join(getCodexHomePath(), "config.toml");
}

function getCodexAuthState() {
  const authPath = getCodexAuthPath();
  const authResult = readJsonFileSafe(authPath);
  return {
    ...summarizeAuthState({
      configPath: authPath,
      configResult: authResult,
      envKeys: ["OPENAI_API_KEY", "CODEX_API_KEY"],
      label: "Codex"
    }),
    homePath: getCodexHomePath(),
    configPath: getCodexConfigPath(),
    authPath
  };
}

function getClaudeAuthState(onboarding = null) {
  const configPath = getClaudeConfigPath();
  const configResult = readJsonFileSafe(configPath);
  const auth = summarizeAuthState({
    configPath,
    configResult,
    envKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    label: "Claude Code"
  });

  return {
    ...auth,
    onboardingConfigured: Boolean(onboarding?.configured),
    onboardingChanged: Boolean(onboarding?.changed),
    onboardingError: onboarding?.error || ""
  };
}

function getCodeBuddyAuthState(env = process.env) {
  const hasApiKey = Boolean(getCaseInsensitiveEnvValue(env, "CODEBUDDY_API_KEY"));
  return {
    label: "CodeBuddy Code",
    configured: hasApiKey,
    loggedIn: hasApiKey,
    source: hasApiKey ? "env" : "missing",
    configPath: "",
    configExists: false,
    configError: "",
    envKeys: hasApiKey ? ["CODEBUDDY_API_KEY"] : [],
    checkedAt: new Date().toISOString()
  };
}

function commandExists(command, env = getWindowsShellEnv()) {
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

function findCommandPaths(command, env = getWindowsShellEnv()) {
  if (command.includes("\\") || command.includes("/") || path.isAbsolute(command)) {
    return fs.existsSync(command) ? [command] : [];
  }

  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = childProcess.spawnSync(checker, [command], {
    encoding: "utf8",
    env,
    windowsHide: true
  });

  if (result.status !== 0) {
    return [];
  }

  return String(result.stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getPathDirectories(env = getWindowsShellEnv()) {
  return String(getCaseInsensitiveEnvValue(env, "PATH") || "")
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getWindowsExecutableExtensions(env = getWindowsShellEnv()) {
  if (process.platform !== "win32") {
    return [""];
  }
  const pathExt = getCaseInsensitiveEnvValue(env, "PATHEXT") || ".COM;.EXE;.BAT;.CMD";
  const extensions = pathExt
    .split(";")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return ["", ...extensions];
}

function getStaticCommandLookupDirectories(env = getWindowsShellEnv()) {
  const directories = getPathDirectories(env);
  if (process.platform === "win32") {
    const appData = getCaseInsensitiveEnvValue(env, "APPDATA");
    const programFiles = getCaseInsensitiveEnvValue(env, "ProgramFiles") || "C:\\Program Files";
    const programFilesX86 = getCaseInsensitiveEnvValue(env, "ProgramFiles(x86)") || "C:\\Program Files (x86)";
    if (appData) {
      directories.push(path.join(appData, "npm"));
    }
    directories.push(path.join(programFiles, "nodejs"), path.join(programFilesX86, "nodejs"));
  }
  return [...new Set(directories.filter(Boolean))];
}

function findCommandPathsStatic(command, env = getWindowsShellEnv()) {
  const rawCommand = String(command || "").trim();
  if (!rawCommand) {
    return [];
  }
  if (rawCommand.includes("\\") || rawCommand.includes("/") || path.isAbsolute(rawCommand)) {
    return fs.existsSync(rawCommand) ? [rawCommand] : [];
  }

  const parsedExtension = path.extname(rawCommand);
  const extensions = parsedExtension ? [""] : getWindowsExecutableExtensions(env);
  const candidates = [];
  for (const directory of getStaticCommandLookupDirectories(env)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${rawCommand}${extension}`);
      if (fs.existsSync(candidate)) {
        candidates.push(candidate);
      }
    }
  }
  return [...new Set(candidates)];
}

function preferWindowsCmdShim(command, lookupPaths = []) {
  if (process.platform !== "win32") {
    return command;
  }

  const candidates = [command, ...lookupPaths].filter(Boolean);
  for (const candidate of candidates) {
    const extension = path.extname(candidate).toLowerCase();
    if (extension === ".cmd" && fs.existsSync(candidate)) {
      return candidate;
    }
    if ((extension === "" || extension === ".ps1") && (candidate.includes("\\") || candidate.includes("/") || path.isAbsolute(candidate))) {
      const cmdPath = `${candidate.slice(0, candidate.length - extension.length)}.cmd`;
      if (fs.existsSync(cmdPath)) {
        return cmdPath;
      }
    }
  }

  return command;
}

function commandOutput(result) {
  return `${result.stdout || ""}${result.stderr || ""}`.trim();
}

function commandErrorDetail(result, fallbackCommand) {
  const output = commandOutput(result);
  if (result.error) {
    return `${result.error.code || "ERROR"}: ${result.error.message}`;
  }
  if (result.status === 0) {
    return "";
  }
  return output || `${fallbackCommand} exited with ${result.status ?? "unknown"}`;
}

function buildPowerShellInvocation(command, args = []) {
  const renderedArgs = args.map((arg) => powerShellQuote(arg)).join(" ");
  return `& ${powerShellQuote(command)}${renderedArgs ? ` ${renderedArgs}` : ""}`;
}

function cmdQuote(value) {
  const str = String(value);
  // 处理换行符：cmd.exe 无法在引号内保留换行，替换为空格以保持命令完整性
  const escaped = str
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, " ")
    .replace(/(["^&|<>%])/g, "^$1");
  return `"${escaped}"`;
}

function isWindowsBatchCommand(command) {
  const extension = path.extname(String(command || "")).toLowerCase();
  return extension === ".cmd" || extension === ".bat";
}

function buildCmdInvocation(command, args = []) {
  const invocation = [cmdQuote(command), ...args.map((arg) => cmdQuote(arg))].join(" ");
  return `call ${invocation}`;
}

function runWindowsPowerShellInvocation(invocation, env, timeout = 5000) {
  return childProcess.spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-Command", invocation], {
    encoding: "utf8",
    env,
    timeout,
    windowsHide: true
  });
}

function runWindowsCmdInvocation(command, args, env, timeout = 5000) {
  return childProcess.spawnSync("cmd.exe", ["/d", "/c", buildCmdInvocation(command, args)], {
    encoding: "utf8",
    env,
    timeout,
    windowsHide: true
  });
}

function runCommandForStatus(command, args, env, timeout = 5000) {
  if (process.platform === "win32") {
    return runWindowsPowerShellInvocation(buildPowerShellInvocation(command, args), env, timeout);
  }

  return childProcess.spawnSync(command, args, {
    encoding: "utf8",
    env,
    timeout,
    windowsHide: true
  });
}

function checkCodexVersion(command, env) {
  const result = runCommandForStatus(command, ["--version"], env);
  const output = commandOutput(result);
  const errorDetail = commandErrorDetail(result, "codex --version");

  return {
    runnable: result.status === 0,
    version: result.status === 0 ? output : "",
    errorDetail
  };
}

function checkCodeBuddyVersion(command, env) {
  const result = runCommandForStatus(command, ["--version"], env);
  const output = commandOutput(result);
  const errorDetail = commandErrorDetail(result, "codebuddy --version");

  return {
    runnable: result.status === 0,
    version: result.status === 0 ? output : "",
    errorDetail
  };
}

function getCodexCommandStatus(env = getWindowsShellEnv()) {
  const requestedCommand = process.env.COSS_CODEX_COMMAND || "codex";
  const lookupPaths = findCommandPaths(requestedCommand, env);
  const npmStatus = getNpmStatus(env);
  const attemptedCommands = [requestedCommand, ...lookupPaths].filter((item, index, list) => (
    item && list.indexOf(item) === index
  ));
  const attempts = attemptedCommands.map((item) => ({
    command: item,
    status: checkCodexVersion(item, env)
  }));
  const runnableAttempt = attempts.find((attempt) => attempt.status.runnable);
  const primaryStatus = attempts[0]?.status || checkCodexVersion(requestedCommand, env);
  const hasWindowsAppsPackagePath = lookupPaths.some((item) => item.toLowerCase().includes("\\windowsapps\\openai.codex_"));

  const command = runnableAttempt
    ? preferWindowsCmdShim(runnableAttempt.command, lookupPaths)
    : requestedCommand;

  return {
    command,
    requestedCommand,
    lookupPaths,
    runnable: Boolean(runnableAttempt),
    version: runnableAttempt?.status.version || "",
    errorDetail: runnableAttempt ? "" : primaryStatus.errorDetail,
    hasWindowsAppsPackagePath,
    npm: npmStatus,
    auth: getCodexAuthState(),
    installCommand: getCodexInstallCommand(npmStatus.command),
    autoInstallDisabled: process.env.COSS_DISABLE_CODEX_AUTO_INSTALL === "1",
    checkedAt: new Date().toISOString()
  };
}

function getCodeBuddyCommandStatus(env = getWindowsShellEnv()) {
  const requestedCommand = process.env.COSS_CODEBUDDY_COMMAND || "codebuddy";
  const aliasCommand = requestedCommand === "codebuddy" ? "cbc" : "";
  const lookupPaths = [
    ...findCommandPaths(requestedCommand, env),
    ...(aliasCommand ? findCommandPaths(aliasCommand, env) : [])
  ].filter((item, index, list) => item && list.indexOf(item) === index);
  const npmStatus = getNpmStatus(env);
  const attemptedCommands = [requestedCommand, ...lookupPaths].filter((item, index, list) => (
    item && list.indexOf(item) === index
  ));
  const attempts = attemptedCommands.map((item) => ({
    command: item,
    status: checkCodeBuddyVersion(item, env)
  }));
  const runnableAttempt = attempts.find((attempt) => attempt.status.runnable);
  const primaryStatus = attempts[0]?.status || checkCodeBuddyVersion(requestedCommand, env);
  const command = runnableAttempt
    ? preferWindowsCmdShim(runnableAttempt.command, lookupPaths)
    : requestedCommand;

  return {
    command,
    requestedCommand,
    aliasCommand,
    lookupPaths,
    runnable: Boolean(runnableAttempt),
    version: runnableAttempt?.status.version || "",
    errorDetail: runnableAttempt ? "" : primaryStatus.errorDetail,
    npm: npmStatus,
    auth: getCodeBuddyAuthState(env),
    installCommand: getCodeBuddyInstallCommand(npmStatus.command),
    autoInstallDisabled: process.env.COSS_DISABLE_CODEBUDDY_AUTO_INSTALL === "1",
    checkedAt: new Date().toISOString()
  };
}

function getCodexLaunchCommandInfo(env = getWindowsShellEnv()) {
  const requestedCommand = process.env.COSS_CODEX_COMMAND || "codex";
  const lookupPaths = findCommandPathsStatic(requestedCommand, env);
  const command = preferWindowsCmdShim(lookupPaths[0] || requestedCommand, lookupPaths);
  return {
    command,
    requestedCommand,
    lookupPaths
  };
}

function getCodeBuddyLaunchCommandInfo(env = getWindowsShellEnv()) {
  const requestedCommand = process.env.COSS_CODEBUDDY_COMMAND || "codebuddy";
  const aliasCommand = requestedCommand === "codebuddy" ? "cbc" : "";
  const lookupPaths = [
    ...findCommandPathsStatic(requestedCommand, env),
    ...(aliasCommand ? findCommandPathsStatic(aliasCommand, env) : [])
  ].filter((item, index, list) => item && list.indexOf(item) === index);
  const command = preferWindowsCmdShim(lookupPaths[0] || requestedCommand, lookupPaths);
  return {
    command,
    requestedCommand,
    aliasCommand,
    lookupPaths
  };
}

function getWorldAgentTimeoutMs() {
  const value = Number.parseInt(process.env.COSS_WORLD_AGENT_TIMEOUT_MS || "", 10);
  if (Number.isFinite(value) && value >= 5000) {
    return value;
  }
  return 120000;
}

function getWorldAgentIdleMs() {
  const value = Number.parseInt(process.env.COSS_WORLD_AGENT_IDLE_MS || "", 10);
  if (Number.isFinite(value) && value >= 1200) {
    return value;
  }
  return 6500;
}

function shouldMockWorldAgentRun() {
  return process.env.COSS_WORLD_AGENT_MOCK === "1" || process.env.COSS_DISABLE_TERMINAL_BACKEND === "1";
}

function buildWorldCodeBuddyLaunch(cwd, prompt = "", env = getWindowsShellEnv()) {
  const info = getCodeBuddyLaunchCommandInfo(env);
  const scriptPath = resolveCodeBuddyBinScript(info.command, info.lookupPaths);
  const effectiveCwd = normalizeCwd(cwd || process.env.COSS_WORLD_CWD || info.cwd || process.cwd());
  const settingsDir = path.join(effectiveCwd, ".codebuddy");
  const settingsPath = path.join(settingsDir, "settings.json");
  try {
    if (!fs.existsSync(settingsDir)) {
      fs.mkdirSync(settingsDir, { recursive: true });
    }
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
      } catch {
        settings = {};
      }
    }
    if (!settings.trustAll) {
      settings.trustAll = true;
      writeJsonAtomic(settingsPath, settings);
      appendLogEvent("codebuddy.trustAll.enabled", { settingsPath });
    }
  } catch (error) {
    appendLogEvent("codebuddy.trustAll.failed", { settingsPath, error: serializeError(error) }, "warn");
  }
  const args = [];
  if (prompt) {
    args.push("-p", prompt);
    args.push("--permission-mode", "auto");
  }
  const directLaunch = buildNodeAgentLaunch(scriptPath, args, env, "world-node-codebuddy-bin");
  if (directLaunch) {
    return { ...directLaunch, command: info.command, lookupPaths: info.lookupPaths, cwd: effectiveCwd };
  }

  if (process.platform === "win32" && isWindowsBatchCommand(info.command)) {
    return {
      file: "cmd.exe",
      args: ["/d", "/c", buildCmdInvocation(info.command, args)],
      cwd: effectiveCwd,
      launchMethod: "world-cmd-codebuddy",
      command: info.command,
      lookupPaths: info.lookupPaths
    };
  }

  return {
    file: info.command,
    args,
    cwd: effectiveCwd,
    launchMethod: "world-codebuddy",
    command: info.command,
    lookupPaths: info.lookupPaths
  };
}

function extractWorldAgentFinalMessage(output) {
  let text = stripAnsi(output)
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    // 删除常见的终端动画字符（spinner、进度条等）
    .replace(/[\u2800-\u28FF\u2580-\u259F\u25A0-\u25FF]+/g, "")
    // 删除常见的终端进度/状态行
    .replace(/^[─━═].*$/gm, "")
    .trim();

  if (!text) {
    return "";
  }

  // 查找「世界群聊最终消息：」标记
  const idx = text.search(/(?:世界群聊最终消息|FINAL_CHAT_MESSAGE)\s*[:：]/i);
  if (idx >= 0) {
    const after = text.slice(idx).replace(/(?:世界群聊最终消息|FINAL_CHAT_MESSAGE)\s*[:：]\s*/i, "").trim();
    const before = text.slice(0, idx).trim();

    // 情况A：标记后有内容 → 取标记后的内容
    if (after.length > 0) {
      return after.slice(0, 10000);
    }

    // 情况B：标记后无内容 → Agent 把标记写在了消息末尾作为结束符，取标记前的内容
    if (before.length > 0) {
      return before.slice(0, 10000);
    }

    // 标记前后都为空 → 返回空
    return "";
  }

  // 没有标记时，按优先级尝试多种回退策略
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  // 策略1：查找「总结：」标记（agent 可能只在消息中用了「总结：」但没有用完整前缀）
  const summaryIdx = lines.findIndex((l) => /^总结\s*[:：]/.test(l));
  if (summaryIdx >= 0) {
    const summaryLines = lines.slice(summaryIdx);
    // 如果总结行之后还有内容，取从总结开始的部分
    return summaryLines.join("\n").slice(0, 10000);
  }

  // 策略2：过滤掉常见的技术噪音行，取剩余的靠后内容
  const noisePattern = /^(?:[│├└┌─│┃┄┅┆┇┈┉┊┋┌┍┎┏┐┑┒┓⌈⌊⌉⌋]|done|ok|✔|✓|x\s|npm\s|yarn\s|pnpm\s|node\s|cd\s|Warning:|Error:|\[INFO\]|\[WARN\]|\[ERROR\]|❯\s|→\s)/i;
  const contentLines = lines.filter((l) => !noisePattern.test(l) && l.length > 5);
  if (contentLines.length >= 3) {
    // 取有意义内容的最后部分（最多20行）
    const candidate = contentLines.slice(-20).join("\n");
    return candidate.slice(0, 10000);
  }

  // 策略3：取最后一段非空行（原始兜底）
  const candidate = lines.slice(-20).join("\n");
  return candidate.slice(0, 10000);
}

async function handleWorldAgentRun(_event, request = {}) {
  const startedAt = Date.now();
  const worldId = sanitizeLogText(request.worldId, 80);
  const taskId = sanitizeLogText(request.taskId, 80);
  const roleId = sanitizeLogText(request.roleId, 80);
  const roleName = sanitizeLogText(request.roleName || roleId || "世界角色", 80);
  const taskGoal = sanitizeLogText(request.taskGoal || "", 240);
  const prompt = String(request.prompt || "").trim();
  const cwd = normalizeCwd(request.worldPath || request.cwd || process.cwd());
  const runId = sanitizeLogText(request.runId || randomUUID(), 80);

  if (!prompt) {
    return {
      ok: false,
      runId,
      error: "world-agent prompt is empty",
      output: "",
      rawOutput: "",
      latencyMs: Date.now() - startedAt
    };
  }

  if (shouldMockWorldAgentRun()) {
    const output = `${roleName}：我会负责${sanitizeLogText(request.moduleSummary || "当前角色模块", 120)}。收到公告栏任务「${taskGoal || "未命名任务"}」，这是独立世界 CodeBuddy CLI 内核的占位最终聊天信息。`;
    appendLogEvent("world-agent.run.mocked", { worldId, taskId, roleId, runId, cwd, latencyMs: Date.now() - startedAt });
    return {
      ok: true,
      mocked: true,
      runId,
      output,
      rawOutput: output,
      command: "mock-codebuddy",
      launchMethod: "mock",
      latencyMs: Date.now() - startedAt
    };
  }

  const apiKey = String(request.codeBuddyApiKey || "").trim();
  const env = getShellEnv(apiKey ? { CODEBUDDY_API_KEY: apiKey } : {});
  if (!getCaseInsensitiveEnvValue(env, "CODEBUDDY_API_KEY")) {
    const error = "未配置 CodeBuddy API Key。请在设置中填写 CodeBuddy API Key，或通过环境变量 CODEBUDDY_API_KEY 提供。";
    appendLogEvent("world-agent.run.missing-key", { worldId, taskId, roleId, runId, cwd }, "warn");
    return {
      ok: false,
      runId,
      error,
      output: "",
      rawOutput: "",
      latencyMs: Date.now() - startedAt
    };
  }

  const launch = buildWorldCodeBuddyLaunch(cwd, prompt, env);
  appendLogEvent("world-agent.run.started", {
    worldId,
    taskId,
    roleId,
    runId,
    cwd,
    command: launch.command || launch.file,
    launchMethod: launch.launchMethod,
    lookupPathCount: launch.lookupPaths?.length || 0
  });

  return new Promise((resolve) => {
    let child = null;
    let settled = false;
    let rawOutput = "";
    let idleTimer = null;
    let hardTimer = null;
    const isNonInteractive = launch.args?.includes("-p");

    const appendOutput = (data) => {
      rawOutput = `${rawOutput}${data}`.slice(-60000);
      if (idleTimer) {
        clearTimeout(idleTimer);
      }
      // 只要有数据就启动空闲定时器（包括ANSI码），防止进程无定时器而卡住
      if (rawOutput.length > 0) {
        idleTimer = setTimeout(() => finish(true, "idle"), getWorldAgentIdleMs());
        if (typeof idleTimer.unref === "function") {
          idleTimer.unref();
        }
      }
    };

    const cleanup = () => {
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      if (hardTimer) {
        clearTimeout(hardTimer);
        hardTimer = null;
      }
    };

    const finish = (ok, reason, error = "") => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (child?.pid && reason === "idle") {
        try {
          child.kill();
          killProcessTree(child.pid);
        } catch {
          // The process may already have exited.
        }
      }
      const cleanedRaw = stripAnsi(rawOutput).trim();
      const output = extractWorldAgentFinalMessage(rawOutput);
      appendLogEvent(ok ? "world-agent.run.finished" : "world-agent.run.failed", {
        worldId,
        taskId,
        roleId,
        runId,
        cwd,
        reason,
        command: launch.command || launch.file,
        launchMethod: launch.launchMethod,
        outputLength: output.length,
        rawLength: rawOutput.length,
        cleanedRawLength: cleanedRaw.length,
        latencyMs: Date.now() - startedAt,
        error: sanitizeLogText(error, 300)
      }, ok ? "info" : "warn");
      resolve({
        ok,
        runId,
        reason,
        error,
        output,
        // 返回清洗后的 rawOutput：去掉 ANSI 码，保留最近 12000 字符
        // 如果清洗后为空但原始数据非空，说明全是 ANSI 码，保留原始数据的最后部分以便调试
        rawOutput: cleanedRaw.slice(-12000) || (rawOutput.trim() ? `[终端输出均为ANSI码，原始长度:${rawOutput.length}] ${rawOutput.slice(-500)}` : ""),
        command: launch.command || launch.file,
        launchMethod: launch.launchMethod,
        latencyMs: Date.now() - startedAt
      });
    };

    // 硬超时已关闭，只依赖空闲超时（appendOutput 中设置）。

    try {
      // Windows 上 child_process.spawn 更可靠（明确捕获 stdout/stderr），
      // node-pty 在 Windows 上捕获批处理文件输出可能不完整
      if (nodePty && process.env.COSS_WORLD_AGENT_PIPE !== "1" && process.platform !== "win32") {
        child = nodePty.spawn(launch.file, launch.args, {
          cwd,
          env,
          name: "xterm-256color",
          cols: 120,
          rows: 32
        });
        child.onData((data) => appendOutput(data));
        child.onExit(({ exitCode }) => {
          const ok = exitCode === 0 || Boolean(rawOutput.trim());
          finish(ok, `exit-${exitCode ?? "unknown"}`, ok ? "" : `CodeBuddy CLI exited with ${exitCode ?? "unknown"}.`);
        });
        if (!isNonInteractive) {
          child.write(`${prompt}\r`);
        }
      } else {
        child = childProcess.spawn(launch.file, launch.args, {
          cwd,
          env,
          windowsHide: true
        });
        child.stdout?.on("data", (chunk) => appendOutput(chunk.toString()));
        child.stderr?.on("data", (chunk) => appendOutput(chunk.toString()));
        child.on("error", (error) => finish(false, "spawn-error", error.message));
        child.on("exit", (code) => {
          const ok = code === 0 || Boolean(rawOutput.trim());
          finish(ok, `exit-${code ?? "unknown"}`, ok ? "" : `CodeBuddy CLI exited with ${code ?? "unknown"}.`);
        });
        if (!isNonInteractive) {
          child.stdin?.write(`${prompt}\n`);
        }
      }
    } catch (error) {
      finish(false, "spawn-or-write-error", error.message);
    }
  });
}

function getNpmCommand() {
  return process.env.COSS_NPM_COMMAND || (process.platform === "win32" ? "npm.cmd" : "npm");
}

function getNpxCommand() {
  return process.env.COSS_NPX_COMMAND || (process.platform === "win32" ? "npx.cmd" : "npx");
}

function renderCommandForDisplay(command) {
  return /\s/.test(command) ? `"${command}"` : command;
}

function getCodexInstallCommand(npmCommand = getNpmCommand()) {
  return `${renderCommandForDisplay(npmCommand)} install -g ${codexNpmPackage}`;
}

function getCodexInstallPowerShellInvocation(npmCommand = getNpmCommand()) {
  return buildPowerShellInvocation(npmCommand, ["install", "-g", codexNpmPackage]);
}

function getCodeBuddyInstallCommand(npmCommand = getNpmCommand()) {
  return `${renderCommandForDisplay(npmCommand)} install -g ${codeBuddyNpmPackage}`;
}

function getCodeBuddyInstallPowerShellInvocation(npmCommand = getNpmCommand()) {
  return buildPowerShellInvocation(npmCommand, ["install", "-g", codeBuddyNpmPackage]);
}

function getNpmCommonPaths(env) {
  if (process.platform !== "win32") {
    return [];
  }

  const candidates = [
    path.join(getCaseInsensitiveEnvValue(env, "ProgramFiles") || "C:\\Program Files", "nodejs", "npm.cmd"),
    path.join(getCaseInsensitiveEnvValue(env, "ProgramFiles(x86)") || "C:\\Program Files (x86)", "nodejs", "npm.cmd"),
    path.join(getCaseInsensitiveEnvValue(env, "APPDATA") || path.join(getCaseInsensitiveEnvValue(env, "USERPROFILE") || "", "AppData", "Roaming"), "npm", "npm.cmd")
  ];

  return candidates.filter((item) => item && fs.existsSync(item));
}

function getNpmCandidates(env) {
  const command = getNpmCommand();
  return [command, ...findCommandPaths(command, env), ...getNpmCommonPaths(env)].filter((item, index, list) => (
    item && list.indexOf(item) === index
  ));
}

function getNpxCandidates(env) {
  const command = getNpxCommand();
  const npxFromNpmPaths = getNpmCommonPaths(env)
    .map((npmPath) => path.join(path.dirname(npmPath), process.platform === "win32" ? "npx.cmd" : "npx"))
    .filter((item) => item && fs.existsSync(item));
  return [command, ...findCommandPaths(command, env), ...npxFromNpmPaths].filter((item, index, list) => (
    item && list.indexOf(item) === index
  ));
}

function resolveNpxCommand(env = getWindowsShellEnv()) {
  return getNpxCandidates(env)[0] || getNpxCommand();
}

function getNodeCommonPaths(env) {
  if (process.platform !== "win32") {
    return [];
  }

  const candidates = [
    path.join(getCaseInsensitiveEnvValue(env, "ProgramFiles") || "C:\\Program Files", "nodejs", "node.exe"),
    path.join(getCaseInsensitiveEnvValue(env, "ProgramFiles(x86)") || "C:\\Program Files (x86)", "nodejs", "node.exe")
  ];

  return candidates.filter((item) => item && fs.existsSync(item));
}

function resolveNodeCommandForAgent(env = getWindowsShellEnv()) {
  const configured = String(process.env.COSS_NODE_COMMAND || "").trim();
  if (configured) {
    if (configured.includes("\\") || configured.includes("/") || path.isAbsolute(configured)) {
      if (fs.existsSync(configured)) {
        return configured;
      }
    } else {
      return findCommandPathsStatic(configured, env)[0] || configured;
    }
  }

  const npmNode = String(process.env.npm_node_execpath || "").trim();
  if (npmNode && fs.existsSync(npmNode)) {
    return npmNode;
  }

  const currentExecutable = process.execPath || "";
  if (currentExecutable && /^node(?:\.exe)?$/i.test(path.basename(currentExecutable))) {
    return currentExecutable;
  }

  return [...findCommandPathsStatic("node", env), ...getNodeCommonPaths(env)][0] || (process.platform === "win32" ? "node.exe" : "node");
}

function resolveNpmPackageBinScript(command, lookupPaths = [], packagePath = [], binPath = []) {
  const candidates = [command, ...lookupPaths]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (!(candidate.includes("\\") || candidate.includes("/") || path.isAbsolute(candidate))) {
      continue;
    }

    const extension = path.extname(candidate).toLowerCase();
    const shimDir = path.dirname(candidate);
    const baseDir = [".cmd", ".bat", ".ps1", ""].includes(extension) ? shimDir : path.dirname(candidate);
    const scriptPath = path.join(baseDir, "node_modules", ...packagePath, ...binPath);
    if (fs.existsSync(scriptPath)) {
      return scriptPath;
    }
  }

  return "";
}

function resolveCodexBinScript(command, lookupPaths = []) {
  return resolveNpmPackageBinScript(command, lookupPaths, ["@openai", "codex"], ["bin", "codex.js"]);
}

function resolveCodeBuddyBinScript(command, lookupPaths = []) {
  return resolveNpmPackageBinScript(command, lookupPaths, ["@tencent-ai", "codebuddy-code"], ["bin", "codebuddy"]);
}

function buildNodeAgentLaunch(scriptPath, args, env, launchMethod) {
  if (!scriptPath) {
    return null;
  }

  const nodeCommand = resolveNodeCommandForAgent(env);
  return {
    file: nodeCommand,
    args: [scriptPath, ...args],
    launchMethod,
    nodeCommand,
    scriptPath
  };
}

function buildCodexWindowsLaunch(codexStatus, env = getWindowsShellEnv()) {
  const directLaunch = buildNodeAgentLaunch(
    resolveCodexBinScript(codexStatus.command, codexStatus.lookupPaths),
    ["-c", "windows.sandbox_private_desktop=false"],
    env,
    "node-codex-bin"
  );

  if (directLaunch) {
    return directLaunch;
  }

  return {
    file: "powershell.exe",
    args: ["-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", buildPowerShellInvocation(codexStatus.command, ["-c", "windows.sandbox_private_desktop=false"])],
    launchMethod: "powershell-codex"
  };
}

function buildCodeBuddyWindowsLaunch(codeBuddyStatus, options = {}, env = getWindowsShellEnv()) {
  const codeBuddyArgs = buildCodeBuddyArgs({ cwd: options.cwd });
  const directLaunch = buildNodeAgentLaunch(
    resolveCodeBuddyBinScript(codeBuddyStatus.command, codeBuddyStatus.lookupPaths),
    codeBuddyArgs,
    env,
    "node-codebuddy-bin"
  );

  if (directLaunch) {
    return directLaunch;
  }

  const npxCommand = getNpxCommand();
  return {
    file: "powershell.exe",
    args: [
      "-NoLogo",
      "-NoExit",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      buildPowerShellInvocation(npxCommand, ["codebuddy", ...codeBuddyArgs])
    ],
    launchMethod: "npx-codebuddy",
    npxCommand
  };
}

function buildCodexInstallPowerShellCommand(codexStatus, installCommand) {
  const holdLogWindow = codexStatus.holdLogWindow === true;
  const lookupText = codexStatus.lookupPaths.length
    ? `检测到的路径: ${codexStatus.lookupPaths.join(" | ")}`
    : "未在 PATH 中找到 codex。";
  const messages = [
    `未检测到可运行的 Codex CLI，正在通过 npm 安装 ${codexNpmPackage}。`,
    `命令: ${codexStatus.requestedCommand || codexStatus.command}`,
    `原因: ${codexStatus.errorDetail || "codex --version 未成功运行。"}`,
    lookupText,
    codexStatus.hasWindowsAppsPackagePath
      ? "当前检测到的是 WindowsApps 中的 OpenAI Codex 应用包路径，它不能作为命令行 CLI 直接启动。"
      : "",
    `即将执行: ${installCommand}`
  ].filter(Boolean);
  const writeMessages = messages.map((line) => `Write-Host ${powerShellQuote(line)}`).join("; ");
  const doneMessage = "Codex CLI 安装流程已结束。安装完成后请重启 CosS，或重新打开应用终端，让新的 PATH 生效。";
  const holdScript = holdLogWindow
    ? `; Write-Host ${powerShellQuote("已停留在日志窗口，关闭此角色窗口即可结束。")}; while ($true) { Start-Sleep -Seconds 3600 }`
    : "";

  return `${writeMessages}; ${getCodexInstallPowerShellInvocation(codexStatus.npm?.command)}; Write-Host ''; Write-Host ${powerShellQuote(doneMessage)}${holdScript}`;
}

function buildCodeBuddyInstallPowerShellCommand(codeBuddyStatus, installCommand) {
  const holdLogWindow = codeBuddyStatus.holdLogWindow === true;
  const lookupText = codeBuddyStatus.lookupPaths.length
    ? `检测到的路径: ${codeBuddyStatus.lookupPaths.join(" | ")}`
    : "未在 PATH 中找到 codebuddy 或 cbc。";
  const messages = [
    `未检测到可运行的 CodeBuddy Code CLI，正在通过 npm 安装 ${codeBuddyNpmPackage}。`,
    `命令: ${codeBuddyStatus.requestedCommand || codeBuddyStatus.command}`,
    `原因: ${codeBuddyStatus.errorDetail || "codebuddy --version 未成功运行。"}`,
    lookupText,
    `即将执行: ${installCommand}`
  ].filter(Boolean);
  const writeMessages = messages.map((line) => `Write-Host ${powerShellQuote(line)}`).join("; ");
  const doneMessage = "CodeBuddy Code 安装流程已结束。安装完成后请重启 CosS，或重新打开应用终端，让新的 PATH 生效。";
  const holdScript = holdLogWindow
    ? `; Write-Host ${powerShellQuote("已停留在日志窗口，关闭此角色窗口即可结束。")}; while ($true) { Start-Sleep -Seconds 3600 }`
    : "";

  return `${writeMessages}; ${getCodeBuddyInstallPowerShellInvocation(codeBuddyStatus.npm?.command)}; Write-Host ''; Write-Host ${powerShellQuote(doneMessage)}${holdScript}`;
}

function getNpmStatus(env = getWindowsShellEnv()) {
  const candidates = getNpmCandidates(env);
  const attempts = candidates.map((command) => {
    const result = runCommandForStatus(command, ["--version"], env);
    const output = commandOutput(result);

    return {
      command,
      status: result.status,
      output,
      errorDetail: commandErrorDetail(result, `${command} --version`)
    };
  });
  const success = attempts.find((attempt) => attempt.status === 0 && attempt.output.length > 0);
  const firstAttempt = attempts[0] || {
    command: getNpmCommand(),
    status: null,
    output: "",
    errorDetail: "未找到 npm 命令入口。"
  };

  return {
    command: success?.command || firstAttempt.command,
    candidates,
    usable: Boolean(success),
    version: success?.output || "",
    errorDetail: success ? "" : firstAttempt.errorDetail,
    runner: process.platform === "win32" ? "powershell-hidden" : "direct"
  };
}

function getWingetStatus() {
  if (process.platform !== "win32") {
    return {
      exists: false,
      usable: false,
      detail: "当前安装流程仅支持 Windows 系统上的 winget。"
    };
  }

  const lookup = childProcess.spawnSync("where.exe", ["winget"], {
    encoding: "utf8",
    env: getWindowsShellEnv(),
    windowsHide: true
  });
  const exists = lookup.status === 0;

  if (!exists) {
    return {
      exists: false,
      usable: false,
      detail: "未找到 winget 命令入口。"
    };
  }

  const version = childProcess.spawnSync("winget", ["--version"], {
    encoding: "utf8",
    env: getWindowsShellEnv(),
    timeout: 5000,
    windowsHide: true
  });
  const output = `${version.stdout || ""}${version.stderr || ""}`.trim();

  return {
    exists: true,
    usable: version.status === 0 && output.length > 0,
    detail:
      version.status === 0 && output.length > 0
        ? output
        : `检测到 winget 入口，但 winget --version 运行失败或无输出，退出码 ${version.status ?? "unknown"}。`
  };
}

function getClaudeCodeStatus() {
  const command = process.env.COSS_CLAUDE_COMMAND || "claude";
  const env = getWindowsShellEnv();
  const installed = commandExists(command, env);
  const wingetStatus = getWingetStatus();
  const onboarding = ensureClaudeOnboardingCompleted();
  let version = "";
  let versionError = "";

  if (installed) {
    const versionResult = childProcess.spawnSync(command, ["--version"], {
      encoding: "utf8",
      env,
      timeout: 5000,
      windowsHide: true
    });
    version = `${versionResult.stdout || ""}${versionResult.stderr || ""}`.trim();
    if (versionResult.status !== 0 && !version) {
      versionError = `claude --version exited with ${versionResult.status ?? "unknown"}`;
    }
  }

  return {
    command,
    installed,
    version,
    versionError,
    onboarding,
    auth: getClaudeAuthState(onboarding),
    winget: wingetStatus,
    installCommand: `winget install ${claudeCodeWingetPackage}`,
    autoInstallDisabled: process.env.COSS_DISABLE_CLAUDE_AUTO_INSTALL === "1",
    checkedAt: new Date().toISOString()
  };
}

function findDeepStringValue(value, keys, depth = 0) {
  if (!value || depth > 5) {
    return "";
  }
  if (typeof value === "string") {
    return "";
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDeepStringValue(item, keys, depth + 1);
      if (found) {
        return found;
      }
    }
    return "";
  }
  if (typeof value !== "object") {
    return "";
  }

  for (const [key, item] of Object.entries(value)) {
    if (keys.has(String(key).toLowerCase()) && typeof item === "string" && item.trim().length >= 8) {
      return item.trim();
    }
  }

  for (const item of Object.values(value)) {
    const found = findDeepStringValue(item, keys, depth + 1);
    if (found) {
      return found;
    }
  }
  return "";
}

function getCodexLoginCredential() {
  const envKey = process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY || process.env.COSS_AGENT_LOGIN_TEST_API_KEY || "";
  if (envKey) {
    return { token: envKey, source: "env" };
  }

  const authResult = readJsonFileSafe(getCodexAuthPath());
  const token = findDeepStringValue(authResult.data, new Set(["access_token", "api_key", "apikey", "token"]));
  return token ? { token, source: "config" } : { token: "", source: "" };
}

function getClaudeLoginCredential() {
  const envKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || process.env.COSS_AGENT_LOGIN_TEST_API_KEY || "";
  if (envKey) {
    return { token: envKey, source: "env" };
  }

  const authResult = readJsonFileSafe(getClaudeConfigPath());
  const token = findDeepStringValue(authResult.data, new Set(["api_key", "apikey", "anthropic_api_key", "token"]));
  return token ? { token, source: "config" } : { token: "", source: "" };
}

function getCodeBuddyLoginCredential(apiKey = "") {
  const configuredKey = String(apiKey || "").trim();
  if (configuredKey) {
    return { token: configuredKey, source: "settings" };
  }

  const envKey = process.env.CODEBUDDY_API_KEY || process.env.COSS_AGENT_LOGIN_TEST_API_KEY || "";
  return envKey ? { token: envKey, source: "env" } : { token: "", source: "" };
}

function joinApiUrl(baseUrl, endpoint) {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  const suffix = String(endpoint || "").replace(/^\/+/, "");
  return `${base}/${suffix}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function testAgentRemoteLogin(_event, request) {
  const payload = typeof request === "object" && request !== null ? request : { provider: request };
  const normalizedProvider = normalizeAgentProvider(payload.provider);
  const startedAt = Date.now();
  const baseUrl = (
    normalizedProvider === "claude"
      ? process.env.COSS_CLAUDE_LOGIN_TEST_BASE_URL
      : normalizedProvider === "codebuddy"
        ? (payload.baseUrl || process.env.CODEBUDDY_BASE_URL || process.env.COSS_CODEBUDDY_LOGIN_TEST_BASE_URL)
        : process.env.COSS_CODEX_LOGIN_TEST_BASE_URL
  ) || process.env.COSS_AGENT_LOGIN_TEST_BASE_URL || (
    normalizedProvider === "claude"
      ? "https://api.anthropic.com/v1"
      : normalizedProvider === "codebuddy"
        ? "https://api.codebuddy.ai/v1"
        : "https://api.openai.com/v1"
  );
  const credential = normalizedProvider === "claude"
    ? getClaudeLoginCredential()
    : normalizedProvider === "codebuddy"
      ? getCodeBuddyLoginCredential(payload.apiKey)
      : getCodexLoginCredential();

  if (!credential.token) {
    const result = {
      ok: false,
      skipped: true,
      provider: normalizedProvider,
      baseUrl,
      status: 0,
      latencyMs: Date.now() - startedAt,
      source: "",
      checkedAt: new Date().toISOString(),
      message: normalizedProvider === "claude"
        ? "未找到 Anthropic/Claude API key，无法执行远程登录态校验。"
        : normalizedProvider === "codebuddy"
          ? "未找到 CodeBuddy API key，请先在智能体设置中填写。"
          : "未找到 OpenAI/Codex API key 或可用访问令牌，无法执行远程登录态校验。"
    };
    appendLogEvent("agent.login-test.skipped", result, "warn");
    return result;
  }

  const url = joinApiUrl(baseUrl, "models");
  const headers = normalizedProvider === "claude"
    ? {
        "x-api-key": credential.token,
        "anthropic-version": "2023-06-01"
      }
    : {
        Authorization: `Bearer ${credential.token}`
      };

  try {
    const response = await fetchWithTimeout(url, { method: "GET", headers }, 10000);
    const text = await response.text();
    const result = {
      ok: response.ok,
      skipped: false,
      provider: normalizedProvider,
      baseUrl,
      endpoint: "/models",
      status: response.status,
      latencyMs: Date.now() - startedAt,
      source: credential.source,
      checkedAt: new Date().toISOString(),
      message: response.ok ? "远程登录态校验通过。" : `远程登录态校验失败，HTTP ${response.status}。`,
      detail: sanitizeLogText(text, 500)
    };
    appendLogEvent(response.ok ? "agent.login-test.succeeded" : "agent.login-test.failed", {
      ...result,
      detail: sanitizeLogText(text, 220)
    }, response.ok ? "info" : "warn");
    return result;
  } catch (error) {
    const result = {
      ok: false,
      skipped: false,
      provider: normalizedProvider,
      baseUrl,
      endpoint: "/models",
      status: 0,
      latencyMs: Date.now() - startedAt,
      source: credential.source,
      checkedAt: new Date().toISOString(),
      message: `远程登录态校验异常：${error.message}`,
      error: serializeError(error)
    };
    appendLogEvent("agent.login-test.failed", result, "error");
    return result;
  }
}

function powerShellQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function buildClaudeArgs(options, rolePrompt) {
  const args = ["--append-system-prompt", rolePrompt];
  const sessionName = options.agentSession?.sessionName || options.roleName;
  if (sessionName) {
    args.unshift("--name", sessionName);
  }
  return args;
}

function buildClaudePowerShellCommand(command, options, rolePrompt) {
  const commandToken = command.includes("\\") || command.includes("/") || command.includes(" ")
    ? `& ${powerShellQuote(command)}`
    : command;
  const args = buildClaudeArgs(options, "$env:COSS_ROLE_PROMPT");
  const renderedArgs = args
    .map((arg) => (arg === "$env:COSS_ROLE_PROMPT" ? arg : powerShellQuote(arg)))
    .join(" ");

  return `${commandToken} ${renderedArgs}`;
}

function buildCodexPowerShellCommand(command) {
  return buildPowerShellInvocation(command);
}

function getCodeBuddyMcpConfigPath(cwd) {
  const root = getProjectRoot(cwd || process.cwd());
  return path.join(root, ".mcp.json");
}

function getCodeBuddyMcpSettingsPath(cwd) {
  const root = getProjectRoot(cwd || process.cwd());
  return path.join(root, ".coss", "mcp", "codebuddy-settings.json");
}

function writeCodeBuddyMcpSettings(cwd, settings) {
  const settingsPath = getCodeBuddyMcpSettingsPath(cwd);
  writeJsonAtomic(settingsPath, settings);
  appendLogEvent("mcp.codebuddy-settings.written", {
    settingsPath,
    enabledMcpjsonServers: settings.enabledMcpjsonServers || [],
    allow: settings.permissions?.allow || []
  });
  return settingsPath;
}

function buildCodeBuddyArgs(options = {}) {
  const args = [];
  const mcpConfigPath = getCodeBuddyMcpConfigPath(options.cwd);
  if (fs.existsSync(mcpConfigPath)) {
    const mcpSettings = {
      enableAllProjectMcpServers: true,
      enabledMcpjsonServers: ["coss"],
      permissions: {
        allow: ["mcp__coss"]
      }
    };
    const mcpSettingsPath = writeCodeBuddyMcpSettings(options.cwd, mcpSettings);
    args.push("--mcp-config", mcpConfigPath);
    args.push("--strict-mcp-config");
    args.push("--settings", mcpSettingsPath);
    args.push("--allowedTools", "mcp__coss");
  }
  return args;
}

function buildCodeBuddyPowerShellCommand(command, options = {}) {
  return buildPowerShellInvocation(command, buildCodeBuddyArgs(options));
}

function buildHeldInstallPowerShellCommand(messages, invocation, doneMessage) {
  const writeMessages = messages.filter(Boolean).map((line) => `Write-Host ${powerShellQuote(line)}`).join("; ");
  return `${writeMessages}; ${invocation}; Write-Host ''; Write-Host ${powerShellQuote(doneMessage)}; ` +
    `Write-Host ${powerShellQuote("已停留在日志窗口，关闭此角色窗口即可结束。")}; while ($true) { Start-Sleep -Seconds 3600 }`;
}

function buildStaticLogLaunch({ env, label, rolePrompt, warning }) {
  return {
    file: null,
    args: [],
    env,
    label,
    requestedMode: "agent",
    activeMode: "error",
    rolePrompt,
    warning
  };
}

function stripAnsi(input) {
  return String(input || "")
    // CSI 序列：ESC [ ...
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
    // OSC 序列：ESC ] ... BEL 或 ESC ] ... ST
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, "")
    // 剩余的 ESC 开头的序列
    .replace(/\x1B(?:[@-_][^\x40-\x7E]*)?/g, "")
    // 删除非打印字符（保留正常文本、换行、中文）
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

function normalizeAgentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "done") {
    return "done";
  }
  if (normalized === "running") {
    return "running";
  }
  if (normalized === "idle") {
    return "idle";
  }
  return "";
}

function detectAgentApprovalWaitEvent(text) {
  const source = stripAnsi(text);
  const approvalPatterns = [
    /do you want to (?:create|edit|modify|overwrite|update|write|delete|run|execute)\b[\s\S]{0,600}\?/i,
    /(?:yes,\s*)?allow (?:all )?(?:edits|changes|commands)/i,
    /(?:需要|是否).{0,80}(?:确认|批准|允许|授权)/i
  ];
  if (!approvalPatterns.some((pattern) => pattern.test(source))) {
    return null;
  }
  return {
    type: "approval-wait",
    status: "running",
    message: sanitizeLogText("Agent 正在等待人工确认。请在对应终端中批准或拒绝后继续。", 500)
  };
}

function normalizeAgentEventRoleIds(value) {
  const values = Array.isArray(value) ? value : [value];
  return Array.from(new Set(values
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 8)));
}

function parseStructuredAgentEvents(text) {
  const events = [];
  const markerRegex = /^\s*COSS_AGENT_EVENT\s*:\s*(.+?)\s*$/gim;
  let match = markerRegex.exec(text);
  while (match) {
    const linePayload = match[1] || "";
    const objectStart = linePayload.indexOf("{");
    if (objectStart === -1) {
      match = markerRegex.exec(text);
      continue;
    }

    const candidateSource = linePayload.slice(objectStart);
    const jsonText = findBalancedJsonObject(candidateSource);
    if (!jsonText) {
      match = markerRegex.exec(text);
      continue;
    }

    try {
      const payload = JSON.parse(jsonText);
      const status = normalizeAgentStatus(payload.status || payload.state || payload.result);
      const message = sanitizeLogText(payload.message || payload.summary || payload.detail || "", 500);
      if (status || message) {
        events.push({
          type: String(payload.type || "structured").trim().slice(0, 40) || "structured",
          structured: true,
          status,
          message: message || `COSS_AGENT_EVENT:${jsonText}`,
          roleId: String(payload.roleId || payload.fromRoleId || "").trim(),
          fromRoleId: String(payload.fromRoleId || payload.roleId || "").trim(),
          toRoleIds: normalizeAgentEventRoleIds(payload.toRoleIds || payload.toRoleId),
          taskId: String(payload.taskId || "").trim(),
          subtaskId: String(payload.subtaskId || "").trim(),
          payload: {
            title: sanitizeLogText(payload.title || "", 160),
            reason: sanitizeLogText(payload.reason || "", 240)
          }
        });
      }
    } catch (error) {
      events.push({
        type: "structured-parse-error",
        structured: true,
        status: "",
        message: `COSS_AGENT_EVENT JSON 解析失败：${error.message}`
      });
    }

    match = markerRegex.exec(text);
  }
  return events;
}

function parseAgentOutputEvents(data, launch = {}) {
  const activeMode = launch.activeMode || "";
  if (!["claude", "codex", "codebuddy"].includes(activeMode)) {
    return [];
  }

  const text = stripAnsi(data);
  const events = parseStructuredAgentEvents(text);
  const approvalWaitEvent = detectAgentApprovalWaitEvent(text);
  if (approvalWaitEvent) {
    events.push(approvalWaitEvent);
  }
  const statusRegex = /^\s*COSS_AGENT_STATUS\s*:\s*([a-zA-Z_-]+)\s*$/gim;
  let match = statusRegex.exec(text);
  while (match) {
    const status = normalizeAgentStatus(match[1]);
    if (status) {
      events.push({ type: "status", status, message: match[0] });
    }
    match = statusRegex.exec(text);
  }

  const markerStatus = [
    [/^\s*COSS_TASK_DONE\s*$/im, "done"],
    [/^\s*COSS_TASK_RUNNING\s*$/im, "running"]
  ].find(([pattern]) => pattern.test(text));
  if (markerStatus && !events.some((event) => event.status === markerStatus[1])) {
    events.push({ type: "status", status: markerStatus[1], message: markerStatus[0].source });
  }

  const launchTaskId = launch.taskContext?.taskId || launch.agentSession?.taskId || "";
  const launchSubtaskId = launch.taskContext?.subtaskId || launch.agentSession?.subtaskId || "";
  return events.map((event) => ({
    ...event,
    provider: activeMode,
    activeMode,
    roleId: event.roleId || event.fromRoleId || launch.roleId || "",
    fromRoleId: event.fromRoleId || event.roleId || launch.roleId || "",
    toRoleIds: event.toRoleIds || [],
    roleName: launch.roleName || "",
    projectId: launch.projectId || launch.agentSession?.projectId || "",
    projectName: launch.projectName || launch.agentSession?.projectName || "",
    sessionId: launch.agentSession?.sessionId || "",
    sessionName: launch.agentSession?.sessionName || "",
    taskId: event.taskId || launchTaskId,
    subtaskId: event.subtaskId || launchSubtaskId,
    receivedAt: new Date().toISOString()
  }));
}

function shouldEmitAgentOutputEvent(id, event) {
  const key = [
    event.sessionId || "",
    event.taskId || "",
    event.subtaskId || "",
    event.status || "",
    event.type || "",
    event.message || ""
  ].join("|");
  let keys = agentOutputEventKeys.get(id);
  if (!keys) {
    keys = new Set();
    agentOutputEventKeys.set(id, keys);
  }
  if (keys.has(key)) {
    return false;
  }
  if (keys.size > 80) {
    keys.clear();
  }
  keys.add(key);
  return true;
}

function emitAgentOutputEvents(webContents, id, data, launch = {}) {
  const events = parseAgentOutputEvents(data, launch);
  events.filter((event) => shouldEmitAgentOutputEvent(id, event)).forEach((event) => {
    const payload = { ...event, id };
    appendLogEvent("agent.output.event", {
      id,
      provider: payload.provider,
      roleId: payload.roleId,
      sessionId: payload.sessionId,
      taskId: payload.taskId,
      subtaskId: payload.subtaskId,
      status: payload.status,
      type: payload.type,
      structured: Boolean(payload.structured),
      message: payload.message
    });
    if (!webContents.isDestroyed()) {
      webContents.send(IPC_EVENTS.TERMINAL_AGENT_EVENT, payload);
    }
  });
}

function getDefaultAgentPromptTemplate() {
  return [
    "你是 CosS 类桌面工作区中的{{roleName}}。",
    "角色 ID：{{roleId}}",
    "角色职责：{{roleDescription}}",
    "项目：{{projectName}}",
    "工作目录：{{workspace}}",
    "Agent 后端：{{agentProvider}}",
    "Agent 权限模式：{{agentPermissionLabel}}",
    "{{agentPermissionInstructions}}",
    "会话 ID：{{sessionId}}",
    "当前任务：{{taskTitle}}",
    "子任务：{{subtaskTitle}}",
    "子任务说明：{{subtaskDescription}}",
    "参考文件路径（如有，请用 Read 等工具自行读取，不要凭路径猜测内容）：{{taskFilePaths}}",
    "",
    "请只在当前项目范围内工作。执行高风险命令、删除文件、修改依赖或访问敏感信息前，先说明风险并等待用户确认。",
    "CosS 使用任务调度器按步骤推进协作。你不能直接给其他角色分配任务，不能发明不存在的角色，也不能绕过共享任务板。",
    "开始工作前优先读取任务板并领取当前步骤；长任务中保持进度更新；完成后必须提交结果。",
    "如果发现需要下游角色，只能把发现写入当前步骤的结果；当前步骤完成后，系统会启动预先规划好的下一步。"
    ,
    "",
    "CosS MCP is available for reliable automation. Prefer MCP tools over terminal paste when possible.",
    "MCP command is stored in COSS_MCP_SERVER. Current context is stored in COSS_MCP_USER_DATA, COSS_MCP_PROJECT_ID, COSS_MCP_ROLE_ID, COSS_MCP_TASK_ID, and COSS_MCP_SESSION_ID.",
    "CosS v0.10 uses a central linear workflow kernel. Do not directly assign work to another Agent, do not invent roles, and do not bypass the shared task board.",
    "Use coss_get_context, coss_get_task_board, and coss_list_roles first. Then use coss_pool_read, coss_pool_claim, coss_claim_step, coss_heartbeat_step, coss_acquire_lock when needed, coss_get_kernel_events for audit, and coss_submit_result for structured results.",
    "The Kernel starts the next preplanned step only after your step is submitted as done. Agent states are idle, running, and done only.",
    "If the agent runtime says `mcp__coss: Still connecting`, wait a few seconds and retry tool discovery or coss tool calls. Only call a runtime-specific waiting helper if that helper is actually available.",
    "Do not stop just because ToolSearch does not immediately show the coss tools. Wait and retry at least 3 times. Use COSS_AGENT_STATUS:running while working and COSS_AGENT_STATUS:done when finished."
  ].join("\n");
}

function applyPromptTemplate(template, values) {
  const source = String(template || "").trim() || getDefaultAgentPromptTemplate();
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? "") : match
  ));
}

function formatTaskContextProjectMemory(taskContext = {}) {
  if (taskContext.projectMemoryEnabled === false || !taskContext.projectMemorySummary) {
    return "";
  }
  return [
    "Project memory:",
    String(taskContext.projectMemorySummary || "").trim().slice(0, 14000)
  ].join("\n");
}

function formatTaskFilePaths(paths = []) {
  const list = Array.isArray(paths) ? paths.filter((p) => String(p || "").trim()) : [];
  if (list.length < 1) {
    return "（无）";
  }
  return list.map((p) => `\n - ${String(p).trim()}`).join("");
}

function buildRolePrompt(options) {
  const taskContext = options.taskContext || {};
  const agentSession = options.agentSession || {};
  const permissionPolicy = getAgentPermissionPolicy(options.agentPermissionMode);
  const prompt = applyPromptTemplate(options.rolePromptTemplate, {
    roleName: options.roleName || "开发角色",
    roleId: options.roleId || "unknown",
    roleDescription: options.roleDescription || "",
    projectName: options.projectName || "",
    projectId: options.projectId || "",
    workspace: normalizeCwd(options.cwd),
    agentProvider: getEffectiveAgentProvider(options),
    agentPermissionMode: permissionPolicy.id,
    agentPermissionLabel: permissionPolicy.label,
    agentPermissionInstructions: permissionPolicy.instruction,
    sessionId: agentSession.sessionId || "",
    sessionName: agentSession.sessionName || "",
    taskId: taskContext.taskId || agentSession.taskId || "",
    taskTitle: taskContext.taskTitle || "",
    taskGoal: taskContext.taskGoal || "",
    subtaskId: taskContext.subtaskId || agentSession.subtaskId || "",
    subtaskTitle: taskContext.subtaskTitle || "",
    subtaskDescription: taskContext.subtaskDescription || "",
    subtaskStatus: taskContext.subtaskStatus || "",
    projectMemorySummary: taskContext.projectMemorySummary || "",
    projectMemoryUpdatedAt: taskContext.projectMemoryUpdatedAt || "",
    taskFilePaths: formatTaskFilePaths(taskContext.taskFilePaths || [])
  });
  const memoryBlock = formatTaskContextProjectMemory(taskContext);
  if (!memoryBlock || prompt.includes("Project memory:")) {
    return prompt;
  }
  return `${prompt.trim()}\n\n${memoryBlock}`;
}

function normalizeTerminalMode(value) {
  return value === "agent" || value === "claude" || value === "codex" || value === "codebuddy" ? "agent" : "shell";
}

function normalizeAgentProvider(value) {
  return ["claude", "codex", "codebuddy"].includes(value) ? value : "claude";
}

function normalizeAgentPermissionMode(value) {
  return Object.prototype.hasOwnProperty.call(agentPermissionPolicies, value) ? value : "confirm";
}

function getAgentPermissionPolicy(value) {
  return agentPermissionPolicies[normalizeAgentPermissionMode(value)] || agentPermissionPolicies.confirm;
}

function assessTerminalCommandRisk(command) {
  const trimmed = String(command || "").trim();
  if (!trimmed) {
    return { requiresApproval: false, category: "empty", severity: "low", label: "空命令", ruleIds: [] };
  }
  const matches = terminalPermissionRiskRules.filter((rule) => rule.pattern.test(trimmed));
  if (matches.length === 0) {
    return { requiresApproval: false, category: "read", severity: "low", label: "普通命令", ruleIds: [] };
  }
  const highRisk = matches.find((rule) => rule.severity === "high");
  const primary = highRisk || matches[0];
  return {
    requiresApproval: true,
    category: primary.category,
    severity: primary.severity,
    label: primary.label,
    ruleIds: matches.map((rule) => rule.id)
  };
}

function shouldBlockTerminalCommand(permissionMode, assessment) {
  const mode = normalizeAgentPermissionMode(permissionMode);
  if (!assessment?.requiresApproval || mode === "worldFullAccess") {
    return false;
  }
  if (mode === "readonly") {
    return ["write", "install", "delete", "deployment", "environment", "script"].includes(assessment.category);
  }
  if (mode === "confirm") {
    return true;
  }
  if (mode === "sessionEdit") {
    return ["install", "delete", "deployment", "environment", "script"].includes(assessment.category);
  }
  if (mode === "sessionInstall") {
    return ["delete", "deployment", "environment", "script"].includes(assessment.category);
  }
  return true;
}

function getAgentProviderLabel(provider) {
  return {
    claude: "Claude Code",
    codex: "Codex",
    codebuddy: "CodeBuddy Code"
  }[normalizeAgentProvider(provider)] || "Claude Code";
}

function getEffectiveAgentProvider(options) {
  if (options.terminalMode === "codex" || options.terminalMode === "claude" || options.terminalMode === "codebuddy") {
    return options.terminalMode;
  }

  return normalizeAgentProvider(options.agentProvider);
}

function shouldFallbackToShell(options) {
  return options.agentFallbackToShell !== false;
}

function resolveTerminalLaunch(options) {
  const shell = getShellCommand();
  const terminalMode = normalizeTerminalMode(options.terminalMode);
  const agentProvider = getEffectiveAgentProvider(options);
  const fallbackToShell = shouldFallbackToShell(options);
  const rolePrompt = buildRolePrompt(options);
  const taskContext = options.taskContext || {};
  const agentSession = options.agentSession || {};
  const permissionPolicy = getAgentPermissionPolicy(options.agentPermissionMode);
  const codeBuddyApiKey = String(options.codeBuddyApiKey || "").trim();
  const mcpServer = getMcpServerInfo({
    projectId: options.projectId || agentSession.projectId || "",
    roleId: options.roleId || "",
    taskId: taskContext.taskId || agentSession.taskId || "",
    sessionId: agentSession.sessionId || ""
  });
  const env = getShellEnv({
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    COSS_ROLE_ID: options.roleId || "",
    COSS_ROLE_NAME: options.roleName || "",
    COSS_ROLE_PROMPT: rolePrompt,
    COSS_TERMINAL_MODE: terminalMode,
    COSS_AGENT_PROVIDER: agentProvider,
    COSS_AGENT_PERMISSION_MODE: permissionPolicy.id,
    COSS_AGENT_PERMISSION_LABEL: permissionPolicy.label,
    COSS_AGENT_PERMISSION_INSTRUCTIONS: permissionPolicy.instruction,
    COSS_AGENT_SESSION_ID: agentSession.sessionId || "",
    COSS_AGENT_SESSION_NAME: agentSession.sessionName || "",
    COSS_PROJECT_ID: options.projectId || agentSession.projectId || "",
    COSS_PROJECT_NAME: options.projectName || agentSession.projectName || "",
    COSS_TASK_ID: taskContext.taskId || agentSession.taskId || "",
    COSS_SUBTASK_ID: taskContext.subtaskId || agentSession.subtaskId || "",
    COSS_TASK_TITLE: taskContext.taskTitle || "",
    COSS_SUBTASK_TITLE: taskContext.subtaskTitle || "",
    COSS_PROJECT_MEMORY: taskContext.projectMemorySummary || "",
    COSS_PROJECT_MEMORY_UPDATED_AT: taskContext.projectMemoryUpdatedAt || "",
    COSS_MCP_SERVER: `${mcpServer.command} ${mcpServer.args.map((arg) => JSON.stringify(arg)).join(" ")}`,
    COSS_MCP_COMMAND: mcpServer.command,
    COSS_MCP_ARGS: JSON.stringify(mcpServer.args),
    COSS_MCP_SERVER_PATH: mcpServer.serverPath,
    COSS_MCP_USER_DATA: mcpServer.userData,
    COSS_MCP_PROJECT_ID: mcpServer.projectId,
    COSS_MCP_ROLE_ID: mcpServer.roleId,
    COSS_MCP_TASK_ID: mcpServer.taskId,
    COSS_MCP_SESSION_ID: mcpServer.sessionId,
    COSS_CODEBUDDY_MCP_CONFIG: getCodeBuddyMcpConfigPath(options.cwd),
    ...(agentProvider === "codebuddy" && codeBuddyApiKey ? { CODEBUDDY_API_KEY: codeBuddyApiKey } : {})
  });

  if (terminalMode === "shell") {
    return {
      ...shell,
      env,
      label: "PowerShell",
      requestedMode: "shell",
      activeMode: "shell",
      rolePrompt
    };
  }

  if (terminalMode === "agent" && agentProvider === "codex") {
    const codexLaunchInfo = getCodexLaunchCommandInfo(env);
    appendLogEvent("agent.codex.launch.detection-skipped", {
      command: codexLaunchInfo.command || "",
      requestedCommand: codexLaunchInfo.requestedCommand || "",
      lookupPathCount: codexLaunchInfo.lookupPaths.length
    });

    if (process.platform === "win32") {
      const codexLaunch = buildCodexWindowsLaunch(codexLaunchInfo, env);
      return {
        file: codexLaunch.file,
        args: codexLaunch.args,
        env,
        label: "Codex",
        requestedMode: "agent",
        activeMode: "codex",
        rolePrompt,
        launchMethod: codexLaunch.launchMethod,
        nodeCommand: codexLaunch.nodeCommand || "",
        scriptPath: codexLaunch.scriptPath || ""
      };
    }

    return {
      file: codexLaunchInfo.command,
      args: [],
      env,
      label: "Codex",
      requestedMode: "agent",
      activeMode: "codex",
      rolePrompt
    };

    // Legacy auto-detect/install flow below is intentionally unreachable.
    // Manual settings checks still use the codex:status IPC handler.

    if (!codexStatus.runnable) {
      const lookupText = codexStatus.lookupPaths.length
        ? `\r\n检测到的路径: ${codexStatus.lookupPaths.join(" | ")}`
        : "\r\n未在 PATH 中找到 codex。";
      const packageHint = codexStatus.hasWindowsAppsPackagePath
        ? "\r\n当前检测到的是 WindowsApps 中的 OpenAI Codex 应用包路径，它不能作为命令行 CLI 直接启动。"
        : "";
      const npmStatus = codexStatus.npm || getNpmStatus(env);
      const canAutoInstall = !codexStatus.autoInstallDisabled && npmStatus.usable;
      const installCommand = codexStatus.installCommand;
      const unavailableWarning =
        `未检测到可运行的 Codex CLI，且当前不会自动执行 npm 安装。\r\n` +
        `命令: ${codexStatus.command}\r\n` +
        `原因: ${codexStatus.errorDetail || "codex --version 未成功运行。"}${lookupText}${packageHint}\r\n` +
        `${codexStatus.autoInstallDisabled ? "当前环境禁用了 Codex CLI 自动安装。\r\n" : `npm 状态: ${npmStatus.errorDetail || "npm 不可用。"}\r\n`}` +
        `请手动安装 Codex CLI 后再创建 Agent 终端。推荐命令: ${installCommand}`;

      if (!canAutoInstall && !fallbackToShell) {
        return buildStaticLogLaunch({
          env,
          label: "Codex Agent 错误",
          rolePrompt,
          warning: `${unavailableWarning}\r\n已关闭失败回退到普通 PowerShell，因此仅保留此日志窗口。`
        });
      }

      const installerLaunch = canAutoInstall && process.platform === "win32"
        ? {
            file: "powershell.exe",
            args: [
              "-NoLogo",
              ...(fallbackToShell ? ["-NoExit"] : []),
              "-Command",
              buildCodexInstallPowerShellCommand({ ...codexStatus, holdLogWindow: !fallbackToShell }, installCommand)
            ]
          }
        : shell;

      return {
        ...installerLaunch,
        env,
        label: canAutoInstall ? "Codex CLI 安装程序" : "PowerShell",
        requestedMode: "agent",
        activeMode: canAutoInstall ? "installing" : "shell",
        rolePrompt,
        installCommand: canAutoInstall && process.platform !== "win32" ? installCommand : null,
        warning:
          canAutoInstall && process.platform !== "win32"
            ? `未检测到可运行的 Codex CLI，正在通过 npm 安装 ${codexNpmPackage}。\r\n` +
              `命令: ${codexStatus.command}\r\n` +
              `原因: ${codexStatus.errorDetail || "codex --version 未成功运行。"}${lookupText}${packageHint}\r\n` +
              `即将执行: ${installCommand}\r\n` +
              "安装完成后请重启 CosS，或重新打开应用终端，让新的 PATH 生效。"
            : canAutoInstall
              ? ""
              : unavailableWarning
      };
    }

    if (process.platform === "win32") {
      const codexLaunch = buildCodexWindowsLaunch(codexStatus, env);
      return {
        file: codexLaunch.file,
        args: codexLaunch.args,
        env,
        label: "Codex",
        requestedMode: "agent",
        activeMode: "codex",
        rolePrompt,
        launchMethod: codexLaunch.launchMethod,
        nodeCommand: codexLaunch.nodeCommand || "",
        scriptPath: codexLaunch.scriptPath || ""
      };
    }

    return {
      file: codexStatus.command,
      args: [],
      env,
      label: "Codex",
      requestedMode: "agent",
      activeMode: "codex",
      rolePrompt
    };
  }

  if (terminalMode === "agent" && agentProvider === "codebuddy") {
    const codeBuddyLaunchInfo = getCodeBuddyLaunchCommandInfo(env);
    const hasCodeBuddyKeyForLaunch = Boolean(codeBuddyApiKey || getCaseInsensitiveEnvValue(env, "CODEBUDDY_API_KEY"));
    appendLogEvent("agent.codebuddy.launch.detection-skipped", {
      command: codeBuddyLaunchInfo.command || "",
      requestedCommand: codeBuddyLaunchInfo.requestedCommand || "",
      aliasCommand: codeBuddyLaunchInfo.aliasCommand || "",
      lookupPathCount: codeBuddyLaunchInfo.lookupPaths.length,
      hasApiKey: hasCodeBuddyKeyForLaunch
    });

    if (!hasCodeBuddyKeyForLaunch) {
      const warning =
        "未配置 CodeBuddy Code API Key。\r\n" +
        "请在设置中填写 CodeBuddy API Key，或通过环境变量 CODEBUDDY_API_KEY 提供。";
      if (!fallbackToShell) {
        return buildStaticLogLaunch({
          env,
          label: "CodeBuddy Code Agent 错误",
          rolePrompt,
          warning
        });
      }
      return {
        ...shell,
        env,
        label: "PowerShell",
        requestedMode: "agent",
        activeMode: "shell",
        rolePrompt,
        warning
      };
    }

    if (process.platform === "win32") {
      const codeBuddyLaunch = buildCodeBuddyWindowsLaunch(codeBuddyLaunchInfo, options, env);
      return {
        file: codeBuddyLaunch.file,
        args: codeBuddyLaunch.args,
        env,
        label: "CodeBuddy Code",
        requestedMode: "agent",
        activeMode: "codebuddy",
        rolePrompt,
        launchMethod: codeBuddyLaunch.launchMethod,
        npxCommand: codeBuddyLaunch.npxCommand || "",
        nodeCommand: codeBuddyLaunch.nodeCommand || "",
        scriptPath: codeBuddyLaunch.scriptPath || ""
      };
    }

    return {
      file: codeBuddyLaunchInfo.command,
      args: buildCodeBuddyArgs({ cwd: options.cwd }),
      env,
      label: "CodeBuddy Code",
      requestedMode: "agent",
      activeMode: "codebuddy",
      rolePrompt
    };

    // Legacy auto-detect/install flow below is intentionally unreachable.
    // Manual settings checks still use the codebuddy:status IPC handler.
    const hasCodeBuddyKey = Boolean(codeBuddyApiKey || getCaseInsensitiveEnvValue(env, "CODEBUDDY_API_KEY"));

    if (!codeBuddyStatus.runnable) {
      const lookupText = codeBuddyStatus.lookupPaths.length
        ? `\r\n检测到的路径: ${codeBuddyStatus.lookupPaths.join(" | ")}`
        : "\r\n未在 PATH 中找到 codebuddy 或 cbc。";
      const npmStatus = codeBuddyStatus.npm || getNpmStatus(env);
      const canAutoInstall = !codeBuddyStatus.autoInstallDisabled && npmStatus.usable;
      const installCommand = codeBuddyStatus.installCommand;
      const unavailableWarning =
        `未检测到可运行的 CodeBuddy Code CLI，且当前不会自动执行 npm 安装。\r\n` +
        `命令: ${codeBuddyStatus.command}\r\n` +
        `原因: ${codeBuddyStatus.errorDetail || "codebuddy --version 未成功运行。"}${lookupText}\r\n` +
        `${codeBuddyStatus.autoInstallDisabled ? "当前环境禁用了 CodeBuddy Code 自动安装。\r\n" : `npm 状态: ${npmStatus.errorDetail || "npm 不可用。"}\r\n`}` +
        `请手动安装 CodeBuddy Code CLI 后再创建 Agent 终端。推荐命令: ${installCommand}`;

      if (!canAutoInstall && !fallbackToShell) {
        return buildStaticLogLaunch({
          env,
          label: "CodeBuddy Code Agent 错误",
          rolePrompt,
          warning: `${unavailableWarning}\r\n已关闭失败回退到普通 PowerShell，因此仅保留此日志窗口。`
        });
      }

      const installerLaunch = canAutoInstall && process.platform === "win32"
        ? {
            file: "powershell.exe",
            args: [
              "-NoLogo",
              ...(fallbackToShell ? ["-NoExit"] : []),
              "-Command",
              buildCodeBuddyInstallPowerShellCommand({ ...codeBuddyStatus, holdLogWindow: !fallbackToShell }, installCommand)
            ]
          }
        : shell;

      return {
        ...installerLaunch,
        env,
        label: canAutoInstall ? "CodeBuddy Code CLI 安装程序" : "PowerShell",
        requestedMode: "agent",
        activeMode: canAutoInstall ? "installing" : "shell",
        rolePrompt,
        installCommand: canAutoInstall && process.platform !== "win32" ? installCommand : null,
        warning:
          canAutoInstall && process.platform !== "win32"
            ? `未检测到可运行的 CodeBuddy Code CLI，正在通过 npm 安装 ${codeBuddyNpmPackage}。\r\n` +
              `命令: ${codeBuddyStatus.command}\r\n` +
              `原因: ${codeBuddyStatus.errorDetail || "codebuddy --version 未成功运行。"}${lookupText}\r\n` +
              `即将执行: ${installCommand}\r\n` +
              "安装完成后请重启 CosS，或重新打开应用终端，让新的 PATH 生效。"
            : canAutoInstall
              ? ""
              : unavailableWarning
      };
    }

    if (!hasCodeBuddyKey) {
      const warning =
        "未配置 CodeBuddy Code API Key。\r\n" +
        "请在 设置 > 智能体设置 中填写 CodeBuddy API Key，或通过环境变量 CODEBUDDY_API_KEY 提供。";
      if (!fallbackToShell) {
        return buildStaticLogLaunch({
          env,
          label: "CodeBuddy Code Agent 错误",
          rolePrompt,
          warning: `${warning}\r\n已关闭失败回退到普通 PowerShell，因此仅保留此日志窗口。`
        });
      }
      return {
        ...shell,
        env,
        label: "PowerShell",
        requestedMode: "agent",
        activeMode: "shell",
        rolePrompt,
        warning
      };
    }

    if (process.platform === "win32") {
      const codeBuddyLaunch = buildCodeBuddyWindowsLaunch(codeBuddyStatus, options, env);
      return {
        file: codeBuddyLaunch.file,
        args: codeBuddyLaunch.args,
        env,
        label: "CodeBuddy Code",
        requestedMode: "agent",
        activeMode: "codebuddy",
        rolePrompt,
        launchMethod: codeBuddyLaunch.launchMethod,
        npxCommand: codeBuddyLaunch.npxCommand || "",
        nodeCommand: codeBuddyLaunch.nodeCommand || "",
        scriptPath: codeBuddyLaunch.scriptPath || ""
      };
    }

    return {
      file: codeBuddyStatus.command,
      args: buildCodeBuddyArgs({ cwd: options.cwd }),
      env,
      label: "CodeBuddy Code",
      requestedMode: "agent",
      activeMode: "codebuddy",
      rolePrompt
    };
  }

  const claudeCommand = process.env.COSS_CLAUDE_COMMAND || "claude";
  const claudeConfig = ensureClaudeOnboardingCompleted();
  const hasClaude = commandExists(claudeCommand, env);

  if (!hasClaude) {
    const autoInstallDisabled = process.env.COSS_DISABLE_CLAUDE_AUTO_INSTALL === "1";
    const wingetStatus = getWingetStatus();
    const hasWinget = !autoInstallDisabled && wingetStatus.usable;
    const installCommand = `winget install ${claudeCodeWingetPackage}`;
    const unavailableWarning =
      `未找到 Claude Code 命令 "${claudeCommand}"，且当前不会自动执行 winget 安装。\r\n` +
      `${autoInstallDisabled ? "当前环境禁用了 Claude Code 自动安装。\r\n" : `${wingetStatus.detail}\r\n`}` +
      `请手动安装 Claude Code 后再创建 Claude Code 终端。推荐命令: winget install ${claudeCodeWingetPackage}`;

    if (!hasWinget && !fallbackToShell) {
      return buildStaticLogLaunch({
        env,
        label: "Claude Code Agent 错误",
        rolePrompt,
        warning: `${unavailableWarning}\r\n已关闭失败回退到普通 PowerShell，因此仅保留此日志窗口。`
      });
    }

    if (hasWinget && !fallbackToShell && process.platform === "win32") {
      return {
        file: "powershell.exe",
        args: [
          "-NoLogo",
          "-Command",
          buildHeldInstallPowerShellCommand(
            [
              `未找到 Claude Code 命令 "${claudeCommand}"，正在通过 winget 安装 ${claudeCodeWingetPackage}。`,
              `即将执行: ${installCommand}`
            ],
            `& ${powerShellQuote("winget")} install ${powerShellQuote(claudeCodeWingetPackage)}`,
            "Claude Code 安装流程已结束。安装完成后请重启 CosS，或重新打开应用终端，让新的 PATH 生效。"
          )
        ],
        env,
        label: "Claude Code 安装程序",
        requestedMode: "agent",
        activeMode: "installing",
        rolePrompt,
        claudeConfig,
        installCommand: null,
        warning: ""
      };
    }

    return {
      ...shell,
      env,
      label: hasWinget ? "Claude Code 安装程序" : "PowerShell",
      requestedMode: "agent",
      activeMode: hasWinget ? "installing" : "shell",
      rolePrompt,
      claudeConfig,
      installCommand: hasWinget ? installCommand : null,
      warning:
        hasWinget
          ? `未找到 Claude Code 命令 "${claudeCommand}"，正在通过 winget 安装 ${claudeCodeWingetPackage}。\r\n` +
            `即将执行: ${installCommand}\r\n` +
            "安装完成后请重启 CosS，或重新打开应用终端，让新的 PATH 生效。"
          : unavailableWarning
    };
  }

  if (process.platform === "win32") {
    return {
      file: "powershell.exe",
      args: ["-NoLogo", "-NoExit", "-Command", buildClaudePowerShellCommand(claudeCommand, options, rolePrompt)],
      env,
      label: "Claude Code",
      requestedMode: "agent",
      activeMode: "claude",
      rolePrompt,
      claudeConfig
    };
  }

  return {
    file: claudeCommand,
    args: buildClaudeArgs(options, rolePrompt),
    env,
    label: "Claude Code",
    requestedMode: "agent",
    activeMode: "claude",
    rolePrompt,
    claudeConfig
  };
}

function appendTerminalTranscript(id, data) {
  if (!id || typeof data !== "string" || !data) {
    return;
  }
  const previous = terminalTranscripts.get(id) || "";
  terminalTranscripts.set(id, `${previous}${data}`.slice(-120000));
}

function getTerminalTargetWebContents(id, fallbackWebContents) {
  const current = terminalWebContents.get(id);
  if (current && !current.isDestroyed()) {
    return current;
  }
  return fallbackWebContents;
}

function sendTerminalData(webContents, id, data) {
  appendTerminalTranscript(id, data);
  const targetWebContents = getTerminalTargetWebContents(id, webContents);
  if (targetWebContents && !targetWebContents.isDestroyed()) {
    targetWebContents.send("terminal:data", { id, data });
  }
}

function sendTerminalExit(webContents, id, exitCode) {
  const targetWebContents = getTerminalTargetWebContents(id, webContents);
  if (targetWebContents && !targetWebContents.isDestroyed()) {
    targetWebContents.send("terminal:exit", { id, exitCode });
  }
}

function getTerminalInputGuard(session) {
  session.inputGuard ||= { buffer: "" };
  return session.inputGuard;
}

function isBracketedPasteInput(data) {
  return String(data || "").includes("\x1b[200~") || String(data || "").includes("\x1b[201~");
}

function shouldBypassTerminalPermissionGuard(data, options = {}) {
  return Boolean(options?.bypassPermissionGuard) || isBracketedPasteInput(data);
}

function processTerminalPermissionGuard(webContents, id, session, data, options = {}) {
  if (!session || typeof data !== "string") {
    return { ok: false, reason: "invalid-input" };
  }
  const guard = getTerminalInputGuard(session);
  if (shouldBypassTerminalPermissionGuard(data, options)) {
    if (options?.clearInputGuard !== false) {
      guard.buffer = "";
    }
    appendLogEvent("terminal.permission.bypassed", {
      id,
      reason: String(options?.reason || (isBracketedPasteInput(data) ? "bracketed-paste" : "explicit-bypass")).slice(0, 80),
      activeMode: session.launch?.activeMode || "",
      permissionMode: session.launch?.permissionMode || "confirm"
    });
    return { ok: true };
  }

  for (const char of data) {
    if (char === "\r" || char === "\n") {
      const command = guard.buffer.trim();
      guard.buffer = "";
      const assessment = assessTerminalCommandRisk(command);
      if (command && shouldBlockTerminalCommand(session.launch?.permissionMode, assessment)) {
        const policy = getAgentPermissionPolicy(session.launch?.permissionMode);
        const message =
          `\x1b[31mCosS 已按权限模式阻止命令执行。\x1b[0m\r\n` +
          `权限模式: ${policy.label}\r\n` +
          `风险类型: ${assessment.label}\r\n` +
          `命令: ${command}\r\n` +
          `如需执行，请在安全中心切换权限模式，或通过前端审批弹窗确认后再执行。\r\n`;
        sendTerminalData(webContents, id, message);
        appendLogEvent("terminal.permission.blocked", {
          id,
          command: sanitizeLogText(command, 500),
          permissionMode: policy.id,
          permissionLabel: policy.label,
          activeMode: session.launch?.activeMode || "",
          category: assessment.category,
          severity: assessment.severity,
          riskLabel: assessment.label,
          ruleIds: assessment.ruleIds || []
        }, "warn");
        return { ok: false, reason: "permission-blocked", assessment };
      }
      continue;
    }
    if (char === "\u0003" || char === "\u0015") {
      guard.buffer = "";
      continue;
    }
    if (char === "\u007f" || char === "\b") {
      guard.buffer = guard.buffer.slice(0, -1);
      continue;
    }
    if (char >= " " || char === "\t") {
      guard.buffer += char;
      if (guard.buffer.length > 2000) {
        guard.buffer = guard.buffer.slice(-2000);
      }
    }
  }
  return { ok: true };
}

function killProcessTree(pid) {
  const normalizedPid = Number(pid);
  if (!Number.isFinite(normalizedPid) || normalizedPid <= 0) {
    return;
  }

  if (process.platform === "win32") {
    childProcess.spawnSync("taskkill.exe", ["/PID", String(normalizedPid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true
    });
    return;
  }

  try {
    process.kill(normalizedPid);
  } catch {
    // The process may already have exited.
  }
}

function sanitizeProcessEntry(entry = {}) {
  return {
    pid: Number(entry.ProcessId || entry.pid || 0) || 0,
    parentPid: Number(entry.ParentProcessId || entry.parentPid || 0) || 0,
    name: sanitizeLogText(entry.Name || entry.name || "", 120),
    executablePath: sanitizeLogText(entry.ExecutablePath || entry.executablePath || "", 320),
    commandLine: sanitizeLogText(entry.CommandLine || entry.commandLine || "", 700),
    creationDate: sanitizeLogText(entry.CreationDate || entry.creationDate || "", 80),
    depth: Number.isFinite(Number(entry.Depth ?? entry.depth)) ? Number(entry.Depth ?? entry.depth) : null,
    root: Boolean(entry.Root ?? entry.root)
  };
}

function readWindowsProcessTreeSnapshot(rootPid) {
  const normalizedPid = Number(rootPid);
  if (process.platform !== "win32" || !Number.isFinite(normalizedPid) || normalizedPid <= 0) {
    return { ok: false, reason: "unsupported-or-invalid-pid", descendants: [], suspiciousConsoleProcesses: [] };
  }

  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$rootPid = [int]$env:COSS_PROCESS_TREE_ROOT_PID",
    "$names = @('conhost.exe','OpenConsole.exe','WindowsTerminal.exe','powershell.exe','pwsh.exe','cmd.exe','node.exe','Code.exe')",
    "$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine,CreationDate",
    "$byParent = @{}",
    "foreach ($p in $all) {",
    "  $ppid = [int]$p.ParentProcessId",
    "  if (-not $byParent.ContainsKey($ppid)) { $byParent[$ppid] = New-Object System.Collections.ArrayList }",
    "  [void]$byParent[$ppid].Add($p)",
    "}",
    "$seen = @{}",
    "$desc = New-Object System.Collections.ArrayList",
    "function Add-Proc($p, [int]$depth, [bool]$root) {",
    "  $seen[[string]$p.ProcessId] = $true",
    "  [void]$desc.Add([pscustomobject]@{",
    "    ProcessId = [int]$p.ProcessId; ParentProcessId = [int]$p.ParentProcessId; Name = [string]$p.Name;",
    "    ExecutablePath = [string]$p.ExecutablePath; CommandLine = [string]$p.CommandLine;",
    "    CreationDate = if ($p.CreationDate) { $p.CreationDate.ToString('o') } else { '' };",
    "    Depth = $depth; Root = $root",
    "  })",
    "}",
    "function Walk([int]$currentPid, [int]$depth) {",
    "  if ($depth -gt 8 -or -not $byParent.ContainsKey($currentPid)) { return }",
    "  foreach ($child in @($byParent[$currentPid])) {",
    "    $key = [string]$child.ProcessId",
    "    if ($seen.ContainsKey($key)) { continue }",
    "    Add-Proc $child $depth $false",
    "    Walk ([int]$child.ProcessId) ($depth + 1)",
    "  }",
    "}",
    "$root = $all | Where-Object { [int]$_.ProcessId -eq $rootPid } | Select-Object -First 1",
    "if ($root) { Add-Proc $root -1 $true; Walk $rootPid 0 }",
    "$suspect = New-Object System.Collections.ArrayList",
    "foreach ($p in $all) {",
    "  if ($suspect.Count -ge 120) { break }",
    "  if ($names -contains [string]$p.Name) {",
    "    [void]$suspect.Add([pscustomobject]@{",
    "      ProcessId = [int]$p.ProcessId; ParentProcessId = [int]$p.ParentProcessId; Name = [string]$p.Name;",
    "      ExecutablePath = [string]$p.ExecutablePath; CommandLine = [string]$p.CommandLine;",
    "      CreationDate = if ($p.CreationDate) { $p.CreationDate.ToString('o') } else { '' };",
    "      Depth = $null; Root = $false",
    "    })",
    "  }",
    "}",
    "[pscustomobject]@{ RootPid = $rootPid; RootFound = [bool]$root; Descendants = $desc; SuspiciousConsoleProcesses = $suspect } | ConvertTo-Json -Compress -Depth 5"
  ].join("\n");

  const result = childProcess.spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    env: { ...process.env, COSS_PROCESS_TREE_ROOT_PID: String(normalizedPid) },
    windowsHide: true,
    timeout: 6000,
    maxBuffer: 1024 * 1024 * 4
  });

  if (result.error) {
    return { ok: false, reason: "query-error", error: serializeError(result.error), descendants: [], suspiciousConsoleProcesses: [] };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      reason: "query-exit",
      status: result.status,
      stderr: sanitizeLogText(result.stderr, 700),
      stdout: sanitizeLogText(result.stdout, 700),
      descendants: [],
      suspiciousConsoleProcesses: []
    };
  }

  try {
    const parsed = JSON.parse(String(result.stdout || "{}"));
    const descendants = (Array.isArray(parsed.Descendants) ? parsed.Descendants : parsed.Descendants ? [parsed.Descendants] : [])
      .map(sanitizeProcessEntry)
      .filter((entry) => entry.pid > 0);
    const descendantPids = new Set(descendants.map((entry) => entry.pid));
    const suspiciousConsoleProcesses = (Array.isArray(parsed.SuspiciousConsoleProcesses) ? parsed.SuspiciousConsoleProcesses : parsed.SuspiciousConsoleProcesses ? [parsed.SuspiciousConsoleProcesses] : [])
      .map(sanitizeProcessEntry)
      .filter((entry) => entry.pid > 0)
      .filter((entry) => !descendantPids.has(entry.pid))
      .slice(0, 80);
    return {
      ok: true,
      rootPid: Number(parsed.RootPid || normalizedPid),
      rootFound: Boolean(parsed.RootFound),
      descendantCount: descendants.length,
      suspiciousCount: suspiciousConsoleProcesses.length,
      descendants,
      suspiciousConsoleProcesses
    };
  } catch (error) {
    return {
      ok: false,
      reason: "parse-error",
      error: serializeError(error),
      stdout: sanitizeLogText(result.stdout, 1000),
      descendants: [],
      suspiciousConsoleProcesses: []
    };
  }
}

function scheduleTerminalProcessTreeSnapshots(id, session, roleName = "") {
  const rootPid = Number(session?.pid || 0);
  if (
    process.env.COSS_ENABLE_TERMINAL_PROCESS_SNAPSHOTS !== "1" ||
    process.platform !== "win32" ||
    !Number.isFinite(rootPid) ||
    rootPid <= 0
  ) {
    return;
  }

  terminalProcessTreeSnapshotDelaysMs.forEach((delayMs) => {
    const timer = setTimeout(() => {
      const currentSession = terminalSessions.get(id);
      const snapshot = readWindowsProcessTreeSnapshot(rootPid);
      appendLogEvent(snapshot.ok ? "terminal.process-tree.snapshot" : "terminal.process-tree.snapshot.failed", {
        id,
        roleName,
        rootPid,
        delayMs,
        sessionStillRegistered: currentSession === session,
        mode: session.mode,
        activeMode: session.launch?.activeMode || "",
        requestedMode: session.launch?.requestedMode || "",
        launchMethod: session.launch?.launchMethod || "",
        file: session.launch?.file || "",
        scriptPath: session.launch?.scriptPath || "",
        ...snapshot
      }, snapshot.ok ? "info" : "warn");
    }, delayMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }
  });
}

function createPipeTerminal(webContents, id, options, launch = resolveTerminalLaunch(options)) {
  let finished = false;
  const child = childProcess.spawn(launch.file, launch.args, {
    cwd: normalizeCwd(options.cwd),
    env: launch.env,
    windowsHide: true
  });

  child.stdout.on("data", (chunk) => {
    const data = chunk.toString();
    emitAgentOutputEvents(webContents, id, data, launch);
    sendTerminalData(webContents, id, data);
  });
  child.stderr.on("data", (chunk) => {
    const data = chunk.toString();
    emitAgentOutputEvents(webContents, id, data, launch);
    sendTerminalData(webContents, id, data);
  });
  child.on("error", (error) => {
    if (finished) {
      return;
    }
    finished = true;
    appendLogEvent("terminal.spawn.failed", {
      id,
      mode: "pipe",
      file: launch.file,
      args: launch.args,
      cwd: normalizeCwd(options.cwd),
      error: serializeError(error)
    }, "error");
    sendTerminalData(webContents, id, `\x1b[31m终端进程启动失败: ${error.message}\x1b[0m\r\n`);
    terminalSessions.delete(id);
    sendTerminalExit(webContents, id, "spawn-error");
  });
  child.on("exit", (code) => {
    if (finished) {
      return;
    }
    finished = true;
    appendLogEvent("terminal.exited", {
      id,
      mode: "pipe",
      activeMode: launch.activeMode,
      exitCode: code
    }, code === 0 || code === null ? "info" : "warn");
    terminalSessions.delete(id);
    sendTerminalExit(webContents, id, code);
  });

  return {
    write: (data) => {
      if (child.stdin?.writable) {
        child.stdin.write(data);
        return true;
      }
      return false;
    },
    resize: () => {},
    kill: () => child.kill(),
    mode: "pipe",
    pid: child.pid,
    launch
  };
}

function shouldUsePipeTerminalBackend(launch = {}) {
  return process.env.COSS_FORCE_AGENT_PIPE_BACKEND === "1"
    && process.platform === "win32"
    && ["codex", "codebuddy"].includes(String(launch.activeMode || "").toLowerCase());
}

let nativeTerminalHelperPathCache;

function getNativeTerminalHelperExecutableNames() {
  return process.platform === "win32"
    ? ["CosS.TerminalHost.exe", "CosS.TerminalHelper.exe"]
    : ["CosS.TerminalHost", "CosS.TerminalHelper"];
}

function getNativeTerminalHelperCandidates() {
  const executableNames = getNativeTerminalHelperExecutableNames();
  const candidates = [];
  if (process.env.COSS_TERMINAL_HELPER_PATH) {
    candidates.push(process.env.COSS_TERMINAL_HELPER_PATH);
  }

  const appRoot = path.resolve(__dirname, "..");
  for (const executableName of executableNames) {
    if (process.resourcesPath) {
      candidates.push(path.join(process.resourcesPath, "coss-terminal-helper", executableName));
    }
    candidates.push(
      path.join(appRoot, "native", "coss-terminal-helper", "bin", "Debug", "net10.0-windows", executableName),
      path.join(appRoot, "native", "coss-terminal-helper", "bin", "Release", "net10.0-windows", executableName),
      path.join(appRoot, "native", "coss-terminal-helper", "bin", "Release", "net10.0-windows", "win-x64", "publish", executableName)
    );
  }

  return [...new Set(candidates.filter(Boolean))];
}

function getNativeTerminalHelperPath() {
  if (nativeTerminalHelperPathCache !== undefined) {
    return nativeTerminalHelperPathCache;
  }
  nativeTerminalHelperPathCache = "";
  for (const candidate of getNativeTerminalHelperCandidates()) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        nativeTerminalHelperPathCache = candidate;
        break;
      }
    } catch {
      // Keep looking; a candidate may point to a protected or stale path.
    }
  }
  return nativeTerminalHelperPathCache;
}

function shouldUseNativeTerminalBackend(launch = {}) {
  if (process.platform !== "win32" || process.env.COSS_DISABLE_NATIVE_TERMINAL_HELPER === "1") {
    return false;
  }
  if (launch.activeMode === "static" || launch.activeMode === "mock" || launch.activeMode === "error") {
    return false;
  }
  return Boolean(getNativeTerminalHelperPath());
}

function sendNativeTerminalCommand(child, message) {
  if (!child.stdin?.writable) {
    return false;
  }
  child.stdin.write(`${JSON.stringify(message)}\n`);
  return true;
}

function createNativeTerminal(webContents, id, options, launch = resolveTerminalLaunch(options)) {
  const helperPath = getNativeTerminalHelperPath();
  if (!helperPath) {
    throw new Error("native terminal helper is unavailable");
  }

  const cwd = normalizeCwd(options.cwd);
  const cols = normalizeTerminalSize(options.cols, 80, 20, 240);
  const rows = normalizeTerminalSize(options.rows, 24, 6, 80);
  const helperArgs = [
    "--cols",
    String(cols),
    "--rows",
    String(rows),
    "--cwd",
    cwd,
    "--",
    launch.file,
    ...(Array.isArray(launch.args) ? launch.args.map(String) : [])
  ];

  let child;
  try {
    child = childProcess.spawn(helperPath, helperArgs, {
      cwd,
      env: launch.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
  } catch (error) {
    appendLogEvent("terminal.native-helper.spawn.failed", {
      id,
      helperPath,
      file: launch.file,
      args: launch.args,
      cwd,
      error: serializeError(error)
    }, "error");
    throw error;
  }

  let finished = false;
  let stdoutBuffer = "";
  const session = {
    write: (data) => {
      if (finished) {
        return false;
      }
      try {
        return sendNativeTerminalCommand(child, {
          type: "input",
          data: Buffer.from(String(data || ""), "utf8").toString("base64")
        });
      } catch (error) {
        appendLogEvent("terminal.write.failed", {
          id,
          mode: "native-helper",
          activeMode: launch.activeMode,
          error: serializeError(error)
        }, "warn");
        return false;
      }
    },
    resize: (nextCols, nextRows) => {
      if (finished) {
        return false;
      }
      const safeCols = normalizeTerminalSize(nextCols, cols, 20, 240);
      const safeRows = normalizeTerminalSize(nextRows, rows, 6, 80);
      try {
        return sendNativeTerminalCommand(child, {
          type: "resize",
          cols: safeCols,
          rows: safeRows
        });
      } catch (error) {
        appendLogEvent("terminal.resize.failed", {
          id,
          mode: "native-helper",
          activeMode: launch.activeMode,
          cols: safeCols,
          rows: safeRows,
          error: serializeError(error)
        }, "warn");
        return false;
      }
    },
    kill: () => {
      if (finished) {
        return false;
      }
      try {
        sendNativeTerminalCommand(child, { type: "kill" });
        const killTimer = setTimeout(() => {
          if (!finished) {
            child.kill();
          }
        }, 500);
        if (typeof killTimer.unref === "function") {
          killTimer.unref();
        }
        return true;
      } catch (error) {
        appendLogEvent("terminal.kill.failed", {
          id,
          mode: "native-helper",
          activeMode: launch.activeMode,
          error: serializeError(error)
        }, "warn");
        return false;
      }
    },
    isAlive: () => !finished,
    mode: "native-helper",
    pid: child.pid,
    helperPid: child.pid,
    childPid: null,
    launch: {
      ...launch,
      launchMethod: launch.launchMethod ? `${launch.launchMethod}+native-helper` : "native-helper",
      nativeHelperPath: helperPath
    }
  };

  function finish(exitCode, source = "helper") {
    if (finished) {
      return;
    }
    finished = true;
    appendLogEvent("terminal.exited", {
      id,
      mode: "native-helper",
      activeMode: launch.activeMode,
      exitCode,
      source,
      helperPid: session.helperPid || null,
      childPid: session.childPid || null
    }, exitCode === 0 || exitCode === null ? "info" : "warn");
    terminalSessions.delete(id);
    sendTerminalExit(webContents, id, exitCode);
  }

  function handleNativeTerminalEvent(message) {
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "ready") {
      const childPid = Number(message.pid || 0);
      session.childPid = Number.isFinite(childPid) && childPid > 0 ? childPid : null;
      appendLogEvent("terminal.native-helper.ready", {
        id,
        helperPid: session.helperPid || null,
        childPid: session.childPid || null,
        activeMode: launch.activeMode,
        helperPath
      });
      return;
    }
    if (message.type === "data" && typeof message.data === "string") {
      const data = Buffer.from(message.data, "base64").toString("utf8");
      emitAgentOutputEvents(webContents, id, data, launch);
      sendTerminalData(webContents, id, data);
      return;
    }
    if (message.type === "error") {
      const text = sanitizeLogText(message.message || "native helper error", 1000);
      appendLogEvent("terminal.native-helper.error", {
        id,
        activeMode: launch.activeMode,
        message: text
      }, "warn");
      sendTerminalData(webContents, id, `\x1b[33mnative terminal helper: ${text}\x1b[0m\r\n`);
      return;
    }
    if (message.type === "exit") {
      finish(Number.isFinite(Number(message.exitCode)) ? Number(message.exitCode) : 0, "protocol");
    }
  }

  child.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      try {
        handleNativeTerminalEvent(JSON.parse(line));
      } catch (error) {
        appendLogEvent("terminal.native-helper.protocol.invalid", {
          id,
          line: sanitizeLogText(line, 1000),
          error: serializeError(error)
        }, "warn");
        sendTerminalData(webContents, id, `${line}\r\n`);
      }
    }
  });

  child.stderr.on("data", (chunk) => {
    appendLogEvent("terminal.native-helper.stderr", {
      id,
      activeMode: launch.activeMode,
      text: sanitizeLogText(chunk.toString("utf8"), 1000)
    }, "warn");
  });

  child.on("error", (error) => {
    appendLogEvent("terminal.native-helper.process.failed", {
      id,
      helperPath,
      activeMode: launch.activeMode,
      error: serializeError(error)
    }, "error");
    sendTerminalData(webContents, id, `\x1b[31mnative terminal helper failed: ${error.message}\x1b[0m\r\n`);
    finish("spawn-error", "helper-error");
  });

  child.on("exit", (code) => {
    finish(code, "helper-exit");
  });

  return session;
}

function createPtyTerminal(webContents, id, options, launch = resolveTerminalLaunch(options)) {
  const cwd = normalizeCwd(options.cwd);
  const cols = normalizeTerminalSize(options.cols, 80, 20, 240);
  const rows = normalizeTerminalSize(options.rows, 24, 6, 80);

  let ptyProcess;
  let exited = false;
  try {
    ptyProcess = nodePty.spawn(launch.file, launch.args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: launch.env
    });
  } catch (error) {
    appendLogEvent("terminal.spawn.failed", {
      id,
      mode: "pty",
      file: launch.file,
      args: launch.args,
      cwd,
      error: serializeError(error)
    }, "error");
    throw error;
  }

  ptyProcess.onData((data) => {
    emitAgentOutputEvents(webContents, id, data, launch);
    sendTerminalData(webContents, id, data);
  });
  ptyProcess.onExit(({ exitCode }) => {
    exited = true;
    appendLogEvent("terminal.exited", {
      id,
      mode: "pty",
      activeMode: launch.activeMode,
      exitCode
    }, exitCode === 0 ? "info" : "warn");
    terminalSessions.delete(id);
    sendTerminalExit(webContents, id, exitCode);
  });

  return {
    write: (data) => {
      if (exited) {
        return false;
      }
      try {
        ptyProcess.write(data);
        return true;
      } catch (error) {
        appendLogEvent("terminal.write.failed", {
          id,
          mode: "pty",
          activeMode: launch.activeMode,
          error: serializeError(error)
        }, "warn");
        return false;
      }
    },
    resize: (nextCols, nextRows) => {
      if (exited || !terminalSessions.has(id)) {
        return false;
      }
      const safeCols = normalizeTerminalSize(nextCols, cols, 20, 240);
      const safeRows = normalizeTerminalSize(nextRows, rows, 6, 80);
      try {
        ptyProcess.resize(safeCols, safeRows);
        return true;
      } catch (error) {
        appendLogEvent(isExitedPtyResizeError(error) ? "terminal.resize.ignored-after-exit" : "terminal.resize.failed", {
          id,
          mode: "pty",
          activeMode: launch.activeMode,
          cols: safeCols,
          rows: safeRows,
          error: serializeError(error)
        }, isExitedPtyResizeError(error) ? "warn" : "error");
        return false;
      }
    },
    kill: () => {
      if (exited) {
        return false;
      }
      try {
        ptyProcess.kill();
        return true;
      } catch (error) {
        appendLogEvent("terminal.kill.failed", {
          id,
          mode: "pty",
          activeMode: launch.activeMode,
          error: serializeError(error)
        }, "warn");
        return false;
      }
    },
    isAlive: () => !exited,
    mode: "pty",
    pid: ptyProcess.pid,
    launch
  };
}

function createTerminalSession(event, options = {}) {
  const id = typeof options.id === "string" ? options.id : randomUUID();
  const webContents = event.sender;
  terminalWebContents.set(id, webContents);
  const existingSession = terminalSessions.get(id);
  if (existingSession) {
    appendLogEvent("terminal.reattached", {
      id,
      mode: existingSession.mode,
      activeMode: existingSession.launch?.activeMode || "",
      transcriptLength: (terminalTranscripts.get(id) || "").length,
      sessionId: existingSession.launch?.agentSession?.sessionId || ""
    });
    return {
      id,
      mode: existingSession.mode,
      requestedMode: existingSession.launch?.requestedMode || "shell",
      activeMode: existingSession.launch?.activeMode || existingSession.mode || "shell",
      agentSession: existingSession.launch?.agentSession || null,
      reattached: true,
      transcript: terminalTranscripts.get(id) || ""
    };
  }

  const roleName = options.roleName || "角色终端";
  const cwd = normalizeCwd(options.cwd);
  const terminalMode = normalizeTerminalMode(options.terminalMode);
  const agentProvider = getEffectiveAgentProvider(options);
  const permissionPolicy = getAgentPermissionPolicy(options.agentPermissionMode);
  const requestedMode = {
    agent: `Agent(${getAgentProviderLabel(agentProvider)})`,
    shell: "PowerShell"
  }[terminalMode];
  appendLogEvent("terminal.create.requested", {
    id,
    roleName,
    cwd,
    terminalMode,
    agentProvider,
    permissionMode: permissionPolicy.id,
    permissionLabel: permissionPolicy.label,
    requestedMode,
    sessionId: options.agentSession?.sessionId || "",
    taskId: options.taskContext?.taskId || options.agentSession?.taskId || ""
  });

  sendTerminalData(
    webContents,
    id,
    `\x1b[32mCosS ${roleName} terminal\x1b[0m\r\n` +
      `工作目录: ${cwd}\r\n` +
      `请求模式: ${requestedMode}\r\n` +
      `权限模式: ${permissionPolicy.label}\r\n` +
      `会话 ID: ${options.agentSession?.sessionId || "shell"}\r\n` +
      "角色提示词、会话信息和任务上下文已写入 COSS_* 环境变量。\r\n\r\n"
  );

  if (terminalMode === "agent" && options.agentMcpAutoConfigEnabled === true) {
    const mcpConfigResult = writeProjectMcpConfig(null, {
      projectPath: cwd,
      projectId: options.projectId || options.agentSession?.projectId || ""
    });
    if (mcpConfigResult.ok) {
      sendTerminalData(webContents, id, `\x1b[32m已生成项目 MCP 配置: ${mcpConfigResult.rootConfigPath}\x1b[0m\r\n`);
    } else {
      sendTerminalData(webContents, id, `\x1b[33m项目 MCP 配置生成失败: ${mcpConfigResult.error}\x1b[0m\r\n`);
    }
  }

  if (process.env.COSS_DISABLE_TERMINAL_BACKEND === "1") {
    const mockSession = {
      write: (data) => sendTerminalData(webContents, id, data),
      resize: () => {},
      kill: () => {},
      mode: "mock",
      launch: {
        requestedMode: terminalMode,
        activeMode: "mock",
        permissionMode: permissionPolicy.id,
        permissionLabel: permissionPolicy.label
      }
    };
    terminalSessions.set(id, mockSession);
    appendLogEvent("terminal.create.mock", {
      id,
      roleName,
      requestedMode: mockSession.launch.requestedMode,
      activeMode: "mock"
    }, "warn");
    sendTerminalData(webContents, id, "\x1b[33m当前环境已关闭真实终端后端。\x1b[0m\r\n");
    return {
      id,
      mode: "mock",
      requestedMode: mockSession.launch.requestedMode,
      activeMode: "mock"
    };
  }

  const launch = resolveTerminalLaunch({ ...options, cwd });
  launch.permissionMode = permissionPolicy.id;
  launch.permissionLabel = permissionPolicy.label;
  launch.roleId = options.roleId || "";
  launch.roleName = options.roleName || "";
  launch.projectId = options.projectId || options.agentSession?.projectId || "";
  launch.projectName = options.projectName || options.agentSession?.projectName || "";
  launch.agentSession = options.agentSession || {};
  launch.taskContext = options.taskContext || {};
  if (launch.activeMode === "error") {
    const staticSession = {
      write: () => {},
      resize: () => {},
      kill: () => {},
      mode: "static",
      launch
    };
    terminalSessions.set(id, staticSession);
    if (launch.warning) {
      sendTerminalData(webContents, id, `\x1b[31m${launch.warning}\x1b[0m\r\n`);
    }
    appendLogEvent("terminal.create.static-error", {
      id,
      roleName,
      requestedMode: launch.requestedMode || "agent",
      activeMode: launch.activeMode,
      warning: sanitizeLogText(launch.warning, 500)
    }, "error");
    return {
      id,
      mode: "static",
      requestedMode: launch.requestedMode || "agent",
      activeMode: launch.activeMode
    };
  }

  let session;
  if (shouldUsePipeTerminalBackend(launch)) {
    session = createPipeTerminal(webContents, id, { ...options, cwd }, launch);
  }
  if (!session && shouldUseNativeTerminalBackend(launch)) {
    try {
      session = createNativeTerminal(webContents, id, { ...options, cwd }, launch);
    } catch (error) {
      appendLogEvent("terminal.native-helper.failed", {
        id,
        roleName,
        launch: {
          file: launch.file,
          args: launch.args,
          activeMode: launch.activeMode,
          requestedMode: launch.requestedMode
        },
        error: serializeError(error)
      }, "warn");
      sendTerminalData(
        webContents,
        id,
        `\x1b[33mnative terminal helper 启动失败，已切换到 node-pty: ${error.message}\x1b[0m\r\n`
      );
    }
  }
  if (!session) {
    try {
      if (!nodePty) {
        throw new Error("node-pty is unavailable");
      }
      session = createPtyTerminal(webContents, id, { ...options, cwd }, launch);
    } catch (error) {
      appendLogEvent("terminal.pty.failed", {
        id,
        roleName,
        launch: {
          file: launch.file,
          args: launch.args,
          activeMode: launch.activeMode,
          requestedMode: launch.requestedMode
        },
        error: serializeError(error)
      }, "warn");
      sendTerminalData(
        webContents,
        id,
        `\x1b[33mnode-pty 启动失败，已切换到兼容终端: ${error.message}\x1b[0m\r\n`
      );
      session = createPipeTerminal(webContents, id, { ...options, cwd }, launch);
    }
  }

  if (session.launch?.warning) {
    sendTerminalData(webContents, id, `\x1b[33m${session.launch.warning}\x1b[0m\r\n\r\n`);
  }

  if (session.launch?.claudeConfig?.error) {
    sendTerminalData(
      webContents,
      id,
      `\x1b[33mClaude Code 首次启动配置写入失败: ${session.launch.claudeConfig.error}\x1b[0m\r\n`
    );
  } else if (session.launch?.claudeConfig?.changed) {
    sendTerminalData(webContents, id, "\x1b[32m已自动完成 Claude Code 首次启动配置。\x1b[0m\r\n");
  }

  terminalSessions.set(id, session);
  appendLogEvent("terminal.create.succeeded", {
    id,
    roleName,
    mode: session.mode,
    requestedMode: session.launch?.requestedMode || "shell",
    activeMode: session.launch?.activeMode || "shell",
    file: session.launch?.file || "",
    launchMethod: session.launch?.launchMethod || "",
    scriptPath: session.launch?.scriptPath || "",
    pid: session.pid || null,
    helperPid: session.helperPid || null,
    childPid: session.childPid || null,
    sessionId: session.launch?.agentSession?.sessionId || "",
    taskId: session.launch?.taskContext?.taskId || session.launch?.agentSession?.taskId || ""
  });
  scheduleTerminalProcessTreeSnapshots(id, session, roleName);

  if (session.launch?.installCommand) {
    try {
      session.write(`${session.launch.installCommand}\r`);
    } catch (error) {
      appendLogEvent("terminal.install-command.failed", {
        id,
        installCommand: session.launch.installCommand,
        error: serializeError(error)
      }, "error");
      sendTerminalData(webContents, id, `\x1b[31m自动执行安装命令失败: ${error.message}\x1b[0m\r\n`);
    }
  }

  return {
    id,
    mode: session.mode,
    requestedMode: session.launch?.requestedMode || "shell",
    activeMode: session.launch?.activeMode || "shell",
    agentSession: session.launch?.agentSession || null
  };
}

function disposeTerminalSession(id) {
  const session = terminalSessions.get(id);
  if (!session) {
    return false;
  }

  terminalSessions.delete(id);
  terminalTranscripts.delete(id);
  terminalWebContents.delete(id);
  agentOutputEventKeys.delete(id);
  try {
    session.kill();
    killProcessTree(session.pid);
    appendLogEvent("terminal.dispose.succeeded", {
      id,
      mode: session.mode,
      activeMode: session.launch?.activeMode || "",
      pid: session.pid || null
    });
  } catch (error) {
    killProcessTree(session.pid);
    console.warn(`Failed to kill terminal session ${id}`, error);
    appendLogEvent("terminal.dispose.failed", {
      id,
      mode: session.mode,
      pid: session.pid || null,
      error: serializeError(error)
    }, "error");
  }
  return true;
}

function disposeAllTerminalSessions() {
  Array.from(terminalSessions.keys()).forEach((id) => disposeTerminalSession(id));
  agentOutputEventKeys.clear();
}

async function selectProjectDirectory(event, currentPath) {
  if (process.env.COSS_MOCK_PROJECT_DIRECTORY) {
    appendLogEvent("project.directory.mock-selected", { path: process.env.COSS_MOCK_PROJECT_DIRECTORY });
    return { ok: true, path: process.env.COSS_MOCK_PROJECT_DIRECTORY };
  }

  const owner = BrowserWindow.fromWebContents(event.sender) || getTargetWindow();
  const defaultPath = currentPath && fs.existsSync(currentPath) ? currentPath : app.getPath("documents");
  const options = {
    title: "选择项目保存路径",
    defaultPath,
    properties: ["openDirectory", "createDirectory"]
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || !result.filePaths?.[0]) {
    appendLogEvent("project.directory.selection-canceled");
    return { ok: false, canceled: true };
  }

  appendLogEvent("project.directory.selected", { path: result.filePaths[0] });
  return { ok: true, path: result.filePaths[0] };
}

async function openLogDirectory() {
  const logDirectory = getLogDirectory();
  fs.mkdirSync(logDirectory, { recursive: true });
  appendLogEvent("logs.open-directory", { path: logDirectory });

  if (process.env.COSS_DISABLE_OPEN_LOG_DIR === "1") {
    return { ok: true, path: logDirectory, skipped: true };
  }

  const error = await shell.openPath(logDirectory);
  if (error) {
    appendLogEvent("logs.open-directory.failed", { path: logDirectory, error }, "error");
  }
  return { ok: !error, path: logDirectory, error };
}

function isPathInside(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function getProjectRoot(projectPath) {
  const root = path.resolve(String(projectPath || ""));
  if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error("项目目录不存在或不可访问。");
  }
  return root;
}

function getProjectFileTarget(projectPath, filePath) {
  const root = getProjectRoot(projectPath);
  const rawFilePath = String(filePath || "").trim();
  if (!rawFilePath) {
    throw new Error("文件路径为空。");
  }
  const target = path.resolve(path.isAbsolute(rawFilePath) ? rawFilePath : path.join(root, rawFilePath));
  if (!isPathInside(root, target)) {
    throw new Error("文件路径超出当前项目目录，已阻止访问。");
  }
  return {
    root,
    target,
    relativePath: path.relative(root, target)
  };
}

function isLikelyTextFile(filePath, size) {
  if (size > maxEditableFileBytes) {
    return false;
  }
  const textExtensions = new Set([
    ".txt", ".md", ".json", ".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".css", ".html", ".xml",
    ".yml", ".yaml", ".toml", ".ini", ".env", ".gitignore", ".py", ".ps1", ".bat", ".cmd", ".sh",
    ".java", ".kt", ".go", ".rs", ".cs", ".cpp", ".c", ".h", ".sql", ".csv", ".log"
  ]);
  const basename = path.basename(filePath).toLowerCase();
  const extension = path.extname(filePath).toLowerCase();
  return textExtensions.has(extension) || textExtensions.has(basename) || extension === "";
}

function listProjectFiles(_event, projectPath) {
  try {
    const root = getProjectRoot(projectPath);
    const skippedDirectories = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", "test-results"]);
    const files = [];

    function visit(directory, depth = 0) {
      if (files.length >= fileListLimit || depth > 3) {
        return;
      }
      const entries = fs.readdirSync(directory, { withFileTypes: true })
        .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

      entries.forEach((entry) => {
        if (files.length >= fileListLimit) {
          return;
        }
        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.relative(root, absolutePath);
        if (entry.isDirectory()) {
          if (!skippedDirectories.has(entry.name)) {
            files.push({
              name: entry.name,
              path: relativePath,
              type: "directory",
              size: 0,
              modifiedAt: fs.statSync(absolutePath).mtime.toISOString()
            });
          }
          if (!skippedDirectories.has(entry.name)) {
            visit(absolutePath, depth + 1);
          }
          return;
        }
        if (!entry.isFile()) {
          return;
        }
        const stat = fs.statSync(absolutePath);
        if (!isLikelyTextFile(absolutePath, stat.size)) {
          return;
        }
        files.push({
          name: entry.name,
          path: relativePath,
          type: "file",
          size: stat.size,
          modifiedAt: stat.mtime.toISOString()
        });
      });
    }

    visit(root);
    appendLogEvent("files.listed", { projectPath: root, count: files.length });
    return { ok: true, root, files, truncated: files.length >= fileListLimit };
  } catch (error) {
    appendLogEvent("files.list.failed", { projectPath, error: serializeError(error) }, "error");
    return { ok: false, error: error.message, files: [] };
  }
}

function readProjectFile(_event, request = {}) {
  try {
    const { root, target, relativePath } = getProjectFileTarget(request.projectPath, request.filePath);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      throw new Error("文件不存在。");
    }
    const stat = fs.statSync(target);
    if (!isLikelyTextFile(target, stat.size)) {
      throw new Error("文件过大或不是可编辑文本文件。");
    }
    const content = fs.readFileSync(target, "utf8");
    appendLogEvent("file.read", { projectPath: root, path: relativePath, size: stat.size });
    return {
      ok: true,
      path: relativePath,
      absolutePath: target,
      content,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    };
  } catch (error) {
    appendLogEvent("file.read.failed", {
      projectPath: request.projectPath,
      path: request.filePath,
      error: serializeError(error)
    }, "error");
    return { ok: false, error: error.message };
  }
}

function writeProjectFile(_event, request = {}) {
  try {
    const content = String(request.content || "");
    if (Buffer.byteLength(content, "utf8") > maxEditableFileBytes) {
      throw new Error("文件内容超过 2MB，已阻止保存。");
    }
    const { root, target, relativePath } = getProjectFileTarget(request.projectPath, request.filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");
    const stat = fs.statSync(target);
    appendLogEvent("file.saved", { projectPath: root, path: relativePath, size: stat.size });
    return {
      ok: true,
      path: relativePath,
      absolutePath: target,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    };
  } catch (error) {
    appendLogEvent("file.save.failed", {
      projectPath: request.projectPath,
      path: request.filePath,
      error: serializeError(error)
    }, "error");
    return { ok: false, error: error.message };
  }
}

function createProjectFolder(_event, request = {}) {
  try {
    const { root, target, relativePath } = getProjectFileTarget(request.projectPath, request.folderPath);
    fs.mkdirSync(target, { recursive: true });
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      throw new Error("目标路径不是文件夹。");
    }
    appendLogEvent("file.folder.created", { projectPath: root, path: relativePath });
    return { ok: true, path: relativePath, absolutePath: target };
  } catch (error) {
    appendLogEvent("file.folder.create.failed", {
      projectPath: request.projectPath,
      path: request.folderPath,
      error: serializeError(error)
    }, "error");
    return { ok: false, error: error.message };
  }
}

function renameProjectFile(_event, request = {}) {
  try {
    const from = getProjectFileTarget(request.projectPath, request.fromPath);
    const to = getProjectFileTarget(request.projectPath, request.toPath);
    if (!fs.existsSync(from.target)) {
      throw new Error("源路径不存在。");
    }
    if (fs.existsSync(to.target)) {
      throw new Error("目标路径已存在。");
    }
    fs.mkdirSync(path.dirname(to.target), { recursive: true });
    fs.renameSync(from.target, to.target);
    appendLogEvent("file.renamed", { projectPath: from.root, from: from.relativePath, to: to.relativePath });
    return { ok: true, fromPath: from.relativePath, path: to.relativePath, absolutePath: to.target };
  } catch (error) {
    appendLogEvent("file.rename.failed", {
      projectPath: request.projectPath,
      from: request.fromPath,
      to: request.toPath,
      error: serializeError(error)
    }, "error");
    return { ok: false, error: error.message };
  }
}

function deleteProjectFile(_event, request = {}) {
  try {
    const { root, target, relativePath } = getProjectFileTarget(request.projectPath, request.filePath);
    if (!fs.existsSync(target)) {
      throw new Error("目标路径不存在。");
    }
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
    } else {
      fs.unlinkSync(target);
    }
    appendLogEvent("file.deleted", { projectPath: root, path: relativePath, type: stat.isDirectory() ? "directory" : "file" });
    return { ok: true, path: relativePath };
  } catch (error) {
    appendLogEvent("file.delete.failed", {
      projectPath: request.projectPath,
      path: request.filePath,
      error: serializeError(error)
    }, "error");
    return { ok: false, error: error.message };
  }
}

async function selectProjectFile(event, request = {}) {
  try {
    const root = getProjectRoot(request.projectPath);
    const owner = BrowserWindow.fromWebContents(event.sender) || getTargetWindow();
    const defaultPath = request.currentPath
      ? getProjectFileTarget(root, request.currentPath).target
      : root;
    const options = {
      title: "选择项目文件",
      defaultPath,
      properties: ["openFile"]
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths?.[0]) {
      appendLogEvent("file.selection-canceled", { projectPath: root });
      return { ok: false, canceled: true };
    }
    const target = getProjectFileTarget(root, result.filePaths[0]);
    appendLogEvent("file.selected", { projectPath: root, path: target.relativePath });
    return { ok: true, path: target.relativePath, absolutePath: target.target };
  } catch (error) {
    appendLogEvent("file.selection.failed", {
      projectPath: request.projectPath,
      currentPath: request.currentPath,
      error: serializeError(error)
    }, "error");
    return { ok: false, error: error.message };
  }
}

function createAppMenu() {
  const template = [
    {
      label: "文件",
      submenu: [
        {
          label: "新建窗口",
          accelerator: "Ctrl+N",
          click: () => {
            appendLogEvent("menu.new-window");
            createMainWindow();
          }
        },
        {
          label: "新建任务",
          accelerator: "Ctrl+Shift+T",
          click: () => sendMenuAction("show-create-task")
        },
        {
          label: "新建项目",
          accelerator: "Ctrl+Shift+N",
          click: () => sendMenuAction("show-create-project")
        },
        { type: "separator" },
        {
          label: "设置",
          accelerator: "Ctrl+,",
          click: () => sendMenuAction("show-settings")
        },
        { type: "separator" },
        {
          label: "关闭窗口",
          accelerator: "Ctrl+W",
          role: "close"
        }
      ]
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销(&U)", accelerator: "Ctrl+Z", role: "undo" },
        { label: "重做(&R)", accelerator: "Ctrl+Y", role: "redo" },
        { type: "separator" },
        { label: "剪切(&T)", accelerator: "Ctrl+X", role: "cut" },
        { label: "复制(&C)", accelerator: "Ctrl+C", role: "copy" },
        { label: "粘贴(&P)", accelerator: "Ctrl+V", role: "paste" },
        { type: "separator" },
        { label: "全选(&A)", accelerator: "Ctrl+A", role: "selectAll" }
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "打开日志目录",
          click: () => {
            openLogDirectory().catch((error) => appendLogEvent("logs.open-directory.failed", { error: error.message }, "error"));
          }
        },
        {
          label: "关于 CosS",
          click: () => sendMenuAction("show-about")
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getWindowFromEvent(event) {
  return BrowserWindow.fromWebContents(event.sender) || getTargetWindow();
}

function controlWindow(event, action) {
  const win = getWindowFromEvent(event);
  if (!win || win.isDestroyed()) {
    return { ok: false };
  }

  if (action === "minimize") {
    win.minimize();
    return { ok: true };
  }

  if (action === "toggle-maximize") {
    if (win.isMaximized()) {
      win.unmaximize();
      return { ok: true, maximized: false };
    }
    win.maximize();
    return { ok: true, maximized: true };
  }

  if (action === "close") {
    win.close();
    return { ok: true };
  }

  return { ok: false };
}

function isAllowedEmbeddedBrowserUrl(rawUrl) {
  try {
    const url = new URL(rawUrl || "about:blank");
    return new Set(["http:", "https:", "file:", "data:", "about:"]).has(url.protocol);
  } catch {
    return false;
  }
}

function attachEmbeddedBrowserPopupPolicy(contents) {
  if (!contents || typeof contents.setWindowOpenHandler !== "function") {
    return;
  }

  const redirectToHostBrowser = (url) => {
    const hostContents = contents.hostWebContents;
    if (hostContents && !hostContents.isDestroyed?.()) {
      hostContents.send("browser:open-url", { url, source: "webview-popup" });
      return;
    }

    contents.loadURL(url).catch((error) => {
      appendLogEvent("browser.webview.window-open.redirect.failed", { url, error: serializeError(error) }, "error");
    });
  };

  contents.setWindowOpenHandler(({ url }) => {
    if (!isAllowedEmbeddedBrowserUrl(url)) {
      appendLogEvent("browser.webview.window-open.blocked", { url, reason: "protocol" }, "warn");
      return { action: "deny" };
    }

    appendLogEvent("browser.webview.window-open.redirected", { url });
    redirectToHostBrowser(url);
    return { action: "deny" };
  });

  contents.on("did-create-window", (childWindow, details = {}) => {
    const url = details.url || "";
    appendLogEvent("browser.webview.created-window.closed", { url });
    if (isAllowedEmbeddedBrowserUrl(url)) {
      redirectToHostBrowser(url);
    }
    if (childWindow && !childWindow.isDestroyed()) {
      childWindow.destroy();
    }
  });
}

function createMainWindow() {
  creatingCosSMainWindow = true;
  const iconPath = getAppIconPath();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1040,
    minHeight: 680,
    title: "CosS",
    frame: false,
    ...(iconPath ? { icon: iconPath } : {}),
    backgroundColor: "#dfe8f7",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true
    }
  });
  creatingCosSMainWindow = false;
  cossMainWindowIds.add(win.id);
  win.on("closed", () => cossMainWindowIds.delete(win.id));

  win.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    try {
      if (!isAllowedEmbeddedBrowserUrl(params.src || "about:blank")) {
        event.preventDefault();
        appendLogEvent("browser.webview.blocked", { src: params.src || "", reason: "protocol" }, "warn");
        return;
      }
    } catch (error) {
      event.preventDefault();
      appendLogEvent("browser.webview.blocked", { src: params.src || "", error: serializeError(error) }, "warn");
      return;
    }

    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.allowRunningInsecureContent = false;
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedEmbeddedBrowserUrl(url)) {
      appendLogEvent("browser.window-open.redirected", { url });
      win.webContents.send(IPC_EVENTS.BROWSER_OPEN_URL, { url });
      return { action: "deny" };
    }
    appendLogEvent("browser.window-open.blocked", { url, reason: "protocol" }, "warn");
    return { action: "deny" };
  });
  win.webContents.on("did-create-window", (childWindow, details = {}) => {
    const url = details.url || "";
    appendLogEvent("browser.created-window.closed", { url });
    if (isAllowedEmbeddedBrowserUrl(url)) {
      win.webContents.send(IPC_EVENTS.BROWSER_OPEN_URL, { url });
    }
    if (childWindow && !childWindow.isDestroyed()) {
      childWindow.destroy();
    }
  });

  win.setAutoHideMenuBar(true);
  win.setMenuBarVisibility(false);
  win.on("maximize", () => win.webContents.send(IPC_EVENTS.WINDOW_MAXIMIZED, true));
  win.on("unmaximize", () => win.webContents.send(IPC_EVENTS.WINDOW_MAXIMIZED, false));
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("CosS.Desktop");
  }
  app.on("browser-window-created", (_event, createdWindow) => {
    if (creatingCosSMainWindow || cossMainWindowIds.has(createdWindow.id)) {
      return;
    }
    appendLogEvent("browser.popup-window.closed", {
      id: createdWindow.id,
      title: createdWindow.getTitle?.() || "",
      url: createdWindow.webContents?.getURL?.() || ""
    }, "warn");
    if (!createdWindow.isDestroyed()) {
      createdWindow.destroy();
    }
  });
  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType?.() === "webview") {
      attachEmbeddedBrowserPopupPolicy(contents);
      return;
    }

    if (contents.getType?.() === "window") {
      setTimeout(() => {
        const popupWindow = BrowserWindow.fromWebContents(contents);
        if (!popupWindow || popupWindow.isDestroyed() || cossMainWindowIds.has(popupWindow.id)) {
          return;
        }
        appendLogEvent("browser.popup-webcontents.closed", {
          id: popupWindow.id,
          title: popupWindow.getTitle?.() || "",
          url: contents.getURL?.() || ""
        }, "warn");
        popupWindow.destroy();
      }, 0);
    }
  });
  createAppMenu();
  appendLogEvent("app.ready", {
    userData: app.getPath("userData"),
    logDirectory: getLogDirectory(),
    architectureVersion: ARCHITECTURE_VERSION,
    stateSchemaVersion: STATE_SCHEMA_VERSION
  });
  ipcMain.handle(IPC_CHANNELS.STATE_LOAD, () => readState());
  ipcMain.handle(IPC_CHANNELS.STATE_SAVE, async (_event, state) => {
    try {
      const durableState = await readState();
      const mergedState = mergeStateForRendererSave(state, durableState);
      const result = await writeState(mergedState);
      appendLogEvent("state.saved", {
        projects: Array.isArray(mergedState?.projects) ? mergedState.projects.length : 0,
        mergedDurableState: Boolean(durableState?.projects?.length)
      });
      return result;
    } catch (error) {
      appendLogEvent("state.save.failed", {
        projects: Array.isArray(state?.projects) ? state.projects.length : 0,
        error: serializeError(error)
      }, "error");
      throw error;
    }
  });
  ipcMain.handle(IPC_CHANNELS.LLM_PLAN_TASK, handlePlanTask);
  ipcMain.handle(IPC_CHANNELS.LLM_TEST_MODEL, handleTestModelConnectivity);
  ipcMain.handle("app:info", () => ({
    version: appVersion,
    logDirectory: getLogDirectory(),
    userData: app.getPath("userData"),
    mcp: getMcpServerInfo()
  }));
  ipcMain.handle("app:open-external-url", async (_event, url) => {
    const targetUrl = new URL(String(url || ""));
    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      throw new Error("仅支持打开 HTTP/HTTPS 链接。");
    }
    await shell.openExternal(targetUrl.toString());
    appendLogEvent("app.open-external-url", { url: targetUrl.toString() });
    return { ok: true };
  });
  ipcMain.handle("app:log-event", (_event, eventName, payload = {}, level = "info") => appendLogEvent(eventName, payload, level));
  ipcMain.handle("logs:open-directory", () => openLogDirectory());
  registerIpcHandlers(ipcMain, {
    [IPC_CHANNELS.STATE_META]: () => getStateMeta()
  });
  ipcMain.handle("mcp:info", (_event, context = {}) => getMcpServerInfo(context));
  ipcMain.handle("mcp:check-project-config", checkProjectMcpConfig);
  ipcMain.handle("mcp:write-project-config", writeProjectMcpConfig);
  ipcMain.handle("mcp:audit-events", readMcpAuditEvents);
  ipcMain.handle(IPC_CHANNELS.STORAGE_INFO, () => getStorageInfo());
  ipcMain.handle(IPC_CHANNELS.STORAGE_BACKUP, () => createManualStateBackup());
  ipcMain.handle("storage:export", exportStorageState);
  ipcMain.handle("storage:import", importStorageState);
  ipcMain.handle("storage:diagnostics", exportDiagnosticsPackage);
  ipcMain.handle("storage:open-directory", () => openStorageDirectory());
  ipcMain.handle("dialog:select-project-directory", selectProjectDirectory);
  ipcMain.handle("dialog:select-project-file", selectProjectFile);
  ipcMain.handle("files:list", listProjectFiles);
  ipcMain.handle("files:read", readProjectFile);
  ipcMain.handle("files:write", writeProjectFile);
  ipcMain.handle("files:create-folder", createProjectFolder);
  ipcMain.handle("files:rename", renameProjectFile);
  ipcMain.handle("files:delete", deleteProjectFile);
  ipcMain.handle("window:new", () => {
    appendLogEvent("window.new");
    createMainWindow();
    return { ok: true };
  });
  ipcMain.handle("window:control", controlWindow);
  ipcMain.handle("window:is-maximized", (event) => Boolean(getWindowFromEvent(event)?.isMaximized()));
  ipcMain.handle("claude:status", () => {
    const status = getClaudeCodeStatus();
    appendLogEvent("agent.claude.status.checked", {
      installed: Boolean(status.installed),
      command: status.command || "",
      version: sanitizeLogText(status.version, 80),
      installCommand: status.installCommand || "",
      onboardingConfigured: Boolean(status.onboarding?.configured),
      authLoggedIn: Boolean(status.auth?.loggedIn),
      authSource: status.auth?.source || "",
      errorDetail: sanitizeLogText(status.versionError, 300)
    }, status.installed ? "info" : "warn");
    return status;
  });
  ipcMain.handle("codex:status", () => {
    const status = getCodexCommandStatus();
    appendLogEvent("agent.codex.status.checked", {
      runnable: Boolean(status.runnable),
      command: status.command || "",
      requestedCommand: status.requestedCommand || "",
      version: sanitizeLogText(status.version, 80),
      npmUsable: Boolean(status.npm?.usable),
      npmCommand: status.npm?.command || "",
      authLoggedIn: Boolean(status.auth?.loggedIn),
      authSource: status.auth?.source || "",
      autoInstallDisabled: Boolean(status.autoInstallDisabled),
      errorDetail: sanitizeLogText(status.errorDetail, 300)
    }, status.runnable ? "info" : "warn");
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.WORLD_AGENT_RUN, handleWorldAgentRun);
  ipcMain.handle("codebuddy:status", (_event, request = {}) => {
    const apiKey = typeof request === "object" && request !== null ? String(request.apiKey || "").trim() : "";
    const status = getCodeBuddyCommandStatus(getShellEnv(apiKey ? { CODEBUDDY_API_KEY: apiKey } : {}));
    appendLogEvent("agent.codebuddy.status.checked", {
      runnable: Boolean(status.runnable),
      command: status.command || "",
      requestedCommand: status.requestedCommand || "",
      version: sanitizeLogText(status.version, 80),
      npmUsable: Boolean(status.npm?.usable),
      npmCommand: status.npm?.command || "",
      authLoggedIn: Boolean(status.auth?.loggedIn),
      authSource: status.auth?.source || "",
      autoInstallDisabled: Boolean(status.autoInstallDisabled),
      errorDetail: sanitizeLogText(status.errorDetail, 300)
    }, status.runnable ? "info" : "warn");
    return status;
  });
  ipcMain.handle("agent:install-claude", async () => {
    const env = getWindowsShellEnv();
    const installCommand = `winget install ${claudeCodeWingetPackage} --silent --accept-package-agreements`;
    try {
      const result = childProcess.spawnSync("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-Command", installCommand
      ], { encoding: "utf8", env, timeout: 300000, windowsHide: true });
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
      const ok = result.status === 0;
      appendLogEvent("agent.install.claude", { ok, output: sanitizeLogText(output, 500) }, ok ? "info" : "warn");
      return { ok, output, installCommand };
    } catch (error) {
      appendLogEvent("agent.install.claude", { ok: false, error: serializeError(error) }, "error");
      return { ok: false, error: error.message, installCommand };
    }
  });
  ipcMain.handle("agent:install-codex", async () => {
    const env = getWindowsShellEnv();
    const npmCommand = getNpmCommand();
    const command = buildPowerShellInvocation(npmCommand, ["install", "-g", codexNpmPackage]);
    try {
      const result = childProcess.spawnSync("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-Command", command
      ], { encoding: "utf8", env, timeout: 300000, windowsHide: true });
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
      const ok = result.status === 0;
      appendLogEvent("agent.install.codex", { ok, output: sanitizeLogText(output, 500) }, ok ? "info" : "warn");
      return { ok, output, installCommand: getCodexInstallCommand(npmCommand) };
    } catch (error) {
      appendLogEvent("agent.install.codex", { ok: false, error: serializeError(error) }, "error");
      return { ok: false, error: error.message, installCommand: getCodexInstallCommand(npmCommand) };
    }
  });
  ipcMain.handle("agent:install-codebuddy", async () => {
    const env = getWindowsShellEnv();
    const npmCommand = getNpmCommand();
    const command = buildPowerShellInvocation(npmCommand, ["install", "-g", codeBuddyNpmPackage]);
    try {
      const result = childProcess.spawnSync("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-Command", command
      ], { encoding: "utf8", env, timeout: 300000, windowsHide: true });
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
      const ok = result.status === 0;
      appendLogEvent("agent.install.codebuddy", { ok, output: sanitizeLogText(output, 500) }, ok ? "info" : "warn");
      return { ok, output, installCommand: getCodeBuddyInstallCommand(npmCommand) };
    } catch (error) {
      appendLogEvent("agent.install.codebuddy", { ok: false, error: serializeError(error) }, "error");
      return { ok: false, error: error.message, installCommand: getCodeBuddyInstallCommand(npmCommand) };
    }
  });
  ipcMain.handle("agent:login-test", testAgentRemoteLogin);
  ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, createTerminalSession);
  ipcMain.handle("terminal:input", (event, id, data, options = {}) => {
    const session = terminalSessions.get(id);
    if (session && typeof data === "string") {
      try {
        const guardResult = processTerminalPermissionGuard(event.sender, id, session, data, options);
        if (!guardResult.ok) {
          return false;
        }
        session.write(data);
        return true;
      } catch (error) {
        console.warn(`Failed to write to terminal session ${id}`, error);
        appendLogEvent("terminal.input.failed", { id, error: serializeError(error) }, "error");
      }
    }
    return false;
  });
  ipcMain.handle("terminal:resize", (_event, id, cols, rows) => {
    const session = terminalSessions.get(id);
    if (session) {
      try {
        const resized = session.resize(cols, rows);
        return resized !== false;
      } catch (error) {
        console.warn(`Failed to resize terminal session ${id}`, error);
        appendLogEvent("terminal.resize.failed", { id, cols, rows, error: serializeError(error) }, "error");
      }
    }
    return false;
  });
  ipcMain.handle(IPC_CHANNELS.TERMINAL_DISPOSE, (_event, id) => disposeTerminalSession(id));

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  disposeAllTerminalSessions();
});

app.on("window-all-closed", () => {
  disposeAllTerminalSessions();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
