function createTerminalService({
  maxTranscriptLength = 120000,
  agentOutputEventKeys = new Map(),
  createId = () => `terminal-${Date.now()}`,
  normalizeCwd,
  normalizeTerminalMode,
  getEffectiveAgentProvider,
  getAgentPermissionPolicy,
  getAgentProviderLabel,
  writeProjectMcpConfig,
  resolveTerminalLaunch,
  shouldUsePipeTerminalBackend,
  createPipeTerminal,
  shouldUseNativeTerminalBackend,
  createNativeTerminal,
  nodePty,
  createPtyTerminal,
  serializeError,
  sanitizeLogText,
  appendLogEvent,
  scheduleTerminalProcessTreeSnapshots,
  killProcessTree
} = {}) {
  const sessions = new Map();
  const transcripts = new Map();
  const terminalWebContents = new Map();

  function appendTranscript(id, data) {
    if (!id || typeof data !== "string" || !data) return;
    const previous = transcripts.get(id) || "";
    transcripts.set(id, `${previous}${data}`.slice(-maxTranscriptLength));
  }

  function getTargetWebContents(id, fallbackWebContents) {
    const current = terminalWebContents.get(id);
    if (current && !current.isDestroyed()) return current;
    return fallbackWebContents;
  }

  function sendData(fallbackWebContents, id, data) {
    appendTranscript(id, data);
    const target = getTargetWebContents(id, fallbackWebContents);
    if (target && !target.isDestroyed()) target.send("terminal:data", { id, data });
  }

  function sendExit(fallbackWebContents, id, exitCode) {
    const target = getTargetWebContents(id, fallbackWebContents);
    if (target && !target.isDestroyed()) target.send("terminal:exit", { id, exitCode });
  }

  function createSession(event, options = {}) {
    const id = typeof options.id === "string" ? options.id : createId();
    const webContents = event.sender;
    terminalWebContents.set(id, webContents);
    const existingSession = sessions.get(id);
    if (existingSession) {
      appendLogEvent("terminal.reattached", {
        id,
        mode: existingSession.mode,
        activeMode: existingSession.launch?.activeMode || "",
        transcriptLength: (transcripts.get(id) || "").length,
        sessionId: existingSession.launch?.agentSession?.sessionId || ""
      });
      return {
        id,
        mode: existingSession.mode,
        requestedMode: existingSession.launch?.requestedMode || "shell",
        activeMode: existingSession.launch?.activeMode || existingSession.mode || "shell",
        agentSession: existingSession.launch?.agentSession || null,
        reattached: true,
        transcript: transcripts.get(id) || ""
      };
    }

    const roleName = options.roleName || "角色终端";
    const cwd = normalizeCwd(options.cwd);
    const terminalMode = normalizeTerminalMode(options.terminalMode);
    const agentProvider = getEffectiveAgentProvider(options);
    const permissionPolicy = getAgentPermissionPolicy(options.agentPermissionMode);
    const requestedMode = {
      agent: `Agent(${getAgentProviderLabel(agentProvider)})`,
      shell: "PowerShell"
    }[terminalMode];
    appendLogEvent("terminal.create.requested", {
      id,
      roleName,
      cwd,
      terminalMode,
      agentProvider,
      permissionMode: permissionPolicy.id,
      permissionLabel: permissionPolicy.label,
      requestedMode,
      sessionId: options.agentSession?.sessionId || "",
      taskId: options.taskContext?.taskId || options.agentSession?.taskId || ""
    });

    sendData(
      webContents,
      id,
      `\x1b[32mCosS ${roleName} terminal\x1b[0m\r\n` +
        `工作目录: ${cwd}\r\n` +
        `请求模式: ${requestedMode}\r\n` +
        `权限模式: ${permissionPolicy.label}\r\n` +
        `会话 ID: ${options.agentSession?.sessionId || "shell"}\r\n` +
        "角色提示词、会话信息和任务上下文已写入 COSS_* 环境变量。\r\n\r\n"
    );

    if (terminalMode === "agent" && options.agentMcpAutoConfigEnabled === true) {
      const mcpConfigResult = writeProjectMcpConfig(null, {
        projectPath: cwd,
        projectId: options.projectId || options.agentSession?.projectId || ""
      });
      if (mcpConfigResult.ok) {
        sendData(webContents, id, `\x1b[32m已生成项目 MCP 配置: ${mcpConfigResult.rootConfigPath}\x1b[0m\r\n`);
      } else {
        sendData(webContents, id, `\x1b[33m项目 MCP 配置生成失败: ${mcpConfigResult.error}\x1b[0m\r\n`);
      }
    }

    if (process.env.COSS_DISABLE_TERMINAL_BACKEND === "1") {
      const mockSession = {
        write: (data) => sendData(webContents, id, data),
        resize: () => {},
        kill: () => {},
        mode: "mock",
        launch: {
          requestedMode: terminalMode,
          activeMode: "mock",
          permissionMode: permissionPolicy.id,
          permissionLabel: permissionPolicy.label
        }
      };
      sessions.set(id, mockSession);
      appendLogEvent("terminal.create.mock", {
        id,
        roleName,
        requestedMode: mockSession.launch.requestedMode,
        activeMode: "mock"
      }, "warn");
      sendData(webContents, id, "\x1b[33m当前环境已关闭真实终端后端。\x1b[0m\r\n");
      return {
        id,
        mode: "mock",
        requestedMode: mockSession.launch.requestedMode,
        activeMode: "mock"
      };
    }

    const launch = resolveTerminalLaunch({ ...options, cwd });
    launch.permissionMode = permissionPolicy.id;
    launch.permissionLabel = permissionPolicy.label;
    launch.roleId = options.roleId || "";
    launch.roleName = options.roleName || "";
    launch.projectId = options.projectId || options.agentSession?.projectId || "";
    launch.projectName = options.projectName || options.agentSession?.projectName || "";
    launch.agentSession = options.agentSession || {};
    launch.taskContext = options.taskContext || {};
    if (launch.activeMode === "error") {
      const staticSession = {
        write: () => {},
        resize: () => {},
        kill: () => {},
        mode: "static",
        launch
      };
      sessions.set(id, staticSession);
      if (launch.warning) {
        sendData(webContents, id, `\x1b[31m${launch.warning}\x1b[0m\r\n`);
      }
      appendLogEvent("terminal.create.static-error", {
        id,
        roleName,
        requestedMode: launch.requestedMode || "agent",
        activeMode: launch.activeMode,
        warning: sanitizeLogText(launch.warning, 500)
      }, "error");
      return {
        id,
        mode: "static",
        requestedMode: launch.requestedMode || "agent",
        activeMode: launch.activeMode
      };
    }

    let session;
    if (shouldUsePipeTerminalBackend(launch)) {
      session = createPipeTerminal(webContents, id, { ...options, cwd }, launch);
    }
    if (!session && shouldUseNativeTerminalBackend(launch)) {
      try {
        session = createNativeTerminal(webContents, id, { ...options, cwd }, launch);
      } catch (error) {
        appendLogEvent("terminal.native-helper.failed", {
          id,
          roleName,
          launch: {
            file: launch.file,
            args: launch.args,
            activeMode: launch.activeMode,
            requestedMode: launch.requestedMode
          },
          error: serializeError(error)
        }, "warn");
        sendData(
          webContents,
          id,
          `\x1b[33mnative terminal helper 启动失败，已切换到 node-pty: ${error.message}\x1b[0m\r\n`
        );
      }
    }
    if (!session) {
      try {
        if (!nodePty) {
          throw new Error("node-pty is unavailable");
        }
        session = createPtyTerminal(webContents, id, { ...options, cwd }, launch);
      } catch (error) {
        appendLogEvent("terminal.pty.failed", {
          id,
          roleName,
          launch: {
            file: launch.file,
            args: launch.args,
            activeMode: launch.activeMode,
            requestedMode: launch.requestedMode
          },
          error: serializeError(error)
        }, "warn");
        sendData(
          webContents,
          id,
          `\x1b[33mnode-pty 启动失败，已切换到兼容终端: ${error.message}\x1b[0m\r\n`
        );
        session = createPipeTerminal(webContents, id, { ...options, cwd }, launch);
      }
    }

    if (session.launch?.warning) {
      sendData(webContents, id, `\x1b[33m${session.launch.warning}\x1b[0m\r\n\r\n`);
    }

    if (session.launch?.claudeConfig?.error) {
      sendData(
        webContents,
        id,
        `\x1b[33mClaude Code 首次启动配置写入失败: ${session.launch.claudeConfig.error}\x1b[0m\r\n`
      );
    } else if (session.launch?.claudeConfig?.changed) {
      sendData(webContents, id, "\x1b[32m已自动完成 Claude Code 首次启动配置。\x1b[0m\r\n");
    }

    sessions.set(id, session);
    appendLogEvent("terminal.create.succeeded", {
      id,
      roleName,
      mode: session.mode,
      requestedMode: session.launch?.requestedMode || "shell",
      activeMode: session.launch?.activeMode || "shell",
      file: session.launch?.file || "",
      launchMethod: session.launch?.launchMethod || "",
      scriptPath: session.launch?.scriptPath || "",
      pid: session.pid || null,
      helperPid: session.helperPid || null,
      childPid: session.childPid || null,
      sessionId: session.launch?.agentSession?.sessionId || "",
      taskId: session.launch?.taskContext?.taskId || session.launch?.agentSession?.taskId || ""
    });
    scheduleTerminalProcessTreeSnapshots(id, session, roleName);

    if (session.launch?.installCommand) {
      try {
        session.write(`${session.launch.installCommand}\r`);
      } catch (error) {
        appendLogEvent("terminal.install-command.failed", {
          id,
          installCommand: session.launch.installCommand,
          error: serializeError(error)
        }, "error");
        sendData(webContents, id, `\x1b[31m自动执行安装命令失败: ${error.message}\x1b[0m\r\n`);
      }
    }

    return {
      id,
      mode: session.mode,
      requestedMode: session.launch?.requestedMode || "shell",
      activeMode: session.launch?.activeMode || "shell",
      agentSession: session.launch?.agentSession || null
    };
  }

  function disposeSession(id) {
    const session = sessions.get(id);
    if (!session) {
      return false;
    }

    sessions.delete(id);
    transcripts.delete(id);
    terminalWebContents.delete(id);
    agentOutputEventKeys.delete(id);
    try {
      session.kill();
      killProcessTree(session.pid);
      appendLogEvent("terminal.dispose.succeeded", {
        id,
        mode: session.mode,
        activeMode: session.launch?.activeMode || "",
        pid: session.pid || null
      });
    } catch (error) {
      killProcessTree(session.pid);
      console.warn(`Failed to kill terminal session ${id}`, error);
      appendLogEvent("terminal.dispose.failed", {
        id,
        mode: session.mode,
        pid: session.pid || null,
        error: serializeError(error)
      }, "error");
    }
    return true;
  }

  function disposeAllSessions() {
    Array.from(sessions.keys()).forEach((id) => disposeSession(id));
    agentOutputEventKeys.clear();
  }

  function clear(id) {
    if (!id) return;
    sessions.delete(id);
    transcripts.delete(id);
    terminalWebContents.delete(id);
  }

  function clearAll() {
    sessions.clear();
    transcripts.clear();
    terminalWebContents.clear();
  }

  return {
    sessions,
    transcripts,
    webContents: terminalWebContents,
    appendTranscript,
    getTargetWebContents,
    sendData,
    sendExit,
    createSession,
    disposeSession,
    disposeAllSessions,
    clear,
    clearAll,
    get(id) { return sessions.get(id) || null; },
    has(id) { return sessions.has(id); }
  };
}

module.exports = { createTerminalService };
