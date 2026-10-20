import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { HistorySession, HistoryHit, HistoryPage } from "../types/desktop";
import type { ConnState } from "../lib/conn";
import { highlightHistoryMatch } from "../lib/history-highlight";

type Options = {
  project: string | null;
  sessionId: string | null;
  conn: ConnState;
  timelineRef: RefObject<HTMLDivElement | null>;
  canNavigate: () => boolean;
  confirmDiscardFiles: () => boolean;
  openProject: (
    cwd: string,
    options: { mode: "resume"; sessionId: string },
  ) => Promise<boolean | undefined>;
  setError: (error: string) => void;
};

/** Historical windows are read-only views of native history, never a second transcript store. */
export function useHistoryReader({
  project,
  sessionId,
  conn,
  timelineRef,
  canNavigate,
  confirmDiscardFiles,
  openProject,
  setError,
}: Options) {
  const bookmarks = useRef(new Map<string, { start: number; query: string }>());
  const request = useRef(0);
  const [historyPage, setHistoryPage] = useState<HistoryPage | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyBusy, setHistoryBusy] = useState(false);

  const clearHistory = useCallback(() => {
    request.current++;
    setHistoryPage(null);
    setHistoryQuery("");
    setHistoryBusy(false);
  }, []);

  useEffect(() => {
    if (conn === "busy") clearHistory();
  }, [conn, clearHistory]);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  useEffect(() => {
    if (!historyPage) return;
    let cleanup: (() => void) | undefined;
    const timer = requestAnimationFrame(() => {
      if (timelineRef.current)
        cleanup = highlightHistoryMatch(
          timelineRef.current,
          historyPage.focusOrdinal,
          historyQuery,
        );
    });
    return () => {
      cancelAnimationFrame(timer);
      cleanup?.();
    };
  }, [historyPage, historyQuery, timelineRef]);

  async function openHistory(row: HistorySession | HistoryHit, query = "") {
    if (row.cwd !== project && !confirmDiscardFiles())
      throw new Error("Project has unsaved changes.");
    if (!canNavigate())
      throw new Error("Wait for the current operation before switching chats.");
    if (project && sessionId) {
      const key = `${project}\0${sessionId}`;
      if (historyPage)
        bookmarks.current.set(key, {
          start: historyPage.start,
          query: historyQuery,
        });
      else bookmarks.current.delete(key);
    }
    setHistoryBusy(true);
    // Project opening hydrates the live session and clears the old history view.
    // Acquire the window token after that reset, then reject obsolete page responses.
    let token = ++request.current;
    try {
      if (project !== row.cwd || sessionId !== row.id) {
        const opened = await openProject(row.cwd, {
          mode: "resume",
          sessionId: row.id,
        });
        if (!opened) throw new Error("Could not open this conversation.");
        token = ++request.current;
        setHistoryBusy(true);
      }
      const bookmark = bookmarks.current.get(`${row.cwd}\0${row.id}`);
      const ordinal = "ordinal" in row && row.ordinal >= 0 ? row.ordinal : null;
      if (ordinal !== null || bookmark) {
        const frame = await window.grokDesktop.historyWindow({
          cwd: row.cwd,
          sessionId: row.id,
          ...(ordinal !== null ? { ordinal } : { start: bookmark!.start }),
        });
        if (token !== request.current) return;
        setHistoryPage(frame);
        setHistoryQuery(ordinal !== null ? query : bookmark!.query);
      } else if (token === request.current) {
        setHistoryPage(null);
        setHistoryQuery("");
      }
    } finally {
      if (token === request.current) setHistoryBusy(false);
    }
  }

  async function pageHistory(start: number) {
    if (!project || !sessionId) return;
    const token = ++request.current;
    setHistoryBusy(true);
    try {
      const page = await window.grokDesktop.historyWindow({
        cwd: project,
        sessionId,
        start,
      });
      if (token !== request.current) return;
      setHistoryPage(page);
      setHistoryQuery("");
    } catch (error) {
      if (token === request.current) setError(String(error));
    } finally {
      if (token === request.current) setHistoryBusy(false);
    }
  }

  return {
    historyPage,
    historyQuery,
    historyBusy,
    clearHistory,
    openHistory,
    pageHistory,
  };
}
