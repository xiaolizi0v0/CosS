(() => {
  const tr = (key, fallback, values = {}) => {
    if (typeof window.COSS_TRANSLATE === "function") return window.COSS_TRANSLATE(key, fallback, values);
    return fallback;
  };
  const localizedObjectName = (object, fallback = "建筑") => {
    const assetKey = getObjectProperty(object, "assetKey", "");
    if (assetKey === "noticeBoard" || object?.type === "board") return tr("world.map.noticeBoard", "公告栏");
    if (assetKey === "chalkboard" || object?.id === "chat-square") return tr("world.map.chatSquare", "世界群聊");
    if (object?.type === "plot") return tr("world.map.plot", "规划用地");
    if (object?.type === "role-house") return object.name?.replace(/-home$/, "") || tr("world.map.residentHome", "居民之家");
    return object?.name || tr("world.map.building", fallback);
  };
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
  const ROLE_ANIMATION_FRAME_RATES = Object.freeze({ idle: 3, working: 7, door: 8, run: 10 });
  const DEFAULT_INTERIOR_AGENT_POSITION = Object.freeze({ xRatio: 0.5, yRatio: 0.72 });
  const INTERIOR_AGENT_POSITIONS = Object.freeze({
    "product-manager": Object.freeze({ xRatio: 0.73, yRatio: 0.68 }),
    "tech-lead": Object.freeze({ xRatio: 0.37, yRatio: 0.70 }),
    "frontend-engineer": Object.freeze({ xRatio: 0.37, yRatio: 0.70 }),
    "backend-engineer": Object.freeze({ xRatio: 0.37, yRatio: 0.70 }),
    "qa-engineer": Object.freeze({ xRatio: 0.63, yRatio: 0.69 }),
    "ai-agent-engineer": Object.freeze({ xRatio: 0.50, yRatio: 0.72 }),
    "devops-engineer": Object.freeze({ xRatio: 0.50, yRatio: 0.72 }),
    "technical-writer": Object.freeze({ xRatio: 0.50, yRatio: 0.73 }),
    "security-engineer": Object.freeze({ xRatio: 0.50, yRatio: 0.73 })
  });

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getContainedRect(containerWidth, containerHeight, sourceWidth, sourceHeight) {
    const safeSourceWidth = Math.max(1, Number(sourceWidth) || containerWidth);
    const safeSourceHeight = Math.max(1, Number(sourceHeight) || containerHeight);
    const scale = Math.min(containerWidth / safeSourceWidth, containerHeight / safeSourceHeight);
    const width = safeSourceWidth * scale;
    const height = safeSourceHeight * scale;
    return {
      x: (containerWidth - width) / 2,
      y: (containerHeight - height) / 2,
      width,
      height
    };
  }

  function getInteriorAgentPosition(roleId, viewportWidth, viewportHeight, sourceWidth, sourceHeight) {
    const anchor = INTERIOR_AGENT_POSITIONS[roleId] || DEFAULT_INTERIOR_AGENT_POSITION;
    const room = getContainedRect(viewportWidth, viewportHeight, sourceWidth, sourceHeight);
    return {
      x: room.x + room.width * anchor.xRatio,
      y: room.y + room.height * anchor.yRatio,
      xRatio: anchor.xRatio,
      yRatio: anchor.yRatio,
      room
    };
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

  function addCanvasRoundedRectPath(ctx, x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
    ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
    ctx.arcTo(x, y + height, x, y, safeRadius);
    ctx.arcTo(x, y, x + width, y, safeRadius);
    ctx.closePath();
  }

  function drawCanvasHintLabel(ctx, x, y, label, alpha = 0.68) {
    ctx.save();
    ctx.font = "12px Microsoft YaHei, sans-serif";
    const width = Math.ceil(ctx.measureText(String(label || "")).width) + 18;
    const height = 23;
    addCanvasRoundedRectPath(ctx, x - width / 2, y - height / 2, width, height, 7);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(23,32,51,0.78)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(label || ""), x, y - 1);
    ctx.restore();
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
        this.cameraController = null;
        this.terrainRenderer = null;
        this.selectedAgentId = callbacks.selectedAgentId || "";
        this.lastInteractiveClickAt = 0;
        this.agentSprites = new Map();
        this.houseSprites = new Map();
        this.interiorAgentSprite = null;
        this.interiorAgentNameplate = null;
      }

      create() {
        this.cameras.main.setBackgroundColor("#bfe7ff");
        this.createPlaceholderTextures();
        this.createAssetAnimations();
        this.configureCamera(true);
        this.drawWorld();
        this.bindCameraControls();
        this.events.once("shutdown", () => this.cameraController?.destroy());
        this.game.canvas.dataset.worldReady = "true";
        resolveSceneReady?.();
        this.scale.on("resize", () => {
          this.configureCamera(Boolean(this.getInteriorRoleId()));
          this.drawWorld();
        });
      }

      update(_time, delta) {
        this.cameraController?.update(delta);
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
                frameRate: ROLE_ANIMATION_FRAME_RATES[kind] || ROLE_ANIMATION_FRAME_RATES.working,
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
                frameRate: ROLE_ANIMATION_FRAME_RATES.run,
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
          this.cameraController?.disable();
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
          camera.centerOn(this.map.focusX * tile, this.map.focusY * tile);
        } else if (Number.isFinite(Number(this.worldState?.camera?.x)) && Number.isFinite(Number(this.worldState?.camera?.y))) {
          camera.setScroll(Number(this.worldState.camera.x), Number(this.worldState.camera.y));
        }
        this.viewMode = "exterior";
        this.cameraController?.enableFromCamera();
      }

      fitRoleAgentSprite(sprite, targetHeight = 0) {
        const resolvedHeight = Number(targetHeight) > 0
          ? Number(targetHeight)
          : Number(sprite?.getData?.("cossAgentDisplayHeight"));
        if (!sprite?.active || !(resolvedHeight > 0)) return;
        if (Number(targetHeight) > 0) {
          sprite.setData("cossAgentDisplayHeight", resolvedHeight);
        }
        const source = sprite.texture?.getSourceImage?.();
        const sourceWidth = Math.max(1,
          Number(sprite.frame?.realWidth)
          || Number(sprite.frame?.width)
          || Number(source?.width)
          || resolvedHeight);
        const sourceHeight = Math.max(1,
          Number(sprite.frame?.realHeight)
          || Number(sprite.frame?.height)
          || Number(source?.height)
          || resolvedHeight);
        sprite.setDisplaySize(resolvedHeight * sourceWidth / sourceHeight, resolvedHeight);
      }

      bindRoleAgentSpriteSizing(sprite, targetHeight) {
        sprite.setData("cossAgentDisplayHeight", targetHeight);
        const refit = () => this.fitRoleAgentSprite(sprite);
        sprite.on("animationstart", refit);
        sprite.on("animationupdate", refit);
        this.fitRoleAgentSprite(sprite);
        return sprite;
      }

      createWorldHintLabel(x, y, label, options = {}) {
        const text = this.add.text(0, -1, label, {
          fontFamily: "Microsoft YaHei, sans-serif",
          fontSize: options.fontSize || "12px",
          color: "#f8fafc"
        }).setOrigin(0.5);
        const width = Math.ceil(text.width) + 18;
        const height = Math.ceil(text.height) + 8;
        const background = this.add.graphics();
        background.fillStyle(0x000000, 0.16)
          .fillRoundedRect(-width / 2, -height / 2 + 2, width, height, 7);
        background.fillStyle(0x172033, 0.72)
          .fillRoundedRect(-width / 2, -height / 2, width, height, 7);
        background.lineStyle(1, 0xffffff, 0.2)
          .strokeRoundedRect(-width / 2, -height / 2, width, height, 7);
        const alpha = options.alpha ?? 0.68;
        return this.add.container(x, y, [background, text])
          .setScrollFactor(options.scrollFactor ?? 0)
          .setDepth(options.depth || 21)
          .setAlpha(alpha)
          .setData("cossHintRestingAlpha", alpha);
      }

      setWorldHintHovered(hint, hovered) {
        if (!hint?.active) return;
        const restingAlpha = Number(hint.getData?.("cossHintRestingAlpha")) || 0.68;
        hint.setAlpha(hovered ? 1 : restingAlpha);
      }

      drawAgentStatusHint(graphics, status) {
        const color = STATUS_COLORS[status] || STATUS_COLORS.idle;
        graphics.fillStyle(0x0f172a, 0.1).fillRoundedRect(-15, -57, 30, 21, 9);
        graphics.fillStyle(color, 0.82).fillRoundedRect(-14, -59, 28, 20, 8);
        graphics.lineStyle(1, 0xffffff, 0.42).strokeRoundedRect(-14, -59, 28, 20, 8);
      }

      bindAgentInteraction(target, agent, options = {}) {
        const idleCursor = options.idleCursor || "default";
        const hoverTarget = options.hoverTarget;
        target.setInteractive({ useHandCursor: true });
        target.on("pointerdown", () => {
          this.selectedAgentId = agent.id;
        });
        target.on("pointerover", () => {
          this.game.canvas.style.cursor = "pointer";
          this.setWorldHintHovered(hoverTarget, true);
        });
        target.on("pointerout", () => {
          this.game.canvas.style.cursor = idleCursor;
          this.setWorldHintHovered(hoverTarget, false);
        });
        target.on("pointerupoutside", () => {
          this.game.canvas.style.cursor = idleCursor;
          this.setWorldHintHovered(hoverTarget, false);
        });
        target.on("pointerup", (pointer) => {
          const dragged = options.checkDrag === false ? false : this.wasDragging(pointer);
          if (dragged || document.querySelector(".modal-backdrop")) return;
          this.selectedAgentId = agent.id;
          this.lastInteractiveClickAt = performance.now();
          if (options.redrawOnSelect) this.drawWorld();
          this.callbacks.onAgentClick?.(agent);
          if (pointer.event?.detail >= 2) {
            this.callbacks.onAgentDoubleClick?.(agent);
          }
        });
        return target;
      }

      drawInterior(roleId) {
        const width = Math.max(1, this.scale.width);
        const height = Math.max(1, this.scale.height);
        const prefix = `coss-role-${slug(roleId)}`;
        const textureKey = `${prefix}-interior`;
        const backdrop = this.add.graphics().setScrollFactor(0).setDepth(-10);
        backdrop.fillStyle(0x000000, 1).fillRect(0, 0, width, height);
        let sourceWidth = width;
        let sourceHeight = height;

        if (this.textures.exists(textureKey)) {
          const source = this.textures.get(textureKey).getSourceImage();
          sourceWidth = Math.max(1, Number(source?.width) || width);
          sourceHeight = Math.max(1, Number(source?.height) || height);
          const room = getContainedRect(width, height, sourceWidth, sourceHeight);
          this.add.image(room.x + room.width / 2, room.y + room.height / 2, textureKey)
            .setScrollFactor(0)
            .setDepth(0)
            .setDisplaySize(room.width, room.height);
        } else {
          this.add.text(width / 2, height / 2, "房间场景加载失败，请稍后重试。", {
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
          const position = getInteriorAgentPosition(roleId, width, height, sourceWidth, sourceHeight);
          const agentX = position.x;
          const agentY = position.y;
          const sprite = this.add.sprite(agentX, agentY, `${prefix}-${kind}-1`)
            .setScrollFactor(0)
            .setDepth(20);
          sprite.setData("cossInteriorAnchorXRatio", position.xRatio);
          sprite.setData("cossInteriorAnchorYRatio", position.yRatio);
          this.bindRoleAgentSpriteSizing(sprite, size);
          if (this.anims.exists(animationKey)) sprite.play(animationKey);
          this.fitRoleAgentSprite(sprite);
          this.interiorAgentSprite = sprite;
          const hitZone = this.add.zone(
            sprite.x,
            sprite.y,
            Math.max(88, sprite.displayWidth + 24),
            Math.max(size + 24, sprite.displayHeight + 24)
          ).setScrollFactor(0).setDepth(22);
          const nameplate = this.createWorldHintLabel(
            agentX,
            agentY + size * 0.58,
            roleLabel(agent),
            { depth: 21, alpha: 0.68 }
          );
          this.interiorAgentNameplate = nameplate;
          this.bindAgentInteraction(hitZone, agent, {
            checkDrag: false,
            idleCursor: "default",
            hoverTarget: nameplate
          });
        }
      }

      drawWorld() {
        this.children.removeAll();
        this.agentSprites.clear();
        this.houseSprites.clear();
        this.interiorAgentSprite = null;
        this.interiorAgentNameplate = null;
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
        this.skySprite = this.add.image(0, 0, textureKey)
          .setOrigin(0, 1)
          .setScrollFactor(0)
          .setDepth(-100);
        this.layoutSkyBackground();
      }

      layoutSkyBackground() {
        const textureKey = "coss-base-skyBackground";
        if (!this.skySprite?.active || !this.textures.exists(textureKey)) return;
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
        this.skySprite
          .setPosition(fixedX, fixedBottomY)
          .setDisplaySize(displayWidth, displayHeight);
      }

      drawTiles() {
        this.terrainRenderer ||= window.CossWorldTerrainRenderer?.create?.(this);
        this.terrainRenderer?.draw(this.worldState);
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
        const depth = object.generationBand === "horizon-forest"
          ? (this.map.horizonRows + 0.6) * tile
          : y + height;
        const group = this.add.container(x, y).setDepth(depth);
        const g = this.add.graphics();
        group.add(g);
        let hintLabel = null;

        if (object.type === "role-house") {
          hintLabel = this.drawRoleHouse(group, object, width, height);
        } else if (object.type === "landmark" || getObjectProperty(object, "assetKey")) {
          hintLabel = this.drawAssetObject(group, object, width, height);
        } else if (object.type === "board") {
          g.fillStyle(0x70452b, 1).fillRect(width * 0.2, height * 0.34, 8, height * 0.7).fillRect(width * 0.74, height * 0.34, 8, height * 0.7);
          g.fillStyle(0xf0c36d, 1).fillRoundedRect(0, 0, width, height * 0.72, 8);
          g.lineStyle(4, 0x875500, 0.55).strokeRoundedRect(0, 0, width, height * 0.72, 8);
          this.add.text(x + width / 2, y + height * 0.32, tr("world.map.noticeBoard", "公告栏"), { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "15px", fontStyle: "bold", color: "#513b00" }).setOrigin(0.5);
        } else if (object.type === "plot") {
          g.fillStyle(0xffffff, 0.16).fillRoundedRect(0, 0, width, height, 16);
          g.lineStyle(3, 0xffffff, 0.72).strokeRoundedRect(0, 0, width, height, 16);
          g.lineStyle(2, 0x0f766e, 0.36).strokeRoundedRect(8, 8, width - 16, height - 16, 12);
          this.add.text(x + width / 2, y + height / 2, tr("world.map.plot", "规划用地"), { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "14px", fontStyle: "bold", color: "#0f766e" }).setOrigin(0.5);
        } else if (object.type === "house") {
          hintLabel = this.drawHouse(group, object, index, width, height);
        } else {
          hintLabel = this.drawBuilding(group, object, index, width, height);
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
        zone.on("pointerover", () => {
          this.game.canvas.style.cursor = "pointer";
          this.setWorldHintHovered(hintLabel, true);
        });
        zone.on("pointerout", () => {
          this.game.canvas.style.cursor = "grab";
          this.setWorldHintHovered(hintLabel, false);
        });
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
          const hint = this.createWorldHintLabel(width / 2, height + 12, localizedObjectName(object, "场景物品"), {
            scrollFactor: 1,
            alpha: 0.66
          });
          group.add(hint);
          return hint;
        }
        return null;
      }

      drawRoleHouse(group, object, width, height) {
        const roleId = String(object.roleId || getObjectProperty(object, "roleId", ""));
        const prefix = `coss-role-${slug(roleId)}`;
        const home = this.add.sprite(width / 2, height / 2, `${prefix}-home`)
          .setOrigin(0.5)
          .setDisplaySize(width, height);
        home.setData("cossHouseDisplayWidth", width);
        home.setData("cossHouseDisplayHeight", height);
        home.on("animationupdate", () => this.fitRoleHouseSprite(home));
        group.add(home);
        this.houseSprites.set(roleId, home);
        const hint = this.createWorldHintLabel(width / 2, height + 12, localizedObjectName(object, "居民之家"), {
          scrollFactor: 1,
          alpha: 0.68
        });
        group.add(hint);
        return hint;
      }

      fitRoleHouseSprite(house) {
        const width = Number(house?.getData?.("cossHouseDisplayWidth"));
        const height = Number(house?.getData?.("cossHouseDisplayHeight"));
        if (house?.active && width > 0 && height > 0) {
          house.setDisplaySize(width, height);
        }
      }

      drawBuilding(group, object, index, width, height) {
        const g = group.list[0];
        const color = OBJECT_COLORS[index % OBJECT_COLORS.length];
        g.fillStyle(0x0f172a, 0.16).fillRect(8, height - 6, width, 10);
        g.fillStyle(color, 1).fillRect(0, 26, width, height - 26);
        g.fillStyle(0xd8434e, 1).fillTriangle(-8, 30, width / 2, 0, width + 8, 30);
        g.fillStyle(0x172033, 0.72).fillRect(width / 2 - 9, height - 30, 18, 30);
        g.fillStyle(0xffffff, 0.8).fillRect(12, 42, 16, 16).fillRect(width - 28, 42, 16, 16);
        return this.createWorldHintLabel(group.x + width / 2, group.y + height + 18, localizedObjectName(object, "建筑"), { alpha: 0.66 });
      }

      drawHouse(group, object, index, width, height) {
        const g = group.list[0];
        const color = OBJECT_COLORS[(index + 2) % OBJECT_COLORS.length];
        g.fillStyle(0x0f172a, 0.16).fillRect(8, height - 6, width, 10);
        g.fillStyle(color, 1).fillRect(0, 24, width, height - 24);
        g.fillStyle(0xb91c1c, 1).fillTriangle(-8, 30, width / 2, 0, width + 8, 30);
        g.fillStyle(0x7a4f2a, 1).fillRect(width / 2 - 9, height - 28, 18, 28);
        g.fillStyle(0xffffff, 0.78).fillRect(12, 38, 14, 14).fillRect(width - 26, 38, 14, 14);
        return this.createWorldHintLabel(group.x + width / 2, group.y + height + 18, localizedObjectName(object, "小屋"), { alpha: 0.66 });
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
        const sprite = this.add.sprite(0, -8, initialTexture).setOrigin(0.5);
        this.bindRoleAgentSpriteSizing(sprite, 78);
        if (this.anims.exists(animation)) sprite.play(animation);
        this.fitRoleAgentSprite(sprite);
        c.add(sprite);
        this.drawAgentStatusHint(g, status);
        c.add(this.add.text(0, -49, STATUS_BUBBLES[status] || STATUS_BUBBLES.idle, {
          fontFamily: "Microsoft YaHei, sans-serif",
          fontSize: "12px",
          fontStyle: "bold",
          color: status === "failed" || status === "blocked" ? "#b91c1c" : "#334155"
        }).setOrigin(0.5).setAlpha(0.84));
        const nameplate = this.createWorldHintLabel(0, 42, roleLabel(agent), { scrollFactor: 1, alpha: 0.68 });
        c.add(nameplate);
        const zone = this.add.zone(0, -4, 78, 92);
        c.add(zone);
        this.bindAgentInteraction(zone, agent, { redrawOnSelect: true, idleCursor: "grab", hoverTarget: nameplate });
        this.agentSprites.set(agent.id, {
          container: c,
          sprite,
          roleId: agent.roleId,
          movementPhase: movement.phase || "",
          movementDirection: direction
        });
      }

      drawHud() {
        const hud = this.add.container(18, 18).setScrollFactor(0).setDepth(1000);
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 0.84).fillRoundedRect(0, 0, 292, 96, 14);
        g.lineStyle(1, 0xffffff, 0.62).strokeRoundedRect(0, 0, 292, 96, 14);
        hud.add(g);
        hud.add(this.add.text(16, 14, this.worldState?.name || tr("world.create.name.default", "我的 Agent 小镇"), { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "14px", fontStyle: "bold", color: "#172033" }));
        hud.add(this.add.text(16, 40, tr("world.map.stats", "地图 {{width}}×{{height}} · 缩放 {{zoom}}x", { width: this.map.width, height: this.map.height, zoom: this.cameras.main.zoom.toFixed(1) }), { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "12px", color: "#64748b" }));
        hud.add(this.add.text(16, 62, tr("world.map.controls", "拖拽移动视野 · 滚轮调整缩放 · 点击居民或建筑查看详情"), { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "12px", color: "#64748b" }));
      }

      bindCameraControls() {
        const createCameraController = window.CossWorldCameraController?.create;
        if (!createCameraController) throw new Error("World camera controller module is unavailable.");
        this.cameraController = createCameraController(this, {
          onChange: () => this.persistCamera(),
          onZoom: () => this.layoutSkyBackground()
        });
        this.persistCamera();
        this.input.on("pointerdown", (pointer) => {
          if (this.getInteriorRoleId() || !pointer.leftButtonDown()) {
            return;
          }
          this.cameraController.beginDrag(pointer);
          this.game.canvas.style.cursor = "grabbing";
        });
        this.input.on("pointermove", (pointer) => {
          if (this.getInteriorRoleId() || !pointer.leftButtonDown()) {
            return;
          }
          this.cameraController.moveDrag(pointer);
        });
        this.input.on("pointerup", (pointer) => {
          const moved = this.cameraController.endDrag(pointer);
          if (this.getInteriorRoleId()) {
            this.game.canvas.style.cursor = "default";
            return;
          }
          if (document.querySelector(".modal-backdrop")) {
            return;
          }
          this.game.canvas.style.cursor = "grab";
          if (moved || performance.now() - this.lastInteractiveClickAt < 80) {
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
          this.cameraController.zoomAt(pointer, deltaY);
        });
      }

      wasDragging(pointer) {
        return this.cameraController?.wasDragging(pointer)
          || Boolean(pointer.getDistance && pointer.getDistance() > 4);
      }

      persistCamera() {
        const camera = this.cameras.main;
        const nextCamera = { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom };
        if (this.worldState) this.worldState.camera = nextCamera;
        this.callbacks.onCameraChange?.(nextCamera);
      }

      playDoorAnimation(roleId, duration = 520) {
        const house = this.houseSprites.get(roleId);
        const prefix = `coss-role-${slug(roleId)}`;
        if (!house || !this.anims.exists(`${prefix}-door`)) {
          return Promise.resolve();
        }
        house.play(`${prefix}-door`);
        this.fitRoleHouseSprite(house);
        return new Promise((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (house.active) {
              house.stop();
              house.setTexture(`${prefix}-home`);
              this.fitRoleHouseSprite(house);
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
        item.movementPhase = options.phase || agent?.movement?.phase || "";
        item.movementDirection = direction;
        item.movementFromX = item.container.x / this.map.tileSize - 0.5;
        item.movementToX = Number(target?.x);
        if (item.sprite && this.anims.exists(`${prefix}-run-${direction}`)) {
          item.sprite.play(`${prefix}-run-${direction}`);
          // Every supplied side_run sheet faces left, so only rightward travel needs mirroring.
          item.sprite.setFlipX(direction === "side" && destination.x > item.container.x);
          this.fitRoleAgentSprite(item.sprite);
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
            onUpdate: () => item.container.active && item.container.setDepth(item.container.y + 50),
            onComplete: finish
          });
          window.setTimeout(finish, duration + 100);
        });
        if (!options.doorAtEnd) return tween;
        const enterHome = async () => {
          const doorDuration = Number(options.doorDuration) || 640;
          const doorAnimation = this.playDoorAnimation(agent?.roleId, doorDuration);
          await new Promise((resolve) => {
            let settled = false;
            const finish = () => {
              if (settled) return;
              settled = true;
              resolve();
            };
            this.time.delayedCall(doorDuration * 0.45, finish);
            window.setTimeout(finish, doorDuration * 0.45 + 80);
          });
          if (item.container.active) item.container.setVisible(false);
          if (options.commitHomeAtDoor && agent) {
            agent.x = Number(target?.x);
            agent.y = Number(target?.y);
            agent.location = "home";
            agent.movement = null;
            agent.animation = "working";
            agent.status = options.homeStatus || "planning";
          }
          await doorAnimation;
        };
        return tween.then(enterHome);
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
     badge.textContent = tr("world.map.badge", "Agent 小镇地图");
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
         badge.textContent = tr("world.map.badge", "Agent 小镇地图");
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
            bounds: camera.getBounds?.(),
            controller: scene?.cameraController?.getState?.() || null
          } : null,
          terrain: scene ? {
            plainGrassPattern: scene.textures?.exists?.("coss-plain-grass-pattern") || false,
            flowerMeadowPattern: scene.textures?.exists?.("coss-flower-meadow-pattern") || false,
            roadBoundaryEdges: ["top", "bottom", "left", "right"]
              .every((edge) => scene.textures?.exists?.(`coss-road-edge-${edge}`))
          } : null,
          agents: scene?.agentSprites?.size || 0,
          houses: scene?.houseSprites?.size || 0,
          agentDisplays: scene ? [...scene.agentSprites.entries()].map(([agentId, item]) => {
            const agent = (scene.worldState?.agents || []).find((candidate) => candidate.id === agentId);
            return {
              agentId,
              roleId: item.roleId,
              x: item.container.x / scene.map.tileSize - 0.5,
              y: item.container.y / scene.map.tileSize - 0.5,
              visible: item.container.visible,
              textureKey: item.sprite.texture?.key || "",
              flipX: Boolean(item.sprite.flipX),
              movementPhase: item.movementPhase || agent?.movement?.phase || "",
              movementDirection: item.movementDirection || agent?.movement?.direction || "",
              movementFromX: Number(item.movementFromX),
              movementToX: Number(item.movementToX),
              segmentIndex: Number(agent?.movement?.segmentIndex) || 0
            };
          }) : [],
          interiorAgentDisplay: scene?.interiorAgentSprite ? {
            displayWidth: scene.interiorAgentSprite.displayWidth,
            displayHeight: scene.interiorAgentSprite.displayHeight,
            sourceWidth: scene.interiorAgentSprite.frame?.realWidth || scene.interiorAgentSprite.frame?.width || 0,
            sourceHeight: scene.interiorAgentSprite.frame?.realHeight || scene.interiorAgentSprite.frame?.height || 0,
            targetHeight: Number(scene.interiorAgentSprite.getData?.("cossAgentDisplayHeight")) || 0,
            animationFrameRate: Number(scene.interiorAgentSprite.anims?.currentAnim?.frameRate) || 0,
            nameplateAlpha: Number(scene.interiorAgentNameplate?.alpha) || 0,
            roleId: String(scene.worldState?.activeInteriorRoleId || ""),
            xRatio: Number(scene.interiorAgentSprite.getData?.("cossInteriorAnchorXRatio")),
            yRatio: Number(scene.interiorAgentSprite.getData?.("cossInteriorAnchorYRatio")),
            viewportXRatio: scene.interiorAgentSprite.x / Math.max(1, scene.scale.width),
            viewportYRatio: scene.interiorAgentSprite.y / Math.max(1, scene.scale.height),
            textureKey: scene.interiorAgentSprite.texture?.key || ""
          } : null,
          houseDisplays: scene ? [...(scene.houseSprites || new Map()).entries()].map(([roleId, sprite]) => ({
            roleId,
            displayWidth: sprite.displayWidth,
            displayHeight: sprite.displayHeight,
            targetWidth: Number(sprite.getData?.("cossHouseDisplayWidth")) || 0,
            targetHeight: Number(sprite.getData?.("cossHouseDisplayHeight")) || 0,
            textureKey: sprite.texture?.key || ""
          })) : []
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
     canvas.setAttribute("aria-label", tr("world.home.aria", "CosS Agent 小镇互动地图"));
    const badge = document.createElement("div");
    badge.className = "world-engine-badge";
     badge.textContent = `${tr("world.map.badge", "Agent 小镇地图")} · ${tr("world.map.compatible", "兼容模式")}`;
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
      interiorImages: new Map(),
      hoveredAgentId: "",
      hoveredInteriorAgentId: ""
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
    const getCanvasInteriorPosition = (roleId, images = getInteriorImages(roleId)) => getInteriorAgentPosition(
      roleId,
      state.width,
      state.height,
      images.room.naturalWidth || state.width,
      images.room.naturalHeight || state.height
    );
    const hitInteriorAgent = (event) => {
      const roleId = String(state.world?.activeInteriorRoleId || "");
      const resident = (state.world?.agents || []).find((agent) => agent.roleId === roleId);
      if (!resident || resident.location !== "home" || resident.movement) return null;
      const rect = canvas.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const images = getInteriorImages(roleId);
      const agentHeight = clamp(state.height * 0.14, 76, 112);
      const agentWidth = images.agent.naturalWidth && images.agent.naturalHeight
        ? agentHeight * images.agent.naturalWidth / images.agent.naturalHeight
        : agentHeight;
      const position = getCanvasInteriorPosition(roleId, images);
      const centerX = position.x;
      const centerY = position.y;
      return pointerX >= centerX - Math.max(44, agentWidth / 2 + 12)
        && pointerX <= centerX + Math.max(44, agentWidth / 2 + 12)
        && pointerY >= centerY - agentHeight / 2 - 12
        && pointerY <= centerY + agentHeight / 2 + 12
        ? resident
        : null;
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
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, state.width, state.height);
        const images = getInteriorImages(interiorRoleId);
        const position = getCanvasInteriorPosition(interiorRoleId, images);
        if (images.room.complete && images.room.naturalWidth) {
          ctx.drawImage(images.room, position.room.x, position.room.y, position.room.width, position.room.height);
        }
        const resident = (state.world?.agents || []).find((agent) => agent.roleId === interiorRoleId);
          if (resident?.location === "home" && !resident.movement && images.agent.complete && images.agent.naturalWidth) {
            const agentHeight = clamp(state.height * 0.14, 76, 112);
            const agentWidth = agentHeight * images.agent.naturalWidth / images.agent.naturalHeight;
            const agentX = position.x;
            const agentY = position.y;
            ctx.drawImage(images.agent, agentX - agentWidth / 2, agentY - agentHeight / 2, agentWidth, agentHeight);
            drawCanvasHintLabel(
              ctx,
              agentX,
              agentY + agentHeight * 0.58,
              roleLabel(resident),
              state.hoveredInteriorAgentId === resident.id ? 1 : 0.68
            );
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
         ctx.fillText(localizedObjectName(object, object.type || "建筑"), x + w / 2, y + h / 2);
      });
      (state.world?.agents || []).filter((agent) => agent.location !== "home" || agent.movement).forEach((agent, index) => {
        const pos = getTilePosition(agent, state.map);
        ctx.fillStyle = `#${ROLE_COLORS[index % ROLE_COLORS.length].toString(16).padStart(6, "0")}`;
        ctx.fillRect(pos.x - 12, pos.y - 20, 24, 40);
        ctx.fillStyle = "#ffd7a8";
        ctx.fillRect(pos.x - 9, pos.y - 38, 18, 18);
        drawCanvasHintLabel(ctx, pos.x, pos.y + 41, roleLabel(agent), state.hoveredAgentId === agent.id ? 1 : 0.68);
      });
      ctx.restore();
      state.raf = requestAnimationFrame(renderFrame);
    };
    canvas.addEventListener("pointerdown", (event) => state.drag = { x: event.clientX, y: event.clientY, cameraX: state.camera.x, cameraY: state.camera.y, moved: false });
    canvas.addEventListener("pointermove", (event) => {
      if (state.world?.activeInteriorRoleId) {
        const resident = hitInteriorAgent(event);
        state.hoveredInteriorAgentId = resident?.id || "";
        state.hoveredAgentId = "";
        canvas.style.cursor = resident ? "pointer" : "default";
        return;
      }
      state.hoveredInteriorAgentId = "";
      if (!state.drag) {
        const point = toWorld(event);
        const agent = hitAgent(point);
        state.hoveredAgentId = agent?.id || "";
        canvas.style.cursor = agent || hitObject(point) ? "pointer" : "grab";
        return;
      }
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
        const resident = hitInteriorAgent(event);
        if (resident && !document.querySelector(".modal-backdrop")) {
          state.selectedAgentId = resident.id;
          callbacks.onAgentClick?.(resident);
        }
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
        if (!agent) return new Promise((resolve) => window.setTimeout(resolve, duration));
        const fromX = Number(agent.x) || 0;
        const fromY = Number(agent.y) || 0;
        const toX = Number.isFinite(Number(target?.x)) ? Number(target.x) : fromX;
        const toY = Number.isFinite(Number(target?.y)) ? Number(target.y) : fromY;
        return new Promise((resolve) => {
          const startedAt = performance.now();
          const step = (now) => {
            if (state.destroyed) {
              resolve();
              return;
            }
            const progress = Math.min(1, (now - startedAt) / duration);
            agent.x = fromX + (toX - fromX) * progress;
            agent.y = fromY + (toY - fromY) * progress;
            if (progress < 1) {
              requestAnimationFrame(step);
              return;
            }
            if (options.doorAtEnd) {
              if (options.commitHomeAtDoor) {
                agent.location = "home";
                agent.movement = null;
                agent.animation = "working";
                agent.status = options.homeStatus || "planning";
              }
              window.setTimeout(resolve, Number(options.doorDuration) || 640);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(step);
        });
      },
      playDoorAnimation(_roleId, duration = 640) {
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
          instance.setMapBadge?.(`自定义地图 · ${tiledMap.width}×${tiledMap.height}`);
          callbacks?.onMapLoaded?.(tiledMap);
          return nextWorld;
        })
        .catch((error) => {
          console.warn("Failed to load Tiled world map; using procedural fallback.", error);
          instance.setMapBadge?.("程序化地图");
          callbacks?.onMapLoadError?.(error);
          return world;
        });
      return instance;
    }
  };
})();
