import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const version=JSON.parse(fs.readFileSync('package.json','utf8')).version,tag='custom'+version.split('custom.').at(-1);
const root=process.cwd(),profile=path.resolve(`qa/${tag}-packaged-profile`),cwd=path.resolve(`qa/${tag}-packaged-workspace`);
fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(cwd,{recursive:true});
if(!fs.existsSync(path.join(profile,'desktop-state.json')))fs.writeFileSync(path.join(profile,'desktop-state.json'),JSON.stringify({lastProject:cwd,recentProjects:[cwd],permissionMode:'ask',sandboxTerminal:true,allowOutsideProject:false,uiZoom:1}));
const env={...process.env,GROK_DESKTOP_MULTI_INSTANCE:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.GROK_DESKTOP_DEV_URL;
const app=await electron.launch({executablePath:process.env.GROK_CUSTOM_TEST_EXE||'release-custom/win-unpacked/Grok Desktop Custom.exe',args:[`--user-data-dir=${profile}`,cwd],env,cwd:root}),checks={};let page;
try{
  for(let n=0;n<200;n++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(page);await page.locator('.topbar-connection .online').waitFor({timeout:60000});
  const info=await page.evaluate(()=>window.grokDesktop.getInfo());
  assert.equal(info.version,version);assert.equal(path.resolve(info.userData),profile);
  assert.equal(info.permissionMode,'ask');assert.equal(info.sandboxTerminal,true);assert.equal(info.allowOutsideProject,false);checks.accessPreferencesPreserved=true;
  await page.evaluate(()=>{window.__packagedPty='';window.__packagedErrors=[];window.grokDesktop.on('pty:event',e=>{if(e.event==='data')window.__packagedPty+=e.data;if(e.event==='error')window.__packagedErrors.push(e.error);});});
  const shells=await page.evaluate(()=>window.grokDesktop.ptyShells());assert.ok(shells.length);
  const tab=await page.evaluate(shell=>window.grokDesktop.ptyCreate({shell}),shells.find(s=>s.id==='powershell')?.id||shells[0].id);
  await page.evaluate(id=>window.grokDesktop.ptyCommand({id,action:'write',data:"Write-Output 'PACKAGED_PTY_OK'\r"}),tab.id);
  await page.waitForFunction(()=>window.__packagedPty.includes('PACKAGED_PTY_OK'),null,{timeout:20000});
  assert.deepEqual(await page.evaluate(()=>window.__packagedErrors),[]);checks.packagedNativePty=true;
  await page.evaluate(id=>window.grokDesktop.ptyCommand({id,action:'close'}),tab.id);
  assert.equal(await page.locator('.composer .activity-label').textContent(),'Ready');checks.composerStatus=true;
  const editor=await page.getByRole('textbox',{name:'Message',exact:true}).boundingBox();
  assert.ok(editor.height<=40,'packaged editor uses the compact single-line minimum');
  assert.equal(await page.locator('.composer-keyboard-hint').count(),0);checks.compactComposer=true;
  await page.evaluate(()=>window.grokDesktop.notificationPreferences({enabled:false,sound:true}));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile,'desktop-state.json'),'utf8')).notifications,{enabled:false,sound:true});checks.notificationPreferencesPersist=true;
  await page.evaluate(()=>window.grokDesktop.notificationPreferences({enabled:true,sound:false}));
  const link=path.join(process.env.APPDATA||'','Microsoft/Windows/Start Menu/Programs/Grok Desktop Custom.lnk');
  if(process.platform==='win32'&&fs.existsSync(link)){const identity=await app.evaluate(({shell},file)=>shell.readShortcutLink(file).appUserModelId,link);assert.equal(identity,'local.grok.desktop.custom');checks.windowsNotificationIdentity=true;}
  await page.screenshot({path:`qa/${tag}-packaged.png`});
  fs.writeFileSync(`qa/${tag}-packaged.json`,JSON.stringify({version:info.version,...checks},null,2));console.log('PACKAGED_OK',checks);
}finally{
  await page?.evaluate(async()=>{for(const t of await window.grokDesktop.ptyList())await window.grokDesktop.ptyCommand({id:t.id,action:'close'});}).catch(()=>{});
  await app.close();
}
