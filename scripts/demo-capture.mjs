/** Real renderer captures with explicit synthetic demo data; no model service. */
import {_electron as electron} from 'playwright-core';import electronPath from 'electron';import path from 'node:path';import fs from 'node:fs';import http from 'node:http';
const profile=path.resolve('qa/demo-'+Date.now()),env={...process.env,GROK_HARNESS_PROFILE:profile,GROK_HARNESS_DEMO:'1'};delete env.ELECTRON_RUN_AS_NODE;
const server=http.createServer((_request,response)=>{response.writeHead(200,{'content-type':'text/html'});response.end('<!doctype html><html><head><title>Community launch preview</title><style>body{margin:0;padding:48px 30px;font:16px system-ui;background:#f8f8f8;color:#222}small{letter-spacing:2px}h1{font-size:36px;line-height:1.1}p{line-height:1.7;color:#555}.card{background:white;border:1px solid #ddd;border-radius:14px;padding:20px;margin-top:30px}li{margin:14px 0}</style></head><body><small>GROK DESKTOP COMMUNITY</small><h1>Your conversations.<br>Your workspace.</h1><p>Keep independent chats moving. Review the details when you need them.</p><div class="card"><b>Preparing the first public beta</b><ul><li>Recoverable message queues</li><li>Native history and official CLI</li><li>Clear permissions and privacy</li></ul></div><p>Local demonstration page. No account data.</p></body></html>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const app=await electron.launch({executablePath:electronPath,args:['scripts/harness-native-bootstrap.cjs'],env});let page;
try{
 for(let i=0;i<120;i++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
 await page.locator('#boot-splash').waitFor({state:'detached'});await page.waitForFunction(async()=>(await window.grokDesktop.executionList()).some(row=>row.selected));
 await page.evaluate(()=>window.grokDesktop.setPrivacyMode(true));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html')).setSize(1440,960));
 const input=page.getByRole('textbox',{name:'Message',exact:true});await input.fill('Help me prepare a small desktop app for its first public beta.');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('button',{name:'Stop',exact:true}).waitFor();
 await app.evaluate(()=>{const agent=[...global.__harnessAgents.values()][0];global.__harnessFinish(agent.sessionId,'## A clear path to public beta\n\nStart with a release people can install, trust and report issues against.\n\n1. **Reliability:** recover interrupted messages and keep independent chats running.\n2. **Trust:** verify installer signatures and explain account privacy.\n3. **First use:** make the CLI setup, sign-in and first chat easy to follow.\n4. **Feedback:** publish known limits and a focused issue template.\n\nThe release checklist is ready for review.');});
 await page.waitForFunction(async()=>(await window.grokDesktop.executionQueue()).outcome?.status==='completed');
 await input.fill('Turn the checklist into a short launch announcement.');
 fs.mkdirSync('docs/screenshots',{recursive:true});await page.screenshot({path:'docs/screenshots/community-dark.png'});
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Day',exact:true}).click();await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.screenshot({path:'docs/screenshots/community-light.png'});
 await app.evaluate(()=>{[...global.__harnessAgents.values()][0].emit('user-question-request',{params:{questions:[{question:'Which release audience should we prioritize?',options:[{label:'Public beta',description:'Gather feedback with clear limits.'},{label:'Internal preview',description:'Test with a small group first.'}]}]},respond:()=>{}});});
 await page.getByRole('region',{name:'Agent requests'}).waitFor();await page.screenshot({path:'docs/screenshots/community-questions.png'});
 await page.getByRole('textbox',{name:'Your answer to Which release audience should we prioritize?',exact:true}).fill('Public beta with clear acceptance criteria.');
 await page.locator('.interaction-dock>div:not([hidden])').getByRole('button',{name:'Submit',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('.interaction-dock'));
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Night',exact:true}).click();await page.getByRole('button',{name:'Close settings',exact:true}).click();
 const first=(await page.evaluate(()=>window.grokDesktop.executionList())).find(row=>row.selected);
 await input.fill('Review the release checklist and identify missing evidence.');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('button',{name:'Stop',exact:true}).waitFor();
 await page.getByRole('button',{name:'New chat',exact:true}).click();
 await page.waitForFunction(async id=>(await window.grokDesktop.executionList()).some(row=>row.selected&&row.sessionId!==id),first.sessionId);
 await input.fill('Draft a concise first-run guide while the release review continues.');await page.getByRole('button',{name:'Send',exact:true}).click();
 await page.waitForFunction(async()=>(await window.grokDesktop.executionList()).filter(row=>row.active).length===2);
 await page.waitForFunction(()=>!document.querySelector('.sidebar')?.textContent.includes('harness-chat-2'));
 await page.screenshot({path:'docs/screenshots/community-parallel.png'});
 const second=(await page.evaluate(()=>window.grokDesktop.executionList())).find(row=>row.selected);
 await app.evaluate((_,row)=>{[...global.__harnessSessions.windowSessions.values()][0].win.webContents.send('app:select-execution',{cwd:row.cwd,sessionId:row.sessionId});},first);
 await page.waitForFunction(async id=>(await window.grokDesktop.executionList()).find(row=>row.selected)?.sessionId===id,first.sessionId);
 await page.getByRole('button',{name:'Activity',exact:true}).click();await page.getByRole('textbox',{name:'Search activity'}).waitFor();await page.screenshot({path:'docs/screenshots/community-activity.png'});
 await page.getByRole('button',{name:'Chat',exact:true}).click();
 await app.evaluate((_,row)=>{[...global.__harnessSessions.windowSessions.values()][0].win.webContents.send('app:select-execution',{cwd:row.cwd,sessionId:row.sessionId});},second);
 await page.waitForFunction(async id=>(await window.grokDesktop.executionList()).find(row=>row.selected)?.sessionId===id,second.sessionId);
 const browser=page.getByRole('tab',{name:'Browser',exact:true});if(await browser.isVisible())await browser.click();else await page.getByRole('button',{name:'Browser',exact:true}).click();
 await page.evaluate(url=>window.grokDesktop.openPreview(url),`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(async()=>JSON.stringify(await window.grokDesktop.previewSnapshot()).includes('Your conversations'));
 await app.evaluate(()=>{for(const agent of global.__harnessAgents.values())if(agent._qaRun.active)global.__harnessFinish(agent.sessionId,'The draft is ready to review. The public release remains gated on signing and native acceptance.');});
 await page.waitForTimeout(500);
 if((await page.locator('body').innerText()).includes('ERR_ABORTED'))throw Error('Browser navigation failed');
 const capture=await app.evaluate(async({BrowserWindow,desktopCapturer})=>{
  const win=BrowserWindow.getAllWindows().find(win=>win.webContents.getURL().endsWith('/dist/index.html'));win.show();win.focus();
  const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1440,height:960},fetchWindowIcons:false});
  const source=sources.find(row=>row.id===win.getMediaSourceId());if(!source||source.thumbnail.isEmpty())throw Error('Cannot capture the demo window');
  return source.thumbnail.toPNG().toString('base64');
 });
 fs.writeFileSync('docs/screenshots/community-browser.png',Buffer.from(capture,'base64'));
 console.log('DEMO_CAPTURES_OK');
}finally{await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;}).catch(()=>{});await app.close();await new Promise(resolve=>server.close(resolve));}
