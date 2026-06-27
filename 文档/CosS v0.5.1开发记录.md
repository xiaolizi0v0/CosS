# CosS v0.5.1 开发记录

## 版本目标

基于 v0.5.0 “Claude Code and Codex 深度集成”后的待办，本小版本优先补齐 Agent 协作闭环中的轻量但关键能力：

- 让 Agent 终端除 `COSS_AGENT_STATUS:*` 外，支持结构化协作事件。
- 让任务卡片可以直接把上下文指令发送给指定角色。
- 将角色消息和 Agent 事件合并为统一的项目协作时间线。

## 已实现内容

### 1. 结构化 Agent 事件协议

终端输出继续兼容旧协议：

```text
COSS_AGENT_STATUS:done
```

新增结构化协议：

```text
COSS_AGENT_EVENT:{"status":"done","message":"前端登录页已完成，等待接口联调。","toRoleIds":["product-manager","qa-engineer"]}
```

当前支持字段：

- `status`: `running`、`done`、`blocked`、`failed` 等状态别名。
- `message`: 写入 CosS 协作时间线和角色消息总线的内容。
- `toRoleIds` / `toRoleId`: 接收角色。
- `fromRoleId` / `roleId`: 发送角色，可选；缺省使用当前 Agent 窗口角色。
- `taskId`、`subtaskId`: 可选；缺省使用当前 Agent 会话绑定的任务上下文。

### 2. Agent 事件写入消息总线

当结构化事件包含 `message` 时，CosS 会自动生成一条 `source=agent-event` 的角色消息，用于：

- 右下角协作角标计算。
- 消息中心/协作时间线展示。
- 任务频道归档。
- 日志系统追踪。

### 3. 任务卡片发送给角色

每个子任务卡片新增 `发送给角色` 按钮。

点击后会打开指令弹窗，并自动填入：

- 当前任务标题。
- 子任务标题。
- 目标角色。
- 子任务执行说明。
- 默认协作提示。

发送后会生成 `source=task-instruction` 的任务频道消息，并自动打开当前任务筛选后的协作时间线。

### 4. 统一协作时间线

消息中心升级为 `v0.5.1 协作时间线`，统一展示：

- 手动角色消息。
- 任务规划生成的协作消息。
- 子任务状态变更消息。
- 任务卡片发送的角色指令。
- Agent 结构化事件。

新增筛选能力：

- 按任务筛选。
- 按角色、消息内容、状态、来源搜索。

### 5. 日志事件

新增或扩展日志：

- `agent.output.event`: 记录 Agent 输出事件，包含 `type`、`structured`、`message`。
- `role.message.agent-created`: 结构化 Agent 事件写入消息总线。
- `task.instruction.sent`: 任务卡片指令发送记录。

## 版本号

- `package.json`: `0.5.1`
- `package-lock.json`: `0.5.1`
- 应用侧边栏显示：`v0.5.1`
- `app:info` 返回：`0.5.1`

## 本轮测试范围

本版本只跑与 v0.5.1 改动相关的模块测试，不跑完整 e2e。

计划测试：

- 启动基础壳版本号。
- v0.5.1 标题栏/应用信息版本号。
- 消息中心手动消息兼容。
- 任务卡片发送角色指令。
- Codex 假终端输出结构化事件后同步任务状态、消息总线和协作时间线。

## 暂未实现内容

以下功能仍保留到后续版本，不在 v0.5.1 范围内：

- Claude Code / Codex 登录态的真实远程 API 校验。
- 从 CosS UI 直接向已经运行的 Claude Code / Codex 终端注入命令或上下文。
- 任务计划的可视化编辑，例如增删子任务、切换角色、修改描述。
- 文件编辑器的文件树、新建文件夹、重命名、删除、另存为。
- 浏览器多标签页、收藏/历史、测试角色一键打开任务 URL。
- 更完整的 Agent 间消息协议，包括确认、已读、重试、引用终端命令日志。
