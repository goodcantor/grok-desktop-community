/** Request/reply lifecycle shared by the history and usage workers. No Electron dependency. */
export function createWorkerClient({
  createWorker,
  onEvent = () => {},
  stoppedMessage = "Worker stopped",
}) {
  let worker = null;
  let sequence = 0;
  let closed = false;
  const pending = new Map();

  function retire(current, error) {
    if (worker !== current) return;
    worker = null;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  }

  function getWorker() {
    if (closed) throw new Error(stoppedMessage);
    if (worker) return worker;
    const current = createWorker();
    worker = current;
    current.on("message", (message) => {
      // An old worker can emit exit/error after its replacement has started.
      if (worker !== current) return;
      if (message.event) return onEvent(message);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error));
      else request.resolve(message.result);
    });
    current.on("error", (error) => retire(current, error));
    current.on("exit", () => retire(current, new Error(stoppedMessage)));
    return current;
  }

  function call(method, args) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      try {
        getWorker().postMessage({ id, method, args });
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  }

  function close() {
    if (closed) return;
    closed = true;
    const current = worker;
    // Reject immediately: Electron shutdown must not depend on an exit event.
    retire(current, new Error(stoppedMessage));
    void current?.terminate();
  }

  return { call, close };
}
