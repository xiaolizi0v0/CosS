# CosS v0.2 开发记录

版本：v0.2.0  
日期：2026-06-25  
主题：终端权限、命令审计、Claude Code 环境可观测性

## 本版新增能力

### 1. 终端命令风险识别

角色终端现在会在用户按下 Enter 前识别命令风险。当前内置规则覆盖：

- 文件删除：`Remove-Item`、`rm`、`del`、`rmdir` 等。
- 依赖或软件安装：`winget install`、`npm install`、`pnpm add`、`pip install` 等。
- 环境变量或注册表修改：`setx`、`reg add`、`$env:xxx = ...` 等。
- 发布或部署：`git push`、`npm publish`、`docker push`、`kubectl apply/delete`、`terraform apply/destroy`。
- 动态脚本执行：`Invoke-Expression`、`iex`、`powershell -EncodedCommand`、管道到 shell。

### 2. 高风险命令确认

当命令命中风险规则时，CosS 会暂停发送 Enter，并弹出确认窗口：

- 确认执行：继续把 Enter 发送给终端后端。
- 拒绝执行：清理当前终端输入行，并记录为已拒绝。

这让角色程序不能静默执行高风险命令。

### 3. 命令审计日志

项目状态中新增 `commandLogs`。日志记录：

- 角色名称
- 窗口 ID
- 命令内容
- 风险类型
- 执行状态：已执行、等待确认、已确认执行、已拒绝
- 创建时间和处理时间

左侧导航新增“日志”入口，可以查看当前项目的终端命令日志。

### 4. Claude Code 环境重新检测

日志面板中新增 Claude Code 环境检测：

- 检测 `claude` 命令是否存在。
- 若存在，尝试读取 `claude --version`。
- 显示推荐安装命令：`winget install Anthropic.ClaudeCode`。
- 支持点击“重新检测”刷新状态。

### 5. 版本标记

`package.json` 和 `package-lock.json` 已升级到 `0.2.0`。

## 测试结果

已运行：

```powershell
npm.cmd test
```

结果：

```text
10 passed
```

新增覆盖：

- 高风险终端命令会先弹确认，不会直接执行。
- 拒绝执行后，命令会进入审计日志。
- 日志面板可以打开并重新检测 Claude Code。

## 当前边界

- 命令风险识别仍是规则引擎，不是完整 PowerShell AST 解析。
- 当前只在交互式终端输入 Enter 时拦截；后续应把拦截下沉到主进程终端写入层。
- 角色权限模板仍是初版，后续需要按角色区分默认权限和审批等级。
- 审计日志仍保存在项目 JSON 状态中，后续数据库化时应迁移到 SQLite。

## 下一步建议

1. 把命令拦截从 renderer 前移到 main 进程，防止绕过 UI 直接写入终端。
2. 引入角色权限模板，例如 DevOps 可以默认执行部分部署预检命令，但发布仍需确认。
3. 增加“允许一次 / 始终允许该角色执行此类命令 / 拒绝”三档审批。
4. 将命令日志和任务、角色消息关联起来。
5. 开始设计真实任务规划器的 LLM Gateway。
