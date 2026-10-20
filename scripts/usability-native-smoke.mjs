import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const cwd=path.resolve('qa/custom10-native-workspace');fs.mkdirSync(cwd,{recursive:true});
const app=await electron.launch({executablePath:'node_modules/electron/dist/electron.exe',args:['scripts/usability-bootstrap.cjs',cwd],env}),checks={};let page;
const moduleUrl=new URL('../electron/window-session.mjs',import.meta.url).href;
try{
  for(let n=0;n<200;n++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}assert.ok(page);
  await page.locator('.topbar-connection .online').waitFor({timeout:60000});await page.locator('#boot-splash').waitFor({state:'detached'});await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html')).show());
  const routed=await app.evaluate(async({Notification,BrowserWindow},url)=>{
    global.__noticeEvents=[];global.__originalNoticeShow=Notification.prototype.show;
    Notification.prototype.show=function(){global.__lastNotice=this;global.__noticeEvents.push({title:this.title,body:this.body,silent:this.silent});};
    const {windowSessions}=global.__qaSessionModule,ws=[...windowSessions.values()][0];await ws.agentChain;global.__qaWs=ws;
    // Control the background predicate: Windows may reactivate Electron during
    // modal focus restoration. OS banner delivery is outside this API test.
    global.__originalFocusPredicate=ws.win.isFocused;ws.win.isFocused=()=>false;
    ws.win.hide();
    ws.agent.emit('permission-request',{params:{sessionId:ws.agent.sessionId,toolCall:{toolCallId:'qa-permission',title:'PRIVATE_COMMAND_MUST_NOT_APPEAR'},options:[{optionId:'allow-once',kind:'allow_once',name:'Allow once'}]},respond:()=>{global.__permissionReplied=true;}});
    return {supported:Notification.isSupported(),events:global.__noticeEvents};
  },moduleUrl);
  assert.equal(routed.supported,true);assert.equal(routed.events.length,1);assert.equal(routed.events[0].title,'Approval needed');assert.ok(!routed.events[0].body.includes('PRIVATE_COMMAND'));checks.nativePermissionNotice=true;
  const permissions=await page.evaluate(()=>window.grokDesktop.listPendingPermissions());assert.equal(permissions.length,1);
  await page.evaluate(reqId=>window.grokDesktop.respondPermission(reqId,{outcome:'selected',optionId:'allow-once'}),permissions[0].reqId);
  assert.equal(await app.evaluate(()=>global.__permissionReplied),true);
  await page.evaluate(()=>window.grokDesktop.notificationPreferences({enabled:false}));
  await app.evaluate(()=>{global.__qaWs.agent.emit('user-question-request',{params:{questions:[]},respond:()=>{}});});
  assert.equal(await app.evaluate(()=>global.__noticeEvents.length),1);checks.nativeNoticePreferences=true;
  await app.evaluate(async(_electron,url)=>{const {clearPendingPermissions}=global.__qaSessionModule;clearPendingPermissions(global.__qaWs);},moduleUrl);
  await page.evaluate(()=>window.grokDesktop.notificationPreferences({enabled:true,sound:false}));
  await page.evaluate(()=>window.grokDesktop.getRuntimeState());await app.evaluate(async()=>{await global.__qaWs.agentChain;});
  await app.evaluate(()=>global.__qaWs.win.hide());
  const reply=await page.evaluate(()=>window.grokDesktop.prompt('Do not use tools, skills or subagents. Reply exactly USABILITY_NATIVE_OK.'));
  const notices=await app.evaluate(()=>global.__noticeEvents);assert.equal(notices.at(-1).title,'Response complete');assert.equal(notices.at(-1).silent,true);checks.nativeCompletionNotice=true;
  await app.evaluate(()=>{global.__qaWs.win.isFocused=global.__originalFocusPredicate;global.__lastNotice.emit('click');});assert.equal(await app.evaluate(()=>global.__qaWs.win.isVisible()),true);checks.noticeFocusesOwner=true;
  const original=(await page.evaluate(()=>window.grokDesktop.getRuntimeState())).sessionId;
  await page.getByRole('textbox',{name:'Message',exact:true}).focus();await page.keyboard.press('Control+n');
  await page.waitForFunction(async id=>{const state=await window.grokDesktop.getRuntimeState();return Boolean(state.sessionId&&state.sessionId!==id);},original);await page.locator('.topbar-connection .online').waitFor();assert.equal(app.windows().filter(p=>p.url().endsWith('/dist/index.html')).length,1);checks.nativeNewChatShortcut=true;
  await page.keyboard.press('Control+/');await page.getByRole('dialog',{name:'Keyboard shortcuts',exact:true}).waitFor();await page.keyboard.press('Escape');checks.nativeShortcuts=true;
  await page.getByRole('button',{name:'Terminal',exact:true}).click();await page.locator('.terminal-screen .xterm').waitFor();
  for(const zoom of [1,1.5,2]){
    await app.evaluate((_electron,z)=>{global.__qaWs.win.setSize(1000,800);global.__qaWs.win.webContents.setZoomFactor(z);},zoom);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const input=await page.getByRole('textbox',{name:'Message',exact:true}).boundingBox(),terminal=await page.locator('.terminal-dock').boundingBox(),height=await page.evaluate(()=>innerHeight);
    assert.ok(input.y+input.height<=height);assert.ok(terminal.y+terminal.height<=height+1);
    await page.screenshot({path:`qa/custom10-native-${zoom}.png`});
  }checks.nativeTerminalZoom=true;
  fs.writeFileSync('qa/custom10-native.json',JSON.stringify(checks,null,2));console.log('USABILITY_NATIVE_OK',checks);
}catch(e){console.log(await page.evaluate(()=>({viewport:{width:innerWidth,height:innerHeight},children:[...document.querySelector('.main').children].map(e=>({class:e.className,y:e.getBoundingClientRect().y,height:e.getBoundingClientRect().height}))})));await page?.screenshot({path:'qa/custom10-native-failure.png'}).catch(()=>{});throw e;}finally{
  await page?.evaluate(async()=>{for(const tab of await window.grokDesktop.ptyList())await window.grokDesktop.ptyCommand({id:tab.id,action:'close'});}).catch(()=>{});
  await app.evaluate(({Notification,dialog})=>{if(global.__originalNoticeShow)Notification.prototype.show=global.__originalNoticeShow;if(global.__qaWs&&global.__originalFocusPredicate)global.__qaWs.win.isFocused=global.__originalFocusPredicate;dialog.showMessageBoxSync=()=>1;}).catch(()=>{});
  await app.close();
}
