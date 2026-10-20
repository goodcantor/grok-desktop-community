import type { SessionSummary } from "./session";
import type { TimelineItem } from "./timeline";

export type HistorySession = SessionSummary & {
  key: string;
  available: boolean;
};

export type HistoryHit = HistorySession & {
  ordinal: number;
  role: string;
  snippet: string;
};

export type HistoryProgress = { phase: string; done: number; total: number };

export type HistoryPage = {
  items: TimelineItem[];
  start: number;
  end: number;
  total: number;
  focusOrdinal: number | null;
};
