import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChartNoAxesCombined, RefreshCw, X, ExternalLink } from "lucide-react";
import type {
  BillingResult,
  UsageResult,
  UsageMetrics,
} from "../types/workspace";
import { Button } from "./ui/Button";
import { usePrivacy } from "../lib/privacy-context";

export const openUsage = () =>
  document.dispatchEvent(new CustomEvent("grok:open-usage"));
const number = (n: number | null | undefined) =>
  n == null
    ? "—"
    : Intl.NumberFormat("en", {
        notation: n >= 100000 ? "compact" : "standard",
        maximumFractionDigits: 1,
      }).format(n);
function resetLabel(end?: string) {
  const date = end ? new Date(end) : null;
  return date && Number.isFinite(date.getTime())
    ? `Resets ${date.toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
    : "Local tokens and plan limits";
}

export function BillingSummary({
  billing,
  onClick,
  expanded = false,
}: {
  billing: BillingResult | null;
  onClick: () => void;
  expanded?: boolean;
}) {
  const c = billing?.config;
  const percent =
    c?.creditUsagePercent ??
    (c?.monthlyLimit?.val && c.used
      ? (100 * c.used.val) / c.monthlyLimit.val
      : undefined);
  const end = c?.currentPeriod?.end || c?.billingPeriodEnd;
  return (
    <button
      className="billing-summary"
      onClick={onClick}
      title={billing?.error || "Usage and subscription"}
    >
      <span>
        <ChartNoAxesCombined size={16} />
        {percent == null
          ? "Plan usage"
          : `${number(percent)}% ${expanded ? "of plan " : ""}used`}
        {billing?.error && <small> · stale</small>}
      </span>
      {percent != null && (
        <progress
          aria-label="Plan usage"
          max={100}
          value={Math.min(100, percent)}
        />
      )}
      <small>{resetLabel(end)}</small>
    </button>
  );
}

const primary = {
  inputTokens: "Input",
  outputTokens: "Output",
  totalTokens: "Total tokens",
  costUsdTicks: "Recorded model cost",
} as const;
const secondary = {
  cachedReadTokens: "Cache read",
  cacheCreationTokens: "Cache creation",
  reasoningTokens: "Reasoning",
  modelCalls: "Model calls",
} as const;
function costLabel(data: UsageResult) {
  const value = data.totals.costUsdTicks;
  if (value == null) return "—";
  return `${data.costPartial ? "≥ " : ""}$${(value / 1e10).toFixed(4)}`;
}
function UsageDetails({ data }: { data: UsageResult }) {
  const { redact } = usePrivacy();
  return (
    <>
      <div className="usage-metrics">
        {Object.entries(primary).map(([key, label]) => (
          <div key={key}>
            <small>{label}</small>
            <strong
              title={
                data.totals[key as keyof UsageMetrics] == null
                  ? "Not recorded by Grok"
                  : key === "costUsdTicks"
                    ? "Reported model cost; separate from subscription usage. ≥ indicates incomplete cost records."
                    : undefined
              }
            >
              {key === "costUsdTicks"
                ? costLabel(data)
                : number(data.totals[key as keyof UsageMetrics])}
            </strong>
          </div>
        ))}
      </div>
      <dl className="usage-secondary">
        {Object.entries(secondary)
          .filter(([key]) => data.totals[key as keyof UsageMetrics] != null)
          .map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{number(data.totals[key as keyof UsageMetrics])}</dd>
            </div>
          ))}
      </dl>
      <p className="usage-note">
        {data.requests} responses · {data.conversations} conversations
        {data.partial ? " · Some usage fields were not recorded" : ""}
        {data.unavailable
          ? ` · ${data.unavailable} conversations without usage records`
          : ""}
      </p>
      <div className="usage-turns">
        {data.turns.slice(0, 200).map((t) => (
          <div key={`${t.cwd}:${t.sessionId}:${t.id}`}>
            <span title={redact(t.cwd)}>
              <strong>{redact(t.title)}</strong>
              <small>
                {Date.parse(t.endedAt)
                  ? new Date(t.endedAt).toLocaleString()
                  : "Time not recorded"}
                {t.model ? ` · ${t.model}` : ""}
                {t.partial ? " · Partial" : ""}
              </small>
            </span>
            <span>
              {t.totalTokens == null
                ? "Tokens not recorded"
                : `${number(t.totalTokens)} tokens`}
              <small>
                {t.elapsedMs == null
                  ? ""
                  : `${(t.elapsedMs / 1000).toFixed(1)}s`}
              </small>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

export function UsageHost({
  project,
  sessionId,
  busy = false,
}: {
  project: string | null;
  sessionId: string | null;
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [scope, setScope] = useState("conversation"),
    [period, setPeriod] = useState("all");
  const [data, setData] = useState<UsageResult | null>(null),
    [billing, setBilling] = useState<BillingResult | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState({ done: 0, total: 0 });
  const serial = useRef(0),
    close = useRef<HTMLButtonElement>(null);
  const selectionMissing =
    scope !== "all" &&
    (!project || (["conversation", "request"].includes(scope) && !sessionId));
  const refreshBilling = () =>
    window.grokDesktop
      .usageBilling()
      .then(setBilling)
      .catch((e) => setBilling((old) => ({ ...old, error: String(e) })));
  useEffect(() => {
    const show = () => setOpen(true);
    document.addEventListener("grok:open-usage", show);
    return () => document.removeEventListener("grok:open-usage", show);
  }, []);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === "visible") void refreshBilling();
    };
    update();
    const timer = setInterval(update, 60000);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [project, sessionId]);
  useEffect(() => {
    document.dispatchEvent(
      new CustomEvent("grok:billing", { detail: billing }),
    );
  }, [billing]);
  const refresh = async () => {
    if (selectionMissing) {
      setLoading(false);
      return;
    }
    const token = ++serial.current;
    setLoading(true);
    setError("");
    try {
      const result = await window.grokDesktop.usageQuery({
        cwd: scope === "all" ? undefined : project || undefined,
        sessionId: ["conversation", "request"].includes(scope)
          ? sessionId || undefined
          : undefined,
        period,
        request: scope === "request",
      });
      if (token === serial.current) setData(result);
    } catch (e) {
      if (token === serial.current) setError(String(e));
    } finally {
      if (token === serial.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    setData(null);
    void refresh();
    void refreshBilling();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      serial.current++;
      clearInterval(timer);
    };
  }, [open, scope, period, project, sessionId]);
  useEffect(() => window.grokDesktop.on("usage:progress", setProgress), []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => close.current?.focus());
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
      if (e.key === "Tab") {
        const dialog = close.current?.closest('[role="dialog"]'),
          nodes = dialog?.querySelectorAll<HTMLElement>(
            "button:not(:disabled),select",
          );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    document.dispatchEvent(
      new CustomEvent("grok:popover-open", { detail: "usage" }),
    );
    return () => {
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [open]);
  if (!open) return null;
  const pending = busy && ["conversation", "request"].includes(scope);
  const hasMetrics =
    data &&
    Object.values(data.totals).some((value) => typeof value === "number");
  const showDetails =
    data && hasMetrics && !selectionMissing && !(scope === "request" && busy);
  return createPortal(
    <div
      className="history-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <section
        className="usage-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Usage"
      >
        <header>
          <h2>
            <ChartNoAxesCombined size={20} /> Usage
          </h2>
          <button
            ref={close}
            className="icon-button"
            aria-label="Close usage"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </header>
        <BillingSummary
          expanded
          billing={billing}
          onClick={() => void refreshBilling()}
        />
        <div className="usage-filters">
          <select
            aria-label="Usage scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="request">Current / latest request</option>
            <option value="conversation">Conversation</option>
            <option value="project">Project</option>
            <option value="all">All local history</option>
          </select>
          <select
            aria-label="Usage period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="7d">7 days</option>
            <option value="30d">30 days</option>
            <option value="all">All time</option>
          </select>
          <button
            className="icon-button"
            aria-label="Refresh usage"
            disabled={loading}
            onClick={() => {
              void refresh();
              void refreshBilling();
            }}
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="btn"
            onClick={() =>
              void window.grokDesktop.openExternal("https://grok.com/?_s=usage")
            }
          >
            Open Grok usage <ExternalLink size={14} />
          </button>
        </div>
        {loading && (
          <p className="usage-note" role="status">
            Updating usage {progress.done}/{progress.total}…
          </p>
        )}
        {error && (
          <p className="history-error" role="alert">
            {error}
          </p>
        )}
        {showDetails ? (
          <>
            {pending && (
              <p className="usage-note" role="status">
                Current response is running; its final usage is pending.
              </p>
            )}
            <UsageDetails data={data} />
          </>
        ) : (
          (data || selectionMissing) &&
          !error && (
            <div className="usage-empty">
              <ChartNoAxesCombined size={24} aria-hidden />
              <h3>
                {selectionMissing
                  ? scope === "project"
                    ? "No project selected"
                    : "No conversation selected"
                  : pending
                    ? "Usage is pending"
                    : period !== "all"
                      ? "No usage recorded in this period"
                      : "No usage recorded yet"}
              </h3>
              <p>
                {selectionMissing
                  ? "Open a conversation or view usage across your local history."
                  : pending
                    ? "Token counts appear when the response finishes."
                    : data?.unavailable
                      ? "Grok did not save token usage for this selection."
                      : "Token counts appear after Grok finishes a response."}
              </p>
              {scope !== "all" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPeriod("all");
                    setScope("all");
                  }}
                >
                  View all local usage
                </Button>
              )}
            </div>
          )
        )}
        {billing?.error && (
          <p className="usage-note">Plan usage unavailable: {billing.error}</p>
        )}
        <p className="usage-note">
          Response tokens are local records; plan usage is reported by Grok.
        </p>
      </section>
    </div>,
    document.body,
  );
}
