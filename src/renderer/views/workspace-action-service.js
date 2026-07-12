(function exposeWorkspaceActionService(global) {
  function createWorkspaceActionService({
    getState,
    closeMenus,
    render,
    openTaskListWindow,
    selectTaskListTask,
    setTaskArchived,
    applyLayoutPreset,
    showCreateProjectModal,
    createProjectFromModal,
    chooseProjectDirectoryFromModal,
    setActiveProject,
    showDeleteProjectModal,
    deleteProject,
    showRolePicker,
    openRoleMenu,
    createProgram,
    closeModal,
    showCreateTaskModal,
    showMessageCenterModal,
    showLogsModal,
    checkClaudeStatus,
    showAboutModal,
    openLogDirectoryFromRenderer,
    switchDesktop,
    createProjectDesktop,
    getTaskViewOpen,
    setTaskViewOpen,
    getActivePopoverWindowId,
    setActivePopoverWindowId,
    getOpenAppMenuId,
    setOpenAppMenuId,
    setContextMenu,
    setRoleMenu,
    getSidebarCollapsed,
    setSidebarCollapsed,
    setSidebarResizeState,
    getSidebarCollapseTimer,
    setSidebarCollapseTimer,
    getSidebarWidth,
    updateSidebarWidth,
    animateSidebarCollapse,
    documentRef = global.document,
    showSearchModal,
    openSearchResult,
    executeCustomMenuCommand,
    controlWindow,
    setMaximized,
    closeWindow,
    minimizeWindow,
    toggleMaximizeWindow,
    focusWindow,
    bootWorkspace
  } = {}) {
    function handle(action, target, event) {
      const current = getState?.() || {};
      if (action === "open-task-list-window") {
        closeMenus?.();
        openTaskListWindow?.();
        return true;
      }
      if (action === "desktop") {
        const shouldRefresh = Boolean(getActivePopoverWindowId?.() || getOpenAppMenuId?.() || getTaskViewOpen?.());
        closeMenus?.();
        setActivePopoverWindowId?.(null);
        setTaskViewOpen?.(false);
        if (shouldRefresh) render?.();
        return true;
      }
      if (action === "toggle-app-menu") {
        setOpenAppMenuId?.(getOpenAppMenuId?.() === target.dataset.menuId ? null : target.dataset.menuId);
        setContextMenu?.(null);
        setRoleMenu?.(null);
        render?.();
        return true;
      }
      if (action === "toggle-sidebar") {
        setSidebarResizeState?.(null);
        documentRef?.body?.classList.remove("sidebar-resizing");
        closeMenus?.();
        if (getSidebarCollapsed?.()) {
          const timer = getSidebarCollapseTimer?.();
          if (timer) {
            clearTimeout(timer);
            setSidebarCollapseTimer?.(null);
          }
          setSidebarCollapsed?.(false);
          updateSidebarWidth?.(getSidebarWidth?.());
          render?.();
        } else {
          animateSidebarCollapse?.();
        }
        return true;
      }
      if (action === "select-task-list-task") {
        selectTaskListTask?.(target.dataset.taskId);
        return true;
      }
      if (action === "archive-task" || action === "restore-task") {
        setTaskArchived?.(target.dataset.taskId, action === "archive-task");
        return true;
      }
      if (action === "select-layout-preset") {
        applyLayoutPreset?.(target.dataset.layout);
        return true;
      }
      if (action === "show-create-project") {
        showCreateProjectModal?.();
        return true;
      }
      if (action === "create-project") {
        createProjectFromModal?.();
        return true;
      }
      if (action === "choose-project-directory") {
        chooseProjectDirectoryFromModal?.();
        return true;
      }
      if (action === "select-project") {
        setActiveProject?.(target.dataset.projectId);
        return true;
      }
      if (action === "show-delete-project") {
        showDeleteProjectModal?.(target.dataset.projectId);
        return true;
      }
      if (action === "confirm-delete-project") {
        deleteProject?.(target.dataset.projectId);
        return true;
      }
      if (action === "show-role-picker") {
        showRolePicker?.(target.dataset.type);
        return true;
      }
      if (action === "role-menu") {
        openRoleMenu?.(target.dataset.type, target);
        return true;
      }
      if (action === "select-role") {
        createProgram?.(target.dataset.type, target.dataset.roleId, {
          terminalMode: target.dataset.terminalMode,
          agentProvider: target.dataset.terminalMode === "agent" ? current.settings?.agentProvider : undefined
        });
        closeModal?.();
        return true;
      }
      if (action === "show-create-task") {
        showCreateTaskModal?.();
        return true;
      }
      if (action === "show-message-center") {
        showMessageCenterModal?.({ fromRoleId: target.dataset.roleId || undefined });
        return true;
      }
      if (action === "show-logs") {
        showLogsModal?.();
        checkClaudeStatus?.();
        return true;
      }
      if (action === "show-about") {
        showAboutModal?.();
        return true;
      }
      if (action === "open-log-directory") {
        openLogDirectoryFromRenderer?.();
        return true;
      }
      if (action === "switch-desktop") {
        switchDesktop?.(target.dataset.desktopId);
        return true;
      }
      if (action === "create-desktop") {
        createProjectDesktop?.();
        return true;
      }
      if (action === "show-search") {
        showSearchModal?.();
        return true;
      }
      if (action === "open-search-result") {
        openSearchResult?.(target);
        return true;
      }
      if (action === "custom-menu-command") {
        executeCustomMenuCommand?.(target.dataset.command);
        return true;
      }
      if (action === "window-control") {
        Promise.resolve(controlWindow?.(target.dataset.windowAction)).then((result) => {
          if (target.dataset.windowAction === "toggle-maximize" && typeof result?.maximized === "boolean") {
            setMaximized?.(result.maximized);
            render?.();
          }
        });
        return true;
      }
      if (action === "close-window") {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        closeWindow?.(target.dataset.windowId);
        return true;
      }
      if (action === "minimize-window") {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        minimizeWindow?.(target.dataset.windowId);
        return true;
      }
      if (action === "toggle-maximize-window") {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        toggleMaximizeWindow?.(target.dataset.windowId);
        return true;
      }
      if (action === "focus-window") {
        focusWindow?.(target.dataset.windowId);
        return true;
      }
      if (action === "toggle-popover") {
        setActivePopoverWindowId?.(getActivePopoverWindowId?.() === target.dataset.windowId ? null : target.dataset.windowId);
        render?.();
        return true;
      }
      if (action === "refresh-workspace") {
        bootWorkspace?.(current.activeProjectId);
        closeMenus?.();
        return true;
      }
      if (action === "show-task-view") {
        setTaskViewOpen?.(!getTaskViewOpen?.());
        closeMenus?.();
        setActivePopoverWindowId?.(null);
        render?.();
        return true;
      }
      if (action === "close-task-view") {
        if (target.classList.contains("task-view-backdrop") && event?.target !== target) return true;
        setTaskViewOpen?.(false);
        render?.();
        return true;
      }
      return false;
    }

    return { handle };
  }

  global.COSS_WORKSPACE_ACTION_SERVICE = Object.freeze({ createWorkspaceActionService });
})(window);
