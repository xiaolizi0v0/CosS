/**
 * CosS Terminal System — 模块索引
 *
 * 基于 VS Code 终端架构设计：
 *
 * 层次结构:
 *   TerminalService (终端服务)
 *     └── TerminalInstance[] (终端实例)
 *           └── TerminalProcessManager (进程管理)
 *                 └── Backend (后端: ConPTY / node-pty / pipe)
 *
 * 使用方式:
 *   const { createTerminalSystem } = require('./main/terminal');
 *   const terminalSystem = createTerminalSystem(deps);
 *   terminalSystem.registerIpc(ipcMain);
 */

const { createBackendRegistry } = require("./terminal-backend");
const { createTerminalProcessManager, TERMINAL_PROCESS_STATES } = require("./terminal-process");
const { createTerminalInstance, TERMINAL_INSTANCE_STATES } = require("./terminal-instance");
const { createTerminalServiceV2 } = require("./terminal-service");
const { registerTerminalIpc } = require("./terminal-ipc");
const {
  getShellCommand,
  getShellEnv,
  getWindowsShellEnv,
  buildAgentEnvironment,
  normalizeTerminalSize,
  normalizeCwd,
  normalizeTerminalMode,
  normalizeAgentProvider,
  createTerminalProfile,
  getCaseInsensitiveEnvValue,
  commandExists
} = require("./terminal-environment");

/**
 * Create the complete terminal system.
 *
 * @param {Object} deps - Dependencies from main.cjs
 * @returns {Object} Terminal system API
 */
function createTerminalSystem(deps = {}) {
  const {
    // From main.cjs
    nodePty,
    serializeError,
    appendLogEvent,
    sanitizeLogText,
    // Agent / permission
    assessTerminalCommandRisk,
    shouldBlockTerminalCommand,
    getAgentPermissionPolicy,
    // Agent output
    emitAgentOutputEvents,
    agentOutputEventKeys,
    // Launch resolution
    resolveTerminalLaunch,
    getEffectiveAgentProvider,
    getAgentProviderLabel,
    writeProjectMcpConfig,
    // Process tree
    killProcessTree,
    scheduleTerminalProcessTreeSnapshots
  } = deps;

  // ==========================================================================
  // Create backend registry with default backends
  // ==========================================================================

  const backendRegistry = createBackendRegistry({
    serializeError,
    appendLogEvent,
    sanitizeLogText
  });

  backendRegistry.registerDefaults({
    nodePty,
    normalizeTerminalSize,
    serializeError,
    appendLogEvent,
    sanitizeLogText
  });

  function selectBackend(launch) {
    return backendRegistry.select(launch);
  }

  // ==========================================================================
  // Create terminal service
  // ==========================================================================

  const terminalService = createTerminalServiceV2({
    serializeError,
    appendLogEvent,
    sanitizeLogText,
    killProcessTree,
    scheduleTerminalProcessTreeSnapshots
  });

  // ==========================================================================
  // Factory for creating terminal instances
  // ==========================================================================

  function createTerminal(options = {}) {
    const {
      id,
      webContents,
      launch,
      ...instanceDeps
    } = options;

    const { backend } = selectBackend(launch);

    if (!backend) {
      throw new Error("No terminal backend available");
    }

    const processManager = createTerminalProcessManager({
      id,
      backend,
      launch,
      normalizeCwd,
      normalizeTerminalSize,
      serializeError,
      appendLogEvent,
      sanitizeLogText
    });

    const instance = createTerminalInstance({
      id,
      processManager,
      launch,
      webContents,
      serializeError,
      appendLogEvent,
      sanitizeLogText,
      assessTerminalCommandRisk,
      shouldBlockTerminalCommand,
      getAgentPermissionPolicy,
      ...instanceDeps
    });

    terminalService.registerInstance(id, instance);

    return instance;
  }

  // ==========================================================================
  // IPC registration helper
  // ==========================================================================

  function registerIpc(ipcMain) {
    registerTerminalIpc(ipcMain, {
      terminalService,

      // Factories
      createTerminalProcessManager,
      createTerminalInstance,
      selectBackend,

      // Environment
      normalizeCwd,
      normalizeTerminalMode,
      normalizeTerminalSize,
      getEffectiveAgentProvider,
      getAgentPermissionPolicy,
      getAgentProviderLabel,

      // Launch
      resolveTerminalLaunch,
      writeProjectMcpConfig,

      // Logging
      serializeError,
      appendLogEvent,
      sanitizeLogText,

      // Permission
      assessTerminalCommandRisk,
      shouldBlockTerminalCommand,

      // Agent output
      emitAgentOutputEvents,
      agentOutputEventKeys
    });
  }

  return Object.freeze({
    // Core service
    terminalService,
    backendRegistry,

    // Factories
    createTerminal,
    selectBackend,

    // IPC
    registerIpc,

    // Environment (passthrough)
    getShellCommand,
    getShellEnv,
    getWindowsShellEnv,
    buildAgentEnvironment,
    normalizeTerminalSize,
    normalizeCwd,
    normalizeTerminalMode,
    normalizeAgentProvider,
    createTerminalProfile,
    getCaseInsensitiveEnvValue,
    commandExists,

    // Constants
    TERMINAL_PROCESS_STATES,
    TERMINAL_INSTANCE_STATES
  });
}

module.exports = {
  createTerminalSystem,

  // Re-export individual modules for direct use
  createBackendRegistry,
  createTerminalProcessManager,
  createTerminalInstance,
  createTerminalServiceV2,
  registerTerminalIpc,

  TERMINAL_PROCESS_STATES,
  TERMINAL_INSTANCE_STATES
};
