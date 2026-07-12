(function exposeSearchService(global) {
  function createSearchService({
    getState,
    translate,
    ensureProjectShape,
    getRole,
    getRoleName,
    getTaskRoleIds,
    getTaskConversationId,
    getTaskStatusValue,
    getMessageTaskLabel,
    formatDateTime,
    programs = {},
    subtaskStatusDefs = {}
  } = {}) {
    const t = translate || ((_key, fallback) => fallback || "");

    function normalizeSearchText(value) {
      return String(value || "").trim().toLowerCase();
    }

    function searchHaystackMatches(query, values) {
      const normalizedQuery = normalizeSearchText(query);
      if (!normalizedQuery) return true;
      return values.join(" ").toLowerCase().includes(normalizedQuery);
    }

    function getSearchResultScore(query, values) {
      const normalizedQuery = normalizeSearchText(query);
      if (!normalizedQuery) return 0;
      const normalizedValues = values.map((value) => String(value || "").toLowerCase());
      if (normalizedValues.some((value) => value === normalizedQuery)) return 100;
      if (normalizedValues.some((value) => value.startsWith(normalizedQuery))) return 70;
      return normalizedValues.some((value) => value.includes(normalizedQuery)) ? 30 : 0;
    }

    function buildGlobalSearchResults(query = "") {
      const currentState = getState?.() || {};
      const normalizedQuery = normalizeSearchText(query);
      const activeProjectId = currentState.activeProjectId || "";
      const results = [];
      const pushResult = (result, haystack) => {
        if (!searchHaystackMatches(normalizedQuery, haystack)) return;
        results.push({
          ...result,
          score: getSearchResultScore(normalizedQuery, haystack) + (result.projectId === activeProjectId ? 8 : 0)
        });
      };

      (currentState.projects || []).forEach((project) => {
        ensureProjectShape?.(project);
        pushResult({
          kind: "project",
          projectId: project.id,
          title: project.name || t("search.result.untitledProject", "未命名项目"),
          subtitle: project.path || t("search.result.noPath", "未设置项目路径"),
          meta: `${t("search.result.taskCount", "{{count}} 个任务", { count: project.tasks.length })} · ${t("search.result.windowCount", "{{count}} 个窗口", { count: project.windows.length })}`,
          actionLabel: t("search.result.openProject", "打开项目")
        }, [project.name, project.path, project.id]);

        project.windows.forEach((win) => {
          const role = getRole?.(win.roleId) || { name: win.roleId || "" };
          pushResult({
            kind: "window", projectId: project.id, windowId: win.id, desktopId: win.desktopId || "",
            title: win.title || programs[win.type]?.label || t("search.result.window", "窗口"),
            subtitle: `${project.name} · ${role.name} · ${programs[win.type]?.label || win.type}`,
            meta: win.minimized ? t("search.result.minimized", "已最小化") : t("search.result.running", "运行中"),
            actionLabel: t("search.result.locateWindow", "定位窗口")
          }, [project.name, project.path, win.title, win.type, role.name, win.filePath, win.url, win.browserTabs?.map((tab) => `${tab.title} ${tab.url}`).join(" ")]);
        });

        project.tasks.forEach((task) => {
          const roleNames = (getTaskRoleIds?.(task) || []).map((roleId) => getRoleName?.(roleId)).join("、");
          const status = getTaskStatusValue?.(task) || "";
          pushResult({
            kind: "task", projectId: project.id, taskId: task.id, desktopId: getTaskConversationId?.(task),
            title: task.title || t("search.result.untitledTask", "未命名任务"),
            subtitle: task.goal || t("search.result.noGoal", "无任务目标"),
            meta: `${project.name} · ${roleNames || t("search.result.unassigned", "未分配角色")} · ${subtaskStatusDefs[status]?.label || status}`,
            actionLabel: t("search.result.viewTask", "查看任务")
          }, [project.name, project.path, task.title, task.goal, task.model?.modelName, roleNames, ...(task.subtasks || []).flatMap((subtask) => [subtask.title, subtask.description, getRoleName?.(subtask.roleId)])]);
        });

        project.messages.forEach((message) => {
          const fromRole = getRoleName?.(message.fromRoleId) || message.fromRoleId || "";
          const toRoles = (message.toRoleIds || []).map((roleId) => getRoleName?.(roleId)).join("、");
          pushResult({
            kind: "message", timelineKind: "message", projectId: project.id, itemId: message.id, taskId: message.taskId || "",
            title: `${fromRole} → ${toRoles}`,
            subtitle: message.content || t("search.result.emptyMessage", "空消息"),
            meta: `${project.name} · ${getMessageTaskLabel?.(message.taskId)} · ${formatDateTime?.(message.createdAt)}`,
            actionLabel: t("search.result.viewMessage", "查看消息")
          }, [project.name, project.path, fromRole, toRoles, message.content, message.source, getMessageTaskLabel?.(message.taskId)]);
        });

        project.agentEvents.forEach((event) => {
          const roleName = getRoleName?.(event.roleId) || event.roleId || "";
          pushResult({
            kind: "event", timelineKind: "agent-event", projectId: project.id, itemId: event.id, taskId: event.taskId || "",
            title: t("search.result.agentEvent", "Agent 事件 · {{name}}", { name: roleName }),
            subtitle: event.message || event.sessionId || event.status || t("search.result.statusEvent", "状态事件"),
            meta: `${project.name} · ${event.provider || "agent"} · ${formatDateTime?.(event.receivedAt)}`,
            actionLabel: t("search.result.viewEvent", "查看事件")
          }, [project.name, project.path, roleName, event.provider, event.status, event.type, event.toolName, event.message, event.sessionId, getMessageTaskLabel?.(event.taskId)]);
        });
      });

      return results
        .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title), "zh-CN"))
        .slice(0, normalizedQuery ? 80 : 28);
    }

    return { normalizeSearchText, searchHaystackMatches, getSearchResultScore, buildGlobalSearchResults };
  }

  global.COSS_SEARCH_SERVICE = Object.freeze({ createSearchService });
})(window);
