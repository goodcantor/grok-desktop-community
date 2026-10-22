import { useMemo, useState, useRef, useLayoutEffect, useEffect, type ReactNode } from "react";
import { useRunActivity } from "../hooks/useRunActivity";
import { GoalSummary } from "./GoalSummary";
import {
  Check,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Clock3,
  ChevronDown,
  ChevronUp,
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
  currentTurnItems,
  formatElapsed,
} from "../../shared/activity-status.mjs";
import { longTurnStatus } from "../../shared/long-turn-status.mjs";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { Disclosure } from "./ui/Disclosure";
import { producedFiles } from "../../shared/conversation-view.mjs";
import { PlanSteps } from "./PlanSteps";

export type TurnOutcome = {
  status: "completed" | "stopped" | "failed";
  startedAt: number;
  endedAt: number;
};
export type TaskProgress = ReturnType<typeof activityStatus> & { sessionId: string | null; goal: GoalState | null; plan: ReturnType<typeof currentPlan>; outcome: TurnOutcome | null; queued: number; runningTasks: number };

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
  queueCount: number;
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
  queueCount,
  onRestart,
  onReview,
  onGoalAction,
}: Props) {
  const { redact } = usePrivacy();
  const root = useRef<HTMLDivElement>(null), detailsButton=useRef<HTMLButtonElement>(null);
  const [detailsOpen,setDetailsOpen]=useState(false);
  const collapseKey=`grok:activity-collapsed:${sessionId || 'pending'}`;
  const [collapseOverride,setCollapseOverride]=useState<boolean|null>(()=>{
    try {const value=sessionStorage.getItem(collapseKey);return value===null?null:value==='true';}catch{return null;}
  });
  const onlyPastTasks=tasks.length>0 && tasks.every(task=>task.status==='failed'||task.status==='completed') && !busy && !compacting && !goal && !queueCount;
  const panelCollapsed=collapseOverride ?? onlyPastTasks;
  const togglePanel=()=>{const next=!panelCollapsed;setCollapseOverride(next);try{sessionStorage.setItem(collapseKey,String(next));}catch{/* UI preference is optional. */}};
  useLayoutEffect(()=>{
    const element=root.current;if(!element)return;
    const fit=()=>{const header=element.closest('main')?.querySelector('.conversation-tabs')?.getBoundingClientRect().bottom??60;element.style.setProperty('--progress-space',Math.max(40,element.getBoundingClientRect().top-header-12)+'px');};
    fit();const observer=new ResizeObserver(fit);observer.observe(element);window.addEventListener('resize',fit);return()=>{observer.disconnect();window.removeEventListener('resize',fit);};
  });
  useEffect(()=>{
    if(!detailsOpen)return;
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setDetailsOpen(false);detailsButton.current?.focus();}};
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setDetailsOpen(false);};
    document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};
  },[detailsOpen]);
  const { run, now, stopPending, startedAt, runningCount } = useRunActivity(
    sessionId,
    busy,
    compacting,
    tasks,
  );
  const plan = useMemo(() => currentPlan(items, goal), [items, goal]);
  const turnItems = useMemo(() => currentTurnItems(items), [items]);
  const hasChanges = turnItems.some((item,index) => item.kind==='assistant' && producedFiles(turnItems,index).length>0);
  const completed = plan.filter((entry) => entry.status === "completed").length;
  const step =
    plan.find((entry) => entry.status === "in_progress") ||
    plan.find((entry) => entry.status === "pending");
  // The disclosure heading already displays the current step.
  const preview = plan.filter(entry => entry.status !== 'completed' && entry !== step).slice(0,2);
  const state: TaskProgress = {...activityStatus({
    run,
    items,
    waitingFor,
    permissionCount,
    now,
    startedAt: startedAt,
    cancelRequested: stopPending,
  }), sessionId, goal, plan, outcome, queued: queueCount, runningTasks: runningCount};
  const soft =
    busy && run?.sessionId === sessionId ? longTurnStatus(run, now) : null;
  const label = !busy && connection === "online" && runningCount ? `${runningCount} background tasks running` : compacting
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
      ref={root} className="chat-activity composer-activity"
      aria-label="Conversation activity" data-history-only={onlyPastTasks} data-collapsed={panelCollapsed && !detailsOpen} data-active={busy || compacting || Boolean(goal) || tasks.length>0 || Boolean(outcome) || queueCount>0 || connection!=="online"}
    >
      <div className="activity-extras" data-expanded={detailsOpen} role={detailsOpen?"region":undefined} aria-label={detailsOpen?"Task details":undefined}>
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
        {preview.length > 0 && <div className="task-preview"><PlanSteps entries={preview} label="Next task steps" /></div>}
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
      {(step || goal) && <div className="compact-task-summary" title={redact(step?.content || goal?.objective || '')}>{redact(step?.content || goal?.objective || '')}</div>}
      <section
        className={`turn-activity turn-activity--${busy ? state.phase : connection} activity-tone--${tone}`}
        aria-label={busy ? "Current response" : "Response status"}
      >
        <div className="turn-activity-main">
          {(goal || plan.length>0 || queueCount>0 || tasks.length>0) && <button type="button" className="activity-panel-toggle" aria-label={panelCollapsed?'Expand task details':'Collapse task details'} aria-expanded={!panelCollapsed} onClick={togglePanel} title={panelCollapsed?'Expand task details':'Collapse task details'}>{panelCollapsed?<ChevronDown size={14}/>:<ChevronUp size={14}/>}<span>{onlyPastTasks?`${tasks.length} past tasks`:'Details'}</span></button>}
          {(goal || plan.length>0 || queueCount>0 || tasks.length>0) && <button ref={detailsButton} type="button" className="compact-task-details" aria-label="Task details" aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(!detailsOpen)}>Details{queueCount>0?` · ${queueCount} queued`:''}</button>}
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
          {!busy && !compacting && outcome?.status === "completed" && hasChanges && (
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
