import fs from 'node:fs';
import {app} from 'electron';
import {GrokAcpClient} from '../electron/acp-client.mjs';
const cwd=process.cwd();
const client=new GrokAcpClient({cwd,permissionMode:'ask',sandboxTerminal:true});
client.on('error',()=>{});
const results={},updates=[];
const originalRequest=client.request.bind(client);
client.request=async(method,params,opts)=>{const result=await originalRequest(method,params,opts);if(['initialize','session/new'].includes(method))results[method]=result;return result;};
client.on('session-update',p=>{const u=p.update||p;if(['available_commands_update','config_option_update','current_mode_update'].includes(u.sessionUpdate))updates.push(p);});
try {
  await client.start();
  results.runtimeBefore=await client.getRuntimeState();
  results.context500k=await client.setContextWindow(500000);
  results.context256k=await client.setContextWindow(256000);
  for (const method of ['_x.ai/session/info','_x.ai/goal/status']) {
    try{results[method]=await client.request(method,{sessionId:client.sessionId},{timeoutMs:10000});}catch(e){results[method]={error:e.message};}
  }
  results.updates=updates;
  fs.writeFileSync('qa/composer-runtime-probe.json',JSON.stringify(results,null,2));
  console.log('PROBE_SAVED: session metadata and control-plane replies; no model prompt sent');
} finally {await client.dispose();app.exit();}
