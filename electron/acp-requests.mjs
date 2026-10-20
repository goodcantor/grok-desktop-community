/** ACP control calls are bounded; a prompt lasts until the agent replies or exits.
 * A local deadline cannot establish that an agent turn has stopped.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export function sendAcpRequest(client, method, params = {}, opts = {}) {
  if (method === 'session/prompt' && [...client.pending.values()].some(p => p.method === method)) {
    return Promise.reject(new Error('Grok is still working on the current turn. Use Queue, Steer or Stop.'));
  }
  const id = client.nextId++;
  const timeoutMs = opts.timeoutMs ?? (method === 'session/prompt' ? 0 : DEFAULT_REQUEST_TIMEOUT_MS);
  return new Promise((resolve, reject) => {
    const timer = timeoutMs > 0 ? setTimeout(() => {
      if (!client.pending.has(id)) return;
      client.pending.delete(id);
      reject(new Error(`ACP request timed out after ${timeoutMs}ms: ${method}`));
    }, timeoutMs) : null;
    const now = Date.now();
    client.pending.set(id, { resolve, reject, timer, method, sessionId: params.sessionId, startedAt: now, lastActivityAt: now });
    try {
      client._write({ jsonrpc: '2.0', id, method, params });
    } catch (err) {
      if (timer) clearTimeout(timer);
      client.pending.delete(id);
      reject(err);
    }
  });
}

export function notePromptActivity(client, sessionId) {
  for (const p of client.pending.values()) {
    if (p.method === 'session/prompt' && (!sessionId || p.sessionId === sessionId)) p.lastActivityAt = Date.now();
  }
}

export function notePromptCancellation(client) {
  for (const p of client.pending.values()) {
    if (p.method === 'session/prompt') p.cancelRequestedAt ??= Date.now();
  }
}

/** Metadata only: never include prompts, command arguments or tool output. */
export function promptRunState(client) {
  const p = [...client.pending.values()].find(p => p.method === 'session/prompt');
  return {
    sessionId: client.sessionId || null,
    active: Boolean(p),
    connected: Boolean(client.ready && client.proc && !client.proc.killed),
    startedAt: p?.startedAt ?? null,
    lastActivityAt: p?.lastActivityAt ?? null,
    cancelRequestedAt: p?.cancelRequestedAt ?? null,
    waitingPermissions: client._openPermissionGates?.size || 0,
  };
}
