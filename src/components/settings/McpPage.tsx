import { McpServerForm } from "./mcp/McpServerForm";
import {
  emptyMcpForm,
  mcpFormForServer,
  type McpFormState,
} from "./mcp/form-state";
import { McpTestPanel } from "./mcp/McpTestPanel";
import {
  applyDoctorResult,
  cardStatusClass,
  isManagedMcp,
  liveStatusClass,
  mcpTarget,
  reportKey,
  splitArgTokens,
  viewNeedsAuth,
  type TestView,
} from "./mcp/view-model";
import { useEffect, useRef, useState } from "react";
import {
  applyMcpServerStatus,
  mcpLiveLabel,
  mcpNeedsSignIn,
  needsFolderTrust,
  resolveMcpCardStatus,
} from "../../../shared/mcp-status.mjs";
import type { McpServerInfo } from "../../types/desktop";
import {
  FolderTrustBanner,
  folderTrustBannerVisible,
  folderTrustButtonTitle,
  useFolderTrustAction,
} from "./FolderTrustControls";

export function McpPage({
  open,
  restarting,
  hasProject,
  focus,
  onRestartAfterWrite,
}: {
  open: boolean;
  restarting: boolean;
  hasProject: boolean;
  focus: boolean;
  onRestartAfterWrite?: () => Promise<void> | void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const serversRef = useRef<McpServerInfo[]>([]);
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [writeBusy, setWriteBusy] = useState(false);
  const [testing, setTesting] = useState<string | "all" | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [reports, setReports] = useState<Record<string, TestView>>({});
  const [adding, setAdding] = useState(false);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [authing, setAuthing] = useState<string | null>(null);

  const [form, setForm] = useState(emptyMcpForm);
  const {
    name,
    transport,
    command,
    argsText,
    url,
    projectScope,
    envRows,
    headerRows,
  } = form;
  function setField<K extends keyof McpFormState>(
    key: K,
    value: McpFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const setServerList = (
    next: McpServerInfo[] | ((prev: McpServerInfo[]) => McpServerInfo[]),
  ) => {
    setServers((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      serversRef.current = resolved;
      return resolved;
    });
  };

  const reload = async (cache = true) => {
    const res = await window.grokDesktop.listMcpServers({ cache });
    const next = res.servers || [];
    setServerList(next);
    if (!res.ok && res.error) setNote(res.error);
    if (next.length === 0 && !editingName) setAdding(true);
    return res;
  };

  const { parked, trustBusy, trustLocked, onTrustFolder } =
    useFolderTrustAction({
      hasProject,
      restarting,
      onNote: setNote,
      onReload: reload,
    });

  const writeLocked = writeBusy || restarting || trustBusy;
  const testLocked = testing !== null || restarting || trustBusy;
  const authLocked = authing !== null || restarting || trustBusy;
  const formOpen = adding || Boolean(editingName);

  useEffect(() => {
    if (!open) return;
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        void reload();
      }, 200);
    };
    const off = window.grokDesktop.on(
      "agent:mcp-status",
      (event: { method?: string; params?: Record<string, unknown> }) => {
        const method = String(event?.method || "");
        if (method === "x.ai/mcp/server_status") {
          const name = String(event.params?.name || "");
          if (!name) return;
          setServerList((prev) =>
            prev.map((s) =>
              s.name === name ? applyMcpServerStatus(s, event.params || {}) : s,
            ),
          );
          return;
        }
        if (
          method === "x.ai/mcp/init_progress" ||
          method === "x.ai/mcp/tools_changed" ||
          method === "x.ai/mcp/servers_updated" ||
          method === "x.ai/mcp_initialized"
        ) {
          scheduleReload();
        }
      },
    );
    return () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      off();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let ticks = 0;
    const id = window.setInterval(() => {
      ticks += 1;
      const stuck = serversRef.current.some(
        (s) =>
          s.enabled !== false &&
          (s.liveStatus === "initializing" || !s.liveStatus),
      );
      if (!stuck || ticks > 24) {
        window.clearInterval(id);
        return;
      }
      void reload(ticks > 2 ? false : true);
    }, 1250);
    return () => window.clearInterval(id);
  }, [open]);

  const resetForm = () => {
    setForm(emptyMcpForm());
    setAdding(false);
    setEditingName(null);
  };

  const beginEdit = (server: McpServerInfo) => {
    setAdding(false);
    setEditingName(server.name);
    setForm(mcpFormForServer(server));
    setNote(null);
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setNote(null);
    setReports({});
    setTesting(null);
    setLoading(true);
    void reload()
      .catch((e: unknown) => {
        if (!cancelled) {
          setNote(e instanceof Error ? e.message : String(e));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open && focus) {
      sectionRef.current?.scrollIntoView({ block: "start" });
    }
  }, [open, focus]);

  useEffect(() => {
    if (!formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      resetForm();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [formOpen]);

  const afterWrite = async (ok: boolean, error?: string | null) => {
    if (!ok) {
      setNote(error || "MCP command failed.");
      return;
    }
    setNote(null);
    if (onRestartAfterWrite) {
      await onRestartAfterWrite();
    }
    await reload();
  };

  const onToggle = async (s: McpServerInfo) => {
    setWriteBusy(true);
    setNote(null);
    try {
      const res =
        s.enabled === false
          ? await window.grokDesktop.enableMcpServer(s.name)
          : await window.grokDesktop.disableMcpServer(s.name);
      await afterWrite(res.ok, res.error);
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setWriteBusy(false);
    }
  };

  const onRemove = async (s: McpServerInfo) => {
    if (
      !window.confirm(
        `Remove MCP server “${s.name}”? This runs grok mcp remove (does not edit config.toml in the app).`,
      )
    ) {
      return;
    }
    setWriteBusy(true);
    setNote(null);
    try {
      const res = await window.grokDesktop.removeMcpServer(
        s.name,
        s.scope === "user" || s.scope === "project"
          ? { scope: s.scope }
          : undefined,
      );
      await afterWrite(res.ok, res.error);
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setWriteBusy(false);
    }
  };

  const onDoctor = async (s?: McpServerInfo) => {
    const names = s ? [s.name] : servers.map((row) => row.name);
    if (names.length === 0) {
      setNote("No MCP servers to test.");
      return;
    }
    setTesting(s ? s.name : "all");
    setNote(null);
    setReports((prev) => {
      const next = { ...prev };
      for (const name of names) next[name] = { status: "running" };
      return next;
    });
    try {
      const res = await window.grokDesktop.doctorMcp(s?.name);
      const mapped = applyDoctorResult(res, names);
      setReports((prev) => ({ ...prev, ...mapped }));
      setServerList((prev) =>
        prev.map((row) => {
          const report = mapped[row.name];
          if (!report) return row;
          if (report.needsAuth) {
            return { ...row, liveStatus: "needs-auth", authRequired: true };
          }
          if (report.healthy) {
            return { ...row, liveStatus: "ready", authRequired: false };
          }
          if (report.status === "fail") {
            return { ...row, liveStatus: "unavailable" };
          }
          return row;
        }),
      );
      if (!res.ok && res.error && !(res.servers || []).length) {
        setNote(res.error);
      }
      const focusName = s?.name || names[0];
      if (focusName) {
        document
          .getElementById(`mcp-card-${focusName}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setNote(message);
      setReports((prev) => {
        const next = { ...prev };
        for (const name of names) {
          next[name] = { status: "fail", healthy: false, error: message };
        }
        return next;
      });
    } finally {
      setTesting(null);
    }
  };

  const onLogout = async (s: McpServerInfo) => {
    if (
      !window.confirm(
        `Sign out of “${s.displayName || s.name}”? This removes the stored OAuth token. You will need to sign in again.`,
      )
    ) {
      return;
    }
    setWriteBusy(true);
    setNote(null);
    try {
      const res = await window.grokDesktop.logoutMcpServer(s.name);
      if (!res.ok) {
        setNote(res.error || `Sign-out failed for “${s.name}”.`);
        return;
      }
      setReports((prev) => {
        const next = { ...prev };
        delete next[s.name];
        return next;
      });
      setServerList((prev) =>
        prev.map((row) =>
          row.name === s.name
            ? {
                ...row,
                signedIn: false,
                liveStatus: "needs-auth",
                authRequired: true,
              }
            : row,
        ),
      );
      await afterWrite(true);
      setNote(
        res.removed
          ? `Signed out of “${s.name}”. Sign in again to reconnect.`
          : `No stored token for “${s.name}”.`,
      );
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setWriteBusy(false);
    }
  };

  const onAuth = async (s: McpServerInfo) => {
    setAuthing(s.name);
    setNote(null);
    try {
      const res = await window.grokDesktop.authenticateMcpServer(s.name);
      if (res.ok) {
        setNote(`Signed in to “${s.name}”.`);
        setReports((prev) => {
          const next = { ...prev };
          delete next[s.name];
          return next;
        });
        setServerList((prev) =>
          prev.map((row) =>
            row.name === s.name
              ? {
                  ...row,
                  liveStatus: "ready",
                  authRequired: false,
                  signedIn: true,
                }
              : row,
          ),
        );
        await reload();
        return;
      }
      setNote(res.error || `Sign-in failed for “${s.name}”.`);
      setReports((prev) => ({
        ...prev,
        [s.name]: {
          status: "fail",
          healthy: false,
          error: res.error || "Sign-in failed.",
          needsAuth: res.status !== "setup_required",
        },
      }));
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setAuthing(null);
    }
  };

  const onAdd = async () => {
    const trimmed = (editingName || name).trim();
    if (!trimmed) {
      setNote("Name is required.");
      return;
    }
    const existing = editingName
      ? servers.find((row) => row.name === editingName)
      : undefined;
    const filledEnv = envRows.filter((r) => r.key.trim() && r.value);
    const filledHeaders = headerRows.filter((r) => r.key.trim() && r.value);
    const hadSecrets = Boolean(
      existing?.envKeys?.length || existing?.headerKeys?.length,
    );
    if (
      existing &&
      hadSecrets &&
      filledEnv.length === 0 &&
      filledHeaders.length === 0
    ) {
      if (
        !window.confirm(
          `Save “${trimmed}”? grok mcp add replaces the server definition. Env/header values left blank will be removed. OAuth tokens are kept unless you change the URL.`,
        )
      ) {
        return;
      }
    }
    setWriteBusy(true);
    setNote(null);
    try {
      const tokens = splitArgTokens(command, argsText);
      const spec =
        transport === "stdio"
          ? {
              name: trimmed,
              transport,
              command: tokens[0] || "",
              args: tokens.slice(1),
              env: filledEnv,
              scope: (projectScope &&
              (hasProject || existing?.scope === "project")
                ? "project"
                : "user") as "project" | "user",
            }
          : {
              name: trimmed,
              transport,
              url: url.trim(),
              headers: filledHeaders.map((r) => ({
                name: r.key.trim(),
                value: r.value,
              })),
              scope: (projectScope && hasProject
                ? "project"
                : existing?.scope === "project"
                  ? "project"
                  : "user") as "project" | "user",
            };
      const res = await window.grokDesktop.addMcpServer(spec);
      await afterWrite(res.ok, res.error);
      if (res.ok) resetForm();
    } catch (e: unknown) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setWriteBusy(false);
    }
  };

  return (
    <section className="settings-section" ref={sectionRef} id="settings-mcp">
      <h3>MCP servers</h3>
      <p className="settings-desc settings-lead">
        Same as <code>grok mcp</code> and the TUI <code>/mcps</code> modal —
        add, edit, toggle, test, sign in, or log out here. Status matches the
        TUI (initializing → ready / needs auth / unavailable). Desktop never
        edits <code>config.toml</code>. Sign in only appears when a server needs
        OAuth. Log out removes the stored token for that server.
      </p>
      <div className="mcp-toolbar">
        <span className="settings-desc">
          {loading
            ? "Loading…"
            : servers.length === 1
              ? "1 server"
              : `${servers.length} servers`}
        </span>
        <div className="mcp-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={testLocked || loading || servers.length === 0}
            onClick={() => void onDoctor()}
          >
            {testing === "all" ? "Testing…" : "Test all"}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={writeLocked}
            onClick={() => {
              if (formOpen) {
                resetForm();
                return;
              }
              setEditingName(null);
              setAdding(true);
            }}
          >
            {formOpen ? "Cancel" : "Add server"}
          </button>
        </div>
      </div>

      <FolderTrustBanner
        show={folderTrustBannerVisible(Boolean(parked), servers, reports)}
        parked={Boolean(parked)}
        trustBusy={trustBusy}
        trustLocked={trustLocked}
        hasProject={hasProject}
        onTrust={() => void onTrustFolder()}
      />

      {loading ? <p className="settings-desc">Loading MCP servers…</p> : null}
      {!loading && servers.length === 0 ? (
        <p className="settings-desc">
          No MCP servers. Add one here — no terminal.
        </p>
      ) : null}

      <div className="mcp-list">
        {servers.map((s) => {
          const view = reports[reportKey(s)];
          const target = mcpTarget(s);
          const testingThis = testing === s.name || testing === "all";
          const status = resolveMcpCardStatus(s, view);
          const statusLabel = mcpLiveLabel(status) || "unknown";
          return (
            <article
              className={`mcp-card ${cardStatusClass(status)}${s.enabled === false ? " mcp-card-off" : ""}`}
              key={`${s.name}:${s.scope || ""}`}
              id={`mcp-card-${s.name}`}
            >
              <div className="mcp-card-head">
                <div className="settings-row-text">
                  <span className="settings-label">
                    {s.displayName || s.name}
                  </span>
                  <span className="mcp-badges">
                    <span className={liveStatusClass(status)}>
                      <span className="mcp-status-dot" aria-hidden />
                      {statusLabel}
                    </span>
                    <span className="mcp-badge">
                      {s.transport || "unknown"}
                    </span>
                    {s.scope ? (
                      <span className="mcp-badge">{s.scope}</span>
                    ) : null}
                    {s.enabled === false ? (
                      <span className="mcp-badge mcp-badge-off">disabled</span>
                    ) : null}
                    {s.envKeys?.length ? (
                      <span className="mcp-badge">env {s.envKeys.length}</span>
                    ) : null}
                    {s.headerKeys?.length ? (
                      <span className="mcp-badge">
                        headers {s.headerKeys.length}
                      </span>
                    ) : null}
                  </span>
                  {target ? (
                    <span className="mcp-target" title={target}>
                      {target}
                    </span>
                  ) : null}
                </div>
                <div className="mcp-actions">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={writeLocked}
                    onClick={() => void onToggle(s)}
                  >
                    {s.enabled === false ? "Enable" : "Disable"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={testLocked}
                    onClick={() => void onDoctor(s)}
                  >
                    {testingThis && testing !== "all" ? "Testing…" : "Test"}
                  </button>
                  {needsFolderTrust(s, view) && parked ? (
                    <button
                      type="button"
                      className="btn btn-sm primary"
                      disabled={trustLocked}
                      title={folderTrustButtonTitle(
                        hasProject,
                        Boolean(parked),
                      )}
                      onClick={() => void onTrustFolder()}
                    >
                      {trustBusy ? "Trusting…" : "Trust folder"}
                    </button>
                  ) : null}
                  {mcpNeedsSignIn(s, view) || viewNeedsAuth(view) ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={authLocked || writeLocked || !hasProject}
                      title={
                        hasProject
                          ? "Open a browser sign-in (same as TUI /mcps + i)"
                          : "Open a project first so the live agent can open the browser"
                      }
                      onClick={() => void onAuth(s)}
                    >
                      {authing === s.name
                        ? "Signing in…"
                        : s.signedIn
                          ? "Re-auth"
                          : "Sign in"}
                    </button>
                  ) : null}
                  {s.signedIn ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={writeLocked || authLocked}
                      title="Remove the stored OAuth token for this server"
                      onClick={() => void onLogout(s)}
                    >
                      Log out
                    </button>
                  ) : null}
                  {isManagedMcp(s) ? null : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={writeLocked}
                      onClick={() => beginEdit(s)}
                    >
                      Edit
                    </button>
                  )}
                  {isManagedMcp(s) ? null : (
                    <button
                      type="button"
                      className="btn btn-sm"
                      disabled={writeLocked}
                      onClick={() => void onRemove(s)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {view ? (
                <McpTestPanel
                  view={view}
                  onAuth={
                    viewNeedsAuth(view) ? () => void onAuth(s) : undefined
                  }
                  authBusy={authing === s.name}
                  authDisabled={!hasProject}
                />
              ) : null}
            </article>
          );
        })}
      </div>

      {formOpen && (
        <McpServerForm
          form={form}
          setField={setField}
          editingName={editingName}
          writeLocked={writeLocked}
          hasProject={hasProject}
          note={note}
          restarting={restarting}
          writeBusy={writeBusy}
          onAdd={onAdd}
          resetForm={resetForm}
        />
      )}
      {!formOpen && note ? (
        <span className="settings-desc settings-note">{note}</span>
      ) : null}
    </section>
  );
}
