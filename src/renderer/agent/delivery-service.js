(function exposeAgentDeliveryService(global) {
  function createAgentDeliveryService({
    api,
    getState,
    translate,
    uid,
    getProject,
    getRole,
    getTaskContextForWindow,
    getMessageTaskLabel,
    getAgentPoolMessagePath,
    getAgentPermissionPolicy,
    normalizeAgentProvider,
    getAgentProviderLabel
  } = {}) {
    const t = translate || ((key, fallback) => fallback || key);

    function stripTerminalControlChars(value) {
      return String(value || "")
        .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .trim();
    }

    function buildTerminalInstructionPayload(message, targetWindow) {
      const project = getProject?.();
      const fromRole = getRole?.(message.fromRoleId) || { name: message.fromRoleId || "" };
      const toRole = getRole?.(targetWindow.roleId) || { name: targetWindow.roleId || "" };
      const taskContext = getTaskContextForWindow?.(targetWindow, project) || {};
      const projectMemoryLines = taskContext.projectMemorySummary
        ? ["Project memory:", taskContext.projectMemorySummary, ""]
        : [];
      const taskLabel = message.taskId ? getMessageTaskLabel?.(message.taskId) : t("taskList.privateChat", "私聊");
      const currentState = getState?.() || {};
      const agentProvider = normalizeAgentProvider?.(targetWindow.agentProvider || currentState.settings?.agentProvider) || "codex";
      const provider = getAgentProviderLabel?.(agentProvider) || agentProvider;
      const permissionPolicy = getAgentPermissionPolicy?.() || { label: "默认", instruction: "" };
      const poolPath = message.agentPoolPaths?.[targetWindow.roleId] || getAgentPoolMessagePath?.(targetWindow.roleId, message.id) || "";
      const mcpRetryLines = agentProvider === "codebuddy"
        ? [
            t("delivery.prompt.mcpRetryCodebuddy1", "CodeBuddy Code 后端如果显示 `mcp__coss: Still connecting` 或 `/mcp` 中 coss 为 Disconnected，请等待 5-10 秒后用 ToolSearch queries: coss、mcp、inbox 重试；不要搜索或调用当前后端不存在的等待工具。"),
            t("delivery.prompt.mcpRetryCodebuddy2", "如果 coss 工具仍未暴露，请继续完成当前角色工作并输出 COSS_AGENT_EVENT:{\"status\":\"running\",\"message\":\"MCP disconnected; 当前进度说明\",\"toRoleIds\":[]} 作为降级留痕。")
          ]
        : [
            t("delivery.prompt.mcpRetryOther1", "如果系统提示 `mcp__coss: Still connecting`，请等待几秒后重新搜索或调用 coss 工具；只有当前后端明确提供等待工具时才调用该工具。"),
            t("delivery.prompt.mcpRetryOther2", "不要因为 ToolSearch 暂时没有找到 coss 工具就停止；请至少等待并重试 3 次。")
          ];
      const autoWorkflowLines = message.autoWorkflow || message.source === "agent-event"
        ? [
            t("delivery.prompt.autoWorkflow1", "这是 CosS Kernel 分配的上游任务上下文。"),
            t("delivery.prompt.autoWorkflow2", "请先阅读消息中提到的交接文档、产物路径或注意事项，再继续你的角色工作。"),
            t("delivery.prompt.autoWorkflow3", "完成自己的部分后，请通过 coss_submit_result({ status: \"done\" }) 提交结果，由 Kernel 启动下一步。")
          ]
        : [];
      return stripTerminalControlChars([
        t("delivery.prompt.title", "请处理来自 CosS 协作时间线的指令。"),
        t("delivery.prompt.targetRole", "目标角色：{{name}}", { name: toRole.name }),
        t("delivery.prompt.fromRole", "发送角色：{{name}}", { name: fromRole.name }),
        t("delivery.prompt.agentProvider", "Agent 后端：{{provider}}", { provider }),
        t("delivery.prompt.permissionMode", "Agent 权限模式：{{label}}", { label: permissionPolicy.label }),
        t("delivery.prompt.channel", "频道：{{label}}", { label: taskLabel }),
        t("delivery.prompt.messageId", "消息ID：{{id}}", { id: message.id }),
        t("delivery.prompt.poolPath", "角色消息池：{{path}}", { path: poolPath }),
        t("delivery.prompt.messageSource", "消息来源：{{source}}", { source: message.source || "manual" }),
        "",
        permissionPolicy.instruction,
        "",
        ...autoWorkflowLines,
        ...(autoWorkflowLines.length ? [""] : []),
        "CosS v0.10 linear Kernel workflow:",
        "0. Do not directly assign work to another Agent. CosS Kernel owns the workflow, role startup, resource locks, and downstream dispatch.",
        `1. Call coss_pool_read({ roleId: "${targetWindow.roleId}", taskId: "${message.taskId || ""}" }) to read your own inbox.`,
        `2. Call coss_pool_claim({ roleId: "${targetWindow.roleId}", messageId: "${message.id}" }) before processing this message.`,
        "3. Call coss_claim_step before work; acquire locks with coss_acquire_lock before editing shared resources.",
        "4. Submit structured results through coss_submit_result with status done when your own step is complete. The Kernel will schedule the next preplanned Agent after your step is done.",
        "5. High-risk actions must use coss_request_approval and wait for user or orchestrator confirmation.",
        "",
        ...projectMemoryLines,
        message.content,
        "",
        t("delivery.prompt.preferMcp", "必须优先使用 CosS MCP 工具调用 CosS，而不是只在终端自然语言回复。"),
        t("delivery.prompt.requiredTools", "请按需调用：coss_get_context、coss_get_task_board、coss_list_roles、coss_pool_read、coss_pool_claim、coss_claim_step、coss_heartbeat_step、coss_release_step、coss_get_kernel_events、coss_submit_result、coss_acquire_lock、coss_release_lock、coss_request_approval。"),
        ...mcpRetryLines,
        t("delivery.prompt.recommendedOrder", "推荐开始顺序：先 coss_get_context，再 coss_get_task_board，再 coss_pool_read，处理本条消息前调用 coss_pool_claim，开始执行子任务时调用 coss_claim_step。"),
        t("delivery.prompt.submitResult", "完成自己的 Step 时优先调用 coss_submit_result({ status: \"done\" })；不要直接发给其他角色，也不要创建未在任务板中的角色。"),
        t("delivery.prompt.fallbackEvent", "如果当前 Agent 后端暂时无法使用 MCP，再输出 COSS_AGENT_EVENT:{\"status\":\"running\",\"message\":\"你的结构化进度或无法继续的原因\",\"toRoleIds\":[]}。"),
        t("delivery.prompt.agentStates", "Agent 只能使用三种状态：COSS_AGENT_STATUS:running 或 COSS_AGENT_STATUS:done；默认未开始就是 idle。")
      ].join("\n"));
    }

    function getAgentDeliveryAdapter(win) {
      const currentState = getState?.() || {};
      const provider = normalizeAgentProvider?.(win?.agentProvider || currentState.settings?.agentProvider) || "codex";
      if (provider === "codebuddy") {
        return { provider, method: "delivery-file-interactive", detail: "Delivery file plus interactive CodeBuddy submit" };
      }
      return { provider, method: "bracketed-paste", detail: `${getAgentProviderLabel?.(provider) || provider} bracketed paste` };
    }

    function sanitizeDeliveryFileName(value) {
      return String(value || uid?.("delivery"))
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || uid?.("delivery");
    }

    async function writeAgentDeliveryInstructionFile(project, delivery, content) {
      if (!api?.writeProjectFile || !project?.path) return { ok: false, error: "file-api-unavailable" };
      const filePath = `.coss/deliveries/${sanitizeDeliveryFileName(delivery.id)}.md`;
      const result = await api.writeProjectFile({
        projectPath: project.path,
        filePath,
        content: [
          t("delivery.file.title", "# CosS Agent 投递指令"),
          "",
          t("delivery.file.intro", "请把本文档作为本次投递的唯一新增任务上下文。不要把终端输入框中的提示、示例或残留文字当成用户指令。"),
          "",
          content,
          ""
        ].join("\n")
      });
      if (result?.ok) {
        delivery.deliveryFilePath = result.path || filePath;
        delivery.deliveryFileAbsolutePath = result.absolutePath || "";
      }
      return result || { ok: false, error: "empty-result" };
    }

    async function sendPastedTerminalInstruction(windowId, content, adapter = null) {
      const sanitized = stripTerminalControlChars(content);
      if (!sanitized || !api?.sendTerminalInput) return { ok: false, error: "terminal-input-unavailable" };
      const ok = await api.sendTerminalInput(windowId, `\x01\x0b\x1b[200~${sanitized}\x1b[201~\r`);
      return { ok, provider: adapter?.provider || "", method: adapter?.method || "bracketed-paste", detail: adapter?.detail || "Bracketed paste", error: ok ? "" : "terminal-write-failed" };
    }

    function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

    async function sendTerminalInputChunks(windowId, chunks, delayMs = 80) {
      if (!api?.sendTerminalInput) return false;
      for (const chunk of chunks) {
        const isStep = chunk && typeof chunk === "object";
        const data = isStep ? String(chunk.data || "") : String(chunk || "");
        const delayAfter = isStep && Number.isFinite(Number(chunk.delayAfter)) ? Number(chunk.delayAfter) : delayMs;
        if (data && !await api.sendTerminalInput(windowId, data)) return false;
        if (delayAfter > 0) await wait(delayAfter);
      }
      return true;
    }

    function chunkTerminalText(value, size = 48) {
      const text = String(value || "");
      const chunks = [];
      for (let index = 0; index < text.length; index += size) chunks.push(text.slice(index, index + size));
      return chunks;
    }

    async function sendAgentDeliveryInstruction(project, delivery, targetWindow, content) {
      const sanitized = stripTerminalControlChars(content);
      if (!sanitized || !api?.sendTerminalInput) return { ok: false, error: "terminal-input-unavailable" };
      const adapter = getAgentDeliveryAdapter(targetWindow);
      delivery.submissionProvider = adapter.provider;
      delivery.submissionMethod = adapter.method;
      delivery.submissionDetail = adapter.detail;
      if (adapter.provider !== "codebuddy") return sendPastedTerminalInstruction(targetWindow.id, sanitized, adapter);
      const fileResult = await writeAgentDeliveryInstructionFile(project, delivery, sanitized);
      if (!fileResult?.ok) {
        delivery.lastError = fileResult?.error || "delivery-file-write-failed";
        return { ok: false, provider: adapter.provider, method: adapter.method, detail: adapter.detail, error: delivery.lastError };
      }
      const fileRef = delivery.deliveryFileAbsolutePath || delivery.deliveryFilePath;
      const instruction = stripTerminalControlChars(`请读取并执行 CosS 投递文件：${fileRef}。以该文件为唯一新增指令，忽略输入框已有提示或示例；执行中只使用 COSS_AGENT_STATUS:running，完成时输出 COSS_AGENT_STATUS:done。`);
      const instructionChunks = chunkTerminalText(instruction).map((data) => ({ data, delayAfter: 45 }));
      const ok = await sendTerminalInputChunks(targetWindow.id, [
        { data: "\x05", delayAfter: 90 }, { data: "\x15", delayAfter: 90 }, { data: "\x0b", delayAfter: 160 },
        ...instructionChunks, { data: "", delayAfter: 800 }, { data: "\r", delayAfter: 220 }, { data: "\x1b[13u", delayAfter: 0 }
      ]);
      return { ok, provider: adapter.provider, method: adapter.method, detail: adapter.detail, deliveryFilePath: delivery.deliveryFilePath, deliveryFileAbsolutePath: delivery.deliveryFileAbsolutePath, error: ok ? "" : "terminal-write-failed" };
    }

    function isPasteOnlyTerminalFeedback(excerpt) { return /^\s*\[Pasted text #\d+(?:(?:\s*\+\s*|\s*:\s*)\d+ lines)?\]\s*$/i.test(String(excerpt || "").trim()); }
    function isDeliveryInstructionEcho(excerpt) { return /璇疯鍙栧苟鎵ц CosS 鎶曢€掓枃浠|请读取并执行 CosS 投递文件/.test(stripTerminalControlChars(excerpt)); }
    function isDeliverySystemFeedback(excerpt) {
      const text = stripTerminalControlChars(excerpt);
      if (!text) return true;
      if (/CosS[\s\S]{0,120}terminal/i.test(text) && /(工作目录|请求模式|权限模式|会话|COSS_|宸ヤ綔|璇锋眰|鏉冮檺|浼氳瘽)/i.test(text)) return true;
      if (/(CodeBuddy Code|Tips for getting started|Recent activity|for shortcuts|Press\s+(?:Esc|Ctrl|\/)|Open Web UI)/i.test(text)) return true;
      if (/(shortcut|shortcuts)/i.test(text) || /^\s*[>?]\s*$/.test(text) || /^\s*[>?]\s*for\s+\w+/i.test(text)) return true;
      if (isPasteOnlyTerminalFeedback(text) || isDeliveryInstructionEcho(text)) return true;
      return /CosS/i.test(text) && /(投递|delivery|确认|等待|submitted|confirmed|waiting|鎶曢|纭|绛夊緟)/i.test(text);
    }
    function isAgentApprovalPromptOutput(excerpt) {
      const text = stripTerminalControlChars(excerpt);
      return [/do you want to (?:create|edit|modify|overwrite|update|write|delete|run|execute)\b[\s\S]{0,600}\?/i, /(?:yes,\s*)?allow (?:all )?(?:edits|changes|commands)/i, /(?:需要|是否).{0,80}(?:确认|批准|允许|授权)/].some((pattern) => pattern.test(text));
    }

    return { stripTerminalControlChars, buildTerminalInstructionPayload, getAgentDeliveryAdapter, sanitizeDeliveryFileName, writeAgentDeliveryInstructionFile, sendPastedTerminalInstruction, sendTerminalInputChunks, chunkTerminalText, sendAgentDeliveryInstruction, isPasteOnlyTerminalFeedback, isDeliveryInstructionEcho, isDeliverySystemFeedback, isAgentApprovalPromptOutput, wait };
  }

  global.COSS_AGENT_DELIVERY_SERVICE = Object.freeze({ createAgentDeliveryService });
})(window);
