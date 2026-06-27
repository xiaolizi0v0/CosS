# CosS v0.4.2 开发记录

## 本版本开发模块

1. 子程序窗口管理
   - 角色程序窗口新增最小化、最大化、还原控制。
   - 支持通过窗口边缘和四角自定义调整窗口大小。
   - Dock 支持恢复已最小化窗口，并自动切回窗口所属桌面。

2. 虚拟桌面与任务视图
   - 项目状态新增 `desktops` 和 `activeDesktopId`。
   - 程序窗口新增 `desktopId`，只在所属桌面显示。
   - 新增任务视图入口，可查看桌面分组、切换桌面、创建新桌面。
   - 任务视图顶部的布局模式按钮已调整为 Windows 风格 6 种排列：两列、主列加窄列、主列加上下分割、四宫格、三列、窄-主-窄；点击后会重排当前桌面的窗口并保留选中状态。
   - 确认任务计划后，自动创建任务桌面，并把相关角色程序放入该桌面。

3. 状态迁移与日志
   - 旧项目状态会自动补齐默认主桌面。
   - 新增桌面创建、桌面切换、窗口移动、窗口缩放、窗口最小化、窗口最大化日志事件。

## 局部测试

- `npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "v0.4.2"`
  - 通过 3 项：标题栏版本、子窗口最小化/最大化/缩放、任务视图桌面切换。
- `npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "opens collaboration details when task-created windows overlap"`
  - 通过 1 项：确认任务后角色窗口和协作角标仍正常。
- `npm.cmd exec playwright test -- tests/e2e/app.spec.cjs -g "task view layout presets|v0.4.2 task view switches"`
  - 通过 2 项：任务视图桌面切换、布局模式切换并重排当前桌面窗口。
