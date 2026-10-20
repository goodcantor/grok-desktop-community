import {useEffect,useRef,type MutableRefObject} from 'react';
import {encodePendingImages,type PendingImage} from '../lib/pending-images';
import type {DraftState} from '../types/desktop';

type EditorState={text:string;mode:string;files:DraftState['files'];images:PendingImage[]};
type CachedDraft=Omit<DraftState,'images'>&{images:PendingImage[]};
const memory=new Map<string,CachedDraft>();
const unique=<T,>(rows:T[],key:(row:T)=>string)=>Array.from(new Map(rows.map(row=>[key(row),row])).values());

export function useDraft(key:string,state:EditorState,restore:(draft:DraftState)=>void,revision:MutableRefObject<number>) {
  const latest=useRef(state),ready=useRef(false),mounted=useRef(false),chain=useRef(Promise.resolve()),failure=useRef(false),transfer=useRef<{key:string;revision:number}|null>(null);
  latest.current=state;
  const save=()=>{
    const snapshot=latest.current,rev=revision.current;
    if(!ready.current&&!snapshot.text&&!snapshot.files.length&&!snapshot.images.length)return;
    memory.set(key,{...snapshot,revision:rev});
    if(!ready.current)return;
    chain.current=chain.current.catch(()=>{}).then(async()=>{
      let saved=true;
      if(!snapshot.text&&!snapshot.files.length&&!snapshot.images.length)await window.grokDesktop.deleteDraft(key,rev);
      else {
        const images=await encodePendingImages(snapshot.images,'high');
        saved=(await window.grokDesktop.saveDraft(key,{...snapshot,revision:rev,images:images.map(({id,name,data,mimeType})=>({id,name,data,mimeType}))})).saved;
      }
      if(saved&&transfer.current){await window.grokDesktop.deleteDraft(transfer.current.key,transfer.current.revision);transfer.current=null;}
    }).catch(()=>{if(!failure.current){failure.current=true;document.dispatchEvent(new CustomEvent('grok:draft-error'));}});
  };
  const saveRef=useRef(save);saveRef.current=save;
  useEffect(()=>{
    let active=true;const before=revision.current;let initialSave:ReturnType<typeof setTimeout>;
    void (async()=>{
      let draft:DraftState|CachedDraft|null=memory.get(key)||await window.grokDesktop.readDraft(key);
      const pendingKey=key.slice(0,key.lastIndexOf('\0'))+'\0pending';
      const pending=key!==pendingKey?(memory.get(pendingKey)||await window.grokDesktop.readDraft(pendingKey)):null;
      if(pending&&(pending.text||pending.files.length||pending.images.length)){
        draft={...pending,text:unique([draft?.text||'',pending.text].filter(Boolean),text=>text).join('\n\n'),files:unique([...(draft?.files||[]),...pending.files],file=>file.path),images:unique([...(draft?.images||[]),...pending.images],image=>image.id)};
      }
      if(draft?.images.some(image=>'source' in image))draft={...draft,images:await encodePendingImages(draft.images as PendingImage[],'high')};
      if(!active)return;
      if(pending){transfer.current={key:pendingKey,revision:pending.revision};memory.delete(pendingKey);}
      if(draft){
        if(revision.current!==before){const edited=latest.current;draft={...draft,text:unique([draft.text,edited.text].filter(Boolean),text=>text).join('\n\n'),files:unique([...draft.files,...edited.files],file=>file.path),images:unique([...draft.images,...edited.images],image=>image.id),mode:edited.mode};}
        revision.current=Math.max(Date.now(),draft.revision+1);restore(draft);
      }
      ready.current=true;initialSave=setTimeout(()=>saveRef.current(),300);
    })().catch(()=>{ready.current=true;document.dispatchEvent(new CustomEvent('grok:draft-error'));});
    const flush=()=>saveRef.current();window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',flush);
    return()=>{saveRef.current();active=false;clearTimeout(initialSave);window.removeEventListener('pagehide',flush);document.removeEventListener('visibilitychange',flush);};
  },[key]);
  useEffect(()=>{if(!mounted.current){mounted.current=true;return;}revision.current=Math.max(Date.now(),revision.current+1);const timer=setTimeout(save,300);return()=>clearTimeout(timer);},[state.text,state.mode,state.files,state.images]);
}
