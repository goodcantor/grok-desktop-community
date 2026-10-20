import {_electron as electron} from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.GROK_AUDIT_DPI;
const args=['scripts/audit-app-bootstrap.cjs',path.resolve('qa/full-ui-workspace')];
let app;
async function launch(){
  app=await electron.launch({executablePath:'node_modules/electron/dist/electron.exe',args,env});
  let page;for(let i=0;i<150;i++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}assert.ok(page);await page.locator('.topbar-connection .online').waitFor({timeout:60000});return page;
}
try{
  let page=await launch();await page.evaluate(()=>window.grokDesktop.setZoom(1.25));await page.waitForTimeout(500);await app.close();app=null;
  page=await launch();assert.equal(await page.evaluate(()=>window.grokDesktop.getZoom()),1.25);
  if(await page.locator('.panel-close').isVisible())await page.locator('.panel-close').click();await page.getByRole('textbox',{name:'Message',exact:true}).click();await page.keyboard.press('Control+0');await page.waitForFunction(async()=>await window.grokDesktop.getZoom()===1);await page.waitForTimeout(500);
  fs.writeFileSync('qa/zoom-restart-native.json',JSON.stringify({zoomPersistedAfterRestart:true,keyboardReset:true},null,2));console.log('ZOOM_RESTART_NATIVE_OK');
}finally{await app?.close();}
