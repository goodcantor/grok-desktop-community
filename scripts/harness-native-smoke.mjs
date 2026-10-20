import electronPath from 'electron';
import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const root=process.cwd(),workspace=path.join(root,'qa','harness-workspace');
const fixture=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Retained page</title><label>Note <input id="note"></label><button id="submit">Save</button>');});
await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
const env={...process.env,GROK_HARNESS_PROFILE:path.join(root,'qa','harness-native-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:electronPath,args:['scripts/harness-native-bootstrap.cjs',workspace],env,timeout:30000});
let page;const checks={},errors=[];
try{
  for(let i=0;i<120;i++){page=app.windows().find(candidate=>candidate.url().endsWith('/dist/index.html'));if(page)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(page);
  page.on('pageerror',error=>errors.push(error.message));
  const choosePanel=async label=>{const tab=page.getByRole('tab',{name:label,exact:true});if(await tab.isVisible())await tab.click();else await page.getByRole('button',{name:label,exact:true}).click();};
  await page.locator('#boot-splash').waitFor({state:'detached'});await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
  await page.waitForFunction(async()=>Boolean((await window.grokDesktop.executionList()).length));
  const input=page.getByRole('textbox',{name:'Message',exact:true});
  const first=(await page.evaluate(()=>window.grokDesktop.executionList())).find(row=>row.selected).sessionId;
  await input.fill('First background task');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('button',{name:'Stop',exact:true}).waitFor();
  await input.fill('Follow-up in first');await page.getByRole('button',{name:'Queue',exact:true}).click();
  await input.fill('Saved unsent draft');
  await page.reload();await page.locator('#boot-splash').waitFor({state:'detached'});await page.getByRole('button',{name:'Stop',exact:true}).waitFor();
  await page.waitForFunction(async id=>(await window.grokDesktop.executionList()).find(row=>row.selected)?.sessionId===id,first);
  assert.equal((await page.evaluate(()=>window.grokDesktop.executionQueue())).items.length,1);checks.rendererReloadKeepsExecution=true;

  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await page.waitForFunction(async prior=>(await window.grokDesktop.executionList()).some(row=>row.selected&&row.sessionId!==prior),first);
  const second=(await page.evaluate(()=>window.grokDesktop.executionList())).find(row=>row.selected).sessionId;
  await input.fill('Second simultaneous task');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.waitForFunction(async()=>(await window.grokDesktop.executionList()).filter(row=>row.active).length===2);checks.parallelChats=true;
  await app.evaluate(({app,dialog})=>{const original=dialog.showMessageBoxSync;dialog.showMessageBoxSync=()=>0;app.quit();dialog.showMessageBoxSync=original;});
  assert.equal((await page.evaluate(()=>window.grokDesktop.executionList())).filter(row=>row.active).length,2);checks.declinedQuitKeepsTasks=true;
  await app.evaluate((_,id)=>global.__harnessFinish(id,'First completed'),first);
  await page.waitForFunction(async id=>(await window.grokDesktop.executionList()).find(row=>row.sessionId===id)?.active,first);
  assert.equal(await app.evaluate((_,id)=>global.__harnessAgents.get(id)._qaMessages.length,first),2);checks.backgroundFifo=true;
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await page.waitForFunction(async id=>!(await window.grokDesktop.executionList()).find(row=>row.sessionId===id)?.active,second);
  assert.equal((await page.evaluate(()=>window.grokDesktop.executionList())).find(row=>row.sessionId===first).active,true);checks.targetedStop=true;
  await app.evaluate((_,id)=>global.__harnessFinish(id,'[Open result](result.md)\n\nFirst file ready.'),first);
  await app.evaluate((_,{cwd,id})=>{const host=[...global.__harnessSessions.windowSessions.values()][0];host.win.webContents.send('app:select-execution',{cwd,sessionId:id});},{cwd:workspace,id:first});
  await page.waitForFunction(async id=>(await window.grokDesktop.executionList()).find(row=>row.selected)?.sessionId===id,first);
  await input.waitFor();await page.waitForTimeout(300);
  assert.equal(await input.inputValue(),'Saved unsent draft');checks.draftPreserved=true;
  await page.getByRole('button',{name:'Activity',exact:true}).click();await page.getByRole('textbox',{name:'Search activity'}).fill('result.md');assert.ok(await page.locator('.activity-event').count());checks.journal=true;
  await app.evaluate((_,id)=>{const record=[...global.__harnessSessions.windowSessions.values()][0].selected;record._qaSavedItems=record.liveItems;record.liveItems=Array.from({length:10000},(_,i)=>({id:'ledger-'+i,kind:'tool',toolCallId:'ledger-'+i,title:'Ledger event '+i,status:'completed',at:Date.now()}));record.win.webContents.send('app:select-execution',{cwd:record.lastCwd,sessionId:id});},first);
  await page.getByRole('textbox',{name:'Search activity'}).fill('');await page.waitForFunction(()=>document.querySelector('.activity-toolbar')?.textContent.includes('10000 events'));
  assert.ok(await page.locator('.activity-event').count()<60);checks.virtualizedLargeLedger=true;
  await app.evaluate((_,id)=>{const record=[...global.__harnessSessions.windowSessions.values()][0].selected;record.liveItems=record._qaSavedItems;delete record._qaSavedItems;record.win.webContents.send('app:select-execution',{cwd:record.lastCwd,sessionId:id});},first);
  await page.waitForFunction(()=>!document.querySelector('.activity-toolbar')?.textContent.includes('10000 events'));

  await page.getByRole('button',{name:'Chat',exact:true}).click();await page.getByText('Files from this response',{exact:true}).first().waitFor();checks.resultFiles=true;
  await page.getByRole('link',{name:'Open result',exact:true}).click();await page.locator('.file-peek,.file-view,.file-editor').first().waitFor({timeout:5000}).catch(()=>{});checks.localLink=await page.locator('.panel').getByText('result.md',{exact:false}).count()>0;
  await choosePanel('Browser');await page.evaluate(url=>window.grokDesktop.openPreview(url),`http://127.0.0.1:${fixture.address().port}`);
  await app.evaluate(async()=>{const host=[...global.__harnessSessions.windowSessions.values()][0];const api=host.selected.previewController;await api.runPreviewAction({action:'fill',selector:'#note',value:'preserve me'});});
  await choosePanel('Files');await choosePanel('Browser');
  const snapshot=await page.evaluate(()=>window.grokDesktop.previewSnapshot());assert.match(JSON.stringify(snapshot),/preserve me/);checks.browserRetention=true;
  // Pages belong to a chat, including when a different page is created in the same window.
  await app.evaluate((_,{cwd,id})=>{[...global.__harnessSessions.windowSessions.values()][0].win.webContents.send('app:select-execution',{cwd,sessionId:id});},{cwd:workspace,id:second});
  await page.waitForFunction(async id=>(await window.grokDesktop.executionList()).find(row=>row.selected)?.sessionId===id,second);
  await page.evaluate(url=>window.grokDesktop.openPreview(url),`http://127.0.0.1:${fixture.address().port}/second`);
  await app.evaluate(async()=>{const api=[...global.__harnessSessions.windowSessions.values()][0].selected.previewController;await api.runPreviewAction({action:'fill',selector:'#note',value:'second page'});});
  await app.evaluate((_,{cwd,id})=>{[...global.__harnessSessions.windowSessions.values()][0].win.webContents.send('app:select-execution',{cwd,sessionId:id});},{cwd:workspace,id:first});
  await page.waitForFunction(async id=>(await window.grokDesktop.executionList()).find(row=>row.selected)?.sessionId===id,first);
  assert.match(JSON.stringify(await page.evaluate(()=>window.grokDesktop.previewSnapshot())),/preserve me/);checks.independentBrowsers=true;
  const beforeCapture=await app.evaluate((_,id)=>global.__harnessAgents.get(id)._qaMessages.length,first);
  await app.evaluate(async()=>{const record=[...global.__harnessSessions.windowSessions.values()][0].selected;await record.previewController.sendPreviewCaptureToChat();});
  assert.equal(await app.evaluate((_,id)=>global.__harnessAgents.get(id)._qaMessages.length,first),beforeCapture+1);checks.captureOwnsExecution=true;
  await app.evaluate((_,id)=>global.__harnessFinish(id,'Screenshot received by its owner'),first);

  await app.evaluate((_,id)=>{const agent=global.__harnessAgents.get(id);for(const question of ['Pick an approach','Add any details'])agent.emit('user-question-request',{params:{questions:[{question,options:question==='Pick an approach'?[{label:'First'},{label:'Second'}]:[]}]},respond:decision=>global.__harnessAnswers.push({question,decision})});},first);
  await page.getByRole('region',{name:'Agent requests'}).waitFor();
  await page.getByRole('button',{name:'Collapse agent request',exact:true}).click();assert.equal(await app.evaluate(()=>global.__harnessAnswers.length),0);
  await page.getByRole('button',{name:'Expand agent request',exact:true}).click();
  await page.getByRole('textbox',{name:'Your answer to Pick an approach',exact:true}).fill('A custom approach');
  await page.locator('.interaction-dock>div:not([hidden])').getByRole('button',{name:'Submit',exact:true}).click();
  await page.getByRole('textbox',{name:'Your answer to Add any details',exact:true}).waitFor();await page.getByRole('textbox',{name:'Your answer to Add any details',exact:true}).fill('Freeform details');
  await page.locator('.interaction-dock>div:not([hidden])').getByRole('button',{name:'Submit',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.interaction-dock'));const answers=await app.evaluate(()=>global.__harnessAnswers);assert.equal(answers.length,2);assert.deepEqual(answers[0].decision.answers,{'Pick an approach':['A custom approach']});checks.inlineCustomQuestions=true;checks.multipleWaits=true;checks.collapseDoesNotAnswer=true;
  await app.evaluate((_,id)=>{global.__harnessAgents.get(id).emit('plan-approval-request',{params:{planContent:'# Plan\nImplement the requested change.'},respond:decision=>global.__harnessAnswers.push({plan:decision})});},first);
  await page.locator('.plan-feedback-input').waitFor();assert.equal(await page.locator('.modal-backdrop').count(),0);
  await page.locator('.plan-feedback-input').fill('Keep the existing history');await page.getByRole('button',{name:'Approve with comments',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.interaction-dock'));assert.ok((await app.evaluate((_,id)=>global.__harnessAgents.get(id)._qaMessages,first)).some(text=>text.includes('STEER:')&&text.includes('Keep the existing history')));checks.planComments=true;
  if(await page.locator('.panel-close').isVisible())await page.locator('.panel-close').click();
  await page.getByRole('button',{name:'Terminal',exact:true}).click();await page.waitForFunction(async()=>(await window.grokDesktop.ptyList()).length>0);checks.nativePty=true;
  await page.getByRole('button',{name:'Hide terminal',exact:true}).click();
  if(await page.locator('.panel-close').isVisible())await page.locator('.panel-close').click();
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().endsWith('/dist/index.html'));win.setSize(1440,960);});
  await page.waitForTimeout(200);await page.screenshot({path:'qa/harness-native-dark.png'});
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Day',exact:true}).click();await page.getByRole('button',{name:'Close settings',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');await page.waitForTimeout(100);await page.screenshot({path:'qa/harness-native-light.png'});checks.realThemeSwitch=true;
  await page.evaluate(()=>window.grokDesktop.executionSubmit({id:'geometry-turn',text:'Layout check with pending input',images:[],at:Date.now()},'auto'));
  await app.evaluate((_,id)=>global.__harnessAgents.get(id).emit('user-question-request',{params:{questions:[{question:'Choose an item for the layout check',options:Array.from({length:20},(_,i)=>({label:'Choice '+(i+1),description:'A deliberately long option that must remain scrollable at high zoom.'}))}]},respond:()=>{}}),first);
  await page.getByRole('region',{name:'Agent requests'}).waitFor();
  const geometry=[];
  for(const theme of ['light','dark']){
    if(theme==='dark'){await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Night',exact:true}).click();await page.getByRole('button',{name:'Close settings',exact:true}).click();}
    for(const width of [800,1000,1440])for(const zoom of [1,1.25,1.5,2]){
      await app.evaluate(({BrowserWindow},{width,zoom})=>{const win=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().endsWith('/dist/index.html'));win.setSize(width,900);win.webContents.setZoomFactor(zoom);},{width,zoom});
      await page.waitForTimeout(90);
      const rect=await input.boundingBox(),send=await page.locator('.composer-delivery-actions .composer-send').last().boundingBox();
      const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}));
      assert.ok(rect&&rect.width>100&&rect.x>=0&&rect.x+rect.width<=viewport.width+1&&rect.y>=0&&rect.y+rect.height<=viewport.height+1,JSON.stringify({width,zoom,theme,rect,viewport}));
      assert.ok(send&&send.x>=0&&send.y+send.height<=viewport.height+1,JSON.stringify({width,zoom,send,viewport}));assert.equal(viewport.overflow,false);
      const headerFits=await page.locator('.workspace-switcher').evaluate(element=>Array.from(element.querySelectorAll('button')).every(button=>{const rect=button.getBoundingClientRect();return rect.x>=0&&rect.right<=innerWidth+1;}));
      assert.ok(headerFits,JSON.stringify({theme,width,zoom,reason:'header actions overflow'}));
      if(width===800&&zoom===2){await page.getByRole('button',{name:'Chats',exact:true}).click();await page.locator('.sidebar-drawer-open .history-body').waitFor();await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();checks.narrowHistoryDrawer=true;}
      geometry.push({theme,width,zoom,inputVisible:true,sendVisible:true});
    }
  }
  checks.geometry=geometry;checks.dpi=process.env.GROK_AUDIT_DPI||'system';
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().endsWith('/dist/index.html'));win.setSize(1440,960);win.webContents.setZoomFactor(1);});
  await page.evaluate(async()=>{const gates=await window.grokDesktop.listPendingGates();for(const question of gates.userQuestions)await window.grokDesktop.respondUserQuestion(question.reqId,{type:'declined'});});
  await app.evaluate((_,id)=>global.__harnessFinish(id,'Layout check complete'),first);
  const beforeRestart=(await page.evaluate(()=>window.grokDesktop.executionList())).find(row=>row.selected);
  await app.evaluate((_,id)=>{global.__harnessOldAgent=global.__harnessAgents.get(id);},first);
  const restarted=await page.evaluate(()=>window.grokDesktop.restartAgent());assert.ok(restarted.scope.generation>beforeRestart.generation);checks.connectionGeneration=true;
  await app.evaluate(()=>global.__harnessOldAgent.emit('session-update',{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'STALE_AGENT_MUST_NOT_APPEAR'}}}));
  assert.equal(await page.getByText('STALE_AGENT_MUST_NOT_APPEAR',{exact:false}).count(),0);checks.staleAgentIgnored=true;
  assert.deepEqual(errors,[]);checks.rendererErrors=errors;fs.writeFileSync(`qa/harness-native${process.env.GROK_AUDIT_DPI?'-dpi-'+process.env.GROK_AUDIT_DPI:''}.json`,JSON.stringify(checks,null,2));console.log(JSON.stringify({...checks,geometry:checks.geometry.length+' combinations'}));
}catch(error){await page?.screenshot({path:'qa/harness-native-failure.png'}).catch(()=>{});throw error;}
finally{await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;for(const agent of global.__harnessAgents.values())agent.cancel();}).catch(()=>{});await app.close();fixture.close();}
