import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const packaged=process.env.GROK_CUSTOM_TEST_EXE;
const devUrl=process.env.GROK_DESKTOP_DEV_URL||'http://127.0.0.1:5180';
let app,page,attachmentPath,initial;
async function launch(){
  app=await electron.launch({executablePath:packaged||'node_modules/electron/dist/electron.exe',args:packaged?[]:['.'],cwd:process.cwd(),env:{...process.env,GROK_DESKTOP_DEV_URL:devUrl},timeout:30000});
  for(let n=0;n<150;n++){page=app.windows().find(p=>p.url().includes(devUrl)||p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,200));}
  assert.ok(page);await page.getByText('Connected',{exact:true}).waitFor({timeout:60000});
}
async function choose(mode){await page.getByRole('button',{name:'Message mode',exact:true}).click();await page.getByRole('radio',{name:mode,exact:false}).click();await page.waitForFunction(m=>document.querySelector('.composer-mode-chip')?.dataset.mode===m,mode==='Plan mode'?'plan':'goal');}
async function send(text){await page.locator('textarea').fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();}
try{
  await launch();
  const before=await page.evaluate(()=>window.grokDesktop.historyCatalog());fs.writeFileSync('qa/composer-history-before.json',JSON.stringify(before.sessions.map(s=>({cwd:s.cwd,id:s.id})),null,2));
  await page.getByRole('button',{name:'New chat',exact:true}).click();await page.getByText('Connected',{exact:true}).waitFor({timeout:60000});
  initial=await page.evaluate(()=>window.grokDesktop.getRuntimeState());assert.ok(initial.context.total>0);assert.ok((await page.locator('.cwd').textContent()).includes('General'));
  await page.locator('textarea').fill('Check my PC without losing the draft.');
  await choose('Plan mode');assert.equal((await page.evaluate(()=>window.grokDesktop.getRuntimeState())).sessionMode,'plan');
  await choose('Goal');assert.equal((await page.evaluate(()=>window.grokDesktop.getRuntimeState())).sessionMode,'default');assert.equal(await page.locator('.composer-mode-chip').count(),1);assert.equal(await page.locator('textarea').inputValue(),'Check my PC without losing the draft.');
  await page.screenshot({path:'qa/composer-native-goal-selected.png'});
  await page.getByRole('button',{name:'Message mode',exact:true}).click();await page.getByRole('radio',{name:'Chat',exact:false}).click();await page.locator('.composer-mode-chip').waitFor({state:'detached'});await page.locator('textarea').fill('');
  await page.getByRole('button',{name:'Model and reasoning',exact:true}).click();
  await page.getByRole('radio',{name:'Grok 4.7 Fast',exact:true}).click();await page.getByRole('button',{name:'Model and reasoning',exact:true}).filter({hasText:'Grok 4.7 Fast'}).waitFor();
  await page.getByRole('radio',{name:'Extra High',exact:true}).click();await page.getByRole('button',{name:'Model and reasoning',exact:true}).filter({hasText:'Extra High'}).waitFor();
  await page.getByRole('radio',{name:'Grok 4.5',exact:true}).click();await page.getByRole('button',{name:'Model and reasoning',exact:true}).filter({hasText:'Grok 4.5'}).waitFor();
  assert.equal((await page.evaluate(()=>window.grokDesktop.getRuntimeState())).reasoningEffort,'high');
  const rejectedEffort=await page.evaluate(()=>window.grokDesktop.setReasoningEffort('xhigh'));assert.equal(rejectedEffort.agentSynced,false);assert.equal(rejectedEffort.effort,'high');assert.equal((await page.evaluate(()=>window.grokDesktop.getInfo())).reasoningEffort,'high');assert.equal(await page.getByRole('radio',{name:'Extra High',exact:true}).count(),0);
  await page.getByRole('radio',{name:initial.modelName,exact:true}).click();
  const effortLabel=initial.availableModels.find(m=>m.modelId===initial.modelId).reasoningEfforts.find(e=>e.value===initial.reasoningEffort).label;
  await page.getByRole('radio',{name:effortLabel,exact:true}).click();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Context window',exact:true}).click();await page.getByLabel('Context window size').selectOption('500000');await page.waitForFunction(async()=>{const s=await window.grokDesktop.getRuntimeState();return s.context.total===500000;});
  await page.screenshot({path:'qa/composer-native-context.png'});await page.keyboard.press('Escape');
  let rejected=false;try{await page.evaluate(()=>window.grokDesktop.setContextWindow(123));}catch{rejected=true;}assert.ok(rejected);assert.equal((await page.evaluate(()=>window.grokDesktop.getRuntimeState())).context.total,500000);
  const info=await page.evaluate(()=>window.grokDesktop.getInfo());attachmentPath=path.join(info.defaultWorkspace,'grok-composer-qa-'+crypto.randomUUID()+'.txt');
  const expected='COMPOSER_FILE_READ_OK_'+crypto.randomUUID().slice(0,8);fs.writeFileSync(attachmentPath,expected,{flag:'wx'});
  await app.evaluate(({dialog},file)=>{dialog.__composerOriginalOpenDialog=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},attachmentPath);
  await page.getByRole('button',{name:'Add attachments',exact:true}).click();await page.getByRole('button',{name:'Files',exact:false}).filter({hasText:'Attach local'}).click();
  await page.locator('.composer-file-chip').waitFor();
  await app.evaluate(({dialog})=>{dialog.showOpenDialog=dialog.__composerOriginalOpenDialog;delete dialog.__composerOriginalOpenDialog;});
  await send('Read only the attached local file. Do not edit anything. Do not use skills or subagents. Reply with exactly its contents.');
  // Existing Ask preferences stay intact; only the dedicated QA file read is approved.
  const until=Date.now()+90000;
  while(Date.now()<until){if(await page.locator('.timeline article.msg:not(.user)').filter({hasText:expected}).count())break;const allow=page.locator('.approvals-dock').getByRole('button',{name:'Allow once',exact:true});if(await allow.count())await allow.first().click();await page.waitForTimeout(200);}
  await page.locator('.timeline article.msg:not(.user)').filter({hasText:expected}).waitFor({timeout:1000});await page.getByText('Connected',{exact:true}).waitFor({timeout:30000});
  const live=await page.evaluate(()=>window.grokDesktop.getRuntimeState());assert.ok(live.context.used>0);assert.equal(live.context.total,500000);
  await page.getByRole('button',{name:'Context window',exact:true}).hover();await page.locator('.context-tooltip').waitFor({state:'visible'});assert.ok((await page.locator('.context-tooltip').textContent()).includes('500k'));
  await page.screenshot({path:'qa/composer-native-tooltip.png'});
  const catalog=await page.evaluate(()=>window.grokDesktop.historyCatalog());const row=catalog.sessions.find(s=>s.id===live.sessionId);assert.ok(row);await page.evaluate(s=>window.grokDesktop.renameSession({cwd:s.cwd,sessionId:s.id,title:'Composer UI check'}),row);
  await app.close();app=null;page=null;
  await launch();const restored=await page.evaluate(()=>window.grokDesktop.getRuntimeState());assert.equal(restored.sessionId,live.sessionId);assert.equal(restored.context.total,500000);await page.locator('.timeline article.msg:not(.user)').filter({hasText:expected}).waitFor();
  await page.getByRole('button',{name:'Context window',exact:true}).click();await page.getByLabel('Context window size').selectOption(String(initial.context.total));await page.keyboard.press('Escape');
  const search=await page.evaluate(query=>window.grokDesktop.searchHistory({query}),expected);assert.ok(search.items.some(i=>i.role==='assistant'));
  assert.equal(await page.locator('.error-banner').count(),0);
  const after=await page.evaluate(()=>window.grokDesktop.historyCatalog());for(const old of before.sessions)assert.ok(after.sessions.some(s=>s.cwd===old.cwd&&s.id===old.id));
  fs.writeFileSync(packaged?'qa/composer-installed.json':'qa/composer-native.json',JSON.stringify({packaged:Boolean(packaged),version:'1.4.7-custom.3',exclusiveModes:true,draftPreserved:true,nativeModelAndReasoning:true,unsupportedEffortFallsBack:true,context500kApplied:true,invalidWindowRejected:true,realAttachmentRead:true,contextFromEngine:true,contextAndChatSurviveRestart:true,originalContextRestored:true,historyRetained:before.sessions.length,search:true},null,2));
  console.log('NATIVE_COMPOSER_OK: modes, model and effort, real context selection/persistence, attachment read, history and search');
}finally{if(app)await app.close();if(attachmentPath&&path.dirname(attachmentPath)==='C:\\Users\\user\\Grok'&&path.basename(attachmentPath).startsWith('grok-composer-qa-'))fs.unlinkSync(attachmentPath);}
