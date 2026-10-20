import fs from 'node:fs';
import path from 'node:path';
import { grokHomeDir } from './grok-home.mjs';
import { listSessionsForCwd, isSafeSessionId, sessionsRootForCwd } from './sessions.mjs';
import { applySessionUpdate } from '../shared/session-timeline.mjs';

export function historyIdentity(cwd, id) { return `${path.resolve(cwd)}\0${id}`; }
export function sessionFiles(cwd, id) {
  if (typeof cwd !== 'string' || !path.isAbsolute(cwd) || !isSafeSessionId(id)) throw new Error('Invalid history reference');
  const root = sessionsRootForCwd(cwd);
  const dir = path.join(root, id);
  for (const p of [root, dir]) {
    if (!fs.existsSync(p) || fs.lstatSync(p).isSymbolicLink()) throw new Error('Chat not found');
  }
  const updates = path.join(dir, 'updates.jsonl');
  const summary = path.join(dir, 'summary.json');
  for (const p of [updates, summary]) if (fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error('Linked history is not supported');
  return {dir, updates, summary};
}
export function catalogHistory() {
  const root = path.join(grokHomeDir(), 'sessions');
  if (!fs.existsSync(root)) return [];
  const rows = [];
  for (const ent of fs.readdirSync(root, {withFileTypes:true})) {
    if (!ent.isDirectory()) continue;
    try {
      const cwd = decodeURIComponent(ent.name);
      if (!path.isAbsolute(cwd) || path.basename(sessionsRootForCwd(cwd)) !== ent.name) continue;
      for (const row of listSessionsForCwd(cwd, {limit:Number.MAX_SAFE_INTEGER})) {
        sessionFiles(cwd, row.id);
        rows.push({...row, cwd, key:historyIdentity(cwd,row.id), available:fs.existsSync(cwd)});
      }
    } catch { /* unsupported/corrupt project folders cannot break the catalog */ }
  }
  return rows.sort((a,b) => (Date.parse(b.lastActiveAt || '')||0)-(Date.parse(a.lastActiveAt || '')||0));
}
export function readFullHistory(cwd, id) {
  const {updates} = sessionFiles(cwd,id);
  if (!fs.existsSync(updates)) return [];
  let items = [];
  for (const line of fs.readFileSync(updates,'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const row=JSON.parse(line); items=applySessionUpdate(items,row.params||row); } catch { /* incomplete append, retry on next refresh */ }
  }
  let ordinal=0;
  return items.map(item => ['user','assistant'].includes(item.kind) ? {...item,historyOrdinal:ordinal++} : item);
}
export function historyWindow(cwd,id,{ordinal,start,count=140}={}) {
  const all=readFullHistory(cwd,id);
  count=Math.max(20,Math.min(200,Number(count)||140));
  const target=Number.isInteger(ordinal)?all.findIndex(item=>item.historyOrdinal===ordinal):-1;
  const first=Math.max(0,Math.min(all.length,Number.isInteger(start)?start:target>=0?target-50:all.length-count));
  const end=Math.min(all.length,first+count);
  return {items:all.slice(first,end),start:first,end,total:all.length,focusOrdinal:target>=0?ordinal:null};
}
export function fingerprint(cwd,id) {
  const files=sessionFiles(cwd,id);
  return [files.updates,files.summary].map(file=>{try{const s=fs.statSync(file);return `${s.size}:${s.mtimeMs}`;}catch{return 'missing';}}).join('|');
}
export function readPreferences(file) {
  try {const raw=JSON.parse(fs.readFileSync(file,'utf8'));return {pinned:Array.isArray(raw.pinned)?raw.pinned.filter(x=>typeof x==='string'):[],collapsed:Array.isArray(raw.collapsed)?raw.collapsed.filter(x=>typeof x==='string'):[],archived:Array.isArray(raw.archived)?raw.archived.filter(x=>typeof x==='string'):[]};}
  catch {return {pinned:[],collapsed:[],archived:[]};}
}
export function writePreferences(file,prefs) {
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const tmp=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify(prefs),'utf8');fs.renameSync(tmp,file);
}
