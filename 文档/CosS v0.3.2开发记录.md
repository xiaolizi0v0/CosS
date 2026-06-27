# CosS v0.3.2 开发记录

主题：顶部菜单、文件日志系统、新建项目路径选择

## 1. 版本目标

v0.3.2 在 v0.3.1 的模型设置和 LLM Gateway 基础上，补齐 Windows 桌面应用常用的顶部菜单入口，并完善项目创建和日志能力。

本阶段完成：
- 应用版本升级为 `v0.3.2`。
- 启用 Electron 原生顶部菜单栏。
- 新增“文件”“编辑”“帮助”三个菜单。
- 新建项目支持通过系统文件夹选择器指定项目保存路径。
- 新增文件日志系统，日志写入用户数据目录下的 `logs` 文件夹。
- 帮助菜单支持打开日志目录。
- 新增“关于 CosS”弹窗，展示版本、日志目录和用户数据目录。

## 2. 顶部菜单

文件：
- 新建窗口
- 新建任务
- 新建项目
- 设置
- 关闭窗口

编辑：
- 撤销 `Ctrl+Z`
- 重做 `Ctrl+Y`
- 剪切 `Ctrl+X`
- 复制 `Ctrl+C`
- 粘贴 `Ctrl+V`
- 全选 `Ctrl+A`

帮助：
- 打开日志目录
- 关于 CosS

## 3. 日志系统

日志目录：
```text
{Electron userData}/logs
```

日志格式：
```text
coss-YYYY-MM-DD.jsonl
```

每一行是一个 JSON 事件，包含：
- `timestamp`
- `level`
- `event`
- `appVersion`
- `payload`

当前已记录的关键事件：
- 应用启动：`app.ready`
- 状态保存：`state.saved`
- 菜单动作：`menu.action`
- 项目目录选择：`project.directory.selected`
- 项目创建：`project.created`
- 程序创建：`program.created`
- 任务创建：`task.created`
- 打开日志目录：`logs.open-directory`

## 4. 新建项目

新建项目弹窗已增加“选择文件夹”按钮。

真实运行时：
- 调用 Electron `dialog.showOpenDialog`
- 使用 `openDirectory` 和 `createDirectory`
- 弹出 Windows 文件资源管理器式目录选择窗口

测试运行时：
- 可通过 `COSS_MOCK_PROJECT_DIRECTORY` 模拟用户选择目录，避免 e2e 被系统对话框阻塞。

创建项目时现在会校验：
- 项目名称不能为空
- 项目保存路径不能为空

创建成功后：
- 项目切换为当前项目
- 对应类桌面工作区启动
- 写入 `project.created` 文件日志

## 5. 本次涉及模块

- `src/main.cjs`
  - Electron 原生菜单
  - 文件日志系统
  - 打开日志目录
  - 系统目录选择对话框 IPC
- `src/preload.cjs`
  - 暴露菜单动作监听、目录选择、日志和应用信息接口
- `src/renderer.js`
  - 新建项目路径选择 UI
  - 关于弹窗
  - 菜单动作分发
  - 项目/程序/任务事件日志
- `src/styles.css`
  - 路径选择行、表单状态、关于弹窗样式
- `tests/e2e/app.spec.cjs`
  - v0.3.2 菜单、日志目录、新建项目路径选择模块测试

## 6. 局部验证

已运行：

```powershell
node --check src\main.cjs
node --check src\preload.cjs
node --check src\renderer.js
node --check tests\e2e\app.spec.cjs
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "boots into|v0.3.2|folder picker"
```

结果：
```text
3 passed
```

## 8. 空白点击关闭浮层

根据现阶段测试反馈，顶部“文件 / 编辑 / 帮助”下拉菜单，以及桌面右键菜单/角色级联菜单，在点击桌面空白处时没有自动收起。

原因：
- 桌面空白层本身带有 `data-action="desktop"`。
- 点击该层时之前会提前 `return`，没有执行 `closeMenus()`。
- 普通空白点击的刷新判断也没有把顶部菜单 `openAppMenuId` 纳入浮层状态。

当前行为：
- 打开顶部菜单后，点击桌面空白处会关闭下拉菜单。
- 打开右键菜单和角色级联菜单后，点击桌面空白处会同时关闭两层菜单。
- 点击没有 `data-action` 的空白区域时，也会正确关闭顶部菜单。

局部验证：

```powershell
node --check src\renderer.js
node --check tests\e2e\app.spec.cjs
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "custom title bar|dismisses title and desktop menus"
```

结果：
```text
2 passed
```

## 7. 顶部导航栏优化

根据现阶段测试反馈，Windows 原生菜单会显示为两行：第一行是系统标题栏，第二行才是“文件 / 编辑 / 帮助”。这不符合 CosS 的目标界面，因此已改为自定义标题栏。

当前行为：
- 窗口改为无边框，由 CosS 自己绘制顶部标题栏。
- `CosS` 文本、`文件 / 编辑 / 帮助` 导航和最小化 / 最大化 / 关闭按钮处于同一行。
- `文件 / 编辑 / 帮助` 是应用内下拉菜单，点击后显示对应菜单项。
- 右侧窗口按钮调用 Electron IPC 执行最小化、最大化/还原、关闭窗口。
- Electron 原生菜单仍保留用于快捷键和菜单命令，但不再作为可见的第二行菜单栏展示。

本次涉及模块：
- `src/main.cjs`：窗口改为 `frame: false`，新增窗口控制 IPC。
- `src/preload.cjs`：暴露窗口控制、最大化状态监听接口。
- `src/renderer.js`：新增自定义标题栏、应用菜单和窗口控制按钮。
- `src/styles.css`：新增标题栏、下拉菜单、窗口按钮样式。
- `tests/e2e/app.spec.cjs`：菜单测试改为验证自定义标题栏。

局部验证：

```powershell
node --check src\main.cjs
node --check src\preload.cjs
node --check src\renderer.js
node --check tests\e2e\app.spec.cjs
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "boots into|custom title bar|folder picker"
```

结果：
```text
3 passed
```
