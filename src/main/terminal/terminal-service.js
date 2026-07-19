/**
 * Terminal Service — 终端系统核心服务
 *
 * 参考 VS Code 的 ITerminalService：
 * - 管理所有终端实例的生命周期
 * - WebContents ↔ Instance 映射
 * - 全局事件分发
 * - 进程树快照（调试）
 */

function createTerminalServiceV2(deps = {}) {
  const {
    serializeError,
    appendLogEvent,
    sanitizeLogText,
    killProcessTree,
    scheduleProcessTreeSnapshots
  } = deps;

  /** @type {Map<string, Object>} - id → TerminalInstance */
  const instances = new Map();

  /** @type {Map<string, Electron.WebContents>} - id → WebContents */
  const webContentsMap = new Map();

  /** @type {Map<string, string>} - id → output event key */
  const outputEventKeys = new Map();

  // ==========================================================================
  // Instance management
  // ==========================================================================

  /**
   * Register a new terminal instance.
   */
  function registerInstance(id, instance) {
    instances.set(id, instance);

    // Auto-cleanup on exit
    instance.on("exit", () => {
      appendLogEvent?.("terminal.service.instance-exited", {
        id,
        mode: instance.getBackendMode?.(),
        pid: instance.getPid?.()
      });
    });

    instance.on("disposed", () => {
      instances.delete(id);
      webContentsMap.delete(id);
      outputEventKeys.delete(id);
    });
  }

  /**
   * Get a terminal instance by id.
   */
  function getInstance(id) {
    return instances.get(id) || null;
  }

  /**
   * Check if an instance exists.
   */
  function hasInstance(id) {
    return instances.has(id);
  }

  /**
   * Get all active instances.
   */
  function getAllInstances() {
    return [...instances.entries()];
  }

  /**
   * Get all instance IDs.
   */
  function getInstanceIds() {
    return [...instances.keys()];
  }

  /**
   * Dispose a single instance.
   */
  function disposeInstance(id) {
    const instance = instances.get(id);
    if (!instance) return false;

    try {
      instance.dispose();
      instances.delete(id);
      webContentsMap.delete(id);
      outputEventKeys.delete(id);

      appendLogEvent?.("terminal.service.instance-disposed", {
        id,
        mode: instance.getBackendMode?.(),
        activeMode: instance.getLaunch?.()?.activeMode || "",
        pid: instance.getPid?.()
      });

      return true;
    } catch (error) {
      appendLogEvent?.("terminal.service.dispose-failed", {
        id,
        error: serializeError?.(error)
      }, "error");
      return false;
    }
  }

  /**
   * Dispose all instances.
   */
  function disposeAll() {
    for (const [id] of instances) {
      disposeInstance(id);
    }
    instances.clear();
    webContentsMap.clear();
    outputEventKeys.clear();
  }

  // ==========================================================================
  // WebContents binding
  // ==========================================================================

  /**
   * Register or update WebContents for a terminal.
   */
  function registerWebContents(id, webContents) {
    webContentsMap.set(id, webContents);
    const instance = instances.get(id);
    if (instance && typeof instance.updateWebContents === "function") {
      instance.updateWebContents(webContents);
    }
  }

  /**
   * Get WebContents for a terminal.
   */
  function getWebContents(id) {
    return webContentsMap.get(id) || null;
  }

  // ==========================================================================
  // Transcript access
  // ==========================================================================

  /**
   * Get transcript for a terminal.
   */
  function getTranscript(id) {
    const instance = instances.get(id);
    return instance?.getTranscript?.() || "";
  }

  // ==========================================================================
  // Agent output event tracking
  // ==========================================================================

  function setOutputEventKey(id, key) {
    if (key) outputEventKeys.set(id, key);
    else outputEventKeys.delete(id);
  }

  function getOutputEventKey(id) {
    return outputEventKeys.get(id);
  }

  // ==========================================================================
  // Backward-compatible shortcuts (for existing main.cjs code)
  // ==========================================================================

  function get(id) {
    return instances.get(id) || null;
  }

  function has(id) {
    return instances.has(id);
  }

  return Object.freeze({
    // Instance lifecycle
    registerInstance,
    getInstance,
    hasInstance,
    getAllInstances,
    getInstanceIds,
    disposeInstance,
    disposeAll,

    // WebContents
    registerWebContents,
    getWebContents,

    // Transcript
    getTranscript,

    // Output events
    setOutputEventKey,
    getOutputEventKey,

    // Backward compat
    get,
    has,

    // For existing code that needs direct Map access
    get instances() { return instances; },
    get webContents() { return webContentsMap; },
    get sessions() { return instances; }
  });
}

module.exports = { createTerminalServiceV2 };
