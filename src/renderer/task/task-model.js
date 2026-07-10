(function exposeTaskModel(global) {
  const DEFAULT_PHASES = Object.freeze({ idle: true, running: true, done: true });

  function normalizeSubtaskStatus(value, definitions = {}) {
    return definitions[value] || ["idle", "running", "done"].includes(value) ? value : "idle";
  }

  function deriveTaskStatus(subtasks = [], definitions = {}) {
    const statuses = subtasks.map((item) => normalizeSubtaskStatus(item?.status, definitions));
    if (statuses.length === 0) return "planned";
    if (statuses.every((status) => status === "done")) return "done";
    if (statuses.some((status) => status === "running")) return "running";
    return "planned";
  }

  function normalizeKernelPhase(value, fallbackStatus = "idle", definitions = DEFAULT_PHASES) {
    const phase = String(value || "").trim();
    if (definitions[phase]) return phase;
    return normalizeSubtaskStatus(fallbackStatus, definitions);
  }

  function kernelPhaseToStatus(phase, definitions = DEFAULT_PHASES) {
    return definitions[normalizeKernelPhase(phase, "idle", definitions)]?.status
      || normalizeKernelPhase(phase, "idle", definitions);
  }

  function stableKernelIdPart(value, fallback = "item") {
    const normalized = String(value || "")
      .trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "").slice(0, 48);
    return normalized || fallback;
  }

  function getStableSubtaskId(task, subtask, index, current = {}) {
    const existingId = String(subtask?.id || current.subtaskId || "").trim();
    if (existingId) return existingId;
    const taskPart = stableKernelIdPart(task?.id || task?.title, "task");
    const rolePart = stableKernelIdPart(subtask?.roleId || current.roleId, "role");
    const titlePart = stableKernelIdPart(subtask?.title || current.title, "step");
    return `subtask-${taskPart}-${String(index + 1).padStart(2, "0")}-${rolePart}-${titlePart}`;
  }

  global.COSS_TASK_MODEL = Object.freeze({
    normalizeSubtaskStatus, deriveTaskStatus, normalizeKernelPhase,
    kernelPhaseToStatus, stableKernelIdPart, getStableSubtaskId
  });
})(window);
