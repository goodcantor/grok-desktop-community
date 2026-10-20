import { summarizeMcpDoctorDetail } from "../../../../shared/mcp-status.mjs";
import { testHeadline, type TestView } from "./view-model";

export function McpTestPanel({
  view,
  onAuth,
  authBusy,
  authDisabled,
}: {
  view: TestView;
  onAuth?: () => void;
  authBusy?: boolean;
  authDisabled?: boolean;
}) {
  const tools = view.tools || [];
  return (
    <div
      className={`mcp-test${
        view.status === "ok"
          ? " mcp-test-ok"
          : view.status === "fail"
            ? " mcp-test-fail"
            : ""
      }`}
    >
      <div
        className={`mcp-test-title${
          view.status === "ok" ? " ok" : view.status === "fail" ? " fail" : ""
        }`}
      >
        {testHeadline(view)}
      </div>
      {view.checks && view.checks.length > 0 ? (
        <ul className="mcp-checks">
          {view.checks.map((check) => {
            const detail = check.passed
              ? check.detail
              : summarizeMcpDoctorDetail(check.detail);
            return (
              <li key={check.label}>
                <span
                  className={check.passed ? "mcp-check-pass" : "mcp-check-fail"}
                >
                  {check.passed ? "✓" : "✗"}
                </span>{" "}
                {check.label}
                {detail ? ` (${detail})` : ""}
              </li>
            );
          })}
        </ul>
      ) : view.error ? (
        <p className="mcp-test-error">
          {summarizeMcpDoctorDetail(view.error) || view.error}
        </p>
      ) : null}
      {onAuth ? (
        <div className="mcp-actions mcp-test-actions">
          <button
            type="button"
            className="btn btn-sm"
            disabled={authBusy || authDisabled}
            title={
              authDisabled
                ? "Open a project first so the live agent can open the browser"
                : undefined
            }
            onClick={onAuth}
          >
            {authBusy ? "Signing in…" : "Sign in with browser"}
          </button>
        </div>
      ) : null}
      {tools.length > 0 ? (
        <div className="mcp-tools" aria-label="Discovered tools">
          {tools.map((tool) => (
            <span className="mcp-tool" key={tool}>
              {tool}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
