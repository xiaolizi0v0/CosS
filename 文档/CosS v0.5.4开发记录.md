# CosS v0.5.4 开发记录

开发日期：2026-06-28

## 版本目标

基于《CosS v0.5.3 全角色协作闭环测试报告》修复全角色协作闭环中的关键问题：任务状态误变更、Agent 等待人工确认不可见、消息中心历史噪声、任务卡片操作不稳定，以及投递后终端反馈状态不清晰。

## 已完成模块

1. 任务状态机修复
   - 新增子任务状态 `waiting`，显示为“待人工确认”。
   - Agent 输出等待审批提示时，不再把任务误判为“已阻塞”。
   - 子任务处于“待人工确认”后，普通 Agent `running` 事件不会自动覆盖为“执行中”，必须由用户点击“继续执行”或由 Agent 输出完成/阻塞状态。
   - 手动点击“开始执行”后的 900ms 内，误触“标记阻塞”会被忽略并记录日志。

2. Agent 审批等待识别
   - 主进程新增 Claude Code/Codex 审批提示识别。
   - 可识别类似 `Do you want to create ...?`、`Yes, allow all edits` 的终端输出。
   - 识别后写入 `agent.output.event`，并同步到任务卡和协作时间线。

3. 投递状态细化
   - 投递状态由单一 `sent` 扩展为 `submitted`、`responded`、`waiting`。
   - 消息中心显示中文状态：已提交、Agent 已响应、等待人工确认。
   - 终端仅出现 `[Pasted text ...]` 时保留“已提交”，不误判为 Agent 已响应。
   - 检测到审批提示时，关联投递自动切换为“等待人工确认”。

4. 消息中心降噪
   - 打开消息中心时，默认过滤到当前桌面/当前任务。
   - 用户在消息中心内手动切换“全部”或其他任务后，刷新不会强制覆盖用户选择。
   - 协作时间线标题升级为 `v0.5.4 协作时间线`。

5. 任务窗口可操作性优化
   - 任务窗口新增“角色过滤”，可直接筛选测试工程师、DevOps 等靠下角色卡片。
   - 任务动作区改为固定网格布局，减少窗口缩放和滚动后的按钮漂移。
   - 新增 `waiting` 状态样式，和 running/done/blocked 区分显示。

6. 状态持久化稳定性
   - 修复多个异步 `saveState()` IPC 并发时，旧快照晚完成覆盖新状态的问题。
   - 保存流程改为串行脏标记刷新，确保最终落盘的是最新状态。

## 测试结果

静态检查：

```powershell
node --check src\main.cjs
node --check src\renderer.js
node --check tests\e2e\app.spec.cjs
```

结果：全部通过。

本次只运行 v0.5.4 相关 e2e：

```powershell
npm.cmd run test:e2e -- tests/e2e/app.spec.cjs -g "v0.5.4 (marks Agent approval|opens message center|filters task cards|queues timeline messages|syncs Codex Agent|ignores echoed Agent marker)"
```

结果：6 passed。

## 后续建议

1. 继续用真实 CosS 窗口复测全角色协作闭环，重点看 Claude Code 人工确认后的“继续执行”体验。
2. 后续可增加“允许本会话编辑/每次确认/只读模式”等 Agent 权限配置。
3. 可在消息中心增加严重级别过滤，把历史错误和当前任务协作事件进一步分层。

## 消息中心追加优化

本轮将消息中心从纵向列表升级为横向协作时间轴：

- 一个节点代表一条角色消息或 Agent 事件。
- 点击节点后，在下方详情区展示完整内容、投递状态和终端输出入口。
- 单角色发送给多个角色时，节点显示分叉目标，便于观察协作扩散路径。
- 消息中心窗口加宽到接近工作台宽度，提高长任务和多角色协作场景的可读性。
- 保留原有发送消息、加入投递队列、确认投递、查看终端输出等操作。

追加验证：

```powershell
npm.cmd run test:e2e -- tests/e2e/app.spec.cjs -g "message center|branching timeline|opens message center filtered|queues timeline messages|sends subtask instructions|syncs Codex Agent"
```

结果：6 passed。

## 消息中心细节修复

- 修复消息频道、任务筛选等 `select/input` 在消息中心内按内容撑开、突出容器的问题。
- 点击横向时间轴后方节点时，不再重绘整条时间轴，因此横向滚动位置不会跳回第一个节点。
- 补充 e2e 覆盖：先把横向时间轴滚到后方，再点击分叉节点，断言滚动位置仍保留。
- 修复 Agent 状态节点复用 `.agent-timeline-row` 兼容类后带上详情卡背景，导致横向主线被遮挡、节点之间看起来断线的问题。
- 修复 Agent 状态节点圆点相对普通消息节点下沉的问题：圆点改为绑定到时间轴主线的固定 Y 坐标，并补充普通消息节点与 Agent 状态节点共线 e2e 断言。
- 修复点击“确认投递”后，消息中心重建和终端输出刷新导致横向时间轴 `scrollLeft` 回到 0 的问题；现在弹窗重建、列表刷新和用户滚动都会同步保存并恢复时间轴横向位置。

## 全局输入控件统一

- 新增 `--control-*` 表单控件变量，统一普通 `input`、`select`、`textarea` 的浅色背景、浅蓝边框、圆角、悬停态和焦点态。
- 排除 `checkbox`、`radio`、`range`、`color`、`button`、`submit`、`reset`、`hidden`、`file` 等非文本输入类型，避免破坏开关、复选框、滑块和隐藏字段布局。
- 浏览器地址栏、项目/任务表单、设置页输入框、消息中心筛选与发送表单改为共享同一套输入框视觉；浏览器地址栏保留工具栏内的紧凑高度。
