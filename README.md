# CosS Desktop

CosS 是一个类桌面 AI 协作工作区 MVP。当前版本先实现产品核心体验：

- 左侧项目栏创建和切换项目
- 每个项目启动独立类桌面工作区
- 桌面右键创建终端、浏览器、文件和任务
- 创建程序时选择开发角色
- 终端窗口使用 xterm.js，并通过 node-pty 启动真实 PowerShell 会话
- 角色终端支持 PowerShell / Claude Code 两种启动模式
- Claude Code 模式会检测 `claude` 命令，并通过 `--append-system-prompt` 注入角色提示词
- 如果未检测到 Claude Code，Windows 下会自动在终端中执行 `winget install Anthropic.ClaudeCode`
- 任务创建后模拟拆解并分派给多个角色
- 程序右下角显示角色协作状态

## 运行

```powershell
npm.cmd install
npm.cmd start
```

如果 PowerShell 拦截 `npm`，请使用 `npm.cmd`。
