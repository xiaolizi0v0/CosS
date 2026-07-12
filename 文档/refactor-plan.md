# CosS 多轮架构重构计划

## 1. 目标

将当前以 `src/renderer.js` 和 `src/main.cjs` 为中心的集中式实现，逐步演进为按领域职责拆分、边界清晰、可独立验证的 Electron 应用架构。

本计划采用渐进式迁移：每一轮都保持应用可启动、持久化格式兼容、IPC 协议兼容，并通过现有 E2E 测试验证行为没有回归。

## 2. 当前基线

- `src/renderer.js`：约 1 万行，保留状态装配、模板渲染和跨领域生命周期编排。
- `src/main.cjs`：约 4800 行，保留 Electron 生命周期、依赖装配和窗口创建。
- 已完成第一轮拆分：
  - `src/renderer/config.js`：角色、模型、权限、风险规则等静态配置。
  - `src/renderer/world.js`：2D 世界 Agent、任务和群聊领域逻辑。
- 当前验证基线：`npm test` 的 19 个 E2E 测试全部通过。

当前已落地的架构骨架与实际迁移：

- `src/shared/`：IPC、状态 schema 和架构版本契约。
- `src/renderer/store/`：应用 Store、持久化队列和外部状态戳桥接。
- `src/renderer/task/`：任务模型、Planner、Kernel 投影和 dispatch 服务边界。
- `src/renderer/agent/`：Agent 生命周期、投递队列、终端适配、输出追踪和审批边界。
- `src/renderer/windowing/` 与 `src/renderer/views/`：窗口、桌面和视图生命周期契约。
- `src/main/services/` 与 `src/main/ipc/`：主进程存储、LLM 服务和 IPC 注册入口。
- `tests/unit/architecture.test.cjs`：共享契约和服务基础单元测试。

截至 2026-07-10，`renderer.js` 已完成状态/持久化、Kernel 投影、Agent 投递与自动工作流、搜索索引、输入交互绑定、浏览器/文件动作、设置动作、项目/任务/角色/桌面动作、任务/消息/世界动作、应用菜单动作、终端/浏览器/文件视图、任务视图、消息时间线、设置页面区块、设置状态组件和窗口壳渲染的物理迁移，当前约 9,941 行；`main.cjs` 的 Planner/模型连通性、Agent 检测、终端会话及生命周期、项目文件、MCP 配置和 IPC handler 注册已分别迁移到 `main/services/llm-service.cjs`、`agent-runtime.cjs`、`terminal-service.cjs`、`project-file-service.cjs`、`mcp-config-service.cjs` 和 `main/ipc/register-ipc.cjs`，当前约 4,758 行。入口文件现在主要保留状态装配、模板渲染、Electron 生命周期和跨领域协调。

## 3. 重构原则

1. 先建立边界，再迁移实现；不以简单搬文件为目标。
2. 领域模块不直接操作 DOM，UI 模块不直接实现持久化细节。
3. 主进程负责系统能力和安全边界，渲染进程负责交互和视图状态。
4. 通过依赖注入或明确的服务接口替代隐式全局依赖。
5. 每轮只迁移一个主要领域，避免同时修改 IPC、数据结构和 UI 行为。
6. 保持旧状态可读取；新增字段必须提供默认值和迁移逻辑。
7. 每轮结束都执行语法检查、关键 E2E 和完整 E2E。

## 4. 分轮计划

### 第 0 轮：基线与契约固化

状态：已完成。

目标：在继续拆分前固定当前行为和模块边界。

工作内容：

- 建立 `src/shared/` 目录，放置跨渲染层、主进程和 MCP 使用的协议常量。
- 盘点 `window.cossAPI` 的 IPC 方法，整理成 IPC 契约清单。
- 为状态版本、项目状态、任务状态和消息状态补充统一的版本说明。
- 将关键纯函数从 E2E 测试中提炼为可直接运行的 Node 测试。
- 记录当前启动流程、状态保存流程和 Agent 投递流程。

验收标准：

- 能明确区分共享协议、领域逻辑、应用服务和 UI 代码。
- IPC 方法和持久化字段有文档记录。
- 重构前后测试基线可重复运行。

### 第 1 轮：渲染层配置与世界领域拆分

状态：已完成。

完成内容：

- 抽出 `renderer/config.js`。
- 抽出 `renderer/world.js`。
- 通过 `index.html` 明确脚本加载顺序。
- 将世界画布、世界任务发布入口和恢复写入流程纳入现有测试契约。

### 第 2 轮：渲染层状态管理拆分

状态：已完成首批物理迁移，持续清理中。

目标：消除 `renderer.js` 中分散的状态变量和直接修改，建立统一的应用状态入口。

建议结构：

```text
src/renderer/
├── store/
│   ├── app-store.js          # 状态容器、订阅和批量更新
│   ├── default-state.js      # 默认状态
│   ├── state-normalizer.js   # 旧状态兼容和字段补全
│   └── persistence-bridge.js # 保存、加载、外部状态刷新
```

工作内容：

- 将 `defaultState`、`ensureStateShape`、状态加载与保存队列迁入 `store/`。
- 为状态更新提供 `updateState`、`replaceState`、`subscribe` 等最小接口。
- 将 UI 临时状态与持久化业务状态分离。
- 统一外部状态刷新、脏状态、保存并发和恢复逻辑。

验收标准：

- `renderer.js` 不再直接维护保存队列和状态存储时间戳。
- 状态加载、保存、外部刷新相关 E2E 全部通过。
- 旧版缺失 `worlds`、`modelConfigs` 等字段的状态仍可正常启动。

### 第 3 轮：任务与 Kernel 应用服务拆分

状态：Kernel 投影、任务视图和 Planner/dispatch 边界已落地；自动工作流仍由入口编排。

目标：把任务规划、任务板、子任务状态、Kernel 投影和 dispatch 修复从渲染入口中独立出来。

建议结构：

```text
src/renderer/
├── task/
│   ├── task-model.js          # 任务、子任务和状态模型
│   ├── task-service.js        # 创建、更新、归档任务
│   ├── planner-service.js     # LLM Planner 调用适配
│   ├── kernel-projection.js   # Kernel 状态投影
│   └── dispatch-service.js    # 消息生成、修复和自动推进
```

工作内容：

- 抽出 `ensureTaskShape`、任务状态推导和子任务查询函数。
- 将 Kernel projection 与 UI 展示状态解耦。
- 将任务计划创建、确认、执行、修复和自动推进集中到服务接口。
- 让任务列表、消息中心和 Agent 投递共同依赖同一个任务服务。

验收标准：

- Kernel 相关逻辑不依赖具体 DOM 节点。
- 任务计划、步骤租约、dispatch 修复、MCP 提交结果测试全部通过。
- 同一个任务状态不会由多个 UI 事件处理器分别推导。

### 第 4 轮：Agent、终端和消息投递拆分

状态：终端投递构造、投递队列、输出追踪、审批和自动工作流完整编排服务边界已落地。

目标：拆分当前集中在 `renderer.js` 中的终端注入、投递队列、输出反馈和审批流程。

建议结构：

```text
src/renderer/
├── agent/
│   ├── agent-service.js       # Agent 窗口和会话生命周期
│   ├── delivery-queue.js      # 消息投递队列和重试
│   ├── terminal-adapter.js    # xterm/终端后端适配
│   ├── output-tracker.js      # 输出引用、状态和卡住检测
│   ├── approval-service.js    # 命令风险和审批交互
│   └── workflow-service.js    # 自动工作流启停、恢复和调度泵
```

工作内容：

- 将 Agent delivery、terminal output ref、stuck check 和 retry 逻辑移入服务。
- 统一 Claude、Codex、CodeBuddy 的终端适配接口。
- 把命令风险判断和审批状态从终端 UI 中抽离。
- 为投递队列增加可观测事件，减少依赖 DOM 状态判断 Agent 是否可用。

验收标准：

- Agent 注入、自动推进、重试、终端输出引用和审批测试全部通过。
- 终端 UI 只负责展示和触发服务调用。
- 投递失败可以通过结构化状态定位原因，不依赖字符串匹配页面文本。

### 第 5 轮：窗口系统与视图模块拆分

状态：已完成。

目标：拆分窗口管理、桌面布局和各类程序视图，降低渲染模板之间的耦合。

建议结构：

```text
src/renderer/
├── windowing/
│   ├── window-manager.js      # 聚焦、层级、最大化、桌面切换
│   ├── desktop-manager.js     # 桌面和布局
│   └── window-model.js        # 窗口字段和兼容处理
├── views/
│   ├── task-view.js
│   ├── message-view.js
│   ├── terminal-view.js
│   ├── browser-view.js
│   ├── file-view.js
│   ├── search-service.js
│   ├── interaction-service.js
│   ├── program-action-service.js
│   ├── settings-action-service.js
│   ├── workspace-action-service.js
│   ├── task-action-service.js
│   ├── world-action-service.js
│   └── app-menu-action-service.js
```

工作内容：

- 将窗口状态变更从 HTML 模板和事件委托中抽出。
- 为每类程序视图定义统一的 `render`、`mount`、`unmount` 和事件入口。
- 将终端、浏览器和文件视图的生命周期管理与窗口层分离。
- 将 `data-action` 按设置、工作区、程序、任务、世界和应用菜单分派到独立服务。

验收标准：

- 窗口层只处理布局和生命周期，不包含任务业务逻辑。
- 每类视图可以独立测试挂载、销毁和刷新。
- 桌面切换、窗口聚焦、最大化、终端和浏览器相关 E2E 全部通过。

### 第 6 轮：主进程模块化

状态：已完成首轮迁移。

目标：将 `main.cjs` 从“所有系统能力的单一脚本”拆为可测试的服务层。

建议结构：

```text
src/main/
├── app-runtime.cjs            # Electron 生命周期和窗口创建
├── ipc/
│   ├── register-ipc.cjs       # IPC 注册入口
│   ├── storage-handlers.cjs
│   ├── agent-handlers.cjs
│   ├── terminal-handlers.cjs
│   └── project-handlers.cjs
├── services/
│   ├── storage-service.cjs    # JSON/SQLite/备份
│   ├── llm-service.cjs        # Planner 和模型连通性
│   ├── terminal-service.cjs   # PTY、Pipe、Native Helper
│   ├── agent-runtime.cjs      # Agent 检测和启动
│   ├── mcp-config-service.cjs
│   └── project-file-service.cjs
└── security/
    ├── command-policy.cjs
    └── path-policy.cjs
```

迁移顺序：

1. 先迁移纯函数和配置。
2. 再迁移 Storage Service，并保持现有 JSON/SQLite 双写行为。
3. 再迁移 LLM、MCP、文件服务。
4. 最后迁移终端生命周期和 Electron 窗口事件。

验收标准：

- `main.cjs` 只负责启动、依赖装配和调用 IPC 注册器；具体 handler 注册位于 `main/ipc/register-ipc.cjs`。
- 存储、LLM、终端、项目文件能力可以在无窗口环境下单独测试。
- IPC 方法名、参数和返回值保持兼容。

### 第 7 轮：构建、测试和清理

状态：已完成本轮验证，后续仅保留增量维护。

目标：在完成模块迁移后建立长期维护机制。

工作内容：

- 为纯业务模块补充单元测试，为 Electron 交互保留 E2E 测试。
- 将 `node --check`、单元测试、E2E 和打包检查加入统一 preflight。
- 删除已不再使用的全局函数、兼容别名和重复状态推导。
- 检查模块循环依赖、脚本加载顺序和生产构建资源路径。
- 更新 README、帮助文档和开发者架构说明。

验收标准：

- CI 可以在干净环境执行完整验证。
- 关键模块有明确的输入、输出和错误边界。
- `renderer.js` 和 `main.cjs` 只保留应用装配与少量跨领域编排。

## 5. 每轮执行模板

每一轮按以下顺序执行：

1. 记录本轮要迁移的函数和调用方。
2. 先创建新模块和适配接口。
3. 迁移实现，保留兼容入口。
4. 删除旧实现中的重复代码。
5. 运行 `node --check` 和对应领域测试。
6. 运行完整 `npm test`。
7. 更新本计划中的状态、结果和遗留风险。

## 6. 不在近期处理的事项

- 暂不引入大型前端框架或打包器，仅通过现有脚本加载机制渐进拆分。
- 暂不修改持久化 schema 和 MCP 协议版本。
- 暂不重写 Kernel 核心算法；优先拆分调用边界和投影逻辑。
- 暂不做全量 TypeScript 迁移，待模块边界稳定后再评估。

## 7. 完成定义

当以下条件全部满足时，才认为全部架构重构完成；当前计划仍未达到完成定义：

- 领域模块有清晰的输入、输出和依赖方向。
- 业务状态不再由多个 UI 事件处理器重复维护。
- 主进程和渲染进程的系统能力边界明确。
- 旧状态、旧 IPC 调用和现有用户流程保持兼容。
- 完整测试、打包检查和架构文档均通过并更新。
