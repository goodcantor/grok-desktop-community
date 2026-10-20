import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionHost, executionScope, resolveOwnedExecution, findExecution } from '../electron/execution-ownership.mjs';
import { ExecutionQueue } from '../electron/execution-queue.mjs';
const host=()=>createExecutionHost({id:1},()=>({agent:null,lastCwd:null,lastSessionId:null,generation:0,disposed:false}));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const item=id=>({id,text:id,images:[]});

test('selection does not replace execution ownership; foreign and stale scopes reject',()=>{
  const first=host(),second=host(),a=first.selected,b=first.create();
  a.lastCwd='C:\\Project';a.lastSessionId='chat-a';b.lastSessionId='chat-b';
  const scope=executionScope(a);first.selected=b;
  assert.equal(resolveOwnedExecution(first,scope),a);
  assert.throws(()=>resolveOwnedExecution(second,scope),/foreign/);
  a.generation++;assert.throws(()=>resolveOwnedExecution(first,scope),/Stale/);
});
test('one native chat follows platform path comparison',()=>{
  const first=host(),second=host();first.selected.lastCwd='C:\\PROJECT';first.selected.lastSessionId='id';
  assert.equal(findExecution([first,second],'c:/project/','id'),process.platform==='win32'?first.selected:null);
  assert.equal(findExecution([first,second],'c:/other','id'),null);
});
test('two queues work concurrently and FIFO drains without a renderer',async()=>{
  const pending=new Map(),calls=[];
  const deliver=entry=>{calls.push(entry.id);const next=deferred();pending.set(entry.id,next);return next.promise;};
  const a=new ExecutionQueue({deliver,cancel(){},interject(){}}),b=new ExecutionQueue({deliver,cancel(){},interject(){}});
  await a.submit(item('a1'));await b.submit(item('b1'));await a.submit(item('a2'));
  assert.deepEqual(calls,['a1','b1']);
  pending.get('a1').resolve({});await tick();assert.deepEqual(calls,['a1','b1','a2']);assert.equal(b.running,true);
  pending.get('a2').resolve({});pending.get('b1').resolve({});await tick();assert.equal(a.running,false);assert.equal(b.running,false);
});
test('Stop pauses only its owner and restored queues require explicit resume',async()=>{
  const aPending=deferred(),bPending=deferred();let cancelled=0;
  const a=new ExecutionQueue({deliver:()=>aPending.promise,cancel:()=>{cancelled++;aPending.resolve({stopReason:'cancelled'});}});
  const b=new ExecutionQueue({deliver:()=>bPending.promise,cancel(){}});
  await a.submit(item('a'));await a.submit(item('next'));await b.submit(item('b'));a.stop();await tick();
  assert.equal(a.items.length,1);assert.equal(a.paused,true);assert.equal(b.running,true);assert.equal(cancelled,1);
  let delivered=0;const restored=new ExecutionQueue({initial:[item('restored')],deliver:async()=>{delivered++;},cancel(){}});
  restored.drain();assert.equal(delivered,0);restored.update({action:'pause',paused:false});await tick();assert.equal(delivered,1);
  bPending.resolve({});
});
test('persistence failure leaves queued messages intact and rejects admission',async()=>{
  let fail=false;const pending=deferred();const queue=new ExecutionQueue({deliver:()=>pending.promise,cancel(){},persist:()=>{if(fail)throw Error('disk full');}});
  await queue.submit(item('running'));fail=true;await assert.rejects(queue.submit(item('queued')),/disk full/);assert.deepEqual(queue.items,[]);pending.resolve({});await tick();
});
test('failed owner does not drain its next prompt or alter a different queue',async()=>{
  const pending=deferred();const a=new ExecutionQueue({deliver:()=>pending.promise,cancel(){}});
  await a.submit(item('first'));await a.submit(item('second'));pending.reject(Error('engine exited'));await tick();
  assert.equal(a.paused,true);assert.equal(a.failed.id,'first');assert.deepEqual(a.items.map(row=>row.id),['second']);
});
test('editing pauses delivery; reorder/removal operate on stable queue identities',()=>{
  const queue=new ExecutionQueue({initial:[item('one'),item('two')],deliver:async()=>{},cancel(){}});
  queue.update({action:'edit',id:'one',text:'edited'});queue.update({action:'move',id:'two',direction:-1});
  assert.equal(queue.items[0].id,'two');assert.equal(queue.paused,true);queue.update({action:'remove',id:'two'});assert.equal(queue.items[0].text,'edited');
});

test('window chrome remains window-owned while execution selection changes',()=>{
  const owner=host(),first=owner.selected,second=owner.create();
  first.settingsOpen=true;first.pendingOpenCwd='C:/Pending';owner.selected=second;
  assert.equal(owner.settingsOpen,true);assert.equal(second.pendingOpenCwd,'C:/Pending');
});
