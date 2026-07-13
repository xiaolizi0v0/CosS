const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { IPC_CHANNELS, IPC_EVENTS } = require("../../src/shared/ipc-contracts.cjs");
const state = require("../../src/shared/state-contracts.cjs");
const { createStorageService } = require("../../src/main/services/storage-service.cjs");
const { createLlmService } = require("../../src/main/services/llm-service.cjs");
const { createAgentRuntime } = require("../../src/main/services/agent-runtime.cjs");
const { createTerminalService } = require("../../src/main/services/terminal-service.cjs");
const { createProjectFileService } = require("../../src/main/services/project-file-service.cjs");
const { createMcpConfigService } = require("../../src/main/services/mcp-config-service.cjs");

test("IPC contracts keep the public state channels stable", () => {
  assert.equal(IPC_CHANNELS.STATE_LOAD, "state:load");
  assert.equal(IPC_CHANNELS.STATE_SAVE, "state:save");
  assert.equal(IPC_EVENTS.TERMINAL_AGENT_EVENT, "terminal:agent-event");
});

test("state contracts expose versioned domain statuses", () => {
  assert.equal(state.STATE_SCHEMA_VERSION, 2);
  assert.ok(state.TASK_STATUSES.includes("running"));
  assert.ok(state.KERNEL_PHASES.includes("done"));
});

test("storage service resolves all user data paths from one root", () => {
  const service = createStorageService({ app: { getPath: () => "C:\\Temp\\CosS" } });
  assert.equal(service.getDataFilePath(), "C:\\Temp\\CosS\\coss-workspace-state.json");
  assert.equal(service.getSqliteFilePath(), "C:\\Temp\\CosS\\coss-workspace.sqlite");
  assert.equal(service.getBackupDirectory(), "C:\\Temp\\CosS\\backups");
});

test("LLM service normalizes a linear planner result outside main process entry", async () => {
  const service = createLlmService({
    env: {
      COSS_LLM_MOCK_RESPONSE: JSON.stringify({
        summary: "Build the feature",
        subtasks: [
          { roleId: "product-manager", title: "Define requirements", description: "Write acceptance criteria." },
          { roleId: "tech-lead", title: "Design solution", description: "Define interfaces." }
        ]
      })
    },
    sanitizeLogText: (value, maxLength) => String(value || "").slice(0, maxLength),
    appendLogEvent: () => undefined
  });
  const result = await service.handlePlanTask(null, {
    roles: [
      { id: "product-manager", name: "Product Manager", description: "requirements" },
      { id: "tech-lead", name: "Tech Lead", description: "architecture" }
    ]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.subtasks.map((item) => item.dependsOn), [[], ["step-1"]]);
  assert.deepEqual(result.firstRoundRoleIds, ["product-manager"]);
});

test("LLM service extracts balanced JSON with trailing text", () => {
  const service = createLlmService();
  assert.deepEqual(service.extractJsonObject('{"ok":true,"nested":{"value":1}} trailing note'), { ok: true, nested: { value: 1 } });
});

test("Agent runtime keeps CLI detection outside the main process entry", () => {
  const service = createAgentRuntime({
    getWindowsShellEnv: () => ({ PATH: "C:\\Tools" }),
    findCommandPaths: (command) => [command],
    preferWindowsCmdShim: (command) => command,
    runCommandForStatus: (command) => ({ status: 0, stdout: command === "npm" ? "10.0.0" : `${command} 1.2.3`, stderr: "" }),
    commandOutput: (result) => `${result.stdout || ""}${result.stderr || ""}`.trim(),
    commandErrorDetail: () => "",
    getNpmCandidates: () => ["npm"],
    getNpmCommand: () => "npm",
    commandExists: () => true,
    getCodexAuthState: () => ({ loggedIn: true }),
    getCodeBuddyAuthState: () => ({ loggedIn: true }),
    getClaudeAuthState: () => ({ loggedIn: true }),
    ensureClaudeOnboardingCompleted: () => ({ completed: true }),
    getCodexInstallCommand: () => "npm install -g @openai/codex",
    getCodeBuddyInstallCommand: () => "npm install -g @tencent-ai/codebuddy-code"
  });
  const result = service.getCodexCommandStatus();
  assert.equal(result.runnable, true);
  assert.equal(result.version, "codex 1.2.3");
  assert.equal(result.npm.usable, true);
});

test("terminal service owns session transcripts and renderer forwarding", () => {
  const service = createTerminalService({ maxTranscriptLength: 8 });
  const sent = [];
  const target = { isDestroyed: () => false, send: (...args) => sent.push(args) };
  service.webContents.set("terminal-1", target);
  service.sendData(null, "terminal-1", "123456789");
  service.sendExit(null, "terminal-1", 0);
  assert.equal(service.transcripts.get("terminal-1"), "23456789");
  assert.deepEqual(sent, [
    ["terminal:data", { id: "terminal-1", data: "123456789" }],
    ["terminal:exit", { id: "terminal-1", exitCode: 0 }]
  ]);
});

test("project file service enforces the project boundary", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "coss-file-service-"));
  try {
    const service = createProjectFileService({ appendLogEvent: () => undefined });
    assert.equal(service.writeProjectFile(null, { projectPath: root, filePath: "notes.md", content: "hello" }).ok, true);
    assert.equal(service.readProjectFile(null, { projectPath: root, filePath: "notes.md" }).content, "hello");
    assert.equal(service.listProjectFiles(null, root).files.some((item) => item.path === "notes.md"), true);
    assert.equal(service.readProjectFile(null, { projectPath: root, filePath: "../outside.txt" }).ok, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("MCP config service builds a portable server entry outside main.cjs", () => {
  const service = createMcpConfigService({
    resolveNodeCommandForMcp: () => "node",
    getStorageDirectory: () => "C:\\Temp\\CosS",
    getProjectRoot: (value) => value,
    writeJsonAtomic: () => undefined,
    getLogDirectory: () => "C:\\Temp\\CosS\\logs",
    appendLogEvent: () => undefined,
    appVersion: "0.11.0"
  });
  const info = service.getMcpServerInfo({ projectId: "project-1", roleId: "tech-lead" });
  const entry = service.buildMcpServerEntry({ projectId: "project-1" });
  assert.equal(info.command, "node");
  assert.equal(info.args.includes("--project-id"), true);
  assert.equal(entry.type, "stdio");
  assert.equal(entry.env.COSS_MCP_PROJECT_ID, "project-1");
});

test("default world map follows the Tiled object and tile layer contract", () => {
  const map = JSON.parse(fs.readFileSync(path.join(__dirname, "../../src/world/maps/default-meadow.json"), "utf8"));
  const tileLayer = map.layers.find((layer) => layer.type === "tilelayer");
  const objectLayer = map.layers.find((layer) => layer.type === "objectgroup");
  assert.equal(map.tilewidth, 32);
  assert.equal(tileLayer.data.length, map.width * map.height);
  assert.equal(objectLayer.objects.find((item) => item.name === "announcement-board").properties[0].value, "publish-world-task");
});
