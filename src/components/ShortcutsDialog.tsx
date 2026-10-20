import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {SHORTCUTS} from '../lib/shortcuts';
import {Button} from './ui/Button';

export function ShortcutsDialog({onClose}:{onClose:()=>void}) {
  const [query,setQuery]=useState('');const input=useRef<HTMLInputElement>(null);
  const matches=SHORTCUTS.filter(row=>`${row.name} ${row.keys} ${row.description}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;input.current?.focus();return()=>{if(previous?.isConnected)previous.focus();else document.dispatchEvent(new CustomEvent('grok:focus-composer'));};},[]);
  return createPortal(<div className="history-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="shortcuts-dialog" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onKeyDown={e=>{
    if(e.key==='Escape'){e.preventDefault();e.stopPropagation();onClose();}
    if(e.key==='Tab'){
      const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input,button:not(:disabled)')),at=nodes.indexOf(document.activeElement as HTMLElement);
      if((e.shiftKey&&at===0)||(!e.shiftKey&&at===nodes.length-1)){e.preventDefault();nodes[e.shiftKey?nodes.length-1:0]?.focus();}
    }
  }}><header><h2>Keyboard shortcuts</h2><Button size="icon" onClick={onClose} aria-label="Close shortcuts"><X size={18} aria-hidden/></Button></header>
    <input ref={input} className="history-search-input" type="search" aria-label="Find a shortcut" placeholder="Search shortcuts…" value={query} onChange={e=>setQuery(e.target.value)}/>
    <dl>{matches.map(row=><div key={row.name}><dt>{row.name}<small>{row.description}</small></dt><dd><kbd>{row.keys}</kbd></dd></div>)}</dl>{!matches.length&&<p className="search-empty">No matching shortcuts.</p>}
  </section></div>,document.body);
}
