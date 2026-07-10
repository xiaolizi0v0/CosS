function createAgentRuntime({ status, launch, install } = {}) {
  return {
    status,
    launch,
    install,
    async ensure(provider) {
      const current = await status?.(provider);
      return current?.runnable ? current : install ? install(provider) : current;
    }
  };
}

module.exports = { createAgentRuntime };
