import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityStatus,currentPlan,formatElapsed,goalElapsed} from '../shared/activity-status.mjs';
import {applySessionUpdate} from '../shared/session-timeline.mjs';
import {goalFromUpdate} from '../shared/composer-state.mjs';
import {claimQueuedUserMessage} from '../shared/session-timeline.mjs';

test('activity uses current turn and ignores queued follow-ups or old tools',()=>{
  const items=[{kind:'tool',status:'pending',title:'Old'},{kind:'user',text:'Now'},{kind:'thought'},{kind:'user',queued:true,text:'Later'}];
  assert.equal(activityStatus({items}).phase,'thinking');
  items.push({kind:'tool',status:'in_progress',title:'Run tests'});assert.equal(activityStatus({items}).detail,'Run tests');
  assert.equal(activityStatus({items,permissionCount:1}).label,'Waiting for permission');
  assert.equal(activityStatus({items,waitingFor:'answer'}).label,'Waiting for your answer');
  assert.equal(activityStatus({items,permissionCount:1,cancelRequested:true}).phase,'stopping');
});
test('silence is informative and is never interpreted as failure or fake completion',()=>{
  const s=activityStatus({items:[{kind:'assistant'}],run:{startedAt:0,lastActivityAt:1000},now:70000});
  assert.equal(s.phase,'writing');assert.match(s.detail,/may still be running/);assert.equal(s.elapsedMs,70000);
  assert.equal(formatElapsed(3661000),'1:01:01');assert.equal(formatElapsed(-100),'0:00');
});
test('goal metadata follows native camel/snake fields, freezes when paused and resets on replacement',()=>{
  const goal=goalFromUpdate(null,{update:{sessionUpdate:'goal_updated',goalId:'one',status:'active',objective:'Fix things',elapsedMs:10000,tokensUsed:456,tokenBudget:1000,phase:'executing'}},1000);
  assert.equal(goalElapsed(goal,5000,2000),13000);assert.equal(goal.tokensUsed,456);
  const paused=goalFromUpdate(goal,{update:{session_update:'goal_updated',status:'infra_paused',elapsed_ms:15000,pause_message:'Service unavailable'}},5000);
  assert.equal(goalElapsed(paused,50000,2000),15000);assert.equal(paused.pauseMessage,'Service unavailable');
  const next=goalFromUpdate(paused,{update:{sessionUpdate:'goal_updated',goalId:'two',status:'active',objective:'Different'}});
  assert.equal(next.tokensUsed,undefined);assert.equal(goalElapsed(next,50000,2000),null);
});
test('dequeued messages appear after the completed response, retaining identity and images',()=>{
  const queued={id:'q',kind:'user',queueId:'one',queued:true,text:'Later',at:1,images:[{mimeType:'image/png'}]};
  const items=[{kind:'user',text:'First'},queued,{kind:'assistant',text:'First answer'}];
  const next=claimQueuedUserMessage(items,'one');assert.equal(next.at(-1).id,'q');assert.equal(next.at(-1).queued,false);assert.equal(next.at(-1).images,queued.images);assert.equal(next[1].text,'First answer');assert.equal(items[1].queued,true);
});

test('steering and plan updates retain the running tool and response phase',()=>{
  const items=[{kind:'user',text:'Work'},{kind:'tool',status:'in_progress',title:'Build'}, {kind:'user',interjectionId:'steer',text:'Also test'}, {kind:'plan',entries:[]}];
  assert.equal(activityStatus({items}).phase,'tool');
  assert.equal(activityStatus({items}).toolCount,1);
  assert.equal(activityStatus({items}).detail,'Build');
  items[1].status='completed';items.push({kind:'assistant',text:'Working'}, {kind:'plan',entries:[]});
  assert.equal(activityStatus({items}).phase,'writing');
});

test('plan updates stay inside their turn and malformed entries cannot break the renderer',()=>{
  const before=[{kind:'user',text:'Old request'},{kind:'plan',entries:[{content:'Old step',status:'completed'}]},{kind:'user',text:'Next request'}];
  const next=applySessionUpdate(before,{update:{sessionUpdate:'plan',entries:[{content:'Current step',status:'in_progress'}]}});
  assert.equal(next.length,4);assert.equal(next[1].entries[0].content,'Old step');
  assert.deepEqual(currentPlan(next),[{content:'Current step',status:'in_progress'}]);
  const steered=[...next,{kind:'user',interjectionId:'steer',text:'Please verify'}];
  assert.equal(applySessionUpdate(steered,{update:{sessionUpdate:'plan',entries:[]}}).length,5);
  assert.deepEqual(currentPlan([...next,{kind:'user',text:'Unrelated task'}]),[]);
  const malformed=applySessionUpdate(next,{update:{sessionUpdate:'plan',entries:{content:'Bad'}}});
  assert.deepEqual(malformed.at(-1).entries,[]);
  assert.deepEqual(currentPlan([{kind:'plan',entries:[null,{},{content:'Valid',status:'unknown'}]}]),[{content:'Valid',status:'pending'}]);
});

test('compaction is visible until its terminal event while approvals and Stop take priority',()=>{
  const items=[{kind:'user'},{kind:'system',text:'Compressing conversation…'}];
  assert.equal(activityStatus({items}).phase,'compacting');
  assert.equal(activityStatus({items,permissionCount:1}).phase,'waiting');
  assert.equal(activityStatus({items,cancelRequested:true}).phase,'stopping');
  items.push({kind:'system',text:'Conversation compacted.'});
  assert.notEqual(activityStatus({items}).phase,'compacting');
});
