const STATE_SCHEMA_VERSION = 2;
const PROJECT_STATE_VERSION = "0.11.0";
const TASK_STATUSES = Object.freeze(["planned", "running", "done"]);
const SUBTASK_STATUSES = Object.freeze(["idle", "running", "done"]);
const KERNEL_PHASES = Object.freeze(["idle", "running", "done"]);
const AGENT_DELIVERY_STATUSES = Object.freeze([
  "queued", "submitted", "waiting", "completed", "failed", "canceled"
]);

const PERSISTED_COLLECTIONS = Object.freeze([
  "projects", "worlds", "deletedProjectIds", "settings"
]);

module.exports = {
  STATE_SCHEMA_VERSION,
  PROJECT_STATE_VERSION,
  TASK_STATUSES,
  SUBTASK_STATUSES,
  KERNEL_PHASES,
  AGENT_DELIVERY_STATUSES,
  PERSISTED_COLLECTIONS
};
