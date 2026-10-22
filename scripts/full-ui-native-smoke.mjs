import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const cwd=path.resolve('qa/full-ui-workspace');fs.mkdirSync(cwd,{recursive:true});fs.writeFileSync(path.join(cwd,'readme.md'),'# Local audit fixture\nThis file belongs to the UI audit.\n');
const fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Local preview</title><style>body{background:#f6f6f4;color:#171717;font:16px system-ui;margin:0;padding:40px}main{max-width:580px;margin:auto}small{letter-spacing:.12em;font-size:11px}h1{font-size:38px;letter-spacing:-1.5px;line-height:1.1}input{font:inherit;padding:12px;border:1px solid #bbb;border-radius:8px;width:85%}button,a{display:inline-block;padding:12px 16px;border:1px solid #ccc;background:white;border-radius:8px;color:inherit;margin:18px 8px 0 0}section{padding:24px;border:1px solid #ddd;border-radius:16px;background:white;margin-top:32px}</style></head><body><main><small>YOUR LOCAL WORKSPACE</small><h1>Build it. See it.<br>Keep talking.</h1><p>A live browser beside your conversation.</p><section><label for="note">A note that stays with your page</label><p><input id="note" placeholder="Try switching to Files and back" /></p><button onclick="document.getElementById('status').textContent='Saved locally'">Save note</button><a href="/second">Next page</a><p id="status"></p></section><p>${req.url==='/second'?'Second page':'Preview ready'} · No external services</p></main></body></html>`);});
await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${fixture.address().port}`;
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const dpi=process.env.GROK_AUDIT_DPI||'';
const launchArgs=[...(dpi?[`--force-device-scale-factor=${dpi}`]:[]),'scripts/audit-app-bootstrap.cjs',cwd];
const app=await electron.launch({executablePath:'node_modules/electron/dist/electron.exe',args:launchArgs,env,timeout:30000});
const report={},errors=[];let page,dialogs=0;
const wait=async fn=>{for(let i=0;i<150;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw new Error('Observation timed out');};
try {
  page=await wait(()=>app.windows().find(p=>p.url().endsWith('/dist/index.html')));page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>{if(dialog.type()==='beforeunload')return;dialogs++;void dialog.dismiss().catch(()=>{});});
  await page.locator('.topbar-connection .online').waitFor({timeout:60000});await page.locator('#boot-splash').waitFor({state:'detached'});
  await page.evaluate(()=>window.grokDesktop.setZoom(1));
  const info=await page.evaluate(()=>window.grokDesktop.getInfo());assert.equal(path.resolve(info.lastProject),cwd);report.launchDirectory=true;
  await app.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id).setContentSize(1440,900),info.windowId);
  const input=page.getByRole('textbox',{name:'Message',exact:true});await input.fill('');await input.click();await page.keyboard.insertText('Draft stays here while I inspect my page.');assert.equal(await input.inputValue(),'Draft stays here while I inspect my page.');report.nativeInput=true;
  if(!dpi) {
    const original=await page.evaluate(()=>window.grokDesktop.getRuntimeState());
    await page.getByRole('button',{name:'Message mode',exact:true}).click();await page.getByRole('radio',{name:'Plan mode',exact:false}).click();await wait(async()=>(await page.evaluate(()=>window.grokDesktop.getRuntimeState())).sessionMode==='plan');
    await page.getByRole('button',{name:'Message mode',exact:true}).click();await page.getByRole('radio',{name:'Chat',exact:false}).click();await wait(async()=>(await page.evaluate(()=>window.grokDesktop.getRuntimeState())).sessionMode==='default');report.nativeModes=true;
    const model=original.availableModels.find(m=>m.modelId===original.modelId),context=model.contextWindows?.find(size=>size!==original.context.total);
    if(context){const changed=await page.evaluate(size=>window.grokDesktop.setContextWindow(size),context);assert.equal(changed.context.total,context);await page.evaluate(size=>window.grokDesktop.setContextWindow(size),original.context.total);report.nativeContext=true;}
    const alternative=original.availableModels.find(m=>m.modelId!==original.modelId);if(alternative){const changed=await page.evaluate(id=>window.grokDesktop.setModel(id),alternative.modelId);assert.equal(changed.agentSynced,true);await page.evaluate(id=>window.grokDesktop.setModel(id),original.modelId);report.nativeModelSwitch=true;}
    const secondCwd=path.join(cwd,'second-window');fs.mkdirSync(secondCwd,{recursive:true});await page.evaluate(cwd=>window.grokDesktop.openProjectInNewWindow(cwd),secondCwd);
    const second=await wait(()=>app.windows().find(p=>p!==page&&p.url().endsWith('/dist/index.html')));await second.locator('.topbar-connection .online').waitFor({timeout:60000});const peer=await second.evaluate(()=>window.grokDesktop.getRuntimeState());
    const effort=model.reasoningEfforts?.find(e=>e.value!==original.reasoningEffort)?.value;if(effort){await page.evaluate(effort=>window.grokDesktop.setReasoningEffort(effort),effort);assert.equal((await second.evaluate(()=>window.grokDesktop.getRuntimeState())).reasoningEffort,peer.reasoningEffort);await page.evaluate(effort=>window.grokDesktop.setReasoningEffort(effort),original.reasoningEffort);report.reasoningIsolation=true;}await second.close();
  }
  await page.getByRole('button',{name:'Browser',exact:true}).click();await page.getByRole('tab',{name:'Browser',exact:true}).waitFor();
  const chrome=await wait(()=>app.context().pages().find(p=>p.url().includes('/preview/index.html')));
  await chrome.getByRole('button',{name:'Reset page zoom',exact:true}).click();
  await chrome.getByRole('textbox',{name:'Address',exact:true}).fill(url);await chrome.getByRole('textbox',{name:'Address',exact:true}).press('Enter');
  await wait(async()=>{const state=await page.evaluate(()=>window.grokDesktop.previewState());return state.url.startsWith(url)&&!state.loading;});
  const state=await page.evaluate(()=>window.grokDesktop.previewState());assert.equal(state.presentation,'docked');assert.equal(state.ownerWindowId,info.windowId);
  const views=()=>app.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id).contentView.children.filter(v=>v.webContents).map(v=>({url:v.webContents.getURL(),bounds:v.getBounds(),visible:v.getVisible()})),info.windowId);
  const layout=await views();const guest=layout.find(v=>v.url.startsWith(url)),surface=await page.locator('.browser-surface').boundingBox();assert.ok(guest.visible);assert.ok(guest.bounds.x>=surface.x-2&&guest.bounds.x+guest.bounds.width<=surface.x+surface.width+2);report.dockedBrowser=true;
  const guestPage=await wait(()=>app.context().pages().find(p=>p.url().startsWith(url)));await guestPage.getByRole('textbox',{name:'A note that stays with your page',exact:true}).fill('Preserved note');
  await page.getByRole('tab',{name:'Files',exact:true}).click();await wait(async()=>(await views()).filter(v=>v.url.startsWith(url)||v.url.includes('/preview/index.html')).every(v=>!v.visible));
  await page.getByRole('tab',{name:'Browser',exact:true}).click();await wait(async()=>(await views()).find(v=>v.url.startsWith(url))?.visible);assert.equal(await guestPage.locator('#note').inputValue(),'Preserved note');report.tabRetention=true;
  await page.getByRole('tab',{name:'Files',exact:true}).click();
  const fileRow=page.locator('.file-item-file').filter({hasText:'readme.md'}).first();await fileRow.click();await page.getByRole('button',{name:'Source',exact:true}).click();
  const editor=page.getByRole('textbox',{name:'Edit readme.md',exact:true});await editor.fill('# Unsaved audit draft\n');
  const dialogsBefore=dialogs;
  await page.getByRole('tab',{name:'Browser',exact:true}).click();await page.getByRole('tab',{name:'Files',exact:true}).click();
  if(await page.getByRole('button',{name:'Source',exact:true}).count())await page.getByRole('button',{name:'Source',exact:true}).click();
  assert.equal(await editor.inputValue(),'# Unsaved audit draft\n');assert.equal(dialogs,dialogsBefore);report.unsavedFileTabRetention=true;
  await app.evaluate(({BrowserWindow,dialog},id)=>{globalThis.qaUnsavedClosePrompts=0;dialog.showMessageBoxSync=()=>{globalThis.qaUnsavedClosePrompts++;return 0;};BrowserWindow.fromId(id).close();},info.windowId);
  await wait(()=>app.evaluate(()=>globalThis.qaUnsavedClosePrompts>0));
  assert.equal(await app.evaluate(({BrowserWindow},id)=>Boolean(BrowserWindow.fromId(id)),info.windowId),true);report.unsavedCloseGuard=true;
  await page.getByRole('button',{name:'Save',exact:true}).click();await wait(()=>fs.readFileSync(path.join(cwd,'readme.md'),'utf8')==='# Unsaved audit draft\n');report.fileSave=true;
  await fileRow.click({button:'right'});const menu=page.getByRole('menu',{name:'File actions'});await menu.waitFor();await page.keyboard.press('ArrowDown');assert.equal(await menu.locator('button:focus').count(),1);await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});report.fileContextMenu=true;
  await page.getByRole('tab',{name:'Browser',exact:true}).click();
  await input.click();await page.keyboard.down('Control');await page.mouse.wheel(0,-120);await page.keyboard.up('Control');await wait(async()=>await page.evaluate(()=>window.grokDesktop.getZoom())===1.1);report.ctrlWheel=true;
  await page.keyboard.press('Control+0');await wait(async()=>await page.evaluate(()=>window.grokDesktop.getZoom())===1);report.zoomReset=true;
  await guestPage.locator('h1').click();await guestPage.keyboard.down('Control');await guestPage.mouse.wheel(0,-120);await guestPage.keyboard.up('Control');await wait(async()=>(await page.evaluate(()=>window.grokDesktop.previewState())).zoom>1);assert.equal(await page.evaluate(()=>window.grokDesktop.getZoom()),1);report.pageZoomIndependent=true;
  await chrome.getByRole('button',{name:'Reset page zoom',exact:true}).click();
  await guestPage.locator('h1').click();await guestPage.keyboard.press('Control+l');await chrome.waitForFunction(()=>document.activeElement===document.getElementById('url'));report.addressShortcut=true;
  await page.getByTitle('Settings',{exact:true}).click();await page.getByRole('dialog').waitFor();await wait(async()=>(await views()).filter(v=>v.url.startsWith(url)||v.url.includes('/preview/index.html')).every(v=>!v.visible));report.modalOcclusion=true;
  await page.getByRole('button',{name:'Close settings',exact:true}).click();await wait(async()=>(await views()).find(v=>v.url.startsWith(url))?.visible);
  await page.getByRole('button',{name:'Context window',exact:true}).click();await page.getByRole('dialog',{name:'Context settings'}).waitFor();await wait(async()=>(await views()).find(v=>v.url.startsWith(url))?.visible===false);await page.keyboard.press('Escape');report.popoverOcclusion=true;
  await chrome.getByRole('button',{name:'Browser tools',exact:true}).click();
  await chrome.getByRole('button',{name:'Snapshot',exact:true}).click();await chrome.locator('#panel-body').getByText(/Build it/).waitFor();report.snapshot=true;await chrome.getByRole('button',{name:'Close panel',exact:true}).click();
  await chrome.locator('#net').click();await chrome.locator('#network').waitFor({state:'visible'});report.network=true;await chrome.getByRole('button',{name:'Close network',exact:true}).click();
  for(const width of [1440,1000,800]) {
    await app.evaluate(({BrowserWindow},{id,width})=>BrowserWindow.fromId(id).setContentSize(width,760),{id:info.windowId,width});
    for(const zoom of [1,1.25,1.5,2]) {
      await page.evaluate(zoom=>window.grokDesktop.setZoom(zoom),zoom);await page.waitForTimeout(200);
      const rows=await views(),g=rows.find(v=>v.url.startsWith(url)),r=await page.locator('.browser-surface').boundingBox();assert.ok(Math.abs(g.bounds.x-r.x*zoom)<=2);assert.ok(g.bounds.width<=r.width*zoom+2);
    }
  }report.zoomGeometry=true;report.windowWidths=[800,1000,1440];await page.evaluate(()=>window.grokDesktop.setZoom(1));
  await page.locator('.panel-close').click();await input.click();await page.keyboard.insertText(' Narrow view checked.');assert.match(await input.inputValue(),/Narrow view checked/);report.narrowPanelClose=true;
  await page.getByRole('button',{name:'Browser',exact:true}).click();await app.evaluate(({BrowserWindow},id)=>BrowserWindow.fromId(id).setContentSize(1440,900),info.windowId);
  await chrome.getByRole('combobox',{name:'Viewport',exact:true}).selectOption('desktop');await wait(async()=>await guestPage.evaluate(()=>window.innerWidth)===1280);
  await chrome.getByRole('combobox',{name:'Viewport',exact:true}).selectOption('mobile');await wait(async()=>await guestPage.evaluate(()=>window.innerWidth)===390);
  await chrome.getByRole('combobox',{name:'Viewport',exact:true}).selectOption('fluid');await wait(async()=>Math.abs(await guestPage.evaluate(()=>window.innerWidth)-(await views()).find(v=>v.url.startsWith(url)).bounds.width)<2);report.fluidViewport=true;report.viewportFitsPanel=true;
  await input.click();await page.mouse.move(450,40);await page.waitForTimeout(450);
  assert.equal(await page.locator('.error-banner').count(),0);report.noSpuriousNavigationError=true;
  const captureNative=async(name)=>{const shot=await app.evaluate(async({BrowserWindow,desktopCapturer},id)=>{const win=BrowserWindow.fromId(id);const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1920,height:1200}});const source=sources.find(s=>s.id===win.getMediaSourceId());if(!source||source.thumbnail.isEmpty())throw new Error('Own window capture missing');return source.thumbnail.toPNG().toString('base64');},info.windowId);fs.writeFileSync(name,Buffer.from(shot,'base64'));};
  await page.getByTitle('Settings',{exact:true}).click();await page.getByRole('button',{name:'Day',exact:true}).click();await page.getByRole('button',{name:'Close settings',exact:true}).click();assert.equal(await chrome.evaluate(()=>document.documentElement.getAttribute('data-theme')),'light');
  await page.waitForTimeout(250);if(!dpi)await captureNative('qa/full-audit-browser-light.png');
  await page.getByTitle('Settings',{exact:true}).click();await page.getByRole('button',{name:'Night',exact:true}).click();await page.getByRole('button',{name:'Close settings',exact:true}).click();report.lightTheme=true;
  await page.waitForTimeout(250);await captureNative(`qa/full-audit-browser-native${dpi?'-'+Number(dpi)*100:''}.png`);report.nativeScreenshot=true;
  assert.match(await input.inputValue(),/Draft stays/);assert.deepEqual(errors,[]);
  report.deviceScale=dpi?Number(dpi):'Windows default';fs.writeFileSync(`qa/full-ui-native${dpi?'-'+Number(dpi)*100:''}.json`,JSON.stringify(report,null,2));console.log('FULL_UI_NATIVE_OK',JSON.stringify(report));
} catch(e) {console.error(e.stack||String(e));try{report.failureUI=await page.evaluate(()=>({settings:document.querySelector('.settings-page')?.textContent,dialogs:Array.from(document.querySelectorAll('[role=dialog]')).map(e=>({name:e.getAttribute('aria-label'),text:e.textContent?.slice(0,200),inert:e.inert})),active:document.activeElement?.outerHTML?.slice(0,300)}));await page.screenshot({path:'qa/full-ui-failure.png'});}catch{}fs.writeFileSync('qa/full-ui-native-partial.json',JSON.stringify({report,errors,error:e.message},null,2));process.exitCode=1;}
finally{try{await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;});}catch{}await app.close();await new Promise(resolve=>fixture.close(resolve));}
