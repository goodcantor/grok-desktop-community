import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { registerProjectFilesIpc } from "../electron/ipc/project-files.mjs";
import { registerWorkspaceRootsIpc } from "../electron/ipc/workspace-roots.mjs";

test("renderer file/editor handlers remain project scoped even when agent outside access is enabled", async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "grok-ipc-files-"));
  try {
    const root = path.join(temp, "project"),
      outside = path.join(temp, "outside");
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    const insideFile = path.join(root, "hello.txt"),
      outsideFile = path.join(outside, "private.txt");
    fs.writeFileSync(insideFile, "original");
    fs.writeFileSync(outsideFile, "private");
    fs.writeFileSync(path.join(root, ".hidden"), "hidden");
    fs.symlinkSync(
      outside,
      path.join(root, "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const handlers = new Map(),
      opened = [];
    let state = { allowOutsideProject: true, externalEditor: "auto" };
    registerProjectFilesIpc({
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      sessionFromEvent: (event) =>
        event.project ? { agent: { cwd: root } } : null,
      loadState: () => state,
      saveState: (next) => {
        state = next;
      },
      shell: { showItemInFolder: (file) => opened.push(file) },
      getEditors: () => [{ id: "code", label: "VS Code", available: true }],
      openEditor: (file) => {
        opened.push(file);
        return { ok: true };
      },
    });
    const invoke = (name, ...args) =>
      handlers.get(name)({ project: true }, ...args);
    let chosen = { canceled: false, filePaths: [root] };
    registerWorkspaceRootsIpc({
      ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
      sessionFromEvent: () => ({ agent: { cwd: root } }),
      BrowserWindow: { fromWebContents: () => null },
      dialog: { showOpenDialog: async () => chosen },
    });
    assert.deepEqual(await invoke("files:roots"), {
      roots: [{ path: root, label: "Project" }],
    });
    assert.equal(await invoke("files:pick-root"), root);
    chosen = { canceled: false, filePaths: [outside] };
    await assert.rejects(() => invoke("files:pick-root"));
    chosen = { canceled: true, filePaths: [] };
    assert.equal(await invoke("files:pick-root"), null);
    assert.equal((await invoke("fs:read-file", insideFile)).text, "original");
    await invoke("fs:write-file", "hello.txt", "saved");
    assert.equal(fs.readFileSync(insideFile, "utf8"), "saved");
    const entries = await invoke("fs:list-dir", root);
    assert.equal(
      entries.some((entry) => entry.name === ".hidden"),
      false,
    );
    assert.equal(
      entries.find((entry) => entry.name === "escape").isDirectory,
      false,
    );
    for (const allowOutsideProject of [false, true]) {
      state.allowOutsideProject = allowOutsideProject;
      for (const name of [
        "fs:read-file",
        "fs:write-file",
        "fs:list-dir",
        "shell:open-path",
        "shell:open-editor",
        "shell:show-item",
      ]) {
        await assert.rejects(async () =>
          invoke(name, outsideFile, "overwritten"),
        );
        await assert.rejects(async () =>
          invoke(name, path.join(root, "escape", "private.txt"), "overwritten"),
        );
      }
      await assert.rejects(() => invoke("git:branch", outside));
    }
    assert.equal(fs.readFileSync(outsideFile, "utf8"), "private");
    assert.deepEqual(opened, []);
    await invoke("shell:open-editor", insideFile);
    await invoke("shell:show-item", insideFile);
    assert.deepEqual(opened, [insideFile, insideFile]);
    assert.equal((await invoke("editor:list")).resolved, "code");
    assert.equal(
      (await invoke("app:set-external-editor", "code")).preferred,
      "code",
    );
    await assert.rejects(
      () => handlers.get("fs:read-file")({}, insideFile),
      /No project open/,
    );
  } finally {
    const resolved = path.resolve(temp);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("grok-ipc-files-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
