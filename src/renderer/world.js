/**
 * Agent 世界的居民协作、群聊、任务流转与界面交互。
 */

// ================= 居民协作提示词 =================
function getWorldOtherChatMembers(world, agent) {
  return getWorldChatMembers(world).filter((member) => member.id !== agent.id);
}

function formatWorldPromptRoleReference(agent) {
  const role = getRole(agent.roleId);
  return `@${role.id}（${trRoleName(role)}）`;
}

function buildWorldAgentPrompt(world, task, agent, phase, round) {
  const role = getRole(agent.roleId);
  const otherAgents = getWorldOtherChatMembers(world, agent);
  const otherAgentsInfo = otherAgents.length
    ? otherAgents.map((member) => `- ${formatWorldPromptRoleReference(member)}`).join("\n")
    : "暂无其他群聊成员";
  
  const phaseInstruction = phase === "module-claim"
    ? "请认领你负责的工作，并在需要协作时 @当前群聊成员说明具体事项。"
    : "请向当前群聊同步工作进展，并说明需要其他成员协作的事项。";
  
  const transcript = getWorldChatTranscript(world, task.id, true) || "暂无聊天记录。";
  
  return [
    `你是 CosS Agent 世界的居民：${trRoleName(role)}（${role.id}）。`,
    `公告栏任务：${task.goal}`,
    "",
    "当前群聊其他成员：",
    otherAgentsInfo,
    "",
    "协作要求：",
    "- 本阶段只生成要发送到世界群聊的消息，不执行命令或修改文件。",
    "- 当前任务独立于项目工作区，请勿调用项目工作区的任务协作流程。",
    "- 使用简洁、自然的纯文本，不要输出 Markdown、JSON 或代码块。",
    `- @${role.id} 表示由你继续执行；@其他成员ID 表示将具体事项交给对应成员。`,
    "- 以「世界群聊最终消息：」开头输出你的群聊消息（仅一行）。",
    "",
    "当前群聊上下文：",
    transcript,
    "",
    phaseInstruction,
  ].join("\n");
}

// ================= 群聊提及解析 =================
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

// ================= 居民消息队列 =================
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
  const memberRoleIds = new Set(getWorldChatMemberRoleIds(world));
  const agent = (world.agents || []).find((item) => (
    item.roleId === roleId && memberRoleIds.has(item.roleId)
  ));
  return agent ? agent.id : null;
}

// ================= 居民执行提示词 =================
function buildWorldAgentExecutionPrompt(world, task, agent, queueItem) {
  const role = getRole(agent.roleId);
  const transcript = getWorldChatTranscript(world, task.id, true) || "暂无聊天记录。";
  const otherChatMembers = getWorldOtherChatMembers(world, agent);
  const otherAgentNames = otherChatMembers.map(formatWorldPromptRoleReference).join("、");
  const handoffInstruction = otherChatMembers.length
    ? "完成后只能用 @当前群聊成员ID 接续下一位处理者；如果不需要转交，直接说明已完成。"
    : "当前群聊没有其他成员；完成后直接说明已完成，不要 @未入群角色。";
  const finalMessageTemplate = otherChatMembers.length
    ? "世界群聊最终消息：总结：[完成内容]。@群聊成员ID, [下一位需处理的事项]。"
    : "世界群聊最终消息：总结：[完成内容]。";

  return [
    `你是 CosS Agent 世界的居民：${trRoleName(role)}。`,
    `居民 ID：${role.id}，职责：${trRoleDescription(role)}`,
    "",
    `收到的协作事项（来自 @${queueItem.fromRoleId}）：`,
    queueItem.content,
    "",
    `当前群聊其他成员：${otherAgentNames || "暂无"}`,
    "",
    "执行要求：",
    "- 完成上述协作事项，并清晰说明完成内容。",
    `- ${handoffInstruction}`,
    "- 使用自然、简洁的纯文本，不要输出 Markdown、JSON 或代码块。",
    "",
    "当前群聊上下文：",
    transcript,
    "",
    "---",
    finalMessageTemplate,
    "---",
  ].join("\n");
}

// ================= 居民任务执行 =================
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
      const residentExists = (world.agents || []).some((item) => item.roleId === mention.targetRoleId);
      addWorldChatMessage(world, {
        type: "system",
        roleId: "system",
        taskId,
        content: residentExists
          ? t("world.task.memberUnavailable", "居民 @{{roleId}} 尚未加入当前群聊，本次任务未转发。请先在群聊右上角点击「加入成员」，再重新发布任务。", { roleId: mention.targetRoleId })
          : t("world.task.roleUnknown", "未找到角色 @{{roleId}}，本次任务未转发。请确认角色 ID，并且仅 @当前群聊成员。", { roleId: mention.targetRoleId }),
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
  if (!targetAgent || !getWorldChatMemberRoleIds(world).includes(targetAgent.roleId)) {
    return { ok: false, error: "Target agent is not a current world chat member" };
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
    const briefErr = result?.error || t("world.task.noOutput", "执行服务未返回可展示的结果。");
    const errorMsg = t("world.task.roleFailed", "{{role}} 执行任务时遇到问题：{{error}}", {
      role: trRoleName(role),
      error: briefErr
    });
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

// ================= 任务完成处理 =================
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
    content: t("world.task.completed", "本次公告栏任务已完成。你可以在群聊中查看各成员提交的工作结果。"),
    createdAt: completedAt,
    round: "summary"
  });

  refreshWorldUiAfterStateChange(taskId);
}

const WORLD_AGENT_MOTION = Object.freeze({
  doorDuration: 640,
  millisecondsPerTile: 115,
  minimumSegmentDuration: 260,
  maximumSegmentDuration: 1800,
  boardPauseDuration: 420,
  boardClaimInset: 0.15
});

function getWorldAnnouncementBoardPosition(world) {
  const board = (world?.objects || []).find((object) => object.action === "publish-world-task" || object.id === "announcement-board");
  const x = Number(board?.x);
  const y = Number(board?.y);
  const width = Number(board?.width || 3);
  const height = Number(board?.height || 2);
  return {
    x: Number.isFinite(x) ? x + width / 2 : 31,
    // Tuck the resident slightly inside the board footprint; Y-depth still renders them in front.
    y: Number.isFinite(y) ? y + height - WORLD_AGENT_MOTION.boardClaimInset : 30
  };
}

function getWorldAnnouncementClaimPosition(world, index, total) {
  const board = getWorldAnnouncementBoardPosition(world);
  const columns = Math.min(5, Math.max(1, total));
  const row = Math.floor(index / columns);
  const rowCount = Math.min(columns, total - row * columns);
  const column = index % columns;
  return {
    x: board.x + (column - (rowCount - 1) / 2) * 0.9,
    y: board.y + row * 0.95
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

function appendWorldTravelWaypoint(path, point, from) {
  const previous = path[path.length - 1] || from;
  if (Math.hypot(Number(point.x) - Number(previous.x), Number(point.y) - Number(previous.y)) < 0.08) return;
  path.push({ x: Number(point.x), y: Number(point.y) });
}

function getWorldAgentTravelPath(world, from, target, index, phase) {
  const focusX = Number(world?.map?.focusX) || 44;
  const plaza = { left: focusX - 5, right: focusX + 5, top: 7, bottom: 13, centerY: 10 };
  const home = phase === "return-home" ? target : from;
  let entry;
  if (home.y <= plaza.top) {
    entry = { x: Math.min(plaza.right, Math.max(plaza.left, home.x)), y: plaza.top };
  } else if (home.y >= plaza.bottom) {
    entry = { x: Math.min(plaza.right, Math.max(plaza.left, home.x)), y: plaza.bottom };
  } else if (home.x < plaza.left) {
    entry = { x: plaza.left, y: Math.min(plaza.bottom, Math.max(plaza.top, home.y)) };
  } else {
    entry = { x: plaza.right, y: Math.min(plaza.bottom, Math.max(plaza.top, home.y)) };
  }
  const horizontalFirst = index % 2 === 0;
  const corner = horizontalFirst
    ? { x: entry.x, y: home.y }
    : { x: home.x, y: entry.y };
  const rawPath = phase === "return-home"
    ? [
        { x: from.x, y: plaza.centerY },
        { x: entry.x, y: plaza.centerY },
        entry,
        corner,
        target
      ]
    : [
        corner,
        entry,
        { x: entry.x, y: plaza.centerY },
        { x: target.x, y: plaza.centerY },
        target
      ];
  return rawPath.reduce((path, point) => {
    appendWorldTravelWaypoint(path, point, from);
    return path;
  }, []);
}

function getWorldAgentSegmentDuration(from, to, options = {}) {
  const distance = Math.hypot(Number(to.x) - Number(from.x), Number(to.y) - Number(from.y));
  const calculated = distance * (Number(options.millisecondsPerTile) || WORLD_AGENT_MOTION.millisecondsPerTile);
  return Math.round(Math.min(
    Number(options.maximumSegmentDuration) || WORLD_AGENT_MOTION.maximumSegmentDuration,
    Math.max(Number(options.minimumSegmentDuration) || WORLD_AGENT_MOTION.minimumSegmentDuration, calculated)
  ));
}

function waitForWorldMotion(duration) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(duration) || 0)));
}

async function getReadyWorldEngine() {
  let engine = window.CossWorldEngineInstance;
  if (!engine) {
    render();
    engine = window.CossWorldEngineInstance;
  }
  if (engine?.ready) await engine.ready.catch(() => {});
  return engine;
}

async function playWorldAgentDepartureDoors(world, agents) {
  if (!agents.length) return;
  const engine = await getReadyWorldEngine();
  engine?.updateWorld?.(world);
  await Promise.all(agents.map((agent) => (
    engine?.playDoorAnimation?.(agent.roleId, WORLD_AGENT_MOTION.doorDuration) || Promise.resolve()
  )));
}

async function moveWorldAgents(world, agents, targetFactory, location, options = {}) {
  const motions = agents.map((agent, index) => {
    const from = { x: Number(agent.x || 0), y: Number(agent.y || 0) };
    const target = targetFactory(agent, index, agents.length);
    const path = options.pathFactory
      ? options.pathFactory(agent, from, target, index)
      : [target];
    const firstTarget = path[0] || target;
    agent.movement = {
      phase: options.phase || "moving",
      fromX: from.x,
      fromY: from.y,
      toX: target.x,
      toY: target.y,
      direction: getWorldMovementDirection(from, firstTarget),
      segmentIndex: 0,
      totalSegments: path.length,
      path
    };
    agent.animation = "running";
    agent.status = options.status || "running";
    return { agent, from, target, path };
  });
  if (!motions.length) return;
  saveState();
  const engine = await getReadyWorldEngine();
  engine?.updateWorld?.(world);
  await Promise.all(motions.map(async ({ agent, from, target, path }) => {
    let segmentFrom = from;
    const waypoints = path.length ? path : [target];
    for (let segmentIndex = 0; segmentIndex < waypoints.length; segmentIndex += 1) {
      const waypoint = waypoints[segmentIndex];
      const direction = getWorldMovementDirection(segmentFrom, waypoint);
      const duration = getWorldAgentSegmentDuration(segmentFrom, waypoint, options);
      agent.movement.segmentIndex = segmentIndex;
      agent.movement.direction = direction;
      if (engine?.moveAgent) {
        await engine.moveAgent(agent.id, waypoint, {
          duration,
          direction,
          phase: options.phase || "moving",
          doorAtEnd: Boolean(options.doorAtEnd && segmentIndex === waypoints.length - 1),
          doorDuration: WORLD_AGENT_MOTION.doorDuration,
          commitHomeAtDoor: location === "home" && segmentIndex === waypoints.length - 1,
          homeStatus: options.homeStatus || "planning"
        });
      } else {
        await waitForWorldMotion(duration);
      }
      agent.x = waypoint.x;
      agent.y = waypoint.y;
      segmentFrom = waypoint;
    }
  }));

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
  if (options.arrivalPause) await waitForWorldMotion(options.arrivalPause);
}

async function moveWorldAgentsToBoard(world, agents) {
  await playWorldAgentDepartureDoors(world, agents);
  return moveWorldAgents(world, agents, (_agent, index, total) => getWorldAnnouncementClaimPosition(world, index, total), "announcement-board", {
    phase: "to-board",
    status: "running",
    boardStatus: "planning",
    arrivalPause: WORLD_AGENT_MOTION.boardPauseDuration,
    pathFactory: (_agent, from, target, index) => getWorldAgentTravelPath(world, from, target, index, "to-board")
  });
}

async function moveWorldAgentsHome(world, agents) {
  return moveWorldAgents(world, agents, (agent) => getWorldAgentHomePosition(agent), "home", {
    phase: "return-home",
    status: "running",
    homeStatus: "planning",
    doorAtEnd: true,
    pathFactory: (_agent, from, target, index) => getWorldAgentTravelPath(world, from, target, index, "return-home")
  });
}

// ================= 公告栏任务编排 =================
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
  // Agent turns can refresh persisted world state, so resolve the live residents again
  // before mutating return-home movement metadata.
  const returningAgents = agentIds
    .map((agentId) => world.agents?.find((agent) => agent.id === agentId))
    .filter(Boolean);
  await moveWorldAgentsHome(world, returningAgents);

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
    const briefErr = result?.error || t("world.task.noOutput", "执行服务未返回可展示的结果。");
    const errorMsg = t("world.task.roleFailed", "{{role}} 执行任务时遇到问题：{{error}}", {
      role: trRoleName(role),
      error: briefErr
    });
    addWorldChatMessage(world, {
      type: "system",
      roleId: "system",
      taskId,
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
    "product-manager": t("world.module.pm", "需求分析与任务规划"),
    "tech-lead": t("world.module.tl", "技术方案与代码审查"),
    "frontend-engineer": t("world.module.fe", "前端界面与交互实现"),
    "backend-engineer": t("world.module.be", "后端接口与业务逻辑"),
    "qa-engineer": t("world.module.qa", "测试验证与质量保障"),
    "ai-agent-engineer": t("world.module.ai", "AI Agent 集成与工具链"),
    "devops-engineer": t("world.module.devops", "持续集成、部署与运行保障"),
    "technical-writer": t("world.module.docs", "技术文档与交付说明"),
    "security-engineer": t("world.module.security", "安全评审与风险控制")
  };
  return m[roleId] || t("world.module.default", "当前角色职责");
}

function ensureWorldAgentKernel(agent, world) {
  if (!agent.kernel) {
    agent.kernel = { terminalId: uid("wrn"), runs: [], status: "idle" };
  }
  return agent.kernel;
}

function getWorldAgentKernelLine(agent, world) {
  const kernel = agent.kernel;
  if (!kernel) return t("world.agentRun.noAgent", "该居民尚未入住当前世界。");
  return t("world.agentRun.kernelLine", "执行引擎：{{provider}}", {
    provider: kernel.providerLabel || "CodeBuddy Code"
  });
}

function getWorldAgentRunLabel(run) {
  if (!run) return t("world.run.empty", "任务记录");
  const phaseLabel = run.phase === "module-claim" ? t("world.run.claim", "任务认领") : t("world.run.execute", "任务执行");
  return `${phaseLabel} #${run.round || 1}`;
}

function getWorldAgentRunStatusLabel(status) {
  const labels = {
    idle: t("world.run.status.idle", "待处理"),
    planning: t("world.run.status.planning", "准备中"),
    running: t("world.run.status.running", "执行中"),
    processing: t("world.run.status.processing", "处理中"),
    waiting: t("world.run.status.waiting", "等待中"),
    done: t("world.run.status.done", "已完成"),
    blocked: t("world.run.status.blocked", "已阻塞"),
    failed: t("world.run.status.failed", "执行失败")
  };
  return labels[status] || String(status || t("world.run.status.idle", "待处理"));
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
    content: t("world.task.announcement", "公告栏已发布任务：{{goal}}", { goal: task.goal }),
    createdAt
  });
  addWorldChatMessage(world, {
    type: "system",
    roleId: "system",
    taskId: task.id,
    content: t("world.task.stationStart", "任务协作已开始。当前群聊成员将前往公告栏领取任务，并在群聊中同步工作进展。"),
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

function getWorldRolePortraitUrl(roleId) {
  return window.CossWorldAssets?.role?.(roleId)?.portrait || "";
}

function renderWorldRoleAvatar(roleId, label, extraClass = "") {
  const portraitUrl = getWorldRolePortraitUrl(roleId);
  const classes = ["world-role-avatar", extraClass].filter(Boolean).join(" ");
  const safeLabel = String(label || roleId || "Agent");
  return `
    <span class="${escapeHtml(classes)}" data-role-avatar="${escapeHtml(roleId || "")}" role="img" aria-label="${escapeHtml(`${safeLabel}头像`)}">
      ${portraitUrl
        ? `<img src="${escapeHtml(portraitUrl)}" alt="" draggable="false" loading="lazy">`
        : `<span class="world-role-avatar-fallback">${escapeHtml(safeLabel.slice(0, 1))}</span>`}
    </span>
  `;
}

function renderWorldChatMessage(message) {
  const role = getRole(message.roleId);
  const isSystem = message.roleId === "system";
  const roleName = isSystem ? t("role.system.name", "系统") : trRoleName(role);
  const avatar = isSystem
    ? `<span class="world-chat-avatar is-system" role="img" aria-label="${escapeHtml(`${roleName}头像`)}">系</span>`
    : renderWorldRoleAvatar(message.roleId, roleName, "world-chat-avatar");
  return `
    <div class="world-chat-message ${isSystem ? "system" : "agent"}">
      ${avatar}
      <div class="world-chat-bubble">
        <div class="world-chat-meta"><strong>${escapeHtml(roleName)}</strong><span>${escapeHtml(formatDateTime(message.createdAt))}</span></div>
        <p>${escapeHtml(message.content || "")}</p>
      </div>
    </div>
  `;
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

  const content = filtered.length ? filtered.map(renderWorldChatMessage).join("") : `<div class="message-empty"><strong>${escapeHtml(t("world.chat.empty.title", "暂无群聊消息"))}</strong><p>${escapeHtml(t("world.chat.empty.desc", "发布公告栏任务后，已入群居民的协作消息会显示在这里。"))}</p></div>`;
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

  const content = messages.length ? messages.map(renderWorldChatMessage).join("") : `<div class="message-empty"><strong>${escapeHtml(t("world.chat.empty.title", "暂无群聊消息"))}</strong><p>${escapeHtml(t("world.chat.empty.desc", "发布公告栏任务后，已入群居民的协作消息会显示在这里。"))}</p></div>`;

  const taskOptions = `<option value="">${escapeHtml(t("world.chat.filterAllTasks", "全部任务"))}</option>` +
    tasks.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.goal?.slice(0, 30))}</option>`).join("");
  const roleOptions = `<option value="">${escapeHtml(t("world.chat.filterAllRoles", "全部居民"))}</option>` +
    agents.map((a) => `<option value="${escapeHtml(a.roleId)}">${escapeHtml(trRoleName(getRole(a.roleId)))}</option>`).join("");

  renderModal(`
    <div class="modal world-chat-modal" data-world-chat-task-id="${escapeHtml(taskId || "")}" data-filter-task="" data-filter-role="" data-filter-mode="recent">
      <div class="world-chat-titlebar">
        <div class="world-chat-titlebar-title">
          <h2>${escapeHtml(t("world.chat.title", "世界群聊"))}</h2>
          <p>${escapeHtml(t("world.chat.desc", "查看居民围绕公告栏任务产生的协作消息。"))} · ${escapeHtml(t("world.chat.memberCount", "{{joined}}/{{total}} 位居民已加入", { joined: chatMembers.length, total: agents.length }))}</p>
        </div>
        <button class="secondary-button" data-action="show-world-member-picker">加入成员</button>
        <button class="world-chat-close-button" type="button" data-action="close-modal" aria-label="${escapeHtml(t("common.close", "关闭"))}">×</button>
      </div>
      <div class="world-chat-filter-bar">
        <button class="world-chat-filter-btn active" data-action="filter-mode" data-mode="recent">${escapeHtml(t("world.chat.filterRecent", "最近 3 天"))}</button>
        <button class="world-chat-filter-btn" data-action="filter-mode" data-mode="history">${escapeHtml(t("world.chat.filterHistory", "全部记录"))}</button>
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
  setWorldTaskStatus(t("world.task.status.publishing", "正在发布任务…"), "info");
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
      content: t("world.task.announcement", "公告栏已发布任务：{{goal}}", { goal }),
      createdAt
    });
    addWorldChatMessage(world, {
      type: "system",
      roleId: "system",
      taskId: task.id,
      content: t("world.task.noMembers", "任务已发布，但当前群聊中没有成员。请先点击世界群聊右上角的「加入成员」，至少选择一位居民后重新发布。"),
      createdAt
    });
  } else {
    createWorldTaskConversation(world, task, createdAt);
  }
  closeModal();
  saveState();
  render();
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
        content: t("world.task.runFailed", "任务执行失败：{{error}}", { error: error.message }),
        createdAt: failedAt
      });
      refreshWorldUiAfterStateChange(task.id);
    });
  } else {
    showWorldChatModal(task.id);
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
    const roleName = trRoleName(role);
    return `
      <div class="world-member-picker-row" data-role-id="${escapeHtml(agent.roleId)}" data-chat-member="${isMember ? "true" : "false"}">
        <div class="world-member-picker-identity">
          ${renderWorldRoleAvatar(agent.roleId, roleName, "world-member-picker-avatar")}
          <div class="world-member-picker-copy"><strong>${escapeHtml(roleName)}</strong><span>${escapeHtml(isMember ? t("world.member.status.joined", "已加入当前群聊") : t("world.member.status.available", "尚未加入群聊"))}</span></div>
        </div>
        ${isMember
          ? `<button class="secondary-button" data-action="remove-world-chat-member" data-role-id="${escapeHtml(agent.roleId)}">${escapeHtml(t("world.member.remove", "移出群聊"))}</button>`
          : `<button class="primary-button" data-action="add-world-chat-member" data-role-id="${escapeHtml(agent.roleId)}">${escapeHtml(t("world.member.add", "加入群聊"))}</button>`}
      </div>
    `;
  }).join("");
  renderModal(`
    <div class="modal world-member-picker-modal">
      <h2>${escapeHtml(t("world.member.title", "管理群聊成员"))}</h2>
      <p>${escapeHtml(t("world.member.desc", "只有加入当前群聊的居民，才会接收公告栏任务并参与协作。"))}</p>
      <div class="world-member-picker-list">${rows || `<div class="message-empty">${escapeHtml(t("world.member.empty", "当前世界暂无居民。"))}</div>`}</div>
      <div class="modal-actions"><button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.ok", "确定"))}</button></div>
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
  world.name = String(world.name || t("world.create.name.default", "我的 Agent 小镇")).trim() || t("world.create.name.default", "我的 Agent 小镇");
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
      <h2>${escapeHtml(t("world.delete.title", "移除世界"))}</h2>
      <p>${escapeHtml(t("world.delete.desc", "此操作只会将世界从 CosS 列表中移除，不会删除保存文件夹中的数据。"))}</p>
      <div class="message-empty">
        <strong>${escapeHtml(world.name)}</strong>
        <p>${escapeHtml(world.path || "")}</p>
      </div>
      <div class="modal-actions">
        <button class="secondary-button" data-action="close-modal">${escapeHtml(t("common.cancel", "取消"))}</button>
        <button class="secondary-button danger" data-action="confirm-delete-world" data-world-id="${escapeHtml(world.id)}">${escapeHtml(t("world.delete.confirm", "确认移除"))}</button>
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
      <p>${escapeHtml(t("world.create.desc", "创建一个独立的 Agent 协作空间。每个世界拥有专属地图、居民、群聊与任务记录。"))}</p>
      <div class="field">
        <label for="worldName">${escapeHtml(t("world.create.name.label", "世界名称"))}</label>
        <input id="worldName" value="${escapeHtml(t("world.create.name.default", "我的 Agent 小镇"))}" />
      </div>
      <div class="field">
        <label for="worldPath">${escapeHtml(t("world.create.path.label", "世界数据文件夹"))}</label>
        <div class="path-picker-row">
          <input id="worldPath" value="${escapeHtml(defaultPath)}" placeholder="${escapeHtml(t("world.create.path.placeholder", "请选择用于保存世界数据的文件夹"))}" />
          <button class="secondary-button" data-action="choose-world-directory">${escapeHtml(t("project.create.chooseFolder", "选择文件夹"))}</button>
        </div>
        <div id="worldPathStatus" class="form-status muted">${escapeHtml(t("world.create.path.placeholder", "请选择用于保存世界数据的文件夹"))}</div>
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
    setWorldModalStatus(t("world.create.validation.pathRequired", "请先选择世界数据文件夹。"));
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
        pathStatus.textContent = t("world.create.status.pathSelected", "已选择世界数据文件夹。");
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
      <h2>${escapeHtml(t("world.task.publisherTitle", "发布公告栏任务"))}</h2>
      <p>${escapeHtml(t("world.task.publisherDesc", "任务发布后，只有当前群聊成员会前往公告栏领取任务，随后返回各自房间开始工作。"))}</p>
      <div class="field">
        <label for="worldTaskGoal">${escapeHtml(t("world.task.goal", "任务说明"))}</label>
        <textarea id="worldTaskGoal" placeholder="${escapeHtml(t("world.task.placeholder", "例如：设计并实现登录页面，完成测试与验收"))}"></textarea>
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
      <strong>${escapeHtml(t("world.agentCreate.allCreated", "所有居民均已入住"))}</strong>
      <p>${escapeHtml(t("world.agentCreate.allCreatedDesc", "当前世界已包含全部内置 Agent 居民。"))}</p>
    </div>
  `;
  renderModal(`
    <div class="modal world-agent-create-modal">
      <h2>${escapeHtml(t("world.agentCreate.title", "添加居民"))}</h2>
      <p>${escapeHtml(t("world.agentCreate.desc", "选择一个尚未入住的角色，为其安排住宅并加入当前世界。"))}</p>
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
  const roleName = trRoleName(role);
  const isChatMember = Boolean(agent && getWorldChatMemberRoleIds(world).includes(role.id));
  const chatMembershipLabel = isChatMember
    ? t("world.agentRun.member", "已加入群聊")
    : t("world.agentRun.notMember", "未加入群聊");
  const chatMembershipDetail = isChatMember
    ? t("world.agentRun.memberDesc", "会接收公告栏发布的任务并参与协作。")
    : t("world.agentRun.notMemberDesc", "不会接收公告栏任务；可在世界群聊中将其加入。");
  const runs = (kernel?.runs || []).slice().reverse();
  const latestRun = runs[0] || null;
  const runRows = runs.length ? runs.slice(0, 6).map((run) => `
    <div class="world-agent-run-row ${escapeHtml(run.status)}">
      <div class="world-agent-run-head">
        <strong>${escapeHtml(getWorldAgentRunLabel(run))}</strong>
        <span>${escapeHtml(run.completedAt ? formatDateTime(run.completedAt) : getWorldAgentRunStatusLabel(run.status))}</span>
      </div>
      <label>${escapeHtml(t("world.agentRun.input", "任务指令"))}</label>
      <pre>${escapeHtml(run.input || t("world.agentRun.emptyInput", "暂无任务指令。"))}</pre>
      <label>${escapeHtml(t("world.agentRun.output", "协作消息"))}</label>
      <pre>${escapeHtml(run.output || run.error || t("world.agentRun.emptyOutput", "暂无协作消息。"))}</pre>
      ${run.rawOutput ? `<label>${escapeHtml(t("world.agentRun.rawOutput", "执行日志（技术详情）"))}</label><pre class="raw-output">${escapeHtml(run.rawOutput)}</pre>` : ""}
    </div>
  `).join("") : `
    <div class="message-empty">
      <strong>${escapeHtml(t("world.agentRun.empty.title", "暂无任务记录"))}</strong>
      <p>${escapeHtml(t("world.agentRun.empty.desc", "发布公告栏任务后，这里会显示该居民收到的任务指令和提交的协作消息。"))}</p>
    </div>
  `;
  renderModal(`
    <div class="modal world-agent-run-modal">
      <div class="world-agent-profile-head">
        ${renderWorldRoleAvatar(role.id, roleName, "world-agent-profile-avatar")}
        <div class="world-agent-profile-copy">
          <div class="world-agent-profile-title-row">
            <h2>${escapeHtml(roleName)}</h2>
            <span class="world-agent-chat-membership ${isChatMember ? "is-member" : "is-not-member"}" data-world-chat-member="${isChatMember ? "true" : "false"}">${escapeHtml(chatMembershipLabel)}</span>
          </div>
          <p>${escapeHtml(trRoleDescription(role))}</p>
          <span class="world-agent-chat-membership-detail">${escapeHtml(chatMembershipDetail)}</span>
        </div>
      </div>
      <div class="world-agent-kernel-summary">
        <span>${escapeHtml(kernel ? getWorldAgentKernelLine(agent, world) : t("world.agentRun.noAgent", "该居民尚未入住当前世界。"))}</span>
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
