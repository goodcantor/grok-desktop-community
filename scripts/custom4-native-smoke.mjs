import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import {spawn} from 'node:child_process';

const exe=process.env.GROK_CUSTOM_TEST_EXE,devUrl=process.env.GROK_DESKTOP_DEV_URL||'http://127.0.0.1:5180';
const app=await electron.launch({executablePath:exe||'node_modules/electron/dist/electron.exe',args:exe?[]:['.'],cwd:process.cwd(),env:{...process.env,GROK_DESKTOP_DEV_URL:devUrl},timeout:30000});
let page,info,file,originalMode,second;
const report={packaged:Boolean(exe)},ownedSessions=[];
async function ready(p){await p.getByText('Connected',{exact:true}).waitFor({timeout:60000});await p.locator('#boot-splash').waitFor({state:'detached'});}
async function choose(mode){await page.getByRole('button',{name:'Message mode',exact:true}).click();await page.getByRole('radio',{name:mode,exact:false}).click();await page.waitForFunction(mode=>document.querySelector('.composer-mode-trigger')?.dataset.mode===mode,mode==='Plan mode'?'plan':mode.toLowerCase());}
try{
  for(let i=0;i<200;i++){page=app.windows().find(p=>p.url().includes(devUrl)||p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}assert.ok(page);await ready(page);
  console.log('NATIVE_WINDOW_READY');
  info=await page.evaluate(()=>window.grokDesktop.getInfo());originalMode=info.permissionMode;assert.equal(info.auth.authenticated,true);
  const before=await page.evaluate(()=>window.grokDesktop.historyCatalog());
  await page.getByRole('button',{name:'New chat',exact:true}).click();await ready(page);
  let runtime=await page.evaluate(()=>window.grokDesktop.getRuntimeState());ownedSessions.push(runtime.sessionId);
  const input=page.getByRole('textbox',{name:'Message',exact:true});await input.click({position:{x:18,y:18}});await page.keyboard.insertText('Native click + кириллица');assert.equal(await input.inputValue(),'Native click + кириллица');assert.equal(await input.evaluate(e=>document.activeElement===e),true);report.nativeInput=true;
  const tier=runtime.availableModels.find(model=>model.modelId===runtime.modelId)?.reasoningEfforts?.find(option=>option.value!==info.defaultReasoningEffort)?.value;
  if(tier){await input.fill('');await page.evaluate(tier=>window.grokDesktop.setReasoningEffort(tier),tier);await page.getByRole('button',{name:'New chat',exact:true}).click();await ready(page);runtime=await page.evaluate(()=>window.grokDesktop.getRuntimeState());ownedSessions.push(runtime.sessionId);assert.equal(runtime.reasoningEffort,info.defaultReasoningEffort);report.newChatDefaults=true;await input.fill('Native click + кириллица');}
  await choose('Plan mode');assert.equal((await page.evaluate(()=>window.grokDesktop.getRuntimeState())).sessionMode,'plan');await choose('Goal');assert.equal((await page.evaluate(()=>window.grokDesktop.getRuntimeState())).sessionMode,'default');await choose('Chat');assert.equal(await input.inputValue(),'Native click + кириллица');report.nativeModes=true;
  await page.evaluate(cwd=>window.grokDesktop.openProjectInNewWindow(cwd),info.defaultWorkspace);
  for(let i=0;i<200;i++){second=app.windows().find(p=>p!==page&&(p.url().includes(devUrl)||p.url().endsWith('/dist/index.html')));if(second)break;await new Promise(r=>setTimeout(r,100));}assert.ok(second);await ready(second);
  const other=await second.evaluate(()=>window.grokDesktop.getRuntimeState());
  const model=runtime.availableModels.find(m=>m.modelId===runtime.modelId),effort=model.reasoningEfforts?.find(e=>e.value!==runtime.reasoningEffort)?.value;
  if(effort){const changed=await page.evaluate(effort=>window.grokDesktop.setReasoningEffort(effort),effort);assert.equal(changed.agentSynced,true);assert.equal((await second.evaluate(()=>window.grokDesktop.getRuntimeState())).reasoningEffort,other.reasoningEffort);assert.equal((await page.evaluate(()=>window.grokDesktop.getInfo())).defaultReasoningEffort,info.defaultReasoningEffort);await page.evaluate(effort=>window.grokDesktop.setReasoningEffort(effort),runtime.reasoningEffort);report.reasoningIsolation=true;}
  await second.close();second=null;
  const alternative=runtime.availableModels.find(m=>m.modelId!==runtime.modelId);if(alternative){const changed=await page.evaluate(id=>window.grokDesktop.setModel(id),alternative.modelId);assert.equal(changed.agentSynced,true);await page.evaluate(id=>window.grokDesktop.setModel(id),runtime.modelId);await page.evaluate(effort=>window.grokDesktop.setReasoningEffort(effort),runtime.reasoningEffort);report.modelSwitch=true;}
  const context=model.contextWindows?.find(size=>size!==runtime.context.total);if(context){const changed=await page.evaluate(size=>window.grokDesktop.setContextWindow(size),context);assert.equal(changed.context.total,context);await page.evaluate(size=>window.grokDesktop.setContextWindow(size),runtime.context.total);report.contextSwitch=true;}
  await input.fill('Draft survives native reload');await page.waitForTimeout(650);await page.reload();await ready(page);await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Message"]')?.value==='Draft survives native reload');report.nativeDraft=true;await input.fill('');
  await page.evaluate(()=>window.grokDesktop.setPermissionMode('ask'));
  file=path.join(info.defaultWorkspace,'custom4-qa-'+crypto.randomUUID()+'.txt');const expected='CUSTOM4_NATIVE_FILE_OK_'+crypto.randomUUID().slice(0,8);fs.writeFileSync(file,expected,{flag:'wx'});
  await app.evaluate(({dialog},file)=>{dialog.__qaOriginal=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},file);
  await page.getByRole('button',{name:'Add attachments',exact:true}).click();await page.getByRole('button',{name:'Files',exact:false}).filter({hasText:'Attach local'}).click();await page.getByRole('button',{name:path.basename(file),exact:false}).count();
  await app.evaluate(({dialog})=>{dialog.showOpenDialog=dialog.__qaOriginal;delete dialog.__qaOriginal;});
  await input.fill('Read only the attached file and reply with exactly its contents. Do not edit files, run commands, invoke skills or use subagents.');await page.getByRole('button',{name:'Send',exact:true}).click();
  let approved=0;const deadline=Date.now()+90000;
  while(Date.now()<deadline){const permissions=await page.evaluate(()=>window.grokDesktop.listPendingPermissions());for(const permission of permissions){const option=permission.params.options.find(o=>/allow.?once/i.test(o.optionId+' '+o.name));if(option){await page.evaluate(({reqId,optionId})=>window.grokDesktop.respondPermission(reqId,{outcome:'selected',optionId}),{reqId:permission.reqId,optionId:option.optionId});approved++;}}
    if(await page.getByText(expected,{exact:true}).count())break;await page.waitForTimeout(250);
  }
  await page.getByText(expected,{exact:true}).waitFor({timeout:1000});await ready(page);report.realFileRead=true;report.nativePermission=approved>0?"approved":"engine allowed this read without prompting";
  console.log('NATIVE_FILE_READ_OK');
  const found=await page.evaluate(query=>window.grokDesktop.searchHistory({query}),expected);assert.ok(found.items.some(row=>row.role==='assistant'));const after=await page.evaluate(()=>window.grokDesktop.historyCatalog());assert.ok(before.sessions.every(old=>after.sessions.some(row=>row.key===old.key)));report.historyPreserved=true;report.nativeSearch=true;
  await page.evaluate(({cwd,sessionId})=>window.grokDesktop.renameSession({cwd,sessionId,title:'Desktop Custom 4 verification'}),{cwd:info.defaultWorkspace,sessionId:runtime.sessionId});
  await page.evaluate(mode=>window.grokDesktop.setPermissionMode(mode),originalMode);
  for(const zoom of [1,1.25,1.5,2]){await app.evaluate(({webContents},zoom)=>{for(const contents of webContents.getAllWebContents())if(contents.getURL().includes('/dist/index.html')||contents.getURL().includes('127.0.0.1'))contents.setZoomFactor(zoom);},zoom);await page.getByRole('button',{name:'Context window',exact:true}).click();await page.waitForTimeout(100);const box=await page.getByRole('dialog',{name:'Context settings'}).boundingBox(),size=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1);await page.keyboard.press('Escape');await page.screenshot({path:`qa/custom4-native-zoom${zoom*100}.png`});}report.nativeZoom=true;
  await app.evaluate(({webContents})=>{for(const contents of webContents.getAllWebContents())contents.setZoomFactor(1);});
  const diagnostic=await page.evaluate(()=>window.grokDesktop.diagnostics());assert.ok(diagnostic.engineVersion);assert.equal(diagnostic.auth,undefined);report.diagnostics=true;
  if(exe){
    const catalog=await page.evaluate(()=>window.grokDesktop.historyCatalog());
    const testHits=await page.evaluate(()=>window.grokDesktop.searchHistory({query:'CUSTOM4_NATIVE_FILE_OK'}));
    const ids=new Set([...ownedSessions,...testHits.items.map(row=>row.id)]);
    try{ids.add(JSON.parse(fs.readFileSync('qa/native-goal-modes.json','utf8')).sessionId);}catch{}
    for(const row of catalog.sessions)if(ids.has(row.id)||row.title==='Desktop Custom 4 verification')await page.evaluate(row=>window.grokDesktop.archiveHistory({cwd:row.cwd,sessionId:row.id,archived:true}),row);
    const windowsBefore=app.windows();
    await new Promise((resolve,reject)=>{const launcher=spawn('cmd.exe',['/d','/c',path.join(os.homedir(),'.grok','launchers','grok.cmd')],{windowsHide:true,stdio:'ignore'});launcher.once('error',reject);launcher.once('exit',code=>code?reject(Error('Launcher failed')):resolve());});
    let launched;for(let i=0;i<200;i++){launched=app.windows().find(p=>!windowsBefore.includes(p)&&p.url().endsWith('/dist/index.html'));if(launched)break;await new Promise(r=>setTimeout(r,100));}assert.ok(launched);await ready(launched);assert.equal((await launched.evaluate(()=>window.grokDesktop.getInfo())).version,'1.4.7-custom.4');await launched.getByRole('button',{name:'New chat',exact:true}).click();await ready(launched);await launched.getByRole('textbox',{name:'Message',exact:true}).click();await launched.screenshot({path:'qa/custom4-installed-home.png'});report.grokLauncher=true;
  }
  report.qaSessions=ownedSessions;
  fs.writeFileSync(exe?'qa/custom4-installed.json':'qa/custom4-native.json',JSON.stringify(report,null,2));console.log('CUSTOM4_NATIVE_OK',JSON.stringify(report));
}finally{
  if(page&&!page.isClosed()&&originalMode)await page.evaluate(mode=>window.grokDesktop.setPermissionMode(mode),originalMode).catch(()=>{});
  if(file&&path.dirname(file)===info.defaultWorkspace&&path.basename(file).startsWith('custom4-qa-'))fs.unlinkSync(file);
  await app.close();
}
