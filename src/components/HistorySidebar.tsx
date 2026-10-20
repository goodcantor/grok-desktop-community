import type { ExecutionSummary } from "../types/execution";
import {MessagesSquare,Search,ChartNoAxesCombined,Settings,PanelLeft,MessageSquarePlus,FolderOpen,ChevronRight,ChevronDown,Ellipsis,Archive,LogOut} from 'lucide-react';
import {BillingSummary,openUsage} from './UsageView';
import type {BillingResult} from '../types/workspace';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {BrandMark} from './BrandMark';
import {AnchoredPopover} from './AnchoredPopover';
import {basen} from '../lib/path-utils';
import type {AuthStatus,HistorySession,HistoryHit,HistoryProgress} from '../types/desktop';

export function Highlight({text,query}:{text:string;query:string}) {
  const words=query.split(/[^\p{L}\p{N}_]+/u).filter(Boolean).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
  if(!words.length)return <>{text}</>;
  const regex=new RegExp(`(${words.join('|')})`,'giu');
  return <>{text.split(regex).map((part,i)=>i%2?<mark key={i}>{part}</mark>:part)}</>;
}
function SearchChats({onClose,onOpen,disabled,rows,scope,generalPath}:{onClose:()=>void;onOpen:(row:HistoryHit,query:string)=>Promise<void>;disabled:boolean;rows:HistorySession[];scope:{cwd:string;sessionId:string}|null;generalPath?:string}) {
  const [query,setQuery]=useState(''),[cwd,setCwd]=useState(scope?.cwd||''),[hits,setHits]=useState<HistoryHit[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const serial=useRef(0),dialog=useRef<HTMLDivElement>(null),input=useRef<HTMLInputElement>(null);
  const displayProject=(path:string)=>path===generalPath?'General':basen(path);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;input.current?.focus();const key=(e:KeyboardEvent)=>{
    if(e.key==='Escape'){e.preventDefault();onClose();}
    if(e.key==='Tab'){const nodes=dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select:not(:disabled)');if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  };window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);previous?.focus();};},[]);
  useEffect(()=>{const token=++serial.current;setHits([]);setTotal(0);setError('');if(!query.trim()){setLoading(false);return;}setLoading(true);
    const timer=setTimeout(()=>{window.grokDesktop.searchHistory({query,cwd:cwd||undefined,sessionId:scope?.sessionId}).then(result=>{if(token===serial.current){setHits(result.items);setTotal(result.total);}}).catch(e=>{if(token===serial.current)setError(String(e.message||e));}).finally(()=>{if(token===serial.current)setLoading(false);});},220);
    return()=>clearTimeout(timer);
  },[query,cwd,scope?.sessionId]);
  async function more(){const token=serial.current;setLoading(true);try{const result=await window.grokDesktop.searchHistory({query,cwd:cwd||undefined,sessionId:scope?.sessionId,offset:hits.length});if(token===serial.current)setHits(old=>[...old,...result.items]);}catch(e){if(token===serial.current)setError(String(e));}finally{if(token===serial.current)setLoading(false);}}
  const groups=[...new Set(hits.map(hit=>hit.key))];
  return createPortal(<div className="history-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="history-dialog" role="dialog" aria-modal="true" aria-label={scope?'Search this chat':'Search chats'} ref={dialog}>
    <div className="search-heading"><span>{scope?'Search this chat':'Search chats'}</span><button className="icon-button" aria-label="Close search" onClick={onClose}>×</button></div>
    <input ref={input} className="history-search-input" aria-label="Search all messages" placeholder="Search messages, code or conversations…" value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="search-caption"><select aria-label="Search project" value={cwd} disabled={Boolean(scope)} onChange={e=>setCwd(e.target.value)}><option value="">All projects</option>{[...new Set(rows.map(row=>row.cwd))].map(path=><option value={path} key={path}>{displayProject(path)}</option>)}</select><span>{scope?'Current conversation':'Titles and every message'}</span></div>
    <div className="search-results" aria-live="polite">
      {error&&<p className="history-error">{error}</p>}
      {!query.trim()&&<div className="search-empty">Find a thought, a snippet of code, or a conversation.</div>}
      {query.trim()&&!loading&&!hits.length&&!error&&<div className="search-empty">No conversations found.</div>}
      {groups.map(key=>{const matched=hits.filter(hit=>hit.key===key),first=matched[0];return <section className="search-hit-group" key={key}><div className="search-group-heading"><span>{displayProject(first.cwd)}</span><strong><Highlight text={first.title} query={query}/></strong></div>{matched.map(hit=><button key={`${hit.key}:${hit.ordinal}`} className="search-result" disabled={disabled||!hit.available} onClick={()=>void onOpen(hit,query).then(onClose).catch(e=>setError(e.message||String(e)))}>
        <div className="search-result-meta">{hit.role==='title'?'Conversation':hit.role==='user'?'You':'Grok'}{!hit.available?' · Folder unavailable':''}</div><p><Highlight text={hit.snippet} query={query}/></p>
      </button>)}</section>;})}
      {loading&&<div className="search-empty" role="status">Searching your history…</div>}
      {!loading&&hits.length<total&&<button className="btn search-more" onClick={()=>void more()}>Load more results ({hits.length} of {total})</button>}
    </div><div className="search-footer">Your history stays on this computer <kbd>Esc to close</kbd></div>
  </div></div>,document.body);
}
export function HistorySidebar({project,sessionId,auth,disabled=false,inert=false,collapsed=false,onToggle,onOpen,onNew,onHome,onPick,onSettings,onLogout,onRename,onDelete,recentProjects=[],generalPath}:{
  project:string|null;sessionId:string|null;auth:AuthStatus|null;disabled?:boolean;inert?:boolean;collapsed?:boolean;onToggle?:()=>void;generalPath?:string;
  onOpen:(row:HistorySession|HistoryHit,query?:string)=>Promise<void>;onNew:()=>void;onHome?:()=>void;onPick:()=>void;onSettings:()=>void;onLogout:()=>void;
  onRename:(row:HistorySession,title:string)=>Promise<void>;onDelete:(row:HistorySession)=>Promise<void>;recentProjects?:string[];
}) {
  const [rows,setRows]=useState<HistorySession[]>([]),[pins,setPins]=useState<string[]>([]),[folded,setFolded]=useState<string[]>([]),[archived,setArchived]=useState<string[]>([]),[showArchive,setShowArchive]=useState(false),[search,setSearch]=useState(false),[scope,setScope]=useState<{cwd:string;sessionId:string}|null>(null),[error,setError]=useState('');
  const [drawerOpen,setDrawerOpen]=useState(false);
  const toggleSidebar=()=>{if(innerWidth<1000)setDrawerOpen(value=>!value);else onToggle?.();};
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape')setDrawerOpen(false);};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
  const [executions,setExecutions]=useState<ExecutionSummary[]>([]);
  const [grouped,setGrouped]=useState(()=>localStorage.getItem('grok-history-grouped')!=='false');
  const [order,setOrder]=useState(()=>localStorage.getItem('grok-history-order')||'recent');
  const [manual,setManual]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('grok-history-manual')||'[]');}catch{return [];}});
  const move=(key:string,direction:number)=>{const ids=visibleRows.map(row=>row.key),index=ids.indexOf(key),to=index+direction;if(index<0||to<0||to>=ids.length)return;[ids[index],ids[to]]=[ids[to],ids[index]];setManual(ids);setOrder('manual');localStorage.setItem('grok-history-manual',JSON.stringify(ids));localStorage.setItem('grok-history-order','manual');};
  useEffect(()=>{void window.grokDesktop.executionList?.().then(setExecutions);return window.grokDesktop.on('execution:catalog',setExecutions);},[]);
  const statusFor=(row:HistorySession)=>executions.find(item=>item.sessionId===row.id&&item.cwd.toLowerCase()===row.cwd.toLowerCase());
  const statusLabel=(row:HistorySession)=>{const live=statusFor(row);return live?.waiting?'Waiting for your input':live?.active?'Working':live?.status==='failed'?'Response failed':live?.unseen?'New response':'';};
  const [progress,setProgress]=useState<HistoryProgress>({phase:'idle',done:0,total:0});
  const [editing,setEditing]=useState<HistorySession|null>(null),[title,setTitle]=useState(''),[menu,setMenu]=useState<{row:HistorySession;anchor:HTMLElement}|null>(null);
  const [expanded,setExpanded]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem('grok-expanded-history')||'[]');}catch{return [];}}),[headerMenu,setHeaderMenu]=useState<HTMLElement|null>(null),[accountMenu,setAccountMenu]=useState<HTMLElement|null>(null),[billing,setBilling]=useState<BillingResult|null>(null);
  useEffect(()=>{const event=(e:Event)=>setBilling((e as CustomEvent).detail);document.addEventListener('grok:billing',event);return()=>document.removeEventListener('grok:billing',event);},[]);
  const showAll=(cwd:string)=>setExpanded(old=>{const next=[...old,cwd];localStorage.setItem('grok-expanded-history',JSON.stringify(next));return next;});
  const refreshSerial=useRef(0);
  const refresh=async()=>{const token=++refreshSerial.current;try{const result=await window.grokDesktop.historyCatalog();if(token!==refreshSerial.current)return;setRows(result.sessions);setPins(result.pinned);setFolded(result.collapsed);setArchived(result.archived||[]);setError('');}catch(e){if(token===refreshSerial.current)setError(String(e));}};
  useEffect(()=>{let active=true;const run=()=>{if(active)void refresh();};run();const timer=setInterval(run,12000);window.addEventListener('focus',run);const unsub=window.grokDesktop.onHistoryProgress(setProgress);return()=>{active=false;refreshSerial.current++;clearInterval(timer);window.removeEventListener('focus',run);unsub();};},[]);
  useEffect(()=>{void refresh();setMenu(null);setDrawerOpen(false);},[project,sessionId]);
  useEffect(()=>{const hotkey=(e:KeyboardEvent)=>{if(inert||!(e.ctrlKey||e.metaKey))return;if(e.key.toLowerCase()==='k'){e.preventDefault();setScope(null);setSearch(true);}if(e.key.toLowerCase()==='f'&&project&&sessionId){e.preventDefault();setScope({cwd:project,sessionId});setSearch(true);}};window.addEventListener('keydown',hotkey);return()=>window.removeEventListener('keydown',hotkey);},[inert,project,sessionId]);
  async function pin(row:HistorySession){try{const prefs=await window.grokDesktop.pinHistory({cwd:row.cwd,sessionId:row.id,pinned:!pins.includes(row.key)});setPins(prefs.pinned);}catch(e){setError(String(e));}}
  async function fold(cwd:string){try{const prefs=await window.grokDesktop.collapseHistory({cwd,collapsed:!folded.includes(cwd)});setFolded(prefs.collapsed);}catch(e){setError(String(e));}}
  async function archive(row:HistorySession){try{await window.grokDesktop.archiveHistory({cwd:row.cwd,sessionId:row.id,archived:!archived.includes(row.key)});await refresh();}catch(e){setError(String(e));}}
  const visibleRows=rows.filter(row=>archived.includes(row.key)===showArchive).sort((a,b)=>order==='manual'?((manual.indexOf(a.key)<0?1e8:manual.indexOf(a.key))-(manual.indexOf(b.key)<0?1e8:manual.indexOf(b.key))):new Date(b.lastActiveAt||b.updatedAt||0).getTime()-new Date(a.lastActiveAt||a.updatedAt||0).getTime());
  const groups=[...new Set([...visibleRows.map(r=>r.cwd),...(showArchive?[]:recentProjects)])];
  const projectName=(cwd:string)=>cwd===generalPath?'General':basen(cwd);
  function rowView(row:HistorySession){return <div key={row.key} className={`history-row${project===row.cwd&&sessionId===row.id?' selected':''}`}>
    <button className="history-row-open" disabled={disabled||!row.available} title={row.available?[row.title,statusLabel(row)].filter(Boolean).join(" · "):'Project folder unavailable'} onClick={()=>{setDrawerOpen(false);void onOpen(row).catch(e=>setError(e.message||String(e)));}}><i className={`chat-state ${statusFor(row)?.waiting?'waiting':statusFor(row)?.active?'running':statusFor(row)?.status==='failed'?'failed':statusFor(row)?.unseen?'unseen':''}`} aria-label={statusLabel(row)||undefined}/><span>{row.title==='(no summary)'?'New conversation':row.title}<small className="chat-state-label">{statusLabel(row)}</small></span>{!row.available&&<small>Folder unavailable</small>}</button>
    <button className="history-row-actions" aria-label={`Actions for ${row.title}`} aria-expanded={menu?.row.key===row.key} onClick={e=>setMenu(menu?.row.key===row.key?null:{row,anchor:e.currentTarget})}><Ellipsis size={18}/></button>
  </div>;}
  return <>{drawerOpen&&<button className="sidebar-drawer-scrim" aria-label="Close sidebar" onClick={()=>setDrawerOpen(false)}/>}<aside className={`sidebar history-sidebar${collapsed?' sidebar--collapsed':''}${drawerOpen?' sidebar-drawer-open':''}`} inert={inert||undefined}>
    <nav className="navigation-rail" aria-label="Navigation"><button className="rail-brand" title="Grok" aria-label="General chat" onClick={onHome}><BrandMark size={25}/></button><button className="rail-active" aria-label="Chats" title="Chats" onClick={toggleSidebar}><MessagesSquare size={21}/></button><button aria-label="New chat" title="New chat · Ctrl+N" disabled={disabled} onClick={onNew}><MessageSquarePlus size={21}/></button><button aria-label="Search chats" title="Search chats · Ctrl+K" onClick={()=>{setScope(null);setSearch(true);}}><Search size={21}/></button><button aria-label="Usage" title="Usage" onClick={openUsage}><ChartNoAxesCombined size={21}/></button><div className="rail-spacer"/><button aria-label="Settings" title="Settings" onClick={onSettings}><Settings size={21}/></button><button className="rail-account" aria-label="Account" title="Account" onClick={e=>setAccountMenu(accountMenu?null:e.currentTarget)}>{(auth?.displayName||auth?.email||'G').slice(0,1).toUpperCase()}</button></nav>
    {(!collapsed||drawerOpen)&&<div className="history-body"><header className="history-heading"><strong>Grok</strong><button className="icon-button" aria-label="History options" onClick={e=>setHeaderMenu(headerMenu?null:e.currentTarget)}><Ellipsis size={18}/></button><button className="icon-button" onClick={()=>{if(drawerOpen)setDrawerOpen(false);else onToggle?.();}} aria-label="Collapse sidebar"><PanelLeft size={18}/></button></header>
    <nav className="history-nav"><button disabled={disabled} onClick={onNew}><MessageSquarePlus size={18}/>New chat</button><button disabled={disabled} onClick={onPick}><FolderOpen size={18}/>Open project</button><button onClick={()=>{setScope(null);setSearch(true);}}><Search size={18}/>Search chats<kbd>Ctrl K</kbd></button>{showArchive&&<button onClick={()=>setShowArchive(false)}><Archive size={18}/>Back to chats</button>}</nav>
    <div className="history-view-controls"><select aria-label="Chat grouping" value={grouped?'grouped':'flat'} onChange={e=>{const value=e.target.value==='grouped';setGrouped(value);localStorage.setItem('grok-history-grouped',String(value));}}><option value="grouped">By workspace</option><option value="flat">All chats</option></select><select aria-label="Chat order" value={order} onChange={e=>{setOrder(e.target.value);localStorage.setItem('grok-history-order',e.target.value);if(e.target.value==='manual'){const ids=visibleRows.map(row=>row.key);setManual(ids);localStorage.setItem('grok-history-manual',JSON.stringify(ids));}}}><option value="recent">Recent activity</option><option value="manual">Manual order</option></select></div>
    <div className="history-scroll">
      {!showArchive&&visibleRows.some(row=>pins.includes(row.key))&&<section className="history-group"><h2>Pinned</h2>{visibleRows.filter(r=>pins.includes(r.key)).map(rowView)}</section>}
      {!grouped&&visibleRows.filter(row=>!pins.includes(row.key)||showArchive).map(rowView)}
      {grouped&&groups.map(cwd=>{const chats=visibleRows.filter(r=>r.cwd===cwd&&(showArchive||!pins.includes(r.key)));return <section className="history-group" key={cwd}><button className="history-group-title" onClick={()=>void fold(cwd)} aria-expanded={!folded.includes(cwd)} title={cwd}>{folded.includes(cwd)?<ChevronRight size={14}/>:<ChevronDown size={14}/>}<FolderOpen size={16}/><span>{projectName(cwd)}</span>{chats.some(row=>statusFor(row)?.waiting)&&<i className="chat-state waiting" aria-label="Workspace needs your input"/>}<small>{chats.length||''}</small></button>
        {!folded.includes(cwd)&&<>{(expanded.includes(cwd)?chats:chats.slice(0,6)).map(rowView)}{chats.length>6&&!expanded.includes(cwd)&&<button className="history-show-more" onClick={()=>showAll(cwd)}>Show more</button>}{!chats.length&&<p className="history-hint">No conversations yet</p>}</>}
      </section>})}
      {!groups.length&&<p className="history-hint">{showArchive?'No archived conversations.':'Start a conversation in General.'}</p>}
    </div><footer className="history-footer">{progress.phase==='indexing'&&<div className="index-progress" role="status">Updating history {progress.done}/{progress.total}</div>}{error&&<p className="history-error">{error}</p>}<BillingSummary billing={billing} onClick={openUsage}/><div className="sidebar-footer-actions"><button onClick={onSettings}><Settings size={16}/>Settings</button><button onClick={openUsage}><ChartNoAxesCombined size={16}/>Usage</button><button aria-label="Account" title="Account" onClick={e=>setAccountMenu(accountMenu?null:e.currentTarget)}>{(auth?.displayName||auth?.email||"G").slice(0,1).toUpperCase()}</button></div></footer></div>}
  </aside>
    {headerMenu&&<AnchoredPopover anchor={headerMenu} onClose={()=>setHeaderMenu(null)} label="History options" className="composer-popover" placement="bottom-start"><button onClick={()=>{setShowArchive(!showArchive);setHeaderMenu(null);}}><Archive size={16}/>{showArchive?'All chats':`Archived chats (${archived.length})`}</button><button onClick={()=>{setHeaderMenu(null);setScope(null);setSearch(true);}}><Search size={16}/>Search chats</button></AnchoredPopover>}
    {accountMenu&&<AnchoredPopover anchor={accountMenu} onClose={()=>setAccountMenu(null)} label="Account" className="composer-popover" placement="right-end"><div className="composer-popover-heading">{auth?.displayName||auth?.email||'Grok account'}</div><button onClick={()=>{setAccountMenu(null);onSettings();}}><Settings size={16}/>Settings</button><button onClick={()=>{setAccountMenu(null);onLogout();}}><LogOut size={16}/>Sign out</button></AnchoredPopover>}
    {menu&&!inert&&<AnchoredPopover anchor={menu.anchor} onClose={()=>setMenu(null)} label="Chat actions" placement="right-start" className="composer-popover history-actions-popover">
      <button onClick={()=>{void pin(menu.row);setMenu(null);}}>{pins.includes(menu.row.key)?'Unpin':'Pin chat'}</button>
      <button disabled={disabled} onClick={()=>{setEditing(menu.row);setTitle(menu.row.title);setMenu(null);}}>Rename</button>
      <button onClick={()=>{move(menu.row.key,-1);setMenu(null);}}>Move up</button><button onClick={()=>{move(menu.row.key,1);setMenu(null);}}>Move down</button><button onClick={()=>{void archive(menu.row);setMenu(null);}}>{archived.includes(menu.row.key)?'Restore chat':'Archive chat'}</button>
      <button onClick={()=>{void window.grokDesktop.exportHistory({cwd:menu.row.cwd,sessionId:menu.row.id}).catch(e=>setError(String(e)));setMenu(null);}}>Export Markdown</button>
      <button className="delete-chat" disabled={disabled} onClick={()=>{const row=menu.row;setMenu(null);if(window.confirm(`Delete “${row.title}”? This cannot be undone.`))void onDelete(row).then(refresh).catch(e=>setError(String(e)));}}>Delete</button>
    </AnchoredPopover>}
    {search&&!inert&&<SearchChats onClose={()=>setSearch(false)} disabled={disabled} rows={rows} scope={scope} generalPath={generalPath} onOpen={(row,q)=>onOpen(row,q)}/>}
    {editing&&createPortal(<div className="history-scrim"><form className="rename-dialog" role="dialog" aria-modal="true" aria-label="Rename chat" onSubmit={e=>{e.preventDefault();void onRename(editing,title).then(()=>{setEditing(null);void refresh();}).catch(e=>setError(e.message||String(e)));}}><h2>Rename chat</h2><input aria-label="Chat title" autoFocus maxLength={100} value={title} onChange={e=>setTitle(e.target.value)}/><div><button type="button" className="btn" onClick={()=>setEditing(null)}>Cancel</button><button className="btn primary" disabled={!title.trim()}>Save</button></div></form></div>,document.body)}
  </>;
}
