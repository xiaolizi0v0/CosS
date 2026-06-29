# CosS v0.5.5 开发记录

开发日期：2026-06-28

## 版本目标

v0.5.5 将工作区组织方式从“一个桌面代表一次任务”调整为“一个对话代表一个持续桌面”。用户可以在同一对话中连续发布多个任务，并复用该对话里已有的终端、浏览器、文件编辑器等角色程序。

## 已完成模块

1. 终端闪屏修复
   - 修复点击桌面空白处时触发整页 `render()`，导致 Agent 终端前端被重建、出现短暂黑屏闪烁的问题。
   - 空白点击现在只在需要关闭菜单、浮层或对话视图时才刷新界面。

2. 终端留痕与会话保活
   - 主进程为每个终端会话保存输出 transcript。
   - 切换项目或切换对话时，仅卸载当前 xterm 前端视图，不再终止真实终端后端进程。
   - 回到原对话时，终端会重新挂载并回放留痕，正在执行的 Agent 任务不会因对话切换被中断。
   - `terminal:create` 遇到已存在的同 ID 会话时只重新绑定前端窗口，不再重启进程。

3. 对话视图
   - 用户可见的“任务视图”改为“对话视图”。
   - “新建桌面”改为“新建对话”。
   - 对话卡片展示该对话中的程序数量和任务数量。
   - 工作区顶部显示当前对话任务数、对话数和项目任务总数。

4. 项目 -> 对话 -> 任务
   - 新增 `conversationId` 与 `taskIds/lastTaskId` 兼容字段。
   - 新建任务不再创建新桌面，而是追加到当前对话。
   - 同一对话中重复发布任务时，会复用已有角色程序；缺少的角色程序才会自动创建。
   - 消息投递优先匹配同一对话中的 Agent 终端。

5. 任务列表窗口
   - 新增 `task-list` 程序类型。
   - 顶部工具栏、Dock 和右键菜单均新增“任务列表”入口。
   - 任务列表窗口按当前对话展示任务、模型、完成进度、创建时间和子任务角色状态。
   - 重复打开任务列表时会聚焦已有窗口，不会重复创建。

6. CodeBuddy Code Agent 后端
   - 在“智能体设置”中新增 `CodeBuddy Code`，与 `Claude Code`、`Codex` 并列作为 Agent 终端后端。
   - 支持用户在设置页填写 CodeBuddy API Key，创建 CodeBuddy Agent 时自动注入 `CODEBUDDY_API_KEY` 环境变量。
   - 支持手动检测 `codebuddy` / `cbc` CLI、npm 状态和 PATH 命中路径；进入设置页不会自动检测。
   - 支持通过 npm 自动安装 `@tencent-ai/codebuddy-code`，也可通过 `COSS_CODEBUDDY_COMMAND` 指定自定义命令路径。
   - CodeBuddy Agent 终端纳入统一的终端留痕、会话保活和 Agent 事件解析链路。

7. CodeBuddy 投递与设置页修复
   - 修复 CodeBuddy TUI 把多行投递折叠为 `[Pasted text #1: n lines]`，导致 Agent 无法读取完整任务的问题。
   - CodeBuddy 投递改为在项目目录生成 `.coss/deliveries/*.md` 指令文件，终端只输入一行“读取该文件并执行”的指令。
   - 投递前会清理当前输入行，避免 CodeBuddy 输入框中的提示、示例或残留文字污染新任务。
   - 修复智能体设置页三列 Agent 选择卡片挤压左侧说明，导致文字竖排的问题。
   - 扩展 `[Pasted text #1: n lines]` 识别，避免这类粘贴提示被误判为 Agent 真响应。

## 测试结果

静态检查：

```powershell
node --check src\main.cjs
node --check src\renderer.js
node --check src\preload.cjs
node --check tests\e2e\app.spec.cjs
```

结果：全部通过。

本次只运行 v0.5.5 相关 e2e：

```powershell
npm.cmd run test:e2e -- tests/e2e/app.spec.cjs -g v0.5.5
```

追加 CodeBuddy 聚焦用例：

```powershell
npm.cmd run test:e2e -- tests/e2e/app.spec.cjs -g CodeBuddy
```

消息投递回归用例：

```powershell
npm.cmd run test:e2e -- tests/e2e/app.spec.cjs -g "queues timeline messages"
```

结果：CodeBuddy 聚焦用例 2 passed；消息投递回归 1 passed；v0.5.5 聚焦用例 8 passed。

## 后续建议

1. 在真实 CosS 窗口中继续复测：切换项目、切换对话、Agent 持续输出、任务列表刷新。
2. 后续可在任务列表中增加任务搜索、任务归档、拖动排序和按角色/状态过滤。
3. 后续可把底层 `desktop` 字段逐步迁移为 `conversation` 字段，目前为了兼容历史数据仍保留 `desktopId`。
