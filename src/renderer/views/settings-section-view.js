(function exposeSettingsSectionView(global) {
  function createSettingsSectionRenderer({
    translate,
    escapeHtml,
    getState,
    productUrls = {},
    icon,
    getProject,
    ensureProjectMemoryShape,
    formatDateTime,
    formatProjectMemoryForDisplay,
    renderSettingsPlaceholder,
    getActiveModelConfig,
    appVersion = "",
    languageOptions = [],
    getAgentProviderLabel,
    getAgentPermissionPolicy,
    agentPermissionPolicies = {},
    renderAgentPermissionOption,
    renderAgentProviderOption,
    renderClaudeStatus,
    renderCodexStatus,
    renderCodeBuddyStatus,
    renderAgentLoginTestStatus,
    getMcpConfigStatus,
    getLatestStatus,
    getDefaultAgentPromptTemplate,
    formatFileSize,
    getStorageInfo,
    getStorageOperationStatus
  } = {}) {
    const t = translate || ((_key, fallback) => fallback || "");
    const state = getState?.() || {};
    function getUserProfile() {
      const state = getState?.() || {};
      state.settings ||= {};
      state.settings.userProfile ||= { displayName: t("account.defaultName", "本地用户"), avatarDataUrl: "" };
      return state.settings.userProfile;
    }
    function renderUserAvatar(sizeClass = "") {
      const profile = getUserProfile();
      const name = String(profile.displayName || t("account.defaultName", "本地用户")).trim() || t("account.defaultName", "本地用户");
      const initial = Array.from(name)[0] || t("account.initial", "本");
      const avatar = String(profile.avatarDataUrl || "");
      return `<div class="avatar ${escapeHtml(sizeClass)}">${avatar ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(name)}" />` : `<span>${escapeHtml(initial)}</span>`}</div>`;
    }
    function renderAccountSettingsSection() {
      const profile = getUserProfile();
      return `<div class="account-settings-panel"><div class="settings-row account-avatar-row"><div><strong>${escapeHtml(t("account.avatar", "用户头像"))}</strong><span>${escapeHtml(t("account.avatar.desc", "用于侧边栏和本地工作区身份展示。"))}</span></div><div class="account-avatar-actions">${renderUserAvatar("large")}<input id="accountAvatarInput" type="file" accept="image/*" hidden /><button class="secondary-button" data-action="choose-account-avatar">${escapeHtml(t("account.changeAvatar", "更换头像"))}</button><button class="secondary-button" data-action="clear-account-avatar" ${profile.avatarDataUrl ? "" : "disabled"}>${escapeHtml(t("account.remove", "移除"))}</button></div></div><div class="settings-row account-name-row"><div><strong>${escapeHtml(t("account.name", "用户名"))}</strong><span>${escapeHtml(t("account.name.desc", "修改后会显示在左下角账户区域。"))}</span></div><div class="settings-inline-field"><input id="accountDisplayName" maxlength="32" value="${escapeHtml(profile.displayName || t("account.defaultName", "本地用户"))}" placeholder="${escapeHtml(t("account.name.placeholder", "请输入用户名"))}" /></div></div></div>`;
    }
    function renderHelpActionItem({ label, action, url = "", external = false }) {
      return `<button class="help-action-item" data-action="${escapeHtml(action)}" ${url ? `data-url="${escapeHtml(url)}"` : ""}><span class="help-action-label">${escapeHtml(label)}</span>${external ? `<span class="help-action-external" aria-hidden="true">${icon?.("external") || "↗"}</span>` : ""}</button>`;
    }
    function renderHelpSettingsSection() {
      return `<div class="help-settings-panel"><div class="help-action-list">${renderHelpActionItem({ label: t("help.docs", "帮助文档"), action: "open-product-url", url: productUrls.docs || productUrls.help, external: true })}${renderHelpActionItem({ label: t("help.feedback", "意见反馈"), action: "show-feedback-modal" })}${renderHelpActionItem({ label: t("help.contact", "联系我们"), action: "open-product-url", url: productUrls.help, external: true })}</div><div class="help-open-source-links"><button data-action="open-product-url" data-url="${escapeHtml(productUrls.license || "")}">${escapeHtml(t("help.license", "开源许可"))}</button><span>|</span><button data-action="open-product-url" data-url="${escapeHtml(productUrls.help || "")}">${escapeHtml(t("help.home", "项目主页"))}</button></div></div>`;
    }
    function renderMemorySettingsSection() {
      const project = getProject?.();
      if (!project) {
        return renderSettingsPlaceholder?.(t("memory.title", "记忆"), t("memory.noProject", "当前没有打开的项目。"), [t("memory.noProject.hint", "先创建或选择一个项目")]) || "";
      }
      const memory = ensureProjectMemoryShape?.(project) || { taskHistory: [], artifacts: [], decisions: [], enabled: true, manualNotes: "" };
      const taskCount = memory.taskHistory.length;
      const artifactCount = memory.artifacts.length;
      const decisionCount = memory.decisions.length;
      const updatedAt = memory.updatedAt ? formatDateTime(memory.updatedAt) : t("memory.notRefreshed", "尚未刷新");
      return `
        <div class="settings-section-title"><strong>${escapeHtml(t("memory.title.projectMemory", "项目记忆"))}</strong><span>${escapeHtml(t("memory.desc", "项目记忆会在新建任务时提供给任务规划和协作者，帮助延续项目背景与既有决策。"))}</span></div>
        <div class="settings-row"><div><strong>${escapeHtml(t("memory.currentProject", "当前项目"))}</strong><span>${escapeHtml(project.name)} · ${escapeHtml(project.path || "")}</span></div><button class="settings-toggle-button" data-action="toggle-project-memory" aria-pressed="${memory.enabled !== false}"><span class="settings-toggle ${memory.enabled !== false ? "on" : ""}"></span></button></div>
        <div class="settings-row project-memory-actions-row"><div><strong>${escapeHtml(t("memory.status", "记忆状态"))}</strong><span>${escapeHtml(t("memory.status.summary", "{{enabled}} · {{taskCount}} 个任务摘要 · {{artifactCount}} 个产物 · {{decisionCount}} 条决策 · {{updatedAt}}", { enabled: memory.enabled !== false ? t("memory.status.on", "已开启") : t("memory.status.off", "已关闭"), taskCount, artifactCount, decisionCount, updatedAt }))}</span></div><div class="settings-action-stack"><button class="secondary-button" data-action="refresh-project-memory">${escapeHtml(t("memory.refresh", "刷新记忆"))}</button><button class="secondary-button" data-action="save-project-memory">${escapeHtml(t("memory.save", "保存备注"))}</button><button class="secondary-button danger" data-action="clear-project-memory">${escapeHtml(t("memory.clear", "清空"))}</button></div></div>
        <div class="project-memory-panel"><label for="projectMemoryManualNotes">${escapeHtml(t("memory.manualNotes.label", "手写项目备注"))}</label><textarea id="projectMemoryManualNotes" spellcheck="false" placeholder="${escapeHtml(t("memory.manualNotes.placeholder", "例如：项目技术栈、接口约定、目录规范、已确认的限制条件。"))}">${escapeHtml(memory.manualNotes || "")}</textarea><div class="project-memory-help">${escapeHtml(t("memory.manualNotes.help", "这部分会被原样放入新任务规划提示词，适合记录架构选择、目录约定、已确认边界和不要重复的事项。"))}</div></div>
        <div class="project-memory-panel"><label>${escapeHtml(t("memory.autoSummary", "自动摘要"))}</label><pre class="project-memory-summary">${escapeHtml(formatProjectMemoryForDisplay?.(memory) || "")}</pre></div>`;
    }
    function renderSystemSettingsSection() {
      const currentState = getState?.() || {};
      const activeModel = getActiveModelConfig?.() || { label: "", modelName: "" };
      const options = Array.isArray(languageOptions) ? languageOptions : [];
      return `<div class="settings-row"><div><strong>${escapeHtml(t("system.version", "应用版本"))}</strong><span>${escapeHtml(t("system.version.desc", "当前 CosS 桌面应用版本。"))}</span></div><span class="settings-value">${appVersion}</span></div>
        <div class="settings-row"><div><strong>${escapeHtml(t("system.workspace", "默认工作区路径"))}</strong><span>${escapeHtml(t("system.workspace.desc", "新项目会在创建时选择工作区路径。"))}</span></div><span class="settings-value">${escapeHtml(t("system.workspace.value", "创建项目时选择"))}</span></div>
        <div class="settings-row"><div><strong>${escapeHtml(t("system.language", "语言"))}</strong><span>${escapeHtml(t("system.language.desc", "设置应用界面显示语言。"))}</span></div><div class="settings-inline-field"><select id="appLanguageSelect">${options.map((language) => `<option value="${escapeHtml(language.id)}" ${currentState.settings?.language === language.id ? "selected" : ""}>${escapeHtml(language.label)}</option>`).join("")}</select></div></div>
        <div class="settings-row"><div><strong>${escapeHtml(t("system.model", "当前模型摘要"))}</strong><span>${escapeHtml(t("system.model.summary", "{{label}} · {{modelName}}。完整配置请进入“模型”。", { label: activeModel.label, modelName: activeModel.modelName }))}</span></div><button class="secondary-button" data-action="set-settings-section" data-section="model">${escapeHtml(t("system.model.open", "打开模型"))}</button></div>
        <div class="settings-row"><div><strong>${escapeHtml(t("system.agent", "Agent 摘要"))}</strong><span>${escapeHtml(t("system.agent.summary", "当前 Agent 后端为 {{provider}}。终端后端与环境检测请进入“智能体设置”。", { provider: getAgentProviderLabel?.(currentState.settings?.agentProvider) || "" }))}</span></div><button class="secondary-button" data-action="set-settings-section" data-section="agent">${escapeHtml(t("system.agent.open", "打开智能体"))}</button></div>`;
    }
    function renderMcpConfigStatusSection() {
      const mcpConfigStatus = getMcpConfigStatus?.();
      if (!mcpConfigStatus) {
        return `<div class="model-connectivity-status idle" data-mcp-config-status><strong>${escapeHtml(t("mcpConfig.notDetected", "尚未检测当前项目协作配置"))}</strong><span>${escapeHtml(t("mcpConfig.notDetected.desc", "点击“检测配置”可检查当前项目的 Agent 协作能力是否可用。"))}</span></div>`;
      }
      if (mcpConfigStatus.state === "writing" || mcpConfigStatus.state === "checking") {
        return `<div class="model-connectivity-status testing" data-mcp-config-status><strong>${escapeHtml(mcpConfigStatus.state === "checking" ? t("mcpConfig.checking", "正在检测协作配置") : t("mcpConfig.generating", "正在生成协作配置"))}</strong><span>${escapeHtml(mcpConfigStatus.message || t("common.pleaseWait", "请稍候..."))}</span></div>`;
      }
      const root = mcpConfigStatus.rootConfig || {};
      const coss = mcpConfigStatus.cossConfig || {};
      const rootReady = root.exists && root.valid && root.matches;
      const cossReady = coss.exists && coss.valid && coss.matches && coss.metaMatches !== false;
      const providers = [["Claude Code", rootReady], ["Codex", rootReady], ["CodeBuddy Code", rootReady]];
      const checkedAt = mcpConfigStatus.checkedAt ? ` · ${formatDateTime(mcpConfigStatus.checkedAt)}` : "";
      return `<div class="model-connectivity-status ${mcpConfigStatus.ok ? "ready" : "missing"}" data-mcp-config-status><strong>${escapeHtml(mcpConfigStatus.ok ? t("mcpConfig.healthy", "项目协作配置健康") : t("mcpConfig.needFix", "项目协作配置需要修复"))}</strong><span>${escapeHtml(mcpConfigStatus.error || t("mcpConfig.checkedAt", "检测时间{{time}}", { time: checkedAt }))}</span><span>.mcp.json：${rootReady ? escapeHtml(t("mcpConfig.discoverable", "可发现")) : root.exists ? root.valid ? escapeHtml(t("mcpConfig.serverMismatch", "coss server 不匹配")) : escapeHtml(t("mcpConfig.parseFailed", "解析失败：{{error}}", { error: root.error || t("mcpConfig.jsonInvalid", "JSON 无效") })) : escapeHtml(t("mcpConfig.missing", "缺失"))}${root.path ? ` · ${escapeHtml(root.path)}` : ""}</span><span>.coss/mcp/coss-mcp.json：${cossReady ? escapeHtml(t("mcpConfig.synced", "已同步")) : coss.exists ? coss.valid ? escapeHtml(t("mcpConfig.contentMismatch", "内容不匹配")) : escapeHtml(t("mcpConfig.parseFailed", "解析失败：{{error}}", { error: coss.error || t("mcpConfig.jsonInvalid", "JSON 无效") })) : escapeHtml(t("mcpConfig.missing", "缺失"))}${coss.path ? ` · ${escapeHtml(coss.path)}` : ""}</span><div class="mcp-agent-discovery-list">${providers.map(([label, ready]) => `<span class="${ready ? "ready" : "missing"}">${escapeHtml(label)}：${ready ? escapeHtml(t("mcpConfig.discoverable", "可发现")) : escapeHtml(t("mcpConfig.needsFix", "待修复"))}</span>`).join("")}</div></div>`;
    }
    function renderAgentSettingsSection() {
      const currentState = getState?.() || {};
      const settings = currentState.settings || {};
      const status = getLatestStatus?.() || {};
      return `<div class="settings-row agent-provider-row"><div><strong>${escapeHtml(t("agent.terminal.title", "Agent 终端"))}</strong><span>${escapeHtml(t("agent.terminal.desc", "选择创建角色 Agent 时默认使用的终端后端。"))}</span></div><div class="agent-provider-switch">${renderAgentProviderOption?.("claude", "Claude Code", t("agent.provider.claude.desc", "适合 Claude Code 交互式开发任务。")) || ""}${renderAgentProviderOption?.("codex", "Codex", t("agent.provider.codex.desc", "适合 Codex CLI 代码代理任务。")) || ""}${renderAgentProviderOption?.("codebuddy", "CodeBuddy Code", t("agent.provider.codebuddy.desc", "适合 CodeBuddy Code 代码代理任务。")) || ""}</div></div>
        <div class="settings-row"><div><strong>${escapeHtml(t("agent.collabConfig.title", "Agent 协作配置"))}</strong><span>${escapeHtml(t("agent.collabConfig.desc", "为当前项目启用 Agent 协作能力，支持任务进展同步、审批和结果回传。"))}</span></div><div class="settings-action-stack"><button class="settings-toggle-button" data-action="toggle-agent-mcp-auto-config" aria-pressed="${settings.agentMcpAutoConfigEnabled === true}" title="${escapeHtml(t("agent.mcpAutoConfig.title", "创建 Agent 终端时自动维护项目协作配置"))}"><span class="settings-toggle ${settings.agentMcpAutoConfigEnabled === true ? "on" : ""}"></span></button><button class="secondary-button" data-action="check-project-mcp-config">${escapeHtml(t("mcpConfig.detect", "检测配置"))}</button><button class="secondary-button" data-action="write-project-mcp-config">${escapeHtml(t("agent.collabConfig.fix", "生成/修复"))}</button><button class="secondary-button" data-action="show-mcp-audit">${escapeHtml(t("agent.collabConfig.audit", "查看审计"))}</button></div></div>
        <div class="settings-status-slot">${renderMcpConfigStatusSection()}</div>
        <div class="settings-row"><div><strong>${escapeHtml(t("agent.claude.autoDetect", "Claude Code 自动检测"))}</strong><span>${escapeHtml(t("agent.claude.autoDetect.desc", "创建 Agent 终端时，如果选择 Claude Code，会沿用自动检测与 winget 安装流程。"))}</span></div><button class="secondary-button" data-action="check-claude">${escapeHtml(t("commandAudit.recheck", "重新检测"))}</button></div><div class="settings-status-slot" id="claudeStatusMount">${renderClaudeStatus?.(status.claude) || ""}</div>
        <div class="settings-row"><div><strong>${escapeHtml(t("agent.claude.loginTest", "Claude Code 登录测试"))}</strong><span>${escapeHtml(t("agent.loginTest.desc", "手动调用远程 API 校验当前凭据是否可用；没有 API key 时只显示跳过原因。"))}</span></div><button class="secondary-button" data-action="test-agent-login" data-provider="claude">${escapeHtml(t("agent.loginTest.button", "测试登录态"))}</button></div><div class="settings-status-slot" id="claudeLoginTestMount">${renderAgentLoginTestStatus?.("claude") || ""}</div>
        <div class="settings-row"><div><strong>${escapeHtml(t("agent.codex.command", "Codex 命令"))}</strong><span>${escapeHtml(t("agent.codex.command.desc", "默认查找 codex；不可运行时会通过 npm 自动安装 Codex CLI。需要自定义路径时，可设置环境变量 COSS_CODEX_COMMAND。"))}</span></div><span class="settings-value">codex</span></div><div class="settings-row"><div><strong>${escapeHtml(t("agent.codex.autoDetect", "Codex 自动检测"))}</strong><span>${escapeHtml(t("agent.codex.autoDetect.desc", "检测 codex、npm、PATH 命中路径和 WindowsApps 应用包冲突。"))}</span></div><button class="secondary-button" data-action="check-codex">${escapeHtml(t("commandAudit.recheck", "重新检测"))}</button></div><div class="settings-status-slot" id="codexStatusMount">${renderCodexStatus?.(status.codex) || ""}</div>
        <div class="settings-row"><div><strong>${escapeHtml(t("agent.codex.loginTest", "Codex 登录测试"))}</strong><span>${escapeHtml(t("agent.codex.loginTest.desc", "手动调用 OpenAI/Codex 远程 API 校验当前凭据是否可用；没有 key 时只显示跳过原因。"))}</span></div><button class="secondary-button" data-action="test-agent-login" data-provider="codex">${escapeHtml(t("agent.loginTest.button", "测试登录态"))}</button></div><div class="settings-status-slot" id="codexLoginTestMount">${renderAgentLoginTestStatus?.("codex") || ""}</div>
        <div class="settings-row"><div><strong>${escapeHtml(t("agent.codeBuddy.command", "CodeBuddy Code 命令"))}</strong><span>${escapeHtml(t("agent.codeBuddy.command.desc", "默认查找 codebuddy，并兼容 cbc；不可运行时会通过 npm 自动安装 CodeBuddy Code CLI。需要自定义路径时，可设置环境变量 COSS_CODEBUDDY_COMMAND。"))}</span></div><span class="settings-value">codebuddy</span></div><div class="settings-row"><div><strong>${escapeHtml(t("agent.codeBuddy.apiKey", "CodeBuddy Code API Key"))}</strong><span>${escapeHtml(t("agent.codeBuddy.apiKey.desc", "创建 CodeBuddy Agent 终端时会写入 CODEBUDDY_API_KEY 环境变量；该值需要用户自行填写。"))}</span></div><div class="settings-inline-field"><input type="password" autocomplete="off" placeholder="${escapeHtml(t("agent.codeBuddyApiKey.placeholder", "填写 CodeBuddy API Key"))}" value="${escapeHtml(settings.codeBuddyApiKey || "")}" data-codebuddy-api-key /></div></div><div class="settings-row"><div><strong>${escapeHtml(t("agent.codeBuddy.autoDetect", "CodeBuddy Code 自动检测"))}</strong><span>${escapeHtml(t("agent.codeBuddy.autoDetect.desc", "检测 codebuddy、cbc、npm 和 PATH 命中路径。"))}</span></div><button class="secondary-button" data-action="check-codebuddy">${escapeHtml(t("commandAudit.recheck", "重新检测"))}</button></div><div class="settings-status-slot" id="codeBuddyStatusMount">${renderCodeBuddyStatus?.(status.codebuddy) || ""}</div>
        <div class="settings-row"><div><strong>${escapeHtml(t("agent.codeBuddy.loginTest", "CodeBuddy Code 登录测试"))}</strong><span>${escapeHtml(t("agent.codeBuddy.loginTest.desc", "手动调用 CodeBuddy 兼容远程接口校验当前 API Key 是否可用；没有 key 时只显示跳过原因。"))}</span></div><button class="secondary-button" data-action="test-agent-login" data-provider="codebuddy">${escapeHtml(t("agent.loginTest.button", "测试登录态"))}</button></div><div class="settings-status-slot" id="codeBuddyLoginTestMount">${renderAgentLoginTestStatus?.("codebuddy") || ""}</div>
        <div class="settings-row"><div><strong>${escapeHtml(t("agent.promptTemplate.title", "Agent 角色提示词模板"))}</strong><span>${escapeHtml(t("agent.promptTemplate.desc", "创建 Claude Code、Codex 或 CodeBuddy Agent 终端时，会把模板渲染后写入 COSS_ROLE_PROMPT，并同步会话与任务上下文。"))}</span></div><button class="secondary-button" data-action="reset-agent-prompt-template">${escapeHtml(t("agent.promptTemplate.reset", "恢复默认"))}</button></div><div class="settings-code-editor"><textarea data-agent-prompt-template spellcheck="false">${escapeHtml(settings.agentPromptTemplate || getDefaultAgentPromptTemplate?.() || "")}</textarea><div class="settings-code-help">${escapeHtml(t("agent.promptTemplate.help", "支持占位符：{{roleName}}、{{roleDescription}}、{{projectName}}、{{workspace}}、{{agentProvider}}、{{agentPermissionLabel}}、{{agentPermissionInstructions}}、{{sessionId}}、{{taskTitle}}、{{taskGoal}}、{{subtaskTitle}}、{{subtaskDescription}}。"))}</div></div><div class="settings-row"><div><strong>${escapeHtml(t("agent.fallbackToShell.title", "Agent 失败回退到 PowerShell"))}</strong><span>${escapeHtml(t("agent.fallbackToShell.desc", "关闭后，Agent 启动或安装失败时只保留错误日志窗口，不进入普通 PowerShell 提示符。"))}</span></div><button class="settings-toggle-button" data-action="toggle-agent-fallback" aria-pressed="${settings.agentFallbackToShell !== false}"><span class="settings-toggle ${settings.agentFallbackToShell !== false ? "on" : ""}"></span></button></div>`;
    }
    function renderSecuritySettingsSection() {
      const policy = getAgentPermissionPolicy?.() || { label: "", instruction: "" };
      return `<div class="settings-row permission-policy-row"><div><strong>${escapeHtml(t("security.permissionMode.title", "Agent 权限模式"))}</strong><span>${escapeHtml(t("security.permissionMode.desc", "当前模式：{{label}}。新建 Agent 终端和后续任务投递都会携带该权限说明。", { label: policy.label }))}</span></div><div class="permission-policy-grid">${Object.values(agentPermissionPolicies).map(renderAgentPermissionOption || (() => "")).join("")}</div></div><div class="settings-status-slot permission-policy-status"><strong>${escapeHtml(policy.label)}</strong><span>${escapeHtml(policy.instruction)}</span></div><div class="settings-row"><div><strong>${escapeHtml(t("security.terminalConfirm.title", "终端安全确认"))}</strong><span>${escapeHtml(t("security.terminalConfirm.desc", "高风险命令会在执行前弹出确认窗口，并写入命令审计日志。"))}</span></div><span class="settings-toggle on"></span></div><div class="settings-row"><div><strong>${escapeHtml(t("security.auditLog.title", "命令审计日志"))}</strong><span>${escapeHtml(t("security.auditLog.desc", "查看角色终端的高风险命令、确认状态和执行记录。"))}</span></div><button class="secondary-button" data-action="show-logs">${escapeHtml(t("security.auditLog.open", "打开日志"))}</button></div>`;
    }
    function renderStorageSettingsSection() {
      const info = getStorageInfo?.() || null;
      const operationStatus = getStorageOperationStatus?.() || null;
      const backups = info?.backups || [];
      const renderOperationStatus = operationStatus ? `<div class="model-connectivity-status ${operationStatus.ok ? "ready" : "missing"}" data-storage-operation-status><strong>${escapeHtml(operationStatus.title || (operationStatus.ok ? t("storage.operationComplete", "操作完成") : t("storage.operationFailed", "操作失败")))}</strong><span>${escapeHtml(operationStatus.message || "")}</span></div>` : "";
      return `<div class="settings-row"><div><strong>${escapeHtml(t("storage.sqlite.title", "SQLite 状态存储"))}</strong><span>${escapeHtml(info ? (info.sqliteEnabled ? t("storage.sqlite.enabled", "当前工作区状态已使用 SQLite 文件保存。") : info.sqliteReason) : t("storage.notRead", "尚未读取存储信息。"))}</span></div><button class="secondary-button" data-action="refresh-storage-info">${escapeHtml(t("common.refresh", "刷新"))}</button></div><div class="settings-status-slot storage-status-card" data-storage-info>${info ? `<strong>${escapeHtml(info.mode)} · Schema ${escapeHtml(info.schemaVersion)}</strong><span>${escapeHtml(t("storage.sqlite.path", "SQLite：{{path}} · {{size}} · {{time}}", { path: info.sqlitePath || t("storage.sqlite.disabled", "未启用"), size: formatFileSize(info.sqliteSize), time: formatDateTime(info.sqliteModifiedAt) }))}</span><span>${escapeHtml(t("storage.jsonSnapshot", "JSON 兼容快照：{{path}} · {{size}}", { path: info.statePath || "", size: formatFileSize(info.stateSize) }))}</span><span>${escapeHtml(t("storage.backupDir", "备份目录：{{path}} · {{count}} 个备份", { path: info.backupDirectory || "", count: info.backupCount || 0 }))}</span>` : escapeHtml(t("storage.clickRefresh", "点击刷新读取 SQLite、JSON 快照和备份信息。"))}</div>${renderOperationStatus}<div class="settings-row"><div><strong>${escapeHtml(t("storage.export.title", "导出状态数据"))}</strong><span>${escapeHtml(t("storage.export.desc", "导出当前 SQLite 中的工作区状态，便于迁移到其他机器或人工备份。"))}</span></div><button class="secondary-button" data-action="export-storage-state">${escapeHtml(t("storage.export.button", "导出"))}</button></div><div class="settings-row"><div><strong>${escapeHtml(t("storage.import.title", "导入状态数据"))}</strong><span>${escapeHtml(t("storage.import.desc", "导入前会自动创建备份，导入后会写入 SQLite 并刷新 JSON 兼容快照。"))}</span></div><button class="secondary-button" data-action="import-storage-state">${escapeHtml(t("storage.import.button", "导入"))}</button></div><div class="settings-row"><div><strong>${escapeHtml(t("storage.backup.title", "立即创建备份"))}</strong><span>${escapeHtml(t("storage.backup.desc", "把当前 SQLite 状态文件复制到备份目录，保留最近 12 个备份。"))}</span></div><button class="secondary-button" data-action="create-storage-backup">${escapeHtml(t("storage.backup.button", "创建备份"))}</button></div><div class="settings-row"><div><strong>${escapeHtml(t("storage.diagnostics.title", "导出诊断包"))}</strong><span>${escapeHtml(t("storage.diagnostics.desc", "包含存储摘要、脱敏状态快照和近期日志，用于排查异常恢复或协作问题。"))}</span></div><button class="secondary-button" data-action="export-diagnostics-package">${escapeHtml(t("storage.diagnostics.button", "导出诊断包"))}</button></div><div class="settings-row"><div><strong>${escapeHtml(t("storage.openDataDir.title", "打开数据目录"))}</strong><span>${escapeHtml(t("storage.openDataDir.desc", "查看 SQLite、JSON 快照、备份、诊断包和日志目录。"))}</span></div><button class="secondary-button" data-action="open-storage-directory">${escapeHtml(t("storage.openDataDir.button", "打开目录"))}</button></div><div class="storage-backup-list"><strong>${escapeHtml(t("storage.recentBackups", "最近备份"))}</strong>${backups.length ? backups.map((backup) => `<div class="storage-backup-item"><span>${escapeHtml(backup.name)}</span><em>${escapeHtml(backup.type)} · ${formatFileSize(backup.size)} · ${escapeHtml(formatDateTime(backup.createdAt))}</em></div>`).join("") : `<span class="muted-text">${escapeHtml(t("storage.noBackups", "暂无备份。"))}</span>`}</div>`;
    }
    return { getUserProfile, renderUserAvatar, renderAccountSettingsSection, renderHelpActionItem, renderHelpSettingsSection, renderMemorySettingsSection, renderSystemSettingsSection, renderMcpConfigStatusSection, renderAgentSettingsSection, renderSecuritySettingsSection, renderStorageSettingsSection };
  }
  global.COSS_SETTINGS_SECTION_VIEW = Object.freeze({ createSettingsSectionRenderer });
})(window);
