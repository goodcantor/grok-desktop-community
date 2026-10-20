import { parentPort, workerData } from "node:worker_threads";
import fs from "node:fs";
import path from "node:path";
import { catalogHistory, sessionFiles } from "./history-core.mjs";
import { readUsageSession, aggregateUsage } from "./usage-core.mjs";
let cached = {};
try {
  const raw = JSON.parse(fs.readFileSync(workerData.cache, "utf8"));
  if (raw.version === 2) cached = raw.sessions || {};
} catch {}
let queue = Promise.resolve();
parentPort.on("message", (message) => {
  queue = queue.then(async () => {
    try {
      const catalog = catalogHistory(),
        next = {},
        rows = [];
      for (let i = 0; i < catalog.length; i++) {
        const row = catalog[i],
          f = sessionFiles(row.cwd, row.id),
          stamp = [
            f.updates,
            path.join(f.dir, "usage.json"),
            path.join(f.dir, "chat_history.jsonl"),
          ]
            .map((p) => {
              try {
                const s = fs.statSync(p);
                return `${s.size}:${s.mtimeMs}`;
              } catch {
                return "-";
              }
            })
            .join("|");
        const hit = cached[row.key];
        const record =
          hit?.stamp === stamp && Array.isArray(hit.record?.turns)
            ? { ...hit.record, ...row }
            : readUsageSession(row);
        next[row.key] = { stamp, record };
        rows.push(record);
        parentPort.postMessage({
          event: "progress",
          progress: { done: i + 1, total: catalog.length },
        });
        await new Promise((r) => setImmediate(r));
      }
      cached = next;
      try {
        fs.mkdirSync(path.dirname(workerData.cache), { recursive: true });
        const tmp = workerData.cache + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify({ version: 2, sessions: next }));
        fs.renameSync(tmp, workerData.cache);
      } catch {
        /* The cache is disposable; its write failure must not hide recorded usage. */
      }
      parentPort.postMessage({
        id: message.id,
        result: aggregateUsage(rows, message.args),
      });
    } catch (error) {
      parentPort.postMessage({ id: message.id, error: error.message });
    }
  });
});
