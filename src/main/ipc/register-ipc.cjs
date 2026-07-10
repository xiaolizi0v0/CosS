function registerIpcHandlers(ipcMain, handlers = {}) {
  Object.entries(handlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, handler);
  });
  return handlers;
}

module.exports = { registerIpcHandlers };
