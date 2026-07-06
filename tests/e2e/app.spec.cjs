const fs = require("fs");
const childProcess = require("child_process");
const os = require("os");
const path = require("path");
const { test, expect, _electron: electron } = require("@playwright/test");

const stateFileName = "coss-workspace-state.json";

function createInitialState(projectPath, projectOverrides = {}, stateOverrides = {}) {
  return {
    activeProjectId: "project-e2e",
    projects: [
      {
        id: "project-e2e",
        name: "E2E Project",
        path: projectPath,
        createdAt: "2026-01-01T00:00:00.000Z",
        lastOpenedAt: "2026-01-01T00:00:00.000Z",
        status: "online",
        windows: [],
        desktops: [{ id: "desktop-main", name: "Main conversation", createdAt: "2026-01-01T00:00:00.000Z" }],
        activeDesktopId: "desktop-main",
        tasks: [],
        messages: [],
        agentEvents: [],
        agentDeliveries: [],
        terminalOutputRefs: [],
        ...projectOverrides
      }
    ],
    ...stateOverrides
  };
}

function writeState(userDataDir, state) {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, stateFileName), JSON.stringify(state, null, 2), "utf8");
}

async function launchApp(projectOverrides = {}, envOverrides = {}, stateOverrides = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-e2e-"));
  writeState(userDataDir, createInitialState(process.cwd(), projectOverrides, stateOverrides));

  const app = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      COSS_DISABLE_CLAUDE_AUTO_INSTALL: "1",
      COSS_DISABLE_TERMINAL_BACKEND: "1",
      COSS_LLM_FORCE_ERROR: "1",
      COSS_CLAUDE_CONFIG_PATH: path.join(userDataDir, ".claude.json"),
      COSS_TEST_USER_DATA: userDataDir,
      ...envOverrides
    }
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");

  return { app, page, userDataDir };
}

async function launchAppWithUserData(userDataDir, envOverrides = {}) {
  const app = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      COSS_DISABLE_CLAUDE_AUTO_INSTALL: "1",
      COSS_DISABLE_TERMINAL_BACKEND: "1",
      COSS_LLM_FORCE_ERROR: "1",
      COSS_CLAUDE_CONFIG_PATH: path.join(userDataDir, ".claude.json"),
      COSS_TEST_USER_DATA: userDataDir,
      ...envOverrides
    }
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

function runMcpTool(userDataDir, toolName, toolArgs = {}, context = {}) {
  const result = childProcess.spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "src", "coss-mcp-server.cjs"),
      "--user-data",
      userDataDir,
      "--project-id",
      context.projectId || toolArgs.projectId || "project-e2e",
      "--role-id",
      context.roleId || toolArgs.roleId || "product-manager",
      "--call-tool",
      toolName,
      "--args-json",
      JSON.stringify(toolArgs)
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, COSS_MCP_USER_DATA: userDataDir }
    }
  );
  if (result.status !== 0) {
    throw new Error(`MCP tool ${toolName} failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function runMcpToolFailure(userDataDir, toolName, toolArgs = {}, context = {}) {
  const result = childProcess.spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "src", "coss-mcp-server.cjs"),
      "--user-data",
      userDataDir,
      "--project-id",
      context.projectId || toolArgs.projectId || "project-e2e",
      "--role-id",
      context.roleId || toolArgs.roleId || "product-manager",
      "--call-tool",
      toolName,
      "--args-json",
      JSON.stringify(toolArgs)
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, COSS_MCP_USER_DATA: userDataDir }
    }
  );
  expect(result.status).not.toBe(0);
  return `${result.stderr || ""}${result.stdout || ""}`;
}

function runMcpInitialize(userDataDir) {
  const child = childProcess.spawnSync(
    process.execPath,
    [
      path.join(process.cwd(), "src", "coss-mcp-server.cjs"),
      "--user-data",
      userDataDir,
      "--project-id",
      "project-e2e"
    ],
    {
      cwd: process.cwd(),
      input: `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          clientInfo: { name: "coss-v010-test", version: "1.0.0" }
        }
      })}\n${JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {}
      })}\n`,
      encoding: "utf8",
      env: { ...process.env, COSS_MCP_USER_DATA: userDataDir }
    }
  );
  if (child.status !== 0) {
    throw new Error(`MCP initialize failed: ${child.stderr || child.stdout}`);
  }
  return child.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function isSameLocalDate(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function formatExpectedProjectCreatedTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  if (isSameLocalDate(date, new Date())) {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

test("v0.10.0 boots into the Kernel workspace shell", async () => {
  const { app, page } = await launchApp();

  try {
    await expect(page.locator(".brand")).toContainText("CosS");
    await expect(page.locator(".brand-version")).toHaveText("v0.10.0");
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator(".workspace-title")).toHaveText("E2E Project");

    await page.locator('.workspace-actions [data-action="show-message-center"]').click();
    await expect(page.locator(".message-center-modal")).toContainText("v0.10 Kernel");
    await expect(page.locator(`[data-action="${["send", "role", "message"].join("-")}"]`)).toHaveCount(0);
    await expect(page.locator(`[data-action="${["show", "subtask", "instruction"].join("-")}"]`)).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("v0.10.0 project list shows project creation time", async () => {
  const createdAt = "2026-02-03T04:05:00.000Z";
  const { app, page } = await launchApp({
    id: "project-created-time",
    name: "Created Time Project",
    createdAt,
    lastOpenedAt: "2026-07-04T09:30:00.000Z"
  }, {}, {
    activeProjectId: "project-created-time"
  });

  try {
    const time = page.locator('[data-action="select-project"][data-project-id="project-created-time"] .project-time');
    await expect(time).toHaveText(formatExpectedProjectCreatedTime(createdAt));
  } finally {
    await app.close();
  }
});

test("v0.10.0 project memory summarizes existing project work from settings", async () => {
  const createdAt = "2026-01-01T02:10:00.000Z";
  const { app, page, userDataDir } = await launchApp({
    tasks: [
      {
        id: "task-memory-ui",
        title: "Existing checkout flow",
        goal: "Build the checkout flow on the current app.",
        status: "done",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "kernel-planner",
          summary: "Checkout flow already has a product plan and route contract.",
          neededAgentRoleIds: ["product-manager", "tech-lead"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks: [
          {
            id: "subtask-memory-ui-1",
            roleId: "product-manager",
            title: "Define checkout requirements",
            description: "Document current checkout requirements.",
            status: "done",
            dependsOn: [],
            isEntryStep: true,
            createdAt,
            updatedAt: createdAt
          }
        ],
        orchestrator: {
          sharedState: {
            currentStep: "step-subtask-memory-ui-1",
            artifacts: [
              {
                path: "docs/checkout-prd.md",
                type: "file",
                description: "Checkout product requirements.",
                roleId: "product-manager",
                stepId: "step-subtask-memory-ui-1",
                createdAt
              }
            ],
            decisions: [
              {
                id: "decision-memory-ui",
                roleId: "tech-lead",
                stepId: "step-subtask-memory-ui-1",
                summary: "Reuse the existing Vite frontend and /api route prefix.",
                createdAt
              }
            ]
          }
        }
      }
    ]
  });

  try {
    await page.locator('[data-action="show-settings"]').first().click();
    await page.locator('[data-action="set-settings-section"][data-section="memory"]').click();
    await page.locator('[data-action="refresh-project-memory"]').click();

    await expect(page.locator(".project-memory-summary")).toContainText("Existing checkout flow");
    await expect(page.locator(".project-memory-summary")).toContainText("docs/checkout-prd.md");

    await page.locator("#projectMemoryManualNotes").fill("Reuse Vite and do not recreate the app shell.");
    await page.locator('[data-action="save-project-memory"]').click();

    const savedState = JSON.parse(fs.readFileSync(path.join(userDataDir, stateFileName), "utf8"));
    expect(savedState.projects[0].memory.manualNotes).toContain("Reuse Vite");
    expect(savedState.projects[0].memory.summary).toContain("Existing checkout flow");
  } finally {
    await app.close();
  }
});

test("v0.10.0 deleted projects stay deleted after restart", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-delete-project-"));
  const projectDirA = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-project-a-"));
  const projectDirB = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-project-b-"));
  const state = createInitialState(projectDirA, {
    id: "project-a",
    name: "Project A",
    path: projectDirA
  }, {
    activeProjectId: "project-a",
    deletedProjectIds: []
  });
  const projectB = JSON.parse(JSON.stringify(state.projects[0]));
  projectB.id = "project-b";
  projectB.name = "Project B";
  projectB.path = projectDirB;
  projectB.createdAt = "2026-01-01T00:01:00.000Z";
  projectB.lastOpenedAt = "2026-01-01T00:01:00.000Z";
  state.projects.push(projectB);
  writeState(userDataDir, state);

  let app;
  let page;
  try {
    ({ app, page } = await launchAppWithUserData(userDataDir));
    await expect(page.locator('[data-action="select-project"][data-project-id="project-b"]')).toBeVisible();
    await page.locator('[data-action="show-delete-project"][data-project-id="project-b"]').click({ force: true });
    await page.locator('[data-action="confirm-delete-project"][data-project-id="project-b"]').click();

    await expect.poll(() => {
      const savedState = JSON.parse(fs.readFileSync(path.join(userDataDir, stateFileName), "utf8"));
      return {
        hasProjectB: savedState.projects.some((project) => project.id === "project-b"),
        deleted: savedState.deletedProjectIds?.includes("project-b") === true
      };
    }).toEqual({ hasProjectB: false, deleted: true });
  } finally {
    await app?.close();
  }

  try {
    const relaunched = await launchAppWithUserData(userDataDir);
    app = relaunched.app;
    const loadedState = await relaunched.page.evaluate(() => window.cossAPI.loadState());
    expect(loadedState.projects.some((project) => project.id === "project-b")).toBe(false);
    expect(loadedState.deletedProjectIds).toContain("project-b");
    await expect(relaunched.page.locator('[data-action="select-project"][data-project-id="project-b"]')).toHaveCount(0);
  } finally {
    await app?.close();
  }
});

test("v0.10.0 renderer task actions write Kernel phases and events", async () => {
  const createdAt = "2026-01-01T01:00:00.000Z";
  const { app, page, userDataDir } = await launchApp({
    windows: [
      {
        id: "window-renderer-task",
        type: "task",
        roleId: "product-manager",
        title: "Renderer task",
        x: 220,
        y: 90,
        width: 560,
        height: 420,
        z: 10,
        status: "idle",
        minimized: false,
        maximized: false,
        restoreBounds: null,
        desktopId: "desktop-main"
      }
    ],
    tasks: [
      {
        id: "task-renderer-kernel",
        title: "Renderer Kernel task",
        goal: "Verify renderer actions flow through Kernel projection.",
        status: "running",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        confirmedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "test",
          summary: "Renderer Kernel",
          neededAgentRoleIds: ["product-manager"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks: [
          {
            id: "subtask-renderer-kernel",
            roleId: "product-manager",
            title: "Update status from UI",
            description: "This subtask is advanced through task-list UI actions.",
            status: "running",
            createdAt,
            updatedAt: createdAt
          }
        ]
      }
    ]
  });

  try {
    await expect(page.locator(".task-card")).toBeVisible();

    await expect(page.locator('[data-action="set-subtask-status"][data-subtask-id="subtask-renderer-kernel"][data-status="done"]')).toBeVisible();

    await page.locator('[data-action="set-subtask-status"][data-subtask-id="subtask-renderer-kernel"][data-status="done"]').click();
    await expect(page.locator(".task-card.kernel-phase-done")).toHaveCount(1);

    await expect.poll(() => {
      const savedState = JSON.parse(fs.readFileSync(path.join(userDataDir, stateFileName), "utf8"));
      const task = savedState.projects[0].tasks.find((item) => item.id === "task-renderer-kernel");
      return {
        status: task?.status,
        subtaskStatus: task?.subtasks.find((item) => item.id === "subtask-renderer-kernel")?.status,
        phase: task?.orchestrator?.steps.find((item) => item.subtaskId === "subtask-renderer-kernel")?.phase,
        eventCount: (task?.orchestrator?.events || []).filter((event) => event.type === "renderer.step.status.changed").length,
        projectEventCount: (savedState.projects[0].kernelEvents || []).filter((event) => event.type === "renderer.step.status.changed").length
      };
    }).toEqual({
      status: "done",
      subtaskStatus: "done",
      phase: "done",
      eventCount: 1,
      projectEventCount: 1
    });
  } finally {
    await app.close();
  }
});

test("v0.10.0 Kernel Planner keeps the complete linear workflow from the model", async () => {
  const mockPlan = {
    summary: "Plan a complete login workflow.",
    neededAgentRoleIds: ["product-manager", "tech-lead", "frontend-engineer"],
    firstRoundRoleIds: ["product-manager"],
    subtasks: [
      {
        id: "step-1",
        roleId: "product-manager",
        title: "Define login requirements",
        description: "Write the login requirements and acceptance criteria.",
        dependsOn: [],
        riskLevel: "low"
      },
      {
        id: "step-2",
        roleId: "tech-lead",
        title: "Design login architecture",
        description: "Design API, state, and security boundaries based on step-1.",
        dependsOn: ["step-1"],
        riskLevel: "low"
      },
      {
        id: "step-3",
        roleId: "frontend-engineer",
        title: "Implement login UI",
        description: "Implement the login screen after the architecture is ready.",
        dependsOn: ["step-2"],
        riskLevel: "low"
      }
    ],
    messages: []
  };
  const { app, page } = await launchApp({}, {
    COSS_LLM_FORCE_ERROR: "0",
    COSS_LLM_MOCK_RESPONSE: JSON.stringify(mockPlan)
  });

  try {
    const result = await page.evaluate(() => window.cossAPI.planTask({
      goal: "Implement login",
      projectName: "Kernel Planner E2E",
      model: { provider: "system", baseUrl: "http://127.0.0.1/v1", modelName: "agent-brain" },
      roles: [
        { id: "product-manager", name: "Product Manager", description: "Requirements" },
        { id: "tech-lead", name: "Tech Lead", description: "Architecture" },
        { id: "frontend-engineer", name: "Frontend Engineer", description: "UI" }
      ]
    }));

    expect(result.ok).toBe(true);
    expect(result.source).toBe("mock");
    expect(result.firstRoundRoleIds).toEqual(["product-manager"]);
    expect(result.neededAgentRoleIds).toEqual(["product-manager", "tech-lead", "frontend-engineer"]);
    expect(result.subtasks.map((item) => item.id)).toEqual(["step-1", "step-2", "step-3"]);
    expect(result.subtasks[1].dependsOn).toEqual(["step-1"]);
    expect(result.subtasks[2].dependsOn).toEqual(["step-2"]);
  } finally {
    await app.close();
  }
});

test("v0.10.0 confirming a Kernel plan auto-starts Agent injection", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-auto-inject-project-"));
  const mockPlan = {
    summary: "Build a small game web collection.",
    neededAgentRoleIds: ["product-manager", "frontend-engineer"],
    firstRoundRoleIds: ["product-manager"],
    subtasks: [
      {
        id: "step-1",
        roleId: "product-manager",
        title: "Define the game collection requirements",
        description: "Define the game list, interaction rules, and acceptance criteria.",
        dependsOn: [],
        riskLevel: "low"
      },
      {
        id: "step-2",
        roleId: "frontend-engineer",
        title: "Implement the game collection UI",
        description: "Implement the game collection after requirements are done.",
        dependsOn: ["step-1"],
        riskLevel: "low"
      }
    ],
    messages: []
  };
  const { app, page, userDataDir } = await launchApp({
    path: projectDir
  }, {
    COSS_LLM_FORCE_ERROR: "0",
    COSS_LLM_MOCK_RESPONSE: JSON.stringify(mockPlan)
  }, {
    settings: {
      agentProvider: "codebuddy",
      agentAutoWorkflowEnabled: false,
      agentAutoWorkflowPaused: false
    }
  });

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("Build a small game web collection.");
    await page.locator('[data-action="create-task"]').click();
    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await page.locator('[data-action="confirm-task-plan"]').click();

    await expect.poll(() => {
      const savedState = JSON.parse(fs.readFileSync(path.join(userDataDir, stateFileName), "utf8"));
      const project = savedState.projects[0];
      const kickoffMessage = (project.messages || []).find((message) => message.source === "orchestrator-dispatch");
      const deliveries = (project.agentDeliveries || []).filter((delivery) => delivery.messageId === kickoffMessage?.id);
      return {
        enabled: savedState.settings?.agentAutoWorkflowEnabled === true,
        paused: savedState.settings?.agentAutoWorkflowPaused === true,
        fromRoleId: kickoffMessage?.fromRoleId || "",
        toRoleIds: kickoffMessage?.toRoleIds || [],
        messageStatus: kickoffMessage?.autoWorkflowStatus || "",
        deliveryCount: deliveries.length,
        deliveryStatus: deliveries[0]?.status || "",
        injectedWindowCount: (kickoffMessage?.injectedWindowIds || []).length
      };
    }, { timeout: 18000 }).toEqual({
      enabled: true,
      paused: false,
      fromRoleId: "system",
      toRoleIds: ["product-manager"],
      messageStatus: "submitted",
      deliveryCount: 1,
      deliveryStatus: "submitted",
      injectedWindowCount: 1
    });
  } finally {
    await app.close();
  }
});

test("v0.10.0 task list only shows execute button for the current Kernel step", async () => {
  const createdAt = "2026-01-01T02:10:00.000Z";
  const subtasks = [
    ["subtask-current-1", "product-manager", "Define requirements", "done", [], true],
    ["subtask-current-2", "tech-lead", "Design architecture", "done", ["step-1"], false],
    ["subtask-current-3", "frontend-engineer", "Build current UI step", "idle", ["step-2"], false],
    ["subtask-current-4", "qa-engineer", "Test after UI", "idle", ["step-3"], false]
  ].map(([id, roleId, title, status, dependsOn, isEntryStep]) => ({
    id,
    roleId,
    title,
    description: `${title} description.`,
    status,
    dependsOn,
    isEntryStep,
    createdAt,
    updatedAt: createdAt
  }));
  const { app, page } = await launchApp({
    tasks: [
      {
        id: "task-current-step",
        title: "Current step task",
        goal: "Verify manual execute button follows currentStep.",
        status: "running",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "test",
          summary: "Current step UI test",
          neededAgentRoleIds: ["product-manager", "tech-lead", "frontend-engineer", "qa-engineer"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks,
        orchestrator: {
          version: "0.10.0",
          mode: "central-orchestrator",
          owner: "CosS Kernel",
          kernel: { version: "0.10.0", architecture: "durable-workflow-kernel", leaseMs: 300000 },
          sharedState: { currentStep: "step-3", artifacts: [], decisions: [], constraints: [] },
          locks: [],
          approvals: [],
          events: [],
          steps: subtasks.map((subtask, index) => ({
            id: `step-${index + 1}`,
            subtaskId: subtask.id,
            roleId: subtask.roleId,
            title: subtask.title,
            description: subtask.description,
            status: subtask.status,
            phase: subtask.status,
            dependsOn: subtask.dependsOn,
            isEntryStep: subtask.isEntryStep,
            assignedMessageId: index === 2 ? "msg-current-step-3" : "",
            createdAt,
            updatedAt: createdAt
          }))
        }
      }
    ],
    messages: [
      {
        id: "msg-current-step-3",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-current-step",
        fromRoleId: "system",
        toRoleIds: ["frontend-engineer"],
        content: "Current step dispatch.",
        taskId: "task-current-step",
        source: "orchestrator-dispatch",
        status: "sent",
        readBy: [],
        subtaskRefs: { "frontend-engineer": "subtask-current-3" },
        createdAt
      }
    ]
  });

  try {
    await page.locator('.workspace-actions [data-action="open-task-list-window"]').click();
    await expect(page.locator(".task-list-detail")).toBeVisible();
    const cards = page.locator(".task-detail-subtask");
    await expect(cards).toHaveCount(4);
    await expect(cards.nth(0).locator('[data-action="execute-kernel-subtask"]')).toHaveCount(0);
    await expect(cards.nth(1).locator('[data-action="execute-kernel-subtask"]')).toHaveCount(0);
    await expect(cards.nth(2).locator('[data-action="execute-kernel-subtask"]')).toHaveCount(1);
    await expect(cards.nth(3).locator('[data-action="execute-kernel-subtask"]')).toHaveCount(0);
    await expect(page.locator('[data-action="set-subtask-status"][data-status="running"]')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("v0.10.0 project MCP config exposes Kernel tools", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v091-mcp-config-"));
  const { app, page } = await launchApp({ path: projectDir });

  try {
    const result = await page.evaluate((projectPath) => window.cossAPI.writeProjectMcpConfig({
      projectId: "project-e2e",
      projectPath
    }), projectDir);

    expect(result.ok).toBe(true);
    const cossConfig = JSON.parse(fs.readFileSync(path.join(projectDir, ".coss", "mcp", "coss-mcp.json"), "utf8"));
    expect(cossConfig.appVersion).toBe("0.10.0");
    expect(cossConfig.tools).toEqual([
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
    ]);
    const removedToolNames = [
      ["pool", "send"],
      ["start", "agent"],
      ["hand", "off"]
    ].map((parts) => `coss_${parts.join("_")}`);
    for (const removedToolName of removedToolNames) {
      expect(cossConfig.tools).not.toContain(removedToolName);
    }
  } finally {
    await app.close();
  }
});

test("v0.10.0 MCP server exposes Kernel workflow tools", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v091-tools-"));
  writeState(userDataDir, createInitialState(process.cwd()));

  const responses = runMcpInitialize(userDataDir);
  const toolsResponse = responses.find((item) => item.id === 2);
  const toolNames = toolsResponse.result.tools.map((tool) => tool.name);

  expect(toolNames).toContain("coss_get_task_board");
  expect(toolNames).toContain("coss_heartbeat_step");
  expect(toolNames).toContain("coss_get_kernel_events");
  expect(toolNames).toContain("coss_submit_result");
  expect(toolNames).toContain("coss_acquire_lock");
  const removedToolNames = [
    ["pool", "send"],
    ["start", "agent"],
    ["hand", "off"]
  ].map((parts) => `coss_${parts.join("_")}`);
  for (const removedToolName of removedToolNames) {
    expect(toolNames).not.toContain(removedToolName);
    expect(runMcpToolFailure(userDataDir, removedToolName)).toContain("Unknown tool");
  }
});

test("v0.10.0 MCP submit result refreshes project memory context", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-memory-mcp-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-memory-mcp-project-"));
  const createdAt = "2026-01-01T02:10:00.000Z";
  const state = createInitialState(projectDir, {
    tasks: [
      {
        id: "task-memory-mcp",
        title: "Remember PRD",
        goal: "Persist project memory from Agent output.",
        status: "planned",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "kernel-planner",
          summary: "Memory submit flow",
          neededAgentRoleIds: ["product-manager"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks: [
          {
            id: "subtask-memory-mcp-1",
            roleId: "product-manager",
            title: "Write project PRD",
            description: "Write the initial PRD artifact.",
            status: "idle",
            dependsOn: [],
            isEntryStep: true,
            createdAt,
            updatedAt: createdAt
          }
        ]
      }
    ]
  });
  writeState(userDataDir, state);

  const claim = runMcpTool(userDataDir, "coss_claim_step", {
    roleId: "product-manager",
    taskId: "task-memory-mcp",
    subtaskId: "subtask-memory-mcp-1"
  });
  expect(claim.ok).toBe(true);

  const submit = runMcpTool(userDataDir, "coss_submit_result", {
    roleId: "product-manager",
    taskId: "task-memory-mcp",
    subtaskId: "subtask-memory-mcp-1",
    status: "done",
    summary: "PRD completed and should be remembered.",
    usedCapabilities: ["requirements.define"],
    artifacts: [
      {
        path: "docs/memory-prd.md",
        type: "file",
        description: "Project PRD artifact."
      }
    ]
  });
  expect(submit.ok).toBe(true);

  const context = runMcpTool(userDataDir, "coss_get_context", {
    roleId: "product-manager",
    taskId: "task-memory-mcp"
  });
  expect(context.projectMemory.enabled).toBe(true);
  expect(context.projectMemory.summary).toContain("PRD completed");
  expect(context.projectMemory.summary).toContain("docs/memory-prd.md");

  const savedState = JSON.parse(fs.readFileSync(path.join(userDataDir, stateFileName), "utf8"));
  expect(savedState.projects[0].memory.summary).toContain("docs/memory-prd.md");
});

test("v0.10.0 Kernel keeps stable step ids for legacy subtasks without ids", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-stable-steps-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-stable-steps-project-"));
  const createdAt = "2026-01-01T02:10:00.000Z";
  const state = createInitialState(projectDir, {
    tasks: [
      {
        id: "task-legacy",
        title: "Legacy task",
        goal: "Verify stable Kernel step identity for legacy subtasks.",
        status: "planned",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "kernel-planner",
          summary: "Legacy subtask without id",
          neededAgentRoleIds: ["product-manager"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks: [
          {
            roleId: "product-manager",
            title: "Define game requirements",
            description: "Write stable requirements.",
            status: "idle",
            dependsOn: [],
            isEntryStep: true,
            createdAt,
            updatedAt: createdAt
          }
        ]
      }
    ]
  });
  writeState(userDataDir, state);

  const firstClaim = runMcpTool(userDataDir, "coss_claim_step", {
    roleId: "product-manager",
    taskId: "task-legacy"
  });
  expect(firstClaim.subtaskId).toBe("subtask-task-legacy-01-product-manager-define-game-requirements");
  expect(firstClaim.stepId).toBe(`step-${firstClaim.subtaskId}`);

  const heartbeat = runMcpTool(userDataDir, "coss_heartbeat_step", {
    roleId: "product-manager",
    taskId: "task-legacy",
    subtaskId: firstClaim.subtaskId,
    message: "still working"
  });
  expect(heartbeat.stepId).toBe(firstClaim.stepId);

  const board = runMcpTool(userDataDir, "coss_get_task_board", {
    roleId: "product-manager",
    taskId: "task-legacy"
  });
  expect(board.orchestrator.steps[0].id).toBe(firstClaim.stepId);
  expect(board.orchestrator.steps[0].subtaskId).toBe(firstClaim.subtaskId);

  const savedState = JSON.parse(fs.readFileSync(path.join(userDataDir, stateFileName), "utf8"));
  const savedTask = savedState.projects[0].tasks.find((item) => item.id === "task-legacy");
  expect(savedTask.subtasks[0].id).toBe(firstClaim.subtaskId);
  expect(savedTask.orchestrator.steps[0].id).toBe(firstClaim.stepId);
});

test("v0.10.0 Kernel dispatches preplanned dependent steps after prerequisites complete", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-preplanned-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-preplanned-project-"));
  const createdAt = "2026-01-01T02:00:00.000Z";
  const state = createInitialState(projectDir, {
    tasks: [
      {
        id: "task-preplanned",
        title: "Preplanned linear task",
        goal: "Verify preplanned dependent dispatch.",
        status: "running",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "kernel-planner",
          summary: "Preplanned linear workflow",
          neededAgentRoleIds: ["product-manager", "tech-lead"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks: [
          {
            id: "subtask-preplanned-pm",
            roleId: "product-manager",
            title: "Define requirements",
            description: "Define requirements first.",
            status: "idle",
            dependsOn: [],
            isEntryStep: true,
            createdAt,
            updatedAt: createdAt
          },
          {
            id: "subtask-preplanned-tech",
            roleId: "tech-lead",
            title: "Design architecture",
            description: "Design architecture after requirements are complete.",
            status: "idle",
            dependsOn: ["subtask-preplanned-pm"],
            isEntryStep: false,
            createdAt,
            updatedAt: createdAt
          }
        ]
      }
    ],
    messages: [
      {
        id: "msg-preplanned-pm",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-preplanned",
        fromRoleId: "system",
        toRoleIds: ["product-manager"],
        content: "CosS Orchestrator dispatch: define requirements.",
        taskId: "task-preplanned",
        source: "orchestrator-dispatch",
        status: "sent",
        readBy: [],
        subtaskRefs: { "product-manager": "subtask-preplanned-pm" },
        createdAt
      }
    ]
  });
  writeState(userDataDir, state);

  const claimMessage = runMcpTool(userDataDir, "coss_pool_claim", {
    roleId: "product-manager",
    taskId: "task-preplanned",
    messageId: "msg-preplanned-pm"
  });
  expect(claimMessage.subtaskId).toBe("subtask-preplanned-pm");

  runMcpTool(userDataDir, "coss_claim_step", {
    roleId: "product-manager",
    taskId: "task-preplanned",
    subtaskId: "subtask-preplanned-pm"
  });

  const submit = runMcpTool(userDataDir, "coss_submit_result", {
    roleId: "product-manager",
    taskId: "task-preplanned",
    subtaskId: "subtask-preplanned-pm",
    status: "done",
    usedCapabilities: ["requirements.define"],
    summary: "Requirements are complete."
  });
  expect(submit.ok).toBe(true);
  expect(submit.createdSteps).toHaveLength(1);
  expect(submit.createdSteps[0].roleId).toBe("tech-lead");
  expect(submit.createdSteps[0].source).toBe("preplanned-ready-step");

  const savedState = JSON.parse(fs.readFileSync(path.join(userDataDir, stateFileName), "utf8"));
  const task = savedState.projects[0].tasks.find((item) => item.id === "task-preplanned");
  const techStep = task.orchestrator.steps.find((item) => item.subtaskId === "subtask-preplanned-tech");
  expect(techStep.assignedMessageId).toBeTruthy();
  expect(savedState.projects[0].messages.some((item) => (
    item.id === techStep.assignedMessageId
    && item.source === "orchestrator-dispatch"
    && item.fromRoleId === "system"
    && item.toRoleIds.includes("tech-lead")
  ))).toBe(true);
  expect(task.orchestrator.events.some((event) => (
    event.type === "step.dispatched"
    && event.subtaskId === "subtask-preplanned-tech"
    && event.payload.source === "preplanned-ready-step"
  ))).toBe(true);
});

test("v0.10.0 renderer auto-injects the next Kernel step after MCP completion", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-sequence-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-sequence-project-"));
  const createdAt = "2026-01-01T02:20:00.000Z";
  const agentWindow = (id, roleId, x) => ({
    id,
    type: "terminal",
    roleId,
    title: `${roleId} Agent(CodeBuddy Code)`,
    x,
    y: 120,
    width: 520,
    height: 340,
    z: x,
    status: "idle",
    terminalMode: "agent",
    agentProvider: "codebuddy",
    minimized: false,
    maximized: false,
    restoreBounds: null,
    desktopId: "desktop-main"
  });
  const state = createInitialState(projectDir, {
    windows: [
      agentWindow("win-sequence-pm", "product-manager", 260),
      agentWindow("win-sequence-tech", "tech-lead", 820)
    ],
    tasks: [
      {
        id: "task-sequence",
        title: "Kernel sequence task",
        goal: "Verify step2 is injected after step1 completes.",
        status: "running",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "kernel-planner",
          summary: "Sequential Kernel workflow",
          neededAgentRoleIds: ["product-manager", "tech-lead"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks: [
          {
            id: "subtask-sequence-pm",
            roleId: "product-manager",
            title: "Define requirements",
            description: "Define requirements first.",
            status: "idle",
            dependsOn: [],
            isEntryStep: true,
            assignedMessageId: "msg-sequence-pm",
            createdAt,
            updatedAt: createdAt
          },
          {
            id: "subtask-sequence-tech",
            roleId: "tech-lead",
            title: "Design architecture",
            description: "Design architecture after requirements are complete.",
            status: "idle",
            dependsOn: ["subtask-sequence-pm"],
            isEntryStep: false,
            createdAt,
            updatedAt: createdAt
          }
        ]
      }
    ],
    messages: [
      {
        id: "msg-sequence-pm",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-sequence",
        fromRoleId: "system",
        toRoleIds: ["product-manager"],
        content: "CosS Kernel dispatch: define requirements.",
        taskId: "task-sequence",
        source: "orchestrator-dispatch",
        status: "sent",
        readBy: [],
        injectedWindowIds: ["win-sequence-pm"],
        autoWorkflow: true,
        autoWorkflowStatus: "submitted",
        subtaskRefs: { "product-manager": "subtask-sequence-pm" },
        createdAt
      }
    ]
  }, {
    settings: {
      agentProvider: "codebuddy",
      agentAutoWorkflowEnabled: true,
      agentAutoWorkflowPaused: false
    }
  });
  writeState(userDataDir, state);

  const { app, page } = await launchAppWithUserData(userDataDir);
  try {
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".workspace")).toBeVisible();
    await page.waitForTimeout(2200);
    runMcpTool(userDataDir, "coss_pool_claim", {
      roleId: "product-manager",
      taskId: "task-sequence",
      messageId: "msg-sequence-pm"
    });
    runMcpTool(userDataDir, "coss_claim_step", {
      roleId: "product-manager",
      taskId: "task-sequence",
      subtaskId: "subtask-sequence-pm"
    });
    const submit = runMcpTool(userDataDir, "coss_submit_result", {
      roleId: "product-manager",
      taskId: "task-sequence",
      subtaskId: "subtask-sequence-pm",
      status: "done",
      usedCapabilities: ["requirements.define"],
      summary: "Requirements are complete."
    });
    expect(submit.createdSteps).toHaveLength(1);
    expect(submit.createdSteps[0].roleId).toBe("tech-lead");

    await expect.poll(() => {
      const savedState = JSON.parse(fs.readFileSync(path.join(userDataDir, stateFileName), "utf8"));
      const project = savedState.projects[0];
      const task = project.tasks.find((item) => item.id === "task-sequence");
      const techStep = task.orchestrator.steps.find((item) => item.subtaskId === "subtask-sequence-tech");
      const techMessage = project.messages.find((item) => item.id === techStep?.assignedMessageId);
      const delivery = project.agentDeliveries.find((item) => item.messageId === techMessage?.id && item.roleId === "tech-lead");
      return {
        fromRoleId: techMessage?.fromRoleId || "",
        toRoleIds: techMessage?.toRoleIds || [],
        autoWorkflowStatus: techMessage?.autoWorkflowStatus || "",
        deliveryStatus: delivery?.status || "",
        hasDeliveryWindow: Boolean(delivery?.windowId),
        injectedWindowCount: (techMessage?.injectedWindowIds || []).length
      };
    }, { timeout: 26000 }).toEqual({
      fromRoleId: "system",
      toRoleIds: ["tech-lead"],
      autoWorkflowStatus: "submitted",
      deliveryStatus: "submitted",
      hasDeliveryWindow: true,
      injectedWindowCount: 1
    });
  } finally {
    await app.close();
  }
});

test("v0.10.0 renderer does not replay completed Kernel dispatches after relaunch", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-completed-relaunch-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-completed-relaunch-project-"));
  const createdAt = "2026-01-01T02:40:00.000Z";
  const state = createInitialState(projectDir, {
    windows: [
      {
        id: "win-completed-pm",
        type: "terminal",
        roleId: "product-manager",
        title: "product-manager Agent(CodeBuddy Code)",
        x: 260,
        y: 120,
        width: 520,
        height: 340,
        z: 1,
        status: "idle",
        terminalMode: "agent",
        agentProvider: "codebuddy",
        minimized: false,
        maximized: false,
        restoreBounds: null,
        desktopId: "desktop-main"
      }
    ],
    tasks: [
      {
        id: "task-completed-relaunch",
        title: "Completed relaunch task",
        goal: "Verify completed Kernel dispatches are not restored as pending work.",
        status: "done",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "test",
          summary: "Completed workflow",
          neededAgentRoleIds: ["product-manager"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks: [
          {
            id: "subtask-completed-pm",
            roleId: "product-manager",
            title: "Define requirements",
            description: "Already completed.",
            status: "done",
            dependsOn: [],
            isEntryStep: true,
            assignedMessageId: "msg-completed-pm",
            createdAt,
            updatedAt: createdAt
          }
        ],
        orchestrator: {
          version: "0.10.0",
          mode: "central-orchestrator",
          owner: "CosS Kernel",
          kernel: { version: "0.10.0", architecture: "durable-workflow-kernel", leaseMs: 300000 },
          policy: { directAgentMessaging: false, durableWorkflow: true, stepLeases: true },
          sharedState: { currentStep: "step-completed-pm", artifacts: [], decisions: [], constraints: [] },
          locks: [],
          approvals: [],
          events: [],
          steps: [
            {
              id: "step-completed-pm",
              subtaskId: "subtask-completed-pm",
              roleId: "product-manager",
              title: "Define requirements",
              description: "Already completed.",
              status: "done",
              phase: "done",
              dependsOn: [],
              assignedMessageId: "msg-completed-pm",
              claimedBy: "product-manager",
              lease: null,
              riskLevel: "low",
              allowedCapabilities: ["requirements.define"],
              source: "orchestrator",
              createdAt,
              updatedAt: createdAt
            }
          ]
        }
      }
    ],
    messages: [
      {
        id: "msg-completed-pm",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-completed-relaunch",
        fromRoleId: "system",
        toRoleIds: ["product-manager"],
        content: "Old completed dispatch should not be replayed.",
        taskId: "task-completed-relaunch",
        source: "orchestrator-dispatch",
        status: "sent",
        readBy: [],
        injectedWindowIds: [],
        autoWorkflow: true,
        autoWorkflowStatus: "queued",
        subtaskRefs: { "product-manager": "subtask-completed-pm" },
        createdAt
      }
    ],
    agentDeliveries: []
  }, {
    settings: {
      agentProvider: "codebuddy",
      agentAutoWorkflowEnabled: true,
      agentAutoWorkflowPaused: false
    }
  });
  writeState(userDataDir, state);

  const { app, page } = await launchAppWithUserData(userDataDir);
  try {
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".workspace")).toBeVisible();

    await expect.poll(async () => {
      const savedState = await page.evaluate(() => window.cossAPI.loadState());
      const project = savedState.projects.find((item) => item.id === "project-e2e");
      const task = project.tasks.find((item) => item.id === "task-completed-relaunch");
      const step = task.orchestrator.steps.find((item) => item.id === "step-completed-pm");
      const message = project.messages.find((item) => item.id === "msg-completed-pm");
      const deliveries = project.agentDeliveries.filter((delivery) => delivery.messageId === "msg-completed-pm");
      return {
        taskStatus: task.status,
        stepPhase: step.phase,
        messageStatus: message.autoWorkflowStatus,
        deliveryCount: deliveries.length
      };
    }, { timeout: 6000 }).toEqual({
      taskStatus: "done",
      stepPhase: "done",
      messageStatus: "completed",
      deliveryCount: 0
    });
  } finally {
    await app.close();
  }
});

test("v0.10.0 renderer stale saves preserve MCP-dispatched downstream steps", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-merge-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-merge-project-"));
  const createdAt = "2026-01-01T02:00:00.000Z";
  const state = createInitialState(projectDir, {
    tasks: [
      {
        id: "task-merge",
        title: "Merge state task",
        goal: "Verify renderer stale save cannot erase MCP dispatch.",
        status: "planned",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "test",
          summary: "Merge protection",
          neededAgentRoleIds: ["product-manager", "tech-lead"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks: [
          {
            id: "subtask-merge-pm",
            roleId: "product-manager",
            title: "Define requirements",
            description: "Define requirements.",
            status: "idle",
            dependsOn: [],
            isEntryStep: true,
            createdAt,
            updatedAt: createdAt,
            assignedMessageId: "msg-merge-pm"
          },
          {
            id: "subtask-merge-tech",
            roleId: "tech-lead",
            title: "Design architecture",
            description: "Design architecture.",
            status: "idle",
            dependsOn: ["subtask-merge-pm"],
            isEntryStep: false,
            createdAt,
            updatedAt: createdAt
          }
        ]
      }
    ],
    messages: [
      {
        id: "msg-merge-pm",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-merge",
        fromRoleId: "system",
        toRoleIds: ["product-manager"],
        content: "CosS Orchestrator dispatch: define requirements.",
        taskId: "task-merge",
        source: "orchestrator-dispatch",
        status: "sent",
        readBy: [],
        subtaskRefs: { "product-manager": "subtask-merge-pm" },
        createdAt
      }
    ]
  });
  writeState(userDataDir, state);

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

  const staleRendererState = await page.evaluate(() => window.cossAPI.loadState());
  runMcpTool(userDataDir, "coss_pool_claim", {
    roleId: "product-manager",
    taskId: "task-merge",
    messageId: "msg-merge-pm"
  });
  runMcpTool(userDataDir, "coss_claim_step", {
    roleId: "product-manager",
    taskId: "task-merge",
    subtaskId: "subtask-merge-pm"
  });
  const submit = runMcpTool(userDataDir, "coss_submit_result", {
    roleId: "product-manager",
    taskId: "task-merge",
    subtaskId: "subtask-merge-pm",
    status: "done",
    usedCapabilities: ["requirements.define"],
    summary: "Requirements are complete."
  });
  expect(submit.createdSteps.some((step) => step.roleId === "tech-lead")).toBe(true);

  await page.evaluate((snapshot) => window.cossAPI.saveState(snapshot), staleRendererState);
  const finalState = await page.evaluate(() => window.cossAPI.loadState());
  const finalProject = finalState.projects.find((project) => project.id === "project-e2e");
  const finalTask = finalProject.tasks.find((task) => task.id === "task-merge");
  const techStep = finalTask.orchestrator.steps.find((step) => step.subtaskId === "subtask-merge-tech");

  expect(techStep.assignedMessageId).toBeTruthy();
  expect(finalProject.messages.some((message) => (
    message.id === techStep.assignedMessageId
    && message.source === "orchestrator-dispatch"
    && message.toRoleIds.includes("tech-lead")
  ))).toBe(true);

  await app.close();
});

test("v0.10.0 renderer repairs ready idle steps that lost dispatch messages", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-repair-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v010-repair-project-"));
  const createdAt = "2026-01-01T02:30:00.000Z";
  const state = createInitialState(projectDir, {
    tasks: [
      {
        id: "task-repair",
        title: "Repair dispatch task",
        goal: "Recover a ready idle step after a lost dispatch write.",
        status: "planned",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "test",
          summary: "Repair missing dispatch",
          neededAgentRoleIds: ["product-manager", "tech-lead"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks: [
          {
            id: "subtask-repair-pm",
            roleId: "product-manager",
            title: "Define requirements",
            description: "Already done.",
            status: "done",
            dependsOn: [],
            isEntryStep: true,
            createdAt,
            updatedAt: createdAt,
            assignedMessageId: "msg-repair-pm"
          },
          {
            id: "subtask-repair-tech",
            roleId: "tech-lead",
            title: "Design architecture",
            description: "Ready but dispatch message was lost.",
            status: "idle",
            dependsOn: ["subtask-repair-pm"],
            isEntryStep: false,
            createdAt,
            updatedAt: createdAt
          }
        ],
        orchestrator: {
          version: "0.10.0",
          mode: "central-orchestrator",
          owner: "CosS Kernel",
          kernel: { version: "0.10.0", architecture: "durable-workflow-kernel", leaseMs: 300000 },
          policy: { directAgentMessaging: false, durableWorkflow: true, stepLeases: true },
          sharedState: { currentStep: "step-repair-pm", artifacts: [], decisions: [], constraints: [] },
          locks: [],
          approvals: [],
          events: [],
          steps: [
            {
              id: "step-repair-pm",
              subtaskId: "subtask-repair-pm",
              roleId: "product-manager",
              title: "Define requirements",
              description: "Already done.",
              status: "done",
              phase: "done",
              dependsOn: [],
              assignedMessageId: "msg-repair-pm",
              claimedBy: "product-manager",
              lease: null,
              riskLevel: "low",
              allowedCapabilities: ["requirements.define"],
              source: "orchestrator",
              createdAt,
              updatedAt: createdAt
            },
            {
              id: "step-repair-tech",
              subtaskId: "subtask-repair-tech",
              roleId: "tech-lead",
              title: "Design architecture",
              description: "Ready but dispatch message was lost.",
              status: "idle",
              phase: "idle",
              dependsOn: ["step-repair-pm"],
              assignedMessageId: "",
              claimedBy: "",
              lease: null,
              riskLevel: "low",
              allowedCapabilities: ["architecture.design"],
              source: "orchestrator",
              createdAt,
              updatedAt: createdAt
            }
          ]
        }
      }
    ],
    messages: [
      {
        id: "msg-repair-pm",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-repair",
        fromRoleId: "system",
        toRoleIds: ["product-manager"],
        content: "Original kickoff.",
        taskId: "task-repair",
        source: "orchestrator-dispatch",
        status: "sent",
        readBy: ["product-manager"],
        subtaskRefs: { "product-manager": "subtask-repair-pm" },
        createdAt
      }
    ]
  }, {
    settings: {
      agentAutoWorkflowEnabled: false,
      agentAutoWorkflowPaused: false
    }
  });
  writeState(userDataDir, state);

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

  await expect.poll(async () => {
    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    const project = savedState.projects.find((item) => item.id === "project-e2e");
    const task = project.tasks.find((item) => item.id === "task-repair");
    const step = task.orchestrator.steps.find((item) => item.subtaskId === "subtask-repair-tech");
    return {
      assigned: Boolean(step.assignedMessageId),
      hasMessage: project.messages.some((message) => message.id === step.assignedMessageId && message.toRoleIds.includes("tech-lead"))
    };
  }).toEqual({ assigned: true, hasMessage: true });

  await app.close();
});

test("v0.10.0 Kernel owns leases, dispatch, capability sandbox, structured results, and locks", async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v091-orchestrator-"));
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-v091-project-"));
  const createdAt = "2026-01-01T03:00:00.000Z";
  const state = createInitialState(projectDir, {
    tasks: [
      {
        id: "task-orchestrator",
        title: "Central orchestrator task",
        goal: "Verify central orchestrator scheduling.",
        status: "running",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: {
          status: "success",
          source: "test",
          summary: "Central orchestrator",
          neededAgentRoleIds: ["product-manager", "frontend-engineer"],
          firstRoundRoleIds: ["product-manager"],
          plannedAt: createdAt,
          confirmedAt: createdAt
        },
        subtasks: [
          {
            id: "subtask-orchestrator-pm",
            roleId: "product-manager",
            title: "Define requirements",
            description: "Define product requirements.",
            status: "idle",
            createdAt,
            updatedAt: createdAt,
            dependsOn: [],
            isEntryStep: true
          },
          {
            id: "subtask-orchestrator-frontend",
            roleId: "frontend-engineer",
            title: "Implement UI",
            description: "Implement the UI after requirements are done.",
            status: "idle",
            createdAt,
            updatedAt: createdAt,
            dependsOn: ["subtask-orchestrator-pm"],
            isEntryStep: false
          }
        ]
      }
    ],
    messages: [
      {
        id: "msg-orchestrator-pm",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-orchestrator",
        fromRoleId: "system",
        toRoleIds: ["product-manager"],
        content: "CosS Orchestrator dispatch: define requirements.",
        taskId: "task-orchestrator",
        source: "orchestrator-dispatch",
        status: "sent",
        readBy: [],
        subtaskRefs: { "product-manager": "subtask-orchestrator-pm" },
        createdAt
      }
    ]
  });
  writeState(userDataDir, state);

  const board = runMcpTool(userDataDir, "coss_get_task_board", {
    roleId: "product-manager",
    taskId: "task-orchestrator"
  });
  expect(board.ok).toBe(true);
  expect(board.orchestrator.mode).toBe("central-orchestrator");
  expect(board.orchestrator.version).toBe("0.10.0");
  expect(board.orchestrator.kernel.architecture).toBe("durable-workflow-kernel");
  expect(board.orchestrator.policy.eventSourcing).toBe(true);
  expect(board.orchestrator.policy.stepLeases).toBe(true);
  expect(board.orchestrator.policy.directAgentMessaging).toBe(false);

  const roles = runMcpTool(userDataDir, "coss_list_roles", {
    roleId: "product-manager",
    taskId: "task-orchestrator"
  });
  expect(roles.roles.find((role) => role.id === "product-manager").capabilities).toContain("requirements.define");

  const claimMessage = runMcpTool(userDataDir, "coss_pool_claim", {
    roleId: "product-manager",
    taskId: "task-orchestrator",
    messageId: "msg-orchestrator-pm"
  });
  expect(claimMessage.subtaskId).toBe("subtask-orchestrator-pm");

  const claimStep = runMcpTool(userDataDir, "coss_claim_step", {
    roleId: "product-manager",
    taskId: "task-orchestrator",
    subtaskId: "subtask-orchestrator-pm"
  });
  expect(claimStep.status).toBe("running");
  expect(claimStep.phase).toBe("running");
  expect(claimStep.lease.ownerRoleId).toBe("product-manager");

  const heartbeat = runMcpTool(userDataDir, "coss_heartbeat_step", {
    roleId: "product-manager",
    taskId: "task-orchestrator",
    subtaskId: "subtask-orchestrator-pm",
    message: "still working"
  });
  expect(heartbeat.ok).toBe(true);
  expect(heartbeat.lease.ownerRoleId).toBe("product-manager");

  const releaseStep = runMcpTool(userDataDir, "coss_release_step", {
    roleId: "product-manager",
    taskId: "task-orchestrator",
    subtaskId: "subtask-orchestrator-pm",
    reason: "manual recovery test"
  });
  expect(releaseStep.ok).toBe(true);
  expect(releaseStep.phase).toBe("idle");
  expect(releaseStep.status).toBe("idle");
  expect(releaseStep.previousLease.ownerRoleId).toBe("product-manager");

  const reclaimStep = runMcpTool(userDataDir, "coss_claim_step", {
    roleId: "product-manager",
    taskId: "task-orchestrator",
    subtaskId: "subtask-orchestrator-pm"
  });
  expect(reclaimStep.status).toBe("running");
  expect(reclaimStep.lease.ownerRoleId).toBe("product-manager");

  expect(() => runMcpTool(userDataDir, "coss_submit_result", {
    roleId: "product-manager",
    taskId: "task-orchestrator",
    subtaskId: "subtask-orchestrator-pm",
    status: "done",
    usedCapabilities: ["send_email"],
    summary: "Invalid capability should fail."
  })).toThrow(/Capability not allowed/);

  const lock = runMcpTool(userDataDir, "coss_acquire_lock", {
    roleId: "product-manager",
    taskId: "task-orchestrator",
    resource: "docs/requirements.md",
    reason: "Writing PRD"
  });
  expect(lock.ok).toBe(true);

  const conflictingLock = runMcpTool(userDataDir, "coss_acquire_lock", {
    roleId: "tech-lead",
    taskId: "task-orchestrator",
    resource: "docs/requirements.md"
  }, { roleId: "tech-lead" });
  expect(conflictingLock.ok).toBe(false);
  expect(conflictingLock.ownerRoleId).toBe("product-manager");

  const submit = runMcpTool(userDataDir, "coss_submit_result", {
    roleId: "product-manager",
    taskId: "task-orchestrator",
    subtaskId: "subtask-orchestrator-pm",
    status: "done",
    usedCapabilities: ["requirements.define", "acceptance.define"],
    artifacts: [{ path: "docs/requirements.md", type: "prd", description: "Initial PRD" }],
    summary: "Requirements defined."
  });
  expect(submit.ok).toBe(true);
  expect(submit.createdSteps).toHaveLength(1);
  expect(submit.createdSteps[0].roleId).toBe("frontend-engineer");

  const savedState = JSON.parse(fs.readFileSync(path.join(userDataDir, stateFileName), "utf8"));
  const task = savedState.projects[0].tasks.find((item) => item.id === "task-orchestrator");
  expect(task.subtasks.find((item) => item.id === "subtask-orchestrator-pm").status).toBe("done");
  const finishedStep = task.orchestrator.steps.find((item) => item.subtaskId === "subtask-orchestrator-pm");
  expect(finishedStep.phase).toBe("done");
  expect(finishedStep.lease).toBe(null);
  expect(task.subtasks.some((item) => item.id === "subtask-orchestrator-frontend" && item.roleId === "frontend-engineer")).toBe(true);
  expect(savedState.projects[0].messages.some((item) => (
    item.source === "orchestrator-dispatch"
    && item.toRoleIds.includes("frontend-engineer")
  ))).toBe(true);
  expect(task.orchestrator.sharedState.artifacts.some((item) => item.path === "docs/requirements.md")).toBe(true);

  const events = runMcpTool(userDataDir, "coss_get_kernel_events", {
    roleId: "product-manager",
    taskId: "task-orchestrator",
    limit: 100
  });
  expect(events.ok).toBe(true);
  expect(events.events.some((event) => event.type === "step.heartbeat")).toBe(true);
  expect(events.events.some((event) => event.type === "step.result.submitted")).toBe(true);
  expect(events.projections.taskBoard.done).toBeGreaterThanOrEqual(1);
});
