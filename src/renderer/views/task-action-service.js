(function exposeTaskActionService(global) {
  function createTaskActionService({
    checkCodexStatus,
    checkCodeBuddyStatus,
    testAgentLogin,
    createTaskFromModal,
    openTaskUrlForSubtask,
    showTerminalOutputRefsModal,
    selectMessageTimelineNode,
    selectAgentFlowRole,
    selectAgentFlowEdge,
    clearAgentFlowSelection,
    autoLayoutAgentBlueprint,
    closeModal,
    focusWindow,
    confirmTaskPlanInConversation,
    recordAppLog,
    addPendingTaskPlanSubtask,
    deletePendingTaskPlanSubtask,
    updateSubtaskStatus,
    executeKernelSubtask,
    getPendingTaskPlanDraft,
    setPendingTaskPlanDraft,
    hasPendingCommandApproval,
    approvePendingCommand,
    rejectPendingCommand
  } = {}) {
    function handle(action, target) {
      if (action === "check-codex") {
        checkCodexStatus?.();
        return true;
      }
      if (action === "check-codebuddy") {
        checkCodeBuddyStatus?.();
        return true;
      }
      if (action === "test-agent-login") {
        testAgentLogin?.(target.dataset.provider);
        return true;
      }
      if (action === "create-task") {
        createTaskFromModal?.();
        return true;
      }
      if (action === "open-task-url") {
        openTaskUrlForSubtask?.(target.dataset.taskId, target.dataset.subtaskId);
        return true;
      }
      if (action === "show-terminal-output-refs") {
        showTerminalOutputRefsModal?.(target.dataset.messageId);
        return true;
      }
      if (action === "select-message-timeline-node") {
        selectMessageTimelineNode?.(target.dataset.timelineItemId || "");
        return true;
      }
      if (action === "select-agent-flow-role") {
        const blueprintNode = target.closest?.(".agent-blueprint-node");
        if (blueprintNode?.dataset.blueprintDragged === "true") {
          delete blueprintNode.dataset.blueprintDragged;
          return true;
        }
        selectAgentFlowRole?.(target.dataset.roleId || "");
        return true;
      }
      if (action === "select-agent-flow-edge") {
        selectAgentFlowEdge?.(target.dataset.flowEdgeKey || "");
        return true;
      }
      if (action === "clear-agent-flow-selection") {
        clearAgentFlowSelection?.();
        return true;
      }
      if (action === "auto-layout-agent-blueprint") {
        autoLayoutAgentBlueprint?.();
        return true;
      }
      if (action === "focus-terminal-ref-window") {
        closeModal?.();
        focusWindow?.(target.dataset.windowId);
        return true;
      }
      if (action === "confirm-task-plan") {
        Promise.resolve(confirmTaskPlanInConversation?.()).catch((error) => {
          recordAppLog?.("task.confirm.error", { error: error.message }, "error");
        });
        return true;
      }
      if (action === "add-task-plan-subtask") {
        addPendingTaskPlanSubtask?.();
        return true;
      }
      if (action === "delete-task-plan-subtask") {
        deletePendingTaskPlanSubtask?.(Number(target.dataset.planIndex));
        return true;
      }
      if (action === "set-subtask-status") {
        updateSubtaskStatus?.(target.dataset.taskId, target.dataset.subtaskId, target.dataset.status);
        return true;
      }
      if (action === "execute-kernel-subtask") {
        Promise.resolve(executeKernelSubtask?.(target.dataset.taskId, target.dataset.subtaskId)).catch((error) => {
          recordAppLog?.("kernel.step.manual-execute.error", {
            taskId: target.dataset.taskId || "",
            subtaskId: target.dataset.subtaskId || "",
            error: error.message
          }, "error");
        });
        return true;
      }
      if (action === "close-modal") {
        setPendingTaskPlanDraft?.(null);
        if (hasPendingCommandApproval?.()) {
          rejectPendingCommand?.();
        } else {
          closeModal?.();
        }
        return true;
      }
      if (action === "approve-command") {
        approvePendingCommand?.();
        return true;
      }
      if (action === "approve-command-session") {
        approvePendingCommand?.({ remember: true });
        return true;
      }
      if (action === "reject-command") {
        rejectPendingCommand?.();
        return true;
      }
      return false;
    }

    return { handle };
  }

  global.COSS_TASK_ACTION_SERVICE = Object.freeze({ createTaskActionService });
})(window);
