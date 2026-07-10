(function exposeAgentService(global) {
  function createAgentService({ getProject, render, saveState, createWindow } = {}) {
    return {
      ensureWindow(roleId, options = {}) {
        const project = getProject?.();
        if (!project || !roleId) return null;
        const existing = (project.windows || []).find((win) => win.type === "terminal" && win.roleId === roleId && !win.minimized);
        if (existing) return existing;
        const windowState = createWindow?.("terminal", roleId, options) || null;
        if (windowState) {
          project.windows ||= [];
          project.windows.push(windowState);
          saveState?.();
          render?.();
        }
        return windowState;
      }
    };
  }

  global.COSS_AGENT_SERVICE = Object.freeze({ createAgentService });
})(window);
