# CosS v0.5.3 开发记录

## 版本目标

v0.5.3 用于完成 v0.5.2 记录中暂未实现的功能，把协作时间线、Agent 终端、任务计划、文件编辑器和真实浏览器补成可测试闭环。

## 已实现内容

### 1. Claude Code / Codex 远程登录态校验

- 智能体设置页新增手动“测试登录态”按钮。
- Codex 默认使用 OpenAI/Codex 凭据调用 `/models` 做远程可用性校验。
- Claude Code 默认使用 Anthropic/Claude API key 调用 `/models` 做远程可用性校验。
- 未配置 API key 时只显示跳过原因，不自动触发网络请求。
- 新增日志事件：`agent.login-test.succeeded`、`agent.login-test.failed`、`agent.login-test.skipped`。

### 2. Agent 终端投递队列

- 协作时间线消息不再直接写入终端，而是先加入可确认投递队列。
- 每条投递支持确认、取消、失败后重试。
- 子任务“发送给角色”中的终端投递也改为加入待确认队列。
- 新增日志事件：`agent.delivery.queued`、`agent.delivery.confirmed`、`agent.delivery.canceled`、`agent.delivery.retried`、`agent.delivery.failed`。

### 3. 终端输出引用

- 已确认投递的消息会与后续终端输出建立引用关系。
- 协作时间线显示输出引用数量，并可点击查看输出片段。
- 输出引用可定位回对应角色程序窗口。
- 新增日志事件：`agent.delivery.output-referenced`。

### 4. 任务计划可视化编辑

- 确认任务计划前可编辑子任务标题、描述和角色。
- 支持新增子任务、删除子任务。
- 确认分派时使用编辑后的任务计划。
- 新增日志事件：`task.plan.edited`、`task.plan.subtask.added`、`task.plan.subtask.deleted`。

### 5. 文件编辑器增强

- 文件列表显示项目内目录和文本文件。
- 支持新建文件夹、重命名、删除、另存为。
- 所有文件操作仍由主进程校验路径，禁止越出项目目录。
- 新增主进程 IPC：`files:create-folder`、`files:rename`、`files:delete`。

### 6. 浏览器增强

- 浏览器程序支持多标签页。
- 支持收藏当前 URL、展示最近历史。
- 任务卡片会从任务目标和子任务描述中提取 URL，并提供“打开任务 URL”按钮。
- 点击后会复用或创建对应角色浏览器窗口，并自动聚焦。

## 版本号

- `package.json`: `0.5.3`
- `package-lock.json`: `0.5.3`
- 应用侧边栏显示：`v0.5.3`
- `app:info` 返回：`0.5.3`
- 协作时间线标题：`v0.5.3 协作时间线`

## 本轮测试范围

本版本按用户要求只跑 v0.5.3 相关模块测试，不跑完整 e2e。

计划测试：

- v0.5.3 自定义标题栏与版本信息。
- v0.5.3 子任务指令写入协作时间线。
- v0.5.3 时间线消息加入 Agent 投递队列、确认投递并生成终端输出引用。
- v0.5.3 任务计划可视化编辑。
- v0.5.3 文件树、新建文件夹、重命名、删除、另存为。
- v0.5.3 浏览器多标签、收藏/历史、任务 URL 打开。
- v0.5.3 Agent 远程登录态手动测试。

## 测试结果

已通过：

```powershell
npm.cmd run test:e2e -- tests/e2e/app.spec.cjs -g "v0\.5\.3"
```

结果：9 passed。

## 暂未实现内容

v0.5.2 文档中的暂未实现内容已在 v0.5.3 全部完成。后续版本建议继续增强体验层能力：

- 远程登录态测试支持 OAuth 登录态更精细的服务端校验。
- 终端输出引用支持全文搜索、按投递批次折叠。
- 文件编辑器支持目录树展开/折叠、文件差异预览。
- 浏览器支持持久化 favicon、标签拖拽排序和跨角色共享收藏。
