const ARCHITECTURE_VERSION = "2026.07";
const ARCHITECTURE_LAYERS = Object.freeze({
  shared: "Cross-process contracts and versioned schemas",
  renderer: "State, domain services, windowing and views",
  main: "Electron runtime, IPC adapters and system services",
  mcp: "External orchestration protocol and Kernel operations"
});

module.exports = { ARCHITECTURE_VERSION, ARCHITECTURE_LAYERS };
