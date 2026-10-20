import {
  addMcpServer,
  disableMcpServer,
  disablePlugin,
  doctorMcp,
  enableMcpServer,
  enablePlugin,
  installPlugin,
  listMcpServers,
  listPlugins,
  logoutMcpServer,
  removeMcpServer,
} from "../grok-cli.mjs";
import { mergeMcpLiveStatus } from "../../shared/mcp-status.mjs";

/** CLI owns MCP/plugin configuration; OAuth uses the requesting window's live agent. */
export function registerIntegrationsIpc({
  ipcMain,
  sessionFromEvent,
  debugLog,
}) {
  /** Project cwd for grok mcp --scope project (user scope still works without). */
  function mcpCwdFromEvent(e) {
    const ws = sessionFromEvent(e);
    if (!ws) return undefined;
    const cwd = ws.agent?.cwd || ws.lastCwd;
    return cwd || undefined;
  }

  /** @param {unknown} err */
  function mcpIpcError(err) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String(/** @type {{ message?: unknown }} */ (err).message || err)
        : String(err || "CLI command failed");
    return {
      ok: false,
      data: null,
      stdout: "",
      stderr: message,
      code: null,
      error: message,
    };
  }

  ipcMain.handle("mcp:list", async (e, opts = {}) => {
    const listed = await listMcpServers({ cwd: mcpCwdFromEvent(e) });
    const agent = sessionFromEvent(e)?.agent;
    if (!listed?.servers || !agent?.ready || !agent.sessionId) {
      return { ...listed, liveOk: false };
    }
    try {
      const live = await agent.listMcpSessionCatalog({
        cache: opts?.cache !== false,
      });
      return {
        ...listed,
        liveOk: true,
        servers: mergeMcpLiveStatus(listed.servers, live, {
          assumeInitializing: true,
        }),
      };
    } catch (err) {
      debugLog("mcp", "live-list-failed", {
        error: err?.message || String(err),
      });
      return {
        ...listed,
        liveOk: false,
        servers: mergeMcpLiveStatus(listed.servers, [], {
          assumeInitializing: true,
        }),
      };
    }
  });

  ipcMain.handle("mcp:add", async (e, spec = {}) => {
    const cwd = mcpCwdFromEvent(e);
    if (spec?.scope === "project" && !cwd) {
      return mcpIpcError("Open a project to add a project-scoped MCP server.");
    }
    try {
      return await addMcpServer(spec || {}, { cwd });
    } catch (err) {
      return mcpIpcError(err);
    }
  });

  ipcMain.handle("mcp:enable", async (e, name) => {
    try {
      return await enableMcpServer(name, { cwd: mcpCwdFromEvent(e) });
    } catch (err) {
      return mcpIpcError(err);
    }
  });

  ipcMain.handle("mcp:disable", async (e, name) => {
    try {
      return await disableMcpServer(name, { cwd: mcpCwdFromEvent(e) });
    } catch (err) {
      return mcpIpcError(err);
    }
  });

  ipcMain.handle("mcp:remove", async (e, payload) => {
    const name = typeof payload === "string" ? payload : payload?.name;
    const scope =
      typeof payload === "object" && payload ? payload.scope : undefined;
    try {
      return await removeMcpServer(name, { cwd: mcpCwdFromEvent(e), scope });
    } catch (err) {
      return mcpIpcError(err);
    }
  });

  ipcMain.handle("mcp:doctor", async (e, name) => {
    try {
      return await doctorMcp(name, { cwd: mcpCwdFromEvent(e) });
    } catch (err) {
      return mcpIpcError(err);
    }
  });

  ipcMain.handle("mcp:logout", async (_e, name) => {
    try {
      return await logoutMcpServer(name);
    } catch (err) {
      return mcpIpcError(err);
    }
  });

  ipcMain.handle("mcp:auth", async (e, name) => {
    const ws = sessionFromEvent(e);
    const agent = ws?.agent;
    if (!agent?.ready || !agent.sessionId) {
      return {
        ok: false,
        status: "failed",
        serverName: String(name || ""),
        error:
          "Open a project first. Sign-in uses the live agent so Grok can open the browser.",
      };
    }
    try {
      return await agent.authenticateMcpServer(name);
    } catch (err) {
      return {
        ok: false,
        status: "failed",
        serverName: String(name || ""),
        error: err?.message || String(err),
      };
    }
  });

  ipcMain.handle("plugin:list", async (e) => {
    return listPlugins({ cwd: mcpCwdFromEvent(e) });
  });

  ipcMain.handle("plugin:enable", async (e, name) => {
    try {
      return await enablePlugin(name, { cwd: mcpCwdFromEvent(e) });
    } catch (err) {
      return mcpIpcError(err);
    }
  });

  ipcMain.handle("plugin:disable", async (e, name) => {
    try {
      return await disablePlugin(name, { cwd: mcpCwdFromEvent(e) });
    } catch (err) {
      return mcpIpcError(err);
    }
  });

  ipcMain.handle("plugin:install", async (e, source) => {
    try {
      return await installPlugin(source, { cwd: mcpCwdFromEvent(e) });
    } catch (err) {
      return mcpIpcError(err);
    }
  });
}
