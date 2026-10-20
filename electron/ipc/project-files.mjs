import fs from "node:fs";
import path from "node:path";
import { assertPathInProject, isPathInProject } from "../path-safety.mjs";
import { readFileForEdit, writeFileForEdit } from "../fs-content.mjs";
import { getGitBranch, getGitDiff, getGitStatus } from "../git-info.mjs";
import {
  listEditors,
  normalizeExternalEditor,
  openInEditor,
} from "../open-editor.mjs";

/** Renderer file/editor IPC always stays inside the owning project's path gate. */
export function registerProjectFilesIpc({
  ipcMain,
  sessionFromEvent,
  shell,
  loadState,
  saveState,
  getEditors = listEditors,
  openEditor = openInEditor,
}) {
  function editorCatalog(value) {
    const preferred = normalizeExternalEditor(value);
    const editors = getEditors();
    const resolved =
      editors.find((ed) => ed.id === preferred && ed.available) ||
      editors.find((ed) => ed.available && !ed.lastResort) ||
      editors.find((ed) => ed.available) ||
      null;
    return {
      preferred,
      resolved: resolved?.id ?? null,
      resolvedLabel: resolved?.label ?? null,
      editors,
    };
  }

  ipcMain.handle("git:branch", async (e, cwd) => {
    const sessionCwd = (sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);
    if (!sessionCwd) return { branch: null, detached: false };
    const root = cwd ? assertPathInProject(sessionCwd, cwd) : sessionCwd;
    return getGitBranch(root);
  });

  ipcMain.handle("git:status", async (e, cwd) => {
    const sessionCwd = (sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);
    if (!sessionCwd) return { files: [] };
    try {
      const root =
        typeof cwd === "string" && cwd
          ? assertPathInProject(sessionCwd, cwd)
          : sessionCwd;
      const [status, branch] = await Promise.all([
        getGitStatus(root),
        getGitBranch(root),
      ]);
      return { ...status, git: Boolean(branch.branch) };
    } catch {
      return { files: [] };
    }
  });

  ipcMain.handle("git:diff", async (e, filePath, opts) => {
    const staged = Boolean(opts && opts.staged);
    const rel = filePath == null ? "" : String(filePath);
    const sessionCwd = (sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);
    if (!sessionCwd || !rel) {
      return { path: rel, staged, diff: null };
    }
    try {
      const safe = assertPathInProject(sessionCwd, rel);
      return getGitDiff(sessionCwd, safe, { staged });
    } catch {
      return { path: rel, staged, diff: null };
    }
  });

  ipcMain.handle("fs:read-file", async (e, filePath) => {
    const root = (sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);
    if (!root) throw new Error("No project open");
    const safe = assertPathInProject(root, filePath);
    return readFileForEdit(safe);
  });

  ipcMain.handle("fs:write-file", async (e, filePath, content) => {
    const root = (sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);
    if (!root) throw new Error("No project open");
    const safe = assertPathInProject(root, filePath);
    await writeFileForEdit(safe, content);
    return { ok: true };
  });

  ipcMain.handle("fs:list-dir", async (e, dirPath) => {
    const root = (sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);
    if (!root) throw new Error("No project open");
    const safe = assertPathInProject(root, dirPath);
    const entries = await fs.promises.readdir(safe, { withFileTypes: true });
    return entries
      .filter((ent) => !ent.name.startsWith("."))
      .slice(0, 200)
      .map((ent) => {
        // Symlink-to-dir is enterable only when the realpath stays in-project.
        let isDirectory = ent.isDirectory();
        if (!isDirectory && ent.isSymbolicLink()) {
          const child = path.join(safe, ent.name);
          try {
            isDirectory =
              fs.statSync(child).isDirectory() && isPathInProject(root, child);
          } catch {
            isDirectory = false;
          }
        }
        return {
          name: ent.name,
          isDirectory,
          path: path.join(safe, ent.name),
        };
      });
  });

  ipcMain.handle("editor:list", () =>
    editorCatalog(loadState().externalEditor),
  );

  ipcMain.handle("app:set-external-editor", (_e, value) => {
    const state = loadState();
    state.externalEditor = normalizeExternalEditor(value);
    saveState(state);
    return editorCatalog(state.externalEditor);
  });

  // Renderer shell helpers are always project-scoped (ignore allowOutsideProject).
  // Open in a real editor — never Launch Services / the default browser.
  ipcMain.handle("shell:open-path", async (e, target) => {
    const root = (sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);
    if (!root) throw new Error("No project open");
    const safe = assertPathInProject(root, target);
    const preference = normalizeExternalEditor(loadState().externalEditor);
    return openEditor(safe, { preference });
  });

  ipcMain.handle("shell:open-editor", async (e, target) => {
    const root = (sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);
    if (!root) throw new Error("No project open");
    const safe = assertPathInProject(root, target);
    const preference = normalizeExternalEditor(loadState().externalEditor);
    return openEditor(safe, { preference });
  });

  ipcMain.handle("shell:show-item", async (e, target) => {
    const root = (sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);
    if (!root) throw new Error("No project open");
    shell.showItemInFolder(assertPathInProject(root, target));
  });
}
