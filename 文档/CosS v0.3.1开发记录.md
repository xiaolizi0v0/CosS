# CosS v0.3.1 开发记录

主题：真实任务规划器与 LLM Gateway

## 1. 版本目标

v0.3.1 在 v0.3 模型配置的基础上，开始把“新建任务”接入真实模型调用链路。

本阶段完成：

- 应用版本升级为 `v0.3.1`。
- 主进程新增 LLM Gateway IPC：`llm:plan-task`。
- 新建任务时优先调用当前模型的 OpenAI-compatible `/chat/completions`。
- 模型调用成功时使用模型返回的任务拆解。
- 模型调用失败时自动降级为本地规则拆解。
- 任务对象记录规划来源、模型配置、失败原因和 token usage。
- 设置页环境检测改为手动触发：进入设置页不再自动执行 Claude Code 或 Codex 检测，用户点击“重新检测”后才会运行检测。

## 2. 默认调用方式

默认系统模型沿用：

```env
LLM_BASE_URL=http://10.21.1.61:26962/v1
LLM_MODEL_NAME=agent-brain
```

调用路径：

```text
POST {LLM_BASE_URL}/chat/completions
```

默认系统模型无 API key，因此请求不会附带 Authorization 头。

可选模型如果用户填写了 API key，会使用：

```text
Authorization: Bearer {API_KEY}
```

## 3. 模型返回格式

模型需要返回严格 JSON：

```json
{
  "summary": "一句话总结",
  "subtasks": [
    {
      "roleId": "frontend-engineer",
      "title": "子任务标题",
      "description": "子任务描述"
    }
  ],
  "messages": [
    {
      "fromRoleId": "product-manager",
      "toRoleIds": ["frontend-engineer"],
      "content": "协作消息"
    }
  ]
}
```

主进程会做格式校验和角色 ID 过滤，避免模型返回未知角色导致界面异常。

## 4. 降级策略

如果出现以下情况，会降级到本地规则拆解：

- 模型接口超时。
- 模型接口返回非 2xx。
- 模型响应没有 `choices[0].message.content`。
- 模型返回内容不是可解析 JSON。
- JSON 中没有有效 `subtasks`。
- IPC 或运行环境异常。

降级后任务仍会创建，并在任务对象的 `planner` 字段中记录失败原因。

## 5. 测试结果

已运行：

```powershell
npm.cmd test
```

结果：

```text
16 passed
```

## 6. 设置页检测优化

进入设置页时不再自动执行 Claude Code 或 Codex 环境检测。

当前行为：

- 打开设置页只显示“尚未检测”或上一次检测结果。
- 点击 Claude Code 的“重新检测”后才调用 `claude:status`。
- 点击 Codex 的“重新检测”后才调用 `codex:status`。
- 切换 Agent 后端、切换失败回退开关、编辑模型配置时，不会触发 Codex 自动检测。

局部验证：

```powershell
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "configures v0.3 model providers|does not auto-run Agent environment checks"
```

结果：

```text
2 passed
```

## 7. 设置页面规划

设置页已从单一“系统设置”改为左侧分类导航：

| 分类 | 当前内容 | 后续扩展方向 |
| --- | --- | --- |
| 账户管理 | 占位说明 | 登录、团队空间、权限身份 |
| 系统设置 | 应用版本、默认工作区路径、当前模型摘要、Agent 摘要 | 全局路径、启动行为、语言和基础偏好 |
| 智能体设置 | Agent 后端、Claude Code 检测、Codex 检测、失败回退 | 角色默认 Agent、会话恢复、终端运行策略 |
| 记忆 | 占位说明 | 项目记忆、角色记忆、上下文清理 |
| 模型 | v0.3 模型配置、API key、模型切换 | 连通性检测、成本和 token 统计 |
| 助理设置 | 占位说明 | 默认助理行为、任务确认策略 |
| 个性化 | 占位说明 | 主题、字号、桌面背景、窗口偏好 |
| 数据管理 | 占位说明 | 数据备份、导入导出、缓存清理 |
| 安全中心 | 终端安全确认、命令审计入口 | 权限策略、敏感信息保护、审计规则 |
| 帮助与反馈 | 占位说明 | 使用说明、诊断包、反馈记录 |

目标：

- 系统设置只保留全局基础信息。
- 智能体、模型、安全等配置进入对应页面。
- 打开设置页默认停留在系统设置，不自动执行环境检测。
- 用户点击左侧分类后再编辑对应模块。

局部验证：

```powershell
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "configures v0.3 model providers|does not auto-run Agent environment checks|switches the Agent provider"
```

结果：

```text
3 passed
```

## 8. 模型连通性测试

模型设置页新增“测试连通性”按钮，用户需要手动点击后才会检测当前正在编辑的模型配置。

当前行为：
- 打开设置页或切换到“模型”页面时不会自动请求模型接口。
- 系统默认模型会使用当前 Base URL 和模型名称调用 OpenAI-compatible `/chat/completions` 做轻量检测。
- DeepSeek API、GLM、OpenAI、Claude Code 等需要 API key 的模型，如果尚未填写 API key，只在页面提示“请先填写 API key 再测试连通性”，不会发起请求。
- 修改 Base URL、模型名称或 API key 后，会清除该模型上一次的连通性结果，避免显示过期检测状态。
- 检测成功显示“连通性正常”、模型名称、耗时和检测时间；检测失败显示接口返回的错误摘要。

本次涉及模块：
- `src/main.cjs`：新增 `llm:test-model` IPC，复用 LLM Gateway 的 `/chat/completions` 请求路径。
- `src/preload.cjs`：暴露 `testModelConnectivity` 给渲染层。
- `src/renderer.js`：模型设置页新增按钮、状态缓存和点击检测流程。
- `src/styles.css`：新增模型连通性状态条和按钮区域样式。
- `tests/e2e/app.spec.cjs`：新增模型连通性模块级 e2e。

局部验证：

```powershell
node --check src\main.cjs
node --check src\preload.cjs
node --check src\renderer.js
node --check tests\e2e\app.spec.cjs
npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "model providers|model connectivity"
```

结果：
```text
2 passed
```
