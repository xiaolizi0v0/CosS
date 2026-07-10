(function exposeKernelProjection(global) {
  function createKernelProjection({ getSteps, normalizePhase, phaseToStatus, uniqueRoleIds } = {}) {
    return {
      project(task) {
        const steps = getSteps?.(task) || [];
        const counts = { idle: 0, running: 0, done: 0 };
        steps.forEach((step) => { counts[normalizePhase?.(step.phase, step.status) || "idle"] += 1; });
        const total = steps.length;
        const status = total === 0 ? "planned" : counts.done === total ? "done" : counts.running > 0 ? "running" : "planned";
        return {
          status,
          total,
          doneCount: counts.done,
          activeCount: counts.running,
          counts,
          steps,
          roleIds: uniqueRoleIds?.(steps.map((step) => step.roleId)) || [],
          activeLocks: (task?.orchestrator?.locks || []).filter((lock) => lock.status === "locked"),
          pendingApprovals: (task?.orchestrator?.approvals || []).filter((approval) => approval.status === "pending"),
          events: Array.isArray(task?.orchestrator?.events) ? task.orchestrator.events : []
        };
      }
    };
  }

  function createKernelModel({
    getRole,
    translate,
    protocolVersion,
    normalizePhase,
    normalizeStatus,
    phaseToStatus,
    isLeaseExpired,
    getStableSubtaskId,
    uniqueRoleIds,
    phaseDefinitions
  } = {}) {
    function getTaskKernelSteps(task) {
      const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
      subtasks.forEach((subtask, index) => {
        subtask.id = getStableSubtaskId(task, subtask, index);
      });
      const subtaskById = new Map(subtasks.map((subtask) => [subtask.id, subtask]));
      const rawSteps = Array.isArray(task?.orchestrator?.steps) && task.orchestrator.steps.length > 0
        ? task.orchestrator.steps
        : subtasks.map((subtask, index) => ({
          id: `step-${subtask.id}`,
          subtaskId: subtask.id,
          roleId: subtask.roleId,
          title: subtask.title,
          description: subtask.description,
          status: subtask.status,
          phase: normalizePhase("", subtask.status),
          isEntryStep: Boolean(subtask.isEntryStep) || index === 0,
          updatedAt: subtask.updatedAt,
          createdAt: subtask.createdAt
        }));

      return rawSteps.map((step, index) => {
        const subtask = subtaskById.get(step.subtaskId) || subtasks[index] || {};
        const status = normalizeStatus(step.status || subtask.status);
        const phase = normalizePhase(step.phase, status);
        const expiredLease = isLeaseExpired(step.lease);
        return {
          ...step,
          subtask,
          roleId: getRole(step.roleId || subtask.roleId).id,
          title: step.title || subtask.title || translate("common.step", "步骤 {{index}}", { index: index + 1 }),
          description: step.description || subtask.description || "",
          phase: expiredLease && phase === "running" ? "idle" : phase,
          status: expiredLease ? "idle" : phaseToStatus(phase),
          leaseExpired: expiredLease
        };
      });
    }

    function getTaskKernelProjection(task) {
      const projection = createKernelProjection({
        getSteps: getTaskKernelSteps,
        normalizePhase,
        phaseToStatus,
        uniqueRoleIds
      }).project(task);
      return {
        version: task?.orchestrator?.version || protocolVersion,
        architecture: task?.orchestrator?.kernel?.architecture || "durable-workflow-kernel",
        ...projection,
        staleLeases: projection.steps.filter((step) => step.leaseExpired)
      };
    }

    return { getTaskKernelSteps, getTaskKernelProjection };
  }

  global.COSS_KERNEL_PROJECTION = Object.freeze({ createKernelProjection, createKernelModel });
})(window);
