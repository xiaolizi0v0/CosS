(() => {
  function toNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getProperty(properties = [], name, fallback = undefined) {
    const property = Array.isArray(properties)
      ? properties.find((item) => item?.name === name)
      : null;
    return property ? property.value : fallback;
  }

  function flattenObjectLayers(layers = [], result = []) {
    (Array.isArray(layers) ? layers : []).forEach((layer) => {
      if (layer?.type === "objectgroup") {
        result.push(...(Array.isArray(layer.objects) ? layer.objects : []));
      }
      if (layer?.type === "group") {
        flattenObjectLayers(layer.layers, result);
      }
    });
    return result;
  }

  function normalizeWorldObject(object, map) {
    const type = object?.type || getProperty(object?.properties, "cossType", "building");
    const action = getProperty(object?.properties, "action", "");
    return {
      id: String(object?.name || object?.id || `tiled-object-${resultIndex++}`),
      type,
      name: String(object?.name || type),
      x: toNumber(object?.x) / map.tilewidth,
      y: toNumber(object?.y) / map.tileheight,
      width: Math.max(1, toNumber(object?.width, map.tilewidth * 4) / map.tilewidth),
      height: Math.max(1, toNumber(object?.height, map.tileheight * 3) / map.tileheight),
      action,
      properties: object?.properties || []
    };
  }

  let resultIndex = 0;

  function normalizeMapDocument(document = {}) {
    const tilewidth = Math.max(1, toNumber(document.tilewidth, 32));
    const tileheight = Math.max(1, toNumber(document.tileheight, tilewidth));
    const objects = flattenObjectLayers(document.layers)
      .map((object) => normalizeWorldObject(object, { tilewidth, tileheight }));
    resultIndex = 0;
    return {
      key: String(getProperty(document.properties, "cossMapKey", document.name || "default-meadow")),
      width: Math.max(1, toNumber(document.width, 64)),
      height: Math.max(1, toNumber(document.height, 64)),
      tileSize: tilewidth,
      tileLayers: (Array.isArray(document.layers) ? document.layers : [])
        .filter((layer) => layer?.type === "tilelayer")
        .map((layer) => ({
          name: String(layer.name || "Layer"),
          width: toNumber(layer.width, document.width),
          height: toNumber(layer.height, document.height),
          data: Array.isArray(layer.data) ? layer.data.map((value) => toNumber(value)) : []
        })),
      objects,
      document
    };
  }

  async function load(url) {
    if (!url) {
      return null;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Tiled map request failed: ${response.status}`);
    }
    return normalizeMapDocument(await response.json());
  }

  window.CossTiledMapLoader = Object.freeze({ load, normalizeMapDocument });
})();
