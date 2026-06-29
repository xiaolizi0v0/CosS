# CosS v0.5.6 开发记录

开发日期：2026-06-29

## 版本目标

v0.5.6 聚焦 Agent 投递稳定化。在 CodeBuddy Code 真实交互投递已解决的基础上，进一步把 Claude Code、Codex、CodeBuddy Code 的投递方式显式结构化，方便后续统一适配、诊断、重试和回归测试。

## 已完成模块

1. 版本升级
   - `package.json` / `package-lock.json` 升级到 `0.5.6`。
   - 应用侧边栏与关于信息升级到 `v0.5.6`。
   - 协作时间线标题升级为 `v0.5.6 协作时间线`。

2. Agent 投递适配层
   - 新增统一的投递适配信息：
     - `submissionProvider`
     - `submissionMethod`
     - `submissionDetail`
   - Claude Code / Codex 使用 `bracketed-paste`。
   - CodeBuddy Code 使用 `delivery-file-interactive`。
   - 确认投递日志新增 provider、method、deliveryFilePath 等字段。

3. CodeBuddy Code 投递保留为回归项
   - 继续使用 `.coss/deliveries/*.md` 投递文件。
   - 继续使用交互终端分段输入、延迟提交和增强 Enter 兜底。
   - e2e 中验证 CodeBuddy 投递文件、提交方式和 UI 诊断信息。

4. 投递卡住检测
   - 确认投递后启动响应观察。
   - 如果投递仍停留在 `submitted`，且没有检测到真实 Agent 输出，则标记为疑似卡住。
   - 疑似卡住后显示“重试”入口，可重新加入待确认投递队列。
   - 一旦检测到真实 Agent 输出或等待人工确认，会清除疑似卡住状态。

5. 消息中心投递诊断信息
   - 投递详情显示：
     - 目标角色
     - 投递状态
     - Agent 后端
     - 提交方式
     - 尝试次数
     - 投递文件路径
     - 提交说明
     - 最近终端输出片段
   - 方便用户判断“已提交但未响应”“等待人工确认”“Agent 已响应”等状态。

## 定向测试范围

本版本不跑完整 e2e，按当前改动范围只跑：

```powershell
node --check src\main.cjs
node --check src\renderer.js
node --check src\preload.cjs
node --check tests\e2e\app.spec.cjs
npm.cmd run test:e2e -- tests/e2e/app.spec.cjs -g "CodeBuddy|agent delivery|queues timeline messages|renders v0.5.6|sends a v0.4 role message"
```

## 后续建议

1. v0.5.7 继续增强任务列表：搜索、过滤、归档、任务详情抽屉。
2. v0.6.0 开始产品化 Agent 权限与审批模式。
3. 后续可把投递适配层进一步拆到独立模块，减少 `renderer.js` 体积。

