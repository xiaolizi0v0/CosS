(function exposeOutputTracker(global) {
  function createOutputTracker(limit = 120) {
    const refs = new Map();
    return {
      record(windowId, output) {
        const list = refs.get(windowId) || [];
        list.push({ windowId, output: String(output || ""), createdAt: new Date().toISOString() });
        refs.set(windowId, list.slice(-limit));
      },
      recent(windowId) { return refs.get(windowId) || []; },
      clear(windowId) { refs.delete(windowId); }
    };
  }
  global.COSS_OUTPUT_TRACKER = Object.freeze({ createOutputTracker });
})(window);
