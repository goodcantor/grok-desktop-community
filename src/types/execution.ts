import type { QueuedPrompt } from './prompt';
export type ExecutionScope = { recordId: string; generation: number; sessionId: string | null };
export type ExecutionSummary = ExecutionScope & { cwd: string; active: boolean; waiting: number; status: string; unseen: boolean; selected: boolean };
export type ExecutionQueueState = { items: QueuedPrompt[]; paused: boolean; running: boolean; revision: number; outcome: { startedAt: number; endedAt: number; status: 'completed' | 'stopped' | 'failed' } | null; failed: (QueuedPrompt & { error: string }) | null };
