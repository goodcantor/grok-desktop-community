// Isolated native shell. Only the agent/network boundary is simulated; IPC, files, PTY and browser are real.
const {app,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),workspace=path.join(root,'qa','harness-workspace');
fs.mkdirSync(workspace,{recursive:true});fs.writeFileSync(path.join(workspace,'result.md'),'# Harness native fixture\n');
app.disableHardwareAcceleration();
if(process.env.GROK_AUDIT_DPI)app.commandLine.appendSwitch('force-device-scale-factor',process.env.GROK_AUDIT_DPI);
app.setPath('userData',process.env.GROK_HARNESS_PROFILE||path.join(root,'qa','harness-native-profile'));
fs.mkdirSync(app.getPath('userData'),{recursive:true});
app.getAppPath=()=>root;
process.env.GROK_BINARY=process.execPath;
process.env.GROK_HOME=path.join(app.getPath('userData'),'native-home');
app.getVersion=()=>JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
process.env.GROK_DESKTOP_MULTI_INSTANCE='1';
process.env.GROK_DESKTOP_DEV_URL=pathToFileURL(path.join(root,'dist','index.html')).href;
const profileState=path.join(app.getPath('userData'),'desktop-state.json');
if(!fs.existsSync(profileState))fs.writeFileSync(profileState,JSON.stringify({custom8AccessMigration:true,lastProject:workspace,recentProjects:[workspace],permissionMode:'ask',reasoningEffort:'high',sandboxTerminal:true,allowOutsideProject:false,uiZoom:1,notifications:{enabled:false}}));
const auth={authenticated:true,expired:false,binaryFound:true,displayName:'Native QA',method:'qa'};
global.__harnessAgents=new Map();global.__harnessAnswers=[];
const original=ipcMain.handle.bind(ipcMain);
ipcMain.handle=(channel,handler)=>original(channel,async(event,...args)=>{
  if(channel==='auth:status')return auth;
  if(channel==='project:open'&&global.__harnessSessions){
    const host=[...global.__harnessSessions.windowSessions.values()].find(owner=>owner.win.webContents===event.sender),selected=host?.selected;
    if((!args[1]?.mode||args[1].mode==='continue')&&selected?.lastSessionId&&selected.lastCwd===args[0])args[1]={...args[1],mode:'resume',sessionId:selected.lastSessionId};
  }

  if(channel==='app:get-info'){const result=await handler(event,...args);return {...result,auth,defaultWorkspace:workspace};}
  if(channel==='backbone:inspect')return {ok:true,skills:[],mcpServers:[],plugins:[]};
  if(channel==='history:catalog')return {sessions:[...global.__harnessAgents.values()].map(agent=>({id:agent.sessionId,cwd:agent.cwd,key:agent.cwd+'\0'+agent.sessionId,title:agent._qaTitle||agent.sessionId,available:true,numMessages:agent._qaMessages.length,modelId:'grok-qa',lastActiveAt:new Date().toISOString()})),pinned:[],collapsed:[],archived:[]};
  return handler(event,...args);
});
(async()=>{
  const {GrokAcpClient}=await import(pathToFileURL(path.join(root,'electron','acp-client.mjs')).href);
  let sequence=0;
  GrokAcpClient.prototype.start=async function({resumeSessionId}={}){
    this.sessionId=resumeSessionId||'harness-chat-'+(++sequence);this.currentModelId='grok-qa';this.currentModelName='Grok QA';this.currentModeId='default';
    this.availableModels=[{modelId:'grok-qa',name:'Grok QA',contextWindows:[256000,500000],reasoningEfforts:[{value:'high',label:'High'}]}];
    this._qaMessages=[];this._qaRun={active:false,startedAt:null};
    this.proc={pid:900000+sequence,killed:false,kill(){this.killed=true;}};this.ready=true;global.__harnessAgents.set(this.sessionId,this);
    this.emit('ready',{sessionId:this.sessionId,...this._modelsPublic()});return this;
  };
  GrokAcpClient.prototype.getRunState=function(){return {sessionId:this.sessionId,connected:this.ready,active:this._qaRun?.active||false,startedAt:this._qaRun?.startedAt||null,lastActivityAt:Date.now(),waitingPermissions:0};};
  GrokAcpClient.prototype.getRuntimeState=async function(){return {sessionId:this.sessionId,...this._modelsPublic(),reasoningEffort:'high',sessionMode:'default',goal:this.goalState||null,context:{used:1000,total:256000,autoCompactThresholdPercent:80}};};
  GrokAcpClient.prototype.prompt=function(text){
    if(this._qaRun.active)throw Error('Overlapping prompt');this._qaMessages.push(text);this._qaTitle=text.slice(0,40);this._qaRun={active:true,startedAt:Date.now()};
    this.emit('session-update',{sessionId:this.sessionId,update:{sessionUpdate:'user_message_chunk',content:{type:'text',text}}});
    this.emit('session-update',{sessionId:this.sessionId,update:{sessionUpdate:'tool_call',toolCallId:'tool-'+this._qaMessages.length,title:'Edit result.md',kind:'edit',status:'in_progress',rawInput:{path:path.join(this.cwd,'result.md')},locations:[{path:path.join(this.cwd,'result.md')}]}});
    return new Promise((resolve,reject)=>{this._qaResolve=resolve;this._qaReject=reject;});
  };
  GrokAcpClient.prototype.cancel=function(){this._qaRun.active=false;this._qaResolve?.({stopReason:'cancelled'});this._qaResolve=null;};
  GrokAcpClient.prototype.interject=async function(text){this._qaMessages.push('STEER: '+text);return {ok:true};};
  GrokAcpClient.prototype.dispose=async function(){this.cancel();this.ready=false;this.emit('exit',{code:0});};
  global.__harnessFinish=(id,text='Native response complete')=>{const agent=global.__harnessAgents.get(id);agent.emit('session-update',{sessionId:id,update:{sessionUpdate:'tool_call_update',toolCallId:'tool-'+agent._qaMessages.length,status:'completed'}});agent.emit('session-update',{sessionId:id,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}});agent._qaRun.active=false;agent._qaResolve?.({stopReason:'end_turn'});agent._qaResolve=null;};
  const module=await import(pathToFileURL(path.join(root,'electron','window-session.mjs')).href);global.__harnessSessions=module;
  await import(pathToFileURL(path.join(root,'electron','main.mjs')).href);
})().catch(error=>{console.error(error.stack);app.exit(1);});
