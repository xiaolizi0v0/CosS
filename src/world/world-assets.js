(function exposeWorldAssets(global) {
  const ROOT = "./world/imge/";

  const ROLE_ASSETS = Object.freeze({
    "product-manager": { folder: "ProductManager", file: "ProductManager" },
    "tech-lead": { folder: "TechnicalLead", file: "TechnicalLead" },
    "frontend-engineer": { folder: "Front-endEngineer", file: "Front-endEngineer" },
    "backend-engineer": { folder: "BackendEngineer", file: "BackendEngineer" },
    "qa-engineer": { folder: "TestEngineer", file: "TestEngineer" },
    "ai-agent-engineer": { folder: "AI-AgentEngineer", file: "AI-AgentEngineer" },
    "devops-engineer": { folder: "DevOpsEngineer", file: "DevOpsEngineer", doorFolder: "DevOpsEngineerHomeOpeDoor" },
    "technical-writer": { folder: "TechnicalDocumentationEngineer", file: "TechnicalDocumentationEngineer" },
    "security-engineer": { folder: "SecurityEngineer", file: "SecurityEngineer" }
  });

  const BASE_ASSETS = Object.freeze({
    skyBackground: "skyBG.png",
    plainGrass: "base/plain_grass_tile.png",
    grassPinkFlower: "base/grass_pink_flower.png",
    grassWhiteDaisy: "base/grass_white_daisy.png",
    grassStone1: "base/grass_stone_tile_1.png",
    grassStone2: "base/grass_stone_tile_2.png",
    grassStoneCorner: "base/grass_stone_tile_corner.png",
    stoneFlat1: "base/stone_tile_flat_1.png",
    stoneFlat2: "base/stone_tile_flat_2.png",
    stoneFlat3: "base/stone_tile_flat_3.png",
    stonePathCorner: "base/stone_path_corner.png",
    fountain: "base/fountain.png",
    noticeBoard: "base/notice_board.png",
    chalkboard: "base/menu_chalkboard.png",
    fruitStand: "base/fruit_vendor_stand.png",
    easel: "base/easel_painting.png",
    cat: "base/gray_cat.png",
    dog: "base/shiba_dog.png",
    bicycle: "base/city_bicycle.png",
    bench: "base/wood_bench_long.png",
    lamp: "base/street_lamp_single.png",
    lampTall: "base/tall_street_lamp.png",
    tree: "base/deciduous_tree_medium.png",
    treeSmall: "base/deciduous_tree_small.png",
    oak: "base/dark_green_oak_tree.png",
    pine: "base/pine_tree.png",
    bush: "base/thick_green_bush.png",
    flowerBox: "base/small_stone_flower_box.png",
    umbrellaTable: "base/outdoor_table_umbrella.png",
    bridge: "base/small_wood_bridge.png",
    mailbox: "base/red_mailbox.png"
  });

  function url(relativePath) {
    return ROOT + relativePath;
  }

  function role(roleId) {
    const asset = ROLE_ASSETS[roleId];
    if (!asset) return null;
    const path = (folder, file) => url(`${asset.folder}/${folder}/${file}.png`);
    return {
      portrait: url(`${asset.folder}/${asset.file}.png`),
      home: url(`${asset.folder}/${asset.file}Home.png`),
      interior: url(`${asset.folder}/HomeINT.png`),
      idle: [1, 2, 3, 4].map((frame) => path("Idle", frame)),
      working: [1, 2, 3, 4].map((frame) => path("Working", frame)),
      door: [1, 2, 3, 4].map((frame) => url(`${asset.folder}/${asset.doorFolder || `${asset.file}HomeOpenDoor`}/${frame}.png`)),
      run: {
        down: [1, 2, 3, 4].map((frame) => path("Down_run", frame)),
        side: [1, 2, 3, 4].map((frame) => path("side_run", frame)),
        up: [1, 2, 3, 4].map((frame) => path("Up_run", frame))
      }
    };
  }

  global.CossWorldAssets = Object.freeze({
    root: ROOT,
    roles: ROLE_ASSETS,
    base: BASE_ASSETS,
    role,
    baseUrl: (key) => BASE_ASSETS[key] ? url(BASE_ASSETS[key]) : "",
    cloudFrames: [1, 2, 3].map((frame) => url(`cloud/${frame}.png`))
  });
})(window);
