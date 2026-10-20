import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installMockBridge} from './qa-bridge.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1200,height:850}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(installMockBridge);
await page.addInitScript(()=>{window.grokDesktop.getRunState=async()=>({sessionId:'session-atlas-001',active:true,connected:true,startedAt:Date.now()-31*60000,lastActivityAt:Date.now(),waitingPermissions:0});});
try {
  await page.goto('http://127.0.0.1:5180');await page.getByText('Connected',{exact:true}).waitFor();
  const input=page.getByRole('textbox',{name:'Message',exact:true});await input.fill('simulate-long');await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByText(/Long task running for 31 min/).waitFor();assert.equal(await input.isEnabled(),true);
  await input.click();await page.keyboard.insertText('draft remains editable');assert.equal(await input.inputValue(),'draft remains editable');
  await page.getByRole('button',{name:'Queue',exact:true}).click();await page.getByText('draft remains editable',{exact:true}).first().waitFor();
  await page.getByRole('button',{name:'Stop',exact:true}).click();await page.getByText(/Long task running/).waitFor({state:'hidden'});
  const next=await browser.newPage();await next.addInitScript(installMockBridge);
  await next.addInitScript(()=>{window.grokDesktop.getRunState=async()=>({sessionId:'session-atlas-001',active:true,connected:true,startedAt:Date.now()-6*60000,lastActivityAt:Date.now()-6*60000,waitingPermissions:0});});
  await next.goto('http://127.0.0.1:5180');await next.getByText('Connected',{exact:true}).waitFor();
  await next.getByRole('textbox',{name:'Message',exact:true}).fill('simulate-long');await next.getByRole('button',{name:'Send',exact:true}).click();
  await next.getByText(/No new engine activity for 6 min/).waitFor();
  let confirm=false;next.once('dialog',async dialog=>{confirm=true;await dialog.dismiss();});
  await next.getByRole('button',{name:'Restart engine',exact:true}).click();assert.equal(confirm,true);assert.equal(await next.getByRole('button',{name:'Stop',exact:true}).isVisible(),true);
  await next.getByRole('button',{name:'Stop',exact:true}).click();
  assert.deepEqual(errors,[]);fs.writeFileSync('qa/timeout-ui-smoke.json',JSON.stringify({longTurn:true,editableDraft:true,queue:true,stop:true,silentTurnHint:true,restartConfirmation:true},null,2));console.log('TIMEOUT_UI_OK');
}finally{await browser.close();}
