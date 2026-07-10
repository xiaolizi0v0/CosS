(function exposeAppStore(global) {
  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function createAppStore(initialState, options = {}) {
    let current = initialState;
    const listeners = new Set();

    function notify(reason, previous) {
      listeners.forEach((listener) => {
        try {
          listener(current, { reason, previous });
        } catch (error) {
          options.onListenerError?.(error);
        }
      });
    }

    return {
      getState() {
        return current;
      },
      snapshot() {
        return clone(current);
      },
      replace(nextState, reason = "replace") {
        const previous = current;
        current = nextState;
        notify(reason, previous);
        return current;
      },
      update(updater, reason = "update") {
        const nextState = typeof updater === "function" ? updater(current) : updater;
        return this.replace(nextState, reason);
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      clear() {
        listeners.clear();
      }
    };
  }

  global.COSS_STORE = Object.freeze({ createAppStore });
})(window);
