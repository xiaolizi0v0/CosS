(function exposeRendererConfig(global) {
  const resources = global.COSS_I18N?.resources || {};

  function translate(key, fallback) {
    if (global.i18next?.isInitialized) {
      return global.i18next.t(key, { defaultValue: fallback });
    }
    const language = global.i18next?.language || "zh-CN";
    return resources[language]?.translation?.[key]
      || resources["zh-CN"]?.translation?.[key]
      || fallback;
  }

  const role = (id, name, category, description, programs, collaborators) => ({
    id,
    get name() { return translate(`role.${id}.name`, name); },
    get category() { return translate(`role.${id}.category`, category); },
    get description() { return translate(`role.${id}.description`, description); },
    programs,
    claude: true,
    collaborators
  });

  const ROLE_TEMPLATES = [
    role("product-manager", "产品经理", "规划", "把用户需求转化为可开发、可验收的任务。", ["terminal", "task", "file", "browser"], ["tech-lead", "frontend-engineer", "backend-engineer", "qa-engineer"]),
    role("tech-lead", "技术负责人", "规划", "把控技术方案、代码质量和角色协作边界。", ["terminal", "file", "task"], ["frontend-engineer", "backend-engineer", "qa-engineer", "ai-agent-engineer"]),
    role("frontend-engineer", "前端工程师", "开发", "负责界面、交互、前端状态和前端工程化。", ["terminal", "browser", "file"], ["backend-engineer", "qa-engineer", "product-manager"]),
    role("backend-engineer", "后端工程师", "开发", "负责接口、业务逻辑、数据模型和权限控制。", ["terminal", "file", "task"], ["frontend-engineer", "qa-engineer", "devops-engineer"]),
    role("qa-engineer", "测试工程师", "质量", "验证功能是否符合需求和验收标准。", ["browser", "terminal", "task"], ["frontend-engineer", "backend-engineer", "product-manager"]),
    role("ai-agent-engineer", "AI/Agent 工程师", "开发", "负责模型、Agent、工具调用和任务编排能力。", ["terminal", "file", "task"], ["tech-lead", "backend-engineer", "security-engineer"]),
    role("devops-engineer", "DevOps 工程师", "基础设施", "负责构建、部署、CI/CD、环境和发布流水线。", ["terminal", "task"], ["backend-engineer", "qa-engineer", "tech-lead"]),
    role("technical-writer", "技术文档工程师", "文档", "负责开发文档、API 文档和技术说明。", ["terminal", "file", "browser", "task"], ["product-manager", "tech-lead", "backend-engineer"]),
    role("security-engineer", "安全工程师", "安全", "识别权限边界、命令执行和敏感数据风险。", ["terminal", "file", "task"], ["backend-engineer", "devops-engineer", "ai-agent-engineer"])
  ];

  const SYSTEM_ROLE = {
    id: "system",
    get name() { return translate("role.system.name", "系统"); },
    get category() { return translate("role.system.category", "系统"); },
    get description() { return translate("role.system.description", "CosS 系统调度器。"); },
    programs: [],
    claude: false,
    collaborators: []
  };

  const ORCHESTRATOR_PROTOCOL_VERSION = "0.10.0";
  const ORCHESTRATOR_TRANSPORT_SENDER_ID = SYSTEM_ROLE.id;
  const ROLE_CAPABILITY_PROFILES = {
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
  const GLOBAL_ORCHESTRATOR_POLICY = {
    directAgentMessaging: false,
    capabilitySandbox: true,
    sharedTaskBoard: true,
    resourceLocks: true,
    structuredResultsOnly: true,
    durableWorkflow: true,
    eventSourcing: true,
    stepLeases: true,
    dryRunBeforeHighRisk: true,
    userConfirmationForHighRisk: true,
    centralArbitration: true
  };

  const PROGRAMS = {
    terminal: { get label() { return translate("program.terminal", "终端"); }, icon: ">" },
    browser: { get label() { return translate("program.browser", "浏览器"); }, icon: "◎" },
    file: { get label() { return translate("program.file", "文件"); }, icon: "□" },
    task: { get label() { return translate("program.task", "任务"); }, icon: "✓" },
    "task-list": { get label() { return translate("program.task-list", "任务列表"); }, icon: "☰" }
  };

  const DEFAULT_TASK_ROLE_IDS = ["product-manager", "frontend-engineer", "backend-engineer", "qa-engineer", "tech-lead"];
  const PROJECT_MEMORY_VERSION = "0.10.0";
  const PROJECT_MEMORY_TASK_LIMIT = 8;
  const PROJECT_MEMORY_ITEM_LIMIT = 20;
  const MCP_TOOL_NAMES = [
    "coss_get_context", "coss_list_roles", "coss_get_task_board", "coss_pool_read", "coss_pool_claim",
    "coss_list_tasks", "coss_claim_task", "coss_claim_step", "coss_heartbeat_step", "coss_release_step",
    "coss_get_kernel_events", "coss_report_status", "coss_submit_result", "coss_acquire_lock",
    "coss_release_lock", "coss_request_approval"
  ];

  const MODEL_PROVIDER_PRESETS = {
    system: {
      id: "system",
      get label() { return translate("provider.system.label", "用户自定义"); },
      get description() { return translate("provider.system.description", "使用用户填写的 OpenAI 兼容模型服务。"); },
      baseUrl: "", modelName: "", apiKeyRequired: false, locked: false
    },
    deepseek: {
      id: "deepseek", label: "DeepSeek API",
      get description() { return translate("provider.deepseek.description", "使用 DeepSeek 兼容接口，需要用户填写 API key。"); },
      baseUrl: "https://api.deepseek.com/v1", modelName: "deepseek-chat", apiKeyRequired: true
    },
    glm: {
      id: "glm", label: "GLM",
      get description() { return translate("provider.glm.description", "使用智谱 GLM 接口，需要用户填写 API key。"); },
      baseUrl: "https://open.bigmodel.cn/api/paas/v4", modelName: "glm-4-plus", apiKeyRequired: true
    },
    openai: {
      id: "openai", label: "OpenAI",
      get description() { return translate("provider.openai.description", "使用 OpenAI 兼容接口，需要用户填写 API key。"); },
      baseUrl: "https://api.openai.com/v1", modelName: "gpt-4.1", apiKeyRequired: true
    },
    "claude-code": {
      id: "claude-code", label: "Claude Code",
      get description() { return translate("provider.claude-code.description", "用于 Claude Code 或 Anthropic API 相关任务，需要用户填写 API key。"); },
      baseUrl: "https://api.anthropic.com/v1", modelName: "claude-sonnet-4-20250514", apiKeyRequired: true
    }
  };

  const AGENT_PERMISSION_POLICIES = {
    readonly: {
      id: "readonly",
      get label() { return translate("permission.readonly.label", "只读模式"); },
      get description() { return translate("permission.readonly.description", "Agent 只能阅读、分析和给出建议，不应改文件、安装依赖或执行破坏性命令。"); },
      get instruction() { return translate("permission.readonly.instruction", "当前 CosS Agent 权限模式：只读模式。只能阅读和分析项目内容，不能创建、修改、删除文件，不能安装依赖，不能运行部署、格式化磁盘或其他写入/破坏性命令。如确需修改，请先说明原因并等待用户调整权限。"); }
    },
    confirm: {
      id: "confirm",
      get label() { return translate("permission.confirm.label", "每次编辑确认"); },
      get description() { return translate("permission.confirm.description", "任何文件写入、依赖安装、删除、部署等操作都需要先说明风险并等待确认。"); },
      get instruction() { return translate("permission.confirm.instruction", "当前 CosS Agent 权限模式：每次编辑确认。执行任何文件写入、依赖安装、删除、部署、网络发布或高风险命令前，必须先说明计划、影响范围和风险，并等待用户确认。"); }
    },
    sessionEdit: {
      id: "sessionEdit",
      get label() { return translate("permission.sessionEdit.label", "本会话允许编辑"); },
      get description() { return translate("permission.sessionEdit.description", "Agent 可在当前项目内创建和修改文件；安装依赖、删除、部署仍需确认。"); },
      get instruction() { return translate("permission.sessionEdit.instruction", "当前 CosS Agent 权限模式：本会话允许编辑。可以在当前项目目录内创建和修改文件；安装依赖、删除文件、部署、格式化磁盘、访问敏感信息或其他高风险操作仍必须先等待用户确认。"); }
    },
    sessionInstall: {
      id: "sessionInstall",
      get label() { return translate("permission.sessionInstall.label", "本会话允许编辑与安装依赖"); },
      get description() { return translate("permission.sessionInstall.description", "Agent 可在当前项目内编辑文件并安装依赖；删除、部署和破坏性命令仍需确认。"); },
      get instruction() { return translate("permission.sessionInstall.instruction", "当前 CosS Agent 权限模式：本会话允许编辑与安装依赖。可以在当前项目内创建/修改文件并安装必要依赖；删除文件、部署、格式化磁盘、清理大范围目录、访问敏感信息或其他破坏性操作仍必须先等待用户确认。"); }
    }
  };

  const SETTINGS_SECTIONS = [
    { id: "account", get label() { return translate("settings.account", "账户管理"); }, icon: "user" },
    { id: "system", get label() { return translate("settings.system", "系统设置"); }, icon: "gear" },
    { id: "agent", get label() { return translate("settings.agent", "智能体设置"); }, icon: "assistant" },
    { id: "memory", get label() { return translate("settings.memory", "记忆"); }, icon: "clock" },
    { id: "model", get label() { return translate("settings.model", "模型"); }, icon: "cube" },
    { id: "data", get label() { return translate("settings.data", "数据管理"); }, icon: "database" },
    { id: "security", get label() { return translate("settings.security", "安全中心"); }, icon: "shield" },
    { id: "help", get label() { return translate("settings.help", "帮助与反馈"); }, icon: "help" }
  ];

  const LANGUAGE_OPTIONS = global.COSS_I18N?.languages || [
    { id: "zh-CN", label: "中文简体" },
    { id: "en-US", label: "English" }
  ];

  const AGENT_POOL_CLEANUP_POLICY = { maxFilesPerRole: 160, maxAgeDays: 21, batchSize: 40 };
  const SUBTASK_STATUS_DEFS = {
    idle: { get label() { return translate("status.idle", "空闲"); }, windowStatus: "idle" },
    running: { get label() { return translate("status.running", "执行中"); }, windowStatus: "working" },
    done: { get label() { return translate("status.done", "完成"); }, windowStatus: "done" }
  };
  const AGENT_RELAY_STAGES = {
    idle: { get label() { return translate("status.idle", "空闲"); }, get symbol() { return translate("relay.idle.symbol", "闲"); }, className: "idle" },
    running: { get label() { return translate("status.running", "执行中"); }, get symbol() { return translate("relay.running.symbol", "行"); }, className: "executing" },
    done: { get label() { return translate("status.done", "完成"); }, get symbol() { return translate("relay.done.symbol", "完"); }, className: "completed" }
  };
  const KERNEL_PHASE_DEFS = {
    idle: { get label() { return translate("status.idle", "空闲"); }, status: "idle", relayStage: "idle" },
    running: { get label() { return translate("status.running", "执行中"); }, status: "running", relayStage: "running" },
    done: { get label() { return translate("status.done", "完成"); }, status: "done", relayStage: "done" }
  };
  const COMMAND_RISK_RULES = [
    { id: "delete-files", severity: "high", get label() { return translate("risk.delete-files.label", "文件删除"); }, get description() { return translate("risk.delete-files.description", "可能删除项目文件或系统文件。"); }, pattern: /\b(remove-item|rm|del|erase|rmdir|rd)\b/i },
    { id: "dependency-install", severity: "medium", get label() { return translate("risk.dependency-install.label", "依赖或软件安装"); }, get description() { return translate("risk.dependency-install.description", "会改变本机或项目依赖环境。"); }, pattern: /\b(winget|npm|pnpm|yarn|pip|choco|scoop|cargo|dotnet)\s+(install|i|add|update|upgrade)\b/i },
    { id: "environment-change", severity: "high", get label() { return translate("risk.environment-change.label", "环境变量或注册表修改"); }, get description() { return translate("risk.environment-change.description", "可能影响当前用户或系统环境。"); }, pattern: /\b(setx|reg\s+add|\[environment\]::setenvironmentvariable)\b|\$env:[\w()\\.-]+\s*=/i },
    { id: "deployment", severity: "high", get label() { return translate("risk.deployment.label", "发布或部署"); }, get description() { return translate("risk.deployment.description", "可能把本地变更发布到远程环境。"); }, pattern: /\b(git\s+push|npm\s+publish|docker\s+push|kubectl\s+(apply|delete)|terraform\s+(apply|destroy))\b/i },
    { id: "script-execution", severity: "medium", get label() { return translate("risk.script-execution.label", "动态脚本执行"); }, get description() { return translate("risk.script-execution.description", "可能执行下载或拼接生成的代码。"); }, pattern: /\b(iex|invoke-expression|powershell\s+-encodedcommand)\b|(\|\s*(powershell|pwsh|sh|bash)\b)/i }
  ];

  global.COSS_CONFIG = Object.freeze({
    ROLE_TEMPLATES, SYSTEM_ROLE, ORCHESTRATOR_PROTOCOL_VERSION, ORCHESTRATOR_TRANSPORT_SENDER_ID,
    ROLE_CAPABILITY_PROFILES, GLOBAL_ORCHESTRATOR_POLICY, PROGRAMS, DEFAULT_TASK_ROLE_IDS,
    PROJECT_MEMORY_VERSION, PROJECT_MEMORY_TASK_LIMIT, PROJECT_MEMORY_ITEM_LIMIT, MCP_TOOL_NAMES,
    MODEL_PROVIDER_PRESETS, AGENT_PERMISSION_POLICIES, SETTINGS_SECTIONS, LANGUAGE_OPTIONS,
    resources, AGENT_POOL_CLEANUP_POLICY, SUBTASK_STATUS_DEFS, AGENT_RELAY_STAGES,
    KERNEL_PHASE_DEFS, COMMAND_RISK_RULES
  });
})(window);
