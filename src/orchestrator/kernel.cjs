const { randomUUID } = require("crypto");

const KERNEL_VERSION = "0.12.1";
const DEFAULT_LEASE_MS = 5 * 60 * 1000;

const roleTemplates = [
  { id: "product-manager", name: "产品经理", englishName: "Product Manager" },
  { id: "tech-lead", name: "技术负责人", englishName: "Tech Lead" },
  { id: "frontend-engineer", name: "前端工程师", englishName: "Frontend Engineer" },
  { id: "backend-engineer", name: "后端工程师", englishName: "Backend Engineer" },
  { id: "qa-engineer", name: "测试工程师", englishName: "QA Engineer" },
  { id: "ai-agent-engineer", name: "AI/Agent 工程师", englishName: "AI/Agent Engineer" },
  { id: "devops-engineer", name: "DevOps 工程师", englishName: "DevOps Engineer" },
  { id: "technical-writer", name: "技术文档工程师", englishName: "Technical Writer" },
  { id: "security-engineer", name: "安全工程师", englishName: "Security Engineer" }
];

const roleCapabilityProfiles = {
  "product-manager": ["requirements.define", "acceptance.define", "workflow.propose", "artifact.write_docs"],
  "tech-lead": ["architecture.design", "workflow.propose", "code.review", "risk.assess", "artifact.write_docs"],
  "frontend-engineer": ["code.frontend", "ui.implement", "browser.inspect", "artifact.write_code"],
  "backend-engineer": ["code.backend", "api.implement", "data.model", "artifact.write_code"],
  "qa-engineer": ["test.plan", "test.execute", "browser.inspect", "artifact.write_report"],
  "ai-agent-engineer": ["agent.design", "mcp.integrate", "workflow.propose", "artifact.write_code"],
  "devops-engineer": ["build.configure", "deploy.prepare", "ci.configure", "artifact.write_code"],
  "technical-writer": ["docs.write", "artifact.write_docs", "requirements.summarize"],
  "security-engineer": ["security.review", "risk.assess", "policy.check", "artifact.write_report"]
};

const globalOrchestratorPolicy = {
  directAgentMessaging: false,
  capabilitySandbox: true,
  sharedTaskBoard: true,
  resourceLocks: true,
  structuredResultsOnly: true,
  durableWorkflow: true,
  eventSourcing: true,
  stepLeases: true,
  dryRunBeforeHighRisk: true,
  userConfirmationForHighRisk: true,
  centralArbitration: true
};

const roleIds = new Set(roleTemplates.map((role) => role.id));

function createId(prefix) {
  return `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

function uniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function normalizeRoleId(value, fallback = "product-manager") {
  const roleId = String(value || "").trim();
  return roleIds.has(roleId) ? roleId : fallback;
}

function getValidRoleIdText() {
  return roleTemplates.map((role) => role.id).join(", ");
}

function assertKnownRoleId(value, fieldName = "roleId") {
  const roleId = String(value || "").trim();
  if (!roleIds.has(roleId)) {
    throw new Error(`Unknown ${fieldName}: ${roleId || "(empty)"}. Call coss_list_roles and use one of: ${getValidRoleIdText()}`);
  }
  return roleId;
}

function uniqueRoleIds(values = [], fromRoleId = "", options = {}) {
  const rawValues = Array.isArray(values) ? values : [values];
  const invalid = [];
  const normalized = rawValues
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => {
      if (roleIds.has(value)) {
        return true;
      }
      invalid.push(value);
      return false;
    })
    .filter((value) => value !== fromRoleId);
  if (options.strict && invalid.length > 0) {
    throw new Error(`Unknown ${options.fieldName || "roleIds"}: ${Array.from(new Set(invalid)).join(", ")}. Call coss_list_roles and use one of: ${getValidRoleIdText()}`);
  }
  return Array.from(new Set(normalized));
}

function normalizeSubtaskStatus(value) {
  return ["idle", "running", "done"].includes(value) ? value : "idle";
}

function normalizeStepPhase(value) {
  return ["idle", "running", "done"].includes(value) ? value : "idle";
}

function phaseToSubtaskStatus(phase) {
  return normalizeStepPhase(phase);
}

function normalizeAgentEventStatus(value) {
  return ["idle", "running", "done"].includes(value) ? value : "";
}

function normalizeRiskLevel(value) {
  return ["low", "medium", "high"].includes(value) ? value : "low";
}

function stableKernelIdPart(value, fallback = "item") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return normalized || fallback;
}

function getSubtaskFallbackKey(subtask, index) {
  return [
    index,
    stableKernelIdPart(subtask?.roleId, "role"),
    stableKernelIdPart(subtask?.title, "title"),
    stableKernelIdPart(subtask?.description, "desc")
  ].join(":");
}

function getStepFallbackKey(step, index) {
  return [
    index,
    stableKernelIdPart(step?.roleId, "role"),
    stableKernelIdPart(step?.title, "title"),
    stableKernelIdPart(step?.description, "desc")
  ].join(":");
}

function getStableSubtaskId(task, subtask, index, current = {}) {
  const existingId = String(subtask?.id || current.subtaskId || "").trim();
  if (existingId) {
    return existingId;
  }
  const taskPart = stableKernelIdPart(task?.id || task?.title, "task");
  const rolePart = stableKernelIdPart(subtask?.roleId || current.roleId, "role");
  const titlePart = stableKernelIdPart(subtask?.title || current.title, "step");
  return `subtask-${taskPart}-${String(index + 1).padStart(2, "0")}-${rolePart}-${titlePart}`;
}

function getRoleCapabilities(roleId) {
  return [...(roleCapabilityProfiles[normalizeRoleId(roleId)] || [])];
}

function deriveTaskStatus(subtasks = []) {
  if (!subtasks.length) {
    return "planned";
  }
  if (subtasks.every((subtask) => normalizeSubtaskStatus(subtask.status) === "done")) {
    return "done";
  }
  if (subtasks.some((subtask) => normalizeSubtaskStatus(subtask.status) === "running")) {
    return "running";
  }
  return "planned";
}

function appendKernelEvent(project, task, event = {}) {
  const now = event.createdAt || new Date().toISOString();
  const record = {
    id: event.id || createId("kernel-event"),
    protocolVersion: KERNEL_VERSION,
    type: String(event.type || "kernel.event"),
    projectId: project?.id || event.projectId || "",
    taskId: task?.id || event.taskId || "",
    roleId: event.roleId || "",
    stepId: event.stepId || "",
    subtaskId: event.subtaskId || "",
    payload: event.payload && typeof event.payload === "object" ? event.payload : {},
    createdAt: now
  };
  if (task) {
    const orchestrator = ensureTaskOrchestrator(task);
    orchestrator.events.push(record);
    orchestrator.events = orchestrator.events.slice(-240);
  }
  if (project) {
    project.kernelEvents ||= [];
    project.kernelEvents.push(record);
    project.kernelEvents = project.kernelEvents.slice(-1000);
  }
  return record;
}

function buildStepFromSubtask(subtask, index, existing = {}, now = new Date().toISOString()) {
  const roleId = normalizeRoleId(subtask.roleId);
  const phase = normalizeStepPhase(existing.phase || existing.lifecycleStage || existing.status || subtask.status);
  return {
    id: existing.id || `step-${subtask.id}`,
    subtaskId: subtask.id,
    roleId,
    title: subtask.title || existing.title || `Step ${index + 1}`,
    description: subtask.description || existing.description || "",
    status: normalizeSubtaskStatus(existing.status || subtask.status),
    phase,
    dependsOn: uniqueStrings(existing.dependsOn || subtask.dependsOn || []),
    assignedMessageId: existing.assignedMessageId || subtask.assignedMessageId || "",
    claimedBy: existing.claimedBy || "",
    lease: existing.lease && typeof existing.lease === "object" ? existing.lease : null,
    riskLevel: normalizeRiskLevel(existing.riskLevel || subtask.riskLevel),
    allowedCapabilities: getRoleCapabilities(roleId),
    source: existing.source || subtask.source || "orchestrator",
    createdAt: existing.createdAt || subtask.createdAt || now,
    updatedAt: existing.updatedAt || subtask.updatedAt || now
  };
}

function ensureTaskOrchestrator(task) {
  if (!task) {
    return null;
  }
  task.subtasks ||= [];
  const now = task.updatedAt || task.createdAt || new Date().toISOString();
  const existing = task.orchestrator && typeof task.orchestrator === "object" ? task.orchestrator : {};
  const existingSteps = Array.isArray(existing.steps) ? existing.steps : [];
  const stepsBySubtaskId = new Map(existingSteps
    .filter((step) => step?.subtaskId)
    .map((step) => [step.subtaskId, step]));
  const stepsByFallbackKey = new Map(existingSteps.map((step, index) => [getStepFallbackKey(step, index), step]));
  const steps = task.subtasks.map((subtask, index) => {
    const current = stepsBySubtaskId.get(subtask.id) || stepsByFallbackKey.get(getSubtaskFallbackKey(subtask, index)) || {};
    subtask.id = getStableSubtaskId(task, subtask, index, current);
    return buildStepFromSubtask(
      subtask,
      index,
      current,
      now
    );
  });
  task.orchestrator = {
    version: KERNEL_VERSION,
    mode: "central-orchestrator",
    owner: "CosS Kernel",
    kernel: {
      version: KERNEL_VERSION,
      architecture: "durable-workflow-kernel",
      eventStore: "sqlite-event-sourcing",
      executionModel: "central-orchestrator",
      leaseMs: Number(existing.kernel?.leaseMs) || DEFAULT_LEASE_MS,
      projections: ["task-board", "agent-status", "timeline", "role-flow"]
    },
    policy: {
      ...globalOrchestratorPolicy,
      ...(existing.policy || {})
    },
    capabilities: roleTemplates.reduce((acc, role) => {
      acc[role.id] = getRoleCapabilities(role.id);
      return acc;
    }, {}),
    sharedState: {
      currentStep: existing.sharedState?.currentStep || "",
      artifacts: Array.isArray(existing.sharedState?.artifacts) ? existing.sharedState.artifacts : [],
      constraints: uniqueStrings([
        "Agents cannot directly assign work to other Agents.",
        "All results must be written back to the shared task board.",
        "Medium/high risk actions require orchestrator or user approval.",
        "Only one workflow step runs at a time.",
        ...(existing.sharedState?.constraints || [])
      ]),
      decisions: Array.isArray(existing.sharedState?.decisions) ? existing.sharedState.decisions : []
    },
    locks: Array.isArray(existing.locks) ? existing.locks : [],
    approvals: Array.isArray(existing.approvals) ? existing.approvals : [],
    events: Array.isArray(existing.events) ? existing.events.slice(-240) : [],
    steps
  };
  return task.orchestrator;
}

function getStepBySubtask(task, subtaskId) {
  const orchestrator = ensureTaskOrchestrator(task);
  return orchestrator?.steps.find((step) => step.subtaskId === subtaskId || step.id === subtaskId) || null;
}

function getIncompleteDependencies(task, step) {
  const orchestrator = ensureTaskOrchestrator(task);
  return uniqueStrings(step?.dependsOn || []).filter((dependencyId) => {
    const dependency = orchestrator.steps.find((item) => item.id === dependencyId || item.subtaskId === dependencyId);
    return dependency && normalizeStepPhase(dependency.phase || dependency.status) !== "done";
  });
}

function claimStep({ project, task, subtask, roleId, phase = "running", messageId = "", leaseMs = DEFAULT_LEASE_MS } = {}) {
  const normalizedRoleId = assertKnownRoleId(roleId);
  const orchestrator = ensureTaskOrchestrator(task);
  const step = subtask ? getStepBySubtask(task, subtask.id) : null;
  if (!task || !subtask || !step) {
    throw new Error("assigned orchestrator step not found");
  }
  if (step.roleId !== normalizedRoleId) {
    throw new Error("step is not assigned to this role");
  }
  const incompleteDependencies = getIncompleteDependencies(task, step);
  if (incompleteDependencies.length > 0) {
    throw new Error(`step dependencies are not complete: ${incompleteDependencies.join(", ")}`);
  }
  const now = new Date().toISOString();
  const nextPhase = "running";
  step.phase = nextPhase;
  step.status = phaseToSubtaskStatus(nextPhase);
  step.claimedBy = normalizedRoleId;
  step.assignedMessageId ||= messageId;
  step.lease = {
    ownerRoleId: normalizedRoleId,
    acquiredAt: now,
    expiresAt: new Date(Date.now() + leaseMs).toISOString(),
    heartbeatAt: now
  };
  step.updatedAt = now;
  subtask.status = step.status;
  subtask.updatedAt = now;
  subtask.lastStatusChangedAt = now;
  orchestrator.sharedState.currentStep = step.id;
  task.status = deriveTaskStatus(task.subtasks || []);
  task.updatedAt = now;
  appendKernelEvent(project, task, {
    type: "step.running",
    roleId: normalizedRoleId,
    stepId: step.id,
    subtaskId: subtask.id,
    payload: { messageId, phase: nextPhase, lease: step.lease }
  });
  return { task, orchestrator, step, subtask };
}

function markStepStatus({ project, task, subtask, roleId, status, message = "" } = {}) {
  const normalizedRoleId = assertKnownRoleId(roleId);
  const normalizedStatus = normalizeAgentEventStatus(status);
  if (!normalizedStatus) {
    throw new Error("status must be idle, running, or done");
  }
  const orchestrator = ensureTaskOrchestrator(task);
  const step = subtask ? getStepBySubtask(task, subtask.id) : null;
  if (!task || !subtask || !step) {
    throw new Error("assigned orchestrator step not found");
  }
  if (step.roleId !== normalizedRoleId) {
    throw new Error("step is not assigned to this role");
  }
  const now = new Date().toISOString();
  const phase = normalizeStepPhase(normalizedStatus);
  step.phase = phase;
  step.status = phaseToSubtaskStatus(phase);
  step.updatedAt = now;
  if (["idle", "done"].includes(phase)) {
    step.lease = null;
  } else if (step.lease) {
    step.lease.heartbeatAt = now;
  }
  subtask.status = step.status;
  subtask.updatedAt = now;
  subtask.lastStatusChangedAt = now;
  orchestrator.sharedState.currentStep = step.id;
  task.status = deriveTaskStatus(task.subtasks || []);
  task.updatedAt = now;
  appendKernelEvent(project, task, {
    type: "step.status.reported",
    roleId: normalizedRoleId,
    stepId: step.id,
    subtaskId: subtask.id,
    payload: { status: normalizedStatus, phase, message: String(message || "").slice(0, 500) }
  });
  return { task, orchestrator, step, subtask, status: normalizedStatus };
}

function heartbeatStep({ project, task, subtask, roleId, message = "", leaseMs = DEFAULT_LEASE_MS } = {}) {
  const normalizedRoleId = assertKnownRoleId(roleId);
  const orchestrator = ensureTaskOrchestrator(task);
  const step = subtask ? getStepBySubtask(task, subtask.id) : null;
  if (!task || !subtask || !step) {
    throw new Error("assigned orchestrator step not found");
  }
  if (step.roleId !== normalizedRoleId) {
    throw new Error("step is not assigned to this role");
  }
  if (normalizeStepPhase(step.phase || step.status) === "done") {
    throw new Error("done steps cannot be heartbeated");
  }
  const now = new Date().toISOString();
  step.phase = "running";
  step.status = phaseToSubtaskStatus(step.phase);
  step.claimedBy = normalizedRoleId;
  step.lease = {
    ...(step.lease || {}),
    ownerRoleId: normalizedRoleId,
    acquiredAt: step.lease?.acquiredAt || now,
    heartbeatAt: now,
    expiresAt: new Date(Date.now() + leaseMs).toISOString()
  };
  step.updatedAt = now;
  subtask.status = step.status;
  subtask.updatedAt = now;
  task.status = deriveTaskStatus(task.subtasks || []);
  task.updatedAt = now;
  orchestrator.sharedState.currentStep = step.id;
  appendKernelEvent(project, task, {
    type: "step.heartbeat",
    roleId: normalizedRoleId,
    stepId: step.id,
    subtaskId: subtask.id,
    payload: { message: String(message || "").slice(0, 500), lease: step.lease }
  });
  return { task, orchestrator, step, subtask, lease: step.lease };
}

function normalizeArtifacts(value = []) {
  return (Array.isArray(value) ? value : [value])
    .map((item) => {
      if (typeof item === "string") {
        return { path: item, type: "file", description: "" };
      }
      return {
        path: String(item?.path || item?.url || "").trim(),
        type: String(item?.type || "file").trim(),
        description: String(item?.description || item?.summary || "").trim().slice(0, 500)
      };
    })
    .filter((item) => item.path)
    .slice(0, 20);
}

function assertCapabilities(roleId, usedCapabilities = []) {
  const allowed = new Set(getRoleCapabilities(roleId));
  const invalidCapabilities = uniqueStrings(usedCapabilities).filter((capability) => !allowed.has(capability));
  if (invalidCapabilities.length > 0) {
    throw new Error(`Capability not allowed for ${roleId}: ${invalidCapabilities.join(", ")}`);
  }
  return { ok: true, usedCapabilities: uniqueStrings(usedCapabilities), allowedCapabilities: [...allowed] };
}

function submitStepResult({ project, task, subtask, roleId, input = {} } = {}) {
  const normalizedRoleId = assertKnownRoleId(roleId);
  const orchestrator = ensureTaskOrchestrator(task);
  const step = subtask ? getStepBySubtask(task, subtask.id) : null;
  if (!task || !subtask || !step) {
    throw new Error("assigned orchestrator step not found");
  }
  if (step.roleId !== normalizedRoleId) {
    throw new Error("step is not assigned to this role");
  }
  assertCapabilities(normalizedRoleId, input.usedCapabilities || []);
  const status = normalizeAgentEventStatus(input.status || "done") || "done";
  const now = new Date().toISOString();
  const artifacts = normalizeArtifacts(input.artifacts || []);
  artifacts.forEach((artifact) => {
    orchestrator.sharedState.artifacts.push({
      ...artifact,
      roleId: normalizedRoleId,
      stepId: step.id,
      createdAt: now
    });
  });
  orchestrator.sharedState.artifacts = orchestrator.sharedState.artifacts.slice(-120);
  if (input.summary || input.message) {
    orchestrator.sharedState.decisions.push({
      id: createId("decision"),
      roleId: normalizedRoleId,
      stepId: step.id,
      summary: String(input.summary || input.message).trim().slice(0, 1000),
      createdAt: now
    });
    orchestrator.sharedState.decisions = orchestrator.sharedState.decisions.slice(-120);
  }
  const riskLevel = normalizeRiskLevel(input.riskLevel || step.riskLevel);
  const requiresApproval = input.requiresUserConfirmation === true || riskLevel === "high";
  if (requiresApproval && status === "done") {
    const approval = {
      id: createId("approval"),
      roleId: normalizedRoleId,
      stepId: step.id,
      status: "pending",
      riskLevel,
      summary: String(input.summary || input.message || "High-risk action requires confirmation.").slice(0, 800),
      createdAt: now
    };
    orchestrator.approvals.push(approval);
    step.phase = "running";
    step.status = "running";
    subtask.status = "running";
  } else {
    step.phase = normalizeStepPhase(status);
    step.status = phaseToSubtaskStatus(step.phase);
    subtask.status = step.status;
  }
  step.updatedAt = now;
  if (["idle", "done"].includes(step.phase)) {
    step.lease = null;
  } else if (step.lease) {
    step.lease.heartbeatAt = now;
  }
  subtask.updatedAt = now;
  subtask.lastStatusChangedAt = now;
  task.status = deriveTaskStatus(task.subtasks || []);
  task.updatedAt = now;
  appendKernelEvent(project, task, {
    type: "step.result.submitted",
    roleId: normalizedRoleId,
    stepId: step.id,
    subtaskId: subtask.id,
    payload: {
      status,
      phase: step.phase,
      artifacts: artifacts.length,
      riskLevel,
      requiresApproval
    }
  });
  return {
    task,
    orchestrator,
    step,
    subtask,
    status,
    artifacts,
    riskLevel,
    requiresApproval
  };
}

function releaseStepLease({ project, task, subtask, roleId, reason = "", requeue = true } = {}) {
  const normalizedRoleId = assertKnownRoleId(roleId);
  const orchestrator = ensureTaskOrchestrator(task);
  const step = subtask ? getStepBySubtask(task, subtask.id) : null;
  if (!task || !subtask || !step) {
    throw new Error("assigned orchestrator step not found");
  }
  if (step.roleId !== normalizedRoleId) {
    throw new Error("step is not assigned to this role");
  }
  const previousLease = step.lease && typeof step.lease === "object" ? { ...step.lease } : null;
  if (!previousLease) {
    return {
      ok: false,
      reason: "lease-not-found",
      taskId: task.id,
      stepId: step.id,
      subtaskId: subtask.id,
      phase: step.phase,
      status: subtask.status
    };
  }

  const now = new Date().toISOString();
  step.lease = null;
  step.claimedBy = "";
  if (requeue && normalizeStepPhase(step.phase) === "running") {
    step.phase = "idle";
    step.status = "idle";
    subtask.status = "idle";
  }
  step.updatedAt = now;
  subtask.updatedAt = now;
  subtask.lastStatusChangedAt = now;
  task.status = deriveTaskStatus(task.subtasks || []);
  task.updatedAt = now;
  appendKernelEvent(project, task, {
    type: "step.lease.released",
    roleId: normalizedRoleId,
    stepId: step.id,
    subtaskId: subtask.id,
    payload: {
      reason: String(reason || "manual-release").slice(0, 500),
      requeue: Boolean(requeue),
      previousLease
    }
  });
  return {
    ok: true,
    taskId: task.id,
    stepId: step.id,
    subtaskId: subtask.id,
    phase: step.phase,
    status: subtask.status,
    previousLease
  };
}

function acquireLock({ project, task, roleId, resource, reason = "", ttlMs = DEFAULT_LEASE_MS } = {}) {
  const normalizedRoleId = assertKnownRoleId(roleId);
  const lockResource = String(resource || "").trim();
  if (!task || !lockResource) {
    throw new Error("task and resource are required");
  }
  const orchestrator = ensureTaskOrchestrator(task);
  const now = new Date();
  const activeLock = orchestrator.locks.find((lock) => (
    lock.resource === lockResource
    && lock.status === "locked"
    && lock.roleId !== normalizedRoleId
    && (!lock.expiresAt || new Date(lock.expiresAt).getTime() > now.getTime())
  ));
  if (activeLock) {
    return { ok: false, locked: true, resource: lockResource, ownerRoleId: activeLock.roleId, lockId: activeLock.id };
  }
  const lock = {
    id: createId("lock"),
    resource: lockResource,
    roleId: normalizedRoleId,
    status: "locked",
    reason: String(reason || "").slice(0, 300),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString()
  };
  orchestrator.locks.push(lock);
  appendKernelEvent(project, task, {
    type: "resource.lock.acquired",
    roleId: normalizedRoleId,
    payload: { resource: lockResource, lockId: lock.id, expiresAt: lock.expiresAt }
  });
  return { ok: true, lock };
}

function releaseLock({ project, task, roleId, resource = "", lockId = "" } = {}) {
  const normalizedRoleId = assertKnownRoleId(roleId);
  if (!task) {
    throw new Error("task is required");
  }
  const orchestrator = ensureTaskOrchestrator(task);
  const lock = orchestrator.locks.find((item) => (
    item.status === "locked"
    && item.roleId === normalizedRoleId
    && (lockId ? item.id === lockId : item.resource === resource)
  ));
  if (!lock) {
    return { ok: false, reason: "lock-not-found" };
  }
  lock.status = "released";
  lock.releasedAt = new Date().toISOString();
  appendKernelEvent(project, task, {
    type: "resource.lock.released",
    roleId: normalizedRoleId,
    payload: { resource: lock.resource, lockId: lock.id }
  });
  return { ok: true, lock };
}

function requestApproval({ project, task, subtask = null, roleId, riskLevel = "high", summary = "" } = {}) {
  const normalizedRoleId = assertKnownRoleId(roleId);
  if (!task) {
    throw new Error("task is required");
  }
  const orchestrator = ensureTaskOrchestrator(task);
  const step = subtask ? getStepBySubtask(task, subtask.id) : null;
  const approval = {
    id: createId("approval"),
    roleId: normalizedRoleId,
    stepId: step?.id || "",
    status: "pending",
    riskLevel: normalizeRiskLevel(riskLevel),
    summary: String(summary || "Approval requested.").slice(0, 1000),
    createdAt: new Date().toISOString()
  };
  orchestrator.approvals.push(approval);
  if (step && subtask) {
    step.phase = "running";
    step.status = "running";
    subtask.status = "running";
    task.status = deriveTaskStatus(task.subtasks || []);
  }
  appendKernelEvent(project, task, {
    type: "approval.requested",
    roleId: normalizedRoleId,
    stepId: step?.id || "",
    subtaskId: subtask?.id || "",
    payload: { approvalId: approval.id, riskLevel: approval.riskLevel }
  });
  return { ok: true, approval };
}

function buildTaskBoard(project, task, roleId = "") {
  const orchestrator = ensureTaskOrchestrator(task);
  return {
    ok: true,
    project: project ? { id: project.id, name: project.name, path: project.path || "" } : null,
    roleId: roleId || "",
    task: task ? { id: task.id, title: task.title, goal: task.goal, status: task.status } : null,
    orchestrator,
    projections: {
      taskBoard: orchestrator ? {
        idle: orchestrator.steps.filter((step) => step.phase === "idle").length,
        running: orchestrator.steps.filter((step) => step.phase === "running").length,
        done: orchestrator.steps.filter((step) => step.phase === "done").length
      } : {},
      activeLocks: orchestrator ? orchestrator.locks.filter((lock) => lock.status === "locked").length : 0,
      pendingApprovals: orchestrator ? orchestrator.approvals.filter((approval) => approval.status === "pending").length : 0
    },
    instructions: "CosS v0.10 uses a durable central linear workflow kernel. Agents start one step, submit structured results, and mark the step done; the next preplanned step starts after that."
  };
}

module.exports = {
  KERNEL_VERSION,
  DEFAULT_LEASE_MS,
  roleTemplates,
  roleCapabilityProfiles,
  globalOrchestratorPolicy,
  createId,
  normalizeRoleId,
  assertKnownRoleId,
  uniqueRoleIds,
  uniqueStrings,
  normalizeSubtaskStatus,
  normalizeStepPhase,
  normalizeAgentEventStatus,
  normalizeRiskLevel,
  getRoleCapabilities,
  deriveTaskStatus,
  appendKernelEvent,
  ensureTaskOrchestrator,
  getStepBySubtask,
  claimStep,
  markStepStatus,
  heartbeatStep,
  submitStepResult,
  releaseStepLease,
  acquireLock,
  releaseLock,
  requestApproval,
  buildTaskBoard,
  normalizeArtifacts
};
