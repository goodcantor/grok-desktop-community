import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Ordinary working files live here; ~/.grok remains the engine's data store. */
export function ensureDefaultWorkspace(home = os.homedir()) {
  const cwd = path.join(home, "Grok");
  fs.mkdirSync(cwd, { recursive: true });
  return cwd;
}
