import fs from "node:fs";
import path from "node:path";
import { catalogHistory, sessionFiles } from "./history-core.mjs";

export const metrics = [
  "inputTokens",
  "outputTokens",
  "totalTokens",
  "cachedReadTokens",
  "cacheCreationTokens",
  "reasoningTokens",
  "modelCalls",
  "costUsdTicks",
];
export function normalizeUsage(u = {}) {
  u = u && typeof u === "object" ? u : {};
  const result = {};
  for (const k of metrics) {
    const snake = k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase()),
      v = u[k] ?? u[snake];
    result[k] =
      v == null
        ? null
        : Number.isFinite(Number(v)) && Number(v) >= 0
          ? Number(v)
          : null;
  }
  return {
    ...result,
    partial: Boolean(u.usageIsIncomplete || u.costIsPartial || u.partial),
    costPartial: Boolean(u.costIsPartial),
    model: u.primaryModelId || Object.keys(u.modelUsage || {})[0] || null,
  };
}
export function usageFromEvents(lines) {
  const turns = [],
    seen = new Set();
  let ordinal = 0;
  for (const line of lines.split("\n")) {
    try {
      const row = JSON.parse(line),
        p = row.params || row,
        u = p.update || p;
      if (
        !["turn_completed", "turn_complete"].includes(
          u.sessionUpdate || u.session_update,
        )
      )
        continue;
      const id =
        u.prompt_id || u.promptId || p._meta?.eventId || `line:${ordinal}`;
      ordinal++;
      if (seen.has(id)) continue;
      seen.add(id);
      const payload = u.usage || u.Usage,
        normalized = normalizeUsage(payload);
      turns.push({
        ...normalized,
        id,
        endedAt: new Date(
          (row.timestamp > 1e12 ? row.timestamp : row.timestamp * 1000) ||
            p._meta?.agentTimestampMs ||
            0,
        ).toISOString(),
        elapsedMs: u.elapsed_ms ?? u.elapsedMs ?? null,
        partial: !payload || normalized.partial,
      });
    } catch {}
  }
  return turns;
}
export function readUsageSession(row) {
  const files = sessionFiles(row.cwd, row.id),
    file = path.join(files.dir, "usage.json");
  let events = [];
  try {
    events = usageFromEvents(fs.readFileSync(files.updates, "utf8"));
  } catch {}
  if (fs.existsSync(file) && !fs.lstatSync(file).isSymbolicLink())
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!Array.isArray(raw.turns) || !raw.session)
        throw Error("Invalid usage");
      const turns = raw.turns.map((t) => {
        const matches = events.filter((e) => e.endedAt === t.endedAt);
        return {
          ...normalizeUsage(t),
          id: `native:${t.turnNumber}`,
          turnNumber: t.turnNumber,
          endedAt: t.endedAt,
          elapsedMs: matches.length === 1 ? matches[0].elapsedMs : null,
          promptId: matches.length === 1 ? matches[0].id : null,
        };
      });
      return {
        ...row,
        source: "native",
        summary: normalizeUsage(raw.session),
        turns,
      };
    } catch {}
  // A fresh session has synthetic context, but no response usage to record yet.
  // Keep legacy conversations with real messages distinct from genuinely empty ones.
  let hasMessages = false;
  for (const candidate of [
    files.updates,
    path.join(files.dir, "chat_history.jsonl"),
  ])
    try {
      if (fs.lstatSync(candidate).isSymbolicLink()) continue;
      hasMessages ||= fs
        .readFileSync(candidate, "utf8")
        .split("\n")
        .some((line) => {
          try {
            const raw = JSON.parse(line),
              update = raw.params?.update || raw.update || raw;
            return (
              ["user_message_chunk", "agent_message_chunk"].includes(
                update.sessionUpdate || update.session_update,
              ) ||
              raw.type === "assistant" ||
              (raw.type === "user" && !raw.synthetic_reason)
            );
          } catch {
            return false;
          }
        });
    } catch {}
  return {
    ...row,
    source: events.length ? "events" : hasMessages ? "unavailable" : "empty",
    turns: events,
  };
}
export function aggregateUsage(
  rows,
  { cwd, sessionId, period = "all", request = false, now = Date.now() } = {},
) {
  const boundary =
    period === "today"
      ? new Date(new Date(now).setHours(0, 0, 0, 0)).getTime()
      : period === "7d"
        ? now - 7 * 864e5
        : period === "30d"
          ? now - 30 * 864e5
          : 0;
  const selected = rows.filter(
    (r) =>
      (!cwd ||
        path.resolve(r.cwd).toLowerCase() ===
          path.resolve(cwd).toLowerCase()) &&
      (!sessionId || r.id === sessionId),
  );
  let turns = selected.flatMap((r) =>
    r.turns
      .filter((t) => !boundary || Date.parse(t.endedAt) >= boundary)
      .map((t) => ({
        ...t,
        cwd: r.cwd,
        sessionId: r.id,
        title: r.title,
        available: r.available,
      })),
  );
  turns.sort(
    (a, b) => (Date.parse(b.endedAt) || 0) - (Date.parse(a.endedAt) || 0),
  );
  if (request) turns = turns.slice(0, 1);
  const totals = {},
    coverage = {};
  for (const k of metrics) {
    const known = turns.filter((t) => t[k] != null);
    totals[k] = known.length ? known.reduce((n, t) => n + t[k], 0) : null;
    coverage[k] = { known: known.length, total: turns.length };
  }
  return {
    totals,
    coverage,
    turns,
    conversations: selected.length,
    requests: turns.length,
    costPartial:
      turns.some((t) => t.costPartial) ||
      coverage.costUsdTicks.known < turns.length ||
      selected.some((r) => r.source === "unavailable"),
    partial:
      selected.some((r) => r.source === "unavailable") ||
      turns.some((t) => t.partial) ||
      metrics.some((k) => turns.some((t) => t[k] == null)),
    unavailable: selected.filter((r) => r.source === "unavailable").length,
  };
}
export function usageCatalog() {
  return catalogHistory().map(readUsageSession);
}
