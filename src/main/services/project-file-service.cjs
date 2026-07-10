function createProjectFileService({ list, read, write, createFolder, rename, remove } = {}) {
  return { list, read, write, createFolder, rename, remove };
}

module.exports = { createProjectFileService };
