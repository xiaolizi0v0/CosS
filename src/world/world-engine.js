(() => {
  const DEFAULT_MAP = { key: "default-meadow", width: 64, height: 64, tileSize: 32 };
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
      tileSize: Number.isFinite(Number(map.tileSize)) ? Number(map.tileSize) : DEFAULT_MAP.tileSize
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

  function createPhaserWorldGame(container, world, callbacks = {}) {
    const Phaser = window.Phaser;
    const size = getWorldSize(world);
    const rect = container.getBoundingClientRect();
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
      }

      create() {
        this.cameras.main.setBackgroundColor("#bfe7ff");
        this.cameras.main.setBounds(-64, -64, size.width + 128, size.height + 128);
        this.cameras.main.setScroll(Number(this.worldState?.camera?.x) || 0, Number(this.worldState?.camera?.y) || 0);
        this.cameras.main.setZoom(clamp(Number(this.worldState?.camera?.zoom) || 1, 0.5, 2.5));
        this.createPlaceholderTextures();
        this.drawWorld();
        this.bindCameraControls();
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
        grass.destroy();
      }

      drawWorld() {
        this.children.removeAll();
        this.drawTiles();
        this.drawMeadowObjects();
        (this.worldState?.objects || []).forEach((object, index) => this.drawObject(object, index));
        (this.worldState?.agents || []).forEach((agent, index) => this.drawAgent(agent, index));
        this.drawHud();
      }

      drawTiles() {
        const graphics = this.add.graphics();
        graphics.fillStyle(0x89d978, 1).fillRect(0, 0, size.width, size.height);
        for (let y = 0; y < this.map.height; y += 1) {
          for (let x = 0; x < this.map.width; x += 1) {
            this.add.image(x * this.map.tileSize, y * this.map.tileSize, (x + y) % 2 === 0 ? "coss-grass-a" : "coss-grass-b").setOrigin(0);
          }
        }
        const grid = this.add.graphics();
        grid.lineStyle(1, 0x2b5a2c, 0.12);
        for (let x = 0; x <= this.map.width; x += 4) {
          grid.lineBetween(x * this.map.tileSize, 0, x * this.map.tileSize, size.height);
        }
        for (let y = 0; y <= this.map.height; y += 4) {
          grid.lineBetween(0, y * this.map.tileSize, size.width, y * this.map.tileSize);
        }
      }

      drawMeadowObjects() {
        const tile = this.map.tileSize;
        const g = this.add.graphics();
        g.fillStyle(0xd7b178, 0.9).fillEllipse(28 * tile, 34 * tile, 46 * tile, 5.2 * tile);
        g.fillStyle(0x55b9ff, 0.95).fillEllipse(53 * tile, 49 * tile, 12 * tile, 6 * tile);
        g.fillStyle(0xffffff, 0.35);
        for (let i = 0; i < 3; i += 1) {
          g.fillRect((49 + i * 3) * tile, (48 + i * 0.4) * tile, 2 * tile, 5);
        }
      }

      drawObject(object, index) {
        const tile = this.map.tileSize;
        const x = Number(object.x) * tile;
        const y = Number(object.y) * tile;
        const width = Number(object.width || 4) * tile;
        const height = Number(object.height || 3) * tile;
        const group = this.add.container(x, y);
        const g = this.add.graphics();
        group.add(g);

        if (object.type === "board") {
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
        const color = ROLE_COLORS[index % ROLE_COLORS.length];
        const selected = this.selectedAgentId === agent.id;
        const status = agent.status || "idle";
        const c = this.add.container(pos.x, pos.y);
        const g = this.add.graphics();
        c.add(g);
        g.fillStyle(0x0f172a, 0.18).fillEllipse(0, 20, 34, 12);
        if (selected) {
          g.lineStyle(3, 0xfacc15, 1).strokeEllipse(0, 10, 48, 60);
        }
        g.fillStyle(0xffd7a8, 1).fillRect(-9, -30, 18, 18);
        g.fillStyle(color, 1).fillRect(-12, -12, 24, 34);
        g.fillStyle(0x000000, 0.2).fillRect(-12, 10, 24, 12);
        g.fillStyle(0x172033, 1).fillRect(-5, -24, 3, 3).fillRect(5, -24, 3, 3);
        g.fillStyle(0xffd7a8, 1).fillRect(-20, -6, 8, 24).fillRect(12, -6, 8, 24);
        g.fillStyle(STATUS_COLORS[status] || STATUS_COLORS.idle, 1).fillRoundedRect(-14, -58, 28, 20, 8);
        g.lineStyle(2, 0x0f172a, 0.18).strokeRoundedRect(-14, -58, 28, 20, 8);
        this.add.text(pos.x, pos.y - 48, STATUS_BUBBLES[status] || STATUS_BUBBLES.idle, { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "13px", fontStyle: "bold", color: status === "failed" || status === "blocked" ? "#b91c1c" : "#334155" }).setOrigin(0.5);
        this.add.text(pos.x, pos.y + 40, roleLabel(agent), { fontFamily: "Microsoft YaHei, sans-serif", fontSize: "12px", color: "#20304a", backgroundColor: "rgba(255,255,255,0.9)", padding: { x: 7, y: 4 } }).setOrigin(0.5);
        const zone = this.add.zone(pos.x, pos.y - 4, 64, 84).setInteractive({ useHandCursor: true });
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
        this.agentSprites.set(agent.id, c);
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
          if (!pointer.leftButtonDown()) {
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
          if (!this.drag || !pointer.leftButtonDown()) {
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
      updateWorld(nextWorld, options = {}) {
        const scene = game.scene.getScene("CosSWorldScene");
        if (scene) {
          scene.worldState = nextWorld;
          scene.map = normalizeMap(nextWorld?.map);
          scene.selectedAgentId = options.selectedAgentId || scene.selectedAgentId;
          scene.drawWorld?.();
        }
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
    const state = { world, map, width: 1, height: 1, dpr: 1, camera: { x: 0, y: 0, zoom: 1 }, raf: 0, destroyed: false, selectedAgentId: callbacks.selectedAgentId || "", drag: null };
    const resize = () => {
      const rect = container.getBoundingClientRect();
      state.width = Math.max(1, Math.floor(rect.width));
      state.height = Math.max(1, Math.floor(rect.height));
      state.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      canvas.width = Math.floor(state.width * state.dpr);
      canvas.height = Math.floor(state.height * state.dpr);
      canvas.style.width = `${state.width}px`;
      canvas.style.height = `${state.height}px`;
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
    const hitAgent = (point) => [...(state.world?.agents || [])].reverse().find((agent) => {
      const pos = getTilePosition(agent, state.map);
      return Math.abs(point.x - pos.x) < 24 && Math.abs(point.y - pos.y) < 42;
    });
    const renderFrame = () => {
      if (state.destroyed) return;
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      ctx.fillStyle = "#bfe7ff";
      ctx.fillRect(0, 0, state.width, state.height);
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
      (state.world?.agents || []).forEach((agent, index) => {
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
      if (!state.drag) return;
      const dx = event.clientX - state.drag.x;
      const dy = event.clientY - state.drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.drag.moved = true;
      state.camera.x = state.drag.cameraX - dx / state.camera.zoom;
      state.camera.y = state.drag.cameraY - dy / state.camera.zoom;
      callbacks.onCameraChange?.({ ...state.camera });
    });
    canvas.addEventListener("pointerup", (event) => {
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
      event.preventDefault();
      state.camera.zoom = Math.round(clamp(state.camera.zoom + (event.deltaY > 0 ? -0.1 : 0.1), 0.5, 2.5) * 10) / 10;
      callbacks.onCameraChange?.({ ...state.camera });
    }, { passive: false });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    state.raf = requestAnimationFrame(renderFrame);
    return {
      updateWorld(nextWorld, options = {}) {
        state.world = nextWorld;
        state.map = normalizeMap(nextWorld?.map);
        state.selectedAgentId = options.selectedAgentId || state.selectedAgentId;
      },
      destroy() {
        state.destroyed = true;
        cancelAnimationFrame(state.raf);
        resizeObserver.disconnect();
        container.replaceChildren();
      }
    };
  }

  window.CossWorldEngine = {
    mountWorldGame(container, world, callbacks) {
      if (window.Phaser?.Game) {
        return createPhaserWorldGame(container, world, callbacks);
      }
      return createCanvasFallbackWorldGame(container, world, callbacks);
    }
  };
})();
