(function exposeDefaultState(global) {
  function createDefaultState(createModelConfigs) {
    return {
      activeProjectId: null,
      projects: [],
      activeWorldId: "",
      activeBlueprintId: "",
      activeSidebarSection: "projects",
      worlds: [],
      blueprints: [],
      deletedProjectIds: [],
      settings: {
        agentProvider: "claude",
        agentFallbackToShell: true,
        agentPermissionMode: "confirm",
        agentAutoWorkflowEnabled: true,
        agentAutoWorkflowPaused: false,
        agentMcpAutoConfigEnabled: false,
        codeBuddyApiKey: "",
        language: "zh-CN",
        userProfile: { displayName: "本地用户", avatarDataUrl: "" },
        agentPromptTemplate:
          "你是 CosS 工作区中的{{roleName}}。\n" +
          "角色 ID：{{roleId}}\n" +
          "角色职责：{{roleDescription}}\n" +
          "项目：{{projectName}}\n" +
          "工作目录：{{workspace}}\n" +
          "Agent 权限模式：{{agentPermissionLabel}}\n" +
          "{{agentPermissionInstructions}}\n" +
          "当前任务：{{taskTitle}}\n" +
          "子任务：{{subtaskTitle}}\n" +
          "子任务说明：{{subtaskDescription}}\n\n" +
          "请只在当前项目范围内工作。执行高风险命令、删除文件、修改依赖或访问敏感信息前，先说明风险并等待用户确认。\n" +
          "CosS 使用任务调度器按步骤推进协作。你不能直接给其他角色分配任务，不能发明不存在的角色，也不能绕过共享任务板。\n" +
          "开始工作前优先读取任务板并领取当前步骤；长任务中保持进度更新；完成后必须提交结果。\n" +
          "只完成当前步骤。当前步骤完成后，系统会启动预先规划好的下一位协作者。",
        modelProvider: "system",
        modelConfigs: createModelConfigs()
      }
    };
  }

  global.COSS_DEFAULT_STATE = Object.freeze({ createDefaultState });
})(window);
