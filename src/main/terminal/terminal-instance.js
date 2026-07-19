/**
 * Terminal Instance — 单个终端实例的完整抽象
 *
 * 参考 VS Code 的 ITerminalInstance：
 * - 包装 ProcessManager + 元数据 + 状态
 * - 管理终端转录（transcript）
 * - 管理权限守卫（permission guard）
 * - 提供 WebContents 绑定
 * - 事件驱动的数据转发
 */

const { EventEmitter } = require("events");

const TERMINAL_INSTANCE_STATES = Object.freeze({
  CREATING: "creating",
  READY: "ready",
  RUNNING: "running",
  EXITED: "exited",
  DISPOSED: "disposed"
});

function createTerminalInstance(deps = {}) {
  const {
    id,
    processManager,
    launch,
    webContents,
    options = {},
    maxTranscriptLength = 120000,
    serializeError,
    appendLogEvent,
    sanitizeLogText,
    // Permission guard deps
    assessTerminalCommandRisk,
    shouldBlockTerminalCommand,
    getAgentPermissionPolicy
  } = deps;

  const emitter = new EventEmitter();
  let state = TERMINAL_INSTANCE_STATES.CREATING;
  let transcript = "";
  let disposed = false;
  let boundWebContents = webContents;

  // ==========================================================================
  // Transcript management
  // ==========================================================================

  function appendTranscript(data) {
    if (!data || typeof data !== "string" || !data) return;
    transcript = (transcript + data).slice(-maxTranscriptLength);
  }

  function getTranscript() {
    return transcript;
  }

  // ==========================================================================
  // WebContents binding
  // ==========================================================================

  function updateWebContents(wc) {
    boundWebContents = wc;
  }

  function getTargetWebContents(fallbackWebContents) {
    if (boundWebContents && !boundWebContents.isDestroyed()) {
      return boundWebContents;
    }
    return fallbackWebContents;
  }

  function sendToRenderer(data, fallbackWebContents) {
    appendTranscript(data);
    const target = getTargetWebContents(fallbackWebContents);
    if (target && !target.isDestroyed()) {
      target.send("terminal:data", { id, data });
    }
  }

  function sendExitToRenderer(exitCode, fallbackWebContents) {
    const target = getTargetWebContents(fallbackWebContents);
    if (target && !target.isDestroyed()) {
      target.send("terminal:exit", { id, exitCode });
    }
  }

  // ==========================================================================
  // Permission guard (参考 VS Code 的 TerminalCapabilityStore)
  // ==========================================================================

  let inputGuard = { buffer: "" };

  function getInputGuard() {
    return inputGuard;
  }

  function resetInputGuard() {
    inputGuard.buffer = "";
  }

  function processPermissionGuard(data, options = {}) {
    if (!data || typeof data !== "string") {
      return { ok: false, reason: "invalid-input" };
    }

    // Bypass for bracketed paste
    if (options?.bypassPermissionGuard
        || String(data).includes("\x1b[200~")
        || String(data).includes("\x1b[201~")) {
      if (options?.clearInputGuard !== false) {
        resetInputGuard();
      }
      appendLogEvent?.("terminal.permission.bypassed", {
        id,
        reason: String(options?.reason || "bracketed-paste").slice(0, 80),
        activeMode: launch?.activeMode || "",
        permissionMode: launch?.permissionMode || "confirm"
      });
      return { ok: true };
    }

    for (const char of data) {
      if (char === "\r" || char === "\n") {
        const command = inputGuard.buffer.trim();
        inputGuard.buffer = "";

        if (!command) continue;

        if (!assessTerminalCommandRisk || !shouldBlockTerminalCommand) {
          continue;
        }

        const assessment = assessTerminalCommandRisk(command);
        if (shouldBlockTerminalCommand(launch?.permissionMode, assessment)) {
          const policy = getAgentPermissionPolicy?.(launch?.permissionMode);
          const message =
            `\x1b[31mCosS 已按权限模式阻止命令执行。\x1b[0m\r\n` +
            `权限模式: ${policy?.label || launch?.permissionMode}\r\n` +
            `风险类型: ${assessment.label}\r\n` +
            `命令: ${command}\r\n` +
            `如需执行，请在安全中心切换权限模式，或通过前端审批弹窗确认后再执行。\r\n`;

          sendToRenderer(message);

          appendLogEvent?.("terminal.permission.blocked", {
            id,
            command: sanitizeLogText?.(command, 500),
            permissionMode: policy?.id || launch?.permissionMode,
            permissionLabel: policy?.label || "",
            activeMode: launch?.activeMode || "",
            category: assessment.category,
            severity: assessment.severity,
            riskLabel: assessment.label,
            ruleIds: assessment.ruleIds || []
          }, "warn");

          return { ok: false, reason: "permission-blocked", assessment };
        }
        continue;
      }

      if (char === "\u0003" || char === "\u0015") {
        inputGuard.buffer = "";
        continue;
      }

      if (char === "\u007f" || char === "\b") {
        inputGuard.buffer = inputGuard.buffer.slice(0, -1);
        continue;
      }

      if (char >= " " || char === "\t") {
        inputGuard.buffer += char;
        if (inputGuard.buffer.length > 2000) {
          inputGuard.buffer = inputGuard.buffer.slice(-2000);
        }
      }
    }

    return { ok: true };
  }

  // ==========================================================================
  // Process lifecycle
  // ==========================================================================

  async function start(config = {}) {
    if (state !== TERMINAL_INSTANCE_STATES.CREATING) {
      throw new Error(`TerminalInstance(${id}): cannot start in state "${state}"`);
    }

    try {
      // Wire up process events
      processManager.on("data", (data) => {
        if (disposed) return;
        emitter.emit("data", data);
        sendToRenderer(data);
      });

      processManager.on("exit", ({ exitCode }) => {
        if (disposed) return;
        state = TERMINAL_INSTANCE_STATES.EXITED;
        emitter.emit("exit", { exitCode });
        sendExitToRenderer(exitCode);
      });

      processManager.on("error", (error) => {
        if (disposed) return;
        emitter.emit("error", error);
      });

      processManager.on("ready", (info) => {
        if (disposed) return;
        state = TERMINAL_INSTANCE_STATES.READY;
        emitter.emit("ready", info);
      });

      processManager.on("stateChange", ({ newState }) => {
        if (newState === processManager.STATES.RUNNING) {
          state = TERMINAL_INSTANCE_STATES.RUNNING;
        }
        emitter.emit("processStateChange", { newState });
      });

      const result = await processManager.start(config);
      state = TERMINAL_INSTANCE_STATES.RUNNING;

      appendLogEvent?.("terminal.instance.started", {
        id,
        mode: getBackendMode(),
        requestedMode: launch?.requestedMode || "shell",
        activeMode: launch?.activeMode || "shell",
        file: launch?.file || "",
        pid: result.pid,
        helperPid: result.helperPid,
        childPid: result.childPid,
        sessionId: launch?.agentSession?.sessionId || "",
        taskId: launch?.taskContext?.taskId || launch?.agentSession?.taskId || ""
      });

      return result;
    } catch (error) {
      state = TERMINAL_INSTANCE_STATES.EXITED;
      appendLogEvent?.("terminal.instance.start-failed", {
        id,
        error: serializeError?.(error)
      }, "error");
      throw error;
    }
  }

  /**
   * Write data to the terminal process with permission guard.
   */
  function write(data, options = {}) {
    if (disposed) return false;

    // Apply permission guard if enabled
    if (launch?.activeMode !== "shell" && launch?.activeMode !== "mock") {
      const guardResult = processPermissionGuard(data, options);
      if (!guardResult.ok) return false;
    }

    return processManager.write(data);
  }

  /**
   * Write data directly, bypassing permission guard.
   */
  function writeDirect(data) {
    if (disposed) return false;
    return processManager.write(data);
  }

  function resize(cols, rows) {
    if (disposed) return false;
    return processManager.resize(cols, rows);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    state = TERMINAL_INSTANCE_STATES.DISPOSED;
    processManager.dispose();
    emitter.emit("disposed");
    emitter.removeAllListeners();
    appendLogEvent?.("terminal.instance.disposed", {
      id,
      mode: getBackendMode(),
      activeMode: launch?.activeMode || ""
    });
  }

  // ==========================================================================
  // Query
  // ==========================================================================

  function getId() { return id; }
  function getState() { return state; }
  function getLaunch() { return launch; }
  function getPid() { return processManager.getPid(); }
  function getBackendMode() { return processManager.getBackendMode(); }
  function isAlive() { return processManager.isAlive() && !disposed; }

  return Object.freeze({
    // Lifecycle
    start,
    write,
    writeDirect,
    resize,
    dispose,

    // Transcript
    getTranscript,
    appendTranscript,

    // WebContents
    updateWebContents,
    getTargetWebContents,
    sendToRenderer,
    sendExitToRenderer,

    // Permission guard
    processPermissionGuard,
    resetInputGuard,
    getInputGuard,

    // Query
    getId,
    getState,
    getLaunch,
    getPid,
    getBackendMode,
    isAlive,

    // Events (passthrough to process + instance events)
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),

    // Constants
    STATES: TERMINAL_INSTANCE_STATES,

    // For backward compatibility with existing code
    get launch() { return launch; },
    get id() { return id; },
    get pid() { return processManager.getPid(); },
    get helperPid() { return processManager.getHelperPid(); },
    get childPid() { return processManager.getChildPid(); },
    get mode() { return processManager.getBackendMode(); }
  });
}

module.exports = {
  createTerminalInstance,
  TERMINAL_INSTANCE_STATES
};
