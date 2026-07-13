(function exposeWorldGenerator(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CossWorldGenerator = api;
  }
})(typeof window !== "undefined" ? window : globalThis, function createWorldGenerator() {
  const GENERATION_VERSION = "procedural-v5";
  const DEFAULT_MAP = Object.freeze({
    key: "default-meadow",
    width: 88,
    height: 64,
    tileSize: 80,
    horizonRows: 4,
    cameraSafeInsetX: 14,
    cameraSafeInsetBottom: 14
  });
  const DEFAULT_ROLES = Object.freeze([
    { id: "product-manager", name: "产品经理" },
    { id: "tech-lead", name: "技术负责人" },
    { id: "frontend-engineer", name: "前端工程师" },
    { id: "backend-engineer", name: "后端工程师" },
    { id: "qa-engineer", name: "测试工程师" },
    { id: "ai-agent-engineer", name: "AI/Agent 工程师" },
    { id: "devops-engineer", name: "DevOps 工程师" },
    { id: "technical-writer", name: "技术文档工程师" },
    { id: "security-engineer", name: "安全工程师" }
  ]);
  const DECORATION_TYPES = Object.freeze([
    { assetKey: "tree", width: 1.8, height: 2.25, weight: 18 },
    { assetKey: "treeSmall", width: 1.45, height: 1.85, weight: 16 },
    { assetKey: "oak", width: 2, height: 2.4, weight: 12 },
    { assetKey: "pine", width: 1.5, height: 2.2, weight: 9 },
    { assetKey: "bush", width: 1.15, height: 0.9, weight: 20 },
    { assetKey: "flowerBox", width: 1.35, height: 0.72, weight: 15 },
    { assetKey: "lamp", width: 0.7, height: 1.65, weight: 5 },
    { assetKey: "bench", width: 1.55, height: 0.8, weight: 5 }
  ]);
  const HORIZON_TREE_TYPES = Object.freeze([
    { assetKey: "treeSmall", width: 1.45, height: 1.85, weight: 28 },
    { assetKey: "tree", width: 1.75, height: 2.18, weight: 26 },
    { assetKey: "oak", width: 1.9, height: 2.3, weight: 22 },
    { assetKey: "pine", width: 1.35, height: 2.05, weight: 10 }
  ]);

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || "coss-world");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function createRandom(seed) {
    let state = hashString(seed) || 0x6d2b79f5;
    return function random() {
      state += 0x6d2b79f5;
      let result = state;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function normalizeRoles(roles) {
    const source = Array.isArray(roles) && roles.length ? roles : DEFAULT_ROLES;
    return source.slice(0, 9).map((role, index) => ({
      id: String(role?.id || DEFAULT_ROLES[index]?.id || `resident-${index + 1}`),
      name: String(role?.name || DEFAULT_ROLES[index]?.name || `居民 ${index + 1}`)
    }));
  }

  function createHomeSlots(focusX) {
    const houseWidth = 6;
    const rows = [
      { count: 3, y: 1.2, spacing: 9 },
      { count: 2, y: 7.6, spacing: 36 },
      { count: 4, y: 17, spacing: 9 }
    ];
    return rows.flatMap((row) => {
      const firstCenter = focusX - ((row.count - 1) * row.spacing) / 2;
      return Array.from({ length: row.count }, (_, index) => ({
        x: firstCenter + index * row.spacing - houseWidth / 2,
        y: row.y,
        width: houseWidth,
        height: 4
      }));
    });
  }

  function createRoadLayer(width, height, seed, houses, plaza) {
    const data = new Array(width * height).fill(0);
    const seedHash = hashString(seed);
    const setRoad = (x, y) => {
      const tileX = Math.round(x);
      const tileY = Math.round(y);
      if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) return;
      const variant = 1 + (hashString(`${seedHash}:${tileX}:${tileY}`) % 3);
      data[tileY * width + tileX] = variant;
    };
    const paint = (x, y, radius = 0) => {
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          setRoad(x + offsetX, y + offsetY);
        }
      }
    };
    const line = (from, to, radius = 0) => {
      let x = Math.round(from.x);
      let y = Math.round(from.y);
      const endX = Math.round(to.x);
      const endY = Math.round(to.y);
      paint(x, y, radius);
      while (x !== endX || y !== endY) {
        if (x !== endX) x += Math.sign(endX - x);
        else if (y !== endY) y += Math.sign(endY - y);
        paint(x, y, radius);
      }
    };
    const route = (from, to, horizontalFirst) => {
      const corner = horizontalFirst
        ? { x: to.x, y: from.y }
        : { x: from.x, y: to.y };
      line(from, corner);
      line(corner, to);
    };

    for (let y = plaza.top; y <= plaza.bottom; y += 1) {
      for (let x = plaza.left; x <= plaza.right; x += 1) {
        setRoad(x, y);
      }
    }
    line({ x: plaza.left - 9, y: plaza.centerY }, { x: plaza.right + 9, y: plaza.centerY }, 1);
    line({ x: plaza.centerX, y: 4 }, { x: plaza.centerX, y: plaza.bottom + 10 }, 1);

    houses.forEach((house, index) => {
      const door = {
        x: Math.round(house.x + house.width / 2),
        y: Math.round(house.y + house.height)
      };
      let target;
      if (door.y <= plaza.top) {
        target = { x: clamp(door.x, plaza.left, plaza.right), y: plaza.top };
      } else if (door.y >= plaza.bottom) {
        target = { x: clamp(door.x, plaza.left, plaza.right), y: plaza.bottom };
      } else if (door.x < plaza.left) {
        target = { x: plaza.left, y: clamp(door.y, plaza.top, plaza.bottom) };
      } else {
        target = { x: plaza.right, y: clamp(door.y, plaza.top, plaza.bottom) };
      }
      route(door, target, index % 2 === 0);
    });

    return {
      id: 1,
      name: "Stone Paths",
      type: "tilelayer",
      width,
      height,
      visible: true,
      opacity: 1,
      data
    };
  }

  function createMeadowLayer(width, height, horizonRows, seed) {
    const data = new Array(width * height).fill(0);
    const seedHash = hashString(`${seed}:flower-meadow`);
    for (let y = horizonRows; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const variant = hashString(`${seedHash}:${x}:${y}`) % 20;
        data[y * width + x] = variant === 0 ? 1 : (variant <= 2 ? 2 : 0);
      }
    }
    return {
      id: 0,
      name: "Flower Meadow",
      type: "tilelayer",
      width,
      height,
      visible: true,
      opacity: 1,
      data
    };
  }

  function intersects(a, b, padding = 0) {
    return a.x < b.x + b.width + padding
      && a.x + a.width + padding > b.x
      && a.y < b.y + b.height + padding
      && a.y + a.height + padding > b.y;
  }

  function hasRoadUnder(rect, roadLayer) {
    const startX = Math.floor(rect.x);
    const endX = Math.ceil(rect.x + rect.width);
    const startY = Math.floor(rect.y);
    const endY = Math.ceil(rect.y + rect.height);
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        if (x >= 0 && y >= 0 && x < roadLayer.width && y < roadLayer.height && roadLayer.data[y * roadLayer.width + x]) {
          return true;
        }
      }
    }
    return false;
  }

  function weightedDecoration(random) {
    const total = DECORATION_TYPES.reduce((sum, item) => sum + item.weight, 0);
    let pick = random() * total;
    for (const item of DECORATION_TYPES) {
      pick -= item.weight;
      if (pick <= 0) return item;
    }
    return DECORATION_TYPES[0];
  }

  function weightedItem(random, items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let pick = random() * total;
    for (const item of items) {
      pick -= item.weight;
      if (pick <= 0) return item;
    }
    return items[0];
  }

  function assetObject(id, name, assetKey, x, y, width, height, action = "") {
    return {
      id,
      type: "landmark",
      name,
      x,
      y,
      width,
      height,
      ...(action ? { action } : {}),
      properties: [{ name: "assetKey", value: assetKey }]
    };
  }

  function createHorizonForest({ seed, map }) {
    const random = createRandom(`${seed}:horizon-forest`);
    const objects = [];
    const minX = Math.max(0, map.cameraSafeInsetX - 5);
    const maxX = Math.min(map.width, map.width - map.cameraSafeInsetX + 5);
    const rows = [
      { y: map.horizonRows - 1.03, size: 0.82, step: 0.72 },
      { y: map.horizonRows - 0.67, size: 1, step: 1.12 }
    ];

    rows.forEach((row, rowIndex) => {
      let x = minX - 1 + random() * 0.8 + rowIndex * 0.55;
      while (x < maxX) {
        const type = weightedItem(random, HORIZON_TREE_TYPES);
        const width = type.width * row.size;
        const height = type.height * row.size;
        const y = row.y - height * 0.08 + (random() - 0.5) * 0.24;
        const object = assetObject(
          `horizon-tree-${rowIndex + 1}-${objects.length + 1}`,
          "",
          type.assetKey,
          Math.round(x * 20) / 20,
          Math.round(y * 20) / 20,
          Math.round(width * 20) / 20,
          Math.round(height * 20) / 20
        );
        object.generationBand = "horizon-forest";
        object.horizonRow = rowIndex + 1;
        objects.push(object);
        x += Math.max(0.72, width * row.step) + random() * 0.24;
      }
    });
    return objects;
  }

  function createDecorations({ random, map, roadLayer, reserved, focusX }) {
    const objects = [];
    const occupied = [...reserved];
    const targetCount = 118;
    const minX = map.cameraSafeInsetX - 3;
    const maxX = map.width - map.cameraSafeInsetX + 3;
    const minY = map.horizonRows + 0.25;
    const maxY = map.height - map.cameraSafeInsetBottom + 3;

    for (let attempt = 0; attempt < targetCount * 10 && objects.length < targetCount; attempt += 1) {
      const type = weightedDecoration(random);
      const nearVillage = random() < 0.72;
      const xRange = nearVillage ? [focusX - 25, focusX + 25] : [minX, maxX];
      const yRange = nearVillage ? [minY, 31] : [minY, maxY];
      const candidate = {
        x: Math.round((xRange[0] + random() * (xRange[1] - xRange[0])) * 4) / 4,
        y: Math.round((yRange[0] + random() * (yRange[1] - yRange[0])) * 4) / 4,
        width: type.width,
        height: type.height
      };
      if (candidate.x < minX || candidate.x + candidate.width > maxX) continue;
      if (candidate.y < minY || candidate.y + candidate.height > maxY) continue;
      if (hasRoadUnder(candidate, roadLayer)) continue;
      if (occupied.some((rect) => intersects(candidate, rect, 0.45))) continue;
      occupied.push(candidate);
      objects.push(assetObject(
        `procedural-${type.assetKey}-${objects.length + 1}`,
        "",
        type.assetKey,
        candidate.x,
        candidate.y,
        candidate.width,
        candidate.height
      ));
    }
    return objects;
  }

  function generateWorldLayout(options = {}) {
    const seed = String(options.seed || "coss-default-world");
    const roles = normalizeRoles(options.roles);
    const map = {
      ...DEFAULT_MAP,
      generation: GENERATION_VERSION,
      seed,
      focusX: DEFAULT_MAP.width / 2,
      focusY: 10.5,
      tiledUrl: ""
    };
    const homeSlots = createHomeSlots(map.focusX);
    const houses = roles.map((role, index) => ({
      ...homeSlots[index],
      role
    }));
    const plaza = {
      left: Math.round(map.focusX - 5),
      right: Math.round(map.focusX + 5),
      top: 7,
      bottom: 13,
      centerX: Math.round(map.focusX),
      centerY: 10
    };
    const meadowLayer = createMeadowLayer(map.width, map.height, map.horizonRows, seed);
    const roadLayer = createRoadLayer(map.width, map.height, seed, houses, plaza);
    map.tileLayers = [meadowLayer, roadLayer];

    const homePositions = {};
    const houseObjects = houses.map((house, index) => {
      const roleId = house.role.id;
      homePositions[roleId] = {
        x: house.x + house.width / 2 - 0.5,
        y: house.y + house.height - 0.5
      };
      return {
        id: `home-${roleId}`,
        type: "role-house",
        name: `${house.role.name}之家`,
        roleId,
        action: "enter-world-home",
        x: house.x,
        y: house.y,
        width: house.width,
        height: house.height,
        properties: [
          { name: "roleId", value: roleId },
          { name: "action", value: "enter-world-home" }
        ],
        generationIndex: index
      };
    });

    const landmarks = [
      assetObject("announcement-board", "公告栏", "noticeBoard", map.focusX - 13.5, 7.2, 5, 3, "publish-world-task"),
      assetObject("world-fountain", "中央喷泉", "fountain", map.focusX - 3, 8, 6, 5),
      assetObject("fruit-market", "果蔬集市", "fruitStand", map.focusX + 5, 13, 4.2, 3.1),
      assetObject("chat-square", "世界群聊", "chalkboard", map.focusX + 7.5, 8.2, 2.35, 2.35, "open-world-chat"),
      assetObject("village-bicycle", "", "bicycle", map.focusX + 7, 20.2, 2.1, 1.35),
      assetObject("village-dog", "", "dog", map.focusX - 12.5, 13.1, 1.1, 1.15),
      assetObject("village-cat", "", "cat", map.focusX + 13.1, 12.8, 1.05, 1.05),
      assetObject("village-mailbox", "", "mailbox", map.focusX - 6.8, 5.15, 0.9, 1.15),
      assetObject("village-bench-left", "", "bench", map.focusX - 13, 11.4, 1.8, 0.9),
      assetObject("village-bench-right", "", "bench", map.focusX + 11.2, 17.5, 1.8, 0.9),
      assetObject("village-lamp-left", "", "lampTall", map.focusX - 6, 11.4, 0.75, 1.8),
      assetObject("village-lamp-right", "", "lampTall", map.focusX + 5.1, 11.4, 0.75, 1.8)
    ];
    const horizonForest = createHorizonForest({ seed, map });
    const reserved = [...houseObjects, ...landmarks, ...horizonForest].map((object) => ({
      x: Number(object.x),
      y: Number(object.y),
      width: Number(object.width),
      height: Number(object.height)
    }));
    const decorations = createDecorations({
      random: createRandom(seed),
      map,
      roadLayer,
      reserved,
      focusX: map.focusX
    });

    return {
      generation: GENERATION_VERSION,
      seed,
      map,
      objects: [...horizonForest, ...houseObjects, ...landmarks, ...decorations],
      homePositions
    };
  }

  return Object.freeze({
    version: GENERATION_VERSION,
    defaults: DEFAULT_MAP,
    hashString,
    generateWorldLayout
  });
});
