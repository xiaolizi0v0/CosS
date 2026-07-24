(function exposeProgramActionService(global) {
  function createProgramActionService({
    navigateBrowserWindow,
    createBrowserTab,
    closeBrowserTab,
    switchBrowserTab,
    toggleBrowserBookmark,
    openBrowserUrlInWindow,
    runBrowserCommand,
    refreshFileList,
    openFileInWindow,
    selectFileListPath,
    toggleFileListDir,
    pickFileForWindow,
    saveFileFromWindow,
    saveFileAsFromWindow,
    createFolderFromWindow,
    renameFileFromWindow,
    deleteFileFromWindow,
    confirmFileOperationFromModal
  } = {}) {
    function handle(action, target) {
      const windowId = target?.dataset?.windowId;
      if (action === "browser-go") return navigateBrowserWindow?.(windowId) ?? true;
      if (action === "browser-new-tab") return createBrowserTab?.(windowId) ?? true;
      if (action === "browser-close-tab") return closeBrowserTab?.(windowId, target.dataset.tabId || "") ?? true;
      if (action === "browser-switch-tab") return switchBrowserTab?.(windowId, target.dataset.tabId) ?? true;
      if (action === "browser-bookmark") return toggleBrowserBookmark?.(windowId) ?? true;
      if (action === "browser-open-history" || action === "browser-open-bookmark") return openBrowserUrlInWindow?.(windowId, target.dataset.url) ?? true;
      if (action === "browser-reload") return runBrowserCommand?.(windowId, "reload") ?? true;
      if (action === "browser-back") return runBrowserCommand?.(windowId, "back") ?? true;
      if (action === "browser-forward") return runBrowserCommand?.(windowId, "forward") ?? true;
      if (action === "file-refresh-list") return refreshFileList?.(windowId) ?? true;
      if (action === "file-open") return openFileInWindow?.(windowId) ?? true;
      if (action === "file-open-list-item") return openFileInWindow?.(windowId, target.dataset.filePathValue) ?? true;
      if (action === "file-select-list-path") return selectFileListPath?.(windowId, target.dataset.filePathValue) ?? true;
      if (action === "file-toggle-dir") return toggleFileListDir?.(windowId, target.dataset.filePathValue) ?? true;
      if (action === "file-pick") return pickFileForWindow?.(windowId) ?? true;
      if (action === "file-save") return saveFileFromWindow?.(windowId) ?? true;
      if (action === "file-save-as") return saveFileAsFromWindow?.(windowId) ?? true;
      if (action === "file-create-folder") return createFolderFromWindow?.(windowId) ?? true;
      if (action === "file-rename") return renameFileFromWindow?.(windowId) ?? true;
      if (action === "file-delete") return deleteFileFromWindow?.(windowId) ?? true;
      if (action === "confirm-file-operation") return confirmFileOperationFromModal?.() ?? true;
      return false;
    }
    return { handle };
  }

  global.COSS_PROGRAM_ACTION_SERVICE = Object.freeze({ createProgramActionService });
})(window);
