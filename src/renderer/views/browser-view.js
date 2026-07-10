(function exposeBrowserView(global) {
  global.COSS_BROWSER_VIEW = Object.freeze({
    id: "browser",
    render: ({ renderBrowser } = {}) => renderBrowser?.() || "",
    mount: ({ mountBrowser } = {}) => mountBrowser?.(),
    unmount: ({ unmountBrowser } = {}) => unmountBrowser?.()
  });
})(window);
