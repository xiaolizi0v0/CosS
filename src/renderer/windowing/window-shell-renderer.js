(function exposeWindowShellRenderer(global) {
  function createWindowShellRenderer({
    escapeHtml,
    translate,
    getWindowStatus,
    getCollaboratorsForWindow,
    getVisibleWindows,
    getAgentRelayStageForWindow,
    getStatusLabel,
    getRelayStageClass,
    getRelayStageSymbol,
    statusSymbol,
    normalizeTerminalMode,
    renderCollabPopover,
    renderProgramWindowStyle,
    renderResizeHandles,
    getFocusedWindowId,
    getActivePopoverWindowId,
    renderTerminalContent,
    renderBrowserContent,
    renderFileContent,
    renderTaskContent,
    renderTaskListContent
  } = {}) {
    const t = translate || ((_key, fallback) => fallback || "");
    function renderProgramWindow(win) {
      const status = getWindowStatus(win);
      const collaborators = getCollaboratorsForWindow(win);
      const content = { terminal: renderTerminalContent, browser: renderBrowserContent, file: renderFileContent, task: renderTaskContent, "task-list": renderTaskListContent }[win.type]?.(win) || "";
      return `<article class="program-window ${win.type} ${getFocusedWindowId() === win.id ? "focused" : ""} ${win.maximized ? "maximized" : ""}" data-window-id="${win.id}" style="${renderProgramWindowStyle(win)}"><div class="window-titlebar" data-drag-handle="true" data-window-id="${win.id}"><div class="traffic-lights"><span></span><span></span><span></span></div><div class="window-title">${escapeHtml(win.title)}</div><div class="window-controls" data-no-drag="true" data-no-focus="true"><button class="window-control" title="${escapeHtml(t("window.minimize", "最小化"))}" data-action="minimize-window" data-window-id="${win.id}" data-no-drag="true" data-no-focus="true" aria-label="${escapeHtml(t("window.minimize", "最小化"))}">&#8211;</button><button class="window-control" title="${escapeHtml(win.maximized ? t("window.restore", "还原") : t("window.maximize", "最大化"))}" data-action="toggle-maximize-window" data-window-id="${win.id}" data-no-drag="true" data-no-focus="true" aria-label="${escapeHtml(win.maximized ? t("window.restore", "还原窗口") : t("window.maximize", "最大化窗口"))}">${win.maximized ? "&#10064;" : "&#9633;"}</button><button class="window-control" title="${escapeHtml(t("common.close", "关闭"))}" data-action="close-window" data-window-id="${win.id}" data-no-drag="true" data-no-focus="true" aria-label="${escapeHtml(t("window.close", "关闭窗口"))}">×</button></div></div><div class="window-content">${content}</div>${renderResizeHandles(win)}</article>`;
    }
    function renderCollabOverlay(project) {
      const badges = getVisibleWindows(project).map((win) => {
        const status = getWindowStatus(win);
        const collaborators = getCollaboratorsForWindow(win);
        const relayStage = getAgentRelayStageForWindow(win);
        const isAgentWindow = win.type === "terminal" && normalizeTerminalMode(win.terminalMode) === "agent";
        const relayClass = isAgentWindow ? `relay-${relayStage.className || getRelayStageClass(relayStage.stage)}` : "";
        const badgeTitle = isAgentWindow ? t("collab.statusWithRelay", "协作状态：{{status}}；Agent 接力阶段：{{label}}", { status: getStatusLabel(status), label: relayStage.label }) : t("collab.status", "协作状态：{{status}}", { status: getStatusLabel(status) });
        const badgeContent = isAgentWindow ? (relayStage.symbol || getRelayStageSymbol(relayStage.stage)) : (collaborators.length || statusSymbol(status));
        return `<div class="collab-overlay-item ${win.maximized ? "maximized" : ""}" data-window-id="${win.id}" style="${renderCollabOverlayStyle(win)}"><button class="collab-badge ${status} ${relayClass}" title="${escapeHtml(badgeTitle)}" data-action="toggle-popover" data-window-id="${win.id}" data-relay-stage="${escapeHtml(relayStage.stage || "idle")}">${escapeHtml(badgeContent)}</button>${getActivePopoverWindowId() === win.id ? renderCollabPopover(win, collaborators, status, relayStage) : ""}</div>`;
      }).join("");
      return `<div class="collab-overlay">${badges}</div>`;
    }
    return { renderProgramWindow, renderCollabOverlay };
  }
  global.COSS_WINDOW_SHELL_RENDERER = Object.freeze({ createWindowShellRenderer });
})(window);
