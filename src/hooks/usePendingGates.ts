import { useEffect, useState } from 'react';
import type { DesktopBridge } from '../types/bridge';
type Gates=Awaited<ReturnType<DesktopBridge['listPendingGates']>>;
/** Hydrate every parked wait; renderer reload and offscreen sessions cannot lose the next question. */
export function usePendingGates(sessionId:string|null) {
  const [gates,setGates]=useState<Gates|null>(null);
  useEffect(()=>{
    if(!window.grokDesktop.executionList)return;
    let live=true,inFlight=false;
    setGates(null);
    const refresh=async()=>{if(inFlight)return;inFlight=true;try{const next=await window.grokDesktop.listPendingGates();if(live)setGates(next);}catch{}finally{inFlight=false;}};
    void refresh();const timer=setInterval(()=>void refresh(),1000);
    const off=window.grokDesktop.on('execution:event',({scope,channel})=>{if(scope.sessionId===sessionId&&/request|dismiss|permissions-cleared/.test(channel))void refresh();});
    return()=>{live=false;clearInterval(timer);off();};
  },[sessionId]);
  return gates;
}
