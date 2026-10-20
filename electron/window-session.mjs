import { executionHasActiveWork } from './execution-work.mjs';
import { applyBackgroundUpdate } from '../shared/background-tasks.mjs';
import { assertApplicationSender } from './ipc-trust.mjs';
import fs from 'node:fs';
import { mapInterjectIpcError } from '../shared/acp-interject.mjs';
/**
 * Per-window agent sessions for File → New Window.
 *
 * Owns: BrowserWindow → agent map, ensureAgent lifecycle, dispose, IPC routing
 * helpers (sessionFromEvent / send). Main only creates windows + registers IPC.
 */
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { GrokAcpClient } from "./acp-client.mjs";
import { grokBinaryExists, resolveGrokBinary } from "./grok-home.mjs";
import { missingGrokBinaryMessage } from "./grok-cli.mjs";
import {
  cancelAllPermissions,
  listPendingPermissionRequests,
  pendingPermissionCount,
  registerPermissionRequest,
  settlePendingByPolicy,
} from "./pending-permissions.mjs";
import { startBackgroundTaskFileTail } from "./sessions.mjs";
import {
  debugLog,
  isDebugLogging,
  summarizeSessionUpdate,
} from "./debug-log.mjs";
import {
  isCancelledRestartError,
  restartTargetFromSources,
  shouldFallbackToNewSession,
} from "./agent-restart.mjs";
import { settleParked, wrapParked } from "./parked-request.mjs";
import { createExecutionHost, executionScope, resolveOwnedExecution, findExecution } from "./execution-ownership.mjs";
import { ExecutionQueue } from "./execution-queue.mjs";
import { readQueue, writeQueue } from "./queue-store.mjs";
import { applySessionUpdate, appendUserMessage } from "../shared/session-timeline.mjs";

export function allExecutionSessions() { return [...windowSessions.values()].flatMap(host => [...(host.records?.values() || [host])]); }
export function executionCatalog(host) {
  return [...(host.records?.values() || [])].filter(row => row.lastSessionId).map(row => ({
    ...executionScope(row), cwd: row.lastCwd, active: executionHasActiveWork(row),
    waiting: pendingPermissionCount(ownerIdFor(row)) + ['pendingPlanApprovals','pendingUserQuestions','pendingFolderTrust','pendingMcpElicits'].reduce((n,key)=>n+row[key].size,0),
    status: row.runtimeStatus, unseen: row.unseen, selected: host.selected === row,
  }));
}
export function publishExecutions(ws) {
  const host = ws.host || ws;
  if (!host.win.isDestroyed()) host.win.webContents.send('execution:catalog', executionCatalog(host));
  try {
    const file=path.join(app.getPath('userData'),'execution-state.json'),temporary=file+'.tmp';
    const windows=[...windowSessions.values()].map(owner=>({windowId:owner.win.id,chats:executionCatalog(owner)}));
    fs.writeFileSync(temporary,JSON.stringify({pid:process.pid,updatedAt:Date.now(),windows}));fs.renameSync(temporary,file);
  }catch{/* Runtime status is disposable; a locked diagnostic file must not interrupt a task. */}
}
export function selectExecution(record) {
  const host=record.host;
  if (!host) return;
  if(host.selected!==record)host.selected?.previewController?.hideExecutionPreview();
  host.selected=record; record.unseen=false;
  setWindowTitle(record, record.lastCwd);
  publishExecutions(record);
}
export function scopedExecutionIpc(nativeIpc,{isClosing=()=>false}={}) {
  return new Proxy(nativeIpc, { get(target, key) {
    if(key === 'on')return (channel,handler)=>target.on(channel,(event,...args)=>{try{assertTrustedShellEvent(event);handler(event,...args);}catch{/* Drop untrusted one-way messages. */}});
    if(key !== 'handle') { const value=target[key]; return typeof value==='function'?value.bind(target):value; }
    return (channel, handler) => target.handle(channel, async (event, ...args) => {
      assertTrustedShellEvent(event);
      if(isClosing()&&/^(agent:|execution:submit|execution:queue-action|project:|sessions:open)/.test(channel))throw Error('Update installation is starting');
      const last=args.at(-1);
      if(last && typeof last==='object' && last.__executionScope) { event.executionScope=last.__executionScope; args.pop(); }
      if(event.executionScope) sessionFromEvent(event); // Validate even handlers which do not consult their owner.
      if(['agent:set-model','agent:set-reasoning-effort','agent:set-context-window','agent:set-session-mode','agent:compact'].includes(channel)) {
        const record=sessionFromEvent(event);
        if(record?.lastCwd&&!record.agent?.ready)await ensureAgent(record,record.lastCwd,{resumeSessionId:record.lastSessionId});
      }
      return handler(event, ...args);
    });
  }});
}
export function ensureExecutionQueue(ws) {
  if (ws.queue) return ws.queue;
  const key=ws.lastCwd+'\0'+ws.lastSessionId;
  ws.queue = new ExecutionQueue({
    initial: readQueue(key),
    persist: items => writeQueue(key,items),
    changed: state => { ws.runtimeStatus=state.running?'running':state.outcome?.status||'idle'; send(ws,'execution:queue',state); publishExecutions(ws); },
    cancel: () => { clearPendingPermissions(ws); ws.agent?.cancel(); },
    interject: async item => {try{return await ws.agent.interject(item.text, {images:item.images||[],imageQuality:item.imageQuality,interjectionId:item.id});}catch(error){const mapped=mapInterjectIpcError(error,item.id);if(mapped)return mapped;throw error;}},
    deliver: async item => {
      const agent=await ensureAgent(ws,ws.lastCwd,{resumeSessionId:ws.lastSessionId});
      ws.readOnly=false;
      ws.liveItems=appendUserMessage(ws.liveItems||[],{text:item.timelineText||item.text,images:(item.images||[]).map(img=>({mimeType:img.mimeType,previewUrl:`data:${img.mimeType};base64,${img.data}`})),optimistic:true});
      send(ws,'execution:delivered',{item});
      try { const reply=await agent.prompt(item.text,{images:item.images||[],imageQuality:item.imageQuality||'compact'}); ws.unseen=ws.host?.selected!==ws; if(reply?.stopReason!=='cancelled')taskNotifier.show(ws,{kind:'complete',key:item.id}); return reply; }
      catch(error) { ws.unseen=true; taskNotifier.show(ws,{kind:'failed',key:item.id}); throw error; }
    },
  });
  return ws.queue;
}


let taskNotifier={show:()=>false,dismiss:()=>{}};
export function setTaskNotifier(notifier){taskNotifier=notifier;}

/**
 * Desktop state loader — set once from main at startup.
 * @type {() => Record<string, any>}
 */
let loadDesktopState = () => ({
  permissionMode: "ask",
  reasoningEffort: "high",
  allowOutsideProject: false,
  sandboxTerminal: true,
});

/**
 * Wire desktop-state.json loader (call from main whenReady / registerIpc).
 * @param {() => Record<string, any>} fn
 */
export function setDesktopStateLoader(fn) {
  if (typeof fn === "function") loadDesktopState = fn;
}

/** @type {(() => void) | null} */
let windowChromeListener = null;

/**
 * Native Window menu on Win/Linux rebuilds when titles change.
 * @param {(() => void) | null | undefined} fn
 */
export function setWindowChromeListener(fn) {
  windowChromeListener = typeof fn === "function" ? fn : null;
}

function notifyWindowChrome() {
  try {
    windowChromeListener?.();
  } catch {
    /* ignore */
  }
}

/**
 * Per-window session: each File → New Window owns its own agent process.
 * @typedef {{
 *   win: import('electron').BrowserWindow,
 *   agent: GrokAcpClient | null,
 *   agentChain: Promise<unknown>,
 *   stopBackgroundTaskTail: (() => void) | null,
 *   pendingPlanApprovals: Map<string, { settle: (decision: any) => void, params?: any }>,
 *   pendingUserQuestions: Map<string, { settle: (decision: any) => void, params?: any }>,
 *   pendingFolderTrust: Map<string, { settle: (decision: any) => void, params?: any }>,
 *   pendingMcpElicits: Map<string, { settle: (decision: any) => void, params?: any }>,
 *   disposed: boolean,
 *   generation: number,
 *   lastCwd: string | null,
 *   lastSessionId: string | null,
 *   openingCwd: string | null,
 *   pendingOpenCwd: string | null,
 *   settingsOpen: boolean,
 * }} WindowSession
 */

/**
 * Keep last project so Restart still works after a failed spawn nulled `agent`.
 * @param {WindowSession} ws
 * @param {string | null | undefined} cwd
 * @param {string | null | undefined} sessionId
 */
function rememberProjectOnWindow(ws, cwd, sessionId) {
  if (!ws || !cwd) return;
  ws.lastCwd = cwd;
  ws.lastSessionId = sessionId || null;
  broadcastOpenCheckouts();
}

/** @type {Map<number, WindowSession>} */
export const windowSessions = new Map();

/** @returns {string} */
export function ownerIdFor(ws) {
  return ws.recordId ? `${ws.win.id}:${ws.recordId}` : String(ws.win.id);
}

/**
 * @param {WindowSession} ws
 * @param {number} generation
 */
export function isSessionLive(ws, generation) {
  return (
    !ws.disposed &&
    Boolean(ws.win) &&
    !ws.win.isDestroyed() &&
    ws.generation === generation
  );
}

/**
 * @param {import('electron').IpcMainInvokeEvent | { sender?: Electron.WebContents }} event
 * @returns {WindowSession | null}
 */
export function assertTrustedShellEvent(event) {
  const win=BrowserWindow.fromWebContents(event?.sender);
  assertApplicationSender(event,{window:win,appPath:app.getAppPath(),developmentUrl:!app.isPackaged ? process.env.GROK_DESKTOP_DEV_URL || 'http://127.0.0.1:5173/' : undefined});
  if(!windowSessions.has(win.id))throw Error('Unknown application window');
  return win;
}

export function sessionFromEvent(event) {
  const wc = event?.sender;
  if (!wc || wc.isDestroyed?.()) return null;
  const win = BrowserWindow.fromWebContents(wc);
  if (!win || win.isDestroyed()) return null;
  const host=windowSessions.get(win.id);
  return host ? resolveOwnedExecution(host, event.executionScope) : null;
}

/** Focused window's session, else the first open window. */
export function focusedSession() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed() && windowSessions.has(focused.id)) {
    return windowSessions.get(focused.id) || null;
  }
  for (const ws of windowSessions.values()) {
    if (ws.win && !ws.win.isDestroyed()) return ws;
  }
  return null;
}

/**
 * @param {WindowSession} ws
 * @returns {WindowSession}
 */
export function trackWindowSession(ws) {
  windowSessions.set(ws.win.id, ws);
  ws.win.on("closed", () => {
    ws.closed=true;
    for(const record of ws.records?.values() || [ws]) void disposeWindowSession(record);
    windowSessions.delete(ws.win.id);
  });
  return ws;
}

/**
 * Push an IPC event to one window's renderer.
 * @param {WindowSession | null | undefined} ws
 * @param {string} channel
 * @param {unknown} [payload]
 */
export function send(ws, channel, payload) {
  if (!ws?.win || ws.win.isDestroyed()) return;
  if(channel==='agent:exit'||channel==='agent:error')ws.runtimeStatus='failed';
  if(channel==='agent:ready')ws.runtimeStatus=ws.queue?.running?'running':'idle';
  if (ws.host && (channel.startsWith('agent:') || channel.startsWith('execution:'))) {
    if(channel==='agent:session-update'){ws.liveItems=applySessionUpdate(ws.liveItems||[],payload);const previous=ws.backgroundTasks;ws.backgroundTasks=applyBackgroundUpdate(previous||[],payload);if(previous!==ws.backgroundTasks)publishExecutions(ws);}
    ws.win.webContents.send('execution:event',{scope:executionScope(ws),channel,payload});
    if(/request|dismiss|exit|error|ready|permissions-cleared/.test(channel)) publishExecutions(ws);
    if(ws.host.selected!==ws) return;
  }
  if(["agent:ready","agent:exit","agent:error"].includes(channel))ws.lastConnectionEvent={type:channel.slice(6),at:new Date().toISOString()};
  try {
    ws.win.webContents.send(channel, ws.host && payload && typeof payload==='object' && (channel.startsWith('agent:')||channel.startsWith('execution:')) ? {...payload,_executionScope:executionScope(ws)} : payload);
  } catch (err) {
    debugLog("ipc", "send-failed", {
      channel,
      error: err?.message || String(err),
    });
  }
}

/**
 * Open project folders across all live windows (agent cwd, last, or in-flight).
 * @returns {{ windowId: number, cwd: string, title: string }[]}
 */
export function collectOpenCheckouts() {
  /** @type {{ windowId: number, cwd: string, title: string }[]} */
  const rows = [];
  for (const ws of allExecutionSessions()) {
    if (ws.disposed || !ws.win || ws.win.isDestroyed()) continue;
    const cwd = ws.agent?.cwd || ws.lastCwd || ws.openingCwd;
    if (!cwd) continue;
    let title = "";
    try {
      title = ws.win.getTitle() || "";
    } catch {
      /* ignore */
    }
    rows.push({ windowId: ws.win.id, cwd, title });
  }
  return rows;
}

/** Push the open-folder list to every shell so recents can show an Open badge. */
export function broadcastOpenCheckouts() {
  const checkouts = collectOpenCheckouts();
  for (const ws of windowSessions.values()) {
    send(ws, "app:open-checkouts", checkouts);
  }
}

export const APP_WINDOW_TITLE = "Grok Desktop Community";

/**
 * Native title from session state: project basename, else empty shell.
 * Multi empty shells use window id (not DevTools BrowserWindows).
 * @param {WindowSession | null | undefined} ws
 * @param {string | null | undefined} cwd
 */
export function setWindowTitle(ws, cwd) {
  if (!ws?.win || ws.win.isDestroyed()) return;
  if (cwd) {
    const trimmed = String(cwd).replace(/[/\\]+$/, "");
    const short =
      path.basename(trimmed) ||
      trimmed ||
      String(cwd);
    ws.win.setTitle(`${short} · Grok`);
    notifyWindowChrome();
    return;
  }
  let shells = 0;
  for (const s of windowSessions.values()) {
    if (s.win && !s.win.isDestroyed()) shells++;
  }
  ws.win.setTitle(
    shells <= 1 ? APP_WINDOW_TITLE : `${APP_WINDOW_TITLE} · ${ws.win.id}`,
  );
  notifyWindowChrome();
}

/** @param {any} client */
async function killAgentClient(client) {
  if (!client) return;
  try {
    const p = client.dispose();
    if (p && typeof p.then === "function") await p.catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    if (client.proc && !client.proc.killed) {
      client.proc.kill("SIGKILL");
    }
  } catch {
    /* ignore */
  }
}

/**
 * Drop the project/agent on a live window (keep the BrowserWindow).
 * Title follows session state — no separate "reset title" API.
 * Nulls agent before kill so the client `exit` handler does not push
 * "Agent process exited" into the renderer.
 * @param {WindowSession | null | undefined} ws
 * @returns {boolean}
 */
export function clearProjectOnWindow(ws) {
  if (!ws || ws.disposed || !ws.win || ws.win.isDestroyed()) return false;
  ws.generation = (ws.generation || 0) + 1;
  try {
    ws.stopBackgroundTaskTail?.();
  } catch {
    /* ignore */
  }
  ws.stopBackgroundTaskTail = null;
  const a = ws.agent;
  ws.agent = null;
  ws.lastCwd = null;
  ws.lastSessionId = null;
  ws.openingCwd = null;
  try {
    clearPendingPermissions(ws);
  } catch {
    /* ignore */
  }
  ws.agentChain = ws.agentChain
    .then(() => killAgentClient(a), () => killAgentClient(a))
    .then(
      () => undefined,
      () => undefined,
    );
  setWindowTitle(ws, null);
  broadcastOpenCheckouts();
  return true;
}

export function makeReqId(prefix) {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Park one agent→UI reverse-request until the renderer settles it (or timeout).
 * @param {WindowSession} ws
 * @param {GrokAcpClient} agent
 * @param {(fn: Function) => Function} ifCurrent
 * @param {{
 *   event: string,
 *   ipcRequest: string,
 *   ipcDismiss: string,
 *   map: Map<string, { settle: (decision: any) => void, params?: any }>,
 *   prefix: string,
 *   timeoutMs: number,
 *   fallback: any,
 * }} opts
 */
function parkAgentGate(ws, agent, ifCurrent, opts) {
  const {
    event,
    ipcRequest,
    ipcDismiss,
    map,
    prefix,
    timeoutMs,
    fallback,
  } = opts;
  agent.on(
    event,
    ifCurrent(({ params, respond }) => {
      const reqId = makeReqId(prefix);
      let settled = false;
      /** @type {ReturnType<typeof setTimeout> | null} */
      let timer = null;
      const settle = (decision) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        timer = null;
        map.delete(reqId);
        taskNotifier.dismiss(ws,reqId);
        try {
          respond(decision || fallback);
        } catch {
          /* ignore */
        }
        if (ws.agent === agent) {
          send(ws, ipcDismiss, {
            reqId,
            timedOut: Boolean(decision?.timedOut),
          });
        }
      };
      timer = setTimeout(
        () => settle({ ...fallback, timedOut: true }),
        timeoutMs,
      );
      map.set(reqId, wrapParked(settle, params));
      send(ws, ipcRequest, { reqId, params });
      taskNotifier.show(ws,{kind:{plan:'plan',ask:'answer',trust:'trust',elicit:'connector'}[prefix],key:reqId});
      // Re-push once so HMR / late renderer subscribe still show the modal
      // (same idea as permission gates).
      setTimeout(() => {
        if (settled || ws.agent !== agent) return;
        if (!map.has(reqId)) return;
        send(ws, ipcRequest, { reqId, params });
      }, 750);
    }),
  );
}

/**
 * Clear pending UI gates for one window. Map values are ParkedEntry
 * `{ settle, params }`; settle also dismisses the renderer modal.
 * @param {WindowSession} ws
 */
export function clearPendingPermissions(ws) {
  taskNotifier.dismiss(ws);
  const owner = ownerIdFor(ws);
  cancelAllPermissions(undefined, owner);
  const gates = [
    { map: ws.pendingPlanApprovals, fallback: { type: "abandoned" } },
    { map: ws.pendingUserQuestions, fallback: { type: "declined" } },
    { map: ws.pendingFolderTrust, fallback: { outcome: "reject" } },
    { map: ws.pendingMcpElicits, fallback: { outcome: "cancel" } },
  ];
  for (const { map, fallback } of gates) {
    if (!map) continue;
    const settlers = [...map.values()];
    map.clear();
    for (const settle of settlers) {
      try {
        settleParked(settle, fallback);
      } catch {
        /* ignore */
      }
    }
  }
  send(ws, "agent:permissions-cleared", {});
}

/**
 * Follow updates.jsonl for background task events for the live session.
 * @param {WindowSession} ws
 * @param {string} cwd
 * @param {string | null | undefined} sessionId
 */
export function restartBackgroundTaskTail(ws, cwd, sessionId) {
  try {
    ws.stopBackgroundTaskTail?.();
  } catch {
    /* ignore */
  }
  ws.stopBackgroundTaskTail = null;
  if (!cwd || !sessionId) return;
  ws.stopBackgroundTaskTail = startBackgroundTaskFileTail({
    cwd,
    sessionId,
    onParams: (params) => {
      send(ws, "agent:session-update", params);
    },
  });
}

/**
 * Drop a client that was created after the window closed / was replaced.
 * @param {GrokAcpClient | null | undefined} client
 */
export async function disposeOrphanClient(client) {
  if (!client) return;
  try {
    const p = client.dispose();
    if (p && typeof p.then === "function") await p.catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    if (client.proc && !client.proc.killed) client.proc.kill("SIGKILL");
  } catch {
    /* ignore */
  }
}

/**
 * Ensure agent process for cwd on this window, optionally resuming a CLI session.
 * Serialized per window — concurrent open/switch cannot race dispose/start.
 * Aborts cleanly if the window is closed mid-flight (no orphaned grok processes).
 * @param {WindowSession} ws
 * @param {string} cwd
 * @param {{
 *   resumeSessionId?: string | null,
 *   forceNew?: boolean,
 *   forceRestart?: boolean,
 * }} [opts]
 *   forceRestart — dispose and respawn even if cwd/session match (CLI flags
 *   like --always-approve are fixed at process spawn).
 */
export function ensureAgent(ws, cwd, opts = {}) {
  const run = async () => {
    if(opts.forceRestart || (ws.agent&&!ws.agent.ready))ws.generation++;
    const gen = ws.generation;
    if (!isSessionLive(ws, gen)) {
      throw new Error("Window closed");
    }

    const resumeSessionId = opts.resumeSessionId || null;
    const forceNew = Boolean(opts.forceNew);
    const forceRestart = Boolean(opts.forceRestart);
    let agent = ws.agent;

    // Always-approve boundary: must respawn process for CLI flags.
    if (forceRestart && agent) {
      rememberProjectOnWindow(ws, agent.cwd, agent.sessionId);
      clearPendingPermissions(ws);
      await agent.dispose();
      if (ws.agent === agent) ws.agent = null;
      agent = null;
      if (!isSessionLive(ws, gen)) {
        throw new Error("Window closed");
      }
    }

    if (agent?.ready && agent.cwd === cwd && agent.proc) {
      if (forceNew) {
        clearPendingPermissions(ws);
        await agent.newSession();
        if (!isSessionLive(ws, gen) || ws.agent !== agent) {
          throw new Error("Window closed");
        }
        rememberProjectOnWindow(ws, cwd, agent.sessionId);
        restartBackgroundTaskTail(ws, cwd, agent.sessionId);
        return agent;
      }
      if (resumeSessionId && resumeSessionId !== agent.sessionId) {
        clearPendingPermissions(ws);
        await agent.loadSession(resumeSessionId);
        if (!isSessionLive(ws, gen) || ws.agent !== agent) {
          throw new Error("Window closed");
        }
        rememberProjectOnWindow(ws, cwd, agent.sessionId);
        restartBackgroundTaskTail(ws, cwd, agent.sessionId);
        return agent;
      }
      if (resumeSessionId && resumeSessionId === agent.sessionId) {
        if(!opts.preserveSessionState)agent.setAllowWritesThisSession(false);
        rememberProjectOnWindow(ws, cwd, agent.sessionId);
        restartBackgroundTaskTail(ws, cwd, agent.sessionId);
        return agent;
      }
      if (!resumeSessionId && !forceNew) {
        if(!opts.preserveSessionState)agent.setAllowWritesThisSession(false);
        rememberProjectOnWindow(ws, cwd, agent.sessionId);
        restartBackgroundTaskTail(ws, cwd, agent.sessionId);
        return agent;
      }
    }

    if (agent) {
      rememberProjectOnWindow(ws, agent.cwd, agent.sessionId);
      clearPendingPermissions(ws);
      await agent.dispose();
      if (ws.agent === agent) ws.agent = null;
      agent = null;
      if (!isSessionLive(ws, gen)) {
        throw new Error("Window closed");
      }
    }

    if (!grokBinaryExists()) {
      throw new Error(missingGrokBinaryMessage(resolveGrokBinary()));
    }

    const state = loadDesktopState();
    agent = new GrokAcpClient({
      cwd,
      permissionMode: state.permissionMode,
      reasoningEffort: state.reasoningEffort,
      allowOutsideProject: Boolean(state.allowOutsideProject),
      sandboxTerminal: state.sandboxTerminal !== false,
      clientVersion: app.getVersion(),
      windowId: ws.win?.id,
      previewExecutionId: ws.recordId,
      previewGeneration: gen,
    });

    if (!isSessionLive(ws, gen)) {
      await disposeOrphanClient(agent);
      throw new Error("Window closed");
    }
    ws.agent = agent;

    /** Only deliver events while this client is still the window's live agent. */
    const ifCurrent = (fn) => {
      return (...args) => {
        if (ws.agent !== agent || ws.disposed) return;
        return fn(...args);
      };
    };

    agent.on(
      "session-update",
      ifCurrent((params) => {
        if (isDebugLogging()) {
          const update = params?.update ?? params ?? {};
          const kind = update.sessionUpdate || update.session_update || "";
          // Thought/token streams are thousands of lines/sec; sync file
          // appends on that path stall main and can take the process down.
          if (
            kind !== "agent_thought_chunk" &&
            kind !== "agent_message_chunk" &&
            kind !== "tool_call_delta_chunk" &&
            kind !== "user_message_chunk"
          ) {
            debugLog("acp", "session-update", summarizeSessionUpdate(params));
          }
        }
        send(ws, "agent:session-update", params);
      }),
    );

    agent.on(
      "session-interjection",
      ifCurrent((payload) => {
        send(ws, "agent:session-interjection", payload);
      }),
    );

    agent.on(
      "mcp-status",
      ifCurrent((event) => {
        send(ws, "agent:mcp-status", event);
      }),
    );

    agent.on(
      "writes-session",
      ifCurrent((on) => {
        send(ws, "agent:writes-session", { allowWritesThisSession: Boolean(on) });
      }),
    );

    agent.on(
      "permission-request",
      ifCurrent(({ params, respond }) => {
        const reqId = makeReqId("perm");
        const owner = ownerIdFor(ws);
        const request = registerPermissionRequest({
          reqId,
          params,
          respond,
          ownerId: owner,
          onSettled: (id, outcome) => {
            debugLog("permission", "respond", { reqId: id, outcome });
            if (ws.agent === agent) {
              taskNotifier.dismiss(ws,id);
              send(ws, "agent:permission-dismiss", { reqId: id });
            }
          },
        });
        const tool =
          request.params?.toolCall?.title ||
          request.params?.toolCall?.kind ||
          "tool";
        const toolCallId = request.params?.toolCall?.toolCallId;
        // Always log — silent missed approvals look like a hung "Working…" turn.
        console.warn(
          `[permission] request ${reqId} tool=${tool} toolCallId=${toolCallId || "?"}`,
        );
        debugLog("permission", "request", { reqId, tool, toolCallId, owner });
        // JSON-RPC is still answered once (pending map). Re-push the UI event once
        // so HMR / late renderer subscribe still show the approval card.
        send(ws, "agent:permission-request", request);
        taskNotifier.show(ws,{kind:'permission',key:reqId});
        setTimeout(() => {
          if (ws.agent !== agent) return;
          if (pendingPermissionCount(owner) === 0) return;
          const still = listPendingPermissionRequests(owner).find(
            (p) => p.reqId === reqId,
          );
          if (still) send(ws, "agent:permission-request", still);
        }, 750);
        // Make escalations unmissable when the window is in the background.
        try {
          if (ws.win && !ws.win.isDestroyed() && !ws.win.isFocused() && loadDesktopState().notifications?.enabled!==false) {
            if (typeof ws.win.flashFrame === "function") {
              ws.win.flashFrame(true);
            }
            if (process.platform === "darwin" && app.dock?.bounce) {
              app.dock.bounce("informational");
            }
          }
        } catch {
          /* ignore */
        }
      }),
    );

    // Main owns timeout so map + UI dismiss go through the same settle path.
    parkAgentGate(ws, agent, ifCurrent, {
      event: "plan-approval-request",
      ipcRequest: "agent:plan-approval-request",
      ipcDismiss: "agent:plan-approval-dismiss",
      map: ws.pendingPlanApprovals,
      prefix: "plan",
      timeoutMs: 30 * 60_000,
      fallback: { type: "abandoned" },
    });
    parkAgentGate(ws, agent, ifCurrent, {
      event: "folder-trust-request",
      ipcRequest: "agent:folder-trust-request",
      ipcDismiss: "agent:folder-trust-dismiss",
      map: ws.pendingFolderTrust,
      prefix: "trust",
      timeoutMs: 30 * 60_000,
      fallback: { outcome: "reject" },
    });
    parkAgentGate(ws, agent, ifCurrent, {
      event: "user-question-request",
      ipcRequest: "agent:user-question-request",
      ipcDismiss: "agent:user-question-dismiss",
      map: ws.pendingUserQuestions,
      prefix: "ask",
      timeoutMs: 10 * 60_000,
      fallback: { type: "declined" },
    });
    parkAgentGate(ws, agent, ifCurrent, {
      event: "mcp-elicit-request",
      ipcRequest: "agent:mcp-elicit-request",
      ipcDismiss: "agent:mcp-elicit-dismiss",
      map: ws.pendingMcpElicits,
      prefix: "elicit",
      timeoutMs: 10 * 60_000,
      fallback: { outcome: "cancel" },
    });

    agent.on(
      "stderr",
      ifCurrent((text) => send(ws, "agent:stderr", text)),
    );
    agent.on(
      "error",
      ifCurrent((err) =>
        send(ws, "agent:error", { message: err?.message || String(err) }),
      ),
    );
    agent.on("exit", (info) => {
      // Stale exit after replace must not clear the *new* agent's permissions
      if (ws.agent !== agent) return;
      clearPendingPermissions(ws);
      send(ws, "agent:exit", info);
    });
    // Do not push agent:ready for conn — renderer only trusts open IPC results
    agent.on(
      "ready",
      ifCurrent((info) => send(ws, "agent:ready", info)),
    );

    try {
      await agent.start({
        resumeSessionId: forceNew ? null : resumeSessionId,
      });
    } catch (err) {
      if (ws.agent === agent) ws.agent = null;
      await disposeOrphanClient(agent);
      throw err;
    }

    if (!isSessionLive(ws, gen) || ws.agent !== agent) {
      await disposeOrphanClient(agent);
      if (ws.agent === agent) ws.agent = null;
      throw new Error("Window closed");
    }
    rememberProjectOnWindow(ws, cwd, agent.sessionId);
    restartBackgroundTaskTail(ws, cwd, agent.sessionId);
    return agent;
  };

  const next = ws.agentChain.then(run, run);
  ws.agentChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}


export function disposeWindowSession(ws) {
  if (ws.disposed) return;
  ws.queue?.dispose();
  ws.disposePreview?.();
  for(const dispose of ws.terminalDisposers||[])try{dispose();}catch{}
  ws.terminalDisposers=[];
  ws.disposed = true;
  ws.generation = (ws.generation || 0) + 1;
  try {
    ws.stopBackgroundTaskTail?.();
  } catch {
    /* ignore */
  }
  ws.stopBackgroundTaskTail = null;
  const a = ws.agent;
  ws.agent = null;
  ws.lastCwd = null;
  ws.lastSessionId = null;
  ws.openingCwd = null;
  ws.pendingOpenCwd = null;
  try {
    clearPendingPermissions(ws);
  } catch {
    /* ignore */
  }
  broadcastOpenCheckouts();

  // Serialize with ensureAgent so mid-flight start() cannot outlive the window.
  const cleanup = async () => {
    await killAgentClient(a);
    const leftover = ws.agent;
    ws.agent = null;
    if (leftover && leftover !== a) {
      await killAgentClient(leftover);
    }
  };
  ws.agentChain = ws.agentChain.then(cleanup, cleanup).then(
    () => undefined,
    () => undefined,
  );
  void ws.agentChain;
}

/**
 * Tear down every window agent without blocking quit (auto-update / before-quit).
 */
export function disposeAgentQuick() {
  for (const ws of allExecutionSessions()) {
    disposeWindowSession(ws);
  }
}


/**
 * Open / resume a session on a window: ensureAgent + history load.
 * Shared by project:open and sessions:open IPC.
 *
 * @param {WindowSession} ws
 * @param {{
 *   cwd: string,
 *   mode?: 'continue' | 'new' | 'resume',
 *   sessionId?: string | null,
 *   loadState?: (cwd: string, sessionId: string) => { items?: any[], tasks?: any[], usage?: any },
 *   listSessions?: (cwd: string) => any[],
 *   mostRecent?: (cwd: string) => { id: string } | null,
 *   remember?: (cwd: string, sessionId: string) => void,
 * }} opts
 */
export async function openSessionOnWindow(ws, opts) {
  const cwd = opts.cwd;
  const mode = opts.mode || "continue";
  let resumeSessionId = null;
  let forceNew = false;

  if (mode === "new") {
    forceNew = true;
  } else if (mode === "resume" && opts.sessionId) {
    resumeSessionId = opts.sessionId;
  } else if (mode === "continue" || !mode) {
    resumeSessionId = opts.mostRecent?.(cwd)?.id || null;
  } else if (opts.sessionId) {
    resumeSessionId = opts.sessionId;
  }

  const host=ws.host;
  if(host) {
    const existing=findExecution(windowSessions.values(),cwd,resumeSessionId);
    if(existing && existing.host!==host) {
      existing.win.show(); existing.win.focus(); selectExecution(existing);
      send(existing,'app:select-execution',{cwd,sessionId:resumeSessionId});
      throw Error('This chat is already open in another window. Switched to its owner.');
    }
    if(existing) ws=existing;
    else if(ws.lastSessionId || ws.agent) ws=host.create();
    ws.lastCwd=cwd;
    if(resumeSessionId) ws.lastSessionId=resumeSessionId;
    selectExecution(ws);
    // Native history is readable without launching an agent.
    if(resumeSessionId && !ws.agent && opts.loadState) {
      const loaded=opts.loadState(cwd,resumeSessionId);
      ws.readOnly=true; ws.liveItems=loaded.items||[];
      opts.remember?.(cwd,resumeSessionId);
      return {modelId:opts.listSessions?.(cwd)?.find(row=>row.id===resumeSessionId)?.modelId||null,cwd,sessionId:resumeSessionId,grokBinary:resolveGrokBinary(),resumed:true,history:ws.liveItems,backgroundTasks:loaded.tasks||[],usage:loaded.usage||null,sessions:opts.listSessions?.(cwd)||[],scope:executionScope(ws),readOnly:true,runState:{active:false}};
    }
  }
  const gen = ws.generation;
  let client;
  let resumeWarning = null;
  try {
    client = await ensureAgent(ws, cwd, { resumeSessionId, forceNew, preserveSessionState:Boolean(ws.host) });
  } catch (err) {
    if (
      resumeSessionId &&
      !forceNew &&
      isSessionLive(ws, gen) &&
      !isCancelledRestartError(err)
    ) {
      console.warn(
        "[openSessionOnWindow] resume failed, starting new session:",
        err?.message || err,
      );
      resumeWarning = err?.message || "Could not resume that chat; started a new session.";
      client = await ensureAgent(ws, cwd, { forceNew: true });
      forceNew = true;
      resumeSessionId = null;
    } else {
      throw err;
    }
  }
  if (ws.disposed || ws.agent!==client) {
    await disposeOrphanClient(client);
    throw new Error("Window closed");
  }

  opts.remember?.(cwd, client.sessionId);
  setWindowTitle(ws, client.cwd);
  restartBackgroundTaskTail(ws, cwd, client.sessionId);

  let history = [];
  /** @type {any[]} */
  let backgroundTasks = [];
  /** @type {any} */
  let usage = null;
  if (client.sessionId && !forceNew && opts.loadState) {
    const loaded = opts.loadState(cwd, client.sessionId);
    history = loaded.items || [];
    backgroundTasks = loaded.tasks || [];
    usage = loaded.usage || null;
  }

  if(ws.host) { if(!ws.liveItems) ws.liveItems=history; else history=ws.liveItems; selectExecution(ws); }
  return {
    scope: ws.host ? executionScope(ws) : undefined,
    runState: client.getRunState?.(),
    cwd: client.cwd,
    sessionId: client.sessionId,
    grokBinary: client.grokPath,
    resumed: Boolean(resumeSessionId) && !forceNew,
    ...client._modelsPublic(),
    ...client._modesPublic(),
    history,
    backgroundTasks,
    usage,
    sessions: opts.listSessions?.(cwd) || [],
    warning: resumeWarning,
  };
}

/**
 * Force-respawn this window's agent and resume the current chat.
 * ~/.grok / CLI flags bind at spawn — must dispose even when cwd matches.
 *
 * @param {WindowSession} ws
 * @param {{
 *   loadState?: (cwd: string, sessionId: string) => { items?: any[], tasks?: any[], usage?: any },
 *   listSessions?: (cwd: string) => any[],
 *   remember?: (cwd: string, sessionId: string) => void,
 * }} [opts]
 */
export async function restartAgentOnWindow(ws, opts = {}) {
  if (!ws || ws.disposed || !ws.win || ws.win.isDestroyed()) {
    throw new Error("No window for agent:restart");
  }
  const gen = ws.generation;
  const target = restartTargetFromSources(ws.agent, {
    cwd: ws.lastCwd,
    sessionId: ws.lastSessionId,
  });
  if (!target) {
    throw new Error("No project open");
  }
  rememberProjectOnWindow(ws, target.cwd, target.resumeSessionId);

  let client;
  let resumeWarning = null;
  let resumed = Boolean(target.resumeSessionId);
  try {
    client = await ensureAgent(ws, target.cwd, {
      resumeSessionId: target.resumeSessionId,
      forceRestart: true,
    });
  } catch (err) {
    if (
      !shouldFallbackToNewSession({
        err,
        resumeSessionId: target.resumeSessionId,
        lastCwd: ws.lastCwd,
        disposed: ws.disposed,
        generationMatches: ws.generation === gen,
      })
    ) {
      throw err;
    }
    console.warn(
      "[restartAgentOnWindow] resume failed, starting new session:",
      err?.message || err,
    );
    resumeWarning =
      err?.message || "Could not resume that chat; started a new session.";
    client = await ensureAgent(ws, target.cwd, {
      forceNew: true,
      forceRestart: true,
    });
    resumed = false;
  }

  if (ws.agent!==client || ws.disposed) {
    await disposeOrphanClient(client);
    throw new Error("Window closed");
  }

  opts.remember?.(target.cwd, client.sessionId);
  setWindowTitle(ws, client.cwd);
  restartBackgroundTaskTail(ws, target.cwd, client.sessionId);

  let history = [];
  /** @type {any[]} */
  let backgroundTasks = [];
  /** @type {any} */
  let usage = null;
  if (client.sessionId && resumed && opts.loadState) {
    const loaded = opts.loadState(target.cwd, client.sessionId);
    history = loaded.items || [];
    backgroundTasks = loaded.tasks || [];
    usage = loaded.usage || null;
  }

  return {
    cwd: client.cwd,
    sessionId: client.sessionId,
    grokBinary: client.grokPath,
    scope: ws.host ? executionScope(ws) : undefined,
    runState: client.getRunState?.(),
    resumed,
    availableModels:client._modelsPublic().availableModels,
    modelId: client.currentModelId || null,
    modelName: client.currentModelName || null,
    sessionMode: client.currentModeId || null,
    history,
    backgroundTasks,
    usage,
    sessions: opts.listSessions?.(target.cwd) || [],
    warning: resumeWarning,
  };
}

/**
 * Fan out permission mode; restart all agents when always-approve boundary crosses.
 * @param {string} mode
 * @param {string} prev
 */
export async function applyPermissionModeToAllWindows(mode, prev) {
  const prevAlways = prev === "always-approve";
  const nextAlways = mode === "always-approve";
  /** @type {{ mode: string, agentSynced: boolean, error?: string, restarted?: boolean }} */
  let result = { mode, agentSynced: false };

  if (prevAlways !== nextAlways) {
    let anyRestarted = false;
    let allSynced = true;
    /** @type {string | undefined} */
    let lastError;
    let liveCount = 0;
    for (const other of allExecutionSessions()) {
      if (other.disposed || !other.win || other.win.isDestroyed()) continue;
      const a = other.agent;
      if (!a?.ready || !a.cwd) {
        if (a?.setPermissionMode) {
          try {
            await a.setPermissionMode(mode);
          } catch {
            /* ignore */
          }
        }
        continue;
      }
      liveCount++;
      anyRestarted = true;
      const cwd = a.cwd;
      const sid = a.sessionId;
      // Serialize dispose+respawn on the window's agentChain (via ensureAgent)
      try {
        await ensureAgent(other, cwd, {
          resumeSessionId: sid || null,
          forceRestart: true,
        });
      } catch (err) {
        allSynced = false;
        lastError = err?.message || String(err);
      }
    }
    // No live agents → state already consistent, nothing to attach
    if (liveCount === 0) {
      return { mode, agentSynced: true, restarted: false };
    }
    result = {
      mode,
      agentSynced: allSynced,
      restarted: anyRestarted,
    };
    if (lastError) result.error = lastError;
    return result;
  }

  return syncPermissionModeLiveToAllWindows(mode);
}

/**
 * Push permission mode into live agents without respawn. `--always-approve`
 * still binds on the next ensureAgent; this path is for mid-turn
 * enable-always-approve (killing grok would abort the current turn).
 * @param {string} mode
 */
export async function syncPermissionModeLiveToAllWindows(mode) {
  let synced = false;
  /** @type {{ mode: string, agentSynced: boolean, error?: string, restarted?: boolean }} */
  let result = { mode, agentSynced: false, restarted: false };
  for (const other of allExecutionSessions()) {
    if (other.disposed || !other.agent?.setPermissionMode) continue;
    try {
      result = await other.agent.setPermissionMode(mode);
      result.restarted = false;
      synced = true;
    } catch {
      /* ignore */
    }
  }
  if (!synced) result = { mode, agentSynced: true, restarted: false };
  if (mode === "auto" || mode === "always-approve") {
    flushPendingPermissionsForMode(mode);
  }
  return result;
}

export function broadcastPermissionMode(mode) {
  const payload = { mode };
  for (const ws of windowSessions.values()) {
    send(ws, "agent:permission-mode", payload);
  }
}

/**
 * Ask → Auto mid-turn: allow already-queued safe prompts (read / browse)
 * so the user does not have to Stop. Writes stay in Approvals.
 * @param {string} mode
 */
export function flushPendingPermissionsForMode(mode) {
  for (const ws of allExecutionSessions()) {
    if (ws.disposed || !ws.win || ws.win.isDestroyed()) continue;
    settlePendingByPolicy(ownerIdFor(ws), {
      permissionMode: mode,
      allowWritesThisSession: Boolean(ws.agent?.allowWritesThisSession),
    });
  }
}

/**
 * Create and register a WindowSession for a BrowserWindow.
 * Owns shell chrome that is session-scoped: block page title clobber,
 * apply empty-shell title. Project titles come from openSessionOnWindow.
 * @param {import('electron').BrowserWindow} win
 * @returns {WindowSession}
 */
export function createWindowSession(win) {
  /** @type {WindowSession} */
  const ws = {
    win,
    agent: null,
    agentChain: Promise.resolve(),
    stopBackgroundTaskTail: null,
    pendingPlanApprovals: new Map(),
    pendingUserQuestions: new Map(),
    pendingFolderTrust: new Map(),
    pendingMcpElicits: new Map(),
    disposed: false,
    writesChain: Promise.resolve(),
    generation: 0,
    lastCwd: null,
    lastSessionId: null,
    openingCwd: null,
    pendingOpenCwd: null,
    settingsOpen: false,
  };
  // Main owns native titles; HTML <title> / document.title must not clobber.
  win.on("page-title-updated", (e) => {
    e.preventDefault();
  });
  const host=createExecutionHost(win, () => ({...ws, agent:null, agentChain:Promise.resolve(), pendingPlanApprovals:new Map(),pendingUserQuestions:new Map(),pendingFolderTrust:new Map(),pendingMcpElicits:new Map(),writesChain:Promise.resolve()}));
  trackWindowSession(host);
  setWindowTitle(host, null);
  return host;
}
