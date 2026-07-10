(function exposeStateNormalizer(global) {
  function createStateNormalizer({
    ensureWorldShape,
    ensureProjectShape,
    ensureAgentPrompt,
    ensureModelSettings,
    normalizeAgentProvider,
    normalizeAgentPermissionMode,
    languageOptions,
    defaultLanguage,
    defaultState
  } = {}) {
    return {
      normalize(nextState = {}) {
        nextState.worlds = (Array.isArray(nextState.worlds) ? nextState.worlds : [])
          .map(ensureWorldShape).filter(Boolean);
        nextState.activeWorldId = typeof nextState.activeWorldId === "string" ? nextState.activeWorldId : "";
        nextState.activeSidebarSection = ["worlds", "projects"].includes(nextState.activeSidebarSection)
          ? nextState.activeSidebarSection : "projects";
        nextState.deletedProjectIds = [...new Set((nextState.deletedProjectIds || [])
          .map((value) => String(value || "").trim()).filter(Boolean))];
        nextState.settings = nextState.settings || {};
        nextState.settings.agentProvider = normalizeAgentProvider(nextState.settings.agentProvider);
        nextState.settings.agentFallbackToShell = nextState.settings.agentFallbackToShell !== false;
        nextState.settings.agentPermissionMode = normalizeAgentPermissionMode(nextState.settings.agentPermissionMode);
        nextState.settings.agentAutoWorkflowEnabled = nextState.settings.agentAutoWorkflowEnabled !== false;
        nextState.settings.agentAutoWorkflowPaused = nextState.settings.agentAutoWorkflowPaused === true;
        nextState.settings.agentMcpAutoConfigEnabled = nextState.settings.agentMcpAutoConfigEnabled === true;
        if (!nextState.settings.agentAutoWorkflowEnabled) nextState.settings.agentAutoWorkflowPaused = false;
        nextState.settings.codeBuddyApiKey ||= "";
        nextState.settings.language = languageOptions.some((item) => item.id === nextState.settings.language)
          ? nextState.settings.language : defaultLanguage;
        nextState.settings.userProfile = {
          displayName: String(nextState.settings.userProfile?.displayName || "本地用户").trim().slice(0, 32) || "本地用户",
          avatarDataUrl: String(nextState.settings.userProfile?.avatarDataUrl || "")
        };
        nextState.settings.agentPromptTemplate = ensureAgentPrompt(
          nextState.settings.agentPromptTemplate || defaultState.settings.agentPromptTemplate
        );
        ensureModelSettings(nextState.settings);
        (nextState.projects || []).forEach(ensureProjectShape);
        return nextState;
      }
    };
  }

  global.COSS_STATE_NORMALIZER = Object.freeze({ createStateNormalizer });
})(window);
