import electronPath from 'electron';
import {captureNativeWindow} from './capture-window.mjs';
import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'qa','ui-progress');fs.mkdirSync(out,{recursive:true});
const env={...process.env,GROK_HARNESS_PROFILE:path.join(out,'profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:electronPath,args:['scripts/harness-native-bootstrap.cjs'],env,timeout:30000});
let page;const checks=[],errors=[];
try {
 for(let i=0;i<100;i++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
 await page.locator('#boot-splash').waitFor({state:'detached'});page.on('pageerror',e=>errors.push(e.message));
 const input=page.getByRole('textbox',{name:'Message',exact:true});await input.waitFor();await page.waitForFunction(async()=>Boolean((await window.grokDesktop.executionList()).length));
 const id=(await page.evaluate(()=>window.grokDesktop.executionList())).find(r=>r.selected).sessionId;
 const size=async(width=1365,zoom=1)=>{await app.evaluate(({BrowserWindow},{width,zoom})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html'));w.setSize(width,725);w.webContents.setZoomFactor(zoom);},{width,zoom});await page.waitForTimeout(100);};
 const snap=name=>captureNativeWindow(app,path.join(out,name+'.png'));
 const emit=async update=>app.evaluate((_,{id,update})=>global.__harnessAgents.get(id).emit('session-update',{sessionId:id,update}),{id,update});
 await size();await snap('01-empty');assert.equal(await page.locator('.topbar-connection').count(),0);
 await input.fill('Improve the workspace');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('button',{name:'Stop',exact:true}).waitFor();await snap('02-working');
 await app.evaluate((_,id)=>{const a=global.__harnessAgents.get(id);a.goalState={goalId:'g15',objective:'Make coding tasks easy to follow',status:'active',phase:'executing',elapsedMs:42000};a.emit('session-update',{sessionId:id,update:{sessionUpdate:'goal_updated',...a.goalState}});},id);
 await emit({sessionUpdate:'plan',entries:[{content:'Inspect the workspace',status:'completed'},{content:'Improve the interface',status:'in_progress'},{content:'Verify all states',status:'pending'},{content:'Build the installer',status:'pending'}]});
 await page.locator('.task-preview').waitFor();assert.equal(await page.locator('.task-preview li').count(),2);assert.equal(await page.locator('.activity-plan-title').textContent(),'Improve the interface');await snap('03-goal-plan');
 await page.locator('.chat-activity .activity-plan .ui-disclosure-trigger').click();await snap('04-expanded-plan');
 await app.evaluate((_,id)=>global.__harnessAgents.get(id).emit('user-question-request',{params:{questions:[{question:'Choose a workflow',options:Array.from({length:10},(_,i)=>({label:'Choice '+(i+1)}))}]},respond:()=>{}}),id);await page.getByRole('region',{name:'Agent requests'}).waitFor();await snap('05-question');
 for(const theme of ['dark','light'])for(const width of [800,1000,1365,1440])for(const zoom of [1,1.25,1.5,2]){
  await page.evaluate(async theme=>{await window.grokDesktop.setTheme(theme);document.documentElement.dataset.theme=theme;},theme);await size(width,zoom);
  const geometry=await page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height}:null;};return {input:rect('textarea[aria-label="Message"]'),request:rect('.interaction-dock'),activity:rect('.chat-activity'),timeline:rect('.timeline'),footer:rect('.interaction-dock .modal-footer'),width:innerWidth,height:innerHeight};});
  assert.ok(geometry.input.bottom<=geometry.height&&geometry.input.left>=0,JSON.stringify(geometry));assert.ok(geometry.request.bottom<=geometry.activity.top+1,JSON.stringify(geometry));assert.ok(geometry.request.top>=0,JSON.stringify(geometry));assert.ok(geometry.footer.bottom<=geometry.request.bottom+1,JSON.stringify(geometry));
  assert.ok(geometry.timeline.height>=80,JSON.stringify(geometry));const details=page.getByRole('button',{name:'Task details',exact:true});
  if(await details.isVisible()){
    await details.click();const region=page.getByRole('region',{name:'Task details',exact:true});await region.waitFor();
    const pause=region.getByRole('button',{name:'Stop & pause',exact:true});await pause.scrollIntoViewIfNeeded();assert.equal(await pause.isVisible(),true);
    const bounds=await region.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=geometry.activity.top+1);
    await snap(`details-${theme}-${width}-${zoom}`);await page.keyboard.press('Escape');assert.equal(await details.getAttribute('aria-expanded'),'false');
    assert.equal((await page.evaluate(()=>window.grokDesktop.listPendingGates())).userQuestions.length,1);
  }
  checks.push({theme,width,zoom,geometry});await snap(`layout-${theme}-${width}-${zoom}`);
 }
 await size();await page.evaluate(()=>document.documentElement.dataset.theme='dark');
 await input.fill(('A long draft with line breaks\n').repeat(80));await page.waitForTimeout(150);
 const tall=await page.locator('.interaction-dock').boundingBox();const body=await page.locator('.interaction-dock .modal-body').boundingBox();assert.ok(tall.y>=0&&body.height>=60,JSON.stringify({tall,body}));await snap('19-long-draft-question');await input.fill('');
 await page.getByRole('button',{name:'Collapse agent request',exact:true}).click();await snap('06-question-collapsed');
 assert.equal((await page.evaluate(()=>window.grokDesktop.listPendingGates())).userQuestions.length,1);
 await page.evaluate(async()=>{const g=await window.grokDesktop.listPendingGates();for(const q of g.userQuestions)await window.grokDesktop.respondUserQuestion(q.reqId,{type:'declined'});});
 await app.evaluate((_,id)=>global.__harnessAgents.get(id).emit('permission-request',{params:{toolCall:{toolCallId:'perm15',title:'Write result.md',kind:'edit'},options:[{optionId:'allow_once',name:'Allow once',kind:'allow_once'},{optionId:'reject_once',name:'Deny',kind:'reject_once'}]},respond:()=>{}}),id);
 await page.getByRole('region',{name:'Agent requests'}).waitFor();if(await page.getByRole('button',{name:'Expand agent request',exact:true}).isVisible())await page.getByRole('button',{name:'Expand agent request',exact:true}).click();await snap('15-permission');
 await page.getByRole('region',{name:'Tool approvals required',exact:true}).getByRole('button',{name:/Deny|Reject/}).click();
 await page.waitForFunction(async()=>(await window.grokDesktop.listPendingPermissions()).length===0);
 await input.fill('Also inspect the changes');await page.getByRole('button',{name:'Queue',exact:true}).click();await snap('07-queue');
 await size(800,1.5);await page.getByRole('button',{name:'Task details',exact:true}).click();
 const compact=page.getByRole('region',{name:'Task details',exact:true});await compact.locator('.prompt-queue').waitFor();
 await compact.getByRole('button',{name:'Edit queued message',exact:true}).click();
 await compact.getByRole('textbox',{name:'Edit queued message text',exact:true}).fill('Edited in compact task details');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Task details',exact:true}).click();
 assert.equal(await compact.getByRole('textbox',{name:'Edit queued message text',exact:true}).inputValue(),'Edited in compact task details');
 await compact.getByRole('button',{name:'Save',exact:true}).click();
 assert.equal((await page.evaluate(()=>window.grokDesktop.executionQueue())).items[0].text,'Edited in compact task details');
 await snap('18-compact-queue');await page.keyboard.press('Escape');await size();
 await page.getByRole('button',{name:'Stop',exact:true}).click();await page.waitForTimeout(150);await snap('08-stopped');
 await page.evaluate(async()=>{for(const i of(await window.grokDesktop.executionQueue()).items)await window.grokDesktop.executionQueueAction({action:'remove',id:i.id});});
 await input.fill('Follow up on this goal');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('button',{name:'Stop',exact:true}).waitFor();assert.equal(await page.locator('.task-preview li').count(),2);await snap('09-followup-retains-steps');
 await app.evaluate((_,id)=>global.__harnessFinish(id,'Review complete.'),id);await page.waitForTimeout(150);await snap('10-response-complete-goal-active');assert.ok((await page.locator('.goal-state').textContent()).includes('idle'));
 await app.evaluate((_,id)=>{const a=global.__harnessAgents.get(id);a.goalState={...a.goalState,status:'user_paused'};a.emit('session-update',{sessionId:id,update:{sessionUpdate:'goal_updated',...a.goalState}});},id);await snap('11-goal-paused');
 await app.evaluate((_,id)=>{const a=global.__harnessAgents.get(id);a.goalState={...a.goalState,status:'complete'};a.emit('session-update',{sessionId:id,update:{sessionUpdate:'goal_updated',...a.goalState}});},id);await snap('12-goal-complete');
 await input.fill('Exercise a service failure');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('button',{name:'Stop',exact:true}).waitFor();await app.evaluate((_,id)=>{const a=global.__harnessAgents.get(id);a._qaRun.active=false;a._qaReject(new Error('QA service unavailable'));},id);await page.waitForTimeout(200);await snap('13-failed');
 await page.reload();await input.waitFor();await snap('14-restored');
 await app.evaluate(async()=>{const a=global.__harnessAgents.values().next().value;const proto=Object.getPrototypeOf(a);const original=proto.start;proto.start=async function(opts){await new Promise(r=>setTimeout(r,1200));return original.call(this,opts);};});
 await page.getByRole('button',{name:'New chat',exact:true}).click();await snap('16-connecting');await input.waitFor();await page.waitForTimeout(1400);await snap('17-new-chat-ready');assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({geometry:checks,errors,goalPlanRetained:true,collapsedRequestPreserved:true,compactGoalControlsReachable:true,compactQueueEditPreserved:true,permissionReplyViaUi:true,longDraftQuestionReadable:true},null,2));console.log(JSON.stringify({combinations:checks.length,errors,out}));
}finally{await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;for(const a of global.__harnessAgents.values())a.cancel();}).catch(()=>{});await app.close();}
