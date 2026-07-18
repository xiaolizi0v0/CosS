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
        paletteCategory: "all"
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
  await expect(page.locator(".blueprint-workspace")).toBeVisible();
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
      const transformed = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM());
      return { x: transformed.x, y: transformed.y };
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
