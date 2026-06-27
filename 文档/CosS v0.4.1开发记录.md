# CosS v0.4.1 开发记录

主题：真实浏览器程序与真实文件编辑器

## 1. 版本目标

v0.4.1 在 v0.4 角色消息总线基础上，把两个原型程序升级为真实可用能力：

- 浏览器程序从静态占位界面升级为 Electron `webview`。
- 文件程序从 contenteditable 原型升级为项目文件读写编辑器。
- 应用版本升级为 `v0.4.1`。

## 2. 真实浏览器程序

能力：

- 浏览器窗口内嵌真实 `webview`。
- 支持地址栏输入 URL。
- 支持打开、刷新、后退、前进。
- 支持 `http`、`https`、`file`、`data`、`about` 协议。
- 普通域名自动补 `https://`。
- `localhost`、`127.0.0.1` 自动补 `http://`。
- 每个项目和角色使用独立 partition：`persist:coss-{projectId}-{roleId}`。

安全设置：

- 主窗口启用 `webviewTag`。
- `will-attach-webview` 中清理 preload。
- webview 禁用 Node integration。
- webview 启用 contextIsolation 和 sandbox。
- 未允许协议会被阻止并写入日志。
- webview 弹出新窗口会被拦截，改为系统外部打开。

日志：

- `browser.navigate`
- `browser.navigate.failed`
- `browser.command`
- `browser.command.failed`
- `browser.load.failed`
- `browser.webview.blocked`
- `browser.window-open`

## 3. 真实文件编辑器

能力：

- 展示项目文本文件列表。
- 支持刷新项目文件列表。
- 支持输入项目内相对路径打开文件。
- 支持系统文件选择器选择项目内文件。
- 支持编辑文本内容。
- 支持保存到项目目录。
- 支持新建项目内文本文件：输入不存在的相对路径后保存即可创建。
- 支持 `Ctrl+S` 保存。

安全边界：

- 所有文件读写都通过主进程 IPC 完成。
- renderer 不直接访问 Node 文件系统。
- 文件路径必须位于当前项目目录内。
- 越界路径会被主进程拒绝。
- 只编辑看起来像文本的文件。
- 单文件编辑上限为 2MB。
- 文件列表默认跳过 `node_modules`、`.git`、`dist`、`build`、`out`、`coverage`、`test-results`。

日志：

- `files.listed`
- `files.list.failed`
- `file.read`
- `file.read.failed`
- `file.saved`
- `file.save.failed`
- `file.selected`
- `file.selection-canceled`
- `file.selection.failed`
- `file.opened`
- `file.saved.renderer`
- `file.list.loaded`

## 4. 涉及文件

- `src/main.cjs`
  - 启用 `webviewTag`。
  - 增加 webview attach 安全策略。
  - 增加项目文件列表、读取、保存、选择文件 IPC。
- `src/preload.cjs`
  - 暴露文件编辑器相关安全 API。
- `src/renderer.js`
  - 浏览器窗口接入 webview 和导航控制。
  - 文件窗口接入文件列表、打开、编辑、保存。
  - 窗口状态补充 `browserUrl`、`filePath`、`fileDraft`、`fileDirty` 等字段。
- `src/styles.css`
  - 浏览器和文件编辑器布局样式。
- `package.json`
  - 版本升级到 `0.4.1`。
- `package-lock.json`
  - 同步版本。
- `tests/e2e/app.spec.cjs`
  - 新增真实浏览器和真实文件编辑器 e2e。

## 5. 局部验证

已运行：

```powershell
node --check src\main.cjs
node --check src\preload.cjs
node --check src\renderer.js
node --check tests\e2e\app.spec.cjs
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "v0.4.1|real browser|project file"
```

结果：

```text
3 passed
```

## 6. 当前限制

- 浏览器还没有多标签页。
- 浏览器还没有下载管理。
- 文件编辑器暂未接 Monaco/CodeMirror，当前使用原生 textarea。
- 文件编辑器暂未做语法高亮。
- 文件编辑器暂未做外部修改冲突检测。
- 文件树当前是轻量列表，不是完整目录树。

## 7. 后续建议

v0.4.2 可以继续：

- 给文件编辑器接入目录树。
- 增加新建文件/新建文件夹按钮。
- 增加删除、重命名、另存为。
- 增加浏览器多标签页。
- 让测试工程师角色可以从任务中直接打开浏览器验证页面。
- 让文件修改消息写入角色消息总线。
