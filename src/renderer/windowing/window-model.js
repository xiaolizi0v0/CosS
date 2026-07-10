(function exposeWindowModel(global) {
  function normalizeWindow(win = {}) {
    return {
      ...win,
      id: String(win.id || ""),
      type: String(win.type || "terminal"),
      roleId: String(win.roleId || ""),
      minimized: Boolean(win.minimized),
      maximized: Boolean(win.maximized),
      z: Number.isFinite(Number(win.z)) ? Number(win.z) : 20,
      desktopId: String(win.desktopId || "desktop-main")
    };
  }
  global.COSS_WINDOW_MODEL = Object.freeze({ normalizeWindow });
})(window);
