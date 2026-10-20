import { useEffect, useRef, useState } from "react";
import type { AgentRunState } from "../types/desktop";
import type { BackgroundTask } from "../lib/background-tasks";

/** Poll native run diagnostics only while needed; dispose timers/subscriptions with the session. */
export function useRunActivity(
  sessionId: string | null,
  busy: boolean,
  compacting: boolean,
  tasks: BackgroundTask[],
) {
  const [run, setRun] = useState<AgentRunState | null>(null),
    [now, setNow] = useState(Date.now),
    [stopPending, setStopPending] = useState(false);
  const localStart = useRef(Date.now());
  useEffect(() => {
    let live = true,
      fetching = false;
    setRun(null);
    setStopPending(false);
    localStart.current = Date.now();
    if (!busy || !sessionId) return;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const next = await window.grokDesktop.getRunState();
        if (live && next.sessionId === sessionId) setRun(next);
      } catch {
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    const stopped = () => {
      if (live) setStopPending(true);
    };
    document.addEventListener("grok:stop-requested", stopped);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("grok:stop-requested", stopped);
    };
  }, [busy, compacting, sessionId]);
  const runningCount = tasks.filter((t) => t.status === "running").length;
  useEffect(() => {
    if (!busy && !compacting && !runningCount) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy, compacting, runningCount]);
  return { run, now, stopPending, startedAt: localStart.current, runningCount };
}
