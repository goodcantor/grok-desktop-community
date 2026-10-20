import path from "node:path";
import { listLinkedWorktreeRoots, checkoutKey } from "../git-worktrees.mjs";
import { assertPathInProject } from "../path-safety.mjs";

/** Folder selection does not grant renderer file access; project-files.mjs enforces that gate. */
export function registerWorkspaceRootsIpc({
  ipcMain,
  dialog,
  BrowserWindow,
  sessionFromEvent,
}) {
  ipcMain.handle("files:roots", (event) => {
    const cwd = sessionFromEvent(event)?.agent?.cwd;
    if (!cwd) return { roots: [] };
    const unique = new Map(
      [cwd, ...listLinkedWorktreeRoots(cwd)].map((root) => [
        checkoutKey(root),
        root,
      ]),
    );
    return {
      roots: [...unique.values()].map((root) => ({
        path: root,
        label:
          checkoutKey(root) === checkoutKey(cwd)
            ? "Project"
            : path.basename(root),
      })),
    };
  });
  ipcMain.handle("files:pick-root", async (event) => {
    const cwd = sessionFromEvent(event)?.agent?.cwd;
    if (!cwd) throw new Error("No project open");
    const result = await dialog.showOpenDialog(
      BrowserWindow.fromWebContents(event.sender),
      { properties: ["openDirectory"], defaultPath: cwd },
    );
    return result.canceled
      ? null
      : assertPathInProject(cwd, result.filePaths[0]);
  });
}
