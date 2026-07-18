const fs = require("fs");
const os = require("os");
const path = require("path");
const { test, expect, _electron: electron } = require("@playwright/test");

const stateFileName = "coss-workspace-state.json";

function blueprintNode(id, type, name, x, y) {
  return {
    id,
    type,
    name,
    description: `${name}节点`,
    enabled: true,
    x,
    y,
    timeoutMs: 0,
    retryCount: 0,
    instruction: "",
    config: {}
  };
}

function createBlueprintState(projectPath) {
  const nodes = [
    blueprintNode("node-start", "task-start", "任务开始", 28, 228),
    blueprintNode("node-planner", "planner", "规划器", 326, 268),
    blueprintNode("node-agent", "agent-task", "Agent 任务", 582, 268),
    blueprintNode("node-finish", "task-finish", "任务完成", 844, 268),
    blueprintNode("node-delay", "delay", "等待", 280, 88)
  ];
  const edges = [
    ["edge-start-planner", "node-start", "node-planner"],
    ["edge-planner-agent", "node-planner", "node-agent"],
    ["edge-agent-finish", "node-agent", "node-finish"]
  ].map(([id, from, to]) => ({ id, from, to, label: "" }));

  return {
    activeProjectId: "project-blueprint-e2e",
    activeWorldId: "",
    activeBlueprintId: "blueprint-layout-e2e",
    activeSidebarSection: "blueprints",
    projects: [{
      id: "project-blueprint-e2e",
      name: "Blueprint Test Project",
      path: projectPath,
      createdAt: "2026-01-01T00:00:00.000Z",
      lastOpenedAt: "2026-01-01T00:00:00.000Z",
      status: "online",
      windows: [],
      desktops: [{ id: "desktop-main", name: "Main", createdAt: "2026-01-01T00:00:00.000Z" }],
      activeDesktopId: "desktop-main",
      tasks: [],
      messages: [],
      agentEvents: [],
      agentDeliveries: [],
      terminalOutputRefs: []
    }],
    worlds: [],
    blueprints: [{
      id: "blueprint-layout-e2e",
      name: "新任务蓝图",
      description: "通过多角色协作完成用户任务。",
      path: projectPath,
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      nodes,
      edges,
      tasks: [],
      variables: [],
      ui: {
        selectedNodeId: "node-finish",
        selectedEdgeId: "",
        pendingFromNodeId: "",
        paletteCategory: "all",
        zoom: 1,
        panMode: false,
        snapToGrid: false
      }
    }],
    deletedProjectIds: [],
    settings: {
      agentAutoWorkflowEnabled: false,
      agentAutoWorkflowPaused: false
    }
  };
}

async function launchBlueprintApp() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-blueprint-layout-"));
  fs.writeFileSync(
    path.join(userDataDir, stateFileName),
    JSON.stringify(createBlueprintState(process.cwd()), null, 2),
    "utf8"
  );
  const app = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      COSS_DISABLE_CLAUDE_AUTO_INSTALL: "1",
      COSS_DISABLE_TERMINAL_BACKEND: "1",
      COSS_LLM_FORCE_ERROR: "1",
      COSS_CLAUDE_CONFIG_PATH: path.join(userDataDir, ".claude.json"),
      COSS_TEST_USER_DATA: userDataDir
    }
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".blueprint-workspace")).toBeVisible({ timeout: 15000 });
  return { app, page, userDataDir };
}

async function measureBlueprintLayout(page) {
  return page.evaluate(() => {
    const selectors = {
      workspace: ".blueprint-workspace",
      topbar: ".blueprint-workspace > .workspace-topbar",
      editor: ".blueprint-editor",
      palette: ".blueprint-palette",
      stage: ".blueprint-stage",
      toolbar: ".blueprint-stage-toolbar",
      viewport: ".blueprint-canvas-viewport",
      inspector: ".blueprint-inspector"
    };
    return Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      return [name, rect ? {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight
      } : null];
    }));
  });
}

function expectNoBlueprintOverlap(layout) {
  const tolerance = 1;
  expect(layout.topbar.bottom).toBeLessThanOrEqual(layout.editor.top + tolerance);
  expect(layout.palette.top).toBeGreaterThanOrEqual(layout.editor.top - tolerance);
  expect(layout.stage.top).toBeGreaterThanOrEqual(layout.editor.top - tolerance);
  expect(layout.inspector.top).toBeGreaterThanOrEqual(layout.editor.top - tolerance);
  expect(layout.toolbar.top).toBeGreaterThanOrEqual(layout.stage.top - tolerance);
  expect(layout.viewport.top).toBeGreaterThanOrEqual(layout.toolbar.bottom - tolerance);
  expect(layout.palette.right).toBeLessThanOrEqual(layout.stage.left + tolerance);
  expect(layout.stage.right).toBeLessThanOrEqual(layout.inspector.left + tolerance);
  expect(layout.editor.bottom).toBeLessThanOrEqual(layout.workspace.bottom + tolerance);
  expect(layout.palette.bottom).toBeLessThanOrEqual(layout.editor.bottom + tolerance);
  expect(layout.stage.bottom).toBeLessThanOrEqual(layout.editor.bottom + tolerance);
  expect(layout.inspector.bottom).toBeLessThanOrEqual(layout.editor.bottom + tolerance);
}

async function measureBlueprintEdgeAlignment(page) {
  return page.evaluate(() => {
    const edgeNodes = {
      "edge-start-planner": ["node-start", "node-planner"],
      "edge-planner-agent": ["node-planner", "node-agent"],
      "edge-agent-finish": ["node-agent", "node-finish"]
    };
    const center = (element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const screenPoint = (path, point) => {
      const svg = path.ownerSVGElement;
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / Math.max(1, svg.clientWidth);
      const scaleY = rect.height / Math.max(1, svg.clientHeight);
      return { x: rect.left + point.x * scaleX, y: rect.top + point.y * scaleY };
    };
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

    return Object.entries(edgeNodes).map(([edgeId, [fromId, toId]]) => {
      const path = document.querySelector(`.blueprint-edge[data-edge-id="${edgeId}"]`);
      const output = document.querySelector(`[data-blueprint-node-id="${fromId}"] .blueprint-port.output`);
      const input = document.querySelector(`[data-blueprint-node-id="${toId}"] .blueprint-port.input`);
      const start = screenPoint(path, path.getPointAtLength(0));
      const end = screenPoint(path, path.getPointAtLength(path.getTotalLength()));
      return {
        edgeId,
        startDistance: distance(start, center(output)),
        endDistance: distance(end, center(input))
      };
    });
  });
}

test("v0.12.0 blueprint panels stay below the toolbar without overlap", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    for (const size of [{ width: 1536, height: 768 }, { width: 1280, height: 800 }, { width: 1040, height: 680 }]) {
      await app.evaluate(({ BrowserWindow }, nextSize) => {
        const window = BrowserWindow.getAllWindows()[0];
        window.setSize(nextSize.width, nextSize.height);
      }, size);
      await page.waitForTimeout(80);
      const layout = await measureBlueprintLayout(page);
      Object.values(layout).forEach((rect) => expect(rect).not.toBeNull());
      expectNoBlueprintOverlap(layout);
    }
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint controls and selected node remain usable", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await expect(page.locator(".blueprint-panel-heading").first()).toContainText("节点库");
    await expect(page.locator(".blueprint-stage-toolbar")).toContainText("5 个节点 · 3 条连接");
    await expect(page.locator(".blueprint-inspector")).toContainText("任务完成");
    await expect(page.locator('[data-blueprint-node-id="node-finish"]')).toBeVisible();
    await expect(page.locator('[data-action="show-blueprint-task"]')).toBeVisible();
    await expect(page.locator('[data-action="validate-blueprint"]')).toBeVisible();
    await expect(page.locator(".blueprint-palette")).toHaveCSS("overflow-y", "auto");
    await expect(page.locator(".blueprint-inspector")).toHaveCSS("overflow-y", "auto");
    await expect(page.locator(".blueprint-canvas-viewport")).toHaveCSS("overflow-x", "auto");
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint UI rerenders translated labels when language changes", async () => {
  const { app, page } = await launchBlueprintApp();
  try {
    await expect(page.locator(".blueprint-panel-heading").first()).toContainText("节点库");
    await page.locator('[data-action="show-settings"]').click();
    await expect(page.locator("#appLanguageSelect")).toBeVisible();
    await page.locator("#appLanguageSelect").selectOption("en-US");
    await expect(page.locator(".blueprint-stage-toolbar")).toContainText("Workflow canvas");
    await expect(page.locator(".blueprint-panel-heading").first()).toContainText("Node library");
    await expect(page.locator('[data-action="show-generate-blueprint"]')).toContainText("Generate from task");
  } finally {
    await app.close();
  }
});

test("v0.12.0 blueprint can restore the collapsed application sidebar", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    const sidebar = page.locator(".sidebar");
    const hideButton = sidebar.locator('[data-action="toggle-sidebar"]');
    await expect(sidebar).toBeVisible();
    await expect(hideButton).toBeVisible();

    await hideButton.click();
    const restoreButton = page.locator('.blueprint-workspace > [data-action="toggle-sidebar"]');
    await expect(sidebar).toHaveCount(0);
    await expect(restoreButton).toBeVisible();
    await expect(restoreButton).toHaveAttribute("title", "显示侧边栏");

    const restoreBox = await restoreButton.boundingBox();
    const titleBox = await page.locator(".blueprint-topbar .project-heading").boundingBox();
    expect(restoreBox.x + restoreBox.width).toBeLessThanOrEqual(titleBox.x + 1);

    await restoreButton.click();
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(restoreButton).toHaveCount(0);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint can generate a task graph from a natural-language goal", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await page.locator('[data-action="show-generate-blueprint"]').click();
    await expect(page.locator(".blueprint-generate-modal")).toBeVisible();
    await page.locator("#generateBlueprintGoal").fill("读取 package.json，运行测试并生成项目报告");
    await page.locator("#generateBlueprintInputPath").fill("package.json");
    await page.locator("#generateBlueprintOutputPath").fill("blueprint-output.md");
    await page.locator('[data-action="generate-blueprint"]').click();
    await expect(page.locator(".blueprint-generate-modal")).toHaveCount(0);
    await expect(page.locator(".blueprint-node")).toHaveCount(11);
    const generated = await page.locator(".blueprint-node").evaluateAll((nodes) => nodes.map((node) => ({ type: node.dataset.blueprintNodeId, title: node.querySelector("strong")?.textContent || "" })));
    expect(generated.map((item) => item.title)).toEqual(expect.arrayContaining(["读取项目文件", "执行检查命令", "完成核心任务", "检查结果质量", "生成任务交付物", "登记交付物"]));
    await page.locator('.blueprint-node').filter({ hasText: "读取项目文件" }).locator(".blueprint-node-main").click();
    await expect(page.locator('[data-blueprint-field="instruction"]')).toHaveCount(0);
    await expect(page.locator('[data-blueprint-config-field="content"]')).toHaveCount(0);
    await page.locator('.blueprint-node').filter({ hasText: "生成任务交付物" }).locator(".blueprint-node-main").click();
    await expect(page.locator('[data-blueprint-field="instruction"]')).toHaveCount(0);
    await expect(page.locator('[data-blueprint-config-field="content"]').locator("xpath=..")).toContainText("写入内容模板");
    await page.locator('.blueprint-node').filter({ hasText: "完成核心任务" }).locator(".blueprint-node-main").click();
    await expect(page.locator('[data-blueprint-field="instruction"]')).toHaveCount(1);
    await expect(page.locator('[data-blueprint-field="instruction"]').locator("xpath=..")).toContainText("执行指令");
    await expect(page.locator('[data-blueprint-field="instruction"]')).not.toHaveValue(/读取 package\.json/);
    await expect(page.locator(".blueprint-edge")).toHaveCount(18);
    await expect(page.locator(".blueprint-validation-pill.ok")).toBeVisible();
    const saved = await page.evaluate(async () => {
      const state = await window.cossAPI.loadState();
      const blueprint = state.blueprints[0];
      return { description: blueprint.description, dataEdges: blueprint.edges.filter((edge) => edge.kind === "data").length, flowEdges: blueprint.edges.filter((edge) => edge.kind !== "data").length };
    });
    expect(saved.description).toContain("读取 package.json");
    expect(saved.dataEdges).toBe(8);
    expect(saved.flowEdges).toBe(10);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint task generator folder picker updates its workspace", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await page.locator('[data-action="show-generate-blueprint"]').click();
    await app.evaluate(({ dialog }) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: ["D:\\BlueprintWorkspace"] });
    });
    await page.locator('.blueprint-generate-modal [data-action="choose-blueprint-directory"]').click();
    await expect(page.locator("#generateBlueprintPath")).toHaveValue("D:\\BlueprintWorkspace");
    await expect(page.locator("#generateBlueprintStatus")).toHaveText("已选择工作目录。");
    await expect(page.locator("#generateBlueprintStatus")).toHaveClass(/ready/);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint edges stay attached when scrollbars disappear after resize", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    const cases = [
      { workspaceSize: { width: 1000, height: 560 }, expectScrollbars: true },
      { workspaceSize: { width: 1700, height: 850 }, expectScrollbars: false }
    ];
    for (const testCase of cases) {
      await page.locator(".blueprint-workspace").evaluate((workspace, nextSize) => {
        workspace.style.width = `${nextSize.width}px`;
        workspace.style.height = `${nextSize.height}px`;
      }, testCase.workspaceSize);
      await page.waitForTimeout(100);

      const overflow = await page.locator(".blueprint-canvas-viewport").evaluate((viewport) => ({
        horizontal: viewport.scrollWidth > viewport.clientWidth + 1,
        vertical: viewport.scrollHeight > viewport.clientHeight + 1
      }));
      expect(overflow).toEqual({
        horizontal: testCase.expectScrollbars,
        vertical: testCase.expectScrollbars
      });

      const edges = await measureBlueprintEdgeAlignment(page);
      edges.forEach((edge) => {
        expect(edge.startDistance, `${edge.edgeId} output port`).toBeLessThanOrEqual(3);
        expect(edge.endDistance, `${edge.edgeId} input port`).toBeLessThanOrEqual(3);
      });
    }
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint supports multi-select duplicate undo and redo", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await page.locator('[data-blueprint-node-id="node-start"] .blueprint-node-main').click();
    await page.locator('[data-blueprint-node-id="node-planner"] .blueprint-node-main').click({ modifiers: ["Shift"] });
    await expect(page.locator(".blueprint-node.selected")).toHaveCount(2);
    await expect(page.locator(".blueprint-multi-inspector")).toContainText("已选择 2 个节点");

    await page.locator('.blueprint-inspector [data-action="duplicate-blueprint-selection"]').click();
    await expect(page.locator(".blueprint-node")).toHaveCount(7);
    await expect(page.locator(".blueprint-edge")).toHaveCount(4);
    await expect(page.locator(".blueprint-node.selected")).toHaveCount(2);

    await page.locator('[data-action="undo-blueprint"]').click();
    await expect(page.locator(".blueprint-node")).toHaveCount(5);
    await expect(page.locator(".blueprint-edge")).toHaveCount(3);

    await page.locator('[data-action="redo-blueprint"]').click();
    await expect(page.locator(".blueprint-node")).toHaveCount(7);
    await expect(page.locator(".blueprint-edge")).toHaveCount(4);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint zoom keeps edges aligned and pan mode scrolls the canvas", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await expect(page.locator(".blueprint-zoom-value")).toHaveText("100%");
    await page.locator('[data-action="zoom-in-blueprint"]').click();
    await page.locator('[data-action="zoom-in-blueprint"]').click();
    await expect(page.locator(".blueprint-zoom-value")).toHaveText("120%");
    const zoomedEdges = await measureBlueprintEdgeAlignment(page);
    zoomedEdges.forEach((edge) => {
      expect(edge.startDistance, `${edge.edgeId} zoomed output port`).toBeLessThanOrEqual(3);
      expect(edge.endDistance, `${edge.edgeId} zoomed input port`).toBeLessThanOrEqual(3);
    });

    await page.locator('[data-action="reset-blueprint-zoom"]').click();
    await expect(page.locator(".blueprint-zoom-value")).toHaveText("100%");
    await page.locator('[data-action="toggle-blueprint-pan"]').click();
    await expect(page.locator('[data-action="toggle-blueprint-pan"]')).toHaveClass(/active/);

    const viewport = page.locator(".blueprint-canvas-viewport");
    await viewport.evaluate((element) => {
      element.scrollLeft = 120;
      element.scrollTop = 10;
    });
    const before = await viewport.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
    const box = await viewport.boundingBox();
    await page.mouse.move(box.x + box.width - 36, box.y + box.height - 36);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 156, box.y + box.height - 116, { steps: 5 });
    await page.mouse.up();
    const after = await viewport.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
    expect(after.left).toBeGreaterThan(before.left);
    expect(after.top).toBeGreaterThan(before.top);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint box selection group drag and keyboard shortcuts work", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await page.locator(".blueprint-workspace").evaluate((workspace) => {
      workspace.style.width = "1700px";
      workspace.style.height = "850px";
    });
    const canvas = page.locator("[data-blueprint-canvas]");
    const canvasBox = await canvas.boundingBox();
    await page.mouse.move(canvasBox.x + 10, canvasBox.y + 220);
    await page.mouse.down();
    await page.mouse.move(canvasBox.x + 520, canvasBox.y + 400, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator(".blueprint-node.selected")).toHaveCount(2);

    const start = page.locator('[data-blueprint-node-id="node-start"]');
    const planner = page.locator('[data-blueprint-node-id="node-planner"]');
    const startBefore = await start.boundingBox();
    const plannerBefore = await planner.boundingBox();
    await page.mouse.move(startBefore.x + startBefore.width / 2, startBefore.y + 26);
    await page.mouse.down();
    await page.mouse.move(startBefore.x + startBefore.width / 2 + 60, startBefore.y + 56, { steps: 5 });
    await page.mouse.up();
    const startAfter = await start.boundingBox();
    const plannerAfter = await planner.boundingBox();
    expect(startAfter.x - startBefore.x).toBeCloseTo(60, 0);
    expect(startAfter.y - startBefore.y).toBeCloseTo(30, 0);
    expect(plannerAfter.x - plannerBefore.x).toBeCloseTo(60, 0);
    expect(plannerAfter.y - plannerBefore.y).toBeCloseTo(30, 0);

    const workspace = page.locator(".blueprint-workspace");
    await workspace.focus();
    await workspace.press("Control+a");
    await expect(page.locator(".blueprint-node.selected")).toHaveCount(5);
    await workspace.press("Delete");
    await expect(page.locator(".blueprint-node")).toHaveCount(0);
    await page.locator(".blueprint-workspace").press("Control+z");
    await expect(page.locator(".blueprint-node")).toHaveCount(5);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint cards expose multiple typed pins and support drag connections", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await page.locator(".blueprint-workspace").evaluate((workspace) => {
      workspace.style.width = "1700px";
      workspace.style.height = "850px";
    });
    await expect(page.locator('[data-blueprint-node-id="node-agent"] .blueprint-port.input')).toHaveCount(3);
    await expect(page.locator('[data-blueprint-node-id="node-agent"] .blueprint-port.output')).toHaveCount(2);
    await expect(page.locator(".blueprint-port.connected")).toHaveCount(6);
    await expect(page.locator(".blueprint-port.unconnected")).toHaveCount(10);
    await expect(page.locator('[data-blueprint-node-id="node-start"] .blueprint-port[data-port-id="exec-out"]')).toHaveCSS("background-color", "rgb(71, 85, 105)");
    await expect(page.locator('[data-blueprint-node-id="node-start"] .blueprint-port[data-port-id="goal"]')).toHaveCSS("background-color", "rgb(255, 255, 255)");

    const source = page.locator('[data-blueprint-node-id="node-start"] .blueprint-port.output[data-port-id="goal"]');
    const target = page.locator('[data-blueprint-node-id="node-planner"] .blueprint-port.input[data-port-id="goal"]');
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 8 });
    await expect(page.locator(".blueprint-edge-preview.visible")).toHaveCount(1);
    await expect(target).toHaveClass(/connection-target/);
    await page.mouse.up();
    await expect(page.locator(".blueprint-edge")).toHaveCount(4);
    await expect(page.locator(".blueprint-edge.kind-data")).toHaveCount(1);
    await expect(source).toHaveClass(/connected/);
    await expect(target).toHaveClass(/connected/);
    const savedDataEdge = await page.evaluate(async () => {
      const saved = await window.cossAPI.loadState();
      return saved.blueprints[0].edges.find((edge) => edge.kind === "data");
    });
    expect(savedDataEdge).toMatchObject({ from: "node-start", to: "node-planner", fromPort: "goal", toPort: "goal", kind: "data" });

    const incompatibleTarget = page.locator('[data-blueprint-node-id="node-planner"] .blueprint-port.input[data-port-id="exec-in"]');
    const incompatibleBox = await incompatibleTarget.boundingBox();
    const refreshedSourceBox = await source.boundingBox();
    await page.mouse.move(refreshedSourceBox.x + refreshedSourceBox.width / 2, refreshedSourceBox.y + refreshedSourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(incompatibleBox.x + incompatibleBox.width / 2, incompatibleBox.y + incompatibleBox.height / 2, { steps: 6 });
    await page.mouse.up();
    await expect(page.locator(".blueprint-edge")).toHaveCount(4);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint drag preview endpoint follows the pointer while zoomed and scrolled", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await page.locator(".blueprint-workspace").evaluate((workspace) => {
      workspace.style.width = "1700px";
      workspace.style.height = "850px";
    });
    await page.locator('[data-action="zoom-in-blueprint"]').click();
    await page.locator('[data-action="zoom-in-blueprint"]').click();
    await expect(page.locator(".blueprint-zoom-value")).toHaveText("120%");
    const viewport = page.locator(".blueprint-canvas-viewport");
    const source = page.locator('[data-blueprint-node-id="node-start"] .blueprint-port.output[data-port-id="goal"]');
    await viewport.evaluate((element) => {
      element.scrollLeft = 24;
      element.scrollTop = 20;
    });
    const viewportBox = await viewport.boundingBox();
    const pointer = {
      x: viewportBox.x + viewportBox.width * 0.58,
      y: viewportBox.y + viewportBox.height * 0.78
    };
    const sourceHitPoint = await source.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      for (let y = rect.top - 120; y <= rect.bottom + 120; y += 2) {
        for (let x = rect.left - 120; x <= rect.right + 120; x += 2) {
          if (document.elementFromPoint(x, y) === element) return { x, y };
        }
      }
      return null;
    });
    expect(sourceHitPoint).not.toBeNull();
    await page.mouse.move(sourceHitPoint.x, sourceHitPoint.y);
    await page.mouse.down();
    await page.mouse.move(pointer.x, pointer.y, { steps: 7 });
    await expect(page.locator(".blueprint-edge-preview.visible")).toHaveCount(1);
    const endpoint = await page.locator(".blueprint-edge-preview").evaluate((path) => {
      const point = path.getPointAtLength(path.getTotalLength());
      const matrix = path.getScreenCTM();
      return {
        x: point.x * matrix.a + point.y * matrix.c + matrix.e,
        y: point.x * matrix.b + point.y * matrix.d + matrix.f
      };
    });
    expect(Math.abs(endpoint.x - pointer.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(endpoint.y - pointer.y)).toBeLessThanOrEqual(1);
    await page.mouse.up();
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint edge context menu can inspect navigate and delete a connection", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  const rightClickEdge = async (edgeId) => {
    const point = await page.locator(`.blueprint-edge[data-edge-id="${edgeId}"]`).evaluate((path) => {
      const local = path.getPointAtLength(path.getTotalLength() * 0.5);
      const matrix = path.getScreenCTM();
      return {
        x: local.x * matrix.a + local.y * matrix.c + matrix.e,
        y: local.x * matrix.b + local.y * matrix.d + matrix.f
      };
    });
    await page.mouse.click(point.x, point.y, { button: "right" });
  };
  try {
    await rightClickEdge("edge-start-planner");
    const menu = page.locator(".blueprint-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu.locator("button")).toHaveText(["查看 / 编辑连接", "选择起始节点", "选择目标节点", "删除连接"]);
    await expect(page.locator('.blueprint-edge[data-edge-id="edge-start-planner"]')).toHaveClass(/selected/);

    await menu.getByRole("button", { name: "查看 / 编辑连接" }).click();
    await expect(page.locator(".blueprint-inspector")).toContainText("连接属性");
    await expect(page.locator('[data-blueprint-edge-field="label"]')).toBeVisible();

    await rightClickEdge("edge-start-planner");
    await page.locator(".blueprint-context-menu").getByRole("button", { name: "选择目标节点" }).click();
    await expect(page.locator('[data-blueprint-node-id="node-planner"]')).toHaveClass(/selected/);
    await expect(page.locator(".blueprint-inspector")).toContainText("规划器");

    await rightClickEdge("edge-start-planner");
    await page.locator(".blueprint-context-menu").getByRole("button", { name: "删除连接" }).click();
    await expect(page.locator('.blueprint-edge[data-edge-id="edge-start-planner"]')).toHaveCount(0);
    await expect(page.locator(".blueprint-edge")).toHaveCount(2);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint execution persists completed nodes and renders active animations", async () => {
  test.setTimeout(60000);
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await page.evaluate(async () => {
      const saved = await window.cossAPI.loadState();
      const blueprint = saved.blueprints[0];
      const start = blueprint.nodes.find((node) => node.id === "node-start");
      const finish = blueprint.nodes.find((node) => node.id === "node-finish");
      blueprint.nodes = [start, finish];
      blueprint.edges = [{ id: "edge-start-finish", from: start.id, to: finish.id, fromPort: "exec-out", toPort: "exec-in", kind: "flow", label: "" }];
      const task = {
        id: "blueprint-task-state-e2e",
        goal: "验证节点状态持久化",
        workspace: blueprint.path,
        blueprintVersion: blueprint.version,
        status: "ready",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: "",
        completedAt: "",
        currentNodeId: "",
        queue: [],
        events: [],
        artifacts: [],
        pending: null,
        context: { input: {}, variables: {}, nodes: {} },
        nodeRuns: {},
        definition: { version: blueprint.version, nodes: blueprint.nodes, edges: blueprint.edges, variables: [] }
      };
      blueprint.tasks = [task];
      blueprint.ui.activeTaskId = task.id;
      await window.cossAPI.saveState(saved);
      location.reload();
    });
    await expect(page.locator(".blueprint-workspace")).toBeVisible({ timeout: 15000 });
    await page.locator('[data-action="show-blueprint-tasks"]').click();
    await page.locator('[data-action="view-blueprint-run"]').click();
    await page.locator('[data-action="run-blueprint-task"]').click();
    await expect(page.locator(".blueprint-run-status")).toHaveText("已完成");
    const persistedStatuses = await page.evaluate(async () => {
      const saved = await window.cossAPI.loadState();
      const task = saved.blueprints[0].tasks[0];
      return Object.values(task.nodeRuns).map((run) => run.status);
    });
    expect(persistedStatuses).toEqual(["completed", "completed"]);
    await page.locator('.blueprint-run-modal [data-action="close-modal"]').click();
    await expect(page.locator(".blueprint-node.run-completed")).toHaveCount(2);

    await page.evaluate(async () => {
      const saved = await window.cossAPI.loadState();
      const blueprint = saved.blueprints[0];
      const task = blueprint.tasks[0];
      Object.values(task.nodeRuns).forEach((run) => { run.status = "running"; run.completedAt = ""; });
      await window.cossAPI.saveState(saved);
      location.reload();
    });
    await expect(page.locator(".blueprint-node.run-completed")).toHaveCount(2, { timeout: 15000 });

    await page.evaluate(async () => {
      const saved = await window.cossAPI.loadState();
      const blueprint = saved.blueprints[0];
      const task = blueprint.tasks[0];
      task.status = "paused";
      task.nodeRuns["node-start"].status = "running";
      task.nodeRuns["node-finish"].status = "idle";
      blueprint.ui.activeTaskId = task.id;
      await window.cossAPI.saveState(saved);
      location.reload();
    });
    const runningNode = page.locator('[data-blueprint-node-id="node-start"].run-running');
    await expect(runningNode).toBeVisible({ timeout: 15000 });
    const animations = await runningNode.evaluate((node) => ({
      node: getComputedStyle(node).animationName,
      scan: getComputedStyle(node, "::before").animationName
    }));
    expect(animations.node).toContain("blueprint-node-pulse");
    expect(animations.scan).toContain("blueprint-node-scan");
    await page.locator('[data-action="show-blueprint-tasks"]').click();
    await page.locator('[data-action="view-blueprint-run"]').click();
    const runningRow = page.locator(".blueprint-run-node.running");
    await expect(runningRow).toHaveCount(1);
    await expect(runningRow).toHaveCSS("animation-name", "blueprint-run-row-flow");
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint task records can be deleted and persist after reload", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    for (const goal of ["待删除任务", "保留任务"]) {
      await page.locator('[data-action="show-blueprint-task"]').click();
      await page.locator("#blueprintTaskGoal").fill(goal);
      await page.locator('[data-action="create-blueprint-task"]').click();
      await expect(page.locator(".blueprint-run-modal")).toBeVisible();
      await page.locator('.blueprint-run-modal [data-action="close-modal"]').click();
    }

    await page.locator('[data-action="show-blueprint-tasks"]').click();
    await expect(page.locator(".blueprint-task-row")).toHaveCount(2);
    await page.locator('.blueprint-task-row [data-action="show-delete-blueprint-task"]').first().click();
    await expect(page.locator('[data-action="confirm-delete-blueprint-task"]')).toBeVisible();
    await page.locator('[data-action="confirm-delete-blueprint-task"]').click();
    await expect(page.locator(".blueprint-task-row")).toHaveCount(1);

    const persistedTaskGoals = await page.evaluate(async () => {
      const saved = await window.cossAPI.loadState();
      return saved.blueprints[0].tasks.map((task) => task.goal);
    });
    expect(persistedTaskGoals).toEqual(["待删除任务"]);

    await page.reload();
    await expect(page.locator(".blueprint-workspace")).toBeVisible({ timeout: 15000 });
    await page.locator('[data-action="show-blueprint-tasks"]').click();
    await expect(page.locator(".blueprint-task-row")).toHaveCount(1);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint card titles and pins stay inside separate regions", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await page.locator(".blueprint-workspace").evaluate((workspace) => {
      workspace.style.width = "1700px";
      workspace.style.height = "850px";
    });
    const geometry = await page.locator(".blueprint-node").evaluateAll((nodes) => nodes.map((node) => {
      const card = node.getBoundingClientRect();
      const header = node.querySelector(".blueprint-node-main").getBoundingClientRect();
      const title = node.querySelector(".blueprint-node-main strong").getBoundingClientRect();
      const pinRows = [...node.querySelectorAll(".blueprint-pin-row")].map((row) => row.getBoundingClientRect());
      const ports = [...node.querySelectorAll(".blueprint-port")].map((port) => port.getBoundingClientRect());
      return {
        id: node.dataset.blueprintNodeId,
        card: { left: card.left, right: card.right, top: card.top, bottom: card.bottom },
        headerBottom: header.bottom,
        titleBottom: title.bottom,
        firstPinTop: pinRows.length ? Math.min(...pinRows.map((row) => row.top)) : card.bottom,
        ports: ports.map((port) => ({ left: port.left, right: port.right, top: port.top, bottom: port.bottom }))
      };
    }));
    geometry.forEach((node) => {
      expect(node.titleBottom, `${node.id} title`).toBeLessThanOrEqual(node.firstPinTop);
      expect(node.headerBottom, `${node.id} header`).toBeLessThanOrEqual(node.firstPinTop);
      node.ports.forEach((port) => {
        expect(port.left, `${node.id} port left`).toBeGreaterThanOrEqual(node.card.left);
        expect(port.right, `${node.id} port right`).toBeLessThanOrEqual(node.card.right);
        expect(port.top, `${node.id} port top`).toBeGreaterThanOrEqual(node.card.top);
        expect(port.bottom, `${node.id} port bottom`).toBeLessThanOrEqual(node.card.bottom);
      });
    });
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint alignment distribution and grid snap operate on selections", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await page.locator('[data-blueprint-node-id="node-start"] .blueprint-node-main').click();
    await page.locator('[data-blueprint-node-id="node-planner"] .blueprint-node-main').click({ modifiers: ["Shift"] });
    await page.locator('[data-blueprint-node-id="node-agent"] .blueprint-node-main').click({ modifiers: ["Shift"] });
    await page.locator('.blueprint-stage-toolbar [data-action="align-blueprint-left"]').click();
    const aligned = await page.locator(".blueprint-node.selected").evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(node.style.left)));
    expect(new Set(aligned).size).toBe(1);

    await page.locator('[data-action="undo-blueprint"]').click();
    await page.locator('.blueprint-stage-toolbar [data-action="distribute-blueprint-horizontal"]').click();
    const distributed = await page.locator(".blueprint-node.selected").evaluateAll((nodes) => nodes.map((node) => Number.parseFloat(node.style.left)).sort((a, b) => a - b));
    expect(distributed[1] - distributed[0]).toBe(distributed[2] - distributed[1]);

    await page.locator('[data-action="toggle-blueprint-snap"]').click();
    await expect(page.locator('[data-action="toggle-blueprint-snap"]')).toHaveClass(/active/);
    const delay = page.locator('[data-blueprint-node-id="node-delay"]');
    const delayBox = await delay.boundingBox();
    await page.mouse.move(delayBox.x + delayBox.width / 2, delayBox.y + 24);
    await page.mouse.down();
    await page.mouse.move(delayBox.x + delayBox.width / 2 + 37, delayBox.y + 43, { steps: 5 });
    await page.mouse.up();
    const snapped = await delay.evaluate((node) => ({ x: Number.parseFloat(node.style.left), y: Number.parseFloat(node.style.top) }));
    expect(snapped.x % 24).toBe(0);
    expect(snapped.y % 24).toBe(0);
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});

test("v0.12.0 blueprint minimap context menu and collapsible groups work", async () => {
  const { app, page, userDataDir } = await launchBlueprintApp();
  try {
    await expect(page.locator(".blueprint-minimap")).toBeVisible();
    await expect(page.locator(".blueprint-minimap rect:not(.blueprint-minimap-viewport)")).toHaveCount(5);

    await page.locator('[data-blueprint-node-id="node-start"] .blueprint-node-main').click();
    await page.locator('[data-blueprint-node-id="node-planner"] .blueprint-node-main').click({ modifiers: ["Shift"] });
    await page.locator('.blueprint-stage-toolbar [data-action="group-blueprint-selection"]').click();
    const group = page.locator(".blueprint-group");
    await expect(group).toHaveCount(1);
    await expect(group).toContainText("2 个节点");

    await group.locator(".blueprint-group-header").click();
    await expect(page.locator(".blueprint-group.collapsed")).toHaveCount(1);
    await expect(page.locator(".blueprint-node")).toHaveCount(3);
    await page.locator(".blueprint-group-header").click();
    await expect(page.locator(".blueprint-node")).toHaveCount(5);

    await group.locator(".blueprint-group-header").click({ button: "right" });
    const menu = page.locator(".blueprint-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("取消分组");
    await menu.locator('[data-action="ungroup-blueprint"]').click();
    await expect(page.locator(".blueprint-group")).toHaveCount(0);

    await page.locator('[data-blueprint-node-id="node-agent"]').click({ button: "right" });
    await expect(page.locator(".blueprint-context-menu")).toContainText("右对齐");
  } finally {
    await app.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
