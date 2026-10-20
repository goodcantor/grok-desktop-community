import {Plus,Lightbulb,Target,ShieldCheck,ArrowUp,Square,Paperclip,ChartNoAxesCombined,FolderOpen,Image,MessageCircle,ChevronDown} from 'lucide-react';
import {openUsage} from './UsageView';
import {useEffect, useRef, useState} from 'react';
import {AnchoredPopover} from './AnchoredPopover';
import type {AvailableModel, ComposerRuntime} from '../types/desktop';
import type {PermissionMode} from '../lib/permission-mode';
import type {ReasoningEffort} from '../lib/reasoning-effort';
import {formatTokens} from '../lib/usage';
import {contextMeter} from '../../shared/composer-state.mjs';

export type DraftMode = 'chat' | 'plan' | 'goal';
export type ComposerSettingsProps = {
  modelId: string | null; modelName: string | null; availableModels: AvailableModel[];
  reasoningEffort: ReasoningEffort; permissionMode: PermissionMode;
  allowOutsideProject: boolean; sandboxTerminal: boolean;
  runtime: ComposerRuntime | null; liveContextTokens: number;
  onOpenModel?:()=>Promise<void>;
  onModel: (id:string)=>Promise<void>; onReasoningEffort:(value:ReasoningEffort)=>Promise<void>;
  onPermissionMode:(value:PermissionMode)=>Promise<void>; onToggleAllowOutside:()=>Promise<void>;
  onSandboxTerminal:(value:boolean)=>Promise<void>; onContextWindow:(size:number)=>Promise<void>;
  onCompress:()=>void; onOpenSettings:()=>void;
};

export function SmallIcon({kind}:{kind:'plus'|'plan'|'goal'|'shield'|'arrow'|'stop'|'clip'}) {
  const Icon={plus:Plus,plan:Lightbulb,goal:Target,shield:ShieldCheck,arrow:ArrowUp,stop:Square,clip:Paperclip}[kind];return <Icon size={18} strokeWidth={1.7} aria-hidden="true"/>;
}

export function ComposerSettings({settings,disabled,selectedMode,onSelectMode,onImages,onFiles,onFolder,onCommands,onGoalAction}:{
  settings:ComposerSettingsProps; disabled:boolean; selectedMode:DraftMode;
  onSelectMode:(mode:DraftMode)=>void;onImages:()=>void;onFiles:()=>void;onFolder:()=>void;onCommands:()=>void;
  onGoalAction:(action:'status'|'pause'|'resume'|'clear')=>void;
}) {
  const [open,setOpen]=useState<'add'|'mode'|'model'|'access'|'context'|null>(null),[pending,setPending]=useState(false);
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement|null>(null);
  const [tip,setTip]=useState(false),[failure,setFailure]=useState(''),[clearConfirm,setClearConfirm]=useState(false);
  const tipTimer=useRef<ReturnType<typeof setTimeout>|null>(null),contextRef=useRef<HTMLButtonElement|null>(null);
  const hideTip=()=>{if(tipTimer.current)clearTimeout(tipTimer.current);setTip(false);};
  const showTip=()=>{if(!open)tipTimer.current=setTimeout(()=>setTip(true),350);};
  useEffect(()=>{hideTip();setClearConfirm(false);setFailure('');},[open]);
  useEffect(()=>()=>{if(tipTimer.current)clearTimeout(tipTimer.current);},[]);
  const toggle=(menu:typeof open,e:React.MouseEvent<HTMLButtonElement>)=>{trigger.current=e.currentTarget;setOpen(open===menu?null:menu);};
  const run=async(fn:()=>Promise<void>)=>{if(pending)return;
    const editor=document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]'),saved=editor?{start:editor.selectionStart,end:editor.selectionEnd,direction:editor.selectionDirection,scroll:editor.scrollTop}:null;let moved=false;
    const focus=(e:FocusEvent)=>{const el=e.target as HTMLElement;if(el!==editor&&!el.closest('.composer-settings,.composer-popover'))moved=true;};document.addEventListener('focusin',focus);
    setPending(true);setFailure('');try{await fn();}catch(e){setFailure(e instanceof Error?e.message:String(e));}finally{setPending(false);document.removeEventListener('focusin',focus);if(!moved&&editor?.isConnected&&saved){editor.focus({preventScroll:true});editor.setSelectionRange(saved.start,saved.end,saved.direction);editor.scrollTop=saved.scroll;}}};
  const current=settings.availableModels.find(m=>m.modelId===settings.modelId);
  const efforts=current?.reasoningEfforts?.length?current.reasoningEfforts:[{value:'low',label:'Low'},{value:'medium',label:'Medium'},{value:'high',label:'High'},{value:'xhigh',label:'Extra High'}];
  const meter=contextMeter(settings.liveContextTokens || settings.runtime?.context?.used || 0,settings.runtime?.context?.total || 0);
  const percentLabel=meter?(meter.used>0&&meter.percent===0?'<1':String(meter.percent)):'—';
  const windows=current?.contextWindows || [];
  const busy=disabled||pending;
  const accessLabel=settings.permissionMode==='always-approve'?'Always approve':settings.permissionMode==='auto'?'Auto approvals':'Ask to approve';
  const goal=settings.runtime?.goal;
  return <div className="composer-settings" ref={root}>
    <div className="composer-settings-left">
      <button type="button" className="composer-icon-button add-trigger" aria-label="Add attachments" aria-expanded={open==='add'} onClick={e=>toggle('add',e)}><SmallIcon kind="plus"/></button>
      <button type="button" className={`composer-access ${settings.permissionMode==='always-approve'?'elevated':''}`} aria-label="Tool permission mode" aria-expanded={open==='access'} onClick={e=>toggle('access',e)}><SmallIcon kind="shield"/><span>{accessLabel}</span></button>
      <button type="button" className={`composer-mode-trigger ${selectedMode!=='chat'?'composer-mode-chip':''}`} data-mode={selectedMode} aria-label="Message mode" aria-expanded={open==='mode'} title={disabled?'Mode changes are available when Grok is ready':'Choose Chat, Plan or Goal'} onClick={e=>toggle('mode',e)}><span>{selectedMode==='chat'?'Chat':selectedMode==='plan'?'Plan':goal?.status?.includes('paused')?'Goal · Paused':goal?.status==='active'?'Goal · Active':'Goal'}</span><ChevronDown size={14}/></button>
    </div>
    <div className="composer-settings-right"><button className="composer-icon-button usage-trigger" title="Usage" aria-label="Usage" onClick={openUsage}><ChartNoAxesCombined size={18}/></button>
      <div className="context-control" onMouseEnter={showTip} onMouseLeave={hideTip}>
        <button type="button" ref={contextRef} onFocus={showTip} onBlur={hideTip} className="context-trigger composer-icon-button" aria-label="Context window" aria-expanded={open==='context'} onClick={e=>toggle('context',e)}>
          <svg viewBox="0 0 24 24" width="20" height="20" className={meter&&meter.percent>=80?'context-high':''} aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="var(--border)" strokeWidth="3"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" pathLength="100" strokeDasharray={`${meter?.percent||0} 100`} transform="rotate(-90 12 12)"/></svg><span className="context-percent">{percentLabel}{meter?'%':''}</span>
        </button>
        {tip&&!open&&<AnchoredPopover anchor={contextRef.current} onClose={hideTip} tooltip label="Context usage" placement="top-end" className="context-tooltip"><span>Context window</span>{meter?<><strong>{percentLabel}% used ({meter.left}% left)</strong><span>{formatTokens(meter.used)} / {formatTokens(meter.total)} tokens</span></>:<span>Waiting for engine data</span>}</AnchoredPopover>}
      </div>
      <button type="button" className="composer-model-trigger" aria-label="Model and reasoning" aria-expanded={open==='model'} title={disabled?'Changes are available when Grok is ready':'Choose model and reasoning'} onClick={e=>{toggle('model',e);if(!settings.availableModels.length&&settings.onOpenModel)void run(settings.onOpenModel);}}><span>{settings.modelName||settings.modelId||'Choose model'}</span><span className="composer-effort-label">{current?.supportsReasoningEffort===false?'':efforts.find(e=>e.value===settings.reasoningEffort)?.label||settings.reasoningEffort}</span><ChevronDown size={14}/></button>
    </div>
    {open&&<AnchoredPopover anchor={trigger.current} onClose={()=>setOpen(null)} placement={open==='model'||open==='context'?'top-end':'top-start'} className={`composer-popover composer-popover-${open}`} label={open==='add'?'Add to message':open==='mode'?'Mode settings':open==='model'?'Model and reasoning settings':open==='access'?'Access settings':'Context settings'}>
      {failure&&<p role="alert" className="history-error">{failure}</p>}{disabled&&open!=='add'&&<p className="composer-popover-note">Grok is connecting or working. You can keep writing; unavailable controls will return when it is ready.</p>}
      {open==='add'&&<><div className="composer-popover-heading">Add</div>
        <button type="button" onClick={()=>{setOpen(null);onFiles();}}><SmallIcon kind="clip"/><span>Files<small>Attach local file paths</small></span></button>
        <button type="button" onClick={()=>{setOpen(null);onFolder();}}><FolderOpen size={18}/><span>Folders<small>Add a folder for Grok to work with</small></span></button>
        <button type="button" onClick={()=>{setOpen(null);onImages();}}><Image size={18}/><span>Images<small>Upload screenshots and images</small></span></button>
        <button type="button" onClick={()=>{setOpen(null);onCommands();}}><span aria-hidden="true">/</span><span>Commands and skills<small>Browse explicit slash commands</small></span></button>
      </>}
      {open==='mode'&&<>        <div className="composer-popover-heading">Mode</div><div role="radiogroup" aria-label="Message mode">{(['chat','plan','goal'] as DraftMode[]).map(mode=><button type="button" role="radio" aria-checked={selectedMode===mode} key={mode} disabled={disabled} className={selectedMode===mode?'selected':''} onClick={()=>{setOpen(null);onSelectMode(mode);}}>{mode==='chat'?<MessageCircle size={18}/>:<SmallIcon kind={mode}/>}<span>{mode==='chat'?'Chat':mode==='plan'?'Plan mode':'Goal'}<small>{mode==='chat'?'Regular questions and tasks':mode==='plan'?'Explore and plan before making changes':'Pursue the next message as an objective'}</small></span><span className="menu-check" aria-hidden="true">{selectedMode===mode?'✓':''}</span></button>)}</div>
        {goal&&goal.status!=='complete'&&<><div className="composer-popover-heading">Saved goal · {goal.status.replaceAll('_',' ')}</div><div className="goal-actions">{(goal.status==='active'?['status','pause','clear']:['status','resume','clear']).map(action=><button type="button" disabled={disabled} key={action} onClick={()=>{if(action==='clear'){setClearConfirm(true);return;}setOpen(null);onGoalAction(action as 'status'|'pause'|'resume'|'clear');}}>{action}</button>)}</div></>}
{clearConfirm&&<div className="goal-clear-confirm" role="alert"><p>Clear the saved goal? Your conversation will be kept.</p><button type="button" onClick={()=>setClearConfirm(false)}>Cancel</button><button type="button" onClick={()=>{setOpen(null);onGoalAction('clear');}}>Clear goal</button></div>}</>}
      {open==='model'&&<><div className="composer-popover-heading">Model</div><div role="radiogroup" aria-label="Session model">{!settings.availableModels.length&&<p className="history-hint">{pending?"Loading the engine model catalog…":"Open this menu to connect and load available models."}</p>}{settings.availableModels.map(m=><button type="button" role="radio" aria-checked={m.modelId===settings.modelId} aria-label={m.name} key={m.modelId} disabled={busy} className={m.modelId===settings.modelId?'selected':''} onClick={()=>void run(()=>settings.onModel(m.modelId))}><span>{m.name}{m.description&&<small>{m.description}</small>}</span><span className="menu-check">{m.modelId===settings.modelId?'✓':''}</span></button>)}</div>
        {current?.supportsReasoningEffort!==false&&<><div className="composer-popover-heading">Reasoning</div><div className="reasoning-options" role="radiogroup" aria-label="Reasoning effort">{efforts.map(e=><button type="button" role="radio" aria-checked={settings.reasoningEffort===e.value} key={e.value} disabled={busy} onClick={()=>void run(()=>settings.onReasoningEffort(e.value as ReasoningEffort))}>{e.label}</button>)}</div></>}
      </>}
      {open==='access'&&<><div className="composer-popover-heading">Tool approvals</div><div role="radiogroup" aria-label="Tool approvals">{([{value:'ask',name:'Ask to approve',description:'Approve each tool request'},{value:'auto',name:'Auto approvals',description:'Grok decides when approval is needed'},{value:'always-approve',name:'Always approve',description:'Run tools without inline approvals'}] as const).map(m=><button type="button" role="radio" aria-checked={settings.permissionMode===m.value} disabled={pending} key={m.value} onClick={()=>void run(()=>settings.onPermissionMode(m.value))}><span>{m.name}<small>{m.description}</small></span><span className="menu-check">{settings.permissionMode===m.value?'✓':''}</span></button>)}</div>
        <div className="composer-popover-heading">File and terminal access</div><label className="composer-toggle"><span>Outside workspace<small>Allow paths beyond the current folder</small></span><input type="checkbox" checked={settings.allowOutsideProject} disabled={pending} onChange={()=>void run(settings.onToggleAllowOutside)}/></label><label className="composer-toggle"><span>Sandbox terminal<small>Require isolation; otherwise tool shells are blocked</small></span><input type="checkbox" checked={settings.sandboxTerminal} disabled={pending} onChange={e=>void run(()=>settings.onSandboxTerminal(e.target.checked))}/></label>
        <button type="button" onClick={()=>{setOpen(null);settings.onOpenSettings();}}>All settings <span aria-hidden="true">↗</span></button>
      </>}
      {open==='context'&&<><div className="composer-popover-heading">Context window</div>{meter?<><div className="context-summary"><strong>{percentLabel}% used <span>({meter.left}% left)</span></strong><span>{formatTokens(meter.used)} / {formatTokens(meter.total)} tokens used</span><progress value={meter.percent} max={100}/></div>{windows.length>1?<label className="context-size-label">Window size<select aria-label="Context window size" value={meter.total} disabled={busy} onChange={e=>void run(()=>settings.onContextWindow(Number(e.target.value)))}>{!windows.includes(meter.total)&&<option value={meter.total}>{formatTokens(meter.total)}</option>}{windows.map(size=><option value={size} key={size}>{formatTokens(size)} tokens</option>)}</select></label>:<p className="composer-popover-note">The current model provides one context size.</p>}<p className="composer-popover-note">{settings.runtime?.context?.autoCompactThresholdPercent?`Grok automatically compacts at ${settings.runtime.context.autoCompactThresholdPercent}% usage.`:'Usage is reported by the Grok engine.'} Choosing a smaller window may trigger compaction.</p></>:<p className="composer-popover-note">Waiting for the engine to report context usage.</p>}<button type="button" disabled={disabled} onClick={()=>{setOpen(null);settings.onCompress();}}>Compress conversation <span aria-hidden="true">↘</span></button></>}
    </AnchoredPopover>}
  </div>;
}
