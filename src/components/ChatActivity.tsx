import { useMemo, type ReactNode } from "react";
import { useRunActivity } from "../hooks/useRunActivity";
import { GoalSummary } from "./GoalSummary";
import {
  Check,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Clock3,
  GitCompare,
  LoaderCircle,
  Square,
  Wrench,
} from "lucide-react";
import type { GoalState, TimelineItem } from "../types/desktop";
import type { ConnState } from "../lib/conn";
import type { BackgroundTask } from "../lib/background-tasks";
import { usePrivacy } from "../lib/privacy-context";
import {
  activityStatus,
  currentPlan,
  formatElapsed,
} from "../../shared/activity-status.mjs";
import { longTurnStatus } from "../../shared/long-turn-status.mjs";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Disclosure } from "./ui/Disclosure";
import { PlanSteps } from "./PlanSteps";

export type TurnOutcome = {
  status: "completed" | "stopped" | "failed";
  startedAt: number;
  endedAt: number;
};
type Props = {
  sessionId: string | null;
  busy: boolean;
  compacting?: boolean;
  connection: ConnState;
  items: TimelineItem[];
  goal: GoalState | null;
  waitingFor: string | null;
  permissionCount: number;
  outcome: TurnOutcome | null;
  tasks: BackgroundTask[];
  onRestart: () => void;
  onReview: () => void;
  queue: ReactNode;
  onGoalAction: (action: "pause" | "resume" | "clear") => Promise<boolean>;
};

export function ChatActivity({
  sessionId,
  busy,
  compacting = false,
  connection,
  items,
  goal,
  waitingFor,
  permissionCount,
  outcome,
  tasks,
  queue,
  onRestart,
  onReview,
  onGoalAction,
}: Props) {
  const { redact } = usePrivacy();
  const { run, now, stopPending, startedAt, runningCount } = useRunActivity(
    sessionId,
    busy,
    compacting,
    tasks,
  );
  const plan = useMemo(() => currentPlan(items), [items]);
  const completed = plan.filter((entry) => entry.status === "completed").length;
  const step =
    plan.find((entry) => entry.status === "in_progress") ||
    plan.find((entry) => entry.status === "pending");
  const state = activityStatus({
    run,
    items,
    waitingFor,
    permissionCount,
    now,
    startedAt: startedAt,
    cancelRequested: stopPending,
  });
  const soft =
    busy && run?.sessionId === sessionId ? longTurnStatus(run, now) : null;
  const label = compacting
    ? "Compacting context"
    : busy
      ? state.label
      : outcome?.status === "failed"
        ? "Response failed"
        : connection === "error"
          ? "Engine unavailable"
          : connection === "connecting"
            ? "Connecting to Grok"
            : outcome
              ? outcome.status === "completed"
                ? "Response complete"
                : outcome.status === "stopped"
                  ? "Response stopped"
                  : "Response failed"
              : connection === "online"
                ? "Ready"
                : "Open a workspace to start";
  const Icon = busy
    ? state.phase === "waiting"
      ? CircleAlert
      : state.phase === "stopping"
        ? Square
        : state.phase === "tool"
          ? Wrench
          : LoaderCircle
    : connection === "error" || outcome?.status === "failed"
      ? CircleAlert
      : connection === "connecting"
        ? LoaderCircle
        : outcome?.status === "completed"
          ? CircleCheck
          : outcome?.status === "stopped"
            ? Square
            : Check;
  const tone =
    busy && state.phase === "waiting"
      ? "warning"
      : connection === "error" || (!busy && outcome?.status === "failed")
        ? "danger"
        : !busy && outcome?.status === "completed"
          ? "success"
          : "neutral";

  return (
    <div
      className="chat-activity composer-activity"
      aria-label="Conversation activity"
    >
      <div className="activity-extras">
        {goal && (
          <GoalSummary
            key={`${sessionId}:${goal.goalId ?? "goal"}`}
            goal={goal}
            now={now}
            busy={busy}
            startedAt={run?.startedAt ?? startedAt}
            onAction={onGoalAction}
          />
        )}
        {plan.length > 0 && (
          <Disclosure
            key={`plan:${sessionId}`}
            className="activity-plan"
            label={
              <>
                <CheckCheck size={15} aria-hidden />
                <span className="activity-plan-title">
                  {step ? redact(step.content) : "Plan complete"}
                </span>
                <Badge>
                  {completed}/{plan.length} steps
                </Badge>
              </>
            }
          >
            <PlanSteps entries={plan} />
          </Disclosure>
        )}
        {tasks.length > 0 && (
          <Disclosure
            className="activity-tasks"
            label={
              <>
                <Wrench size={14} aria-hidden />
                <span>
                  {runningCount
                    ? `${runningCount} running`
                    : "Background tasks"}
                </span>
                <Badge>{tasks.length}</Badge>
              </>
            }
          >
            <ul className="activity-task-list" aria-label="Background tasks">
              {tasks.map((task) => (
                <li key={task.id}>
                  <span
                    className="activity-task-title"
                    title={redact(task.title)}
                  >
                    {redact(task.title)}
                  </span>
                  <Badge
                    tone={
                      task.status === "failed"
                        ? "danger"
                        : task.status === "completed"
                          ? "success"
                          : "neutral"
                    }
                  >
                    {task.status}
                  </Badge>
                  <time>
                    {formatElapsed((task.endedAt ?? now) - task.startedAt)}
                  </time>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
        {queue}
      </div>
      <section
        className={`turn-activity turn-activity--${busy ? state.phase : connection} activity-tone--${tone}`}
        aria-label={busy ? "Current response" : "Response status"}
      >
        <div className="turn-activity-main">
          {compacting ? (
            <LoaderCircle size={15} className="ui-spin" aria-hidden />
          ) : (
            <Icon
              size={15}
              className={Icon === LoaderCircle ? "ui-spin" : ""}
              aria-hidden
            />
          )}
          <span
            className="activity-label"
            role="status"
            title={
              compacting
                ? "Making room in context. You can keep writing while this finishes."
                : undefined
            }
          >
            {label}
          </span>
          {busy && (
            <span className="activity-detail" title={redact(state.detail)}>
              {redact(state.detail)}
            </span>
          )}
          {busy || compacting ? (
            <time className="activity-time">
              {formatElapsed(state.elapsedMs)}
            </time>
          ) : (
            outcome && (
              <time className="activity-time">
                {formatElapsed(outcome.endedAt - outcome.startedAt)}
              </time>
            )
          )}
          {!busy && !compacting && outcome?.status === "completed" && (
            <Button
              size="icon"
              onClick={onReview}
              aria-label="Review changes"
              title="Review changes"
            >
              <GitCompare size={14} aria-hidden />
            </Button>
          )}
          {busy && (
            <Disclosure
              className="activity-details"
              label={
                <>
                  <Clock3 size={13} aria-hidden />
                  <span className="sr-only">Response details</span>
                </>
              }
            >
              <dl className="activity-diagnostics">
                <div>
                  <dt>Started</dt>
                  <dd>
                    {new Date(run?.startedAt ?? startedAt).toLocaleTimeString(
                      "en-GB",
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Last engine event</dt>
                  <dd>
                    {run?.lastActivityAt
                      ? `${formatElapsed(Math.max(0, now - run.lastActivityAt))} ago`
                      : "Waiting for engine data"}
                  </dd>
                </div>
                <div>
                  <dt>Tools</dt>
                  <dd>{state.toolCount}</dd>
                </div>
              </dl>
            </Disclosure>
          )}
        </div>
        {soft && (
          <div className="activity-recovery">
            <p role="status">{redact(soft.message)}</p>
            {soft.canRestart && (
              <Button
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Stop the current task and restart the engine? Completed file changes are kept. Your message will not be sent again automatically.",
                    )
                  )
                    onRestart();
                }}
              >
                Restart engine
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
