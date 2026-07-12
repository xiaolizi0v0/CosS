(function exposeSettingsActionService(global) {
  function createSettingsActionService({
    getState,
    getProject,
    saveState,
    render,
    recordLog,
    translate,
    closeMenus,
    showSettingsModal,
    refreshStorageInfo,
    runStorageOperation,
    api,
    ensureProjectMemoryShape,
    rebuildProjectMemory,
    createEmptyProjectMemory,
    getUserProfile,
    openProductUrl,
    showFeedbackModal,
    closeFeedbackModal,
    showMcpAuditModal,
    checkCurrentProjectMcpConfig,
    writeCurrentProjectMcpConfig,
    ensureAgentPromptMcpInstructions,
    ensureAgentPromptPermissionPlaceholders,
    getDefaultAgentPromptTemplate,
    settingsSections = [],
    languageOptions = [],
    setActiveSettingsSection,
    normalizeAgentProvider,
    normalizeAgentPermissionMode,
    getAgentPermissionPolicy,
    getMcpAuditFilters,
    setMcpAuditFilters,
    normalizeStoredWindowStacks,
    replaceAppState,
    productHelpUrl = "",
    normalizeModelProvider,
    getModelConfig,
    testModelConnectivity,
    setModelEditorProvider
  } = {}) {
    const t = translate || ((_key, fallback) => fallback || "");
    const documentRef = global.document;

    function state() {
      return getState?.() || {};
    }

    function showSection(section = "system") {
      const next = settingsSections.some((item) => item.id === section) ? section : "system";
      setActiveSettingsSection?.(next);
      showSettingsModal?.();
      return next;
    }

    function handle(action, target) {
      const current = state();
      if (action === "show-settings") {
        closeMenus?.();
        showSection("system");
        return true;
      }
      if (action === "open-agent-settings") {
        closeMenus?.();
        showSection("agent");
        checkCurrentProjectMcpConfig?.();
        return true;
      }
      if (action === "set-settings-section") {
        const section = showSection(target?.dataset?.section);
        if (section === "data") refreshStorageInfo?.();
        return true;
      }
      if (action === "refresh-storage-info") {
        refreshStorageInfo?.();
        return true;
      }
      if (action === "toggle-project-memory") {
        const project = getProject?.();
        if (project) {
          const memory = ensureProjectMemoryShape?.(project);
          memory.enabled = memory.enabled === false;
          memory.updatedAt = new Date().toISOString();
          memory.lastSource = "settings-toggle";
          recordLog?.("project.memory.toggled", { projectId: project.id, enabled: memory.enabled !== false });
          saveState?.();
        }
        showSettingsModal?.();
        return true;
      }
      if (action === "refresh-project-memory") {
        const project = getProject?.();
        if (project) {
          rebuildProjectMemory?.(project, "settings-refresh");
          recordLog?.("project.memory.refreshed", { projectId: project.id, taskCount: project.memory?.taskHistory?.length || 0, artifactCount: project.memory?.artifacts?.length || 0, decisionCount: project.memory?.decisions?.length || 0 });
          saveState?.();
        }
        showSettingsModal?.();
        return true;
      }
      if (action === "save-project-memory") {
        const project = getProject?.();
        if (project) {
          const memory = ensureProjectMemoryShape?.(project);
          memory.manualNotes = String(documentRef.getElementById("projectMemoryManualNotes")?.value || "").slice(0, 6000);
          rebuildProjectMemory?.(project, "settings-save");
          recordLog?.("project.memory.manual-notes.saved", { projectId: project.id, length: memory.manualNotes.length });
          saveState?.();
        }
        showSettingsModal?.();
        return true;
      }
      if (action === "clear-project-memory") {
        const project = getProject?.();
        if (project) {
          project.memory = createEmptyProjectMemory?.(true);
          project.memory.updatedAt = new Date().toISOString();
          project.memory.lastSource = "settings-clear";
          recordLog?.("project.memory.cleared", { projectId: project.id }, "warn");
          saveState?.();
        }
        showSettingsModal?.();
        return true;
      }
      if (action === "create-storage-backup") {
        runStorageOperation?.("创建备份", () => api?.createStorageBackup?.());
        return true;
      }
      if (action === "export-storage-state") {
        runStorageOperation?.("导出状态数据", () => api?.exportStorageState?.());
        return true;
      }
      if (action === "import-storage-state") {
        runStorageOperation?.("导入状态数据", async () => {
          const result = await api?.importStorageState?.();
          if (result?.ok) {
            const loaded = await api?.loadState?.();
            if (loaded?.projects?.length) {
              normalizeStoredWindowStacks?.(loaded);
              replaceAppState?.(loaded, "storage-import");
            }
          }
          return result;
        });
        return true;
      }
      if (action === "export-diagnostics-package") {
        runStorageOperation?.("导出诊断包", () => api?.exportDiagnosticsPackage?.());
        return true;
      }
      if (action === "open-storage-directory") {
        runStorageOperation?.("打开数据目录", () => api?.openStorageDirectory?.());
        return true;
      }
      if (action === "open-product-url") {
        openProductUrl?.(target?.dataset?.url || productHelpUrl);
        return true;
      }
      if (action === "show-feedback-modal") {
        showFeedbackModal?.();
        return true;
      }
      if (action === "close-feedback-modal") {
        closeFeedbackModal?.();
        return true;
      }
      if (action === "choose-feedback-images") {
        documentRef.getElementById("feedbackImageInput")?.click();
        return true;
      }
      if (action === "submit-feedback") {
        recordLog?.("help.feedback.submitted", {
          length: String(documentRef.getElementById("feedbackContent")?.value || "").length,
          imageCount: Math.min(documentRef.getElementById("feedbackImageInput")?.files?.length || 0, 4),
          uploadLogs: Boolean(documentRef.getElementById("feedbackUploadLogs")?.checked)
        });
        closeFeedbackModal?.();
        return true;
      }
      if (action === "choose-account-avatar") {
        documentRef.getElementById("accountAvatarInput")?.click();
        return true;
      }
      if (action === "clear-account-avatar") {
        const profile = getUserProfile?.();
        if (profile) profile.avatarDataUrl = "";
        saveState?.();
        render?.();
        showSettingsModal?.();
        return true;
      }
      if (action === "set-agent-provider") {
        current.settings.agentProvider = normalizeAgentProvider?.(target?.dataset?.provider);
        recordLog?.("settings.agent-provider.changed", { provider: current.settings.agentProvider });
        saveState?.();
        showSettingsModal?.();
        return true;
      }
      if (action === "set-agent-permission-mode") {
        current.settings.agentPermissionMode = normalizeAgentPermissionMode?.(target?.dataset?.permissionMode);
        const policy = getAgentPermissionPolicy?.();
        recordLog?.("settings.agent-permission.changed", { mode: policy?.id, label: policy?.label });
        saveState?.();
        showSettingsModal?.();
        return true;
      }
      if (action === "toggle-agent-fallback") {
        current.settings.agentFallbackToShell = current.settings.agentFallbackToShell === false;
        recordLog?.("settings.agent-fallback.changed", { enabled: current.settings.agentFallbackToShell !== false });
        saveState?.();
        showSettingsModal?.();
        return true;
      }
      if (action === "toggle-agent-mcp-auto-config") {
        current.settings.agentMcpAutoConfigEnabled = current.settings.agentMcpAutoConfigEnabled !== true;
        recordLog?.("settings.agent-mcp-auto-config.changed", { enabled: current.settings.agentMcpAutoConfigEnabled === true });
        saveState?.();
        showSettingsModal?.();
        return true;
      }
      if (action === "check-project-mcp-config") {
        checkCurrentProjectMcpConfig?.();
        return true;
      }
      if (action === "write-project-mcp-config") {
        writeCurrentProjectMcpConfig?.();
        return true;
      }
      if (action === "write-task-mcp-config") {
        Promise.resolve(writeCurrentProjectMcpConfig?.()).then(() => showSection("agent"));
        return true;
      }
      if (action === "show-mcp-audit") {
        showMcpAuditModal?.();
        return true;
      }
      if (action === "apply-mcp-audit-filters") {
        setMcpAuditFilters?.({
          roleId: documentRef.getElementById("mcpAuditRoleFilter")?.value || "",
          taskId: documentRef.getElementById("mcpAuditTaskFilter")?.value || "",
          tool: documentRef.getElementById("mcpAuditToolFilter")?.value || "",
          query: documentRef.getElementById("mcpAuditQueryFilter")?.value.trim() || ""
        });
        showMcpAuditModal?.();
        return true;
      }
      if (action === "reset-agent-prompt-template") {
        current.settings.agentPromptTemplate = ensureAgentPromptMcpInstructions?.(
          ensureAgentPromptPermissionPlaceholders?.(getDefaultAgentPromptTemplate?.())
        );
        recordLog?.("settings.agent-prompt-template.reset", { length: current.settings.agentPromptTemplate.length });
        saveState?.();
        showSettingsModal?.();
        return true;
      }
      if (action === "edit-model-provider") {
        const provider = normalizeModelProvider?.(target?.dataset?.provider);
        if (provider) {
          setModelEditorProvider?.(provider);
          render?.();
          showSettingsModal?.();
        }
        return true;
      }
      if (action === "set-model-provider") {
        const provider = normalizeModelProvider?.(target?.dataset?.provider);
        if (provider && getModelConfig?.(provider)) {
          current.settings.modelProvider = provider;
          recordLog?.("settings.model-provider.changed", { provider });
          saveState?.();
          showSettingsModal?.();
        }
        return true;
      }
      if (action === "test-model-connectivity") {
        const provider = normalizeModelProvider?.(target?.dataset?.provider);
        if (provider && typeof testModelConnectivity === "function") {
          testModelConnectivity(provider).catch((error) => {
            recordLog?.("model.connectivity.test.error", { provider, error: error.message }, "warn");
          });
          setTimeout(() => { render?.(); showSettingsModal?.(); }, 100);
        }
        return true;
      }
      return false;
    }

    return { handle };
  }

  global.COSS_SETTINGS_ACTION_SERVICE = Object.freeze({ createSettingsActionService });
})(window);
