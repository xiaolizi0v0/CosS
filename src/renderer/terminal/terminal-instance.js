/**
 * CosS TerminalInstance — 终端实例 (Layer 2)
 *
 * 对齐 VS Code 的 terminalInstance.ts:
 * - 包装 XtermTerminal，添加 CosS 特定行为
 * - 自动滚动检测（用户上滚时暂停自动追底，回到底部时恢复）
 * - 后端进程通信（IPC）
 * - 标题跟踪
 * - 尺寸适配（ResizeObserver + debounce）
 * - 链接处理（URL 点击打开外部浏览器）
 * - 焦点管理
 * - 完整的 dispose 链
 */
(function exposeTerminalInstance(global) {
  const XtermTerminal = global.COSS_TERMINAL_CORE?.XtermTerminal;
  if (!XtermTerminal) return;

  const cossAPI = global.cossAPI;

  // ==========================================================================
  // 常量
  // ==========================================================================
  const SCROLL_BOTTOM_THRESHOLD = 2;            // 与底部距离 < 此值即认为"在底部"
  const RESIZE_DEBOUNCE_MS = 50;                 // resize 防抖 50ms
  const RECENT_OUTPUT_MAX_LENGTH = 8000;         // 缓存最近输出长度

  // ==========================================================================
  // TerminalInstance 类（对齐 VS Code 的 TerminalInstance）
  // ==========================================================================
  class TerminalInstance {
    /**
     * @param {string} windowId - CosS window id
     * @param {HTMLElement} mount - DOM 挂载点
     * @param {object} options
     * @param {object} options.config - xterm 配置覆盖
     * @param {boolean} options.focused - 是否初始聚焦
     * @param {string} options.terminalMode - "shell" | "agent"
     * @param {object} options.windowData - 来自 app store 的 window 数据
     */
    constructor(windowId, mount, options = {}) {
      if (!windowId || !mount) throw new Error("TerminalInstance: windowId and mount are required");

      this.id = windowId;
      this._mount = mount;
      this._options = options;
      this._disposed = false;
      this._disposables = [];

      // ---- 后端状态 ----
      this._backendId = null;
      this._backendReady = false;
      this._backendReadyAt = null;
      this._backendActiveMode = "";
      this._sessionActiveMode = ""; // 来自后端 create 响应的 activeMode

      // ---- 滚动状态（对齐 VS Code） ----
      this._autoScrollEnabled = true;      // 是否自动追底
      this._lastViewportScrollTop = 0;     // 上次记录的 scrollTop
      this._scrollBottomIndicator = null;  // DOM 提示元素

      // ---- 最近输出 ----
      this._recentOutput = "";

      // ---- 标题 ----
      this._title = "";

      // ---- 输入缓冲（用于权限守卫协作） ----
      this._inputBuffer = "";
      this._maxInputBuffer = 2000;

      // ---- IPC 订阅 ----
      this._unsubscribeData = null;
      this._unsubscribeExit = null;

      // ---- ResizeObserver ----
      this._resizeObserver = null;
      this._resizeTimer = null;

      // ---- 构建 xterm 实例 ----
      this._xterm = new XtermTerminal(mount, options.config || {}, options.addons || {});
      this._bindXtermEvents();
      this._bindIpcEvents();
      this._setupResizeObserver();
      this._setupScrollTracking();

      // 初始聚焦
      if (options.focused !== false) {
        this._xterm.focus();
      }
    }

    // ==================================================================
    // xterm 事件绑定
    // ==================================================================

    _bindXtermEvents() {
      const inputHandler = this._options.inputHandler || this._onUserInput.bind(this);
      global.cossAPI?.logEvent?.('terminal.instance.bindXterm', { id: this.id, customHandler: !!this._options.inputHandler }, 'info');

      this._disposables.push(
        this._xterm.onData((data) => {
          global.cossAPI?.logEvent?.('terminal.instance.input', { id: this.id, len: data.length }, 'info');
          inputHandler(data);
        }),
        this._xterm.onResize(({ cols, rows }) => this._onXtermResize(cols, rows)),
        this._xterm.onTitleChange((title) => this._onTitleChange(title)),
        this._xterm.onBell(() => this._onBell())
      );
    }

    // ==================================================================
    // IPC 事件绑定 — 从主进程接收数据
    // ==================================================================

    _bindIpcEvents() {
      if (!cossAPI) {
        console.warn(`[TERM-DBG] TerminalInstance id=${this.id}: cossAPI unavailable`);
        return;
      }

      if (cossAPI.onTerminalData) {
        this._unsubscribeData = cossAPI.onTerminalData(({ id, data }) => {
          if (id !== this.id) return;
          global.cossAPI?.logEvent?.('terminal.instance.ipcData', { id: this.id, len: data.length }, 'info');
          this._onBackendData(data);
        });
      }

      if (cossAPI.onTerminalExit) {
        this._unsubscribeExit = cossAPI.onTerminalExit(({ id, exitCode }) => {
          if (id !== this.id) return;
          this._onBackendExit(exitCode);
        });
      }
    }

    // ==================================================================
    // 用户输入 → 主进程
    // ==================================================================

    _onUserInput(data) {
      if (!data || this._disposed) return;
      if (!this._backendReady && this._backendActiveMode !== "mock") {
        global.cossAPI?.logEvent?.('terminal.instance.inputBlocked', { id: this.id, reason: 'backend-not-ready', mode: this._backendActiveMode }, 'warn');
        return;
      }
      global.cossAPI?.logEvent?.('terminal.instance.inputSend', { id: this.id, len: data.length }, 'info');
      cossAPI?.sendTerminalInput?.(this.id, data);
    }

    // ==================================================================
    // 后端数据 → xterm
    // ==================================================================

    _onBackendData(data) {
      if (!data || this._disposed) return;
      global.cossAPI?.logEvent?.('terminal.instance.backendData', { id: this.id, len: data.length, preview: data.slice(0, 40) }, 'info');

      // 缓存最近输出
      this._recentOutput = (this._recentOutput + data).slice(-RECENT_OUTPUT_MAX_LENGTH);

      // 写入 xterm
      this._xterm.writeSync(data);

      // 自动追底
      if (this._autoScrollEnabled) {
        this._xterm.scrollToBottom();
      }

      // 回调外部监听者（如 recordTerminalOutputReference）
      if (this._options.onOutput) {
        try { this._options.onOutput(data); } catch (_) {}
      }
    }

    // ==================================================================
    // 后端退出
    // ==================================================================

    _onBackendExit(exitCode) {
      if (this._disposed) return;
      this._backendReady = false;
      this._backendId = null;
      this._sessionActiveMode = "";

      this._xterm.writeln("");
      this._xterm.writeln(
        `\x1b[33m进程已退出，代码 ${exitCode ?? "unknown"}。关闭并重新创建终端可启动新会话。\x1b[0m`
      );
    }

    // ==================================================================
    // 尺寸适配（对齐 VS Code: ResizeObserver → fit → 通知后端）
    // ==================================================================

    _setupResizeObserver() {
      if (typeof ResizeObserver === "undefined") return;

      this._resizeObserver = new ResizeObserver(() => {
        if (this._disposed) return;
        this._scheduleResize();
      });
      this._resizeObserver.observe(this._mount);

      // 初始 fit
      this._scheduleResize();
    }

    _scheduleResize() {
      if (this._resizeTimer !== null) return;
      this._resizeTimer = setTimeout(() => {
        this._resizeTimer = null;
        this._performResize();
      }, RESIZE_DEBOUNCE_MS);
    }

    _performResize() {
      if (this._disposed || !this._xterm) return;

      this._xterm.fit();
      const { cols, rows } = this._xterm.dimensions;
      if (cols > 0 && rows > 0) {
        cossAPI?.resizeTerminal?.(this.id, cols, rows);
      }
    }

    _onXtermResize(cols, rows) {
      if (cols > 0 && rows > 0) {
        cossAPI?.resizeTerminal?.(this.id, cols, rows);
      }
    }

    // ==================================================================
    // 滚动追踪（对齐 VS Code: 用户上滚 → 暂停自动追底）
    // ==================================================================

    _setupScrollTracking() {
      const viewportEl = this._xterm?.term?.element?.querySelector(".xterm-viewport");
      if (!viewportEl) return;

      const onScroll = () => {
        if (this._disposed) return;
        this._trackScroll(viewportEl);
      };

      viewportEl.addEventListener("scroll", onScroll, { passive: true });
      this._disposables.push({
        dispose: () => viewportEl.removeEventListener("scroll", onScroll)
      });
    }

    _trackScroll(viewportEl) {
      const distanceFromBottom =
        viewportEl.scrollHeight - viewportEl.clientHeight - viewportEl.scrollTop;

      // 用户在底部 → 恢复自动追底
      if (distanceFromBottom <= SCROLL_BOTTOM_THRESHOLD) {
        if (!this._autoScrollEnabled) {
          this._autoScrollEnabled = true;
          this._hideScrollIndicator();
        }
      }
      // 用户滚离底部 → 暂停自动追底
      else if (this._autoScrollEnabled && distanceFromBottom > SCROLL_BOTTOM_THRESHOLD) {
        this._autoScrollEnabled = false;
        this._showScrollIndicator();
      }

      this._lastViewportScrollTop = viewportEl.scrollTop;
    }

    _showScrollIndicator() {
      if (this._scrollBottomIndicator) return;
      const el = document.createElement("div");
      el.className = "terminal-scroll-indicator";
      el.textContent = "↓ 滚动到底部";
      el.addEventListener("click", () => {
        this.scrollToBottom();
        this._autoScrollEnabled = true;
        this._hideScrollIndicator();
      });
      this._mount.appendChild(el);
      this._scrollBottomIndicator = el;
    }

    _hideScrollIndicator() {
      if (this._scrollBottomIndicator) {
        this._scrollBottomIndicator.remove();
        this._scrollBottomIndicator = null;
      }
    }

    // ==================================================================
    // 标题
    // ==================================================================

    _onTitleChange(title) {
      this._title = title;
    }

    get title() {
      return this._title;
    }

    // ==================================================================
    // 响铃（视觉提示，对齐 VS Code 的 visual bell）
    // ==================================================================

    _onBell() {
      // 未来可添加视觉响铃闪烁
    }

    // ==================================================================
    // 后端连接
    // ==================================================================

    /**
     * 请求主进程创建后端进程并连接到此终端。
     */
    async connectBackend(createOptions = {}) {
      if (this._disposed) return { ok: false, reason: "disposed" };

      this._backendId = createOptions.id || this.id;

      try {
        const result = await cossAPI?.createTerminal?.({
          id: this.id,
          cwd: createOptions.cwd,
          projectId: createOptions.projectId || "",
          projectName: createOptions.projectName || "",
          roleId: createOptions.roleId || "",
          roleName: createOptions.roleName || "",
          roleDescription: createOptions.roleDescription || "",
          useClaude: createOptions.useClaude,
          terminalMode: createOptions.terminalMode || "shell",
          agentProvider: createOptions.agentProvider,
          agentSession: createOptions.agentSession || null,
          taskContext: createOptions.taskContext || {},
          rolePromptTemplate: createOptions.rolePromptTemplate,
          agentFallbackToShell: createOptions.agentFallbackToShell !== false,
          agentPermissionMode: createOptions.agentPermissionMode,
          agentMcpAutoConfigEnabled: createOptions.agentMcpAutoConfigEnabled === true,
          codeBuddyApiKey: createOptions.codeBuddyApiKey || "",
          cols: this._xterm.dimensions.cols,
          rows: this._xterm.dimensions.rows
        });

        if (result) {
          const activeMode = String(result.activeMode || result.mode || "").toLowerCase();
          this._backendActiveMode = activeMode;
          this._sessionActiveMode = activeMode;

          if (!["error", "installing", "static", "shell"].includes(activeMode)) {
            this._backendReady = true;
            this._backendReadyAt = Date.now();
          } else {
            this._backendReady = false;
          }

          // 恢复转录（切换项目后回到终端时）
          if (result.reattached && result.transcript) {
            this._recentOutput = result.transcript.slice(-RECENT_OUTPUT_MAX_LENGTH);
            // 将历史转录写入 xterm
            this._xterm?.term?.reset?.();
            this._xterm?.writeSync?.(result.transcript);
            this._xterm?.scrollToBottom?.();
          }

          return { ok: true, ...result };
        }

        return { ok: false, reason: "no-result" };
      } catch (error) {
        console.warn("TerminalInstance: backend creation failed", error);
        return { ok: false, error: error.message };
      }
    }

    // ==================================================================
    // 公共方法
    // ==================================================================

    /** 写入 xterm（本地显示，不发送到后端） */
    write(data) {
      if (this._disposed) return;
      this._xterm.writeSync(data);
      if (this._autoScrollEnabled) this._xterm.scrollToBottom();
    }

    /** 发送到后端进程 */
    sendToBackend(data, options = {}) {
      if (!this._backendReady && this._backendActiveMode !== "mock") return false;
      return cossAPI?.sendTerminalInput?.(this.id, data, options) ?? false;
    }

    scrollToBottom() {
      this._xterm.scrollToBottom();
    }

    scrollToTop() {
      this._xterm.scrollToTop();
    }

    focus() {
      this._xterm.focus();
    }

    blur() {
      this._xterm.blur();
    }

    hasFocus() {
      return this._xterm.hasFocus();
    }

    fit() {
      this._performResize();
    }

    // ------------------------------------------------------------------
    // park / unpark（供 render() 重建 DOM 时使用）
    // ------------------------------------------------------------------

    park() { this._xterm.park(); }
    unpark(mount) {
      if (!mount) return false;
      const ok = this._xterm.unpark(mount);
      if (ok) {
        this._mount = mount;
        // 重新 attach ResizeObserver
        this._resizeObserver?.disconnect();
        this._resizeObserver = new ResizeObserver(() => this._scheduleResize());
        this._resizeObserver.observe(mount);
        this._performResize();
      }
      return ok;
    }

    // ------------------------------------------------------------------
    // 输出缓存
    // ------------------------------------------------------------------

    get recentOutput() {
      return this._recentOutput;
    }

    get strippedRecentOutput() {
      return stripControlChars(this._recentOutput);
    }

    // ------------------------------------------------------------------
    // 状态查询
    // ------------------------------------------------------------------

    get isReady() { return this._backendReady; }
    get activeMode() { return this._backendActiveMode; }
    get isAgentTerminal() { return this._options.terminalMode === "agent"; }

    // ------------------------------------------------------------------
    // 销毁
    // ------------------------------------------------------------------

    dispose(disposeBackend = true) {
      if (this._disposed) return;
      this._disposed = true;

      // 取消 IPC 订阅
      this._unsubscribeData?.();
      this._unsubscribeExit?.();

      // 取消 ResizeObserver
      this._resizeObserver?.disconnect();
      this._resizeTimer = null;

      // 取消所有 disposable
      for (const d of this._disposables) {
        try { d.dispose?.(); } catch (_) {}
      }

      // 清除滚动指示器
      this._hideScrollIndicator();

      // 仅在明确要求时释放后端进程
      if (disposeBackend !== false) {
        cossAPI?.disposeTerminal?.(this.id);
      }

      // 释放 xterm
      this._xterm?.dispose();
      this._xterm = null;
    }
  }

  // ==========================================================================
  // 工具
  // ==========================================================================

  function stripControlChars(text) {
    return String(text || "")
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ==========================================================================
  // TerminalInstanceService — 全局实例注册表 (Layer 3 的简单版)
  //   对齐 VS Code 的 terminalService.ts
  // ==========================================================================

  class TerminalInstanceService {
    constructor() {
      /** @type {Map<string, TerminalInstance>} */
      this._instances = new Map();
      this._activeId = null;
    }

    /**
     * 创建或复用终端实例。
     */
    create(windowId, mount, options = {}) {
      // 如果已存在实例，尝试复用（通过 windowId 匹配，而非 DOM 引用）
      const existing = this._instances.get(windowId);
      if (existing && !existing._disposed) {
        // mount 变了（render() 重建 DOM 后）→ unpark 到新 mount
        if (existing._mount !== mount || existing._xterm?.term?.element?.parentNode !== mount) {
          const ok = existing.unpark(mount);
          if (ok) {
            existing._options = Object.assign(existing._options || {}, options);
            return existing;
          }
          // unpark 失败 → 必须重建
          existing.dispose();
        } else {
          // mount 相同 → 直接复用
          existing._options = Object.assign(existing._options || {}, options);
          return existing;
        }
      }

      // 创建新实例
      const instance = new TerminalInstance(windowId, mount, options);
      this._instances.set(windowId, instance);
      return instance;
    }

    get(windowId) { return this._instances.get(windowId) || null; }
    has(windowId) { return this._instances.has(windowId); }

    /** 获取所有未释放的实例 */
    getAll() {
      const result = [];
      for (const [id, inst] of this._instances) {
        if (!inst._disposed) result.push({ id, instance: inst });
      }
      return result;
    }

    setActive(windowId) {
      this._activeId = windowId;
    }

    get activeId() { return this._activeId; }

    get activeInstance() {
      return this._activeId ? this._instances.get(this._activeId) || null : null;
    }

    /**
     * 广播配置变更到所有实例。
     */
    updateAllConfig(changes) {
      for (const [, inst] of this._instances) {
        if (!inst._disposed) inst._xterm?.updateConfig?.(changes);
      }
    }

    /**
     * 销毁指定实例。
     */
    dispose(windowId, disposeBackend = false) {
      const inst = this._instances.get(windowId);
      if (!inst) return;
      if (disposeBackend) {
        cossAPI?.disposeTerminal?.(windowId);
      }
      inst.dispose(disposeBackend);
      this._instances.delete(windowId);
      if (this._activeId === windowId) this._activeId = null;
    }

    /**
     * 销毁不在 activeSet 中的实例。
     */
    disposeOutsideActiveSet(activeIds) {
      for (const [id] of this._instances) {
        if (!activeIds.has(id)) this.dispose(id, false);
      }
    }

    /**
     * 销毁全部实例。
     */
    disposeAll() {
      for (const [, inst] of this._instances) {
        try { inst.dispose(); } catch (_) {}
      }
      this._instances.clear();
      this._activeId = null;
    }

    // ---- park / unpark 全部 ----
    parkAll() {
      for (const [, inst] of this._instances) {
        if (!inst._disposed) inst.park();
      }
    }

    unparkAll() {
      for (const [windowId, inst] of this._instances) {
        if (inst._disposed) continue;
        const mount = document.querySelector(`[data-terminal-id="${windowId}"]`);
        if (mount) inst.unpark(mount);
      }
    }
  }

  // ==========================================================================
  // 暴露 API
  // ==========================================================================
  global.COSS_TERMINAL_INSTANCE = Object.freeze({
    TerminalInstance,
    TerminalInstanceService,
    createService: () => new TerminalInstanceService()
  });
})(window);
