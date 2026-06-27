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

test("boots into the workspace shell", async () => {
  const { app, page } = await launchApp();

  try {
    await expect(page.locator(".brand")).toContainText("CosS");
    await expect(page.locator(".brand-version")).toHaveText("v0.5.3");
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

test("renders v0.5.3 custom title bar menus and exposes log directory info", async () => {
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
    expect(info.version).toBe("0.5.3");
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
    await expect(page.locator(".message-center-modal")).toContainText("v0.5.3 协作时间线");

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

test("v0.5.3 sends subtask instructions into the collaboration timeline", async () => {
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

test("v0.5.3 queues timeline messages for a running Agent terminal", async () => {
  const createdAt = "2026-01-01T00:00:00.000Z";
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
    await expect(page.locator('[data-action="show-terminal-output-refs"]')).toBeVisible({ timeout: 5000 });

    const savedState = await page.evaluate(() => window.cossAPI.loadState());
    const project = savedState.projects[0];
    const message = project.messages.find((item) => item.id === "message-inject-e2e");
    expect(message.injectedWindowIds).toContain("agent-inject-terminal");
    expect(message.injectedAt).toBeTruthy();
    expect(project.agentDeliveries.some((item) => item.messageId === "message-inject-e2e" && item.status === "sent")).toBe(true);
    expect(project.terminalOutputRefs.some((item) => item.messageId === "message-inject-e2e" && item.windowId === "agent-inject-terminal")).toBe(true);

    const logText = await waitForLogEvent(userDataDir, "agent.delivery.confirmed");
    expect(logText).toContain("message-inject-e2e");
    expect(logText).toContain("agent-inject-terminal");
  } finally {
    await page.evaluate(() => window.cossAPI.disposeTerminal("agent-inject-terminal")).catch(() => {});
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

test("v0.4.2 task view switches isolated desktops", async () => {
  const { app, page } = await launchApp({
    desktops: [
      {
        id: "desktop-main",
        name: "主桌面",
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      {
        id: "desktop-review",
        name: "评审桌面",
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

test("v0.4.2 task view layout presets arrange current desktop windows", async () => {
  const { app, page } = await launchApp({
    desktops: [
      {
        id: "desktop-main",
        name: "主桌面",
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

test("v0.5.3 stores Agent prompt templates and shows Codex auth state on demand", async () => {
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

test("v0.5.3 syncs Codex Agent terminal events back to task state and timeline", async () => {
  const fakeCliDir = fs.mkdtempSync(path.join(os.tmpdir(), "coss-fake-codex-"));
  const fakeCodexPath = path.join(fakeCliDir, "codex.cmd");
  fs.writeFileSync(
    fakeCodexPath,
    [
      "@echo off",
      "if \"%~1\"==\"--version\" (",
      "  echo codex-cli 0.5.3-e2e",
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

test("v0.5.3 edits task plans before confirming assignment", async () => {
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

test("v0.5.3 supports file tree folder create rename delete and save as", async () => {
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

test("v0.5.3 manages browser tabs bookmarks history and opens task URLs", async () => {
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

test("v0.5.3 runs manual Agent remote login tests", async () => {
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
