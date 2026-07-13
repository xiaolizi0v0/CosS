# CosS 世界地图编辑

CosS 世界场景使用 Phaser 运行时。默认世界由确定性程序化生成器创建，地图为 `88×64`、瓦片尺寸为 `80px`；Tiled JSON 保留为自定义地图导入格式。

## 文件结构

```text
src/world/
├── maps/
│   ├── default-meadow.json   # Tiled 示例/自定义地图基线
│   └── meadow-tiles.svg      # 示例瓦片集
├── tiled-map-loader.js       # Tiled JSON 解析器
├── world-assets.js           # 角色、HomeINT、OpenDoor、基础物件资源映射
├── world-generator.js        # 默认世界的道路、住宅和绿化生成算法
├── world-terrain-renderer.js # 草地合成、花草覆盖和道路边界渲染
├── world-camera-controller.js # 独立镜头目标、拖拽、键盘移动和缩放
└── world-engine.js           # Phaser / Canvas 场景运行时
```

## 默认程序化地图

`world-generator.js` 使用世界 ID 作为种子，因此同一个世界每次打开都会得到相同布局。生成过程包括：

- 生成 9 个住宅槽位和角色到住宅的固定绑定；
- 用正交路由算法连接住宅、中央广场和公告栏；
- 用 `plain_grass_tile.png` 合成无边框草地，并按种子稀疏覆盖 `grass_pink_flower.png` 与 `grass_white_daisy.png`；
- 根据道路格四邻域自动裁切并组合 `grass_stone_tile_1.png`、`grass_stone_tile_2.png` 的上下左右边界；
- 在天空与草地交界处生成两层错位林带，树冠跨过地平线且按深度保持在住宅后方；
- 用带碰撞检测的种子随机算法散布树木、花坛、路灯和长椅；
- 为镜头保留左右各 14 格、底部 14 格的不可达安全边距，用户平移或缩放时看不到地图边界；
- 输出每位居民的 `homeX/homeY`，作为离家和回家动画的唯一目标点。

修改生成规则后应递增 `GENERATION_VERSION`，旧世界会在下次规范化状态时自动升级布局。

## 使用 Tiled 导入自定义地图

1. 安装 Tiled Map Editor。
2. 打开 `src/world/maps/default-meadow.json`。
3. 在 `Ground` 图层绘制地面。
4. 在 `Stone Paths` 图层绘制石板路，运行时会使用 `base/stone_tile_flat_*` 瓦片。
5. 在对象图层中放置建筑、公告栏、角色创建点。
6. 对象的 `type` 和 `action` 会被 CosS 读取。
7. 保存 JSON 后重新打开 CosS 世界场景即可看到变化。

对象层约定：

| Tiled 字段 | CosS 含义 |
| --- | --- |
| `type: board` | 公告栏 |
| `type: plot` | 角色创建点 |
| `type: house` | 通用房屋 |
| `type: role-house` + `properties.roleId` | 绑定居民住宅，并加载对应 `imge/<角色目录>/<角色>Home.png` |
| `type: landmark` + `properties.assetKey` | 加载 `imge/base` 中的场景物件 |
| `properties.action=publish-world-task` | 打开任务发布入口 |
| `properties.action=open-world-chat` | 打开世界群聊 |
| `properties.action=create-world-agent` | 创建世界 Agent |
| `properties.action=enter-world-home` | 播放角色住宅 OpenDoor 动画并进入对应 `HomeINT.png` |

地图的 `tilewidth` 和 `tileheight` 会转换为 CosS 世界坐标。Agent 仍然由 `world.agents` 状态驱动，世界任务、群聊和 CodeBuddy 执行流程不放入地图文件。

## 居民与任务移动流程

- 每个世界初始化为九位居民，初始状态为 `location: home`。居民不会显示在室外，而是显示在各自的 `HomeINT.png` 室内场景中。
- 点击住宅时先播放该角色目录中的 4 帧 `HomeOpenDoor` 动画，再进入对应 HomeINT；室内顶部提供「返回小镇」。
- 世界群聊右上角的「加入成员」按钮只修改 `world.chatMemberRoleIds`，居民本身不会因为入群而丢失。
- 点击公告栏发布任务后，只有 `chatMemberRoleIds` 中的居民会出门奔跑到公告栏，并通过现有世界 Agent CodeBuddy 内核执行 `module-claim` 领取模块。
- 领取完成后，成员回到 `homeX/homeY`，状态切换为工作动画；队列中的非群聊成员目标会被忽略。
- 角色奔跑使用 `Down_run`、`side_run`、`Up_run`，离家/回家使用对应目录中的开门动画；天空云朵使用 `cloud/1.png` 至 `cloud/3.png` 循环播放。

## 运行时策略

- Phaser 可用时使用 Phaser 场景。
- 地图对象始终保持世界坐标不变；拖拽、方向键和滚轮只更新 `world-camera-controller.js` 的 Phaser Camera 跟随目标。
- Phaser 或 Tiled JSON 加载失败时保留程序化地图 fallback。
- 地图文件只描述空间和对象，不直接执行命令，也不改变 Agent 权限边界。
- 新世界默认使用 `world-generator.js`，且 `world.map.tiledUrl` 为空；自定义世界可填写 `tiledUrl` 载入 Tiled JSON。
