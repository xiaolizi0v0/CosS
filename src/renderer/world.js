/**
 * CosS 世界 Agent 协作系统 - 完整代码段
 * 
 * 使用方法：
 * 1. 在 renderer.js 中找到 function buildWorldAgentPrompt( 函数
 * 2. 用这个函数替换原来的 buildWorldAgentPrompt
 * 3. 在 buildWorldAgentPrompt 函数结束后，插入后面的所有函数
 * 4. 找到 async function runWorldTaskConversation( 函数，用新版本替换
 * 5. 找到 function stripAnsi( 和 extractWorldAgentFinalMessage(，用新版本替换
 */

// ===== 第 1 段：buildWorldAgentPrompt（聊天提示词）=====
function buildWorldAgentPrompt(world, task, agent, phase, round) {
  const role = getRole(agent.roleId);
  const activeMemberIds = new Set(getWorldChatMembers(world).map((member) => member.id));
  const otherAgents = (world.agents || []).filter((a) => a.id !== agent.id && activeMemberIds.has(a.id));
  const otherAgentsInfo = otherAgents.length ? otherAgents.map((a) => {
    const r = getRole(a.roleId);
    return `- @${r.id}（${trRoleName(r)}）`;
  }).join("\n") : "暂无其他角色";
  
  const phaseInstruction = phase === "module-claim"
    ? "请认领你要负责的模块，并 @其他角色 说明需要他们做什么。"
    : "请回复当前群聊，汇报进度或需要其他角色配合的内容。";
  
  const transcript = getWorldChatTranscript(world, task.id, true) || "暂无聊天记录。";
  
  return [
    `你是 CosS 2D 世界中的 NPC Agent：${trRoleName(role)}（${role.id}）。`,
    `公告栏任务：${task.goal}`,
    "",
    "其他角色：",
    otherAgentsInfo,
    "",
    "规则：",
    "- 只输出群聊消息，不要执行命令或改文件。",
    "- 不要使用 CosS 项目主页的普通 Agent 协作流程；当前只运行独立世界 CodeBuddy CLI 内核。",
    "- 用纯文本回复，不要用 Markdown（**加粗**、`代码块`、```等）、JSON 或任何标记语言。",
    "- 用自然语言，保持简洁。",
    `- @${role.id} 指你自己；@其他角色ID 指对方。若要自己执行写：@${role.id}, 我要执行[任务]。`,
    "- 以「世界群聊最终消息：」开头输出你的群聊消息（仅一行）。",
    "",
    "当前群聊上下文：",
    transcript,
    "",
    phaseInstruction,
  ].join("\n");
}

// ===== 第 2 段：parseWorldAgentMentions（解析 @ 提及）=====
function parseWorldAgentMentions(output) {
  const mentions = [];
  if (!output || typeof output !== "string") {
    return mentions;
  }

  // 提取最终消息部分
  const finalMessageMatch = output.match(/(?:世界群聊最终消息|FINAL_CHAT_MESSAGE)\s*[:：]\s*([\s\S]+)$/i);
  const text = finalMessageMatch ? finalMessageMatch[1].trim() : output.trim();

  // 解析 @ 提及格式：@角色ID, 内容
  const mentionPattern = /@\s*([^,\s]+)\s*[,，]\s*([\s\S]+?)(?=\s*@|$)/g;
  let match;
  while ((match = mentionPattern.exec(text)) !== null) {
    const target = match[1].trim();
    const content = match[2].trim();
    if (!target || !content) {
      continue;
    }
    // 标准化目标：@自己 或 @self 都视为自己
    const selfAliases = ["自己", "self", "我自己", "本角色", "我"];
    const isSelf = selfAliases.some(alias => target.includes(alias));
    mentions.push({
      targetRoleId: isSelf ? "self" : target,
      content,
      isSelf
    });
  }

  return mentions;
}

// ===== 第 3 段：消息队列管理函数 =====
function addWorldAgentMessageToQueue(world, message) {
  world.agentMessageQueue ||= [];

  // 去重：检查是否已存在相同的任务
  const exists = world.agentMessageQueue.some((item) =>
    item.fromAgentId === message.fromAgentId &&
    item.toAgentId === message.toAgentId &&
    item.content === message.content &&
    item.status !== "done"
  );

  if (exists) {
    return;
  }

  world.agentMessageQueue.push({
    id: uid("world-queue"),
    fromAgentId: message.fromAgentId || "",
    fromRoleId: message.fromRoleId || "",
    toAgentId: message.toAgentId,
    content: message.content,
    taskId: message.taskId || "",
    status: "pending",
    createdAt: new Date().toISOString(),
    processedAt: null,
    runId: null
  });
}

function getNextWorldAgentQueueItem(world) {
  return (world.agentMessageQueue || []).find((item) => item.status === "pending") || null;
}

function updateWorldAgentQueueItem(world, queueId, updates) {
  const queue = world.agentMessageQueue || [];
  const index = queue.findIndex((item) => item.id === queueId);
  if (index >= 0) {
    queue[index] = { ...queue[index], ...updates };
  }
}

function findAgentIdByRoleId(world, roleId) {
  const agent = (world.agents || []).find((item) => item.roleId === roleId);
  return agent ? agent.id : null;
}

// ===== 第 4 段：buildWorldAgentExecutionPrompt（执行提示词）=====
function buildWorldAgentExecutionPrompt(world, task, agent, queueItem) {
  const role = getRole(agent.roleId);
  const transcript = getWorldChatTranscript(world, task.id, true) || "暂无聊天记录。";
  const otherAgentNames = (world.agents || [])
    .filter((a) => a.roleId !== agent.roleId)
    .map((a) => { const r = getRole(a.roleId); return `@${r.id}（${trRoleName(r)}）`; })
    .join("、");

  return [
    `你是 CosS 2D 世界中的 NPC Agent：${trRoleName(role)}。`,
    `角色 ID：${role.id}，职责：${trRoleDescription(role)}`,
    "",
    `任务内容（来自 @${queueItem.fromRoleId}）：`,
    queueItem.content,
    "",
    `世界其他角色：${otherAgentNames || "暂无"}`,
    "",
    "要求：执行上述任务。完成后用 @角色ID 接续下一位处理者（若无则说明已完成）。",
    "注意：只用纯文本，不要 Markdown 或代码块。",
    "",
    "当前群聊上下文：",
    transcript,
    "",
    "---",
    "世界群聊最终消息：总结：[完成内容]。@角色ID, [下一位需处理的事项]。",
    "---",
  ].join("\n");
}

// ===== 第 5 段：processWorldAgentOutput 和 executeWorldAgentTask =====
async function processWorldAgentOutput(worldId, taskId, agentId, output) {
  const world = getWorldById(worldId);
  const agent = world?.agents?.find((item) => item.id === agentId);
  if (!world || !agent || !output) {
    return;
  }

  const mentions = parseWorldAgentMentions(output);

  for (const mention of mentions) {
    const targetAgentId = mention.isSelf ? agentId : findAgentIdByRoleId(world, mention.targetRoleId);
    
    if (!targetAgentId && !mention.isSelf) {
      addWorldChatMessage(world, {
        type: "system",
        roleId: "system",
        taskId,
        content: `[系统] 角色 @${mention.targetRoleId} 当前世界不存在，消息无法转发。请在「角色创建点」创建该角色。`,
        createdAt: new Date().toISOString()
      });
      continue;
    }

    addWorldAgentMessageToQueue(world, {
      fromAgentId: agentId,
      fromRoleId: agent.roleId,
      toAgentId: mention.isSelf ? agentId : targetAgentId,
      content: mention.content,
      taskId
    });
  }
}

async function executeWorldAgentTask(worldId, taskId, queueItem) {
  const world = getWorldById(worldId);
  const task = world?.tasks?.find((item) => item.id === taskId);
  if (!world || !task || !queueItem) {
    return { ok: false, error: "World, task or queueItem not found" };
  }

  const targetAgentId = queueItem.toAgentId;
  const targetAgent = world.agents?.find((item) => item.id === targetAgentId);
  if (!targetAgent) {
    return { ok: false, error: "Target agent not found" };
  }

  const executionPrompt = buildWorldAgentExecutionPrompt(world, task, targetAgent, queueItem);

  const runId = uid("world-run");
  const role = getRole(targetAgent.roleId);

  // 创建 run 记录
  targetAgent.kernel = targetAgent.kernel || {};
  targetAgent.kernel.runs = targetAgent.kernel.runs || [];
  const run = {
    id: runId,
    taskId,
    phase: "execution",
    round: (targetAgent.kernel.runs.filter((r) => r.taskId === taskId).length || 0) + 1,
    status: "running",
    input: executionPrompt,
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  targetAgent.kernel.runs.push(run);

  targetAgent.taskId = taskId;
  targetAgent.status = "working";
  targetAgent.animation = "working";
  refreshWorldUiAfterStateChange(taskId);

  let result = null;
  if (window.cossAPI?.runWorldAgent) {
    result = await window.cossAPI.runWorldAgent({
      worldId,
      taskId,
      roleId: targetAgent.roleId,
      roleName: trRoleName(role),
      worldPath: world.path,
      taskGoal: task.goal,
      moduleSummary: getWorldRoleModuleSummary(targetAgent.roleId),
      runId,
      prompt: executionPrompt,
      codeBuddyApiKey: state.settings.codeBuddyApiKey || ""
    });
  } else {
    result = {
      ok: true,
      output: `${trRoleName(role)}（执行）：${queueItem.content}`,
      rawOutput: ""
    };
  }

  const completedAt = new Date().toISOString();

  // 更新 run 记录
  const existingRun = (targetAgent.kernel?.runs || []).find((r) => r.id === runId);
  if (existingRun) {
    existingRun.output = String(result?.output || result?.error || "").trim();
    existingRun.rawOutput = String(result?.rawOutput || "").trim();
    existingRun.completedAt = completedAt;
    existingRun.status = result?.ok ? "done" : "failed";
    existingRun.error = result?.error || "";
  }

  if (result?.ok && result.output) {
    addWorldChatMessage(world, {
      type: "role-message",
      roleId: targetAgent.roleId,
      taskId,
      content: result.output,
      createdAt: completedAt,
      displayName: trRoleName(role),
      round: "execution",
      runId
    });
  } else {
    const briefErr = result?.error || "CodeBuddy CLI 没有返回可展示输出。";
    const errorMsg = trRoleName(role) + " 执行出错：" + briefErr;
    addWorldChatMessage(world, {
      type: "system",
      roleId: "system",
      taskId,
      content: errorMsg,
      createdAt: completedAt,
      round: "execution",
      runId
    });
  }

  return result;
}

// ===== 第 6 段：finalizeWorldTask =====
function finalizeWorldTask(worldId, taskId) {
  const world = getWorldById(worldId);
  const task = world?.tasks?.find((item) => item.id === taskId);
  if (!world || !task) {
    return;
  }

  const completedAt = new Date().toISOString();
  (world.agents || []).forEach((agent) => {
    if (agent.taskId === taskId) {
      agent.status = "done";
      agent.animation = "idle";
      agent.taskId = "";
    }
  });
  task.status = "done";
  task.updatedAt = completedAt;
  task.completedAt = completedAt;

  addWorldChatMessage(world, {
    type: "system",
    roleId: "system",
    taskId,
    content: "本次公告栏任务已完成。全部聊天内容均来自世界角色独立 CodeBuddy CLI 的最终输出，世界系统只做中转记录。",
    createdAt: completedAt,
    round: "summary"
  });

  refreshWorldUiAfterStateChange(taskId);
}

function getWorldAnnouncementBoardPosition(world) {
  const board = (world?.objects || []).find((object) => object.action === "publish-world-task" || object.id === "announcement-board");
  return {
    x: Number(board?.x) + Number(board?.width || 3) / 2 || 31,
    y: Number(board?.y) + Number(board?.height || 2) / 2 || 30
  };
}

function getWorldAgentHomePosition(agent) {
  return {
    x: Number.isFinite(Number(agent?.homeX)) ? Number(agent.homeX) : Number(agent?.x || 0),
    y: Number.isFinite(Number(agent?.homeY)) ? Number(agent.homeY) : Number(agent?.y || 0)
  };
}

function getWorldMovementDirection(from, to) {
  const dx = Number(to.x) - Number(from.x);
  const dy = Number(to.y) - Number(from.y);
  if (Math.abs(dx) > Math.abs(dy)) return "side";
  return dy < 0 ? "up" : "down";
}

async function moveWorldAgents(world, agents, targetFactory, location, options = {}) {
  const motions = agents.map((agent) => {
    const from = { x: Number(agent.x || 0), y: Number(agent.y || 0) };
    const target = targetFactory(agent);
    agent.movement = {
      phase: options.phase || "moving",
      fromX: from.x,
      fromY: from.y,
      toX: target.x,
      toY: target.y,
      direction: getWorldMovementDirection(from, target)
    };
    agent.animation = "running";
    agent.status = options.status || "running";
    return { agent, from, target };
  });
  if (!motions.length) return;
  saveState();
  let engine = window.CossWorldEngineInstance;
  if (!engine) {
    render();
    engine = window.CossWorldEngineInstance;
  }
  if (engine?.ready) await engine.ready.catch(() => {});
  engine?.updateWorld?.(world);
  await Promise.all(motions.map(({ agent, target }) => (
    engine?.moveAgent
      ? engine.moveAgent(agent.id, target, { duration: options.duration || 1350, direction: agent.movement.direction, doorAtEnd: Boolean(options.doorAtEnd) })
      : new Promise((resolve) => window.setTimeout(resolve, options.duration || 1350))
  )));

  motions.forEach(({ agent, target }) => {
    agent.x = target.x;
    agent.y = target.y;
    agent.location = location;
    agent.movement = null;
    agent.animation = location === "home" ? "working" : "idle";
    agent.status = location === "home" ? (options.homeStatus || "planning") : (options.boardStatus || "planning");
  });
  saveState();
  engine?.updateWorld?.(world);
}

async function moveWorldAgentsToBoard(world, agents) {
  const board = getWorldAnnouncementBoardPosition(world);
  return moveWorldAgents(world, agents, () => board, "announcement-board", {
    phase: "to-board",
    status: "running",
    boardStatus: "planning",
    duration: 700
  });
}

async function moveWorldAgentsHome(world, agents) {
  return moveWorldAgents(world, agents, (agent) => getWorldAgentHomePosition(agent), "home", {
    phase: "return-home",
    status: "running",
    homeStatus: "planning",
    duration: 700,
    doorAtEnd: true
  });
}

// ===== 第 7 段：重构 runWorldTaskConversation（队列驱动 + 并行）=====
async function runWorldTaskConversation(worldId, taskId) {
  const world = getWorldById(worldId);
  const task = world?.tasks?.find((item) => item.id === taskId);
  if (!world || !task) {
    return;
  }

  // 初始化消息队列
  world.agentMessageQueue = [];

  // 阶段1：只有群聊成员从各自家中出门，前往公告栏领取模块。
  const chatMembers = getWorldChatMembers(world);
  if (!chatMembers.length) {
    finalizeWorldTask(worldId, taskId);
    return;
  }
  await moveWorldAgentsToBoard(world, chatMembers);
  const agentIds = chatMembers.map((agent) => agent.id);
  const claimResults = await Promise.all(
    agentIds.map((agentId) => runWorldAgentTurn(worldId, taskId, agentId, "module-claim", 1))
  );
  for (let i = 0; i < claimResults.length; i++) {
    const result = claimResults[i];
    if (result?.ok && result.output) {
      await processWorldAgentOutput(worldId, taskId, agentIds[i], result.output);
    }
  }

  // 阶段2：领取完成后全部回到自己的家，再开始执行工作。
  await moveWorldAgentsHome(world, chatMembers);

  // 阶段3：队列并行处理循环
  let maxIterations = 50;
  let iteration = 0;

  while (iteration < maxIterations) {
    const pendingItems = (world.agentMessageQueue || []).filter((item) => item.status === "pending");
    if (pendingItems.length === 0) break;

    // 按目标 Agent 分组，每个 Agent 每轮最多一个任务
    const agentPendingMap = new Map();
    for (const item of pendingItems) {
      const targetAgentId = item.toAgentId;
      if (targetAgentId && agentIds.includes(targetAgentId) && !agentPendingMap.has(targetAgentId)) {
        agentPendingMap.set(targetAgentId, item);
      }
    }

    const batch = Array.from(agentPendingMap.values());
    if (batch.length === 0) break;
    iteration++;

    // 标记批次中所有任务为 processing
    for (const item of batch) {
      updateWorldAgentQueueItem(world, item.id, { status: "processing" });
    }

    // 并行执行批次中的所有任务
    const results = await Promise.all(
      batch.map((item) => executeWorldAgentTask(worldId, taskId, item))
    );

    // 处理执行结果：标记完成 + 解析新 @ 提及
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const result = results[i];

      if (result?.ok) {
        updateWorldAgentQueueItem(world, item.id, {
          status: "done",
          processedAt: new Date().toISOString(),
          runId: result.runId || null
        });

        if (result.output) {
          const targetAgentId = item.toAgentId;
          if (targetAgentId) {
            await processWorldAgentOutput(worldId, taskId, targetAgentId, result.output);
          }
        }
      } else {
        updateWorldAgentQueueItem(world, item.id, {
          status: "failed",
          processedAt: new Date().toISOString(),
          error: result?.error || "执行失败"
        });
      }
    }

    refreshWorldUiAfterStateChange(taskId);
  }

  // 任务完成
  finalizeWorldTask(worldId, taskId);
}


async function runWorldAgentTurn(worldId, taskId, agentId, phase, round) {
  const world = getWorldById(worldId);
  const task = world?.tasks?.find((item) => item.id === taskId);
  const agent = world?.agents?.find((item) => item.id === agentId);
  if (!world || !task || !agent) {
    return null;
  }

  const now = new Date().toISOString();
  const role = getRole(agent.roleId);
  const runId = uid("world-run");
  const input = buildWorldAgentPrompt(world, task, agent, phase, round);
  agent.taskId = taskId;
  agent.status = phase === "module-claim" ? "planning" : "running";
  agent.animation = phase === "module-claim" ? "talking" : "working";
  const run = {
    id: runId,
    taskId,
    phase,
    round,
    status: "running",
    input,
    startedAt: now,
    createdAt: now
  };
  agent.kernel = agent.kernel || {};
  agent.kernel.runs = agent.kernel.runs || [];
  agent.kernel.runs.push(run);
  task.updatedAt = now;
  refreshWorldUiAfterStateChange(taskId);

  let result = null;
  if (window.cossAPI?.runWorldAgent) {
    result = await window.cossAPI.runWorldAgent({
      worldId,
      taskId,
      roleId: agent.roleId,
      roleName: trRoleName(role),
      worldPath: world.path,
      taskGoal: task.goal,
      moduleSummary: getWorldRoleModuleSummary(agent.roleId),
      runId,
      prompt: input,
      codeBuddyApiKey: state.settings.codeBuddyApiKey || ""
    });
  } else {
    result = {
      ok: true,
      mocked: true,
      output: trRoleName(role) + "：我负责" + getWorldRoleModuleSummary(agent.roleId) + "，并会把结果继续同步到世界群聊。",
      rawOutput: ""
    };
  }

  const output = String(result?.output || "").trim();
  const completedAt = new Date().toISOString();

  // 更新 run 对象的输出和状态
  const existingRun = (agent.kernel?.runs || []).find((r) => r.id === runId);
  if (existingRun) {
    existingRun.output = output;
    existingRun.rawOutput = String(result?.rawOutput || "").trim();
    existingRun.completedAt = completedAt;
    existingRun.status = result?.ok ? "done" : "failed";
    existingRun.error = result?.error || "";
  }

  if (result?.ok && output) {
    addWorldChatMessage(world, {
      type: "role-message",
      roleId: agent.roleId,
      taskId,
      content: output,
      createdAt: new Date().toISOString(),
      displayName: trRoleName(role),
      round: phase,
      sequence: round,
      runId
    });
    agent.status = phase === "module-claim" ? "planning" : "running";
  } else {
    const briefErr = result?.error || "CodeBuddy CLI 没有返回可展示输出。";
    const errorMsg = trRoleName(role) + " 执行出错：" + briefErr;
    addWorldChatMessage(world, {
      type: "system",
      roleId: "system",
      taskId,
      content: errorMsg,
      content: errorMsg,
      createdAt: new Date().toISOString(),
      round: phase,
      runId
    });
    agent.status = "failed";
  }

  task.updatedAt = new Date().toISOString();
  refreshWorldUiAfterStateChange(taskId);
  return result;
}

// ================= 世界辅助函数 =================
function getWorld() {
  const worlds = state.worlds || [];
  return worlds.find((w) => w.id === state.activeWorldId) || worlds[0] || null;
}

function getWorldById(worldId) {
  return (state.worlds || []).find((w) => w.id === worldId) || null;
}

function getWorldRoleModuleSummary(roleId) {
  const m = {
    "product-manager": t("world.module.pm", "需求分析和任务规划"),
    "tech-lead": t("world.module.tl", "技术方案和代码审查"),
    "frontend-engineer": t("world.module.fe", "前端界面和交互实现"),
    "backend-engineer": t("world.module.be", "后端接口和业务逻辑"),
    "qa-engineer": t("world.module.qa", "测试验证和质量保障"),
    "ai-agent-engineer": t("world.module.ai", "AI Agent 集成和工具链")
  };
  return m[roleId] || t("world.module.default", "当前角色模块");
}

function ensureWorldAgentKernel(agent, world) {
  if (!agent.kernel) {
    agent.kernel = { terminalId: uid("wrn"), runs: [], status: "idle" };
  }
  return agent.kernel;
}

function getWorldAgentKernelLine(agent, world) {
  const kernel = agent.kernel;
  if (!kernel) return t("world.agentRun.noAgent", "该角色尚未入住世界。");
  return t("world.agentRun.kernelLine", "CLI={{provider}} / {{terminalId}}", {
    provider: kernel.providerLabel || "codebuddy",
    terminalId: kernel.terminalId || ""
  });
}

function getWorldAgentRunLabel(run) {
  if (!run) return t("world.run.empty", "世界任务");
  const phaseLabel = run.phase === "module-claim" ? t("world.run.claim", "模块认领") : t("world.run.execute", "执行");
  return `${phaseLabel} #${run.round || 1}`;
}

function upsertWorldAgentRun(agent, run, world) {
  const kernel = ensureWorldAgentKernel(agent, world);
  const idx = kernel.runs.findIndex((r) => r.id === run.id);
  if (idx >= 0) kernel.runs[idx] = run;
  else kernel.runs.push(run);
  kernel.runs = kernel.runs.slice(-20);
  kernel.latestOutput = run.output || kernel.latestOutput || "";
  kernel.status = run.status;
  kernel.lastStartedAt = run.startedAt || kernel.lastStartedAt || "";
  return run;
}

// ================= 世界聊天函数 =================
function addWorldChatMessage(world, message) {
  world.chatMessages ||= [];
  world.chatMessages.push({
    id: uid("world-chat"),
    createdAt: new Date().toISOString(),
    ...message
  });
}

function getWorldChatTranscript(world, taskId = "", excludeSystem = false) {
  const messages = (world?.chatMessages || []).filter((m) => {
    if (taskId && m.taskId !== taskId) return false;
    if (excludeSystem && m.roleId === "system") return false;
    return true;
  });
  return messages.map((m) => {
    const role = getRole(m.roleId);
    return `${trRoleName(role)}（${formatDateTime(m.createdAt) || ""}）：${m.content || ""}`;
  }).join("\n");
}

function createWorldTaskConversation(world, task, createdAt) {
  addWorldChatMessage(world, {
    type: "announcement",
    roleId: "system",
    taskId: task.id,
    content: t("world.task.announcement", "公告栏发布新任务：{{goal}}", { goal: task.goal }),
    createdAt
  });
  addWorldChatMessage(world, {
    type: "system",
    roleId: "system",
    taskId: task.id,
    content: t("world.task.stationStart", "世界中转站启动：只递送各角色 CodeBuddy CLI 内核最终输出的群聊消息，不替角色决策，不复用项目主页智能体终端。"),
    createdAt
  });
}

function refreshWorldUiAfterStateChange(taskId = "") {
  saveState();
  const world = getWorld();
  const engine = window.CossWorldEngineInstance;
  if (state.activeSidebarSection === "worlds" && world && engine?.updateWorld) {
    engine.updateWorld(world);
    const badge = document.querySelector('[data-action="show-world-chat"] .button-badge');
    if (badge) badge.textContent = String(world.chatMessages?.length || 0);
  } else {
    render();
  }
  const chatModal = document.querySelector(".world-chat-modal");
  if (chatModal) {
    updateWorldChatModal(chatModal.dataset.worldChatTaskId || taskId || "");
  }
}

function updateWorldChatModal(taskId = "") {
  const world = getWorld();
  if (!world) return;
  const chatList = document.querySelector(".world-chat-list");
  if (!chatList) {
    showWorldChatModal(taskId);
    return;
  }
  const modal = document.querySelector(".world-chat-modal");
  const filterTask = modal?.dataset?.filterTask || "";
  const filterRole = modal?.dataset?.filterRole || "";
  const filterMode = modal?.dataset?.filterMode || "recent";

  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const filtered = (world.chatMessages || []).filter((message) => {
    if (taskId && message.taskId !== taskId) return false;
    if (filterTask && message.taskId !== filterTask) return false;
    if (filterRole && message.roleId !== filterRole) return false;
    if (filterMode === "recent") {
      const msgTime = new Date(message.createdAt).getTime();
      if (msgTime < threeDaysAgo) return false;
    }
    return true;
  });

  const content = filtered.length ? filtered.map((message) => {
    const role = getRole(message.roleId);
    const isSystem = message.roleId === "system";
    return `
      <div class="world-chat-message ${isSystem ? "system" : "agent"}">
        <div class="world-chat-avatar">${escapeHtml(isSystem ? "系" : trRoleName(role).slice(0, 1))}</div>
        <div class="world-chat-bubble">
          <div class="world-chat-meta"><strong>${escapeHtml(isSystem ? t("role.system.name", "系统") : trRoleName(role))}</strong><span>${escapeHtml(formatDateTime(message.createdAt))}</span></div>
          <p>${escapeHtml(message.content || "")}</p>
        </div>
      </div>
    `;
  }).join("") : `<div class="message-empty"><strong>${escapeHtml(t("world.chat.empty.title", "暂无聊天记录"))}</strong><p>${escapeHtml(t("world.chat.empty.desc", "点击公告栏发布任务后，角色会在这里进行一轮交流。"))}</p></div>`;
  chatList.innerHTML = content;

  const indicator = document.querySelector(".world-chat-new-msg");
  if (indicator) {
    const isAtBottom = chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight <= 60;
    if (isAtBottom) {
      indicator.classList.remove("visible");
    } else {
      const newCount = filtered.length - (chatList.dataset.renderedCount || 0);
      const btn = indicator.querySelector(".new-msg-btn");
      if (btn) {
        btn.textContent = t("world.chat.newMessages", "{{count}} 条新消息", { count: newCount > 0 ? newCount : 1 });
      }
      indicator.classList.add("visible");
    }
  }
  chatList.dataset.renderedCount = filtered.length;
}

function showWorldChatModal(taskId = "") {
  const world = getWorld();
  if (!world) return;

  // 提取所有 task 和 role 用于筛选下拉
  const tasks = (world.tasks || []).slice(0, 20);
  const agents = (world.agents || []);
  const chatMembers = getWorldChatMembers(world);
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

  const messages = (world.chatMessages || []).filter((message) => {
    if (taskId && message.taskId !== taskId) return false;
    const msgTime = new Date(message.createdAt).getTime();
    if (msgTime < threeDaysAgo) return false;
    return true;
  });

  const renderMessage = (message) => {
    const role = getRole(message.roleId);
    const isSystem = message.roleId === "system";
    return `
      <div class="world-chat-message ${isSystem ? "system" : "agent"}">
        <div class="world-chat-avatar">${escapeHtml(isSystem ? "系" : trRoleName(role).slice(0, 1))}</div>
        <div class="world-chat-bubble">
          <div class="world-chat-meta"><strong>${escapeHtml(isSystem ? t("role.system.name", "系统") : trRoleName(role))}</strong><span>${escapeHtml(formatDateTime(message.createdAt))}</span></div>
          <p>${escapeHtml(message.content || "")}</p>
        </div>
      </div>
    `;
  };

  const content = messages.length ? messages.map(renderMessage).join("") : `<div class="message-empty"><strong>${escapeHtml(t("world.chat.empty.title", "暂无聊天记录"))}</strong><p>${escapeHtml(t("world.chat.empty.desc", "点击公告栏发布任务后，角色会在这里进行一轮交流。"))}</p></div>`;

  const taskOptions = `<option value="">${escapeHtml(t("world.chat.filterAllTasks", "全部任务"))}</option>` +
    tasks.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.goal?.slice(0, 30))}</option>`).join("");
  const roleOptions = `<option value="">${escapeHtml(t("world.chat.filterAllRoles", "全部角色"))}</option>` +
    agents.map((a) => `<option value="${escapeHtml(a.roleId)}">${escapeHtml(trRoleName(getRole(a.roleId)))}</option>`).join("");

  renderModal(`
    <div class="modal world-chat-modal" data-world-chat-task-id="${escapeHtml(taskId || "")}" data-filter-task="" data-filter-role="" data-filter-mode="recent">
      <div class="world-chat-titlebar">
        <div class="world-chat-titlebar-title">
          <h2>${escapeHtml(t("world.chat.title", "世界群聊"))}</h2>
          <p>${escapeHtml(t("world.chat.desc", "这里以微信群聊样式展示角色 Agent 交流记录。"))} · ${chatMembers.length}/${agents.length} 位居民已入群</p>
        </div>
        <button class="secondary-button" data-action="show-world-member-picker">加入成员</button>
        <button class="world-chat-close-button" type="button" data-action="close-modal" aria-label="${escapeHtml(t("common.close", "关闭"))}">×</button>
      </div>
      <div class="world-chat-filter-bar">
        <button class="world-chat-filter-btn active" data-action="filter-mode" data-mode="recent">${escapeHtml(t("world.chat.filterRecent", "近3天"))}</button>
        <button class="world-chat-filter-btn" data-action="filter-mode" data-mode="history">${escapeHtml(t("world.chat.filterHistory", "历史记录"))}</button>
        <div class="world-chat-filter-extras" style="display:none">
          <select class="world-chat-filter-select" data-action="filter-task">
            ${taskOptions}
          </select>
          <select class="world-chat-filter-select" data-action="filter-role">
            ${roleOptions}
          </select>
        </div>
      </div>
      <div class="world-chat-list">${content}</div>
      <div class="world-chat-new-msg">
        <button class="new-msg-btn" data-action="scroll-to-bottom">${escapeHtml(t("world.chat.newMessages", "{{count}} 条新消息", { count: 0 }))}</button>
      </div>
    </div>
  `);
  const chatList = document.querySelector(".world-chat-list");
  if (chatList) {
    chatList.scrollTop = chatList.scrollHeight;
    chatList.dataset.renderedCount = messages.length;
    chatList.addEventListener("scroll", () => {
      const indicator = document.querySelector(".world-chat-new-msg");
      if (!indicator) return;
      const isAtBottom = chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight <= 60;
      if (isAtBottom) indicator.classList.remove("visible");
    });
  }
}

// ================= 世界核心操作函数 =================
function publishWorldTask(goal) {
  const world = getWorld();
  if (!world) return;
  setWorldTaskStatus(t("world.task.status.publishing", "正在发布..."), "info");
  const createdAt = new Date().toISOString();
  const task = {
    id: uid("world-task"),
    goal,
    status: "created",
    createdAt,
    updatedAt: createdAt
  };
  world.tasks ||= [];
  world.tasks.unshift(task);
  world.chatMessages ||= [];
  const chatMembers = getWorldChatMembers(world);
  if (!chatMembers.length) {
    addWorldChatMessage(world, {
      type: "announcement",
      roleId: "system",
      taskId: task.id,
      content: t("world.task.announcement", "公告栏发布新任务：{{goal}}", { goal }),
      createdAt
    });
    addWorldChatMessage(world, {
      type: "system",
      roleId: "system",
      taskId: task.id,
      content: "当前公告栏任务没有执行者：请先在世界群聊右上角点击「加入成员」，选择至少一位居民。",
      createdAt
    });
  } else {
    createWorldTaskConversation(world, task, createdAt);
  }
  closeModal();
  saveState();
  render();
  showWorldChatModal(task.id);
  if (chatMembers.length) {
    runWorldTaskConversation(world.id, task.id).catch((error) => {
      const failedWorld = getWorldById(world.id);
      const failedTask = failedWorld?.tasks?.find((item) => item.id === task.id);
      if (!failedWorld || !failedTask) return;
      const failedAt = new Date().toISOString();
      failedTask.status = "failed";
      failedTask.updatedAt = failedAt;
      addWorldChatMessage(failedWorld, {
        type: "system",
        roleId: "system",
        taskId: task.id,
        content: t("world.task.runFailed", "世界 Agent 运行失败：{{error}}", { error: error.message }),
        createdAt: failedAt
      });
      refreshWorldUiAfterStateChange(task.id);
    });
  }
}

function createDefaultWorldResident(role, index, homePosition = null) {
  const position = homePosition || WORLD_AGENT_POSITIONS[index % WORLD_AGENT_POSITIONS.length];
  return {
    id: uid("world-agent"),
    roleId: role.id,
    name: role.name,
    status: "idle",
    animation: "idle",
    location: "home",
    x: position.x,
    y: position.y,
    homeX: position.x,
    homeY: position.y,
    movement: null,
    createdAt: new Date().toISOString()
  };
}

function getWorldObjectRoleId(object) {
  if (object?.roleId) return String(object.roleId);
  const roleProperty = Array.isArray(object?.properties)
    ? object.properties.find((property) => property?.name === "roleId")
    : null;
  return String(roleProperty?.value || "");
}

function getGeneratedWorldHomePositions(objects = []) {
  return Object.fromEntries(objects
    .filter((object) => object?.type === "role-house" && getWorldObjectRoleId(object))
    .map((object) => [getWorldObjectRoleId(object), {
      x: Number(object.x) + Number(object.width || 6) / 2 - 0.5,
      y: Number(object.y) + Number(object.height || 4) - 0.5
    }]));
}

function getWorldChatMemberRoleIds(world) {
  return Array.isArray(world?.chatMemberRoleIds) ? world.chatMemberRoleIds : [];
}

function getWorldChatMembers(world) {
  const memberRoleIds = new Set(getWorldChatMemberRoleIds(world));
  return (world?.agents || []).filter((agent) => memberRoleIds.has(agent.roleId));
}

function addWorldChatMember(roleId) {
  const world = getWorld();
  const agent = (world?.agents || []).find((item) => item.roleId === roleId);
  if (!world || !agent) return;
  world.chatMemberRoleIds ||= [];
  if (!world.chatMemberRoleIds.includes(roleId)) world.chatMemberRoleIds.push(roleId);
  closeModal();
  saveState();
  render();
}

function removeWorldChatMember(roleId) {
  const world = getWorld();
  if (!world) return;
  world.chatMemberRoleIds = getWorldChatMemberRoleIds(world).filter((id) => id !== roleId);
  closeModal();
  saveState();
  render();
}

function showWorldMemberPickerModal() {
  const world = getWorld();
  if (!world) return;
  const active = new Set(getWorldChatMemberRoleIds(world));
  const rows = (world.agents || []).map((agent) => {
    const role = getRole(agent.roleId);
    const isMember = active.has(agent.roleId);
    return `
      <div class="world-member-picker-row">
        <div><strong>${escapeHtml(trRoleName(role))}</strong><span>${escapeHtml(isMember ? "当前群聊成员" : "世界居民 · 尚未入群")}</span></div>
        ${isMember
          ? `<button class="secondary-button" data-action="remove-world-chat-member" data-role-id="${escapeHtml(agent.roleId)}">移出群聊</button>`
          : `<button class="primary-button" data-action="add-world-chat-member" data-role-id="${escapeHtml(agent.roleId)}">加入成员</button>`}
      </div>
    `;
  }).join("");
  renderModal(`
    <div class="modal world-member-picker-modal">
      <h2>加入世界居民</h2>
      <p>只有加入当前世界群聊的居民，才会在公告栏任务发布后出门、领取任务并执行工作。</p>
      <div class="world-member-picker-list">${rows || `<div class="message-empty">暂无世界居民</div>`}</div>
      <div class="modal-actions"><button class="secondary-button" data-action="close-modal">完成</button></div>
    </div>
  `);
}

function createWorldAgent(roleId, x, y) {
  const world = getWorld();
  const role = ROLE_TEMPLATES.find((item) => item.id === roleId);
  if (!world || !role || (world.agents || []).some((agent) => agent.roleId === roleId)) return;
  const index = (world.agents || []).length;
  const position = WORLD_AGENT_POSITIONS[index % WORLD_AGENT_POSITIONS.length];
  const agent = {
    id: uid("world-agent"),
    roleId: role.id,
    name: role.name,
    status: "idle",
    animation: "idle",
    location: "home",
    x: position.x,
    y: position.y,
    homeX: position.x,
    homeY: position.y,
    movement: null,
    createdAt: new Date().toISOString()
  };
  world.agents ||= [];
  world.agents.push(agent);
  closeModal();
  saveState();
  render();
}

function ensureWorldShape(world) {
  if (!world || typeof world !== "object") return null;
  world.id = String(world.id || uid("world"));
  world.name = String(world.name || t("world.create.name.default", "新世界")).trim() || t("world.create.name.default", "新世界");
  world.path = String(world.path || "").trim();
  world.createdAt = world.createdAt || new Date().toISOString();
  world.lastOpenedAt = world.lastOpenedAt || world.createdAt;
  world.terrain = world.terrain || "pixel-meadow";
  world.objects = Array.isArray(world.objects) ? world.objects : [];
  const hadAgents = Array.isArray(world.agents) && world.agents.length > 0;
  const hadChatMembers = Array.isArray(world.chatMemberRoleIds);
  world.agents = Array.isArray(world.agents) ? world.agents : [];
  const legacyAgentRoleIds = world.agents.map((agent) => agent.roleId);
  world.chatMessages = Array.isArray(world.chatMessages) ? world.chatMessages : [];
  world.tasks = Array.isArray(world.tasks) ? world.tasks : [];
  const previousMap = world.map || {};
  const generator = window.CossWorldGenerator;
  const isDefaultMap = !previousMap.key || previousMap.key === WORLD_MAP_DEFAULT.key;
  const existingRoleHouseCount = world.objects.filter((object) => object?.type === "role-house").length;
  const needsGeneratedLayout = isDefaultMap && (
    previousMap.generation !== generator?.version
    || existingRoleHouseCount !== ROLE_TEMPLATES.length
    || !Array.isArray(previousMap.tileLayers)
  );
  if (needsGeneratedLayout && generator?.generateWorldLayout) {
    const generated = generator.generateWorldLayout({
      seed: world.id,
      roles: ROLE_TEMPLATES.map((role) => ({ id: role.id, name: role.name }))
    });
    world.map = generated.map;
    world.objects = generated.objects;
    world.camera = { x: 0, y: 0, zoom: 0.5 };
  } else if (isDefaultMap) {
    world.map = {
      ...WORLD_MAP_DEFAULT,
      horizonRows: 4,
      focusX: WORLD_MAP_DEFAULT.width / 2,
      focusY: 10.5,
      cameraSafeInsetX: 14,
      cameraSafeInsetBottom: 14,
      tiledUrl: "",
      ...previousMap
    };
    if (!world.objects.length) world.objects = WORLD_DEFAULT_OBJECTS;
  } else {
    world.map = { ...WORLD_MAP_DEFAULT, ...previousMap };
  }
  world.camera = {
    x: Number.isFinite(Number(world.camera?.x)) ? Number(world.camera.x) : 0,
    y: Number.isFinite(Number(world.camera?.y)) ? Number(world.camera.y) : 0,
    zoom: Number.isFinite(Number(world.camera?.zoom)) ? Number(world.camera.zoom) : 0.5
  };
  const homePositions = getGeneratedWorldHomePositions(world.objects);
  const normalizedAgents = world.agents.filter((agent) => ROLE_TEMPLATES.some((role) => role.id === agent.roleId)).map((existing, index) => {
    const position = WORLD_AGENT_POSITIONS[index % WORLD_AGENT_POSITIONS.length];
    const generatedHome = homePositions[existing.roleId];
    const homeX = Number.isFinite(Number(generatedHome?.x))
      ? Number(generatedHome.x)
      : (Number.isFinite(Number(existing.homeX)) ? Number(existing.homeX) : position.x);
    const homeY = Number.isFinite(Number(generatedHome?.y))
      ? Number(generatedHome.y)
      : (Number.isFinite(Number(existing.homeY)) ? Number(existing.homeY) : position.y);
    const location = existing.location || "home";
    const isAtHome = location === "home" && !existing.movement;
    return {
      ...existing,
      x: isAtHome ? homeX : (Number.isFinite(Number(existing.x)) ? Number(existing.x) : homeX),
      y: isAtHome ? homeY : (Number.isFinite(Number(existing.y)) ? Number(existing.y) : homeY),
      homeX,
      homeY,
      location,
      movement: existing.movement || null,
      animation: existing.animation || "idle"
    };
  });
  ROLE_TEMPLATES.forEach((role, index) => {
    if (!normalizedAgents.some((agent) => agent.roleId === role.id)) {
      normalizedAgents.push(createDefaultWorldResident(role, index, homePositions[role.id]));
    }
  });
  world.agents = normalizedAgents;
  world.activeInteriorRoleId = ROLE_TEMPLATES.some((role) => role.id === world.activeInteriorRoleId)
    ? world.activeInteriorRoleId
    : "";
  const legacyMemberIds = hadChatMembers
    ? world.chatMemberRoleIds
    : (hadAgents ? legacyAgentRoleIds : []);
  world.chatMemberRoleIds = Array.from(new Set((legacyMemberIds || []).filter((roleId) => normalizedAgents.some((agent) => agent.roleId === roleId))));
  return world;
}

function getAvailableWorldRoles(world = getWorld()) {
  const usedRoleIds = new Set((world?.agents || []).map((agent) => agent.roleId));
  return ROLE_TEMPLATES.filter((role) => !usedRoleIds.has(role.id));
}

function showWorldList() {
  state.activeSidebarSection = "worlds";
  if (!state.activeWorldId && state.worlds?.[0]) {
    state.activeWorldId = state.worlds[0].id;
  }
  saveState();
  render();
}

function showDeleteWorldModal(worldId) {
  const world = state.worlds.find((item) => item.id === worldId);
  if (!world) return;
  renderModal(`
    <div class="modal">
      <h2>${escapeHtml(t("world.delete.title", "删除世界"))}</h2>
      <p>${escapeHtml(t("world.delete.desc", "这会从世界列表中移除该世界，世界文件夹不会被删除。"))}</p>
      <div class="message-empty">
        <strong>${escapeHtml(world.name)}</strong>
        <p>${escapeHtml(world.path || "")}</p>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.cancel", "取消"))}</button>
        <button class="secondary-button danger" data-action="confirm-delete-world" data-world-id="${escapeHtml(world.id)}">${escapeHtml(t("world.delete.confirm", "删除世界"))}</button>
      </div>
    </div>
  `);
}

function deleteWorld(worldId) {
  const world = state.worlds.find((item) => item.id === worldId);
  if (!world) return;
  state.worlds = state.worlds.filter((item) => item.id !== worldId);
  if (state.activeWorldId === worldId) {
    state.activeWorldId = state.worlds?.[0]?.id || "";
  }
  closeModal();
  saveState();
  render();
}

function showCreateWorldModal() {
  closeMenus();
  const defaultPath = getWorld()?.path || "";
  renderModal(`
    <div class="modal">
      <h2>${escapeHtml(t("world.create.title", "新建世界"))}</h2>
      <p>${escapeHtml(t("world.create.desc", "世界是从 0 开始的 Agent 场景空间。创建后可在地图中左键创建角色与房子，通过公告栏发布任务，并在群聊中查看角色交流记录。"))}</p>
      <div class="field">
        <label for="worldName">${escapeHtml(t("world.create.name.label", "世界名称"))}</label>
        <input id="worldName" value="${escapeHtml(t("world.create.name.default", "新世界"))}" />
      </div>
      <div class="field">
        <label for="worldPath">${escapeHtml(t("world.create.path.label", "保存文件夹"))}</label>
        <div class="path-picker-row">
          <input id="worldPath" value="${escapeHtml(defaultPath)}" placeholder="${escapeHtml(t("world.create.path.placeholder", "请选择世界保存文件夹"))}" />
          <button class="secondary-button" data-action="choose-world-directory">${escapeHtml(t("project.create.chooseFolder", "选择文件夹"))}</button>
        </div>
        <div id="worldPathStatus" class="form-status muted">${escapeHtml(t("world.create.path.placeholder", "请选择世界保存文件夹"))}</div>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.cancel", "取消"))}</button>
        <button class="primary-button" data-action="create-world">${escapeHtml(t("world.create.submit", "创建并打开"))}</button>
      </div>
    </div>
  `);
}

function createWorldFromModal() {
  const nameInput = document.getElementById("worldName");
  const pathInput = document.getElementById("worldPath");
  const name = nameInput?.value?.trim();
  const path = pathInput?.value?.trim();
  if (!name) {
    setWorldModalStatus(t("world.create.validation.nameRequired", "请填写世界名称。"));
    return;
  }
  if (!path) {
    setWorldModalStatus(t("world.create.validation.pathRequired", "请先指定世界保存文件夹。"));
    return;
  }
  const world = ensureWorldShape({
    name,
    path,
    terrain: "pixel-meadow",
    agents: [],
    chatMessages: [],
    tasks: []
  });
  state.worlds = state.worlds || [];
  state.worlds.push(world);
  state.activeWorldId = world.id;
  state.activeSidebarSection = "worlds";
  closeModal();
  saveState();
  render();
}

function selectWorld(worldId) {
  state.activeWorldId = worldId;
  state.activeSidebarSection = "worlds";
  const world = getWorldById(worldId);
  if (world) world.lastOpenedAt = new Date().toISOString();
  saveState();
  render();
}

function chooseWorldDirectoryFromModal() {
  const currentPath = document.getElementById("worldPath")?.value || "";
  if (window.cossAPI?.selectProjectDirectory) {
    window.cossAPI.selectProjectDirectory(currentPath).then((result) => {
      const pathInput = document.getElementById("worldPath");
      const pathStatus = document.getElementById("worldPathStatus");
      if (pathInput && result?.path) {
        pathInput.value = result.path;
      }
      if (pathStatus) {
        pathStatus.textContent = t("world.create.status.pathSelected", "已选择世界保存文件夹。");
        pathStatus.className = "form-status ready";
      }
    }).catch(() => {});
  }
}

function setWorldModalStatus(message, type = "error") {
  const status = document.getElementById("worldPathStatus");
  if (status) {
    status.textContent = message;
    status.className = "form-status " + type;
  }
}

// ================= 世界弹窗函数 =================
function showWorldTaskPublisherModal() {
  closeMenus();
  renderModal(`
    <div class="modal world-task-modal">
      <h2>${escapeHtml(t("world.task.publisherTitle", "公告栏发布任务"))}</h2>
      <p>${escapeHtml(t("world.task.publisherDesc", "发布后，世界系统只做中转：角色 Agent 会自行发起群聊交流，确认各自模块后开始执行；每个角色绑定独立世界 CLI 内核并使用完全访问权限。"))}</p>
      <div class="field">
        <label for="worldTaskGoal">${escapeHtml(t("world.task.goal", "任务内容"))}</label>
        <textarea id="worldTaskGoal" placeholder="${escapeHtml(t("world.task.placeholder", "例如：制作登录页面并完成验收测试"))}"></textarea>
      </div>
      <div id="worldTaskStatus" class="form-status muted"></div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.cancel", "取消"))}</button>
        <button class="primary-button" data-action="publish-world-task">${escapeHtml(t("world.task.publish", "发布任务"))}</button>
      </div>
    </div>
  `);
}

function setWorldTaskStatus(message, type = "error") {
  const status = document.getElementById("worldTaskStatus");
  if (!status) return;
  status.textContent = message;
  status.className = "form-status " + type;
}

function showCreateWorldAgentModal(x, y) {
  const world = getWorld();
  const availableRoles = getAvailableWorldRoles(world);
  const roleButtons = availableRoles.length ? availableRoles.map((role) => `
    <button class="world-role-choice" data-action="create-world-agent" data-role-id="${escapeHtml(role.id)}" data-x="${escapeHtml(x || 0)}" data-y="${escapeHtml(y || 0)}">
      <strong>${escapeHtml(role.name)}</strong>
      <span>${escapeHtml(role.description)}</span>
    </button>
  `).join("") : `
    <div class="message-empty">
      <strong>${escapeHtml(t("world.agentCreate.allCreated", "角色已全部创建"))}</strong>
      <p>${escapeHtml(t("world.agentCreate.allCreatedDesc", "当前世界已经拥有所有内置角色 Agent。"))}</p>
    </div>
  `;
  renderModal(`
    <div class="modal world-agent-create-modal">
      <h2>${escapeHtml(t("world.agentCreate.title", "创建角色 Agent"))}</h2>
      <p>${escapeHtml(t("world.agentCreate.desc", "选择一个角色，系统会在点击位置生成占位角色精灵和对应的小房子。"))}</p>
      <div class="world-role-grid">${roleButtons}</div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.cancel", "取消"))}</button>
      </div>
    </div>
  `);
}

function showWorldAgentActionModal(roleId) {
  const world = getWorld();
  const role = getRole(roleId);
  const agent = (world?.agents || []).find((item) => item.roleId === role.id);
  const kernel = agent ? ensureWorldAgentKernel(agent, world || {}) : null;
  const runs = (kernel?.runs || []).slice().reverse();
  const latestRun = runs[0] || null;
  const runRows = runs.length ? runs.slice(0, 6).map((run) => `
    <div class="world-agent-run-row ${escapeHtml(run.status)}">
      <div class="world-agent-run-head">
        <strong>${escapeHtml(getWorldAgentRunLabel(run))}</strong>
        <span>${escapeHtml(run.completedAt ? formatDateTime(run.completedAt) : run.status)}</span>
      </div>
      <label>${escapeHtml(t("world.agentRun.input", "CodeBuddy CLI 输入"))}</label>
      <pre>${escapeHtml(run.input || t("world.agentRun.emptyInput", "暂无输入。"))}</pre>
      <label>${escapeHtml(t("world.agentRun.output", "最终聊天输出"))}</label>
      <pre>${escapeHtml(run.output || run.error || t("world.agentRun.emptyOutput", "暂无最终输出。"))}</pre>
      ${run.rawOutput ? `<label>${escapeHtml(t("world.agentRun.rawOutput", "终端原始输出"))}</label><pre class="raw-output">${escapeHtml(run.rawOutput)}</pre>` : ""}
    </div>
  `).join("") : `
    <div class="message-empty">
      <strong>${escapeHtml(t("world.agentRun.empty.title", "暂无 CodeBuddy 运行记录"))}</strong>
      <p>${escapeHtml(t("world.agentRun.empty.desc", "点击公告栏发布任务后，这里会显示该角色收到的 CLI 输入和最终群聊输出。"))}</p>
    </div>
  `;
  renderModal(`
    <div class="modal world-agent-run-modal">
      <h2>${escapeHtml(trRoleName(role))}</h2>
      <p>${escapeHtml(trRoleDescription(role))}</p>
      <div class="world-agent-kernel-summary">
        <span>${escapeHtml(kernel ? getWorldAgentKernelLine(agent, world) : t("world.agentRun.noAgent", "该角色尚未入住世界。"))}</span>
        ${latestRun ? `<span>${escapeHtml(t("world.agentRun.latest", "最近运行：{{label}}", { label: getWorldAgentRunLabel(latestRun) }))}</span>` : ""}
      </div>
      <div class="world-agent-run-list">${runRows}</div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="show-world-chat">${escapeHtml(t("world.chat.title", "世界群聊"))}</button>
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.close", "关闭"))}</button>
      </div>
    </div>
  `);
}

async function handleWorldObjectAction(object) {
  const roleId = getWorldObjectRoleId(object);
  if ((object.action === "enter-world-home" || object.type === "role-house") && roleId) {
    try {
      await window.CossWorldEngineInstance?.playDoorAnimation?.(roleId, 520);
    } catch {
      // Entering the room must still work if an animation frame cannot be loaded.
    }
    enterWorldHome(roleId);
    return;
  }
  if (object.action === "publish-world-task") {
    showWorldTaskPublisherModal();
    return;
  }
  if (object.action === "open-world-chat") {
    showWorldChatModal();
    return;
  }
  if (object.action === "create-world-agent") {
    showCreateWorldAgentModal(Number(object.x) + 2, Number(object.y) + 4);
    return;
  }
  if (object.action === "open-agent-house" && roleId) {
    showWorldAgentActionModal(roleId);
  }
}

function enterWorldHome(roleId) {
  const world = getWorld();
  if (!world || !ROLE_TEMPLATES.some((role) => role.id === roleId)) return;
  world.activeInteriorRoleId = roleId;
  saveState();
  render();
}

function leaveWorldHome() {
  const world = getWorld();
  if (!world || !world.activeInteriorRoleId) return;
  world.activeInteriorRoleId = "";
  saveState();
  render();
}
