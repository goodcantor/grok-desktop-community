import { useState } from "react";
import { Pause, Play, Target } from "lucide-react";
import type { GoalState } from "../types/desktop";
import { formatElapsed, goalElapsed } from "../../shared/activity-status.mjs";
import { usePrivacy } from "../lib/privacy-context";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Disclosure } from "./ui/Disclosure";

export type GoalAction = "pause" | "resume" | "clear";

export function GoalSummary({
  goal,
  now,
  busy,
  startedAt,
  onAction,
}: {
  goal: GoalState;
  now: number;
  busy: boolean;
  startedAt: number | null;
  onAction: (action: GoalAction) => Promise<boolean>;
}) {
  const { redact } = usePrivacy();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const elapsed = goalElapsed(goal, now, busy ? startedAt : null);
  const label =
    goal.status === "active"
      ? goal.verifyingCompletion
        ? "Verifying"
        : goal.planning || goal.phase === "planning"
          ? "Planning"
          : goal.phase === "executing"
            ? "Executing"
            : "Active"
      : goal.status === "complete"
        ? "Complete"
        : goal.status === "blocked"
          ? "Blocked"
          : goal.status === "budget_limited"
            ? "Budget reached"
            : goal.status === "user_paused"
              ? "Paused"
              : goal.status?.endsWith("_paused")
                ? "Paused by engine"
                : goal.status?.replaceAll("_", " ");

  async function act(action: GoalAction) {
    if (pending) return;
    if (
      action === "clear" &&
      !window.confirm(
        busy
          ? "Stop the response and clear this goal? The conversation and completed file changes will be kept."
          : "Clear this goal? The conversation and completed file changes will be kept.",
      )
    )
      return;
    setPending(true);
    setError("");
    try {
      if (!(await onAction(action)))
        setError(
          "The engine has not confirmed this goal command. Check its status before trying again.",
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className={`goal-summary goal-summary--${goal.status}`}
      aria-label="Current goal"
    >
      <Disclosure
        className="goal-disclosure"
        label={
          <>
            <Target size={14} aria-hidden />
            <span className="sr-only">Goal: </span>
            <span
              className="goal-objective-preview"
              title={redact(goal.objective)}
            >
              {redact(goal.objective)}
            </span>
            <Badge
              tone={
                goal.status === "complete"
                  ? "success"
                  : goal.status === "active"
                    ? "neutral"
                    : "warning"
              }
              className="goal-state"
            >
              {label}
            </Badge>
            {elapsed != null && (
              <time className="activity-time" title="Engine elapsed time">
                {formatElapsed(elapsed)}
              </time>
            )}
          </>
        }
      >
        <p className="goal-objective">{redact(goal.objective)}</p>
        {goal.tokensUsed != null && (
          <span className="goal-tokens">
            {goal.tokensUsed.toLocaleString("en-US")}
            {goal.tokenBudget != null
              ? ` / ${goal.tokenBudget.toLocaleString("en-US")}`
              : ""}{" "}
            tokens
          </span>
        )}
        {goal.pauseMessage && (
          <p className="goal-pause-reason">{redact(goal.pauseMessage)}</p>
        )}
      </Disclosure>
      <div className="goal-summary-actions">
        {goal.status === "active" ? (
          <Button disabled={pending} onClick={() => void act("pause")}>
            <Pause size={13} aria-hidden />
            {busy ? "Stop & pause" : "Pause"}
          </Button>
        ) : (
          goal.status !== "complete" && (
            <Button
              disabled={pending || busy}
              title={
                busy
                  ? "Stop the current response before resuming the goal"
                  : undefined
              }
              onClick={() => void act("resume")}
            >
              <Play size={13} aria-hidden />
              Resume
            </Button>
          )
        )}
        <Button disabled={pending} onClick={() => void act("clear")}>
          Clear
        </Button>
      </div>
      {pending && (
        <span className="goal-pause-reason" role="status">
          Applying…
        </span>
      )}
      {error && (
        <p className="goal-pause-reason" role="alert">
          {redact(error)}
        </p>
      )}
    </section>
  );
}
