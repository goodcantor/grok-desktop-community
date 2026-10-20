import { Worker } from "node:worker_threads";
import path from "node:path";
import { createWorkerClient } from "./worker-client.mjs";

export function installUsageIpc({
  ipcMain,
  app,
  BrowserWindow,
  sessionFromEvent,
}) {
  const client = createWorkerClient({
    createWorker: () =>
      new Worker(new URL("./usage-worker.mjs", import.meta.url), {
        workerData: {
          cache: path.join(app.getPath("userData"), "usage-cache.json"),
        },
      }),
    onEvent: (message) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed())
          win.webContents.send("usage:progress", message.progress);
      }
    },
    stoppedMessage: "Usage worker stopped",
  });
  ipcMain.handle("usage:query", (_e, args) => client.call("query", args));

  let billing = null;
  let lastBilling = 0;
  let inflight = null;
  ipcMain.handle("usage:billing", async (event) => {
    if (billing && Date.now() - lastBilling < 60_000)
      return { ...billing, observedAt: lastBilling };
    if (inflight) return inflight;
    const agent = sessionFromEvent(event)?.agent;
    if (!agent)
      return {
        error: "Engine unavailable",
        ...billing,
        observedAt: lastBilling || null,
      };
    inflight = (async () => {
      try {
        billing = await agent.request(
          "_x.ai/billing",
          {},
          { timeoutMs: 20_000 },
        );
        lastBilling = Date.now();
        return { ...billing, observedAt: lastBilling };
      } catch (error) {
        return {
          ...billing,
          error: error.message,
          observedAt: lastBilling || null,
        };
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  });
  app.on("will-quit", client.close);
}
