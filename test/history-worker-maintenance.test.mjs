import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import MiniSearch from 'minisearch';

function client(cache,home){
  const worker=new Worker(new URL('../electron/history-worker.mjs',import.meta.url),{workerData:{cache},env:{...process.env,GROK_HOME:home}}),pending=new Map();let sequence=0;
  worker.on('message',m=>{if(!m.id)return;const request=pending.get(m.id);if(!request)return;pending.delete(m.id);m.error?request.reject(Error(m.error)):request.resolve(m.result);});
  worker.on('error',error=>{for(const request of pending.values())request.reject(error);pending.clear();});
  return {worker,call:(method,args)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,method,args});})};
}
function fixture(home,cwd,id,texts){
  const dir=path.join(home,'sessions',encodeURIComponent(cwd),id);fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({info:{cwd},generated_title:id,last_active_at:new Date().toISOString()}));
  fs.writeFileSync(path.join(dir,'updates.jsonl'),texts.map((text,i)=>JSON.stringify({update:{sessionUpdate:i%2?'agent_message_chunk':'user_message_chunk',content:{type:'text',text}}})).join('\n'));
  return dir;
}
test('dirty persisted index refreshes many sessions without background vacuum races', {timeout:20000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'grok-history-maintenance-')),home=path.join(root,'home'),cwd=path.join(root,'workspace'),cache=path.join(root,'index.json');fs.mkdirSync(cwd);
  const options={fields:['title','text'],storeFields:['key','ordinal','role'],autoVacuum:false};
  const index=new MiniSearch(options),documents={},stamps={},dirs=[];
  for(let n=0;n<30;n++){
    const id=`stress-session-${n}`,key=cwd+'\0'+id,texts=Array.from({length:30},(_,i)=>`nativeword${n} entry${i} ${n===0&&i===4?'retainedNeedle':''}`);
    dirs.push(fixture(home,cwd,id,texts));
    const docs=[{id:key+'\0title',key,ordinal:-1,role:'title',title:id,text:''},...texts.map((_,ordinal)=>({id:key+'\0'+ordinal,key,ordinal,role:ordinal%2?'assistant':'user',title:'',text:`obsoleteNeedle oldbranch${n} token${ordinal}`}))];
    index.addAll(docs);documents[key]=docs.map(d=>d.id);stamps[key]='older-fingerprint';
  }
  for(let n=0;n<1500;n++)index.add({id:`discard-${n}`,key:'discard',ordinal:n,role:'assistant',title:'',text:`unrelatedword${n} removedbranch${n} obsoletecache${n}`});
  for(let n=0;n<1500;n++)index.discard(`discard-${n}`);
  fs.writeFileSync(cache,JSON.stringify({version:1,index:index.toJSON(),documents,stamps}));let rpc=client(cache,home);
  try{
    const [catalog,found,obsolete]=await Promise.all([rpc.call('catalog'),rpc.call('search',{query:'retainedNeedle'}),rpc.call('search',{query:'obsoleteNeedle'})]);
    assert.equal(catalog.length,30);assert.equal(found.total,1);assert.equal(obsolete.total,0);
    assert.equal(JSON.parse(fs.readFileSync(cache,'utf8')).index.dirtCount,0);
    await rpc.worker.terminate();rpc=client(cache,home);
    for(const dir of dirs)fs.appendFileSync(path.join(dir,'updates.jsonl'),'\n'+JSON.stringify({update:{sessionUpdate:'user_message_chunk',content:{type:'text',text:'appendedNeedle'}}}));
    assert.equal((await rpc.call('search',{query:'appendedNeedle'})).total,30);
    await rpc.worker.terminate();
    const malformed=JSON.parse(fs.readFileSync(cache,'utf8'));malformed.documents[Object.keys(malformed.documents)[0]]='invalid-group';fs.writeFileSync(cache,JSON.stringify(malformed));rpc=client(cache,home);
    assert.equal((await rpc.call('catalog')).length,30);assert.equal((await rpc.call('search',{query:'retainedNeedle'})).total,1);
  }finally{await rpc.worker.terminate();fs.rmSync(root,{recursive:true,force:true});}
});

test('a disposable cache write failure does not hide catalog or native messages', {timeout:10000},async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'grok-history-cache-')),home=path.join(root,'home'),cwd=path.join(root,'workspace'),cache=path.join(root,'cache-directory');fs.mkdirSync(cwd);fs.mkdirSync(cache);
  fixture(home,cwd,'cache-session',['sourceNeedle','Native reply']);const rpc=client(cache,home);
  try{assert.equal((await rpc.call('catalog')).length,1);assert.equal((await rpc.call('search',{query:'sourceNeedle'})).total,1);}
  finally{await rpc.worker.terminate();fs.rmSync(root,{recursive:true,force:true});}
});
