import { executionHasActiveWork } from './execution-work.mjs';
import { configureCommunityDataPath } from './app-identity.mjs';
import { terminalIsolationStatus } from './terminal-isolation.mjs';
import { registerProjectFilesIpc } from "./ipc/project-files.mjs";
import { createDesktopStateStore } from "./desktop-state.mjs";
import { registerIntegrationsIpc } from "./ipc/integrations.mjs";
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain as nativeIpcMain,
  dialog,
  shell,
  Menu,
  Notification,
} from "electron";
import {createTaskNotifier,notificationPreferences} from './task-notifications.mjs';
import {setTaskNotifier} from './window-session.mjs';
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import { ensureDefaultWorkspace } from "./default-workspace.mjs";
import { attachContextMenu } from "./context-menu.mjs";
import {
  cancelLogin,
  getAuthStatus,
  isRemoteLoginUrl,
  setSessionApiKey,
  startLogin,
  startLogout,
  submitLoginInput,
} from "./auth.mjs";
import { mergeRestartResult } from "./agent-restart.mjs";
import { inspectBackbone } from "./backbone.mjs";
import { resolveGrokBinary, grokHomeDir } from "./grok-home.mjs";
import {
  checkGrokUpdate,
  getGrokEngine,
  installGrokUpdate,
} from "./grok-cli.mjs";
import {
  setupAutoUpdater,
  checkForUpdatesInteractive,
  isQuittingForUpdate,
  setAllowPrerelease,
} from "./auto-update.mjs";
import {
  listSessionsForCwd,
  loadSessionOpenState,
  mostRecentSession,
  renameSessionOnDisk,
  deleteSessionOnDisk,
  sanitizeSessionTitle,
  MAX_SESSION_TITLE_LENGTH,
} from "./sessions.mjs";
import {
  listPendingPermissionRequests,
  setOnEnableAlwaysApprove,
  settlePendingAllowOnce,
  settlePermission,
} from "./pending-permissions.mjs";
import {
  getCodingDataStatus,
} from "./coding-data.mjs";
import { assertPathInProject } from "./path-safety.mjs";
import {
  normalizeExternalEditor,
} from "./open-editor.mjs";
import {
  disposeWindowSession, scopedExecutionIpc, allExecutionSessions, executionCatalog, ensureExecutionQueue, ensureAgent, selectExecution,
  APP_WINDOW_TITLE,
  applyPermissionModeToAllWindows,
  broadcastOpenCheckouts,
  broadcastPermissionMode,
  syncPermissionModeLiveToAllWindows,
  clearPendingPermissions,
  clearProjectOnWindow,
  collectOpenCheckouts,
  createWindowSession,
  disposeAgentQuick,
  focusedSession,
  openSessionOnWindow,
  ownerIdFor,
  restartAgentOnWindow,
  send,
  sessionFromEvent,
  setDesktopStateLoader,
  setWindowChromeListener,
  windowSessions,
} from "./window-session.mjs";
import {
  menuListsOpenWindows,
  windowCycleKind,
  windowListMenuItems,
} from "./window-menu.mjs";
import {
  agentForWorktreeRpc,
  commitFamilyAfterOpen,
  configureDesktopInstance,
  createAcpWorktree,
  inspectProjectCheckout,
  isPrimaryDesktopInstance,
  planProjectOpen,
  resolveWorktreeCreateCwd,
  wireSecondInstance,
  wireWorktreePathGate,
} from "./desktop-worktrees.mjs";
import {
  maybeWarmDockerSandbox,
  probeSandbox,
  sandboxStatusLabel,
} from "./terminal-sandbox.mjs";
import { listParked, settleParked } from "./parked-request.mjs";
import { normalizePermissionMode } from "./permission-mode.mjs";
import {
  normalizeReasoningEffort,
} from "./reasoning-effort.mjs";
import {
  debugLog,
  getDebugLogPath,
  isDebugLogging,
  setDebugLogging,
} from "./debug-log.mjs";
import {
  getCrashDumpsPath,
  getCrashLogPath,
  installCrashLogging,
  writeCrashLog,
} from "./crash-log.mjs";
import {
  applyPreviewTheme,
  getPreviewWindow,
  openPreviewWindow,
  registerPreviewIpc,
} from "./execution-preview.mjs";
import { previewApiAddress, startPreviewApi } from "./preview-api.mjs";
import { installDesktopPreviewSkill } from "./preview-mcp.mjs";
import { mapInterjectIpcError } from "../shared/acp-interject.mjs";
import { normalizeAutoCompactAt } from "../shared/auto-compact.mjs";
import {
  bootBackground,
  closeSplash,
  createSplashWindow,
} from "./splash.mjs";

import {installDraftIpc} from './draft-store.mjs';
import { migrateCustom8 } from './access-migration.mjs';
import { installUsageIpc } from './usage-service.mjs';
import { installQueueIpc } from './queue-store.mjs';
import { installGitIpc } from './git-service.mjs';
import { installPtyIpc } from './pty-service.mjs';
import { registerWorkspaceRootsIpc } from './ipc/workspace-roots.mjs';
import {installHistoryIpc} from './history-service.mjs';
import {installZoom} from './zoom.mjs';
import {requestedLaunchDirectory} from './launch-directory.mjs';
import {stepZoom} from '../shared/zoom.mjs';
import {terminalTimeoutMs} from './terminal-timeout.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

configureCommunityDataPath(app);
installCrashLogging();
if(process.platform==='win32')app.setAppUserModelId('io.github.goodcantor.grokdesktopcommunity');

// Windows: extra BrowserWindow + WebContentsView (Preview) has been taking
// the whole process down with no JS exception (crashpad "not connected").
// Software compositing avoids that GPU path. Opt back in with GROK_DESKTOP_GPU=1.
if (
  process.platform === "win32" &&
  !/^(1|true|yes|on)$/i.test(String(process.env.GROK_DESKTOP_GPU || ""))
) {
  try {
    app.disableHardwareAcceleration();
    writeCrashLog("app", "disable-hardware-acceleration", { platform: "win32" });
  } catch (err) {
    writeCrashLog("app", "disable-hardware-acceleration-failed", {
      error: err?.message || String(err),
    });
  }
}

/** File → Quit / Cmd+Q. Window X does not set this (Settings can swallow that). */
let appQuitting = false;

const taskNotifier=createTaskNotifier({Notification,getState:()=>loadState(),selectExecution});
setTaskNotifier(taskNotifier);
const storePath = path.join(app.getPath("userData"), "desktop-state.json");

const { loadState, saveState, rememberProjectSession } = createDesktopStateStore(storePath);

function openPreviewFromMenu() {
  const ws = focusedSession();
  const owner = ws?.win && !ws.win.isDestroyed() ? ws.win : null;
  return openPreviewWindow({ owner });
}

function openSettingsFromMenu() {
  const ws = focusedSession();
  if (ws?.win && !ws.win.isDestroyed()) {
    ws.win.show();
    ws.win.focus();
    send(ws, "app:open-settings");
  }
}

/**
 * Show a window; take key focus only while this app is still frontmost
 * (macOS menu tracking restores the previous key window after the click).
 * @param {import('electron').BrowserWindow} win
 */
function focusWindow(win) {
  if (!win || win.isDestroyed()) return;
  try {
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.show();
    if (process.platform === "darwin" && !app.isActive()) return;
    if (win.isFocused()) return;
    win.moveTop();
    win.focus();
    if (process.platform === "darwin") {
      app.focus({ steal: true });
    }
  } catch {
    /* window may have closed mid-focus */
  }
}

function newWindowFromMenu(argv=[]) {
  // Keep the shell hidden until the renderer paints — do not show a blank frame.
  createWindow({cwd:requestedLaunchDirectory(argv,app.isPackaged)});
}

/**
 * App shell windows only (not detached DevTools).
 * @returns {import('electron').BrowserWindow[]}
 */
function appShellWindows() {
  const shells = [...windowSessions.values()]
    .map((ws) => ws.win)
    .filter((w) => w && !w.isDestroyed());
  const preview = getPreviewWindow();
  if (preview && !preview.isDestroyed()) shells.push(preview);
  return shells;
}

/**
 * Cycle focus among Grok Desktop windows.
 * macOS: Cmd+Tab is *apps*; same-app windows are Cmd+` (standard) —
 * Electron does not always wire that, so we handle it ourselves.
 * @param {1 | -1} [dir]
 */
function cycleAppWindows(dir = 1) {
  const wins = appShellWindows().sort((a, b) => a.id - b.id);
  if (wins.length < 2) return;
  const focused = BrowserWindow.getFocusedWindow();
  let idx = wins.findIndex((w) => w === focused);
  if (idx < 0) idx = 0;
  const next = wins[(idx + dir + wins.length) % wins.length];
  focusWindow(next);
}

/**
 * Standard app menu with Edit roles.
 * Without role-based Cut/Copy/Paste/Select All, Cmd/Ctrl+V often does nothing
 * in packaged Electron apps (macOS especially).
 * Win/Linux rebuild the Window menu when shells open/close/title/focus.
 */
let menuRebuildTimer = null;
function scheduleApplicationMenu() {
  if (!menuListsOpenWindows()) return;
  if (menuRebuildTimer != null) return;
  menuRebuildTimer = setTimeout(() => {
    menuRebuildTimer = null;
    installApplicationMenu();
  }, 40);
}

function wireWindowMenuRefresh() {
  if (!menuListsOpenWindows()) return;
  setWindowChromeListener(scheduleApplicationMenu);
  app.on("browser-window-created", (_e, win) => {
    scheduleApplicationMenu();
    win.on("closed", () => scheduleApplicationMenu());
    win.on("focus", () => scheduleApplicationMenu());
    win.on("page-title-updated", () => scheduleApplicationMenu());
  });
}

function installApplicationMenu() {
  const isMac = process.platform === "darwin";
  const cycleKind = windowCycleKind();
  /** @type {import('electron').MenuItemConstructorOptions} */
  const settingsItem = {
    label: "Settings…",
    accelerator: "CmdOrCtrl+,",
    click: () => openSettingsFromMenu(),
  };
  /**
   * Fresh object each time — do not reuse one MenuItem options object in
   * multiple menus (Electron can mis-wire accelerators / click handlers).
   * Accelerator only once so Cmd/Ctrl+Shift+N does not create multiple windows.
   * @param {{ accelerator?: string }} [opts]
   * @returns {import('electron').MenuItemConstructorOptions}
   */
  const newWindowItem = (opts = {}) => ({
    label: "New Window",
    ...(opts.accelerator ? { accelerator: opts.accelerator } : {}),
    click: () => newWindowFromMenu(),
  });
  const newWorktreeItem = () => ({
    label: "New Worktree Window…",
    click: () => {
      const ws = focusedSession();
      if (!ws) return;
      send(ws, "app:new-worktree");
    },
  });
  const listedWindows = menuListsOpenWindows()
    ? windowListMenuItems(
        appShellWindows()
          .sort((a, b) => a.id - b.id)
          .map((w) => ({
            id: w.id,
            title: w.getTitle() || APP_WINDOW_TITLE,
            focused: w.isFocused(),
          })),
        (id) => {
          const target = BrowserWindow.fromId(id);
          if (target) focusWindow(target);
        },
      )
    : [];
  /** @type {import('electron').MenuItemConstructorOptions[]} */
  // macOS menu bar (left → right): App name | File | Edit | View | Window | Help
  // Packaged builds only pick this up after rebuild — Dock/Applications is NOT live source.
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              // Most discoverable place on Mac (same row as Settings)
              newWindowItem(),
              newWorktreeItem(),
              settingsItem,
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        newWindowItem({ accelerator: "CmdOrCtrl+Shift+N" }),
        newWorktreeItem(),
        { type: "separator" },
        ...(isMac ? [] : [settingsItem, { type: "separator" }]),
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        {
          label: "Preview Window",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => {
            void openPreviewFromMenu();
          },
        },
      ],
    },
    {
      // role: "window" marks this as the macOS Window menu so the OS appends
      // the open-window list (by title). Nested role:"window" was a leaf item
      // literally labeled "Window" and is not needed.
      // Windows / Linux: Electron does not append that list — we add radio
      // items from appShellWindows() and rebuild when shells change.
      label: "Window",
      role: "window",
      submenu: [
        newWindowItem(),
        newWorktreeItem(),
        { type: "separator" },
        { role: "minimize" },
        { role: "zoom" },
        ...(cycleKind === "cmd-backtick"
          ? [
              { type: "separator" },
              // Cmd+Tab = apps. Same-app windows = Cmd+` (Mac standard).
              {
                label: "Cycle Through Windows",
                accelerator: "Cmd+`",
                click: () => cycleAppWindows(1),
              },
              {
                label: "Cycle Through Windows (Reverse)",
                accelerator: "Cmd+Shift+`",
                click: () => cycleAppWindows(-1),
              },
              { type: "separator" },
              { role: "front" },
            ]
          : cycleKind === "ctrl-tab"
            ? [
                {
                  label: "Next Window",
                  accelerator: "Ctrl+Tab",
                  click: () => cycleAppWindows(1),
                },
                {
                  label: "Previous Window",
                  accelerator: "Ctrl+Shift+Tab",
                  click: () => cycleAppWindows(-1),
                },
                { role: "close" },
              ]
            : [{ role: "close" }]),
        ...(listedWindows.length
          ? [{ type: "separator" }, ...listedWindows]
          : []),
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for updates…",
          click: () => {
            void checkForUpdatesInteractive(updateHooks);
          },
        },
        {
          label: "Open Releases page",
          click: () => {
            void shell.openExternal(
              "https://github.com/goodcantor/grok-desktop-community/releases",
            );
          },
        },
        { type: "separator" },
        {
          label: "Install guide (Mac “damaged” fix)",
          click: () => {
            shell.openExternal(
              "https://github.com/goodcantor/grok-desktop-community#troubleshooting",
            );
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/**
 * webContents → reveal() so `window:ready` from the renderer can show
 * that specific shell (not a splash, not another window).
 * @type {WeakMap<import('electron').WebContents, () => void>}
 */
const revealByWebContents = new WeakMap();

/**
 * @param {{ splash?: boolean, cwd?: string }} [opts]
 * @returns {import('electron').BrowserWindow}
 */
function createWindow(opts = {}) {
  const theme = loadState().theme;
  const useSplash = Boolean(opts.splash);
  if (useSplash) createSplashWindow(theme);

  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const winOpts = {
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 640,
    title: APP_WINDOW_TITLE,
    // Hidden until the renderer has painted real UI. Showing earlier is a
    // blank native chrome — HTML inside this window cannot paint yet.
    show: false,
    autoHideMenuBar:process.platform==='win32',
    backgroundColor: bootBackground(theme),
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };

  // Sit traffic lights in the brand top band (matches .platform-darwin sidebar padding)
  if (process.platform === "darwin") {
    winOpts.trafficLightPosition = { x: 14, y: 16 };
  }

  const win = new BrowserWindow(winOpts);
  // Session owns page-title guard + empty-shell title.
  const created = createWindowSession(win);
  let zoomSaveTimer=null;
  const zoomControl=installZoom(win.webContents,{initial:loadState().uiZoom||1,onChange:factor=>{
    if(!win.isDestroyed())win.webContents.send('app:zoom',factor);
    clearTimeout(zoomSaveTimer);zoomSaveTimer=setTimeout(()=>{const state=loadState();state.uiZoom=factor;saveState(state);},250);
  }});
  win.webContents.desktopZoom=zoomControl;
  if (opts.cwd) created.pendingOpenCwd = String(opts.cwd);
  attachContextMenu(win);
  win.webContents.on('will-prevent-unload',event=>{
    const choice=dialog.showMessageBoxSync(win,{type:'question',buttons:['Keep window open','Discard and close'],defaultId:0,cancelId:0,message:'You have unsaved edits or queued messages.',detail:'Keep this window open to save file edits or send queued messages. Closing discards these unsaved items; saved drafts and conversation history are kept.'});
    if(choice===1)event.preventDefault();else{closeConfirmed=false;quitTasksConfirmed=false;appQuitting=false;}
  });

  win.on("close", (e) => {
    if (appQuitting || isQuittingForUpdate()) return;
    const ws = windowSessions.get(win.id);
    if (!ws?.settingsOpen) return;
    e.preventDefault();
    send(ws, "app:close-settings");
  });

  // Cycle shells even if the menu accelerator is swallowed.
  // Windows: no Ctrl+Tab intercept — Alt+Tab already switches OS windows.
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const key = input.key;
    const isBacktick = key === "`" || key === "~";
    const cycleKind = windowCycleKind();
    if (cycleKind === "cmd-backtick") {
      if (input.meta && !input.alt && !input.control && isBacktick) {
        event.preventDefault();
        cycleAppWindows(input.shift ? -1 : 1);
      }
      return;
    }
    if (
      cycleKind === "ctrl-tab" &&
      input.control &&
      !input.meta &&
      !input.alt &&
      key === "Tab"
    ) {
      event.preventDefault();
      cycleAppWindows(input.shift ? -1 : 1);
    }
  });

  let revealed = false;
  let revealFallback = null;
  const reveal = () => {
    if (win.isDestroyed() || revealed) return;
    revealed = true;
    if (revealFallback) clearTimeout(revealFallback);
    focusWindow(win);
    if (useSplash) {
      // Main frame on screen first so closing the splash does not flash desktop.
      setTimeout(() => closeSplash(), 80);
    }
  };
  revealByWebContents.set(win.webContents, reveal);
  win.webContents.once("did-fail-load", reveal);
  revealFallback = setTimeout(reveal, 15000);
  win.on("closed", () => {
    if (revealFallback) clearTimeout(revealFallback);
    if (useSplash) closeSplash();
  });

  if (isDev) {
    void win.loadURL(process.env.GROK_DESKTOP_DEV_URL || "http://127.0.0.1:5173");
    if(!process.env.GROK_DESKTOP_DEV_URL?.startsWith('file:'))win.webContents.once("dom-ready", () => {
      setTimeout(() => {
        if (windowSessions.size <= 1 && !win.isDestroyed()) {
          win.webContents.openDevTools({ mode: "detach" });
        }
      }, 500);
    });
  } else {
    void win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  let closeConfirmed=false;
  win.on('close',event=>{
    const host=windowSessions.get(win.id);
    const running=[...(host?.records?.values()||[])].filter(row=>executionHasActiveWork(row));
    if(!running.length||closeConfirmed||appQuitting)return;
    event.preventDefault();
    const decision=dialog.showMessageBoxSync(win,{type:'question',buttons:['Keep working','Stop tasks and close'],defaultId:0,cancelId:0,message:`${running.length} chat${running.length===1?' is':'s are'} still working`,detail:'Closing this window stops its agents. Your history and unsent messages will be kept.'});
    if(decision===1){closeConfirmed=true;for(const row of running){row.queue?.stop();row.agent?.cancel();}win.close();}
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Never open data:/blob: via openExternal
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Keep navigation inside the app shell; open http(s) externally
  win.webContents.on("will-navigate", (event, url) => {
    const allowed =
      url.startsWith("http://127.0.0.1:") ||
      url.startsWith("http://localhost:") ||
      url.startsWith("file://");
    if (allowed) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
  });

  return win;
}

async function applyNewChatDefaults(ws,result) {
  if(result.resumed||!ws.agent?.ready)return result;
  const agent=ws.agent,sessionId=agent.sessionId,effort=normalizeReasoningEffort(loadState().reasoningEffort);
  if(agent.reasoningEffort!==effort){const applied=await agent.setReasoningEffort(effort);if(ws.agent!==agent||agent.sessionId!==sessionId)throw Error('Session changed');if(!applied.agentSynced)result.warning=[result.warning,applied.error].filter(Boolean).join(' · ');}
  return result;
}

const unlockUpdate=async()=>{for(const host of windowSessions.values())if(!host.win.isDestroyed())await host.win.webContents.executeJavaScript('document.documentElement.inert=false').catch(()=>{});};
const updateHooks={unlockUpdate,prepareUpdate:async()=>{
  const blocked=()=>allExecutionSessions().some(record=>executionHasActiveWork(record)||executionCatalog(record.host).some(row=>row.waiting));
  if(blocked())return false;
  for(const host of windowSessions.values()){
    const ready=await host.win.webContents.executeJavaScript('Boolean(window.__communityReady && !window.__communityUnsavedEdits && (document.documentElement.inert=true))').catch(()=>false);
    if(!ready){await unlockUpdate();return false;}
  }
  if(blocked()){await unlockUpdate();return false;}
  for(const record of allExecutionSessions())if(record.queue)record.queue.update({action:'pause',paused:true});
  return true;
}};
const ipcMain=scopedExecutionIpc(nativeIpcMain,{isClosing:()=>isQuittingForUpdate()});
async function resolveConcurrentChat(ws,cwd) {
  if(!fs.existsSync(path.join(cwd,'.git')))return {cwd,mode:'new'};
  const other=allExecutionSessions().find(row=>row.host===ws.host&&row.lastCwd===cwd&&(executionHasActiveWork(row)));
  if(!other)return {cwd,mode:'new'};
  const choice=dialog.showMessageBoxSync(ws.win,{type:'question',buttons:['Return to running chat','Use shared folder','Create Grok worktree'],defaultId:0,cancelId:0,message:'Another chat is working in this checkout',detail:'A shared folder lets both agents edit the same files. A Grok worktree gives the new task a separate checkout.'});
  if(choice===0)return {cwd,mode:'resume',sessionId:other.lastSessionId};
  if(choice===1)return {cwd,mode:'new'};
  const created=await createAcpWorktree(other.agent,{sourceCwd:cwd});
  return {cwd:created.path,mode:'new'};
}
function registerIpc() {
  ipcMain.handle('execution:connect',async e=>{const ws=sessionFromEvent(e);const agent=await ensureAgent(ws,ws.lastCwd,{resumeSessionId:ws.lastSessionId});return agent.getRuntimeState();});
  ipcMain.handle('execution:list', e => executionCatalog(sessionFromEvent(e).host));
  ipcMain.handle('execution:queue-state',e=>ensureExecutionQueue(sessionFromEvent(e)).snapshot());
  ipcMain.handle('execution:submit',(e,{item,mode})=>ensureExecutionQueue(sessionFromEvent(e)).submit(item,mode));
  ipcMain.handle('execution:queue-action',(e,args)=>ensureExecutionQueue(sessionFromEvent(e)).update(args));

  ipcMain.on("window:ready", (e) => {
    const reveal = revealByWebContents.get(e.sender);
    if (typeof reveal === "function") reveal();
  });

  ipcMain.handle("app:get-info", async (e) => {
    const state = loadState();
    const auth = getAuthStatus();
    // Reading metadata never changes native privacy preferences.
    const codingData = getCodingDataStatus();
    return {
      version: app.getVersion(),
      windowId:sessionFromEvent(e)?.win?.id||0,
      platform: process.platform,
      grokBinary: resolveGrokBinary(),
      grokHome: grokHomeDir(),
      userData: app.getPath("userData"),
      /** @deprecated use permissionMode === 'always-approve' */
      alwaysApprove: state.permissionMode === "always-approve",
      permissionMode: normalizePermissionMode(state.permissionMode),
      reasoningEffort: sessionFromEvent(e)?.agent?.reasoningEffort || normalizeReasoningEffort(state.reasoningEffort),
      defaultReasoningEffort: normalizeReasoningEffort(state.reasoningEffort),
      allowOutsideProject: Boolean(state.allowOutsideProject),
      sandboxTerminal: state.sandboxTerminal !== false,
      sandboxStatus: state.sandboxTerminal === false ? 'Host shell — tool processes have your user account access' : sandboxStatusLabel({ lazy: true }),
      terminalIsolation: terminalIsolationStatus(state.sandboxTerminal !== false,probeSandbox({lazy:true})),
      sandboxBackend: probeSandbox({ lazy: true }).backend,
      theme: state.theme === "light" ? "light" : "dark",
      privacyMode: Boolean(state.privacyMode),
      /** SpaceXAI coding-data share (auth.json); default opt-in */
      codingDataOptIn: codingData.optedIn,
      codingDataStatus: codingData,
      debugLogging: isDebugLogging() || Boolean(state.debugLogging),
      debugLogPath: getDebugLogPath(),
      crashLogPath: getCrashLogPath(),
      crashDumpsPath: getCrashDumpsPath(),
      allowPrerelease: Boolean(state.allowPrerelease),
      externalEditor: normalizeExternalEditor(state.externalEditor),
      autoCompactAt: normalizeAutoCompactAt(state.autoCompactAt),
      recentProjects: state.recentProjects || [],
      lastProject: state.lastProject,
      home: os.homedir(),
      defaultWorkspace: ensureDefaultWorkspace(),
      auth,
      previewApi: Boolean(previewApiAddress()),
    };
  });

  ipcMain.handle("auth:status", async () => getAuthStatus());

  ipcMain.handle("auth:login", async (e, opts = {}) => {
    const ws = sessionFromEvent(e);
    let pendingUrl = null;
    let openTimer = null;
    const opened = new Set();
    const scheduleOpen = (url) => {
      if (!isRemoteLoginUrl(url) || opened.has(url)) return;
      pendingUrl = url;
      if (openTimer) clearTimeout(openTimer);
      openTimer = setTimeout(() => {
        openTimer = null;
        const toOpen = pendingUrl;
        if (!toOpen || opened.has(toOpen) || !isRemoteLoginUrl(toOpen)) return;
        opened.add(toOpen);
        void shell.openExternal(toOpen).catch((err) => {
          debugLog("auth", "open-login-url-failed", {
            error: err?.message || String(err),
          });
        });
      }, 800);
    };
    try {
      const result = await startLogin({
        deviceAuth: Boolean(opts?.deviceAuth),
        onProgress: (progress) => {
          send(ws, "auth:login-progress", progress);
          if (typeof progress?.url === "string") scheduleOpen(progress.url);
        },
      });
      return result;
    } catch (err) {
      return {
        ok: false,
        status: getAuthStatus(),
        error: err?.message || String(err),
      };
    } finally {
      if (openTimer) clearTimeout(openTimer);
    }
  });

  ipcMain.handle("auth:cancel-login", async () => {
    cancelLogin();
    return getAuthStatus();
  });

  ipcMain.handle("auth:submit-login-input", async (_e, text) => {
    return submitLoginInput(text);
  });

  ipcMain.handle("auth:logout", async (e) => {
    // Drop this window's agent so title/session state follow auth leave.
    clearProjectOnWindow(sessionFromEvent(e));
    try {
      return await startLogout();
    } catch (err) {
      return {
        ok: false,
        status: getAuthStatus(),
        message: err?.message || String(err),
      };
    }
  });

  ipcMain.handle("auth:set-api-key", async (_e, key) => {
    const ok = setSessionApiKey(key);
    return { ok, status: getAuthStatus() };
  });

  ipcMain.handle("auth:open-install-docs", async () => {
    await shell.openExternal("https://docs.x.ai/build/overview");
    return true;
  });

  ipcMain.handle("backbone:inspect", async (_e, cwd) => {
    return inspectBackbone(cwd || process.cwd());
  });

  const windowRunState = (ws) => {
    const state = ws?.agent?.getRunState() || {sessionId:ws?.lastSessionId||null,active:false,connected:Boolean(ws?.readOnly),startedAt:null,lastActivityAt:null,waitingPermissions:0};
    return {...state, waitingPermissions: state.waitingPermissions + ['pendingPlanApprovals','pendingUserQuestions','pendingFolderTrust','pendingMcpElicits'].reduce((n,key)=>n+(ws?.[key]?.size||0),0)};
  };
  ipcMain.handle('agent:run-state', e => windowRunState(sessionFromEvent(e)));
  ipcMain.handle('app:get-zoom',e=>e.sender.getZoomFactor());
  ipcMain.handle('app:notification-preferences',(_e,patch)=>{
    const state=loadState();
    if(patch!=null){
      if(typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(key=>!['enabled','sound'].includes(key)||typeof patch[key]!=='boolean'))throw Error('Invalid notification preferences');
      state.notifications={...notificationPreferences(state),...patch};saveState(state);
      if(!state.notifications.enabled)taskNotifier.dismissAll();
    }
    return {...notificationPreferences(state),supported:Notification.isSupported()};
  });
  ipcMain.handle('app:set-zoom',(e,value)=>e.sender.desktopZoom?.apply(value)??e.sender.getZoomFactor());
  ipcMain.on('app:step-zoom',(e,direction)=>{if(['in','out','reset'].includes(direction))e.sender.desktopZoom?.apply(direction==='reset'?1:stepZoom(e.sender.getZoomFactor(),direction));});
  ipcMain.handle('app:diagnostics',async(e)=>{
    const ws=sessionFromEvent(e),agent=ws?.agent,engine=await getGrokEngine();
    return {appVersion:app.getVersion(),engineVersion:engine.version||'unknown',electron:process.versions.electron,platform:process.platform,
      connection:agent?.ready?(agent.desktopPromptActive?'working':'ready'):'disconnected',
      lastConnectionEvent:ws?.lastConnectionEvent||null,workspace:agent?.cwd?.replace(os.homedir(),'~')||null,sessionId:agent?.sessionId||null,
      model:agent?.currentModelId||null,reasoningEffort:agent?.reasoningEffort||null,permissionMode:agent?.permissionMode||null,
      terminalBackend:probeSandbox({lazy:true}).backend,terminalTimeoutMs:terminalTimeoutMs(probeSandbox({lazy:true}).backend),
      promptTimeoutMs:0,run:windowRunState(ws)};
  });
  ipcMain.handle("grok:engine", async () => getGrokEngine());

  ipcMain.handle("grok:update-check", async () => checkGrokUpdate());

  ipcMain.handle("grok:update-install", async () => installGrokUpdate());

  registerIntegrationsIpc({ ipcMain, sessionFromEvent, debugLog });

  ipcMain.handle("settings:set-open", (e, open) => {
    const ws = sessionFromEvent(e);
    if (ws) ws.settingsOpen = Boolean(open);
    return true;
  });

  ipcMain.handle("attachments:pick", async (e, kind) => {
    if (kind !== "file" && kind !== "folder") throw new Error("Invalid attachment type");
    const ws = sessionFromEvent(e);
    const parent = ws?.win && !ws.win.isDestroyed() ? ws.win : BrowserWindow.getFocusedWindow() || undefined;
    const result = await dialog.showOpenDialog(parent, {title: kind === "folder" ? "Attach folders" : "Attach files", properties: [kind === "folder" ? "openDirectory" : "openFile", "multiSelections"]});
    return result.canceled ? [] : result.filePaths.map(file => ({path: file, name: path.basename(file), kind}));
  });

  ipcMain.handle("project:pick", async (e) => {
    const ws = sessionFromEvent(e);
    const parent =
      ws?.win && !ws.win.isDestroyed()
        ? ws.win
        : BrowserWindow.getFocusedWindow() || undefined;
    const result = await dialog.showOpenDialog(parent, {
      properties: ["openDirectory", "createDirectory"],
      title: "Open project folder",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const cwd = result.filePaths[0];
    const state = loadState();
    state.lastProject = cwd;
    state.recentProjects = [
      cwd,
      ...(state.recentProjects || []).filter((p) => p !== cwd),
    ].slice(0, 12);
    saveState(state);
    return cwd;
  });

  /**
   * Open a project and attach an ACP session on the calling window.
   * @param {string} cwd
   * @param {{
   *   mode?: 'continue' | 'new' | 'resume',
   *   sessionId?: string,
   *   allowSameCheckout?: boolean,
   * }} [opts]
   *   - continue (default): resume most recent session for cwd (CLI `-c`)
   *   - new: brand-new session (CLI `/new`)
   *   - resume: load opts.sessionId (CLI `--resume id`)
   *   - allowSameCheckout: skip the “already open in another window” prompt
   */
  ipcMain.handle("project:open", async (e, cwd, opts = {}) => {
    const ws = sessionFromEvent(e);
    if (!ws) throw new Error("No window for project:open");
    if (!cwd || !fs.existsSync(cwd)) {
      throw new Error(`Project path not found: ${cwd}`);
    }
    if(opts.mode==='new'&&!opts.allowSameCheckout){const target=await resolveConcurrentChat(ws,cwd);cwd=target.cwd;opts={...opts,...target};}
    const agent = agentForWorktreeRpc(cwd, ws, allExecutionSessions());
    ws.openingCwd = cwd;
    broadcastOpenCheckouts();
    try {
      const plan = await planProjectOpen(cwd, {
        agent,
        openRows: collectOpenCheckouts(),
        excludeWindowId: ws.win.id,
        allowSameCheckout: Boolean(opts?.allowSameCheckout),
      });
      if (plan.conflict) return plan.conflict;
      const result = await openSessionOnWindow(ws, {
        cwd,
        mode: opts?.mode || "continue",
        sessionId: opts?.sessionId,
        mostRecent: mostRecentSession,
        loadState: loadSessionOpenState,
        listSessions: listSessionsForCwd,
        remember: rememberProjectSession,
      });
      await commitFamilyAfterOpen(cwd, sessionFromEvent({sender:e.sender}).agent, plan.acpWorktrees);
      return applyNewChatDefaults(sessionFromEvent({sender:e.sender}),result);
    } finally {
      if (ws.openingCwd === cwd) ws.openingCwd = null;
      broadcastOpenCheckouts();
    }
  });

  ipcMain.handle('project:recover',async(e,cwd,sessionId)=>{
    const ws=sessionFromEvent(e);if(!ws||!cwd||!fs.existsSync(cwd))throw Error('Workspace unavailable');
    const previous=ws.agent;clearProjectOnWindow(ws);ws.agentChain=Promise.resolve();
    if(previous)await previous.dispose();
    return openSessionOnWindow(ws,{cwd,mode:sessionId?'resume':'continue',sessionId,mostRecent:mostRecentSession,loadState:loadSessionOpenState,listSessions:listSessionsForCwd,remember:rememberProjectSession});
  });
  ipcMain.handle("project:list-open", async () => collectOpenCheckouts());

  ipcMain.handle("project:focus-window", async (_e, windowId) => {
    const id = Number(windowId);
    const other = windowSessions.get(id);
    if (!other?.win || other.win.isDestroyed()) return false;
    focusWindow(other.win);
    return true;
  });

  ipcMain.handle("project:take-pending-open", async (e) => {
    const ws = sessionFromEvent(e);
    if (!ws?.pendingOpenCwd) return null;
    const pending = ws.pendingOpenCwd;
    ws.pendingOpenCwd = null;
    return { cwd: pending, allowSameCheckout: true };
  });

  ipcMain.handle("window:open-project-in-new", async (_e, cwd) => {
    if (!cwd || !fs.existsSync(cwd)) {
      throw new Error(`Project path not found: ${cwd}`);
    }
    createWindow({ cwd });
    return { ok: true };
  });

  ipcMain.handle("git:inspect-checkout", async (e, cwd) => {
    const ws = sessionFromEvent(e);
    const root =
      typeof cwd === "string" && cwd
        ? cwd
        : ws?.agent?.cwd || ws?.lastCwd;
    if (!root) return inspectProjectCheckout("");
    const agent = agentForWorktreeRpc(root, ws, allExecutionSessions());
    return inspectProjectCheckout(root, {
      agent,
      openRows: collectOpenCheckouts(),
      excludeWindowId: ws?.win?.id ?? null,
    });
  });

  /** Same as TUI `/new` worktree — ACP create, Grok chooses the path. */
  ipcMain.handle("worktree:create", async (e, opts = {}) => {
    const ws = sessionFromEvent(e);
    const sessionCwd = ws?.agent?.cwd || ws?.lastCwd;
    const targetCwd = resolveWorktreeCreateCwd(
      opts.cwd,
      sessionCwd,
      collectOpenCheckouts(),
    );
    if (!targetCwd) {
      throw new Error(
        sessionCwd
          ? "Worktree create is limited to the open project."
          : "Open a project first — worktrees need a live Grok session.",
      );
    }
    const agent = agentForWorktreeRpc(targetCwd, ws, allExecutionSessions());
    return createAcpWorktree(agent, {
      sourceCwd: targetCwd,
      label: opts.label,
    });
  });

  /** Drop agent + empty-shell title on this window (logout / leave project). */
  ipcMain.handle("project:close", async (e) => {
    const ws = sessionFromEvent(e);
    if (!ws) return false;
    return clearProjectOnWindow(ws);
  });

  /** Respawn this window's grok agent and resume the current session. */
  ipcMain.handle("agent:restart", async (e) => {
    const ws = sessionFromEvent(e);
    if (!ws) throw new Error("No window for agent:restart");
    const result = await restartAgentOnWindow(ws, {
      loadState: loadSessionOpenState,
      listSessions: listSessionsForCwd,
      remember: rememberProjectSession,
    });
    const backbone = await inspectBackbone(result.cwd);
    return mergeRestartResult(result, backbone);
  });

  ipcMain.handle("sessions:list", async (_e, cwd) => {
    if (!cwd) return [];
    return listSessionsForCwd(cwd);
  });

  ipcMain.handle("sessions:rename", async (e, { cwd, sessionId, title } = {}) => {
    const ws = sessionFromEvent(e);
    const project = cwd || ws?.agent?.cwd || ws?.lastCwd;
    if (!project) throw new Error("No project open");
    const cleaned = sanitizeSessionTitle(title);
    if (!cleaned) throw new Error("Title must not be blank");
    if ([...cleaned].length > MAX_SESSION_TITLE_LENGTH) {
      throw new Error(
        `Title too long (max ${MAX_SESSION_TITLE_LENGTH} characters)`,
      );
    }
    const agent = ws?.agent;
    if (agent?.ready) {
      try {
        await agent.renameSession({
          sessionId,
          title: cleaned,
          cwd: project,
        });
        return {
          ok: true,
          title: cleaned,
          sessions: listSessionsForCwd(project),
        };
      } catch (err) {
        const missing =
          err?.code === -32601 ||
          /method not found|-32601|not available on this Grok CLI/i.test(
            String(err?.message || err),
          );
        if (!missing) {
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
    }
    const written = renameSessionOnDisk(project, sessionId, cleaned);
    return {
      ok: true,
      title: written.title,
      sessions: listSessionsForCwd(project),
    };
  });

  ipcMain.handle("sessions:delete", async (e, { cwd, sessionId } = {}) => {
    const ws = sessionFromEvent(e);
    const project = cwd || ws?.agent?.cwd || ws?.lastCwd;
    if (!project) throw new Error("No project open");
    const owner=allExecutionSessions().find(record=>record.lastCwd===project&&record.lastSessionId===sessionId);
    if(owner&&(owner.queue?.running||owner.agent?.getRunState().active||owner.queue?.items.length||['pendingPlanApprovals','pendingUserQuestions','pendingFolderTrust','pendingMcpElicits'].some(key=>owner[key].size)))throw Error('Stop this chat and remove its queued messages before deleting it.');
    const forgetOwner=()=>{if(owner){disposeWindowSession(owner);owner.host.records.delete(owner.recordId);if(owner.host.selected===owner)owner.host.selected=owner.host.create();}};
    const agent = owner?.agent || ws?.agent;
    if (agent?.ready) {
      try {
        await agent.deleteSession({ sessionId, cwd: project });
        forgetOwner();
        return { ok: true, sessions: listSessionsForCwd(project) };
      } catch (err) {
        const missing =
          err?.code === -32601 ||
          /method not found|-32601|not available on this Grok CLI/i.test(
            String(err?.message || err),
          );
        if (!missing) {
          throw err instanceof Error ? err : new Error(String(err));
        }
      }
    }
    deleteSessionOnDisk(project, sessionId);
    forgetOwner();
    return { ok: true, sessions: listSessionsForCwd(project) };
  });

  ipcMain.handle("sessions:open", async (e, { cwd, sessionId, mode }) => {
    const ws = sessionFromEvent(e);
    if (!ws) throw new Error("No window for sessions:open");
    if (!cwd || !fs.existsSync(cwd)) {
      throw new Error(`Project path not found: ${cwd}`);
    }
    const target=mode==='new'?await resolveConcurrentChat(ws,cwd):{cwd,mode:'resume',sessionId};
    const result=await openSessionOnWindow(ws, {
      ...target,
      mostRecent: mostRecentSession,
      loadState: loadSessionOpenState,
      listSessions: listSessionsForCwd,
      remember: rememberProjectSession,
    });
    return applyNewChatDefaults(sessionFromEvent({sender:e.sender}),result);
  });

  ipcMain.handle(
    "agent:prompt",
    async (e, { text, images = [], imageQuality = "compact" }) => {
      const ws=sessionFromEvent(e),agent=ws ? await ensureAgent(ws,ws.lastCwd,{resumeSessionId:ws.lastSessionId}) : null;
      if (!agent?.ready)
        throw new Error("Agent not connected. Open a project first.");
      const sessionId=agent.sessionId,noticeKey=`turn:${Date.now()}:${Math.random()}`;
      taskNotifier.dismiss(ws);
      try {
        const reply=await agent.prompt(text, { images, imageQuality });
        if(reply?.stopReason!=='cancelled')taskNotifier.show(ws,{kind:'complete',key:noticeKey,sessionId});
        return reply;
      } catch (err) {
        if(!/cancel/i.test(err?.message||''))taskNotifier.show(ws,{kind:'failed',key:noticeKey,sessionId});
        // IPC clones Error.message only — keep the formatted ACP reason.
        throw new Error(err?.message || String(err));
      }
    },
  );

  ipcMain.handle(
    "agent:interject",
    async (
      e,
      { text, images = [], imageQuality = "compact", interjectionId } = {},
    ) => {
      const agent = sessionFromEvent(e)?.agent;
      if (!agent?.ready)
        throw new Error("Agent not connected. Open a project first.");
      try {
        return await agent.interject(text, {
          images,
          imageQuality,
          interjectionId,
        });
      } catch (err) {
        // IPC clones Error.message only, not `.code` — keep unsupported as JSON.
        const mapped = mapInterjectIpcError(err, interjectionId);
        if (mapped) return mapped;
        throw new Error(err?.message || String(err));
      }
    },
  );

  ipcMain.handle("agent:compact", async (e, hint = "") => {
    const agent = sessionFromEvent(e)?.agent;
    if (!agent?.ready)
      throw new Error("Agent not connected. Open a project first.");
    try {
      const result = await agent.compactConversation(
        typeof hint === "string" ? hint : "",
      );
      // IPC can only clone plain JSON — drop class instances / cycles.
      return JSON.parse(JSON.stringify(result ?? { ok: true }));
    } catch (err) {
      throw new Error(err?.message || String(err));
    }
  });

  ipcMain.handle("agent:cancel", async (e) => {
    // ACP turn cancel: answer every open agent→client request (tool
    // permissions + plan approval + ask-user), dismiss renderer modals,
    // then notify the agent and tear down tool terminals.
    const ws = sessionFromEvent(e);
    if (ws) { if(ws.queue) ws.queue.stop(); else {clearPendingPermissions(ws);ws.agent?.cancel();} }
    return true;
  });

  ipcMain.handle("agent:set-allow-writes-session", async (e, value) => {
    const ws = sessionFromEvent(e);
    if (!ws?.agent) return { allowWritesThisSession: false };
    const run = () => {
      if (!ws.agent) return { allowWritesThisSession: false };
      const on = ws.agent.setAllowWritesThisSession(Boolean(value));
      if (on) settlePendingAllowOnce(ownerIdFor(ws));
      return { allowWritesThisSession: on };
    };
    const p = Promise.resolve(ws.writesChain).then(run, run);
    ws.writesChain = p.then(
      () => undefined,
      () => undefined,
    );
    return p;
  });

  ipcMain.handle("agent:permission-respond", async (e, { reqId, outcome }) => {
    const ws = sessionFromEvent(e);
    if (!ws) return false;
    return settlePermission(reqId, outcome, ownerIdFor(ws));
  });

  setOnEnableAlwaysApprove(() => {
    const prev = normalizePermissionMode(loadState().permissionMode);
    const state = loadState();
    state.permissionMode = "always-approve";
    delete state.alwaysApprove;
    saveState(state);
    broadcastPermissionMode("always-approve");
    if (prev === "always-approve") return;
    // Live notify only — do not respawn mid-turn (Settings still restarts).
    void syncPermissionModeLiveToAllWindows("always-approve");
  });

  /** Mirror open gates after renderer reload / HMR (main is source of truth). */
  ipcMain.handle("agent:list-pending-permissions", async (e) => {
    const ws = sessionFromEvent(e);
    // No window → empty list (do not leak other windows' gates)
    if (!ws) return [];
    return listPendingPermissionRequests(ownerIdFor(ws));
  });

  /**
   * @param {Map<string, import('./parked-request.mjs').ParkedEntry> | undefined} map
   * @param {string} reqId
   * @param {any} fallback
   */
  const settleParkedIpc = (map, reqId, fallback) => {
    return settleParked(map?.get(reqId), fallback);
  };

  const emptyParkedGates = () => ({
    folderTrust: [],
    planApprovals: [],
    userQuestions: [],
    mcpElicits: [],
  });

  ipcMain.handle("agent:list-pending-gates", async (e) => {
    const ws = sessionFromEvent(e);
    if (!ws) return emptyParkedGates();
    return {
      folderTrust: listParked(ws.pendingFolderTrust),
      planApprovals: listParked(ws.pendingPlanApprovals),
      userQuestions: listParked(ws.pendingUserQuestions),
      mcpElicits: listParked(ws.pendingMcpElicits),
    };
  });

  ipcMain.handle("agent:plan-approval-respond", async (e, { reqId, decision }) => {
    const ws = sessionFromEvent(e);
    const comments=decision?.type==='approved'?String(decision.feedback||'').trim():'';
    const settled=settleParkedIpc(ws?.pendingPlanApprovals,reqId,decision?.type==='approved'?{type:'approved'}:decision||{type:'abandoned'});
    if(settled&&comments){
      try{const result=await ws.agent.interject(comments);if(result?.ok===false)throw Error('Interject unavailable');}
      catch{await ensureExecutionQueue(ws).submit({id:crypto.randomUUID(),text:comments,images:[],at:Date.now()},'auto');}
    }
    return settled;
  });

  ipcMain.handle("agent:user-question-respond", async (e, { reqId, decision }) => {
    const ws = sessionFromEvent(e);
    return settleParkedIpc(
      ws?.pendingUserQuestions,
      reqId,
      decision || { type: "declined" },
    );
  });

  ipcMain.handle("agent:folder-trust-respond", async (e, { reqId, decision }) => {
    const ws = sessionFromEvent(e);
    return settleParkedIpc(
      ws?.pendingFolderTrust,
      reqId,
      decision || { outcome: "reject" },
    );
  });

  ipcMain.handle("agent:mcp-elicit-respond", async (e, { reqId, decision }) => {
    const ws = sessionFromEvent(e);
    return settleParkedIpc(
      ws?.pendingMcpElicits,
      reqId,
      decision || { outcome: "cancel" },
    );
  });

  /** @deprecated prefer agent:set-permission-mode */
  ipcMain.handle("agent:set-always-approve", async (_e, value) => {
    const prev = normalizePermissionMode(loadState().permissionMode);
    const mode = value ? "always-approve" : "ask";
    const state = loadState();
    state.permissionMode = mode;
    delete state.alwaysApprove;
    saveState(state);
    broadcastPermissionMode(mode);
    await applyPermissionModeToAllWindows(mode, prev);
    return mode === "always-approve";
  });

  ipcMain.handle("agent:set-permission-mode", async (_e, value) => {
    const prev = normalizePermissionMode(loadState().permissionMode);
    const mode = normalizePermissionMode(value);
    const state = loadState();
    state.permissionMode = mode;
    delete state.alwaysApprove;
    saveState(state);
    broadcastPermissionMode(mode);
    return applyPermissionModeToAllWindows(mode, prev);
  });

  ipcMain.handle('app:set-reasoning-default',(_e,value)=>{const state=loadState();state.reasoningEffort=normalizeReasoningEffort(value);saveState(state);return state.reasoningEffort;});
  ipcMain.handle("agent:set-reasoning-effort", async (e, value) => {
    const effort = normalizeReasoningEffort(value);
    const state = loadState();
    /** @type {{ effort: string, agentSynced: boolean, error?: string }} */
    let result = { effort, agentSynced: false };
    const agent = sessionFromEvent(e)?.agent;
    const expected=agent?.sessionId;
    if (agent?.setReasoningEffort) {
      result = await agent.setReasoningEffort(effort);
    }

    const live=sessionFromEvent(e)?.agent;if(live!==agent||live?.sessionId!==expected)return {effort:live?.reasoningEffort||state.reasoningEffort,agentSynced:false,error:"Session changed"};
    if (result.error && !result.agentSynced) return result;
    return result;
  });

  ipcMain.handle("agent:set-model", async (e, modelId) => {
    const ws = sessionFromEvent(e);
    const agent = ws?.agent;
    if (!agent?.setModel) {
      return {
        modelId: null,
        modelName: null,
        availableModels: [],
        agentSynced: false,
        error: "No live agent",
      };
    }
    const sessionId = agent.sessionId;
    const result = await agent.setModel(modelId);
    const live = sessionFromEvent(e)?.agent;
    if (live !== agent || live?.sessionId !== sessionId) {
      return {
        ...(typeof live?._modelsPublic === "function"
          ? live._modelsPublic()
          : result),
        agentSynced: false,
        error: "Session changed",
      };
    }

    return result;
  });

  ipcMain.handle("agent:get-runtime-state", async (e) => {
    const agent = sessionFromEvent(e)?.agent;
    if (!agent?.ready) throw new Error("Agent is not ready");
    return agent.getRuntimeState();
  });

  ipcMain.handle("agent:set-context-window", async (e, size) => {
    const agent = sessionFromEvent(e)?.agent;
    if (!agent?.ready) throw new Error("Agent is not ready");
    const result=await agent.setContextWindow(size);if(sessionFromEvent(e)?.agent!==agent)throw Error("Session changed");return result;
  });

  ipcMain.handle("agent:set-session-mode", async (e, modeId) => {
    const ws = sessionFromEvent(e);
    const agent = ws?.agent;
    if (!agent?.setSessionMode) {
      return {
        modeId: null,
        agentSynced: false,
        error: "No live agent",
      };
    }
    const sessionId = agent.sessionId;
    const result = await agent.setSessionMode(modeId);
    const live = sessionFromEvent(e)?.agent;
    if (live !== agent || live?.sessionId !== sessionId) {
      return {
        modeId: live?.currentModeId || null,
        agentSynced: false,
        error: "Session changed",
      };
    }
    return result;
  });

  ipcMain.handle("agent:set-allow-outside-project", async (_e, value) => {
    const state = loadState();
    state.allowOutsideProject = Boolean(value);
    saveState(state);
    for (const ws of allExecutionSessions()) {
      ws.agent?.setAllowOutsideProject(state.allowOutsideProject);
    }
    return state.allowOutsideProject;
  });

  ipcMain.handle("agent:set-sandbox-terminal", async (_e, value) => {
    const state = loadState();
    // Explicit boolean from UI — do not use `!== false` here (undefined would stick ON)
    state.sandboxTerminal = Boolean(value);
    saveState(state);
    for (const ws of allExecutionSessions()) {
      ws.agent?.setSandboxTerminal(state.sandboxTerminal);
    }
    // Start Docker image pull/build off the UI thread when sandbox is (re)enabled
    if (state.sandboxTerminal) {
      maybeWarmDockerSandbox();
    }
    return state.sandboxTerminal;
  });

  ipcMain.handle("app:set-theme", async (_e, value) => {
    const theme = value === "light" ? "light" : "dark";
    const state = loadState();
    state.theme = theme;
    saveState(state);
    applyPreviewTheme(theme);
    return theme;
  });

  ipcMain.handle("app:set-privacy-mode", async (_e, value) => {
    const state = loadState();
    state.privacyMode = Boolean(value);
    saveState(state);
    return state.privacyMode;
  });

  ipcMain.handle("app:set-auto-compact-at", async (_e, value) => {
    const state = loadState();
    state.autoCompactAt = normalizeAutoCompactAt(value);
    saveState(state);
    return state.autoCompactAt;
  });

  /** CLI `/privacy` — coding data retention & training (auth.json). */
  ipcMain.handle("app:get-coding-data", async () => getCodingDataStatus());

  ipcMain.handle("app:set-coding-data-opt-in", async () => {
    throw new Error('Sharing is managed by the official Grok CLI /privacy command.');
  });

  ipcMain.handle("app:set-allow-prerelease", async (_e, value) => {
    const state = loadState();
    state.allowPrerelease = Boolean(value);
    saveState(state);
    setAllowPrerelease(state.allowPrerelease);
    return state.allowPrerelease;
  });

  ipcMain.handle("app:set-debug-logging", async (_e, value) => {
    const state = loadState();
    state.debugLogging = Boolean(value);
    saveState(state);
    setDebugLogging(state.debugLogging);
    debugLog("settings", state.debugLogging ? "debug on" : "debug off", {
      path: getDebugLogPath(),
    });
    return {
      debugLogging: isDebugLogging(),
      debugLogPath: getDebugLogPath(),
    };
  });

  ipcMain.handle("app:open-crash-log", async () => {
    const p = getCrashLogPath();
    try {
      if (!fs.existsSync(p)) {
        fs.writeFileSync(
          p,
          `${JSON.stringify({ t: new Date().toISOString(), scope: "crash", msg: "log created" })}\n`,
          "utf8",
        );
      }
    } catch {
      /* ignore */
    }
    const err = await shell.openPath(p);
    if (err) {
      shell.showItemInFolder(p);
    }
    return p;
  });

  ipcMain.handle("app:open-debug-log", async () => {
    const p = getDebugLogPath();
    try {
      if (!fs.existsSync(p)) {
        fs.writeFileSync(
          p,
          `${JSON.stringify({ t: new Date().toISOString(), scope: "debug", msg: "log created" })}\n`,
          "utf8",
        );
      }
    } catch {
      /* ignore */
    }
    const err = await shell.openPath(p);
    if (err) {
      // openPath returns error string on failure
      shell.showItemInFolder(p);
    }
    return p;
  });

  registerProjectFilesIpc({ ipcMain, sessionFromEvent, shell, loadState, saveState });

  registerPreviewIpc({
    loadState,
    savePatch: (patch) => {
      const state = loadState();
      Object.assign(state, patch || {});
      saveState(state);
    },
    getOwner: (e) => {
      const ws = sessionFromEvent(e);
      return ws?.win && !ws.win.isDestroyed() ? ws.win : null;
    },
    ownerHasProject: (win) => {
      const ws = windowSessions.get(win.id);
      return Boolean(ws?.agent?.cwd || ws?.lastCwd);
    },
    broadcast: (payload) => {
      for (const ws of windowSessions.values()) {
        send(ws, "preview:changed", payload);
      }
    },
  });

  ipcMain.handle("shell:open-external", async (_e, url) => {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      throw new Error("Only http(s) URLs are allowed");
    }
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle("clipboard:write", (_e, payload = {}) => {
    const text = typeof payload.text === "string" ? payload.text : "";
    const html = typeof payload.html === "string" ? payload.html : "";
    const max = 8 * 1024 * 1024;
    if (text.length > max || html.length > max) {
      throw new Error("Clipboard payload too large");
    }
    if (html) clipboard.write({ text, html });
    else clipboard.writeText(text);
    return true;
  });
}

// One process, many windows. Packaged Start Menu / second launch must not
// start a fresh occupancy map (that skipped the “already open” prompt).
// Unpackaged (npm run dev) skips the lock so it does not join an install.
wireWorktreePathGate();
configureDesktopInstance(app);
const isPrimaryInstance = isPrimaryDesktopInstance(app);
if (!isPrimaryInstance) {
  app.quit();
} else {
  wireSecondInstance(app, argv => newWindowFromMenu(argv));
}

app.whenReady().then(() => {
  if (!isPrimaryInstance) return;
  setDesktopStateLoader(loadState);
  setAllowPrerelease(Boolean(loadState().allowPrerelease));
  registerIpc();
  installHistoryIpc({ipcMain,app,BrowserWindow,dialog});
  installDraftIpc({ipcMain,app});
  migrateCustom8(storePath,loadState());
  installUsageIpc({ ipcMain, app, BrowserWindow, sessionFromEvent });
  installQueueIpc({ ipcMain, app });
  installGitIpc({ ipcMain, sessionFromEvent });
  installPtyIpc({ ipcMain, app, sessionFromEvent, loadState });
  registerWorkspaceRootsIpc({ ipcMain, dialog, BrowserWindow, sessionFromEvent });
  wireWindowMenuRefresh();
  // Native splash first; main window stays hidden until the renderer paints.
  createWindow({ splash: true, cwd:requestedLaunchDirectory(process.argv,app.isPackaged) });
  installApplicationMenu();
  setupAutoUpdater(updateHooks);

  void startPreviewApi({
    // Fallback when the MCP request has no window header (menu / old agent).
    getOwner: () => {
      const ws = focusedSession();
      return ws?.win && !ws.win.isDestroyed() ? ws.win : null;
    },
  })
    .then((preview) => {
      debugLog("preview", "api-ready", {
        port: preview?.port || null,
        ready: Boolean(preview),
      });
      installDesktopPreviewSkill();
    })
    .catch((err) => {
      debugLog("preview", "api-failed", {
        error: err?.message || String(err),
      });
      installDesktopPreviewSkill();
    });

  // Warm Docker sandbox image in the background when sandbox is on (default).
  // Pull/build must never run on the terminal/create hot path (freezes UI).
  // Delay the WSL/bwrap spawnSync probe so first paint is not stalled.
  try {
    const state = loadState();
    setDebugLogging(Boolean(state.debugLogging));
    debugLog("app", "ready", {
      version: app.getVersion(),
      debug: isDebugLogging(),
      logPath: getDebugLogPath(),
    });
    if (state.sandboxTerminal !== false) {
      setTimeout(() => {
        try {
          maybeWarmDockerSandbox();
        } catch {
          /* ignore */
        }
      }, 1500);
    }
  } catch {
    /* ignore */
  }

  app.on("activate", () => {
    // Do not recreate a window mid update-install
    if (isQuittingForUpdate()) return;
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow({ splash: true });
    }
  });
});

app.on("window-all-closed", () => {
  writeCrashLog("app", "window-all-closed-handler", {
    quittingForUpdate: isQuittingForUpdate(),
    platform: process.platform,
  });
  if (isQuittingForUpdate()) return;
  if (process.platform !== "darwin") app.quit();
});

// Do not `await` dispose here — async before-quit handlers can stall
// electron-updater quitAndInstall so "Restart now" appears to do nothing.
let quitTasksConfirmed=false;
app.on("before-quit", (event) => {
  const running=allExecutionSessions().filter(record=>executionHasActiveWork(record));
  if(running.length&&!quitTasksConfirmed){
    event.preventDefault();
    const owner=BrowserWindow.getFocusedWindow(),options={type:'question',buttons:['Keep working','Stop tasks and quit'],defaultId:0,cancelId:0,message:`${running.length} chat${running.length===1?' is':'s are'} still working`,detail:'Quitting stops all agents. Your history and saved unsent messages will be kept.'};
    const decision=owner?dialog.showMessageBoxSync(owner,options):dialog.showMessageBoxSync(options);
    if(decision===1){quitTasksConfirmed=true;app.quit();}
    return;
  }
  appQuitting = true;
  writeCrashLog("app", "before-quit-handler", {
    quittingForUpdate: isQuittingForUpdate(),
  });
  closeSplash();
});
app.on("will-quit", () => disposeAgentQuick());
