import {chromium} from 'playwright-core';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {installMockBridge} from './qa-bridge.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(installMockBridge);
async function choose(mode){await page.getByRole('button',{name:'Message mode',exact:true}).click();await page.getByRole('radio',{name:mode,exact:false}).click();await page.waitForFunction(mode=>document.querySelector('.composer-mode-chip')?.dataset.mode===mode.toLowerCase().replace(' mode',''),mode);}
async function send(text){if(text!==undefined)await page.locator('textarea').fill(text);await page.getByRole('button',{name:'Send',exact:true}).click();}
try{
  await page.goto(process.env.GROK_DESKTOP_DEV_URL||'http://127.0.0.1:5180');await page.getByText('Connected',{exact:true}).waitFor();
  assert.equal(await page.locator('.composer-settings').evaluate(e=>getComputedStyle(e).display),'flex','Current composer CSS must be loaded');
  await page.locator('textarea').fill('Почини Bluetooth, сохрани мои настройки.');
  await choose('Plan mode');assert.equal(await page.locator('textarea').inputValue(),'Почини Bluetooth, сохрани мои настройки.');
  await page.screenshot({path:'qa/composer-plan.png'});
  await choose('Goal');assert.equal(await page.locator('.composer-mode-chip').count(),1);assert.equal(await page.locator('.composer-mode-chip[data-mode="plan"]').count(),0);
  await choose('Goal');assert.equal(await page.locator('.composer-mode-chip').count(),1);assert.equal(await page.locator('textarea').inputValue(),'Почини Bluetooth, сохрани мои настройки.');
  await send();await page.waitForFunction(()=>window.__qaActions.prompts.length===1);
  assert.equal((await page.evaluate(()=>window.__qaActions.prompts))[0],'/goal Почини Bluetooth, сохрани мои настройки.');
  await page.locator('.composer-mode-chip').filter({hasText:'Goal · Active'}).waitFor();
  await send('First explain the cause');await page.waitForFunction(()=>window.__qaActions.prompts.length===2);
  assert.equal((await page.evaluate(()=>window.__qaActions.prompts))[1],'First explain the cause');
  await choose('Plan mode');const actions=await page.evaluate(()=>window.__qaActions);assert.equal(actions.prompts.at(-1),'/goal pause');assert.equal(actions.modes.at(-1),'plan');assert.equal(await page.locator('.composer-mode-chip').count(),1);
  await page.getByRole('button',{name:'Message mode',exact:true}).click();await page.getByRole('radio',{name:'Chat',exact:false}).click();await page.locator('.composer-mode-chip').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Model and reasoning',exact:true}).click();await page.getByRole('radio',{name:'Grok Build Fast',exact:true}).click();
  await page.getByRole('radio',{name:'High',exact:true}).click();await page.getByRole('button',{name:'Model and reasoning',exact:true}).filter({hasText:'High'}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Model and reasoning settings'}).count(),0);
  await page.getByRole('button',{name:'Context window',exact:true}).hover();await page.getByRole('tooltip').filter({hasText:'25% used (75% left)'}).waitFor();assert.ok((await page.getByRole('tooltip').textContent()).includes('125k / 500k'));
  await page.screenshot({path:'qa/composer-context-tooltip.png'});
  await page.getByRole('button',{name:'Context window',exact:true}).click();await page.getByLabel('Context window size').selectOption('256000');await page.getByText('49% used',{exact:false}).waitFor();await page.screenshot({path:'qa/composer-context-settings.png'});
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Tool permission mode',exact:true}).click();await page.getByRole('radio',{name:'Auto approvals',exact:false}).click();await page.locator('.composer-access').filter({hasText:'Auto approvals'}).waitFor();
  await page.screenshot({path:'qa/composer-access.png'});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Add attachments',exact:true}).click();await page.getByRole('button',{name:'Files',exact:false}).filter({hasText:'Attach local'}).click();await page.getByRole('button',{name:'Remove notes.txt'}).waitFor();
  await page.getByRole('button',{name:'Add attachments',exact:true}).click();await page.getByRole('button',{name:'Folders',exact:false}).click();await page.getByRole('button',{name:'Remove assets'}).waitFor();
  await page.getByRole('button',{name:'Remove assets'}).click();await send('Read the attachment');await page.waitForFunction(()=>window.__qaActions.prompts.at(-1).includes('notes.txt'));assert.ok((await page.evaluate(()=>window.__qaActions.prompts.at(-1))).includes('Attached local files and folders:'));
  const textarea=page.locator('textarea'),small=await textarea.evaluate(e=>e.getBoundingClientRect().height);await textarea.fill(Array.from({length:14},(_,n)=>'Line '+n).join('\n'));assert.ok(await textarea.evaluate(e=>e.getBoundingClientRect().height)>small);await textarea.fill('');
  await page.getByRole('button',{name:'Add attachments',exact:true}).click();await page.screenshot({path:'qa/composer-add-menu.png'});await page.keyboard.press('Escape');
  await page.locator('textarea').fill('/plan /goal A single objective');await choose('Plan mode');assert.equal(await page.locator('textarea').inputValue(),'A single objective');assert.equal(await page.locator('.composer-mode-chip').count(),1);
  for(const size of [{width:1000,height:760},{width:800,height:650}]){await page.setViewportSize(size);await page.getByRole('button',{name:'Model and reasoning',exact:true}).click();await page.screenshot({path:`qa/composer-${size.width}.png`});const box=await page.getByRole('dialog',{name:'Model and reasoning settings'}).boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.width);await page.keyboard.press('Escape');}
  await page.evaluate(()=>document.body.style.zoom='1.25');await page.screenshot({path:'qa/composer-zoom125.png'});
  assert.deepEqual(errors,[]);fs.writeFileSync('qa/composer-browser.json',JSON.stringify({exclusiveModes:true,preservesDraft:true,noDuplicateGoalPrefix:true,pausesGoalBeforePlan:true,modelAndReasoningInComposer:true,contextTooltip:true,contextSelection:true,permissionsInComposer:true,filesAndFolders:true,autoGrowingInput:true,popoverBounds:true},null,2));
  console.log('COMPOSER_SMOKE_OK: modes, real payload shapes, context, model, effort, access, attachments, growing textarea and popover bounds');
}finally{await browser.close();}
