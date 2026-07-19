function registerIpcHandlers(ipcMain, handlers = {}) {
  Object.entries(handlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler);
  });
  return handlers;
}

module.exports = { registerIpcHandlers };

function registerApplicationIpc(ipcMain, dependencies = {}) {
  const {
    IPC_CHANNELS,
    app,
    readState,
    mergeStateForRendererSave,
    writeState,
    appendLogEvent,
    serializeError,
    handlePlanTask,
    handleTestModelConnectivity,
    appVersion,
    getLogDirectory,
    getMcpServerInfo,
    shell,
    openLogDirectory,
    getStateMeta,
    checkProjectMcpConfig,
    writeProjectMcpConfig,
    readMcpAuditEvents,
    getStorageInfo,
    createManualStateBackup,
    exportStorageState,
    importStorageState,
    exportDiagnosticsPackage,
    openStorageDirectory,
    selectProjectDirectory,
    selectProjectFile,
    listProjectFiles,
    readProjectFile,
    writeProjectFile,
    createProjectFolder,
    renameProjectFile,
    deleteProjectFile,
    createMainWindow,
    controlWindow,
    getWindowFromEvent,
    getClaudeCodeStatus,
    sanitizeLogText,
    getCodexCommandStatus,
    handleWorldAgentRun,
    handleBlueprintCommandRun,
    handleBlueprintAgentRun,
    handleBlueprintBrowserRun,
    handleBlueprintMcpRun,
    getCodeBuddyCommandStatus,
    getShellEnv,
    getWindowsShellEnv,
    claudeCodeWingetPackage,
    childProcess,
    codexNpmPackage,
    buildPowerShellInvocation,
    getNpmCommand,
    getCodexInstallCommand,
    codeBuddyNpmPackage,
    getCodeBuddyInstallCommand,
    testAgentRemoteLogin,
    createTerminalSession,
    terminalSessions,
    processTerminalPermissionGuard,
    disposeTerminalSession
  } = dependencies;
  ipcMain.handle(IPC_CHANNELS.STATE_LOAD, () => readState());
  ipcMain.handle(IPC_CHANNELS.STATE_SAVE, async (_event, state) => {
    try {
      const durableState = await readState();
      const mergedState = mergeStateForRendererSave(state, durableState);
      const result = await writeState(mergedState);
      appendLogEvent("state.saved", {
        projects: Array.isArray(mergedState?.projects) ? mergedState.projects.length : 0,
        mergedDurableState: Boolean(durableState?.projects?.length)
      });
      return result;
    } catch (error) {
      appendLogEvent("state.save.failed", {
        projects: Array.isArray(state?.projects) ? state.projects.length : 0,
        error: serializeError(error)
      }, "error");
      throw error;
    }
  });
  ipcMain.handle(IPC_CHANNELS.LLM_PLAN_TASK, handlePlanTask);
  ipcMain.handle(IPC_CHANNELS.LLM_TEST_MODEL, handleTestModelConnectivity);
  ipcMain.handle("app:info", () => ({
    version: appVersion,
    logDirectory: getLogDirectory(),
    userData: app.getPath("userData"),
    mcp: getMcpServerInfo()
  }));
  ipcMain.handle("app:open-external-url", async (_event, url) => {
    const targetUrl = new URL(String(url || ""));
    if (!["http:", "https:"].includes(targetUrl.protocol)) {
      throw new Error("仅支持打开 HTTP/HTTPS 链接。");
    }
    await shell.openExternal(targetUrl.toString());
    appendLogEvent("app.open-external-url", { url: targetUrl.toString() });
    return { ok: true };
  });
  ipcMain.handle("app:log-event", (_event, eventName, payload = {}, level = "info") => appendLogEvent(eventName, payload, level));
  ipcMain.handle("logs:open-directory", () => openLogDirectory());
  registerIpcHandlers(ipcMain, {
    [IPC_CHANNELS.STATE_META]: () => getStateMeta()
  });
  ipcMain.handle("mcp:info", (_event, context = {}) => getMcpServerInfo(context));
  ipcMain.handle("mcp:check-project-config", checkProjectMcpConfig);
  ipcMain.handle("mcp:write-project-config", writeProjectMcpConfig);
  ipcMain.handle("mcp:audit-events", readMcpAuditEvents);
  ipcMain.handle(IPC_CHANNELS.STORAGE_INFO, () => getStorageInfo());
  ipcMain.handle(IPC_CHANNELS.STORAGE_BACKUP, () => createManualStateBackup());
  ipcMain.handle("storage:export", exportStorageState);
  ipcMain.handle("storage:import", importStorageState);
  ipcMain.handle("storage:diagnostics", exportDiagnosticsPackage);
  ipcMain.handle("storage:open-directory", () => openStorageDirectory());
  ipcMain.handle("dialog:select-project-directory", selectProjectDirectory);
  ipcMain.handle("dialog:select-project-file", selectProjectFile);
  ipcMain.handle("files:list", listProjectFiles);
  ipcMain.handle("files:read", readProjectFile);
  ipcMain.handle("files:write", writeProjectFile);
  ipcMain.handle("files:create-folder", createProjectFolder);
  ipcMain.handle("files:rename", renameProjectFile);
  ipcMain.handle("files:delete", deleteProjectFile);
  ipcMain.handle("window:new", () => {
    appendLogEvent("window.new");
    createMainWindow();
    return { ok: true };
  });
  ipcMain.handle("window:control", controlWindow);
  ipcMain.handle("window:is-maximized", (event) => Boolean(getWindowFromEvent(event)?.isMaximized()));
  ipcMain.handle("claude:status", () => {
    const status = getClaudeCodeStatus();
    appendLogEvent("agent.claude.status.checked", {
      installed: Boolean(status.installed),
      command: status.command || "",
      version: sanitizeLogText(status.version, 80),
      installCommand: status.installCommand || "",
      onboardingConfigured: Boolean(status.onboarding?.configured),
      authLoggedIn: Boolean(status.auth?.loggedIn),
      authSource: status.auth?.source || "",
      errorDetail: sanitizeLogText(status.versionError, 300)
    }, status.installed ? "info" : "warn");
    return status;
  });
  ipcMain.handle("codex:status", () => {
    const status = getCodexCommandStatus();
    appendLogEvent("agent.codex.status.checked", {
      runnable: Boolean(status.runnable),
      command: status.command || "",
      requestedCommand: status.requestedCommand || "",
      version: sanitizeLogText(status.version, 80),
      npmUsable: Boolean(status.npm?.usable),
      npmCommand: status.npm?.command || "",
      authLoggedIn: Boolean(status.auth?.loggedIn),
      authSource: status.auth?.source || "",
      autoInstallDisabled: Boolean(status.autoInstallDisabled),
      errorDetail: sanitizeLogText(status.errorDetail, 300)
    }, status.runnable ? "info" : "warn");
    return status;
  });
  ipcMain.handle(IPC_CHANNELS.WORLD_AGENT_RUN, handleWorldAgentRun);
  ipcMain.handle(IPC_CHANNELS.BLUEPRINT_COMMAND_RUN, handleBlueprintCommandRun);
  ipcMain.handle(IPC_CHANNELS.BLUEPRINT_AGENT_RUN, handleBlueprintAgentRun);
  ipcMain.handle(IPC_CHANNELS.BLUEPRINT_BROWSER_RUN, handleBlueprintBrowserRun);
  ipcMain.handle(IPC_CHANNELS.BLUEPRINT_MCP_RUN, handleBlueprintMcpRun);
  ipcMain.handle("codebuddy:status", (_event, request = {}) => {
    const apiKey = typeof request === "object" && request !== null ? String(request.apiKey || "").trim() : "";
    const status = getCodeBuddyCommandStatus(getShellEnv(apiKey ? { CODEBUDDY_API_KEY: apiKey } : {}));
    appendLogEvent("agent.codebuddy.status.checked", {
      runnable: Boolean(status.runnable),
      command: status.command || "",
      requestedCommand: status.requestedCommand || "",
      version: sanitizeLogText(status.version, 80),
      npmUsable: Boolean(status.npm?.usable),
      npmCommand: status.npm?.command || "",
      authLoggedIn: Boolean(status.auth?.loggedIn),
      authSource: status.auth?.source || "",
      autoInstallDisabled: Boolean(status.autoInstallDisabled),
      errorDetail: sanitizeLogText(status.errorDetail, 300)
    }, status.runnable ? "info" : "warn");
    return status;
  });
  ipcMain.handle("agent:install-claude", async () => {
    const env = getWindowsShellEnv();
    const installCommand = `winget install ${claudeCodeWingetPackage} --silent --accept-package-agreements`;
    try {
      const result = childProcess.spawnSync("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-Command", installCommand
      ], { encoding: "utf8", env, timeout: 300000, windowsHide: true });
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
      const ok = result.status === 0;
      appendLogEvent("agent.install.claude", { ok, output: sanitizeLogText(output, 500) }, ok ? "info" : "warn");
      return { ok, output, installCommand };
    } catch (error) {
      appendLogEvent("agent.install.claude", { ok: false, error: serializeError(error) }, "error");
      return { ok: false, error: error.message, installCommand };
    }
  });
  ipcMain.handle("agent:install-codex", async () => {
    const env = getWindowsShellEnv();
    const npmCommand = getNpmCommand();
    const command = buildPowerShellInvocation(npmCommand, ["install", "-g", codexNpmPackage]);
    try {
      const result = childProcess.spawnSync("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-Command", command
      ], { encoding: "utf8", env, timeout: 300000, windowsHide: true });
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
      const ok = result.status === 0;
      appendLogEvent("agent.install.codex", { ok, output: sanitizeLogText(output, 500) }, ok ? "info" : "warn");
      return { ok, output, installCommand: getCodexInstallCommand(npmCommand) };
    } catch (error) {
      appendLogEvent("agent.install.codex", { ok: false, error: serializeError(error) }, "error");
      return { ok: false, error: error.message, installCommand: getCodexInstallCommand(npmCommand) };
    }
  });
  ipcMain.handle("agent:install-codebuddy", async () => {
    const env = getWindowsShellEnv();
    const npmCommand = getNpmCommand();
    const command = buildPowerShellInvocation(npmCommand, ["install", "-g", codeBuddyNpmPackage]);
    try {
      const result = childProcess.spawnSync("powershell.exe", [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
        "-ExecutionPolicy", "Bypass",
        "-Command", command
      ], { encoding: "utf8", env, timeout: 300000, windowsHide: true });
      const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
      const ok = result.status === 0;
      appendLogEvent("agent.install.codebuddy", { ok, output: sanitizeLogText(output, 500) }, ok ? "info" : "warn");
      return { ok, output, installCommand: getCodeBuddyInstallCommand(npmCommand) };
    } catch (error) {
      appendLogEvent("agent.install.codebuddy", { ok: false, error: serializeError(error) }, "error");
      return { ok: false, error: error.message, installCommand: getCodeBuddyInstallCommand(npmCommand) };
    }
  });
  ipcMain.handle("agent:login-test", testAgentRemoteLogin);
  // Terminal IPC is now handled by the new terminal system
  // See src/main/terminal/terminal-ipc.js
  if (typeof registerTerminalIpcHandlers === "function") {
    registerTerminalIpcHandlers(ipcMain);
  } else {
    // Legacy fallback (will be removed in future versions)
    ipcMain.handle(IPC_CHANNELS.TERMINAL_CREATE, createTerminalSession);
    ipcMain.handle("terminal:input", (event, id, data, options = {}) => {
      console.log(`[TERM-DBG-MAIN-LEGACY] terminal:input id=${id} len=${typeof data==='string'?data.length:'-'}`);
      const session = terminalSessions.get(id);
      if (session && typeof data === "string") {
        try {
          const guardResult = processTerminalPermissionGuard(event.sender, id, session, data, options);
          if (!guardResult.ok) {
            console.log(`[TERM-DBG-MAIN-LEGACY] terminal:input GUARD BLOCKED`);
            return false;
          }
          session.write(data);
          console.log(`[TERM-DBG-MAIN-LEGACY] terminal:input OK`);
          return true;
        } catch (error) {
          console.warn(`Failed to write to terminal session ${id}`, error);
          appendLogEvent("terminal.input.failed", { id, error: serializeError(error) }, "error");
        }
      } else {
        console.log(`[TERM-DBG-MAIN-LEGACY] terminal:input NO SESSION or not string`);
      }
      return false;
    });
    ipcMain.handle("terminal:resize", (_event, id, cols, rows) => {
      const session = terminalSessions.get(id);
      if (session) {
        try {
          const resized = session.resize(cols, rows);
          return resized !== false;
        } catch (error) {
          console.warn(`Failed to resize terminal session ${id}`, error);
          appendLogEvent("terminal.resize.failed", { id, cols, rows, error: serializeError(error) }, "error");
        }
      }
      return false;
    });
    ipcMain.handle(IPC_CHANNELS.TERMINAL_DISPOSE, (_event, id) => disposeTerminalSession(id));
  }

}

module.exports = { registerIpcHandlers, createIpcRegistrar: registerApplicationIpc };
