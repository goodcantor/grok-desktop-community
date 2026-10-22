import electronPath from 'electron';
import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {captureNativeWindow} from './capture-window.mjs';

// Real Electron layout and native preview chrome, with only the agent boundary mocked.
const baseline=process.env.GROK_LAYOUT_BASELINE==='1';
const out=path.resolve('qa',`ui-layout-${baseline?'before':'after'}`);
fs.mkdirSync(out,{recursive:true});
const server=http.createServer((_req,res)=>{res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Layout fixture</title><label>Note <input id="note"></label>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const env={...process.env,GROK_HARNESS_PROFILE:path.join(out,'profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:electronPath,args:['scripts/harness-native-bootstrap.cjs'],env,timeout:30000});
let page;const results=[],errors=[];
try{
  for(let i=0;i<150;i++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(page);page.on('pageerror',e=>errors.push(e.message));
  await page.locator('#boot-splash').waitFor({state:'detached'});
  await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
  const poll=async(fn,arg)=>{for(let i=0;i<150;i++){const value=await page.evaluate(fn,arg);if(value)return value;await page.waitForTimeout(100);}throw Error('Native state timed out');};
  const id=await poll(async()=>(await window.grokDesktop.executionList()).find(r=>r.selected)?.sessionId);
  const size=async(width,zoom)=>{await app.evaluate(({BrowserWindow},{width,zoom})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html'));w.setSize(width,725);w.webContents.setZoomFactor(zoom);},{width,zoom});await page.waitForTimeout(150);};
  const snap=name=>captureNativeWindow(app,path.join(out,name+'.png'));
  const longPath='C:\\Users\\user\\.grok\\sessions\\C%3A%5CUsers%5Cuser%5CDesktop%5CArtemSinergy\\01a14187-7dfc-7cc3-9abc\\very-long-plan-file-name.md';
  const markdown='| Item | DONE | DONE 02 | Why this one |\n| --- | --- | --- | --- |\n| Report | 752 | 839 | '+('Both documents contain the correct answers. '.repeat(14))+' |\n\nInline file: `'+longPath+'`\n\n```text\n'+longPath.repeat(3)+'\n```';
  await app.evaluate((_,{id,longPath,markdown})=>{const record=[...global.__harnessSessions.windowSessions.values()][0].selected;const at=Date.now();record.liveItems=[{id:'layout-tool',kind:'tool',toolCallId:'layout-tool',title:'Read '+longPath,raw:{file_path:longPath},status:'completed',at,endedAt:at+100},{id:'layout-answer',kind:'assistant',text:markdown,at:at+200}];record.win.webContents.send('app:select-execution',{cwd:record.lastCwd,sessionId:id});},{id,longPath,markdown});
  await page.locator('.timeline table').waitFor();
  const work=page.locator('.work-summary');if(await work.count())await work.evaluate(el=>el.open=true);
  for(const theme of ['dark','light'])for(const width of [800,1000,1365,1440])for(const zoom of [1,1.25,1.5,2]){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await size(width,zoom);
    await page.locator('.timeline').evaluate(el=>el.scrollTop=0);
    const metrics=await page.evaluate(()=>{const status=document.querySelector('.timeline .tool-status'),duration=document.querySelector('.timeline .tool-duration'),table=document.querySelector('.timeline table');return {statusHeight:status.getBoundingClientRect().height,durationHeight:duration.getBoundingClientRect().height,headings:[...table.querySelectorAll('th')].map(el=>({text:el.textContent,width:el.getBoundingClientRect().width,wrap:getComputedStyle(el).whiteSpace})),pageOverflow:document.documentElement.scrollWidth-innerWidth,bodyOverflow:document.querySelector('.timeline .body.markdown').scrollWidth-document.querySelector('.timeline .body.markdown').clientWidth,tableWidth:table.getBoundingClientRect().width,tableViewport:table.parentElement.clientWidth};});
    results.push({theme,width,zoom,...metrics});
    if(!baseline){assert.ok(metrics.statusHeight<=24,JSON.stringify(results.at(-1)));assert.ok(metrics.durationHeight<=22,JSON.stringify(results.at(-1)));assert.equal(metrics.pageOverflow,0);assert.equal(metrics.bodyOverflow,0);assert.ok(metrics.headings.every(h=>h.wrap==='nowrap'&&h.width>=45));}
    await snap(`messages-${theme}-${width}-${zoom}`);
  }
  await size(1365,1);
  const browserTab=page.getByRole('tab',{name:'Browser',exact:true});if(await browserTab.isVisible())await browserTab.click();else await page.getByRole('button',{name:'Browser',exact:true}).click();
  await page.evaluate(url=>window.grokDesktop.openPreview(url),`http://127.0.0.1:${server.address().port}`);
  if(!baseline)assert.equal(await page.locator('.error-banner').count(),0);
  const chrome=async(fn,arg)=>app.evaluate(async({webContents},{source,arg})=>{const wc=webContents.getAllWebContents().find(wc=>wc.getURL().includes('/preview/index.html'));if(!wc)throw Error('Native preview chrome missing');return wc.executeJavaScript(`(${source})(${JSON.stringify(arg)})`);},{source:fn.toString(),arg});
  for(let i=0;i<100;i++){if(await chrome(()=>Boolean(document.getElementById('url'))).catch(()=>false))break;await page.waitForTimeout(100);}
  for(const theme of ['dark','light'])for(const width of [800,1000,1365,1440])for(const zoom of [1,1.25,1.5,2]){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await chrome(theme=>document.documentElement.dataset.theme=theme,theme);await size(width,zoom);
    const metrics=await chrome(()=>{const bar=document.getElementById('bar');return {panelWidth:innerWidth,height:bar.getBoundingClientRect().height,overflow:bar.scrollWidth-innerWidth,addressWidth:document.getElementById('url').getBoundingClientRect().width};});
    if(!baseline){assert.ok(metrics.height<=38,JSON.stringify({width,zoom,...metrics}));assert.equal(metrics.overflow,0);assert.ok(metrics.addressWidth>=40);assert.ok((await page.locator('.panel-tabs').boundingBox()).height<=36);}
    results.push({browser:true,theme,width,zoom,...metrics});await snap(`browser-${theme}-${width}-${zoom}`);
  }
  if(!baseline){
    await chrome(()=>document.getElementById('tools-toggle').click());await page.waitForTimeout(100);
    assert.equal(await chrome(()=>document.getElementById('tools-toggle').getAttribute('aria-expanded')),'true');
    await chrome(()=>document.getElementById('snap').click());await page.waitForTimeout(200);
    assert.equal(await chrome(()=>document.getElementById('panel').hidden),false);await snap('browser-tools-snapshot');
    await chrome(()=>{document.getElementById('panel-close').click();document.getElementById('net').click();});await page.waitForTimeout(150);
    assert.equal(await chrome(()=>document.getElementById('network').hidden),false);await snap('browser-tools-network');
    await chrome(()=>{document.getElementById('net-close').click();document.getElementById('snap').focus();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
    assert.equal(await chrome(()=>document.getElementById('tools-toggle').getAttribute('aria-expanded')),'false');
    assert.equal(await chrome(()=>document.activeElement.id),'tools-toggle');
    await page.reload();await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
    assert.match(JSON.stringify(await page.evaluate(()=>window.grokDesktop.previewSnapshot())),/Layout fixture/);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({baseline,results,errors},null,2));console.log(JSON.stringify({baseline,checks:results.length,out}));
}finally{await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;for(const a of global.__harnessAgents.values())a.cancel();}).catch(()=>{});await app.close();server.close();}
