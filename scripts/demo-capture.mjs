/** Real renderer captures with explicit synthetic demo data; no model service. */
import {_electron as electron} from 'playwright-core';import electronPath from 'electron';import path from 'node:path';import fs from 'node:fs';
const profile=path.resolve('qa/demo-'+Date.now()),env={...process.env,GROK_HARNESS_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({executablePath:electronPath,args:['scripts/harness-native-bootstrap.cjs'],env});let page;
try{
 for(let i=0;i<120;i++){page=app.windows().find(p=>p.url().endsWith('/dist/index.html'));if(page)break;await new Promise(r=>setTimeout(r,100));}
 await page.locator('#boot-splash').waitFor({state:'detached'});await page.waitForFunction(async()=>(await window.grokDesktop.executionList()).some(row=>row.selected));
 await page.evaluate(()=>window.grokDesktop.setPrivacyMode(true));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html')).setSize(1440,960));
 const input=page.getByRole('textbox',{name:'Message',exact:true});await input.fill('Help me prepare a small desktop app for its first public beta.');await page.getByRole('button',{name:'Send',exact:true}).click();await page.getByRole('button',{name:'Stop',exact:true}).waitFor();
 await app.evaluate(()=>{const agent=[...global.__harnessAgents.values()][0];global.__harnessFinish(agent.sessionId,'## A clear path to public beta\n\nStart with a release people can install, trust and report issues against.\n\n1. **Reliability:** recover interrupted messages and keep independent chats running.\n2. **Trust:** verify installer signatures and explain account privacy.\n3. **First use:** make the CLI setup, sign-in and first chat easy to follow.\n4. **Feedback:** publish known limits and a focused issue template.\n\nThe release checklist is ready for review.');});
 await page.waitForFunction(async()=>(await window.grokDesktop.executionQueue()).outcome?.status==='completed');
 await input.fill('Turn the checklist into a short launch announcement.');
 fs.mkdirSync('docs/screenshots',{recursive:true});await page.screenshot({path:'docs/screenshots/community-dark.png'});
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('button',{name:'Day',exact:true}).click();await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.screenshot({path:'docs/screenshots/community-light.png'});
 await app.evaluate(()=>{[...global.__harnessAgents.values()][0].emit('user-question-request',{params:{questions:[{question:'Which release audience should we prioritize?',options:[{label:'Public beta',description:'Gather feedback with clear limits.'},{label:'Internal preview',description:'Test with a small group first.'}]}]},respond:()=>{}});});
 await page.getByRole('region',{name:'Agent requests'}).waitFor();await page.screenshot({path:'docs/screenshots/community-questions.png'});
 console.log('DEMO_CAPTURES_OK');
}finally{await app.evaluate(({dialog})=>{dialog.showMessageBoxSync=()=>1;}).catch(()=>{});await app.close();}
