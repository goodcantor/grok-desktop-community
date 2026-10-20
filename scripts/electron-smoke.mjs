import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const packaged=process.env.GROK_CUSTOM_TEST_EXE;
const app=await electron.launch({executablePath:packaged||'node_modules/electron/dist/electron.exe',args:packaged?[]:['.'],cwd:process.cwd(),env:{...process.env,GROK_DESKTOP_DEV_URL:process.env.GROK_DESKTOP_DEV_URL||'http://127.0.0.1:5178'},timeout:30000});
try{
  let page;
  const until=Date.now()+30000;
  while(Date.now()<until){page=app.windows().find(p=>p.url().includes(process.env.GROK_DESKTOP_DEV_URL||'http://127.0.0.1:5178')||p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,200));}
  assert.ok(page,'Main window did not load');
  await page.locator('#boot-splash').waitFor({state:'detached'});
  await page.locator('textarea:not(:disabled)').waitFor({timeout:60000});
  const state=await page.evaluate(async()=>{const info=await window.grokDesktop.getInfo();const catalog=await window.grokDesktop.historyCatalog();return{authenticated:info.auth.authenticated,expired:info.auth.expired,binary:info.grokBinary,history:catalog.sessions.length};});
  assert.equal(state.authenticated,true);assert.equal(state.expired,false);assert.ok(state.history>0);
  await page.screenshot({path:'qa/electron-home.png'});
  assert.equal(await page.locator('.topbar-title').textContent(),'Grok');
  await page.locator('textarea:not(:disabled)').waitFor({timeout:60000});
  await page.getByText('Connected',{exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await page.getByText('Connected',{exact:true}).waitFor({timeout:60000});
  await page.locator('textarea').fill('Это проверка персонального Grok Desktop. Не используй инструменты, навыки или субагентов. Ответь ровно: GROK_DESKTOP_CUSTOM_OK');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText('GROK_DESKTOP_CUSTOM_OK',{exact:true}).waitFor({timeout:90000});
  await page.getByText('Connected',{exact:true}).waitFor({timeout:30000});
  const sessions=await page.evaluate(()=>window.grokDesktop.historyCatalog());
  assert.ok(sessions.sessions.length>state.history);
  const search=await page.evaluate(()=>window.grokDesktop.searchHistory({query:'GROK_DESKTOP_CUSTOM_OK'}));assert.ok(search.items.length>0);
  const own=search.items.find(i=>i.role==='assistant');
  assert.ok(own,'Assistant reply must be searchable');
  await page.evaluate(row=>window.grokDesktop.renameSession({cwd:row.cwd,sessionId:row.id,title:'Grok Desktop UI check'}),own);
  await page.screenshot({path:'qa/electron-real-reply.png'});
  fs.writeFileSync(packaged?'qa/installed-result.json':'qa/electron-result.json',JSON.stringify({packaged:Boolean(packaged),nativeWindow:true,authenticated:state.authenticated,historyBefore:state.history,historyAfter:sessions.sessions.length,reply:'GROK_DESKTOP_CUSTOM_OK',searchResults:search.total},null,2));
  console.log('ELECTRON_SMOKE_OK: native window, real account, resume, new chat, model reply, shared history, real search');
}finally{await app.close();}
