import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {catalogHistory,readFullHistory,historyWindow,readPreferences,writePreferences,sessionFiles} from '../electron/history-core.mjs';

test('full history search, paging, updates, deletion and damaged cache recovery',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grok-custom-history-'));const old=process.env.GROK_HOME;process.env.GROK_HOME=path.join(temp,'home');
  const project=path.join(temp,'project-a'),other=path.join(temp,'project-b');fs.mkdirSync(project,{recursive:true});fs.mkdirSync(other);
  const cache=path.join(temp,'index.json');let worker;let seq=0;const requests=new Map();
  function start(){worker=new Worker(new URL('../electron/history-worker.mjs',import.meta.url),{workerData:{cache},env:{...process.env}});worker.on('message',m=>{if(!m.id)return;const p=requests.get(m.id);requests.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result);});worker.on('error',err=>{for(const p of requests.values())p.reject(err);});}
  const rpc=(method,args)=>new Promise((resolve,reject)=>{const id=++seq;requests.set(id,{resolve,reject});worker.postMessage({id,method,args});});
  function fixture(cwd,id,title,texts){const dir=path.join(process.env.GROK_HOME,'sessions',encodeURIComponent(cwd),id);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'summary.json'),JSON.stringify({info:{cwd},generated_title:title,last_active_at:new Date().toISOString()}));fs.writeFileSync(path.join(dir,'updates.jsonl'),texts.map((text,i)=>JSON.stringify({update:{sessionUpdate:i%2?'agent_message_chunk':'user_message_chunk',content:{type:'text',text}}})).join('\n'));return dir;}
  try{
    const first=fixture(project,'session-0001','Architecture notes',Array.from({length:620},(_,i)=>i===4?'Найти старый компонент React useEffect earlyneedle':`ordinary message ${i}`));
    fixture(other,'session-0002','Second project',['other project','deepcode const searchAcrossProjects = true']);
    fs.appendFileSync(path.join(first,'updates.jsonl'),'\n'+JSON.stringify({update:{sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'thoughtonlysecret'}}}));
    start();let rows=await rpc('catalog');assert.equal(rows.length,2);assert.equal(readFullHistory(project,'session-0001').filter(i=>i.kind==='user'||i.kind==='assistant').length,620);
    let result=await rpc('search',{query:'старый компонент'});assert.equal(result.total,1);assert.equal(result.items[0].ordinal,4);assert.match(result.items[0].snippet,/старый/);
    const page=await rpc('window',{cwd:project,sessionId:'session-0001',ordinal:4});assert.equal(page.focusOrdinal,4);assert.equal(page.total,621);assert.ok(page.items.some(i=>i.historyOrdinal===4));
    const next=historyWindow(project,'session-0001',{start:page.end});assert.equal(next.start,page.end);assert.equal(next.items[0].historyOrdinal,page.end);
    result=await rpc('search',{query:'searchAcrossProjects'});assert.equal(result.items[0].cwd,other);
    assert.equal((await rpc('search',{query:'missingzzzz'})).total,0);
    assert.equal((await rpc('search',{query:'earlyneedle',cwd:other})).total,0);
    assert.equal((await rpc('search',{query:'searchAcrossProjects',sessionId:'session-0001'})).total,0);
    const exported=await rpc('export',{cwd:project,sessionId:'session-0001'});assert.match(exported,/Architecture notes/);assert.match(exported,/earlyneedle/);assert.doesNotMatch(exported,/thoughtonlysecret/);
    assert.equal((await rpc('search',{query:'thoughtonlysecret'})).total,0);
    fs.appendFileSync(path.join(first,'updates.jsonl'),'\n'+JSON.stringify({update:{sessionUpdate:'user_message_chunk',content:{type:'text',text:'newlyappended uniqueupdate'}}}));
    assert.equal((await rpc('search',{query:'uniqueupdate'})).total,1);
    const summary=JSON.parse(fs.readFileSync(path.join(first,'summary.json'),'utf8'));summary.generated_title='Renamed uniqueheadline';fs.writeFileSync(path.join(first,'summary.json'),JSON.stringify(summary));
    assert.equal((await rpc('search',{query:'uniqueheadline'})).total,1);
    assert.equal((await rpc('search',{query:'Architecture notes'})).total,0);
    const prefs=path.join(temp,'preferences.json');writePreferences(prefs,{pinned:[rows[0].key],collapsed:[project]});assert.deepEqual(readPreferences(prefs),{pinned:[rows[0].key],collapsed:[project],archived:[]});
    await worker.terminate();fs.writeFileSync(cache,'broken cache');start();assert.equal((await rpc('search',{query:'earlyneedle'})).total,1);
    fs.rmSync(first,{recursive:true});assert.equal((await rpc('search',{query:'earlyneedle'})).total,0);
    fs.rmSync(other,{recursive:true});rows=await rpc('catalog');assert.equal(rows[0].available,false);
    assert.throws(()=>sessionFiles(project,'../escape'),/Invalid/);
  }finally{await worker?.terminate();if(old===undefined)delete process.env.GROK_HOME;else process.env.GROK_HOME=old;fs.rmSync(temp,{recursive:true,force:true});}
});
