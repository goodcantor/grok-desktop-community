import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const executablePath=process.env.GROK_CUSTOM_TEST_EXE;
if(!executablePath)throw Error('Set GROK_CUSTOM_TEST_EXE to the installed personal build');
let app,page,row,wasPinned=false;
async function launch(){app=await electron.launch({executablePath,args:[],cwd:process.cwd(),timeout:30000});for(let n=0;n<150;n++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,200));}assert.ok(page);await page.locator('#boot-splash').waitFor({state:'detached'});await page.locator('textarea:not(:disabled)').waitFor({timeout:60000});}
try{
  await launch();const catalog=await page.evaluate(()=>window.grokDesktop.historyCatalog());row=catalog.sessions.find(s=>s.title==='Grok Desktop UI check');assert.ok(row,'Dedicated QA conversation missing');wasPinned=catalog.pinned.includes(row.key);
  await page.evaluate(s=>window.grokDesktop.pinHistory({cwd:s.cwd,sessionId:s.id,pinned:true}),row);
  await app.close();app=null;page=null;
  await launch();await page.getByRole('heading',{name:'Pinned',exact:true}).waitFor();
  const catalogAfter=await page.evaluate(()=>window.grokDesktop.historyCatalog());assert.ok(catalogAfter.pinned.includes(row.key));
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html'));win.setSize(1000,760);});await page.screenshot({path:'qa/installed-small.png'});
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html'));win.setSize(1440,960);win.webContents.setZoomFactor(1.25);});await page.screenshot({path:'qa/installed-zoom125.png'});
  await app.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.webContents.setZoomFactor(1);});
  fs.writeFileSync('qa/installed-preferences.json',JSON.stringify({pinsSurviveProcessRestart:true,nativeResize:true,nativeZoom125:true},null,2));
  console.log('INSTALLED_PREFERENCES_OK: real IPC pins survive restart; native resize and 125% zoom');
}finally{if(app){if(row)await page.evaluate(({s,pinned})=>window.grokDesktop.pinHistory({cwd:s.cwd,sessionId:s.id,pinned}),{s:row,pinned:wasPinned}).catch(()=>{});await app.close();}}
