(function exposeAppMenuActionService(global) {
  function createAppMenuActionService({
    showCreateProjectModal,
    showCreateTaskModal,
    setActiveSettingsSection,
    showSettingsModal,
    showAboutModal
  } = {}) {
    function handle(payload = {}) {
      const action = payload.action;
      if (action === "show-create-project") {
        showCreateProjectModal?.();
        return true;
      }
      if (action === "show-create-task") {
        showCreateTaskModal?.();
        return true;
      }
      if (action === "show-settings") {
        setActiveSettingsSection?.("system");
        showSettingsModal?.();
        return true;
      }
      if (action === "show-about") {
        showAboutModal?.();
        return true;
      }
      return false;
    }

    return { handle };
  }

  global.COSS_APP_MENU_ACTION_SERVICE = Object.freeze({ createAppMenuActionService });
})(window);
