import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installMockBridge} from './qa-bridge.mjs';
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],checks={};
page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(installMockBridge);
await page.addInitScript(()=>{
  window.__terminalRows=[];window.__terminalCreates=[];
  const api=window.grokDesktop;
  api.ptyShells=async()=>[{id:'powershell',name:'Windows PowerShell'}];api.ptyList=async()=>window.__terminalRows.map(t=>({...t}));
  api.ptyCreate=async({shell})=>{window.__terminalCreates.push(shell);if(shell!=='powershell')throw Error('Unavailable shell');const row={id:'terminal-'+window.__terminalCreates.length,shell,cwd:'C:\\Projects\\Atlas',exited:false};window.__terminalRows.push(row);return row;};
  api.ptyCommand=async({id,action})=>{if(action==='close')window.__terminalRows=window.__terminalRows.filter(t=>t.id!==id);return true;};
  api.compact=async()=>await new Promise(resolve=>{window.__finishCompact=()=>resolve({ok:true,tokens_before:125000,tokens_after:10000});});
});
try{
  await page.goto('http://127.0.0.1:5180');await page.locator('.topbar-connection .online').waitFor();const input=page.getByRole('textbox',{name:'Message',exact:true});
  await input.fill('Preserve this draft');await input.focus();await page.keyboard.press('Control+/');
  const dialog=page.getByRole('dialog',{name:'Keyboard shortcuts',exact:true});await dialog.waitFor();
  await page.getByRole('searchbox',{name:'Find a shortcut'}).fill('terminal');assert.equal(await dialog.locator('dt').count(),1);
  await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Close shortcuts'}).evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await input.inputValue(),'Preserve this draft');checks.shortcuts=true;
  await page.keyboard.press('Control+Shift+P');await page.getByRole('combobox',{name:'Find a command'}).fill('Keyboard shortcuts');await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Close commands'}).evaluate(e=>e===document.activeElement),true);await page.keyboard.press('Enter');assert.equal(await page.getByRole('dialog',{name:'Keyboard shortcuts',exact:true}).count(),0);checks.paletteCloseKeyboard=true;
  await page.keyboard.press('Control+Shift+P');await page.getByRole('combobox',{name:'Find a command'}).fill('Compress conversation');await page.keyboard.press('Enter');
  await page.locator('.activity-label').getByText('Compacting context',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Send',exact:true}).isDisabled(),true);assert.equal(await input.isEditable(),true);
  await input.fill('Draft while compacting');await input.press('Enter');assert.equal((await page.evaluate(()=>window.__qaActions.prompts)).length,0);
  await page.evaluate(()=>window.__finishCompact());await page.waitForFunction(()=>!document.querySelector('button[aria-label=Send]')?.disabled);assert.equal(await input.inputValue(),'Draft while compacting');checks.manualCompaction=true;
  await page.keyboard.press('Control+Shift+P');await page.getByRole('combobox',{name:'Find a command'}).fill('Terminal');await page.keyboard.press('Enter');
  await page.locator('.terminal-tab').waitFor();assert.deepEqual(await page.evaluate(()=>window.__terminalCreates),['powershell']);checks.shellFallback=true;
  const close=page.getByRole('button',{name:'Close terminal tab'});await close.focus();assert.equal(await close.evaluate(e=>e===document.activeElement),true);
  page.once('dialog',dialog=>dialog.accept());await page.keyboard.press('Enter');await page.getByRole('button',{name:'Start a terminal'}).waitFor();checks.keyboardCloseTerminal=true;
  await page.getByRole('button',{name:'Start a terminal'}).click();await page.locator('.terminal-tab').waitFor();assert.equal(await page.locator('.terminal-error').count(),0);const resize=page.getByRole('separator',{name:'Resize terminal',exact:true});await resize.focus();await resize.press('Home');assert.equal(await resize.getAttribute('aria-valuenow'),'100');await resize.press('ArrowUp');assert.equal(await resize.getAttribute('aria-valuenow'),'116');checks.keyboardTerminalResize=true;
  for(const width of [800,1000,1440])for(const zoom of [1,1.5,2]){
    const viewport={width:Math.round(width/zoom),height:Math.round(800/zoom)};await page.setViewportSize(viewport);
    const box=await input.boundingBox(),terminal=await page.locator('.terminal-dock').boundingBox();
    assert.ok(box.y>=0&&box.y+box.height<=viewport.height,`input ${width}/${zoom}`);
    assert.ok(terminal.y>=0&&terminal.y+terminal.height<=viewport.height+1,`terminal ${width}/${zoom}`);
  }checks.terminalGeometry=true;
  await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'Hide terminal'}).click();
  await page.getByTitle('Settings',{exact:true}).click();await page.getByRole('button',{name:'Chat',exact:true}).click();
  await page.getByRole('checkbox',{name:'Desktop notifications',exact:true}).waitFor();await page.getByRole('checkbox',{name:'Notification sound',exact:true}).check();await page.getByRole('checkbox',{name:'Desktop notifications',exact:true}).uncheck();assert.equal(await page.getByRole('checkbox',{name:'Notification sound',exact:true}).isDisabled(),true);checks.notificationPreferences=true;
  await page.screenshot({path:'qa/custom10-notifications.png'});await page.getByRole('button',{name:'Show all shortcuts'}).click();await page.getByRole('dialog',{name:'Keyboard shortcuts',exact:true}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'Settings',exact:true}).count(),0);checks.shortcutDiscovery=true;
  assert.deepEqual(errors,[]);fs.writeFileSync('qa/custom10-ui.json',JSON.stringify(checks,null,2));console.log('USABILITY_UI_OK',checks);
}catch(e){console.log(await page.evaluate(()=>[...document.querySelector('.main').children].map(e=>({class:e.className,height:e.getBoundingClientRect().height,y:e.getBoundingClientRect().y,flex:getComputedStyle(e).flex,minHeight:getComputedStyle(e).minHeight}))));await page.screenshot({path:'qa/custom10-failure.png'});throw e;}finally{await browser.close();}
