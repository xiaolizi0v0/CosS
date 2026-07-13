(() => {
  const DEFAULT_MAP = { key: "default-meadow", width: 88, height: 64, tileSize: 80 };
  const STATUS_BUBBLES = {
    idle: "…",
    planning: "✎",
    running: "⚙",
    waiting: "?",
    done: "✓",
    blocked: "!",
    failed: "×"
  };
  const STATUS_COLORS = {
    idle: 0xffffff,
    planning: 0xe0f2fe,
    running: 0xdbeafe,
    waiting: 0xfef3c7,
    done: 0xdcfce7,
    blocked: 0xfee2e2,
    failed: 0xfecaca
  };
  const ROLE_COLORS = [0x2d6cdf, 0x7a5ce8, 0x17a36b, 0xe0752d, 0x0891b2, 0xbe4bdb, 0x16a34a, 0x475569, 0xdc2626];
  const OBJECT_COLORS = [0xf4d35e, 0x93c5fd, 0xf0abfc, 0xfdba74, 0x86efac];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeMap(map = {}) {
    return {
      key: map.key || DEFAULT_MAP.key,
      width: Number.isFinite(Number(map.width)) ? Number(map.width) : DEFAULT_MAP.width,
      height: Number.isFinite(Number(map.height)) ? Number(map.height) : DEFAULT_MAP.height,
      tileSize: Number.isFinite(Number(map.tileSize)) ? Number(map.tileSize) : DEFAULT_MAP.tileSize,
      horizonRows: Number.isFinite(Number(map.horizonRows)) ? Number(map.horizonRows) : 4,
      focusX: Number.isFinite(Number(map.focusX)) ? Number(map.focusX) : DEFAULT_MAP.width / 2,
      focusY: Number.isFinite(Number(map.focusY)) ? Number(map.focusY) : 10.5,
      cameraSafeInsetX: Number.isFinite(Number(map.cameraSafeInsetX)) ? Number(map.cameraSafeInsetX) : 14,
      cameraSafeInsetBottom: Number.isFinite(Number(map.cameraSafeInsetBottom)) ? Number(map.cameraSafeInsetBottom) : 14,
      generation: String(map.generation || "")
    };
  }

  function roleLabel(agent) {
    return agent.roleName || agent.name || agent.roleId || "Agent";
  }

  function getWorldSize(world) {
    const map = normalizeMap(world?.map);
    return {
      map,
      width: map.width * map.tileSize,
      height: map.height * map.tileSize
    };
  }

  function getTilePosition(entity, map) {
    return {
      x: (Number(entity?.x) + 0.5) * map.tileSize,
      y: (Number(entity?.y) + 0.5) * map.tileSize
    };
  }

  function getObjectProperty(object, name, fallback = "") {
    const property = Array.isArray(object?.properties)
      ? object.properties.find((item) => item?.name === name)
      : null;
    return property ? property.value : fallback;
  }

  function slug(value) {
    return String(value || "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  }

  function createPhaserWorldGame(container, world, callbacks = {}) {
    const Phaser = window.Phaser;
    const size = getWorldSize(world);
    const rect = container.getBoundingClientRect();
    let resolveSceneReady;
    const sceneReady = new Promise((resolve) => { resolveSceneReady = resolve; });
    container.replaceChildren();

    class CosSWorldScene extends Phaser.Scene {
      constructor() {
        super("CosSWorldScene");
        this.worldState = world;
        this.callbacks = callbacks;
        this.map = size.map;
        this.drag = null;
        this.selectedAgentId = callbacks.selectedAgentId || "";
        this.lastInteractiveClickAt = 0;
        this.agentSprites = new Map();
        this.houseSprites = new Map();
      }

      create() {
        this.cameras.main.setBackgroundColor("#bfe7ff");
        this.createPlaceholderTextures();
        this.createAssetAnimations();
        this.configureCamera(true);
        this.drawWorld();
        this.bindCameraControls();
        this.game.canvas.dataset.worldReady = "true";
        resolveSceneReady?.();
        this.scale.on("resize", () => {
          this.configureCamera(Boolean(this.getInteriorRoleId()));
          this.drawWorld();
        });
      }

      preload() {
        const assets = window.CossWorldAssets;
        const interiorRoleId = String(this.worldState?.activeInteriorRoleId || "");
        const animatedExteriorRoles = new Set([
          ...(this.worldState?.chatMemberRoleIds || []),
          ...(this.worldState?.agents || [])
            .filter((agent) => agent.location !== "home" || agent.movement)
            .map((agent) => agent.roleId)
        ]);
        this.loadedAnimatedRoleIds = animatedExteriorRoles;
        if (!interiorRoleId) {
          this.load.spritesheet("coss-meadow-tiles", "./world/maps/meadow-tiles.svg", {
            frameWidth: 32,
            frameHeight: 32
          });
          Object.keys(assets?.base || {}).forEach((key) => {
            this.load.image(`coss-base-${key}`, assets.baseUrl(key));
          });
        }
        const roleIds = interiorRoleId ? [interiorRoleId] : Object.keys(assets?.roles || {});
        roleIds.forEach((roleId) => {
          const role = assets.role(roleId);
          const prefix = `coss-role-${slug(roleId)}`;
          if (interiorRoleId) {
            this.load.image(`${prefix}-interior`, role.interior);
            role.idle.forEach((url, index) => this.load.image(`${prefix}-idle-${index + 1}`, url));
            role.working.forEach((url, index) => this.load.image(`${prefix}-working-${index + 1}`, url));
          } else {
            this.load.image(`${prefix}-home`, role.home);
            role.door.forEach((url, index) => this.load.image(`${prefix}-door-${index + 1}`, url));
            if (animatedExteriorRoles.has(roleId)) {
              role.idle.forEach((url, index) => this.load.image(`${prefix}-idle-${index + 1}`, url));
              Object.entries(role.run).forEach(([direction, frames]) => {
                frames.forEach((url, index) => this.load.image(`${prefix}-run-${direction}-${index + 1}`, url));
              });
            }
          }
        });
        if (!interiorRoleId) {
          (assets?.cloudFrames || []).forEach((url, index) => this.load.image(`coss-cloud-${index + 1}`, url));
        }
      }

      createAssetAnimations() {
        const assets = window.CossWorldAssets;
        const interiorRoleId = this.getInteriorRoleId();
        const roleIds = interiorRoleId ? [interiorRoleId] : Object.keys(assets?.roles || {});
        roleIds.forEach((roleId) => {
          const prefix = `coss-role-${slug(roleId)}`;
          const kinds = interiorRoleId
            ? ["idle", "working"]
            : (this.loadedAnimatedRoleIds?.has(roleId) ? ["idle", "door"] : ["door"]);
          kinds.forEach((kind) => {
            const key = `${prefix}-${kind}`;
            if (!this.anims.exists(key)) {
              this.anims.create({
                key,
                frames: [1, 2, 3, 4].map((frame) => ({ key: `${prefix}-${kind}-${frame}` })),
                frameRate: kind === "door" ? 8 : 7,
                repeat: kind === "door" ? 0 : -1
              });
            }
          });
          (interiorRoleId || !this.loadedAnimatedRoleIds?.has(roleId) ? [] : ["down", "side", "up"]).forEach((direction) => {
            const key = `${prefix}-run-${direction}`;
            if (!this.anims.exists(key)) {
              this.anims.create({
                key,
                frames: [1, 2, 3, 4].map((frame) => ({ key: `${prefix}-run-${direction}-${frame}` })),
                frameRate: 10,
                repeat: -1
              });
            }
          });
        });
        if (!interiorRoleId && !this.anims.exists("coss-cloud")) {
          this.anims.create({
            key: "coss-cloud",
            frames: [1, 2, 3].map((frame) => ({ key: `coss-cloud-${frame}` })),
            frameRate: 3,
            repeat: -1
          });
        }
      }

      createPlaceholderTextures() {
        const tile = this.map.tileSize;
        const grass = this.add.graphics();
        grass.fillStyle(0x89d978, 1).fillRect(0, 0, tile, tile);
        grass.fillStyle(0xffffff, 0.11).fillTriangle(0, 0, tile, 0, 0, tile);
        grass.generateTexture("coss-grass-a", tile, tile);
        grass.clear();
        grass.fillStyle(0x7ece69, 1).fillRect(0, 0, tile, tile);
        grass.fillStyle(0x2a7436, 0.08).fillTriangle(tile, 0, tile, tile, 0, tile);
        grass.generateTexture("coss-grass-b", tile, tile);
        grass.clear();
        const meadowSize = 256;
        grass.fillStyle(0x78c95e, 1).fillRect(0, 0, meadowSize, meadowSize);
        for (let index = 0; index < 96; index += 1) {
          const x = (index * 47 + 19) % meadowSize;
          const y = (index * 83 + 31) % meadowSize;
          const color = index % 3 === 0 ? 0xa4dd75 : (index % 3 === 1 ? 0x58ac4e : 0x88d36a);
          grass.fillStyle(color, index % 4 === 0 ? 0.72 : 0.48).fillRect(x, y, index % 5 === 0 ? 3 : 2, 1);
        }
        grass.generateTexture("coss-procedural-grass", meadowSize, meadowSize);
        grass.destroy();
      }

      getInteriorRoleId() {
        const roleId = String(this.worldState?.activeInteriorRoleId || "");
        return roleId && window.CossWorldAssets?.role(roleId) ? roleId : "";
      }

      configureCamera(focusExterior = false) {
        const camera = this.cameras.main;
        const interiorRoleId = this.getInteriorRoleId();
        if (interiorRoleId) {
          camera.setZoom(1);
          camera.setBounds(0, 0, Math.max(1, this.scale.width), Math.max(1, this.scale.height));
          camera.setScroll(0, 0);
          this.viewMode = `interior:${interiorRoleId}`;
          return;
        }

        const tile = this.map.tileSize;
        const zoom = clamp(Number(this.worldState?.camera?.zoom) || 0.5, 0.5, 2.5);
        const safeX = clamp(this.map.cameraSafeInsetX, 0, Math.max(0, this.map.width / 3));
        const safeBottom = clamp(this.map.cameraSafeInsetBottom, 0, Math.max(0, this.map.height / 3));
        const boundsX = safeX * tile;
        const boundsWidth = Math.max(tile, (this.map.width - safeX * 2) * tile);
        const boundsHeight = Math.max(tile, (this.map.height - safeBottom) * tile);
        camera.setZoom(zoom);
        camera.setBounds(boundsX, 0, boundsWidth, boundsHeight);
        if (focusExterior || this.viewMode?.startsWith("interior:")) {
          const scrollX = this.map.focusX * tile - camera.width / (2 * zoom);
          camera.setScroll(scrollX, 0);
        }
        this.viewMode = "exterior";
      }

      drawInterior(roleId) {
        const width = Math.max(1, this.scale.width);
        const height = Math.max(1, this.scale.height);
        const prefix = `coss-role-${slug(roleId)}`;
        const textureKey = `${prefix}-interior`;
        const backdrop = this.add.graphics().setScrollFactor(0).setDepth(-10);
        backdrop.fillStyle(0x172033, 1).fillRect(0, 0, width, height);

        if (this.textures.exists(textureKey)) {
          const source = this.textures.get(textureKey).getSourceImage();
          const sourceWidth = Math.max(1, Number(source?.width) || width);
          const sourceHeight = Math.max(1, Number(source?.height) || height);
          const scale = Math.min(width / sourceWidth, height / sourceHeight);
          const displayWidth = sourceWidth * scale;
          const displayHeight = sourceHeight * scale;
          this.add.image(width / 2, height / 2, textureKey)
            .setScrollFactor(0)
            .setDepth(0)
            .setDisplaySize(displayWidth, displayHeight);
        } else {
          this.add.text(width / 2, height / 2, "HomeINT 资源加载失败", {
            fontFamily: "Microsoft YaHei, sans-serif",
            fontSize: "18px",
            color: "#ffffff"
          }).setOrigin(0.5).setScrollFactor(0);
        }

        const agent = (this.worldState?.agents || []).find((item) => item.roleId === roleId);
        if (agent?.location === "home" && !agent.movement) {
          const kind = agent.animation === "working" ? "working" : "idle";
          const animationKey = `${prefix}-${kind}`;
          const size = clamp(height * 0.14, 76, 112);
          const sprite = this.add.sprite(width * 0.52, height * 0.73, `${prefix}-${kind}-1`)
            .setScrollFactor(0)
            .setDepth(20)
            .setDisplaySize(size, size);
          if (this.anims.exists(animationKey)) sprite.play(animationKey);
          this.add.text(width * 0.52, height * 0.73 + size * 0.58, roleLabel(agent), {
            fontFamily: "Microsoft YaHei, sans-serif",
            fontSize: "13px",
            color: "#20304a",
            backgroundColor: "rgba(255,255,255,0.88)",
            padding: { x: 8, y: 5 }
          }).setOrigin(0.5).setScrollFactor(0).setDepth(21);
        }
      }

      drawWorld() {
        this.children.removeAll();
        this.agentSprites.clear();
        this.houseSprites.clear();
        const interiorRoleId = this.getInteriorRoleId();
        if (interiorRoleId) {
          this.drawInterior(interiorRoleId);
          return;
        }
        this.drawSkyBackground();
        this.drawTiles();
        this.drawMeadowObjects();
        (this.worldState?.objects || []).forEach((object, index) => this.drawObject(object, index));
        (this.worldState?.agents || [])
          .filter((agent) => agent.location !== "home" || agent.movement)
          .forEach((agent, index) => this.drawAgent(agent, index));
      }

      drawSkyBackground() {
        const textureKey = "coss-base-skyBackground";
        if (!this.textures.exists(textureKey)) return;
        const zoom = this.cameras.main.zoom || 1;
        const source = this.textures.get(textureKey).getSourceImage();
        const sourceWidth = Math.max(1, Number(source?.width) || this.scale.width);
        const sourceHeight = Math.max(1, Number(source?.height) || this.scale.height);
        const displayWidth = this.scale.width / zoom;
        const displayHeight = displayWidth * sourceHeight / sourceWidth;
        const zoomOffsetX = this.scale.width * (1 - zoom) / 2;
        const zoomOffsetY = this.scale.height * (1 - zoom) / 2;
        const fixedX = -zoomOffsetX / zoom;
        const horizonScreenY = this.map.horizonRows * this.map.tileSize * zoom;
        const fixedBottomY = (horizonScreenY - zoomOffsetY) / zoom;
        this.add.image(0, 0, textureKey)
          .setOrigin(0, 1)
          .setPosition(fixedX, fixedBottomY)
          .setScrollFactor(0)
          .setDepth(-100)
          .setDisplaySize(displayWidth, displayHeight);
      }

      drawTiles() {
        const tile = this.map.tileSize;
        const width = this.map.width * tile;
        const height = this.map.height * tile;
        const groundTop = this.map.horizonRows * tile;
        const background = this.add.graphics();
        background.setDepth(-1).fillStyle(0x86d66e, 1).fillRect(0, groundTop, width, height - groundTop);
        if (this.textures.exists("coss-procedural-grass")) {
          this.add.tileSprite(0, groundTop, width, height - groundTop, "coss-procedural-grass")
            .setOrigin(0)
            .setDepth(0);
        }
        const layers = (this.worldState?.map?.tileLayers || []).filter((layer) => layer.data?.length);
        const drawLayer = (layer) => {
          const isPath = /path|road|stone|plaza/i.test(layer.name || "");
          const textureFor = (gid) => {
            if (!isPath) return "coss-base-plainGrass";
            return {
              1: "coss-base-stoneFlat1",
              2: "coss-base-stoneFlat2",
              3: "coss-base-stoneFlat3",
              4: "coss-base-stonePathCorner"
            }[gid] || "coss-base-stoneFlat1";
          };
          for (let y = 0; y < this.map.height; y += 1) {
            for (let x = 0; x < this.map.width; x += 1) {
              if (y < this.map.horizonRows) continue;
              const gid = Number(layer.data[y * Number(layer.width || this.map.width) + x] || 0);
              if (gid <= 0) continue;
              const textureKey = textureFor(gid);
              if (this.textures.exists(textureKey)) {
                this.add.image(x * tile, y * tile, textureKey)
                  .setOrigin(0)
                  .setPosition(x * tile - 2, y * tile - 2)
                  .setDisplaySize(tile + 4, tile + 4)
                  .setDepth(isPath ? 1 : 0);
              }
            }
          }
        };
        if (layers.length) {
          layers.forEach(drawLayer);
        } else if (!this.textures.exists("coss-procedural-grass")) {
          for (let y = 0; y < this.map.height; y += 1) {
            for (let x = 0; x < this.map.width; x += 1) {
              if (y < this.map.horizonRows) continue;
              if (this.textures.exists("coss-base-plainGrass")) {
                this.add.image(x * tile - 2, y * tile - 2, "coss-base-plainGrass").setOrigin(0).setDisplaySize(tile + 4, tile + 4);
              }
            }
          }
        }
      }

      drawMeadowObjects() {
        const tile = this.map.tileSize;
        const focusX = this.map.focusX;
        if (this.textures.exists("coss-cloud-1")) {
          [
            { x: focusX - 10, y: 1, scale: 0.25, duration: 42000 },
            { x: focusX + 7, y: 2, scale: 0.22, duration: 52000 }
          ].forEach((cloud, index) => {
            const sprite = this.add.sprite(cloud.x * tile, cloud.y * tile, "coss-cloud-1")
              .setOrigin(0.5)
              .setScale(cloud.scale)
              .setDepth(1)
              .play("coss-cloud");
            this.tweens.add({
              targets: sprite,
              x: sprite.x + 15 * tile,
              duration: cloud.duration + index * 5000,
              ease: "Sine.InOut",
              yoyo: true,
              repeat: -1
            });
          });
        }
      }

      drawObject(object, index) {
        const tile = this.map.tileSize;
        const x = Number(object.x) * tile;
        const y = Number(object.y) * tile;
        const width = Number(object.width || 4) * tile;
        const height = Number(object.height || 3) * tile;
        const group = this.add.container(x, y).setDepth(y + height);
        const g = this.add.graphics();
        group.add(g);

        if (object.type === "role-house") {
          this.drawRoleHouse(group, object, width, height);
        } else if (object.type === "landmark" || getObjectProperty(object, "assetKey")) {
          this.drawAssetObject(group, object, width, height);
        } else if (object.type === "board") {
          g.fillStyle(0x70452b, 1).fillRect(width * 0.2, height * 0.34, 8, height * 0.7).fillRect(width * 0.74, height * 0.34, 8, height * 0.7);
          g.fillStyle(0xf0c36d, 1).fillRoundedRect(0, 0, width, height * 0.72, 8);
          g.lineStyle(4, 0x875500, 0.55).strokeRoundedRect(0, 0, width, height * 0.72, 8);
          this.add.text(x + width / 2, y + height * 0.32, "公告栏", { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "15px", fontStyle: "bold", color: "#513b00" }).setOrigin(0.5);
        } else if (object.type === "plot") {
          g.fillStyle(0xffffff, 0.16).fillRoundedRect(0, 0, width, height, 16);
          g.lineStyle(3, 0xffffff, 0.72).strokeRoundedRect(0, 0, width, height, 16);
          g.lineStyle(2, 0x0f766e, 0.36).strokeRoundedRect(8, 8, width - 16, height - 16, 12);
          this.add.text(x + width / 2, y + height / 2, "+ 创建角色", { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "14px", fontStyle: "bold", color: "#0f766e" }).setOrigin(0.5);
        } else if (object.type === "house") {
          this.drawHouse(group, object, index, width, height);
        } else {
          this.drawBuilding(group, object, index, width, height);
        }

        const isInteractive = Boolean(object.action || object.type === "role-house" || getObjectProperty(object, "action"));
        if (!isInteractive) return;
        const zone = this.add.zone(x, y, width, height).setOrigin(0).setInteractive({ useHandCursor: true });
        zone.on("pointerup", (pointer) => {
          if (this.wasDragging(pointer) || document.querySelector(".modal-backdrop")) {
            return;
          }
          this.lastInteractiveClickAt = performance.now();
          this.callbacks.onObjectClick?.(object);
        });
        zone.on("pointerover", () => this.game.canvas.style.cursor = "pointer");
        zone.on("pointerout", () => this.game.canvas.style.cursor = "grab");
      }

      drawAssetObject(group, object, width, height) {
        const assetKey = getObjectProperty(object, "assetKey", "");
        const textureKey = `coss-base-${assetKey}`;
        if (this.textures.exists(textureKey)) {
          const image = this.add.image(width / 2, height / 2, textureKey)
            .setOrigin(0.5)
            .setDisplaySize(width, height);
          group.add(image);
        } else {
          const g = group.list[0];
          g.fillStyle(0xffffff, 0.2).fillRoundedRect(0, 0, width, height, 16);
          g.lineStyle(2, 0xffffff, 0.45).strokeRoundedRect(0, 0, width, height, 16);
        }
        if (object.action) {
          group.add(this.add.text(width / 2, height + 12, object.name || "场景物品", {
            fontFamily: "Microsoft YaHei, sans-serif",
            fontSize: "12px",
            color: "#20304a",
            backgroundColor: "rgba(255,255,255,0.82)",
            padding: { x: 7, y: 4 }
          }).setOrigin(0.5));
        }
      }

      drawRoleHouse(group, object, width, height) {
        const roleId = String(object.roleId || getObjectProperty(object, "roleId", ""));
        const prefix = `coss-role-${slug(roleId)}`;
        const home = this.add.sprite(width / 2, height / 2, `${prefix}-home`)
          .setOrigin(0.5)
          .setDisplaySize(width, height);
        group.add(home);
        this.houseSprites.set(roleId, home);
        group.add(this.add.text(width / 2, height + 12, object.name?.replace(/-home$/, "") || "居民之家", {
          fontFamily: "Microsoft YaHei, sans-serif",
          fontSize: "12px",
          color: "#20304a",
          backgroundColor: "rgba(255,255,255,0.86)",
          padding: { x: 7, y: 4 }
        }).setOrigin(0.5));
      }

      drawBuilding(group, object, index, width, height) {
        const g = group.list[0];
        const color = OBJECT_COLORS[index % OBJECT_COLORS.length];
        g.fillStyle(0x0f172a, 0.16).fillRect(8, height - 6, width, 10);
        g.fillStyle(color, 1).fillRect(0, 26, width, height - 26);
        g.fillStyle(0xd8434e, 1).fillTriangle(-8, 30, width / 2, 0, width + 8, 30);
        g.fillStyle(0x172033, 0.72).fillRect(width / 2 - 9, height - 30, 18, 30);
        g.fillStyle(0xffffff, 0.8).fillRect(12, 42, 16, 16).fillRect(width - 28, 42, 16, 16);
        this.add.text(group.x + width / 2, group.y + height + 18, object.name || "建筑", { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "12px", color: "#334155", backgroundColor: "rgba(255,255,255,0.82)", padding: { x: 7, y: 4 } }).setOrigin(0.5);
      }

      drawHouse(group, object, index, width, height) {
        const g = group.list[0];
        const color = OBJECT_COLORS[(index + 2) % OBJECT_COLORS.length];
        g.fillStyle(0x0f172a, 0.16).fillRect(8, height - 6, width, 10);
        g.fillStyle(color, 1).fillRect(0, 24, width, height - 24);
        g.fillStyle(0xb91c1c, 1).fillTriangle(-8, 30, width / 2, 0, width + 8, 30);
        g.fillStyle(0x7a4f2a, 1).fillRect(width / 2 - 9, height - 28, 18, 28);
        g.fillStyle(0xffffff, 0.78).fillRect(12, 38, 14, 14).fillRect(width - 26, 38, 14, 14);
        this.add.text(group.x + width / 2, group.y + height + 18, object.name || "小屋", { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "12px", color: "#334155", backgroundColor: "rgba(255,255,255,0.82)", padding: { x: 7, y: 4 } }).setOrigin(0.5);
      }

      drawAgent(agent, index) {
        const pos = getTilePosition(agent, this.map);
        const selected = this.selectedAgentId === agent.id;
        const status = agent.status || "idle";
        const c = this.add.container(pos.x, pos.y).setDepth(pos.y + 50);
        const g = this.add.graphics();
        c.add(g);
        g.fillStyle(0x0f172a, 0.18).fillEllipse(0, 20, 34, 12);
        if (selected) {
          g.lineStyle(3, 0xfacc15, 1).strokeEllipse(0, 10, 48, 60);
        }
        const prefix = `coss-role-${slug(agent.roleId)}`;
        const movement = agent.movement || {};
        const direction = movement.direction || "down";
        const animation = agent.animation === "working"
          ? `${prefix}-working`
          : agent.animation === "running"
            ? `${prefix}-run-${direction}`
            : `${prefix}-idle`;
        const initialTexture = `${prefix}-${agent.animation === "working" ? "working" : agent.animation === "running" ? `run-${direction}` : "idle"}-1`;
        const sprite = this.add.sprite(0, -8, initialTexture).setOrigin(0.5).setDisplaySize(78, 78);
        if (this.anims.exists(animation)) sprite.play(animation);
        c.add(sprite);
        g.fillStyle(STATUS_COLORS[status] || STATUS_COLORS.idle, 1).fillRoundedRect(-14, -58, 28, 20, 8);
        g.lineStyle(2, 0x0f172a, 0.18).strokeRoundedRect(-14, -58, 28, 20, 8);
        c.add(this.add.text(0, -48, STATUS_BUBBLES[status] || STATUS_BUBBLES.idle, { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "13px", fontStyle: "bold", color: status === "failed" || status === "blocked" ? "#b91c1c" : "#334155" }).setOrigin(0.5));
        c.add(this.add.text(0, 42, roleLabel(agent), { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "12px", color: "#20304a", backgroundColor: "rgba(255,255,255,0.9)", padding: { x: 7, y: 4 } }).setOrigin(0.5));
        const zone = this.add.zone(0, -4, 78, 92).setInteractive({ useHandCursor: true });
        c.add(zone);
        zone.on("pointerup", (pointer) => {
          if (this.wasDragging(pointer) || document.querySelector(".modal-backdrop")) {
            return;
          }
          this.selectedAgentId = agent.id;
          this.lastInteractiveClickAt = performance.now();
          this.drawWorld();
          this.callbacks.onAgentClick?.(agent);
        });
        zone.on("pointerdown", () => this.selectedAgentId = agent.id);
        zone.on("pointerover", () => this.game.canvas.style.cursor = "pointer");
        zone.on("pointerout", () => this.game.canvas.style.cursor = "grab");
        zone.on("pointerupoutside", () => this.game.canvas.style.cursor = "grab");
        zone.on("pointerdown", (pointer) => {
          if (pointer.getDuration && pointer.getDuration() < 320 && pointer.getDistance && pointer.getDistance() < 4 && pointer.leftButtonDown()) {
            // Phaser emits native dblclick inconsistently inside transformed cameras, so the renderer keeps double-click optional.
          }
        });
        zone.on("pointerup", (pointer) => {
          if (pointer.event?.detail >= 2 && !document.querySelector(".modal-backdrop")) {
            this.callbacks.onAgentDoubleClick?.(agent);
          }
        });
        this.agentSprites.set(agent.id, { container: c, sprite, roleId: agent.roleId });
      }

      drawHud() {
        const hud = this.add.container(18, 18).setScrollFactor(0).setDepth(1000);
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 0.84).fillRoundedRect(0, 0, 292, 96, 14);
        g.lineStyle(1, 0xffffff, 0.62).strokeRoundedRect(0, 0, 292, 96, 14);
        hud.add(g);
        hud.add(this.add.text(16, 14, this.worldState?.name || "CosS World", { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "14px", fontStyle: "bold", color: "#172033" }));
        hud.add(this.add.text(16, 40, `Phaser 3 · 地图 ${this.map.width}×${this.map.height} · 缩放 ${this.cameras.main.zoom.toFixed(1)}x`, { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "12px", color: "#64748b" }));
        hud.add(this.add.text(16, 62, "拖拽地图 / 滚轮缩放 / 点击角色、公告栏、创建点", { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "12px", color: "#64748b" }));
      }

      bindCameraControls() {
        this.input.on("pointerdown", (pointer) => {
          if (this.getInteriorRoleId() || !pointer.leftButtonDown()) {
            return;
          }
          this.drag = {
            x: pointer.x,
            y: pointer.y,
            cameraX: this.cameras.main.scrollX,
            cameraY: this.cameras.main.scrollY,
            moved: false
          };
          this.game.canvas.style.cursor = "grabbing";
        });
        this.input.on("pointermove", (pointer) => {
          if (this.getInteriorRoleId() || !this.drag || !pointer.leftButtonDown()) {
            return;
          }
          const dx = pointer.x - this.drag.x;
          const dy = pointer.y - this.drag.y;
          if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            this.drag.moved = true;
          }
          const camera = this.cameras.main;
          camera.scrollX = this.drag.cameraX - dx / camera.zoom;
          camera.scrollY = this.drag.cameraY - dy / camera.zoom;
          this.persistCamera();
        });
        this.input.on("pointerup", (pointer) => {
          if (this.getInteriorRoleId()) {
            this.drag = null;
            this.game.canvas.style.cursor = "default";
            return;
          }
          if (document.querySelector(".modal-backdrop")) {
            return;
          }
          const drag = this.drag;
          this.drag = null;
          this.game.canvas.style.cursor = "grab";
          if (drag?.moved || performance.now() - this.lastInteractiveClickAt < 80) {
            return;
          }
          const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
          this.callbacks.onMapClick?.({
            x: clamp(Math.round(worldPoint.x / this.map.tileSize - 0.5), 0, this.map.width - 1),
            y: clamp(Math.round(worldPoint.y / this.map.tileSize - 0.5), 0, this.map.height - 1)
          });
        });
        this.input.on("wheel", (pointer, gameObjects, deltaX, deltaY) => {
          if (this.getInteriorRoleId()) return;
          const camera = this.cameras.main;
          const before = camera.getWorldPoint(pointer.x, pointer.y);
          camera.setZoom(Math.round(clamp(camera.zoom + (deltaY > 0 ? -0.1 : 0.1), 0.5, 2.5) * 10) / 10);
          const after = camera.getWorldPoint(pointer.x, pointer.y);
          camera.scrollX += before.x - after.x;
          camera.scrollY += before.y - after.y;
          this.persistCamera();
          this.drawWorld();
        });
      }

      wasDragging(pointer) {
        return Boolean(this.drag?.moved || (pointer.getDistance && pointer.getDistance() > 4));
      }

      persistCamera() {
        const camera = this.cameras.main;
        this.callbacks.onCameraChange?.({ x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom });
      }

      playDoorAnimation(roleId, duration = 520) {
        const house = this.houseSprites.get(roleId);
        const prefix = `coss-role-${slug(roleId)}`;
        if (!house || !this.anims.exists(`${prefix}-door`)) {
          return Promise.resolve();
        }
        house.play(`${prefix}-door`);
        return new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (house.active) {
              house.stop();
              house.setTexture(`${prefix}-home`);
            }
            resolve();
          };
          this.time.delayedCall(duration, finish);
          window.setTimeout(finish, duration + 80);
        });
      }

      moveAgent(agentId, target, options = {}) {
        const item = this.agentSprites.get(agentId);
        const duration = Number(options.duration) || 1350;
        if (!item) return new Promise((resolve) => window.setTimeout(resolve, duration));
        const destination = getTilePosition(target, this.map);
        const agent = (this.worldState?.agents || []).find((candidate) => candidate.id === agentId);
        const direction = options.direction || agent?.movement?.direction || "down";
        const prefix = `coss-role-${slug(agent?.roleId)}`;
        if (item.sprite && this.anims.exists(`${prefix}-run-${direction}`)) {
          item.sprite.play(`${prefix}-run-${direction}`);
        }
        const tween = new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (item.container.active) item.container.setPosition(destination.x, destination.y);
            resolve();
          };
          this.tweens.add({
            targets: item.container,
            x: destination.x,
            y: destination.y,
            duration,
            ease: "Linear",
            onComplete: finish
          });
          window.setTimeout(finish, duration + 100);
        });
        const door = options.doorAtEnd ? tween.then(() => this.playDoorAnimation(agent?.roleId, 520)) : this.playDoorAnimation(agent?.roleId, 520);
        return Promise.all([door, tween]).then(() => undefined);
      }
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height)),
      backgroundColor: "#bfe7ff",
      pixelArt: true,
      roundPixels: true,
      scene: CosSWorldScene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER
      },
      render: {
        antialias: false
      }
    });

    const badge = document.createElement("div");
    badge.className = "world-engine-badge";
    badge.textContent = "Phaser 3 World · 占位精灵";
    container.appendChild(badge);

    return {
      ready: sceneReady,
      updateWorld(nextWorld, options = {}) {
        const scene = game.scene.getScene("CosSWorldScene");
        if (scene) {
          const previousMapKey = `${scene.map.key}:${scene.map.width}:${scene.map.height}:${scene.map.tileSize}`;
          const previousViewMode = scene.viewMode || "";
          scene.worldState = nextWorld;
          scene.map = normalizeMap(nextWorld?.map);
          if (!scene.cameras?.main || !scene.sys?.isActive?.()) return;
          const nextMapKey = `${scene.map.key}:${scene.map.width}:${scene.map.height}:${scene.map.tileSize}`;
          const nextInterior = String(nextWorld?.activeInteriorRoleId || "");
          scene.configureCamera(previousMapKey !== nextMapKey || previousViewMode !== (nextInterior ? `interior:${nextInterior}` : "exterior"));
          scene.selectedAgentId = options.selectedAgentId || scene.selectedAgentId;
          scene.drawWorld?.();
        }
      },
      setMapBadge(text) {
        badge.textContent = text;
      },
      moveAgent(agentId, target, options) {
        const scene = game.scene.getScene("CosSWorldScene");
        return scene?.moveAgent?.(agentId, target, options) || Promise.resolve();
      },
      playDoorAnimation(roleId, duration) {
        const scene = game.scene.getScene("CosSWorldScene");
        return scene?.playDoorAnimation?.(roleId, duration) || Promise.resolve();
      },
      getDebugState() {
        const scene = game.scene.getScene("CosSWorldScene");
        const camera = scene?.cameras?.main;
        return {
          sceneStatus: scene?.sys?.settings?.status,
          childCount: scene?.children?.length || 0,
          viewMode: scene?.viewMode || "",
          map: scene?.map || null,
          camera: camera ? {
            scrollX: camera.scrollX,
            scrollY: camera.scrollY,
            zoom: camera.zoom,
            width: camera.width,
            height: camera.height,
            bounds: camera.getBounds?.()
          } : null,
          agents: scene?.agentSprites?.size || 0,
          houses: scene?.houseSprites?.size || 0
        };
      },
      destroy() {
        game.destroy(true);
        container.replaceChildren();
      }
    };
  }

  function createCanvasFallbackWorldGame(container, world, callbacks = {}) {
    const map = normalizeMap(world?.map);
    const canvas = document.createElement("canvas");
    canvas.className = "world-canvas";
    canvas.setAttribute("aria-label", "CosS 2D 世界 Canvas");
    const badge = document.createElement("div");
    badge.className = "world-engine-badge";
    badge.textContent = "Canvas Fallback · 占位精灵";
    container.replaceChildren(canvas, badge);
    const ctx = canvas.getContext("2d");
    const state = {
      world,
      map,
      width: 1,
      height: 1,
      dpr: 1,
      camera: { x: 0, y: 0, zoom: clamp(Number(world?.camera?.zoom) || 0.5, 0.5, 2.5) },
      raf: 0,
      destroyed: false,
      selectedAgentId: callbacks.selectedAgentId || "",
      drag: null,
      cameraInitialized: false,
      interiorImages: new Map()
    };
    const centerCamera = () => {
      state.camera.x = state.map.focusX * state.map.tileSize - state.width / (2 * state.camera.zoom);
      state.camera.y = 0;
      state.cameraInitialized = true;
    };
    const clampCamera = () => {
      const tile = state.map.tileSize;
      const minX = state.map.cameraSafeInsetX * tile;
      const maxX = (state.map.width - state.map.cameraSafeInsetX) * tile - state.width / state.camera.zoom;
      const maxY = (state.map.height - state.map.cameraSafeInsetBottom) * tile - state.height / state.camera.zoom;
      state.camera.x = clamp(state.camera.x, minX, Math.max(minX, maxX));
      state.camera.y = clamp(state.camera.y, 0, Math.max(0, maxY));
    };
    const getInteriorImages = (roleId) => {
      if (state.interiorImages.has(roleId)) return state.interiorImages.get(roleId);
      const role = window.CossWorldAssets?.role(roleId);
      const images = { room: new Image(), agent: new Image() };
      if (role) {
        images.room.src = role.interior;
        images.agent.src = role.idle[0];
      }
      state.interiorImages.set(roleId, images);
      return images;
    };
    const resize = () => {
      const rect = container.getBoundingClientRect();
      state.width = Math.max(1, Math.floor(rect.width));
      state.height = Math.max(1, Math.floor(rect.height));
      state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(state.width * state.dpr);
      canvas.height = Math.floor(state.height * state.dpr);
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
      if (!state.cameraInitialized) centerCamera();
      clampCamera();
    };
    const toWorld = (event) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: state.camera.x + (event.clientX - rect.left) / state.camera.zoom,
        y: state.camera.y + (event.clientY - rect.top) / state.camera.zoom
      };
    };
    const hitObject = (point) => (state.world?.objects || []).find((object) => {
      const x = Number(object.x) * state.map.tileSize;
      const y = Number(object.y) * state.map.tileSize;
      return point.x >= x && point.x <= x + Number(object.width || 4) * state.map.tileSize && point.y >= y && point.y <= y + Number(object.height || 3) * state.map.tileSize;
    });
    const hitAgent = (point) => [...(state.world?.agents || [])]
      .filter((agent) => agent.location !== "home" || agent.movement)
      .reverse().find((agent) => {
      const pos = getTilePosition(agent, state.map);
      return Math.abs(point.x - pos.x) < 24 && Math.abs(point.y - pos.y) < 42;
    });
    const renderFrame = () => {
      if (state.destroyed) return;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      ctx.fillStyle = "#bfe7ff";
      ctx.fillRect(0, 0, state.width, state.height);
      const interiorRoleId = String(state.world?.activeInteriorRoleId || "");
      if (interiorRoleId) {
        ctx.fillStyle = "#172033";
        ctx.fillRect(0, 0, state.width, state.height);
        const images = getInteriorImages(interiorRoleId);
        if (images.room.complete && images.room.naturalWidth) {
          const scale = Math.min(state.width / images.room.naturalWidth, state.height / images.room.naturalHeight);
          const roomWidth = images.room.naturalWidth * scale;
          const roomHeight = images.room.naturalHeight * scale;
          ctx.drawImage(images.room, (state.width - roomWidth) / 2, (state.height - roomHeight) / 2, roomWidth, roomHeight);
        }
        const resident = (state.world?.agents || []).find((agent) => agent.roleId === interiorRoleId);
        if (resident?.location === "home" && !resident.movement && images.agent.complete && images.agent.naturalWidth) {
          const agentHeight = clamp(state.height * 0.14, 76, 112);
          const agentWidth = agentHeight * images.agent.naturalWidth / images.agent.naturalHeight;
          ctx.drawImage(images.agent, state.width * 0.52 - agentWidth / 2, state.height * 0.73 - agentHeight / 2, agentWidth, agentHeight);
        }
        state.raf = requestAnimationFrame(renderFrame);
        return;
      }
      ctx.save();
      ctx.scale(state.camera.zoom, state.camera.zoom);
      ctx.translate(-state.camera.x, -state.camera.y);
      ctx.fillStyle = "#89d978";
      ctx.fillRect(0, 0, state.map.width * state.map.tileSize, state.map.height * state.map.tileSize);
      ctx.fillStyle = "rgba(255,255,255,.18)";
      for (let y = 0; y < state.map.height; y += 1) for (let x = 0; x < state.map.width; x += 1) if ((x + y) % 2 === 0) ctx.fillRect(x * state.map.tileSize, y * state.map.tileSize, state.map.tileSize, state.map.tileSize);
      (state.world?.objects || []).forEach((object, index) => {
        const x = Number(object.x) * state.map.tileSize;
        const y = Number(object.y) * state.map.tileSize;
        const w = Number(object.width || 4) * state.map.tileSize;
        const h = Number(object.height || 3) * state.map.tileSize;
        ctx.fillStyle = object.type === "plot" ? "rgba(255,255,255,.22)" : `#${OBJECT_COLORS[index % OBJECT_COLORS.length].toString(16).padStart(6, "0")}`;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = "#334155";
        ctx.font = "12px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(object.name || object.type || "建筑", x + w / 2, y + h / 2);
      });
      (state.world?.agents || []).filter((agent) => agent.location !== "home" || agent.movement).forEach((agent, index) => {
        const pos = getTilePosition(agent, state.map);
        ctx.fillStyle = `#${ROLE_COLORS[index % ROLE_COLORS.length].toString(16).padStart(6, "0")}`;
        ctx.fillRect(pos.x - 12, pos.y - 20, 24, 40);
        ctx.fillStyle = "#ffd7a8";
        ctx.fillRect(pos.x - 9, pos.y - 38, 18, 18);
        ctx.fillStyle = "#fff";
        ctx.fillRect(pos.x - 44, pos.y + 26, 88, 21);
        ctx.fillStyle = "#20304a";
        ctx.fillText(roleLabel(agent), pos.x, pos.y + 41);
      });
      ctx.restore();
      state.raf = requestAnimationFrame(renderFrame);
    };
    canvas.addEventListener("pointerdown", (event) => state.drag = { x: event.clientX, y: event.clientY, cameraX: state.camera.x, cameraY: state.camera.y, moved: false });
    canvas.addEventListener("pointermove", (event) => {
      if (state.world?.activeInteriorRoleId) return;
      if (!state.drag) return;
      const dx = event.clientX - state.drag.x;
      const dy = event.clientY - state.drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.drag.moved = true;
      state.camera.x = state.drag.cameraX - dx / state.camera.zoom;
      state.camera.y = state.drag.cameraY - dy / state.camera.zoom;
      clampCamera();
      callbacks.onCameraChange?.({ ...state.camera });
    });
    canvas.addEventListener("pointerup", (event) => {
      if (state.world?.activeInteriorRoleId) {
        state.drag = null;
        return;
      }
      if (document.querySelector(".modal-backdrop")) return;
      const drag = state.drag;
      state.drag = null;
      if (drag?.moved) return;
      const point = toWorld(event);
      const agent = hitAgent(point);
      if (agent) {
        state.selectedAgentId = agent.id;
        callbacks.onAgentClick?.(agent);
        return;
      }
      const object = hitObject(point);
      if (object) {
        callbacks.onObjectClick?.(object);
        return;
      }
      callbacks.onMapClick?.({ x: clamp(Math.round(point.x / state.map.tileSize - 0.5), 0, state.map.width - 1), y: clamp(Math.round(point.y / state.map.tileSize - 0.5), 0, state.map.height - 1) });
    });
    canvas.addEventListener("wheel", (event) => {
      if (state.world?.activeInteriorRoleId) return;
      event.preventDefault();
      state.camera.zoom = Math.round(clamp(state.camera.zoom + (event.deltaY > 0 ? -0.1 : 0.1), 0.5, 2.5) * 10) / 10;
      clampCamera();
      callbacks.onCameraChange?.({ ...state.camera });
    }, { passive: false });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    state.raf = requestAnimationFrame(renderFrame);
    return {
      updateWorld(nextWorld, options = {}) {
        const previousMapKey = `${state.map.key}:${state.map.width}:${state.map.height}:${state.map.tileSize}`;
        state.world = nextWorld;
        state.map = normalizeMap(nextWorld?.map);
        const nextMapKey = `${state.map.key}:${state.map.width}:${state.map.height}:${state.map.tileSize}`;
        if (previousMapKey !== nextMapKey) centerCamera();
        clampCamera();
        state.selectedAgentId = options.selectedAgentId || state.selectedAgentId;
      },
      setMapBadge(text) {
        badge.textContent = text;
      },
      moveAgent(agentId, target, options = {}) {
        const duration = Number(options.duration) || 1350;
        const agent = (state.world?.agents || []).find((candidate) => candidate.id === agentId);
        if (agent) {
          agent.x = Number(target?.x) || agent.x;
          agent.y = Number(target?.y) || agent.y;
        }
        return new Promise((resolve) => window.setTimeout(resolve, duration));
      },
      destroy() {
        state.destroyed = true;
        cancelAnimationFrame(state.raf);
        resizeObserver.disconnect();
        container.replaceChildren();
      }
    };
  }

  function mergeTiledWorldDocument(world, tiledMap) {
    if (!world || !tiledMap) {
      return world;
    }
    return {
      ...world,
        map: {
        ...(world.map || {}),
        key: tiledMap.key,
        width: tiledMap.width,
        height: tiledMap.height,
        tileSize: tiledMap.tileSize,
        tileLayers: tiledMap.tileLayers
      },
      objects: tiledMap.objects.length ? tiledMap.objects : world.objects
    };
  }

  window.CossWorldEngine = {
    mountWorldGame(container, world, callbacks) {
      const instance = window.Phaser?.Game
        ? createPhaserWorldGame(container, world, callbacks)
        : createCanvasFallbackWorldGame(container, world, callbacks);
      const tiledUrl = world?.map?.tiledUrl || "";
      if (!tiledUrl || !window.CossTiledMapLoader?.load) {
        return instance;
      }
      instance.ready = window.CossTiledMapLoader.load(tiledUrl)
        .then((tiledMap) => {
          const nextWorld = mergeTiledWorldDocument(world, tiledMap);
          instance.updateWorld?.(nextWorld, { selectedAgentId: callbacks?.selectedAgentId || "" });
          instance.setMapBadge?.(`Tiled JSON · ${tiledMap.width}×${tiledMap.height}`);
          callbacks?.onMapLoaded?.(tiledMap);
          return nextWorld;
        })
        .catch((error) => {
          console.warn("Failed to load Tiled world map; using procedural fallback.", error);
          instance.setMapBadge?.("Procedural fallback");
          callbacks?.onMapLoadError?.(error);
          return world;
        });
      return instance;
    }
  };
})();
