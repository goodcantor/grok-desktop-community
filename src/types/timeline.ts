export type PermissionOutcome = {
  outcome: {
    outcome: "selected" | "cancelled";
    optionId?: string;
  };
};

export type PromptImage = {
  data: string;
  mimeType: string;
};

export type TimelineImage = {
  mimeType: string;
  previewUrl: string;
};

export type TimelineItem = (
  | {
      id: string;
      kind: "user";
      text: string;
      images?: TimelineImage[];
      /** Set when UI inserts the bubble before ACP echoes it */
      optimistic?: boolean;
      /** Follow-up waiting for the current turn to finish (purple). */
      queued?: boolean;
      /** Matches Composer queue id so drain/interject can claim this bubble. */
      queueId?: string;
      /** Client-minted id so `x.ai/session/interjection` is not painted twice. */
      interjectionId?: string;
      at: number;
    }
  | { id: string; kind: "assistant"; text: string; at: number }
  | { id: string; kind: "thought"; text: string; at: number }
  | {
      id: string;
      kind: "tool";
      toolCallId: string;
      toolKind?: string;
      locations?: {path:string;line?:number}[];
      rawOutput?: unknown;
      completionObserved?: boolean;
      endedAt?: number;
      title: string;
      status: string;
      raw?: unknown;
      content?: unknown;
      /** grok-build `_meta["x.ai/tool"].kind === "ask_user"` */
      askUser?: boolean;
      at: number;
    }
  | { id: string; kind: "plan"; entries: unknown[]; at: number }
  | { id: string; kind: "system"; text: string; at: number }
) & { historyOrdinal?: number };

export type PermissionRequest = {
  reqId: string;
  params: {
    sessionId?: string;
    toolCall?: {
      toolCallId?: string;
      title?: string;
      kind?: string;
      status?: string;
      rawInput?: unknown;
    };
    options?: Array<{ optionId: string; name: string; kind?: string }>;
  };
};
