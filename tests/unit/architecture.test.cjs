const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { IPC_CHANNELS, IPC_EVENTS } = require("../../src/shared/ipc-contracts.cjs");
const state = require("../../src/shared/state-contracts.cjs");
const { createStorageService } = require("../../src/main/services/storage-service.cjs");
const { createLlmService } = require("../../src/main/services/llm-service.cjs");
const { createAgentRuntime } = require("../../src/main/services/agent-runtime.cjs");
const { createTerminalService } = require("../../src/main/services/terminal-service.cjs");
const { createProjectFileService } = require("../../src/main/services/project-file-service.cjs");
const { createMcpConfigService } = require("../../src/main/services/mcp-config-service.cjs");
const worldGenerator = require("../../src/world/world-generator.js");
const worldTerrainRenderer = require("../../src/world/world-terrain-renderer.js");
const worldCameraController = require("../../src/world/world-camera-controller.js");

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
    appVersion: "0.11.1"
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
  assert.equal(map.tilewidth, 80);
  assert.equal(tileLayer.data.length, map.width * map.height);
  assert.equal(map.layers.find((layer) => layer.name === "Stone Paths").data.length, map.width * map.height);
  assert.equal(objectLayer.objects.find((item) => item.name === "announcement-board").properties[0].value, "publish-world-task");
  const roleHouses = objectLayer.objects.filter((item) => item.type === "role-house");
  assert.equal(roleHouses.length, 9);
  assert.equal(roleHouses.every((item) => item.properties.some((property) => property.name === "roleId")), true);
  assert.equal(roleHouses[0].width, 6 * map.tilewidth);
  assert.equal(roleHouses.find((item) => item.name === "tech-lead-home").x, 9 * map.tilewidth);
});

test("procedural world generator creates a deterministic boundary-safe village", () => {
  const first = worldGenerator.generateWorldLayout({ seed: "unit-world" });
  const second = worldGenerator.generateWorldLayout({ seed: "unit-world" });
  assert.deepEqual(first, second);
  assert.equal(first.map.generation, worldGenerator.version);
  assert.equal(first.map.width, 88);
  assert.equal(first.map.height, 64);
  assert.equal(first.map.tiledUrl, "");
  assert.ok(first.map.cameraSafeInsetX >= 14);
  assert.ok(first.map.cameraSafeInsetBottom >= 14);
  const meadowLayer = first.map.tileLayers.find((layer) => layer.name === "Flower Meadow");
  const roadLayer = first.map.tileLayers.find((layer) => layer.name === "Stone Paths");
  assert.equal(meadowLayer.data.length, first.map.width * first.map.height);
  assert.equal(roadLayer.data.length, first.map.width * first.map.height);
  assert.ok(meadowLayer.data.includes(1));
  assert.ok(meadowLayer.data.includes(2));
  assert.ok(roadLayer.data.filter(Boolean).length > 150);
  const houses = first.objects.filter((object) => object.type === "role-house");
  const horizonForest = first.objects.filter((object) => object.generationBand === "horizon-forest");
  assert.equal(houses.length, 9);
  assert.ok(horizonForest.length >= 90);
  assert.deepEqual(new Set(horizonForest.map((tree) => tree.horizonRow)), new Set([1, 2]));
  assert.equal(horizonForest.every((tree) => tree.y < first.map.horizonRows), true);
  assert.equal(horizonForest.every((tree) => tree.y >= first.map.horizonRows - 1.35), true);
  assert.equal(horizonForest
    .filter((tree) => tree.horizonRow === 2)
    .every((tree) => tree.y + tree.height >= first.map.horizonRows - 0.1), true);
  assert.ok(Math.min(...horizonForest.map((tree) => tree.x)) <= first.map.cameraSafeInsetX - 4);
  assert.ok(Math.max(...horizonForest.map((tree) => tree.x + tree.width)) >= first.map.width - first.map.cameraSafeInsetX + 4);
  assert.equal(Object.keys(first.homePositions).length, 9);
  assert.equal(houses.every((house) => house.action === "enter-world-home"), true);
  assert.equal(houses.every((house) => {
    const home = first.homePositions[house.roleId];
    return home.x > house.x
      && home.x < house.x + house.width
      && home.y > house.y
      && home.y < house.y + house.height;
  }), true);
});

test("world terrain renderer uses flower meadow tiles, road edges, and a camera follow target", () => {
  const engineSource = fs.readFileSync(path.join(__dirname, "../../src/world/world-engine.js"), "utf8");
  const cameraSource = fs.readFileSync(path.join(__dirname, "../../src/world/world-camera-controller.js"), "utf8");
  const assetSource = fs.readFileSync(path.join(__dirname, "../../src/world/world-assets.js"), "utf8");
  assert.match(assetSource, /grassPinkFlower:\s*"base\/grass_pink_flower\.png"/);
  assert.match(assetSource, /grassWhiteDaisy:\s*"base\/grass_white_daisy\.png"/);
  assert.match(assetSource, /plainGrass:\s*"base\/plain_grass_tile\.png"/);
  const horizontalRoad = { width: 3, height: 3, data: [0, 0, 0, 1, 2, 3, 0, 0, 0] };
  assert.deepEqual(
    worldTerrainRenderer.getRoadTileAppearance(horizontalRoad, 1, 1, { width: 3, height: 3 }),
    { baseKey: "coss-base-stoneFlat2", edges: ["top", "bottom"] }
  );
  assert.equal(typeof worldCameraController.create, "function");
  assert.match(engineSource, /CossWorldTerrainRenderer/);
  assert.match(engineSource, /CossWorldCameraController/);
  assert.match(cameraSource, /camera\.startFollow\(this\.target/);
  assert.match(cameraSource, /mode:\s*"camera-follow-target"/);
  assert.doesNotMatch(cameraSource, /camera\.scroll[XY]\s*=/);
});

test("world interior uses a black backdrop in Phaser, Canvas, and CSS", () => {
  const engineSource = fs.readFileSync(path.join(__dirname, "../../src/world/world-engine.js"), "utf8");
  const styleSource = fs.readFileSync(path.join(__dirname, "../../src/styles.css"), "utf8");
  assert.match(engineSource, /backdrop\.fillStyle\(0x000000, 1\)/);
  assert.match(engineSource, /ctx\.fillStyle = "#000000"/);
  assert.match(styleSource, /\.world-workspace\.world-interior-workspace\s*\{\s*background: #000000;/);
});

test("world role sprites preserve each animation frame aspect ratio", () => {
  const engineSource = fs.readFileSync(path.join(__dirname, "../../src/world/world-engine.js"), "utf8");
  assert.match(engineSource, /fitRoleAgentSprite\(sprite, targetHeight = 0\)/);
  assert.match(engineSource, /resolvedHeight \* sourceWidth \/ sourceHeight, resolvedHeight/);
  assert.match(engineSource, /sprite\.on\("animationupdate", refit\)/);
  assert.doesNotMatch(engineSource, /setDisplaySize\(size, size\)/);
  assert.doesNotMatch(engineSource, /setDisplaySize\(78, 78\)/);
});

test("world residents are clickable indoors and idle animations run slowly", () => {
  const engineSource = fs.readFileSync(path.join(__dirname, "../../src/world/world-engine.js"), "utf8");
  const expectedInteriorPositions = {
    "product-manager": [0.73, 0.68],
    "tech-lead": [0.37, 0.70],
    "frontend-engineer": [0.37, 0.70],
    "backend-engineer": [0.37, 0.70],
    "qa-engineer": [0.63, 0.69],
    "ai-agent-engineer": [0.50, 0.72],
    "devops-engineer": [0.50, 0.72],
    "technical-writer": [0.50, 0.73],
    "security-engineer": [0.50, 0.73]
  };
  assert.match(engineSource, /ROLE_ANIMATION_FRAME_RATES = Object\.freeze\(\{ idle: 3, working: 7, door: 8, run: 10 \}\)/);
  Object.entries(expectedInteriorPositions).forEach(([roleId, [xRatio, yRatio]]) => {
    assert.equal(
      engineSource.includes(`"${roleId}": Object.freeze({ xRatio: ${xRatio.toFixed(2)}, yRatio: ${yRatio.toFixed(2)} })`),
      true,
      `${roleId} is missing its scene-safe HomeINT position`
    );
  });
  assert.match(engineSource, /function getInteriorAgentPosition\(roleId, viewportWidth, viewportHeight, sourceWidth, sourceHeight\)/);
  assert.match(engineSource, /room\.x \+ room\.width \* anchor\.xRatio/);
  assert.match(engineSource, /const position = getCanvasInteriorPosition\(roleId, images\)/);
  assert.match(engineSource, /bindAgentInteraction\(hitZone, agent, \{[\s\S]*?checkDrag: false,[\s\S]*?idleCursor: "default"/);
  assert.match(engineSource, /const resident = hitInteriorAgent\(event\);/);
  assert.match(engineSource, /callbacks\.onAgentClick\?\.\(resident\)/);
});

test("world canvas hints share a subtle rounded hover style", () => {
  const engineSource = fs.readFileSync(path.join(__dirname, "../../src/world/world-engine.js"), "utf8");
  assert.match(engineSource, /createWorldHintLabel\(x, y, label, options = \{\}\)/);
  assert.match(engineSource, /fillRoundedRect\(-width \/ 2, -height \/ 2, width, height, 7\)/);
  assert.match(engineSource, /setWorldHintHovered\(hint, hovered\)/);
  assert.match(engineSource, /this\.setWorldHintHovered\(hoverTarget, true\)/);
  assert.match(engineSource, /this\.setWorldHintHovered\(hintLabel, true\)/);
  assert.match(engineSource, /drawAgentStatusHint\(graphics, status\)/);
  assert.match(engineSource, /drawCanvasHintLabel\(ctx, x, y, label, alpha = 0\.68\)/);
  assert.doesNotMatch(engineSource, /backgroundColor: "rgba\(255,255,255,/);
  assert.doesNotMatch(engineSource, /ctx\.fillRect\(pos\.x - 44, pos\.y \+ 26, 88, 21\)/);
});

test("world role UI shows chat membership and reuses portrait avatars", () => {
  const worldSource = fs.readFileSync(path.join(__dirname, "../../src/renderer/world.js"), "utf8");
  const assetSource = fs.readFileSync(path.join(__dirname, "../../src/world/world-assets.js"), "utf8");
  const styleSource = fs.readFileSync(path.join(__dirname, "../../src/styles.css"), "utf8");
  assert.match(assetSource, /portrait: url\(`\$\{asset\.folder\}\/\$\{asset\.file\}\.png`\)/);
  assert.match(worldSource, /getWorldChatMemberRoleIds\(world\)\.includes\(role\.id\)/);
  assert.match(worldSource, /data-world-chat-member="\$\{isChatMember \? "true" : "false"\}"/);
  assert.match(worldSource, /world\.agentRun\.member", "已加入群聊"/);
  assert.match(worldSource, /world\.agentRun\.notMember", "未加入群聊"/);
  assert.match(worldSource, /renderWorldRoleAvatar\(message\.roleId, roleName, "world-chat-avatar"\)/);
  assert.match(worldSource, /renderWorldRoleAvatar\(agent\.roleId, roleName, "world-member-picker-avatar"\)/);
  assert.match(worldSource, /renderWorldRoleAvatar\(role\.id, roleName, "world-agent-profile-avatar"\)/);
  assert.match(styleSource, /\.world-role-avatar img\s*\{[\s\S]*?top: -2%;[\s\S]*?width: 135%;/);
});

test("world execution prompts and handoffs only expose current chat members", () => {
  const worldSource = fs.readFileSync(path.join(__dirname, "../../src/renderer/world.js"), "utf8");
  const executionPromptSource = worldSource.slice(
    worldSource.indexOf("function buildWorldAgentExecutionPrompt"),
    worldSource.indexOf("async function processWorldAgentOutput")
  );
  assert.match(worldSource, /function getWorldOtherChatMembers\(world, agent\) \{[\s\S]*?getWorldChatMembers\(world\)\.filter/);
  assert.match(executionPromptSource, /const otherChatMembers = getWorldOtherChatMembers\(world, agent\)/);
  assert.match(executionPromptSource, /当前群聊其他成员：\$\{otherAgentNames \|\| "暂无"\}/);
  assert.doesNotMatch(executionPromptSource, /\(world\.agents \|\| \[\]\)/);
  assert.match(worldSource, /item\.roleId === roleId && memberRoleIds\.has\(item\.roleId\)/);
  assert.match(worldSource, /居民 @\{\{roleId\}\} 尚未加入当前群聊，本次任务未转发。请先在群聊右上角点击「加入成员」，再重新发布任务/);
  assert.match(worldSource, /未找到角色 @\{\{roleId\}\}，本次任务未转发。请确认角色 ID，并且仅 @当前群聊成员/);
  assert.doesNotMatch(worldSource, /角色创建点/);
  assert.match(worldSource, /Target agent is not a current world chat member/);
});

test("world UI copy is release-ready and hides implementation terminology", () => {
  const rendererSource = fs.readFileSync(path.join(__dirname, "../../src/renderer.js"), "utf8");
  const worldSource = fs.readFileSync(path.join(__dirname, "../../src/renderer/world.js"), "utf8");
  const engineSource = fs.readFileSync(path.join(__dirname, "../../src/world/world-engine.js"), "utf8");
  const localeSource = fs.readFileSync(path.join(__dirname, "../../src/i18n/locales.js"), "utf8");
  const visibleWorldCopy = `${rendererSource}\n${worldSource}\n${engineSource}`;

  [
    "2D Agent 世界 MVP2.0",
    "Phaser 3 World · Camera",
    "Canvas Fallback · 占位精灵",
    "HomeINT 资源加载失败",
    "世界中转站启动",
    "CodeBuddy CLI 输入",
    "暂无 CodeBuddy 运行记录"
  ].forEach((phrase) => assert.doesNotMatch(visibleWorldCopy, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  assert.match(rendererSource, /world\.home\.subtitle", "Agent 协作世界"/);
  assert.match(worldSource, /world\.task\.publisherDesc", "任务发布后，只有当前群聊成员会前往公告栏领取任务/);
  assert.match(localeSource, /"world\.chat\.memberCount": "\{\{joined\}\}\/\{\{total\}\} 位居民已加入"/);

  const context = { window: {} };
  vm.runInNewContext(localeSource, context);
  const worldKeys = new Set([...`${rendererSource}\n${worldSource}`.matchAll(/t\("(world\.[^"]+)"/g)].map((match) => match[1]));
  for (const language of ["zh-CN", "en-US"]) {
    const translations = context.window.COSS_I18N.resources[language].translation;
    for (const key of worldKeys) {
      assert.equal(typeof translations[key], "string", `${language} is missing ${key}`);
      assert.notEqual(translations[key].trim(), "", `${language} has an empty ${key}`);
    }
  }
});

test("world task travel opens doors, follows timed paths, and commits home entry", () => {
  const worldSource = fs.readFileSync(path.join(__dirname, "../../src/renderer/world.js"), "utf8");
  const engineSource = fs.readFileSync(path.join(__dirname, "../../src/world/world-engine.js"), "utf8");
  assert.match(worldSource, /await playWorldAgentDepartureDoors\(world, agents\)/);
  assert.match(worldSource, /getWorldAgentTravelPath\(world, from, target, index, "to-board"\)/);
  assert.match(worldSource, /getWorldAgentSegmentDuration\(segmentFrom, waypoint, options\)/);
  assert.match(worldSource, /boardClaimInset: 0\.15/);
  assert.match(worldSource, /y: Number\.isFinite\(y\) \? y \+ height - WORLD_AGENT_MOTION\.boardClaimInset : 30/);
  assert.match(worldSource, /commitHomeAtDoor: location === "home"/);
  assert.match(engineSource, /onUpdate: \(\) => item\.container\.active && item\.container\.setDepth\(item\.container\.y \+ 50\)/);
  assert.match(engineSource, /item\.sprite\.setFlipX\(direction === "side" && destination\.x > item\.container\.x\)/);
  assert.match(engineSource, /agent\.location = "home";[\s\S]*?agent\.movement = null;[\s\S]*?agent\.animation = "working";/);
  assert.match(engineSource, /requestAnimationFrame\(step\)/);
});

test("every world resident provides HomeINT and four OpenDoor frames", () => {
  const assetRoot = path.join(__dirname, "../../src/world/imge");
  const roleFolders = [
    "ProductManager",
    "TechnicalLead",
    "Front-endEngineer",
    "BackendEngineer",
    "TestEngineer",
    "AI-AgentEngineer",
    "DevOpsEngineer",
    "TechnicalDocumentationEngineer",
    "SecurityEngineer"
  ];
  roleFolders.forEach((folder) => {
    const roleRoot = path.join(assetRoot, folder);
    assert.equal(fs.existsSync(path.join(roleRoot, `${folder}.png`)), true, `${folder} is missing its portrait PNG`);
    assert.equal(fs.existsSync(path.join(roleRoot, "HomeINT.png")), true, `${folder} is missing HomeINT.png`);
    const openDoorFolder = fs.readdirSync(roleRoot, { withFileTypes: true })
      .find((entry) => entry.isDirectory() && /HomeOp(?:e|en)Door$/i.test(entry.name));
    assert.ok(openDoorFolder, `${folder} is missing its OpenDoor directory`);
    assert.deepEqual(
      fs.readdirSync(path.join(roleRoot, openDoorFolder.name)).filter((name) => /\.png$/i.test(name)).sort(),
      ["1.png", "2.png", "3.png", "4.png"]
    );
  });
});
