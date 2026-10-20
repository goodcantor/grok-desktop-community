import { useMemo, useRef, useState } from 'react';
import { Search, X, FileCode, Terminal, MessageSquare, Brain } from 'lucide-react';
import type { TimelineItem } from '../types/timeline';
import { buildToolCard } from './ToolCardView';
import { usePrivacy } from '../lib/privacy-context';

const HEIGHT=52;
/** Fixed-height event ledger; inspector owns variable-height content. Only visible rows mount. */
export function ActivityView({items,onEarlier,loading,hasEarlier}:{items:TimelineItem[];onEarlier:()=>void;loading:boolean;hasEarlier:boolean}) {
  const [query,setQuery]=useState(''),[top,setTop]=useState(0),[selected,setSelected]=useState<string|null>(null);
  const viewport=useRef<HTMLDivElement>(null),{redact}=usePrivacy();
  const rows=useMemo(()=>items.map((item,index)=>({item,index,title:item.kind==='tool'?item.title:item.kind==='plan'?'Plan updated':item.kind==='thought'?'Thinking':item.kind==='system'?'System event':item.kind==='user'?'You':'Grok',summary:'text'in item?item.text:item.kind==='tool'?buildToolCard(item).detailDisplay||item.status:'Plan steps'})).filter(row=>`${row.title} ${row.summary}`.toLowerCase().includes(query.toLowerCase())),[items,query]);
  const start=Math.max(0,Math.floor(top/HEIGHT)-6),end=Math.min(rows.length,start+Math.ceil((viewport.current?.clientHeight||600)/HEIGHT)+12);
  const inspected=items.find(item=>item.id===selected);
  const card=inspected?.kind==='tool'?buildToolCard(inspected):null;
  return <section className="activity-view" aria-label="Activity journal"><div className="activity-toolbar"><Search size={16}/><input aria-label="Search activity" placeholder="Search loaded activity…" value={query} onChange={e=>{setQuery(e.target.value);setTop(0);if(viewport.current)viewport.current.scrollTop=0;}}/><span>{rows.length} events</span></div>
    {hasEarlier&&<button className="activity-earlier btn" disabled={loading} onClick={onEarlier}>{loading?'Loading…':'Load earlier activity'}</button>}
    <div className="activity-body"><div className="activity-ledger" role="list" aria-label="Loaded events" ref={viewport} onScroll={e=>setTop(e.currentTarget.scrollTop)}>
      <div style={{height:rows.length*HEIGHT,position:'relative'}}>{rows.slice(start,end).map((row,i)=>{const Icon=row.item.kind==='tool'?Terminal:row.item.kind==='thought'?Brain:row.item.kind==='plan'?FileCode:MessageSquare;return <button role="listitem" aria-posinset={start+i+1} aria-setsize={rows.length} aria-label={`${row.index+1}. ${row.title}`} className="activity-event" data-selected={selected===row.item.id} key={row.item.id} style={{position:'absolute',top:(start+i)*HEIGHT,height:HEIGHT}} onClick={()=>setSelected(row.item.id)}><span className="activity-number">{row.index+1}</span><Icon size={15}/><div><strong>{redact(row.title)}</strong><small>{redact(row.summary.slice(0,180))}</small></div><span className="activity-kind">{row.item.kind==='tool'?row.item.status:row.item.kind}</span></button>;})}</div>
      {!rows.length&&<p className="history-hint">{query?'No matching events in the loaded history.':'No activity yet. Events appear when Grok starts working.'}</p>}
    </div>{inspected&&<aside className="activity-inspector" aria-label="Event details"><header><strong>{inspected.kind==='tool'?redact(inspected.title):'Event details'}</strong><button className="icon-button" aria-label="Close event details" onClick={()=>setSelected(null)}><X size={16}/></button></header><dl><dt>Event</dt><dd>{inspected.kind}</dd><dt>Recorded at</dt><dd>{new Date(inspected.at).toLocaleString()}</dd>{inspected.kind==='tool'&&<><dt>Status</dt><dd>{inspected.status}</dd><dt>Duration</dt><dd>{inspected.endedAt?`${((inspected.endedAt-inspected.at)/1000).toFixed(1)} s`:'Not recorded'}</dd></>}</dl>{card&&<><h3>Input</h3><pre>{redact(card.detailDisplay||JSON.stringify(inspected.kind==='tool'?inspected.raw:null,null,2)||'Not recorded')}</pre><h3>Output</h3><pre>{redact(card.output||JSON.stringify(inspected.kind==='tool'?(inspected.rawOutput??inspected.content):null,null,2)||'Not recorded')}</pre></>}{'text'in inspected&&<pre>{redact(inspected.text)}</pre>}</aside>}</div>
  </section>;
}
