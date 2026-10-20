import {
  useCallback,useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { isAuthError, isMissingBinaryError, type ConnState } from "../lib/conn";
import { isCheckoutConflict } from "../lib/checkout";
import type { CheckoutConflict, OpenProjectResult } from "../types/desktop";
import { basen } from "../lib/path-utils";
import type {
  AppInfo,
  AuthStatus,
  AvailableModel,
  BackboneSummary,
  SessionSummary,
  TimelineItem,
} from "../types/desktop";
import type { SlashCommand } from "../lib/commands";

/**
 * Open / resume project sessions and apply agent open results.
 */
export function useProjectSession(opts: {
  auth: AuthStatus | null;
  project: string | null;
  busyRef: MutableRefObject<boolean>;
  openingRef: MutableRefObject<boolean>;
  /** Cleared on open — typed loosely so App can pass its queue refs. */
  promptQueueRef: MutableRefObject<unknown>;
  sendNowRef: MutableRefObject<unknown>;
  clearSessionScoped: () => void;
  revokeWritesThisSession: () => void | Promise<void>;
  hydrateBackgroundTasks: (tasks: import("../lib/background-tasks").BackgroundTask[]) => void;
  hydrateSessionUsage: (usage: import("../lib/usage").SessionUsage | null | undefined) => void;
  /** ACP session mode from session/new|load (plan banner on resume). */
  hydrateSessionMode?: (modeId: string | null) => void;
  /** Mirror open permission + parked gates from main (source of truth). */
  syncAgentGatesFromMain: () => void | Promise<void>;
  hydrateFromInfo: (i: AppInfo) => void;
  refreshAuth: () => Promise<AuthStatus>;
  refreshBackbone: (cwd?: string) => Promise<BackboneSummary>;
  setBackbone: Dispatch<SetStateAction<BackboneSummary | null>>;
  /** Fired after a successful open/restart hydrate (new agent process exists). */
  onOpenApplied?: () => void;
  setAuth: Dispatch<SetStateAction<AuthStatus | null>>;
  setInfo: Dispatch<SetStateAction<AppInfo | null>>;
  setProject: Dispatch<SetStateAction<string | null>>;
  setSessionId: Dispatch<SetStateAction<string | null>>;
  setSessions: Dispatch<SetStateAction<SessionSummary[]>>;
  setModelId: Dispatch<SetStateAction<string | null>>;
  setModelName: Dispatch<SetStateAction<string | null>>;
  setAvailableModels: Dispatch<SetStateAction<AvailableModel[]>>;
  setConn: Dispatch<SetStateAction<ConnState>>;
  setOpeningLabel: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setItems: Dispatch<SetStateAction<TimelineItem[]>>;
  setAgentCommands: Dispatch<SetStateAction<SlashCommand[]>>;
  clearPromptQueue: () => void;
  /** Leave the project and return to AuthGate install when grok is missing. */
  onMissingBinary?: () => void | Promise<void>;
  /** Same checkout already open in another window — prompt for a worktree. */
  defaultWorkspace?:string;currentSessionId?:string|null;
  onCheckoutConflict?: (conflict: CheckoutConflict, cwd: string) => void;
}) {
  const {
    auth,
    project,
    currentSessionId,
    busyRef,
    openingRef,
    promptQueueRef,
    sendNowRef,
    clearSessionScoped,
    revokeWritesThisSession,
    hydrateBackgroundTasks,
    hydrateSessionUsage,
    hydrateSessionMode,
    syncAgentGatesFromMain,
    hydrateFromInfo,
    refreshAuth,
    refreshBackbone,
    setBackbone,
    onOpenApplied,
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
    onCheckoutConflict,
  } = opts;

  const operation=useRef(0);
  const applyOpenResult = useCallback(
    async (
      res: OpenProjectResult & {
        warning?: string | null;
        backgroundTasks?: import("../lib/background-tasks").BackgroundTask[];
        usage?: import("../lib/usage").SessionUsage | null;
      },
      openOpts?: { note?: string;preserveQueue?:boolean },
    ) => {
      const expected=operation.current;
      // Reset the outgoing mirror before changing the key. Queue hydration for
      // the destination can finish while the permission/gate IPC below awaits.
      if(!openOpts?.preserveQueue){clearPromptQueue();promptQueueRef.current = [];sendNowRef.current = null;}
      setProject(res.cwd);
      setSessionId(res.sessionId);
      setSessions(res.sessions || []);
      setModelId(res.modelId || null);
      setModelName(res.modelName || null);
      setAvailableModels(res.availableModels || []);
      clearSessionScoped();
      setItems((res.history||[]) as TimelineItem[]);
      if(!res.scope || !res.resumed)await revokeWritesThisSession();
      // While openingRef is true, live usage is ignored — disk replace is safe.
      hydrateBackgroundTasks(res.backgroundTasks || []);
      hydrateSessionUsage(res.usage);
      hydrateSessionMode?.(res.sessionMode ?? null);
      // Await so we do not mark online with a stale empty mirror.
      await syncAgentGatesFromMain();
      if(expected!==operation.current)return;
      // Composer draft/slash menu remounts via key=sessionId — no reset needed.

      if (res.backbone) setBackbone(res.backbone);
      if(!res.backbone)void refreshBackbone(res.cwd).catch(()=>{});

      busyRef.current=Boolean(res.runState?.active);
      setConn(res.runState?.active?"busy":"online");
      setOpeningLabel(null);
      setError(res.warning || null);

      const i = await window.grokDesktop.getInfo();
      if(expected!==operation.current)return;
      setInfo(i);
      setAuth(i.auth);
      hydrateFromInfo(i);
      onOpenApplied?.();
    },
    [
      clearSessionScoped,
      revokeWritesThisSession,
      hydrateBackgroundTasks,
      hydrateSessionUsage,
      hydrateSessionMode,
      syncAgentGatesFromMain,
      hydrateFromInfo,
      promptQueueRef,
      refreshBackbone,
      setBackbone,
      onOpenApplied,
      sendNowRef,
      setAgentCommands,
      setAuth,
      setConn,
      setError,
      setInfo,
      setItems,
      setOpeningLabel,
      setProject,
      clearPromptQueue,
      setSessionId,
      setSessions,
      setModelId,
      setModelName,
      setAvailableModels,
    ],
  );

  const openProject = useCallback(
    async (
      cwd: string,
      openOpts?: {
        mode?: "continue" | "new" | "resume";
        sessionId?: string;
        allowSameCheckout?: boolean;
      },
    ) => {
      const status = auth || (await refreshAuth());
      if (!status.authenticated || status.expired) {
        setError("Sign in to Grok before opening a project.");
        return;
      }
      if (openingRef.current) {
        setError("Wait for the current turn or open to finish.");
        return;
      }

      openingRef.current = true;
      const expected=++operation.current;
      const prevConn = project ? "online" : "idle";
      setConn("connecting");
      setOpeningLabel(basen(cwd));
      setError(null);
      try {
        setAgentCommands([]);
        const res = await window.grokDesktop.openProject(cwd, {
          mode: openOpts?.mode || "continue",
          sessionId: openOpts?.sessionId,
          allowSameCheckout: openOpts?.allowSameCheckout,
        });
        if(expected!==operation.current)return;
        if (isCheckoutConflict(res)) {
          setOpeningLabel(null);
          setConn(prevConn);
          onCheckoutConflict?.(res, cwd);
          return;
        }
        clearSessionScoped();
        await applyOpenResult(res);
        return true;
      } catch (e: unknown) {
        if(expected!==operation.current)return;
        const msg = e instanceof Error ? e.message : String(e);
        setOpeningLabel(null);
        if (isMissingBinaryError(msg)) {
          setConn("idle");
          await onMissingBinary?.();
          setError(msg);
        } else {
          setConn("error");
          setError(msg);
          if (isAuthError(msg)) {
            void refreshAuth();
          }
        }
      } finally {
        if(expected===operation.current)openingRef.current = false;
      }
    },
    [
      auth,
      applyOpenResult,
      busyRef,
      clearSessionScoped,
      onCheckoutConflict,
      onMissingBinary,
      openingRef,
      project,
      refreshAuth,
      setConn,
      setError,
      setItems,
      setOpeningLabel,
    ],
  );

  const openSession = useCallback(
    async (sessionOpts: { sessionId?: string; mode?: "new" | "resume" }) => {
      if (!project) return;
      const status = auth || (await refreshAuth());
      if (!status.authenticated || status.expired) {
        setError("Sign in to Grok first.");
        return;
      }
      if (openingRef.current) return;

      openingRef.current = true;
      const expected=++operation.current;
      setConn("connecting");
      setOpeningLabel(sessionOpts.mode === "new" ? "New chat" : "Resuming…");
      // Stage input under the pending-draft key so it migrates into the new
      // session instead of staying in the previous chat's composer.
      setSessionId(null);
      setError(null);
      clearSessionScoped();
      try {
        setAgentCommands([]);
        const res = await window.grokDesktop.openSession({
          cwd: project,
          sessionId: sessionOpts.sessionId,
          mode: sessionOpts.mode || "resume",
        });
        if(expected!==operation.current)return;
      await applyOpenResult(res, {
          note:
            sessionOpts.mode === "new"
              ? "Started a new chat (CLI /new)"
              : "Resumed previous chat (CLI /resume)",
        });
      } catch (e: unknown) {
      if(expected!==operation.current)return;
        setSessionId(currentSessionId||null);
        const msg = e instanceof Error ? e.message : String(e);
        setOpeningLabel(null);
        if (isMissingBinaryError(msg)) {
          setConn("idle");
          await onMissingBinary?.();
          setError(msg);
        } else {
          setConn("error");
          setError(msg);
        }
      } finally {
        if(expected===operation.current)openingRef.current = false;
      }
    },
    [
      auth,currentSessionId,setSessionId,
      applyOpenResult,
      busyRef,
      clearSessionScoped,
      onMissingBinary,
      openingRef,
      project,
      refreshAuth,
      setConn,
      setError,
      setItems,
      setOpeningLabel,
    ],
  );

  const restartAgent = useCallback(async () => {
    if (!project) {
      setError("Open a project before restarting the agent.");
      return;
    }
    const status = auth || (await refreshAuth());
    if (!status.authenticated || status.expired) {
      setError("Sign in to Grok first.");
      return;
    }
    if (openingRef.current) return;

    openingRef.current = true;
    const expected=++operation.current;
    busyRef.current = false;
    clearPromptQueue();
    setConn("connecting");
    setOpeningLabel("Restarting agent…");
    setError(null);
    try {
      const res = await window.grokDesktop.restartAgent();
      if(expected!==operation.current)return;
      await applyOpenResult(res, {
        note: res.resumed
          ? "Restarted Grok agent (same session)"
          : "Restarted Grok agent (new session)",
      });
    } catch (e: unknown) {
      if(expected!==operation.current)return;
      const msg = e instanceof Error ? e.message : String(e);
      setOpeningLabel(null);
      if (isMissingBinaryError(msg)) {
        setConn("idle");
        await onMissingBinary?.();
        setError(msg);
      } else {
        setConn("error");
        setError(msg);
        if (isAuthError(msg)) {
          void refreshAuth();
        }
      }
    } finally {
      if(expected===operation.current)openingRef.current = false;
    }
  }, [
    auth,
    applyOpenResult,
    busyRef,
    clearPromptQueue,
    onMissingBinary,
    openingRef,
    project,
    refreshAuth,
    setConn,
    setError,
    setOpeningLabel,
  ]);

  const recoverConnection=async(_restart=false)=>{
    const cwd=project||opts.defaultWorkspace;if(!cwd)return;
    const expected=++operation.current;openingRef.current=true;busyRef.current=false;setConn('connecting');setError(null);setOpeningLabel('Reconnecting…');
    try{const result=await window.grokDesktop.recoverProject(cwd,opts.currentSessionId||undefined);if(expected!==operation.current)return;await applyOpenResult(result,{preserveQueue:true});}catch(error){if(expected===operation.current){setConn('error');setError(error instanceof Error?error.message:String(error));}}finally{if(expected===operation.current){openingRef.current=false;setOpeningLabel(null);}}
  };
  return { openProject, openSession, restartAgent,recoverConnection, isAuthError };
}

export { isAuthError };
