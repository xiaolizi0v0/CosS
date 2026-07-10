(function exposeWindowManager(global) {
  function createWindowManager({ getProject, saveState, render } = {}) {
    return {
      focus(windowId) {
        const project = getProject?.();
        const target = project?.windows?.find((win) => win.id === windowId);
        if (!target) return null;
        const maxZ = Math.max(20, ...(project.windows || []).map((win) => Number(win.z) || 20));
        target.z = maxZ + 1;
        saveState?.();
        render?.();
        return target;
      }
    };
  }
  global.COSS_WINDOW_MANAGER = Object.freeze({ createWindowManager });
})(window);
