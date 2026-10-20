import {isOpenToolStatus} from './session-timeline.mjs';

export function formatElapsed(ms) {
  const seconds=Math.max(0,Math.floor((Number(ms)||0)/1000));
  const h=Math.floor(seconds/3600),m=Math.floor(seconds/60)%60,s=seconds%60;
  return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${m}:${String(s).padStart(2,'0')}`;
}

/** Only observed events and open gates describe work. Never infer percentage
 * complete, the model's private reasoning, or failure from a quiet stream. */
export function currentTurnItems(items=[]) {
  let index=-1;
  for(let i=items.length-1;i>=0;i--)if(items[i].kind==='user'&&!items[i].queued&&!items[i].interjectionId){index=i;break;}
  return items.slice(index+1).filter(item=>!item.queued);
}

export function currentPlan(items=[]) {
  const plan=currentTurnItems(items).findLast(item=>item.kind==='plan');
  return normalizePlanEntries(plan?.entries);
}

export function normalizePlanEntries(entries) {
  return (Array.isArray(entries)?entries:[]).flatMap(entry=>{
    if(typeof entry==='string')return [{content:entry,status:'pending'}];
    if(!entry||typeof entry!=='object'||typeof entry.content!=='string')return [];
    const status=['completed','in_progress','pending'].includes(entry.status)?entry.status:'pending';
    return [{content:entry.content,status}];
  });
}

export function activityStatus({run,items=[],waitingFor=null,permissionCount=0,now=Date.now(),startedAt=now,cancelRequested=false}) {
  const current=currentTurnItems(items);
  const tools=current.filter(item=>item.kind==='tool');
  const open=tools.filter(item=>isOpenToolStatus(item.status));
  const tail=current.findLast(item=>['thought','assistant','tool'].includes(item.kind));
  const compact=current.findLast(item=>item.kind==='system'&&/^(Compressing conversation|Conversation compacted|Compress failed|Compress cancelled)/.test(item.text||''));
  const elapsedMs=Math.max(0,now-(run?.startedAt??startedAt));
  const silentMs=run?.lastActivityAt==null?0:Math.max(0,now-run.lastActivityAt);
  let phase='starting',label='Starting response',detail='Waiting for the first engine event.';
  if(run?.active&&run.connected===false){phase='disconnected';label='Connection lost';detail='The engine is disconnected. Your message will not be sent again automatically.';}
  else if(cancelRequested||run?.cancelRequestedAt!=null){phase='stopping';label='Stopping';detail='Waiting for the engine to confirm. Completed actions are kept.';}
  else if(waitingFor||permissionCount>0||run?.waitingPermissions>0){phase='waiting';label=waitingFor==='plan'?'Waiting for plan approval':waitingFor==='answer'?'Waiting for your answer':waitingFor==='trust'?'Waiting for folder access':waitingFor==='connector'?'Waiting for connector input':'Waiting for permission';detail=permissionCount>1?`${permissionCount} tool requests need your approval.`:'Review the pending request to continue.';}
  else if(compact?.text?.startsWith('Compressing conversation')){phase='compacting';label='Compacting context';detail='Grok is making room for the next steps. Your draft is safe.';}
  else if(open.length){phase='tool';label=open.length>1?`Running ${open.length} tools`:'Running a tool';detail=String(open.at(-1).title||'Tool in progress').replace(/\s+/g,' ').slice(0,180);}
  else if(tail?.kind==='thought'){phase='thinking';label='Thinking';detail='Reasoning events are being received from Grok.';}
  else if(tail?.kind==='assistant'){phase='writing';label='Writing a response';detail='Receiving the response from Grok.';}
  else if(tools.length){phase='working';label='Continuing the task';detail='The last tool finished; waiting for the next engine step.';}
  if(silentMs>=45000&&!['waiting','stopping','disconnected'].includes(phase))detail+=` Last engine event ${formatElapsed(silentMs)} ago; the task may still be running.`;
  return {phase,label,detail,elapsedMs,silentMs,toolCount:tools.length};
}

export function goalElapsed(goal,now=Date.now(),turnStartedAt=null) {
  if(!Number.isFinite(goal?.elapsedMs))return null;
  const since=goal.observedAt==null?0:Math.max(0,now-Math.max(goal.observedAt,turnStartedAt??now));
  return goal.elapsedMs+(goal.status==='active'&&turnStartedAt!=null?since:0);
}
