import {useCallback, useEffect, useRef, useState} from 'react';
import type {ComposerRuntime} from '../types/desktop';
import type {ConnState} from '../lib/conn';
import {goalFromUpdate} from '../../shared/composer-state.mjs';

export function useComposerRuntime(sessionId: string | null, conn: ConnState) {
  const [runtime,setRuntime]=useState<ComposerRuntime|null>(null);
  const generation=useRef(0), inFlight=useRef(false);
  const goalRevision=useRef(0),latestGoal=useRef<ComposerRuntime['goal']>(null);
  const refresh=useCallback(async()=>{
    if(!sessionId||inFlight.current)return;
    const gen=generation.current,revision=goalRevision.current;inFlight.current=true;
    try {const next=await window.grokDesktop.getRuntimeState();if(gen===generation.current&&next.sessionId===sessionId){
      if(revision!==goalRevision.current)next.goal=latestGoal.current;
      latestGoal.current=next.goal;setRuntime(next);
    }}
    catch {/* A temporarily unavailable meter must not interrupt a conversation. */}
    finally {if(gen===generation.current)inFlight.current=false;}
  },[sessionId]);
  useEffect(()=>{generation.current++;inFlight.current=false;goalRevision.current=0;latestGoal.current=null;setRuntime(null);void refresh();const timer=setInterval(()=>void refresh(),12000);return()=>{generation.current++;clearInterval(timer);};},[refresh]);
  useEffect(()=>{if(conn==='online')void refresh();},[conn,refresh]);
  useEffect(()=>window.grokDesktop.on('agent:session-update',params=>{
    if(!sessionId||(params.sessionId&&params.sessionId!==sessionId))return;
    const next=goalFromUpdate(latestGoal.current,params);
    if(next===latestGoal.current)return;
    latestGoal.current=next;goalRevision.current++;
    setRuntime(prev=>prev?{...prev,goal:next}:prev);
  }),[sessionId]);
  return {runtime,refresh,setRuntime};
}
