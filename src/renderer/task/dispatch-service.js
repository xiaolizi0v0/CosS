(function exposeDispatchService(global) {
  function createDispatchService({ getProject, repair, queue } = {}) {
    return {
      repairReady(reason = "dispatch-repair") {
        const project = getProject?.();
        return repair?.(project, reason) || Promise.resolve([]);
      },
      enqueue(messageIds = [], reason = "dispatch") {
        return queue?.(messageIds, reason) || [];
      }
    };
  }

  global.COSS_DISPATCH_SERVICE = Object.freeze({ createDispatchService });
})(window);
