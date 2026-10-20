/** Native alerts contain no prompt, model output, command or absolute path. */
export function notificationPreferences(state={}) {
  return {enabled:state.notifications?.enabled!==false,sound:state.notifications?.sound===true};
}

export function createTaskNotifier({Notification,getState,selectExecution}) {
  const active=new Map(),seen=new Set(),windows=new WeakSet();
  const dismiss=(ws,key)=>{
    for(const [id,row]of active)if(row.ws===ws&&(!key||row.key===key)){
      active.delete(id);try{row.notification.close();}catch{}
    }
  };
  const watch=ws=>{
    if(windows.has(ws.win))return;windows.add(ws.win);
    ws.win.on('focus',()=>{
      for(const row of [...active.values()])if(row.ws.win===ws.win&&(!row.ws.host||row.ws.host.selected===row.ws))dismiss(row.ws);
      try{ws.win.flashFrame(false);}catch{}
    });
    ws.win.on('closed',()=>{for(const row of [...active.values()])if(row.ws.win===ws.win)dismiss(row.ws);});
  };
  const show=(ws,{kind,key,sessionId=ws?.agent?.sessionId}={})=>{
    const win=ws?.win,preferences=notificationPreferences(getState());
    if(!win||win.isDestroyed()||!sessionId||ws.agent?.sessionId!==sessionId||!preferences.enabled||(win.isFocused()&&(!ws.host||ws.host.selected===ws))||!Notification.isSupported())return false;
    const labels={complete:'Response complete',failed:'Response failed',permission:'Approval needed',plan:'Plan approval needed',answer:'Your answer is needed',trust:'Folder access needed',connector:'Connector input needed'};
    if(!labels[kind])return false;
    const identity=`${win.id}:${sessionId}:${key||kind}`;
    if(seen.has(identity))return false;
    seen.add(identity);if(seen.size>256)seen.delete(seen.values().next().value);
    watch(ws);dismiss(ws);
    const state=getState(),workspace=state.privacyMode?'Chat':String(ws.agent.cwd||'Workspace').split(/[\\/]/).filter(Boolean).at(-1);
    try{
      const notification=new Notification({title:labels[kind],body:`${workspace} · ${sessionId.slice(-8)} · Grok Desktop Community`,silent:!preferences.sound});
      active.set(identity,{ws,key,notification});
      notification.on('click',()=>{
        if(!win.isDestroyed()&&ws.agent?.sessionId===sessionId){if(ws.host){selectExecution(ws);win.webContents.send('app:select-execution',{cwd:ws.lastCwd,sessionId});}if(win.isMinimized())win.restore();win.show();win.focus();}
        dismiss(ws);
      });
      notification.on('close',()=>active.delete(identity));
      notification.on('failed',()=>active.delete(identity));
      notification.show();return true;
    }catch{return false;}
  };
  return {show,dismiss,dismissAll:()=>{for(const row of [...active.values()])dismiss(row.ws);}};
}
