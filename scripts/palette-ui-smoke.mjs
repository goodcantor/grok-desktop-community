import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {installMockBridge} from './qa-bridge.mjs';

const browser=await chromium.launch({channel:'chrome',headless:true}),checks={},errors=[];
function rgb(value){return (value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);}
function luminance(value){return rgb(value).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const expected={dark:{bg:'rgb(23, 24, 25)',accent:'rgb(236, 236, 236)'},light:{bg:'rgb(255, 255, 255)',accent:'rgb(37, 38, 41)'}};
try{
  for(const theme of ['dark','light']){
    const splash=await browser.newPage({viewport:{width:610,height:430}});splash.on('pageerror',e=>errors.push(e.message));
    await splash.goto(pathToFileURL(path.resolve('electron/splash.html')).href+'?theme='+theme);
    const boot=await splash.evaluate(()=>({bg:getComputedStyle(document.body).backgroundColor,ring:getComputedStyle(document.querySelector('.boot-spin')).borderTopColor,text:getComputedStyle(document.body).color,muted:getComputedStyle(document.querySelector('.inner span')).color,shared:getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim()}));
    assert.ok(boot.shared.length>0,'native splash loaded the shared stylesheet');assert.equal(boot.bg,expected[theme].bg);assert.equal(boot.ring,expected[theme].accent);assert.ok(contrast(boot.text,boot.bg)>=4.5);assert.ok(contrast(boot.muted,boot.bg)>=4.5);
    await splash.screenshot({path:`qa/custom11-splash-${theme}.png`});await splash.close();
    const preview=await browser.newPage();await preview.route('**/preview.js',route=>route.abort());await preview.goto(pathToFileURL(path.resolve('electron/preview/index.html')).href);await preview.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);assert.equal(await preview.evaluate(()=>getComputedStyle(document.body).backgroundColor),boot.bg);await preview.close();

    const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(installMockBridge);await page.addInitScript(theme=>{localStorage.setItem('grok-desktop-theme',theme);const info=window.grokDesktop.getInfo;window.grokDesktop.getInfo=async()=>({...await info(),theme});},theme);
    // Inspect the actual reload overlay before React dismisses it.
    await page.route('**/src/main.tsx',route=>route.abort());await page.goto('http://127.0.0.1:5180');
    const overlay=await page.locator('.boot-spin').evaluate(el=>({ring:getComputedStyle(el).borderTopColor,bg:getComputedStyle(document.querySelector('.boot-splash')).backgroundColor}));assert.equal(overlay.ring,boot.ring);assert.equal(overlay.bg,boot.bg);
    await page.screenshot({path:`qa/custom11-overlay-${theme}.png`});await page.unroute('**/src/main.tsx');await page.reload();await page.locator('.topbar-connection .online').waitFor();await page.locator('#boot-splash').waitFor({state:'detached'});
    const colors=await page.evaluate(()=>{
      const style=getComputedStyle(document.documentElement),tokens={};
      for(const name of ['--text','--text-muted','--success','--warn','--danger']){const span=document.createElement('span');span.style.color=`var(${name})`;document.body.append(span);tokens[name]=getComputedStyle(span).color;span.remove();}
      return {bg:getComputedStyle(document.body).backgroundColor,card:style.getPropertyValue('--bg-elevated').trim(),tokens};
    });assert.equal(colors.bg,boot.bg);
    const card=colors.card.startsWith('#')?'rgb('+[1,3,5].map(i=>parseInt(colors.card.slice(i,i+2),16)).join(', ')+')':colors.card;
    for(const [name,color]of Object.entries(colors.tokens)){assert.ok(contrast(color,colors.bg)>=4.5,`${theme} ${name} contrast on background`);assert.ok(contrast(color,card)>=4.5,`${theme} ${name} contrast on card`);}
    await page.screenshot({path:`qa/custom11-shell-${theme}.png`});checks[theme]={splashMatchesOverlay:true,splashMatchesShell:true,textAndStatusContrast:true};await page.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync('qa/custom11-palette.json',JSON.stringify(checks,null,2));console.log('PALETTE_OK',checks);
}finally{await browser.close();}
