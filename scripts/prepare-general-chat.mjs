import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const executablePath=process.env.GROK_CUSTOM_TEST_EXE;
if(!executablePath)throw Error('Set GROK_CUSTOM_TEST_EXE');
const app=await electron.launch({executablePath,args:[],cwd:process.cwd(),timeout:30000});
try {
  let page;
  for(let n=0;n<150;n++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,200));}
  assert.ok(page);await page.getByText('Connected',{exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'Grok Desktop UI check',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('.topbar-title')?.textContent==='Royal-Muse');
  await page.getByText('Connected',{exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'General chat',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.topbar-title')?.textContent==='Grok');
  await page.getByText('Connected',{exact:true}).waitFor({timeout:60000});
  await page.getByRole('button',{name:'New chat',exact:true}).click();
  await page.getByRole('heading',{name:'What can I help with?',exact:true}).waitFor();
  await page.getByText('Connected',{exact:true}).waitFor({timeout:60000});
  assert.equal(await page.locator('.error-banner').count(),0);
  await page.screenshot({path:'qa/ready-for-user.png'});
  fs.writeFileSync('qa/general-chat-switch.json',JSON.stringify({openExistingProject:true,returnToGeneralChat:true,newBlankGeneralChat:true},null,2));
  console.log('GENERAL_CHAT_READY: switching from an existing project works; blank chat ready');
} finally {await app.close();}
