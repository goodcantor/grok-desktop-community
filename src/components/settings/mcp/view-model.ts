import type {
  McpDoctorResult,
  McpDoctorServer,
  McpServerInfo,
} from "../../../types/desktop";

export type KvRow = { key: string; value: string };

export type TestView = {
  status: "running" | "ok" | "fail";
  healthy?: boolean;
  checks?: McpDoctorServer["checks"];
  tools?: string[];
  toolCount?: number | null;
  error?: string | null;
  needsAuth?: boolean;
};

export function looksLikeOauthFail(text: string | null | undefined): boolean {
  return /oauth authorization required|no stored tokens|authenticate in tui|authorization required, when send initialize|re-authenticate in tui/i.test(
    String(text || ""),
  );
}

export function viewNeedsAuth(view?: TestView | null): boolean {
  if (!view) return false;
  if (view.needsAuth) return true;
  if (looksLikeOauthFail(view.error)) return true;
  return (view.checks || []).some(
    (c) => !c.passed && looksLikeOauthFail(`${c.label} ${c.detail || ""}`),
  );
}

export function isManagedMcp(s: McpServerInfo): boolean {
  return (
    s.source === "managed" ||
    s.scope === "managed" ||
    String(s.name).startsWith("managed_gateway:")
  );
}

export function liveStatusClass(status: string | null | undefined): string {
  if (status === "ready") return "mcp-status mcp-status-ready";
  if (status === "needs-auth" || status === "setup-required") {
    return "mcp-status mcp-status-auth";
  }
  if (status === "unavailable") return "mcp-status mcp-status-down";
  if (status === "initializing") return "mcp-status mcp-status-init";
  return "mcp-status mcp-status-unknown";
}

export function cardStatusClass(status: string | null | undefined): string {
  if (status === "ready") return "mcp-card-ready";
  if (status === "needs-auth" || status === "setup-required") {
    return "mcp-card-auth";
  }
  if (status === "unavailable") return "mcp-card-down";
  if (status === "initializing") return "mcp-card-init";
  return "mcp-card-unknown";
}

export function splitArgTokens(command: string, extra: string): string[] {
  return [...command.trim().split(/\s+/), ...extra.trim().split(/\s+/)].filter(
    Boolean,
  );
}

export function mcpTarget(s: McpServerInfo): string | null {
  if (s.url) return s.url;
  if (s.command) return [s.command, ...(s.args || [])].join(" ");
  return null;
}

export function reportKey(s: { name: string }): string {
  return s.name;
}

export function viewFromDoctorServer(row: McpDoctorServer): TestView {
  const needsAuth =
    Boolean(row.needsAuth) ||
    (row.checks || []).some(
      (c) => !c.passed && looksLikeOauthFail(`${c.label} ${c.detail || ""}`),
    );
  return {
    status: row.healthy ? "ok" : "fail",
    healthy: row.healthy,
    checks: row.checks,
    tools: row.tools,
    toolCount: row.toolCount,
    error: row.healthy
      ? null
      : needsAuth
        ? "This server needs a browser sign-in before Test can handshake."
        : "Doctor reported this server as failing.",
    needsAuth,
  };
}

export function applyDoctorResult(
  res: McpDoctorResult,
  names: string[],
): Record<string, TestView> {
  const byName = new Map((res.servers || []).map((row) => [row.name, row]));
  const next: Record<string, TestView> = {};
  for (const name of names) {
    const row = byName.get(name);
    if (row) {
      next[name] = viewFromDoctorServer(row);
      continue;
    }
    const fallback = [res.stdout, res.stderr, res.error]
      .filter(Boolean)
      .join("\n")
      .trim();
    next[name] = {
      status: res.ok ? "ok" : "fail",
      healthy: res.ok,
      error:
        fallback ||
        (res.ok
          ? "Doctor finished with no report for this server."
          : "Doctor failed."),
      needsAuth: looksLikeOauthFail(fallback),
    };
  }
  return next;
}

export function testHeadline(view: TestView): string {
  if (view.status === "running") return "Testing…";
  const n = view.toolCount;
  if (view.healthy) {
    if (n === 1) return "Healthy · 1 tool";
    if (n != null) return `Healthy · ${n} tools`;
    return "Healthy";
  }
  if (n != null) return `Failed · ${n} tools`;
  return "Failed";
}
