# CosS v0.3.3 开发记录

主题：任务计划确认与子任务状态机

## 1. 版本目标

v0.3.3 在 v0.3.1 的真实 LLM Gateway 和 v0.3.2 的桌面应用能力基础上，完善“新建任务”的关键交互。

本阶段完成：
- 应用版本升级为 `v0.3.3`。
- 新建任务从“直接拆解并分派”改为“两步流程”。
- 第一步：调用当前模型或本地降级规则生成任务计划预览。
- 第二步：用户确认后才真正创建任务、分派角色、打开角色程序。
- 子任务新增状态机：待执行、执行中、已完成、已阻塞。
- 任务卡片新增状态标签和状态操作按钮。
- 角色窗口状态会随对应子任务状态更新。

## 2. 新建任务流程

当前流程：
1. 用户点击“新建任务”。
2. 输入自然语言任务目标。
3. 点击“生成计划”。
4. CosS 调用当前模型生成计划；失败时使用本地规则降级。
5. 弹出“确认任务计划”窗口。
6. 用户检查子任务、角色和摘要。
7. 用户点击“确认并分派”。
8. CosS 创建任务对象、写入协作消息、打开或复用角色窗口。

这样避免了模型一返回结果就直接创建大量角色窗口，也为后续“用户编辑计划”留出了入口。

## 3. 子任务状态机

子任务状态：

| 状态 | 含义 | 角色窗口状态 |
| --- | --- | --- |
| `pending` | 待执行 | `waiting` |
| `running` | 执行中 | `working` |
| `done` | 已完成 | `done` |
| `blocked` | 已阻塞 | `blocked` |

任务整体状态由子任务派生：
- 全部完成：`done`
- 任意阻塞：`blocked`
- 任意执行中：`running`
- 其他情况：`planned`

任务卡片操作：
- 待执行：开始执行
- 执行中：标记完成、标记阻塞
- 已阻塞：继续执行、标记完成
- 已完成：重新打开

## 4. 数据兼容

旧任务数据会在加载时自动补齐：
- 子任务默认状态为 `pending`
- 子任务补齐 `createdAt` 和 `updatedAt`
- 任务整体状态重新派生

## 5. 日志事件

新增事件：
- `task.plan.generated`：模型或本地规则生成了任务计划预览。
- `subtask.status.changed`：用户改变了子任务状态。

保留事件：
- `task.created`：用户确认计划后真正创建任务。

## 6. 本次涉及模块

- `src/renderer.js`
  - 新增任务计划草稿状态
  - 新增确认任务计划弹窗
  - 拆分任务生成与任务确认
  - 新增子任务状态机
  - 任务卡片新增状态标签和操作按钮
- `src/styles.css`
  - 新增任务计划预览样式
  - 新增子任务状态标签和按钮样式
- `src/main.cjs`
  - 同步版本兜底号
- `package.json`
  - 版本升级到 `0.3.3`
- `tests/e2e/app.spec.cjs`
  - 新增任务计划确认和状态机验证

## 7. 局部验证

已运行：

```powershell
node --check src\main.cjs
node --check src\preload.cjs
node --check src\renderer.js
node --check tests\e2e\app.spec.cjs
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "boots into|v0.3.3 LLM Gateway|collaboration details|custom title bar"
```

结果：
```text
4 passed
```

## 8. 后续建议

v0.3.4 建议继续补“计划编辑”能力：
- 在确认任务计划页允许编辑子任务标题和描述。
- 允许删除不需要的子任务。
- 允许调整子任务角色。
- 允许新增子任务。
- 确认前展示预计会打开哪些角色程序。

## 9. 任务拆解解析与日志系统补强

本次针对现阶段测试发现的“模型任务拆解失败但日志没有记录”做了补强：

- `src/main.cjs`
  - 任务拆解 JSON 解析从“第一个 `{` 到最后一个 `}`”改为“提取第一个完整平衡 JSON 对象”。
  - 支持模型返回 `JSON + 说明文字`、Markdown fenced JSON 后带说明等常见响应。
  - 新增 `llm.plan.requested`、`llm.plan.succeeded`、`llm.plan.failed`。
  - 新增 `llm.connectivity.succeeded`、`llm.connectivity.failed`。
  - 新增 `state.read.failed`、`state.write.failed`、`state.save.failed`。
  - 新增 `terminal.create.requested`、`terminal.create.succeeded`、`terminal.create.mock`、`terminal.create.static-error`、`terminal.spawn.failed`、`terminal.pty.failed`、`terminal.exited`、`terminal.dispose.succeeded`、`terminal.dispose.failed`、`terminal.input.failed`、`terminal.resize.failed`。
  - 新增 `agent.claude.status.checked`、`agent.codex.status.checked`，用于记录用户手动检测 Agent 环境。
  - 日志中的模型配置只记录 provider、baseUrl、modelName、是否存在 API key，不记录 API key 明文。
- `src/renderer.js`
  - 任务拆解失败进入本地降级时新增 `task.plan.failed`。
  - `task.plan.generated` 增加 planner 状态、模型名称和失败原因。
  - 终端命令新增 `command.logged`，审批结果新增 `command.status.changed`。
  - 关闭角色程序新增 `program.closed`。
  - 切换项目新增 `project.selected`。
- `tests/e2e/app.spec.cjs`
  - 新增“模型 JSON 后带多余文本仍可解析”的 e2e。
  - 新增“模型 JSON 解析失败时写入错误日志并保留本地降级预览”的 e2e。

本次局部验证：

```powershell
node --check src\main.cjs
node --check src\renderer.js
node --check src\preload.cjs
node --check tests\e2e\app.spec.cjs
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "model connectivity|Agent provider|task planner|v0.3.3 LLM Gateway"
```

结果：

```text
5 passed
```

## 10. 设置变更日志补点

在第 9 节基础上继续补充设置页相关日志：

- `settings.agent-provider.changed`：记录 Agent 后端切换，值为 `claude` 或 `codex`。
- `settings.agent-fallback.changed`：记录 Agent 启动失败是否回退到 PowerShell。
- `settings.model-provider.changed`：记录当前模型切换，包含 provider、baseUrl、modelName、hasApiKey，不记录 API key 明文。
- `settings.model-provider.rejected`：记录因缺少 API key 导致可选模型切换失败。
- `model.connectivity.skipped`：记录模型连通性测试因缺 API key 或前端 API 不可用被跳过。
- `model.connectivity.completed`：记录设置页模型连通性测试完成状态。

## 11. LLM 请求超时处理

现阶段测试日志中出现 `This operation was aborted`，原因是系统模型接口超过原 20 秒超时限制仍未返回。

本次调整：

- 默认 LLM 请求超时从 20 秒提升到 60 秒，更适合内网模型排队或首 token 慢的情况。
- 新增环境变量 `COSS_LLM_TIMEOUT_MS`，可按毫秒调整超时时间，最小有效值为 `1000`。
- 超时错误从原始 `This operation was aborted` 改为可读提示：模型接口请求超时，并提示可设置 `COSS_LLM_TIMEOUT_MS`。
- `llm.plan.*` 和 `llm.connectivity.*` 日志新增 `timeoutMs` 字段。
- 新增慢模型接口 e2e，验证超时提示和日志字段。
