const path = require("path");

function createLlmService({
  sanitizeLogText = (value, maxLength = 240) => String(value || "").slice(0, maxLength),
  getTimeout = () => 60000,
  appendLogEvent = () => undefined,
  summarizePlanRequest = () => ({}),
  summarizeModelConfig = () => ({}),
  serializeError = (error) => ({ message: error?.message || String(error) }),
  fetchImpl = globalThis.fetch,
  env = process.env
} = {}) {
  const PLANNER_IMAGE_LIMIT = 5;
  const PLANNER_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
  const PLANNER_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

  function sanitizeLlmText(value, maxLength = 220) { return sanitizeLogText(value, maxLength); }
  function safeResolvePath(rawPath) {
    const value = String(rawPath || "").trim();
    if (!value) return "";
    try { return path.resolve(value); } catch { return ""; }
  }
  function stripJsonCodeFence(text) {
    return String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  function findBalancedJsonObject(source) {
    const start = source.indexOf("{");
    if (start === -1) return "";
    let depth = 0;
    let inString = false;
    let escaping = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (escaping) escaping = false;
        else if (char === "\\") escaping = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') { inString = true; continue; }
      if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(start, index + 1);
      }
    }
    return "";
  }
  function extractJsonObject(text) {
    const source = stripJsonCodeFence(text);
    if (!source) throw new Error("模型未返回可解析的 JSON 对象。");
    try { return JSON.parse(source); } catch { /* recover below */ }
    const candidate = findBalancedJsonObject(source);
    if (!candidate) throw new Error(`模型未返回完整 JSON 对象。响应片段：${sanitizeLogText(source, 240)}`);
    try { return JSON.parse(candidate); }
    catch (error) { throw new Error(`模型 JSON 解析失败：${error.message}。响应片段：${sanitizeLogText(source, 240)}`); }
  }
  function normalizePlannerResult(payload, roles = []) {
    const allowedRoles = new Set(roles.map((role) => role.id));
    const fallbackRole = roles[0]?.id || "product-manager";
    const placeholderTexts = new Set(["一句话总结", "子任务标题", "子任务描述", "角色ID", "协作消息"]);
    const isPlaceholder = (value) => placeholderTexts.has(String(value || "").trim());
    const readRoleList = (...keys) => {
      for (const key of keys) {
        if (Array.isArray(payload?.[key])) {
          const values = Array.from(new Set(payload[key].filter((roleId) => allowedRoles.has(roleId))));
          if (values.length > 0) return values;
        }
      }
      return [];
    };
    const rawSubtasks = (Array.isArray(payload?.subtasks) ? payload.subtasks : [])
      .map((item, index) => ({
        id: sanitizeLlmText(item?.id || item?.stepId || `step-${index + 1}`, 60).replace(/[^\w.-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || `step-${index + 1}`,
        roleId: allowedRoles.has(item?.roleId) ? item.roleId : fallbackRole,
        title: sanitizeLlmText(item?.title, 80),
        description: sanitizeLlmText(item?.description, 500),
        dependsOn: Array.isArray(item?.dependsOn) ? item.dependsOn.map((value) => sanitizeLlmText(value, 60)).filter(Boolean) : Array.isArray(item?.dependencies) ? item.dependencies.map((value) => sanitizeLlmText(value, 60)).filter(Boolean) : [],
        riskLevel: ["low", "medium", "high"].includes(item?.riskLevel) ? item.riskLevel : "low"
      }))
      .filter((item) => item.title && item.description && !isPlaceholder(item.title) && !isPlaceholder(item.description))
      .slice(0, 12);
    const neededAgentRoleIds = Array.from(new Set([...readRoleList("neededAgentRoleIds", "agentRoleIds", "terminalRoleIds", "involvedRoleIds"), ...rawSubtasks.map((item) => item.roleId)])).slice(0, 9);
    const subtasks = rawSubtasks.map((item, index) => ({ ...item, id: `step-${index + 1}`, dependsOn: index === 0 ? [] : [`step-${index}`], isEntryStep: index === 0, order: index + 1 }));
    const effectiveFirstRoundRoleIds = subtasks[0]?.roleId ? [subtasks[0].roleId] : [];
    const effectiveNeededAgentRoleIds = Array.from(new Set([...neededAgentRoleIds, ...subtasks.map((item) => item.roleId)])).slice(0, 9);
    if (effectiveFirstRoundRoleIds.length < 1 || subtasks.length < 1) throw new Error(`模型未返回有效的任务步骤。有效首轮协作者数：${effectiveFirstRoundRoleIds.length}，有效步骤数：${subtasks.length}。`);
    return { summary: isPlaceholder(payload?.summary) ? "" : sanitizeLlmText(payload?.summary, 240), neededAgentRoleIds: effectiveNeededAgentRoleIds, firstRoundRoleIds: effectiveFirstRoundRoleIds, subtasks, messages: [] };
  }
  function buildChatCompletionsUrl(baseUrl) {
    const normalized = String(baseUrl || "").trim().replace(/\/+$/, "");
    if (!normalized) throw new Error("模型 Base URL 为空。");
    return normalized.endsWith("/chat/completions") ? normalized : `${normalized}/chat/completions`;
  }
  function buildLlmHeaders(model = {}) {
    const headers = { "Content-Type": "application/json" };
    if (model.apiKey) headers.Authorization = `Bearer ${model.apiKey}`;
    return headers;
  }
  function sanitizePromptText(value, limit = 1200) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit); }
  function normalizePlannerAttachments(attachments = []) {
    const list = Array.isArray(attachments) ? attachments : [];
    const images = list.filter((item) => item?.type === "image").slice(0, PLANNER_IMAGE_LIMIT).map((item, index) => {
      const mimeType = String(item.mimeType || "").trim().toLowerCase();
      const data = String(item.data || "").trim().replace(/^data:[^,]+,/, "");
      const size = Number(item.size) || Math.ceil((data.length * 3) / 4);
      if (!PLANNER_IMAGE_MIME_TYPES.has(mimeType)) throw new Error(`不支持的任务图片类型：${mimeType || "unknown"}。仅支持 PNG、JPEG、WebP。`);
      if (!data) throw new Error("任务图片内容为空，请重新选择图片。");
      if (size > PLANNER_IMAGE_MAX_BYTES) throw new Error(`任务图片过大：单张不能超过 ${Math.round(PLANNER_IMAGE_MAX_BYTES / 1024 / 1024)} MB。`);
      return { type: "image", id: sanitizeLlmText(item.id || `image-${index + 1}`, 80), name: sanitizeLlmText(item.name || `image-${index + 1}`, 160), mimeType, size, data };
    });
    const files = list.filter((item) => item?.type === "file" && item?.absolutePath).slice(0, 20).map((item, index) => {
      const resolved = safeResolvePath(item.absolutePath);
      if (!resolved) return null;
      return { type: "file", id: sanitizeLlmText(item.id || `file-${index + 1}`, 80), name: sanitizeLlmText(item.name || `file-${index + 1}`, 200), size: Number(item.size) || 0, absolutePath: sanitizeLlmText(resolved, 1024) };
    }).filter(Boolean);
    return [...images, ...files];
  }
  function formatPlannerProjectMemory(projectMemory = {}) {
    if (!projectMemory || projectMemory.enabled === false) return "Project memory is disabled or empty.";
    const lines = [];
    if (projectMemory.manualNotes) lines.push("Manual project notes:", String(projectMemory.manualNotes).trim().slice(0, 4000));
    if (projectMemory.summary) lines.push("Auto project memory:", String(projectMemory.summary).trim().slice(0, 8000));
    const tasks = Array.isArray(projectMemory.taskHistory) ? projectMemory.taskHistory.slice(0, 6) : [];
    if (tasks.length > 0) {
      lines.push("Recent task state:");
      tasks.forEach((task, index) => { lines.push(`${index + 1}. [${sanitizePromptText(task.status, 40)}] ${sanitizePromptText(task.title || task.goal, 120)} (${Number(task.doneCount) || 0}/${Number(task.totalCount) || 0} done)`); if (task.summary) lines.push(`   ${sanitizePromptText(task.summary, 220)}`); });
    }
    const artifacts = Array.isArray(projectMemory.artifacts) ? projectMemory.artifacts.slice(0, 8) : [];
    if (artifacts.length > 0) { lines.push("Known artifacts:"); artifacts.forEach((artifact) => lines.push(`- ${sanitizePromptText(artifact.path || artifact.url, 220)}${artifact.description ? `: ${sanitizePromptText(artifact.description, 220)}` : ""}`)); }
    const decisions = Array.isArray(projectMemory.decisions) ? projectMemory.decisions.slice(0, 8) : [];
    if (decisions.length > 0) { lines.push("Recent decisions:"); decisions.forEach((decision) => lines.push(`- ${sanitizePromptText(decision.roleName || decision.roleId, 80)}: ${sanitizePromptText(decision.summary, 360)}`)); }
    return lines.join("\n").trim().slice(0, 14000) || "Project memory is empty.";
  }
  function buildPlannerMessages({ goal, projectName, roles, projectMemory, attachments = [] }) {
    const roleText = roles.map((role) => `- ${role.id}: ${role.name}, ${role.description}`).join("\n");
    const memoryText = formatPlannerProjectMemory(projectMemory);
    const imageAttachments = attachments.filter((item) => item?.type === "image");
    const fileAttachments = attachments.filter((item) => item?.type === "file");
    const fileListBlock = fileAttachments.length ? `Reference files (absolute paths; do not modify. Reference them in subtask descriptions so downstream Agents can read with their tools):\n${fileAttachments.map((item) => `- ${item.absolutePath}`).join("\n")}\n\n` : "";
    const userText = `Project: ${projectName || "Untitled project"}\nTask goal: ${goal}\n\n` + (imageAttachments.length ? `Reference images: ${imageAttachments.length} image(s) are attached. Use them as supporting evidence for visible UI, error, OCR, layout, or workflow clues. Do not invent details that are not visible; if uncertain, make the first step clarify the uncertainty.\n\n` : "") + fileListBlock + `Project memory:\n${memoryText}\n\nAvailable roles:\n${roleText}\n\nCreate a complete linear workflow. Do not create parallel entry steps. Later steps must depend on the previous step only. Return JSON in this shape: {"summary":"one sentence task summary","neededAgentRoleIds":["product-manager","tech-lead","frontend-engineer","backend-engineer","test-engineer"],"firstRoundRoleIds":["product-manager"],"subtasks":[{"id":"step-1","roleId":"product-manager","title":"Define requirements and acceptance criteria","description":"Write PRD, acceptance criteria, and boundaries.","dependsOn":[],"riskLevel":"low"},{"id":"step-2","roleId":"tech-lead","title":"Design technical approach","description":"Use step-1 output to define architecture and interface constraints.","dependsOn":["step-1"],"riskLevel":"low"}],"messages":[]}.`;
    const userContent = imageAttachments.length ? [{ type: "text", text: userText }, ...imageAttachments.map((item) => ({ type: "image_url", image_url: { url: `data:${item.mimeType};base64,${item.data}` } }))] : userText;
    return [{ role: "system", content: "You are the CosS v0.10 Kernel Planner. The Kernel is the only scheduler. Generate one simple linear workflow when the task is created. Return strict JSON only; no Markdown and no explanation. Hard rules: neededAgentRoleIds must list every Agent terminal that may be needed, using only role IDs from the provided role list. Do not invent roles such as designer or developer. firstRoundRoleIds must contain exactly the roleId of the first workflow step. The first step may be one Agent only. subtasks must contain the complete sequential workflow, 1 to 12 steps. Every step must include id, roleId, title, description, dependsOn, and riskLevel. Step 1 uses dependsOn: []; every later step depends only on the immediately previous step. The Kernel will dispatch one step at a time. The next Agent starts only after the previous Agent reports done. Agent states are only idle, running, and done. Use project memory as the existing project context. Prefer incremental steps that continue current architecture, artifacts, conventions, and completed work. Do not plan bootstrap, scaffolding, or rediscovery steps unless the user goal explicitly asks for them. If reference images are provided, inspect them and use visible evidence to improve the plan, but do not make unsupported claims. Return exactly these fields: summary, neededAgentRoleIds, firstRoundRoleIds, subtasks, messages. messages must be an empty array." }, { role: "user", content: userContent }];
  }
  async function requestJson(url, options) {
    const controller = new AbortController();
    const timeoutMs = getTimeout();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      const bodyText = await response.text();
      if (!response.ok) throw new Error(`模型接口返回 ${response.status}: ${bodyText.slice(0, 500)}`);
      try { return JSON.parse(bodyText); }
      catch (error) { throw new Error(`模型接口返回非 JSON 响应：${sanitizeLogText(bodyText, 500)} (${error.message})`); }
    } catch (error) {
      if (timedOut || error?.name === "AbortError") throw new Error(`模型接口请求超时：${Math.round(timeoutMs / 1000)} 秒内没有返回。请稍后重试，或在设置中调整模型服务超时时间。`);
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function planTaskWithLlm(request = {}) {
    if (env.COSS_LLM_FORCE_ERROR === "1") throw new Error("任务计划生成失败。请稍后重试或检查模型配置。");
    const roles = Array.isArray(request.roles) ? request.roles : [];
    if (env.COSS_LLM_MOCK_RESPONSE) return { ...normalizePlannerResult(JSON.parse(env.COSS_LLM_MOCK_RESPONSE), roles), source: "mock" };
    if (env.COSS_LLM_MOCK_CONTENT) return { ...normalizePlannerResult(extractJsonObject(env.COSS_LLM_MOCK_CONTENT), roles), source: "mock-content" };
    const model = request.model || {};
    const attachments = normalizePlannerAttachments(request.attachments || []);
    const response = await requestJson(buildChatCompletionsUrl(model.baseUrl), { method: "POST", headers: buildLlmHeaders(model), body: JSON.stringify({ model: model.modelName, messages: buildPlannerMessages({ goal: request.goal, projectName: request.projectName, roles, projectMemory: request.projectMemory || null, attachments }), temperature: 0.2, stream: false }) });
    const content = response?.choices?.[0]?.message?.content;
    if (!content) throw new Error("模型响应中没有 choices[0].message.content。");
    return { ...normalizePlannerResult(extractJsonObject(content), roles), source: "llm", usage: response.usage || null };
  }
  async function testModelConnectivityWithLlm(request = {}) {
    if (env.COSS_LLM_FORCE_ERROR === "1") throw new Error("任务计划生成失败。请稍后重试或检查模型配置。");
    const model = request.model || {};
    const modelName = String(model.modelName || "").trim();
    if (!modelName) throw new Error("模型名称为空。");
    if (env.COSS_LLM_MOCK_CONNECTIVITY === "1") return { source: "mock", modelName, baseUrl: String(model.baseUrl || "").trim(), content: "OK" };
    const response = await requestJson(buildChatCompletionsUrl(model.baseUrl), { method: "POST", headers: buildLlmHeaders(model), body: JSON.stringify({ model: modelName, messages: [{ role: "system", content: "你是 CosS 的模型连通性检测器。请只用极短文本回复。" }, { role: "user", content: "请回复 OK，用于确认模型接口可用。" }], temperature: 0, max_tokens: 16, stream: false }) });
    const content = response?.choices?.[0]?.message?.content;
    if (!content) throw new Error("模型响应中没有 choices[0].message.content。");
    return { source: "llm", modelName, baseUrl: String(model.baseUrl || "").trim(), content: String(content).slice(0, 120), usage: response.usage || null };
  }
  async function handlePlanTask(_event, request) {
    const startedAt = Date.now();
    appendLogEvent("llm.plan.requested", summarizePlanRequest(request));
    try {
      const result = await planTaskWithLlm(request);
      appendLogEvent("llm.plan.succeeded", { ...summarizePlanRequest(request), source: result.source || "llm", latencyMs: Date.now() - startedAt, subtasks: Array.isArray(result.subtasks) ? result.subtasks.length : 0, messages: Array.isArray(result.messages) ? result.messages.length : 0, usage: result.usage || null });
      return { ok: true, plannedAt: new Date().toISOString(), ...result };
    } catch (error) {
      appendLogEvent("llm.plan.failed", { ...summarizePlanRequest(request), latencyMs: Date.now() - startedAt, error: serializeError(error) }, "error");
      return { ok: false, plannedAt: new Date().toISOString(), error: error.message };
    }
  }
  async function handleTestModelConnectivity(_event, request) {
    const startedAt = Date.now();
    try {
      const result = await testModelConnectivityWithLlm(request);
      appendLogEvent("llm.connectivity.succeeded", { model: summarizeModelConfig(request?.model || {}), timeoutMs: getTimeout(), latencyMs: Date.now() - startedAt, source: result.source || "llm", content: sanitizeLogText(result.content, 120), usage: result.usage || null });
      return { ok: true, checkedAt: new Date().toISOString(), latencyMs: Date.now() - startedAt, ...result };
    } catch (error) {
      appendLogEvent("llm.connectivity.failed", { model: summarizeModelConfig(request?.model || {}), timeoutMs: getTimeout(), latencyMs: Date.now() - startedAt, error: serializeError(error) }, "error");
      return { ok: false, checkedAt: new Date().toISOString(), latencyMs: Date.now() - startedAt, error: error.message };
    }
  }
  return { findBalancedJsonObject, extractJsonObject, normalizePlannerResult, buildPlannerMessages, normalizePlannerAttachments, planTaskWithLlm, testModelConnectivityWithLlm, handlePlanTask, handleTestModelConnectivity };
}

module.exports = { createLlmService };
