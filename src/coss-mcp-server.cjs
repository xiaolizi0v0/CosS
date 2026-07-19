#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const kernel = require("./orchestrator/kernel.cjs");

let initSqlJs = null;

try {
  initSqlJs = require("sql.js");
} catch {
  initSqlJs = null;
}

const packageVersion = (() => {
  try {
    return require("../package.json").version;
  } catch {
    return "0.12.1";
  }
})();

const dataFileName = "coss-workspace-state.json";
const sqliteFileName = "coss-workspace.sqlite";
const storageSchemaVersion = 1;
const systemRole = { id: "system", name: "系统", englishName: "CosS System" };
const roleTemplates = [
  { id: "product-manager", name: "产品经理", englishName: "Product Manager" },
  { id: "tech-lead", name: "技术负责人", englishName: "Tech Lead" },
  { id: "frontend-engineer", name: "前端工程师", englishName: "Frontend Engineer" },
  { id: "backend-engineer", name: "后端工程师", englishName: "Backend Engineer" },
  { id: "qa-engineer", name: "测试工程师", englishName: "QA Engineer" },
  { id: "ai-agent-engineer", name: "AI/Agent 工程师", englishName: "AI/Agent Engineer" },
  { id: "devops-engineer", name: "DevOps 工程师", englishName: "DevOps Engineer" },
  { id: "technical-writer", name: "技术文档工程师", englishName: "Technical Writer" },
  { id: "security-engineer", name: "安全工程师", englishName: "Security Engineer" }
];
const orchestratorProtocolVersion = kernel.KERNEL_VERSION;
const orchestratorTransportSenderId = systemRole.id;
const roleCapabilityProfiles = {
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
const globalOrchestratorPolicy = {
  directAgentMessaging: false,
  capabilitySandbox: true,
  sharedTaskBoard: true,
  resourceLocks: true,
  structuredResultsOnly: true,
  dryRunBeforeHighRisk: true,
  userConfirmationForHighRisk: true,
  centralArbitration: true
};
const roleIds = new Set(roleTemplates.map((role) => role.id));
let sqlJsRuntimePromise = null;

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));

function resolveUserDataDir() {
  const configured = args.userData || process.env.COSS_MCP_USER_DATA || process.env.COSS_TEST_USER_DATA || "";
  if (configured) {
    return path.resolve(configured);
  }
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA || process.cwd();
  return path.join(appData, "coss-desktop");
}

const userDataDir = resolveUserDataDir();

function getDataFilePath() {
  return path.join(userDataDir, dataFileName);
}

function getSqliteFilePath() {
  return path.join(userDataDir, sqliteFileName);
}

function getLogDirectory() {
  return process.env.COSS_LOG_DIR || path.join(userDataDir, "logs");
}

function getLogFilePath(date = new Date()) {
  return path.join(getLogDirectory(), `coss-${date.toISOString().slice(0, 10)}.jsonl`);
}

function appendLogEvent(eventName, payload = {}, level = "info") {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event: eventName,
    appVersion: packageVersion,
    payload: {
      source: "coss-mcp",
      ...payload
    }
  };

  try {
    fs.mkdirSync(getLogDirectory(), { recursive: true });
    fs.appendFileSync(getLogFilePath(), `${JSON.stringify(entry)}\n`, "utf8");
  } catch {
    // Logging must never break an Agent tool call.
  }

  return entry;
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

function sleepSync(ms) {
  const buffer = new SharedArrayBuffer(4);
  const view = new Int32Array(buffer);
  Atomics.wait(view, 0, 0, ms);
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

function getTimestampMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function getStateFreshnessMs(state, fileStat = {}) {
  return Math.max(getTimestampMs(state?.updatedAt), getTimestampMs(fileStat.modifiedAt));
}

function isJsonStateNewerThanSqlite(jsonState, sqliteState, jsonStat = {}, sqliteStat = {}) {
  return getStateFreshnessMs(jsonState, jsonStat) > getStateFreshnessMs(sqliteState, sqliteStat) + 2;
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

function writeFileAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tempPath, data);
  try {
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

function writeJsonAtomic(filePath, value) {
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function getSqlJsRuntime() {
  if (!initSqlJs) {
    throw new Error("sql.js is unavailable");
  }
  if (!sqlJsRuntimePromise) {
    const distDir = path.dirname(require.resolve("sql.js/dist/sql-wasm.js"));
    sqlJsRuntimePromise = initSqlJs({
      locateFile: (fileName) => path.join(distDir, fileName)
    });
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
  db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", ["app_version", packageVersion]);
  db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", ["updated_at", now]);
}

async function openSqliteDatabase() {
  const SQL = await getSqlJsRuntime();
  const sqlitePath = getSqliteFilePath();
  const db = fs.existsSync(sqlitePath) ? new SQL.Database(fs.readFileSync(sqlitePath)) : new SQL.Database();
  ensureSqliteSchema(db);
  return db;
}

function readWorkspaceStateFromDb(db) {
  const rows = db.exec("SELECT value FROM app_state WHERE key = 'workspace_state' LIMIT 1");
  const value = rows?.[0]?.values?.[0]?.[0];
  return value ? JSON.parse(value) : null;
}

function writeWorkspaceStateToDb(db, state) {
  const now = new Date().toISOString();
  db.run(
    "INSERT OR REPLACE INTO app_state (key, value, updated_at) VALUES (?, ?, ?)",
    ["workspace_state", JSON.stringify(state), now]
  );
  db.run("INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)", ["updated_at", now]);
}

async function readState() {
  const sqlitePath = getSqliteFilePath();
  const jsonPath = getDataFilePath();
  if (fs.existsSync(sqlitePath) && initSqlJs) {
    let db = null;
    try {
      db = await openSqliteDatabase();
      const state = readWorkspaceStateFromDb(db);
      if (state) {
        if (fs.existsSync(jsonPath)) {
          try {
            const jsonState = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
            if (isJsonStateNewerThanSqlite(jsonState, state, safeFileStat(jsonPath), safeFileStat(sqlitePath))) {
              writeWorkspaceStateToDb(db, jsonState);
              writeFileAtomic(sqlitePath, Buffer.from(db.export()));
              appendLogEvent("mcp.storage.json-newer-than-sqlite", {
                jsonPath,
                sqlitePath,
                updatedAt: jsonState.updatedAt || ""
              }, "warn");
              return jsonState;
            }
          } catch (error) {
            appendLogEvent("mcp.storage.json-freshness-check.failed", { error: serializeError(error) }, "warn");
          }
        }
        return state;
      }
    } catch (error) {
      appendLogEvent("mcp.storage.sqlite.read.failed", { error: error.message }, "warn");
    } finally {
      if (db && typeof db.close === "function") {
        try {
          db.close();
        } catch (error) {
          appendLogEvent("mcp.storage.sqlite.close.failed", { error: serializeError(error) }, "warn");
        }
      }
    }
  }

  if (!fs.existsSync(jsonPath)) {
    return { activeProjectId: null, projects: [], settings: {} };
  }
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

async function writeState(state) {
  state.updatedAt = new Date().toISOString();
  writeJsonAtomic(getDataFilePath(), state);
  if (initSqlJs) {
    let db = null;
    try {
      db = await openSqliteDatabase();
      writeWorkspaceStateToDb(db, state);
      writeFileAtomic(getSqliteFilePath(), Buffer.from(db.export()));
    } catch (error) {
      appendLogEvent("mcp.storage.sqlite.write.failed", { error: serializeError(error) }, "warn");
    } finally {
      if (db && typeof db.close === "function") {
        try {
          db.close();
        } catch (error) {
          appendLogEvent("mcp.storage.sqlite.close.failed", { error: serializeError(error) }, "warn");
        }
      }
    }
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function normalizeRoleId(value, fallback = "product-manager") {
  return kernel.normalizeRoleId(value, fallback);
}

function getValidRoleIdText() {
  return roleTemplates.map((role) => role.id).join(", ");
}

function assertKnownRoleId(value, fieldName = "roleId") {
  return kernel.assertKnownRoleId(value, fieldName);
}

function uniqueRoleIds(values = [], fromRoleId = "", options = {}) {
  return kernel.uniqueRoleIds(values, fromRoleId, options);
}

function normalizeSubtaskStatus(value) {
  return kernel.normalizeSubtaskStatus(value);
}

function normalizeAgentEventStatus(value) {
  return kernel.normalizeAgentEventStatus(value);
}

function deriveTaskStatus(subtasks = []) {
  return kernel.deriveTaskStatus(subtasks);
}

function getRoleCapabilities(roleId) {
  return kernel.getRoleCapabilities(roleId);
}

function normalizeRiskLevel(value) {
  return kernel.normalizeRiskLevel(value);
}

function uniqueStrings(values = []) {
  return kernel.uniqueStrings(values);
}

function createEmptyProjectMemory(enabled = true) {
  return {
    version: orchestratorProtocolVersion,
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
    taskHistory: Array.isArray(existing.taskHistory) ? existing.taskHistory.slice(-20) : [],
    decisions: Array.isArray(existing.decisions) ? existing.decisions.slice(-20) : [],
    artifacts: Array.isArray(existing.artifacts) ? existing.artifacts.slice(-20) : [],
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
  ensureTaskOrchestrator(task);
  const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
  const doneCount = subtasks.filter((subtask) => normalizeSubtaskStatus(subtask.status) === "done").length;
  const roleIds = uniqueRoleIds([
    ...(task?.planner?.neededAgentRoleIds || []),
    ...subtasks.map((subtask) => subtask.roleId)
  ]);
  return {
    id: task?.id || "",
    title: compactMemoryText(task?.title || task?.goal, 80),
    goal: compactMemoryText(task?.goal || task?.title, 240),
    status: task?.status || deriveTaskStatus(subtasks),
    createdAt: task?.createdAt || "",
    updatedAt: task?.updatedAt || task?.createdAt || "",
    modelName: task?.model?.modelName || task?.model?.provider || "",
    summary: compactMemoryText(task?.planner?.summary || "", 240),
    doneCount,
    totalCount: subtasks.length,
    roles: roleIds.map((roleId) => ({ id: roleId, name: getRoleName(roleId) })),
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
  return (project?.tasks || [])
    .flatMap((task) => {
      const artifacts = task?.orchestrator?.sharedState?.artifacts || [];
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
    .slice(0, 20);
}

function collectProjectMemoryDecisions(project) {
  return (project?.tasks || [])
    .flatMap((task) => {
      const decisions = task?.orchestrator?.sharedState?.decisions || [];
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
    .slice(0, 20);
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
    });
  }
  if (artifacts.length > 0) {
    lines.push("Known artifacts:");
    artifacts.slice(0, 8).forEach((artifact) => lines.push(`- ${artifact.path}${artifact.description ? `: ${artifact.description}` : ""}`));
  }
  if (decisions.length > 0) {
    lines.push("Recent decisions:");
    decisions.slice(0, 8).forEach((decision) => lines.push(`- ${decision.roleName || decision.roleId}: ${decision.summary}`));
  }
  return lines.join("\n").slice(0, 12000);
}

function rebuildProjectMemory(project, source = "mcp") {
  const memory = ensureProjectMemoryShape(project);
  const taskHistory = (project?.tasks || []).slice(0, 8).map(summarizeProjectTaskForMemory);
  const decisions = collectProjectMemoryDecisions(project);
  const artifacts = collectProjectMemoryArtifacts(project);
  memory.version = orchestratorProtocolVersion;
  memory.taskHistory = taskHistory;
  memory.decisions = decisions;
  memory.artifacts = artifacts;
  memory.summary = buildProjectMemorySummary(project, taskHistory, decisions, artifacts);
  memory.updatedAt = new Date().toISOString();
  memory.lastSource = source;
  return memory;
}

function buildProjectMemoryContext(project) {
  if (!project) {
    return { enabled: false };
  }
  const memory = ensureProjectMemoryShape(project);
  if (memory.enabled === false) {
    return { enabled: false };
  }
  return {
    enabled: true,
    version: memory.version,
    manualNotes: memory.manualNotes,
    summary: memory.summary,
    taskHistory: memory.taskHistory.slice(0, 8),
    decisions: memory.decisions.slice(0, 10),
    artifacts: memory.artifacts.slice(0, 10),
    updatedAt: memory.updatedAt
  };
}

function formatProjectMemoryForDispatch(projectMemory = {}) {
  if (!projectMemory || projectMemory.enabled === false) {
    return "";
  }
  const lines = [];
  if (projectMemory.manualNotes) {
    lines.push("Manual project notes:", String(projectMemory.manualNotes).trim().slice(0, 4000));
  }
  if (projectMemory.summary) {
    lines.push("Auto project memory:", String(projectMemory.summary).trim().slice(0, 8000));
  }
  return lines.join("\n").trim().slice(0, 12000);
}

function getOrchestratorSenderRoleId(targetRoleId) {
  assertKnownRoleId(targetRoleId, "targetRoleId");
  return orchestratorTransportSenderId;
}

function ensureTaskOrchestrator(task) {
  return kernel.ensureTaskOrchestrator(task);
}

function getStepBySubtask(task, subtaskId) {
  return kernel.getStepBySubtask(task, subtaskId);
}

function getProject(state, projectId = "") {
  const id = projectId || args.projectId || process.env.COSS_MCP_PROJECT_ID || state.activeProjectId || "";
  return state.projects?.find((project) => project.id === id) || state.projects?.[0] || null;
}

function getContextRoleId(input = {}) {
  const roleId = String(input.roleId || args.roleId || process.env.COSS_MCP_ROLE_ID || process.env.COSS_ROLE_ID || "").trim();
  return roleId ? assertKnownRoleId(roleId, "roleId") : "product-manager";
}

function getTask(project, taskId = "") {
  if (!project) {
    return null;
  }
  const id = taskId || args.taskId || process.env.COSS_MCP_TASK_ID || process.env.COSS_TASK_ID || "";
  if (id) {
    const task = project.tasks?.find((item) => item.id === id) || null;
    ensureTaskOrchestrator(task);
    return task;
  }
  const task = (project.tasks || []).find((item) => item.status !== "done" && !item.archived) || project.tasks?.[0] || null;
  ensureTaskOrchestrator(task);
  return task;
}

function getSubtask(task, roleId, subtaskId = "") {
  if (!task) {
    return null;
  }
  if (subtaskId) {
    return task.subtasks?.find((subtask) => subtask.id === subtaskId) || null;
  }
  return task.subtasks?.find((subtask) => subtask.roleId === roleId && normalizeSubtaskStatus(subtask.status) !== "done")
    || task.subtasks?.find((subtask) => subtask.roleId === roleId)
    || null;
}

function getActiveSubtaskCursorKey(taskId, roleId) {
  return `${taskId || "general"}:${roleId}`;
}

function getActiveSubtaskId(project, taskId, roleId) {
  return project?.agentRoleActiveSubtasks?.[getActiveSubtaskCursorKey(taskId, roleId)] || "";
}

function setActiveSubtaskId(project, taskId, roleId, subtaskId) {
  if (!project || !taskId || !roleId || !subtaskId) {
    return;
  }
  project.agentRoleActiveSubtasks ||= {};
  project.agentRoleActiveSubtasks[getActiveSubtaskCursorKey(taskId, roleId)] = subtaskId;
}

function clearActiveSubtaskId(project, taskId, roleId, subtaskId = "") {
  const key = getActiveSubtaskCursorKey(taskId, roleId);
  if (!project?.agentRoleActiveSubtasks?.[key]) {
    return;
  }
  if (!subtaskId || project.agentRoleActiveSubtasks[key] === subtaskId) {
    delete project.agentRoleActiveSubtasks[key];
  }
}

function getSubtaskForMessage(task, roleId, messageId = "") {
  if (!task || !messageId) {
    return null;
  }
  return task.subtasks?.find((subtask) => subtask.roleId === roleId && subtask.sourceMessageId === messageId) || null;
}

function getPreferredSubtask(project, task, roleId, input = {}) {
  if (!task) {
    return null;
  }
  if (input.subtaskId) {
    return task.subtasks?.find((subtask) => subtask.id === input.subtaskId) || null;
  }
  const messageId = String(input.messageId || "").trim();
  const linked = getSubtaskForMessage(task, roleId, messageId);
  if (linked) {
    return linked;
  }
  const activeSubtaskId = getActiveSubtaskId(project, task.id, roleId);
  if (activeSubtaskId) {
    const active = task.subtasks?.find((subtask) => subtask.id === activeSubtaskId && subtask.roleId === roleId) || null;
    if (active) {
      return active;
    }
  }
  return getSubtask(task, roleId, "");
}
function getRoleName(roleId) {
  if (roleId === systemRole.id) {
    return systemRole.name;
  }
  return roleTemplates.find((role) => role.id === roleId)?.name || roleId;
}

function firstMeaningfulLine(value, fallback = "") {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || fallback;
}

function createDownstreamSubtasksFromMessage(project, message, options = {}) {
  appendLogEvent("mcp.orchestrator.direct-subtask-creation.skipped", {
    projectId: project?.id || "",
    taskId: message?.taskId || "",
    messageId: message?.id || "",
    source: message?.source || "",
    reason: "v0.10 Kernel owns downstream task creation"
  }, "warn");
  return [];
}
function getMessageChannelId(fromRoleId, toRoleIds, taskId = "") {
  if (taskId) {
    return `task:${taskId}`;
  }
  return `direct:${[fromRoleId, ...toRoleIds].sort().join(":")}`;
}

function createRoleMessage(input) {
  const explicitFromRoleId = String(input.fromRoleId || "").trim();
  const fromRoleId = explicitFromRoleId === systemRole.id
    ? systemRole.id
    : (explicitFromRoleId ? assertKnownRoleId(explicitFromRoleId, "fromRoleId") : getContextRoleId(input));
  const toRoleIds = uniqueRoleIds(input.toRoleIds || [], fromRoleId, { strict: true, fieldName: "toRoleIds" });
  if (!toRoleIds.length) {
    throw new Error("toRoleIds must contain at least one valid role different from fromRoleId.");
  }
  const taskId = String(input.taskId || "");
  return {
    id: input.id || uid("msg"),
    type: "role-message",
    channelType: taskId ? "task" : "direct",
    channelId: input.channelId || getMessageChannelId(fromRoleId, toRoleIds, taskId),
    fromRoleId,
    toRoleIds,
    content: String(input.content || "").trim().slice(0, 4000),
    taskId: taskId || null,
    source: input.source || "mcp",
    status: "sent",
    readBy: Array.from(new Set([fromRoleId, ...(input.readBy || [])])),
    injectedWindowIds: [],
    injectedAt: "",
    autoWorkflow: Boolean(input.autoWorkflow),
    autoWorkflowStatus: "",
    autoWorkflowDispatchedAt: "",
    autoWorkflowStoppedAt: "",
    agentPoolPaths: input.agentPoolPaths || {},
    agentPoolStatus: input.agentPoolStatus || "idle",
    subtaskRefs: input.subtaskRefs && typeof input.subtaskRefs === "object" ? { ...input.subtaskRefs } : {},
    createdAt: input.createdAt || new Date().toISOString()
  };
}

function buildOrchestratorDispatchContent(task, step) {
  const memoryText = formatProjectMemoryForDispatch(task.projectMemorySnapshot || {});
  const memoryLines = memoryText ? ["", "Project memory for this task:", memoryText] : [];
  return [
    `CosS Kernel task board: ${task.title || task.goal || task.id}`,
    `Task ID: ${task.id}`,
    `Step ID: ${step.id}`,
    `Target role: ${getRoleName(step.roleId)} (${step.roleId})`,
    `Step title: ${step.title}`,
    `Step description: ${step.description}`,
    "",
    "Central linear workflow rules:",
    "1. Do not directly assign work to another Agent or invent roles.",
    "2. Start this message and step, then write results back with coss_submit_result({ status: \"done\" }).",
    "3. Complete only this step. The Kernel starts the next preplanned Agent after this step is done.",
    "4. Use coss_acquire_lock before changing shared resources, and coss_request_approval before medium/high-risk actions.",
    `Allowed capabilities: ${step.allowedCapabilities.join(", ") || "none"}`,
    ...memoryLines
  ].join("\n");
}

function createOrchestratorDispatchMessage(task, step) {
  const message = createRoleMessage({
    fromRoleId: getOrchestratorSenderRoleId(step.roleId),
    toRoleIds: [step.roleId],
    content: buildOrchestratorDispatchContent(task, step),
    taskId: task.id,
    source: "orchestrator-dispatch",
    autoWorkflow: true,
    subtaskRefs: { [step.roleId]: step.subtaskId }
  });
  step.assignedMessageId = message.id;
  step.status = "idle";
  step.phase = "idle";
  step.updatedAt = message.createdAt;
  const subtask = task?.subtasks?.find((item) => item.id === step.subtaskId);
  if (subtask) {
    subtask.assignedMessageId = message.id;
    subtask.updatedAt = message.createdAt;
  }
  return message;
}

function isKernelStepReadyForDispatch(task, step) {
  if (!task || !step || step.assignedMessageId || kernel.normalizeStepPhase(step.phase) !== "idle") {
    return false;
  }
  const orchestrator = kernel.ensureTaskOrchestrator(task);
  return kernel.uniqueStrings(step.dependsOn || []).every((dependencyId) => {
    const dependency = orchestrator.steps.find((item) => item.id === dependencyId || item.subtaskId === dependencyId);
    return dependency && kernel.normalizeStepPhase(dependency.phase || dependency.status) === "done";
  });
}

function dispatchExistingKernelStep(project, task, step) {
  const subtask = task?.subtasks?.find((item) => item.id === step?.subtaskId);
  if (!project || !task || !step || !subtask || step.assignedMessageId) {
    return null;
  }
  const message = createOrchestratorDispatchMessage(task, step);
  const poolPaths = writeAgentPoolMessages(project, message);
  project.messages ||= [];
  project.messages.push(message);
  project.messages = project.messages.slice(-500);
  kernel.appendKernelEvent(project, task, {
    type: "step.dispatched",
    roleId: step.roleId,
    stepId: step.id,
    subtaskId: subtask.id,
    payload: { messageId: message.id, poolPaths, source: "preplanned-ready-step" }
  });
  task.status = deriveTaskStatus(task.subtasks || []);
  task.updatedAt = new Date().toISOString();
  return { subtask, step, message, poolPaths };
}

function dispatchReadyKernelSteps(project, task) {
  const orchestrator = kernel.ensureTaskOrchestrator(task);
  return (orchestrator.steps || [])
    .filter((step) => isKernelStepReadyForDispatch(task, step))
    .slice(0, 1)
    .map((step) => dispatchExistingKernelStep(project, task, step))
    .filter(Boolean);
}

function getAgentPoolRelativePath(roleId, messageId) {
  return `.coss/agent-pools/${normalizeRoleId(roleId, "product-manager")}/inbox/${String(messageId || "").replace(/[^a-zA-Z0-9_-]+/g, "-")}.json`;
}

function getAgentPoolAbsolutePath(project, roleId, messageId) {
  return safeProjectPath(project, getAgentPoolRelativePath(roleId, messageId)).target;
}

function buildAgentPoolEnvelope(project, message, roleId, status = "idle") {
  return {
    schemaVersion: 1,
    id: message.id,
    projectId: project.id,
    roleId: normalizeRoleId(roleId, "product-manager"),
    fromRoleId: message.fromRoleId,
    toRoleIds: message.toRoleIds || [],
    taskId: message.taskId || "",
    channelType: message.channelType || (message.taskId ? "task" : "direct"),
    channelId: message.channelId || getMessageChannelId(message.fromRoleId, message.toRoleIds || [], message.taskId || ""),
    source: message.source || "mcp",
    status,
    content: message.content || "",
    createdAt: message.createdAt || new Date().toISOString(),
    startedAt: "",
    runningBy: "",
    messageRef: {
      projectMessageId: message.id
    }
  };
}

function writeAgentPoolMessage(project, message, roleId, status = "idle") {
  if (!project?.path) {
    return "";
  }
  const normalizedRoleId = normalizeRoleId(roleId, "product-manager");
  const relativePath = getAgentPoolRelativePath(normalizedRoleId, message.id);
  const absolutePath = getAgentPoolAbsolutePath(project, normalizedRoleId, message.id);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const existing = fs.existsSync(absolutePath)
    ? JSON.parse(fs.readFileSync(absolutePath, "utf8"))
    : {};
  const base = buildAgentPoolEnvelope(project, message, normalizedRoleId, status);
  const envelope = {
    ...base,
    ...existing,
    id: message.id,
    projectId: project.id,
    roleId: normalizedRoleId,
    fromRoleId: message.fromRoleId,
    toRoleIds: message.toRoleIds || [],
    taskId: message.taskId || "",
    channelType: message.channelType || base.channelType,
    channelId: message.channelId || base.channelId,
    source: message.source || existing.source || "mcp",
    status,
    content: message.content || "",
    createdAt: message.createdAt || existing.createdAt || base.createdAt,
    messageRef: base.messageRef
  };
  fs.writeFileSync(absolutePath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
  message.agentPoolPaths ||= {};
  message.agentPoolPaths[normalizedRoleId] = relativePath;
  message.agentPoolStatus = status;
  return relativePath;
}

function writeAgentPoolMessages(project, message) {
  const paths = {};
  uniqueRoleIds(message.toRoleIds || [], message.fromRoleId).forEach((roleId) => {
    paths[roleId] = writeAgentPoolMessage(project, message, roleId, "idle");
  });
  return paths;
}

function readAgentPoolEnvelope(project, roleId, messageId) {
  if (!project?.path) {
    return null;
  }
  const absolutePath = getAgentPoolAbsolutePath(project, roleId, messageId);
  if (!fs.existsSync(absolutePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function listAgentPoolMessages(project, roleId, input = {}) {
  if (!project?.path) {
    return [];
  }
  const normalizedRoleId = normalizeRoleId(roleId, "product-manager");
  const inboxDir = safeProjectPath(project, `.coss/agent-pools/${normalizedRoleId}/inbox`).target;
  if (!fs.existsSync(inboxDir)) {
    return [];
  }
  const includeRunning = input.includeRunning === true || input.includeRead === true;
  const taskId = String(input.taskId || "").trim();
  return fs.readdirSync(inboxDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      try {
        const filePath = path.join(inboxDir, name);
        const envelope = JSON.parse(fs.readFileSync(filePath, "utf8"));
        return {
          ...envelope,
          poolPath: path.relative(project.path, filePath).replace(/\\/g, "/")
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((message) => !taskId || message.taskId === taskId)
    .filter((message) => includeRunning || message.status !== "running")
    .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
}

function appendAgentEvent(project, input) {
  const now = new Date().toISOString();
  project.agentEvents ||= [];
  const event = {
    id: uid("agent-event"),
    type: input.type || "mcp-tool",
    structured: true,
    windowId: input.windowId || args.windowId || process.env.COSS_MCP_WINDOW_ID || "",
    roleId: normalizeRoleId(input.roleId, getContextRoleId(input)),
    fromRoleId: normalizeRoleId(input.fromRoleId, input.roleId || getContextRoleId(input)),
    toRoleIds: uniqueRoleIds(input.toRoleIds || [], input.fromRoleId || input.roleId || getContextRoleId(input)),
    provider: input.provider || process.env.COSS_AGENT_PROVIDER || "mcp",
    sessionId: input.sessionId || args.sessionId || process.env.COSS_MCP_SESSION_ID || process.env.COSS_AGENT_SESSION_ID || "",
    taskId: input.taskId || "",
    subtaskId: input.subtaskId || "",
    status: normalizeAgentEventStatus(input.status) || "",
    toolName: String(input.toolName || "").trim().slice(0, 80),
    message: String(input.message || "").trim().slice(0, 500),
    receivedAt: input.receivedAt || now
  };
  project.agentEvents.push(event);
  project.agentEvents = project.agentEvents.slice(-240);
  return event;
}

function summarizeMcpToolResult(toolName, result = {}, ok = true, error = "") {
  if (!ok) {
    return `MCP tool ${toolName} failed: ${error || "unknown error"}`;
  }
  const parts = [`MCP tool ${toolName} called`];
  if (Number.isFinite(result.count)) {
    parts.push(`count=${result.count}`);
  }
  if (result.messageId) {
    parts.push(`message=${result.messageId}`);
  }
  if (result.taskId) {
    parts.push(`task=${result.taskId}`);
  }
  if (result.subtaskId) {
    parts.push(`subtask=${result.subtaskId}`);
  }
  if (result.status) {
    parts.push(`status=${result.status}`);
  }
  if (result.eventId) {
    parts.push(`event=${result.eventId}`);
  }
  return `${parts.join(" · ")}.`;
}

function getToolResultTaskId(input = {}, result = {}) {
  return String(input.taskId || result.taskId || result.task?.id || "").trim();
}

function getToolResultSubtaskId(input = {}, result = {}) {
  return String(input.subtaskId || result.subtaskId || result.subtask?.id || "").trim();
}

async function recordMcpToolCallEvent(toolName, input = {}, result = {}, ok = true, error = "") {
  try {
    return await withState(async (state) => {
      const project = getProject(state, input.projectId || result.projectId || result.project?.id || "");
      if (!project) {
        return null;
      }
      const roleId = getContextRoleId(input);
      const event = appendAgentEvent(project, {
        roleId,
        fromRoleId: roleId,
        taskId: getToolResultTaskId(input, result),
        subtaskId: getToolResultSubtaskId(input, result),
        status: "running",
        type: "mcp-tool-call",
        toolName,
        message: summarizeMcpToolResult(toolName, result, ok, error)
      });
      appendLogEvent(ok ? "mcp.tool.called" : "mcp.tool.failed", {
        projectId: project.id,
        roleId,
        taskId: event.taskId || "",
        subtaskId: event.subtaskId || "",
        eventId: event.id,
        tool: toolName,
        ok,
        error: ok ? "" : error
      }, ok ? "info" : "error");
      return event;
    });
  } catch (logError) {
    appendLogEvent("mcp.tool.audit.failed", {
      tool: toolName,
      ok,
      error: logError.message
    }, "warn");
    return null;
  }
}

function upsertMcpDelivery(project, message, roleId, status = "responded") {
  project.agentDeliveries ||= [];
  const now = new Date().toISOString();
  const existing = project.agentDeliveries.find((delivery) => (
    delivery.messageId === message.id
    && delivery.roleId === roleId
    && delivery.submissionProvider === "mcp"
  ));
  if (existing) {
    existing.status = status;
    existing.updatedAt = now;
    existing.respondedAt ||= status === "responded" ? now : "";
    existing.subtaskId ||= message.subtaskRefs?.[roleId] || "";
    existing.lastFeedback = "Agent handled this message through CosS MCP.";
    return existing;
  }
  const delivery = {
    id: uid("delivery"),
    messageId: message.id,
    windowId: args.windowId || process.env.COSS_MCP_WINDOW_ID || `mcp:${roleId}`,
    roleId,
    taskId: message.taskId || "",
    subtaskId: message.subtaskRefs?.[roleId] || "",
    status,
    attempts: 1,
    createdAt: now,
    updatedAt: now,
    sentAt: now,
    submittedAt: now,
    respondedAt: status === "responded" ? now : "",
    waitingAt: "",
    canceledAt: "",
    submissionProvider: "mcp",
    submissionMethod: "mcp-tool-call",
    submissionDetail: "Agent received the message through CosS MCP instead of terminal injection.",
    permissionMode: "",
    permissionLabel: "",
    responseWatchStartedAt: now,
    stuckCheckAt: "",
    stuckDetectedAt: "",
    lastFeedback: "Agent handled this message through CosS MCP.",
    lastError: "",
    autoWorkflow: Boolean(message.autoWorkflow),
    autoWorkflowSourceEventId: "",
    deliveryFilePath: "",
    deliveryFileAbsolutePath: ""
  };
  project.agentDeliveries.push(delivery);
  project.agentDeliveries = project.agentDeliveries.slice(-300);
  return delivery;
}

function safeProjectPath(project, relativePath) {
  const root = path.resolve(project.path || process.cwd());
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error("Path escapes the project directory");
  }
  return { root, target };
}

async function withState(mutator) {
  const state = await readState();
  const result = await mutator(state);
  await writeState(state);
  return result;
}

async function toolListRoles(input = {}) {
  const state = await readState();
  const project = getProject(state, input.projectId);
  const task = getTask(project, input.taskId);
  const currentRoleId = (() => {
    const rawRoleId = String(input.roleId || args.roleId || process.env.COSS_MCP_ROLE_ID || process.env.COSS_ROLE_ID || "").trim();
    return roleIds.has(rawRoleId) ? rawRoleId : "";
  })();
  const windows = project?.windows || [];
  const roles = roleTemplates.map((role) => {
    const agentWindows = windows.filter((win) => (
      win.roleId === role.id &&
      win.type === "terminal" &&
      (win.terminalMode === "agent" || win.agentProvider)
    ));
    const taskSubtasks = (task?.subtasks || [])
      .filter((subtask) => subtask.roleId === role.id)
      .map((subtask) => ({
        id: subtask.id,
        title: subtask.title,
        status: subtask.status || "idle"
      }));
    return {
      id: role.id,
      name: role.name,
      englishName: role.englishName || role.name,
      capabilities: getRoleCapabilities(role.id),
      activeAgentCount: agentWindows.length,
      activeAgentWindowIds: agentWindows.map((win) => win.id).filter(Boolean),
      taskSubtaskCount: taskSubtasks.length,
      taskSubtasks
    };
  });
  return {
    ok: true,
    project: project ? { id: project.id, name: project.name, path: project.path || "" } : null,
    task: task ? { id: task.id, title: task.title, status: task.status || "" } : null,
    currentRoleId,
    validRoleIds: roleTemplates.map((role) => role.id),
    count: roles.length,
    roles,
    instructions: "CosS v0.10 uses a central linear workflow Kernel. Agents cannot directly dispatch other roles. Complete only the assigned step; the Kernel starts the next preplanned step after status done."
  };
}
async function toolGetContext(input = {}) {
  const state = await readState();
  const project = getProject(state, input.projectId);
  const roleId = getContextRoleId(input);
  const task = getTask(project, input.taskId);
  const subtask = getSubtask(task, roleId, input.subtaskId);
  const poolInbox = listAgentPoolMessages(project, roleId, { taskId: input.taskId });
  const inbox = poolInbox.length > 0
    ? poolInbox
    : (project?.messages || []).filter((message) => (
      message.toRoleIds?.includes(roleId)
      && !(message.readBy || []).includes(roleId)
    ));
  return {
    ok: true,
    userDataDir,
    project: project ? { id: project.id, name: project.name, path: project.path } : null,
    projectMemory: buildProjectMemoryContext(project),
    role: roleTemplates.find((role) => role.id === roleId) || { id: roleId, name: roleId },
    task: task ? { id: task.id, title: task.title, goal: task.goal, status: task.status } : null,
    taskBoard: task ? buildTaskBoard(project, task, roleId).orchestrator : null,
    subtask: subtask ? {
      id: subtask.id,
      roleId: subtask.roleId,
      title: subtask.title,
      description: subtask.description,
      status: subtask.status
    } : null,
    inboxCount: inbox.length,
    agentPool: project?.path ? {
      roleId,
      inboxPath: `.coss/agent-pools/${roleId}/inbox`,
      messageCount: poolInbox.length
    } : null,
    settings: {
      autoWorkflowEnabled: state.settings?.agentAutoWorkflowEnabled === true,
      autoWorkflowPaused: state.settings?.agentAutoWorkflowPaused === true
    }
  };
}

async function toolReadInbox(input = {}) {
  return toolPoolRead(input);
}

async function toolClaimMessage(input = {}) {
  return toolPoolClaim(input);
}

async function toolPoolRead(input = {}) {
  return withState(async (state) => {
    const project = getProject(state, input.projectId);
    const roleId = getContextRoleId(input);
    if (!project) {
      throw new Error("project not found");
    }
    const limit = Math.max(1, Math.min(Number(input.limit) || 12, 50));

    (project.messages || [])
      .filter((message) => message.toRoleIds?.includes(roleId))
      .filter((message) => !message.agentPoolPaths?.[roleId])
      .forEach((message) => writeAgentPoolMessage(project, message, roleId, (message.readBy || []).includes(roleId) ? "running" : "idle"));

    const messages = listAgentPoolMessages(project, roleId, input)
      .slice(0, limit)
      .map((message) => ({
        id: message.id,
        fromRoleId: message.fromRoleId,
        toRoleIds: message.toRoleIds,
        taskId: message.taskId || "",
        subtaskId: message.subtaskRefs?.[roleId] || getSubtaskForMessage(getTask(project, message.taskId || input.taskId), roleId, message.id)?.id || "",
        channelType: message.channelType || "",
        source: message.source,
        status: message.status || "idle",
        content: message.content,
        createdAt: message.createdAt,
        startedAt: message.startedAt || "",
        poolPath: message.poolPath || getAgentPoolRelativePath(roleId, message.id),
        read: message.status === "running"
      }));
    return {
      ok: true,
      roleId,
      poolPath: project.path ? `.coss/agent-pools/${roleId}/inbox` : "",
      count: messages.length,
      messages
    };
  });
}

async function toolPoolClaim(input = {}) {
  const messageId = String(input.messageId || "").trim();
  if (!messageId) {
    throw new Error("messageId is required");
  }
  return withState(async (state) => {
    const project = getProject(state, input.projectId);
    const roleId = getContextRoleId(input);
    const message = project?.messages?.find((item) => item.id === messageId);
    if (!project || !message) {
      throw new Error("message not found");
    }
    if (!message.toRoleIds?.includes(roleId)) {
      throw new Error(`message is not addressed to ${roleId}`);
    }
    if (message.source !== "orchestrator-dispatch") {
      throw new Error("Only orchestrator-dispatch messages can be started in CosS v0.10. Direct Agent messages are disabled.");
    }
    const task = getTask(project, message.taskId || input.taskId);
    const linkedSubtask = getPreferredSubtask(project, task, roleId, { ...input, messageId: message.id });
    const poolEnvelope = readAgentPoolEnvelope(project, roleId, message.id) || buildAgentPoolEnvelope(project, message, roleId, "idle");
    const now = new Date().toISOString();
    if (task && linkedSubtask) {
      message.subtaskRefs ||= {};
      message.subtaskRefs[roleId] = linkedSubtask.id;
      setActiveSubtaskId(project, task.id, roleId, linkedSubtask.id);
      if (normalizeSubtaskStatus(linkedSubtask.status) !== "done") {
        kernel.claimStep({
          project,
          task,
          subtask: linkedSubtask,
          roleId,
          phase: "running",
          messageId: message.id
        });
      }
    }
    poolEnvelope.status = "running";
    poolEnvelope.startedAt ||= now;
    poolEnvelope.runningBy ||= roleId;
    poolEnvelope.subtaskId = linkedSubtask?.id || poolEnvelope.subtaskId || "";
    const poolPath = getAgentPoolRelativePath(roleId, message.id);
    const absolutePath = getAgentPoolAbsolutePath(project, roleId, message.id);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, `${JSON.stringify(poolEnvelope, null, 2)}\n`, "utf8");
    message.readBy = Array.from(new Set([...(message.readBy || []), roleId]));
    message.agentPoolPaths ||= {};
    message.agentPoolPaths[roleId] = poolPath;
    message.agentPoolStatus = "running";
    const delivery = upsertMcpDelivery(project, message, roleId, "responded");
    appendAgentEvent(project, {
      roleId,
      fromRoleId: roleId,
      taskId: message.taskId || "",
      subtaskId: linkedSubtask?.id || "",
      status: "running",
      type: "mcp-message-running",
      message: `Started CosS message ${message.id}.`
    });
    appendLogEvent("mcp.message.started", {
      projectId: project.id,
      roleId,
      messageId: message.id,
      poolPath,
      deliveryId: delivery.id,
      taskId: message.taskId || ""
    });
    return { ok: true, messageId: message.id, poolPath, deliveryId: delivery.id, subtaskId: linkedSubtask?.id || "" };
  });
}

async function toolListTasks(input = {}) {
  const state = await readState();
  const project = getProject(state, input.projectId);
  const roleId = getContextRoleId(input);
  const includeDone = input.includeDone === true;
  const tasks = (project?.tasks || [])
    .filter((task) => includeDone || task.status !== "done")
    .map((task) => ({
      id: task.id,
      title: task.title,
      goal: task.goal,
      status: task.status,
      subtasks: (task.subtasks || [])
        .filter((subtask) => !input.onlyMine || subtask.roleId === roleId)
        .map((subtask) => ({
          id: subtask.id,
          roleId: subtask.roleId,
          title: subtask.title,
          description: subtask.description,
          status: subtask.status
        }))
    }));
  return { ok: true, roleId, count: tasks.length, tasks };
}

async function toolClaimTask(input = {}) {
  return toolClaimStep(input);
}

async function toolReportStatus(input = {}) {
  const status = normalizeAgentEventStatus(input.status);
  if (!status) {
    throw new Error("status must be idle, running, or done");
  }
  return withState(async (state) => {
    const project = getProject(state, input.projectId);
    const roleId = getContextRoleId(input);
    const task = getTask(project, input.taskId);
    const subtask = getPreferredSubtask(project, task, roleId, input);
    if (!project) {
      throw new Error("project not found");
    }
    if (task && subtask) {
      kernel.markStepStatus({
        project,
        task,
        subtask,
        roleId,
        status,
        message: input.message || status
      });
      if (status === "done") {
        clearActiveSubtaskId(project, task.id, roleId, subtask.id);
      } else {
        setActiveSubtaskId(project, task.id, roleId, subtask.id);
      }
    }
    const event = appendAgentEvent(project, {
      roleId,
      fromRoleId: roleId,
      taskId: task?.id || input.taskId || "",
      subtaskId: subtask?.id || input.subtaskId || "",
      status,
      type: "mcp-status",
      message: input.message || status
    });
    appendLogEvent("mcp.status.reported", {
      projectId: project.id,
      roleId,
      taskId: task?.id || input.taskId || "",
      subtaskId: subtask?.id || input.subtaskId || "",
      status,
      eventId: event.id
    });
    return { ok: true, status, eventId: event.id, taskStatus: task?.status || "" };
  });
}

function normalizeArtifacts(value = []) {
  return kernel.normalizeArtifacts(value);
}

function buildTaskBoard(project, task, roleId = "") {
  return kernel.buildTaskBoard(project, task, roleId);
}

async function toolGetTaskBoard(input = {}) {
  const state = await readState();
  const project = getProject(state, input.projectId);
  const roleId = getContextRoleId(input);
  const task = getTask(project, input.taskId);
  return buildTaskBoard(project, task, roleId);
}

async function toolClaimStep(input = {}) {
  return withState(async (state) => {
    const project = getProject(state, input.projectId);
    const roleId = getContextRoleId(input);
    const task = getTask(project, input.taskId);
    const subtask = getPreferredSubtask(project, task, roleId, input);
    if (!project || !task || !subtask) {
      throw new Error("assigned orchestrator step not found");
    }
    const orchestrator = ensureTaskOrchestrator(task);
    const step = getStepBySubtask(task, subtask.id);
    if (!step || step.roleId !== roleId) {
      throw new Error("step is not assigned to this role");
    }
    const claimed = kernel.claimStep({
      project,
      task,
      subtask,
      roleId,
      phase: "running",
      messageId: input.messageId || step.assignedMessageId || ""
    });
    setActiveSubtaskId(project, task.id, roleId, subtask.id);
    appendLogEvent("mcp.orchestrator.step.started", {
      projectId: project.id,
      taskId: task.id,
      roleId,
      stepId: step.id,
      subtaskId: subtask.id
    });
    return { ok: true, taskId: task.id, stepId: step.id, subtaskId: subtask.id, phase: claimed.step.phase, status: "running", lease: claimed.step.lease };
  });
}

async function toolHeartbeatStep(input = {}) {
  return withState(async (state) => {
    const project = getProject(state, input.projectId);
    const roleId = getContextRoleId(input);
    const task = getTask(project, input.taskId);
    const subtask = getPreferredSubtask(project, task, roleId, input);
    if (!project || !task || !subtask) {
      throw new Error("assigned orchestrator step not found");
    }
    const result = kernel.heartbeatStep({
      project,
      task,
      subtask,
      roleId,
      message: input.message || "Agent heartbeat"
    });
    appendLogEvent("mcp.orchestrator.step.heartbeat", {
      projectId: project.id,
      taskId: task.id,
      roleId,
      stepId: result.step.id,
      subtaskId: subtask.id,
      expiresAt: result.lease.expiresAt
    });
    return {
      ok: true,
      taskId: task.id,
      stepId: result.step.id,
      subtaskId: subtask.id,
      phase: result.step.phase,
      status: subtask.status,
      lease: result.lease
    };
  });
}

async function toolReleaseStep(input = {}) {
  return withState(async (state) => {
    const project = getProject(state, input.projectId);
    const roleId = getContextRoleId(input);
    const task = getTask(project, input.taskId);
    const subtask = getPreferredSubtask(project, task, roleId, input);
    if (!project || !task || !subtask) {
      throw new Error("assigned orchestrator step not found");
    }
    const result = kernel.releaseStepLease({
      project,
      task,
      subtask,
      roleId,
      reason: input.reason || "manual-release",
      requeue: input.requeue !== false
    });
    if (result.ok) {
      clearActiveSubtaskId(project, task.id, roleId, subtask.id);
    }
    appendLogEvent("mcp.orchestrator.step.lease-released", {
      projectId: project.id,
      taskId: task.id,
      roleId,
      stepId: result.stepId || "",
      subtaskId: result.subtaskId || subtask.id,
      ok: result.ok,
      reason: input.reason || "manual-release"
    });
    return result;
  });
}

async function toolGetKernelEvents(input = {}) {
  const state = await readState();
  const project = getProject(state, input.projectId);
  const roleId = String(input.roleId || args.roleId || process.env.COSS_MCP_ROLE_ID || "").trim();
  const task = getTask(project, input.taskId);
  const board = task ? kernel.buildTaskBoard(project, task, roleId || "") : null;
  const limit = Math.max(1, Math.min(Number(input.limit) || 50, 200));
  const taskId = task?.id || input.taskId || "";
  const type = String(input.type || "").trim();
  const events = (project?.kernelEvents || [])
    .filter((event) => !taskId || event.taskId === taskId)
    .filter((event) => !roleId || event.roleId === roleId)
    .filter((event) => !type || event.type === type)
    .slice(-limit);
  return {
    ok: true,
    project: project ? { id: project.id, name: project.name, path: project.path || "" } : null,
    task: task ? { id: task.id, title: task.title, status: task.status || "" } : null,
    count: events.length,
    events,
    projections: board?.projections || {}
  };
}

async function toolSubmitResult(input = {}) {
  return withState(async (state) => {
    const project = getProject(state, input.projectId);
    const roleId = getContextRoleId(input);
    const task = getTask(project, input.taskId);
    const subtask = getPreferredSubtask(project, task, roleId, input);
    if (!project || !task || !subtask) {
      throw new Error("assigned orchestrator step not found");
    }
    const orchestrator = ensureTaskOrchestrator(task);
    const step = getStepBySubtask(task, subtask.id);
    if (!step || step.roleId !== roleId) {
      throw new Error("step is not assigned to this role");
    }
    const submitted = kernel.submitStepResult({
      project,
      task,
      subtask,
      roleId,
      input
    });
    const status = submitted.status;
    const artifacts = submitted.artifacts;
    const riskLevel = submitted.riskLevel;
    const requiresApproval = submitted.requiresApproval;
    const now = new Date().toISOString();

    const created = [];
    if (status === "done" && !requiresApproval) {
      for (const result of dispatchReadyKernelSteps(project, task)) {
        created.push({
          roleId: result.step.roleId,
          stepId: result.step.id,
          subtaskId: result.subtask.id,
          messageId: result.message.id,
          poolPaths: result.poolPaths,
          source: "preplanned-ready-step"
        });
      }
    }

    if (status === "done") {
      clearActiveSubtaskId(project, task.id, roleId, subtask.id);
    }
    task.status = deriveTaskStatus(task.subtasks || []);
    task.updatedAt = now;
    kernel.appendKernelEvent(project, task, {
      type: "step.result.dispatched",
      roleId,
      stepId: step.id,
      subtaskId: subtask.id,
      payload: {
        status,
        riskLevel,
        createdStepIds: created.map((item) => item.stepId)
      }
    });
    appendAgentEvent(project, {
      roleId,
      fromRoleId: roleId,
      taskId: task.id,
      subtaskId: subtask.id,
      status: subtask.status,
      type: "mcp-structured-result",
      message: String(input.summary || input.message || status).slice(0, 500)
    });
    rebuildProjectMemory(project, "mcp-submit-result");
    appendLogEvent("mcp.orchestrator.result.submitted", {
      projectId: project.id,
      taskId: task.id,
      roleId,
      stepId: step.id,
      subtaskId: subtask.id,
      status,
      createdStepIds: created.map((item) => item.stepId),
      artifacts: artifacts.length,
      requiresApproval
    });
    return { ok: true, taskId: task.id, stepId: step.id, subtaskId: subtask.id, status: subtask.status, createdSteps: created, taskStatus: task.status };
  });
}

async function toolAcquireLock(input = {}) {
  return withState(async (state) => {
    const project = getProject(state, input.projectId);
    const roleId = getContextRoleId(input);
    const task = getTask(project, input.taskId);
    const resource = String(input.resource || input.path || "").trim();
    if (!project || !task || !resource) {
      throw new Error("project, task, and resource are required");
    }
    const result = kernel.acquireLock({
      project,
      task,
      roleId,
      resource,
      reason: input.reason || ""
    });
    appendLogEvent("mcp.orchestrator.lock.acquired", {
      projectId: project.id,
      taskId: task.id,
      roleId,
      resource,
      lockId: result.lock?.id || result.lockId || "",
      ok: result.ok
    });
    return result;
  });
}

async function toolReleaseLock(input = {}) {
  return withState(async (state) => {
    const project = getProject(state, input.projectId);
    const roleId = getContextRoleId(input);
    const task = getTask(project, input.taskId);
    const resource = String(input.resource || input.path || "").trim();
    if (!project || !task) {
      throw new Error("project and task are required");
    }
    const result = kernel.releaseLock({
      project,
      task,
      roleId,
      resource,
      lockId: input.lockId || ""
    });
    appendLogEvent("mcp.orchestrator.lock.released", {
      projectId: project.id,
      taskId: task.id,
      roleId,
      resource: result.lock?.resource || resource,
      lockId: result.lock?.id || input.lockId || "",
      ok: result.ok
    });
    return result;
  });
}

async function toolRequestApproval(input = {}) {
  return withState(async (state) => {
    const project = getProject(state, input.projectId);
    const roleId = getContextRoleId(input);
    const task = getTask(project, input.taskId);
    const subtask = getPreferredSubtask(project, task, roleId, input);
    if (!project || !task) {
      throw new Error("project and task are required");
    }
    const result = kernel.requestApproval({
      project,
      task,
      subtask,
      roleId,
      riskLevel: input.riskLevel || "high",
      summary: input.summary || input.message || "Approval requested."
    });
    appendLogEvent("mcp.orchestrator.approval.requested", { projectId: project.id, taskId: task.id, roleId, approvalId: result.approval.id });
    return result;
  });
}

const toolDefinitions = [
  {
    name: "coss_get_context",
    description: "Get the current CosS project, role, task, subtask, and unread inbox summary.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        subtaskId: { type: "string" }
      }
    },
    handler: toolGetContext
  },
  {
    name: "coss_list_roles",
    description: "List valid CosS Agent roles and their capability sandbox. Agents cannot invent roles or dispatch directly.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" }
      }
    },
    handler: toolListRoles
  },
  {
    name: "coss_get_task_board",
    description: "Read the central CosS Kernel task board, shared state, linear workflow steps, locks, approvals, and artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" }
      }
    },
    handler: toolGetTaskBoard
  },
  {
    name: "coss_pool_read",
    description: "Read this Agent role's file-backed message pool inbox under .coss/agent-pools/<roleId>/inbox.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        includeRunning: { type: "boolean" },
        limit: { type: "number" }
      }
    },
    handler: toolPoolRead
  },
  {
    name: "coss_pool_claim",
    description: "Start this Agent role's next assigned message from the file-backed message pool.",
    inputSchema: {
      type: "object",
      required: ["messageId"],
      properties: {
        messageId: { type: "string" },
        projectId: { type: "string" },
        roleId: { type: "string" }
      }
    },
    handler: toolPoolClaim
  },
  {
    name: "coss_list_tasks",
    description: "List CosS tasks and subtasks, optionally filtered to this Agent role.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        includeDone: { type: "boolean" },
        onlyMine: { type: "boolean" }
      }
    },
    handler: toolListTasks
  },
  {
    name: "coss_claim_task",
    description: "Start this role's assigned workflow step.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        subtaskId: { type: "string" },
        message: { type: "string" }
      }
    },
    handler: toolClaimTask
  },
  {
    name: "coss_claim_step",
    description: "Start this Agent role's assigned central Kernel workflow step before doing work.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        subtaskId: { type: "string" },
        messageId: { type: "string" }
      }
    },
    handler: toolClaimStep
  },
  {
    name: "coss_heartbeat_step",
    description: "Renew the lease for this Agent role's running Kernel step so CosS can detect stalled work.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        subtaskId: { type: "string" },
        message: { type: "string" }
      }
    },
    handler: toolHeartbeatStep
  },
  {
    name: "coss_release_step",
    description: "Release this Agent role's running Kernel step and optionally return it to idle.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        subtaskId: { type: "string" },
        reason: { type: "string" },
        requeue: { type: "boolean" }
      }
    },
    handler: toolReleaseStep
  },
  {
    name: "coss_get_kernel_events",
    description: "Read the durable CosS Kernel event stream and task-board projections for audit and recovery.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        type: { type: "string" },
        limit: { type: "number" }
      }
    },
    handler: toolGetKernelEvents
  },
  {
    name: "coss_submit_result",
    description: "Submit structured Agent results to the central Kernel. Use status running while working and done when this step is complete.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        subtaskId: { type: "string" },
        status: { type: "string", enum: ["idle", "running", "done"] },
        summary: { type: "string" },
        message: { type: "string" },
        artifacts: { type: "array", items: { type: "object" } },
        usedCapabilities: { type: "array", items: { type: "string" } },
        riskLevel: { type: "string", enum: ["low", "medium", "high"] },
        requiresUserConfirmation: { type: "boolean" }
      }
    },
    handler: toolSubmitResult
  },
  {
    name: "coss_acquire_lock",
    description: "Acquire a central orchestrator resource lock before modifying shared files or external resources.",
    inputSchema: {
      type: "object",
      required: ["resource"],
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        resource: { type: "string" },
        reason: { type: "string" }
      }
    },
    handler: toolAcquireLock
  },
  {
    name: "coss_release_lock",
    description: "Release a resource lock acquired by this Agent role.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        resource: { type: "string" },
        lockId: { type: "string" }
      }
    },
    handler: toolReleaseLock
  },
  {
    name: "coss_request_approval",
    description: "Request orchestrator/user approval for medium or high risk actions before execution.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        subtaskId: { type: "string" },
        riskLevel: { type: "string", enum: ["low", "medium", "high"] },
        summary: { type: "string" },
        message: { type: "string" }
      }
    },
    handler: toolRequestApproval
  },
  {
    name: "coss_report_status",
    description: "Report Agent progress back to CosS and update the mapped subtask status.",
    inputSchema: {
      type: "object",
      required: ["status"],
      properties: {
        status: { type: "string", enum: ["idle", "running", "done"] },
        message: { type: "string" },
        projectId: { type: "string" },
        roleId: { type: "string" },
        taskId: { type: "string" },
        subtaskId: { type: "string" }
      }
    },
    handler: toolReportStatus
  }
];

const tools = new Map(toolDefinitions.map((tool) => [tool.name, tool]));
const defaultMcpProtocolVersion = "2025-06-18";

function negotiateMcpProtocolVersion(value) {
  const version = String(value || "").trim();
  return version || defaultMcpProtocolVersion;
}

function appendMcpServerTrace(eventName, payload = {}, level = "info") {
  appendLogEvent(eventName, {
    projectId: args.projectId || process.env.COSS_MCP_PROJECT_ID || "",
    roleId: args.roleId || process.env.COSS_MCP_ROLE_ID || "",
    ...payload
  }, level);
}

function encodeMessage(message, framing = "content-length") {
  const json = JSON.stringify(message);
  if (framing === "json-line") {
    return `${json}\n`;
  }
  return `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
}

function sendMessage(message, framing = "content-length") {
  process.stdout.write(encodeMessage(message, framing));
}

function makeError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message }
  };
}

async function handleRequest(request, framing = "content-length") {
  const { id, method, params = {} } = request;
  if (!method) {
    return null;
  }

  if (method.startsWith("notifications/")) {
    if (method === "notifications/initialized") {
      appendMcpServerTrace("mcp.server.notification.initialized");
    }
    return null;
  }

  if (method === "initialize") {
    appendMcpServerTrace("mcp.server.initialize", {
      framing,
      clientProtocolVersion: params.protocolVersion || "",
      clientName: params.clientInfo?.name || "",
      clientVersion: params.clientInfo?.version || ""
    });
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: negotiateMcpProtocolVersion(params.protocolVersion),
        capabilities: {
          tools: {},
          experimental: {
            "claude/channel": {}
          }
        },
        serverInfo: { name: "coss", version: packageVersion },
        instructions: "CosS v0.10 uses a central linear workflow Kernel only. Use coss_get_context, coss_get_task_board, coss_list_roles, coss_pool_read, coss_pool_claim, coss_claim_step, and coss_submit_result. Complete only the assigned step; the Kernel starts the next preplanned step after status done."
      }
    };
  }

  if (method === "ping") {
    appendMcpServerTrace("mcp.server.ping");
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "tools/list") {
    appendMcpServerTrace("mcp.server.tools.listed", { toolCount: toolDefinitions.length });
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: toolDefinitions.map(({ handler, ...tool }) => tool)
      }
    };
  }

  if (method === "tools/call") {
    const name = params.name;
    const tool = tools.get(name);
    if (!tool) {
      return makeError(id, -32602, `Unknown tool: ${name}`);
    }
    try {
      const toolInput = params.arguments || {};
      const result = await tool.handler(toolInput);
      await recordMcpToolCallEvent(name, toolInput, result, true);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: false
        }
      };
    } catch (error) {
      await recordMcpToolCallEvent(name, params.arguments || {}, {}, false, error.message);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: error.message }, null, 2) }],
          isError: true
        }
      };
    }
  }

  if (method === "resources/list") {
    appendMcpServerTrace("mcp.server.resources.listed");
    return { jsonrpc: "2.0", id, result: { resources: [] } };
  }

  if (method === "resources/templates/list") {
    appendMcpServerTrace("mcp.server.resource-templates.listed");
    return { jsonrpc: "2.0", id, result: { resourceTemplates: [] } };
  }

  if (method === "prompts/list") {
    appendMcpServerTrace("mcp.server.prompts.listed");
    return { jsonrpc: "2.0", id, result: { prompts: [] } };
  }

  appendMcpServerTrace("mcp.server.method-not-found", { method }, "warn");
  return makeError(id, -32601, `Method not found: ${method}`);
}

let inputBuffer = Buffer.alloc(0);

function tryReadContentLengthHeader(text) {
  const match = text.match(/Content-Length:\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function findHeaderBoundary(buffer) {
  const crlfIndex = buffer.indexOf("\r\n\r\n");
  const lfIndex = buffer.indexOf("\n\n");
  if (crlfIndex === -1 && lfIndex === -1) {
    return null;
  }
  if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex)) {
    return { index: crlfIndex, length: 4 };
  }
  return { index: lfIndex, length: 2 };
}

function processInputBuffer() {
  while (inputBuffer.length > 0) {
    const headerBoundary = findHeaderBoundary(inputBuffer);
    if (!headerBoundary) {
      const newline = inputBuffer.indexOf("\n");
      if (newline === -1) {
        return;
      }
      const line = inputBuffer.slice(0, newline).toString("utf8").trim();
      inputBuffer = inputBuffer.slice(newline + 1);
      if (!line) {
        continue;
      }
      handleJsonMessage(line, "json-line");
      continue;
    }

    const header = inputBuffer.slice(0, headerBoundary.index).toString("utf8");
    const contentLength = tryReadContentLengthHeader(header);
    if (!contentLength) {
      appendMcpServerTrace("mcp.server.invalid-header", { header: header.slice(0, 200) }, "warn");
      inputBuffer = inputBuffer.slice(headerBoundary.index + headerBoundary.length);
      continue;
    }
    const messageStart = headerBoundary.index + headerBoundary.length;
    const messageEnd = messageStart + contentLength;
    if (inputBuffer.length < messageEnd) {
      return;
    }
    const body = inputBuffer.slice(messageStart, messageEnd).toString("utf8");
    inputBuffer = inputBuffer.slice(messageEnd);
    handleJsonMessage(body, "content-length");
  }
}

function handleJsonMessage(text, framing = "content-length") {
  let request;
  try {
    request = JSON.parse(text);
  } catch (error) {
    appendMcpServerTrace("mcp.server.parse.failed", { error: error.message, text: text.slice(0, 200) }, "warn");
    sendMessage(makeError(null, -32700, error.message), framing);
    return;
  }
  handleRequest(request, framing)
    .then((response) => {
      if (response) {
        sendMessage(response, framing);
      }
    })
    .catch((error) => {
      sendMessage(makeError(request.id ?? null, -32603, error.message), framing);
    });
}

process.on("uncaughtException", (error) => {
  appendMcpServerTrace("mcp.server.uncaught-exception", { error: error.stack || error.message }, "error");
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

process.on("unhandledRejection", (reason) => {
  const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
  appendMcpServerTrace("mcp.server.unhandled-rejection", { error: message }, "error");
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

async function runCliToolCall() {
  const tool = tools.get(args.callTool);
  if (!tool) {
    throw new Error(`Unknown tool: ${args.callTool}`);
  }
  const input = args.argsJson ? JSON.parse(args.argsJson) : {};
  try {
    const result = await tool.handler(input);
    await recordMcpToolCallEvent(args.callTool, input, result, true);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    await recordMcpToolCallEvent(args.callTool, input, {}, false, error.message);
    throw error;
  }
}

if (args.callTool) {
  runCliToolCall().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
} else {
  appendMcpServerTrace("mcp.server.started", {
    userDataDir,
  });
  process.stdin.on("end", () => {
    appendMcpServerTrace("mcp.server.stdin.ended");
  });
  process.stdin.on("error", (error) => {
    appendMcpServerTrace("mcp.server.stdin.error", { error: error.message }, "error");
  });
  process.stdin.on("data", (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    processInputBuffer();
  });
  process.stdin.resume();
}
