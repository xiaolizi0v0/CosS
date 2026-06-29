const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { test, expect, _electron: electron } = require("@playwright/test");

const stateFileName = "coss-workspace-state.json";

function createInitialState(projectPath, projectOverrides = {}) {
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
        tasks: [],
        messages: [],
        ...projectOverrides
      }
    ]
  };
}

async function launchApp(projectOverrides = {}, envOverrides = {}, stateOverrides = {}) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-e2e-"));
  fs.writeFileSync(
    path.join(userDataDir, stateFileName),
    JSON.stringify({ ...createInitialState(process.cwd(), projectOverrides), ...stateOverrides }, null, 2),
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
      COSS_TEST_USER_DATA: userDataDir,
      ...envOverrides
    }
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");

  return { app, page, userDataDir };
}

async function waitForLogEvent(userDataDir, eventName) {
  const logDir = path.join(userDataDir, "logs");
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fs.existsSync(logDir)) {
      const text = fs
        .readdirSync(logDir)
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => fs.readFileSync(path.join(logDir, name), "utf8"))
        .join("\n");
      if (text.includes(`"event":"${eventName}"`)) {
        return text;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for log event ${eventName}`);
}

async function waitForSavedState(userDataDir, predicate, timeoutMs = 5000) {
  const statePath = path.join(userDataDir, stateFileName);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      if (predicate(state)) {
        return state;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for saved state condition");
}

test("boots into the workspace shell", async () => {
  const { app, page } = await launchApp();

  try {
    await expect(page.locator(".brand")).toContainText("CosS");
    await expect(page.locator(".brand-version")).toHaveText("v0.5.7");
    await expect(page.locator(".app-shell")).toBeVisible();
    await expect(page.locator(".workspace-title")).toHaveText("E2E Project");
  } finally {
    await app.close();
  }
});

test("creates a project from the project modal", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator('[data-action="show-create-project"]').first().click();
    await expect(page.locator(".modal")).toBeVisible();

    await page.locator("#projectName").fill("Automated Project");
    await page.locator("#projectPath").fill(process.cwd());
    await page.locator('[data-action="create-project"]').click();

    await expect(page.locator(".modal")).toHaveCount(0);
    await expect(page.locator(".workspace-title")).toHaveText("Automated Project");
    await expect(page.locator(".project-name", { hasText: "Automated Project" })).toBeVisible();
  } finally {
    await app.close();
  }
});

test("renders v0.5.7 custom title bar menus and exposes log directory info", async () => {
  const { app, page, userDataDir } = await launchApp();

  try {
    await expect(page.locator(".app-titlebar")).toBeVisible();
    await expect(page.locator(".app-title-text")).toHaveText("CosS");
    await expect(page.locator(".app-menu-button")).toHaveText(["文件", "编辑", "帮助"]);
    await expect(page.locator(".app-window-control")).toHaveCount(3);

    await page.locator('.app-menu-button[data-menu-id="file"]').click();
    await expect(page.locator(".app-menu-dropdown")).toContainText("新建窗口");
    await expect(page.locator(".app-menu-dropdown")).toContainText("新建任务");
    await expect(page.locator(".app-menu-dropdown")).toContainText("新建项目");
    await expect(page.locator(".app-menu-dropdown")).toContainText("设置");
    await expect(page.locator(".app-menu-dropdown")).toContainText("关闭窗口");

    await page.locator('.app-menu-button[data-menu-id="edit"]').click();
    await expect(page.locator(".app-menu-dropdown")).toContainText("撤销(U)");
    await expect(page.locator(".app-menu-dropdown")).toContainText("重做(R)");
    await expect(page.locator(".app-menu-dropdown")).toContainText("剪切(T)");
    await expect(page.locator(".app-menu-dropdown")).toContainText("复制(C)");
    await expect(page.locator(".app-menu-dropdown")).toContainText("粘贴(P)");
    await expect(page.locator(".app-menu-dropdown")).toContainText("全选(A)");

    await page.locator('.app-menu-button[data-menu-id="help"]').click();
    await expect(page.locator(".app-menu-dropdown")).toContainText("打开日志目录");
    await expect(page.locator(".app-menu-dropdown")).toContainText("关于 CosS");

    const info = await page.evaluate(() => window.cossAPI.getAppInfo());
    expect(info.version).toBe("0.5.7");
    expect(info.logDirectory).toBe(path.join(userDataDir, "logs"));
  } finally {
    await app.close();
  }
});

test("dismisses title and desktop menus when clicking blank workspace", async () => {
  const { app, page } = await launchApp();

  try {
    await expect(page.locator(".boot-screen")).toHaveCount(0);
    const clickBlankDesktop = async (button = "left") => {
      const desktopBox = await page.locator(".desktop").boundingBox();
      expect(desktopBox).toBeTruthy();
      await page.mouse.click(desktopBox.x + 18, desktopBox.y + 18, { button });
    };

    await page.locator('.app-menu-button[data-menu-id="edit"]').click();
    await expect(page.locator(".app-menu-dropdown")).toBeVisible();
    await clickBlankDesktop();
    await expect(page.locator(".app-menu-dropdown")).toHaveCount(0);

    await clickBlankDesktop("right");
    await expect(page.locator(".context-menu")).toBeVisible();
    await page.locator('.context-menu [data-action="role-menu"][data-type="terminal"]').click();
    await expect(page.locator(".role-menu")).toBeVisible();

    await clickBlankDesktop();
    await expect(page.locator(".context-menu")).toHaveCount(0);
    await expect(page.locator(".role-menu")).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("creates a project with the folder picker and writes file logs", async () => {
  const selectedPath = path.join(os.tmpdir(), "coss-selected-project");
  const { app, page, userDataDir } = await launchApp(
    {},
    {
      COSS_MOCK_PROJECT_DIRECTORY: selectedPath
    }
  );

  try {
    await page.locator('[data-action="show-create-project"]').first().click();
    await expect(page.locator(".modal")).toBeVisible();
    await page.locator("#projectName").fill("Folder Picker Project");

    await page.locator('[data-action="choose-project-directory"]').click();
    await expect(page.locator("#projectPath")).toHaveValue(selectedPath);
    await expect(page.locator("#projectPathStatus")).toContainText("已选择项目保存路径");

    await page.locator('[data-action="create-project"]').click();
    await expect(page.locator(".workspace-title")).toHaveText("Folder Picker Project");
    await expect(page.locator(".workspace-subtitle")).toContainText(selectedPath);

    const logText = await waitForLogEvent(userDataDir, "project.created");
    expect(logText).toContain("Folder Picker Project");
    expect(logText).toContain(selectedPath.replaceAll("\\", "\\\\"));
  } finally {
    await app.close();
  }
});

test("opens the task modal from the workspace action", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();

    await expect(page.locator(".modal")).toBeVisible();
    await expect(page.locator("#taskGoal")).toBeVisible();
  } finally {
    await app.close();
  }
});

test("configures v0.3 model providers and requires API keys for optional models", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator('.sidebar-footer [data-action="show-settings"]').click();

    await expect(page.locator(".settings-panel h2")).toHaveText("系统设置");
    await expect(page.locator(".settings-row", { hasText: "应用版本" })).toBeVisible();
    await expect(page.locator(".settings-row", { hasText: "当前模型摘要" })).toBeVisible();
    await expect(page.locator('[data-action="check-codex"]')).toHaveCount(0);

    await page.locator('.settings-nav [data-action="set-settings-section"][data-section="model"]').click();
    await expect(page.locator(".settings-section-title", { hasText: "v0.3 模型配置" })).toBeVisible();
    await expect(page.locator('.model-provider-option.active[data-provider="system"]')).toContainText("系统默认");
    await expect(page.locator("#modelBaseUrl")).toHaveValue("http://10.21.1.61:26962/v1");
    await expect(page.locator("#modelName")).toHaveValue("agent-brain");

    await page.locator('[data-action="edit-model-provider"][data-provider="deepseek"]').click();
    await expect(page.locator("#modelBaseUrl")).toHaveValue("https://api.deepseek.com/v1");
    await page.locator('[data-action="set-model-provider"][data-provider="deepseek"]').click();
    await expect(page.locator('.model-provider-option.active[data-provider="system"]')).toContainText("系统默认");

    await page.locator("#modelApiKey").fill("sk-test-deepseek");
    await page.locator('[data-action="set-model-provider"][data-provider="deepseek"]').click();
    await expect(page.locator('.model-provider-option.active[data-provider="deepseek"]')).toContainText("DeepSeek API");

    await page.locator(".settings-close").click();
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await expect(page.locator(".modal")).toContainText("DeepSeek API / deepseek-chat");
  } finally {
    await app.close();
  }
});

test("tests v0.3 model connectivity from the model settings page", async () => {
  const { app, page } = await launchApp(
    {},
    {
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_MOCK_CONNECTIVITY: "1"
    }
  );

  try {
    await page.locator('.sidebar-footer [data-action="show-settings"]').click();
    await page.locator('.settings-nav [data-action="set-settings-section"][data-section="model"]').click();
    await expect(page.locator('[data-model-connectivity-status="system"]')).toContainText("尚未测试连通性");

    await page.locator('[data-action="test-model-connectivity"][data-provider="system"]').click();
    await expect(page.locator('[data-model-connectivity-status="system"]')).toContainText("连通性正常");
    await expect(page.locator('[data-model-connectivity-status="system"]')).toContainText("agent-brain");

    await page.locator('[data-action="edit-model-provider"][data-provider="deepseek"]').click();
    await page.locator('[data-action="test-model-connectivity"][data-provider="deepseek"]').click();
    await expect(page.locator('[data-model-connectivity-status="deepseek"]')).toContainText("请先填写 API key");
  } finally {
    await app.close();
  }
});

test("does not auto-run Agent environment checks when opening settings", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator('.sidebar-footer [data-action="show-settings"]').click();
    await expect(page.locator(".settings-shell")).toBeVisible();
    await expect(page.locator(".settings-panel h2")).toHaveText("系统设置");
    await expect(page.locator("[data-claude-status]")).toHaveCount(0);
    await expect(page.locator("[data-codex-status]")).toHaveCount(0);

    await page.locator('.settings-nav [data-action="set-settings-section"][data-section="agent"]').click();
    await expect(page.locator(".settings-panel h2")).toHaveText("智能体设置");
    await expect(page.locator("[data-claude-status]")).toContainText("尚未检测 Claude Code 环境");
    await expect(page.locator("[data-codex-status]")).toContainText("尚未检测 Codex CLI 环境");

    await page.waitForTimeout(300);
    await expect(page.locator("[data-claude-status]")).toContainText("尚未检测 Claude Code 环境");
    await expect(page.locator("[data-codex-status]")).toContainText("尚未检测 Codex CLI 环境");

    await page.locator('[data-action="check-codex"]').click();
    await expect(page.locator("[data-codex-status]")).toContainText(/Codex CLI|codex|npm/);
    await expect(page.locator("[data-claude-status]")).toContainText("尚未检测 Claude Code 环境");

    await page.locator('[data-action="check-claude"]').click();
    await expect(page.locator("[data-claude-status]")).toContainText(/Claude Code|claude/);
  } finally {
    await app.close();
  }
});

test("previews and confirms task subtasks from the v0.3.3 LLM Gateway", async () => {
  const mockPlan = {
    summary: "模型已生成登录任务拆解。",
    subtasks: [
      {
        roleId: "frontend-engineer",
        title: "模型返回的前端任务",
        description: "根据模型规划实现登录页面和表单状态。"
      },
      {
        roleId: "backend-engineer",
        title: "模型返回的后端任务",
        description: "根据模型规划确认登录接口和错误码。"
      },
      {
        roleId: "qa-engineer",
        title: "模型返回的测试任务",
        description: "根据模型规划覆盖登录成功、失败和空表单流程。"
      }
    ],
    messages: [
      {
        fromRoleId: "product-manager",
        toRoleIds: ["frontend-engineer", "backend-engineer"],
        content: "模型要求先确认登录验收标准。"
      }
    ]
  };
  const { app, page } = await launchApp(
    {},
    {
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_MOCK_RESPONSE: JSON.stringify(mockPlan)
    }
  );

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("模型拆解登录任务");
    await page.locator('[data-action="create-task"]').click();

    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await expect(page.locator(".task-plan-modal")).toContainText("确认任务计划");
    await expect(page.locator(".task-plan-modal")).toContainText("模型返回的前端任务");
    await expect(page.locator(".task-card")).toHaveCount(0);

    await page.locator('[data-action="confirm-task-plan"]').click();
    await expect(page.locator(".modal")).toHaveCount(0);
    await expect(page.locator(".task-card").first()).toContainText("模型返回");
    await expect(page.locator(".task-card").first()).toContainText("规划来源：LLM Gateway");
    await expect(page.locator(".subtask-status").first()).toContainText("待执行");

    await page.locator('.task-card [data-action="set-subtask-status"][data-status="running"]').first().evaluate((button) => button.click());
    await expect(page.locator(".subtask-status").first()).toContainText("执行中");
    await page.locator('.task-card [data-action="set-subtask-status"][data-status="done"]').first().evaluate((button) => button.click());
    await expect(page.locator(".subtask-status").first()).toContainText("已完成");
  } finally {
    await app.close();
  }
});

test("parses task planner JSON with trailing model text and logs success", async () => {
  const mockPlan = {
    summary: "Planner JSON was recovered from a mixed response.",
    subtasks: [
      {
        roleId: "frontend-engineer",
        title: "Recovered frontend task",
        description: "Build the visible task flow from recovered JSON."
      },
      {
        roleId: "backend-engineer",
        title: "Recovered backend task",
        description: "Prepare the API contract from recovered JSON."
      },
      {
        roleId: "qa-engineer",
        title: "Recovered QA task",
        description: "Verify the recovered login workflow."
      }
    ],
    messages: [
      {
        fromRoleId: "product-manager",
        toRoleIds: ["frontend-engineer", "backend-engineer"],
        content: "Use the recovered planner response."
      }
    ]
  };
  const mixedContent = `\`\`\`json\n${JSON.stringify(mockPlan)}\n\`\`\`\nThe plan above is ready.`;
  const { app, page, userDataDir } = await launchApp(
    {},
    {
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_MOCK_CONTENT: mixedContent
    }
  );

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("Recover mixed LLM JSON");
    await page.locator('[data-action="create-task"]').click();

    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await expect(page.locator(".task-plan-modal")).toContainText("Recovered frontend task");
    await expect(page.locator(".task-plan-modal")).not.toContainText("The plan above is ready");

    const logText = await waitForLogEvent(userDataDir, "llm.plan.succeeded");
    expect(logText).toContain('"source":"mock-content"');
    expect(logText).toContain('"event":"task.plan.generated"');
  } finally {
    await app.close();
  }
});

test("logs task planner parse failures before using the local fallback", async () => {
  const { app, page, userDataDir } = await launchApp(
    {},
    {
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_MOCK_CONTENT: "not json"
    }
  );

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("Trigger invalid planner JSON");
    await page.locator('[data-action="create-task"]').click();

    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await expect(page.locator(".task-plan-modal")).toContainText("not json");

    const mainLogText = await waitForLogEvent(userDataDir, "llm.plan.failed");
    expect(mainLogText).toContain("not json");
    const rendererLogText = await waitForLogEvent(userDataDir, "task.plan.failed");
    expect(rendererLogText).toContain("Trigger invalid planner JSON");
  } finally {
    await app.close();
  }
});

test("rejects planner placeholder schema copies before showing the preview", async () => {
  const placeholderPlan = {
    summary: "一句话总结",
    subtasks: [
      {
        roleId: "角色ID",
        title: "子任务标题",
        description: "子任务描述"
      }
    ],
    messages: [
      {
        fromRoleId: "角色ID",
        toRoleIds: ["角色ID"],
        content: "协作消息"
      }
    ]
  };
  const { app, page, userDataDir } = await launchApp(
    {},
    {
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_MOCK_RESPONSE: JSON.stringify(placeholderPlan)
    }
  );

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("实现用户登录页面，并接入后端登录接口。");
    await page.locator('[data-action="create-task"]').click();

    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await expect(page.locator(".task-plan-modal")).not.toContainText("子任务标题");
    await expect(page.locator(".task-plan-modal")).toContainText("确认需求和验收标准");
    await expect(page.locator(".task-plan-modal .task-plan-item")).toHaveCount(5);

    const logText = await waitForLogEvent(userDataDir, "llm.plan.failed");
    expect(logText).toContain("subtasks");
    expect(logText).toContain("少于 3 个");
  } finally {
    await app.close();
  }
});

test("reports task planner request timeouts with timeout details in the log", async () => {
  const slowServer = http.createServer((_request, response) => {
    setTimeout(() => {
      if (!response.destroyed) {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ summary: "late", subtasks: [], messages: [] }) } }]
        }));
      }
    }, 5000);
  });
  await new Promise((resolve) => slowServer.listen(0, "127.0.0.1", resolve));
  const { port } = slowServer.address();
  const { app, page, userDataDir } = await launchApp(
    {},
    {
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_TIMEOUT_MS: "1000"
    },
    {
      settings: {
        agentProvider: "claude",
        agentFallbackToShell: true,
        modelProvider: "deepseek",
        modelConfigs: {
          deepseek: {
            baseUrl: `http://127.0.0.1:${port}/v1`,
            modelName: "slow-model",
            apiKey: "test-key"
          }
        }
      }
    }
  );

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("Trigger planner timeout");
    await page.locator('[data-action="create-task"]').click();

    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await expect(page.locator(".task-plan-modal")).toContainText("COSS_LLM_TIMEOUT_MS");

    const logText = await waitForLogEvent(userDataDir, "llm.plan.failed");
    expect(logText).toContain('"timeoutMs":1000');
    expect(logText).toContain("COSS_LLM_TIMEOUT_MS");
  } finally {
    await app.close();
    await new Promise((resolve) => slowServer.close(resolve));
  }
});

test("sends a v0.4 role message from the message center", async () => {
  const { app, page, userDataDir } = await launchApp();

  try {
    await page.locator('.workspace-actions [data-action="show-message-center"]').click();
    await expect(page.locator(".message-center-modal")).toBeVisible();
    await expect(page.locator(".message-center-modal")).toContainText("v0.5.7 协作时间线");

    await page.locator("#messageFromRole").selectOption("product-manager");
    await page.locator("#messageToRole").selectOption("frontend-engineer");
    await page.locator("#messageContent").fill("请先确认登录页字段和前端验收标准。");
    await page.locator('[data-action="send-role-message"]').click();

    await expect(page.locator(".message-row").first()).toContainText("产品经理");
    await expect(page.locator(".message-row").first()).toContainText("前端工程师");
    await expect(page.locator(".message-row").first()).toContainText("请先确认登录页字段和前端验收标准。");

    const logText = await waitForLogEvent(userDataDir, "role.message.sent");
    expect(logText).toContain("frontend-engineer");
  } finally {
    await app.close();
  }
});

test("renders message center as a wide horizontal branching timeline", async () => {
  const firstAt = "2026-01-01T00:09:00.000Z";
  const secondAt = "2026-01-01T00:10:00.000Z";
  const extraMessages = Array.from({ length: 8 }, (_, index) => ({
    id: `message-extra-${index}-e2e`,
    type: "role-message",
    channelType: "task",
    channelId: "task:task-timeline-e2e",
    fromRoleId: index % 2 === 0 ? "product-manager" : "tech-lead",
    toRoleIds: [index % 2 === 0 ? "tech-lead" : "product-manager"],
    content: `EXTRA_MESSAGE_${index}`,
    taskId: "task-timeline-e2e",
    source: "manual",
    status: "sent",
    readBy: ["product-manager"],
    createdAt: `2026-01-01T00:0${index}:00.000Z`
  }));
  const { app, page } = await launchApp({
    desktops: [{ id: "desktop-main", name: "Main Desktop", taskId: "task-timeline-e2e", createdAt: firstAt }],
    activeDesktopId: "desktop-main",
    tasks: [
      {
        id: "task-timeline-e2e",
        title: "Timeline readability task",
        goal: "Verify timeline readability",
        status: "running",
        desktopId: "desktop-main",
        createdAt: firstAt,
        updatedAt: secondAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: { status: "success", source: "test", summary: "Timeline", plannedAt: firstAt, confirmedAt: firstAt },
        subtasks: []
      }
    ],
    messages: [
      ...extraMessages,
      {
        id: "message-branch-e2e",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-timeline-e2e",
        fromRoleId: "product-manager",
        toRoleIds: ["frontend-engineer", "backend-engineer"],
        content: "BRANCH_MESSAGE_CONTENT",
        taskId: "task-timeline-e2e",
        source: "manual",
        status: "sent",
        readBy: ["product-manager"],
        createdAt: firstAt
      },
      {
        id: "message-followup-e2e",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-timeline-e2e",
        fromRoleId: "backend-engineer",
        toRoleIds: ["product-manager"],
        content: "FOLLOWUP_MESSAGE_CONTENT",
        taskId: "task-timeline-e2e",
        source: "manual",
        status: "sent",
        readBy: ["backend-engineer"],
        createdAt: secondAt
      }
    ]
  });

  try {
    await page.locator('.workspace-actions [data-action="show-message-center"]').click();
    await expect(page.locator(".message-center-modal")).toBeVisible();
    const modalBox = await page.locator(".message-center-modal").boundingBox();
    expect(modalBox.width).toBeGreaterThan(900);

    await expect(page.locator(".message-timeline-scroll")).toBeVisible();
    await expect(page.locator(".message-timeline-node")).toHaveCount(10);
    await expect(page.locator(".message-timeline-node.branching")).toBeVisible();
    await expect(page.locator(".message-timeline-node.branching .message-branch-targets span")).toHaveCount(2);
    const dotCentersY = await page.locator(".message-timeline-node .message-node-dot").evaluateAll((dots) =>
      dots.map((dot) => {
        const box = dot.getBoundingClientRect();
        return Math.round((box.top + box.height / 2) * 10) / 10;
      })
    );
    expect(Math.max(...dotCentersY) - Math.min(...dotCentersY)).toBeLessThanOrEqual(1);

    await expect(page.locator(".message-timeline-detail")).toContainText("FOLLOWUP_MESSAGE_CONTENT");
    const scroller = page.locator(".message-timeline-scroll");
    await scroller.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    const scrollBeforeClick = await scroller.evaluate((node) => node.scrollLeft);
    expect(scrollBeforeClick).toBeGreaterThan(0);
    await page.locator(".message-timeline-node.branching").click();
    const scrollAfterClick = await scroller.evaluate((node) => node.scrollLeft);
    expect(scrollAfterClick).toBeGreaterThan(0);
    await expect(page.locator(".message-timeline-detail")).toContainText("BRANCH_MESSAGE_CONTENT");
    await expect(page.locator(".message-timeline-node.branching")).toHaveAttribute("aria-pressed", "true");
  } finally {
    await app.close();
  }
});

test("stores confirmed task plan collaboration messages in the v0.4 message bus", async () => {
  const mockPlan = {
    summary: "登录任务需要产品、前端、后端和测试协同。",
    subtasks: [
      {
        roleId: "product-manager",
        title: "确认登录验收标准",
        description: "明确登录成功、失败、空表单和权限异常的验收标准。"
      },
      {
        roleId: "frontend-engineer",
        title: "实现登录页面",
        description: "实现登录表单、校验、错误提示和登录态处理。"
      },
      {
        roleId: "backend-engineer",
        title: "接入登录接口",
        description: "确认登录接口字段、错误码和会话返回结构。"
      }
    ],
    messages: [
      {
        fromRoleId: "product-manager",
        toRoleIds: ["frontend-engineer", "backend-engineer"],
        content: "请围绕登录验收标准同步页面字段和接口字段。"
      }
    ]
  };
  const { app, page, userDataDir } = await launchApp(
    {},
    {
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_MOCK_RESPONSE: JSON.stringify(mockPlan)
    }
  );

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("实现用户登录页面，并接入后端登录接口。");
    await page.locator('[data-action="create-task"]').click();
    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await page.locator('[data-action="confirm-task-plan"]').click();

    await page.locator('.workspace-actions [data-action="show-message-center"]').click();
    await expect(page.locator(".message-center-modal")).toBeVisible();
    await expect(page.locator(".message-row").first()).toContainText("请围绕登录验收标准同步页面字段和接口字段。");
    await expect(page.locator(".message-row").first()).toContainText("task-plan");

    const logText = await waitForLogEvent(userDataDir, "role.messages.created");
    expect(logText).toContain('"source":"task-plan"');
  } finally {
    await app.close();
  }
});

test("v0.5.4 sends subtask instructions into the collaboration timeline", async () => {
  const mockPlan = {
    summary: "登录任务需要产品、前端、后端和测试协同。",
    subtasks: [
      {
        roleId: "frontend-engineer",
        title: "实现登录页",
        description: "实现登录表单、字段校验和错误提示。"
      },
      {
        roleId: "backend-engineer",
        title: "接入登录接口",
        description: "确认接口字段、状态码和会话返回结构。"
      },
      {
        roleId: "qa-engineer",
        title: "验证登录流程",
        description: "覆盖成功、失败、空表单和网络异常。"
      }
    ],
    messages: [
      {
        fromRoleId: "product-manager",
        toRoleIds: ["frontend-engineer"],
        content: "请先围绕登录页字段同步验收标准。"
      }
    ]
  };
  const { app, page, userDataDir } = await launchApp(
    {},
    {
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_MOCK_RESPONSE: JSON.stringify(mockPlan)
    }
  );

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("实现用户登录页面，并接入后端登录接口。");
    await page.locator('[data-action="create-task"]').click();
    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await page.locator('[data-action="confirm-task-plan"]').click();

    await expect(page.locator(".task-card")).toHaveCount(3);
    await page.locator('[data-action="show-subtask-instruction"]').first().evaluate((node) => node.click());
    await expect(page.locator(".subtask-instruction-modal")).toBeVisible();
    await page.locator("#instructionContent").fill("请前端工程师实现登录页，并把接口阻塞点同步到任务频道。");
    await page.locator('[data-action="send-subtask-instruction"]').click();

    await expect(page.locator(".message-center-modal")).toBeVisible();
    await expect(page.locator(".message-row").first()).toContainText("请前端工程师实现登录页");
    await expect(page.locator(".message-row").first()).toContainText("task-instruction");

    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    const messages = savedState.projects[0].messages || [];
    expect(messages.some((message) => message.source === "task-instruction" && message.content.includes("接口阻塞点"))).toBe(true);

    const logText = await waitForLogEvent(userDataDir, "task.instruction.sent");
    expect(logText).toContain("task-instruction");
  } finally {
    await app.close();
  }
});

test("v0.5.4 queues timeline messages for a running Agent terminal", async () => {
  const createdAt = "2026-01-01T00:20:00.000Z";
  const timelineExtraMessages = Array.from({ length: 10 }, (_, index) => ({
    id: `message-inject-scroll-extra-${index}`,
    type: "role-message",
    channelType: "task",
    channelId: "task:task-inject-e2e",
    fromRoleId: index % 2 === 0 ? "product-manager" : "tech-lead",
    toRoleIds: [index % 2 === 0 ? "tech-lead" : "qa-engineer"],
    content: `SCROLL_EXTRA_MESSAGE_${index}`,
    taskId: "task-inject-e2e",
    source: "manual",
    status: "sent",
    readBy: ["product-manager"],
    createdAt: `2026-01-01T00:${String(index).padStart(2, "0")}:00.000Z`
  }));
  const { app, page, userDataDir } = await launchApp(
    {
      desktops: [
        {
          id: "desktop-main",
          name: "主桌面",
          createdAt
        }
      ],
      activeDesktopId: "desktop-main",
      windows: [
        {
          id: "agent-inject-terminal",
          type: "terminal",
          roleId: "frontend-engineer",
          title: "前端工程师 Agent(Codex)",
          x: 280,
          y: 110,
          width: 520,
          height: 340,
          z: 100,
          status: "idle",
          terminalMode: "agent",
          agentProvider: "codex",
          minimized: false,
          maximized: false,
          restoreBounds: null,
          desktopId: "desktop-main",
          agentSession: {
            sessionId: "agent-session-inject-e2e",
            provider: "codex",
            roleId: "frontend-engineer",
            roleName: "前端工程师",
            workspace: process.cwd(),
            projectId: "project-e2e",
            projectName: "E2E Project",
            taskId: "task-inject-e2e",
            subtaskId: "subtask-inject-e2e",
            sessionName: "CosS-E2E-frontend-codex",
            promptTemplateVersion: "v0.5",
            createdAt,
            lastStartedAt: "",
            resumeCount: 0,
            lastActiveMode: "",
            lastEventAt: ""
          }
        }
      ],
      tasks: [
        {
          id: "task-inject-e2e",
          title: "登录页任务",
          goal: "实现登录页",
          status: "running",
          desktopId: "desktop-main",
          createdAt,
          updatedAt: createdAt,
          model: { provider: "system", modelName: "agent-brain" },
          planner: { status: "success", source: "mock", summary: "注入测试", plannedAt: createdAt, confirmedAt: createdAt },
          subtasks: [
            {
              id: "subtask-inject-e2e",
              roleId: "frontend-engineer",
              title: "实现登录表单",
              description: "实现登录表单和错误提示。",
              status: "running",
              createdAt,
              updatedAt: createdAt
            }
          ]
        }
      ],
      messages: [
        ...timelineExtraMessages,
        {
          id: "message-inject-e2e",
          type: "role-message",
          channelType: "task",
          channelId: "task:task-inject-e2e",
          fromRoleId: "product-manager",
          toRoleIds: ["frontend-engineer"],
          content: "请直接开始实现登录表单，并同步接口阻塞点。",
          taskId: "task-inject-e2e",
          source: "manual",
          status: "sent",
          readBy: ["product-manager"],
          createdAt
        }
      ]
    },
    {},
    {
      settings: {
        agentProvider: "codex",
        agentFallbackToShell: true,
        modelProvider: "system"
      }
    }
  );

  try {
    await expect(page.locator('.program-window[data-window-id="agent-inject-terminal"]')).toBeVisible();
    await expect(page.locator('.terminal-mount[data-terminal-id="agent-inject-terminal"] .xterm')).toBeVisible();

    await page.locator('.workspace-actions [data-action="show-message-center"]').click();
    await expect(page.locator(".message-center-modal")).toBeVisible();
    await expect(page.locator('[data-action="inject-message-terminal"]')).toBeVisible();
    await page.locator('[data-action="inject-message-terminal"]').click();

    await expect(page.locator(".message-center-modal")).toBeVisible();
    await expect(page.locator('[data-action="confirm-agent-delivery"]')).toBeVisible();
    await page.locator('[data-action="confirm-agent-delivery"]').click();
    await expect(page.locator(".message-row").first()).toContainText("1/1");
    const scroller = page.locator(".message-timeline-scroll");
    await scroller.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    const scrollAfterUserMove = await scroller.evaluate((node) => node.scrollLeft);
    expect(scrollAfterUserMove).toBeGreaterThan(0);
    await expect(page.locator('[data-action="show-terminal-output-refs"]')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(400);
    const scrollAfterTerminalRefresh = await scroller.evaluate((node) => node.scrollLeft);
    expect(scrollAfterTerminalRefresh).toBeGreaterThan(0);

    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    const project = savedState.projects[0];
    const message = project.messages.find((item) => item.id === "message-inject-e2e");
    expect(message.injectedWindowIds).toContain("agent-inject-terminal");
    expect(message.injectedAt).toBeTruthy();
    expect(project.agentDeliveries.some((item) => (
      item.messageId === "message-inject-e2e"
      && ["submitted", "responded", "waiting"].includes(item.status)
    ))).toBe(true);
    expect(project.terminalOutputRefs.some((item) => item.messageId === "message-inject-e2e" && item.windowId === "agent-inject-terminal")).toBe(true);

    const logText = await waitForLogEvent(userDataDir, "agent.delivery.confirmed");
    expect(logText).toContain("message-inject-e2e");
    expect(logText).toContain("agent-inject-terminal");
  } finally {
    await page.evaluate(() => window.cossAPI.disposeTerminal("agent-inject-terminal")).catch(() => {});
    await app.close();
  }
});

test("v0.5.5 delivers CodeBuddy messages through an instruction file without paste placeholders", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-codebuddy-delivery-"));
  const createdAt = "2026-01-01T00:25:00.000Z";
  const { app, page, userDataDir } = await launchApp(
    {
      path: projectDir,
      desktops: [{ id: "desktop-main", name: "主对话", createdAt }],
      activeDesktopId: "desktop-main",
      windows: [
        {
          id: "codebuddy-inject-terminal",
          type: "terminal",
          roleId: "frontend-engineer",
          title: "前端工程师 Agent(CodeBuddy Code)",
          x: 280,
          y: 110,
          width: 520,
          height: 340,
          z: 100,
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
          id: "task-codebuddy-inject-e2e",
          title: "CodeBuddy 投递任务",
          goal: "验证 CodeBuddy 投递",
          status: "running",
          desktopId: "desktop-main",
          createdAt,
          updatedAt: createdAt,
          model: { provider: "system", modelName: "agent-brain" },
          planner: { status: "success", source: "mock", summary: "CodeBuddy 注入测试", plannedAt: createdAt, confirmedAt: createdAt },
          subtasks: [
            {
              id: "subtask-codebuddy-inject-e2e",
              roleId: "frontend-engineer",
              title: "读取投递文件",
              description: "不要把 TUI 粘贴提示当成任务。",
              status: "running",
              createdAt,
              updatedAt: createdAt
            }
          ]
        }
      ],
      messages: [
        {
          id: "message-codebuddy-inject-e2e",
          type: "role-message",
          channelType: "task",
          channelId: "task:task-codebuddy-inject-e2e",
          fromRoleId: "product-manager",
          toRoleIds: ["frontend-engineer"],
          content: "CODEBUDDY_FILE_DELIVERY_MARKER：请读取文件后继续实现页面。",
          taskId: "task-codebuddy-inject-e2e",
          source: "manual",
          status: "sent",
          readBy: ["product-manager"],
          createdAt
        }
      ]
    },
    {},
    {
      settings: {
        agentProvider: "codebuddy",
        codeBuddyApiKey: "sk-codebuddy-e2e",
        agentFallbackToShell: false,
        modelProvider: "system"
      }
    }
  );

  try {
    await expect(page.locator('.program-window[data-window-id="codebuddy-inject-terminal"]')).toBeVisible();
    await expect(page.locator('.terminal-mount[data-terminal-id="codebuddy-inject-terminal"] .xterm')).toBeVisible();

    await page.locator('.workspace-actions [data-action="show-message-center"]').click();
    await expect(page.locator(".message-center-modal")).toBeVisible();
    await page.locator('[data-action="inject-message-terminal"]').click();
    await expect(page.locator('[data-action="confirm-agent-delivery"]')).toBeVisible();
    await page.locator('[data-action="confirm-agent-delivery"]').click();

    const terminal = page.locator('[data-terminal-id="codebuddy-inject-terminal"]');
    await expect(terminal).toContainText("请读取并执行 CosS 投递文件", { timeout: 5000 });
    await expect(terminal).not.toContainText("[Pasted text");

    const savedState = await waitForSavedState(userDataDir, (state) => (
      state.projects[0].agentDeliveries.some((item) => (
        item.messageId === "message-codebuddy-inject-e2e"
        && item.status === "submitted"
      ))
    ), 5000);
    const delivery = savedState.projects[0].agentDeliveries.find((item) => item.messageId === "message-codebuddy-inject-e2e");
    expect(delivery.status).toBe("submitted");
    expect(delivery.submissionProvider).toBe("codebuddy");
    expect(delivery.submissionMethod).toBe("delivery-file-interactive");
    expect(delivery.submissionDetail).toContain("Delivery file");
    const normalizedDeliveryPath = delivery.deliveryFilePath.replaceAll("\\", "/");
    expect(normalizedDeliveryPath).toMatch(/^\.coss\/deliveries\/delivery-/);
    const deliveryFile = path.join(projectDir, ...normalizedDeliveryPath.split("/"));
    expect(fs.existsSync(deliveryFile)).toBe(true);
    const deliveryText = fs.readFileSync(deliveryFile, "utf8");
    await expect(page.locator(".message-center-modal")).toContainText("CodeBuddy Code");
    await expect(page.locator(".message-center-modal")).toContainText("Delivery file plus interactive CodeBuddy submit");
    await expect(page.locator(".message-center-modal")).toContainText(path.basename(delivery.deliveryFilePath));

    const stuckMarked = await page.evaluate((deliveryId) => window.markDeliveryIfStuck(deliveryId), delivery.id);
    expect(stuckMarked).toBe(true);
    await expect(page.locator('[data-action="retry-agent-delivery"]')).toBeVisible();

    await page.locator('[data-action="retry-agent-delivery"]').click();
    const retriedState = await waitForSavedState(userDataDir, (state) => (
      state.projects[0].agentDeliveries.some((item) => (
        item.id === delivery.id
        && item.status === "pending"
        && !item.stuckDetectedAt
      ))
    ), 5000);
    const retriedDelivery = retriedState.projects[0].agentDeliveries.find((item) => item.id === delivery.id);
    expect(retriedDelivery.status).toBe("pending");
    expect(deliveryText).toContain("CODEBUDDY_FILE_DELIVERY_MARKER");
    expect(deliveryText).toContain("唯一新增任务上下文");
  } finally {
    await page.evaluate(() => window.cossAPI.disposeTerminal("codebuddy-inject-terminal")).catch(() => {});
    await app.close();
  }
});

test("v0.5.5 keeps Agent terminal stable when clicking or right-clicking blank desktop space", async () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const { app, page } = await launchApp({
    desktops: [{ id: "desktop-main", name: "主对话", createdAt }],
    activeDesktopId: "desktop-main",
    windows: [
      {
        id: "agent-stable-terminal",
        type: "terminal",
        roleId: "frontend-engineer",
        title: "前端工程师 Agent(Codex)",
        x: 260,
        y: 110,
        width: 520,
        height: 340,
        z: 100,
        status: "idle",
        terminalMode: "agent",
        agentProvider: "codex",
        minimized: false,
        maximized: false,
        restoreBounds: null,
        desktopId: "desktop-main"
      }
    ]
  });

  try {
    await expect(page.locator('.terminal-mount[data-terminal-id="agent-stable-terminal"] .xterm')).toBeVisible();
    await page.evaluate(() => {
      const originalCreateTerminal = window.cossAPI.createTerminal;
      window.__terminalCreateCallsAfterBlankClick = 0;
      window.cossAPI.createTerminal = (options) => {
        window.__terminalCreateCallsAfterBlankClick += 1;
        return originalCreateTerminal(options);
      };
    });

    await page.locator(".desktop").click({ position: { x: 24, y: 24 } });
    await page.waitForTimeout(350);

    let createCalls = await page.evaluate(() => window.__terminalCreateCallsAfterBlankClick);
    expect(createCalls).toBe(0);
    await expect(page.locator('.terminal-mount[data-terminal-id="agent-stable-terminal"] .xterm')).toBeVisible();

    await page.locator(".desktop").click({ button: "right", position: { x: 56, y: 56 } });
    await expect(page.locator(".context-menu")).toBeVisible();
    await page.waitForTimeout(350);
    createCalls = await page.evaluate(() => window.__terminalCreateCallsAfterBlankClick);
    expect(createCalls).toBe(0);

    await page.locator(".desktop").click({ position: { x: 24, y: 420 } });
    await expect(page.locator(".context-menu")).toHaveCount(0);
    await page.waitForTimeout(350);
    createCalls = await page.evaluate(() => window.__terminalCreateCallsAfterBlankClick);
    expect(createCalls).toBe(0);
    await expect(page.locator('.terminal-mount[data-terminal-id="agent-stable-terminal"] .xterm')).toBeVisible();
  } finally {
    await page.evaluate(() => window.cossAPI.disposeTerminal("agent-stable-terminal")).catch(() => {});
    await app.close();
  }
});

test("v0.5.5 replays terminal trace after switching conversations", async () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const { app, page } = await launchApp({
    desktops: [
      { id: "desktop-main", name: "主对话", createdAt },
      { id: "desktop-second", name: "对话 2", createdAt }
    ],
    activeDesktopId: "desktop-main",
    windows: [
      {
        id: "agent-trace-terminal",
        type: "terminal",
        roleId: "frontend-engineer",
        title: "前端工程师 Agent(Codex)",
        x: 260,
        y: 110,
        width: 520,
        height: 340,
        z: 100,
        status: "idle",
        terminalMode: "agent",
        agentProvider: "codex",
        minimized: false,
        maximized: false,
        restoreBounds: null,
        desktopId: "desktop-main"
      }
    ]
  });

  try {
    await expect(page.locator('.terminal-mount[data-terminal-id="agent-trace-terminal"] .xterm')).toBeVisible();
    await page.evaluate(() => window.cossAPI.sendTerminalInput("agent-trace-terminal", "TRACE_MARKER_055\r"));
    await expect(page.locator('.terminal-mount[data-terminal-id="agent-trace-terminal"]')).toContainText("TRACE_MARKER_055");

    await page.locator(".dock .task-view-toggle").click();
    await page.locator('.desktop-card[data-desktop-id="desktop-second"]').click();
    await expect(page.locator('.terminal-mount[data-terminal-id="agent-trace-terminal"]')).toHaveCount(0);

    await page.locator(".dock .task-view-toggle").click();
    await page.locator('.desktop-card[data-desktop-id="desktop-main"]').click();
    await expect(page.locator('.terminal-mount[data-terminal-id="agent-trace-terminal"] .xterm')).toBeVisible();
    await expect(page.locator('.terminal-mount[data-terminal-id="agent-trace-terminal"]')).toContainText("TRACE_MARKER_055");
  } finally {
    await page.evaluate(() => window.cossAPI.disposeTerminal("agent-trace-terminal")).catch(() => {});
    await app.close();
  }
});

test("v0.5.5 appends multiple tasks to the active conversation and reuses role programs", async () => {
  const mockPlan = {
    summary: "Conversation task reuse plan.",
    subtasks: [
      {
        roleId: "frontend-engineer",
        title: "Build reusable frontend",
        description: "Use the existing conversation frontend program."
      },
      {
        roleId: "backend-engineer",
        title: "Build reusable backend",
        description: "Use the existing conversation backend program."
      }
    ],
    messages: [
      {
        fromRoleId: "product-manager",
        toRoleIds: ["frontend-engineer", "backend-engineer"],
        content: "Continue in the same conversation desktop."
      }
    ]
  };
  const { app, page } = await launchApp(
    {},
    {
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_MOCK_RESPONSE: JSON.stringify(mockPlan)
    }
  );

  try {
    for (const goal of ["Build first conversation task", "Build second conversation task"]) {
      await page.locator('.workspace-actions [data-action="show-create-task"]').click();
      await page.locator("#taskGoal").fill(goal);
      await page.locator('[data-action="create-task"]').click();
      await expect(page.locator(".task-plan-modal")).toBeVisible();
      await page.locator('[data-action="confirm-task-plan"]').click();
      await expect(page.locator(".task-plan-modal")).toHaveCount(0);
    }

    await page.locator('.workspace-actions [data-action="open-task-list-window"]').click();
    await expect(page.locator(".program-window.task-list")).toBeVisible();
    await expect(page.locator(".task-list-program")).toContainText("Build first conversation task");
    await expect(page.locator(".task-list-program")).toContainText("Build second conversation task");
    await page.locator('.workspace-actions [data-action="open-task-list-window"]').click();
    await expect(page.locator(".program-window.task-list")).toHaveCount(1);

    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    const project = savedState.projects[0];
    const conversationId = project.activeDesktopId;
    expect(project.desktops).toHaveLength(1);
    expect(project.tasks).toHaveLength(2);
    expect(project.tasks.every((task) => task.desktopId === conversationId && task.conversationId === conversationId)).toBe(true);
    expect(project.desktops[0].taskIds).toEqual(expect.arrayContaining(project.tasks.map((task) => task.id)));
    expect(project.windows.filter((win) => win.desktopId === conversationId && win.roleId === "frontend-engineer")).toHaveLength(1);
    expect(project.windows.filter((win) => win.desktopId === conversationId && win.roleId === "backend-engineer")).toHaveLength(1);
    expect(project.windows.filter((win) => win.desktopId === conversationId && win.type === "task-list")).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test("v0.5.7 filters archives and restores conversation tasks from the task list", async () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const updatedAt = "2026-01-01T00:10:00.000Z";
  const { app, page, userDataDir } = await launchApp({
    desktops: [
      {
        id: "desktop-main",
        name: "Conversation Task List",
        taskId: "task-frontend-list-e2e",
        taskIds: ["task-frontend-list-e2e", "task-backend-list-e2e", "task-archived-list-e2e"],
        lastTaskId: "task-backend-list-e2e",
        createdAt
      }
    ],
    activeDesktopId: "desktop-main",
    tasks: [
      {
        id: "task-frontend-list-e2e",
        title: "Frontend polished landing",
        goal: "Create a refined homepage UI",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: { status: "success", source: "test", summary: "Frontend list summary", plannedAt: createdAt, confirmedAt: createdAt },
        subtasks: [
          {
            id: "subtask-frontend-list-e2e",
            roleId: "frontend-engineer",
            title: "Build homepage visuals",
            description: "Make the research lab homepage polished.",
            status: "done",
            createdAt,
            updatedAt
          }
        ]
      },
      {
        id: "task-backend-list-e2e",
        title: "Backend content API",
        goal: "Expose lab content data",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        createdAt,
        updatedAt,
        model: { provider: "deepseek", modelName: "deepseek-chat" },
        planner: { status: "success", source: "test", summary: "Backend list summary", plannedAt: createdAt, confirmedAt: createdAt },
        subtasks: [
          {
            id: "subtask-backend-list-e2e",
            roleId: "backend-engineer",
            title: "Create content API",
            description: "Return refractory material sections.",
            status: "running",
            createdAt,
            updatedAt
          }
        ]
      },
      {
        id: "task-archived-list-e2e",
        title: "Archived deployment review",
        goal: "Review deployment notes",
        desktopId: "desktop-main",
        conversationId: "desktop-main",
        archived: true,
        archivedAt: updatedAt,
        createdAt,
        updatedAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: { status: "success", source: "test", summary: "Archived list summary", plannedAt: createdAt, confirmedAt: createdAt },
        subtasks: [
          {
            id: "subtask-devops-list-e2e",
            roleId: "devops-engineer",
            title: "Review deploy runbook",
            description: "Keep archived task visible only when requested.",
            status: "blocked",
            createdAt,
            updatedAt
          }
        ]
      }
    ],
    messages: [
      {
        id: "message-backend-list-e2e",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-backend-list-e2e",
        fromRoleId: "product-manager",
        toRoleIds: ["backend-engineer"],
        content: "API coordination message",
        taskId: "task-backend-list-e2e",
        source: "manual",
        status: "sent",
        readBy: ["product-manager"],
        createdAt
      }
    ],
    agentDeliveries: [
      {
        id: "delivery-backend-list-e2e",
        messageId: "message-backend-list-e2e",
        windowId: "terminal-backend-list-e2e",
        roleId: "backend-engineer",
        taskId: "task-backend-list-e2e",
        status: "submitted",
        attempts: 1,
        submissionMethod: "file",
        createdAt,
        updatedAt,
        submittedAt: updatedAt
      }
    ],
    terminalOutputRefs: [
      {
        id: "output-backend-list-e2e",
        windowId: "terminal-backend-list-e2e",
        roleId: "backend-engineer",
        taskId: "task-backend-list-e2e",
        messageId: "message-backend-list-e2e",
        label: "Codex terminal log",
        createdAt
      }
    ]
  });

  try {
    await page.locator('.workspace-actions [data-action="open-task-list-window"]').click();
    const taskList = page.locator(".program-window.task-list");
    await expect(taskList).toBeVisible();
    await expect(taskList.locator(".task-list-items")).toContainText("Frontend polished landing");
    await expect(taskList.locator(".task-list-items")).toContainText("Backend content API");
    await expect(taskList.locator(".task-list-items")).not.toContainText("Archived deployment review");

    await page.locator("#taskListSearch").fill("content API");
    await expect(taskList.locator(".task-list-items")).toContainText("Backend content API");
    await expect(taskList.locator(".task-list-items")).not.toContainText("Frontend polished landing");
    await page.locator("#taskListSearch").fill("");

    await page.locator("#taskListRoleFilter").selectOption("frontend-engineer");
    await expect(taskList.locator(".task-list-items")).toContainText("Frontend polished landing");
    await expect(taskList.locator(".task-list-items")).not.toContainText("Backend content API");
    await page.locator("#taskListRoleFilter").selectOption("");

    await page.locator("#taskListStatusFilter").selectOption("done");
    await expect(taskList.locator(".task-list-items")).toContainText("Frontend polished landing");
    await expect(taskList.locator(".task-list-items")).not.toContainText("Backend content API");
    await page.locator("#taskListStatusFilter").selectOption("");

    await page.locator("#taskListModelFilter").selectOption("deepseek-chat");
    await expect(taskList.locator(".task-list-items")).toContainText("Backend content API");
    await expect(taskList.locator(".task-list-items")).not.toContainText("Frontend polished landing");
    await page.locator("#taskListModelFilter").selectOption("");

    await taskList.locator('.task-list-item[data-task-id="task-backend-list-e2e"]').click();
    await expect(taskList.locator(".task-list-detail")).toContainText("API coordination message");
    await expect(taskList.locator(".task-list-detail")).toContainText("file");
    await expect(taskList.locator(".task-list-detail")).toContainText("deepseek-chat");

    await taskList.locator('[data-action="archive-task"][data-task-id="task-backend-list-e2e"]').click();
    await expect(taskList.locator(".task-list-items")).not.toContainText("Backend content API");
    let savedState = await waitForSavedState(userDataDir, (state) => (
      state.projects[0].tasks.find((task) => task.id === "task-backend-list-e2e")?.archived === true
    ));
    expect(savedState.projects[0].tasks.find((task) => task.id === "task-backend-list-e2e").archivedAt).toBeTruthy();

    await page.locator("#taskListIncludeArchived").check();
    await expect(taskList.locator(".task-list-items")).toContainText("Backend content API");
    await expect(taskList.locator(".task-list-items")).toContainText("Archived deployment review");
    await taskList.locator('.task-list-item[data-task-id="task-backend-list-e2e"]').click();
    await taskList.locator('[data-action="restore-task"][data-task-id="task-backend-list-e2e"]').click();
    savedState = await waitForSavedState(userDataDir, (state) => (
      state.projects[0].tasks.find((task) => task.id === "task-backend-list-e2e")?.archived === false
    ));
    expect(savedState.projects[0].tasks.find((task) => task.id === "task-backend-list-e2e").archivedAt).toBe("");

    const logText = await waitForLogEvent(userDataDir, "task.restored");
    expect(logText).toContain("task.archived");
  } finally {
    await app.close();
  }
});

test("opens a v0.4.1 real browser program and navigates with webview", async () => {
  const { app, page } = await launchApp();
  const html = "<title>CosS Browser Test</title><h1>CosS Browser Test</h1>";
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  try {
    await page.locator('.dock [data-action="show-role-picker"][data-type="browser"]').click();
    await page.locator('.modal [data-action="select-role"][data-type="browser"]').first().click();

    await expect(page.locator(".program-window.browser")).toBeVisible();
    await expect(page.locator(".browser-webview")).toHaveCount(1);
    await page.locator(".browser-address").fill(dataUrl);
    await page.locator('[data-action="browser-go"]').click();

    await page.waitForFunction(() => {
      const webview = document.querySelector(".browser-webview");
      return Boolean(webview?.getURL?.().startsWith("data:text/html"));
    });
    await expect(page.locator(".browser-address")).toHaveValue(/data:text\/html/);
  } finally {
    await app.close();
  }
});

test("keeps browser popup links inside the CosS browser window", async () => {
  const { app, page, userDataDir } = await launchApp();
  const html = [
    "<title>Popup Source</title>",
    "<button id=\"openPopup\" onclick=\"window.open('data:text/html;charset=utf-8,Popup%20Target','_blank')\">open</button>"
  ].join("");
  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

  try {
    await page.locator('.dock [data-action="show-role-picker"][data-type="browser"]').click();
    await page.locator('.modal [data-action="select-role"][data-type="browser"]').first().click();
    await page.locator(".browser-address").fill(dataUrl);
    await page.locator('[data-action="browser-go"]').click();
    await page.waitForFunction(() => document.querySelector(".browser-webview")?.getURL?.().startsWith("data:text/html"));

    const getVisibleBrowserWindowCount = () => app.evaluate(({ BrowserWindow }) => (
      BrowserWindow.getAllWindows().filter((win) => win.isVisible()).length
    ));
    const beforeWindowCount = await getVisibleBrowserWindowCount();
    await page.evaluate(async () => {
      const webview = document.querySelector(".browser-webview");
      await webview.executeJavaScript("document.getElementById('openPopup').click()");
    });

    await page.waitForFunction(() => {
      const webview = document.querySelector(".browser-webview");
      return webview?.getURL?.().includes("Popup%20Target") || webview?.getURL?.().includes("Popup Target");
    });
    await expect.poll(getVisibleBrowserWindowCount).toBe(beforeWindowCount);
    await expect(page.locator(".browser-address")).toHaveValue(/Popup/);

    const logText = await waitForLogEvent(userDataDir, "browser.webview.window-open.redirected");
    expect(logText).toContain("Popup");
  } finally {
    await app.close();
  }
});

test("opens edits and saves a v0.4.1 project file", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-file-e2e-"));
  const filePath = path.join(projectDir, "notes.md");
  fs.writeFileSync(filePath, "# 初始内容\n", "utf8");
  const { app, page, userDataDir } = await launchApp({ path: projectDir });

  try {
    await page.locator('.dock [data-action="show-role-picker"][data-type="file"]').click();
    await page.locator('.modal [data-action="select-role"][data-type="file"]').first().click();

    await expect(page.locator(".program-window.file")).toBeVisible();
    await page.locator('[data-action="file-refresh-list"]').click();
    await expect(page.locator(".file-list-item", { hasText: "notes.md" })).toBeVisible();

    await page.locator(".file-path-input").fill("notes.md");
    await page.locator('[data-action="file-open"]').click();
    await expect(page.locator(".file-editor-textarea")).toHaveValue(/初始内容/);

    await page.locator(".file-editor-textarea").fill("# 已更新\n\n文件编辑器保存成功。\n");
    await page.locator('[data-action="file-save"]').click();
    await expect(page.locator(".file-status")).toContainText("已读取");

    const saved = fs.readFileSync(filePath, "utf8");
    expect(saved).toContain("文件编辑器保存成功");
    const logText = await waitForLogEvent(userDataDir, "file.saved");
    expect(logText).toContain("notes.md");
  } finally {
    await app.close();
  }
});

test("closes a role program from the titlebar close button", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator('.workspace-actions [data-action="show-role-picker"][data-type="terminal"]').click();
    await page.locator('.modal [data-terminal-mode="shell"]').first().click();

    await expect(page.locator(".program-window")).toHaveCount(1);
    await page.locator('.program-window [data-action="close-window"]').click();

    await expect(page.locator(".program-window")).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("switches the Agent provider in settings and creates an Agent terminal", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator('.sidebar-footer [data-action="show-settings"]').click();
    await expect(page.locator(".settings-shell")).toBeVisible();
    await page.locator('.settings-nav [data-action="set-settings-section"][data-section="agent"]').click();
    await expect(page.locator(".agent-provider-option.active")).toContainText("Claude Code");
    await expect(page.locator('[data-action="check-codex"]')).toBeVisible();
    await expect(page.locator('[data-action="check-claude"]')).toBeVisible();
    await expect(page.locator("[data-claude-status]")).toContainText("尚未检测 Claude Code 环境");
    await expect(page.locator("[data-codex-status]")).toContainText("尚未检测 Codex CLI 环境");

    await page.locator('[data-action="check-codex"]').click();
    await expect(page.locator("[data-codex-status]")).toContainText(/Codex CLI|codex|npm/);

    await page.locator('[data-action="set-agent-provider"][data-provider="codex"]').click();
    await expect(page.locator('.agent-provider-option.active[data-provider="codex"]')).toBeVisible();
    await expect(page.locator('[data-action="toggle-agent-fallback"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('[data-action="toggle-agent-fallback"]').click();
    await expect(page.locator('[data-action="toggle-agent-fallback"]')).toHaveAttribute("aria-pressed", "false");
    await page.locator(".settings-close").click();

    await page.locator('.workspace-actions [data-action="show-role-picker"][data-type="terminal"]').click();

    await expect(page.locator('.modal [data-terminal-mode="shell"]').first()).toBeVisible();
    await expect(page.locator('.modal [data-terminal-mode="agent"]').first()).toBeVisible();
    await expect(page.locator('.modal [data-terminal-mode="claude"]')).toHaveCount(0);
    await expect(page.locator('.modal [data-terminal-mode="codex"]')).toHaveCount(0);

    await page.locator('.modal [data-terminal-mode="agent"]').first().click();

    await expect(page.locator(".program-window.terminal")).toHaveCount(1);
    await expect(page.locator(".program-window.terminal .window-title")).toContainText("Agent(Codex)");
  } finally {
    await app.close();
  }
});

test("asks for approval before running risky terminal commands", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator('.workspace-actions [data-action="show-role-picker"][data-type="terminal"]').click();
    await page.locator('.modal [data-terminal-mode="shell"]').first().click();

    await expect(page.locator(".terminal-mount .xterm")).toBeVisible();
    await page.locator(".terminal-mount").click();
    await page.keyboard.type("Remove-Item -Recurse temp");
    await page.keyboard.press("Enter");

    await expect(page.locator(".command-approval")).toBeVisible();
    await expect(page.locator(".command-preview")).toContainText("Remove-Item -Recurse temp");

    await page.locator('[data-action="reject-command"]').click();
    await expect(page.locator(".command-approval")).toHaveCount(0);

    await page.locator('.nav [data-action="show-logs"]').click();
    await expect(page.locator(".log-panel")).toBeVisible();
    await expect(page.locator(".log-item").first()).toContainText("Remove-Item -Recurse temp");
    await expect(page.locator(".status-chip.rejected").first()).toBeVisible();
  } finally {
    await app.close();
  }
});

test("shows the v0.2 audit panel and can recheck Claude Code", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator('.nav [data-action="show-logs"]').click();

    await expect(page.locator(".log-panel")).toBeVisible();
    await expect(page.locator("[data-claude-status]")).toBeVisible();

    await page.locator('[data-action="check-claude"]').click();
    await expect(page.locator("[data-claude-status]")).toContainText(/Claude Code|claude/);
  } finally {
    await app.close();
  }
});

test("reports an invalid Codex CLI command", async () => {
  const { app, page } = await launchApp({}, { COSS_CODEX_COMMAND: "definitely-missing-codex-cli" });

  try {
    const status = await page.evaluate(() => window.cossAPI.getCodexStatus());

    expect(status.command).toBe("definitely-missing-codex-cli");
    expect(status.runnable).toBe(false);
    expect(status.errorDetail).toBeTruthy();
    expect(status.installCommand).toContain("@openai/codex");
    expect(status.npm.command).toMatch(/npm/);
    expect(status.npm.usable).toBe(true);
    expect(status.npm.candidates.length).toBeGreaterThan(0);
    expect(status.autoInstallDisabled).toBe(false);
  } finally {
    await app.close();
  }
});

test("shows an Agent error log instead of PowerShell fallback when disabled", async () => {
  const { app, page } = await launchApp(
    {},
    {
      COSS_DISABLE_TERMINAL_BACKEND: "0",
      COSS_CODEX_COMMAND: "definitely-missing-codex-cli",
      COSS_DISABLE_CODEX_AUTO_INSTALL: "1"
    }
  );

  try {
    await page.locator('.sidebar-footer [data-action="show-settings"]').click();
    await page.locator('[data-action="set-agent-provider"][data-provider="codex"]').click();
    await page.locator('[data-action="toggle-agent-fallback"]').click();
    await page.locator(".settings-close").click();

    await page.locator('.workspace-actions [data-action="show-role-picker"][data-type="terminal"]').click();
    await page.locator('.modal [data-terminal-mode="agent"]').first().click();

    await expect(page.locator(".program-window.terminal .window-title")).toContainText("Agent(Codex)");
    await expect(page.locator(".terminal-mount")).toContainText("已关闭失败回退到普通 PowerShell");
    await expect(page.locator(".terminal-mount")).not.toContainText("PS ");
  } finally {
    await app.close();
  }
});

test("auto-completes Claude Code onboarding config", async () => {
  const { app, page, userDataDir } = await launchApp();

  try {
    const status = await page.evaluate(() => window.cossAPI.getClaudeStatus());
    const configPath = path.join(userDataDir, ".claude.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    expect(status.onboarding.configured).toBe(true);
    expect(status.onboarding.path).toBe(configPath);
    expect(config.hasCompletedOnboarding).toBe(true);
  } finally {
    await app.close();
  }
});

test("brings a clicked program window to the front", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator('.workspace-actions [data-action="show-role-picker"][data-type="terminal"]').click();
    await page.locator('.modal [data-terminal-mode="shell"]').first().click();

    await page.locator('.dock [data-action="show-role-picker"][data-type="file"]').click();
    await page.locator('.modal [data-action="select-role"][data-type="file"]').first().click();

    const terminalWindow = page.locator(".program-window.terminal").first();
    const fileWindow = page.locator(".program-window.file").first();

    await expect(page.locator(".program-window")).toHaveCount(2);
    await expect(fileWindow).toHaveClass(/focused/);

    const zIndexBeforeClick = await Promise.all([
      terminalWindow.evaluate((node) => Number(getComputedStyle(node).zIndex)),
      fileWindow.evaluate((node) => Number(getComputedStyle(node).zIndex))
    ]);
    expect(zIndexBeforeClick[1]).toBeGreaterThan(zIndexBeforeClick[0]);

    await terminalWindow.locator(".window-content").click({ position: { x: 8, y: 60 } });

    await expect(terminalWindow).toHaveClass(/focused/);
    const zIndexAfterClick = await Promise.all([
      terminalWindow.evaluate((node) => Number(getComputedStyle(node).zIndex)),
      fileWindow.evaluate((node) => Number(getComputedStyle(node).zIndex))
    ]);
    expect(zIndexAfterClick[0]).toBeGreaterThan(zIndexAfterClick[1]);
  } finally {
    await app.close();
  }
});

test("repairs tied window z-indexes when clicking a covered program", async () => {
  const { app, page } = await launchApp({
    windows: [
      {
        id: "terminal-collision-e2e",
        type: "terminal",
        roleId: "tech-lead",
        title: "技术负责人 PowerShell",
        x: 80,
        y: 84,
        width: 500,
        height: 338,
        z: 10000,
        status: "idle",
        terminalMode: "shell",
        minimized: false
      },
      {
        id: "file-collision-e2e",
        type: "file",
        roleId: "product-manager",
        title: "产品经理文件",
        x: 260,
        y: 100,
        width: 460,
        height: 320,
        z: 10000,
        status: "idle",
        minimized: false
      }
    ]
  });

  try {
    const terminalWindow = page.locator('.program-window[data-window-id="terminal-collision-e2e"]');
    const fileWindow = page.locator('.program-window[data-window-id="file-collision-e2e"]');

    await expect(page.locator(".program-window")).toHaveCount(2);
    await terminalWindow.locator(".window-content").click({ position: { x: 14, y: 72 } });

    await expect(terminalWindow).toHaveClass(/focused/);
    const zIndexAfterClick = await Promise.all([
      terminalWindow.evaluate((node) => Number(getComputedStyle(node).zIndex)),
      fileWindow.evaluate((node) => Number(getComputedStyle(node).zIndex))
    ]);
    expect(zIndexAfterClick[0]).toBeGreaterThan(zIndexAfterClick[1]);
  } finally {
    await app.close();
  }
});

test("opens the role submenu from the desktop context menu", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator(".desktop").click({ button: "right", position: { x: 420, y: 280 } });
    await expect(page.locator(".context-menu")).toBeVisible();

    await page.locator('.context-menu [data-action="role-menu"][data-type="terminal"]').click();

    await expect(page.locator(".role-menu")).toBeVisible();
    await expect(page.locator('.role-menu [data-terminal-mode="shell"]').first()).toBeVisible();
    await expect(page.locator('.role-menu [data-terminal-mode="agent"]').first()).toBeVisible();
    await expect(page.locator('.role-menu [data-terminal-mode="claude"]')).toHaveCount(0);
    await expect(page.locator('.role-menu [data-terminal-mode="codex"]')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("opens collaboration details when task-created windows overlap", async () => {
  const { app, page } = await launchApp();

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("实现用户登录页面，并接入后端登录接口。");
    await page.locator('[data-action="create-task"]').click();
    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await page.locator('[data-action="confirm-task-plan"]').click();

    await expect(page.locator(".program-window")).toHaveCount(5);
    await expect(page.locator(".task-card")).toHaveCount(5);
    await expect(page.locator(".collab-overlay .collab-badge")).toHaveCount(5);

    await page.locator(".collab-overlay .collab-badge").first().click();

    await expect(page.locator(".collab-popover")).toBeVisible();
  } finally {
    await app.close();
  }
});

test("v0.4.2 child windows support minimize maximize restore and resize", async () => {
  const { app, page } = await launchApp({
    desktops: [
      {
        id: "desktop-main",
        name: "主桌面",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    activeDesktopId: "desktop-main",
    windows: [
      {
        id: "file-window-e2e",
        type: "file",
        roleId: "product-manager",
        title: "产品经理文件",
        x: 260,
        y: 112,
        width: 440,
        height: 300,
        z: 25,
        status: "idle",
        desktopId: "desktop-main",
        minimized: false,
        maximized: false
      }
    ]
  });

  try {
    const win = page.locator('.program-window[data-window-id="file-window-e2e"]');
    await expect(win).toBeVisible();
    const initialBox = await win.boundingBox();
    expect(initialBox).toBeTruthy();

    await win.locator('[data-action="toggle-maximize-window"]').click();
    await expect(win).toHaveClass(/maximized/);
    const maximizedBox = await win.boundingBox();
    expect(maximizedBox.width).toBeGreaterThan(initialBox.width + 120);

    await win.locator('[data-action="toggle-maximize-window"]').click();
    await expect(win).not.toHaveClass(/maximized/);
    const restoredBox = await win.boundingBox();
    expect(restoredBox.width).toBeLessThan(maximizedBox.width);

    const handle = win.locator(".resize-handle.se");
    const handleBox = await handle.boundingBox();
    expect(handleBox).toBeTruthy();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 92, handleBox.y + 70);
    await page.mouse.up();

    const resizedBox = await win.boundingBox();
    expect(resizedBox.width).toBeGreaterThan(restoredBox.width + 40);
    expect(resizedBox.height).toBeGreaterThan(restoredBox.height + 30);

    await win.locator('[data-action="minimize-window"]').click();
    await expect(page.locator('.program-window[data-window-id="file-window-e2e"]')).toHaveCount(0);

    await page.locator('.dock [data-window-id="file-window-e2e"]').click();
    await expect(win).toBeVisible();
  } finally {
    await app.close();
  }
});

test("v0.5.5 conversation view switches isolated conversations", async () => {
  const { app, page } = await launchApp({
    desktops: [
      {
        id: "desktop-main",
        name: "主对话",
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "desktop-review",
        name: "评审对话",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    activeDesktopId: "desktop-main",
    windows: [
      {
        id: "terminal-main-e2e",
        type: "terminal",
        roleId: "frontend-engineer",
        title: "前端工程师 PowerShell",
        x: 240,
        y: 112,
        width: 420,
        height: 280,
        z: 25,
        status: "idle",
        terminalMode: "shell",
        desktopId: "desktop-main",
        minimized: false
      },
      {
        id: "file-review-e2e",
        type: "file",
        roleId: "product-manager",
        title: "产品经理文件",
        x: 300,
        y: 132,
        width: 420,
        height: 280,
        z: 26,
        status: "idle",
        desktopId: "desktop-review",
        minimized: false
      }
    ]
  });

  try {
    await expect(page.locator(".workspace")).toHaveAttribute("data-active-desktop-id", "desktop-main");
    await expect(page.locator('.program-window[data-window-id="terminal-main-e2e"]')).toBeVisible();
    await expect(page.locator('.program-window[data-window-id="file-review-e2e"]')).toHaveCount(0);

    await page.locator('.workspace-actions [data-action="show-task-view"]').click();
    await expect(page.locator(".task-view-panel")).toBeVisible();
    await expect(page.locator(".task-view-panel")).toContainText("对话视图");
    await expect(page.locator('[data-action="create-desktop"]')).toHaveText("新建对话");
    await expect(page.locator(".desktop-card")).toHaveCount(2);

    await page.locator('.desktop-card[data-desktop-id="desktop-review"]').click();
    await expect(page.locator(".workspace")).toHaveAttribute("data-active-desktop-id", "desktop-review");
    await expect(page.locator('.program-window[data-window-id="file-review-e2e"]')).toBeVisible();
    await expect(page.locator('.program-window[data-window-id="terminal-main-e2e"]')).toHaveCount(0);

    await page.locator('.workspace-actions [data-action="show-task-view"]').click();
    await page.locator('[data-action="create-desktop"]').click();
    const activeDesktopId = await page.locator(".workspace").getAttribute("data-active-desktop-id");
    expect(activeDesktopId).toMatch(/^desktop-/);
    await expect(page.locator(".program-window")).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test("v0.5.5 conversation view layout presets arrange current conversation windows", async () => {
  const { app, page } = await launchApp({
    desktops: [
      {
        id: "desktop-main",
        name: "主对话",
        layoutPreset: "split-two",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    activeDesktopId: "desktop-main",
    windows: [
      {
        id: "layout-terminal-e2e",
        type: "terminal",
        roleId: "frontend-engineer",
        title: "前端工程师 PowerShell",
        x: 180,
        y: 120,
        width: 380,
        height: 260,
        z: 25,
        status: "idle",
        terminalMode: "shell",
        desktopId: "desktop-main",
        minimized: false
      },
      {
        id: "layout-file-e2e",
        type: "file",
        roleId: "product-manager",
        title: "产品经理文件",
        x: 220,
        y: 156,
        width: 380,
        height: 260,
        z: 26,
        status: "idle",
        desktopId: "desktop-main",
        minimized: false
      }
    ]
  });

  try {
    await page.locator('.workspace-actions [data-action="show-task-view"]').click();
    await expect(page.locator(".task-view-panel")).toContainText("对话视图");
    await page.locator('.snap-layout-button[data-layout="main-narrow"]').click();

    await expect(page.locator('.snap-layout-button[data-layout="main-narrow"]')).toHaveClass(/active/);

    const terminalBox = await page.locator('.program-window[data-window-id="layout-terminal-e2e"]').boundingBox();
    const fileBox = await page.locator('.program-window[data-window-id="layout-file-e2e"]').boundingBox();
    expect(terminalBox).toBeTruthy();
    expect(fileBox).toBeTruthy();
    expect(terminalBox.x).toBeLessThan(fileBox.x);
    expect(terminalBox.width).toBeGreaterThan(fileBox.width);
  } finally {
    await app.close();
  }
});

test("v0.5.4 stores Agent prompt templates and shows Codex auth state on demand", async () => {
  const authDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-codex-auth-"));
  const codexAuthPath = path.join(authDir, "auth.json");
  fs.writeFileSync(
    codexAuthPath,
    JSON.stringify({ tokens: { access_token: "fake-access-token-for-e2e" } }, null, 2),
    "utf8"
  );
  const { app, page } = await launchApp(
    {},
    {
      COSS_CODEX_AUTH_PATH: codexAuthPath,
      COSS_CODEX_COMMAND: "definitely-missing-codex-cli",
      COSS_DISABLE_CODEX_AUTO_INSTALL: "1"
    }
  );

  try {
    await page.locator('.sidebar-footer [data-action="show-settings"]').click();
    await page.locator('.settings-nav [data-action="set-settings-section"][data-section="agent"]').click();

    await expect(page.locator("[data-agent-prompt-template]")).toBeVisible();
    await page.locator("[data-agent-prompt-template]").fill("角色={{roleName}}\n任务={{taskTitle}}\n状态标记 COSS_AGENT_STATUS:done");
    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    expect(savedState.settings.agentPromptTemplate).toContain("状态标记 COSS_AGENT_STATUS:done");

    await page.locator('[data-action="check-codex"]').click();
    await expect(page.locator("[data-codex-status]")).toContainText("登录状态：已检测到登录凭据");
    await expect(page.locator("[data-codex-status]")).toContainText(codexAuthPath);

    await page.locator('[data-action="reset-agent-prompt-template"]').click();
    const resetState = await page.evaluate(() => window.cossAPI.loadState());
    expect(resetState.settings.agentPromptTemplate).toContain("{{subtaskDescription}}");
  } finally {
    await app.close();
  }
});

test("v0.5.5 configures CodeBuddy Code backend and injects the API key", async () => {
  const fakeCliDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-fake-codebuddy-"));
  const fakeCodeBuddyPath = path.join(fakeCliDir, "codebuddy.cmd");
  fs.writeFileSync(
    fakeCodeBuddyPath,
    [
      "@echo off",
      "if \"%~1\"==\"--version\" (",
      "  echo codebuddy-code 0.5.5-e2e",
      "  exit /b 0",
      ")",
      "if \"%CODEBUDDY_API_KEY%\"==\"\" (",
      "  echo fake codebuddy key configured: no",
      ") else (",
      "  echo fake codebuddy key configured: yes",
      ")",
      "echo COSS_AGENT_STATUS:done",
      "exit /b 0",
      ""
    ].join("\r\n"),
    "utf8"
  );
  const createdAt = "2026-01-01T00:00:00.000Z";
  const { app, page } = await launchApp(
    {
      desktops: [{ id: "desktop-main", name: "主对话", createdAt }],
      activeDesktopId: "desktop-main",
      windows: [
        {
          id: "window-codebuddy-e2e",
          type: "terminal",
          roleId: "tech-lead",
          title: "技术负责人 Agent(CodeBuddy Code)",
          x: 220,
          y: 96,
          width: 620,
          height: 360,
          z: 100,
          status: "working",
          terminalMode: "agent",
          agentProvider: "codebuddy",
          desktopId: "desktop-main",
          minimized: false,
          maximized: false,
          restoreBounds: null
        }
      ]
    },
    {
      COSS_DISABLE_TERMINAL_BACKEND: "0",
      COSS_CODEBUDDY_COMMAND: fakeCodeBuddyPath,
      COSS_DISABLE_CODEBUDDY_AUTO_INSTALL: "1"
    },
    {
      settings: {
        agentProvider: "codebuddy",
        codeBuddyApiKey: "sk-codebuddy-e2e",
        agentFallbackToShell: false,
        modelProvider: "system"
      }
    }
  );

  try {
    await expect(page.locator('[data-terminal-id="window-codebuddy-e2e"]')).toContainText("fake codebuddy key configured: yes", { timeout: 10000 });

    await page.locator('.sidebar-footer [data-action="show-settings"]').click();
    await page.locator('.settings-nav [data-action="set-settings-section"][data-section="agent"]').click();
    await expect(page.locator('.agent-provider-option[data-provider="codebuddy"]')).toHaveClass(/active/);
    await expect(page.locator("[data-codebuddy-api-key]")).toHaveValue("sk-codebuddy-e2e");
    const providerTitleBox = await page.locator(".agent-provider-row strong", { hasText: "Agent 终端" }).boundingBox();
    expect(providerTitleBox.width).toBeGreaterThan(60);
    expect(providerTitleBox.height).toBeLessThan(30);

    await page.locator('[data-action="check-codebuddy"]').click();
    await expect(page.locator("[data-codebuddy-status]")).toContainText("CodeBuddy Code CLI 已可用");
    await expect(page.locator("[data-codebuddy-status]")).toContainText("登录状态：已检测到登录凭据");

    await page.locator("[data-codebuddy-api-key]").fill("sk-codebuddy-updated");
    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    expect(savedState.settings.agentProvider).toBe("codebuddy");
    expect(savedState.settings.codeBuddyApiKey).toBe("sk-codebuddy-updated");
  } finally {
    try {
      await page.evaluate(() => window.cossAPI.disposeTerminal("window-codebuddy-e2e"));
    } catch {
      // Best-effort cleanup for terminal backend tests.
    }
    await app.close();
  }
});

test("v0.5.4 syncs Codex Agent terminal events back to task state and timeline", async () => {
  const fakeCliDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-fake-codex-"));
  const fakeCodexPath = path.join(fakeCliDir, "codex.cmd");
  fs.writeFileSync(
    fakeCodexPath,
    [
      "@echo off",
      "if \"%~1\"==\"--version\" (",
      "  echo codex-cli 0.5.4-e2e",
      "  exit /b 0",
      ")",
      "echo COSS_AGENT_STATUS:done",
      "echo COSS_AGENT_EVENT:{\"status\":\"done\",\"message\":\"Frontend done from structured event\",\"toRoleIds\":[\"product-manager\",\"qa-engineer\"]}",
      "echo fake codex completed",
      ""
    ].join("\r\n"),
    "utf8"
  );
  const mockPlan = {
    summary: "v0.5 Agent event sync plan.",
    subtasks: [
      {
        roleId: "frontend-engineer",
        title: "Implement frontend shell",
        description: "Use the Agent terminal and report completion."
      },
      {
        roleId: "backend-engineer",
        title: "Implement backend contract",
        description: "Use the Agent terminal and report completion."
      },
      {
        roleId: "qa-engineer",
        title: "Verify the flow",
        description: "Use the Agent terminal and report completion."
      }
    ],
    messages: [
      {
        fromRoleId: "product-manager",
        toRoleIds: ["frontend-engineer", "backend-engineer", "qa-engineer"],
        content: "Please finish the v0.5 Agent sync test."
      }
    ]
  };
  const { app, page, userDataDir } = await launchApp(
    {},
    {
      COSS_DISABLE_TERMINAL_BACKEND: "0",
      COSS_CODEX_COMMAND: fakeCodexPath,
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_MOCK_RESPONSE: JSON.stringify(mockPlan)
    },
    {
      settings: {
        agentProvider: "codex",
        agentFallbackToShell: true,
        modelProvider: "system"
      }
    }
  );

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("Run Codex Agent marker sync");
    await page.locator('[data-action="create-task"]').click();
    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await page.locator('[data-action="confirm-task-plan"]').click();

    await page.waitForFunction(async () => {
      const state = await window.cossAPI.loadState();
      const project = state.projects[0];
      return Boolean(project.agentEvents?.some((event) => event.structured && event.message?.includes("structured event")));
    }, null, { timeout: 12000 });

    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    const project = savedState.projects[0];
    const task = project.tasks[0];
    expect(project.agentEvents.some((event) => event.provider === "codex" && event.status === "done")).toBe(true);
    expect(project.agentEvents.some((event) => event.structured && event.message.includes("Frontend done from structured event"))).toBe(true);
    expect(project.messages.some((message) => message.source === "agent-event" && message.content.includes("structured event"))).toBe(true);
    expect(task.subtasks.some((subtask) => subtask.roleId === "frontend-engineer" && subtask.status === "done")).toBe(true);
    expect(project.windows.some((win) => win.type === "terminal" && win.terminalMode === "agent" && win.agentSession?.taskId === task.id)).toBe(true);

    const eventPanelText = await page.locator(".agent-event-panel").first().textContent({ timeout: 5000 });
    expect(eventPanelText).toContain("Agent 会话事件");
    const logText = await waitForLogEvent(userDataDir, "agent.output.event");
    expect(logText).toContain('"provider":"codex"');
    const messageLogText = await waitForLogEvent(userDataDir, "role.message.agent-created");
    expect(messageLogText).toContain("agent-event");

    await page.locator('.workspace-actions [data-action="show-message-center"]').click();
    await expect(page.locator(".message-center-modal")).toBeVisible();
    await expect(page.locator(".agent-timeline-row", { hasText: "Frontend done from structured event" }).first()).toBeVisible();
    const agentNodeBackground = await page
      .locator(".message-timeline-node.agent-timeline-row", { hasText: "Frontend done from structured event" })
      .first()
      .evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(agentNodeBackground).toBe("rgba(0, 0, 0, 0)");
    const dotCentersY = await page.locator(".message-timeline-node .message-node-dot").evaluateAll((dots) =>
      dots.map((dot) => {
        const box = dot.getBoundingClientRect();
        return Math.round((box.top + box.height / 2) * 10) / 10;
      })
    );
    expect(Math.max(...dotCentersY) - Math.min(...dotCentersY)).toBeLessThanOrEqual(1);
  } finally {
    try {
      await page.evaluate(async () => {
        const state = await window.cossAPI.loadState();
        const terminalIds = state.projects
          .flatMap((project) => project.windows || [])
          .filter((win) => win.type === "terminal")
          .map((win) => win.id);
        await Promise.all(terminalIds.map((id) => window.cossAPI.disposeTerminal(id)));
      });
    } catch {
      // The app may already be closing after a timeout; best-effort cleanup only.
    }
    await app.close();
  }
});

test("v0.5.4 ignores echoed Agent marker examples from prompts and deliveries", async () => {
  const fakeCliDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-fake-codex-echo-"));
  const fakeCodexPath = path.join(fakeCliDir, "codex.cmd");
  fs.writeFileSync(
    fakeCodexPath,
    [
      "@echo off",
      "if \"%~1\"==\"--version\" (",
      "  echo codex-cli 0.5.4-marker-echo",
      "  exit /b 0",
      ")",
      "echo Echoed status marker examples: COSS_AGENT_STATUS:done or COSS_AGENT_STATUS:blocked.",
      "echo Echoed structured marker example: COSS_AGENT_EVENT:{\"status\":\"running\",\"message\":\"example placeholder\",\"toRoleIds\":[\"product-manager\"]}.",
      "echo no standalone agent marker was emitted",
      "exit /b 0",
      ""
    ].join("\r\n"),
    "utf8"
  );
  const createdAt = "2026-01-01T00:00:00.000Z";
  const { app, page, userDataDir } = await launchApp(
    {
      desktops: [{ id: "desktop-main", name: "Main Desktop", createdAt }],
      activeDesktopId: "desktop-main",
      tasks: [
        {
          id: "task-marker-echo",
          title: "Marker echo guard",
          goal: "Guard Agent marker parsing",
          status: "planned",
          desktopId: "desktop-main",
          createdAt,
          updatedAt: createdAt,
          model: { provider: "system", modelName: "agent-brain" },
          planner: { status: "success", source: "test", summary: "Guard marker echoes", plannedAt: createdAt, confirmedAt: createdAt },
          subtasks: [
            {
              id: "subtask-marker-echo",
              roleId: "frontend-engineer",
              title: "Keep echoed markers inert",
              description: "Echoed prompt examples must not update task state.",
              status: "pending",
              createdAt,
              updatedAt: createdAt
            }
          ]
        }
      ],
      windows: [
        {
          id: "window-marker-echo",
          type: "terminal",
          roleId: "frontend-engineer",
          title: "Frontend Agent(Codex)",
          x: 220,
          y: 96,
          width: 620,
          height: 360,
          z: 100,
          status: "waiting",
          terminalMode: "agent",
          agentProvider: "codex",
          desktopId: "desktop-main",
          minimized: false,
          maximized: false,
          restoreBounds: null
        }
      ]
    },
    {
      COSS_DISABLE_TERMINAL_BACKEND: "0",
      COSS_CODEX_COMMAND: fakeCodexPath,
      COSS_DISABLE_CODEX_AUTO_INSTALL: "1"
    },
    {
      settings: {
        agentProvider: "codex",
        agentFallbackToShell: true,
        modelProvider: "system"
      }
    }
  );

  try {
    await expect(page.locator('.program-window[data-window-id="window-marker-echo"]')).toBeVisible();
    await expect(page.locator('[data-terminal-id="window-marker-echo"]')).toContainText("no standalone agent marker was emitted", { timeout: 10000 });
    await page.waitForTimeout(500);

    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    const project = savedState.projects[0];
    const task = project.tasks.find((item) => item.id === "task-marker-echo");
    const terminalWindow = project.windows.find((item) => item.id === "window-marker-echo");
    expect(project.agentEvents || []).toHaveLength(0);
    expect(project.messages || []).not.toContainEqual(expect.objectContaining({ source: "agent-event" }));
    expect(task.subtasks[0].status).toBe("pending");
    expect(terminalWindow.status).toBe("waiting");

    const logDir = path.join(userDataDir, "logs");
    const logText = fs.existsSync(logDir)
      ? fs.readdirSync(logDir).map((name) => fs.readFileSync(path.join(logDir, name), "utf8")).join("\n")
      : "";
    expect(logText).not.toContain('"event":"agent.output.event"');
  } finally {
    try {
      await page.evaluate(() => window.cossAPI.disposeTerminal("window-marker-echo"));
    } catch {
      // Best-effort cleanup for terminal backend tests.
    }
    await app.close();
  }
});

test("v0.5.4 marks Agent approval prompts as waiting and updates delivery state", async () => {
  const fakeCliDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-fake-codex-approval-"));
  const fakeCodexPath = path.join(fakeCliDir, "codex.cmd");
  fs.writeFileSync(
    fakeCodexPath,
    [
      "@echo off",
      "if \"%~1\"==\"--version\" (",
      "  echo codex-cli 0.5.4-approval",
      "  exit /b 0",
      ")",
      "echo Do you want to create technical-architecture.md?",
      "echo Yes, allow all edits",
      "exit /b 0",
      ""
    ].join("\r\n"),
    "utf8"
  );
  const createdAt = "2026-01-01T00:00:00.000Z";
  const { app, page, userDataDir } = await launchApp(
    {
      desktops: [{ id: "desktop-main", name: "Main Desktop", taskId: "task-approval-e2e", createdAt }],
      activeDesktopId: "desktop-main",
      messages: [
        {
          id: "message-approval-e2e",
          type: "role-message",
          channelType: "task",
          channelId: "task:task-approval-e2e",
          fromRoleId: "product-manager",
          toRoleIds: ["tech-lead"],
          content: "Please write the architecture document.",
          taskId: "task-approval-e2e",
          source: "task-instruction",
          status: "sent",
          readBy: ["product-manager"],
          createdAt
        }
      ],
      agentDeliveries: [
        {
          id: "delivery-approval-e2e",
          messageId: "message-approval-e2e",
          windowId: "window-approval-e2e",
          roleId: "tech-lead",
          taskId: "task-approval-e2e",
          status: "submitted",
          attempts: 1,
          createdAt,
          updatedAt: createdAt,
          submittedAt: createdAt
        }
      ],
      tasks: [
        {
          id: "task-approval-e2e",
          title: "Approval wait task",
          goal: "Detect Claude approval waits",
          status: "running",
          desktopId: "desktop-main",
          createdAt,
          updatedAt: createdAt,
          model: { provider: "system", modelName: "agent-brain" },
          planner: { status: "success", source: "test", summary: "Approval wait", plannedAt: createdAt, confirmedAt: createdAt },
          subtasks: [
            {
              id: "subtask-approval-e2e",
              roleId: "tech-lead",
              title: "Write architecture",
              description: "Create the architecture document.",
              status: "running",
              createdAt,
              updatedAt: createdAt
            }
          ]
        }
      ],
      windows: [
        {
          id: "window-approval-e2e",
          type: "terminal",
          roleId: "tech-lead",
          title: "Tech Lead Agent(Codex)",
          x: 220,
          y: 96,
          width: 620,
          height: 360,
          z: 100,
          status: "working",
          terminalMode: "agent",
          agentProvider: "codex",
          desktopId: "desktop-main",
          minimized: false,
          maximized: false,
          restoreBounds: null,
          lastAgentDeliveryId: "delivery-approval-e2e",
          agentSession: {
            sessionId: "agent-session-approval-e2e",
            provider: "codex",
            roleId: "tech-lead",
            roleName: "Tech Lead",
            workspace: process.cwd(),
            projectId: "project-e2e",
            projectName: "E2E Project",
            taskId: "task-approval-e2e",
            subtaskId: "subtask-approval-e2e",
            sessionName: "CosS-E2E-tech-codex",
            promptTemplateVersion: "v0.5",
            createdAt,
            lastStartedAt: "",
            resumeCount: 0,
            lastActiveMode: "",
            lastEventAt: ""
          }
        }
      ]
    },
    {
      COSS_DISABLE_TERMINAL_BACKEND: "0",
      COSS_CODEX_COMMAND: fakeCodexPath,
      COSS_DISABLE_CODEX_AUTO_INSTALL: "1"
    },
    {
      settings: {
        agentProvider: "codex",
        agentFallbackToShell: true,
        modelProvider: "system"
      }
    }
  );

  try {
    const savedState = await waitForSavedState(userDataDir, (state) => {
      const project = state.projects[0];
      const task = project.tasks.find((item) => item.id === "task-approval-e2e");
      const delivery = project.agentDeliveries.find((item) => item.id === "delivery-approval-e2e");
      return Boolean(
        project.agentEvents?.some((event) => event.type === "approval-wait" && event.status === "waiting")
        && task?.subtasks?.[0]?.status === "waiting"
        && delivery?.status === "waiting"
      );
    }, 10000);
    const project = savedState.projects[0];
    const task = project.tasks.find((item) => item.id === "task-approval-e2e");
    const delivery = project.agentDeliveries.find((item) => item.id === "delivery-approval-e2e");
    expect(task.subtasks[0].status).toBe("waiting");
    expect(task.status).toBe("running");
    expect(delivery.status).toBe("waiting");
    expect(delivery.lastFeedback).toContain("等待人工确认");
  } finally {
    try {
      await page.evaluate(() => window.cossAPI.disposeTerminal("window-approval-e2e"));
    } catch {
      // Best-effort cleanup for terminal backend tests.
    }
    await app.close();
  }
});

test("v0.5.4 opens message center filtered to the current task", async () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const { app, page } = await launchApp({
    desktops: [
      { id: "desktop-old", name: "Old Task Desktop", taskId: "task-old-e2e", createdAt },
      { id: "desktop-current", name: "Current Task Desktop", taskId: "task-current-e2e", createdAt }
    ],
    activeDesktopId: "desktop-current",
    tasks: [
      {
        id: "task-old-e2e",
        title: "Old task",
        goal: "Old task",
        status: "running",
        desktopId: "desktop-old",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: { status: "success", source: "test", summary: "Old", plannedAt: createdAt, confirmedAt: createdAt },
        subtasks: []
      },
      {
        id: "task-current-e2e",
        title: "Current task",
        goal: "Current task",
        status: "running",
        desktopId: "desktop-current",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: { status: "success", source: "test", summary: "Current", plannedAt: createdAt, confirmedAt: createdAt },
        subtasks: []
      }
    ],
    messages: [
      {
        id: "message-old-e2e",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-old-e2e",
        fromRoleId: "product-manager",
        toRoleIds: ["tech-lead"],
        content: "OLD_TASK_MESSAGE_SHOULD_HIDE",
        taskId: "task-old-e2e",
        source: "manual",
        status: "sent",
        readBy: ["product-manager"],
        createdAt
      },
      {
        id: "message-current-e2e",
        type: "role-message",
        channelType: "task",
        channelId: "task:task-current-e2e",
        fromRoleId: "product-manager",
        toRoleIds: ["tech-lead"],
        content: "CURRENT_TASK_MESSAGE_SHOULD_SHOW",
        taskId: "task-current-e2e",
        source: "manual",
        status: "sent",
        readBy: ["product-manager"],
        createdAt
      }
    ]
  });

  try {
    await page.locator('.workspace-actions [data-action="show-message-center"]').click();
    await expect(page.locator(".message-center-modal")).toBeVisible();
    await expect(page.locator("#messageTimelineTaskFilter")).toHaveValue("task-current-e2e");
    await expect(page.locator(".message-center-modal")).toContainText("CURRENT_TASK_MESSAGE_SHOULD_SHOW");
    await expect(page.locator(".message-center-modal")).not.toContainText("OLD_TASK_MESSAGE_SHOULD_HIDE");
  } finally {
    await app.close();
  }
});

test("v0.5.4 filters task cards by role and guards accidental instant blocked clicks", async () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const { app, page } = await launchApp({
    desktops: [{ id: "desktop-main", name: "Main Desktop", taskId: "task-filter-e2e", createdAt }],
    activeDesktopId: "desktop-main",
    windows: [
      {
        id: "task-window-e2e",
        type: "task",
        roleId: "product-manager",
        title: "Task Board",
        x: 250,
        y: 96,
        width: 560,
        height: 430,
        z: 100,
        status: "idle",
        desktopId: "desktop-main",
        minimized: false,
        maximized: false,
        restoreBounds: null
      }
    ],
    tasks: [
      {
        id: "task-filter-e2e",
        title: "Task filter test",
        goal: "Filter task cards",
        status: "planned",
        desktopId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: { status: "success", source: "test", summary: "Filter", plannedAt: createdAt, confirmedAt: createdAt },
        subtasks: [
          {
            id: "subtask-frontend-filter-e2e",
            roleId: "frontend-engineer",
            title: "Build UI card",
            description: "Frontend task",
            status: "pending",
            createdAt,
            updatedAt: createdAt
          },
          {
            id: "subtask-devops-filter-e2e",
            roleId: "devops-engineer",
            title: "Deploy pipeline card",
            description: "DevOps task",
            status: "pending",
            createdAt,
            updatedAt: createdAt
          }
        ]
      }
    ]
  });

  try {
    await expect(page.locator('.program-window[data-window-id="task-window-e2e"]')).toBeVisible();
    await page.locator("#taskRoleFilter").selectOption("devops-engineer");
    await expect(page.locator(".task-card")).toHaveCount(1);
    await expect(page.locator(".task-card")).toContainText("Deploy pipeline card");
    await expect(page.locator(".task-card")).not.toContainText("Build UI card");

    await page.locator("#taskRoleFilter").selectOption("frontend-engineer");
    await page.locator('.task-card [data-status="running"]').click();
    await page.evaluate(() => document.querySelector('.task-card [data-status="blocked"]')?.click());

    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    const subtask = savedState.projects[0].tasks[0].subtasks.find((item) => item.id === "subtask-frontend-filter-e2e");
    expect(subtask.status).toBe("running");
  } finally {
    await app.close();
  }
});

test("v0.5.4 edits task plans before confirming assignment", async () => {
  const mockPlan = {
    summary: "Editable plan.",
    subtasks: [
      { roleId: "product-manager", title: "Confirm scope", description: "Confirm login scope." },
      { roleId: "frontend-engineer", title: "Build UI", description: "Build login UI." },
      { roleId: "backend-engineer", title: "Build API", description: "Build login API." }
    ],
    messages: [
      {
        fromRoleId: "product-manager",
        toRoleIds: ["frontend-engineer", "backend-engineer"],
        content: "Please align edited plan."
      }
    ]
  };
  const { app, page, userDataDir } = await launchApp(
    {},
    {
      COSS_LLM_FORCE_ERROR: "0",
      COSS_LLM_MOCK_RESPONSE: JSON.stringify(mockPlan)
    }
  );

  try {
    await page.locator('.workspace-actions [data-action="show-create-task"]').click();
    await page.locator("#taskGoal").fill("Edit generated login plan");
    await page.locator('[data-action="create-task"]').click();
    await expect(page.locator(".task-plan-modal")).toBeVisible();
    await expect(page.locator(".task-plan-item")).toHaveCount(3);

    await page.locator('[data-plan-field="title"][data-plan-index="0"]').fill("Edited QA acceptance");
    await page.locator('[data-plan-field="roleId"][data-plan-index="0"]').selectOption("qa-engineer");
    await page.locator('[data-action="add-task-plan-subtask"]').click();
    await expect(page.locator(".task-plan-item")).toHaveCount(4);
    await page.locator('[data-plan-field="title"][data-plan-index="3"]').fill("Edited security review");
    await page.locator('[data-plan-field="description"][data-plan-index="3"]').fill("Review auth edge cases before release.");
    await page.locator('[data-action="delete-task-plan-subtask"][data-plan-index="1"]').click();
    await expect(page.locator(".task-plan-item")).toHaveCount(3);
    await page.locator('[data-action="confirm-task-plan"]').click();

    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    const subtasks = savedState.projects[0].tasks[0].subtasks;
    expect(subtasks.some((item) => item.roleId === "qa-engineer" && item.title === "Edited QA acceptance")).toBe(true);
    expect(subtasks.some((item) => item.title === "Edited security review")).toBe(true);
    expect(subtasks.some((item) => item.title === "Build UI")).toBe(false);

    const logText = await waitForLogEvent(userDataDir, "task.plan.subtask.added");
    expect(logText).toContain("task.plan.edited");
  } finally {
    await app.close();
  }
});

test("v0.5.4 supports file tree folder create rename delete and save as", async () => {
  const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-file-crud-e2e-"));
  fs.writeFileSync(path.join(projectDir, "notes.md"), "# Initial\n", "utf8");
  const createdAt = "2026-01-01T00:00:00.000Z";
  const { app, page, userDataDir } = await launchApp({
    path: projectDir,
    desktops: [{ id: "desktop-main", name: "主桌面", createdAt }],
    activeDesktopId: "desktop-main",
    windows: [
      {
        id: "file-crud-window",
        type: "file",
        roleId: "product-manager",
        title: "产品经理文件",
        x: 260,
        y: 100,
        width: 680,
        height: 430,
        z: 100,
        status: "idle",
        minimized: false,
        maximized: false,
        restoreBounds: null,
        desktopId: "desktop-main"
      }
    ]
  });

  try {
    await expect(page.locator('.program-window[data-window-id="file-crud-window"]')).toBeVisible();
    await page.locator('[data-action="file-refresh-list"]').click();
    await expect(page.locator(".file-list-item", { hasText: "notes.md" })).toBeVisible();

    await page.locator('[data-action="file-create-folder"]').click();
    await expect(page.locator(".file-operation-modal")).toBeVisible();
    await page.locator("#fileOperationPath").fill("docs");
    await page.locator('[data-action="confirm-file-operation"]').click();
    await expect.poll(() => fs.existsSync(path.join(projectDir, "docs"))).toBe(true);
    await page.locator('[data-action="file-refresh-list"]').click();
    await expect(page.locator(".file-list-item", { hasText: "docs" })).toBeVisible();

    await page.locator(".file-editor-textarea").fill("# Saved as copy\n");
    await page.locator('[data-action="file-save-as"]').click();
    await expect(page.locator(".file-operation-modal")).toBeVisible();
    await page.locator("#fileOperationPath").fill("docs/copy.md");
    await page.locator('[data-action="confirm-file-operation"]').click();
    expect(fs.readFileSync(path.join(projectDir, "docs", "copy.md"), "utf8")).toContain("Saved as copy");

    await page.locator('[data-action="file-rename"]').click();
    await expect(page.locator(".file-operation-modal")).toBeVisible();
    await page.locator("#fileOperationPath").fill("docs/renamed.md");
    await page.locator('[data-action="confirm-file-operation"]').click();
    expect(fs.existsSync(path.join(projectDir, "docs", "renamed.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, "docs", "copy.md"))).toBe(false);

    await page.locator('[data-action="file-delete"]').click();
    await expect(page.locator(".file-operation-modal")).toBeVisible();
    await page.locator('[data-action="confirm-file-operation"]').click();
    expect(fs.existsSync(path.join(projectDir, "docs", "renamed.md"))).toBe(false);

    const logText = await waitForLogEvent(userDataDir, "file.deleted");
    expect(logText).toContain("docs");
  } finally {
    await app.close();
  }
});

test("v0.5.4 manages browser tabs bookmarks history and opens task URLs", async () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const taskUrl = "https://example.com/coss-task-url";
  const { app, page, userDataDir } = await launchApp({
    desktops: [{ id: "desktop-main", name: "主桌面", createdAt }],
    activeDesktopId: "desktop-main",
    tasks: [
      {
        id: "task-browser-e2e",
        title: "Browser task",
        goal: `Verify ${taskUrl}`,
        status: "running",
        desktopId: "desktop-main",
        createdAt,
        updatedAt: createdAt,
        model: { provider: "system", modelName: "agent-brain" },
        planner: { status: "success", source: "mock", summary: "Browser URL test", plannedAt: createdAt, confirmedAt: createdAt },
        subtasks: [
          {
            id: "subtask-browser-e2e",
            roleId: "qa-engineer",
            title: "Open test URL",
            description: `Open ${taskUrl} and verify page.`,
            status: "running",
            createdAt,
            updatedAt: createdAt
          }
        ]
      }
    ],
    windows: [
      {
        id: "task-url-window",
        type: "task",
        roleId: "qa-engineer",
        title: "测试工程师任务",
        x: 220,
        y: 90,
        width: 560,
        height: 420,
        z: 100,
        status: "working",
        minimized: false,
        maximized: false,
        restoreBounds: null,
        desktopId: "desktop-main"
      }
    ]
  });

  try {
    await expect(page.locator('[data-action="open-task-url"]')).toBeVisible();
    await page.locator('[data-action="open-task-url"]').click();
    await expect(page.locator(".program-window.browser")).toBeVisible();
    await expect(page.locator(".browser-address")).toHaveValue(taskUrl);

    await page.locator('[data-action="browser-new-tab"]').click();
    await expect(page.locator(".browser-tab")).toHaveCount(2);
    await page.locator(".browser-address").fill("https://example.com/second-tab");
    await page.locator('[data-action="browser-go"]').click();
    await page.locator('[data-action="browser-bookmark"]').click();
    await expect(page.locator(".browser-quick-links")).toContainText("https://example.com/second-tab");

    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    const browserWindow = savedState.projects[0].windows.find((win) => win.type === "browser");
    expect(browserWindow.browserTabs.length).toBe(2);
    expect(browserWindow.browserBookmarks).toContain("https://example.com/second-tab");
    expect(browserWindow.browserHistory.some((item) => item.url === taskUrl)).toBe(true);

    const logText = await waitForLogEvent(userDataDir, "browser.task-url.opened");
    expect(logText).toContain(taskUrl);
  } finally {
    await app.close();
  }
});

test("v0.5.4 runs manual Agent remote login tests", async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "gpt-test" }], path: request.url }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;
  const { app, page, userDataDir } = await launchApp(
    {},
    {
      OPENAI_API_KEY: "test-key",
      COSS_AGENT_LOGIN_TEST_BASE_URL: baseUrl
    }
  );

  try {
    await page.locator('.sidebar-footer [data-action="show-settings"]').click();
    await page.locator('.settings-nav [data-action="set-settings-section"][data-section="agent"]').click();
    await expect(page.locator('[data-agent-login-status="codex"]')).toContainText("尚未测试");
    await page.locator('[data-action="test-agent-login"][data-provider="codex"]').click();
    await expect(page.locator('[data-agent-login-status="codex"]')).toContainText("远程登录态可用", { timeout: 5000 });

    const logText = await waitForLogEvent(userDataDir, "agent.login-test.succeeded");
    expect(logText).toContain(baseUrl);
  } finally {
    await app.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
