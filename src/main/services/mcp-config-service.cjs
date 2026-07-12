const fs = require("fs");
const path = require("path");

function createMcpConfigService({
  resolveNodeCommandForMcp,
  getStorageDirectory,
  getProjectRoot,
  writeJsonAtomic,
  getLogDirectory,
  appendLogEvent = () => undefined,
  serializeError = (error) => ({ message: error?.message || String(error) }),
  appVersion = ""
} = {}) {
  function getMcpServerInfo(context = {}) {
    const serverPath = path.resolve(__dirname, "..", "..", "coss-mcp-server.cjs");
    const command = resolveNodeCommandForMcp();
    const args = [
      serverPath,
      "--user-data",
      getStorageDirectory()
    ];
    if (context.projectId) {
      args.push("--project-id", context.projectId);
    }
    if (context.roleId) {
      args.push("--role-id", context.roleId);
    }
    if (context.taskId) {
      args.push("--task-id", context.taskId);
    }
    if (context.sessionId) {
      args.push("--session-id", context.sessionId);
    }
    return {
      name: "coss-mcp",
      command,
      args,
      serverPath,
      cwd: path.dirname(path.dirname(serverPath)),
      userData: getStorageDirectory(),
      projectId: context.projectId || "",
      roleId: context.roleId || "",
      taskId: context.taskId || "",
      sessionId: context.sessionId || ""
    };
  }
  
  function buildMcpServerEntry(context = {}) {
    const info = getMcpServerInfo(context);
    const env = {
      COSS_MCP_USER_DATA: info.userData
    };
    if (info.projectId) {
      env.COSS_MCP_PROJECT_ID = info.projectId;
    }
  
    return {
      type: "stdio",
      description: "CosS v0.10 Kernel MCP tools for durable task context, leased steps, structured results, locks, approvals, and projections.",
      defer_loading: false,
      command: info.command,
      args: info.args,
      env
    };
  }
  
  function readProjectMcpJsonConfig(filePath) {
    if (!fs.existsSync(filePath)) {
      return { data: {}, backupPath: "" };
    }
  
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(".mcp.json must be a JSON object");
      }
      return { data: parsed, backupPath: "" };
    } catch (error) {
      const backupPath = `${filePath}.invalid-${Date.now()}.bak`;
      fs.copyFileSync(filePath, backupPath);
      appendLogEvent("mcp.project-config.invalid-backed-up", {
        filePath,
        backupPath,
        error: serializeError(error)
      }, "warn");
      return { data: {}, backupPath };
    }
  }
  
  function writeProjectMcpConfig(_event, request = {}) {
    try {
      const root = getProjectRoot(request.projectPath);
      const projectId = String(request.projectId || "").trim();
      const generatedAt = new Date().toISOString();
      const serverEntry = buildMcpServerEntry({ projectId });
      const rootConfigPath = path.join(root, ".mcp.json");
      const cossConfigPath = path.join(root, ".coss", "mcp", "coss-mcp.json");
      const existingRootConfig = readProjectMcpJsonConfig(rootConfigPath);
      const rootConfig = existingRootConfig.data;
      const existingServers = rootConfig.mcpServers && typeof rootConfig.mcpServers === "object" && !Array.isArray(rootConfig.mcpServers)
        ? rootConfig.mcpServers
        : {};
  
      rootConfig.mcpServers = {
        ...existingServers,
        coss: serverEntry
      };
  
      const cossConfig = {
        generatedBy: "CosS",
        appVersion,
        generatedAt,
        projectId,
        projectPath: root,
        mcpServers: {
          coss: serverEntry
        },
        tools: [
          "coss_get_context",
          "coss_list_roles",
          "coss_get_task_board",
          "coss_pool_read",
          "coss_pool_claim",
          "coss_list_tasks",
          "coss_claim_task",
          "coss_claim_step",
          "coss_heartbeat_step",
          "coss_release_step",
          "coss_get_kernel_events",
          "coss_report_status",
          "coss_submit_result",
          "coss_acquire_lock",
          "coss_release_lock",
          "coss_request_approval"
        ],
        note: "CosS v0.10 Agents must use the Kernel task board, leased step claiming, structured results, locks, and approvals."
      };
  
      writeJsonAtomic(cossConfigPath, cossConfig);
      writeJsonAtomic(rootConfigPath, rootConfig);
      appendLogEvent("mcp.project-config.written", {
        projectPath: root,
        projectId,
        rootConfigPath,
        cossConfigPath,
        backupPath: existingRootConfig.backupPath,
        serverName: "coss"
      });
  
      return {
        ok: true,
        projectPath: root,
        projectId,
        rootConfigPath,
        cossConfigPath,
        backupPath: existingRootConfig.backupPath,
        server: serverEntry
      };
    } catch (error) {
      appendLogEvent("mcp.project-config.write.failed", {
        projectPath: request.projectPath,
        projectId: request.projectId,
        error: serializeError(error)
      }, "error");
      return { ok: false, error: error.message };
    }
  }
  
  function readJsonConfigSnapshot(filePath) {
    if (!fs.existsSync(filePath)) {
      return {
        path: filePath,
        exists: false,
        valid: false,
        error: "",
        data: null,
        modifiedAt: "",
        size: 0
      };
    }
  
    const stat = fs.statSync(filePath);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const isObject = data && typeof data === "object" && !Array.isArray(data);
      return {
        path: filePath,
        exists: true,
        valid: isObject,
        error: isObject ? "" : "JSON root is not an object.",
        data: isObject ? data : null,
        modifiedAt: stat.mtime.toISOString(),
        size: stat.size
      };
    } catch (error) {
      return {
        path: filePath,
        exists: true,
        valid: false,
        error: error.message,
        data: null,
        modifiedAt: stat.mtime.toISOString(),
        size: stat.size
      };
    }
  }
  
  function areStringArraysEqual(left = [], right = []) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => String(item) === String(right[index]));
  }
  
  function getMcpServerMatchStatus(actual, expected) {
    const server = actual && typeof actual === "object" && !Array.isArray(actual) ? actual : null;
    if (!server) {
      return {
        hasServer: false,
        commandMatches: false,
        argsMatches: false,
        envMatches: false,
        matches: false,
        command: "",
        args: [],
        env: {}
      };
    }
  
    const env = server.env && typeof server.env === "object" && !Array.isArray(server.env) ? server.env : {};
    const expectedEnv = expected.env || {};
    const envMatches = Object.keys(expectedEnv).every((key) => String(env[key] || "") === String(expectedEnv[key] || ""));
    const typeMatches = String(server.type || "stdio") === String(expected.type || "stdio");
    const commandMatches = String(server.command || "") === String(expected.command || "");
    const argsMatches = areStringArraysEqual(server.args || [], expected.args || []);
  
    return {
      hasServer: true,
      typeMatches,
      commandMatches,
      argsMatches,
      envMatches,
      matches: typeMatches && commandMatches && argsMatches && envMatches,
      type: String(server.type || ""),
      command: String(server.command || ""),
      args: Array.isArray(server.args) ? server.args : [],
      env
    };
  }
  
  function checkProjectMcpConfig(_event, request = {}) {
    try {
      const root = getProjectRoot(request.projectPath);
      const projectId = String(request.projectId || "").trim();
      const expectedServer = buildMcpServerEntry({ projectId });
      const rootConfigPath = path.join(root, ".mcp.json");
      const cossConfigPath = path.join(root, ".coss", "mcp", "coss-mcp.json");
      const rootSnapshot = readJsonConfigSnapshot(rootConfigPath);
      const cossSnapshot = readJsonConfigSnapshot(cossConfigPath);
      const rootServerStatus = getMcpServerMatchStatus(rootSnapshot.data?.mcpServers?.coss, expectedServer);
      const cossServerStatus = getMcpServerMatchStatus(cossSnapshot.data?.mcpServers?.coss, expectedServer);
      const cossMetaMatches = cossSnapshot.valid
        && String(cossSnapshot.data?.projectId || "") === projectId
        && String(cossSnapshot.data?.generatedBy || "") === "CosS";
      const ok = rootSnapshot.valid
        && cossSnapshot.valid
        && rootServerStatus.matches
        && cossServerStatus.matches
        && cossMetaMatches;
  
      const result = {
        ok,
        projectPath: root,
        projectId,
        checkedAt: new Date().toISOString(),
        rootConfig: {
          path: rootConfigPath,
          exists: rootSnapshot.exists,
          valid: rootSnapshot.valid,
          error: rootSnapshot.error,
          modifiedAt: rootSnapshot.modifiedAt,
          size: rootSnapshot.size,
          ...rootServerStatus
        },
        cossConfig: {
          path: cossConfigPath,
          exists: cossSnapshot.exists,
          valid: cossSnapshot.valid,
          error: cossSnapshot.error,
          modifiedAt: cossSnapshot.modifiedAt,
          size: cossSnapshot.size,
          metaMatches: cossMetaMatches,
          ...cossServerStatus
        },
        expectedServer,
        fixAvailable: true
      };
  
      appendLogEvent("mcp.project-config.checked", {
        projectPath: root,
        projectId,
        ok,
        rootConfig: {
          exists: result.rootConfig.exists,
          valid: result.rootConfig.valid,
          matches: result.rootConfig.matches
        },
        cossConfig: {
          exists: result.cossConfig.exists,
          valid: result.cossConfig.valid,
          matches: result.cossConfig.matches,
          metaMatches: result.cossConfig.metaMatches
        }
      }, ok ? "info" : "warn");
  
      return result;
    } catch (error) {
      appendLogEvent("mcp.project-config.check.failed", {
        projectPath: request.projectPath,
        projectId: request.projectId,
        error: serializeError(error)
      }, "error");
      return { ok: false, error: error.message, fixAvailable: false };
    }
  }
  
  function readMcpAuditEvents(_event, request = {}) {
    const limit = Math.min(Math.max(Number.parseInt(request.limit || "80", 10) || 80, 1), 200);
    const roleId = String(request.roleId || "").trim();
    const taskId = String(request.taskId || "").trim();
    const tool = String(request.tool || "").trim().toLowerCase();
    const query = String(request.query || "").trim().toLowerCase();
    const logDirectory = getLogDirectory();
    const matchesAuditFilters = (entry) => {
      const payload = entry.payload || {};
      const text = JSON.stringify({ event: entry.event, payload }).toLowerCase();
      if (roleId) {
        const roleValues = [
          payload.roleId,
          payload.fromRoleId,
          ...(Array.isArray(payload.toRoleIds) ? payload.toRoleIds : [])
        ].map((value) => String(value || ""));
        if (!roleValues.includes(roleId)) {
          return false;
        }
      }
      if (taskId && String(payload.taskId || "") !== taskId) {
        return false;
      }
      if (tool) {
        const payloadTool = String(payload.tool || payload.toolName || "").toLowerCase();
        if (payloadTool !== tool && !String(entry.event || "").toLowerCase().includes(tool)) {
          return false;
        }
      }
      if (query && !text.includes(query)) {
        return false;
      }
      return true;
    };
  
    try {
      if (!fs.existsSync(logDirectory)) {
        return { ok: true, logDirectory, events: [] };
      }
  
      const files = fs.readdirSync(logDirectory)
        .filter((name) => name.endsWith(".jsonl"))
        .sort()
        .reverse()
        .slice(0, 8);
      const events = [];
  
      for (const fileName of files) {
        const filePath = path.join(logDirectory, fileName);
        const lines = fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).filter(Boolean).reverse();
        for (const line of lines) {
          if (events.length >= limit) {
            break;
          }
          try {
            const entry = JSON.parse(line);
            if (String(entry.event || "").startsWith("mcp.") && matchesAuditFilters(entry)) {
              events.push({
                timestamp: entry.timestamp || "",
                level: entry.level || "info",
                event: entry.event || "",
                payload: entry.payload || {},
                fileName
              });
            }
          } catch {
            // Ignore malformed log lines in the audit reader.
          }
        }
        if (events.length >= limit) {
          break;
        }
      }
  
      appendLogEvent("mcp.audit-events.read", { count: events.length, limit, roleId, taskId, tool, query });
      return { ok: true, logDirectory, events, filters: { roleId, taskId, tool, query } };
    } catch (error) {
      appendLogEvent("mcp.audit-events.read.failed", {
        logDirectory,
        error: serializeError(error)
      }, "error");
      return { ok: false, logDirectory, error: error.message, events: [] };
    }
  }
  
  return {
    getMcpServerInfo,
    buildMcpServerEntry,
    readProjectMcpJsonConfig,
    writeProjectMcpConfig,
    readJsonConfigSnapshot,
    areStringArraysEqual,
    getMcpServerMatchStatus,
    checkProjectMcpConfig,
    readMcpAuditEvents
  };
}

module.exports = { createMcpConfigService };
