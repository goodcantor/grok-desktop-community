import { useCallback, useEffect, useState } from "react";

/** Confirm before leaving the project when the Files peek has unsaved edits. */
export function useUnsavedGuard() {
  const [filesDirty, setFilesDirty] = useState(false);
  useEffect(()=>{
    window.__communityReady=true;window.__communityUnsavedEdits=filesDirty;
    if(!filesDirty)return;
    const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};
    window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);
  },[filesDirty]);
  const confirmDiscardFiles = useCallback(() => {
    if (!filesDirty) return true;
    return window.confirm("Discard unsaved edits?");
  }, [filesDirty]);
  return { filesDirty, setFilesDirty, confirmDiscardFiles };
}
