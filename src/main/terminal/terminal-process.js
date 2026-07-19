/**
 * Terminal Process Manager — 终端进程生命周期管理
 *
 * 参考 VS Code 的 ITerminalProcessManager：
 * - 封装子进程的完整生命周期（启动、写入、调整大小、终止）
 * - 管理进程元数据（PID、退出码、状态）
 * - 提供事件钩子供上层（TerminalInstance）消费
 * - 与 TerminalBackend 解耦，通过 backend 适配不同底层实现
 */

const { EventEmitter } = require("events");

const TERMINAL_PROCESS_STATES = Object.freeze({
  CREATING: "creating",
  RUNNING: "running",
  EXITED: "exited",
  KILLED: "killed",
  ERROR: "error"
});

function createTerminalProcessManager(deps = {}) {
  const {
    id,
    backend,
    launch,
    normalizeTerminalSize,
    normalizeCwd,
    serializeError,
    appendLogEvent,
    sanitizeLogText
  } = deps;

  const emitter = new EventEmitter();
  let state = TERMINAL_PROCESS_STATES.CREATING;
  let pid = null;
  let helperPid = null;
  let childPid = null;
  let exitCode = null;
  let disposed = false;

  // ==========================================================================
  // Event helpers
  // ==========================================================================

  function assertNotDisposed() {
    if (disposed) {
      throw new Error(`TerminalProcess(${id}): already disposed`);
    }
  }

  function assertState(expected) {
    if (state !== expected) {
      throw new Error(`TerminalProcess(${id}): expected state "${expected}", got "${state}"`);
    }
  }

  function transition(newState) {
    const old = state;
    state = newState;
    emitter.emit("stateChange", { oldState: old, newState });
  }

  // ==========================================================================
  // Public API
  // ==========================================================================

  /**
   * Spawn the child process using the configured backend.
   */
  async function start(config = {}) {
    assertNotDisposed();
    assertState(TERMINAL_PROCESS_STATES.CREATING);

    const cwd = normalizeCwd?.(config.cwd) || config.cwd || process.cwd();
    const cols = normalizeTerminalSize?.(config.cols, 80, 20, 240) || 80;
    const rows = normalizeTerminalSize?.(config.rows, 24, 6, 80) || 24;

    const spawnConfig = {
      id,
      file: launch.file,
      args: launch.args,
      cwd,
      env: launch.env,
      cols,
      rows,
      launch
    };

    // Wire up backend events
    backend.onData = (data) => {
      if (disposed || state === TERMINAL_PROCESS_STATES.EXITED) return;
      emitter.emit("data", data);
    };

    backend.onExit = (code) => {
      if (disposed) return;
      exitCode = code;
      transition(TERMINAL_PROCESS_STATES.EXITED);
      emitter.emit("exit", { exitCode: code, pid });
    };

    backend.onReady = (info = {}) => {
      if (disposed) return;
      if (info.childPid) childPid = info.childPid;
      if (info.helperPid) helperPid = info.helperPid;
      if (info.pid) pid = info.pid;
    };

    try {
      const result = await backend.spawn(spawnConfig);
      pid = result.pid || null;
      helperPid = result.helperPid || null;
      childPid = result.childPid || null;

      transition(TERMINAL_PROCESS_STATES.RUNNING);
      emitter.emit("ready", {
        pid,
        helperPid,
        childPid,
        backendMode: backend.mode
      });

      return { pid, helperPid, childPid };
    } catch (error) {
      transition(TERMINAL_PROCESS_STATES.ERROR);
      emitter.emit("error", error);
      throw error;
    }
  }

  /**
   * Write data to the child process stdin.
   */
  function write(data) {
    if (disposed) return false;
    if (state !== TERMINAL_PROCESS_STATES.RUNNING) return false;
    try {
      return backend.write(data);
    } catch (error) {
      appendLogEvent?.("terminal.process.write-failed", {
        id, error: serializeError?.(error)
      }, "warn");
      return false;
    }
  }

  /**
   * Resize the terminal.
   */
  function resize(cols, rows) {
    if (disposed) return false;
    if (state !== TERMINAL_PROCESS_STATES.RUNNING) return false;
    try {
      return backend.resize(cols, rows);
    } catch (error) {
      appendLogEvent?.("terminal.process.resize-failed", {
        id, cols, rows, error: serializeError?.(error)
      }, "warn");
      return false;
    }
  }

  /**
   * Kill the process.
   */
  function kill() {
    if (disposed) return;
    if (state === TERMINAL_PROCESS_STATES.EXITED
        || state === TERMINAL_PROCESS_STATES.KILLED) return;

    try {
      backend.kill();
    } catch (error) {
      appendLogEvent?.("terminal.process.kill-failed", {
        id, error: serializeError?.(error)
      }, "warn");
    }

    if (pid) {
      killProcessTree(pid);
    }

    transition(TERMINAL_PROCESS_STATES.KILLED);
  }

  /**
   * Kill process tree (platform-specific).
   */
  function killProcessTree(pid) {
    const normalizedPid = Number(pid);
    if (!Number.isFinite(normalizedPid) || normalizedPid <= 0) return;

    if (process.platform === "win32") {
      try {
        childProcessSpawn("taskkill.exe", ["/PID", String(normalizedPid), "/T", "/F"], {
          encoding: "utf8",
          windowsHide: true
        });
      } catch (_) {}
    } else {
      try { process.kill(normalizedPid); } catch (_) {}
    }
  }

  function childProcessSpawn(cmd, args, opts) {
    try {
      // Use the global child_process
      require("child_process").spawnSync(cmd, args, opts);
    } catch (_) {}
  }

  /**
   * Dispose and clean up all resources.
   */
  function dispose() {
    if (disposed) return;
    disposed = true;
    kill();
    backend.dispose?.();
    emitter.removeAllListeners();
  }

  // ==========================================================================
  // Query
  // ==========================================================================

  function getState() { return state; }
  function getPid() { return pid; }
  function getHelperPid() { return helperPid; }
  function getChildPid() { return childPid; }
  function getExitCode() { return exitCode; }
  function getBackendMode() { return backend.mode; }
  function isAlive() { return state === TERMINAL_PROCESS_STATES.RUNNING; }
  function isDisposed() { return disposed; }

  return Object.freeze({
    // Lifecycle
    start,
    write,
    resize,
    kill,
    dispose,

    // Query
    getState,
    getPid,
    getHelperPid,
    getChildPid,
    getExitCode,
    getBackendMode,
    isAlive,
    isDisposed,

    // Events
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),

    // Constants
    STATES: TERMINAL_PROCESS_STATES
  });
}

module.exports = {
  createTerminalProcessManager,
  TERMINAL_PROCESS_STATES
};
