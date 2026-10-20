import {_electron as electron} from 'playwright-core';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const root=process.cwd(),version=JSON.parse(fs.readFileSync('package.json')).version;
const base=path.join(root,'qa','community-package-'+Date.now()),profile=path.join(base,'profile'),home=path.join(base,'grok-home'),cwd=path.join(base,'Demo workspace ü');
for(const dir of [profile,home,cwd])fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(cwd,'result.md'),'# Packaged file fixture\n');
const authFile=path.join(home,'auth.json');fs.writeFileSync(authFile,JSON.stringify({fixture:{key:'synthetic-fixture',email:'demo@example.invalid'}}));fs.chmodSync(authFile,0o600);const before=fs.readFileSync(authFile),mode=fs.statSync(authFile).mode;
fs.writeFileSync(path.join(profile,'desktop-state.json'),JSON.stringify({lastProject:cwd,recentProjects:[cwd],permissionMode:'ask',sandboxTerminal:true,allowOutsideProject:false,theme:'dark'}));
const candidates=process.platform==='win32'?['release/win-unpacked/Grok Desktop Community.exe']:process.platform==='darwin'?[`release/mac${process.arch==='arm64'?'-arm64':''}/Grok Desktop Community.app/Contents/MacOS/Grok Desktop Community`]:['release/linux-unpacked/grok-desktop-community'];
const executablePath=process.env.GROK_COMMUNITY_TEST_EXE||candidates.find(file=>fs.existsSync(file));assert.ok(executablePath,'Packaged app missing');
const server=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Community preview</title><input id="note" aria-label="Note">');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const env={...process.env,GROK_HOME:home,GROK_BINARY:path.join(base,'missing-cli'),GROK_DESKTOP_MULTI_INSTANCE:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.GROK_DESKTOP_DEV_URL;delete env.XAI_API_KEY;delete env.GROK_CODE_XAI_API_KEY;
const app=await electron.launch({executablePath,args:[`--user-data-dir=${profile}`,cwd],env});let page;const errors=[];
try{
 for(let i=0;i<180;i++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(page);page.on('pageerror',e=>errors.push(e.message));await page.locator('#boot-splash').waitFor({state:'detached'});
 const info=await page.evaluate(()=>window.grokDesktop.getInfo());assert.equal(info.version,version);assert.equal(path.resolve(info.userData),profile);assert.equal(info.auth.binaryFound,false);assert.equal(info.codingDataOptIn,null);
 if(process.env.GROK_EXPECT_DISTRIBUTION)assert.equal(info.distribution.channel,process.env.GROK_EXPECT_DISTRIBUTION);if(info.distribution.channel==='unsigned-preview')assert.equal(info.distribution.updates,'manual');
 if(info.distribution.channel==='unsigned-preview'){
  const messages=await app.evaluate(async({Menu,dialog})=>{const original=dialog.showMessageBox,seen=[];dialog.showMessageBox=async(...args)=>{seen.push(args.at(-1).message);return {response:1};};try{const find=menu=>{for(const item of menu.items){if(item.label==='Check for updates…')return item;const child=item.submenu&&find(item.submenu);if(child)return child;}};const item=find(Menu.getApplicationMenu());if(!item)throw Error('Update menu missing');item.click();for(let i=0;i<30&&!seen.length;i++)await new Promise(resolve=>setTimeout(resolve,25));return seen;}finally{dialog.showMessageBox=original;}});
  assert.ok(messages.includes('This build uses manual updates.'));
 }
 assert.deepEqual(fs.readFileSync(authFile),before);assert.equal(fs.statSync(authFile).mode,mode);
 const security=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html')).webContents.getLastWebPreferences());assert.equal(security.sandbox,true);assert.equal(security.contextIsolation,true);assert.equal(security.nodeIntegration,false);
 await page.evaluate(({cwd})=>window.grokDesktop.openSession({cwd,sessionId:'package-history-one',mode:'resume'}),{cwd});
 assert.equal((await page.evaluate(()=>window.grokDesktop.readFile('result.md'))).text.includes('fixture'),true);
 await page.evaluate(()=>{window.__pty='';window.grokDesktop.on('pty:event',e=>{if(e.event==='data')window.__pty+=e.data;});});
 const shell=(await page.evaluate(()=>window.grokDesktop.ptyShells())).find(s=>s.id==='powershell')||(await page.evaluate(()=>window.grokDesktop.ptyShells()))[0];assert.ok(shell);
 const tab=await page.evaluate(shell=>window.grokDesktop.ptyCreate({shell}),shell.id);
 const command=process.platform==='win32'?"Write-Output ('COMMUNITY_'+'PTY_OK')\r":"printf '%s%s\\n' 'COMMUNITY_' 'PTY_OK'\r";
 await page.evaluate(({id,data})=>window.grokDesktop.ptyCommand({id,action:'write',data}),{id:tab.id,data:command});await page.waitForFunction(()=>window.__pty.includes('COMMUNITY_PTY_OK'),null,{timeout:20000});
 // Declining quit must not kill a live user terminal.
 await app.evaluate(({app,dialog})=>{const old=dialog.showMessageBoxSync;dialog.showMessageBoxSync=()=>0;const event={preventDefault(){}};app.emit('before-quit',event);dialog.showMessageBoxSync=old;});
 assert.ok((await page.evaluate(()=>window.grokDesktop.ptyList())).some(row=>row.id===tab.id));
 await page.evaluate(id=>window.grokDesktop.ptyCommand({id,action:'close'}),tab.id);
 await page.evaluate(url=>window.grokDesktop.openPreview(url),`http://127.0.0.1:${server.address().port}`);
 const guest=await app.evaluate(async({webContents})=>{const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith('http://127.0.0.1:'));return wc.executeJavaScript("document.querySelector('#note').value='retained'; Promise.all([Promise.resolve(typeof window.grokDesktop),navigator.permissions.query({name:'geolocation'}).then(r=>r.state)])");});assert.deepEqual(guest,['undefined','denied']);
 await page.evaluate(({cwd})=>window.grokDesktop.openSession({cwd,sessionId:'package-history-two',mode:'resume'}),{cwd});assert.equal((await page.evaluate(()=>window.grokDesktop.executionList())).length,2);
 await page.evaluate(({cwd})=>window.grokDesktop.openSession({cwd,sessionId:'package-history-one',mode:'resume'}),{cwd});assert.match(JSON.stringify(await page.evaluate(()=>window.grokDesktop.previewSnapshot())),/retained/);
 assert.deepEqual(errors,[]);const report={version,platform:process.platform,arch:process.arch,scope:'Packaged shell, missing CLI, synthetic native home; no model prompts',distribution:info.distribution,installedPayload:Boolean(process.env.GROK_COMMUNITY_TEST_EXE&&!path.resolve(executablePath).startsWith(path.resolve('release')+path.sep)),isolatedPreferences:true,nativePrivacyUnchanged:true,rendererSandbox:true,nativePtyCommand:true,independentHistoryOwners:true,asarBrowserRetained:true,sitePermissionDenied:true,remoteBridgeAbsent:true,rendererErrors:errors,archiveSha256:crypto.createHash('sha256').update(fs.readFileSync(path.resolve(path.dirname(executablePath),process.platform==='darwin'?'../Resources/app.asar':'resources/app.asar'))).digest('hex')};fs.writeFileSync('qa/community-package.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await page?.screenshot({path:'qa/community-package-failure.png'}).catch(()=>{});throw e;}finally{await app.close();server.close();}
