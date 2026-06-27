# CosS v0.5.0 开发记录

## 阶段 7：Claude Code and Codex 深度集成

本版本目标是让角色 Agent 终端不再只是“打开一个 CLI”，而是能够携带 CosS 项目、任务、子任务和会话上下文启动，并把 Agent 输出的状态标记同步回 CosS 任务系统。

## 本版本已开发模块

1. Agent 会话上下文
   - 角色 Agent 终端新增 `agentSession` 元数据。
   - 会话记录包含 `sessionId`、`provider`、`roleId`、`projectId`、`taskId`、`subtaskId`、`sessionName`、启动次数和最近事件时间。
   - 创建任务并确认计划后，自动打开的终端角色默认使用 Agent 模式，而不是普通 PowerShell。

2. Claude Code / Codex 环境与鉴权检测
   - Claude Code 检测结果新增登录/配置状态摘要。
   - Codex 检测结果新增 `~/.codex/auth.json` 或自定义 `COSS_CODEX_AUTH_PATH` 的凭据状态摘要。
   - 检测结果只展示是否检测到凭据、来源和路径，不记录 API key 或 token 内容。
   - 修复鉴权检测误判风险：只在 auth、token、api key、session 等相关字段上下文中识别凭据信号。

3. Agent 提示词模板
   - 设置页“智能体设置”新增 Agent 角色提示词模板编辑器。
   - 模板会渲染为 `COSS_ROLE_PROMPT` 环境变量，传递给 Claude Code / Codex Agent 终端。
   - 支持占位符：`{{roleName}}`、`{{roleDescription}}`、`{{projectName}}`、`{{workspace}}`、`{{agentProvider}}`、`{{sessionId}}`、`{{taskTitle}}`、`{{taskGoal}}`、`{{subtaskTitle}}`、`{{subtaskDescription}}`。
   - 提供“恢复默认”按钮。

4. Agent 终端环境变量
   - Agent 终端启动时写入 `COSS_*` 环境变量：
     - `COSS_ROLE_ID`
     - `COSS_ROLE_NAME`
     - `COSS_ROLE_PROMPT`
     - `COSS_TERMINAL_MODE`
     - `COSS_AGENT_PROVIDER`
     - `COSS_AGENT_SESSION_ID`
     - `COSS_AGENT_SESSION_NAME`
     - `COSS_PROJECT_ID`
     - `COSS_PROJECT_NAME`
     - `COSS_TASK_ID`
     - `COSS_SUBTASK_ID`
     - `COSS_TASK_TITLE`
     - `COSS_SUBTASK_TITLE`

5. Agent 输出事件同步
   - 主进程解析 Claude Code / Codex 终端输出中的状态标记：
     - `COSS_AGENT_STATUS:running`
     - `COSS_AGENT_STATUS:done`
     - `COSS_AGENT_STATUS:blocked`
     - `COSS_AGENT_STATUS:failed`
     - 兼容 `COSS_TASK_DONE`、`COSS_TASK_BLOCKED`、`COSS_TASK_FAILED`、`COSS_TASK_RUNNING`。
   - 解析到事件后通过 `terminal:agent-event` IPC 通知渲染进程。
   - 渲染进程将事件写入 `project.agentEvents`，并同步更新窗口状态、子任务状态和任务整体状态。
   - 任务窗口新增“Agent 会话事件”区域，展示最近 Agent 状态事件。

6. 日志与进程稳定性
   - 新增 `agent.output.event` 日志。
   - 新增 `agent.event.applied` 日志。
   - `terminal.create.requested` / `terminal.create.succeeded` 日志新增会话和任务信息。
   - 对同一窗口、同一会话、同一任务、同一状态事件做去重，避免 PTY 屏幕重绘重复触发状态同步。
   - 应用退出时在 `before-quit` 和 `window-all-closed` 统一清理终端会话，避免 PowerShell / Claude / Codex 子进程阻塞 Electron 退出。

## 局部测试

本版本没有跑完整 e2e，只跑 v0.5 相关模块测试：

```powershell
node --check src\main.cjs
node --check src\renderer.js
node --check src\preload.cjs
node --check tests\e2e\app.spec.cjs
```

```powershell
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "v0.5.0|boots into the workspace shell"
```

结果：

- 通过 4 项。
- 覆盖基础启动版本显示。
- 覆盖 v0.5.0 标题栏和应用信息版本。
- 覆盖 Agent 提示词模板保存、恢复默认和 Codex 鉴权状态按需检测。
- 覆盖 fake Codex CLI 输出 `COSS_AGENT_STATUS:done` 后，CosS 自动回写 Agent 事件、子任务状态、任务状态和日志。

## 现阶段人工测试建议

1. 设置页
   - 进入“智能体设置”。
   - 确认 Claude Code / Codex 不会自动检测。
   - 点击“重新检测”，确认检测结果中显示命令状态、安装建议和登录状态。
   - 修改 Agent 角色提示词模板，关闭设置后再打开，确认内容保留。
   - 点击“恢复默认”，确认模板恢复。

2. Codex Agent 终端
   - 设置 Agent 后端为 Codex。
   - 创建任务并确认任务计划。
   - 观察自动创建的角色终端标题是否为 `Agent(Codex)`。
   - 在真实 Codex CLI 中完成任务时输出 `COSS_AGENT_STATUS:done`，确认任务卡片状态变为完成。

3. Claude Code Agent 终端
   - 设置 Agent 后端为 Claude Code。
   - 创建角色 Agent 终端。
   - 在终端中检查 `COSS_ROLE_PROMPT`、`COSS_AGENT_SESSION_ID`、`COSS_TASK_ID` 等环境变量是否存在。
   - 输出 `COSS_AGENT_STATUS:blocked`，确认 CosS 状态更新为阻塞。

## 后续建议

1. Agent 间通信需要从“消息中心”继续升级为可被 Claude Code / Codex 读取和写入的任务消息协议。
2. `COSS_AGENT_STATUS:*` 只是轻量事件协议，后续应增加结构化 JSON 事件，例如 `COSS_AGENT_EVENT:{...}`。
3. Codex / Claude Code 登录态当前只做本地配置检测，不做真实 API 登录校验，后续可加入显式“登录测试”。
4. Agent 终端尚未支持从 CosS UI 直接向某个角色发送上下文指令，后续可在任务卡片增加“发送给角色”按钮。
5. 需要继续把 `project.agentEvents` 和 `project.messages` 合并成统一的协作事件时间线。
