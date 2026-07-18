(function exposeInteractionService(global) {
  function createInteractionService({
    getState,
    saveState,
    updatePendingTaskPlanField,
    getMessageTimelineFilters,
    setMessageTimelineFilters,
    refreshMessageTimelineList,
    setMessageTimelineScrollLeft,
    getGlobalSearchQuery,
    setGlobalSearchQuery,
    refreshGlobalSearchResults,
    getTaskListFilters,
    setTaskListFilters,
    setSelectedTaskListTaskId,
    render,
    syncLanguage,
    updateFeedbackCounters,
    updateAccountDisplayName,
    updateAccountAvatarFromFile,
    showSettingsModal,
    setAgentPromptTemplate,
    setCodeBuddyApiKey,
    normalizeModelProvider,
    updateModelConfigField,
    renderModelConnectivityStatus,
    getWindowState,
    syncFileEditorChrome,
    getMessageComposerDefaults,
    setMessageComposerDefaults,
    showMessageCenterModal,
    languageOptions = [],
    getTaskRoleFilter,
    setTaskRoleFilter,
    openContextMenu,
    showSearchModal,
    openSearchResult,
    navigateBrowserWindow,
    saveFileFromWindow,
    hasPendingCommandApproval,
    rejectPendingCommand,
    closeMenus,
    closeModal,
    setActivePopoverWindowId,
    updateWorldChatModal
  } = {}) {
    const ElementCtor = global.Element;
    const getElementTarget = (event) => event.target instanceof ElementCtor ? event.target : null;
    const closest = (event, selector) => getElementTarget(event)?.closest(selector) || null;

    function bind(documentRef = global.document) {
      documentRef.addEventListener("input", (event) => {
        const inputTarget = getElementTarget(event);
        const planField = inputTarget?.closest("[data-plan-field]");
        if (planField) {
          updatePendingTaskPlanField?.(Number(planField.dataset.planIndex), planField.dataset.planField, planField.value);
          return;
        }
        if (inputTarget?.id === "messageTimelineSearch") {
          setMessageTimelineFilters?.({ ...(getMessageTimelineFilters?.() || {}), query: inputTarget.value });
          refreshMessageTimelineList?.();
          return;
        }
        if (inputTarget?.id === "globalSearchInput") {
          setGlobalSearchQuery?.(inputTarget.value);
          refreshGlobalSearchResults?.();
          return;
        }
        if (inputTarget?.id === "taskListSearch") {
          setTaskListFilters?.({ ...(getTaskListFilters?.() || {}), query: inputTarget.value });
          setSelectedTaskListTaskId?.("");
          render?.();
          return;
        }
        if (inputTarget?.id === "feedbackContent") {
          updateFeedbackCounters?.();
          return;
        }
        if (inputTarget?.id === "accountDisplayName") {
          updateAccountDisplayName?.(inputTarget.value);
          return;
        }
        const agentPromptTemplate = closest(event, "[data-agent-prompt-template]");
        if (agentPromptTemplate) {
          setAgentPromptTemplate?.(agentPromptTemplate.value);
          saveState?.();
          return;
        }
        const codeBuddyApiKey = closest(event, "[data-codebuddy-api-key]");
        if (codeBuddyApiKey) {
          setCodeBuddyApiKey?.(codeBuddyApiKey.value);
          saveState?.();
          return;
        }
        const modelField = closest(event, "[data-model-field]");
        if (modelField) {
          const provider = normalizeModelProvider?.(modelField.dataset.modelProvider);
          updateModelConfigField?.(provider, modelField.dataset.modelField, modelField.value);
          const statusMount = documentRef.querySelector(`[data-model-connectivity-status="${provider}"]`);
          if (statusMount) statusMount.outerHTML = renderModelConnectivityStatus?.(provider) || "";
          return;
        }
        const fileEditor = closest(event, "[data-file-editor]");
        if (fileEditor) {
          const win = getWindowState?.(fileEditor.dataset.fileEditor);
          if (win) {
            win.fileDraft = fileEditor.value;
            win.fileDirty = true;
            win.fileError = "";
            win.fileStatus = win.filePath ? `正在编辑 ${win.filePath}，尚未保存。` : "正在编辑新文件，尚未保存。";
            const status = documentRef.querySelector(`[data-file-status="${global.CSS.escape(win.id)}"]`);
            if (status) {
              status.textContent = win.fileStatus;
              status.classList.remove("error");
            }
            syncFileEditorChrome?.(win.id);
          }
        }
      });

      documentRef.addEventListener("scroll", (event) => {
        const fileEditor = closest(event, "[data-file-editor]");
        if (fileEditor) {
          const lines = documentRef.querySelector(`[data-file-lines="${global.CSS.escape(fileEditor.dataset.fileEditor)}"]`);
          if (lines) lines.scrollTop = fileEditor.scrollTop;
        }
        const scroller = closest(event, ".message-timeline-scroll");
        if (scroller) setMessageTimelineScrollLeft?.(scroller.scrollLeft);
      }, true);

      documentRef.addEventListener("change", (event) => {
        const target = getElementTarget(event);
        if (!target) return;
        if (target.id === "feedbackImageInput") {
          updateFeedbackCounters?.();
          return;
        }
        if (target.id === "accountAvatarInput") {
          updateAccountAvatarFromFile?.(target.files?.[0]);
          return;
        }
        const planField = target.closest("[data-plan-field]");
        if (planField) {
          updatePendingTaskPlanField?.(Number(planField.dataset.planIndex), planField.dataset.planField, planField.value);
          return;
        }
        if (target.id === "messageFromRole") {
          setMessageComposerDefaults?.({ ...(getMessageComposerDefaults?.() || {}), fromRoleId: target.value, toRoleId: "" });
          showMessageCenterModal?.(getMessageComposerDefaults?.());
        }
        if (target.id === "messageTimelineTaskFilter") {
          setMessageTimelineFilters?.({ ...(getMessageTimelineFilters?.() || {}), taskId: target.value });
          refreshMessageTimelineList?.();
        }
        if (target.id === "appLanguageSelect") {
          const currentState = getState?.();
          const nextLanguage = languageOptions.some((item) => item.id === target.value) ? target.value : "zh-CN";
          if (currentState?.settings) currentState.settings.language = nextLanguage;
          syncLanguage?.(nextLanguage);
          saveState?.();
          render?.();
          showSettingsModal?.();
          return;
        }
        if (target.id === "taskRoleFilter") {
          setTaskRoleFilter?.(target.value);
          render?.();
          return;
        }
        const taskFilterMap = {
          taskListRoleFilter: "roleId",
          taskListStatusFilter: "status",
          taskListModelFilter: "model"
        };
        if (taskFilterMap[target.id]) {
          setTaskListFilters?.({ ...(getTaskListFilters?.() || {}), [taskFilterMap[target.id]]: target.value });
          setSelectedTaskListTaskId?.("");
          render?.();
          return;
        }
        if (target.id === "taskListIncludeArchived") {
          setTaskListFilters?.({ ...(getTaskListFilters?.() || {}), includeArchived: Boolean(target.checked) });
          setSelectedTaskListTaskId?.("");
          render?.();
        }
      });

      documentRef.addEventListener("contextmenu", (event) => {
        const desktop = getElementTarget(event)?.closest(".desktop");
        if (desktop) openContextMenu?.(event);
      });

      documentRef.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          showSearchModal?.();
          return;
        }
        const globalSearchInput = closest(event, "#globalSearchInput");
        if (globalSearchInput && event.key === "Enter") {
          event.preventDefault();
          const firstResult = documentRef.querySelector(".global-search-result");
          if (firstResult) openSearchResult?.(firstResult);
          return;
        }
        const browserAddress = closest(event, "[data-browser-address]");
        if (browserAddress && event.key === "Enter") {
          event.preventDefault();
          navigateBrowserWindow?.(browserAddress.dataset.browserAddress, browserAddress.value);
          return;
        }
        const fileEditor = closest(event, "[data-file-editor]");
        if (fileEditor && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          saveFileFromWindow?.(fileEditor.dataset.fileEditor);
          return;
        }
        if (event.key === "Escape") {
          if (hasPendingCommandApproval?.()) {
            rejectPendingCommand?.();
            return;
          }
          closeMenus?.();
          closeModal?.();
          setActivePopoverWindowId?.(null);
          render?.();
        }
      });

      documentRef.addEventListener("keyup", (event) => {
        const fileEditor = closest(event, "[data-file-editor]");
        if (fileEditor) syncFileEditorChrome?.(fileEditor.dataset.fileEditor);
      });

      documentRef.addEventListener("change", (event) => {
        const target = getElementTarget(event)?.closest("select[data-action]");
        if (!target) return;
        if (target.dataset.action === "filter-task" || target.dataset.action === "filter-role") {
          const modal = documentRef.querySelector(".world-chat-modal");
          if (!modal) return;
          const key = target.dataset.action === "filter-task" ? "filterTask" : "filterRole";
          modal.dataset[key] = target.value;
          updateWorldChatModal?.(modal.dataset.worldChatTaskId || "");
        }
      });
    }

    return { bind };
  }

  global.COSS_INTERACTION_SERVICE = Object.freeze({ createInteractionService });
})(window);
