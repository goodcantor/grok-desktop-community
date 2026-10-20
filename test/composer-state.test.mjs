import {test} from 'node:test';
import assert from 'node:assert/strict';
import {draftIntent, contextMeter, goalFromUpdate, snapshotModel} from '../shared/composer-state.mjs';

test('switching draft modes preserves text and collapses old prefixes to one mode',()=>{
  assert.deepEqual(draftIntent('/plan /goal Почини Bluetooth','chat'),{mode:'goal',text:'Почини Bluetooth',explicit:true});
  assert.deepEqual(draftIntent('/goal /plan first\nsecond','chat'),{mode:'plan',text:'first\nsecond',explicit:true});
  assert.deepEqual(draftIntent('ordinary question','plan'),{mode:'plan',text:'ordinary question',explicit:false});
  assert.deepEqual(draftIntent('/chat','plan'),{mode:'chat',text:'',explicit:true});
});
test('goal management and unrelated slash commands remain native commands',()=>{
  for(const action of ['status','pause','resume','clear'])assert.deepEqual(draftIntent('/goal '+action,'chat'),{mode:'chat',text:'/goal '+action,explicit:false});
  assert.equal(draftIntent('/review code','goal').text,'/review code');
});
test('context meter uses actual engine occupancy, handles full and unknown capacity',()=>{
  assert.deepEqual(contextMeter(125000,500000),{used:125000,total:500000,percent:25,left:75});
  assert.deepEqual(contextMeter(125000,256000),{used:125000,total:256000,percent:49,left:51});
  assert.equal(contextMeter(600000,500000).percent,100);
  assert.equal(contextMeter(0,256000).percent,0);
  for(const total of [null,0,-1,NaN,Infinity])assert.equal(contextMeter(125000,total),null);
});
test('goal state follows native updates, pause, completion and clear',()=>{
  const active=goalFromUpdate(null,{update:{sessionUpdate:'goal_updated',status:'active',objective:'Fix the PC'}});
  assert.equal(active.status,'active');
  const paused=goalFromUpdate(active,{update:{sessionUpdate:'goal_updated',status:'user_paused'}});assert.equal(paused.objective,'Fix the PC');assert.equal(paused.status,'user_paused');
  assert.equal(goalFromUpdate(paused,{update:{sessionUpdate:'goal_updated',status:'complete'}}).status,'complete');
  assert.equal(goalFromUpdate(paused,{update:{sessionUpdate:'goal_updated',status:'cleared'}}),null);
  assert.equal(goalFromUpdate(paused,{update:{sessionUpdate:'agent_message_chunk'}}),paused);
});
test('only advertised context and reasoning choices reach the composer',()=>{
  const model=snapshotModel({modelId:'grok',_meta:{totalContextTokens:256000,contextWindows:[256000,500000,0,'1000',null],reasoningEfforts:[{id:'high',label:'High'}]}});
  assert.deepEqual(model.contextWindows,[256000,500000]);assert.deepEqual(model.reasoningEfforts,[{value:'high',label:'High'}]);
  assert.equal(snapshotModel({modelId:'unknown'}).contextWindow,null);assert.deepEqual(snapshotModel({modelId:'unknown'}).contextWindows,[]);
});
