const path = require("path");

function createStorageService({ app, processEnv = process.env, dataFileName = "coss-workspace-state.json", sqliteFileName = "coss-workspace.sqlite" } = {}) {
  const getStorageDirectory = () => app.getPath("userData");
  return {
    getStorageDirectory,
    getDataFilePath: () => path.join(getStorageDirectory(), dataFileName),
    getSqliteFilePath: () => path.join(getStorageDirectory(), sqliteFileName),
    getBackupDirectory: () => path.join(getStorageDirectory(), "backups"),
    getDiagnosticsDirectory: () => path.join(getStorageDirectory(), "diagnostics"),
    getLogDirectory: () => processEnv.COSS_LOG_DIR || path.join(getStorageDirectory(), "logs"),
    getLogFilePath: (date = new Date()) => path.join(
      processEnv.COSS_LOG_DIR || path.join(getStorageDirectory(), "logs"),
      `coss-${date.toISOString().slice(0, 10)}.jsonl`
    )
  };
}

module.exports = { createStorageService };
