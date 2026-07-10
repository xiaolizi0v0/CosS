(function exposeTaskService(global) {
  function createTaskService({ getState, saveState, render, createId, normalizeTask } = {}) {
    return {
      find(projectId, taskId) {
        const project = (getState()?.projects || []).find((item) => item.id === projectId);
        return project?.tasks?.find((item) => item.id === taskId) || null;
      },
      create(projectId, draft = {}) {
        const project = (getState()?.projects || []).find((item) => item.id === projectId);
        if (!project) return null;
        const task = normalizeTask?.({ ...draft, id: draft.id || createId?.("task") }) || draft;
        project.tasks ||= [];
        project.tasks.unshift(task);
        saveState?.();
        render?.();
        return task;
      },
      update(projectId, taskId, patch = {}) {
        const task = this.find(projectId, taskId);
        if (!task) return null;
        Object.assign(task, patch, { updatedAt: new Date().toISOString() });
        saveState?.();
        render?.();
        return task;
      }
    };
  }

  global.COSS_TASK_SERVICE = Object.freeze({ createTaskService });
})(window);
