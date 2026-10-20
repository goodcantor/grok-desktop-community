import { useCallback, useEffect, useRef, useState } from 'react';
import type { useLegacyPromptDelivery } from './usePromptDelivery';
import type { ComposerSubmit, QueuedPrompt } from '../types/prompt';
import type { ExecutionQueueState } from '../types/execution';
import { appendUserMessage, uid } from '../lib/timeline';
import { previewCaptureToSubmit } from '../lib/pending-images';

type Options = Parameters<typeof useLegacyPromptDelivery>[0];
const empty: ExecutionQueueState = { items: [], paused: true, running: false, revision: 0, outcome: null, failed: null };

/** React mirrors the selected execution. Main keeps draining all other queues. */
export function useExecutionDelivery(opts: Options) {
  const [state, setState] = useState(empty);
  const epoch=useRef(0),scope=useRef(opts.sessionId),current=useRef(opts);current.current=opts;
  if(scope.current!==opts.sessionId){scope.current=opts.sessionId;epoch.current++;}
  const promptQueueRef=useRef<QueuedPrompt[]>([]),sendNowRef=useRef<QueuedPrompt|null>(null);
  const accept=useCallback((next:ExecutionQueueState)=>{
    const hydrated={...next,items:next.items.map(item=>({...item,images:item.images.map(image=>({...image,previewUrl:image.previewUrl||`data:${image.mimeType};base64,${image.data}`}))}))};
    promptQueueRef.current=hydrated.items;
    setState(hydrated);
    current.current.busyRef.current=next.running;
    if(!current.current.openingRef.current)current.current.setConn(next.running?'busy':next.failed?'error':'online');
    if(next.failed)current.current.setError(next.failed.error);
  },[]);
  useEffect(()=>{
    const expected=epoch.current;
    setState(empty);
    if(!opts.sessionId)return;
    void window.grokDesktop.executionQueue!().then(next=>{if(expected===epoch.current)accept(next);}).catch(error=>{if(expected===epoch.current)opts.setError(String(error));});
    const off=window.grokDesktop.on('execution:queue',accept);
    const delivered=window.grokDesktop.on('execution:delivered',({item}:{item:QueuedPrompt})=>{
      current.current.setItems(items=>appendUserMessage(items,{text:item.timelineText||item.text,optimistic:true,images:(item.images||[]).map(img=>({mimeType:img.mimeType,previewUrl:`data:${img.mimeType};base64,${img.data}`}))}));
    });
    return()=>{off();delivered();};
  },[opts.sessionId,accept]);
  const action=useCallback((args:Parameters<NonNullable<typeof window.grokDesktop.executionQueueAction>>[0])=>{
    const expected=epoch.current;
    void window.grokDesktop.executionQueueAction!(args).then(next=>{if(epoch.current===expected)accept(next);}).catch(error=>{if(epoch.current===expected)current.current.setError(String(error));});
  },[accept]);
  const submitFromComposer=useCallback(async(payload:ComposerSubmit)=>{
    const owner=current.current;
    if(!owner.project||owner.openingRef.current||(!payload.text.trim()&&!payload.images.length))return false;
    const expected=epoch.current;
    const item={id:uid('q'),text:payload.text,images:payload.images.map(({id,data,mimeType})=>({id,data,mimeType,previewUrl:''})),at:Date.now(),imageQuality:payload.imageQuality,timelineText:payload.timelineText};
    try{
      const next=await window.grokDesktop.executionSubmit!(item,payload.mode);
      if(epoch.current===expected){accept(next);owner.pinToBottom();}
      return true;
    }catch(error){if(epoch.current===expected)owner.setError(String(error));return false;}
  },[accept]);
  useEffect(()=>window.grokDesktop.on('preview:viewport-capture',payload=>{
    const parsed=previewCaptureToSubmit(payload);if(!parsed.ok){current.current.setError(parsed.error);return;}
    void submitFromComposer({...parsed.submit,mode:current.current.busyRef.current?'interject':'auto'});
  }),[submitFromComposer]);
  const sendQueuedNow=useCallback((id?:string)=>{
    const item=promptQueueRef.current.find(row=>row.id===(id||promptQueueRef.current[0]?.id));if(!item)return;
    // Main atomically removes and submits this entry; no renderer-owned drain.
    action({action:'send',id:item.id});
  },[action]);
  return {promptQueue:state.items,queuePaused:state.paused,changeQueuePaused:(paused:boolean)=>action({action:'pause',paused}),turnOutcome:state.outcome,promptQueueRef,sendNowRef,
    clearPromptQueue:()=>{const expected=++epoch.current;promptQueueRef.current=[];sendNowRef.current=null;setState(empty);void window.grokDesktop.executionQueue!().then(next=>{if(expected===epoch.current)accept(next);}).catch(()=>{});},
    removeQueued:(id:string)=>action({action:'remove',id}),editQueued:(id:string,text:string)=>action({action:'edit',id,text}),moveQueued:(id:string,direction:number)=>action({action:'move',id,direction}),
    failedDelivery:state.failed,clearFailedDelivery:()=>action({action:'clear-failure'}),submitFromComposer,sendQueuedNow};
}
