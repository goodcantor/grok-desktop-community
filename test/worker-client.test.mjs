import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createWorkerClient } from "../electron/worker-client.mjs";

class FakeWorker extends EventEmitter {
  messages = [];
  terminated = false;
  postMessage(message) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
    return Promise.resolve(0);
  }
  reply(index, result) {
    this.emit("message", { id: this.messages[index].id, result });
  }
}

test("worker requests correlate replies and keep progress separate", async () => {
  const worker = new FakeWorker(),
    events = [];
  const client = createWorkerClient({
    createWorker: () => worker,
    onEvent: (event) => events.push(event),
  });
  const first = client.call("catalog"),
    second = client.call("search", { query: "hello" });
  assert.deepEqual(worker.messages[1].args, { query: "hello" });
  worker.emit("message", { event: "progress", progress: { done: 2 } });
  worker.reply(1, "second");
  worker.reply(0, "first");
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  assert.equal(events.length, 1);
  const failed = client.call("bad");
  worker.emit("message", { id: worker.messages[2].id, error: "Invalid query" });
  await assert.rejects(failed, /Invalid query/);
  client.close();
});

test("late events from a failed worker cannot invalidate its replacement", async () => {
  const workers = [],
    progress = [];
  const client = createWorkerClient({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    onEvent: (event) => progress.push(event),
  });
  const old = client.call("first");
  workers[0].emit("error", new Error("crashed"));
  await assert.rejects(old, /crashed/);
  const next = client.call("next");
  workers[0].emit("exit", 1);
  workers[0].emit("error", new Error("late error"));
  workers[0].emit("message", { event: "progress" });
  workers[0].emit("message", {
    id: workers[1].messages[0].id,
    result: "obsolete",
  });
  workers[1].reply(0, "current");
  assert.equal(await next, "current");
  assert.equal(progress.length, 0);
  client.close();
});

test("clean exit rejects every pending request; shutdown is final and idempotent", async () => {
  const workers = [];
  const client = createWorkerClient({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
    stoppedMessage: "History worker stopped",
  });
  const first = client.call("a"),
    second = client.call("b");
  workers[0].emit("exit", 0);
  await Promise.all([
    assert.rejects(first, /History worker stopped/),
    assert.rejects(second, /History worker stopped/),
  ]);
  const pending = client.call("c");
  client.close();
  client.close();
  await assert.rejects(pending, /History worker stopped/);
  await assert.rejects(client.call("d"), /History worker stopped/);
  assert.equal(workers.length, 2);
  assert.equal(workers[1].terminated, true);
});

test("construction and serialization failures do not leave pending requests", async () => {
  const worker = new FakeWorker();
  let attempt = 0;
  const client = createWorkerClient({
    createWorker: () => {
      if (++attempt === 1) throw new Error("Cannot start");
      return worker;
    },
  });
  await assert.rejects(client.call("a"), /Cannot start/);
  worker.postMessage = () => {
    throw new Error("Cannot clone");
  };
  await assert.rejects(client.call("b"), /Cannot clone/);
  worker.postMessage = FakeWorker.prototype.postMessage;
  const valid = client.call("c");
  worker.reply(0, "ok");
  assert.equal(await valid, "ok");
  client.close();
});
