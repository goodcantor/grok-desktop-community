const { contextBridge, ipcRenderer, webUtils } = require("electron");
let activeScope=null;
const scopedChannel=channel=>/^(agent:|execution:|preview:|fs:|git:|files:|pty:|shell:open-editor|shell:show-item)/.test(channel);
const invoke=(channel,...args)=>ipcRenderer.invoke(channel,...args,...(activeScope&&scopedChannel(channel)?[{__executionScope:activeScope}]:[]));
const selectResult=result=>{if(result?.scope)activeScope=result.scope;return result;};
let lastZoomWheel=0;
window.addEventListener('wheel',event=>{
  if(!(event.ctrlKey||event.metaKey)||!event.deltaY)return;
  event.preventDefault();const now=Date.now();if(now-lastZoomWheel<80)return;lastZoomWheel=now;
  ipcRenderer.send('app:step-zoom',event.deltaY<0?'in':'out');
},{passive:false,capture:true});
window.addEventListener('keydown',event=>{
  if(!(event.ctrlKey||event.metaKey)||event.altKey||!['+','=','-','0'].includes(event.key))return;
  event.preventDefault();ipcRenderer.send('app:step-zoom',event.key==='0'?'reset':event.key==='-'?'out':'in');
},{capture:true});

contextBridge.exposeInMainWorld("grokDesktop", {
  /** First React paint — main may now show the shell and drop the native splash. */
  executionConnect:()=>invoke('execution:connect'),
  executionList:()=>invoke('execution:list'),
  executionQueue:()=>invoke('execution:queue-state'),
  executionSubmit:(item,mode)=>invoke('execution:submit',{item,mode}),
  executionQueueAction:args=>invoke('execution:queue-action',args),
  windowReady: () => ipcRenderer.send("window:ready"),
  setDefaultReasoning: (effort) => invoke('app:set-reasoning-default',effort),
  recoverProject: (cwd,sessionId) => invoke('project:recover',cwd,sessionId).then(selectResult),
  diagnostics: () => invoke('app:diagnostics'),
  getRunState: () => invoke('agent:run-state'),
  getZoom: () => invoke('app:get-zoom'),
  setZoom: value => invoke('app:set-zoom',value),
  readDraft: (key) => invoke('draft:read',key),
  saveDraft: (key,value) => invoke('draft:write',key,value),
  deleteDraft: (key,revision) => invoke('draft:delete',key,revision),
  droppedPaths: (files) => files.map(file=>webUtils.getPathForFile(file)).filter(Boolean),
  describeAttachments: (paths) => invoke('attachments:describe',paths),
  archiveHistory: (args) => invoke('history:archive',args),
  exportHistory: (args) => invoke('history:export',args),
  historyCatalog: () => invoke('history:catalog'),
  searchHistory: (args) => invoke('history:search',args),
  historyWindow: (args) => invoke('history:window',args),
  pinHistory: (args) => invoke('history:pin',args),
  collapseHistory: (args) => invoke('history:collapse',args),
  onHistoryProgress: (callback) => {const listener=(_e,data)=>callback(data);ipcRenderer.on('history:progress',listener);return()=>ipcRenderer.removeListener('history:progress',listener);},
  notificationPreferences: (patch) => invoke('app:notification-preferences',patch),
  getInfo: () => invoke("app:get-info"),
  pickProject: () => invoke("project:pick"),
  pickAttachments: (kind) => invoke("attachments:pick", kind),
  openProject: (cwd, opts) => invoke("project:open", cwd, opts || {}).then(selectResult),
  listOpenCheckouts: () => invoke("project:list-open"),
  focusProjectWindow: (windowId) =>
    invoke("project:focus-window", windowId),
  takePendingOpen: () => invoke("project:take-pending-open"),
  openProjectInNewWindow: (cwd) =>
    invoke("window:open-project-in-new", cwd),
  usageQuery: (args) => invoke('usage:query',args),
  usageBilling: () => invoke('usage:billing'),
  queueRead: (key) => invoke('queue:read',key),
  queueSave: (key,items) => invoke('queue:save',{key,items}),
  fileRoots: () => invoke('files:roots'),
  pickFileRoot: () => invoke('files:pick-root'),
  gitSnapshot: (args) => invoke('git:snapshot',args),
  gitAction: (args) => invoke('git:action',args),
  ptyShells: () => invoke('pty:shells'),
  ptyCreate: (args) => invoke('pty:create',args),
  ptyList: () => invoke('pty:list'),
  ptyCommand: (args) => invoke('pty:command',args),
  inspectCheckout: (cwd) => invoke("git:inspect-checkout", cwd),
  createWorktree: (opts) => invoke("worktree:create", opts || {}),
  /** Drop agent on this window; title returns to empty shell. */
  closeProject: () => invoke("project:close"),
  /** Respawn grok agent on this window and resume the same chat. */
  restartAgent: () => invoke("agent:restart").then(selectResult),
  listSessions: (cwd) => invoke("sessions:list", cwd),
  renameSession: (opts) => invoke("sessions:rename", opts || {}),
  deleteSession: (opts) => invoke("sessions:delete", opts || {}),
  openSession: (opts) => invoke("sessions:open", opts || {}).then(selectResult),
  prompt: (text, opts) =>
    invoke("agent:prompt", {
      text,
      images: opts?.images || [],
      imageQuality: opts?.imageQuality || "compact",
    }),
  interject: (text, opts) =>
    invoke("agent:interject", {
      text,
      images: opts?.images || [],
      imageQuality: opts?.imageQuality || "compact",
      interjectionId: opts?.interjectionId,
    }),
  cancel: () => invoke("agent:cancel"),
  compact: (hint) => invoke("agent:compact", hint || ""),
  respondPermission: (reqId, outcome) =>
    invoke("agent:permission-respond", { reqId, outcome }),
  setAllowWritesThisSession: (value) =>
    invoke("agent:set-allow-writes-session", value),
  listPendingPermissions: () =>
    invoke("agent:list-pending-permissions"),
  listPendingGates: () => invoke("agent:list-pending-gates"),
  respondPlanApproval: (reqId, decision) =>
    invoke("agent:plan-approval-respond", { reqId, decision }),
  respondUserQuestion: (reqId, decision) =>
    invoke("agent:user-question-respond", { reqId, decision }),
  respondFolderTrust: (reqId, decision) =>
    invoke("agent:folder-trust-respond", { reqId, decision }),
  respondMcpElicit: (reqId, decision) =>
    invoke("agent:mcp-elicit-respond", { reqId, decision }),
  setAlwaysApprove: (value) =>
    invoke("agent:set-always-approve", value),
  setPermissionMode: (value) =>
    invoke("agent:set-permission-mode", value),
  setReasoningEffort: (value) =>
    invoke("agent:set-reasoning-effort", value),
  setModel: (modelId) => invoke("agent:set-model", modelId),
  getRuntimeState: () => invoke("agent:get-runtime-state"),
  setContextWindow: (size) => invoke("agent:set-context-window", size),
  setSessionMode: (modeId) =>
    invoke("agent:set-session-mode", modeId),
  setAllowOutsideProject: (value) =>
    invoke("agent:set-allow-outside-project", value),
  setSandboxTerminal: (value) =>
    invoke("agent:set-sandbox-terminal", value),
  setTheme: (value) => invoke("app:set-theme", value),
  setPrivacyMode: (value) => invoke("app:set-privacy-mode", value),
  setAutoCompactAt: (value) =>
    invoke("app:set-auto-compact-at", value),
  getCodingDataStatus: () => invoke("app:get-coding-data"),
  setCodingDataOptIn: (value) =>
    invoke("app:set-coding-data-opt-in", value),
  setAllowPrerelease: (value) =>
    invoke("app:set-allow-prerelease", value),
  setDebugLogging: (value) => invoke("app:set-debug-logging", value),
  openDebugLog: () => invoke("app:open-debug-log"),
  openCrashLog: () => invoke("app:open-crash-log"),
  getGitBranch: (cwd) => invoke("git:branch", cwd),
  getGitStatus: (cwd) => invoke("git:status", cwd),
  getGitDiff: (path, opts) => invoke("git:diff", path, opts || {}),
  readFile: (path) => invoke("fs:read-file", path),
  writeFile: (path, content) =>
    invoke("fs:write-file", path, content),
  listDir: (path) => invoke("fs:list-dir", path),
  openPath: (path) => invoke("shell:open-editor", path),
  openInEditor: (path) => invoke("shell:open-editor", path),
  listEditors: () => invoke("editor:list"),
  setExternalEditor: (id) => invoke("app:set-external-editor", id),
  showItem: (path) => invoke("shell:show-item", path),
  openExternal: (url) => invoke("shell:open-external", url),
  openPreview: (url) =>
    invoke("preview:open", url ? { url } : {}),
  closePreview: () => invoke("preview:close"),
  previewState: () => invoke("preview:state"),
  layoutBrowser: (rect,visible) => invoke('preview:dock-layout',rect,visible),
  hideBrowser: () => invoke('preview:dock-hide'),
  previewSnapshot: () => invoke("preview:snapshot"),

  getAuthStatus: () => invoke("auth:status"),
  login: (opts) => invoke("auth:login", opts || {}),
  cancelLogin: () => invoke("auth:cancel-login"),
  submitLoginInput: (text) =>
    invoke("auth:submit-login-input", text),
  logout: () => invoke("auth:logout"),
  setApiKey: (key) => invoke("auth:set-api-key", key),
  openInstallDocs: () => invoke("auth:open-install-docs"),
  inspectBackbone: (cwd) => invoke("backbone:inspect", cwd),
  getGrokEngine: () => invoke("grok:engine"),
  checkGrokUpdate: () => invoke("grok:update-check"),
  installGrokUpdate: () => invoke("grok:update-install"),
  listMcpServers: (opts) => invoke("mcp:list", opts || {}),
  addMcpServer: (spec) => invoke("mcp:add", spec || {}),
  enableMcpServer: (name) => invoke("mcp:enable", name),
  disableMcpServer: (name) => invoke("mcp:disable", name),
  removeMcpServer: (name, opts) =>
    invoke("mcp:remove", { name, scope: opts?.scope }),
  doctorMcp: (name) => invoke("mcp:doctor", name),
  authenticateMcpServer: (name) => invoke("mcp:auth", name),
  logoutMcpServer: (name) => invoke("mcp:logout", name),
  setSettingsOpen: (open) => invoke("settings:set-open", Boolean(open)),
  listPlugins: () => invoke("plugin:list"),
  enablePlugin: (name) => invoke("plugin:enable", name),
  disablePlugin: (name) => invoke("plugin:disable", name),
  installPlugin: (source) => invoke("plugin:install", source),
  writeClipboard: (payload) => invoke("clipboard:write", payload || {}),

  on: (channel, handler) => {
    const valid = [
      "execution:event", "execution:catalog", "execution:queue", "execution:delivered", "app:select-execution", "pty:event", "usage:progress",
      "agent:session-update",
      "agent:session-interjection",
      "agent:mcp-status",
      "agent:permission-request",
      "agent:permission-dismiss",
      "agent:plan-approval-request",
      "agent:plan-approval-dismiss",
      "agent:user-question-request",
      "agent:user-question-dismiss",
      "agent:folder-trust-request",
      "agent:folder-trust-dismiss",
      "agent:mcp-elicit-request",
      "agent:mcp-elicit-dismiss",
      "agent:permission-mode",
      "agent:permissions-cleared",
      "agent:writes-session",
      "agent:stderr",
      "agent:error",
      "agent:exit",
      "agent:ready",
      "app:open-settings",
      "app:zoom",
      "app:close-settings",
      "app:open-checkouts",
      "app:new-worktree",
      "auth:login-progress",
      "preview:changed",
      "preview:viewport-capture",
    ];
    if (!valid.includes(channel)) return () => {};
    const listener = (_event, payload) => {const scope=payload?._executionScope;if(scope&&activeScope&&(scope.recordId!==activeScope.recordId||scope.generation!==activeScope.generation))return;handler(payload);};
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
