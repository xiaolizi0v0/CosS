# CosS 世界地图编辑

CosS 世界场景使用 Phaser 运行时，地图资源采用 Tiled JSON 格式。

## 文件结构

```text
src/world/
├── maps/
│   ├── default-meadow.json   # Tiled 地图
│   └── meadow-tiles.svg      # 示例瓦片集
├── tiled-map-loader.js       # Tiled JSON 解析器
└── world-engine.js           # Phaser / Canvas 场景运行时
```

## 使用 Tiled 编辑

1. 安装 Tiled Map Editor。
2. 打开 `src/world/maps/default-meadow.json`。
3. 在 `Ground` 图层绘制地面。
4. 在对象图层中放置建筑、公告栏、角色创建点。
5. 对象的 `type` 和 `action` 会被 CosS 读取。
6. 保存 JSON 后重新打开 CosS 世界场景即可看到变化。

对象层约定：

| Tiled 字段 | CosS 含义 |
| --- | --- |
| `type: board` | 公告栏 |
| `type: plot` | 角色创建点 |
| `type: house` | 角色房屋 |
| `properties.action=publish-world-task` | 打开任务发布入口 |
| `properties.action=open-world-chat` | 打开世界群聊 |
| `properties.action=create-world-agent` | 创建世界 Agent |

地图的 `tilewidth` 和 `tileheight` 会转换为 CosS 世界坐标。Agent 仍然由 `world.agents` 状态驱动，世界任务、群聊和 CodeBuddy 执行流程不放入地图文件。

## 运行时策略

- Phaser 可用时使用 Phaser 场景。
- Phaser 或 Tiled JSON 加载失败时保留程序化地图 fallback。
- 地图文件只描述空间和对象，不直接执行命令，也不改变 Agent 权限边界。
- 新世界默认使用 `./world/maps/default-meadow.json`，可在 `world.map.tiledUrl` 中替换为其他地图。
