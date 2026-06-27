const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require("electron");
const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs");
const childProcess = require("child_process");

let nodePty = null;

try {
  nodePty = require("node-pty");
} catch (error) {
  console.warn("node-pty is unavailable, falling back to pipe-based shells.", error);
}

const dataFileName = "coss-workspace-state.json";
const appVersion = (() => {
  try {
    return require("../package.json").version;
  } catch {
    return "0.5.2";
  }
})();
const terminalSessions = new Map();
const agentOutputEventKeys = new Map();
const claudeCodeWingetPackage = "Anthropic.ClaudeCode";
const codexNpmPackage = "@openai/codex";
const defaultLlmRequestTimeoutMs = 60000;
const maxEditableFileBytes = 1024 * 1024 * 2;
const fileListLimit = 240;
let windowsEnvCache = null;

if (process.env.COSS_TEST_USER_DATA) {
  app.setPath("userData", process.env.COSS_TEST_USER_DATA);
}

function getDataFilePath() {
  return path.join(app.getPath("userData"), dataFileName);
}

function getLogDirectory() {
  return process.env.COSS_LOG_DIR || path.join(app.getPath("userData"), "logs");
}

function getLogFilePath(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return path.join(getLogDirectory(), `coss-${day}.jsonl`);
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
  return {
    message: error?.message || String(error || "unknown error"),
    stack: typeof error?.stack === "string" ? error.stack.split("\n").slice(0, 8).join("\n") : ""
  };
}

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
    timeoutMs: getLlmRequestTimeoutMs(),
    model: summarizeModelConfig(request.model || {})
  };
}

function getTargetWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function sendMenuAction(action, payload = {}) {
  const win = getTargetWindow();
  if (!win || win.isDestroyed()) {
    return;
  }

  appendLogEvent("menu.action", { action });
  win.webContents.send("app-menu:action", { action, payload });
}

function getClaudeConfigPath() {
  return process.env.COSS_CLAUDE_CONFIG_PATH || path.join(app.getPath("home"), ".claude.json");
}

function readState() {
  const filePath = getDataFilePath();
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error("Failed to read workspace state", error);
    appendLogEvent("state.read.failed", { filePath, error: serializeError(error) }, "error");
    return null;
  }
}

function writeState(state) {
  const filePath = getDataFilePath();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
    return true;
  } catch (error) {
    appendLogEvent("state.write.failed", { filePath, error: serializeError(error) }, "error");
    throw error;
  }
}

function sanitizeLlmText(value, maxLength = 220) {
  return sanitizeLogText(value, maxLength);
}

function extractJsonObjectLegacy(text) {
  const source = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("模型未返回可解析的 JSON 对象。");
  }

  return JSON.parse(source.slice(start, end + 1));
}

function stripJsonCodeFence(text) {
  return String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function findBalancedJsonObject(source) {
  const start = source.indexOf("{");
  if (start === -1) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaping) {
        escaping = false;
      } else if (char === "\\") {
        escaping = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return "";
}

function extractJsonObject(text) {
  const source = stripJsonCodeFence(text);
  if (!source) {
    throw new Error("模型未返回可解析的 JSON 对象。");
  }

  try {
    return JSON.parse(source);
  } catch {
    // Many LLMs append notes after JSON; recover by reading the first complete object.
  }

  const candidate = findBalancedJsonObject(source);
  if (!candidate) {
    throw new Error(`模型未返回完整 JSON 对象。响应片段：${sanitizeLogText(source, 240)}`);
  }

  try {
    return JSON.parse(candidate);
  } catch (error) {
    throw new Error(`模型 JSON 解析失败：${error.message}。响应片段：${sanitizeLogText(source, 240)}`);
  }
}

function normalizePlannerResult(payload, roles = []) {
  const allowedRoles = new Set(roles.map((role) => role.id));
  const fallbackRole = roles[0]?.id || "product-manager";
  const placeholderTexts = new Set(["一句话总结", "子任务标题", "子任务描述", "角色ID", "协作消息"]);
  const isPlaceholder = (value) => placeholderTexts.has(String(value || "").trim());
  const subtasks = (Array.isArray(payload?.subtasks) ? payload.subtasks : [])
    .map((item) => ({
      roleId: allowedRoles.has(item?.roleId) ? item.roleId : fallbackRole,
      title: sanitizeLlmText(item?.title, 60),
      description: sanitizeLlmText(item?.description, 240)
    }))
    .filter((item) => item.title && item.description && !isPlaceholder(item.title) && !isPlaceholder(item.description))
    .slice(0, 8);

  if (subtasks.length < 3) {
    throw new Error(`模型返回的 subtasks 少于 3 个，或返回了格式占位词。有效子任务数：${subtasks.length}。`);
  }

  const messages = (Array.isArray(payload?.messages) ? payload.messages : [])
    .map((item) => ({
      fromRoleId: allowedRoles.has(item?.fromRoleId) ? item.fromRoleId : fallbackRole,
      toRoleIds: Array.isArray(item?.toRoleIds)
        ? item.toRoleIds.filter((roleId) => allowedRoles.has(roleId)).slice(0, 6)
        : [],
      content: sanitizeLlmText(item?.content, 240)
    }))
    .filter((item) => item.content && item.toRoleIds.length > 0)
    .slice(0, 8);

  return {
    summary: isPlaceholder(payload?.summary) ? "" : sanitizeLlmText(payload?.summary, 240),
    subtasks,
    messages
  };
}

function buildChatCompletionsUrl(baseUrl) {
  const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("模型 Base URL 为空。");
  }
  return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
}

function buildLlmHeaders(model = {}) {
  const headers = {
    "Content-Type": "application/json"
  };
  if (model.apiKey) {
    headers.Authorization = `Bearer ${model.apiKey}`;
  }
  return headers;
}

function buildPlannerMessages({ goal, projectName, roles }) {
  const roleText = roles
    .map((role) => `- ${role.id}: ${role.name}，${role.description}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "你是 CosS 的任务规划器。你必须把用户目标拆成多个角色可执行的任务。只返回严格 JSON，不要 Markdown，不要解释。" +
        "硬性要求：subtasks 必须是 3 到 6 个；每个 title 和 description 必须结合用户目标写具体内容；" +
        "roleId 必须来自用户给出的可用角色 ID；不要返回“子任务标题”“子任务描述”“一句话总结”“角色ID”等占位词。" +
        "返回 JSON 对象字段只能包含 summary、subtasks、messages。"
    },
    {
      role: "user",
      content:
        `项目：${projectName || "未命名项目"}\n` +
        `任务目标：${goal}\n\n` +
        `可用角色：\n${roleText}\n\n` +
        "请生成 3 到 6 个可执行子任务，并给出必要的角色协作消息。必须返回 JSON，格式为：" +
        "{\"summary\":\"结合任务目标的一句话总结\",\"subtasks\":[{\"roleId\":\"product-manager\",\"title\":\"具体子任务标题\",\"description\":\"具体执行说明\"},{\"roleId\":\"frontend-engineer\",\"title\":\"具体子任务标题\",\"description\":\"具体执行说明\"},{\"roleId\":\"backend-engineer\",\"title\":\"具体子任务标题\",\"description\":\"具体执行说明\"}],\"messages\":[{\"fromRoleId\":\"product-manager\",\"toRoleIds\":[\"frontend-engineer\"],\"content\":\"具体协作消息\"}]}。"
    }
  ];
}

async function requestJson(url, options) {
  const controller = new AbortController();
  const timeoutMs = getLlmRequestTimeoutMs();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`模型接口返回 ${response.status}: ${bodyText.slice(0, 500)}`);
    }
    try {
      return JSON.parse(bodyText);
    } catch (error) {
      throw new Error(`模型接口返回非 JSON 响应：${sanitizeLogText(bodyText, 500)} (${error.message})`);
    }
  } catch (error) {
    if (timedOut || error?.name === "AbortError") {
      throw new Error(`模型接口请求超时：${Math.round(timeoutMs / 1000)} 秒内没有返回。可稍后重试，或设置 COSS_LLM_TIMEOUT_MS 调大超时时间。`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function planTaskWithLlm(request = {}) {
  if (process.env.COSS_LLM_FORCE_ERROR === "1") {
    throw new Error("测试环境强制模拟 LLM Gateway 失败。");
  }

  const roles = Array.isArray(request.roles) ? request.roles : [];
  if (process.env.COSS_LLM_MOCK_RESPONSE) {
    return {
      ...normalizePlannerResult(JSON.parse(process.env.COSS_LLM_MOCK_RESPONSE), roles),
      source: "mock"
    };
  }

  if (process.env.COSS_LLM_MOCK_CONTENT) {
    return {
      ...normalizePlannerResult(extractJsonObject(process.env.COSS_LLM_MOCK_CONTENT), roles),
      source: "mock-content"
    };
  }

  const model = request.model || {};
  const url = buildChatCompletionsUrl(model.baseUrl);
  const headers = buildLlmHeaders(model);

  const payload = {
    model: model.modelName,
    messages: buildPlannerMessages({
      goal: request.goal,
      projectName: request.projectName,
      roles
    }),
    temperature: 0.2,
    stream: false
  };

  const response = await requestJson(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  const content = response?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("模型响应中没有 choices[0].message.content。");
  }

  return {
    ...normalizePlannerResult(extractJsonObject(content), roles),
    source: "llm",
    usage: response.usage || null
  };
}

async function testModelConnectivityWithLlm(request = {}) {
  if (process.env.COSS_LLM_FORCE_ERROR === "1") {
    throw new Error("测试环境强制模拟 LLM Gateway 失败。");
  }

  const model = request.model || {};
  const url = buildChatCompletionsUrl(model.baseUrl);
  const modelName = String(model.modelName || "").trim();
  if (!modelName) {
    throw new Error("模型名称为空。");
  }

  if (process.env.COSS_LLM_MOCK_CONNECTIVITY === "1") {
    return {
      source: "mock",
      modelName,
      baseUrl: String(model.baseUrl || "").trim(),
      content: "OK"
    };
  }

  const response = await requestJson(url, {
    method: "POST",
    headers: buildLlmHeaders(model),
    body: JSON.stringify({
      model: modelName,
      messages: [
        {
          role: "system",
          content: "你是 CosS 的模型连通性检测器。请只用极短文本回复。"
        },
        {
          role: "user",
          content: "请回复 OK，用于确认模型接口可用。"
        }
      ],
      temperature: 0,
      max_tokens: 16,
      stream: false
    })
  });
  const content = response?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("模型响应中没有 choices[0].message.content。");
  }

  return {
    source: "llm",
    modelName,
    baseUrl: String(model.baseUrl || "").trim(),
    content: String(content).slice(0, 120),
    usage: response.usage || null
  };
}

async function handlePlanTask(_event, request) {
  const startedAt = Date.now();
  appendLogEvent("llm.plan.requested", summarizePlanRequest(request));
  try {
    const result = await planTaskWithLlm(request);
    appendLogEvent("llm.plan.succeeded", {
      ...summarizePlanRequest(request),
      source: result.source || "llm",
      latencyMs: Date.now() - startedAt,
      subtasks: Array.isArray(result.subtasks) ? result.subtasks.length : 0,
      messages: Array.isArray(result.messages) ? result.messages.length : 0,
      usage: result.usage || null
    });
    return {
      ok: true,
      plannedAt: new Date().toISOString(),
      ...result
    };
  } catch (error) {
    appendLogEvent("llm.plan.failed", {
      ...summarizePlanRequest(request),
      latencyMs: Date.now() - startedAt,
      error: serializeError(error)
    }, "error");
    return {
      ok: false,
      plannedAt: new Date().toISOString(),
      error: error.message
    };
  }
}

async function handleTestModelConnectivity(_event, request) {
  const startedAt = Date.now();
  try {
    const result = await testModelConnectivityWithLlm(request);
    appendLogEvent("llm.connectivity.succeeded", {
      model: summarizeModelConfig(request?.model || {}),
      timeoutMs: getLlmRequestTimeoutMs(),
      latencyMs: Date.now() - startedAt,
      source: result.source || "llm",
      content: sanitizeLogText(result.content, 120),
      usage: result.usage || null
    });
    return {
      ok: true,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      ...result
    };
  } catch (error) {
    appendLogEvent("llm.connectivity.failed", {
      model: summarizeModelConfig(request?.model || {}),
      timeoutMs: getLlmRequestTimeoutMs(),
      latencyMs: Date.now() - startedAt,
      error: serializeError(error)
    }, "error");
    return {
      ok: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      error: error.message
    };
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

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${process.pid}.tmp`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
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

function runWindowsPowerShellInvocation(invocation, env, timeout = 5000) {
  return childProcess.spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", invocation], {
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

  return {
    command: runnableAttempt?.command || requestedCommand,
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

function getNpmCommand() {
  return process.env.COSS_NPM_COMMAND || (process.platform === "win32" ? "npm.cmd" : "npm");
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
    runner: process.platform === "win32" ? "powershell" : "direct"
  };
}

function getWingetStatus() {
  if (process.platform !== "win32") {
    return {
      exists: false,
      usable: false,
      detail: "winget is only supported on Windows in this installer flow."
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
  return String(input || "").replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function normalizeAgentStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["done", "complete", "completed", "success", "succeeded"].includes(normalized)) {
    return "done";
  }
  if (["blocked", "block", "waiting"].includes(normalized)) {
    return "blocked";
  }
  if (["failed", "fail", "error"].includes(normalized)) {
    return "failed";
  }
  if (["running", "working", "start", "started"].includes(normalized)) {
    return "running";
  }
  return "";
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
  const prefixRegex = /COSS_AGENT_EVENT\s*:/gi;
  let match = prefixRegex.exec(text);
  while (match) {
    const afterPrefix = text.slice(match.index + match[0].length);
    const objectStart = afterPrefix.indexOf("{");
    if (objectStart === -1) {
      match = prefixRegex.exec(text);
      continue;
    }

    const candidateSource = afterPrefix.slice(objectStart);
    const jsonText = findBalancedJsonObject(candidateSource);
    if (!jsonText) {
      match = prefixRegex.exec(text);
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
        status: "failed",
        message: `COSS_AGENT_EVENT JSON 解析失败：${error.message}`
      });
    }

    prefixRegex.lastIndex = match.index + match[0].length + objectStart + jsonText.length;
    match = prefixRegex.exec(text);
  }
  return events;
}

function parseAgentOutputEvents(data, launch = {}) {
  const activeMode = launch.activeMode || "";
  if (!["claude", "codex"].includes(activeMode)) {
    return [];
  }

  const text = stripAnsi(data);
  const events = parseStructuredAgentEvents(text);
  const statusRegex = /COSS_AGENT_STATUS\s*:\s*([a-zA-Z_-]+)/gi;
  let match = statusRegex.exec(text);
  while (match) {
    const status = normalizeAgentStatus(match[1]);
    if (status) {
      events.push({ type: "status", status, message: match[0] });
    }
    match = statusRegex.exec(text);
  }

  const markerStatus = [
    [/COSS_TASK_DONE/i, "done"],
    [/COSS_TASK_BLOCKED/i, "blocked"],
    [/COSS_TASK_FAILED/i, "failed"],
    [/COSS_TASK_RUNNING/i, "running"]
  ].find(([pattern]) => pattern.test(text));
  if (markerStatus && !events.some((event) => event.status === markerStatus[1])) {
    events.push({ type: "status", status: markerStatus[1], message: markerStatus[0].source });
  }

  const launchTaskId = launch.taskContext?.taskId || launch.agentSession?.taskId || "";
  const launchSubtaskId = launch.taskContext?.subtaskId || launch.agentSession?.subtaskId || "";
  return events.map((event) => ({
    ...event,
    provider: activeMode === "codex" ? "codex" : "claude",
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
      webContents.send("terminal:agent-event", payload);
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
    "会话 ID：{{sessionId}}",
    "当前任务：{{taskTitle}}",
    "子任务：{{subtaskTitle}}",
    "子任务说明：{{subtaskDescription}}",
    "",
    "请只在当前项目范围内工作。执行高风险命令、删除文件、修改依赖或访问敏感信息前，先说明风险并等待用户确认。",
    "你可以和其他角色协作；完成或阻塞任务时，请在终端输出 COSS_AGENT_STATUS:done 或 COSS_AGENT_STATUS:blocked，便于 CosS 同步任务状态。",
    "需要把协作消息写回 CosS 时，可输出一行 COSS_AGENT_EVENT:{\"status\":\"running\",\"message\":\"给其他角色的协作消息\",\"toRoleIds\":[\"product-manager\"]}。"
  ].join("\n");
}

function applyPromptTemplate(template, values) {
  const source = String(template || "").trim() || getDefaultAgentPromptTemplate();
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] ?? "") : match
  ));
}

function buildRolePrompt(options) {
  const taskContext = options.taskContext || {};
  const agentSession = options.agentSession || {};
  return applyPromptTemplate(options.rolePromptTemplate, {
    roleName: options.roleName || "开发角色",
    roleId: options.roleId || "unknown",
    roleDescription: options.roleDescription || "",
    projectName: options.projectName || "",
    projectId: options.projectId || "",
    workspace: normalizeCwd(options.cwd),
    agentProvider: getEffectiveAgentProvider(options),
    sessionId: agentSession.sessionId || "",
    sessionName: agentSession.sessionName || "",
    taskId: taskContext.taskId || agentSession.taskId || "",
    taskTitle: taskContext.taskTitle || "",
    taskGoal: taskContext.taskGoal || "",
    subtaskId: taskContext.subtaskId || agentSession.subtaskId || "",
    subtaskTitle: taskContext.subtaskTitle || "",
    subtaskDescription: taskContext.subtaskDescription || "",
    subtaskStatus: taskContext.subtaskStatus || ""
  });
}

function normalizeTerminalMode(value) {
  return value === "agent" || value === "claude" || value === "codex" ? "agent" : "shell";
}

function normalizeAgentProvider(value) {
  return value === "codex" ? "codex" : "claude";
}

function getEffectiveAgentProvider(options) {
  if (options.terminalMode === "codex" || options.terminalMode === "claude") {
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
  const env = getShellEnv({
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
    COSS_ROLE_ID: options.roleId || "",
    COSS_ROLE_NAME: options.roleName || "",
    COSS_ROLE_PROMPT: rolePrompt,
    COSS_TERMINAL_MODE: terminalMode,
    COSS_AGENT_PROVIDER: agentProvider,
    COSS_AGENT_SESSION_ID: agentSession.sessionId || "",
    COSS_AGENT_SESSION_NAME: agentSession.sessionName || "",
    COSS_PROJECT_ID: options.projectId || agentSession.projectId || "",
    COSS_PROJECT_NAME: options.projectName || agentSession.projectName || "",
    COSS_TASK_ID: taskContext.taskId || agentSession.taskId || "",
    COSS_SUBTASK_ID: taskContext.subtaskId || agentSession.subtaskId || "",
    COSS_TASK_TITLE: taskContext.taskTitle || "",
    COSS_SUBTASK_TITLE: taskContext.subtaskTitle || ""
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
    const codexStatus = getCodexCommandStatus(env);

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
          label: "Codex Agent Error",
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
        label: canAutoInstall ? "Codex CLI Installer" : "PowerShell",
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
      return {
        file: "powershell.exe",
        args: ["-NoLogo", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", buildCodexPowerShellCommand(codexStatus.command)],
        env,
        label: "Codex",
        requestedMode: "agent",
        activeMode: "codex",
        rolePrompt
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
        label: "Claude Code Agent Error",
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
        label: "Claude Code Installer",
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
      label: hasWinget ? "Claude Code Installer" : "PowerShell",
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

function sendTerminalData(webContents, id, data) {
  if (!webContents.isDestroyed()) {
    webContents.send("terminal:data", { id, data });
  }
}

function sendTerminalExit(webContents, id, exitCode) {
  if (!webContents.isDestroyed()) {
    webContents.send("terminal:exit", { id, exitCode });
  }
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
      }
    },
    resize: () => {},
    kill: () => child.kill(),
    mode: "pipe",
    pid: child.pid,
    launch
  };
}

function createPtyTerminal(webContents, id, options, launch = resolveTerminalLaunch(options)) {
  const cwd = normalizeCwd(options.cwd);
  const cols = normalizeTerminalSize(options.cols, 80, 20, 240);
  const rows = normalizeTerminalSize(options.rows, 24, 6, 80);

  let ptyProcess;
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
    write: (data) => ptyProcess.write(data),
    resize: (nextCols, nextRows) => {
      const safeCols = normalizeTerminalSize(nextCols, cols, 20, 240);
      const safeRows = normalizeTerminalSize(nextRows, rows, 6, 80);
      ptyProcess.resize(safeCols, safeRows);
    },
    kill: () => ptyProcess.kill(),
    mode: "pty",
    pid: ptyProcess.pid,
    launch
  };
}

function createTerminalSession(event, options = {}) {
  const id = typeof options.id === "string" ? options.id : randomUUID();
  disposeTerminalSession(id);

  const webContents = event.sender;
  const roleName = options.roleName || "角色终端";
  const cwd = normalizeCwd(options.cwd);
  const terminalMode = normalizeTerminalMode(options.terminalMode);
  const agentProvider = getEffectiveAgentProvider(options);
  const requestedMode = {
    agent: `Agent(${agentProvider === "codex" ? "Codex" : "Claude Code"})`,
    shell: "PowerShell"
  }[terminalMode];
  appendLogEvent("terminal.create.requested", {
    id,
    roleName,
    cwd,
    terminalMode,
    agentProvider,
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
      `会话 ID: ${options.agentSession?.sessionId || "shell"}\r\n` +
      "角色提示词、会话信息和任务上下文已写入 COSS_* 环境变量。\r\n\r\n"
  );

  if (process.env.COSS_DISABLE_TERMINAL_BACKEND === "1") {
    const mockSession = {
      write: (data) => sendTerminalData(webContents, id, data),
      resize: () => {},
      kill: () => {},
      mode: "mock",
      launch: {
        requestedMode: terminalMode,
        activeMode: "mock"
      }
    };
    terminalSessions.set(id, mockSession);
    appendLogEvent("terminal.create.mock", {
      id,
      roleName,
      requestedMode: mockSession.launch.requestedMode,
      activeMode: "mock"
    }, "warn");
    sendTerminalData(webContents, id, "\x1b[33m测试环境已禁用真实终端后端。\x1b[0m\r\n");
    return {
      id,
      mode: "mock",
      requestedMode: mockSession.launch.requestedMode,
      activeMode: "mock"
    };
  }

  const launch = resolveTerminalLaunch({ ...options, cwd });
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
    sessionId: session.launch?.agentSession?.sessionId || "",
    taskId: session.launch?.taskContext?.taskId || session.launch?.agentSession?.taskId || ""
  });

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

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1040,
    minHeight: 680,
    title: "CosS",
    frame: false,
    backgroundColor: "#dfe8f7",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: true
    }
  });

  win.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    try {
      const url = new URL(params.src || "about:blank");
      const allowedProtocols = new Set(["http:", "https:", "file:", "data:", "about:"]);
      if (!allowedProtocols.has(url.protocol)) {
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
    appendLogEvent("browser.window-open", { url });
    shell.openExternal(url).catch((error) => appendLogEvent("browser.window-open.failed", { url, error: serializeError(error) }, "error"));
    return { action: "deny" };
  });

  win.setAutoHideMenuBar(true);
  win.setMenuBarVisibility(false);
  win.on("maximize", () => win.webContents.send("window:maximized", true));
  win.on("unmaximize", () => win.webContents.send("window:maximized", false));
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createAppMenu();
  appendLogEvent("app.ready", { userData: app.getPath("userData"), logDirectory: getLogDirectory() });
  ipcMain.handle("state:load", () => readState());
  ipcMain.handle("state:save", (_event, state) => {
    try {
      const result = writeState(state);
      appendLogEvent("state.saved", { projects: Array.isArray(state?.projects) ? state.projects.length : 0 });
      return result;
    } catch (error) {
      appendLogEvent("state.save.failed", {
        projects: Array.isArray(state?.projects) ? state.projects.length : 0,
        error: serializeError(error)
      }, "error");
      throw error;
    }
  });
  ipcMain.handle("llm:plan-task", handlePlanTask);
  ipcMain.handle("llm:test-model", handleTestModelConnectivity);
  ipcMain.handle("app:info", () => ({ version: appVersion, logDirectory: getLogDirectory(), userData: app.getPath("userData") }));
  ipcMain.handle("app:log-event", (_event, eventName, payload = {}, level = "info") => appendLogEvent(eventName, payload, level));
  ipcMain.handle("logs:open-directory", () => openLogDirectory());
  ipcMain.handle("dialog:select-project-directory", selectProjectDirectory);
  ipcMain.handle("dialog:select-project-file", selectProjectFile);
  ipcMain.handle("files:list", listProjectFiles);
  ipcMain.handle("files:read", readProjectFile);
  ipcMain.handle("files:write", writeProjectFile);
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
  ipcMain.handle("terminal:create", createTerminalSession);
  ipcMain.handle("terminal:input", (_event, id, data) => {
    const session = terminalSessions.get(id);
    if (session && typeof data === "string") {
      try {
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
        session.resize(cols, rows);
        return true;
      } catch (error) {
        console.warn(`Failed to resize terminal session ${id}`, error);
        appendLogEvent("terminal.resize.failed", { id, cols, rows, error: serializeError(error) }, "error");
      }
    }
    return false;
  });
  ipcMain.handle("terminal:dispose", (_event, id) => disposeTerminalSession(id));

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
