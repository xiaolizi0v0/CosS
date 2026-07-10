(function exposeSettingsStatusView(global) {
  function createSettingsStatusRenderer({
    translate,
    escapeHtml,
    formatDateTime,
    normalizeAgentProvider,
    getAgentProviderLabel,
    getAgentLoginTestStatuses,
    getProjectCommandLogs,
    renderCommandStatus,
    getState,
    normalizeAgentPermissionMode,
    getModelConfig,
    getModelDisplayName,
    renderMaskedSecret,
    canUseModelProvider,
    normalizeModelProvider,
    getModelConnectivityStatuses,
    modelProviderPresets,
    getModelEditorProvider,
    getActiveModelConfig,
    getModelEndpointDisplay,
    getModelCredentialDisplay
  } = {}) {
    const t = translate || ((_key, fallback) => fallback || "");

    function renderAgentAuthLines(auth) {
      if (!auth) return "";
      const sourceLabels = {
        env: t("agentLogin.source.env", "环境变量"),
        config: t("agentLogin.source.config", "配置文件"),
        "config-present": t("agentLogin.source.configPresent", "配置文件存在但未发现登录凭据"),
        missing: t("agentLogin.source.missing", "未发现配置")
      };
      const credentialPath = auth.authPath || auth.configPath || "";
      const lines = [
        t("agentLogin.summary", "登录状态：{{status}} · {{source}}", { status: auth.loggedIn ? t("agentLogin.status.loggedIn", "已检测到登录凭据") : t("agentLogin.status.loggedOut", "未检测到登录凭据"), source: sourceLabels[auth.source] || auth.source || t("agentLogin.source.unknown", "未知来源") }),
        credentialPath ? t("agentLogin.credentialPath", "凭据路径：{{path}}", { path: credentialPath }) + (auth.configExists === false ? t("agentLogin.credentialPath.missing.suffix", "（不存在）") : "") : "",
        auth.homePath ? t("agentLogin.homePath", "主目录：{{path}}", { path: auth.homePath }) : "",
        Array.isArray(auth.envKeys) && auth.envKeys.length ? t("agentLogin.envKeys", "命中环境变量：{{keys}}", { keys: auth.envKeys.join(", ") }) : "",
        auth.configError ? t("agentLogin.configError", "配置读取错误：{{error}}", { error: auth.configError }) : ""
      ].filter(Boolean);
      return lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("");
    }

    function renderClaudeStatus(status) {
      if (!status) return `<div class="claude-status empty" data-claude-status>${escapeHtml(t("claudeCode.notTested", "尚未检测 Claude Code 环境。"))}</div>`;
      const headline = status.installed ? t("claudeCode.available", "Claude Code 已可用") : t("claudeCode.notFound", "未检测到 Claude Code");
      const detail = status.installed ? (status.version || status.versionError || t("claudeCode.versionPresent", "claude 命令存在，但未返回版本信息。")) : `${status.autoInstallDisabled ? t("claudeCode.autoInstall.off", "当前环境已关闭自动安装。") : t("claudeCode.autoInstall.on", "创建 Claude Code 角色终端时会尝试自动安装。")} ${t("claudeCode.recommended", "推荐命令：{{command}}", { command: status.installCommand })}`;
      return `<div class="claude-status ${status.installed ? "ready" : "missing"}" data-claude-status><strong>${escapeHtml(headline)}</strong><span>${escapeHtml(t("claudeCode.command", "命令：{{command}}", { command: status.command }))}</span><span>${escapeHtml(detail)}</span>${renderAgentAuthLines(status.auth)}<span>${escapeHtml(t("claudeCode.checkedAt", "检测时间：{{time}}", { time: formatDateTime(status.checkedAt) }))}</span></div>`;
    }

    function renderCodexStatus(status) {
      if (!status) return `<div class="claude-status empty" data-codex-status>${escapeHtml(t("codex.notTested", "尚未检测 Codex CLI 环境。"))}</div>`;
      const headline = status.runnable ? t("codex.available", "Codex CLI 已可用") : t("codex.notFound", "未检测到可运行的 Codex CLI");
      const npmDetail = status.npm?.usable ? t("codex.npm.ok", "npm 可用：{{version}}（{{command}}）", { version: status.npm.version || t("model.secret.masked", "已检测"), command: status.npm.command || "npm" }) : t("codex.npm.fail", "npm 不可用：{{error}}", { error: status.npm?.errorDetail || t("model.secret.empty", "未返回版本信息") });
      const npmCandidates = status.npm?.candidates?.length ? t("codex.npm.candidates", "npm 候选：{{candidates}}", { candidates: status.npm.candidates.join(" | ") }) : "";
      const lookupDetail = status.lookupPaths?.length ? t("codex.path.hit", "PATH 命中：{{paths}}", { paths: status.lookupPaths.join(" | ") }) : t("codex.path.miss", "PATH 未命中 codex。");
      const detail = status.runnable ? (status.version || t("codex.versionPresent", "codex 命令存在，但未返回版本信息。")) : `${status.autoInstallDisabled ? t("codex.autoInstall.off", "当前已关闭 Codex 自动安装。") : t("codex.autoInstall.on", "创建 Codex Agent 时会尝试自动安装。")} ${t("codex.recommended", "推荐命令：{{command}}", { command: status.installCommand })}`;
      return `<div class="claude-status ${status.runnable ? "ready" : "missing"}" data-codex-status><strong>${escapeHtml(headline)}</strong><span>${escapeHtml(t("codex.command", "命令：{{command}}", { command: status.command || "codex" }))}</span><span>${escapeHtml(detail)}</span><span>${escapeHtml(npmDetail)}</span>${npmCandidates ? `<span>${escapeHtml(npmCandidates)}</span>` : ""}<span>${escapeHtml(lookupDetail)}</span>${status.hasWindowsAppsPackagePath ? `<span>${escapeHtml(t("codex.windowsApps", "检测到 WindowsApps 中的 OpenAI Codex 应用包路径，它可能不能作为 CLI 直接启动。"))}</span>` : ""}${status.errorDetail ? `<span>${escapeHtml(t("common.error", "错误：{{error}}", { error: status.errorDetail }))}</span>` : ""}${renderAgentAuthLines(status.auth)}<span>${escapeHtml(t("codex.checkedAt", "检测时间：{{time}}", { time: formatDateTime(status.checkedAt) }))}</span></div>`;
    }

    function renderCodeBuddyStatus(status) {
      if (!status) return `<div class="claude-status empty" data-codebuddy-status>${escapeHtml(t("codeBuddy.notTested", "尚未检测 CodeBuddy Code CLI 环境。"))}</div>`;
      const headline = status.runnable ? t("codeBuddy.available", "CodeBuddy Code CLI 已可用") : t("codeBuddy.notFound", "未检测到可运行的 CodeBuddy Code CLI");
      const npmDetail = status.npm?.usable ? t("codeBuddy.npm.ok", "npm 可用：{{version}}（{{command}}）", { version: status.npm.version || t("model.secret.masked", "已检测"), command: status.npm.command || "npm" }) : t("codeBuddy.npm.fail", "npm 不可用：{{error}}", { error: status.npm?.errorDetail || t("model.secret.empty", "未返回版本信息") });
      const npmCandidates = status.npm?.candidates?.length ? t("codeBuddy.npm.candidates", "npm 候选：{{candidates}}", { candidates: status.npm.candidates.join(" | ") }) : "";
      const lookupDetail = status.lookupPaths?.length ? t("codeBuddy.path.hit", "PATH 命中：{{paths}}", { paths: status.lookupPaths.join(" | ") }) : t("codeBuddy.path.miss", "PATH 未命中 codebuddy 或 cbc。");
      const detail = status.runnable ? (status.version || t("codeBuddy.versionPresent", "codebuddy 命令存在，但未返回版本信息。")) : `${status.autoInstallDisabled ? t("codeBuddy.autoInstall.off", "当前已关闭 CodeBuddy Code 自动安装。") : t("codeBuddy.autoInstall.on", "创建 CodeBuddy Agent 时会尝试自动安装。")} ${t("codeBuddy.recommended", "推荐命令：{{command}}", { command: status.installCommand })}`;
      return `<div class="claude-status ${status.runnable ? "ready" : "missing"}" data-codebuddy-status><strong>${escapeHtml(headline)}</strong><span>${escapeHtml(t("codeBuddy.command", "命令：{{command}}", { command: status.command || "codebuddy" }))}</span><span>${escapeHtml(detail)}</span><span>${escapeHtml(npmDetail)}</span>${npmCandidates ? `<span>${escapeHtml(npmCandidates)}</span>` : ""}<span>${escapeHtml(lookupDetail)}</span>${status.errorDetail ? `<span>${escapeHtml(t("common.error", "错误：{{error}}", { error: status.errorDetail }))}</span>` : ""}${renderAgentAuthLines(status.auth)}<span>${escapeHtml(t("codeBuddy.checkedAt", "检测时间：{{time}}", { time: formatDateTime(status.checkedAt) }))}</span></div>`;
    }

    function renderAgentLoginTestStatus(provider) {
      const normalized = normalizeAgentProvider(provider);
      const status = getAgentLoginTestStatuses?.()[normalized];
      const attr = `data-agent-login-status="${escapeHtml(normalized)}"`;
      if (!status) return `<div class="model-connectivity-status idle" ${attr}>${escapeHtml(t("agentLogin.notTested", "尚未测试 {{provider}} 远程登录态。", { provider: getAgentProviderLabel(normalized) }))}</div>`;
      if (status.state === "testing") return `<div class="model-connectivity-status testing" ${attr}>${escapeHtml(t("agentLogin.testing", "正在测试远程登录态..."))}</div>`;
      if (status.ok) return `<div class="model-connectivity-status ready" ${attr}><strong>${escapeHtml(t("agentLogin.ok", "远程登录态可用"))}</strong><span>${escapeHtml(status.message || t("agentLogin.ok.default", "远程 API 校验通过。"))} · ${escapeHtml(formatDateTime(status.checkedAt))}</span></div>`;
      return `<div class="model-connectivity-status missing" ${attr}><strong>${escapeHtml(status.skipped ? t("agentLogin.skipped", "远程登录态未测试") : t("agentLogin.failed", "远程登录态不可用"))}</strong><span>${escapeHtml(status.message || status.error || t("agentLogin.failed.default", "远程 API 校验失败。"))}${status.checkedAt ? ` · ${escapeHtml(formatDateTime(status.checkedAt))}` : ""}</span></div>`;
    }

    function renderLogRows() {
      const logs = getProjectCommandLogs?.().slice(0, 60) || [];
      if (logs.length === 0) return `<div class="empty-log">${escapeHtml(t("commandAudit.empty", "暂无命令日志。角色终端执行命令后会在这里记录。"))}</div>`;
      return logs.map((log) => `<div class="log-item"><div class="log-item-main"><strong>${escapeHtml(log.command)}</strong><span>${escapeHtml(log.roleName)} · ${escapeHtml(log.riskLabel)} · ${escapeHtml(formatDateTime(log.createdAt))}</span></div><span class="status-chip ${escapeHtml(log.status)}">${escapeHtml(renderCommandStatus(log.status))}</span></div>`).join("");
    }

    function renderAgentProviderOption(value, label, description) {
      const state = getState?.() || {};
      return `<button class="agent-provider-option ${state.settings?.agentProvider === value ? "active" : ""}" data-action="set-agent-provider" data-provider="${value}"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(description)}</span></button>`;
    }
    function renderAgentPermissionOption(policy) {
      const state = getState?.() || {};
      const active = normalizeAgentPermissionMode(state.settings?.agentPermissionMode) === policy.id;
      return `<button class="permission-policy-option ${active ? "active" : ""}" data-action="set-agent-permission-mode" data-permission-mode="${escapeHtml(policy.id)}"><strong>${escapeHtml(policy.label)}</strong><span>${escapeHtml(policy.description)}</span></button>`;
    }
    function renderModelProviderOption(provider) {
      const state = getState?.() || {};
      const config = getModelConfig(provider);
      const active = state.settings?.modelProvider === config.id;
      const editing = getModelEditorProvider?.() === config.id;
      const usable = canUseModelProvider(config.id);
      const apiKey = config.locked ? escapeHtml(t("model.noApiKey", "无需 API key")) : config.apiKeyRequired ? `${escapeHtml(t("model.field.apiKey", "API key"))}：${escapeHtml(renderMaskedSecret(config.apiKey))}` : `${escapeHtml(t("model.field.apiKey", "API key"))}：${config.apiKey ? escapeHtml(renderMaskedSecret(config.apiKey)) : escapeHtml(t("common.optional", "可选"))}`;
      return `<button class="model-provider-option ${active ? "active" : ""} ${editing ? "editing" : ""}" data-action="edit-model-provider" data-provider="${config.id}"><strong>${escapeHtml(config.label)}</strong><span>${escapeHtml(getModelDisplayName(config))}</span><small>${apiKey}</small><em>${active ? escapeHtml(t("model.currentlyUsed", "当前使用")) : usable ? escapeHtml(t("model.switchable", "可切换")) : escapeHtml(t("model.needApiKey", "需填写 API key"))}</em></button>`;
    }
    function renderModelConnectivityStatus(provider) {
      const id = normalizeModelProvider(provider);
      const status = getModelConnectivityStatuses?.()[id];
      if (!status) return `<div class="model-connectivity-status idle" data-model-connectivity-status="${escapeHtml(id)}">${escapeHtml(t("model.connectivity.idle", "尚未测试连通性。"))}</div>`;
      if (status.state === "testing") return `<div class="model-connectivity-status testing" data-model-connectivity-status="${escapeHtml(id)}">${escapeHtml(t("model.connectivity.testing", "正在测试连通性..."))}</div>`;
      if (status.ok) {
        const latencyText = Number.isFinite(status.latencyMs) ? ` · ${status.latencyMs}ms` : "";
        return `<div class="model-connectivity-status ready" data-model-connectivity-status="${escapeHtml(id)}"><strong>${escapeHtml(t("model.connectivity.ok", "连通性正常"))}</strong><span>${escapeHtml(status.modelName || "")}${latencyText} · ${escapeHtml(formatDateTime(status.checkedAt))}</span></div>`;
      }
      return `<div class="model-connectivity-status missing" data-model-connectivity-status="${escapeHtml(id)}"><strong>${escapeHtml(t("model.connectivity.failed", "连通性失败"))}</strong><span>${escapeHtml(status.error || t("model.connectivity.unavailable", "模型接口不可用。"))}${status.checkedAt ? ` · ${escapeHtml(formatDateTime(status.checkedAt))}` : ""}</span></div>`;
    }

    function renderModelSettingsSection() {
      const state = getState?.() || {};
      const activeModel = getActiveModelConfig();
      const editingModel = getModelConfig(getModelEditorProvider?.());
      const canActivateEditingModel = canUseModelProvider(editingModel.id);
      const modelConfigMissingReason = !String(editingModel.baseUrl || "").trim() || !String(editingModel.modelName || "").trim() ? t("model.config.needBaseUrl", "该模型需要先填写 Base URL 和模型名称，才允许切换为当前模型。") : t("model.config.needApiKey", "该模型需要先填写 API key，才允许切换为当前模型。");
      const modelFieldReadonly = editingModel.locked ? "readonly" : "";
      const apiKeyPlaceholder = editingModel.apiKeyRequired ? t("model.apiKey.placeholder.required", "填写后才可以切换到该模型") : t("model.apiKey.placeholder.optional", "可选，按模型服务要求填写");
      const apiKeyField = editingModel.locked ? `<div class="field"><label>API Key</label><input value="${escapeHtml(t("model.apiKey.noKey", "该模型无需 API key"))}" readonly /></div>` : `<div class="field"><label for="modelApiKey">API Key</label><input id="modelApiKey" type="password" autocomplete="off" placeholder="${escapeHtml(apiKeyPlaceholder)}" value="${escapeHtml(editingModel.apiKey)}" data-model-provider="${editingModel.id}" data-model-field="apiKey" /></div>`;
      return `<div class="settings-section-title"><strong>${escapeHtml(t("model.config.title", "模型配置"))}</strong><span>${escapeHtml(t("model.config.desc", "可填写用户自定义模型服务，也可以切换到下方预设模型。"))}</span></div><div class="settings-row"><div><strong>${escapeHtml(t("model.current.title", "当前模型"))}</strong><span>${escapeHtml(activeModel.label)} · ${escapeHtml(getModelEndpointDisplay(activeModel))} · ${escapeHtml(getModelDisplayName(activeModel))} · ${escapeHtml(getModelCredentialDisplay(activeModel))}</span></div><span class="settings-value">${escapeHtml(getModelDisplayName(activeModel))}</span></div><div class="model-provider-grid">${Object.keys(modelProviderPresets || {}).map(renderModelProviderOption).join("")}</div><div class="model-config-panel"><div class="model-config-heading"><div><strong>${escapeHtml(editingModel.label)}</strong><span>${escapeHtml(editingModel.description)}</span></div><div class="model-config-actions"><button class="secondary-button" data-action="test-model-connectivity" data-provider="${editingModel.id}">${escapeHtml(t("model.action.test", "测试连通性"))}</button><button class="primary-button" data-action="set-model-provider" data-provider="${editingModel.id}">${escapeHtml(state.settings?.modelProvider === editingModel.id ? t("model.current.title", "当前模型") : t("model.action.set", "设为当前模型"))}</button></div></div><div class="model-config-grid"><div class="field"><label for="modelBaseUrl">Base URL</label><input id="modelBaseUrl" value="${escapeHtml(getModelEndpointDisplay(editingModel))}" ${modelFieldReadonly} data-model-provider="${editingModel.id}" data-model-field="baseUrl" /></div><div class="field"><label for="modelName">${escapeHtml(t("model.field.modelName", "模型名称"))}</label><input id="modelName" value="${escapeHtml(getModelDisplayName(editingModel))}" ${modelFieldReadonly} data-model-provider="${editingModel.id}" data-model-field="modelName" /></div>${apiKeyField}</div><div class="model-config-note ${canActivateEditingModel ? "ready" : "missing"}">${canActivateEditingModel ? escapeHtml(t("model.config.canActivate", "该模型配置可以切换使用。")) : escapeHtml(modelConfigMissingReason)}</div>${renderModelConnectivityStatus(editingModel.id)}</div>`;
    }

    return { renderAgentAuthLines, renderClaudeStatus, renderCodexStatus, renderCodeBuddyStatus, renderAgentLoginTestStatus, renderLogRows, renderAgentProviderOption, renderAgentPermissionOption, renderModelProviderOption, renderModelConnectivityStatus, renderModelSettingsSection };
  }
  global.COSS_SETTINGS_STATUS_VIEW = Object.freeze({ createSettingsStatusRenderer });
})(window);
