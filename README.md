<p align="center">
  <img src="./src/Logo.png" alt="CosS Logo" style="width: 80px; vertical-align: middle;">
</p>
<h1 align="center">CosS Desktop v0.10</h1>
<p align="center">
  <img src="https://img.shields.io/github/languages/code-size/xiaolizi0v0/CosS" alt="code size"/>
  <img src="https://img.shields.io/badge/Electron-35.1.2-brightgreen" alt="Electron"/>
  <img src="https://img.shields.io/badge/MCP-1.0.0-blue" alt="MCP"/>
  <img src="https://img.shields.io/github/languages/count/xiaolizi0v0/CosS" alt="languages"/>
  <img src="https://img.shields.io/github/last-commit/xiaolizi0v0/CosS" alt="last commit"/><br>
  <img src="https://img.shields.io/badge/Created-26.03.01-blue" alt="Created Time"/>
  <img src="https://img.shields.io/badge/Author-xiaolizi0v0-orange" alt="Author"/>
  <img src="https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-green" alt="License"/>
</p>
<hr>

**Code Orchestration System** — 一个基于 MCP 协议的 AI 多智能体协作工作区。

CosS 提供了一个类桌面环境，让多个 AI 智能体角色（产品经理、技术负责人、前后端工程师、QA 等）通过**中央线性工作流内核（Kernel）**协作完成软件开发任务。所有智能体通过 **Model Context Protocol (MCP)** 接入系统，遵循统一的步骤认领、租约、锁和审批机制。

## 核心特性

- **类桌面工作区** — 左侧项目栏创建/切换项目，每个项目拥有独立的工作区
- **多智能体协作** — 支持产品经理、技术负责人、前后端工程师、QA 工程师等 9 种角色
- **线性工作流内核** — LLM Planner 自动将用户目标分解为线性步骤，按序分派给对应角色
- **MCP 协议接入** — 智能体通过标准 MCP 工具接口（共 16 个工具）参与协作
- **角色终端注入** — 支持 Claude Code、CodeBuddy Code 作为智能体后端，自动注入角色提示词
- **资源锁与审批** — 文件级锁、高风险操作审批，保障协作安全
- **事件溯源** — 所有状态变更持久化为事件，支持审计和恢复
- **多语言界面** — 内置 12 种语言（简体中文、繁体中文、英文、日文、韩文等）
- **真实 PowerShell 终端** — 基于 xterm.js + node-pty，支持 Windows ConPTY

## 快速开始

```powershell
npm.cmd install
npm.cmd start
```

如果 PowerShell 拦截 `npm`，请使用 `npm.cmd`。

## 发布 Release

项目内置 GitHub Actions Release 工作流：

- 推送到 `main` 或提交 PR 时：执行 preflight，并行打包各平台产物，作为 workflow artifacts 保存（不发布 Release）
- 推送 `v*` 标签或手动运行 `Release` workflow 并填写 `tag` 时：并行打包并发布 GitHub Release Assets

Release Assets 包含：

- `CosS-Desktop-<tag>-win-x64-portable.zip` — Windows x64 便携版（内置原生终端辅助程序）
- `CosS-Desktop-<tag>-linux-x64.zip` — Linux x64 版本
- `CosS-Desktop-<tag>-linux-arm64.zip` — Linux arm64 版本
- `CosS-Desktop-<tag>-macos-x64.zip` — macOS Intel 版本
- `CosS-Desktop-<tag>-macos-arm64.zip` — macOS Apple Silicon 版本
- `CosS-Desktop-<tag>-source.zip` — 源码归档
- `checksums.txt` — SHA-256 校验和

```powershell
git tag v0.10.0
git push origin v0.10.0
```

## 系统架构

```
┌─────────────────────────────────────────────────────┐
│               Electron Desktop App                  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ 侧边栏/项目管理  │  xterm 终端    │  │ 浏览器窗口   │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
│           │                                              │
│  ┌─────────────┐                                    │
│  │ LLM Planner │  → 生成线性工作流                      │
│  └─────────────┘                                    │
├─────────────────────────────────────────────────────┤
│           MCP 服务器 (coss-mcp-server.cjs)              │
│  16 个工具: get_context, claim_step, submit_result...  │
├─────────────────────────────────────────────────────┤
│           内核 (Kernel)                                 │
│  ┌────────┬────────┬────────┬────────┬────────┐     │
│  │ 步骤租约 │ 能力沙箱 │ 资源锁  │ 审批   │ 事件溯源 │     │
│  └────────┴────────┴────────┴────────┴────────┘     │
├─────────────────────────────────────────────────────┤
│           持久化层                                       │
│  ┌──────────────────┐  ┌─────────────────────────┐  │
│  │    SQLite (sql.js)  │  │    JSON 镜像 + 备份轮换     │  │
│  └──────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 三层架构

1. **Electron 桌面应用** — 窗口管理、终端（node-pty）、侧边栏工作区、LLM Planner
2. **MCP 服务器** — stdio 协议接口，16 个 Kernel 工具供 AI 智能体调用
3. **Kernel 内核** — 工作流引擎，管理步骤生命周期、租约、锁、能力沙箱、审批、事件

### Kernel 关键策略

| 策略 | 说明 |
|------|------|
| 线性工作流 | 一次只执行一个步骤，步骤 N 依赖步骤 N-1 |
| 步骤租约 | 默认 5 分钟，可通过心跳续约 |
| 能力沙箱 | 每个角色只能使用预定义的能力集 |
| 资源锁 | 修改共享文件前需获取锁 |
| 事件溯源 | 所有状态变更记录为事件 |
| 集中仲裁 | Kernel 是唯一的调度器 |

## MCP 工具列表

CosS 通过 MCP 协议暴露以下工具供 AI 智能体使用：

| 工具 | 用途 |
|------|------|
| `coss_get_context` | 获取当前项目、角色、任务上下文 |
| `coss_list_roles` | 列出有效角色及能力沙箱 |
| `coss_get_task_board` | 读取任务面板和状态 |
| `coss_pool_read/claim` | 读取/认领消息池中的任务 |
| `coss_list_tasks` | 列出任务和子任务 |
| `coss_claim_step` | 认领工作流步骤 |
| `coss_heartbeat_step` | 续约步骤租约 |
| `coss_release_step` | 释放步骤（可重新入队） |
| `coss_submit_result` | 提交结构化结果（含产物） |
| `coss_acquire/release_lock` | 获取/释放资源锁 |
| `coss_request_approval` | 请求高风险操作审批 |
| `coss_report_status` | 报告进度状态 |
| `coss_get_kernel_events` | 读取事件流 |

## 角色定义

| 角色 | 能力范围 |
|------|----------|
| Product Manager | 任务拆解、需求分析、验收 |
| Tech Lead | 架构设计、技术决策、Code Review |
| Frontend Engineer | 前端开发、UI 实现 |
| Backend Engineer | 后端开发、API 实现 |
| QA Engineer | 测试用例、测试执行 |
| Designer | UI/UX 设计 |
| DevOps Engineer | 部署、CI/CD |
| Security Engineer | 安全审计 |
| Data Engineer | 数据处理、分析 |

## 技术栈

- **框架**: Electron
- **终端**: xterm.js + node-pty (Windows ConPTY)
- **持久化**: sql.js (SQLite) + JSON 镜像
- **协议**: MCP (Model Context Protocol)
- **测试**: Playwright (E2E)
- **本地化**: i18next (12 种语言)
- **智能体后端**: Claude Code / CodeBuddy Code / OpenAI Codex

## 项目结构

```
CosS/
├── src/
│   ├── main.cjs                 # Electron 主进程
│   ├── preload.cjs              # 预加载脚本（IPC 桥接，76 个方法）
│   ├── renderer.js              # 渲染进程
│   ├── coss-mcp-server.cjs      # MCP 服务器
│   ├── orchestrator/
│   │   └── kernel.cjs           # Kernel 内核
│   ├── i18n/locales.js          # 国际化
│   ├── index.html               # 应用壳
│   └── styles.css               # 样式
├── native/
│   └── coss-terminal-helper/    # .NET Windows ConPTY 辅助程序
├── tests/
│   └── e2e/                     # Playwright E2E 测试
├── docs/
│   ├── help.md                  # 帮助文档
│   ├── license.md               # CC BY-NC-SA 4.0 许可证
│   └── privacy.md               # 隐私声明
├── .mcp.json                    # MCP 服务器注册
└── package.json
```

## 文档

- [帮助文档](docs/help.md)
- [许可证](docs/license.md) — CC BY-NC-SA 4.0
- [隐私声明](docs/privacy.md)

## 许可证
### 第三方依赖

CosS 使用了多个开源第三方库，它们的许可信息如下：

| 依赖 | 许可协议 |
|------|----------|
| Electron | MIT |
| Node.js | MIT |
| 其他 npm 依赖 | 详见各依赖的 LICENSE 文件 |

### 贡献指南

我们欢迎社区贡献！如果您想为 CosS 做出贡献：

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交您的更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

### 鸣谢

感谢所有开源社区成员的支持与贡献。

CC BY-NC-SA 4.0 © 2026 xiaolizi0v0
