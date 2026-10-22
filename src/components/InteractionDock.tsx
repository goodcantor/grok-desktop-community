import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, CircleHelp } from 'lucide-react';

/** Ordered waits live beside the draft. Hiding a surface never settles its RPC. */
export function InteractionDock({ requests, bulkAction }: { bulkAction?:{label:string;run:()=>void}; requests: { id: string; label: string; content: ReactNode }[] }) {
  const sheet=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{
    const element=sheet.current;if(!element)return;
    const fit=()=>{const anchor=element.parentElement!;const main=element.closest('main');const top=anchor.getBoundingClientRect().top;const header=main?.querySelector('.conversation-tabs')?.getBoundingClientRect().bottom ?? 80;element.style.maxHeight=Math.max(100,top-header-12)+'px';};
    fit();const observer=new ResizeObserver(fit);observer.observe(element.parentElement!);window.addEventListener('resize',fit);return()=>{observer.disconnect();window.removeEventListener('resize',fit);};
  });
  const arrival=useRef(new Map<string,number>()),sequence=useRef(0);
  for(const item of requests)if(!arrival.current.has(item.id))arrival.current.set(item.id,sequence.current++);
  const ordered=[...requests].sort((a,b)=>arrival.current.get(a.id)!-arrival.current.get(b.id)!);
  const [selected,setSelected]=useState(''),[collapsed,setCollapsed]=useState(false);
  const active=ordered.find(row=>row.id===selected)||ordered[0];
  useEffect(()=>{if(active)setSelected(active.id);},[active?.id]);
  if(!active)return null;
  return <section ref={sheet} data-collapsed={collapsed} className="interaction-dock" aria-label="Agent requests">
    <header><CircleHelp size={16}/><strong>{active.label}</strong><span>{ordered.length>1?`${ordered.findIndex(row=>row.id===active.id)+1} of ${ordered.length}`:''}</span>{bulkAction&&<button className="btn btn-sm" onClick={bulkAction.run}>{bulkAction.label}</button>}<button className="icon-button" aria-label={collapsed?'Expand agent request':'Collapse agent request'} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<ChevronDown size={16}/>:<ChevronUp size={16}/>}</button></header>
    {ordered.length>1&&!collapsed&&<nav aria-label="Pending requests">{ordered.map((row,i)=><button key={row.id} className="btn btn-sm" aria-pressed={row.id===active.id} onClick={()=>setSelected(row.id)}>{i+1}. {row.label}</button>)}</nav>}
    {ordered.map(row=><div key={row.id} hidden={collapsed||row.id!==active.id}>{row.content}</div>)}
  </section>;
}
