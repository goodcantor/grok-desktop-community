import {useEffect,useRef,useState} from 'react';

export function BrowserPanel({windowId,sessionId,inert=false}:{windowId?:number;sessionId?:string|null;inert?:boolean}) {
  const root=useRef<HTMLDivElement>(null);
  const [opened,setOpened]=useState(false),[error,setError]=useState('');
  useEffect(()=>{
    let live=true,frame=0;
    const report=()=>{
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        const el=root.current;if(!el||!live)return;
        const r=el.getBoundingClientRect();
        const overlay=Boolean(document.querySelector('.modal-backdrop [role="dialog"],.image-viewer,[role="menu"],.history-scrim'));
        void window.grokDesktop.layoutBrowser({x:r.x,y:r.y,width:r.width,height:r.height},!inert&&!overlay).catch(()=>{});
      });
    };
    const state=(value:{open?:boolean;ownerWindowId?:number;presentation?:string})=>{
      if(live)setOpened(Boolean(value.open&&value.ownerWindowId===windowId&&value.presentation==='docked'));
      report();
    };
    void window.grokDesktop.previewState().then(state).catch(()=>{});
    const off=window.grokDesktop.on('preview:changed',state);
    const observer=new ResizeObserver(report);if(root.current)observer.observe(root.current);
    const mutations=new MutationObserver(report);mutations.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['inert','class','style']});
    window.addEventListener('resize',report);window.addEventListener('scroll',report,true);report();
    return()=>{live=false;cancelAnimationFrame(frame);observer.disconnect();mutations.disconnect();off();window.removeEventListener('resize',report);window.removeEventListener('scroll',report,true);void window.grokDesktop.hideBrowser().catch(()=>{});};
  },[windowId,sessionId,inert]);
  return <div ref={root} className="browser-surface" aria-label="Browser panel">
    {!opened&&<div className="browser-empty"><span className="browser-empty-icon" aria-hidden>◎</span><h2>Your browser, beside your chat</h2><p>Open a website or local preview here. Grok can inspect and test the page while your conversation stays visible.</p>
      <button className="btn" onClick={()=>{setError('');void window.grokDesktop.openPreview().catch(e=>setError(String(e)));}}>Open browser</button>{error&&<p role="alert">{error}</p>}</div>}
  </div>;
}
