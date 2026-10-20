import {app} from 'electron';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {GrokAcpClient} from '../electron/acp-client.mjs';
const client=new GrokAcpClient({cwd:process.cwd(),permissionMode:'ask',sandboxTerminal:true});
client.on('error',()=>{});
const updates=[];
let becameActive;
const active=new Promise(resolve=>{becameActive=resolve;});
client.on('session-update',p=>{const u=p.update||p;if(u.sessionUpdate==='goal_updated'){updates.push({status:u.status,objective:u.objective});if(u.status==='active')becameActive();}});
client.on('permission-request',p=>p.respond({outcome:{outcome:'cancelled'}}));
let running;
try {
  await client.start();
  await client.setSessionMode('plan');
  running=client.prompt('/goal Do not use tools, skills, or subagents. Ask one clarification question about an unspecified color, then wait for a human answer. --budget 200000').catch(e=>({cancelled:e.message}));
  await Promise.race([active,new Promise((_,reject)=>setTimeout(()=>reject(Error('Goal never became active')),15000))]);
  assert.notEqual(client.currentModeId,'plan');assert.equal(client.goalState.status,'active');
  const plan=await client.setSessionMode('plan');assert.equal(plan.agentSynced,true,plan.error);
  const duringPlan=await client.getRuntimeState();assert.equal(duringPlan.sessionMode,'plan');assert.equal(duringPlan.goal?.status,'user_paused');
  await running;
  await client.setSessionMode('default');await client.prompt('/goal clear');
  fs.writeFileSync('qa/native-goal-modes.json',JSON.stringify({sessionId:client.sessionId,goalExitsPlan:true,planPausesGoal:true,goalStatusAfterPlan:duringPlan.goal?.status,updates},null,2));
  console.log('NATIVE_GOAL_MODES_OK: goal leaves plan, plan pauses goal, goal cleared after test');
}catch(e){console.error(e);process.exitCode=1;fs.writeFileSync('qa/native-goal-modes-failure.json',JSON.stringify({error:e.message,goal:client.goalState,mode:client.currentModeId,updates},null,2));}
finally{if(client.ready){client.cancel();await client.prompt('/goal clear').catch(()=>{});}await client.dispose();app.exit(process.exitCode||0);}
