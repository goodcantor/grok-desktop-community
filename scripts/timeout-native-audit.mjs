// Run with Electron: exercises the shipped ACP client without opening or
// restarting the user's Desktop, and without changing its UI preferences.
import {app} from 'electron';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {GrokAcpClient} from '../electron/acp-client.mjs';

const cwd=path.join(os.homedir(),'.grok','desktop-audit','timeout-qa');
fs.mkdirSync(cwd,{recursive:true});
app.setPath('userData',path.join(cwd,'electron-profile'));
await app.whenReady();
const report={},owned=[];
let agent;
const realNow=Date.now,realSetTimeout=globalThis.setTimeout,realClearTimeout=globalThis.clearTimeout;
const resetClock=()=>{Date.now=realNow;globalThis.setTimeout=realSetTimeout;globalThis.clearTimeout=realClearTimeout;};
const deadline=setTimeout(()=>{console.error('AUDIT_DEADLINE');void agent?.dispose().finally(()=>app.exit(1));},120000);
try {
  const fake=new GrokAcpClient({cwd});fake.sessionId='qa-wire-session';fake.ready=true;
  const out=[];fake.proc={killed:false,stdin:{writable:true,write(line){out.push(JSON.parse(line));}}};
  let now=1000,nextTimer=0;const timers=new Map();
  Date.now=()=>now;
  globalThis.setTimeout=(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,at:now+ms});return id;};
  globalThis.clearTimeout=id=>timers.delete(id);
  const turn=fake.prompt('wire probe');
  now+=31*60_000;for(const [id,t] of timers){if(t.at<=now){timers.delete(id);t.fn();}}
  assert.equal(fake.desktopPromptActive,true);
  await assert.rejects(fake.prompt('must not be sent'),/still working/);
  assert.equal(out.length,1);
  fake._onLine(JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{sessionId:fake.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'reply'}}}}));
  assert.equal(fake.getRunState().lastActivityAt,Date.now());
  fake.cancel();assert.equal(out.at(-1).method,'session/cancel');assert.equal(fake.desktopPromptActive,true);
  const progress=JSON.stringify({jsonrpc:'2.0',method:'session/update',params:{sessionId:fake.sessionId,update:{sessionUpdate:'agent_thought_chunk',content:{type:'text',text:'progress after early stop'}}}});
  fake._onLine(progress);fake._onLine(progress);
  assert.equal(out.filter(msg=>msg.method==='session/cancel').length,2);
  fake._onLine(JSON.stringify({jsonrpc:'2.0',id:out[0].id,result:{stopReason:'cancelled'}}));
  assert.equal((await turn).stopReason,'cancelled');assert.equal(fake.desktopPromptActive,false);
  const abandoned=fake.prompt('disposal probe');const rejected=assert.rejects(abandoned,/Agent disposed/);
  fake.proc=null;await fake.dispose();await rejected;assert.equal(fake.pending.size,0);
  resetClock();report.realClientSimulated31Minutes=true;report.cancelKeepsTrackingUntilReply=true;report.disposeUnblocksPrompt=true;

  agent=new GrokAcpClient({cwd,permissionMode:'auto',reasoningEffort:'high'});
  await agent.start();owned.push(agent.sessionId);
  const live=await agent.getRuntimeState();report.model=live.modelId;report.reasoning=live.reasoningEffort;
  let text='';agent.on('session-update',p=>{if(p.update?.sessionUpdate==='agent_message_chunk')text+=p.update.content?.text||'';});
  const prompt=agent.prompt('Reply exactly ACP_RUNTIME_OK. Do not use tools, skills, subagents or change any files.');
  assert.equal(agent.getRunState().active,true);
  await assert.rejects(agent.prompt('Do not send this'),/still working/);
  await prompt;assert.match(text,/ACP_RUNTIME_OK/);assert.equal(agent.getRunState().active,false);report.nativeReply=true;
  console.log('NATIVE_REPLY_OK');
  const term=agent.terminals.create({command:'node',args:['-e','process.stdout.write("TERMINAL_RUNTIME_OK")'],cwd,sessionId:agent.sessionId});
  const status=await agent.terminals.waitForExit({...term,sessionId:agent.sessionId});
  const output=agent.terminals.output({...term,sessionId:agent.sessionId}).output;
  assert.equal(status.exitCode,0,output);assert.match(output,/TERMINAL_RUNTIME_OK/);report.nativeTerminal=true;
  console.log('NATIVE_TERMINAL_OK');
  const cancelOnEcho=p=>{if(p.update?.sessionUpdate==='agent_message_chunk'||p.update?.sessionUpdate==='agent_thought_chunk')agent.cancel();};
  agent.on('session-update',cancelOnEcho);
  const stopped=await agent.prompt('Explain every prime number below 10000 in detail. Do not use tools or modify files.');
  agent.off('session-update',cancelOnEcho);assert.equal(stopped.stopReason,'cancelled');report.nativeStop=true;
  const disconnected=agent.prompt('Reply briefly; do not use any tools.');
  const failed=assert.rejects(disconnected,/Agent exited/);agent.proc.kill();await failed;
  assert.equal(agent.desktopPromptActive,false);report.nativeExit=true;
  report.ownedQaSessions=owned;report.userAppUntouched=true;
  fs.writeFileSync('qa/timeout-native-audit.json',JSON.stringify(report,null,2));
  console.log('TIMEOUT_NATIVE_AUDIT_OK',JSON.stringify(report));
} catch(e) {console.error(e.stack||String(e));process.exitCode=1;}
finally {resetClock();clearTimeout(deadline);await agent?.dispose();app.exit(process.exitCode||0);}
