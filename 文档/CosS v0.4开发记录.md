# CosS v0.4 开发记录

主题：角色消息总线与消息中心

## 1. 版本目标

v0.4 在 v0.3 真实任务规划器基础上，开始实现“角色消息总线”。

本阶段完成：

- 应用版本升级为 `v0.4.0`。
- 项目消息从简单模拟数组升级为结构化消息协议。
- 新增角色消息中心。
- 支持用户手动发送角色私聊消息。
- 任务确认后，任务规划器生成的协作消息会进入任务频道。
- 子任务状态变化会产生任务状态消息。
- 协作角标继续从项目消息中计算协作对象。
- 消息相关操作写入日志。

## 2. 消息协议

v0.4 消息字段：

| 字段 | 含义 |
| --- | --- |
| `id` | 消息 ID |
| `type` | 当前为 `role-message` |
| `channelType` | `direct` 私聊或 `task` 任务频道 |
| `channelId` | 私聊或任务频道 ID |
| `fromRoleId` | 发送角色 |
| `toRoleIds` | 接收角色列表 |
| `content` | 消息内容 |
| `taskId` | 可选，关联任务 |
| `source` | `manual`、`task-plan`、`task-status` |
| `status` | 当前为 `sent` |
| `readBy` | 已读角色列表 |
| `createdAt` | 创建时间 |

旧数据兼容：

- 老版本 `project.messages` 会在加载时自动补齐新字段。
- 旧消息不会丢失。
- 无效角色会被归一到默认角色。

## 3. 消息中心

入口：

- 左侧导航“消息”。
- 工作区右上角“消息中心”。
- 桌面右键菜单“消息中心”。
- 协作角标弹窗“发送消息”。

能力：

- 选择发送角色。
- 选择接收角色。
- 选择私聊或关联已有任务。
- 发送消息后立即写入当前项目状态。
- 消息列表展示发送方、接收方、频道、来源和内容。

## 4. 任务消息

任务确认后：

- `taskPlan.messages` 会写入项目消息总线。
- 来源标记为 `task-plan`。
- 频道标记为 `task`。
- 消息和任务 ID 关联。

子任务状态变化后：

- 产生 `task-status` 消息。
- 发送方为子任务所属角色。
- 接收方为产品经理和技术负责人。
- 内容记录子任务标题和新状态。

## 5. 日志事件

新增日志：

- `role.message.sent`：用户手动发送角色消息。
- `role.messages.created`：任务确认后批量创建任务协作消息。
- `role.message.system-created`：子任务状态变化产生系统消息。

继续复用：

- `task.created`
- `subtask.status.changed`
- `task.plan.generated`
- `llm.plan.*`

## 6. 涉及文件

- `src/renderer.js`
  - 消息协议归一化。
  - 消息中心 UI。
  - 手动发送角色消息。
  - 任务消息和状态消息写入消息总线。
- `src/styles.css`
  - 消息中心布局和消息列表样式。
- `src/main.cjs`
  - 版本兜底更新。
- `package.json`
  - 版本升级到 `0.4.0`。
- `package-lock.json`
  - 同步版本。
- `tests/e2e/app.spec.cjs`
  - v0.4 消息中心和任务消息总线测试。

## 7. 局部验证

已运行：

```powershell
node --check src\main.cjs
node --check src\renderer.js
node --check tests\e2e\app.spec.cjs
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "v0.4|placeholder|task planner|v0.3.3 LLM Gateway"
```

结果：

```text
8 passed
```

## 8. 后续建议

v0.4 后续可以继续补：

- 消息已读/未读状态。
- 按任务过滤消息。
- 多角色群聊选择多个接收角色。
- 消息搜索。
- 消息和终端命令日志互相引用。
- 角色自动执行任务时把执行事件写入同一消息总线。
