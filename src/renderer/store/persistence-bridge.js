(function exposePersistenceBridge(global) {
  function createSaveQueue({ snapshot, write, onError, onIdle } = {}) {
    let dirty = false;
    let inFlight = false;
    let promise = Promise.resolve();

    const queue = {
      get isDirty() { return dirty; },
      get isInFlight() { return inFlight; },
      enqueue() {
        dirty = true;
        if (inFlight) return promise;
        inFlight = true;
        promise = (async () => {
          while (dirty) {
            dirty = false;
            await write(snapshot());
          }
        })().catch((error) => {
          onError?.(error);
        }).finally(() => {
          inFlight = false;
          onIdle?.({ dirty, inFlight });
        });
        return promise;
      }
    };
    return queue;
  }

  function createStampTracker(initialValue = "") {
    let stamp = initialValue;
    return {
      get() { return stamp; },
      set(value) { stamp = String(value || ""); return stamp; },
      matches(value) { return stamp === String(value || ""); }
    };
  }

  function createPersistenceController({
    api = global.cossAPI,
    getState,
    setState,
    normalizeStoredState,
    createProjectState,
    createWindowState,
    createMessage,
    getDefaultState,
    reconcileExternalState,
    repairReadyState,
    render,
    resumePending,
    recordLog
  } = {}) {
    const tracker = createStampTracker();
    let externalTimer = null;
    let pendingReason = "";
    let controller;

    async function refreshStamp() {
      if (!api?.getStateMeta) return tracker.get();
      try {
        const meta = await api.getStateMeta();
        return tracker.set(meta?.stamp || "");
      } catch {
        return tracker.get();
      }
    }

    const queue = createSaveQueue({
      snapshot: () => structuredClone(getState()),
      write: async (snapshot) => {
        if (api?.saveState) {
          await api.saveState(snapshot);
          await refreshStamp();
        } else {
          localStorage.setItem("coss-state", JSON.stringify(snapshot));
        }
      },
      onError: (error) => console.warn("Failed to save CosS state", error),
      onIdle: () => {
        if (!pendingReason) return;
        const reason = pendingReason;
        pendingReason = "";
        setTimeout(() => controller.refreshExternal(reason).catch((error) => {
          recordLog?.("state.external-refresh-after-save.error", { reason, error: error.message }, "error");
        }), 0);
      }
    });

    async function saveState() {
      return queue.enqueue();
    }

    async function loadState() {
      const stored = api?.loadState
        ? await api.loadState()
        : JSON.parse(localStorage.getItem("coss-state") || "null");
      if (stored && (stored.projects?.length || stored.worlds?.length || stored.blueprints?.length)) {
        normalizeStoredState(stored);
        stored.worlds = Array.isArray(stored.worlds) ? stored.worlds : [];
        setState(stored, "state-load");
        refreshStamp().catch(() => {});
        return;
      }

      const demo = createProjectState("AI 协作工作台", "D:\\CosS");
      demo.windows = [
        createWindowState("terminal", "frontend-engineer", 310, 96, { terminalMode: "shell" }),
        createWindowState("browser", "qa-engineer", 795, 126)
      ];
      demo.messages = [createMessage("frontend-engineer", ["backend-engineer", "qa-engineer"], "前端页面等待接口字段确认。")];
      setState({
        activeProjectId: demo.id,
        projects: [demo],
        activeWorldId: "",
        activeBlueprintId: "",
        activeSidebarSection: "projects",
        worlds: [],
        blueprints: [],
        deletedProjectIds: [],
        settings: { ...getDefaultState().settings }
      }, "demo-state");
      await saveState();
      await refreshStamp();
    }

    async function refreshExternal(reason = "external") {
      if (!api?.loadState || queue.isInFlight || queue.isDirty) return false;
      const previousState = getState();
      const loaded = await api.loadState();
      if (!loaded || !(loaded.projects?.length || loaded.worlds?.length || loaded.blueprints?.length)) return false;
      normalizeStoredState(loaded);
      setState(loaded, `external-state:${reason}`);
      await refreshStamp();
      reconcileExternalState?.(previousState, loaded, reason);
      await repairReadyState?.(`external:${reason}`);
      recordLog?.("state.external-refreshed", { reason, projects: loaded.projects.length });
      render?.();
      setTimeout(() => resumePending?.(`external:${reason}`), 350);
      return true;
    }

    function startExternalRefresh() {
      if (externalTimer || !api?.getStateMeta || !api?.loadState) return;
      externalTimer = setInterval(async () => {
        try {
          const meta = await api.getStateMeta();
          const nextStamp = meta?.stamp || "";
          const currentStamp = tracker.get();
          if (nextStamp && currentStamp && nextStamp !== currentStamp) {
            if (queue.isInFlight || queue.isDirty) {
              pendingReason ||= "storage-stamp-changed-during-save";
              return;
            }
            await refreshExternal("storage-stamp-changed");
          } else if (nextStamp && !currentStamp) {
            tracker.set(nextStamp);
            if (!queue.isInFlight && !queue.isDirty) await refreshExternal("storage-stamp-initialized");
          }
        } catch {
          // External refresh is best-effort.
        }
      }, 1500);
    }

    controller = { queue, saveState, loadState, refreshStamp, refreshExternal, startExternalRefresh };
    return controller;
  }

  global.COSS_PERSISTENCE = Object.freeze({ createSaveQueue, createStampTracker, createPersistenceController });
})(window);
