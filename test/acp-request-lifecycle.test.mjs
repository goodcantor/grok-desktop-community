import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sendAcpRequest,notePromptActivity,notePromptCancellation,promptRunState,DEFAULT_REQUEST_TIMEOUT_MS} from '../electron/acp-requests.mjs';
import {longTurnStatus} from '../shared/long-turn-status.mjs';

function client() {
  return {nextId:1,pending:new Map(),sessionId:'session-a',ready:true,proc:{killed:false},_openPermissionGates:new Map(),out:[],_write(msg){this.out.push(msg);}};
}
function finish(c,id,result) {
  const pending=c.pending.get(id);c.pending.delete(id);
  if(pending.timer)clearTimeout(pending.timer);
  pending.resolve(result);
}

test('a prompt remains tracked beyond 30 minutes and accepts the eventual reply',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const c=client(),p=sendAcpRequest(c,'session/prompt',{sessionId:'session-a',prompt:[{type:'text',text:'private prompt'}]});
  assert.equal(c.pending.get(1).timer,null);
  t.mock.timers.tick(31*60_000);
  assert.equal(promptRunState(c).active,true);
  assert.equal(c.out.length,1);
  assert.ok(!JSON.stringify(promptRunState(c)).includes('private prompt'));
  finish(c,1,{stopReason:'end_turn'});
  assert.deepEqual(await p,{stopReason:'end_turn'});
  assert.equal(promptRunState(c).active,false);
});

test('control requests keep their deadline without untracking the running prompt',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const c=client(),p=sendAcpRequest(c,'session/prompt',{sessionId:c.sessionId});
  const control=sendAcpRequest(c,'session/set_model',{sessionId:c.sessionId});
  const rejection=assert.rejects(control,/ACP request timed out after 120000ms: session\/set_model/);
  t.mock.timers.tick(DEFAULT_REQUEST_TIMEOUT_MS);await rejection;
  assert.equal(c.pending.size,1);assert.equal(promptRunState(c).active,true);
  finish(c,1,{});await p;
});

test('overlapping prompts are refused; control and steer RPCs remain available',async()=>{
  const c=client(),p=sendAcpRequest(c,'session/prompt',{sessionId:c.sessionId});
  await assert.rejects(sendAcpRequest(c,'session/prompt',{sessionId:c.sessionId}),/still working/);
  assert.equal(c.out.length,1);
  const steer=sendAcpRequest(c,'_x.ai/interject',{sessionId:c.sessionId});
  finish(c,2,{status:'queued'});await steer;
  assert.equal(promptRunState(c).active,true);
  finish(c,1,{});await p;
  const next=sendAcpRequest(c,'session/prompt',{sessionId:c.sessionId});finish(c,3,{});await next;
});

test('a broken write does not leave an active prompt or prevent recovery',async()=>{
  const c=client();c._write=()=>{throw new Error('pipe closed');};
  await assert.rejects(sendAcpRequest(c,'session/prompt',{sessionId:c.sessionId}),/pipe closed/);
  assert.equal(c.pending.size,0);assert.equal(promptRunState(c).active,false);
});

test('activity is scoped to the session and permission waits are visible',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:1000});
  const c=client(),p=sendAcpRequest(c,'session/prompt',{sessionId:c.sessionId});
  t.mock.timers.tick(5000);notePromptActivity(c,'another-session');
  assert.equal(promptRunState(c).lastActivityAt,1000);
  notePromptActivity(c,c.sessionId);assert.equal(promptRunState(c).lastActivityAt,6000);
  notePromptCancellation(c);assert.equal(promptRunState(c).cancelRequestedAt,6000);assert.equal(promptRunState(c).active,true);
  c._openPermissionGates.set('approval',{});assert.equal(promptRunState(c).waitingPermissions,1);
  finish(c,1,{});await p;
});

test('long-turn hints distinguish activity, silence and approval without declaring failure',()=>{
  const run={active:true,startedAt:1000,lastActivityAt:1000,waitingPermissions:0};
  assert.equal(longTurnStatus(run,2000),null);
  assert.match(longTurnStatus({...run,lastActivityAt:1_801_000},1_901_000).message,/Long task running/);
  assert.equal(longTurnStatus(run,400_000).canRestart,true);
  assert.match(longTurnStatus({...run,waitingPermissions:1},400_000).message,/waiting for your approval/);
  assert.equal(longTurnStatus({...run,active:false},9_000_000),null);
  assert.match(longTurnStatus({...run,cancelRequestedAt:1000},16000).message,/not confirmed completion/);
});
