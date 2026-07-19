# CosS v0.12.1 发布说明

## 重点更新

- **终端架构重构：** 按照 VS Code 三层架构（xtermTerminal → terminalInstance → terminalService）重构终端渲染层，支持自动滚动检测、链接指针光标、park/unpark DOM 保护。
- **主进程终端模块化：** 新增 `src/main/terminal/` 模块，实现可插拔后端注册表（ConPTY / node-pty / pipe / mock），进程管理器、终端实例和服务层的完整分层。
- **终端交互修复：** 修复窗口缩放手柄覆盖 xterm 滚动条导致无法点击拖动的问题；修复 `.xterm-screen` canvas 宽度覆盖滚动条区域的问题。
- **终端样式优化：** 新增 "↓ 滚动到底部" 浮动指示器；优化滚动条点击区域和链接手型指针显示。

## 技术细节

### 新增文件

```
src/main/terminal/
├── index.js                 # 模块入口，createTerminalSystem() 工厂
├── terminal-backend.js      # 可插拔后端注册表（4个后端）
├── terminal-process.js      # 进程管理器（spawn/write/resize/kill）
├── terminal-instance.js     # 终端实例（转录 + 权限守卫 + WebContents）
├── terminal-service.js      # 终端服务（全局实例管理）
├── terminal-environment.js  # 环境变量管理
└── terminal-ipc.js          # IPC 处理器

src/renderer/terminal/
├── terminal-core.js         # XtermTerminal 类（Layer 1）
└── terminal-instance.js     # TerminalInstance + TerminalInstanceService（Layer 2+3）
```

## 发布校验

```powershell
npm run test:blueprint:syntax
```

Release workflow 只执行蓝图源码语法检查，不运行 Electron E2E。
