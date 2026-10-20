import { useEffect, useState } from 'react';
import { FileText, Folder, Search } from 'lucide-react';
import type { FileEntry } from './files/types';

/** Completion uses the same gated directory IPC as Files. No model-side mention grammar is invented. */
export function FileReferenceMenu({token,cwd,onPick,onFolder,onClose}:{token:string;cwd:string;onPick:(file:FileEntry)=>void;onFolder:(path:string)=>void;onClose:()=>void}) {
  const [entries,setEntries]=useState<FileEntry[]>([]),[active,setActive]=useState(0),[error,setError]=useState('');
  useEffect(()=>{let live=true;setError('');const clean=token.replace(/^"/,'').replace(/\\/g,'/'),slash=clean.lastIndexOf('/'),dir=slash>=0?clean.slice(0,slash+1):'',query=clean.slice(slash+1).toLowerCase();
    void window.grokDesktop.listDir(cwd.replace(/[/\\]$/,'')+'/'+dir).then(result=>{if(live){setEntries(result.filter(file=>file.name.toLowerCase().includes(query)).slice(0,30));setActive(0);}}).catch(error=>{if(live){setEntries([]);setError(String(error));}});return()=>{live=false;};},[token,cwd]);
  const choose=(file:FileEntry)=>file.isDirectory?onFolder(file.path):onPick(file);
  useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();onClose();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopImmediatePropagation();setActive(index=>Math.max(0,Math.min(entries.length-1,index+(event.key==='ArrowDown'?1:-1))));}else if(event.key==='Enter'&&entries[active]){event.preventDefault();event.stopImmediatePropagation();choose(entries[active]);}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[active,entries,onClose,onPick,onFolder]);
  return <div className="file-reference-menu" role="listbox" aria-label="File references"><header><Search size={14}/>Attach a workspace file</header>{error&&<p role="alert">{error}</p>}{entries.map((file,index)=>{const Icon=file.isDirectory?Folder:FileText;return <button key={file.path} type="button" role="option" aria-selected={index===active} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(file)}><Icon size={15}/><span>{file.name}</span>{file.isDirectory&&<small>Browse</small>}</button>;})}{!entries.length&&!error&&<p>No matching files.</p>}</div>;
}
