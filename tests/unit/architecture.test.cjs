const assert = require("node:assert/strict");
const test = require("node:test");
const { IPC_CHANNELS, IPC_EVENTS } = require("../../src/shared/ipc-contracts.cjs");
const state = require("../../src/shared/state-contracts.cjs");
const { createStorageService } = require("../../src/main/services/storage-service.cjs");
const { createLlmService } = require("../../src/main/services/llm-service.cjs");

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
