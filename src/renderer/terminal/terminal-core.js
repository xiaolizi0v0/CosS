/**
 * CosS XtermTerminal — xterm.js 原始封装层 (Layer 1)
 *
 * 对齐 VS Code 的 xtermTerminal.ts:
 * - 拥有原始 xterm.js Terminal 实例
 * - 管理所有 addons (fit, WebGL, 后续可扩展 search/unicode/links)
 * - 响应配置变更 (字体、主题、光标等可在运行时更新)
 * - 提供 write / clear / focus / blur / forceRedraw
 * - 发出 onData / onResize / onTitleChange / onBell 事件
 * - park / unpark 保护 DOM
 */
(function exposeXtermTerminal(global) {
  // ==========================================================================
  // 默认配置（对齐 VS Code 的 ITerminalConfiguration）
  // ==========================================================================
  const DEFAULTS = Object.freeze({
    fontFamily: "Consolas, 'Cascadia Mono', 'Microsoft YaHei UI', monospace",
    fontSize: 12,
    lineHeight: 1.25,
    cursorBlink: true,
    cursorStyle: "bar",
    cursorWidth: 1,
    scrollback: 2000,
    convertEol: true,
    allowTransparency: true,
    scrollOnEraseInDisplay: true,
    windowsPty: { backend: "conpty", buildNumber: 22621 },
    theme: {
      background: "#11131a",
      foreground: "#d8deea",
      cursor: "#d8deea",
      selectionBackground: "#35507a",
      black: "#11131a",
      red: "#ff6b7a",
      green: "#5fe39b",
      yellow: "#ffd166",
      blue: "#75a7ff",
      magenta: "#c792ea",
      cyan: "#5ed6d6",
      white: "#edf2ff"
    }
  });

  // ==========================================================================
  // 诊断（可开关）
  // ==========================================================================
  let _diagEnabled = false;
  let _diagSeq = 0;

  function logDiag(term, event, detail) {
    const ts = Date.now();
    // 写入诊断包可导出的日志
    if (global.cossAPI?.logEvent) {
      global.cossAPI.logEvent('terminal.render.' + event, { detail: detail || '', ts }, 'info');
    }
    console.log(`[TERM-DBG] ${event} detail=${detail || ""}`);
    if (!_diagEnabled) return;
    try {
      _diagSeq++;
      const payload = { event, seq: _diagSeq, ts: Date.now(), detail: detail || "" };
      if (term) {
        const buf = term.buffer?.active;
        const vp = term.element?.querySelector(".xterm-viewport");
        if (buf) {
          payload.ydisp = buf.ydisp;
          payload.ybase = buf.ybase;
          payload.scrollbackLines = buf.length;
        }
        if (vp) {
          payload.scrollTop = vp.scrollTop;
          payload.scrollHeight = vp.scrollHeight;
          payload.clientHeight = vp.clientHeight;
        }
      }
      if (global.cossAPI?.logEvent) {
        global.cossAPI.logEvent("terminal.diag", payload, "info");
      }
    } catch (_) {}
  }

  // ==========================================================================
  // XtermTerminal 类（对齐 VS Code 的 XtermTerminal）
  // ==========================================================================
  class XtermTerminal {
    /**
     * @param {HTMLElement} mount - DOM 挂载点
     * @param {object} [config={}] - 覆盖默认配置
     * @param {object} [addons={}] - 额外 addons { search, unicode, weblinks }
     */
    constructor(mount, config = {}, addons = {}) {
      if (!mount) throw new Error("XtermTerminal: mount element is required");
      this._mount = mount;
      this._config = Object.assign({}, DEFAULTS, config);
      this._addons = {};
      this._callbacks = Object.create(null); // onData / onResize / onTitleChange / onBell
      this._disposables = [];
      this._disposed = false;
      this._lastDimensions = { cols: 0, rows: 0 };

      this._createTerminal();
      this._loadAddons(addons);
      this._bindEvents();
      this._open();
    }

    // ------------------------------------------------------------------
    // 创建 xterm 实例
    // ------------------------------------------------------------------
    _createTerminal() {
      const cfg = this._config;
      this.term = new global.Terminal({
        cursorBlink: cfg.cursorBlink,
        cursorStyle: cfg.cursorStyle,
        cursorWidth: cfg.cursorWidth,
        convertEol: cfg.convertEol,
        fontFamily: cfg.fontFamily,
        fontSize: cfg.fontSize,
        lineHeight: cfg.lineHeight,
        scrollback: cfg.scrollback,
        allowTransparency: cfg.allowTransparency,
        scrollOnEraseInDisplay: cfg.scrollOnEraseInDisplay,
        windowsPty: cfg.windowsPty,
        theme: cfg.theme
      });
    }

    // ------------------------------------------------------------------
    // 加载 addons
    // ------------------------------------------------------------------
    _loadAddons(extra = {}) {
      // Fit addon (always loaded)
      const FA = global.FitAddon?.FitAddon;
      if (FA) {
        this._addons.fit = new FA();
        this.term.loadAddon(this._addons.fit);
      }

      // WebGL addon（可选）
      if (!this._config.disableWebgl && global.WebglAddon) {
        try {
          const wa = new global.WebglAddon();
          wa.onContextLoss(() => wa.dispose());
          this.term.loadAddon(wa);
          this._addons.webgl = wa;
        } catch (e) {
          console.warn("XtermTerminal: WebGL addon failed", e);
        }
      }

      // 未来可扩展: search, unicode11, webLinks
    }

    // ------------------------------------------------------------------
    // 绑定事件
    // ------------------------------------------------------------------
    _bindEvents() {
      // 数据输入
      this._onDataDisposable = this.term.onData((data) => {
        global.cossAPI?.logEvent?.('terminal.xterm.onData', { len: data.length, preview: data.slice(0, 40) }, 'info');
        this._emit("onData", data);
      });

      // 尺寸变化
      this._onResizeDisposable = this.term.onResize(({ cols, rows }) => {
        if (cols !== this._lastDimensions.cols || rows !== this._lastDimensions.rows) {
          this._lastDimensions = { cols, rows };
          this._emit("onResize", { cols, rows });
        }
      });

      // 标题变化（OSC 0/2）
      this._onTitleDisposable = this.term.onTitleChange((title) => {
        this._emit("onTitleChange", title);
      });

      // 响铃
      this._onBellDisposable = this.term.onBell(() => {
        this._emit("onBell");
      });

      // 滚动诊断
      this.term.onScroll((newYdisp) => {
        logDiag(this.term, "term.onScroll", `newYdisp=${newYdisp}`);
      });

      // DOM 滚动事件
      const viewportEl = this.term.element?.querySelector(".xterm-viewport");
      if (viewportEl) {
        viewportEl.addEventListener("scroll", this._onViewportScrollBound = () => {
          logDiag(this.term, "viewport.DOM.scroll", `scrollTop=${viewportEl.scrollTop}`);
        }, { passive: true });
      }
    }

    // ------------------------------------------------------------------
    // 挂载
    // ------------------------------------------------------------------
    _open() {
      this.term.open(this._mount);

      // 安装 IME 修正 + 复制键处理
      installImeAnchorFix(this.term);
      installCopyKeyHandler(this.term, this);
    }

    // ------------------------------------------------------------------
    // 配置更新（对齐 VS Code 的 configChanged）
    // ------------------------------------------------------------------
    updateConfig(changes = {}) {
      const term = this.term;
      if (!term || this._disposed) return;

      if (changes.fontSize !== undefined) {
        term.options.fontSize = changes.fontSize;
        this._config.fontSize = changes.fontSize;
      }
      if (changes.fontFamily !== undefined) {
        term.options.fontFamily = changes.fontFamily;
        this._config.fontFamily = changes.fontFamily;
      }
      if (changes.lineHeight !== undefined) {
        term.options.lineHeight = changes.lineHeight;
        this._config.lineHeight = changes.lineHeight;
      }
      if (changes.cursorBlink !== undefined) {
        term.options.cursorBlink = changes.cursorBlink;
        this._config.cursorBlink = changes.cursorBlink;
      }
      if (changes.cursorStyle !== undefined) {
        term.options.cursorStyle = changes.cursorStyle;
        this._config.cursorStyle = changes.cursorStyle;
      }
      if (changes.scrollback !== undefined) {
        term.options.scrollback = changes.scrollback;
        this._config.scrollback = changes.scrollback;
      }
      if (changes.theme) {
        term.options.theme = Object.assign({}, this._config.theme, changes.theme);
        this._config.theme = term.options.theme;
      }
    }

    // ------------------------------------------------------------------
    // 写入（对齐 VS Code 的 write）
    // ------------------------------------------------------------------
    write(data) {
      if (this._disposed || !this.term) return;
      return new Promise((resolve) => {
        this.term.write(data, resolve);
      });
    }

    // 同步写入
    writeSync(data) {
      if (this._disposed || !this.term) return;
      this.term.write(data);
    }

    writeln(data) {
      if (this._disposed || !this.term) return;
      this.term.writeln(data);
    }

    // ------------------------------------------------------------------
    // 清屏
    // ------------------------------------------------------------------
    clear() {
      if (this._disposed || !this.term) return;
      this.term.clear();
    }

    clearBuffer() {
      if (this._disposed || !this.term) return;
      this.term.clear();
      try { this.term._core?._bufferService?.reset?.(); } catch (_) {}
    }

    // ------------------------------------------------------------------
    // 焦点
    // ------------------------------------------------------------------
    focus() {
      if (this._disposed || !this.term) return;
      setTimeout(() => this.term.focus(), 0);
    }

    blur() {
      if (this._disposed || !this.term) return;
      this.term.blur();
    }

    hasFocus() {
      return this.term?.element?.contains(document.activeElement) === true;
    }

    // ------------------------------------------------------------------
    // 适配尺寸（FitAddon）
    // ------------------------------------------------------------------
    fit() {
      if (this._disposed || !this._addons.fit) return;
      this._addons.fit.fit();
    }

    get dimensions() {
      if (!this.term) return { cols: 0, rows: 0 };
      return { cols: this.term.cols, rows: this.term.rows };
    }

    // ------------------------------------------------------------------
    // 选择与复制
    // ------------------------------------------------------------------
    getSelection() {
      return this.term?.getSelection() || "";
    }

    selectAll() {
      this.term?.selectAll();
    }

    clearSelection() {
      this.term?.clearSelection();
    }

    // ------------------------------------------------------------------
    // 滚动
    // ------------------------------------------------------------------
    scrollToBottom() {
      this.term?.scrollToBottom();
    }

    scrollToTop() {
      this.term?.scrollToTop();
    }

    scrollLines(amount) {
      this.term?.scrollLines(amount);
    }

    get isUserScrolling() {
      return this.term?._core?._bufferService?.isUserScrolling === true;
    }

    get scrollTop() {
      return this.term?.element?.querySelector(".xterm-viewport")?.scrollTop ?? 0;
    }

    get scrollBottom() {
      const vp = this.term?.element?.querySelector(".xterm-viewport");
      if (!vp) return 0;
      return vp.scrollHeight - vp.clientHeight - vp.scrollTop;
    }

    // ------------------------------------------------------------------
    // park / unpark
    // ------------------------------------------------------------------
    park() {
      if (!this.term?.element?.parentNode) return false;
      if (this.term.element.parentNode === document.body) return true;
      logDiag(this.term, "park");
      this.term.element.dataset.cossParked = "true";
      document.body.appendChild(this.term.element);
      return true;
    }

    unpark(mount) {
      if (!this.term?.element || !mount) return false;
      if (this.term.element.parentNode === mount) return true;
      logDiag(this.term, "unpark");
      mount.innerHTML = "";
      mount.appendChild(this.term.element);
      delete this.term.element.dataset.cossParked;
      return true;
    }

    get isParked() {
      return this.term?.element?.parentNode === document.body;
    }

    // ------------------------------------------------------------------
    // 事件（对齐 VS Code: onData, onResize, onTitleChange, onBell）
    // ------------------------------------------------------------------
    onData(cb) { return this._on("onData", cb); }
    onResize(cb) { return this._on("onResize", cb); }
    onTitleChange(cb) { return this._on("onTitleChange", cb); }
    onBell(cb) { return this._on("onBell", cb); }

    _on(event, cb) {
      const list = this._callbacks[event] || (this._callbacks[event] = []);
      list.push(cb);
      return { dispose: () => { const idx = list.indexOf(cb); if (idx >= 0) list.splice(idx, 1); } };
    }

    _emit(event, ...args) {
      const list = this._callbacks[event];
      if (!list) {
        global.cossAPI?.logEvent?.('terminal.xterm.emit.noCallbacks', { event }, 'warn');
        return;
      }
      const dataLen = typeof args[0] === 'string' ? args[0].length : 0;
      global.cossAPI?.logEvent?.('terminal.xterm.emit', { event, callbacks: list.length, dataLen }, 'info');
      for (const cb of list) {
        try { cb.apply(null, args); } catch (_) {}
      }
    }

    // ------------------------------------------------------------------
    // 清理
    // ------------------------------------------------------------------
    dispose() {
      if (this._disposed) return;
      this._disposed = true;
      logDiag(this.term, "dispose");

      // 移除事件
      this._onDataDisposable?.dispose();
      this._onResizeDisposable?.dispose();
      this._onTitleDisposable?.dispose();
      this._onBellDisposable?.dispose();

      // 移除 DOM 事件
      if (this._onViewportScrollBound) {
        const vp = this.term?.element?.querySelector(".xterm-viewport");
        vp?.removeEventListener("scroll", this._onViewportScrollBound);
        this._onViewportScrollBound = null;
      }

      // 清空回调
      this._callbacks = Object.create(null);

      // 移除 DOM 元素
      try {
        if (this.term?.element?.parentNode) {
          this.term.element.parentNode.removeChild(this.term.element);
        }
      } catch (_) {}

      // 释放 addons
      this._addons.webgl?.dispose?.();
      this._addons.fit?.dispose?.();

      // 释放 xterm
      this.term?.dispose();
      this.term = null;
      this._addons = {};
    }
  }

  // ==========================================================================
  // IME 锚点修正
  // ==========================================================================
  function installImeAnchorFix(term) {
    const comp = term?._core?._compositionHelper;
    if (!comp || comp.__cossImeAnchorPatched) return;
    comp.__cossImeAnchorPatched = true;
    const orig = comp.updateCompositionElements.bind(comp);
    comp.updateCompositionElements = (dontRecurse) => {
      orig(dontRecurse);
      try { anchorImeToDrawnCursor(term, comp); } catch (_) {}
    };
  }

  function anchorImeToDrawnCursor(term, comp) {
    if (!comp.isComposing || !comp._coreService?.isCursorHidden) return;
    const buf = term.buffer.active;
    if (buf.type !== "normal") return;
    const dims = comp._renderService?.dimensions;
    const cw = dims?.css?.cell?.width;
    const ch = dims?.css?.cell?.height;
    if (!(cw > 0) || !(ch > 0)) return;
    for (let y = buf.length - 1; y >= buf.viewportY; y--) {
      const line = buf.getLine(y);
      if (!line) continue;
      for (let x = 0; x < line.length; x++) {
        const cell = line.getCell(x);
        if (!cell?.isInverse?.()) continue;
        const ry = y - buf.viewportY;
        const left = x * cw, top = ry * ch;
        const cv = comp._compositionView;
        const ta = term.textarea;
        if (!cv || !ta) return;
        cv.style.left = `${left}px`;
        cv.style.top = `${top}px`;
        cv.style.height = `${ch}px`;
        cv.style.lineHeight = `${ch}px`;
        const bounds = cv.getBoundingClientRect();
        ta.style.left = `${left}px`;
        ta.style.top = `${top}px`;
        ta.style.width = `${Math.max(bounds.width, 1)}px`;
        ta.style.height = `${Math.max(bounds.height, 1)}px`;
        ta.style.lineHeight = `${bounds.height}px`;
        return;
      }
    }
  }

  // ==========================================================================
  // Ctrl+Shift+C 复制
  // ==========================================================================
  function installCopyKeyHandler(term, instance) {
    if (term._cossCopyHandlerInstalled) return;
    term._cossCopyHandlerInstalled = true;
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === "keydown" && (event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "KeyC") {
        const sel = instance?.getSelection?.() || term.getSelection();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {
            const ta = document.createElement("textarea");
            ta.value = sel;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
          });
        }
        return false;
      }
      return true;
    });
  }

  // ==========================================================================
  // 暴露 API
  // ==========================================================================

  // ---- 新 API (VS Code-style) ----
  const NewAPI = {
    XtermTerminal,
    DEFAULTS,
    enableDiagnostics() { _diagEnabled = true; },
    disableDiagnostics() { _diagEnabled = false; }
  };

  // ---- 旧 API 兼容层 (供 renderer.js 旧 hydrateTerminalWindows 使用) ----
  // 这些函数模拟旧的 terminal-core.js 接口，内部使用新的 XtermTerminal
  let _compatDiagSeq = 0;

  function createTerminalInstanceLegacy(mount, options = {}) {
    const { focused, windowId } = options;
    const xterm = new XtermTerminal(mount, {}, {});
    return {
      term: xterm.term,
      fitAddon: xterm._addons.fit || { fit() {}, dispose() {} },
      // 附加 xterm 引用供 debug
      _xterm: xterm
    };
  }

  function diagTerminalLegacy(term, event, detail) {
    _compatDiagSeq++;
    const payload = { event, seq: _compatDiagSeq, ts: Date.now(), detail: detail || '' };
    if (term) {
      try {
        const buf = term.buffer?.active;
        const vp = term.element?.querySelector('.xterm-viewport');
        if (buf) { payload.ydisp = buf.ydisp; payload.ybase = buf.ybase; payload.scrollbackLines = buf.length; }
        if (vp) { payload.scrollTop = vp.scrollTop; payload.scrollHeight = vp.scrollHeight; payload.clientHeight = vp.clientHeight; }
        const bs = term._core?._bufferService;
        if (bs) payload.isUserScrolling = bs.isUserScrolling;
      } catch (_) {}
    }
    if (global.cossAPI?.logEvent) global.cossAPI.logEvent('terminal.diag', payload, 'info');
  }

  function parkTerminalElementLegacy(term, windowId) {
    if (!term?.element?.parentNode) return false;
    if (term.element.parentNode === document.body) return true;
    term.element.dataset.cossParked = 'true';
    document.body.appendChild(term.element);
    return true;
  }

  function unparkTerminalElementLegacy(term, mount, windowId) {
    if (!term?.element || !mount) return false;
    if (term.element.parentNode === mount) return true;
    const parked = term.element.parentNode === document.body;
    if (parked) { mount.innerHTML = ''; mount.appendChild(term.element); }
    else { try { mount.innerHTML = ''; mount.appendChild(term.element); } catch (e) { return false; } }
    delete term.element.dataset.cossParked;
    return true;
  }

  function installCopyKeyHandlerLegacy(term) {
    if (term._cossCopyHandlerInstalled) return;
    term._cossCopyHandlerInstalled = true;
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === 'keydown' && (event.ctrlKey || event.metaKey) && event.shiftKey && event.code === 'KeyC') {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {
            const ta = document.createElement('textarea');
            ta.value = sel; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy');
            document.body.removeChild(ta);
          });
        }
        return false;
      }
      return true;
    });
  }

  function ensureViewportFollowLegacy(view, forceScroll) {
    if (!view?.term) return;
    if (view._cossScrollScheduled) return;
    view._cossScrollScheduled = true;
    Promise.resolve().then(() => {
      view._cossScrollScheduled = false;
      if (!view.term) return;
      try {
        const bs = view.term._core?._bufferService;
        if (!bs || !bs.isUserScrolling || forceScroll) {
          view.term.scrollToBottom();
        }
      } catch (_) {}
    });
  }

  function destroyTerminalViewLegacy(view) {
    if (!view) return;
    view.resizeObserver?.disconnect();
    view.inputDisposable?.dispose?.();
    view.resizeDisposable?.dispose?.();
    view.unsubscribeData?.();
    view.unsubscribeExit?.();
    view.fitAddon?.dispose?.();
    try {
      if (view.term?.element?.parentNode) {
        view.term.element.parentNode.removeChild(view.term.element);
      }
    } catch (_) {}
    view.term?.dispose?.();
    view._cossScrollScheduled = false;
    view._xterm?.dispose?.();
  }

  function parkAllTerminalsLegacy(tvm) {
    for (const [, v] of tvm) { if (v?.term) parkTerminalElementLegacy(v.term); }
  }

  function unparkAllTerminalsLegacy(tvm) {
    for (const [wid, v] of tvm) {
      if (!v?.term) continue;
      const m = document.querySelector(`[data-terminal-id="${wid}"]`);
      if (m) {
        unparkTerminalElementLegacy(v.term, m, wid);
        v.mount = m;
        if (v.resizeObserver && m) {
          try { v.resizeObserver.disconnect(); } catch (_) {}
          v.resizeObserver = new ResizeObserver(() => {
            try { v.fitAddon?.fit(); global.cossAPI?.resizeTerminal(wid, v.term.cols, v.term.rows); }
            catch (e) { console.warn('Terminal resize after unpark failed', e); }
          });
          v.resizeObserver.observe(m);
        }
      }
    }
  }

  // 合并新旧 API
  global.COSS_TERMINAL_CORE = Object.freeze({
    ...NewAPI,
    // 旧 API 别名
    createTerminalInstance: createTerminalInstanceLegacy,
    diagTerminal: diagTerminalLegacy,
    parkTerminalElement: parkTerminalElementLegacy,
    unparkTerminalElement: unparkTerminalElementLegacy,
    parkAllTerminals: parkAllTerminalsLegacy,
    unparkAllTerminals: unparkAllTerminalsLegacy,
    ensureViewportFollow: ensureViewportFollowLegacy,
    destroyTerminalView: destroyTerminalViewLegacy,
    installCopyKeyHandler: installCopyKeyHandlerLegacy
  });
})(window);
