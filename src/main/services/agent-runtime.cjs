const childProcess = require("child_process");

function createAgentRuntime({
  getWindowsShellEnv,
  findCommandPaths,
  preferWindowsCmdShim,
  runCommandForStatus,
  commandOutput,
  commandErrorDetail,
  getNpmCandidates,
  getNpmCommand,
  commandExists,
  getCodexAuthState,
  getCodeBuddyAuthState,
  getClaudeAuthState,
  ensureClaudeOnboardingCompleted,
  getCodexInstallCommand,
  getCodeBuddyInstallCommand,
  packages = {}
} = {}) {
  const {
    claudePackage = "Anthropic.ClaudeCode",
    codexPackage = "@openai/codex",
    codeBuddyPackage = "@tencent-ai/codebuddy-code"
  } = packages;

  function checkVersion(command, env, label) {
    const result = runCommandForStatus(command, ["--version"], env);
    const output = commandOutput(result);
    return {
      runnable: result.status === 0,
      version: result.status === 0 ? output : "",
      errorDetail: commandErrorDetail(result, `${label} --version`)
    };
  }

  function getNpmStatus(env = getWindowsShellEnv()) {
    const candidates = getNpmCandidates(env);
    const attempts = candidates.map((command) => {
      const result = runCommandForStatus(command, ["--version"], env);
      const output = commandOutput(result);
      return { command, status: result.status, output, errorDetail: commandErrorDetail(result, `${command} --version`) };
    });
    const success = attempts.find((attempt) => attempt.status === 0 && attempt.output.length > 0);
    const firstAttempt = attempts[0] || { command: getNpmCommand(), status: null, output: "", errorDetail: "未找到 npm 命令入口。" };
    return {
      command: success?.command || firstAttempt.command,
      candidates,
      usable: Boolean(success),
      version: success?.output || "",
      errorDetail: success ? "" : firstAttempt.errorDetail,
      runner: process.platform === "win32" ? "powershell-hidden" : "direct"
    };
  }

  function getWingetStatus() {
    if (process.platform !== "win32") {
      return { exists: false, usable: false, detail: "当前安装流程仅支持 Windows 系统上的 winget。" };
    }
    const env = getWindowsShellEnv();
    const lookup = childProcess.spawnSync("where.exe", ["winget"], { encoding: "utf8", env, windowsHide: true });
    if (lookup.status !== 0) {
      return { exists: false, usable: false, detail: "未找到 winget 命令入口。" };
    }
    const version = childProcess.spawnSync("winget", ["--version"], { encoding: "utf8", env, timeout: 5000, windowsHide: true });
    const output = `${version.stdout || ""}${version.stderr || ""}`.trim();
    return {
      exists: true,
      usable: version.status === 0 && output.length > 0,
      detail: version.status === 0 && output.length > 0 ? output : `检测到 winget 入口，但 winget --version 运行失败或无输出，退出码 ${version.status ?? "unknown"}。`
    };
  }

  function getCodexCommandStatus(env = getWindowsShellEnv()) {
    const requestedCommand = process.env.COSS_CODEX_COMMAND || "codex";
    const lookupPaths = findCommandPaths(requestedCommand, env);
    const npmStatus = getNpmStatus(env);
    const attemptedCommands = [requestedCommand, ...lookupPaths].filter((item, index, list) => item && list.indexOf(item) === index);
    const attempts = attemptedCommands.map((item) => ({ command: item, status: checkVersion(item, env, "codex") }));
    const runnableAttempt = attempts.find((attempt) => attempt.status.runnable);
    const primaryStatus = attempts[0]?.status || checkVersion(requestedCommand, env, "codex");
    const hasWindowsAppsPackagePath = lookupPaths.some((item) => item.toLowerCase().includes("\\windowsapps\\openai.codex_"));
    return {
      command: runnableAttempt ? preferWindowsCmdShim(runnableAttempt.command, lookupPaths) : requestedCommand,
      requestedCommand,
      lookupPaths,
      runnable: Boolean(runnableAttempt),
      version: runnableAttempt?.status.version || "",
      errorDetail: runnableAttempt ? "" : primaryStatus.errorDetail,
      hasWindowsAppsPackagePath,
      npm: npmStatus,
      auth: getCodexAuthState(),
      installCommand: getCodexInstallCommand(npmStatus.command),
      autoInstallDisabled: process.env.COSS_DISABLE_CODEX_AUTO_INSTALL === "1",
      checkedAt: new Date().toISOString()
    };
  }

  function getCodeBuddyCommandStatus(env = getWindowsShellEnv()) {
    const requestedCommand = process.env.COSS_CODEBUDDY_COMMAND || "codebuddy";
    const aliasCommand = requestedCommand === "codebuddy" ? "cbc" : "";
    const lookupPaths = [...findCommandPaths(requestedCommand, env), ...(aliasCommand ? findCommandPaths(aliasCommand, env) : [])]
      .filter((item, index, list) => item && list.indexOf(item) === index);
    const npmStatus = getNpmStatus(env);
    const attemptedCommands = [requestedCommand, ...lookupPaths].filter((item, index, list) => item && list.indexOf(item) === index);
    const attempts = attemptedCommands.map((item) => ({ command: item, status: checkVersion(item, env, "codebuddy") }));
    const runnableAttempt = attempts.find((attempt) => attempt.status.runnable);
    const primaryStatus = attempts[0]?.status || checkVersion(requestedCommand, env, "codebuddy");
    return {
      command: runnableAttempt ? preferWindowsCmdShim(runnableAttempt.command, lookupPaths) : requestedCommand,
      requestedCommand,
      aliasCommand,
      lookupPaths,
      runnable: Boolean(runnableAttempt),
      version: runnableAttempt?.status.version || "",
      errorDetail: runnableAttempt ? "" : primaryStatus.errorDetail,
      npm: npmStatus,
      auth: getCodeBuddyAuthState(env),
      installCommand: getCodeBuddyInstallCommand(npmStatus.command),
      autoInstallDisabled: process.env.COSS_DISABLE_CODEBUDDY_AUTO_INSTALL === "1",
      checkedAt: new Date().toISOString()
    };
  }

  function getClaudeCodeStatus() {
    const command = process.env.COSS_CLAUDE_COMMAND || "claude";
    const env = getWindowsShellEnv();
    const installed = commandExists(command, env);
    const winget = getWingetStatus();
    const onboarding = ensureClaudeOnboardingCompleted();
    let version = "";
    let versionError = "";
    if (installed) {
      const result = childProcess.spawnSync(command, ["--version"], { encoding: "utf8", env, timeout: 5000, windowsHide: true });
      version = `${result.stdout || ""}${result.stderr || ""}`.trim();
      if (result.status !== 0 && !version) versionError = `claude --version exited with ${result.status ?? "unknown"}`;
    }
    return {
      command,
      installed,
      version,
      versionError,
      onboarding,
      auth: getClaudeAuthState(onboarding),
      winget,
      installCommand: `winget install ${claudePackage}`,
      autoInstallDisabled: process.env.COSS_DISABLE_CLAUDE_AUTO_INSTALL === "1",
      checkedAt: new Date().toISOString()
    };
  }

  return {
    getNpmStatus,
    getWingetStatus,
    getCodexCommandStatus,
    getCodeBuddyCommandStatus,
    getClaudeCodeStatus,
    async ensure(provider) {
      const status = await this.status?.(provider);
      return status?.runnable ? status : this.install ? this.install(provider) : status;
    }
  };
}

module.exports = { createAgentRuntime };
