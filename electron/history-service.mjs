import { createWorkerClient } from "./worker-client.mjs";
import { Worker } from "node:worker_threads";
import path from "node:path";
import fs from "node:fs";
import {
  readPreferences,
  writePreferences,
  historyIdentity,
} from "./history-core.mjs";

export function installHistoryIpc({ ipcMain, app, BrowserWindow, dialog }) {
  const file = path.join(app.getPath("userData"), "history-preferences.json");
  const client = createWorkerClient({
    createWorker: () =>
      new Worker(new URL("./history-worker.mjs", import.meta.url), {
        workerData: {
          cache: path.join(app.getPath("userData"), "history-index.json"),
        },
      }),
    onEvent: (message) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed())
          win.webContents.send("history:progress", message.progress);
      }
    },
    stoppedMessage: "History worker stopped",
  });
  const { call } = client;
  ipcMain.handle("history:catalog", async () => {
    const sessions = await call("catalog");
    const prefs = readPreferences(file);
    const keys = new Set(sessions.map((s) => s.key));
    const pinned = prefs.pinned.filter((key) => keys.has(key));
    if (pinned.length !== prefs.pinned.length) {
      prefs.pinned = pinned;
      writePreferences(file, prefs);
    }
    return { sessions, ...prefs };
  });
  ipcMain.handle("history:search", (_e, args) => call("search", args));
  ipcMain.handle("history:window", (_e, args) => call("window", args));
  ipcMain.handle("history:pin", async (_e, { cwd, sessionId, pinned }) => {
    const rows = await call("catalog");
    const key = historyIdentity(cwd, sessionId);
    if (!rows.some((s) => s.key === key)) throw Error("Chat not found");
    const prefs = readPreferences(file);
    prefs.pinned = prefs.pinned.filter((k) => k !== key);
    if (pinned) prefs.pinned.push(key);
    writePreferences(file, prefs);
    return prefs;
  });
  ipcMain.handle(
    "history:archive",
    async (_e, { cwd, sessionId, archived }) => {
      const rows = await call("catalog"),
        key = historyIdentity(cwd, sessionId);
      if (!rows.some((s) => s.key === key)) throw Error("Chat not found");
      const prefs = readPreferences(file);
      prefs.archived = prefs.archived.filter((k) => k !== key);
      if (archived) prefs.archived.push(key);
      writePreferences(file, prefs);
      return prefs;
    },
  );
  ipcMain.handle("history:export", async (e, args) => {
    const markdown = await call("export", args);
    const result = await dialog.showSaveDialog(
      BrowserWindow.fromWebContents(e.sender),
      {
        title: "Export conversation",
        defaultPath: "Grok conversation.md",
        filters: [{ name: "Markdown", extensions: ["md"] }],
      },
    );
    if (!result.canceled && result.filePath)
      await fs.promises.writeFile(result.filePath, markdown, "utf8");
    return result;
  });
  ipcMain.handle("history:collapse", (_e, { cwd, collapsed }) => {
    const prefs = readPreferences(file);
    prefs.collapsed = prefs.collapsed.filter((k) => k !== cwd);
    if (collapsed) prefs.collapsed.push(cwd);
    writePreferences(file, prefs);
    return prefs;
  });
  app.on("will-quit", client.close);
}
