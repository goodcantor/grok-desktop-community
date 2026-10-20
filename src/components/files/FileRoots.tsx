import { useEffect, useState } from "react";
import { usePrivacy } from "../../lib/privacy-context";

/** Show roots the renderer can actually browse, rather than inaccessible host drives. */
export function FileRoots({
  project,
  onNavigate,
}: {
  project: string | null;
  onNavigate: (path: string) => void;
}) {
  const { redact } = usePrivacy();
  const [roots, setRoots] = useState<{ path: string; label: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setRoots([]);
    setError("");
    void window.grokDesktop
      .fileRoots()
      .then((result) => {
        if (current) setRoots(result.roots);
      })
      .catch((error) => {
        if (current) setError(String(error));
      });
    return () => {
      current = false;
    };
  }, [project]);
  async function pick() {
    setError("");
    try {
      const folder = await window.grokDesktop.pickFileRoot();
      if (folder) onNavigate(folder);
    } catch {
      setError("Choose a folder inside this project or a linked worktree.");
    }
  }
  return (
    <div className="files-root-nav">
      {roots.map((root) => (
        <button
          key={root.path}
          className="btn"
          title={redact(root.path)}
          onClick={() => onNavigate(root.path)}
        >
          {root.label}
        </button>
      ))}
      <button className="btn" disabled={!project} onClick={() => void pick()}>
        Choose folder…
      </button>
      {error && (
        <span className="files-root-error" role="status">
          {redact(error)}
        </span>
      )}
    </div>
  );
}
