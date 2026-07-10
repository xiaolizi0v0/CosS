(function exposeFileView(global) {
  global.COSS_FILE_VIEW = Object.freeze({
    id: "file",
    render: ({ renderFile } = {}) => renderFile?.() || "",
    mount: ({ mountFile } = {}) => mountFile?.(),
    unmount: ({ unmountFile } = {}) => unmountFile?.()
  });
})(window);
