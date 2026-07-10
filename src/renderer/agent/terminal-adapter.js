(function exposeTerminalAdapter(global) {
  function createTerminalAdapter(api = global.cossAPI) {
    return {
      create: (options) => api?.createTerminal?.(options),
      input: (id, data, options) => api?.sendTerminalInput?.(id, data, options),
      resize: (id, cols, rows) => api?.resizeTerminal?.(id, cols, rows),
      dispose: (id) => api?.disposeTerminal?.(id)
    };
  }
  global.COSS_TERMINAL_ADAPTER = Object.freeze({ createTerminalAdapter });
})(window);
