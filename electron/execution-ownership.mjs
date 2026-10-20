import { randomUUID } from 'node:crypto';

export const chatKey = (cwd, id) => `${(process.platform==='win32'?String(cwd).replace(/\\/g, '/').replace(/\/$/, '').toLowerCase():String(cwd).replace(/\/$/, ''))}\0${id}`;

/** Window is a presentation host; records are execution owners with stable identity. */
export function createExecutionHost(win, createRecord) {
  const host = { win, records: new Map(), selected: null, closed: false, settingsOpen:false, pendingOpenCwd:null };
  host.create = () => {
    const record = createRecord(win);
    Object.assign(record, { host, recordId: randomUUID(), readOnly: false, unseen: false, runtimeStatus: 'idle' });
    for(const key of ['settingsOpen','pendingOpenCwd'])Object.defineProperty(record,key,{enumerable:true,configurable:true,get:()=>host[key],set:value=>{host[key]=value;}});
    host.records.set(record.recordId, record);
    return record;
  };
  host.selected = host.create();
  // Compatibility facade for window menu and platform integrations. Callbacks always capture a record.
  for (const key of Object.keys(host.selected)) {
    if (['win', 'host'].includes(key) || key in host) continue;
    Object.defineProperty(host, key, { enumerable: true, get: () => host.selected[key], set: value => { host.selected[key] = value; } });
  }
  return host;
}

export function executionScope(record) { return { recordId: record.recordId, generation: record.generation, sessionId: record.agent?.sessionId || record.lastSessionId }; }

export function resolveOwnedExecution(host, scope) {
  if (!host || host.closed) throw Error('Window closed');
  if (!scope) return host.selected;
  const record = host.records.get(scope.recordId);
  if (!record || record.disposed || record.generation !== scope.generation || (scope.sessionId && scope.sessionId !== (record.agent?.sessionId || record.lastSessionId))) throw Error('Stale or foreign chat');
  return record;
}

export function findExecution(hosts, cwd, sessionId) {
  if (!sessionId) return null;
  for (const host of hosts) for (const record of host.records?.values() || []) {
    if (!record.disposed && chatKey(record.agent?.cwd || record.lastCwd, record.agent?.sessionId || record.lastSessionId) === chatKey(cwd, sessionId)) return record;
  }
  return null;
}
