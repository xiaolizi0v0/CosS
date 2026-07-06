# CosS v0.10.0 Kernel 重构开发记录

## 版本定位

v0.10.0 将 CosS 从前端/服务器散落调度逻辑收敛为中央 Kernel 架构。

核心目标：

1. CosS Kernel 是唯一调度者。
2. Kernel Planner 使用模型在任务创建时生成完整 DAG Step 图，LLM Gateway 不再拥有任务规划权。
3. Agent 只能认领 Kernel 分配的步骤。
4. Agent 通过 MCP 提交结构化结果，不直接派发其他角色。
5. 后续步骤只能来自 `coss_submit_result.nextStepSuggestions`，由 Kernel 校验角色、能力、依赖、锁和审批后创建。
6. 每个执行步骤拥有 lease，长任务必须通过 `coss_heartbeat_step` 续租。
7. Kernel 事件写入任务历史和项目事件流，用于恢复、审计和 UI 投影。

## Kernel Planner 完整 Step 图

- 任务创建时不再只生成首轮 Agent 子任务，而是由 Kernel Planner 一次性生成完整 DAG。
- `subtasks` 在 v0.10 中表示 Kernel Step 列表，每个 Step 可包含 `id`、`roleId`、`title`、`description`、`dependsOn`、`riskLevel`。
- `firstRoundRoleIds` 只表示入口 Agent，CosS 只在确认任务后立即投递入口 Step。
- 非入口 Step 会保留在任务板里，直到其 `dependsOn` 指向的前置 Step 完成后，由 Kernel 自动写入消息池并投递给对应 Agent。
- Agent 仍可通过 `coss_submit_result.nextStepSuggestions` 提交动态追加建议，但完整主流程优先来自 Kernel Planner 的初始 DAG。

## 新增内核模块

- `src/orchestrator/kernel.cjs`

该模块负责：

- Kernel 版本和协议常量。
- 角色与能力沙箱。
- 任务、步骤、锁、审批的状态机。
- Step 生命周期：`queued -> claimed -> running -> submitted/validating/waiting -> completed/blocked`。
- Step lease 与 heartbeat。
- Kernel event store 记录。
- 任务板 projection。

## MCP 工具层

MCP server 现在作为 Kernel 适配层工作。

保留并接入 Kernel 的工具：

- `coss_get_context`
- `coss_list_roles`
- `coss_get_task_board`
- `coss_pool_read`
- `coss_pool_claim`
- `coss_list_tasks`
- `coss_claim_task`
- `coss_claim_step`
- `coss_report_status`
- `coss_submit_result`
- `coss_acquire_lock`
- `coss_release_lock`
- `coss_request_approval`

新增工具：

- `coss_heartbeat_step`：续租当前 Agent 正在执行的 Kernel Step。
- `coss_get_kernel_events`：读取 Kernel 事件流和任务板投影。

## UI 与提示词

- 应用版本升级为 `v0.10.0`。
- Agent 默认提示词升级为 v0.10 Kernel 协议。
- 设置页 MCP 工具说明改为 Kernel 工具层。
- 消息中心标题改为 `v0.10 Kernel 时间线`。
- 前端新增 Kernel projection 读取层，任务列表、子任务卡片和 Agent 角标优先读取 Step phase、lease、锁、审批和事件投影。
- 子任务卡片新增 Kernel phase chip，用于展示已写入消息池、已认领、执行中、待确认、已完成和已阻塞等细阶段。
- 任务列表详情新增 queued、running、done、locks、approvals、events 指标。

## 前端 Kernel Action 收口

- 前端手动子任务状态变更不再直接只改 `subtask.status` 和 `task.status`，统一通过 renderer Kernel action 写入。
- Agent 结构化事件回写状态时，同步更新 `step.phase`、`step.status`、`subtask.status`、`task.status`。
- renderer Kernel action 会同时写入 `task.orchestrator.events` 与 `project.kernelEvents`，用于时间线、任务列表和审计追踪。
- 任务读取初始化时，最终状态以 Kernel projection 为准，旧字段只作为兜底。
- 派发消息创建时同步初始化 `step.phase=queued`，保证新任务一创建就能显示“已写入消息池”阶段。

## 验证目标

本版本重点验证：

- 应用启动显示 v0.10.0。
- 项目 MCP 配置包含 v0.10 Kernel 工具。
- MCP server 暴露新增 heartbeat 和 kernel events 工具。
- `coss_claim_step` 会生成 lease。
- `coss_heartbeat_step` 会续租并写入 Kernel 事件。
- `coss_submit_result` 仍通过能力沙箱与 Kernel 校验创建后续步骤。
- 前端 projection 改动不会破坏启动、MCP 配置和 Kernel 工具闭环。
- 任务列表手动状态按钮会写入 Kernel phase 和 renderer Kernel event。
