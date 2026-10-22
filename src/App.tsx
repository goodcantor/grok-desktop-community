import { usePendingGates } from "./hooks/usePendingGates";
import type { AskUserRequest } from "./components/AskUserDialog";
import { ActivityView } from "./components/ActivityView";
import { localFileReference } from "../shared/conversation-view.mjs";
import { InteractionDock } from "./components/InteractionDock";
import { useAuthentication } from "./hooks/useAuthentication";
import { useHistoryReader } from "./hooks/useHistoryReader";
import { useAppPreferences } from "./hooks/useAppPreferences";
import { useSessionModel } from "./hooks/useSessionModel";
import { useConversationCompaction } from "./hooks/useConversationCompaction";
import { TerminalDock } from "./components/TerminalDock";
import { UsageHost } from "./components/UsageView";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "./components/BrandMark";
import { ChatActivity } from "./components/ChatActivity";
import { PromptQueue } from "./components/PromptQueue";
import { MessageList } from "./components/MessageList";
import { SidePanel } from "./components/SidePanel";
import { SettingsDialog } from "./components/SettingsDialog";
import { StatusBar } from "./components/StatusBar";
import { PlanApprovalDialog } from "./components/PlanApprovalDialog";
import { AskUserDialog } from "./components/AskUserDialog";
import { FolderTrustDialog } from "./components/FolderTrustDialog";
import { McpElicitDialog } from "./components/McpElicitDialog";
import {
  WorktreeDialog,
  type WorktreeDialogState,
} from "./components/WorktreeDialog";
import { ApprovalsDock } from "./components/ApprovalsDock";
import { HistorySidebar } from "./components/HistorySidebar";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutsDialog } from "./components/ShortcutsDialog";
import { ChatTopbar } from "./components/ChatTopbar";
import { ColumnResizeHandle } from "./components/ColumnResizeHandle";
import { WelcomeView } from "./components/WelcomeView";
import { Composer } from "./components/Composer";
import type { DraftMode } from "./components/ComposerSettings";
import { useComposerRuntime } from "./hooks/useComposerRuntime";
import { useColumnLayout } from "./hooks/useColumnLayout";
import {
  DESKTOP_COMMANDS,
  mergeCommands,
  skillsToCommands,
  type SlashCommand,
} from "./lib/commands";
import {
  nextAlwaysApproveMode,
  runDesktopCommand,
} from "./lib/desktop-commands";
import { enterPlanMode } from "./lib/enter-plan-mode";
import type { ConnState } from "./lib/conn";
import { PrivacyProvider } from "./lib/privacy-context";
import { redactSensitiveText } from "./lib/privacy";
import { hideBootSplash } from "./lib/boot-splash";
import { finalizeOpenTools, uid } from "./lib/timeline";
import { useAgentEvents } from "./hooks/useAgentEvents";
import { useAgentSafety } from "./hooks/useAgentSafety";
import { useProjectSession } from "./hooks/useProjectSession";
import { usePromptDelivery } from "./hooks/usePromptDelivery";
import { useStickToBottom } from "./hooks/useStickToBottom";
import { useUnsavedGuard } from "./hooks/useUnsavedGuard";
import type {
  AppInfo,
  BackboneSummary,
  OpenCheckoutRow,
  SessionSummary,
  TimelineItem,
} from "./types/desktop";

export default function App() {
  const [conversationView,setConversationView]=useState<"chat"|"activity">("chat");
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false),
    [connectionSlow, setConnectionSlow] = useState(false);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [backbone, setBackbone] = useState<BackboneSummary | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [conn, setConn] = useState<ConnState>("idle");
  const {
    runtime: composerRuntime,
    refresh: refreshComposerRuntime,
    setRuntime: setComposerRuntime,
  } = useComposerRuntime(sessionId, conn);
  const composerModeLock = useRef(false);
  const [openingLabel, setOpeningLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [gitDetached, setGitDetached] = useState(false);
  const { setFilesDirty, confirmDiscardFiles } = useUnsavedGuard();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<
    "mcp" | "plugins" | "skills" | null
  >(null);
  const [offerAgentRestart, setOfferAgentRestart] = useState(false);
  const [agentCommands, setAgentCommands] = useState<SlashCommand[]>([]);
  const [openCheckouts, setOpenCheckouts] = useState<OpenCheckoutRow[]>([]);
  const [worktreeDialog, setWorktreeDialog] =
    useState<WorktreeDialogState | null>(null);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const busyRef = useRef(false);
  const openingRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;

  const appendSystem = useCallback((text: string) => {
    setItems((prev) => [
      ...prev,
      { id: uid("sys"), kind: "system", text, at: Date.now() },
    ]);
  }, []);

  const {
    theme,
    hideThinking,
    privacyMode,
    codingDataOptIn,
    codingDataNote,
    debugLogging,
    debugLogPath,
    crashLogPath,
    allowPrerelease,
    autoCompactAt,
    hydratePreferences,
    applyHideThinking,
    setAppTheme,
    applyPrivacyMode,
    applyCodingDataOptIn,
    applyDebugLogging,
    applyAllowPrerelease,
    applyAutoCompactAt,
  } = useAppPreferences({
    setError,
    appendSystem,
    offerRestart: () => setOfferAgentRestart(true),
  });

  const { historyPage, historyBusy, clearHistory, openHistory, pageHistory } =
    useHistoryReader({
      project,
      sessionId,
      conn,
      timelineRef,
      setError,
      confirmDiscardFiles,
      canNavigate: () =>
        !openingRef.current && !compactingRef.current,
      openProject: (cwd, options) => openProject(cwd, options),
    });

  const clearOfferAgentRestart = useCallback(() => {
    setOfferAgentRestart(false);
    clearHistory();
  }, [clearHistory]);

  const {
    permissionMode,
    reasoningEffort,
    setReasoningEffort,
    allowOutsideProject,
    sandboxTerminal,
    sandboxStatus,
    hydrateFromInfo,
    applyPermissionMode,
    applyReasoningEffort,
    toggleAllowOutside,
    applySandboxTerminal,
  } = useAgentSafety({ setError, appendSystem });

  const {
    modelId,
    modelName,
    availableModels,
    setModelId,
    setModelName,
    setAvailableModels,
    applyModel,
  } = useSessionModel({
    sessionId,
    sessionIdRef,
    setError,
    setReasoningEffort,
  });

  const {
    auth,
    setAuth,
    authBusy,
    authMessage,
    loginProgress,
    loginDeviceAuth,
    refreshAuth,
    handleLogin,
    handleCancelLogin,
    handleSubmitLoginCode,
    handleLogout,
    handleSetApiKey,
  } = useAuthentication({
    setError,
    confirmDiscardFiles,
    setBackbone,
    leaveProject: () => leaveProject(),
    refreshBackbone: (cwd) => refreshBackbone(cwd),
    onAuthenticated: () => bootstrap(),
  });

  const currentProjectRef = useRef(project);
  currentProjectRef.current = project;
  const refreshBackbone = useCallback(async (cwd?: string) => {
    const summary = await window.grokDesktop.inspectBackbone(cwd);
    if (!cwd || !currentProjectRef.current || cwd === currentProjectRef.current)
      setBackbone(summary);
    return summary;
  }, []);

  const bootstrap = useCallback(async () => {
    try {
      const i = await window.grokDesktop.getInfo();
      setInfo(i);
      hydrateFromInfo(i);
      hydratePreferences(i);
      setAuth(i.auth);
      if (i.auth.authenticated && !i.auth.expired) {
        void refreshBackbone(i.lastProject || undefined);
      }
    } catch {
      /* WelcomeView still renders; native splash waits for first paint, not this. */
    }
  }, [refreshBackbone, hydrateFromInfo, hydratePreferences]);

  useEffect(() => {
    hideBootSplash();
    void bootstrap();
  }, [bootstrap]);

  const timelineScrollKey = useMemo(() => {
    const last = items[items.length - 1];
    if (!last) return "empty";
    const tail =
      last.kind === "assistant" ||
      last.kind === "thought" ||
      last.kind === "user"
        ? String((last as { text?: string }).text?.length ?? 0)
        : last.kind === "tool"
          ? `${last.status}:${String((last as { content?: unknown }).content ? 1 : 0)}`
          : last.kind;
    return `${items.length}:${last.id}:${last.kind}:${tail}`;
  }, [items]);

  const { pinToBottom, atLatest } = useStickToBottom(
    timelineRef,
    historyPage ? "historical-window" : timelineScrollKey,
    `${project ?? ""}:${sessionId ?? ""}:${historyPage?.start ?? "live"}`,
    conn === "connecting",
  );

  const {
    promptQueue,
    queuePaused,
    changeQueuePaused,
    turnOutcome,
    promptQueueRef,
    sendNowRef,
    clearPromptQueue,
    removeQueued,
    editQueued,
    moveQueued,
    failedDelivery,
    clearFailedDelivery,
    submitFromComposer,
    sendQueuedNow,
  } = usePromptDelivery({
    sessionId,
    project,
    conn,
    busyRef,
    openingRef,
    pinToBottom,
    setConn,
    setError,
    setItems,
    refreshAuth: () => {
      void refreshAuth();
    },
  });

  const {
    permissions,
    backgroundTasks,
    sessionUsage,
    sessionMode,
    setSessionMode,
    planApproval,
    userQuestion,
    folderTrust,
    mcpElicit,
    clearSessionScoped,
    revokeWritesThisSession,
    hydrateBackgroundTasks,
    hydrateSessionUsage,
    syncAgentGatesFromMain,
    onPermission,
    onAllowAllPermissions,
    onAllowWritesThisSession,
    onPlanApproval,
    onUserQuestion,
    onFolderTrust,
    onMcpElicit,
  } = useAgentEvents({
    openingRef,
    sessionIdRef,
    setConn,
    setError,
    setSessionId,
    setItems,
    setAgentCommands,
    setSettingsOpen,
    deliverPlanComments: (text) => {
      void submitFromComposer({ text, images: [], mode: "auto" });
    },
  });

  const signedIn = Boolean(auth?.authenticated && !auth?.expired);

  const leaveProject = useCallback(async () => {
    try {
      await window.grokDesktop.closeProject();
    } catch {
      /* ignore — still clear local UI */
    }
    setProject(null);
    setSessionId(null);
    setSessions([]);
    setModelId(null);
    setModelName(null);
    setAvailableModels([]);
    setItems([]);
    setConn("idle");
    setError(null);
    setOfferAgentRestart(false);
  }, []);

  const onMissingBinary = useCallback(async () => {
    await leaveProject();
    await refreshAuth();
  }, [leaveProject, refreshAuth]);

  const {
    openProject,
    openSession,
    restartAgent,
    recoverConnection,
    isAuthError,
  } = useProjectSession({
    defaultWorkspace: info?.defaultWorkspace,
    currentSessionId: sessionId,
    auth,
    project,
    busyRef,
    openingRef,
    promptQueueRef,
    sendNowRef,
    clearSessionScoped,
    revokeWritesThisSession,
    hydrateBackgroundTasks,
    hydrateSessionUsage,
    hydrateSessionMode: setSessionMode,
    syncAgentGatesFromMain,
    hydrateFromInfo,
    refreshAuth,
    refreshBackbone,
    setBackbone,
    onOpenApplied: clearOfferAgentRestart,
    setAuth,
    setInfo,
    setProject,
    setSessionId,
    setSessions,
    setModelId,
    setModelName,
    setAvailableModels,
    setConn,
    setOpeningLabel,
    setError,
    setItems,
    setAgentCommands,
    clearPromptQueue,
    onMissingBinary,
    onCheckoutConflict: (conflict, cwd) => {
      setWorktreeError(null);
      setWorktreeDialog({ kind: "conflict", conflict, pendingCwd: cwd });
    },
  });

  const deleteSession = useCallback(
    async (opts: { sessionId: string }) => {
      if (!project) return;
      const wasCurrent = opts.sessionId === sessionId;
      if (wasCurrent && conn === "busy") {
        throw new Error("Stop the current turn before deleting this chat.");
      }
      try {
        const res = await window.grokDesktop.deleteSession({
          cwd: project,
          sessionId: opts.sessionId,
        });
        const nextList =
          res?.sessions || (await window.grokDesktop.listSessions(project));
        setSessions(nextList);
        setError(null);
        if (wasCurrent) {
          const next =
            nextList.find((s) => s.id !== opts.sessionId) || nextList[0];
          if (next) await openSession({ mode: "resume", sessionId: next.id });
          else await openSession({ mode: "new" });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        throw e instanceof Error ? e : new Error(msg);
      }
    },
    [project, sessionId, conn, openSession],
  );

  const closeWorktreeDialog = useCallback(() => {
    setWorktreeDialog(null);
    setWorktreeError(null);
    setWorktreeBusy(false);
  }, []);

  const openPathAfterWorktree = useCallback(
    async (cwd: string, newWindow: boolean) => {
      if (newWindow) {
        await window.grokDesktop.openProjectInNewWindow(cwd);
        closeWorktreeDialog();
        return;
      }
      closeWorktreeDialog();
      await openProject(cwd, { allowSameCheckout: true });
    },
    [closeWorktreeDialog, openProject],
  );

  const handleCreateWorktree = useCallback(
    async (opts: { cwd: string; newWindow: boolean }) => {
      setWorktreeBusy(true);
      setWorktreeError(null);
      try {
        const added = await window.grokDesktop.createWorktree({
          cwd: opts.cwd,
        });
        await openPathAfterWorktree(added.path, opts.newWindow);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (worktreeDialog) setWorktreeError(msg);
        else setError(msg);
      } finally {
        setWorktreeBusy(false);
      }
    },
    [openPathAfterWorktree, worktreeDialog],
  );

  const createWorktreeInNewWindow = useCallback(
    async (sourceCwd: string) => {
      await handleCreateWorktree({ cwd: sourceCwd, newWindow: true });
    },
    [handleCreateWorktree],
  );

  const pendingOpenTried = useRef(false);
  useEffect(() => {
    if (!signedIn) {
      pendingOpenTried.current = false;
      return;
    }
    if (!info?.defaultWorkspace || pendingOpenTried.current) return;
    pendingOpenTried.current = true;
    void window.grokDesktop
      .takePendingOpen()
      .then((pending) => {
        void openProject(pending?.cwd || info.defaultWorkspace, {
          allowSameCheckout: pending?.cwd ? pending.allowSameCheckout : true,
        });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, [signedIn, info?.defaultWorkspace, openProject]);

  const pickProject = async () => {
    if (!signedIn || conn === "connecting") {
      if (!signedIn) setError("Sign in to Grok first.");
      return;
    }
    const cwd = await window.grokDesktop.pickProject();
    if (cwd && (cwd === project || confirmDiscardFiles()))
      await openProject(cwd);
  };

  const isOpening = conn === "connecting";

  useEffect(() => {
    void window.grokDesktop.setSettingsOpen(settingsOpen);
  }, [settingsOpen]);

  useEffect(() => {
    return window.grokDesktop.on("app:close-settings", () => {
      setSettingsOpen(false);
      setSettingsSection(null);
    });
  }, []);

  useEffect(() => {
    void window.grokDesktop.listOpenCheckouts().then(setOpenCheckouts);
    return window.grokDesktop.on("app:open-checkouts", (payload) => {
      setOpenCheckouts(Array.isArray(payload) ? payload : []);
    });
  }, []);

  useEffect(() => {
    return window.grokDesktop.on("app:new-worktree", () => {
      if (!project) {
        setError("Open a git project first, then create a worktree.");
        return;
      }
      void createWorktreeInNewWindow(project);
    });
  }, [project, createWorktreeInNewWindow]);

  const allCommands = useMemo(
    () =>
      mergeCommands({
        desktop: DESKTOP_COMMANDS,
        skills: skillsToCommands(backbone?.skills || []),
        agent: agentCommands,
      }),
    [backbone?.skills, agentCommands],
  );

  const { compacting, compactingRef, runCompress } = useConversationCompaction({
    project,
    sessionId,
    sessionIdRef,
    openingRef,
    conn,
    lastContextTokens: sessionUsage.lastContextTokens,
    autoCompactAt,
    appendSystem,
    setError,
  });

  const handleLocalCommand = useCallback(
    async (name: string, args = "") => {
      await runDesktopCommand(
        name,
        {
          newChat: () => void openSession({ mode: "new" }),
          chat: async () => {
            try {
              const result = await window.grokDesktop.setSessionMode("default");
              if (!result.agentSynced) {
                setError(result.error || "Could not leave plan mode");
                return;
              }
              setSessionMode(result.modeId || "default");
              setError(null);
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : String(e));
            }
          },
          model: async (value) => {
            const query = value.trim().toLowerCase();
            const model = availableModels.find(
              (m) =>
                m.modelId.toLowerCase() === query ||
                m.name?.toLowerCase() === query,
            );
            if (!model) {
              setError(
                `Choose a model in the top bar. Available: ${availableModels.map((m) => m.modelId).join(", ")}`,
              );
              return;
            }
            await applyModel(model.modelId);
          },
          effort: async (value) => {
            const effort = value.trim().toLowerCase();
            if (!["low", "medium", "high", "xhigh"].includes(effort)) {
              setError("Usage: /effort low | medium | high | xhigh");
              return;
            }
            await applyReasoningEffort(
              effort as "low" | "medium" | "high" | "xhigh",
            );
          },
          toggleAlwaysApprove: () =>
            applyPermissionMode(nextAlwaysApproveMode(permissionMode)),
          compact: (hint) => {
            void runCompress(hint);
          },
          enterPlanMode: (description) =>
            enterPlanMode({
              description,
              sessionMode,
              setSessionMode,
              setError,
              appendSystem,
              setItems,
              submitFromComposer,
            }),
          preview: async (previewArgs) => {
            const a = String(previewArgs || "").trim();
            try {
              if (a.toLowerCase() === "close") {
                await window.grokDesktop.closePreview();
                appendSystem("Preview window closed.");
                return;
              }
              if (a.toLowerCase() === "snapshot") {
                const snap = await window.grokDesktop.previewSnapshot();
                const tokens = Math.ceil((snap.chars || snap.text.length) / 4);
                appendSystem(
                  `Preview snapshot (~${tokens} tokens):\n${snap.text}`,
                );
                return;
              }
              await window.grokDesktop.openPreview(a);
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : String(e);
              setError(msg || "Preview failed");
            }
          },
        },
        args,
      );
    },
    [
      openSession,
      availableModels,
      applyModel,
      applyReasoningEffort,
      applyPermissionMode,
      permissionMode,
      appendSystem,
      setError,
      runCompress,
      sessionMode,
      setSessionMode,
      submitFromComposer,
      setItems,
    ],
  );

  const changeComposerMode = async (mode: DraftMode): Promise<boolean> => {
    if (composerModeLock.current || busyRef.current || openingRef.current)
      return false;
    const expected = sessionIdRef.current;
    const active = () =>
      sessionIdRef.current === expected && !openingRef.current;
    composerModeLock.current = true;
    try {
      const live = await window.grokDesktop.getRuntimeState();
      if (!active() || live.sessionId !== expected) return false;
      if (live.goal?.status === "active" && mode !== "goal")
        await window.grokDesktop.prompt("/goal pause");
      if (!active()) return false;
      const next = mode === "plan" ? "plan" : "default";
      const result = await window.grokDesktop.setSessionMode(next);
      if (!active()) return false;
      if (!result.agentSynced)
        throw Error(result.error || "Could not change mode");
      setSessionMode(result.modeId || next);
      const state = await window.grokDesktop.getRuntimeState();
      if (mode === "plan" && state.goal?.status === "active")
        throw Error("The goal is still active. Pause it before planning.");
      if (!active() || state.sessionId !== expected) return false;
      setComposerRuntime(state);
      setError(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      composerModeLock.current = false;
    }
  };

  useEffect(() => {
    if (!project) {
      setGitBranch(null);
      setGitDetached(false);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await window.grokDesktop.getGitBranch(project);
        if (cancelled) return;
        setGitBranch(res?.branch ?? null);
        setGitDetached(Boolean(res?.detached));
      } catch {
        if (!cancelled) {
          setGitBranch(null);
          setGitDetached(false);
        }
      }
    };
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [project]);

  const homeDir = info?.home || null;
  const redact = useCallback(
    (text: string | null | undefined) =>
      redactSensitiveText(
        text == null ? "" : String(text),
        homeDir,
        privacyMode,
      ),
    [homeDir, privacyMode],
  );

  const restarting = openingLabel === "Restarting agent…";
  const platform =
    info?.platform ||
    (/Mac/i.test(navigator.userAgent || "")
      ? "darwin"
      : /Win/i.test(navigator.userAgent || "")
        ? "win32"
        : "linux");
  const platformClass =
    platform === "darwin"
      ? "platform-darwin"
      : platform === "win32"
        ? "platform-win"
        : "platform-linux";

  const onOpenSettings = useCallback(
    (section?: "mcp" | "plugins" | "skills") => {
      setSettingsSection(section || null);
      setSettingsOpen(true);
    },
    [],
  );
  const onComposerError = useCallback((message: string) => {
    setError(message);
  }, []);

  const columns = useColumnLayout();
  const historySidebar = (
    <HistorySidebar
      generalPath={info?.defaultWorkspace}
      project={project}
      sessionId={sessionId}
      auth={auth}
      disabled={isOpening || historyBusy || compacting}
      inert={
        shortcutsOpen ||
        paletteOpen ||
        settingsOpen
      }
      collapsed={columns.sidebarCollapsed}
      onToggle={columns.toggleSidebar}
      recentProjects={info?.recentProjects || []}
      onOpen={openHistory}
      onNew={() => {
        clearHistory();
        if (project) void openSession({ mode: "new" });
        else if (info?.defaultWorkspace)
          void openProject(info.defaultWorkspace, {
            mode: "new",
            allowSameCheckout: true,
          });
      }}
      onHome={() => {
        if (!info?.defaultWorkspace) return;
        if (project !== info.defaultWorkspace && !confirmDiscardFiles()) return;
        clearHistory();
        if (project === info.defaultWorkspace) {
          pinToBottom();
          return;
        }
        void openProject(info.defaultWorkspace, { allowSameCheckout: true });
      }}
      onPick={() => void pickProject()}
      onSettings={() => onOpenSettings()}
      onLogout={() => void handleLogout()}
      onRename={async (row, title) => {
        await window.grokDesktop.renameSession({
          cwd: row.cwd,
          sessionId: row.id,
          title,
        });
      }}
      onDelete={async (row) => {
        clearHistory();
        if (row.cwd === project) await deleteSession({ sessionId: row.id });
        else
          await window.grokDesktop.deleteSession({
            cwd: row.cwd,
            sessionId: row.id,
          });
      }}
    />
  );

  const overlayOpen = false;

  const settingsDialog = (
    <SettingsDialog
      open={settingsOpen}
      onClose={() => {
        setSettingsOpen(false);
        setSettingsSection(null);
      }}
      inert={false}
      hideThinking={hideThinking}
      onHideThinking={applyHideThinking}
      theme={theme}
      privacyMode={privacyMode}
      codingDataOptIn={codingDataOptIn}
      codingDataNote={codingDataNote}
      permissionMode={permissionMode}
      allowOutsideProject={allowOutsideProject}
      sandboxTerminal={sandboxTerminal}
      sandboxStatus={sandboxStatus}
      debugLogging={debugLogging}
      debugLogPath={debugLogPath}
      crashLogPath={crashLogPath}
      allowPrerelease={allowPrerelease}
      autoCompactAt={autoCompactAt}
      onSetTheme={(t) => void setAppTheme(t)}
      onSetPrivacyMode={(next) => void applyPrivacyMode(next)}
      onSetCodingDataOptIn={(next) => void applyCodingDataOptIn(next)}
      onSetPermissionMode={(m) => void applyPermissionMode(m)}
      onToggleAllowOutside={() => void toggleAllowOutside()}
      onSetSandboxTerminal={(next) => void applySandboxTerminal(next)}
      onSetDebugLogging={(next) => void applyDebugLogging(next)}
      onSetAllowPrerelease={(next) => void applyAllowPrerelease(next)}
      onSetAutoCompactAt={(next) => void applyAutoCompactAt(next)}
      onOpenDebugLog={() => void window.grokDesktop.openDebugLog()}
      onOpenCrashLog={() => void window.grokDesktop.openCrashLog()}
      onRestartAgent={() => {
        setSettingsOpen(false);
        setSettingsSection(null);
        void restartAgent();
      }}
      onRestartAfterWrite={async () => {
        if (project) await restartAgent();
        await refreshBackbone(project || undefined);
      }}
      restarting={isOpening}
      offerRestart={offerAgentRestart}
      grokBinary={info?.grokBinary || auth?.binary || ""}
      hasProject={Boolean(project)}
      skills={backbone?.skills || []}
      skillsError={backbone && !backbone.ok ? backbone.error : null}
      skillsLoading={signedIn && backbone == null}
      focusSection={settingsSection}
    />
  );

  const worktreeOverlay = (
    <WorktreeDialog
      state={worktreeDialog}
      busy={worktreeBusy}
      error={worktreeError}
      onCancel={closeWorktreeDialog}
      onFocusWindow={(windowId) => {
        void window.grokDesktop.focusProjectWindow(windowId).then((ok) => {
          if (ok) closeWorktreeDialog();
          else setWorktreeError("Could not find that window.");
        });
      }}
      onOpenAnyway={(cwd) => {
        void openPathAfterWorktree(cwd, false);
      }}
      onOpenPath={(cwd, newWindow) => {
        void openPathAfterWorktree(cwd, newWindow);
      }}
      onCreate={(opts) => {
        void handleCreateWorktree(opts);
      }}
    />
  );

  const openPanel = (tab: "files" | "changes" | "browser") => {
    columns.showPanel(tab === "browser" ? 560 : undefined);
    document.dispatchEvent(new CustomEvent("grok:panel-tab", { detail: tab }));
  };
  useEffect(
    () =>
      window.grokDesktop.on("preview:changed", (state) => {
        if (
          state.reveal &&
          state.presentation === "docked" &&
          state.ownerWindowId === info?.windowId
        )
          openPanel("browser");
      }),
    [info?.windowId, columns.panelCollapsed, confirmDiscardFiles],
  );
  useEffect(()=>window.grokDesktop.on('app:select-execution',({cwd,sessionId:target})=>{void openProject(cwd,{mode:'resume',sessionId:target,allowSameCheckout:true});}),[openProject]);
  useEffect(()=>{
    const open=async(event:Event)=>{const expected=sessionIdRef.current;const path=localFileReference((event as CustomEvent).detail,project);if(!path)return;
      try{await window.grokDesktop.readFile(path);if(sessionIdRef.current!==expected)return;openPanel('files');requestAnimationFrame(()=>document.dispatchEvent(new CustomEvent('grok:open-validated-file',{detail:path})));}catch(error){setError(error instanceof Error?error.message:String(error));}};
    document.addEventListener('grok:open-file-reference',open);return()=>document.removeEventListener('grok:open-file-reference',open);
  },[project,columns.showPanel]);
  const newChat = () => {
    if (
      !settingsOpen &&
      !overlayOpen &&
      !isOpening &&
      !compactingRef.current
    )
      void openSession({ mode: "new" });
  };
  const paletteAction = (action: string) => {
    if (action === "shortcuts") {
      setShortcutsOpen(true);
    } else if (action === "terminal") {
      document.dispatchEvent(new CustomEvent("grok:toggle-terminal"));
    } else if (action === "compact") {
      void runCompress();
    } else if (action === "usage") {
      document.dispatchEvent(new CustomEvent("grok:open-usage"));
    } else if (action === "focus-input") {
      document.dispatchEvent(new CustomEvent("grok:focus-composer"));
    } else if (action === "new") newChat();
    else if (action === "general" && info?.defaultWorkspace)
      void openProject(info.defaultWorkspace, { allowSameCheckout: true });
    else if (action === "files" || action === "changes") openPanel(action);
    else if (action === "settings") onOpenSettings();
    else if (action === "preview") void handleLocalCommand("preview");
    else if (action.startsWith("insert:"))
      requestAnimationFrame(() =>
        document.dispatchEvent(
          new CustomEvent("grok:reuse-prompt", {
            detail: "/" + action.slice(7) + " ",
          }),
        ),
      );
  };
  useEffect(() => {
    const open = () => {
      setSettingsOpen(false);
      setShortcutsOpen(true);
    };
    document.addEventListener("grok:show-shortcuts", open);
    const key = (e: KeyboardEvent) => {
      if (
        !(e.ctrlKey || e.metaKey) ||
        settingsOpen ||
        overlayOpen ||
        shortcutsOpen ||
        paletteOpen
      )
        return;
      if (e.key === "/" || e.code === "Slash") {
        e.preventDefault();
        setPaletteOpen(false);
        setShortcutsOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "n" && !e.shiftKey) {
        e.preventDefault();
        newChat();
      }
      if (e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      document.removeEventListener("grok:show-shortcuts", open);
    };
  }, [
    settingsOpen,
    overlayOpen,
    shortcutsOpen,
    paletteOpen,
    conn,
    project,
    sessionId,
  ]);
  useEffect(() => {
    setConnectionSlow(false);
    if (conn !== "connecting") return;
    const timer = setTimeout(() => setConnectionSlow(true), 30000);
    return () => clearTimeout(timer);
  }, [conn]);
  const connectionRecovery = (connectionSlow || conn === "error") && (
    <div className="connection-recovery" role="status">
      {connectionSlow
        ? "Connecting is taking longer than expected."
        : "Grok is unavailable. Your draft is safe."}
      <button className="btn" onClick={() => void recoverConnection(false)}>
        Retry
      </button>
      <button className="btn" onClick={() => void recoverConnection(true)}>
        Restart engine
      </button>
    </div>
  );
  useEffect(()=>window.grokDesktop.on('agent:ready',()=>{const expected=sessionIdRef.current;void window.grokDesktop.getRuntimeState().then(next=>{if(next.sessionId!==expected||sessionIdRef.current!==expected)return;setComposerRuntime(next);setModelId(next.modelId);setModelName(next.modelName);setAvailableModels(next.availableModels);}).catch(()=>{});}),[]);
  const stopTurn = () => {
    changeQueuePaused(true);
    document.dispatchEvent(new CustomEvent("grok:stop-requested"));
    setItems((prev) => finalizeOpenTools(prev, "cancelled"));
    void window.grokDesktop.cancel();
  };
  const handleGoalAction = async (action: "pause" | "resume" | "clear") => {
    const expected = sessionIdRef.current;
    if (
      compactingRef.current ||
      !expected ||
      !["online", "busy"].includes(conn)
    )
      return false;
    if (action !== "resume") changeQueuePaused(true);
    let finish: (value: boolean) => void = () => {};
    let off = () => {};
    let timer: ReturnType<typeof setTimeout>;
    const confirmation = new Promise<boolean>((resolve) => {
      finish = (value) => {
        clearTimeout(timer);
        off();
        resolve(value);
      };
      off = window.grokDesktop.on("agent:session-update", (params) => {
        if (sessionIdRef.current !== expected) return finish(false);
        if (params.sessionId && params.sessionId !== expected) return;
        const u = params.update;
        if (u?.sessionUpdate !== "goal_updated") return;
        if (
          action === "clear"
            ? u.status === "cleared"
            : action === "resume"
              ? u.status === "active"
              : u.status !== "active"
        )
          finish(true);
      });
      timer = setTimeout(() => finish(false), 30000);
    });
    try {
      if (conn === "busy")
        document.dispatchEvent(new CustomEvent("grok:stop-requested"));
      const accepted = await submitFromComposer({
        text: "/goal " + action,
        images: [],
        mode: conn === "busy" ? "now" : "auto",
      });
      if (!accepted) finish(false);
      return await confirmation;
    } catch (e) {
      finish(false);
      throw e;
    }
  };
  const activityElement = (
    <ChatActivity
      key={sessionId || "pending"}
      sessionId={sessionId}
      busy={conn === "busy"}
      compacting={compacting}
      connection={conn}
      items={items}
      goal={composerRuntime?.goal || null}
      outcome={turnOutcome}
      tasks={backgroundTasks}
      queueCount={promptQueue.length}
      queue={
        <PromptQueue
          items={promptQueue}
          paused={queuePaused}
          busy={conn === "busy"}
          available={!compacting && (conn === "online" || conn === "busy")}
          onPaused={changeQueuePaused}
          onEdit={editQueued}
          onMove={moveQueued}
          onRemove={removeQueued}
          onSendNow={sendQueuedNow}
        />
      }
      permissionCount={permissions.length}
      waitingFor={
        planApproval
          ? "plan"
          : userQuestion
            ? "answer"
            : folderTrust
              ? "trust"
              : mcpElicit
                ? "connector"
                : null
      }
      onReview={() => openPanel("changes")}
      onRestart={() => void recoverConnection(true)}
      onGoalAction={handleGoalAction}
    />
  );
  const paletteElement = (
    <>
      {paletteOpen && (
        <CommandPalette
          commands={allCommands}
          onClose={() => setPaletteOpen(false)}
          onAction={paletteAction}
        />
      )}
      {shortcutsOpen && (
        <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />
      )}
    </>
  );
  const nativeGates=usePendingGates(sessionId);
  const planRequests=nativeGates?nativeGates.planApprovals.map(row=>({reqId:row.reqId,planContent:row.params?.planContent||'',planFilePath:row.params?.planFilePath})):planApproval?[planApproval]:[];
  const questionRequests=nativeGates?nativeGates.userQuestions.map(row=>({reqId:row.reqId,questions:row.params?.questions||[]} as AskUserRequest)):userQuestion?[userQuestion]:[];
  const trustRequests=nativeGates?nativeGates.folderTrust.map(row=>({reqId:row.reqId,...row.params})):folderTrust?[folderTrust]:[];
  const elicitRequests=nativeGates?nativeGates.mcpElicits.map(row=>({reqId:row.reqId,...row.params,serverName:row.params?.serverName||'',message:row.params?.message||'',mode:row.params?.mode||'form'})):mcpElicit?[mcpElicit]:[];
  const interactionRequests = [
    ...planRequests.map(request=>({id:request.reqId,label:'Plan review',content:<PlanApprovalDialog inline request={request} onRespond={(id,decision)=>void onPlanApproval(id,decision)}/>})),
    ...questionRequests.map(request=>({id:request.reqId,label:'Your answer is needed',content:<AskUserDialog inline request={request} onRespond={(id,decision)=>void onUserQuestion(id,decision)}/>})),
    ...trustRequests.map(request=>({id:request.reqId,label:'Trust this folder',content:<FolderTrustDialog inline request={request} onRespond={(id,decision)=>void onFolderTrust(id,decision)}/>})),
    ...elicitRequests.map(request=>({id:request.reqId,label:'Connector input',content:<McpElicitDialog inline request={request} onRespond={(id,decision)=>void onMcpElicit(id,decision)}/>})),
    ...permissions.map(permission=>({id:permission.reqId,label:'Approval needed',content:<ApprovalsDock permissions={[permission]} onPermission={(id,option)=>void onPermission(id,option)} onAllowAll={()=>void onAllowAllPermissions()} onAllowWritesThisSession={()=>void onAllowWritesThisSession()}/>})),
  ];
  const attentionKey=interactionRequests.map(request=>request.id).join('|');
  useEffect(()=>{if(attentionKey&&innerWidth<1200&&!columns.panelCollapsed)columns.togglePanel();},[attentionKey]);
  const composerElement = (
    <Composer
      key={`composer:${project || info?.defaultWorkspace}:${sessionId || "pending"}`}
      draftKey={`${project || info?.defaultWorkspace || "general"}\0${sessionId || "pending"}`}
      conn={conn}
      projectOpen={Boolean(project)}
      commands={allCommands}
      promptQueue={promptQueue}
      onSubmit={submitFromComposer}
      onLocalCommand={handleLocalCommand}
      onError={onComposerError}
      sessionMode={sessionMode}
      onModeChange={changeComposerMode}
      onStop={stopTurn}
      activity={<>{activityElement}<InteractionDock key={sessionId} requests={interactionRequests} bulkAction={permissions.length>1?{label:"Allow all once",run:()=>void onAllowAllPermissions()}:undefined}/></>}
      compacting={compacting}
      settings={{
        modelId,
        modelName,
        availableModels,
        reasoningEffort,
        permissionMode,
        allowOutsideProject,
        sandboxTerminal,
        runtime: composerRuntime,
        liveContextTokens: sessionUsage.lastContextTokens,
        onOpenModel:async()=>{const expected=sessionIdRef.current;const next=await window.grokDesktop.executionConnect?.();if(next&&expected===sessionIdRef.current){setComposerRuntime(next);setModelId(next.modelId);setModelName(next.modelName);setAvailableModels(next.availableModels);}},
        onModel: async (id) => {
          await applyModel(id);
          await refreshComposerRuntime();
        },
        onReasoningEffort: async (effort) => {
          await applyReasoningEffort(effort);
          await refreshComposerRuntime();
        },
        onPermissionMode: applyPermissionMode,
        onToggleAllowOutside: toggleAllowOutside,
        onSandboxTerminal: async (value) => {
          try {
            await applySandboxTerminal(value);
          } catch (e) {
            onComposerError(e instanceof Error ? e.message : String(e));
          }
        },
        onContextWindow: async (size) => {
          try {
            const next = await window.grokDesktop.setContextWindow(size);
            if (next.sessionId !== sessionIdRef.current) return;
            setComposerRuntime(next);
            setError(null);
          } catch (e) {
            onComposerError(e instanceof Error ? e.message : String(e));
          }
        },
        onCompress: () => void runCompress(),
        onOpenSettings: () => onOpenSettings(),
      }}
    />
  );
  const failedDeliveryCard = failedDelivery && (
    <div className="delivery-recovery" role="alert">
      Message failed. Your text can be restored.
      <button
        className="btn"
        onClick={() => {
          document.dispatchEvent(
            new CustomEvent("grok:reuse-prompt", {
              detail: failedDelivery.timelineText || failedDelivery.text,
            }),
          );
          clearFailedDelivery();
        }}
      >
        Restore text
      </button>
      <button className="btn" onClick={clearFailedDelivery}>
        Dismiss
      </button>
    </div>
  );
  if (!project && signedIn) {
    return (
      <PrivacyProvider privacyMode={privacyMode} home={homeDir}>
        <div
          className={`app custom-home ${platformClass}${columns.sidebarCollapsed ? " app--sidebar-collapsed" : ""}`}
          style={{
            ...columns.cssVars,
            gridTemplateColumns: "var(--sidebar-width) minmax(0,1fr)",
          }}
        >
          {historySidebar}
          <main className="home-main" inert={settingsOpen || undefined}>
            <div className="home-greeting">
              <BrandMarkHome />
              <h1>What can I help with?</h1>
              <p>
                {isOpening
                  ? "Connecting to Grok…"
                  : "Your everyday chat, files and PC help."}
              </p>
              {composerElement}
              {connectionRecovery}
              {error && <div className="error-banner">{redact(error)}</div>}
            </div>
            <div className="home-note">
              Grok Desktop Community · Your local workspace
            </div>
          </main>
        </div>
        {settingsDialog}
        {worktreeOverlay}
        {paletteElement}
      </PrivacyProvider>
    );
  }
  if (!project) {
    return (
      <PrivacyProvider privacyMode={privacyMode} home={homeDir}>
        <WelcomeView
          platformClass={platformClass}
          isOpening={isOpening}
          openingLabel={openingLabel}
          signedIn={signedIn}
          auth={auth}
          backbone={backbone}
          authBusy={authBusy}
          authMessage={authMessage}
          loginProgress={loginProgress}
          loginDeviceAuth={loginDeviceAuth}
          error={error ? redact(error) : null}
          recentProjects={info?.recentProjects || []}
          appVersion={info?.version}
          grokBinary={redact(info?.grokBinary || auth?.binary || "detecting…")}
          onRefreshAuth={() => {
            void refreshAuth().then((s) => {
              if (s.authenticated && !s.expired) void refreshBackbone();
            });
          }}
          onLogin={(device) => void handleLogin(device)}
          onCancelLogin={() => void handleCancelLogin()}
          onSubmitLoginCode={(code) => void handleSubmitLoginCode(code)}
          onLogout={() => void handleLogout()}
          onSetApiKey={(key) => void handleSetApiKey(key)}
          onPickProject={() => void pickProject()}
          onOpenProject={(cwd) => {
            if (!confirmDiscardFiles()) return;
            void openProject(cwd);
          }}
          openCheckouts={openCheckouts}
          onOpenSettingsSection={onOpenSettings}
          platform={platform}
          inert={settingsOpen}
        />
        {worktreeOverlay}
        {settingsDialog}
      </PrivacyProvider>
    );
  }

  return (
    <PrivacyProvider privacyMode={privacyMode} home={homeDir}>
      <div
        className={
          `app ${platformClass}` +
          (columns.sidebarCollapsed ? " app--sidebar-collapsed" : "") +
          (columns.panelCollapsed ? " app--panel-collapsed" : "") +
          (columns.resizing ? " app--resizing" : "")
        }
        style={columns.cssVars}
      >
        <div className="app-col app-col--sidebar">
          {historySidebar}
          <ColumnResizeHandle
            side="sidebar"
            collapsed={columns.sidebarCollapsed}
            width={columns.sidebarPx}
            min={columns.sidebarMin}
            max={columns.sidebarMax}
            onPointerDown={columns.onSidebarResizeDown}
            onPointerMove={columns.onResizePointerMove}
            onPointerUp={columns.endResizeDrag}
            onDoubleClick={columns.resetSidebar}
          />
        </div>

        <main
          className={`main ${!items.some((item) => item.kind === "user" || item.kind === "assistant") ? "main--empty" : ""}`}
          inert={settingsOpen || undefined}
        >
          <ChatTopbar
            project={project}
            chatTitle={sessions.find((row) => row.id === sessionId)?.title}
            workspaceLabel={
              project === info?.defaultWorkspace ? "General" : undefined
            }
            conn={conn}
            panelOpen={!columns.panelCollapsed}
            onOpenFiles={() => openPanel("files")}
            onOpenChanges={() => openPanel("changes")}
            onOpenPreview={() => void handleLocalCommand("preview")}
            onOpenSettings={() => onOpenSettings()}
            hideThinking={hideThinking}
            onHideThinking={applyHideThinking}
          />

          {isOpening && (
            <div className="loading-banner loading-banner-inline" role="status">
              <Spinner size={16} />
              <div>
                <strong>
                  {restarting ? "Restarting agent…" : "Starting agent…"}
                </strong>
                <span>
                  {restarting
                    ? "Reconnecting to Grok backbone"
                    : openingLabel
                      ? `Opening ${openingLabel}`
                      : "Connecting to Grok backbone"}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="error-banner">
              {redact(error)}
              {isAuthError(error) ? (
                <button
                  className="btn"
                  type="button"
                  style={{ marginLeft: 12 }}
                  onClick={() => {
                    if (!confirmDiscardFiles()) return;
                    void leaveProject();
                  }}
                >
                  Sign in again
                </button>
              ) : null}
            </div>
          )}

          <div className="conversation-toolbar">
          {(items.length > 0 || historyPage) && (
            <div className="history-navigation">
              <button
                className="btn btn-sm"
                disabled={historyBusy || historyPage?.start === 0}
                onClick={() =>
                  void pageHistory(
                    historyPage ? Math.max(0, historyPage.start - 140) : 0,
                  )
                }
              >
                {historyPage ? "Previous messages" : "Load earlier messages"}
              </button>
              {historyPage && (
                <>
                  <span>
                    Messages {historyPage.start + 1}–{historyPage.end} of{" "}
                    {historyPage.total}
                  </span>
                  <button
                    className="btn btn-sm"
                    disabled={
                      historyBusy || historyPage.end >= historyPage.total
                    }
                    onClick={() => void pageHistory(historyPage.end)}
                  >
                    Next messages
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      clearHistory();
                      requestAnimationFrame(pinToBottom);
                    }}
                  >
                    Jump to latest
                  </button>
                </>
              )}
            </div>
          )}
          <nav className="conversation-tabs" aria-label="Conversation view"><button aria-pressed={conversationView==='chat'} onClick={()=>setConversationView('chat')}>Chat</button><button aria-pressed={conversationView==='activity'} onClick={()=>setConversationView('activity')}>Activity</button></nav>
          </div>
          {conversationView==='activity'?<ActivityView items={historyPage?.items||items} loading={historyBusy} hasEarlier={historyPage?.start!==0} onEarlier={()=>void pageHistory(historyPage?Math.max(0,historyPage.start-140):0)}/>:<>
          <MessageList
            key={`messages:${sessionId || "no-session"}:${historyPage?.start ?? "live"}:${historyPage?.focusOrdinal ?? ""}`}
            items={historyPage?.items || items}
            bottomRef={bottomRef}
            scrollerRef={timelineRef}
            knownCommands={allCommands}
            planMode={sessionMode === "plan"}
            streaming={!historyPage && conn === "busy"}
            hideThinking={hideThinking}
            pendingPermissions={[]}
            onPermission={onPermission}
            onAllowAllPermissions={() => void onAllowAllPermissions()}
          />

          </>}
          {!atLatest && !historyPage && (
            <div className="jump-latest-wrap">
              <button className="btn" onClick={pinToBottom}>
                Jump to latest ↓
              </button>
            </div>
          )}
          {connectionRecovery}
          {failedDeliveryCard}
          {composerElement}

          <StatusBar
            privacyMode={privacyMode}
            onOpenSettings={onOpenSettings}
            gitBranch={gitBranch}
            gitDetached={gitDetached}
            sessionUsage={sessionUsage}
          />
          <TerminalDock
            sessionId={sessionId}
            project={project}
            inert={settingsOpen || overlayOpen || shortcutsOpen || paletteOpen}
          />
        </main>

        <div className="app-col app-col--panel">
          <ColumnResizeHandle
            side="panel"
            collapsed={columns.panelCollapsed}
            width={columns.panelPx}
            min={columns.panelMin}
            max={columns.panelMax}
            onPointerDown={columns.onPanelResizeDown}
            onPointerMove={columns.onResizePointerMove}
            onPointerUp={columns.endResizeDrag}
            onDoubleClick={columns.resetPanel}
          />
          <SidePanel
            windowId={info?.windowId}
            sessionId={sessionId}
            project={project}
            backgroundTasks={backgroundTasks}
            sessionMode={sessionMode}
            onDirtyChange={setFilesDirty}
            inert={settingsOpen}
            collapsed={columns.panelCollapsed}
            onToggleCollapsed={columns.togglePanel}
          />
        </div>
      </div>

      {worktreeOverlay}
      {settingsDialog}
      {paletteElement}
      <UsageHost
        project={project}
        sessionId={sessionId}
        busy={conn === "busy"}
      />

    </PrivacyProvider>
  );
}

function BrandMarkHome() {
  return (
    <div className="home-orbit" aria-hidden="true">
      ✦
    </div>
  );
}
