import type {
  PermissionOutcome,
  PromptImage,
  PermissionRequest,
  AuthStatus,
  GrokEngineInfo,
  GrokUpdateCheck,
  GrokUpdateInstall,
  McpAddSpec,
  McpListResult,
  McpWriteResult,
  McpAuthResult,
  McpDoctorResult,
  PluginListResult,
  PluginWriteResult,
  BackboneSummary,
  GitStatusEntry,
  SessionSummary,
  AvailableModel,
  AgentRunState,
  ComposerRuntime,
  OpenCheckoutRow,
  CheckoutInspect,
  CheckoutConflict,
  OpenProjectResult,
  AppInfo,
  EditorListResult,
  FileReadResult,
  DraftState,
  HistorySession,
  HistoryHit,
  HistoryProgress,
  HistoryPage,
} from "./desktop";

/** Public contextBridge contract; implementations belong to electron/preload.cjs. */
export type DesktopBridge = {
  notificationPreferences: (patch?: {
    enabled?: boolean;
    sound?: boolean;
  }) => Promise<{ enabled: boolean; sound: boolean; supported: boolean }>;
  usageQuery: (args: {
    cwd?: string;
    sessionId?: string;
    period?: string;
    request?: boolean;
  }) => Promise<import("./workspace").UsageResult>;
  usageBilling: () => Promise<import("./workspace").BillingResult>;
  queueRead: (
    key: string,
  ) => Promise<import("./prompt").QueuedPrompt[]>;
  queueSave: (
    key: string,
    items: import("./prompt").QueuedPrompt[],
  ) => Promise<boolean>;
  fileRoots: () => Promise<{ roots: { path: string; label: string }[] }>;
  pickFileRoot: () => Promise<string | null>;
  gitSnapshot: (args?: {
    mode?: string;
    base?: string;
  }) => Promise<import("./workspace").GitSnapshot>;
  gitAction: (args: {
    action: string;
    paths?: string[];
    message?: string;
    branch?: string;
    mode?: string;
    hash?: string;
    file?: number;
    hunk?: number;
  }) => Promise<string>;
  ptyShells: () => Promise<{ id: string; name: string; path: string }[]>;
  ptyCreate: (args?: {
    shell?: string;
  }) => Promise<import("./workspace").PtyTab>;
  ptyList: () => Promise<import("./workspace").PtyTab[]>;
  ptyCommand: (args: {
    action: string;
    id: string;
    data?: string;
    cols?: number;
    rows?: number;
  }) => Promise<boolean>;

  /** First painted frame — main shows the shell and closes the native splash. */
  windowReady: () => void;
  setDefaultReasoning: (effort: string) => Promise<string>;
  recoverProject: (
    cwd: string,
    sessionId?: string,
  ) => Promise<OpenProjectResult>;
  diagnostics: () => Promise<Record<string, unknown>>;
  executionConnect?: () => Promise<import("./session").ComposerRuntime>;
  executionList?: () => Promise<import('./execution').ExecutionSummary[]>;
  executionQueue?: () => Promise<import('./execution').ExecutionQueueState>;
  executionSubmit?: (item: import('./prompt').QueuedPrompt, mode: string) => Promise<import('./execution').ExecutionQueueState>;
  executionQueueAction?: (args: {action:string;id?:string;text?:string;direction?:number;paused?:boolean}) => Promise<import('./execution').ExecutionQueueState>;
  getRunState: () => Promise<AgentRunState>;
  getZoom: () => Promise<number>;
  setZoom: (factor: number) => Promise<number>;
  readDraft: (key: string) => Promise<DraftState | null>;
  saveDraft: (key: string, value: DraftState) => Promise<{ saved: boolean }>;
  deleteDraft: (key: string, revision: number) => Promise<void>;
  droppedPaths: (files: File[]) => string[];
  describeAttachments: (paths: string[]) => Promise<DraftState["files"]>;
  archiveHistory: (args: {
    cwd: string;
    sessionId: string;
    archived: boolean;
  }) => Promise<unknown>;
  exportHistory: (args: {
    cwd: string;
    sessionId: string;
  }) => Promise<{ canceled: boolean; filePath?: string }>;
  historyCatalog: () => Promise<{
    archived?: string[];
    sessions: HistorySession[];
    pinned: string[];
    collapsed: string[];
  }>;
  searchHistory: (args: {
    query: string;
    offset?: number;
    cwd?: string;
    sessionId?: string;
  }) => Promise<{
    items: HistoryHit[];
    total: number;
    progress: HistoryProgress;
  }>;
  historyWindow: (args: {
    cwd: string;
    sessionId: string;
    ordinal?: number;
    start?: number;
    count?: number;
  }) => Promise<HistoryPage>;
  pinHistory: (args: {
    cwd: string;
    sessionId: string;
    pinned: boolean;
  }) => Promise<{ pinned: string[]; collapsed: string[] }>;
  collapseHistory: (args: {
    cwd: string;
    collapsed: boolean;
  }) => Promise<{ pinned: string[]; collapsed: string[] }>;
  onHistoryProgress: (callback: (p: HistoryProgress) => void) => () => void;
  getInfo: () => Promise<AppInfo>;
  pickProject: () => Promise<string | null>;
  openProject: (
    cwd: string,
    opts?: {
      mode?: "continue" | "new" | "resume";
      sessionId?: string;
      allowSameCheckout?: boolean;
    },
  ) => Promise<OpenProjectResult | CheckoutConflict>;
  listOpenCheckouts: () => Promise<OpenCheckoutRow[]>;
  focusProjectWindow: (windowId: number) => Promise<boolean>;
  takePendingOpen: () => Promise<{
    cwd: string;
    allowSameCheckout?: boolean;
  } | null>;
  openProjectInNewWindow: (cwd: string) => Promise<{ ok: boolean }>;
  inspectCheckout: (cwd?: string) => Promise<CheckoutInspect>;
  createWorktree: (opts?: { cwd?: string; label?: string }) => Promise<{
    path: string;
    sessionId?: string;
    sourceGitRoot?: string | null;
  }>;
  /** Drop agent on this window; native title returns to empty shell. */
  closeProject: () => Promise<boolean>;
  /** Respawn grok agent and resume the same chat. */
  restartAgent: () => Promise<OpenProjectResult>;
  listSessions: (cwd: string) => Promise<SessionSummary[]>;
  renameSession: (opts: {
    cwd: string;
    sessionId: string;
    title: string;
  }) => Promise<{
    ok: boolean;
    title?: string;
    sessions?: SessionSummary[];
    error?: string;
  }>;
  deleteSession: (opts: { cwd: string; sessionId: string }) => Promise<{
    ok: boolean;
    sessions?: SessionSummary[];
    error?: string;
  }>;
  openSession: (opts: {
    cwd: string;
    sessionId?: string;
    mode?: "new" | "resume";
  }) => Promise<OpenProjectResult>;
  prompt: (
    text: string,
    opts?: {
      images?: PromptImage[];
      imageQuality?: "compact" | "high";
    },
  ) => Promise<{ stopReason?: string }>;
  interject: (
    text: string,
    opts?: {
      images?: PromptImage[];
      imageQuality?: "compact" | "high";
      interjectionId?: string;
    },
  ) => Promise<{
    ok?: boolean;
    reason?: string;
    status?: string;
    interjectionId?: string;
  }>;
  cancel: () => Promise<boolean>;
  compact: (hint?: string) => Promise<unknown>;
  respondPermission: (
    reqId: string,
    outcome: PermissionOutcome,
  ) => Promise<boolean>;
  setAllowWritesThisSession: (
    value: boolean,
  ) => Promise<{ allowWritesThisSession: boolean }>;
  /** Open Approvals still held in main (after HMR / reload) */
  listPendingPermissions: () => Promise<PermissionRequest[]>;
  /** Parked plan/ask/trust/elicit gates (main is source of truth). */
  listPendingGates: () => Promise<{
    folderTrust: Array<{
      reqId: string;
      params?: {
        cwd?: string;
        workspace?: string;
        configKinds?: string[];
      };
    }>;
    planApprovals: Array<{
      reqId: string;
      params?: { planContent?: string; planFilePath?: string | null };
    }>;
    userQuestions: Array<{
      reqId: string;
      params?: { questions?: unknown[] };
    }>;
    mcpElicits: Array<{
      reqId: string;
      params?: {
        serverName?: string;
        message?: string;
        mode?: "form" | "url";
        url?: string;
        elicitationId?: string;
        requestedSchema?: unknown;
      };
    }>;
  }>;
  respondPlanApproval: (
    reqId: string,
    decision: {
      type: "approved" | "request_changes" | "abandoned";
      feedback?: string;
    },
  ) => Promise<boolean>;
  respondUserQuestion: (
    reqId: string,
    decision:
      | { type: "answered"; answers: Record<string, string | string[]> }
      | { type: "declined" },
  ) => Promise<boolean>;
  respondFolderTrust: (
    reqId: string,
    decision: { outcome: "trust" | "reject" },
  ) => Promise<boolean>;
  respondMcpElicit: (
    reqId: string,
    decision:
      | { outcome: "accept"; content?: Record<string, unknown> }
      | { outcome: "decline" }
      | { outcome: "cancel" },
  ) => Promise<boolean>;
  setAlwaysApprove: (value: boolean) => Promise<boolean>;
  setPermissionMode: (value: "ask" | "auto" | "always-approve") => Promise<{
    mode: "ask" | "auto" | "always-approve";
    agentSynced: boolean;
    error?: string;
  }>;
  setReasoningEffort: (value: "low" | "medium" | "high" | "xhigh") => Promise<{
    effort: "low" | "medium" | "high" | "xhigh";
    agentSynced: boolean;
    error?: string;
  }>;
  setModel: (modelId: string) => Promise<{
    reasoningEffort?: "low" | "medium" | "high" | "xhigh";
    modelId: string | null;
    modelName: string | null;
    availableModels: AvailableModel[];
    agentSynced: boolean;
    error?: string;
  }>;
  getRuntimeState: () => Promise<ComposerRuntime>;
  pickAttachments: (
    kind: "file" | "folder",
  ) => Promise<Array<{ path: string; name: string; kind: "file" | "folder" }>>;
  setContextWindow: (size: number) => Promise<ComposerRuntime>;
  setSessionMode: (modeId: string) => Promise<{
    modeId: string | null;
    agentSynced: boolean;
    error?: string;
  }>;
  setAllowOutsideProject: (value: boolean) => Promise<boolean>;
  setSandboxTerminal: (value: boolean) => Promise<boolean>;
  setTheme: (value: "dark" | "light") => Promise<"dark" | "light">;
  setPrivacyMode: (value: boolean) => Promise<boolean>;
  setAutoCompactAt: (
    value: "off" | "64k" | "128k" | "192k",
  ) => Promise<"off" | "64k" | "128k" | "192k">;
  getCodingDataStatus: () => Promise<{
    optedIn: boolean | null;
    source: "auth" | "default" | "none";
    managed: boolean;
    note?: string;
  }>;
  setCodingDataOptIn: (value: boolean) => Promise<{
    optedIn: boolean | null;
    source: "auth" | "default" | "none";
    managed: boolean;
    note?: string;
  }>;
  setAllowPrerelease: (value: boolean) => Promise<boolean>;
  setDebugLogging: (
    value: boolean,
  ) => Promise<{ debugLogging: boolean; debugLogPath: string }>;
  openDebugLog: () => Promise<string>;
  openCrashLog: () => Promise<string>;
  getGitBranch: (
    cwd?: string,
  ) => Promise<{ branch: string | null; detached: boolean }>;
  getGitStatus: (
    cwd?: string,
  ) => Promise<{ files: GitStatusEntry[]; git?: boolean }>;
  getGitDiff: (
    path: string,
    opts?: { staged?: boolean },
  ) => Promise<{ path: string; staged: boolean; diff: string | null }>;
  readFile: (path: string) => Promise<FileReadResult>;
  writeFile: (path: string, content: string) => Promise<{ ok: true }>;
  listDir: (
    path: string,
  ) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;
  openPath: (
    path: string,
  ) => Promise<{ ok: boolean; editor?: string; label?: string }>;
  openInEditor: (
    path: string,
  ) => Promise<{ ok: boolean; editor?: string; label?: string }>;
  listEditors: () => Promise<EditorListResult>;
  setExternalEditor: (id: string) => Promise<EditorListResult>;
  showItem: (path: string) => Promise<void>;
  openExternal: (url: string) => Promise<boolean>;
  openPreview: (url?: string) => Promise<{
    open: boolean;
    url: string;
    title: string;
    viewport: string;
    loading: boolean;
  }>;
  closePreview: () => Promise<boolean>;
  previewState: () => Promise<{
    ownerWindowId?: number;
    presentation?: string;
    visible?: boolean;
    open: boolean;
    url: string;
    title: string;
    viewport: string;
    loading: boolean;
  }>;
  previewSnapshot: () => Promise<{
    text: string;
    url: string;
    title: string;
    chars: number;
  }>;
  layoutBrowser: (
    rect: { x: number; y: number; width: number; height: number },
    visible: boolean,
  ) => Promise<boolean>;
  hideBrowser: () => Promise<boolean>;
  getAuthStatus: () => Promise<AuthStatus>;
  login: (opts?: { deviceAuth?: boolean }) => Promise<{
    ok: boolean;
    status?: AuthStatus;
    error?: string;
    output?: string;
  }>;
  cancelLogin: () => Promise<AuthStatus>;
  submitLoginInput: (text: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<{
    ok: boolean;
    status?: AuthStatus;
    message?: string;
  }>;
  setApiKey: (key: string) => Promise<{ ok: boolean; status: AuthStatus }>;
  openInstallDocs: () => Promise<boolean>;
  inspectBackbone: (cwd?: string) => Promise<BackboneSummary>;
  getGrokEngine: () => Promise<GrokEngineInfo>;
  checkGrokUpdate: () => Promise<GrokUpdateCheck>;
  installGrokUpdate: () => Promise<GrokUpdateInstall>;
  listMcpServers: (opts?: { cache?: boolean }) => Promise<McpListResult>;
  addMcpServer: (spec: McpAddSpec) => Promise<McpWriteResult>;
  enableMcpServer: (name: string) => Promise<McpWriteResult>;
  disableMcpServer: (name: string) => Promise<McpWriteResult>;
  removeMcpServer: (
    name: string,
    opts?: { scope?: "user" | "project" },
  ) => Promise<McpWriteResult>;
  doctorMcp: (name?: string) => Promise<McpDoctorResult>;
  authenticateMcpServer: (name: string) => Promise<McpAuthResult>;
  logoutMcpServer: (
    name: string,
  ) => Promise<{ ok: boolean; removed?: number; error?: string | null }>;
  setSettingsOpen: (open: boolean) => Promise<boolean>;
  listPlugins: () => Promise<PluginListResult>;
  enablePlugin: (name: string) => Promise<PluginWriteResult>;
  disablePlugin: (name: string) => Promise<PluginWriteResult>;
  installPlugin: (source: string) => Promise<PluginWriteResult>;
  writeClipboard: (payload: {
    text: string;
    html?: string;
  }) => Promise<boolean>;
  on: (channel: string, handler: (payload: any) => void) => () => void;
};
