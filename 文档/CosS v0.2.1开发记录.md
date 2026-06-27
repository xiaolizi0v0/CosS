# CosS v0.2.1 开发记录

版本：v0.2.1  
日期：2026-06-25  
主题：终端 Agent 设置与版本显示

## 本版能力

### 1. 左上角显示版本

左侧顶部品牌区显示：

```text
CosS v0.2.1
```

用于测试截图、问题报告和人工验证时确认当前运行版本。

### 2. 终端创建选项简化

创建角色终端时，现在只显示两个选项：

- PowerShell：普通角色终端。
- Agent：按系统设置中选择的 Agent 后端启动。

不再在角色选择弹窗中直接显示 `Claude Code` 和 `Codex` 两个独立按钮。

### 3. 设置页配置 Agent 后端

新增系统设置页，入口包括：

- 左下角齿轮按钮。
- 桌面右键菜单中的“系统设置”。

设置页采用左侧分类导航、右侧设置项布局。当前支持在“Agent 终端”中选择：

- Claude Code
- Codex

选择结果会持久保存到应用状态中。

### 4. Agent 启动策略

当用户创建 Agent 终端时：

- 如果设置为 Claude Code，则沿用 Claude Code 检测、首次启动配置和 winget 自动安装流程。
- 如果设置为 Codex，则默认查找 `codex` 命令。
- 如果未找到可运行的 `codex`，CosS 会进入 Codex CLI 安装终端，并自动执行 `npm.cmd install -g @openai/codex`。
- 如果 `npm` 不可用，或设置了 `COSS_DISABLE_CODEX_AUTO_INSTALL=1`，CosS 会回退到 PowerShell，并提示用户手动安装或通过 `COSS_CODEX_COMMAND` 指定路径。
- Codex 启动前会先运行 `codex --version` 做真实可执行性检测。仅被 `where.exe` 找到不再视为成功。
- 如果 PATH 中存在多个 `codex` 候选路径，CosS 会优先使用能成功执行 `codex --version` 的路径。
- 如果检测到的是 WindowsApps 中的 OpenAI Codex 应用包路径，但该路径无法作为 CLI 执行，CosS 会提示这是不可直接运行的应用包路径，并继续安装真正的 Codex CLI。
- 设置页新增 Codex 自动检测，可查看 `codex --version`、`npm --version`、PATH 命中路径和 WindowsApps 应用包冲突。
- 设置页新增“Agent 失败回退到 PowerShell”开关。关闭后，如果 Agent 启动失败或无法自动安装，只保留错误日志窗口，不进入普通 PowerShell 提示符。
- Windows 下 npm 检测会解析真实 `npm.cmd` 路径，并通过 PowerShell 包装运行，避免 Electron 直接 `spawnSync npm.cmd` 出现 `EINVAL`。
- Windows 下 Codex 启动也通过 PowerShell 包装运行，避免兼容终端直接 `spawn("codex")` 时因找不到 `codex.cmd` 弹出主进程 `spawn codex ENOENT` 错误。
- 兼容终端新增 `error` 事件处理，底层进程启动失败时只在终端窗口显示错误日志，不再触发 Electron 主进程崩溃弹窗。

Agent 终端会继承以下环境变量：

- `COSS_ROLE_ID`
- `COSS_ROLE_NAME`
- `COSS_ROLE_PROMPT`
- `COSS_TERMINAL_MODE=agent`
- `COSS_AGENT_PROVIDER=claude` 或 `codex`

## 测试结果

已运行：

```powershell
npm.cmd test
```

结果：

```text
14 passed
```

测试覆盖：

- 左上角显示 `v0.2.1`。
- 设置页可以打开。
- Agent 后端可以从 Claude Code 切换到 Codex。
- Codex 命令路径无效时可以返回明确状态、npm 状态、npm 候选路径和推荐安装命令，不会误判为可运行。
- 关闭 Agent 失败回退后，失败的 Codex Agent 会显示错误日志而不是进入普通 PowerShell。
- 角色终端弹窗只显示 PowerShell 和 Agent。
- 创建 Agent 终端后窗口标题体现当前 Agent 后端。
- 桌面右键角色菜单也只显示 PowerShell 和 Agent。

## 当前边界

- 设置页当前先实现 Agent 后端配置，其他分类为界面骨架。
- Codex CLI 自动安装依赖本机 `npm` 可用；如果用户环境没有 Node.js/npm，需要先安装 Node.js 或手动指定 `COSS_CODEX_COMMAND`。
- WindowsApps 中的 OpenAI Codex 应用包不一定等同于可在终端运行的 Codex CLI。
- Codex 角色提示词目前通过环境变量传递，尚未针对 Codex CLI 参数做深度适配。
- 后续应增加 Codex 环境检测，与 Claude Code 检测放在同一个 Agent 环境区域。
