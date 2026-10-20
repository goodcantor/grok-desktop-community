import type { McpFormState } from "./form-state";

export function McpServerForm({
  form,
  setField,
  editingName,
  writeLocked,
  hasProject,
  note,
  restarting,
  writeBusy,
  onAdd,
  resetForm,
}: {
  form: McpFormState;
  setField: <K extends keyof McpFormState>(
    key: K,
    value: McpFormState[K],
  ) => void;
  editingName: string | null;
  writeLocked: boolean;
  hasProject: boolean;
  note: string | null;
  restarting: boolean;
  writeBusy: boolean;
  onAdd: () => Promise<void>;
  resetForm: () => void;
}) {
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
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      data-modal-layer="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !writeLocked) resetForm();
      }}
    >
      <div
        className="modal-dialog mcp-form-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-form-title"
      >
        <div className="modal-header">
          <h2 id="mcp-form-title">
            {editingName ? `Edit ${editingName}` : "Add server"}
          </h2>
          <button
            type="button"
            className="btn ghost btn-sm"
            disabled={writeLocked}
            onClick={() => resetForm()}
            aria-label="Close"
          >
            Close
          </button>
        </div>
        <div className="modal-body mcp-add">
          <div className="mcp-grid-2">
            <label className="mcp-field">
              <span>Name</span>
              <input
                className="settings-input"
                value={editingName || name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="filesystem"
                autoComplete="off"
                disabled={writeLocked || Boolean(editingName)}
              />
            </label>
            <label className="mcp-field">
              <span>Transport</span>
              <select
                className="settings-select"
                value={transport}
                aria-label="MCP transport"
                disabled={writeLocked}
                onChange={(e) =>
                  setField(
                    "transport",
                    e.target.value as "stdio" | "http" | "sse",
                  )
                }
              >
                <option value="stdio">stdio</option>
                <option value="http">HTTP</option>
                <option value="sse">SSE</option>
              </select>
            </label>
          </div>
          {transport === "stdio" ? (
            <>
              <label className="mcp-field">
                <span>Command</span>
                <input
                  className="settings-input"
                  value={command}
                  onChange={(e) => setField("command", e.target.value)}
                  placeholder="npx -y @modelcontextprotocol/server-filesystem"
                  autoComplete="off"
                  disabled={writeLocked}
                />
              </label>
              <label className="mcp-field">
                <span>Args</span>
                <input
                  className="settings-input"
                  value={argsText}
                  onChange={(e) => setField("argsText", e.target.value)}
                  placeholder="/path/to/dir"
                  autoComplete="off"
                  disabled={writeLocked}
                />
              </label>
              <span className="mcp-field-label">Environment</span>
              {envRows.map((row, i) => (
                <div className="mcp-kv" key={`env-${i}`}>
                  <input
                    className="settings-input"
                    value={row.key}
                    placeholder="ENV_KEY"
                    autoComplete="off"
                    disabled={writeLocked}
                    onChange={(e) => {
                      const next = [...envRows];
                      next[i] = { ...row, key: e.target.value };
                      setField("envRows", next);
                    }}
                  />
                  <input
                    className="settings-input"
                    type="password"
                    value={row.value}
                    placeholder={editingName ? "leave blank to drop" : "value"}
                    autoComplete="off"
                    disabled={writeLocked}
                    onChange={(e) => {
                      const next = [...envRows];
                      next[i] = { ...row, value: e.target.value };
                      setField("envRows", next);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={writeLocked || envRows.length === 1}
                    aria-label="Remove env row"
                    onClick={() =>
                      setField(
                        "envRows",
                        envRows.filter((_, idx) => idx !== i),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-sm mcp-add-row"
                disabled={writeLocked}
                onClick={() =>
                  setField("envRows", [...envRows, { key: "", value: "" }])
                }
              >
                Add env
              </button>
            </>
          ) : (
            <>
              <label className="mcp-field">
                <span>URL</span>
                <input
                  className="settings-input"
                  value={url}
                  onChange={(e) => setField("url", e.target.value)}
                  placeholder="https://mcp.example.com/mcp"
                  autoComplete="off"
                  disabled={writeLocked}
                />
              </label>
              <span className="mcp-field-label">Headers</span>
              {headerRows.map((row, i) => (
                <div className="mcp-kv" key={`hdr-${i}`}>
                  <input
                    className="settings-input"
                    value={row.key}
                    placeholder="Header"
                    autoComplete="off"
                    disabled={writeLocked}
                    onChange={(e) => {
                      const next = [...headerRows];
                      next[i] = { ...row, key: e.target.value };
                      setField("headerRows", next);
                    }}
                  />
                  <input
                    className="settings-input"
                    type="password"
                    value={row.value}
                    placeholder={editingName ? "leave blank to drop" : "value"}
                    autoComplete="off"
                    disabled={writeLocked}
                    onChange={(e) => {
                      const next = [...headerRows];
                      next[i] = { ...row, value: e.target.value };
                      setField("headerRows", next);
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={writeLocked || headerRows.length === 1}
                    aria-label="Remove header row"
                    onClick={() =>
                      setField(
                        "headerRows",
                        headerRows.filter((_, idx) => idx !== i),
                      )
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-sm mcp-add-row"
                disabled={writeLocked}
                onClick={() =>
                  setField("headerRows", [
                    ...headerRows,
                    { key: "", value: "" },
                  ])
                }
              >
                Add header
              </button>
            </>
          )}
          <label className="mcp-check">
            <input
              type="checkbox"
              checked={projectScope && hasProject}
              disabled={writeLocked || !hasProject}
              onChange={(e) => setField("projectScope", e.target.checked)}
            />
            <span>
              Project scope (<code>.grok/config.toml</code>
              {hasProject ? "" : " — open a project first"})
            </span>
          </label>
          {note ? (
            <span className="settings-desc settings-note">{note}</span>
          ) : null}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn ghost"
            disabled={writeLocked}
            onClick={() => resetForm()}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={writeLocked}
            onClick={() => void onAdd()}
          >
            {restarting
              ? "Restarting…"
              : writeBusy
                ? "Working…"
                : editingName
                  ? "Save"
                  : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
