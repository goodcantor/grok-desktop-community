export type UsageMetrics = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cachedReadTokens: number | null;
  cacheCreationTokens: number | null;
  reasoningTokens: number | null;
  modelCalls: number | null;
  costUsdTicks: number | null;
};
export type UsageTurn = UsageMetrics & {
  id: string;
  endedAt: string;
  elapsedMs: number | null;
  model: string | null;
  partial: boolean;
  cwd: string;
  sessionId: string;
  title: string;
};
export type UsageResult = {
  totals: UsageMetrics;
  coverage?: Partial<
    Record<keyof UsageMetrics, { known: number; total: number }>
  >;
  costPartial?: boolean;
  turns: UsageTurn[];
  conversations: number;
  requests: number;
  partial: boolean;
  unavailable: number;
};
export type BillingResult = {
  config?: {
    creditUsagePercent?: number;
    currentPeriod?: { type?: string; end?: string };
    monthlyLimit?: { val: number };
    used?: { val: number };
    billingPeriodEnd?: string;
    prepaidBalance?: { val: number };
    isUnifiedBillingUser?: boolean;
  };
  subscription_tier?: string;
  error?: string;
  observedAt?: number;
};
export type GitSnapshot = {
  root: string;
  branch: string;
  branches: string[];
  files: {
    path: string;
    index: string;
    worktree: string;
    original: string | null;
  }[];
  diff: string;
  hash: string;
  mode: string;
  base: string;
};
export type PtyTab = {
  sessionId?: string;
  recordId?: string;
  id: string;
  cwd: string;
  shell: string;
  exited: boolean;
};
export type PtyEvent = {
  event: "ready" | "data" | "exit" | "error" | "host-exit";
  id?: string;
  data?: string;
  exitCode?: number;
  error?: string;
};
