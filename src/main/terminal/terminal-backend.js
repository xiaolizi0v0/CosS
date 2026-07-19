/**
 * Terminal Backend — 可插拔的终端后端实现
 *
 * 参考 VS Code 的 ITerminalChildProcess / IPtyService 设计：
 * - 每个后端实现统一的 IBackend 接口
 * - BackendRegistry 负责选择最佳后端
 * - 支持优雅降级链: ConPTY → node-pty → pipe
 */

const childProcess = require("child_process");
const path = require("path");
const fs = require("fs");

// ============================================================================
// IBackend 接口规范
// ============================================================================
// {
//   spawn(config): Promise<{ pid, helperPid?, childPid? }>
//   write(data): boolean
//   resize(cols, rows): boolean
//   kill(): void
//   dispose(): void
//   getPid(): number | null
//   mode: string  // 'pty' | 'native-helper' | 'pipe'
//   onData: callback
//   onExit: callback
//   onReady: callback
// }

// ============================================================================
// PtyBackend — 基于 node-pty
// ============================================================================

function createPtyBackend(deps = {}) {
  const { nodePty, normalizeTerminalSize, serializeError, appendLogEvent } = deps;

  return {
    mode: "pty",

    spawn(config) {
      const { id, file, args, cwd, env, cols = 80, rows = 24, launch } = config;

      if (!nodePty) {
        return Promise.reject(new Error("node-pty is unavailable"));
      }

      let ptyProcess;
      try {
        ptyProcess = nodePty.spawn(file, args, {
          name: "xterm-256color",
          cols,
          rows,
          cwd,
          env
        });
      } catch (error) {
        appendLogEvent?.("terminal.backend.pty.spawn-failed", {
          id,
          file,
          args,
          cwd,
          error: serializeError?.(error)
        }, "error");
        return Promise.reject(error);
      }

      this._pty = ptyProcess;

      ptyProcess.onData((data) => {
        this._onData?.(data);
      });

      ptyProcess.onExit(({ exitCode }) => {
        this._onExit?.(exitCode);
      });

      appendLogEvent?.("terminal.backend.pty.ready", {
        id,
        pid: ptyProcess.pid,
        file,
        cols,
        rows
      });

      return Promise.resolve({
        pid: ptyProcess.pid,
        helperPid: null,
        childPid: null
      });
    },

    write(data) {
      if (!this._pty) return false;
      try {
        this._pty.write(data);
        return true;
      } catch (error) {
        appendLogEvent?.("terminal.backend.pty.write-failed", {
          error: serializeError?.(error)
        }, "warn");
        return false;
      }
    },

    resize(cols, rows) {
      if (!this._pty) return false;
      try {
        this._pty.resize(cols, rows);
        return true;
      } catch (error) {
        appendLogEvent?.("terminal.backend.pty.resize-failed", {
          cols,
          rows,
          error: serializeError?.(error)
        }, "warn");
        return false;
      }
    },

    kill() {
      try { this._pty?.kill(); } catch (_) {}
    },

    dispose() {
      this.kill();
      this._pty = null;
      this._onData = null;
      this._onExit = null;
    },

    getPid() {
      return this._pty?.pid ?? null;
    },

    set onData(cb) { this._onData = cb; },
    set onExit(cb) { this._onExit = cb; },
    set onReady(cb) { this._onReady = cb; }
  };
}

// ============================================================================
// ConptyBackend — 基于 Windows ConPTY (native helper)
// ============================================================================

function createConptyBackend(deps = {}) {
  const {
    getNativeTerminalHelperPath,
    getNativeTerminalHelperExecutableNames,
    getNativeTerminalHelperCandidates,
    normalizeTerminalSize,
    serializeError,
    appendLogEvent,
    sanitizeLogText
  } = deps;

  let _helperPathCache = undefined;

  function getHelperPath() {
    if (_helperPathCache !== undefined) return _helperPathCache;

    _helperPathCache = "";
    const envPath = process.env.COSS_TERMINAL_HELPER_PATH;
    if (envPath && fs.existsSync(envPath)) {
      _helperPathCache = envPath;
      return _helperPathCache;
    }

    const candidates = [];
    const executableNames = getNativeTerminalHelperExecutableNames
      ? getNativeTerminalHelperExecutableNames()
      : (process.platform === "win32"
          ? ["CosS.TerminalHost.exe", "CosS.TerminalHelper.exe"]
          : ["CosS.TerminalHost", "CosS.TerminalHelper"]);

    const appRoot = path.resolve(__dirname, "..", "..");
    for (const exeName of executableNames) {
      if (process.resourcesPath) {
        candidates.push(path.join(process.resourcesPath, "coss-terminal-helper", exeName));
      }
      candidates.push(
        path.join(appRoot, "native", "coss-terminal-helper", "bin", "Debug", "net10.0-windows", exeName),
        path.join(appRoot, "native", "coss-terminal-helper", "bin", "Release", "net10.0-windows", exeName),
        path.join(appRoot, "native", "coss-terminal-helper", "bin", "Release", "net10.0-windows", "win-x64", "publish", exeName)
      );
    }

    for (const candidate of [...new Set(candidates.filter(Boolean))]) {
      try {
        if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          _helperPathCache = candidate;
          break;
        }
      } catch { /* continue */ }
    }

    return _helperPathCache;
  }

  return {
    mode: "native-helper",

    spawn(config) {
      const { id, file, args, cwd, env, cols = 80, rows = 24, launch } = config;
      const helperPath = getHelperPath();

      if (!helperPath) {
        return Promise.reject(new Error("native terminal helper is unavailable"));
      }

      if (process.platform !== "win32") {
        return Promise.reject(new Error("ConPTY backend only supports Windows"));
      }

      const helperArgs = [
        "--cols", String(cols),
        "--rows", String(rows),
        "--cwd", cwd,
        "--",
        file,
        ...(Array.isArray(args) ? args.map(String) : [])
      ];

      let child;
      try {
        child = childProcess.spawn(helperPath, helperArgs, {
          cwd,
          env,
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true
        });
      } catch (error) {
        appendLogEvent?.("terminal.backend.conpty.spawn-failed", {
          id, helperPath, file, args, cwd,
          error: serializeError?.(error)
        }, "error");
        return Promise.reject(error);
      }

      this._child = child;
      let stdoutBuffer = "";
      let childPid = null;

      const handleMessage = (message) => {
        if (!message || typeof message !== "object") return;

        if (message.type === "ready") {
          childPid = Number(message.pid || 0);
          childPid = Number.isFinite(childPid) && childPid > 0 ? childPid : null;
          appendLogEvent?.("terminal.backend.conpty.ready", {
            id, helperPid: child.pid, childPid, helperPath
          });
          this._onReady?.({ pid: child.pid, helperPid: child.pid, childPid });
        } else if (message.type === "data" && typeof message.data === "string") {
          try {
            const data = Buffer.from(message.data, "base64").toString("utf8");
            this._onData?.(data);
          } catch (_) {}
        } else if (message.type === "error") {
          const text = sanitizeLogText?.(message.message || "native helper error", 1000) || "native helper error";
          appendLogEvent?.("terminal.backend.conpty.error", { id, message: text }, "warn");
          this._onData?.(`\x1b[33mnative terminal helper: ${text}\x1b[0m\r\n`);
        } else if (message.type === "exit") {
          const exitCode = Number.isFinite(Number(message.exitCode)) ? Number(message.exitCode) : 0;
          this._onExit?.(exitCode);
        }
      };

      child.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk.toString("utf8");
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handleMessage(JSON.parse(line));
          } catch (error) {
            appendLogEvent?.("terminal.backend.conpty.protocol-invalid", {
              id, line: sanitizeLogText?.(line, 1000), error: serializeError?.(error)
            }, "warn");
            this._onData?.(`${line}\r\n`);
          }
        }
      });

      child.stderr.on("data", (chunk) => {
        appendLogEvent?.("terminal.backend.conpty.stderr", {
          id, text: sanitizeLogText?.(chunk.toString("utf8"), 1000)
        }, "warn");
      });

      child.on("error", (error) => {
        appendLogEvent?.("terminal.backend.conpty.process-failed", {
          id, helperPath, error: serializeError?.(error)
        }, "error");
        this._onData?.(`\x1b[31mnative terminal helper failed: ${error.message}\x1b[0m\r\n`);
        this._onExit?.(-1);
      });

      child.on("exit", (code) => {
        this._onExit?.(code);
      });

      return Promise.resolve({
        pid: child.pid,
        helperPid: child.pid,
        childPid: null
      });
    },

    write(data) {
      if (!this._child?.stdin?.writable) return false;
      const message = JSON.stringify({
        type: "input",
        data: Buffer.from(String(data || ""), "utf8").toString("base64")
      });
      this._child.stdin.write(`${message}\n`);
      return true;
    },

    resize(cols, rows) {
      if (!this._child?.stdin?.writable) return false;
      const message = JSON.stringify({ type: "resize", cols, rows });
      this._child.stdin.write(`${message}\n`);
      return true;
    },

    kill() {
      if (!this._child) return;
      try {
        this._child.stdin?.write(JSON.stringify({ type: "kill" }) + "\n");
        const killTimer = setTimeout(() => {
          try { this._child?.kill(); } catch (_) {}
        }, 500);
        if (typeof killTimer.unref === "function") killTimer.unref();
      } catch (_) {}
    },

    dispose() {
      this.kill();
      this._child = null;
      this._onData = null;
      this._onExit = null;
      this._onReady = null;
    },

    getPid() {
      return this._child?.pid ?? null;
    },

    set onData(cb) { this._onData = cb; },
    set onExit(cb) { this._onExit = cb; },
    set onReady(cb) { this._onReady = cb; }
  };
}

// ============================================================================
// PipeBackend — 基于 child_process.spawn 的管道回退
// ============================================================================

function createPipeBackend(deps = {}) {
  const { serializeError, appendLogEvent } = deps;

  return {
    mode: "pipe",

    spawn(config) {
      const { id, file, args, cwd, env, launch } = config;

      let finished = false;
      const child = childProcess.spawn(file, args, {
        cwd,
        env,
        windowsHide: true
      });

      this._child = child;

      child.stdout.on("data", (chunk) => {
        this._onData?.(chunk.toString());
      });

      child.stderr.on("data", (chunk) => {
        this._onData?.(chunk.toString());
      });

      child.on("error", (error) => {
        if (finished) return;
        finished = true;
        appendLogEvent?.("terminal.backend.pipe.spawn-failed", {
          id, file, args, cwd, error: serializeError?.(error)
        }, "error");
        this._onData?.(`\x1b[31m终端进程启动失败: ${error.message}\x1b[0m\r\n`);
        this._onExit?.(-1);
      });

      child.on("exit", (code) => {
        if (finished) return;
        finished = true;
        appendLogEvent?.("terminal.backend.pipe.exited", {
          id, file, exitCode: code
        });
        this._onExit?.(code);
      });

      appendLogEvent?.("terminal.backend.pipe.ready", {
        id, pid: child.pid, file
      });

      return Promise.resolve({
        pid: child.pid,
        helperPid: null,
        childPid: null
      });
    },

    write(data) {
      if (this._child?.stdin?.writable) {
        this._child.stdin.write(data);
        return true;
      }
      return false;
    },

    resize() {
      // Pipe backend doesn't support resize
      return false;
    },

    kill() {
      try { this._child?.kill(); } catch (_) {}
    },

    dispose() {
      this.kill();
      this._child = null;
      this._onData = null;
      this._onExit = null;
    },

    getPid() {
      return this._child?.pid ?? null;
    },

    set onData(cb) { this._onData = cb; },
    set onExit(cb) { this._onExit = cb; },
    set onReady(cb) { this._onReady = cb; }
  };
}

// ============================================================================
// MockBackend — 用于测试 / 禁用终端时的桩
// ============================================================================

function createMockBackend(deps = {}) {
  return {
    mode: "mock",

    spawn(config) {
      return Promise.resolve({
        pid: 0,
        helperPid: null,
        childPid: null
      });
    },

    write(data) {
      this._onData?.(data);
      return true;
    },

    resize() { return false; },

    kill() {},

    dispose() {
      this._onData = null;
      this._onExit = null;
    },

    getPid() { return 0; },

    set onData(cb) { this._onData = cb; },
    set onExit(cb) { this._onExit = cb; },
    set onReady(cb) { this._onReady = cb; }
  };
}

// ============================================================================
// BackendRegistry — 后端注册与选择
// ============================================================================

function createBackendRegistry(deps = {}) {
  const backends = [];

  function register(name, priority, factory) {
    backends.push({ name, priority, factory });
    backends.sort((a, b) => b.priority - a.priority);
  }

  function select(launch = {}) {
    const { activeMode, requestedMode } = launch;

    // Mock mode
    if (activeMode === "mock" || activeMode === "static" || activeMode === "error") {
      const mock = backends.find((b) => b.name === "mock");
      if (mock) return { backend: mock.factory(), reason: "mode:" + activeMode };
    }

    // Pipe backend can be forced for specific agent modes
    if (process.env.COSS_FORCE_AGENT_PIPE_BACKEND === "1"
        && process.platform === "win32"
        && ["codex", "codebuddy"].includes(String(activeMode || "").toLowerCase())) {
      const pipe = backends.find((b) => b.name === "pipe");
      if (pipe) return { backend: pipe.factory(), reason: "force-pipe:" + activeMode };
    }

    // Find first available backend
    for (const entry of backends) {
      if (entry.name === "mock") continue;
      const backend = entry.factory();
      if (backend.isAvailable?.() !== false) {
        return { backend, reason: "selected:" + entry.name };
      }
    }

    // Fallback to pipe (always available)
    const pipe = backends.find((b) => b.name === "pipe");
    if (pipe) return { backend: pipe.factory(), reason: "fallback:pipe" };

    // Ultimate fallback to mock
    const mock = backends.find((b) => b.name === "mock");
    if (mock) return { backend: mock.factory(), reason: "fallback:mock" };

    throw new Error("No terminal backend available");
  }

  /**
   * Create and register the default set of backends.
   * Ordered by priority: ConPTY > node-pty > pipe > mock
   */
  function registerDefaults(implDeps = {}) {
    register("conpty", 300, () => {
      const backend = createConptyBackend(implDeps);
      backend.isAvailable = () => {
        return process.platform === "win32"
          && process.env.COSS_DISABLE_NATIVE_TERMINAL_HELPER !== "1";
      };
      return backend;
    });

    register("pty", 200, () => {
      const backend = createPtyBackend(implDeps);
      backend.isAvailable = () => Boolean(implDeps.nodePty);
      return backend;
    });

    register("pipe", 100, () => createPipeBackend(implDeps));

    register("mock", 0, () => createMockBackend(implDeps));
  }

  return Object.freeze({
    register,
    select,
    registerDefaults,
    getBackends: () => [...backends]
  });
}

module.exports = {
  createPtyBackend,
  createConptyBackend,
  createPipeBackend,
  createMockBackend,
  createBackendRegistry
};
