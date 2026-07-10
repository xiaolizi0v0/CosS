(function exposeTaskView(global) {
  function createTaskViewRenderer({
    escapeHtml,
    translate,
    normalizeSubtaskStatus,
    normalizeKernelPhase,
    subtaskStatusDefs,
    kernelPhaseDefs,
    normalizeAgentEventStatus,
    getRoleName,
    formatDateTime,
    getProject,
    getConversationTasks,
    getActiveDesktop,
    uniqueRoleIds,
    getTaskModelName,
    getTaskRoleIds,
    getTaskStatusValue,
    getFilteredConversationTasks,
    getTaskMessages,
    getTaskDeliveries,
    getTaskOutputRefs,
    getTaskKernelProjection,
    getSubtaskKernelProjection,
    getDeliveryStatusLabel,
    getTaskRoleFilter,
    setTaskRoleFilter,
    getTaskListFilters,
    getSelectedTaskListTaskId,
    setSelectedTaskListTaskId,
    canManuallyExecuteKernelSubtask,
    extractFirstUrl
  } = {}) {
    const t = translate || ((_key, fallback) => fallback || "");
    function renderRecentAgentEvents(project) {
      const events = (project?.agentEvents || []).slice(-6).reverse();
      if (events.length === 0) return "";
      return `<div class="agent-event-panel"><div class="agent-event-panel-title"><strong>${escapeHtml(t("agent.events.title", "Agent 会话事件"))}</strong><span>${escapeHtml(t("agent.events.recent", "最近 {{count}} 条", { count: events.length }))}</span></div>${events.map((event) => `<div class="agent-event-row ${escapeHtml(normalizeAgentEventStatus(event.status) || event.status || "running")}"><strong>${escapeHtml(getRoleName(event.roleId))} · ${escapeHtml(event.provider || "agent")}</strong><span>${escapeHtml(event.status || "event")} · ${escapeHtml(formatDateTime(event.receivedAt))}</span><p>${escapeHtml(event.message || event.sessionId || t("delivery.event.default", "Agent 输出了状态事件。"))}</p></div>`).join("")}</div>`;
    }
    function renderSubtaskStatusChip(status) {
      const normalized = normalizeSubtaskStatus(status);
      return `<span class="subtask-status ${escapeHtml(normalized)}">${escapeHtml(subtaskStatusDefs[normalized].label)}</span>`;
    }
    function renderKernelPhaseChip(phase, options = {}) {
      const normalized = normalizeKernelPhase(phase, options.status || "pending");
      const def = kernelPhaseDefs[normalized] || kernelPhaseDefs.idle;
      return `<span class="kernel-phase-chip ${escapeHtml(normalized)} ${options.leaseExpired === true ? "expired" : ""}">${escapeHtml(options.leaseExpired === true ? "租约过期" : def.label)}</span>`;
    }
    function getSubtaskTaskUrl(task, subtask) {
      return extractFirstUrl([task?.goal || "", task?.title || "", subtask?.description || "", subtask?.title || ""].join("\n"));
    }
    function renderSubtaskActions(taskId, subtask) {
      const project = getProject?.();
      const task = project?.tasks.find((item) => item.id === taskId);
      const status = normalizeSubtaskStatus(subtask.status);
      const executeLabel = status === "done" ? t("task.action.reExecute", "重新执行") : t("task.action.execute", "执行");
      const canExecuteSubtask = task && canManuallyExecuteKernelSubtask(task, subtask);
      const executeButton = canExecuteSubtask ? `<button class="primary-button compact" data-action="execute-kernel-subtask" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}">${escapeHtml(executeLabel)}</button>` : "";
      const button = (label, nextStatus, kind = "secondary") => `<button class="${kind}-button compact" data-action="set-subtask-status" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}" data-status="${escapeHtml(nextStatus)}">${escapeHtml(label)}</button>`;
      const taskUrlButton = getSubtaskTaskUrl(task, subtask) ? `<button class="secondary-button compact" data-action="open-task-url" data-task-id="${escapeHtml(taskId)}" data-subtask-id="${escapeHtml(subtask.id)}">${escapeHtml(t("task.action.openUrl", "打开任务 URL"))}</button>` : "";
      let actions = { idle: [button(t("task.action.start", "开始执行"), "running", "primary")], running: [button(t("task.action.markDone", "标记完成"), "done", "primary")], done: [button(t("task.action.reopen", "重新打开"), "idle")] }[status] || [];
      if (!canExecuteSubtask || status !== "running") actions = [];
      return `<div class="task-actions">${[executeButton, ...actions, taskUrlButton].join("")}</div>`;
    }
    function renderTaskContent() {
      const project = getProject?.();
      const tasks = project ? getConversationTasks(project) : [];
      if (tasks.length === 0) return `<div class="browser-blank">${escapeHtml(t("task.content.empty", "当前对话暂无任务。右键空白处或点击新建任务后，会在这个对话中持续追加任务。"))}</div>`;
      const pairs = tasks.flatMap((task) => task.subtasks.map((subtask) => ({ task, subtask })));
      const availableRoleIds = uniqueRoleIds(pairs.map(({ subtask }) => subtask.roleId));
      let taskRoleFilter = getTaskRoleFilter?.() || "";
      if (taskRoleFilter && !availableRoleIds.includes(taskRoleFilter)) { taskRoleFilter = ""; setTaskRoleFilter?.(""); }
      const filteredPairs = taskRoleFilter ? pairs.filter(({ subtask }) => subtask.roleId === taskRoleFilter) : pairs;
      const roleFilter = `<div class="task-filterbar"><label><span>${escapeHtml(t("task.filter.role", "角色过滤"))}</span><select id="taskRoleFilter"><option value="">${escapeHtml(t("task.filter.allRoles", "全部角色"))}</option>${availableRoleIds.map((roleId) => `<option value="${escapeHtml(roleId)}" ${roleId === taskRoleFilter ? "selected" : ""}>${escapeHtml(getRoleName(roleId))}</option>`).join("")}</select></label></div>`;
      const taskCards = filteredPairs.map(({ task, subtask }) => {
        const kernelState = getSubtaskKernelProjection(task, subtask);
        const leaseLabel = kernelState.step?.lease?.expiresAt ? t("task.lease.validUntil", "有效期至 {{time}}", { time: formatDateTime(kernelState.step.lease.expiresAt) }) : t("task.lease.unset", "未设置有效期");
        return `<div class="task-card ${escapeHtml(kernelState.status)} kernel-phase-${escapeHtml(kernelState.phase)}"><div class="task-card-head"><div class="task-role">${escapeHtml(getRoleName(subtask.roleId))} · ${escapeHtml(task.title)} · ${escapeHtml(getTaskModelName(task))}</div><div class="task-chip-group">${renderKernelPhaseChip(kernelState.phase, kernelState)}${renderSubtaskStatusChip(kernelState.status)}</div></div><div class="task-title">${escapeHtml(subtask.title)}</div><div class="task-desc">${escapeHtml(subtask.description)}</div><div class="task-desc">${escapeHtml(t("task.currentStep", "当前步骤：{{step}}", { step: kernelState.step?.id || t("task.stepPending", "待分配") }))} · ${escapeHtml(leaseLabel)}</div><div class="task-desc">${escapeHtml(t("task.planSource", "规划来源：{{source}}", { source: task.planner?.status === "success" ? t("task.planSource.ai", "智能规划") : t("task.planSource.local", "本地规则") }))}</div>${renderSubtaskActions(task.id, subtask)}</div>`;
      }).join("");
      return `${roleFilter}${taskCards || `<div class="message-empty">${escapeHtml(t("task.content.noSubtasks", "当前角色暂无子任务。"))}</div>`}${renderRecentAgentEvents(project)}`;
    }
    function renderTaskListFilters(project, tasks) {
      const filters = getTaskListFilters?.() || {};
      const roleIds = uniqueRoleIds(tasks.flatMap((task) => getTaskRoleIds(task)));
      const statuses = uniqueRoleIds(tasks.map(getTaskStatusValue));
      const models = uniqueRoleIds(tasks.map(getTaskModelName));
      return `<div class="task-list-filters"><label><span>${escapeHtml(t("taskList.filter.search", "搜索"))}</span><input id="taskListSearch" value="${escapeHtml(filters.query || "")}" placeholder="${escapeHtml(t("taskList.filter.searchPlaceholder", "任务、角色、说明"))}" /></label><label><span>${escapeHtml(t("taskList.filter.role", "角色"))}</span><select id="taskListRoleFilter"><option value="">${escapeHtml(t("taskList.filter.allRoles", "全部角色"))}</option>${roleIds.map((roleId) => `<option value="${escapeHtml(roleId)}" ${roleId === filters.roleId ? "selected" : ""}>${escapeHtml(getRoleName(roleId))}</option>`).join("")}</select></label><label><span>${escapeHtml(t("taskList.filter.status", "状态"))}</span><select id="taskListStatusFilter"><option value="">${escapeHtml(t("taskList.filter.allStatuses", "全部状态"))}</option>${statuses.map((status) => `<option value="${escapeHtml(status)}" ${status === filters.status ? "selected" : ""}>${escapeHtml(subtaskStatusDefs[status]?.label || status)}</option>`).join("")}</select></label><label><span>${escapeHtml(t("taskList.filter.model", "模型"))}</span><select id="taskListModelFilter"><option value="">${escapeHtml(t("taskList.filter.allModels", "全部模型"))}</option>${models.map((model) => `<option value="${escapeHtml(model)}" ${model === filters.model ? "selected" : ""}>${escapeHtml(model)}</option>`).join("")}</select></label><label class="task-list-check"><input id="taskListIncludeArchived" type="checkbox" ${filters.includeArchived ? "checked" : ""} /><span>${escapeHtml(t("taskList.filter.showArchived", "显示归档"))}</span></label></div>`;
    }
    function renderTaskListDetail(project, task) {
      if (!task) return `<aside class="task-list-detail"><div class="message-empty">${escapeHtml(t("taskList.selectTask", "选择一个任务查看详情。"))}</div></aside>`;
      const messages = getTaskMessages(project, task.id);
      const deliveries = getTaskDeliveries(project, task.id);
      const refs = getTaskOutputRefs(project, task.id);
      const projection = getTaskKernelProjection(task);
      return `<aside class="task-list-detail"><div class="task-detail-head"><div><strong>${escapeHtml(task.title || t("taskList.untitledTask", "未命名任务"))}</strong><span>${escapeHtml(task.goal || "")}</span></div>${renderSubtaskStatusChip(projection.status)}</div><div class="task-detail-actions"><button class="secondary-button compact" data-action="show-message-center">${escapeHtml(t("taskList.viewTimeline", "查看时间线"))}</button>${task.archived ? `<button class="secondary-button compact" data-action="restore-task" data-task-id="${escapeHtml(task.id)}">${escapeHtml(t("taskList.restoreTask", "恢复任务"))}</button>` : `<button class="secondary-button compact" data-action="archive-task" data-task-id="${escapeHtml(task.id)}">${escapeHtml(t("taskList.archiveTask", "归档任务"))}</button>`}</div><div class="task-detail-metrics"><span>idle ${projection.counts.idle || 0}</span><span>running ${projection.activeCount || 0}</span><span>done ${projection.counts.done || 0}</span><span>locks ${projection.activeLocks.length}</span><span>approvals ${projection.pendingApprovals.length}</span><span>events ${projection.events.length}</span><span>${escapeHtml(t("taskList.metrics.subtasks", "子任务 {{done}}/{{total}}", { done: projection.doneCount, total: task.subtasks?.length || 0 }))}</span><span>${escapeHtml(t("taskList.metrics.messages", "消息 {{count}}", { count: messages.length }))}</span><span>${escapeHtml(t("taskList.metrics.deliveries", "投递 {{count}}", { count: deliveries.length }))}</span><span>${escapeHtml(t("taskList.metrics.outputs", "输出 {{count}}", { count: refs.length }))}</span><span>${escapeHtml(getTaskModelName(task))}</span></div><div class="task-detail-section"><strong>${escapeHtml(t("taskList.detail.subtasks", "子任务"))}</strong>${(task.subtasks || []).map((subtask) => { const kernelState = getSubtaskKernelProjection(task, subtask); return `<div class="task-detail-subtask ${escapeHtml(kernelState.status)} kernel-phase-${escapeHtml(kernelState.phase)}"><span>${escapeHtml(getRoleName(subtask.roleId))}</span><strong>${escapeHtml(subtask.title)}</strong><span class="task-chip-group">${renderKernelPhaseChip(kernelState.phase, kernelState)}${renderSubtaskStatusChip(kernelState.status)}</span><p>${escapeHtml(subtask.description || "")}</p><p>${escapeHtml(t("task.currentStep", "当前步骤：{{step}}", { step: kernelState.step?.id || t("task.stepPending", "待分配") }))}</p>${renderSubtaskActions(task.id, subtask)}</div>`; }).join("")}</div><div class="task-detail-section"><strong>${escapeHtml(t("taskList.detail.deliveries", "关联投递"))}</strong>${deliveries.length ? deliveries.slice(0, 5).map((delivery) => `<div class="task-detail-linkrow"><span>${escapeHtml(getRoleName(delivery.roleId))} · ${escapeHtml(getDeliveryStatusLabel(delivery.status))}</span><span>${escapeHtml(delivery.submissionMethod || "pending")}</span></div>`).join("") : `<div class="message-empty">${escapeHtml(t("taskList.detail.noDeliveries", "暂无投递。"))}</div>`}</div><div class="task-detail-section"><strong>${escapeHtml(t("taskList.detail.recentMessages", "最近消息"))}</strong>${messages.length ? messages.slice(-4).reverse().map((message) => `<div class="task-detail-message"><span>${escapeHtml(getRoleName(message.fromRoleId))} -> ${escapeHtml(message.toRoleIds.map((roleId) => getRoleName(roleId)).join("、"))}</span><p>${escapeHtml(message.content)}</p></div>`).join("") : `<div class="message-empty">${escapeHtml(t("taskList.detail.noMessages", "暂无消息。"))}</div>`}</div></aside>`;
    }
    function renderTaskListContent() {
      const project = getProject?.();
      const conversation = getActiveDesktop?.(project);
      if (!project) return `<div class="browser-blank">${escapeHtml(t("taskList.noProject", "请先选择项目。"))}</div>`;
      const allTasks = getConversationTasks(project);
      const visibleTasks = getFilteredConversationTasks(project);
      const totalSubtasks = allTasks.reduce((sum, task) => sum + (task.subtasks?.length || 0), 0);
      const archivedCount = allTasks.filter((task) => task.archived).length;
      let selectedTaskListTaskId = getSelectedTaskListTaskId?.() || "";
      if (selectedTaskListTaskId && !visibleTasks.some((task) => task.id === selectedTaskListTaskId)) selectedTaskListTaskId = "";
      const selectedTask = visibleTasks.find((task) => task.id === selectedTaskListTaskId) || visibleTasks[0] || null;
      setSelectedTaskListTaskId?.(selectedTask?.id || "");
      const items = visibleTasks.length ? visibleTasks.map((task, index) => { const projection = getTaskKernelProjection(task); return `<button class="task-list-item ${selectedTask?.id === task.id ? "active" : ""} ${task.archived ? "archived" : ""}" data-action="select-task-list-task" data-task-id="${escapeHtml(task.id)}"><div class="task-list-row-head"><div><strong>${escapeHtml(task.title || t("taskList.taskIndex", "任务 {{index}}", { index: index + 1 }))}</strong><span>${escapeHtml(task.goal || "")}</span></div>${renderSubtaskStatusChip(projection.status)}</div><div class="task-list-meta"><span>${escapeHtml(getTaskModelName(task))}</span><span>running ${projection.activeCount || 0}</span><span>locks ${projection.activeLocks.length}</span><span>approvals ${projection.pendingApprovals.length}</span><span>${escapeHtml(t("taskList.subtasksDone", "{{done}}/{{total}} 已完成", { done: projection.doneCount, total: task.subtasks?.length || 0 }))}</span><span>${escapeHtml(formatDateTime(task.confirmedAt || task.createdAt))}</span>${task.archived ? `<span>${escapeHtml(t("taskList.archived", "已归档"))}</span>` : ""}</div><div class="task-list-subtasks">${(task.subtasks || []).map((subtask) => { const kernelState = getSubtaskKernelProjection(task, subtask); return `<span class="task-list-subtask ${escapeHtml(kernelState.status)} kernel-phase-${escapeHtml(kernelState.phase)}">${escapeHtml(getRoleName(subtask.roleId))} · ${escapeHtml(subtask.title)}</span>`; }).join("")}</div></button>`; }).join("") : `<div class="message-empty">${escapeHtml(t("taskList.noMatchingTasks", "没有匹配当前筛选条件的任务。"))}</div>`;
      return `<div class="task-list-program"><div class="task-list-head"><strong>${escapeHtml(t("taskList.title", "{{name}}任务列表", { name: conversation?.name || t("taskList.currentConversation", "当前对话") }))}</strong><span>${escapeHtml(t("taskList.header.summary", "{{visible}}/{{total}} 个任务 · {{subtasks}} 个子任务 · {{archived}} 个归档", { visible: visibleTasks.length, total: allTasks.length, subtasks: totalSubtasks, archived: archivedCount }))}</span></div>${renderTaskListFilters(project, allTasks)}${allTasks.length === 0 ? `<div class="browser-blank">${escapeHtml(t("taskList.empty.noTasks", "当前对话还没有任务。点击右上角“新建任务”后，任务会持续追加到这个对话中。"))}</div>` : `<div class="task-list-layout"><div class="task-list-items">${items}</div>${renderTaskListDetail(project, selectedTask)}</div>`}</div>`;
    }
    return { renderRecentAgentEvents, renderSubtaskStatusChip, renderKernelPhaseChip, renderSubtaskActions, renderTaskContent, renderTaskListFilters, renderTaskListDetail, renderTaskListContent };
  }
  global.COSS_TASK_VIEW = Object.freeze({ id: "task", createTaskViewRenderer, render: ({ renderTask } = {}) => renderTask?.() || "", mount: () => undefined, unmount: () => undefined });
})(window);
