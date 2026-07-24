const fs = require("fs");
const path = require("path");

function createProjectFileService({
  fileListLimit = 240,
  maxEditableFileBytes = 2 * 1024 * 1024,
  appendLogEvent = () => undefined,
  serializeError = (error) => ({ message: error?.message || String(error) })
} = {}) {
  const skippedDirectories = new Set(["node_modules", ".git", "dist", "build", "out", "coverage", "test-results"]);
  const textExtensions = new Set([
    ".txt", ".md", ".json", ".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".css", ".html", ".xml",
    ".yml", ".yaml", ".toml", ".ini", ".env", ".gitignore", ".py", ".ps1", ".bat", ".cmd", ".sh",
    ".java", ".kt", ".go", ".rs", ".cs", ".cpp", ".c", ".h", ".sql", ".csv", ".log"
  ]);

  function isPathInside(rootPath, targetPath) {
    const relative = path.relative(rootPath, targetPath);
    return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  }

  function getProjectRoot(projectPath) {
    const root = path.resolve(String(projectPath || ""));
    if (!root || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new Error("项目目录不存在或不可访问。");
    }
    return root;
  }

  function getProjectFileTarget(projectPath, filePath) {
    const root = getProjectRoot(projectPath);
    const rawFilePath = String(filePath || "").trim();
    if (!rawFilePath) throw new Error("文件路径为空。");
    const target = path.resolve(path.isAbsolute(rawFilePath) ? rawFilePath : path.join(root, rawFilePath));
    if (!isPathInside(root, target)) throw new Error("文件路径超出当前项目目录，已阻止访问。");
    return { root, target, relativePath: path.relative(root, target) };
  }

  function isLikelyTextFile(filePath, size) {
    if (size > maxEditableFileBytes) return false;
    const basename = path.basename(filePath).toLowerCase();
    const extension = path.extname(filePath).toLowerCase();
    return textExtensions.has(extension) || textExtensions.has(basename) || extension === "";
  }

  function listProjectFiles(_event, projectPath) {
    try {
      const root = getProjectRoot(projectPath);
      const files = [];
      function visit(directory, depth = 0) {
        if (files.length >= fileListLimit || depth > 6) return;
        const entries = fs.readdirSync(directory, { withFileTypes: true })
          .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
        entries.forEach((entry) => {
          if (files.length >= fileListLimit) return;
          const absolutePath = path.join(directory, entry.name);
          const relativePath = path.relative(root, absolutePath);
          if (entry.isDirectory()) {
            if (!skippedDirectories.has(entry.name)) {
              files.push({ name: entry.name, path: relativePath, type: "directory", size: 0, modifiedAt: fs.statSync(absolutePath).mtime.toISOString() });
              visit(absolutePath, depth + 1);
            }
            return;
          }
          if (!entry.isFile()) return;
          const stat = fs.statSync(absolutePath);
          if (isLikelyTextFile(absolutePath, stat.size)) {
            files.push({ name: entry.name, path: relativePath, type: "file", size: stat.size, modifiedAt: stat.mtime.toISOString() });
          }
        });
      }
      visit(root);
      appendLogEvent("files.listed", { projectPath: root, count: files.length });
      return { ok: true, root, files, truncated: files.length >= fileListLimit };
    } catch (error) {
      appendLogEvent("files.list.failed", { projectPath, error: serializeError(error) }, "error");
      return { ok: false, error: error.message, files: [] };
    }
  }

  function readProjectFile(_event, request = {}) {
    try {
      const { root, target, relativePath } = getProjectFileTarget(request.projectPath, request.filePath);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error("文件不存在。");
      const stat = fs.statSync(target);
      if (!isLikelyTextFile(target, stat.size)) throw new Error("文件过大或不是可编辑文本文件。");
      const content = fs.readFileSync(target, "utf8");
      appendLogEvent("file.read", { projectPath: root, path: relativePath, size: stat.size });
      return { ok: true, path: relativePath, absolutePath: target, content, size: stat.size, modifiedAt: stat.mtime.toISOString() };
    } catch (error) {
      appendLogEvent("file.read.failed", { projectPath: request.projectPath, path: request.filePath, error: serializeError(error) }, "error");
      return { ok: false, error: error.message };
    }
  }

  function writeProjectFile(_event, request = {}) {
    try {
      const content = String(request.content || "");
      if (Buffer.byteLength(content, "utf8") > maxEditableFileBytes) throw new Error("文件内容超过 2MB，已阻止保存。");
      const { root, target, relativePath } = getProjectFileTarget(request.projectPath, request.filePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
      const stat = fs.statSync(target);
      appendLogEvent("file.saved", { projectPath: root, path: relativePath, size: stat.size });
      return { ok: true, path: relativePath, absolutePath: target, size: stat.size, modifiedAt: stat.mtime.toISOString() };
    } catch (error) {
      appendLogEvent("file.save.failed", { projectPath: request.projectPath, path: request.filePath, error: serializeError(error) }, "error");
      return { ok: false, error: error.message };
    }
  }

  function createProjectFolder(_event, request = {}) {
    try {
      const { root, target, relativePath } = getProjectFileTarget(request.projectPath, request.folderPath);
      fs.mkdirSync(target, { recursive: true });
      if (!fs.statSync(target).isDirectory()) throw new Error("目标路径不是文件夹。");
      appendLogEvent("file.folder.created", { projectPath: root, path: relativePath });
      return { ok: true, path: relativePath, absolutePath: target };
    } catch (error) {
      appendLogEvent("file.folder.create.failed", { projectPath: request.projectPath, path: request.folderPath, error: serializeError(error) }, "error");
      return { ok: false, error: error.message };
    }
  }

  function renameProjectFile(_event, request = {}) {
    try {
      const from = getProjectFileTarget(request.projectPath, request.fromPath);
      const to = getProjectFileTarget(request.projectPath, request.toPath);
      if (!fs.existsSync(from.target)) throw new Error("源路径不存在。");
      if (fs.existsSync(to.target)) throw new Error("目标路径已存在。");
      fs.mkdirSync(path.dirname(to.target), { recursive: true });
      fs.renameSync(from.target, to.target);
      appendLogEvent("file.renamed", { projectPath: from.root, from: from.relativePath, to: to.relativePath });
      return { ok: true, fromPath: from.relativePath, path: to.relativePath, absolutePath: to.target };
    } catch (error) {
      appendLogEvent("file.rename.failed", { projectPath: request.projectPath, from: request.fromPath, to: request.toPath, error: serializeError(error) }, "error");
      return { ok: false, error: error.message };
    }
  }

  function deleteProjectFile(_event, request = {}) {
    try {
      const { root, target, relativePath } = getProjectFileTarget(request.projectPath, request.filePath);
      if (!fs.existsSync(target)) throw new Error("目标路径不存在。");
      const stat = fs.statSync(target);
      if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
      else fs.unlinkSync(target);
      appendLogEvent("file.deleted", { projectPath: root, path: relativePath, type: stat.isDirectory() ? "directory" : "file" });
      return { ok: true, path: relativePath };
    } catch (error) {
      appendLogEvent("file.delete.failed", { projectPath: request.projectPath, path: request.filePath, error: serializeError(error) }, "error");
      return { ok: false, error: error.message };
    }
  }

  return { isPathInside, getProjectRoot, getProjectFileTarget, isLikelyTextFile, listProjectFiles, readProjectFile, writeProjectFile, createProjectFolder, renameProjectFile, deleteProjectFile };
}

module.exports = { createProjectFileService };
