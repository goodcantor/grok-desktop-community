import {executionHasActiveWork} from '../electron/execution-work.mjs';
import {validateQueue} from '../electron/queue-store.mjs';
import {configureCommunityDataPath} from '../electron/app-identity.mjs';
import {installedPtyShells} from '../electron/pty-shells.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';
import {ExecutionQueue} from '../electron/execution-queue.mjs';
import {assertApplicationSender} from '../electron/ipc-trust.mjs';
import {configurePreviewPermissions} from '../electron/preview-permissions.mjs';
import {terminalIsolationStatus} from '../electron/terminal-isolation.mjs';
import {configureCommunityUpdater,installCommunityUpdate,COMMUNITY_FEED} from '../electron/update-controller.mjs';
import {summarizeSessionUpdate,sanitizeLogData} from '../electron/debug-log.mjs';
import {pathToFileURL} from 'node:url';import path from 'node:path';
const tick=()=>new Promise(resolve=>setImmediate(resolve));const entry=id=>({id,text:id,images:[],at:0});
test('failed connection survives a second process without replay',async()=>{
 let disk=[entry('legacy')],calls=0;
 const q=new ExecutionQueue({initial:disk,persist:v=>{disk=structuredClone(v)},deliver:async()=>{calls++;throw Error('connect failed');},cancel(){}});
 q.update({action:'pause',paused:false});await tick();assert.equal(disk.failed.id,'legacy');assert.equal(disk.inFlight,null);
 const restored=new ExecutionQueue({initial:disk,deliver:async()=>{calls++},cancel(){}});restored.drain();assert.equal(restored.failed.id,'legacy');assert.equal(restored.paused,true);assert.equal(calls,1);
});
test('crash between durable admission and native completion keeps an uncertain delivery',async()=>{
 let disk;const q=new ExecutionQueue({persist:v=>{disk=structuredClone(v)},deliver:()=>new Promise(()=>{}),cancel(){}});
 await q.submit(entry('active'));assert.equal(disk.inFlight.id,'active');
 const restored=new ExecutionQueue({initial:disk,deliver:async()=>{throw Error('must not run')},cancel(){}});restored.drain();assert.equal(restored.failed.id,'active');assert.equal(restored.failed.interrupted,true);
});
test('persist failure refuses initial delivery',async()=>{let calls=0;const q=new ExecutionQueue({persist:()=>{throw Error('disk full')},deliver:async()=>{calls++},cancel(){}});await assert.rejects(q.submit(entry('one')),/disk full/);assert.equal(calls,0);});
test('multiple failures remain recoverable',async()=>{let disk;const q=new ExecutionQueue({persist:v=>{disk=structuredClone(v)},deliver:async()=>{throw Error('offline')},cancel(){}});await q.submit(entry('one'));await tick();await q.submit(entry('two'));await tick();assert.equal(disk.failed.id,'two');assert.equal(disk.pending[0].id,'one');assert.equal(disk.pending[0].deliveryUncertain,true);});
test('site permission checks and requests deny host devices',()=>{const functions={};const session={setPermissionCheckHandler:f=>functions.check=f,setPermissionRequestHandler:f=>functions.request=f,setDevicePermissionHandler:f=>functions.device=f};configurePreviewPermissions(session);assert.equal(functions.check(),false);assert.equal(functions.device(),false);let decision;functions.request(null,'media',value=>{decision=value});assert.equal(decision,false);});
test('Windows host fallback is never represented as isolated',()=>{assert.equal(terminalIsolationStatus(true,{available:true,backend:'win-host'}).effective,'unavailable');assert.equal(terminalIsolationStatus(false,{backend:'bwrap'}).effective,'host');assert.equal(terminalIsolationStatus(true,{available:true,backend:'bwrap'}).effective,'isolated');});
test('IPC rejects subframes, foreign contents and unexpected documents',()=>{const frame={url:pathToFileURL(path.resolve('dist/index.html')).href},wc={mainFrame:frame},win={webContents:wc,isDestroyed:()=>false};const options={window:win,appPath:process.cwd()};assert.doesNotThrow(()=>assertApplicationSender({sender:wc,senderFrame:frame},options));assert.throws(()=>assertApplicationSender({sender:wc,senderFrame:{url:frame.url}},options));frame.url='https://untrusted.invalid';assert.throws(()=>assertApplicationSender({sender:wc,senderFrame:frame},options));});
test('updater uses only Community and never silently installs',()=>{const u={setFeedURL:value=>{u.feed=value}};configureCommunityUpdater(u,true);assert.deepEqual(u.feed,COMMUNITY_FEED);assert.equal(u.autoDownload,false);assert.equal(u.autoInstallOnAppQuit,false);assert.equal(u.allowDowngrade,false);});
test('update guard declines without invoking installer',async()=>{let installed=0,unlocked=0;const result=await installCommunityUpdate({updater:{quitAndInstall(){installed++}},prepare:async()=>false,markInstalling(){},unlock:async()=>{unlocked++}});assert.equal(result,false);assert.equal(installed,0);assert.equal(unlocked,1);});
test('installer failure releases update lock',async()=>{let locked=false,unlocked=false;await assert.rejects(installCommunityUpdate({updater:{quitAndInstall(){throw Error('bad signature')}},prepare:async()=>true,markInstalling:v=>{locked=v},unlock:async()=>{unlocked=true}}),/bad signature/);assert.equal(locked,false);assert.equal(unlocked,true);});
test('standard tool summaries contain no command or arbitrary tool title',()=>{const value=summarizeSessionUpdate({update:{title:'secret title',rawInput:{command:'secret command'},sessionUpdate:'tool_call'}});assert.equal(value.command,undefined);assert.equal(JSON.stringify(value).includes('secret'),false);});

test('diagnostic records discard commands, args, env and credential fields',()=>{const value=sanitizeLogData({command:'secret',args:['secret'],env:{token:'secret'},error:'secret',status:'failed',code:1});assert.deepEqual(value,{status:'failed',code:1});});

test('POSIX terminals discover native shells without Windows executables',()=>{for(const platform of ['darwin','linux']){const shells=installedPtyShells({platform,env:{SHELL:'/bin/bash'},exists:()=>true});assert.ok(shells.length);assert.ok(shells.every(shell=>shell.path.startsWith('/')));assert.equal(new Set(shells.map(shell=>shell.path)).size,shells.length);}});

test('Community uses its own UI directory and preserves isolated profiles',()=>{for(const custom of [false,true]){let data=custom?path.resolve('qa/isolated'):path.resolve('qa/app-data/Grok Desktop Community');const app={getName:()=> 'Grok Desktop Community',getPath:key=>key==='userData'?data:path.resolve('qa/app-data'),setPath:(_key,value)=>{data=value}};configureCommunityDataPath(app);assert.equal(data,custom?path.resolve('qa/isolated'):path.resolve('qa/app-data/grok-desktop-community'));}});

test('invalid recovery data is rejected instead of overwritten',()=>{assert.throws(()=>validateQueue({version:99}),/retained/);assert.throws(()=>validateQueue({version:2,pending:[{id:'one',text:'one',images:null}]}),/retained/);assert.deepEqual(validateQueue([entry('legacy')]),[entry('legacy')]);});

test('close/update guards include goals and background work between prompt turns',()=>{
 const agent={ready:true,getRunState:()=>({active:false}),goalState:{status:'active'}};
 assert.equal(executionHasActiveWork({agent}),true);agent.goalState.status='paused';assert.equal(executionHasActiveWork({agent}),false);
 assert.equal(executionHasActiveWork({agent,backgroundTasks:[{status:'running'}]}),true);
 assert.equal(executionHasActiveWork({agent:{...agent,ready:false},backgroundTasks:[{status:'running'}]}),false);
 assert.equal(executionHasActiveWork({pendingUserQuestions:new Map([['one',{}]])}),true);
});
