import { ImageViewer } from "./ImageViewer";
import { FileReferenceMenu } from "./FileReferenceMenu";
import type { QueuedPrompt, ComposerSubmit } from "../types/prompt";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  DESKTOP_COMMANDS,
  filterCommands,
  formatCommandInsert,
  isSlashMenuOpen,
  slashQuery,
  type SlashCommand,
} from "../lib/commands";
import type { ConnState } from "../lib/conn";
import {
  encodePendingImages,
  filesToPendingImages,
  revokePendingImagePreview,
  type PendingImage,
} from "../lib/pending-images";
import { CommandMenu } from "./CommandMenu";
import {ComposerSettings, SmallIcon, type ComposerSettingsProps, type DraftMode} from './ComposerSettings';
import {useDraft} from '../hooks/useDraft';
import {AnchoredPopover} from './AnchoredPopover';
import type {DraftState} from '../types/desktop';
import {draftIntent} from '../../shared/composer-state.mjs';
import {ChevronDown,MoveVertical,X} from 'lucide-react';

const COMPOSER_HEIGHT_KEY = "grok-desktop-composer-height";
/** Default textarea height (matches previous CSS min-height). */
const COMPOSER_HEIGHT_DEFAULT = 36;
/** Floor so the field stays usable. */
const COMPOSER_HEIGHT_MIN = 36;
/**
 * Leave room for topbar, status bar, chrome, and a sliver of timeline.
 * Users can still pull nearly full-screen (~90vh of the window).
 */
function composerHeightMax(): number {
  if (typeof window === "undefined") return 720;
  return Math.max(
    COMPOSER_HEIGHT_MIN,
    Math.min(320, Math.round(window.innerHeight * 0.35)),
  );
}

function readStoredComposerHeight(): number {
  try {
    if(!localStorage.getItem("grok-custom8-input")){localStorage.removeItem(COMPOSER_HEIGHT_KEY);localStorage.setItem("grok-custom8-input","1");}
    const raw = localStorage.getItem(COMPOSER_HEIGHT_KEY);
    if (!raw) return COMPOSER_HEIGHT_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return COMPOSER_HEIGHT_DEFAULT;
    return Math.min(composerHeightMax(), Math.max(COMPOSER_HEIGHT_MIN, Math.round(n)));
  } catch {
    return COMPOSER_HEIGHT_DEFAULT;
  }
}

function persistComposerHeight(px: number) {
  try {
    localStorage.setItem(COMPOSER_HEIGHT_KEY, String(Math.round(px)));
  } catch {
    /* private mode / quota */
  }
}

/**
 * Draft composer: owns input, attachments, and slash menu so keystrokes do not
 * re-render the chat shell. Parent owns queue + agent delivery.
 */
export const Composer = memo(function Composer({
  draftKey,
  conn,
  projectOpen,
  commands,
  promptQueue,
  onSubmit,
  onLocalCommand,
  onError,
  settings,
  sessionMode,
  onModeChange,
  onStop,
  activity,
  compacting=false,
}: {
  draftKey: string;
  conn: ConnState;
  projectOpen: boolean;
  commands: SlashCommand[];
  promptQueue: QueuedPrompt[];
  /** Return true when the draft should clear (accepted queue/delivery). */
  onSubmit: (payload: ComposerSubmit) => boolean | Promise<boolean>;
  /** Desktop-only slash (e.g. /new, /always-approve) — never reaches the agent. */
  onLocalCommand: (name: string, args?: string) => void | Promise<void>;
  onError: (message: string) => void;
  settings: ComposerSettingsProps;
  sessionMode: string | null;
  onModeChange: (mode: DraftMode) => Promise<boolean>;
  onStop: () => void;
  activity: ReactNode;
  compacting?:boolean;
}) {
  const [input, setInput] = useState("");
  const [selectedMode, setSelectedMode] = useState<DraftMode>(sessionMode==='plan'?'plan':settings.runtime?.goal?.status==='active'?'goal':'chat');
  const [modeChanging,setModeChanging] = useState(false);
  const [submitting,setSubmitting] = useState(false);
  const modeLock=useRef(false), submittedGoal=useRef(false), submitLock=useRef(false);
  const [fileRefs,setFileRefs]=useState<DraftState['files']>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [previewImage,setPreviewImage]=useState<string|null>(null),[referenceDismissed,setReferenceDismissed]=useState(false);
  const referenceMatch=input.match(/(?:^|\s)@("[^"\n]*|[^\s]*)$/);
  const referenceToken=referenceMatch?.[1];
  useEffect(()=>setReferenceDismissed(false),[input]);
  const [highDetail, setHighDetail] = useState(false);
  const [cmdIndex, setCmdIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  const [commandMenuRequested, setCommandMenuRequested] = useState(false);
  const [composerHeight, setComposerHeight] = useState(readStoredComposerHeight);
  const [manualHeight,setManualHeight]=useState(()=>Boolean(localStorage.getItem(COMPOSER_HEIGHT_KEY)));
  const selection=useRef({start:0,end:0,direction:"none" as "none"|"forward"|"backward",scroll:0});
  const focusRevision=useRef(0),modeGeneration=useRef(0),activeDraftKey=useRef(draftKey);activeDraftKey.current=draftKey;
  useEffect(()=>{const changed=(e:FocusEvent)=>{const target=e.target as HTMLElement;if(target!==textareaRef.current&&!target.closest(".composer-settings,.composer-popover"))focusRevision.current++;};document.addEventListener("focusin",changed);return()=>{document.removeEventListener("focusin",changed);modeGeneration.current++;};},[]);
  const captureSelection=()=>{const el=textareaRef.current;if(el)selection.current={start:el.selectionStart,end:el.selectionEnd,direction:el.selectionDirection,scroll:el.scrollTop};};
  const [resizing, setResizing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const revision=useRef(Date.now());
  const [deliveryMenu,setDeliveryMenu]=useState<HTMLElement|null>(null);
  const draftSnapshot=useRef({text:input,files:fileRefs,images:pendingImages});draftSnapshot.current={text:input,files:fileRefs,images:pendingImages};
  useDraft(draftKey,{text:input,mode:selectedMode,files:fileRefs,images:pendingImages},draft=>{
    if(draft.missingImages?.length)onError("Some draft images are unavailable: "+draft.missingImages.join(", "));
    setInput(draft.text);setFileRefs(draft.files||[]);
    setPendingImages((draft.images||[]).map(img=>({...img,previewUrl:`data:${img.mimeType};base64,${img.data}`})));
    if(sessionMode!=='plan'&&settings.runtime?.goal?.status!=='active')setSelectedMode(draft.mode as DraftMode);
  },revision);
  useEffect(()=>{const focus=()=>textareaRef.current?.focus();const draftError=()=>onError('Your draft could not be saved. Keep this window open and try again.');
    const reuse=(event:Event)=>{const text=(event as CustomEvent).detail;if(typeof text==='string'){setInput(prev=>prev?prev+'\n\n'+text:text);requestAnimationFrame(focus);}};
    document.addEventListener('grok:reuse-prompt',reuse);document.addEventListener('grok:focus-composer',focus);document.addEventListener('grok:draft-error',draftError);
    return()=>{document.removeEventListener('grok:reuse-prompt',reuse);document.removeEventListener('grok:focus-composer',focus);document.removeEventListener('grok:draft-error',draftError);};},[onError]);
  useEffect(()=>{const lost=()=>{resizeDragRef.current=null;setResizing(false);};window.addEventListener('blur',lost);return()=>window.removeEventListener('blur',lost);},[]);
  const promptQueueRef = useRef(promptQueue);
  promptQueueRef.current = promptQueue;
  const heightRef = useRef(composerHeight);
  heightRef.current = composerHeight;
  const resizeDragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);

  useEffect(()=>{setSelectedMode(prev=>sessionMode==='plan'?'plan':prev==='plan'?'chat':prev);},[sessionMode]);
  useEffect(()=>{const status=settings.runtime?.goal?.status;if(status==='active'){submittedGoal.current=true;setSelectedMode('goal');}else if(status&&status!=='complete'){submittedGoal.current=true;}else if((status==='complete'||!status)&&submittedGoal.current){submittedGoal.current=false;setSelectedMode(prev=>prev==='goal'?'chat':prev);}},[settings.runtime?.goal?.status]);
  const selectMode=useCallback(async(next:DraftMode,stripSlash=true)=>{
    if(modeLock.current||conn!=='online')return false;
    const key=activeDraftKey.current,gen=++modeGeneration.current,focusGen=focusRevision.current,saved={...selection.current};
    modeLock.current=true;setModeChanging(true);
    try {const ok=await onModeChange(next);if(!ok||key!==activeDraftKey.current||gen!==modeGeneration.current)return false;setSelectedMode(next);submittedGoal.current=next==='goal'&&Boolean(settings.runtime?.goal&&settings.runtime.goal.status!=='complete');if(stripSlash)setInput(prev=>draftIntent(prev).explicit?draftIntent(prev).text:prev);setCommandMenuRequested(false);setSlashDismissed(true);requestAnimationFrame(()=>{const el=textareaRef.current;if(el&&focusGen===focusRevision.current&&key===activeDraftKey.current){el.focus({preventScroll:true});el.setSelectionRange(saved.start,saved.end,saved.direction);el.scrollTop=saved.scroll;}});return true;}
    finally {modeLock.current=false;setModeChanging(false);}
  },[conn,onModeChange,settings.runtime?.goal?.status]);

  const pickRefs=async(kind:'file'|'folder')=>{try{const picked=await window.grokDesktop.pickAttachments(kind);setFileRefs(prev=>[...prev,...picked.filter(p=>!prev.some(old=>old.path===p.path))]);}catch(e){onError(e instanceof Error?e.message:String(e));}};
  useLayoutEffect(()=>{const el=textareaRef.current;if(!el)return;let width=-1;
    const fit=()=>{const scroll=el.scrollTop;el.style.height='0px';const content=el.scrollHeight;el.style.height=Math.min(composerHeightMax(),manualHeight?composerHeight:Math.max(COMPOSER_HEIGHT_MIN,content))+'px';el.scrollTop=scroll;};fit();
    const observer=new ResizeObserver(entries=>{const next=entries[0].contentRect.width;if(next!==width){width=next;fit();}});observer.observe(el);window.addEventListener('resize',fit);return()=>{observer.disconnect();window.removeEventListener('resize',fit);};
  },[input,composerHeight,manualHeight]);

  const menuOpen = (commandMenuRequested || isSlashMenuOpen(input)) && !slashDismissed;
  const filteredCommands = useMemo(
    () => (menuOpen ? filterCommands(commands, slashQuery(input)) : []),
    [menuOpen, commands, input],
  );

  useEffect(() => {
    setCmdIndex(0);
    setSlashDismissed(false);
    setCommandMenuRequested(false);
  }, [input]);

  useEffect(() => {
    if (cmdIndex >= filteredCommands.length) {
      setCmdIndex(Math.max(0, filteredCommands.length - 1));
    }
  }, [filteredCommands.length, cmdIndex]);

  // Keep height in range when the window is resized (e.g. maximize / dock).
  useEffect(() => {
    const onResize = () => {
      const max = composerHeightMax();
      setComposerHeight((h) => {
        const next = Math.min(max, Math.max(COMPOSER_HEIGHT_MIN, h));
        if (next !== h) persistComposerHeight(next);
        return next;
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const clampComposerHeight = useCallback((px: number) => {
    return Math.min(
      composerHeightMax(),
      Math.max(COMPOSER_HEIGHT_MIN, Math.round(px)),
    );
  }, []);

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      resizeDragRef.current = {
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: textareaRef.current?.getBoundingClientRect().height || heightRef.current,
      };
      setManualHeight(true);
      setResizing(true);
    },
    [],
  );

  const onResizePointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = resizeDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      // Drag up grows the input (handle sits on the top edge).
      const next = clampComposerHeight(
        drag.startHeight + (drag.startY - e.clientY),
      );
      setComposerHeight(next);
    },
    [clampComposerHeight],
  );

  const endResizeDrag = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = resizeDragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      resizeDragRef.current = null;
      setResizing(false);
      persistComposerHeight(heightRef.current);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    [],
  );

  const onResizeDoubleClick = useCallback(() => {
    setComposerHeight(COMPOSER_HEIGHT_DEFAULT);
    setManualHeight(false);localStorage.removeItem(COMPOSER_HEIGHT_KEY);
  }, []);

  const clearDraft = useCallback(() => {
    setPendingImages((prev) => {
      for (const img of prev) revokePendingImagePreview(img);
      return [];
    });
    setInput("");
    setFileRefs([]);
    setHighDetail(false);
  }, []);

  const addImages = useCallback(
    async (files: ArrayLike<Blob | File>) => {
      const { images, error } = await filesToPendingImages(files);
      if (images.length) {
        setPendingImages((prev) => [...prev, ...images]);
      }
      if (error) onError(error);
    },
    [onError],
  );

  const removePendingImage = useCallback((id: string) => {
    setPendingImages((prev) => {
      const next = prev.filter((img) => {
        if (img.id === id) revokePendingImagePreview(img);
        return img.id !== id;
      });
      if (next.length === 0) setHighDetail(false);
      return next;
    });
  }, []);

  const submit = useCallback(
    async (
      overrideText?: string,
      mode: ComposerSubmit["mode"] = "auto",
    ) => {
      if(compacting)return;
      const submittedDraft=draftSnapshot.current;
      let text = (overrideText !== undefined ? overrideText : input).trim();
      const draftImages = overrideText !== undefined ? [] : pendingImages;
      if (!text && draftImages.length === 0 && fileRefs.length === 0) return;
      if (!["online","busy"].includes(conn) || !projectOpen || modeLock.current || submitLock.current) return;
      if(overrideText===undefined&&fileRefs.some(file=>file.available===false)){onError("Remove or reattach the unavailable files before sending.");return;}
      submitLock.current=true;setSubmitting(true);
      try {
      const intent=draftIntent(text,selectedMode);
      let activeMode=selectedMode;
      if(intent.explicit){if(!await selectMode(intent.mode as DraftMode,false))return;activeMode=intent.mode as DraftMode;text=intent.text.trim();if(!text){setInput('');return;}}

      if(activeMode==='plan'&&sessionMode!=='plan'){if(!await selectMode('plan',false))return;}
      const localMatch = text.match(/^\/([^\s]+)(?:\s+(.*))?$/s);
      if (localMatch) {
        const name = localMatch[1].toLowerCase();
        const local = DESKTOP_COMMANDS.find(
          (c) => c.local && c.name.toLowerCase() === name,
        );
        if (local) {
          await onLocalCommand(name, (localMatch[2] || "").trim());
          if(draftSnapshot.current.text===submittedDraft.text)clearDraft();
          return;
        }
      }

      const imageQuality = highDetail ? "high" : "compact";
      let images = draftImages;
      if (draftImages.length) {
        try {
          images = await encodePendingImages(draftImages, imageQuality);
        } catch (e: unknown) {
          onError(e instanceof Error ? e.message : String(e));
          return;
        }
      }

      // Only wipe the draft after the parent accepts (queue / deliver / interject).
      if(activeMode==='goal'&&!text.trim()&&settings.runtime?.goal?.status!=='active'){onError('Describe the objective before starting a goal.');return;}
      if(fileRefs.length&&overrideText===undefined)text += '\n\nAttached local files and folders:\n'+fileRefs.map(ref=>`- ${ref.kind}: ${JSON.stringify(ref.path)}`).join('\n');
      const startGoal=activeMode==='goal'&&!text.startsWith('/')&&((intent.explicit&&intent.mode==='goal')||(!submittedGoal.current&&(!settings.runtime?.goal||settings.runtime.goal.status==='complete')));
      const outgoing=startGoal?`/goal ${text}`:text;
      let accepted=false;
      accepted = await onSubmit({
        text: outgoing,
        timelineText:activeMode==='plan'&&!text.startsWith('/')?`/plan ${text}`:undefined,
        images: images.map((img) => ({ ...img,previewUrl:`data:${img.mimeType};base64,${img.data}` })),
        mode,
        imageQuality,
      });
      if(accepted&&startGoal)submittedGoal.current=true;
      if (accepted && overrideText===undefined && draftSnapshot.current.text===submittedDraft.text && draftSnapshot.current.files===submittedDraft.files && draftSnapshot.current.images===submittedDraft.images) clearDraft();
      } finally {submitLock.current=false;setSubmitting(false);}
    },
    [
      input,
      pendingImages,
      highDetail,
      conn,
      projectOpen,
      clearDraft,
      onLocalCommand,
      onError,
      onSubmit,
      fileRefs,
      selectedMode,
      selectMode,
      compacting,
      settings.runtime?.goal?.status,
      sessionMode,
    ],
  );

  const applySlashCommand = useCallback(
    (cmd: SlashCommand, mode: "insert" | "run" = "run") => {
      if(['plan','goal','chat'].includes(cmd.name.toLowerCase())){void selectMode(cmd.name.toLowerCase() as DraftMode);return;}
      if (mode === "run" && cmd.local && !cmd.inputHint) {
        clearDraft();
        onLocalCommand(cmd.name);
        return;
      }
      if (mode === "insert" || cmd.inputHint) {
        const draft = isSlashMenuOpen(input) ? "" : input;
        setInput(formatCommandInsert(cmd) + (draft && !cmd.inputHint ? " " : "") + draft);
        setCommandMenuRequested(false);
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        });
        return;
      }
      void submit(`/${cmd.name}`, "auto");
    },
    [clearDraft, onLocalCommand, submit, input, selectMode],
  );

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if(e.nativeEvent.isComposing||e.keyCode===229)return;
    if (menuOpen && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCmdIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCmdIndex(
          (i) =>
            (i - 1 + filteredCommands.length) % filteredCommands.length,
        );
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const cmd = filteredCommands[cmdIndex] || filteredCommands[0];
        if (cmd) applySlashCommand(cmd, "insert");
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const cmd = filteredCommands[cmdIndex] || filteredCommands[0];
        if (cmd) applySlashCommand(cmd, "run");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit(undefined, "now");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit(undefined, "auto");
    }
  };

  const onPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles: File[] = [];
    const items = e.clipboardData?.items;
    if (items?.length) {
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
    }
    if (imageFiles.length === 0 && e.clipboardData?.files?.length) {
      for (const file of Array.from(e.clipboardData.files)) {
        if (file.type.startsWith("image/")) imageFiles.push(file);
      }
    }
    if (imageFiles.length === 0) return;
    const hasText = Boolean(e.clipboardData?.getData("text/plain")?.trim());
    if (!hasText) e.preventDefault();
    await addImages(imageFiles);
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length) await addImages(files);
    const other=Array.from(e.dataTransfer?.files||[]).filter(f=>!f.type.startsWith("image/"));
    if(other.length){try{const paths=window.grokDesktop.droppedPaths(other);const refs=await window.grokDesktop.describeAttachments(paths);setFileRefs(prev=>[...prev,...refs.filter(ref=>!prev.some(old=>old.path===ref.path))]);}catch(error){onError(String(error));}}
  };

  const tall =
    composerHeight >= Math.min(composerHeightMax() * 0.45, 280);

  return (
    <div
      className={
        "composer" +
        (resizing ? " composer--resizing" : "") +
        (tall ? " composer--tall" : "")
      }
    >
      <div className="composer-context" aria-label="Task controls">
        {activity}
      </div>
      <div
        className="composer-resize-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize input"
        aria-valuemin={COMPOSER_HEIGHT_MIN}
        aria-valuemax={composerHeightMax()}
        aria-valuenow={composerHeight}
        title="Drag to resize input · double-click to reset"
        onLostPointerCapture={()=>{resizeDragRef.current=null;setResizing(false);}}
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={endResizeDrag}
        onPointerCancel={endResizeDrag}
        onDoubleClick={onResizeDoubleClick}
      >
        <span className="composer-resize-grip" aria-hidden />
      </div>
      <div
        className="composer-box"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => void onDrop(e)}
      >
        {referenceToken!==undefined&&!referenceDismissed&&!menuOpen&&<FileReferenceMenu token={referenceToken} cwd={draftKey.split('\0')[0]} onClose={()=>setReferenceDismissed(true)} onPick={file=>{setFileRefs(prev=>prev.some(item=>item.path===file.path)?prev:[...prev,{path:file.path,name:file.name,kind:'file',available:true}]);setInput(prev=>prev.replace(/@("[^"\n]*|[^\s]*)$/,''));textareaRef.current?.focus();}} onFolder={path=>{const cwd=draftKey.split('\0')[0],relative=path.slice(cwd.length).replace(/^[\\/]/,'').replace(/\\/g,'/');setInput(prev=>prev.replace(/@("[^"\n]*|[^\s]*)$/,`@"${relative}/`));}}/>}
        {fileRefs.length>0&&<div className="composer-file-refs">{fileRefs.map(ref=><div key={ref.path} className={`composer-file-chip ${ref.available===false?'unavailable':''}`} title={ref.path}><SmallIcon kind="clip"/><span>{ref.name}<small>{ref.available===false?'Unavailable':ref.kind==='folder'?'Folder':ref.size!=null?`${Math.ceil(ref.size/1024)} KB`:'File'}</small></span><button type="button" aria-label={`Remove ${ref.name}`} onClick={()=>setFileRefs(prev=>prev.filter(p=>p.path!==ref.path))}><X size={14} aria-hidden/></button></div>)}</div>}
        {menuOpen && (
          <AnchoredPopover anchor={textareaRef.current} onClose={()=>{setSlashDismissed(true);setCommandMenuRequested(false);}} label="Commands" className="command-popover"><CommandMenu
            items={filteredCommands}
            activeIndex={cmdIndex}
            onHover={setCmdIndex}
            onSelect={applySlashCommand}
          /></AnchoredPopover>
        )}
        {pendingImages.length > 0 && (
          <div className="composer-attach">
            <div className="composer-images">
              {pendingImages.map((img) => (
                <div key={img.id} className="composer-image">
                  <button type="button" className="composer-image-preview" aria-label={`View ${img.name||"attached image"}`} onClick={()=>setPreviewImage(img.previewUrl)}><img src={img.previewUrl} alt={img.name || "Attached"} /></button>
                  <button
                    type="button"
                    className="composer-image-remove"
                    aria-label="Remove image"
                    title="Remove image"
                    onClick={() => removePendingImage(img.id)}
                  >
                    <X size={14} aria-hidden/>
                  </button>
                </div>
              ))}
            </div>
            <label className="composer-image-quality">
              <input
                type="checkbox"
                checked={highDetail}
                onChange={(e) => setHighDetail(e.target.checked)}
              />
              <span>
                <span className="composer-image-quality-label">
                  Higher detail
                </span>
                <span className="composer-image-quality-hint">
                  This send only · uses more tokens
                </span>
              </span>
            </label>
          </div>
        )}
        {previewImage&&<ImageViewer src={previewImage} alt="Attached image" onClose={()=>setPreviewImage(null)}/>}
        <textarea
          aria-label="Message"
          aria-description="Enter to send; Shift+Enter for a new line. While running, Enter queues a follow-up."
          ref={textareaRef}
          value={input}
          onSelect={captureSelection}
          onBlur={captureSelection}
          placeholder={
            conn === "busy"
              ? "Write a follow-up — Enter adds it to the queue…"
              : selectedMode==='plan'?'What would you like to plan?':selectedMode==='goal'&&!submittedGoal.current?'Describe the goal and how Grok should verify success…':selectedMode==='goal'&&settings.runtime?.goal?.status?.includes('paused')?'Follow up on the paused goal, or resume it from the mode menu…':"Ask Grok…"
          }
          onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => void onPaste(e)}
          onKeyDown={onKeyDown}
          spellCheck={false}
        />
        <div className="composer-footer">
          <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={e=>{if(e.target.files?.length)void addImages(e.target.files);e.target.value='';}}/>
          <ComposerSettings settings={settings} disabled={conn!=='online'||modeChanging||submitting||compacting} selectedMode={selectedMode}
            onSelectMode={mode=>void selectMode(mode)} onImages={()=>fileInputRef.current?.click()} onFiles={()=>void pickRefs('file')} onFolder={()=>void pickRefs('folder')}
            onCommands={()=>{setCommandMenuRequested(true);setSlashDismissed(false);textareaRef.current?.focus();}}
            onGoalAction={action=>void submit('/goal '+action)}/>
          <div className="composer-delivery-actions">
            {manualHeight&&<button type="button" className="composer-reset" aria-label="Reset input size" title="Reset input size" onClick={onResizeDoubleClick}><MoveVertical size={16} aria-hidden/></button>}
            {conn==='busy'&&<button type="button" className="composer-icon-button" aria-label="Delivery options" aria-expanded={Boolean(deliveryMenu)} onClick={e=>setDeliveryMenu(deliveryMenu?null:e.currentTarget)}><ChevronDown size={16} aria-hidden/></button>}
            {deliveryMenu&&<AnchoredPopover anchor={deliveryMenu} onClose={()=>setDeliveryMenu(null)} label="Delivery options" placement="top-end" className="composer-popover"><button type="button" onClick={()=>{setDeliveryMenu(null);void submit(undefined,'queue');}}>Queue<small>After the current response</small></button><button type="button" onClick={()=>{setDeliveryMenu(null);void submit(undefined,'interject');}}>Steer<small>Send a correction to the running task</small></button><button type="button" onClick={()=>{setDeliveryMenu(null);void submit(undefined,'now');}}>Stop and send<small>Stops the response; completed actions remain</small></button></AnchoredPopover>}

            {conn==='busy'&&<button type="button" className="composer-send composer-stop" aria-label="Stop" title="Stop the current response" onClick={onStop}><SmallIcon kind="stop"/></button>}
            <button type="button" className="composer-send" aria-label={conn==='busy'?'Queue':'Send'} aria-busy={submitting} title={conn==='busy'?'Queue a follow-up':'Send message · Enter'} onClick={()=>void submit(undefined,conn==='busy'?'queue':'auto')} disabled={(!input.trim()&&!pendingImages.length&&!fileRefs.length)||!['online','busy'].includes(conn)||!projectOpen||modeChanging||submitting||compacting}><SmallIcon kind="arrow"/></button>
          </div>
        </div>
      </div>
    </div>
  );
});
