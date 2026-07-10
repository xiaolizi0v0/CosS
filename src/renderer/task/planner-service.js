(function exposePlannerService(global) {
  function createPlannerService({ api, getModel, getProjectMemory } = {}) {
    return {
      plan(goal, project, options = {}) {
        return api?.planTask?.({
          goal,
          projectName: project?.name || "",
          roles: options.roles || [],
          projectMemory: options.projectMemory || getProjectMemory?.(project) || null,
          model: options.model || getModel?.(options.provider),
          attachments: options.attachments || []
        });
      }
    };
  }

  global.COSS_PLANNER_SERVICE = Object.freeze({ createPlannerService });
})(window);
