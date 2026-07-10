(function exposeDeliveryQueue(global) {
  function createDeliveryQueue({ drain, onError } = {}) {
    const queued = new Map();
    const active = new Set();
    async function run(id) {
      if (active.has(id)) return;
      active.add(id);
      try { await drain?.(id); } catch (error) { onError?.(error, id); }
      finally { active.delete(id); queued.delete(id); }
    }
    return {
      enqueue(id) { if (!id) return; queued.set(id, true); void run(id); },
      has(id) { return queued.has(id) || active.has(id); },
      clear() { queued.clear(); active.clear(); }
    };
  }
  global.COSS_DELIVERY_QUEUE = Object.freeze({ createDeliveryQueue });
})(window);
