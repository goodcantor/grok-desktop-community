import { useEffect, useState } from "react";
import type { QueuedPrompt } from "../types/prompt";
import { formatElapsed } from "../../shared/activity-status.mjs";
import * as Collapsible from "@radix-ui/react-collapsible";
import { ArrowDown, ArrowUp, ChevronDown, Pencil, X } from "lucide-react";

export function PromptQueue({
  items,
  paused,
  busy,
  available,
  onPaused,
  onEdit,
  onMove,
  onRemove,
  onSendNow,
}: {
  items: QueuedPrompt[];
  paused: boolean;
  busy: boolean;
  available: boolean;
  onPaused: (paused: boolean) => void;
  onEdit: (id: string, text: string) => void;
  onMove: (id: string, direction: number) => void;
  onRemove: (id: string) => void;
  onSendNow: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null),
    [text, setText] = useState(""),
    [expanded, setExpanded] = useState(true),
    [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!items.length) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [items.length]);
  useEffect(() => {
    if (editing && !items.some((item) => item.id === editing)) setEditing(null);
  }, [items, editing]);
  if (!items.length) return null;
  return (
    <Collapsible.Root asChild open={expanded} onOpenChange={setExpanded}>
      <section
        className={`prompt-queue prompt-queue--refined${paused ? " prompt-queue--paused" : ""}`}
        aria-label="Queued follow-ups"
      >
        <div className="prompt-queue-head">
          <Collapsible.Trigger asChild>
            <button type="button" className="queue-disclosure">
              Next up <span className="queue-count">{items.length}</span>
              <ChevronDown size={14} aria-hidden />
            </button>
          </Collapsible.Trigger>
          <span
            className="prompt-queue-hint"
            title="Unsent messages are saved locally and restore paused. Stop pauses the queue."
          >
            {paused ? "Paused" : busy ? "After this response" : "Ready to send"}
          </span>
          <button
            type="button"
            className="queue-pause"
            disabled={paused && (!available || Boolean(editing))}
            title={
              editing
                ? "Finish editing before resuming the queue"
                : !available
                  ? "Reconnect to send queued messages"
                  : undefined
            }
            onClick={() => onPaused(!paused)}
          >
            {paused ? "Resume queue" : "Pause queue"}
          </button>
        </div>
        <Collapsible.Content>
          <ol className="prompt-queue-list">
            {items.map((q, i) => (
              <li key={q.id} className="prompt-queue-item">
                <span className="prompt-queue-idx">{i + 1}</span>
                <div className="queue-message">
                  <span
                    className="prompt-queue-text"
                    title={q.timelineText || q.text}
                  >
                    {q.timelineText || q.text || `(${q.images.length} images)`}
                  </span>
                  <small>
                    {q.deliveryUncertain ? "Delivery uncertain — check history, then Send now to retry" : i === 0 ? "Next in line" : "Waiting"} ·{" "}
                    <time aria-live="off">{formatElapsed(now - q.at)}</time>
                    {q.images.length > 0
                      ? ` · ${q.images.length} image${q.images.length === 1 ? "" : "s"}`
                      : ""}
                  </small>
                </div>
                <div className="queue-item-actions">
                  <button
                    type="button"
                    aria-label="Edit queued message"
                    title="Edit message"
                    disabled={editing === q.id}
                    onClick={() => {
                      onPaused(true);
                      setEditing(q.id);
                      setText(q.text);
                    }}
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Move queued message up"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => onMove(q.id, -1)}
                  >
                    <ArrowUp size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Move queued message down"
                    title="Move down"
                    disabled={i === items.length - 1}
                    onClick={() => onMove(q.id, 1)}
                  >
                    <ArrowDown size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    title={
                      busy
                        ? "Steer the running response; unsupported engines keep it queued"
                        : "Send this message now"
                    }
                    disabled={editing === q.id || !available}
                    onClick={() => onSendNow(q.id)}
                  >
                    {busy ? "Steer now" : "Send now"}
                  </button>
                  <button
                    type="button"
                    aria-label="Remove queued message"
                    title="Remove from queue"
                    onClick={() => onRemove(q.id)}
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
                {editing === q.id && (
                  <div className="queue-edit">
                    <textarea
                      aria-label="Edit queued message text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <div>
                      <span>The queue stays paused while you edit.</span>
                      <button type="button" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!text.trim()}
                        onClick={() => {
                          onEdit(q.id, text);
                          setEditing(null);
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Collapsible.Content>
      </section>
    </Collapsible.Root>
  );
}
