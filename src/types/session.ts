import type { TimelineItem } from "./timeline";
import type { BackboneSummary } from "./integrations";

export type GitStatusEntry = {
  path: string;
  origPath: string | null;
  index: string;
  worktree: string;
  status: string;
  untracked: boolean;
  ignored: boolean;
  staged: boolean;
  unstaged: boolean;
};

export type SessionSummary = {
  id: string;
  cwd: string;
  title: string;
  summary: string | null;
  /** True when the title was pinned with Rename / CLI `/rename`. */
  titleIsManual?: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  lastActiveAt: string | null;
  numMessages: number;
  numChatMessages: number;
  modelId: string | null;
};

export type AvailableModel = {
  modelId: string;
  name: string;
  contextWindow?: number | null;
  description?: string;
  contextWindows?: number[];
  reasoningEfforts?: Array<{ value: string; label: string }>;
  supportsReasoningEffort?: boolean;
};

export type AgentRunState = {
  sessionId: string | null;
  active: boolean;
  connected: boolean;
  startedAt: number | null;
  lastActivityAt: number | null;
  cancelRequestedAt?: number | null;
  waitingPermissions: number;
};

export type ComposerRuntime = {
  sessionId: string;
  modelId: string | null;
  modelName: string | null;
  availableModels: AvailableModel[];
  reasoningEffort: string;
  sessionMode: string;
  context: {
    used: number;
    total: number;
    autoCompactThresholdPercent: number | null;
  } | null;
  goal: GoalState | null;
};

export type GoalState = {
  status: string;
  objective: string;
  goalId?: string | null;
  phase?: string | null;
  elapsedMs?: number | null;
  observedAt?: number;
  tokensUsed?: number | null;
  tokenBudget?: number | null;
  pauseMessage?: string | null;
  lastEvent?: string | null;
  lastEventDetail?: string | null;
  planning?: boolean;
  verifyingCompletion?: boolean;
};

export type OpenCheckoutRow = {
  windowId: number;
  cwd: string;
  title: string;
};

export type WorktreeInfo = {
  path: string;
  head: string | null;
  branch: string | null;
  open: boolean;
  label?: string | null;
};

export type CheckoutOccupancy = {
  windowId: number;
  cwd: string;
  title: string;
  branch: string | null;
  detached: boolean;
};

export type CheckoutInspect = {
  cwd: string;
  git: boolean;
  currentBranch: string | null;
  detached: boolean;
  worktrees: WorktreeInfo[];
  occupancy: CheckoutOccupancy | null;
};

export type CheckoutConflict = CheckoutInspect & {
  conflict: "checkout-open";
};

export type OpenProjectResult = {
  scope?: import("./execution").ExecutionScope;
  readOnly?: boolean;
  runState?: {active:boolean};
  cwd: string;
  sessionId: string;
  grokBinary: string;
  resumed?: boolean;
  /** ACP model id for the live session (e.g. grok-4.6) */
  modelId?: string | null;
  /** Optional display name from the agent model list */
  modelName?: string | null;
  /** Models advertised on session/new|load — empty when the agent omits them */
  availableModels?: AvailableModel[];
  /** ACP session mode from session/new|load (`plan` when plan mode is on) */
  sessionMode?: string | null;
  history?: TimelineItem[];
  /** Background commands/subagents restored from updates.jsonl */
  backgroundTasks?: Array<{
    id: string;
    kind: "command" | "subagent" | "monitor";
    title: string;
    detail?: string;
    status: "running" | "completed" | "failed" | "unknown";
    command?: string;
    outputFile?: string;
    exitCode?: number | null;
    startedAt: number;
    endedAt?: number;
    outputSnippet?: string;
    toolCallId?: string;
  }>;
  /** Summed turn_completed usage from updates.jsonl (status bar) */
  usage?: import("../lib/usage").SessionUsage | null;
  sessions?: SessionSummary[];
  /** Present when main already ran `grok inspect` (agent:restart). */
  backbone?: BackboneSummary;
};
