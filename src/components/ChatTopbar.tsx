import {Files,GitCompare,Globe,Terminal,FolderOpen,Ellipsis} from 'lucide-react';
import {memo,useEffect,useState} from 'react';
import type {ConnState} from '../lib/conn';
import {basen} from '../lib/path-utils';
import {usePrivacy} from '../lib/privacy-context';
import {AnchoredPopover} from './AnchoredPopover';

function PanelIcon({kind}:{kind:'files'|'changes'|'browser'}) {
  const Icon={files:Files,changes:GitCompare,browser:Globe}[kind];return <Icon size={18} strokeWidth={1.7} aria-hidden/>;
}
export const ChatTopbar=memo(function ChatTopbar({project,chatTitle,workspaceLabel,panelOpen,onOpenFiles,onOpenChanges,onOpenPreview,onOpenSettings,hideThinking,onHideThinking}:{project:string;chatTitle?:string;workspaceLabel?:string;conn:ConnState;panelOpen:boolean;onOpenFiles:()=>void;onOpenChanges:()=>void;onOpenPreview:()=>void;onOpenSettings:()=>void;hideThinking:boolean;onHideThinking:(hide:boolean)=>void}) {
  const {redact}=usePrivacy();const [menu,setMenu]=useState<HTMLElement|null>(null),[tab,setTab]=useState(()=>localStorage.getItem('grok-panel-tab')||'files'),[copied,setCopied]=useState(false);
  useEffect(()=>{const select=(e:Event)=>setTab((e as CustomEvent).detail);document.addEventListener('grok:panel-selected',select);document.addEventListener('grok:panel-tab',select);return()=>{document.removeEventListener('grok:panel-selected',select);document.removeEventListener('grok:panel-tab',select);};},[]);
  const workspace=workspaceLabel||basen(project),title=chatTitle&&chatTitle!=='(no summary)'&&chatTitle!=='New conversation'?chatTitle:workspace;
  return <header className="topbar topbar--refined"><div className="topbar-main">
    <div className="topbar-project" title={redact(project)}>{title!==workspace&&<div className="workspace-breadcrumb"><FolderOpen size={14}/><span>{workspace}</span></div>}<div className="topbar-title">{title}</div></div>
    <div className="topbar-actions">
      <div className="workspace-switcher" role="group" aria-label="Workspace panels">{(['files','changes','browser'] as const).map(kind=><button type="button" key={kind} aria-label={kind==='files'?'Files':kind==='changes'?'Changes':'Browser'} aria-pressed={panelOpen&&tab===kind} title={kind==='files'?'Browse project files':kind==='changes'?'Review changes':'Open the browser beside chat'} onClick={kind==='files'?onOpenFiles:kind==='changes'?onOpenChanges:onOpenPreview}><PanelIcon kind={kind}/><span>{kind==='files'?'Files':kind==='changes'?'Changes':'Browser'}</span></button>)}<button type="button" aria-label="Terminal" title="Terminal · Ctrl+`" onClick={()=>document.dispatchEvent(new CustomEvent('grok:toggle-terminal'))}><Terminal size={18}/><span>Terminal</span></button></div>
      <button type="button" className="composer-icon-button topbar-more" aria-label="Chat options" aria-expanded={Boolean(menu)} onClick={e=>{setCopied(false);setMenu(menu?null:e.currentTarget);}}><Ellipsis size={18}/></button>
    </div>
  </div>{menu&&<AnchoredPopover anchor={menu} onClose={()=>setMenu(null)} label="Chat options" className="composer-popover" placement="bottom-end"><div className="composer-popover-heading">Conversation</div><button onClick={()=>{void navigator.clipboard.writeText(project).then(()=>setCopied(true));}}>{copied?'Path copied':'Copy workspace path'}</button><label className="composer-toggle"><span>Hide thinking<small>Work status remains visible</small></span><input type="checkbox" checked={hideThinking} onChange={e=>onHideThinking(e.target.checked)}/></label><button onClick={()=>{setMenu(null);onOpenSettings();}}>Settings <span aria-hidden>↗</span></button></AnchoredPopover>}</header>;
});
