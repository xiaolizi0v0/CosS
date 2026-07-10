(function exposeTerminalView(global) {
  global.COSS_TERMINAL_VIEW = Object.freeze({
    id: "terminal",
    render: ({ renderTerminal } = {}) => renderTerminal?.() || "",
    mount: ({ mountTerminal } = {}) => mountTerminal?.(),
    unmount: ({ unmountTerminal } = {}) => unmountTerminal?.()
  });
})(window);
