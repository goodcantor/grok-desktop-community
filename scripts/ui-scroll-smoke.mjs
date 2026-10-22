import electronPath from 'electron';
import {captureNativeWindow} from './capture-window.mjs';
import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),out=path.join(root,'qa','ui-scroll');fs.mkdirSync(out,{recursive:true});
const env={...process.env,GROK_HARNESS_PROFILE:path.join(out,'profile-'+Date.now())};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:electronPath,args:['scripts/harness-native-bootstrap.cjs'],env,timeout:30000});let page;const cases=[],errors=[];
try{
 for(let i=0;i<100;i++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
 await page.locator('#boot-splash').waitFor({state:'detached'});page.on('pageerror',e=>errors.push(e.message));await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
 await page.waitForFunction(async()=>Boolean((await window.grokDesktop.executionList()).find(r=>r.selected)?.sessionId));
 const id=(await page.evaluate(()=>window.grokDesktop.executionList())).find(r=>r.selected).sessionId;
 const resize=async(width,zoom)=>{await app.evaluate(({BrowserWindow},{width,zoom})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html'));w.setSize(width,900);w.webContents.setZoomFactor(zoom);},{width,zoom});await page.waitForTimeout(100);};
 const snap=name=>captureNativeWindow(app,path.join(out,name+'.png'));
 const emit=async update=>app.evaluate((_,{id,update})=>global.__harnessAgents.get(id).emit('session-update',{sessionId:id,update}),{id,update});
 await resize(1365,1);
 for(let i=0;i<16;i++){await emit({sessionUpdate:'task_backgrounded',task_id:'past-'+i,description:'Serve the workspace folder on port '+(8917+i)});await emit({sessionUpdate:'task_completed',task_snapshot:{task_id:'past-'+i,exit_code:1}});}
 const card=page.locator('.chat-activity');await page.waitForFunction(()=>document.querySelector('.activity-panel-toggle')?.textContent.includes('16 past tasks'));
 assert.equal(await card.getAttribute('data-collapsed'),'true');assert.ok((await card.boundingBox()).height<64);await snap('01-past-tasks-default-collapsed');
 await page.getByRole('button',{name:'Expand task details',exact:true}).click();
 await card.locator('.activity-tasks .ui-disclosure-trigger').click();await page.getByRole('list',{name:'Background tasks',exact:true}).waitFor();
 assert.equal(await card.locator('.activity-task-list li').count(),16);
 for(const theme of ['dark','light'])for(const width of [800,1000,1365,1440])for(const zoom of [1,1.25,1.5,2]){
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await resize(width,zoom);
  const compact=await page.getByRole('button',{name:'Task details',exact:true}).isVisible();if(compact)await page.getByRole('button',{name:'Task details',exact:true}).click();
  const scrolling=await card.evaluate(root=>[...root.querySelectorAll('*')].filter(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+1).map(e=>e.className));
  assert.deepEqual(scrolling,['activity-extras'],JSON.stringify({theme,width,zoom,scrolling}));
  await snap(`expanded-${theme}-${width}-${zoom}`);cases.push({theme,width,zoom,scrolling});
  if(compact){await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'Task details',exact:true}).getAttribute('aria-expanded'),'false');}
 }
 await resize(1365,1);await card.locator('.activity-extras').evaluate(e=>e.scrollTop=e.scrollHeight);await snap('04-scroll-end-collapse-accessible');assert.equal(await page.getByRole('button',{name:'Collapse task details',exact:true}).isVisible(),true);await page.getByRole('button',{name:'Collapse task details',exact:true}).click();assert.ok((await card.boundingBox()).height<64);
 await emit({sessionUpdate:'task_backgrounded',task_id:'new-active',description:'New active background task'});assert.equal(await card.getAttribute('data-collapsed'),'true');await snap('02-manual-collapse-survives-updates');
 await page.getByRole('button',{name:'Expand task details',exact:true}).click();await page.getByRole('list',{name:'Background tasks',exact:true}).waitFor();
 await card.locator('.activity-tasks .ui-disclosure-trigger').click();assert.equal(await card.locator('.activity-task-list').count(),0);await snap('03-background-list-collapsed');
 await page.reload();await page.locator('#boot-splash').waitFor({state:'detached'});await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();await emit({sessionUpdate:'task_backgrounded',task_id:'after-reload',description:'After reload'});await page.getByRole('button',{name:'Collapse task details',exact:true}).waitFor();
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({cases,errors,pastTasksCollapsedByDefault:true,manualCollapsePreserved:true,childCollapseWorks:true,expandedPreferenceRestored:true},null,2));console.log(JSON.stringify({cases:cases.length,errors,out}));
}catch(e){await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw e;}
finally{await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;for(const a of global.__harnessAgents.values())a.cancel();}).catch(()=>{});await app.close();}
