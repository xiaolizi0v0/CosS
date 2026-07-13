(function exposeWorldTerrainRenderer(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CossWorldTerrainRenderer = api;
})(typeof window !== "undefined" ? window : globalThis, function createWorldTerrainRendererApi() {
  function hasLayerTile(layer, x, y, fallbackWidth, fallbackHeight) {
    const width = Number(layer?.width || fallbackWidth);
    const height = Number(layer?.height || fallbackHeight);
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return Number(layer?.data?.[y * width + x] || 0) > 0;
  }

  function getRoadTileAppearance(layer, x, y, map) {
    const up = hasLayerTile(layer, x, y - 1, map.width, map.height);
    const down = hasLayerTile(layer, x, y + 1, map.width, map.height);
    const left = hasLayerTile(layer, x - 1, y, map.width, map.height);
    const right = hasLayerTile(layer, x + 1, y, map.width, map.height);
    const gid = Number(layer?.data?.[y * Number(layer.width || map.width) + x] || 1);
    return {
      baseKey: {
        1: "coss-base-stoneFlat1",
        2: "coss-base-stoneFlat2",
        3: "coss-base-stoneFlat3"
      }[gid] || "coss-base-stoneFlat1",
      edges: [
        ...(!up ? ["top"] : []),
        ...(!down ? ["bottom"] : []),
        ...(!left ? ["left"] : []),
        ...(!right ? ["right"] : [])
      ]
    };
  }

  class WorldTerrainRenderer {
    constructor(scene) {
      this.scene = scene;
    }

    ensurePlainGrassTexture() {
      const { map, textures } = this.scene;
      const textureKey = "coss-plain-grass-pattern";
      if (textures.exists(textureKey)) return textureKey;
      const sourceKey = "coss-base-plainGrass";
      if (!textures.exists(sourceKey)) return "";
      const source = textures.get(sourceKey).getSourceImage();
      const sourceWidth = Math.max(1, Number(source?.width) || map.tileSize);
      const sourceHeight = Math.max(1, Number(source?.height) || map.tileSize);
      const cropX = Math.min(9, Math.floor(sourceWidth * 0.1));
      const cropY = Math.min(9, Math.floor(sourceHeight * 0.1));
      const cropWidth = Math.max(1, sourceWidth - cropX * 2);
      const cropHeight = Math.max(1, sourceHeight - cropY * 2);
      const tile = map.tileSize;
      const patternSize = 16;
      const texture = textures.createCanvas(textureKey, patternSize * tile, patternSize * tile);
      const context = texture.getContext();
      context.imageSmoothingEnabled = false;
      context.fillStyle = "#78c95e";
      context.fillRect(0, 0, patternSize * tile, patternSize * tile);
      for (let y = 0; y < patternSize; y += 1) {
        for (let x = 0; x < patternSize; x += 1) {
          const quarterTurns = (x * 7 + y * 11 + x * y) % 4;
          context.save();
          context.translate(x * tile + tile / 2, y * tile + tile / 2);
          context.rotate(quarterTurns * Math.PI / 2);
          context.scale((x + y) % 3 === 0 ? -1 : 1, (x * 3 + y) % 4 === 0 ? -1 : 1);
          context.drawImage(
            source,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            -tile / 2 - 1,
            -tile / 2 - 1,
            tile + 2,
            tile + 2
          );
          context.restore();
        }
      }
      texture.refresh();
      return textureKey;
    }

    ensureFlowerOverlayTexture(sourceKey, overlayKey) {
      const { textures } = this.scene;
      if (textures.exists(overlayKey)) return overlayKey;
      if (!textures.exists(sourceKey)) return "";
      const source = textures.get(sourceKey).getSourceImage();
      const width = Math.max(1, Number(source?.width) || 1);
      const height = Math.max(1, Number(source?.height) || 1);
      const texture = textures.createCanvas(overlayKey, width, height);
      const context = texture.getContext();
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, width, height);
      context.drawImage(source, 0, 0, width, height);
      const image = context.getImageData(0, 0, width, height);
      const originalAlpha = new Uint8ClampedArray(width * height);
      const flowerPixels = new Uint8Array(width * height);
      for (let index = 0; index < width * height; index += 1) {
        const offset = index * 4;
        const red = image.data[offset];
        const green = image.data[offset + 1];
        const blue = image.data[offset + 2];
        originalAlpha[index] = image.data[offset + 3];
        const x = index % width;
        const y = Math.floor(index / width);
        const insideTile = x >= 9 && y >= 9 && x < width - 9 && y < height - 9;
        const whitePetal = red > 190 && green > 184 && blue > 158;
        const pinkPetal = red > 178 && blue > 112 && red > green * 1.12;
        const yellowCenter = red > 188 && green > 118 && blue < 105 && red > green * 1.1;
        if (insideTile && originalAlpha[index] && (whitePetal || pinkPetal || yellowCenter)) flowerPixels[index] = 1;
      }
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let keep = false;
          for (let offsetY = -2; offsetY <= 2 && !keep; offsetY += 1) {
            for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
              const sampleX = x + offsetX;
              const sampleY = y + offsetY;
              if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) continue;
              if (flowerPixels[sampleY * width + sampleX]) {
                keep = true;
                break;
              }
            }
          }
          image.data[(y * width + x) * 4 + 3] = keep ? originalAlpha[y * width + x] : 0;
        }
      }
      context.clearRect(0, 0, width, height);
      context.putImageData(image, 0, 0);
      texture.refresh();
      return overlayKey;
    }

    ensureFlowerMeadowTexture(layer) {
      const { map, textures } = this.scene;
      const textureKey = "coss-flower-meadow-pattern";
      if (textures.exists(textureKey)) return textureKey;
      const tile = map.tileSize;
      const layerWidth = Number(layer.width || map.width);
      const availableRows = Math.max(1, Number(layer.height || map.height) - map.horizonRows);
      const patternColumns = Math.max(1, Math.min(16, layerWidth));
      const patternRows = Math.max(1, Math.min(16, availableRows));
      const texture = textures.createCanvas(textureKey, patternColumns * tile, patternRows * tile);
      const context = texture.getContext();
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, patternColumns * tile, patternRows * tile);
      const pinkOverlayKey = this.ensureFlowerOverlayTexture("coss-base-grassPinkFlower", "coss-grass-pink-flower-overlay");
      const whiteOverlayKey = this.ensureFlowerOverlayTexture("coss-base-grassWhiteDaisy", "coss-grass-white-daisy-overlay");
      for (let y = 0; y < patternRows; y += 1) {
        for (let x = 0; x < patternColumns; x += 1) {
          const sourceY = map.horizonRows + y;
          const gid = Number(layer.data[sourceY * layerWidth + x] || 0);
          if (gid <= 0) continue;
          const sourceKey = gid === 1 ? pinkOverlayKey : whiteOverlayKey;
          if (!textures.exists(sourceKey)) continue;
          const source = textures.get(sourceKey).getSourceImage();
          context.save();
          context.translate(x * tile + tile / 2, y * tile + tile / 2);
          context.scale((x + y * 3) % 2 === 0 ? -1 : 1, (x * 5 + y) % 3 === 0 ? -1 : 1);
          context.drawImage(source, -tile / 2 - 2, -tile / 2 - 2, tile + 4, tile + 4);
          context.restore();
        }
      }
      texture.refresh();
      return textureKey;
    }

    ensureRoadEdgeTextures() {
      const { map, textures } = this.scene;
      const tile = map.tileSize;
      const definitions = [
        { edge: "top", key: "coss-road-edge-top", sourceKey: "coss-base-grassStone1", axis: "y", secondHalf: false },
        { edge: "bottom", key: "coss-road-edge-bottom", sourceKey: "coss-base-grassStone1", axis: "y", secondHalf: true },
        { edge: "left", key: "coss-road-edge-left", sourceKey: "coss-base-grassStone2", axis: "x", secondHalf: false },
        { edge: "right", key: "coss-road-edge-right", sourceKey: "coss-base-grassStone2", axis: "x", secondHalf: true }
      ];
      const result = {};
      definitions.forEach((definition) => {
        if (!textures.exists(definition.key) && textures.exists(definition.sourceKey)) {
          const source = textures.get(definition.sourceKey).getSourceImage();
          const sourceWidth = Math.max(1, Number(source?.width) || tile);
          const sourceHeight = Math.max(1, Number(source?.height) || tile);
          const texture = textures.createCanvas(definition.key, tile, tile);
          const context = texture.getContext();
          context.imageSmoothingEnabled = false;
          context.clearRect(0, 0, tile, tile);
          if (definition.axis === "y") {
            const sourceHalf = sourceHeight / 2;
            const sourceY = definition.secondHalf ? sourceHalf : 0;
            const destinationY = definition.secondHalf ? tile / 2 : 0;
            context.drawImage(source, 0, sourceY, sourceWidth, sourceHalf, 0, destinationY, tile, tile / 2);
          } else {
            const sourceHalf = sourceWidth / 2;
            const sourceX = definition.secondHalf ? sourceHalf : 0;
            const destinationX = definition.secondHalf ? tile / 2 : 0;
            context.drawImage(source, sourceX, 0, sourceHalf, sourceHeight, destinationX, 0, tile / 2, tile);
          }
          texture.refresh();
        }
        if (textures.exists(definition.key)) result[definition.edge] = definition.key;
      });
      return result;
    }

    draw(worldState) {
      const { scene } = this;
      const { map, textures } = scene;
      const tile = map.tileSize;
      const width = map.width * tile;
      const height = map.height * tile;
      const groundTop = map.horizonRows * tile;
      scene.add.graphics().setDepth(-1).fillStyle(0x86d66e, 1).fillRect(0, groundTop, width, height - groundTop);
      const layers = (worldState?.map?.tileLayers || []).filter((layer) => layer.data?.length);
      const flowerMeadowLayer = layers.find((layer) => /flower|meadow/i.test(layer.name || ""));
      const plainGrassTexture = this.ensurePlainGrassTexture();
      if (plainGrassTexture) {
        scene.add.tileSprite(0, groundTop, width, height - groundTop, plainGrassTexture).setOrigin(0).setDepth(0);
      } else if (textures.exists("coss-procedural-grass")) {
        scene.add.tileSprite(0, groundTop, width, height - groundTop, "coss-procedural-grass").setOrigin(0).setDepth(0);
      }
      if (flowerMeadowLayer) {
        scene.add.tileSprite(0, groundTop, width, height - groundTop, this.ensureFlowerMeadowTexture(flowerMeadowLayer))
          .setOrigin(0)
          .setDepth(0.2);
      }
      const drawLayer = (layer) => {
        const isPath = /path|road|stone|plaza/i.test(layer.name || "");
        if (/flower|meadow/i.test(layer.name || "")) return;
        const roadEdgeTextures = isPath ? this.ensureRoadEdgeTextures() : {};
        const addTileImage = (textureKey, x, y, depth) => {
          if (!textureKey || !textures.exists(textureKey)) return;
          scene.add.image(x * tile - 2, y * tile - 2, textureKey)
            .setOrigin(0)
            .setDisplaySize(tile + 4, tile + 4)
            .setDepth(depth);
        };
        for (let y = map.horizonRows; y < map.height; y += 1) {
          for (let x = 0; x < map.width; x += 1) {
            const gid = Number(layer.data[y * Number(layer.width || map.width) + x] || 0);
            if (gid <= 0) continue;
            if (!isPath) {
              addTileImage("coss-base-plainGrass", x, y, 0);
              continue;
            }
            const appearance = getRoadTileAppearance(layer, x, y, map);
            addTileImage(appearance.baseKey, x, y, 1);
            appearance.edges.forEach((edge) => addTileImage(roadEdgeTextures[edge], x, y, 1.1));
          }
        }
      };
      if (layers.length) {
        layers.forEach(drawLayer);
      } else if (!textures.exists("coss-procedural-grass")) {
        for (let y = map.horizonRows; y < map.height; y += 1) {
          for (let x = 0; x < map.width; x += 1) {
            if (textures.exists("coss-base-plainGrass")) {
              scene.add.image(x * tile - 2, y * tile - 2, "coss-base-plainGrass").setOrigin(0).setDisplaySize(tile + 4, tile + 4);
            }
          }
        }
      }
    }
  }

  return Object.freeze({
    WorldTerrainRenderer,
    getRoadTileAppearance,
    create: (scene) => new WorldTerrainRenderer(scene)
  });
});
