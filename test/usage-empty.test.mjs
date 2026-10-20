import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Worker } from "node:worker_threads";
import {
  normalizeUsage,
  usageFromEvents,
  readUsageSession,
  aggregateUsage,
} from "../electron/usage-core.mjs";
import { createWorkerClient } from "../electron/worker-client.mjs";

const emptyMetrics = () => normalizeUsage(null);
function cleanup(root) {
  const resolved = path.resolve(root);
  assert.ok(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith("grok-usage-empty-"),
  );
  fs.rmSync(resolved, { recursive: true, force: true });
}
function fixture(home, cwd) {
  const id = "usage-session-001",
    dir = path.join(home, "sessions", encodeURIComponent(cwd), id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "summary.json"),
    JSON.stringify({
      info: { cwd },
      generated_title: "Usage fixture",
      last_active_at: new Date().toISOString(),
    }),
  );
  fs.writeFileSync(path.join(dir, "updates.jsonl"), "");
  fs.writeFileSync(
    path.join(dir, "chat_history.jsonl"),
    JSON.stringify({
      type: "user",
      synthetic_reason: "context",
      content: "initial context",
    }),
  );
  return {
    row: { cwd, id, key: `${cwd}\0${id}`, title: "Usage fixture" },
    dir,
  };
}

test("null usage preserves a completed response without inventing zero metrics", () => {
  assert.equal(emptyMetrics().totalTokens, null);
  const turns = usageFromEvents(
    JSON.stringify({
      timestamp: 1700000000,
      update: { sessionUpdate: "turn_completed", promptId: "one", usage: null },
    }),
  );
  assert.equal(turns.length, 1);
  assert.equal(turns[0].partial, true);
  assert.equal(turns[0].totalTokens, null);
  assert.equal(normalizeUsage({ inputTokens: -1 }).inputTokens, null);
});

test("empty sessions are distinct from conversations with missing usage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "grok-usage-empty-")),
    old = process.env.GROK_HOME;
  process.env.GROK_HOME = path.join(root, "home");
  try {
    const cwd = path.join(root, "project"),
      { row, dir } = fixture(process.env.GROK_HOME, cwd);
    assert.equal(readUsageSession(row).source, "empty");
    const empty = aggregateUsage([readUsageSession(row)]);
    assert.equal(empty.unavailable, 0);
    assert.equal(empty.partial, false);
    assert.equal(empty.totals.totalTokens, null);
    fs.appendFileSync(
      path.join(dir, "chat_history.jsonl"),
      "\n" + JSON.stringify({ type: "user", content: "real question" }),
    );
    assert.equal(readUsageSession(row).source, "unavailable");
    assert.equal(aggregateUsage([readUsageSession(row)]).unavailable, 1);
  } finally {
    if (old === undefined) delete process.env.GROK_HOME;
    else process.env.GROK_HOME = old;
    cleanup(root);
  }
});

test("model cost completeness is independent of optional token fields", () => {
  const turn = {
    ...normalizeUsage({
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120,
      costUsdTicks: 10000000000,
    }),
    id: "one",
    endedAt: new Date().toISOString(),
  };
  const row = {
    cwd: process.cwd(),
    id: "session",
    title: "Session",
    source: "native",
    turns: [turn],
  };
  const known = aggregateUsage([row]);
  assert.equal(known.partial, true);
  assert.equal(known.costPartial, false);
  assert.equal(known.totals.costUsdTicks, 10000000000);
  const mixed = aggregateUsage([
    { ...row, turns: [turn, { ...turn, id: "two", costUsdTicks: null }] },
  ]);
  assert.equal(mixed.costPartial, true);
  assert.equal(mixed.totals.costUsdTicks, 10000000000);
  assert.deepEqual(mixed.coverage.costUsdTicks, { known: 1, total: 2 });
  const free = aggregateUsage([
    { ...row, turns: [{ ...turn, costUsdTicks: 0 }] },
  ]);
  assert.equal(free.totals.costUsdTicks, 0);
  assert.equal(free.costPartial, false);
});

test("usage worker rebuilds old cache, refreshes chat metadata and survives cache write failure", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "grok-usage-empty-")),
    home = path.join(root, "home"),
    cwd = path.join(root, "project");
  const { dir } = fixture(home, cwd),
    cache = path.join(root, "cache.json");
  fs.writeFileSync(
    cache,
    JSON.stringify({ version: 1, sessions: { corrupt: { record: {} } } }),
  );
  const client = (file) =>
    createWorkerClient({
      createWorker: () =>
        new Worker(new URL("../electron/usage-worker.mjs", import.meta.url), {
          workerData: { cache: file },
          env: { ...process.env, GROK_HOME: home },
        }),
    });
  let rpc = client(cache);
  try {
    const empty = await rpc.call("query", {});
    assert.equal(empty.unavailable, 0);
    assert.equal(JSON.parse(fs.readFileSync(cache, "utf8")).version, 2);
    fs.appendFileSync(
      path.join(dir, "chat_history.jsonl"),
      "\n" + JSON.stringify({ type: "user", content: "real question" }),
    );
    assert.equal((await rpc.call("query", {})).unavailable, 1);
    const usage = {
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      costUsdTicks: 200,
    };
    fs.writeFileSync(
      path.join(dir, "usage.json"),
      JSON.stringify({
        session: usage,
        turns: [{ ...usage, turnNumber: 1, endedAt: new Date().toISOString() }],
      }),
    );
    assert.equal((await rpc.call("query", {})).totals.totalTokens, 15);
    rpc.close();
    const unwritable = path.join(root, "directory-not-file");
    fs.mkdirSync(unwritable);
    rpc = client(unwritable);
    assert.equal((await rpc.call("query", {})).totals.totalTokens, 15);
  } finally {
    rpc.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    cleanup(root);
  }
});
