function createTerminalService({ sessions, create, dispose } = {}) {
  return {
    sessions,
    create,
    dispose,
    get(id) { return sessions?.get(id) || null; },
    has(id) { return Boolean(sessions?.has(id)); }
  };
}

module.exports = { createTerminalService };
