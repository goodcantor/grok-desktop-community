import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installMockBridge} from './qa-bridge.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(installMockBridge);
await page.addInitScript(()=>{
  const api=window.grokDesktop,original=api.getRuntimeState;let active=false,start=0,last=0,finish,fail,goal=null;
  const emit=update=>{last=Date.now();window.__qaEmit('agent:session-update',{sessionId:'session-atlas-001',update});};
  window.__activityEvent=emit;
  window.__activityGoal=(patch)=>{goal={...goal,...patch,observedAt:Date.now()};emit({sessionUpdate:'goal_updated',...goal});};
  window.__activityFinish=()=>{emit({sessionUpdate:'agent_message_chunk',content:{type:'text',text:'The current task is finished.'}});active=false;finish?.({stopReason:'end_turn'});};
  window.__activityFail=()=>{active=false;fail?.(new Error('QA_SERVICE_FAILURE'));};
  window.__activitySilence=()=>{last=Date.now()-6*60000;start=Date.now()-7*60000;};
  api.getRuntimeState=async()=>({...await original(),goal});
  api.getRunState=async()=>({sessionId:'session-atlas-001',active,connected:true,startedAt:active?start:null,lastActivityAt:active?last:null,waitingPermissions:0});
  api.prompt=async text=>{window.__qaActions.prompts.push(text);if(text.startsWith('/goal ')){window.__activityGoal({goalId:'goal-ui',objective:'Make the project ready to ship',status:text==='/goal pause'?'user_paused':text==='/goal clear'?'cleared':'active',elapsedMs:92000,tokensUsed:5840});if(text==='/goal clear')goal=null;return{stopReason:'end_turn'};}active=true;start=last=Date.now();return await new Promise((resolve,reject)=>{finish=resolve;fail=reject;});};
  api.cancel=async()=>{window.__qaActions.cancel++;active=false;finish?.({stopReason:'cancelled'});return true;};
});
const checks={};
try{
  await page.goto('http://127.0.0.1:5180');await page.locator('.topbar-connection .online').waitFor();
  const input=page.getByRole('textbox',{name:'Message',exact:true});
  await page.getByRole('button',{name:'Files',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Files',exact:true}).getAttribute('aria-pressed'),'true');await page.getByRole('button',{name:'Close side panel',exact:true}).click();checks.panelSelection=true;
  await input.fill('Inspect the project and run its checks.');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('region',{name:'Current response'}).waitFor();
  await page.evaluate(()=>window.__activityEvent({sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'Checking the request.'}}));await page.locator('.activity-label').getByText('Thinking',{exact:true}).waitFor();
  assert.equal(await page.locator('.topbar').getByText('Working…',{exact:true}).count(),0);assert.equal(await page.locator('.composer .turn-activity').count(),1);const firstTime=await page.locator('.turn-activity .activity-time').textContent();await page.waitForTimeout(1300);assert.notEqual(await page.locator('.turn-activity .activity-time').textContent(),firstTime);checks.composerTimer=true;
  await page.evaluate(()=>{window.__activityGoal({goalId:'goal-ui',objective:'Make the project ready to ship',status:'active',phase:'executing',elapsedMs:92000,tokensUsed:5840,tokenBudget:20000});window.__activityEvent({sessionUpdate:'tool_call',toolCallId:'activity-tests',title:'Run the project test suite',status:'in_progress'});});await page.locator('.activity-label').getByText('Running a tool',{exact:true}).waitFor();await page.getByRole('region',{name:'Current goal'}).waitFor();checks.goalMetadata=true;
  await page.evaluate(()=>{
    window.__activityEvent({sessionUpdate:'plan',entries:[{content:'Audit the current experience',status:'completed'},{content:'Improve task controls',status:'in_progress'},{content:'Verify the Windows build',status:'pending'}]});
    window.__qaEmit('agent:session-interjection',{sessionId:'session-atlas-001',interjectionId:'steer-ui',text:'Keep the current tests running.'});
    window.__activityEvent({sessionUpdate:'task_backgrounded',taskId:'background-ui',description:'Watch the renderer',command:'npm run dev'});
  });
  await page.locator('.activity-label').getByText('Running a tool',{exact:true}).waitFor();
  await page.locator('.activity-plan > button').focus();await page.keyboard.press('Enter');await page.getByRole('list',{name:'Task progress'}).waitFor();
  assert.equal(await page.locator('.composer .activity-plan-list li').count(),3);
  await page.keyboard.press('Space');assert.equal(await page.getByRole('list',{name:'Task progress'}).count(),0);checks.planKeyboardAndSteering=true;
  await page.getByRole('button',{name:'Load earlier messages',exact:true}).click();await page.getByText('An early needle message preserved in your history.',{exact:true}).waitFor();
  assert.equal(await page.locator('.timeline .turn-activity').count(),0);assert.equal(await page.locator('.composer .turn-activity').count(),1);
  await page.getByRole('button',{name:'Jump to latest',exact:true}).click();checks.visibleWithHistory=true;

  for(const text of ['Review the final diff.','Export a summary.']){await input.fill(text);await page.getByRole('button',{name:'Queue',exact:true}).click();}
  assert.equal(await page.locator('.timeline .msg').getByText('Review the final diff.',{exact:true}).count(),0);assert.equal(await page.locator('.prompt-queue-item').count(),2);checks.noQueueDuplicates=true;
  await page.getByRole('button',{name:'Edit queued message',exact:true}).first().click();await page.getByRole('textbox',{name:'Edit queued message text'}).fill('Review the diff and explain the changes.');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('button',{name:'Resume queue',exact:true}).waitFor();await page.getByRole('button',{name:'Move queued message up',exact:true}).nth(1).click();assert.match(await page.locator('.prompt-queue-text').first().textContent(),/Export/);checks.editPausesQueue=true;
  await page.locator('.activity-details > button').click();await page.locator('.activity-diagnostics').waitFor();await page.locator('.activity-details > button').click();
  await page.screenshot({path:'qa/custom9-working.png'});
  for(const width of [640,800,1000,1440])for(const zoom of [1,1.5,2]){
    const viewport={width:Math.round(width/zoom),height:Math.round(900/zoom)};await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const box=await input.boundingBox(),activity=await page.locator('.composer-context').boundingBox();
    assert.ok(box.x>=0&&box.x+box.width<=viewport.width+1,`input within viewport ${width}/${zoom}`);
    assert.ok(box.y>=0&&box.y+box.height<=viewport.height,`input visible ${width}/${zoom}`);
    if(activity.y+activity.height>box.y+2){await page.screenshot({path:"qa/refactor-geometry-failure.png"});console.log({width,zoom,box,activity});}
    assert.ok(activity.y+activity.height<=box.y+2,`controls above input ${width}/${zoom}`);
    assert.ok(await input.isEditable());
  }
  await page.evaluate(()=>{document.body.style.zoom='1';});await page.setViewportSize({width:1440,height:1000});checks.busyGeometryAtZoom=true;

  await page.evaluate(()=>window.__qaEmit('agent:permission-request',{reqId:'activity-permission',params:{sessionId:'session-atlas-001',toolCall:{toolCallId:'activity-tests',title:'Run the project test suite'},options:[{optionId:'allow-once',name:'Allow once',kind:'allow_once'}]}}));await page.locator('.activity-label').getByText('Waiting for permission',{exact:true}).waitFor();await page.locator('.timeline').getByRole('button',{name:'Allow once',exact:true}).click();checks.permissionStatus=true;
  await page.getByRole('button',{name:'Stop & pause',exact:true}).click();await page.getByRole('region',{name:'Current goal'}).getByText('Paused',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Resume queue',exact:true}).count(),1);await page.waitForTimeout(200);assert.equal((await page.evaluate(()=>window.__qaActions.prompts)).length,2);checks.stopAndPauseGoal=true;
  assert.equal(await page.evaluate(()=>window.dispatchEvent(new Event('beforeunload',{cancelable:true}))),false);checks.queueCloseGuard=true;
  await page.getByRole('button',{name:'Design notes',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.prompt-queue-item').length===0);await page.getByRole('button',{name:'Building Atlas together',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.prompt-queue-item').length===2);checks.queueNavigationRestores=true;
  const goalClock=await page.locator('.goal-summary .activity-time').textContent();await page.waitForTimeout(1200);assert.equal(await page.locator('.goal-summary .activity-time').textContent(),goalClock);checks.pausedGoalTimerFrozen=true;
  await page.getByRole('button',{name:'Resume queue',exact:true}).click();await page.getByRole('region',{name:'Current response'}).waitFor();assert.equal((await page.evaluate(()=>window.__qaActions.prompts)).at(-1),'Export a summary.');checks.queueResume=true;
  await page.getByRole('button',{name:'Stop',exact:true}).click();await page.getByText('Response stopped',{exact:true}).waitFor();await page.waitForTimeout(150);assert.equal((await page.evaluate(()=>window.__qaActions.prompts)).at(-1),'Export a summary.');await page.getByRole('button',{name:'Resume queue',exact:true}).waitFor();checks.stopDoesNotDrainQueue=true;
  await page.getByRole('button',{name:'Resume queue',exact:true}).click();await page.evaluate(()=>window.__activitySilence());await page.getByText(/No new engine activity for 6 min/).waitFor();checks.silenceStatus=true;await page.evaluate(()=>window.__activityFinish());await page.getByText('Response complete',{exact:true}).waitFor();await page.getByRole('button',{name:'Review changes',exact:true}).click();await page.locator('.git-review').waitFor();await page.getByRole('button',{name:'Close side panel',exact:true}).click();checks.reviewShortcut=true;
  for(const width of [800,1000,1440]){await page.setViewportSize({width,height:900});const r=await page.locator('.workspace-switcher').boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width);await page.screenshot({path:`qa/custom9-${width}.png`});}checks.responsiveHeader=true;
  await page.setViewportSize({width:1440,height:1000});await page.getByTitle('Settings',{exact:true}).click();await page.getByRole('button',{name:'Day',exact:true}).click();await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.screenshot({path:'qa/custom9-light.png'});checks.lightTheme=true;
  await input.fill('Failure probe');await page.getByRole('button',{name:'Send',exact:true}).click();await input.fill('Keep this follow-up after failure');await page.getByRole('button',{name:'Queue',exact:true}).click();await page.evaluate(()=>window.__activityFail());await page.getByText('Response failed',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Resume queue',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Restore text',exact:true}).click();assert.equal(await input.inputValue(),'Failure probe');checks.failedTurnKeepsQueue=true;
  const switching=await browser.newPage({viewport:{width:1440,height:900}});await switching.addInitScript(installMockBridge);await switching.addInitScript(()=>{const api=window.grokDesktop,open=api.openSession;api.openSession=async(...args)=>{await new Promise(r=>setTimeout(r,900));return{...await open(...args),sessionId:'new-draft-session',history:[]};};});await switching.goto('http://127.0.0.1:5180');await switching.locator('.topbar-connection .online').waitFor();await switching.getByRole('button',{name:'New chat',exact:true}).click();const early=switching.getByRole('textbox',{name:'Message',exact:true});await early.click();await switching.keyboard.insertText('Typed while the new chat opens.');await switching.locator('.topbar-connection .online').waitFor();await switching.waitForFunction(()=>document.querySelector('textarea[aria-label=Message]')?.value==='Typed while the new chat opens.');checks.newChatDraftDuringConnection=true;await switching.close();
  const race=await browser.newPage();await race.addInitScript(installMockBridge);
  await race.addInitScript(()=>{const api=window.grokDesktop,original=api.getRuntimeState;window.__runtimeGate=[];let released=false;api.getRuntimeState=async()=>{const snapshot=await original();if(!released)await new Promise(resolve=>window.__runtimeGate.push(resolve));return snapshot;};window.__runtimeRelease=()=>{released=true;for(const resolve of window.__runtimeGate)resolve();};});
  await race.goto('http://127.0.0.1:5180');await race.locator('.topbar-connection .online').waitFor();await race.waitForFunction(()=>window.__runtimeGate.length>0);
  await race.evaluate(()=>{window.__qaEmit('agent:session-update',{sessionId:'session-atlas-001',update:{sessionUpdate:'goal_updated',status:'active',objective:'Preserve the newest goal'}});window.__runtimeRelease();});
  await race.getByText('Preserve the newest goal',{exact:true}).waitFor();checks.goalEventWinsStaleRuntime=true;await race.close();
  assert.deepEqual(errors,[]);fs.writeFileSync('qa/custom9-ui.json',JSON.stringify(checks,null,2));console.log('TASK_CONTROLS_UI_OK',JSON.stringify(checks));
}catch(e){console.log(await page.evaluate(()=>({storage:{...localStorage},queues:document.querySelectorAll('.prompt-queue-item').length,title:document.querySelector('.topbar-title')?.textContent})));await page.screenshot({path:'qa/custom9-failure.png'}).catch(()=>{});throw e;}finally{await browser.close();}
