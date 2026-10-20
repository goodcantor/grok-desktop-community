import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  shouldAutoCompact,
  type AutoCompactAt,
} from "../../shared/auto-compact.mjs";
import type { ConnState } from "../lib/conn";

/** Serializes manual/automatic compaction and suppresses repeated unsupported/failed attempts. */
export function useConversationCompaction({
  project,
  sessionId,
  sessionIdRef,
  openingRef,
  conn,
  lastContextTokens,
  autoCompactAt,
  appendSystem,
  setError,
}: {
  project: string | null;
  sessionId: string | null;
  sessionIdRef: MutableRefObject<string | null>;
  openingRef: MutableRefObject<boolean>;
  conn: ConnState;
  lastContextTokens: number;
  autoCompactAt: AutoCompactAt;
  appendSystem: (message: string) => void;
  setError: (error: string | null) => void;
}) {
  const autoCompactFiredRef = useRef({ sessionId: "", tokens: 0 });
  const autoCompactInFlightRef = useRef(false);
  const autoCompactFailedAtRef = useRef({ sessionId: "", tokens: 0 });
  const autoCompactUnsupportedRef = useRef(false);
  const compactingRef = useRef(false);
  const operation = useRef(0);
  const activeSession = useRef(sessionId);
  const [compacting, setCompacting] = useState(false);

  const runCompress = useCallback(
    async (hint?: unknown) => {
      if (!project || openingRef.current) return false;
      if (conn !== "online") {
        appendSystem("Compress is available when the agent is idle.");
        return false;
      }
      if (compactingRef.current) return false;
      if (typeof window.grokDesktop.compact !== "function") {
        appendSystem(
          "Restart this Grok Desktop window to enable Compress (Electron preload does not hot-reload).",
        );
        return false;
      }
      const note = typeof hint === "string" ? hint.trim() : "";
      compactingRef.current = true;
      setCompacting(true);
      const compactSession = sessionIdRef.current;
      const token = ++operation.current;
      const current = () =>
        token === operation.current && compactSession === sessionIdRef.current;
      try {
        const result = (await window.grokDesktop.compact(note)) as {
          ok?: boolean;
          message?: string;
          tokens_before?: number;
          tokensBefore?: number;
          tokens_after?: number;
          tokensAfter?: number;
        } | null;
        if (!current()) return false;
        if (result && result.ok === false) {
          throw new Error(result.message || "Compress failed");
        }
        const before = Number(result?.tokens_before ?? result?.tokensBefore);
        const after = Number(result?.tokens_after ?? result?.tokensAfter);
        // Empty CompactConversationResponse is success; counts come from
        // session_notification, not the RPC body.
        if (Number.isFinite(before) && Number.isFinite(after) && before > 0) {
          appendSystem(
            `Conversation compacted: ${before.toLocaleString()} → ${after.toLocaleString()} tokens.`,
          );
        }
        const mark = Math.max(
          lastContextTokens,
          Number.isFinite(after) && after > 0 ? after : 0,
        );
        autoCompactFiredRef.current = {
          sessionId: sessionIdRef.current || "",
          tokens: mark,
        };
        return true;
      } catch (e: unknown) {
        if (!current()) return false;
        const msg = e instanceof Error ? e.message : String(e);
        if (
          /does not support Compress|not available on this Grok CLI|-32601|method not found/i.test(
            msg,
          )
        ) {
          autoCompactUnsupportedRef.current = true;
        }
        setError(msg || "Compress failed");
        appendSystem(`Compress failed: ${msg}`);
        return false;
      } finally {
        if (current()) {
          compactingRef.current = false;
          setCompacting(false);
        }
      }
    },
    [project, conn, lastContextTokens, appendSystem, setError],
  );

  useEffect(() => {
    if (activeSession.current === sessionId) return;
    activeSession.current = sessionId;
    operation.current++;
    compactingRef.current = false;
    setCompacting(false);
    autoCompactFiredRef.current = { sessionId: sessionId || "", tokens: 0 };
    autoCompactFailedAtRef.current = { sessionId: sessionId || "", tokens: 0 };
    autoCompactInFlightRef.current = false;
    autoCompactUnsupportedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    autoCompactUnsupportedRef.current = false;
    autoCompactFailedAtRef.current = { sessionId: "", tokens: 0 };
  }, [autoCompactAt]);

  useEffect(() => {
    if (!project || !sessionId) return;
    if (conn !== "online") return;
    if (openingRef.current) return;
    if (autoCompactInFlightRef.current) return;
    if (autoCompactUnsupportedRef.current) return;
    const ctx = lastContextTokens;
    const fired = autoCompactFiredRef.current;
    const already = fired.sessionId === sessionId ? fired.tokens : 0;
    if (
      !shouldAutoCompact({
        at: autoCompactAt,
        lastContextTokens: ctx,
        alreadyFiredAt: already,
      })
    ) {
      return;
    }
    const failed = autoCompactFailedAtRef.current;
    if (failed.sessionId === sessionId && failed.tokens === ctx) {
      return;
    }
    appendSystem(
      `Auto-compress: context is ${ctx.toLocaleString()} tokens (threshold ${autoCompactAt}).`,
    );
    autoCompactInFlightRef.current = true;
    const result = runCompress();
    const token = operation.current;
    void result.then((ok) => {
      if (token !== operation.current || sessionId !== sessionIdRef.current)
        return;
      autoCompactInFlightRef.current = false;
      if (ok) {
        autoCompactFailedAtRef.current = { sessionId: "", tokens: 0 };
      } else if (!autoCompactUnsupportedRef.current) {
        autoCompactFailedAtRef.current = { sessionId, tokens: ctx };
      }
    });
  }, [
    project,
    sessionId,
    conn,
    lastContextTokens,
    autoCompactAt,
    runCompress,
    appendSystem,
  ]);

  return { compacting, compactingRef, runCompress };
}
