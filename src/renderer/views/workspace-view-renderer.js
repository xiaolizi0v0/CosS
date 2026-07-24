(function exposeWorkspaceViewRenderer(global) {
  function createWorkspaceViewRenderer({
    getState,
    getProject,
    getRole,
    getWindowState,
    ensureBrowserWindowShape,
    getActiveBrowserTab,
    normalizeBrowserUrl,
    normalizeTerminalMode,
    normalizeAgentProvider,
    getAgentProviderLabel,
    t,
    escapeHtml,
    icon,
    uniqueStrings,
    defaultBrowserUrl
  } = {}) {
    const translate = t || ((_key, fallback) => fallback || "");
    const state = () => getState?.() || {};

    function renderTerminalContent(win) {
      const role = getRole?.(win.roleId) || { name: win.roleId || "" };
      const agentProvider = normalizeAgentProvider(win.agentProvider || state().settings?.agentProvider);
      const modeLabel = { agent: `Agent(${getAgentProviderLabel(agentProvider)})`, shell: "PowerShell" }[normalizeTerminalMode(win.terminalMode)];
      return `<div class="terminal-mount" data-terminal-id="${win.id}" data-role-name="${escapeHtml(role.name)}"><div class="terminal-loading">${escapeHtml(translate("terminal.starting", "正在启动 {{role}} {{mode}}...", { role: role.name, mode: modeLabel }))}</div></div>`;
    }

    function renderBrowserContent(win) {
      const role = getRole?.(win.roleId) || { id: win.roleId || "", name: win.roleId || "" };
      ensureBrowserWindowShape?.(win);
      const activeTab = getActiveBrowserTab?.(win);
      const url = normalizeBrowserUrl(activeTab?.url || win.browserUrl || defaultBrowserUrl);
      const bookmarks = uniqueStrings(win.browserBookmarks || []);
      const history = (win.browserHistory || []).slice(-5).reverse();
      const partition = `persist:coss-${state().activeProjectId || "default"}-${role.id}`;
      return `<div class="browser-program"><div class="browser-tabs">${win.browserTabs.map((tab) => `<div class="browser-tab-shell ${tab.id === win.activeBrowserTabId ? "active" : ""}"><button class="browser-tab ${tab.id === win.activeBrowserTabId ? "active" : ""}" data-action="browser-switch-tab" data-window-id="${escapeHtml(win.id)}" data-tab-id="${escapeHtml(tab.id)}">${tab.favicon ? `<img class="browser-tab-favicon" src="${escapeHtml(tab.favicon)}" alt="" />` : `<span class="browser-tab-fallback"></span>`}<span>${escapeHtml(tab.title || tab.url || translate("browser.newTab", "新标签"))}</span></button>${win.browserTabs.length > 1 ? `<button class="browser-tab-close" title="${escapeHtml(translate("browser.closeTab", "关闭标签"))}" data-action="browser-close-tab" data-window-id="${escapeHtml(win.id)}" data-tab-id="${escapeHtml(tab.id)}">×</button>` : ""}</div>`).join("")}<button class="icon-button" title="${escapeHtml(translate("browser.newTab", "新标签"))}" data-action="browser-new-tab" data-window-id="${escapeHtml(win.id)}">+</button></div><div class="browser-bar"><button class="icon-button" title="${escapeHtml(translate("browser.back", "后退"))}" data-action="browser-back" data-window-id="${escapeHtml(win.id)}">‹</button><button class="icon-button" title="${escapeHtml(translate("browser.forward", "前进"))}" data-action="browser-forward" data-window-id="${escapeHtml(win.id)}">›</button><button class="icon-button" title="${escapeHtml(translate("browser.reload", "刷新"))}" data-action="browser-reload" data-window-id="${escapeHtml(win.id)}">${icon("refresh")}</button><input class="browser-address" data-browser-address="${escapeHtml(win.id)}" value="${escapeHtml(url)}" /><button class="primary-button compact" data-action="browser-go" data-window-id="${escapeHtml(win.id)}">${escapeHtml(translate("browser.go", "打开"))}</button><button class="secondary-button compact" data-action="browser-bookmark" data-window-id="${escapeHtml(win.id)}">${escapeHtml(bookmarks.includes(url) ? translate("browser.bookmarked", "已收藏") : translate("browser.bookmark", "收藏"))}</button></div><div class="browser-quick-links"><span>${escapeHtml(translate("browser.bookmarks", "收藏"))}</span>${bookmarks.slice(-5).reverse().map((item) => `<button data-action="browser-open-bookmark" data-window-id="${escapeHtml(win.id)}" data-url="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("") || `<em>${escapeHtml(translate("browser.noBookmarks", "暂无"))}</em>`}<span>${escapeHtml(translate("browser.history", "历史"))}</span>${history.map((item) => `<button data-action="browser-open-history" data-window-id="${escapeHtml(win.id)}" data-url="${escapeHtml(item.url)}">${escapeHtml(item.title || item.url)}</button>`).join("") || `<em>${escapeHtml(translate("browser.noBookmarks", "暂无"))}</em>`}</div><div class="browser-status" data-browser-status="${escapeHtml(win.id)}">${escapeHtml(win.browserStatus || translate("browser.ready", "{{role}} 浏览器就绪", { role: role.name }))}</div><webview class="browser-webview" data-browser-webview="${escapeHtml(win.id)}" data-browser-tab-id="${escapeHtml(activeTab?.id || "")}" src="${escapeHtml(url)}" partition="${escapeHtml(partition)}" allowpopups="false"></webview></div>`;
    }

    function getFileEditorMetrics(content, cursorIndex = 0) {
      const text = String(content || "");
      const safeCursor = Math.max(0, Math.min(Number(cursorIndex) || 0, text.length));
      const beforeCursor = text.slice(0, safeCursor);
      const lines = Math.max(1, text.split(/\r\n|\r|\n/).length);
      const line = beforeCursor.split(/\r\n|\r|\n/).length;
      const lastBreak = Math.max(beforeCursor.lastIndexOf("\n"), beforeCursor.lastIndexOf("\r"));
      return { line, column: safeCursor - lastBreak, lines, chars: text.length };
    }
    function renderFileLineNumbers(content) { const metrics = getFileEditorMetrics(content); return Array.from({ length: metrics.lines }, (_item, index) => String(index + 1)).join("\n"); }
    function renderFileEditorFooter(win, content = win.fileDraft || "", cursorIndex = 0) {
      const metrics = getFileEditorMetrics(content, cursorIndex);
      const dirtyLabel = win.fileDirty ? translate("file.unsaved", "未保存") : translate("file.saved", "已保存");
      return translate("file.footer", "{{path}} · 第 {{line}} 行，第 {{column}} 列 · {{lines}} 行 · {{chars}} 字符 · {{dirty}} · Ctrl+S 保存", { path: win.filePath || translate("file.noFile", "未选择文件"), line: metrics.line, column: metrics.column, lines: metrics.lines, chars: metrics.chars, dirty: dirtyLabel });
    }
    function syncFileEditorChrome(windowId) {
      const win = getWindowState?.(windowId);
      const editor = global.document.querySelector(`[data-file-editor="${CSS.escape(windowId)}"]`);
      if (!win || !editor) return;
      const content = String(editor.value || "");
      const lines = global.document.querySelector(`[data-file-lines="${CSS.escape(windowId)}"]`);
      if (lines) { lines.textContent = renderFileLineNumbers(content); lines.scrollTop = editor.scrollTop; }
      const footer = global.document.querySelector(`[data-file-footer="${CSS.escape(windowId)}"]`);
      if (footer) footer.textContent = renderFileEditorFooter(win, content, editor.selectionStart || 0);
    }
    function renderFileTreeItems(win, fileList) {
      if (!fileList.length) {
        return `<div class="file-list-empty">${escapeHtml(translate("file.listEmpty", "点击刷新或输入路径打开项目文件。"))}</div>`;
      }
      const collapsed = (win.fileCollapsedDirs && typeof win.fileCollapsedDirs === "object") ? win.fileCollapsedDirs : {};
      const normalize = (value) => String(value || "").replace(/\\/g, "/");
      const isHiddenByCollapse = (normalized) => {
        const parts = normalized.split("/");
        for (let index = 1; index < parts.length; index += 1) {
          if (collapsed[parts.slice(0, index).join("/")]) return true;
        }
        return false;
      };
      return fileList.map((file) => {
        const normalized = normalize(file.path);
        if (isHiddenByCollapse(normalized)) return "";
        const segments = normalized.split("/").filter(Boolean);
        const depth = Math.max(0, segments.length - 1);
        const label = escapeHtml(segments[segments.length - 1] || file.name || file.path);
        const indent = ` style="padding-left:${7 + depth * 14}px"`;
        if (file.type === "directory") {
          const caret = collapsed[normalized] ? "▸" : "▾";
          return `<button class="file-list-item folder"${indent} data-action="file-toggle-dir" data-window-id="${escapeHtml(win.id)}" data-file-path-value="${escapeHtml(file.path)}" title="${escapeHtml(file.path)}"><span class="file-tree-row"><span class="file-tree-caret">${caret}</span>${label}</span></button>`;
        }
        return `<button class="file-list-item ${file.path === win.filePath ? "active" : ""}"${indent} data-action="file-open-list-item" data-window-id="${escapeHtml(win.id)}" data-file-path-value="${escapeHtml(file.path)}" title="${escapeHtml(file.path)}"><span class="file-tree-row"><span class="file-tree-caret file-tree-leaf"></span>${label}</span></button>`;
      }).join("");
    }
    function renderFileContent(win) {
      const role = getRole?.(win.roleId) || { name: win.roleId || "" };
      const project = getProject?.();
      const fileList = Array.isArray(win.fileList) ? win.fileList : [];
      const fileDraft = String(win.fileDraft || "");
      return `<div class="real-file-editor" data-file-window="${escapeHtml(win.id)}"><div class="file-toolbar"><div class="file-path-row"><input class="file-path-input" data-file-path="${escapeHtml(win.id)}" value="${escapeHtml(win.filePath || "")}" placeholder="${escapeHtml(translate("file.placeholder.path", "输入项目内文件路径，例如 README.md"))}" /><button class="secondary-button compact" data-action="file-open" data-window-id="${escapeHtml(win.id)}">${escapeHtml(translate("file.open", "打开"))}</button><button class="secondary-button compact" data-action="file-pick" data-window-id="${escapeHtml(win.id)}">${escapeHtml(translate("file.pick", "选择"))}</button><button class="primary-button compact" data-action="file-save" data-window-id="${escapeHtml(win.id)}">${escapeHtml(translate("file.save", "保存"))}</button><button class="secondary-button compact" data-action="file-save-as" data-window-id="${escapeHtml(win.id)}">${escapeHtml(translate("file.saveAs", "另存为"))}</button><button class="secondary-button compact" data-action="file-create-folder" data-window-id="${escapeHtml(win.id)}">${escapeHtml(translate("file.newFolder", "新建文件夹"))}</button><button class="secondary-button compact" data-action="file-rename" data-window-id="${escapeHtml(win.id)}">${escapeHtml(translate("file.rename", "重命名"))}</button><button class="secondary-button compact danger" data-action="file-delete" data-window-id="${escapeHtml(win.id)}">${escapeHtml(translate("file.delete", "删除"))}</button></div><div class="file-status ${win.fileError ? "error" : ""}" data-file-status="${escapeHtml(win.id)}">${escapeHtml(win.fileError || win.fileStatus || translate("file.editorReady", "{{role}} 文件编辑器 · {{path}}", { role: role.name, path: project ? project.path : translate("file.noProject", "未选择项目") }))}</div></div><div class="file-editor-layout"><aside class="file-list"><div class="file-list-title"><span>${escapeHtml(translate("file.projectFiles", "项目文件"))}</span><button class="icon-button" title="${escapeHtml(translate("file.refreshList", "刷新文件列表"))}" data-action="file-refresh-list" data-window-id="${escapeHtml(win.id)}">${icon("refresh")}</button></div><div class="file-list-items">${renderFileTreeItems(win, fileList)}</div></aside><section class="file-editor-pane"><div class="file-editor-main"><pre class="file-editor-lines" data-file-lines="${escapeHtml(win.id)}">${escapeHtml(renderFileLineNumbers(fileDraft))}</pre><textarea class="file-editor-textarea" data-file-editor="${escapeHtml(win.id)}" spellcheck="false" placeholder="${escapeHtml(translate("file.placeholder.editor", "打开或新建项目内文本文件。"))}">${escapeHtml(fileDraft)}</textarea></div><div class="file-editor-footer" data-file-footer="${escapeHtml(win.id)}">${escapeHtml(renderFileEditorFooter(win, fileDraft))}</div></section></div></div>`;
    }
    return { renderTerminalContent, renderBrowserContent, getFileEditorMetrics, renderFileLineNumbers, renderFileEditorFooter, syncFileEditorChrome, renderFileContent };
  }
  global.COSS_WORKSPACE_VIEW_RENDERER = Object.freeze({ createWorkspaceViewRenderer });
})(window);
