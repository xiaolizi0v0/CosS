/**
 * Terminal IPC — 终端相关的 IPC 处理器
 *
 * 参考 VS Code 的 terminalIpc.ts：
 * - 从 register-ipc.cjs 中分离终端专用的 IPC 处理
 * - 提供清晰的 handler 签名和错误处理
 * - 支持事件推送（terminal:data, terminal:exit, terminal:agent-event）
 */

const { IPC_CHANNELS, IPC_EVENTS } = require("../../shared/ipc-contracts.cjs");

/**
 * Register all terminal-related IPC handlers.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {Object} deps
 */
function registerTerminalIpc(ipcMain, deps = {}) {
  const {
    terminalService,

    // Terminal creation deps
    normalizeCwd,
    normalizeTerminalMode,
    getEffectiveAgentProvider,
    getAgentPermissionPolicy,
    getAgentProviderLabel,
    writeProjectMcpConfig,
    resolveTerminalLaunch,
    buildAgentWelcomeMessage,

    // Backend deps
    createTerminalProcessManager,
    createTerminalInstance,
    selectBackend,

    // Logging
    serializeError,
    appendLogEvent,
    sanitizeLogText,

    // Permission guard
    assessTerminalCommandRisk,
    shouldBlockTerminalCommand,
    getAgentPermissionPolicy: getPolicy,

    // Agent output event
    emitAgentOutputEvents,
    agentOutputEventKeys
  } = deps;

  // ========================================================================
  // terminal:create
  // ========================================================================

  ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, async (event, options = {}) => {
    const id = typeof options.id === "string" ? options.id : `terminal-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const webContents = event.sender;

    terminalService.registerWebContents(id, webContents);

    // Check for existing session (reattach)
    const existing = terminalService.getInstance(id);
    if (existing) {
      appendLogEvent?.("terminal.reattached", {
        id,
        mode: existing.getBackendMode?.(),
        activeMode: existing.getLaunch?.()?.activeMode || "",
        transcriptLength: (existing.getTranscript?.() || "").length
      });

      return {
        id,
        mode: existing.getBackendMode?.(),
        requestedMode: existing.getLaunch?.()?.requestedMode || "shell",
        activeMode: existing.getLaunch?.()?.activeMode || existing.getBackendMode?.() || "shell",
        agentSession: existing.getLaunch?.()?.agentSession || null,
        reattached: true,
        transcript: existing.getTranscript?.() || ""
      };
    }

    const cwd = normalizeCwd?.(options.cwd) || options.cwd || process.cwd();
    const terminalMode = normalizeTerminalMode?.(options.terminalMode) || "shell";
    const agentProvider = getEffectiveAgentProvider?.(options) || "claude";
    const permissionPolicy = getAgentPermissionPolicy?.(options.agentPermissionMode) || { id: "confirm", label: "每次编辑确认" };
    const roleName = options.roleName || "角色终端";

    const requestedModeLabel = {
      agent: `Agent(${getAgentProviderLabel?.(agentProvider) || agentProvider})`,
      shell: "PowerShell"
    }[terminalMode];

    appendLogEvent?.("terminal.create.requested", {
      id, roleName, cwd, terminalMode, agentProvider,
      permissionMode: permissionPolicy.id,
      permissionLabel: permissionPolicy.label,
      requestedMode: requestedModeLabel,
      sessionId: options.agentSession?.sessionId || "",
      taskId: options.taskContext?.taskId || options.agentSession?.taskId || ""
    });

    // Build welcome message
    const welcome = buildAgentWelcomeMessage
      ? buildAgentWelcomeMessage(options, cwd, requestedModeLabel, permissionPolicy)
      : `\x1b[32mCosS ${roleName} terminal\x1b[0m\r\n工作目录: ${cwd}\r\n`;

    // Send welcome immediately
    webContents.send("terminal:data", { id, data: welcome });

    // Mock mode
    if (process.env.COSS_DISABLE_TERMINAL_BACKEND === "1") {
      const mockBackend = selectBackend?.({ activeMode: "mock" });
      const mockProcess = createTerminalProcessManager?.({
        id,
        backend: mockBackend?.backend || { mode: "mock" },
        launch: { activeMode: "mock", requestedMode: terminalMode },
        normalizeCwd,
        normalizeTerminalSize,
        serializeError,
        appendLogEvent,
        sanitizeLogText
      });

      const mockInstance = createTerminalInstance?.({
        id, processManager: mockProcess,
        launch: {
          requestedMode: terminalMode,
          activeMode: "mock",
          permissionMode: permissionPolicy.id,
          permissionLabel: permissionPolicy.label,
          agentSession: options.agentSession || {},
          taskContext: options.taskContext || {},
          roleId: options.roleId || "",
          roleName: options.roleName || "",
          file: "", args: [], env: {}
        },
        webContents,
        appendLogEvent,
        serializeError,
        sanitizeLogText
      });

      terminalService.registerInstance(id, mockInstance);

      webContents.send("terminal:data", {
        id,
        data: "\x1b[33m当前环境已关闭真实终端后端。\x1b[0m\r\n"
      });

      appendLogEvent?.("terminal.create.mock", {
        id, roleName, requestedMode: terminalMode, activeMode: "mock"
      }, "warn");

      return {
        id,
        mode: "mock",
        requestedMode: terminalMode,
        activeMode: "mock"
      };
    }

    // Resolve launch configuration
    const launch = resolveTerminalLaunch?.({ ...options, cwd }) || {
      file: "powershell.exe",
      args: ["-NoLogo"],
      env: {},
      requestedMode: terminalMode,
      activeMode: "shell"
    };

    launch.permissionMode = permissionPolicy.id;
    launch.permissionLabel = permissionPolicy.label;
    launch.roleId = options.roleId || "";
    launch.roleName = options.roleName || "";
    launch.projectId = options.projectId || options.agentSession?.projectId || "";
    launch.projectName = options.projectName || options.agentSession?.projectName || "";
    launch.agentSession = options.agentSession || {};
    launch.taskContext = options.taskContext || {};

    // Error mode
    if (launch.activeMode === "error" || launch.activeMode === "static") {
      const staticProcess = createTerminalProcessManager?.({
        id,
        backend: selectBackend?.({ activeMode: "mock" })?.backend || { mode: "static" },
        launch,
        normalizeCwd, normalizeTerminalSize,
        serializeError, appendLogEvent, sanitizeLogText
      });

      const staticInstance = createTerminalInstance?.({
        id, processManager: staticProcess, launch, webContents,
        appendLogEvent, serializeError, sanitizeLogText
      });

      terminalService.registerInstance(id, staticInstance);

      if (launch.warning) {
        webContents.send("terminal:data", { id, data: `\x1b[31m${launch.warning}\x1b[0m\r\n` });
      }

      appendLogEvent?.("terminal.create.static-error", {
        id, roleName,
        requestedMode: launch.requestedMode || "agent",
        activeMode: launch.activeMode,
        warning: sanitizeLogText?.(launch.warning, 500)
      }, "error");

      return {
        id,
        mode: "static",
        requestedMode: launch.requestedMode || "agent",
        activeMode: launch.activeMode
      };
    }

    // Select and create backend
    const { backend, reason: backendReason } = selectBackend?.(launch) || {};

    if (!backend) {
      webContents.send("terminal:data", {
        id,
        data: "\x1b[31m无法创建终端：没有可用的后端。\x1b[0m\r\n"
      });
      return { id, mode: "error", requestedMode: terminalMode, activeMode: "error" };
    }

    // Create process manager
    const processManager = createTerminalProcessManager?.({
      id,
      backend,
      launch,
      normalizeCwd,
      normalizeTerminalSize,
      serializeError,
      appendLogEvent,
      sanitizeLogText
    });

    if (!processManager) {
      webContents.send("terminal:data", {
        id,
        data: "\x1b[31m无法创建终端进程管理器。\x1b[0m\r\n"
      });
      return { id, mode: "error", requestedMode: terminalMode, activeMode: "error" };
    }

    // Create terminal instance
    const instance = createTerminalInstance?.({
      id,
      processManager,
      launch,
      webContents,
      options,
      serializeError,
      appendLogEvent,
      sanitizeLogText,
      assessTerminalCommandRisk,
      shouldBlockTerminalCommand,
      getAgentPermissionPolicy: getPolicy
    });

    if (!instance) {
      webContents.send("terminal:data", {
        id,
        data: "\x1b[31m无法创建终端实例。\x1b[0m\r\n"
      });
      return { id, mode: "error", requestedMode: terminalMode, activeMode: "error" };
    }

    // Wire agent output events
    if (emitAgentOutputEvents && launch.activeMode !== "shell") {
      instance.on("data", (data) => {
        emitAgentOutputEvents(webContents, id, data, launch);
      });
    }

    // Register and start
    terminalService.registerInstance(id, instance);

    try {
      await instance.start({
        cwd,
        cols: options.cols || 80,
        rows: options.rows || 24
      });
    } catch (error) {
      appendLogEvent?.("terminal.create.start-failed", {
        id,
        error: serializeError?.(error),
        backendReason
      }, "error");
      webContents.send("terminal:data", {
        id,
        data: `\x1b[31m终端启动失败: ${error.message}\x1b[0m\r\n`
      });
      return {
        id,
        mode: "error",
        requestedMode: terminalMode,
        activeMode: "error",
        error: error.message
      };
    }

    // Send warning if any
    if (launch.warning) {
      webContents.send("terminal:data", { id, data: `\x1b[33m${launch.warning}\x1b[0m\r\n\r\n` });
    }

    // Claude config onboarding
    if (launch.claudeConfig?.error) {
      webContents.send("terminal:data", {
        id,
        data: `\x1b[33mClaude Code 首次启动配置写入失败: ${launch.claudeConfig.error}\x1b[0m\r\n`
      });
    } else if (launch.claudeConfig?.changed) {
      webContents.send("terminal:data", {
        id,
        data: "\x1b[32m已自动完成 Claude Code 首次启动配置。\x1b[0m\r\n"
      });
    }

    // Auto MCP config
    if (terminalMode === "agent" && options.agentMcpAutoConfigEnabled === true) {
      const mcpConfigResult = writeProjectMcpConfig?.(null, {
        projectPath: cwd,
        projectId: options.projectId || options.agentSession?.projectId || ""
      });
      if (mcpConfigResult?.ok) {
        webContents.send("terminal:data", {
          id,
          data: `\x1b[32m已生成项目 MCP 配置: ${mcpConfigResult.rootConfigPath}\x1b[0m\r\n`
        });
      } else if (mcpConfigResult?.error) {
        webContents.send("terminal:data", {
          id,
          data: `\x1b[33m项目 MCP 配置生成失败: ${mcpConfigResult.error}\x1b[0m\r\n`
        });
      }
    }

    appendLogEvent?.("terminal.create.succeeded", {
      id, roleName,
      mode: instance.getBackendMode?.(),
      requestedMode: launch.requestedMode || "shell",
      activeMode: launch.activeMode || "shell",
      file: launch.file || "",
      backendReason,
      pid: instance.getPid?.(),
      helperPid: instance.helperPid,
      childPid: instance.childPid,
      sessionId: launch.agentSession?.sessionId || "",
      taskId: launch.taskContext?.taskId || launch.agentSession?.taskId || ""
    });

    // Execute auto-install command if configured
    if (launch.installCommand) {
      try {
        instance.writeDirect(`${launch.installCommand}\r`);
      } catch (error) {
        appendLogEvent?.("terminal.install-command.failed", {
          id,
          installCommand: launch.installCommand,
          error: serializeError?.(error)
        }, "error");
        webContents.send("terminal:data", {
          id,
          data: `\x1b[31m自动执行安装命令失败: ${error.message}\x1b[0m\r\n`
        });
      }
    }

    return {
      id,
      mode: instance.getBackendMode?.(),
      requestedMode: launch.requestedMode || "shell",
      activeMode: launch.activeMode || "shell",
      agentSession: launch.agentSession || null
    };
  });

  // ========================================================================
  // terminal:input
  // ========================================================================

  ipcMain.handle(IPC_CHANNELS.TERMINAL_INPUT, (event, id, data, options = {}) => {
    const dataLen = typeof data === "string" ? data.length : 0;
    appendLogEvent?.("terminal.ipc.input", { id, dataLen, preview: String(data||'').slice(0, 30) }, 'info');
    const instance = terminalService.getInstance(id);
    if (!instance || typeof data !== "string") {
      appendLogEvent?.("terminal.ipc.input.fail", { id, hasInstance: !!instance, isString: typeof data === "string" }, 'warn');
      return false;
    }
    try {
      const result = instance.write(data, options);
      appendLogEvent?.("terminal.ipc.input.result", { id, result }, 'info');
      return result;
    } catch (error) {
      appendLogEvent?.("terminal.ipc.input.error", { id, error: serializeError?.(error) }, "error");
      return false;
    }
  });

  // ========================================================================
  // terminal:resize
  // ========================================================================

  ipcMain.handle(IPC_CHANNELS.TERMINAL_RESIZE, (event, id, cols, rows) => {
    const instance = terminalService.getInstance(id);
    if (!instance) return false;

    try {
      return instance.resize(cols, rows);
    } catch (error) {
      appendLogEvent?.("terminal.resize.failed", {
        id, cols, rows,
        error: serializeError?.(error)
      }, "error");
      return false;
    }
  });

  // ========================================================================
  // terminal:dispose
  // ========================================================================

  ipcMain.handle(IPC_CHANNELS.TERMINAL_DISPOSE, (event, id) => {
    return terminalService.disposeInstance(id);
  });

  appendLogEvent?.("terminal.ipc.registered", {
    channels: [
      IPC_CHANNELS.TERMINAL_CREATE,
      IPC_CHANNELS.TERMINAL_INPUT,
      IPC_CHANNELS.TERMINAL_RESIZE,
      IPC_CHANNELS.TERMINAL_DISPOSE
    ]
  });
}

module.exports = { registerTerminalIpc };
