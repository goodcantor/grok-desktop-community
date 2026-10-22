import { configurePreviewPermissions } from './preview-permissions.mjs';
/**
 * Browser panel hosted as native WebContentsViews in the owning chat window.
 * An ownerless caller can still use the legacy detached BrowserWindow.
 *
 * Isolated session (no host cookies). http(s) only.
 */
import {
  BrowserWindow,
  WebContentsView,
  ipcMain as nativePreviewIpc,
  screen,
  session,
  shell,
} from "electron";
import path from "node:path";
import {bootBackground} from "./splash.mjs";
import { fileURLToPath } from "node:url";
import {
  estimateImageTokens,
  formatPreviewCapturePrompt,
  normalizePreviewUrl,
} from "./preview-url.mjs";
import {
  formatPreviewSnapshot,
  PAGE_SNAPSHOT_SCRIPT,
} from "./preview-snapshot.mjs";
import { previewActionScript } from "./preview-interact.mjs";
import {
  PreviewNetworkLog,
  formatNetworkDump,
  ingestWebRequest,
} from "./preview-network.mjs";
import { errorFields, writeCrashLog } from "./crash-log.mjs";
import {installZoom} from './zoom.mjs';
import {stepZoom} from '../shared/zoom.mjs';
import {fitPreviewViewport} from '../shared/preview-geometry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const VIEWPORTS = {
  fluid: { id: "fluid", label: "Fluid", width: 0, height: 0 },
  desktop: { id: "desktop", label: "1280×800", width: 1280, height: 800 },
  tablet: { id: "tablet", label: "768×1024", width: 768, height: 1024 },
  mobile: { id: "mobile", label: "390×844", width: 390, height: 844 },
};

const TOOLBAR_FALLBACK = 52;

/** @type {import('electron').BrowserWindow | null} */
let previewWin = null;
let dockOwner = null;
let dockChrome = null;
let dockBounds = null;
let dockVisible = false;
let dockOpening = null;
let lastError = '';
let navigationGeneration=0;
let lastEmulationKey='';
/** @type {import('electron').WebContentsView | null} */
let guestView = null;
/** @type {((state: Record<string, unknown>) => void) | null} */
let persist = null;
/** @type {(() => Record<string, unknown>) | null} */
let readState = null;
/** @type {((payload: Record<string, unknown>) => void) | null} */
let broadcast = null;
/** Chat window that opened Preview — user screenshots go here, not MCP. */
/** @type {import('electron').BrowserWindow | null} */
let ownerWin = null;
/** @type {((win: import('electron').BrowserWindow) => boolean) | null} */
let ownerHasProject = null;

let toolbarHeight = TOOLBAR_FALLBACK;
let sideWidth = 0;
let bottomHeight = 0;
let viewportId = "fluid";
let lastUrl = "about:blank";
let lastTitle = "";
let loading = false;
let ipcReady = false;
let captureSender=null;
export function ownsPreviewContents(wc){return wc===guestWc()||wc===chromeWc();}
export function hideExecutionPreview(){dockVisible=false;dockChrome?.setVisible(false);guestView?.setVisible(false);}

/** @type {PreviewNetworkLog} */
let networkLog = new PreviewNetworkLog();
let detachNetwork = () => {};
let networkHint = "";
/** @type {ReturnType<typeof setTimeout> | null} */
let netTimer = null;

function themeFromState() {
  const t = readState?.()?.theme;
  return t === "light" ? "light" : "dark";
}

function isLive() {
  return Boolean((previewWin && !previewWin.isDestroyed()) || (dockOwner && !dockOwner.isDestroyed() && dockChrome && !dockChrome.webContents.isDestroyed()));
}

function guestWc() {
  if (!guestView) return null;
  const wc = guestView.webContents;
  return wc && !wc.isDestroyed() ? wc : null;
}

function chromeWc() {
  if (!isLive()) return null;
  const wc = dockChrome?.webContents || previewWin?.webContents;
  return wc && !wc.isDestroyed() ? wc : null;
}

export function getPreviewWindow() {
  return previewWin && !previewWin.isDestroyed() ? previewWin : null;
}

export function isPreviewOpen() {
  return isLive();
}

/**
 * Prefer a display that is not the owner window — that is the point.
 * @param {import('electron').BrowserWindow | null | undefined} owner
 * @param {unknown} saved
 */
export function preferredPreviewBounds(owner, saved) {
  const displays = screen.getAllDisplays();
  const savedBounds =
    saved &&
    typeof saved === "object" &&
    Number.isFinite(saved.x) &&
    Number.isFinite(saved.y) &&
    Number(saved.width) >= 480 &&
    Number(saved.height) >= 360
      ? {
          x: Number(saved.x),
          y: Number(saved.y),
          width: Number(saved.width),
          height: Number(saved.height),
        }
      : null;

  if (savedBounds) {
    const hits = displays.some((d) => {
      const a = d.workArea;
      return (
        savedBounds.x + 40 < a.x + a.width &&
        savedBounds.x + savedBounds.width - 40 > a.x &&
        savedBounds.y + 40 < a.y + a.height &&
        savedBounds.y + savedBounds.height - 40 > a.y
      );
    });
    if (hits) return savedBounds;
  }

  const ownerBounds = owner && !owner.isDestroyed() ? owner.getBounds() : null;
  const ownerDisplay = ownerBounds
    ? screen.getDisplayMatching(ownerBounds)
    : screen.getPrimaryDisplay();
  const other = displays.find((d) => d.id !== ownerDisplay.id);
  const target = other || ownerDisplay;
  const wa = target.workArea;
  const width = Math.min(1180, Math.max(720, wa.width - 48));
  const height = Math.min(860, Math.max(520, wa.height - 48));
  return {
    x: Math.round(wa.x + (wa.width - width) / 2),
    y: Math.round(wa.y + (wa.height - height) / 2),
    width,
    height,
  };
}

function persistNow() {
  if (!persist || !isLive()) return;
  persist({
    ...(getPreviewWindow()?{previewBounds:previewWin.getBounds()}:{}),
    previewLastUrl: lastUrl === "about:blank" ? "" : lastUrl,
    previewViewport: viewportId,
  });
}

function emitChrome(extra={}) {
  const payload = {...previewPublicState(),...extra};
  try {
    chromeWc()?.send("preview:state", payload);
  } catch {
    /* chrome may be gone */
  }
  try {
    broadcast?.(payload);
  } catch {
    /* ignore */
  }
}

export function previewPublicState() {
  return {
    open: isLive(),
    url: lastUrl,
    title: lastTitle,
    viewport: viewportId,
    loading,
    error:lastError,
    presentation:dockOwner?'docked':'window',
    ownerWindowId:(dockOwner||ownerWindow())?.id||null,
    visible:dockOwner?dockVisible:isLive(),
    zoom:guestWc()?.getZoomFactor()||1,
    canGoBack: Boolean(guestWc()?.navigationHistory?.canGoBack?.()),
    canGoForward: Boolean(guestWc()?.navigationHistory?.canGoForward?.()),
  };
}

function emitNetwork() {
  const payload = {
    ...networkLog.snapshot(),
    error: networkHint || "",
  };
  try {
    chromeWc()?.send("preview:network", payload);
  } catch {
    /* chrome may be gone */
  }
}

function emitNetworkSoon() {
  if (netTimer) return;
  netTimer = setTimeout(() => {
    netTimer = null;
    emitNetwork();
  }, 100);
}

/**
 * CDP Network + Page on the guest. One debugger client — do not open
 * guest DevTools while this is attached (Electron allows one attach).
 * @param {import('electron').WebContents} wc
 */
function attachGuestNetwork(wc) {
  detachNetwork();
  networkLog = new PreviewNetworkLog();
  networkHint = "";
  const dbg = wc.debugger;
  const onMessage = (_event, method, params) => {
    networkLog.handleCdp(method, params);
    emitNetworkSoon();
  };
  const onDetach = (_event, reason) => {
    if (reason && reason !== "target closed" && reason !== "canceled") {
      attachWebRequestFallback(wc.session);
    }
    emitNetworkSoon();
  };
  try {
    if (!dbg.isAttached()) dbg.attach("1.3");
    dbg.on("message", onMessage);
    dbg.on("detach", onDetach);
    void dbg
      .sendCommand("Network.enable", { maxPostDataSize: 0 })
      .then(async () => {
        try {
          await dbg.sendCommand("Page.enable");
          await dbg.sendCommand("Page.setLifecycleEventsEnabled", {
            enabled: true,
          });
        } catch {
          /* Page events optional — did-finish-load is the fallback */
        }
      })
      .catch(() => {
        try {
          if (dbg.isAttached()) dbg.detach();
        } catch {
          /* ignore */
        }
        attachWebRequestFallback(wc.session);
        emitNetworkSoon();
      });
  } catch {
    attachWebRequestFallback(wc.session);
  }

  const onDomReady = () => {
    if (networkLog.dclTs == null) networkLog.markDomContentLoaded();
    emitNetworkSoon();
  };
  const onFinish = () => {
    if (networkLog.loadTs == null) networkLog.markLoad();
    emitNetworkSoon();
  };
  wc.on("dom-ready", onDomReady);
  wc.on("did-finish-load", onFinish);

  detachNetwork = () => {
    wc.removeListener("dom-ready", onDomReady);
    wc.removeListener("did-finish-load", onFinish);
    detachWebRequest(wc.session);
    try {
      dbg.removeListener("message", onMessage);
    } catch {
      /* ignore */
    }
    try {
      dbg.removeListener("detach", onDetach);
    } catch {
      /* ignore */
    }
    try {
      if (dbg.isAttached()) dbg.detach();
    } catch {
      /* ignore */
    }
    detachNetwork = () => {};
  };
}

function attachWebRequestFallback(ses) {
  if (!ses?.webRequest) return;
  detachWebRequest(ses);
  ses.webRequest.onBeforeRequest((details, callback) => {
    try {
      ingestWebRequest(networkLog, "start", details);
      emitNetworkSoon();
    } finally {
      callback?.({});
    }
  });
  ses.webRequest.onCompleted((details) => {
    ingestWebRequest(networkLog, "done", details);
    emitNetworkSoon();
  });
  ses.webRequest.onErrorOccurred((details) => {
    ingestWebRequest(networkLog, "error", details);
    emitNetworkSoon();
  });
}

function detachWebRequest(ses) {
  try {
    ses?.webRequest.onBeforeRequest(null);
    ses?.webRequest.onCompleted(null);
    ses?.webRequest.onErrorOccurred(null);
  } catch {
    /* ignore */
  }
}

export function snapshotPreviewNetwork(opts = {}) {
  if (!guestWc()) throw new Error("Preview is not open");
  const snap = networkLog.snapshot();
  return {
    ...snap,
    text: formatNetworkDump(snap, opts),
    error: networkHint || "",
  };
}

function layoutGuest() {
  if (!isLive() || !guestView) return;
  if(dockOwner&&!dockBounds)return;
  const [cw, ch] = dockBounds ? [dockBounds.width,dockBounds.height] : previewWin.getContentSize();
  const scale=chromeWc()?.getZoomFactor()||1;
  const top = Math.max(36, Math.ceil(toolbarHeight*scale));
  const side = Math.max(0, Math.min(sideWidth*scale, cw));
  const bottom = Math.max(0, Math.min(bottomHeight*scale, Math.floor(ch * 0.72)));
  const availW = Math.max(0, cw - side);
  const availH = Math.max(0, ch - top - bottom);
  const spec = VIEWPORTS[viewportId] || VIEWPORTS.fluid;
  let x = 0;
  let y = top;
  let width = availW;
  let height = availH;
  if (spec.width && spec.height) {
    const fitted=fitPreviewViewport(availW,availH,spec);
    width=fitted.width;height=fitted.height;
    x = Math.max(0, Math.floor((availW - width) / 2));
    y = top + Math.max(0, Math.floor((availH - height) / 2));
  }
  if(dockOwner&&dockChrome) {
    dockChrome.setBounds(dockBounds);dockChrome.setVisible(dockVisible);
    guestView.setVisible(dockVisible&&width>0&&height>0&&lastUrl!=='about:blank');
  }
  if (width < 1 || height < 1) return;
  try {
    if(dockOwner&&dockChrome) {
      dockChrome.setBounds(dockBounds);
      dockChrome.setVisible(dockVisible);
      guestView.setVisible(dockVisible&&lastUrl!=='about:blank');
      x+=dockBounds.x;y+=dockBounds.y;
    }
    guestView.setBounds({ x:Math.round(x), y:Math.round(y), width:Math.round(width), height:Math.round(height) });
    const wc=guestWc(),url=wc?.getURL();
    // Windows can crash if device emulation is used before the first page.
    if(wc&&url&&url!=='about:blank') {
      const fitted=fitPreviewViewport(availW,availH,spec),key=`${spec.id}:${fitted.scale.toFixed(5)}`;
      if(key!==lastEmulationKey) {
        if(spec.width)wc.enableDeviceEmulation({screenPosition:spec.id==='mobile'?'mobile':'desktop',screenSize:{width:spec.width,height:spec.height},viewSize:{width:spec.width,height:spec.height},deviceScaleFactor:spec.id==='mobile'?2:1,scale:fitted.scale});
        else wc.disableDeviceEmulation();
        lastEmulationKey=key;
      }
    }
  } catch {
    /* guest not attached yet */
  }
}

function applyViewport() {
  layoutGuest();
  emitChrome();
}

/**
 * @param {string} href
 */
async function loadGuest(href) {
  const wc = guestWc();
  if (!wc) throw new Error("Preview is not open");
  const parsed = normalizePreviewUrl(href);
  if (!parsed.ok) throw new Error(parsed.error);
  const generation=++navigationGeneration;
  lastUrl = parsed.href;
  layoutGuest();
  lastError='';
  loading = true;
  emitChrome();
  try {await wc.loadURL(parsed.href);}catch(error){
    // A newer navigation or a redirect can abort this load. That is not a
    // failed browser, and must not overwrite the new page's state.
    if(generation!==navigationGeneration||error?.code==='ERR_ABORTED'||error?.errno===-3||/ERR_ABORTED/.test(error?.message||''))return;
    lastError=error?.message||'Could not load this page';loading=false;emitChrome();throw error;
  }
}

function attachGuestHandlers(wc) {
  wc.setWindowOpenHandler(({ url }) => {
    const parsed = normalizePreviewUrl(url);
    if (parsed.ok && parsed.href !== "about:blank") {
      void loadGuest(parsed.href).catch(()=>{});
    }
    return { action: "deny" };
  });
  wc.on("will-navigate", (event, url) => {
    const parsed = normalizePreviewUrl(url);
    if (!parsed.ok) {
      event.preventDefault();
    }
  });
  wc.on("page-title-updated", (_e, title) => {
    lastTitle = title || "";
    if (getPreviewWindow()) previewWin.setTitle(lastTitle ? `${lastTitle} · Preview` : "Preview · Grok");
    emitChrome();
  });
  wc.on("did-start-loading", () => {
    loading = true;
    lastError='';
    emitChrome();
  });
  wc.on("did-stop-loading", () => {
    loading = false;
    lastUrl = wc.getURL() || lastUrl;
    lastTitle = wc.getTitle() || lastTitle;
    layoutGuest();
    emitChrome();
  });
  wc.on("did-navigate", (_e, url) => {
    lastUrl = url || lastUrl;
    emitChrome();
  });
  wc.on("did-navigate-in-page", (_e, url) => {
    lastUrl = url || lastUrl;
    emitChrome();
  });
  wc.on("did-fail-load", (_e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    loading = false;
    lastUrl = url || lastUrl;
    emitChrome();
    lastError=`Could not load this page: ${desc}`;emitChrome();
  });
}

function createGuest() {
  lastEmulationKey='';
  const ses = session.fromPartition("persist:grok-desktop-preview");
  configurePreviewPermissions(ses);
  const view = new WebContentsView({
    webPreferences: {
      session: ses,
      preload:path.join(__dirname,'preview','guest-preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      javascript: true,
    },
  });
  view.setBackgroundColor("#111113");
  view.webContents.desktopZoom=installZoom(view.webContents,{initial:readState?.()?.previewZoom||1,onChange:factor=>{persist?.({previewZoom:factor});emitChrome();}});
  view.webContents.on('before-input-event',(event,input)=>{
    if(input.type==='keyDown'&&(input.control||input.meta)&&input.key.toLowerCase()==='l') {
      event.preventDefault();chromeWc()?.focus();void chromeWc()?.executeJavaScript("document.getElementById('url').focus();document.getElementById('url').select();");
    }
  });
  attachGuestHandlers(view.webContents);
  return view;
}

/**
 * @param {object} opts
 * @param {import('electron').BrowserWindow | null} [opts.owner]
 * @param {string} [opts.url]
 */
function ownerWindow() {
  if (ownerWin && !ownerWin.isDestroyed()) return ownerWin;
  return null;
}

/**
 * Chat whose agent is driving Preview. Send screenshot goes here, not the focused window.
 * @param {import('electron').BrowserWindow | null | undefined} win
 */
export function claimPreviewOwner(win) {
  if (win && !win.isDestroyed()) ownerWin = win;
}

/**
 * @param {unknown} id
 * @returns {import('electron').BrowserWindow | null}
 */
export function windowById(id) {
  const n = Number.parseInt(String(id ?? ""), 10);
  if (!Number.isInteger(n) || n <= 0) return null;
  const win = BrowserWindow.fromId(n);
  return win && !win.isDestroyed() ? win : null;
}

export async function openPreviewWindow(opts = {}) {
  writeCrashLog("preview", "open-start", {
    url: opts.url || null,
    live: isLive(),
  });
  try {
    return await openPreviewWindowInner(opts);
  } catch (err) {
    writeCrashLog("preview", "open-failed", errorFields(err));
    throw err;
  }
}

async function openPreviewWindowInner(opts = {}) {
  const owner = opts.owner || null;
  claimPreviewOwner(owner);
  if(owner&&!opts.detached) return openDockedPreview(owner,opts.url);
  if(dockOwner)releaseDockHost();
  const state = readState?.() || {};
  viewportId = VIEWPORTS[state.previewViewport] ? state.previewViewport : "fluid";

  if (!isLive()) {
    const bounds = preferredPreviewBounds(owner, state.previewBounds);
    writeCrashLog("preview", "window-create", bounds);
    const win = new BrowserWindow({
      ...bounds,
      minWidth: 520,
      minHeight: 400,
      title: "Preview · Grok",
      show: false,
      autoHideMenuBar: true,
      backgroundColor: bootBackground(themeFromState()),
      webPreferences: {
        preload: path.join(__dirname, "preview", "preview-preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    previewWin = win;

    const persistSoon = debounce(persistNow, 250);
    win.on("resize", () => {
      layoutGuest();
      persistSoon();
    });
    win.on("move", persistSoon);
    win.on("closed", () => {
      if(previewWin!==win)return;
      persistNow();
      detachNetwork();
      if (netTimer) {
        clearTimeout(netTimer);
        netTimer = null;
      }
      previewWin = null;
      guestWc()?.close();guestView = null;
      ownerWin = null;
      lastTitle = "";
      lastUrl = "about:blank";
      loading = false;
      networkLog = new PreviewNetworkLog();
      networkHint = "";
      bottomHeight = 0;
      emitChrome();
      try {
        broadcast?.(previewPublicState());
      } catch {
        /* ignore */
      }
    });

    const chromeFile = path.join(__dirname, "preview", "index.html");
    writeCrashLog("preview", "chrome-load");
    await win.loadFile(chromeFile, { query: { theme: themeFromState() } });
    writeCrashLog("preview", "chrome-loaded");
    // HWND must exist before WebContentsView attach — add-then-show AVs on Windows.
    win.show();
    win.focus();
    writeCrashLog("preview", "chrome-shown");
    const freshGuest=!guestView;
    guestView ||= createGuest();
    writeCrashLog("preview", "guest-created");
    win.contentView.addChildView(guestView);
    writeCrashLog("preview", "guest-attached");
    layoutGuest();
    const guestWcRef = guestView.webContents;
    if(freshGuest)setImmediate(() => {
      try {
        if (!guestWcRef || guestWcRef.isDestroyed()) return;
        attachGuestNetwork(guestWcRef);
        writeCrashLog("preview", "guest-network-attached");
      } catch (err) {
        writeCrashLog("preview", "guest-network-failed", errorFields(err));
      }
    });
  } else {
    if (previewWin.isMinimized()) previewWin.restore();
    previewWin.show();
    previewWin.focus();
  }

  applyViewport();

  const wanted =
    opts.url ||
    (lastUrl && lastUrl !== "about:blank" ? lastUrl : "") ||
    state.previewLastUrl ||
    "";
  if (wanted) {
    const parsed = normalizePreviewUrl(wanted);
    if (parsed.ok && parsed.href !== "about:blank") {
      writeCrashLog("preview", "guest-load", { url: parsed.href });
      await loadGuest(parsed.href);
      writeCrashLog("preview", "guest-loaded", { url: lastUrl || null });
    }
  } else {
    emitChrome();
  }

  writeCrashLog("preview", "open-ok", { url: lastUrl || null });
  return previewPublicState();
}

export function closePreviewWindow() {
  if (!isLive()&&!dockChrome) return false;
  persistNow();
  if(dockOwner) {
    releaseDockHost();guestWc()?.close();guestView=null;ownerWin=null;
    detachNetwork();if(netTimer)clearTimeout(netTimer);netTimer=null;
    lastUrl='about:blank';lastTitle='';lastError='';loading=false;
    networkLog=new PreviewNetworkLog();bottomHeight=0;sideWidth=0;
    emitChrome();return true;
  }
  previewWin.close();
  return true;
}

export function applyPreviewTheme(theme) {
  const t = theme === "light" ? "light" : "dark";
  try {
    chromeWc()?.send("preview:theme", t);
  } catch {
    /* ignore */
  }
  if (isLive()) {
    getPreviewWindow()?.setBackgroundColor(bootBackground(t));
  }
}

export function setPreviewViewport(id) {
  viewportId = VIEWPORTS[id] ? id : "fluid";
  applyViewport();
  persistNow();
  return previewPublicState();
}

export async function navigatePreview(rawUrl) {
  if (!isLive()) {
    throw new Error("Preview is not open");
  }
  await loadGuest(rawUrl);
  return previewPublicState();
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until the guest stops loading. No extra delay when already idle. */
export async function waitForPreviewSettled(timeoutMs = 8000) {
  if (!loading) return;
  const start = Date.now();
  while (loading && Date.now() - start < timeoutMs) {
    await waitMs(50);
  }
}

export async function snapshotPreview() {
  const wc = guestWc();
  if (!wc) throw new Error("Preview is not open");
  await waitForPreviewSettled();
  const raw = await wc.executeJavaScript(PAGE_SNAPSHOT_SCRIPT, true);
  const text = formatPreviewSnapshot(raw || {});
  return {
    text,
    url: raw?.url || lastUrl,
    title: raw?.title || lastTitle,
    chars: text.length,
  };
}

/**
 * @param {{ action?: string, ref?: string, selector?: string, name?: string, text?: string, value?: string, key?: string }} action
 */
export async function runPreviewAction(action) {
  const wc = guestWc();
  if (!wc) throw new Error("Preview is not open");
  const act = action && typeof action === "object" ? action : {};
  const result = await wc.executeJavaScript(previewActionScript(act), true);
  if (String(act.action || "") === "press") {
    const key = String(act.key || "Enter");
    const keyCode = key === "Enter" ? "Return" : key;
    try {
      wc.sendInputEvent({ type: "keyDown", keyCode });
      wc.sendInputEvent({ type: "char", keyCode: key === "Enter" ? "\u000d" : key });
      wc.sendInputEvent({ type: "keyUp", keyCode });
    } catch {
      /* guest may not accept synthetic keys */
    }
  }
  if (result && result.ok === false) {
    const err = new Error(result.error || "Preview action failed");
    err.detail = result;
    throw err;
  }
  return result || { ok: true };
}

/**
 * Capture the viewport and deliver it to the owning chat window.
 * The agent cannot do this itself — the human presses Send screenshot.
 */
export async function sendPreviewCaptureToChat() {
  const owner = ownerWindow();
  if (!owner?.webContents || owner.webContents.isDestroyed()) {
    throw new Error("Open a project chat first, then send the screenshot.");
  }
  if (ownerHasProject && !ownerHasProject(owner)) {
    throw new Error("Open a project chat first, then send the screenshot.");
  }
  const shot = await screenshotPreview();
  const payload = {
    data: shot.data,
    mimeType: shot.mimeType,
    width: shot.width,
    height: shot.height,
    bytes: shot.bytes,
    tokens: shot.tokens,
    url: lastUrl,
    title: lastTitle,
    text: formatPreviewCapturePrompt({ url: lastUrl, title: lastTitle }),
  };
  if(captureSender)await captureSender(payload);else owner.webContents.send("preview:viewport-capture", payload);
  return {
    sent: true,
    width: shot.width,
    height: shot.height,
    bytes: shot.bytes,
    tokens: shot.tokens,
  };
}

export async function screenshotPreview() {
  const wc = guestWc();
  if (!wc) throw new Error("Preview is not open");
  const image = await wc.capturePage();
  const size = image.getSize();
  const maxW = 1280;
  const resized =
    size.width > maxW
      ? image.resize({ width: maxW, quality: "good" })
      : image;
  const jpeg = resized.toJPEG(62);
  const out = resized.getSize();
  return {
    mimeType: "image/jpeg",
    data: jpeg.toString("base64"),
    bytes: jpeg.length,
    width: out.width,
    height: out.height,
    tokens: estimateImageTokens(out.width, out.height),
  };
}

function fromChrome(event) {
  const wc = event?.sender;
  return Boolean(isLive() && wc && wc === chromeWc());
}

function releaseDockHost() {
  if(dockOwner&&!dockOwner.isDestroyed()) {
    if(guestView)dockOwner.contentView.removeChildView(guestView);
    if(dockChrome)dockOwner.contentView.removeChildView(dockChrome);
  }
  dockChrome?.webContents.close();dockChrome=null;dockOwner=null;dockBounds=null;dockVisible=false;
}

async function openDockedPreview(owner,url) {
  // Serialize the complete host creation, including the first asynchronous yield.
  // Waiting only for chrome.loadFile allowed two opens to replace each other's views.
  const operation=(dockOpening||Promise.resolve()).catch(()=>{}).then(()=>openDockedPreviewInner(owner,url));
  dockOpening=operation;
  try{return await operation;}finally{if(dockOpening===operation)dockOpening=null;}
}

async function openDockedPreviewInner(owner,url) {
  if(dockOwner!==owner || !dockChrome) {
    writeCrashLog('preview','dock-host',{visible:owner.isVisible(),minimized:owner.isMinimized()});
    if(owner.isMinimized())owner.restore();
    if(!owner.isVisible())owner.show();
    await new Promise(resolve=>setImmediate(resolve));
    persistNow();releaseDockHost();
    if(getPreviewWindow()) {
      const old=previewWin;previewWin=null;
      if(guestView)old.contentView.removeChildView(guestView);
      old.destroy();
    }
    const [hostWidth,hostHeight]=owner.getContentSize();
    dockOwner=owner;dockBounds={x:Math.max(0,hostWidth-560),y:60,width:Math.min(560,hostWidth),height:Math.max(1,hostHeight-60)};dockVisible=false;
    writeCrashLog('preview','dock-chrome-create');
    dockChrome=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preview','preview-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    writeCrashLog('preview','dock-chrome-created');
    dockChrome.setBounds(dockBounds);dockChrome.setVisible(false);owner.contentView.addChildView(dockChrome);
    writeCrashLog('preview','dock-chrome-attached');
    const freshGuest=!guestView;guestView ||= createGuest();
    guestView.setVisible(false);owner.contentView.addChildView(guestView);
    layoutGuest();
    writeCrashLog('preview','dock-guest-attached');
    owner.once('closed',()=>{if(dockOwner===owner)closePreviewWindow();});
    const chrome=dockChrome;
    writeCrashLog('preview','dock-chrome-loading');
    await chrome.webContents.loadFile(path.join(__dirname,'preview','index.html'),{query:{theme:themeFromState(),docked:'1'}});
    chrome.webContents.setZoomFactor(owner.webContents.getZoomFactor());
    writeCrashLog('preview','dock-chrome-loaded');
    if(freshGuest) {
      await guestView.webContents.loadURL('about:blank');
      writeCrashLog('preview','dock-network-attach');
      attachGuestNetwork(guestView.webContents);
      writeCrashLog('preview','dock-network-attached');
    }
  }
  claimPreviewOwner(owner);emitChrome({reveal:true});
  const wanted=url || (lastUrl!=='about:blank'?lastUrl:'') || readState?.()?.previewLastUrl;
  if(wanted&&wanted!==lastUrl)await loadGuest(wanted);
  writeCrashLog('preview','dock-viewport');
  applyViewport();writeCrashLog('preview','dock-ready');return previewPublicState();
}

export function layoutDockedPreview(owner,rect,visible=true) {
  if(owner!==dockOwner||!dockChrome)return false;
  const zoom=owner.webContents.getZoomFactor();
  const [maxW,maxH]=owner.getContentSize();
  if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite))return false;
  const x=Math.max(0,Math.round(rect.x*zoom)),y=Math.max(0,Math.round(rect.y*zoom));
  dockBounds={x,y,width:Math.max(1,Math.min(maxW-x,Math.round(rect.width*zoom))),height:Math.max(1,Math.min(maxH-y,Math.round(rect.height*zoom)))};
  dockVisible=Boolean(visible&&rect.width>1&&rect.height>1);
  if(dockChrome.webContents.getURL())dockChrome.webContents.setZoomFactor(zoom);
  layoutGuest();return true;
}

function debounce(fn, ms) {
  let t = null;
  return () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn();
    }, ms);
  };
}

/**
 * @param {object} hooks
 * @param {() => Record<string, unknown>} hooks.loadState
 * @param {(patch: Record<string, unknown>) => void} hooks.savePatch
 * @param {() => import('electron').BrowserWindow | null} hooks.getOwner
 * @param {(state: Record<string, unknown>) => void} hooks.broadcast
 * @param {(win: import('electron').BrowserWindow) => boolean} [hooks.ownerHasProject]
 */
export function registerPreviewIpc(hooks) {
  const ipcMain=hooks.ipc||nativePreviewIpc;
  captureSender=hooks.sendCapture||null;
  if (ipcReady) return;
  ipcReady = true;
  readState = hooks.loadState;
  persist = (patch) => hooks.savePatch(patch);
  broadcast = hooks.broadcast;
  ownerHasProject =
    typeof hooks.ownerHasProject === "function" ? hooks.ownerHasProject : null;

  ipcMain.handle('preview:dock-layout',(e,rect,visible)=>layoutDockedPreview(hooks.getOwner(e),rect,visible));
  ipcMain.handle('preview:dock-hide',e=>{const owner=hooks.getOwner(e);if(owner===dockOwner){dockVisible=false;dockChrome?.setVisible(false);guestView?.setVisible(false);}return true;});
  ipcMain.handle('preview:chrome-zoom',(e,value)=>{if(!fromChrome(e))return 1;return guestWc()?.desktopZoom?.apply(value)||1;});
  ipcMain.on('preview:step-zoom',(e,direction)=>{const wc=guestWc();if(wc&&(e.sender===wc||fromChrome(e))&&['in','out','reset'].includes(direction))wc.desktopZoom?.apply(direction==='reset'?1:stepZoom(wc.getZoomFactor(),direction));});
  ipcMain.on('preview:focus-address',e=>{if(e.sender!==guestWc())return;chromeWc()?.focus();void chromeWc()?.executeJavaScript("document.getElementById('url').focus();document.getElementById('url').select();");});

  ipcMain.handle("preview:open", async (e, opts = {}) => {
    const owner =
      hooks.getOwner(e) ||
      BrowserWindow.fromWebContents(e.sender) ||
      null;
    try {return await openPreviewWindow({owner,url:typeof opts?.url==='string'?opts.url:''});}
    catch(error){if(lastError&&isLive())return previewPublicState();throw error;}
  });

  ipcMain.handle("preview:close", async () => closePreviewWindow());

  ipcMain.handle("preview:state", async () => previewPublicState());

  ipcMain.handle("preview:navigate", async (_e, url) => navigatePreview(url));

  ipcMain.handle("preview:snapshot", async () => snapshotPreview());

  ipcMain.handle("preview:set-viewport", async (_e, id) => {
    viewportId = VIEWPORTS[id] ? id : "fluid";
    applyViewport();
    persistNow();
    return previewPublicState();
  });

  ipcMain.handle("preview:chrome-ready", async (e, payload) => {
    if (!fromChrome(e)) return previewPublicState();
    const height =
      typeof payload === "number" ? payload : Number(payload?.height);
    const side =
      typeof payload === "object" && payload
        ? Number(payload.side)
        : 0;
    if (Number.isFinite(height) && height > 24) toolbarHeight = height;
    sideWidth = Number.isFinite(side) && side > 0 ? side : 0;
    const bottom =
      typeof payload === "object" && payload ? Number(payload.bottom) : 0;
    bottomHeight = Number.isFinite(bottom) && bottom > 0 ? bottom : 0;
    layoutGuest();
    emitChrome();
    emitNetwork();
    return previewPublicState();
  });

  ipcMain.handle("preview:chrome-navigate", async (e, url) => {
    if (!fromChrome(e)) throw new Error("Preview chrome only");
    return navigatePreview(url);
  });

  ipcMain.handle("preview:chrome-back", async (e) => {
    if (!fromChrome(e)) return previewPublicState();
    const wc = guestWc();
    if (wc?.navigationHistory?.canGoBack?.()) wc.navigationHistory.goBack();
    else if (wc?.canGoBack?.()) wc.goBack();
    return previewPublicState();
  });

  ipcMain.handle("preview:chrome-forward", async (e) => {
    if (!fromChrome(e)) return previewPublicState();
    const wc = guestWc();
    if (wc?.navigationHistory?.canGoForward?.()) wc.navigationHistory.goForward();
    else if (wc?.canGoForward?.()) wc.goForward();
    return previewPublicState();
  });

  ipcMain.handle("preview:chrome-reload", async (e) => {
    if (!fromChrome(e)) return previewPublicState();
    guestWc()?.reload();
    return previewPublicState();
  });

  ipcMain.handle("preview:chrome-viewport", async (e, id) => {
    if (!fromChrome(e)) return previewPublicState();
    viewportId = VIEWPORTS[id] ? id : "fluid";
    applyViewport();
    persistNow();
    return previewPublicState();
  });

  ipcMain.handle("preview:chrome-snapshot", async (e) => {
    if (!fromChrome(e)) throw new Error("Preview chrome only");
    return snapshotPreview();
  });

  ipcMain.handle("preview:chrome-screenshot", async (e) => {
    if (!fromChrome(e)) throw new Error("Preview chrome only");
    return sendPreviewCaptureToChat();
  });

  ipcMain.handle("preview:chrome-open-external", async (e) => {
    if (!fromChrome(e)) return false;
    const href = lastUrl;
    const parsed = normalizePreviewUrl(href);
    if (!parsed.ok || parsed.href === "about:blank") return false;
    await shell.openExternal(parsed.href);
    return true;
  });

  ipcMain.handle("preview:chrome-network", async (e) => {
    if (!fromChrome(e)) return { rows: [], error: "Preview chrome only" };
    return { ...networkLog.snapshot(), error: networkHint || "" };
  });

  ipcMain.handle("preview:chrome-network-entry", async (e, id) => {
    if (!fromChrome(e)) return null;
    return networkLog.detail(String(id || ""));
  });

  ipcMain.handle("preview:chrome-network-clear", async (e) => {
    if (!fromChrome(e)) return { rows: [], error: "Preview chrome only" };
    networkLog.clear();
    const payload = { ...networkLog.snapshot(), error: networkHint || "" };
    emitNetwork();
    return payload;
  });

  ipcMain.handle("preview:chrome-network-preserve", async (e, on) => {
    if (!fromChrome(e)) return false;
    networkLog.setPreserveLog(Boolean(on));
    return networkLog.preserveLog;
  });
}

export function isPreviewChromeContents(wc){return wc===chromeWc();}
