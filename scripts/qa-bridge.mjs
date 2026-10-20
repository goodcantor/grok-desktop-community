export const installMockBridge = ()=>{
  const cwd='C:\\Projects\\Atlas',id='session-atlas-001',key=cwd+'\0'+id;
  const row={id,cwd,key,title:'Building Atlas together',available:true,summary:'A personal project',lastActiveAt:new Date().toISOString(),numMessages:620};
  const rows=[row,{...row,id:'session-notes-002',key:cwd+'\0session-notes-002',title:'Design notes'}, {...row,id:'session-other-003',cwd:'C:\\Projects\\Orbit',key:'C:\\Projects\\Orbit\0session-other-003',title:'An idea for tomorrow'}];
  let pinned=JSON.parse(localStorage.getItem('qa-pins')||'[]'),collapsed=[],current=row,uiZoom=1;const events={};
  const emit=(name,payload)=>(events[name]||[]).forEach(cb=>cb(payload));window.__qaEmit=emit;window.__qaActions={preview:0,cancel:0,permission:0,prompts:[],modes:[],contexts:[]};let liveMode='default',liveModel='grok-4.7',contextSize=500000,goal=null;let finishPrompt;
  const auth={authenticated:true,expired:false,binaryFound:true,email:'your@workspace.local',displayName:'Your workspace',method:'oidc'};
  const info={windowId:1,auth,theme:'dark',version:'1.4.7-custom.6',home:'C:\\Users\\user',defaultWorkspace:cwd,grokBinary:'C:\\Users\\user\\.grok\\bin\\grok.exe',recentProjects:[cwd,'C:\\Projects\\Orbit'],permissionMode:'ask',reasoningEffort:'medium',sandboxTerminal:true,allowOutsideProject:false,platform:'win32',autoCompactAt:'off'};
  const history=[{id:'u1',kind:'user',text:'Help me build a thoughtful workspace for my projects.',at:Date.now()-50000},{id:'a1',kind:'assistant',text:'Let’s make room for what matters.\n\nA clear conversation, your projects close by, and everything else one click away.\n\n```javascript\nconst workspace = { focus: "your ideas" };\n```',at:Date.now()-40000},{id:'tool1',kind:'tool',title:'Read project files',status:'completed',content:[{type:'text',text:'Read 3 files'}],at:Date.now()-30000}];
  const result=()=>({cwd:current.cwd,sessionId:current.id,grokBinary:info.grokBinary,modelId:'grok-4.7',modelName:'Grok 4.7',availableModels:[{modelId:'grok-4.7',name:'Grok 4.7',contextWindow:256000,contextWindows:[256000,500000],reasoningEfforts:[{value:'low',label:'Low'},{value:'medium',label:'Medium'},{value:'high',label:'High'},{value:'xhigh',label:'Extra High'}]},{modelId:'grok-4.7-build-fast',name:'Grok Build Fast',contextWindow:256000,contextWindows:[256000,500000]}],history,sessions:rows,backgroundTasks:[],resumed:true});
  let notifications={enabled:true,sound:false,supported:true};
  const api={
    notificationPreferences:async patch=>(notifications={...notifications,...patch}),
    usageQuery:async()=>({totals:{inputTokens:100000,outputTokens:4000,totalTokens:104000,cachedReadTokens:80000,cacheCreationTokens:0,reasoningTokens:2000,modelCalls:8,costUsdTicks:1200000000},turns:[],requests:3,conversations:2,partial:false,unavailable:0}),
    usageBilling:async()=>({config:{creditUsagePercent:24,currentPeriod:{end:'2026-10-20T00:00:00Z'}},observedAt:Date.now()}),
    queueRead:async key=>JSON.parse(localStorage.getItem('queue:'+key)||'[]'),queueSave:async(key,items)=>{localStorage.setItem('queue:'+key,JSON.stringify(items));return true;},
    fileRoots:async()=>({roots:[{path:cwd,label:'Project'}]}),pickFileRoot:async()=>null,
    ptyList:async()=>[],ptyShells:async()=>[{id:'pwsh',name:'PowerShell 7'}],ptyCommand:async()=>true,
    gitSnapshot:async()=>({root:cwd,branch:'main',branches:['main','feature'],files:[],diff:'',hash:'empty',mode:'working',base:'HEAD'}),gitAction:async()=>'',

    readDraft:async key=>JSON.parse(localStorage.getItem('draft:'+key)||'null'),
    saveDraft:async(key,value)=>{localStorage.setItem('draft:'+key,JSON.stringify(value));return {saved:true};},
    deleteDraft:async(key,revision)=>{const old=JSON.parse(localStorage.getItem('draft:'+key)||'null');if(!old||old.revision<=revision)localStorage.removeItem('draft:'+key);},
    droppedPaths:files=>files.map(file=>file.name),describeAttachments:async paths=>paths.map(path=>({path,name:path.split('\\').pop(),kind:'file',available:true})),
    archiveHistory:async({cwd,sessionId,archived:yes})=>{let items=JSON.parse(localStorage.getItem('qa-archive')||'[]');const key=cwd+'\0'+sessionId;items=items.filter(item=>item!==key);if(yes)items.push(key);localStorage.setItem('qa-archive',JSON.stringify(items));return{};},
    exportHistory:async()=>({canceled:false,filePath:'conversation.md'}),
    setDefaultReasoning:async effort=>effort,diagnostics:async()=>({appVersion:'1.4.7-custom.5',engineVersion:'QA',connection:'ready'}),
    getRunState:async()=>({sessionId:current.id,active:false,connected:true,startedAt:null,lastActivityAt:null,waitingPermissions:0}),
    getZoom:async()=>uiZoom,setZoom:async value=>{uiZoom=value;emit('app:zoom',value);return value;},
    previewState:async()=>({open:false,url:'about:blank',ownerWindowId:1,presentation:'docked'}),layoutBrowser:async()=>true,hideBrowser:async()=>true,
    getInfo:async()=>info,getAuthStatus:async()=>auth,inspectBackbone:async()=>({ok:true,skills:[],mcpServers:[],plugins:[]}),
    historyCatalog:async()=>({sessions:rows,pinned,collapsed,archived:JSON.parse(localStorage.getItem('qa-archive')||'[]')}),onHistoryProgress:()=>()=>{},
    pinHistory:async({cwd,sessionId,pinned:yes})=>{const key=cwd+'\0'+sessionId;pinned=pinned.filter(x=>x!==key);if(yes)pinned.push(key);localStorage.setItem('qa-pins',JSON.stringify(pinned));return {pinned,collapsed};},
    collapseHistory:async({cwd,collapsed:yes})=>{collapsed=collapsed.filter(x=>x!==cwd);if(yes)collapsed.push(cwd);return {pinned,collapsed};},
    searchHistory:async({query})=>({items:query.toLowerCase().includes('needle')?[{...row,ordinal:4,role:'assistant',snippet:'An early needle message from the beginning of this conversation.'}]:[],total:query.toLowerCase().includes('needle')?1:0,progress:{phase:'ready',done:3,total:3}}),
    historyWindow:async(args)=>({items:[{id:'old-u',kind:'user',text:'The first question.',at:Date.now()-100000,historyOrdinal:3},{id:'old-a',kind:'assistant',text:'An early needle message preserved in your history.',at:Date.now()-90000,historyOrdinal:4}],start:args.start??0,end:140,total:620,focusOrdinal:args.ordinal??null}),
    openProject:async(path,opts)=>{current=rows.find(r=>r.id===opts?.sessionId)||rows.find(r=>r.cwd===path)||row;return result();},openSession:async()=>result(),
    recoverProject:async(cwd,sessionId)=>{current=rows.find(row=>row.id===sessionId)||rows.find(row=>row.cwd===cwd)||row;return result();},
    listPendingPermissions:async()=>[],listPendingGates:async()=>({folderTrust:[],planApprovals:[],userQuestions:[],mcpElicits:[]}),takePendingOpen:async()=>null,
    listOpenCheckouts:async()=>[],listEditors:async()=>({resolvedLabel:'Cursor',editors:[]}),getGitStatus:async()=>({git:true,files:[]}),getGitBranch:async()=>({branch:'main',detached:false}),listDir:async()=>[],
    listSessions:async()=>rows,setAllowWritesThisSession:async()=>({allowWritesThisSession:false}),
    getRuntimeState:async()=>({sessionId:current.id,modelId:liveModel,modelName:result().availableModels.find(m=>m.modelId===liveModel)?.name,availableModels:result().availableModels,reasoningEffort:info.reasoningEffort,sessionMode:liveMode,goal,context:{used:125000,total:contextSize,autoCompactThresholdPercent:80}}),
    setContextWindow:async size=>{window.__qaActions.contexts.push(size);contextSize=size;return api.getRuntimeState();},
    setModel:async id=>{liveModel=id;return{agentSynced:true,modelId:id,availableModels:result().availableModels};},setReasoningEffort:async effort=>{info.reasoningEffort=effort;return{effort,agentSynced:true};},setSessionMode:async mode=>{liveMode=mode;window.__qaActions.modes.push(mode);emit('agent:session-update',{sessionId:current.id,update:{sessionUpdate:'current_mode_update',currentModeId:mode}});return{modeId:mode,agentSynced:true};},
    setPermissionMode:async mode=>{info.permissionMode=mode;return{mode,agentSynced:true};},setAllowOutsideProject:async value=>value,setSandboxTerminal:async value=>value,
    pickAttachments:async kind=>[{path:kind==='file'?cwd+'\\notes.txt':cwd+'\\assets',name:kind==='file'?'notes.txt':'assets',kind}],
    setTheme:async t=>{info.theme=t;},getCodingDataStatus:async()=>({optedIn:false}),renameSession:async({sessionId,title})=>{rows.find(r=>r.id===sessionId).title=title;return {ok:true,sessions:rows};},
    deleteSession:async({sessionId})=>{rows.splice(rows.findIndex(r=>r.id===sessionId),1);return{ok:true,sessions:rows};},
    openPreview:async()=>{window.__qaActions.preview++;const state={open:false,url:'about:blank',ownerWindowId:1,presentation:'docked',reveal:true};emit('preview:changed',state);return state;},
    respondPermission:async(reqId)=>{window.__qaActions.permission++;emit('agent:permission-dismiss',{reqId});return true;},
    cancel:async()=>{window.__qaActions.cancel++;finishPrompt?.();return true;},
    prompt:async(text)=>{window.__qaActions.prompts.push(text);if(text.startsWith('/goal ')){goal=text==='/goal pause'?{status:'user_paused',objective:'QA goal'}:text==='/goal clear'?null:{status:'active',objective:text.slice(6)};emit('agent:session-update',{sessionId:current.id,update:{sessionUpdate:'goal_updated',status:goal?.status||'cleared',objective:goal?.objective}});}if(text==='simulate-long')await new Promise(resolve=>{finishPrompt=resolve;});else emit('agent:session-update',{update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'UI_SMOKE_REPLY'}}});return{};},
    on:(name,cb)=>{(events[name]||=[]).push(cb);return()=>{events[name]=events[name].filter(x=>x!==cb);};}
  };
  window.grokDesktop=new Proxy(api,{get:(target,name)=>name in target?target[name]:String(name).startsWith('on')?()=>()=>{}:async()=>({ok:true})});
};
