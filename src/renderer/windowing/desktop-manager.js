(function exposeDesktopManager(global) {
  function createDesktopManager({ getProject, saveState, render } = {}) {
    return {
      switchTo(desktopId) {
        const project = getProject?.();
        if (!project?.desktops?.some((desktop) => desktop.id === desktopId)) return false;
        project.activeDesktopId = desktopId;
        saveState?.();
        render?.();
        return true;
      }
    };
  }
  global.COSS_DESKTOP_MANAGER = Object.freeze({ createDesktopManager });
})(window);
