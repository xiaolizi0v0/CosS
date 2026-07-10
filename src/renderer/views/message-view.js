(function exposeMessageView(global) {
  function createMessageViewRenderer({
    escapeHtml,
    translate,
    getRole,
    getRoleName,
    getMessageTaskLabel,
    normalizeAgentEventStatus,
    formatDateTime,
    getProjectTimelineEvents,
    getOutputRefsForMessage,
    renderRelayStageChips,
    renderAgentFlowGraph,
    normalizeAgentFlowSelection,
    getSelectedTimelineItemId,
    setSelectedTimelineItemId
  } = {}) {
    const t = translate || ((_key, fallback) => fallback || "");

    function getTimelineItemKey(item) { return `${item.kind}:${item.id}`; }
    function getTimelineItemDate(item) { return new Date(item.time || 0); }
    function getTimelineItemLabel(item) {
      if (item.kind === "agent-event") {
        const event = item.event;
        const toolSuffix = event.toolName ? ` · ${event.toolName}` : "";
        return {
          title: `Agent · ${getRoleName(event.roleId)}`,
          subtitle: `${event.status || event.type || "event"}${toolSuffix}`,
          summary: event.message || event.sessionId || t("delivery.event.default", "Agent 输出了状态事件。")
        };
      }
      const message = item.message;
      return {
        title: getRoleName(message.fromRoleId),
        subtitle: message.toRoleIds.map((roleId) => getRoleName(roleId)).join("、"),
        summary: message.content
      };
    }

    function renderTimelineNode(item, isSelected, index, total) {
      const key = getTimelineItemKey(item);
      const labels = getTimelineItemLabel(item);
      const statusClass = item.kind === "agent-event"
        ? normalizeAgentEventStatus(item.event.status) || item.event.status || "running"
        : "message";
      const nodeClasses = [
        "message-timeline-node",
        item.kind,
        item.kind === "agent-event" ? "agent-timeline-row" : "",
        statusClass,
        isSelected ? "active" : "",
        item.kind === "message" && item.message.toRoleIds.length > 1 ? "branching" : ""
      ].filter(Boolean).join(" ");
      const branchTargets = item.kind === "message" && item.message.toRoleIds.length > 1
        ? `<div class="message-branch-targets" aria-label="${escapeHtml(t("nav.branchTargets", "分叉接收角色"))}">${item.message.toRoleIds.map((roleId) => `<span>${escapeHtml(getRoleName(roleId))}</span>`).join("")}</div>`
        : "";
      const singleTarget = item.kind === "message" && item.message.toRoleIds.length === 1
        ? `<div class="message-node-target">${escapeHtml(labels.subtitle)}</div>`
        : "";
      return `<button class="${escapeHtml(nodeClasses)}" data-action="select-message-timeline-node" data-timeline-item-id="${escapeHtml(key)}" style="--node-index:${index}; --node-count:${total};" aria-pressed="${isSelected ? "true" : "false"}"><span class="message-node-time">${escapeHtml(formatDateTime(item.time))}</span><span class="message-node-dot"></span><span class="message-node-title">${escapeHtml(labels.title)}</span><span class="message-node-summary">${escapeHtml(labels.summary)}</span>${singleTarget}${branchTargets}</button>`;
    }

    function renderTimelineDetail(project, item) {
      if (!item) return `<div class="message-empty">${escapeHtml(t("nav.selectTimelineNode", "请选择时间轴节点查看详情。"))}</div>`;
      if (item.kind === "agent-event") {
        const event = item.event;
        const toNames = event.toRoleIds.length > 0 ? ` → ${event.toRoleIds.map((roleId) => getRoleName(roleId)).join("、")}` : "";
        return `<div class="message-row timeline-row agent-timeline-row ${escapeHtml(normalizeAgentEventStatus(event.status) || event.status || "running")}" data-agent-event-id="${escapeHtml(event.id)}"><div class="message-row-head"><strong>${escapeHtml(t("timeline.agentEvent", "Agent 事件"))} · ${escapeHtml(getRoleName(event.roleId))}${escapeHtml(toNames)}</strong><span>${escapeHtml(formatDateTime(event.receivedAt))}</span></div><div class="message-meta"><span>${escapeHtml(event.taskId ? getMessageTaskLabel(event.taskId) : t("taskList.sessionEvent", "会话事件"))}</span><span>${escapeHtml(event.status || "event")}</span><span>${escapeHtml(event.structured ? "structured-event" : event.type || "status")}</span>${event.toolName ? `<span>${escapeHtml(event.toolName)}</span>` : ""}</div><p>${escapeHtml(event.message || event.sessionId || t("delivery.event.default", "Agent 输出了状态事件。"))}</p></div>`;
      }
      const message = item.message;
      const fromRole = getRole(message.fromRoleId);
      const toNames = message.toRoleIds.map((roleId) => getRoleName(roleId)).join("、");
      const channelLabel = message.channelType === "task" ? getMessageTaskLabel(message.taskId) : t("taskList.privateChat", "私聊");
      const refs = getOutputRefsForMessage(project, message.id);
      const injectedLabel = message.injectedWindowIds?.length ? `<span>${escapeHtml(t("taskList.injected", "已注入 {{count}} 个终端", { count: message.injectedWindowIds.length }))}</span>` : "";
      return `<div class="message-row timeline-row" data-message-id="${escapeHtml(message.id)}"><div class="message-row-head"><strong>${escapeHtml(fromRole.name)} → ${escapeHtml(toNames)}</strong><span>${escapeHtml(formatDateTime(message.createdAt))}</span></div><div class="message-meta"><span>${escapeHtml(channelLabel)}</span><span>${escapeHtml(message.source || "manual")}</span>${injectedLabel}${refs.length ? `<span>${escapeHtml(t("taskList.outputRefs", "{{count}} 条输出引用", { count: refs.length }))}</span>` : ""}</div>${renderRelayStageChips(project, message)}<p>${escapeHtml(message.content)}</p><div class="message-row-actions">${refs.length ? `<button class="secondary-button compact" data-action="show-terminal-output-refs" data-message-id="${escapeHtml(message.id)}">${escapeHtml(t("taskList.viewOutput", "查看输出"))}</button>` : ""}</div></div>`;
    }

    function renderMessageRows(project) {
      normalizeAgentFlowSelection(project);
      const timeline = getProjectTimelineEvents(project);
      if (timeline.length === 0) {
        setSelectedTimelineItemId("");
        return `${renderAgentFlowGraph(project)}<div class="message-empty">${escapeHtml(t("nav.noEvents", "暂无协作事件。发送一条消息，创建任务，或等待 Agent 输出结构化事件。"))}</div>`;
      }
      const timelineKeys = new Set(timeline.map(getTimelineItemKey));
      let selectedTimelineItemId = getSelectedTimelineItemId() || "";
      if (!selectedTimelineItemId || !timelineKeys.has(selectedTimelineItemId)) {
        selectedTimelineItemId = getTimelineItemKey(timeline[0]);
        setSelectedTimelineItemId(selectedTimelineItemId);
      }
      const chronological = [...timeline].sort((a, b) => getTimelineItemDate(a).getTime() - getTimelineItemDate(b).getTime());
      const selectedItem = timeline.find((item) => getTimelineItemKey(item) === selectedTimelineItemId) || timeline[0];
      return `${renderAgentFlowGraph(project)}<div class="message-timeline-shell"><div class="message-timeline-scroll" aria-label="${escapeHtml(t("nav.timelineAria", "协作横向时间轴"))}"><div class="message-timeline-track" style="--timeline-count:${chronological.length};">${chronological.map((item, index) => renderTimelineNode(item, getTimelineItemKey(item) === selectedTimelineItemId, index, chronological.length)).join("")}</div></div><div class="message-timeline-detail" data-message-timeline-detail>${renderTimelineDetail(project, selectedItem)}</div></div>`;
    }

    return { getTimelineItemKey, renderTimelineNode, renderTimelineDetail, renderMessageRows };
  }

  global.COSS_MESSAGE_VIEW = Object.freeze({ id: "message", createMessageViewRenderer, render: ({ renderMessages } = {}) => renderMessages?.() || "", mount: () => undefined, unmount: () => undefined });
})(window);
