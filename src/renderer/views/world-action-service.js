(function exposeWorldActionService(global) {
  function createWorldActionService({
    showWorldChatModal,
    updateWorldChatModal,
    showWorldTaskPublisherModal,
    showWorldAgentActionModal,
    setWorldTaskStatus,
    translate,
    publishWorldTask,
    createWorldAgent,
    showWorldList,
    getState,
    saveState,
    render,
    showCreateWorldModal,
    createWorldFromModal,
    selectWorld,
    showDeleteWorldModal,
    deleteWorld,
    chooseWorldDirectoryFromModal
  } = {}) {
    function handle(action, target) {
      if (action === "show-world-chat") {
        showWorldChatModal?.();
        return true;
      }
      if (action === "scroll-to-bottom") {
        const chatList = global.document?.querySelector(".world-chat-list");
        if (chatList) chatList.scrollTop = chatList.scrollHeight;
        global.document?.querySelector(".world-chat-new-msg")?.classList.remove("visible");
        return true;
      }
      if (action === "filter-task" || action === "filter-role") {
        const modal = global.document?.querySelector(".world-chat-modal");
        if (!modal) return true;
        modal.dataset[action === "filter-task" ? "filterTask" : "filterRole"] = target.value;
        updateWorldChatModal?.(modal.dataset.worldChatTaskId || "");
        return true;
      }
      if (action === "filter-mode") {
        const modal = global.document?.querySelector(".world-chat-modal");
        if (!modal) return true;
        const mode = target.dataset.mode;
        modal.dataset.filterMode = mode;
        modal.querySelectorAll(".world-chat-filter-btn").forEach((button) => {
          button.classList.toggle("active", button.dataset.mode === mode);
        });
        const filterExtras = modal.querySelector(".world-chat-filter-extras");
        if (filterExtras) filterExtras.style.display = mode === "history" ? "" : "none";
        updateWorldChatModal?.(modal.dataset.worldChatTaskId || "");
        return true;
      }
      if (action === "show-world-task-publisher") {
        showWorldTaskPublisherModal?.();
        return true;
      }
      if (action === "show-world-agent-actions") {
        showWorldAgentActionModal?.(target.dataset.roleId);
        return true;
      }
      if (action === "publish-world-task") {
        const goal = global.document?.getElementById("worldTaskGoal")?.value?.trim();
        if (!goal) {
          setWorldTaskStatus?.(translate?.("world.task.validation.empty", "请填写任务内容。") || "请填写任务内容。");
        } else {
          publishWorldTask?.(goal);
        }
        return true;
      }
      if (action === "create-world-agent") {
        if (target.dataset.roleId) {
          createWorldAgent?.(target.dataset.roleId, Number(target.dataset.x), Number(target.dataset.y));
        }
        return true;
      }
      if (action === "show-world-list") {
        showWorldList?.();
        return true;
      }
      if (action === "show-project-list") {
        const state = getState?.();
        if (state) state.activeSidebarSection = "projects";
        saveState?.();
        render?.();
        return true;
      }
      if (action === "show-create-world") {
        showCreateWorldModal?.();
        return true;
      }
      if (action === "create-world") {
        createWorldFromModal?.();
        return true;
      }
      if (action === "select-world") {
        selectWorld?.(target.dataset.worldId);
        return true;
      }
      if (action === "show-delete-world") {
        showDeleteWorldModal?.(target.dataset.worldId);
        return true;
      }
      if (action === "confirm-delete-world") {
        deleteWorld?.(target.dataset.worldId);
        return true;
      }
      if (action === "choose-world-directory") {
        chooseWorldDirectoryFromModal?.();
        return true;
      }
      return false;
    }

    return { handle };
  }

  global.COSS_WORLD_ACTION_SERVICE = Object.freeze({ createWorldActionService });
})(window);
