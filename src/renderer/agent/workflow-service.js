(function exposeAgentWorkflowService(global) {
  function createAgentWorkflowService({
    getState,
    getProject,
    translate,
    saveState,
    render,
    recordLog,
    finalizeCompletedKernelDispatchMessages,
    getPendingKernelMessages,
    isKernelDispatchMessageForCompletedWork,
    markKernelDispatchMessageCompleted,
    persistAgentPoolMessages,
    ensureAutoWorkflowAgentTargets,
    queueAgentDeliveriesForMessage,
    confirmAgentDelivery,
    drainDeliveryQueueForWindow,
    getTaskContextForWindow,
    normalizeTerminalMode,
    getWaitForQueue,
    getSaveQueue
  } = {}) {
    const t = translate || ((_key, fallback) => fallback || "");
    let pendingPumpTimer = null;
    const queueDrainTimers = new Map();

    function state() {
      return getState?.() || {};
    }

    function isActive() {
      const current = state();
      return current.settings?.agentAutoWorkflowEnabled === true
        && current.settings?.agentAutoWorkflowPaused !== true;
    }

    function getStatusLabel() {
      const current = state();
      if (!current.settings?.agentAutoWorkflowEnabled) {
        return t("kernel.autoWorkflow.off", "未开启");
      }
      return current.settings?.agentAutoWorkflowPaused
        ? t("kernel.autoWorkflow.paused", "已中止")
        : t("kernel.autoWorkflow.running", "运行中");
    }

    function ensureRunning(reason = "auto-start") {
      const current = state();
      current.settings ||= {};
      const wasEnabled = current.settings.agentAutoWorkflowEnabled === true;
      const wasPaused = current.settings.agentAutoWorkflowPaused === true;
      current.settings.agentAutoWorkflowEnabled = true;
      current.settings.agentAutoWorkflowPaused = false;
      if (!wasEnabled || wasPaused) {
        recordLog?.("agent.workflow.auto-started", {
          projectId: current.activeProjectId || "",
          reason,
          wasEnabled,
          wasPaused
        });
      }
    }

    function stop(reason = "user-stop") {
      const current = state();
      const project = getProject?.();
      current.settings ||= {};
      current.settings.agentAutoWorkflowPaused = true;
      let canceledCount = 0;
      if (project?.agentDeliveries) {
        const now = new Date().toISOString();
        project.agentDeliveries.forEach((delivery) => {
          if (delivery.autoWorkflow && delivery.status === "pending") {
            delivery.status = "canceled";
            delivery.canceledAt = now;
            delivery.updatedAt = now;
            delivery.lastFeedback = t("kernel.autoWorkflow.userPaused", "用户已暂停 Kernel 自动调度。");
            canceledCount += 1;
          }
        });
      }
      recordLog?.("agent.workflow.stopped", { projectId: project?.id || "", reason, canceledCount }, "warn");
      saveState?.();
      render?.();
    }

    function scheduleQueueDrain(windowId, delayMs = 250) {
      const current = state();
      if (!windowId || !current.settings?.agentAutoWorkflowEnabled) return;
      if (queueDrainTimers.has(windowId)) {
        clearTimeout(queueDrainTimers.get(windowId));
      }
      const timer = setTimeout(() => {
        queueDrainTimers.delete(windowId);
        Promise.resolve(drainDeliveryQueueForWindow?.(windowId)).catch((error) => {
          recordLog?.("agent.workflow.queue-drain.error", {
            projectId: state().activeProjectId || "",
            windowId,
            error: error.message
          }, "error");
        });
      }, delayMs);
      queueDrainTimers.set(windowId, timer);
    }

    function schedule(messageId, sourceEventId = "") {
      const current = state();
      if (!current.settings?.agentAutoWorkflowEnabled) return;
      setTimeout(() => {
        Promise.resolve(dispatchMessage(messageId, sourceEventId)).catch((error) => {
          const project = getProject?.();
          const message = project?.messages?.find((item) => item.id === messageId);
          if (message) {
            message.autoWorkflowStatus = `error:${error.message || "unknown"}`;
            message.autoWorkflowStoppedAt = new Date().toISOString();
            saveState?.();
          }
          recordLog?.("agent.workflow.auto-dispatch.error", {
            projectId: state().activeProjectId || "",
            messageId,
            sourceEventId,
            error: error.message
          }, "error");
        });
      }, 0);
    }

    async function dispatchMessage(messageId, sourceEventId = "") {
      const project = getProject?.();
      const message = project?.messages?.find((item) => item.id === messageId);
      if (!project || !message) return { ok: false, reason: "message-not-found" };
      if (markKernelDispatchMessageCompleted?.(project, message, `auto-dispatch:${sourceEventId || "unknown"}`)) {
        saveState?.();
        render?.();
        return { ok: false, reason: "completed-work" };
      }

      const current = state();
      if (!current.settings?.agentAutoWorkflowEnabled) return { ok: false, reason: "disabled" };
      if (current.settings.agentAutoWorkflowPaused) {
        message.autoWorkflow = true;
        message.autoWorkflowStatus = "paused";
        message.autoWorkflowStoppedAt = new Date().toISOString();
        saveState?.();
        recordLog?.("agent.workflow.auto-dispatch.skipped", { projectId: project.id, messageId, sourceEventId, reason: "paused" }, "warn");
        return { ok: false, reason: "paused" };
      }

      message.autoWorkflow = true;
      message.autoWorkflowStatus = "preparing";
      saveState?.();
      recordLog?.("agent.workflow.auto-dispatch.started", {
        projectId: project.id,
        messageId,
        sourceEventId,
        fromRoleId: message.fromRoleId,
        toRoleIds: message.toRoleIds,
        taskId: message.taskId || ""
      });

      const missingPoolPath = (message.toRoleIds || []).some((roleId) => !message.agentPoolPaths?.[roleId]);
      if (missingPoolPath) {
        await persistAgentPoolMessages?.(project, [message], "auto-dispatch-backfill");
        saveState?.();
      }

      const targetResult = await ensureAutoWorkflowAgentTargets?.(message);
      if (!targetResult?.ok || !isActive()) {
        message.autoWorkflowStatus = current.settings.agentAutoWorkflowPaused ? "stopped" : targetResult?.reason || "target-not-ready";
        message.autoWorkflowStoppedAt = new Date().toISOString();
        saveState?.();
        render?.();
        recordLog?.("agent.workflow.auto-dispatch.skipped", {
          projectId: project.id,
          messageId,
          sourceEventId,
          reason: message.autoWorkflowStatus,
          createdWindowIds: targetResult?.createdWindowIds || []
        }, "warn");
        return { ok: false, reason: message.autoWorkflowStatus };
      }

      const queueResult = queueAgentDeliveriesForMessage?.(messageId, { limit: 8, autoWorkflow: true, sourceEventId });
      if (!queueResult?.ok) {
        message.autoWorkflowStatus = queueResult?.reason || "queue-failed";
        saveState?.();
        render?.();
        recordLog?.("agent.workflow.auto-dispatch.failed", { projectId: project.id, messageId, sourceEventId, reason: message.autoWorkflowStatus }, "warn");
        return queueResult || { ok: false, reason: message.autoWorkflowStatus };
      }

      let confirmedCount = 0;
      let deferredCount = 0;
      for (const deliveryId of queueResult.deliveryIds || []) {
        if (!isActive()) break;
        const result = await confirmAgentDelivery?.(deliveryId, { autoWorkflow: true, sourceEventId });
        if (result?.ok) confirmedCount += 1;
        else if (result?.deferred) deferredCount += 1;
      }

      message.autoWorkflowStatus = isActive()
        ? (confirmedCount > 0 ? "submitted" : (deferredCount > 0 ? "queued" : "delivery-not-confirmed"))
        : "stopped";
      if (confirmedCount > 0) message.autoWorkflowDispatchedAt = new Date().toISOString();
      saveState?.();
      render?.();
      recordLog?.("agent.workflow.auto-dispatched", {
        projectId: project.id,
        messageId,
        sourceEventId,
        queuedCount: queueResult.queuedCount,
        confirmedCount,
        deferredCount,
        status: message.autoWorkflowStatus,
        stopped: !isActive()
      });
      return { ok: confirmedCount > 0 || deferredCount > 0, queuedCount: queueResult.queuedCount, confirmedCount, deferredCount };
    }

    function scheduleForMessages(messages, sourceEventId = "") {
      const project = getProject?.();
      const finalizedCount = finalizeCompletedKernelDispatchMessages?.(project, `schedule:${sourceEventId || "unknown"}`) || 0;
      const list = (messages || []).filter((message) => (
        message?.id
        && !isKernelDispatchMessageForCompletedWork?.(project, message)
        && message.autoWorkflowStatus !== "completed"
      ));
      if (!state().settings?.agentAutoWorkflowEnabled || list.length === 0) {
        if (finalizedCount > 0) {
          saveState?.();
          render?.();
        }
        return;
      }
      recordLog?.("agent.workflow.batch-scheduled", {
        projectId: state().activeProjectId || "",
        sourceEventId,
        messageIds: list.map((message) => message.id),
        count: list.length
      });
      list.forEach((message) => schedule(message.id, sourceEventId));
    }

    function resumePending(reason = "auto-workflow-resume") {
      if (!isActive()) return [];
      const project = getProject?.();
      const finalizedCount = finalizeCompletedKernelDispatchMessages?.(project, reason) || 0;
      const messages = getPendingKernelMessages?.(project) || [];
      if (messages.length === 0) {
        if (finalizedCount > 0) {
          saveState?.();
          render?.();
        }
        return [];
      }
      messages.forEach((message) => {
        message.autoWorkflow = true;
        message.autoWorkflowStatus = "queued";
      });
      recordLog?.("agent.workflow.pending-kernel-messages-resumed", {
        projectId: project?.id || "",
        reason,
        messageIds: messages.map((message) => message.id),
        count: messages.length
      });
      saveState?.();
      messages.forEach((message) => schedule(message.id, reason));
      return messages;
    }

    function startPump() {
      if (pendingPumpTimer) return;
      pendingPumpTimer = setInterval(() => {
        const current = state();
        const queue = getSaveQueue?.();
        if (!isActive() || queue?.isInFlight || queue?.isDirty) return;
        try {
          const messages = resumePending("kernel-sequence-pump");
          if (messages.length > 0) {
            recordLog?.("agent.workflow.kernel-sequence-pump.dispatched", {
              projectId: getProject?.()?.id || "",
              messageIds: messages.map((message) => message.id),
              count: messages.length
            });
          }
        } catch (error) {
          recordLog?.("agent.workflow.kernel-sequence-pump.error", {
            projectId: current.activeProjectId || "",
            error: error.message
          }, "error");
        }
      }, 1200);
    }

    function resume(reason = "manual-resume") {
      const current = state();
      current.settings ||= {};
      current.settings.agentAutoWorkflowEnabled = true;
      current.settings.agentAutoWorkflowPaused = false;
      recordLog?.("agent.workflow.resumed", { projectId: current.activeProjectId || "" });
      saveState?.();
      render?.();
      resumePending(reason);
      getProject?.()?.windows
        ?.filter((win) => normalizeTerminalMode?.(win.terminalMode) === "agent")
        .forEach((win) => scheduleQueueDrain(win.id, 200));
    }

    function resumeForWindow(win, reason = "terminal-ready") {
      const current = state();
      if (!win || !current.settings?.agentAutoWorkflowEnabled || current.settings?.agentAutoWorkflowPaused) return;
      const project = getProject?.();
      if (!project) return;
      const finalizedCount = finalizeCompletedKernelDispatchMessages?.(project, reason) || 0;
      const taskContext = getTaskContextForWindow?.(win, project) || {};
      const retryStatuses = new Set(["target-agent-not-ready", "no-running-agent-terminal", "queue-failed", "delivery-not-confirmed", "external-queued", "queued", "preparing"]);
      const messages = (project.messages || []).filter((message) => (
        message.toRoleIds?.includes(win.roleId)
        && (message.autoWorkflow || ["orchestrator-dispatch"].includes(message.source || ""))
        && (!message.taskId || !taskContext.taskId || message.taskId === taskContext.taskId)
        && !isKernelDispatchMessageForCompletedWork?.(project, message)
        && (!message.autoWorkflowStatus || retryStatuses.has(message.autoWorkflowStatus))
        && !(project.agentDeliveries || []).some((delivery) => (
          delivery.messageId === message.id
          && delivery.windowId === win.id
          && ["pending", "sent", "submitted", "responded", "waiting", "completed"].includes(delivery.status)
        ))
      ));
      if (messages.length === 0) {
        if (finalizedCount > 0) {
          saveState?.();
          render?.();
        }
        scheduleQueueDrain(win.id, 250);
        return;
      }
      recordLog?.("agent.workflow.terminal-ready-resume", {
        projectId: project.id,
        windowId: win.id,
        roleId: win.roleId,
        reason,
        messageIds: messages.map((message) => message.id),
        count: messages.length
      });
      messages.forEach((message) => {
        message.autoWorkflow = true;
        message.autoWorkflowStatus = "terminal-ready-queued";
        schedule(message.id, reason);
      });
      saveState?.();
      scheduleQueueDrain(win.id, 350);
    }

    return {
      isActive,
      getStatusLabel,
      ensureRunning,
      stop,
      schedule,
      dispatchMessage,
      scheduleForMessages,
      scheduleQueueDrain,
      resumePending,
      startPump,
      resume,
      resumeForWindow
    };
  }

  global.COSS_AGENT_WORKFLOW_SERVICE = Object.freeze({ createAgentWorkflowService });
})(window);
