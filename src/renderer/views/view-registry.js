(function exposeViewRegistry(global) {
  function createViewRegistry() {
    const views = new Map();
    return {
      register(id, view) { views.set(id, view); return view; },
      get(id) { return views.get(id) || null; },
      mount(id, container, context) { return views.get(id)?.mount?.(container, context); },
      unmount(id, context) { return views.get(id)?.unmount?.(context); },
      render(id, context) { return views.get(id)?.render?.(context) || ""; },
      ids() { return [...views.keys()]; }
    };
  }
  global.COSS_VIEW_REGISTRY = Object.freeze({ createViewRegistry });
})(window);
