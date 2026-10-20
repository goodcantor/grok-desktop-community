import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
import MiniSearch from 'minisearch';
import {catalogHistory,readFullHistory,historyWindow,fingerprint} from './history-core.mjs';

// Auto-vacuum traverses the mutable term tree asynchronously. Refresh yields
// between sessions and continues adding/discarding documents, so it must own
// vacuuming inside the same serialized operation instead.
const options={fields:['title','text'],storeFields:['key','ordinal','role'],autoVacuum:false};
let index=new MiniSearch(options), stamps={}, documents={}, catalog=[], hydrated=false;
let progress={phase:'idle',done:0,total:0};
const cache=workerData.cache;
function notify(){parentPort.postMessage({event:'progress',progress});}
function hydrate() {
  if(hydrated)return;hydrated=true;
  try {
    const saved=JSON.parse(fs.readFileSync(cache,'utf8'));
    if(saved.version!==1||!saved.stamps||!saved.documents||typeof saved.stamps!=='object'||typeof saved.documents!=='object'||Array.isArray(saved.documents)||Array.isArray(saved.stamps))throw Error('Invalid index');
    const loaded=MiniSearch.loadJSON(JSON.stringify(saved.index),options),ids=new Set();
    for(const [key,group]of Object.entries(saved.documents)){
      if(!Array.isArray(group)||typeof saved.stamps[key]!=='string')throw Error('Invalid document group');
      for(const id of group){if(typeof id!=='string'||ids.has(id)||!loaded.has(id))throw Error('Invalid document reference');ids.add(id);}
    }
    if(ids.size!==loaded.documentCount)throw Error('Incomplete index');
    index=loaded;stamps=saved.stamps;documents=saved.documents;
  } catch {index=new MiniSearch(options);stamps={};documents={};}
}
function save() {
  fs.mkdirSync(path.dirname(cache),{recursive:true});const tmp=`${cache}.${process.pid}.tmp`;
  fs.writeFileSync(tmp,JSON.stringify({version:1,index:index.toJSON(),stamps,documents}),'utf8');fs.renameSync(tmp,cache);
}
async function refresh() {
  hydrate();catalog=catalogHistory();let changed=false;
  const keys=new Set(catalog.map(s=>s.key));
  for(const key of Object.keys(documents)) if(!keys.has(key)){for(const id of documents[key])index.discard(id);delete documents[key];delete stamps[key];changed=true;}
  progress={phase:'indexing',done:0,total:catalog.length};notify();
  for(const s of catalog) {
    try {
      const stamp=fingerprint(s.cwd,s.id);
      if(stamps[s.key]!==stamp){
        for(const id of documents[s.key]||[]) index.discard(id);
        const docs=[{id:`${s.key}\0title`,key:s.key,ordinal:-1,role:'title',title:s.title,text:''},...readFullHistory(s.cwd,s.id).filter(i=>i.kind==='user'||i.kind==='assistant').map(i=>({id:`${s.key}\0${i.historyOrdinal}`,key:s.key,ordinal:i.historyOrdinal,role:i.kind,title:'',text:i.text||''}))];
        index.addAll(docs);documents[s.key]=docs.map(d=>d.id);stamps[s.key]=stamp;changed=true;
      }
    }catch{ /* disappearing / locked file: retry next refresh */ }
    progress.done++;notify();await new Promise(resolve=>setImmediate(resolve));
  }
  // No other operation may mutate/search/serialize the index until this ends.
  if(index.dirtCount>0){await index.vacuum();changed=true;}
  // This is a disposable accelerator; cache IO cannot hide native history.
  if(changed)try{save();}catch{}
  progress={phase:'ready',done:catalog.length,total:catalog.length};notify();
  return catalog;
}
function snippet(text,query) {
  const words=query.toLocaleLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
  const lower=text.toLocaleLowerCase();let pos=words.reduce((best,w)=>{const at=lower.indexOf(w);return at>=0?Math.min(best,at):best;},Infinity);
  if(!Number.isFinite(pos))pos=0;const start=Math.max(0,pos-65);
  return (start?'…':'')+text.slice(start,start+230).replace(/\s+/g,' ')+(text.length>start+230?'…':'');
}
async function search({query='',cwd,sessionId,offset=0}={}) {
  await refresh();query=String(query).trim().slice(0,500);if(!query)return {items:[],total:0,progress};
  const byKey=new Map(catalog.map(s=>[s.key,s]));
  const hits=index.search(query,{prefix:true,combineWith:'AND',boost:{title:2}}).filter(hit=>byKey.has(hit.key)&&(!cwd||byKey.get(hit.key).cwd===cwd)&&(!sessionId||byKey.get(hit.key).id===sessionId));
  offset=Math.max(0,Number(offset)||0);const histories=new Map();
  const items=hits.slice(offset,offset+40).map(hit=>{
    const s=byKey.get(hit.key);let text=s.title;
    if(hit.ordinal>=0){if(!histories.has(hit.key))histories.set(hit.key,readFullHistory(s.cwd,s.id));text=histories.get(hit.key).find(i=>i.historyOrdinal===hit.ordinal)?.text||s.title;}
    return {...s,ordinal:hit.ordinal,role:hit.role,snippet:snippet(text,query)};
  });return {items,total:hits.length,progress};
}
let queue=Promise.resolve();
parentPort.on('message',message=>{
  queue=queue.then(async()=>{
    try {let result;
      if(message.method==='catalog')result=await refresh();
      else if(message.method==='search')result=await search(message.args);
      else if(message.method==='export'){
        const row=catalogHistory().find(s=>s.cwd===message.args.cwd&&s.id===message.args.sessionId);if(!row)throw Error('Chat not found');
        const messages=readFullHistory(row.cwd,row.id).filter(i=>i.kind==='user'||i.kind==='assistant');
        result='# '+row.title+'\n\n'+messages.map(i=>'## '+(i.kind==='user'?'You':'Grok')+'\n\n'+(i.text||'')+'\n'+(i.images?.length?'\n['+i.images.length+' image attachment(s)]\n':'')).join('\n');
      }
      else if(message.method==='window')result=historyWindow(message.args.cwd,message.args.sessionId,message.args);
      else throw Error('Unknown history operation');
      parentPort.postMessage({id:message.id,result});
    }catch(error){progress={...progress,phase:'error'};notify();parentPort.postMessage({id:message.id,error:error.message});}
  });
});
