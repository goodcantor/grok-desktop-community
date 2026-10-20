import { previewCaptureToSubmit } from '../shared/preview-capture.mjs';
import { randomUUID } from 'node:crypto';
/** Each execution gets its own retained native browser controller. No page reload on chat selection. */
import { ipcMain, BrowserWindow } from 'electron';
import { sessionFromEvent, windowSessions, selectExecution, ensureExecutionQueue, assertTrustedShellEvent } from './window-session.mjs';
const instances=new Map();
let hooks=null;
let handlers=new Set(),listeners=new Set();

export async function previewForExecution(record) {
  if(!record)throw Error('Open a chat first');
  if(instances.has(record.recordId))return instances.get(record.recordId);
  const pending=(async()=>{
    const api=await import(`./preview-window.mjs?execution=${record.recordId}`);
    const calls=new Map(),events=new Map();
    const instance={api,calls,events,record};
    api.registerPreviewIpc({...hooks,
      ipc:{handle:(name,fn)=>{calls.set(name,fn);registerCall(name);},on:(name,fn)=>{events.set(name,fn);registerEvent(name);}},
      getOwner:()=>record.win,
      ownerHasProject:()=>!record.disposed&&Boolean(record.lastCwd),
      sendCapture:async payload=>{const parsed=previewCaptureToSubmit(payload);if(!parsed.ok)throw Error(parsed.error);selectExecution(record);record.win.webContents.send('app:select-execution',{cwd:record.lastCwd,sessionId:record.lastSessionId});const queue=ensureExecutionQueue(record);await queue.submit({...parsed.submit,id:randomUUID(),at:Date.now()},queue.running?'interject':'auto');},
      broadcast:payload=>{if(record.host.selected===record)record.win.webContents.send('preview:changed',{...payload,sessionId:record.lastSessionId});},
    });
    record.previewController=api;
    record.disposePreview=()=>{api.closePreviewWindow();instances.delete(record.recordId);};
    record.win.once('closed',()=>{api.closePreviewWindow();instances.delete(record.recordId);});
    return instance;
  })();
  instances.set(record.recordId,pending);
  try{return await pending;}catch(error){instances.delete(record.recordId);throw error;}
}

async function fromEvent(event,channel) {
  if(event.senderFrame!==event.sender.mainFrame)throw Error('Untrusted Preview frame');
  for(const pending of instances.values()){const instance=await pending;if(instance.api.ownsPreviewContents(event.sender)){if(!instance.api.isPreviewChromeContents(event.sender)&&!['preview:step-zoom','preview:focus-address'].includes(channel))throw Error('Remote Preview has no application bridge');return instance;}}
  assertTrustedShellEvent(event);
  return previewForExecution(sessionFromEvent(event));
}
function registerCall(name) {
  if(handlers.has(name))return;handlers.add(name);
  ipcMain.handle(name,async(event,...args)=>{
    const last=args.at(-1);if(last?.__executionScope){event.executionScope=last.__executionScope;args.pop();}
    const instance=await fromEvent(event,name);return instance.calls.get(name)?.(event,...args);
  });
}
function registerEvent(name) {
  if(listeners.has(name))return;listeners.add(name);
  ipcMain.on(name,(event,...args)=>{void fromEvent(event,name).then(instance=>instance.events.get(name)?.(event,...args)).catch(()=>{});});
}
export function registerPreviewIpc(options) {
  hooks=options;
  // Register immediately, before the first page asks for state.
  for(const name of ['preview:dock-layout','preview:dock-hide','preview:open','preview:close','preview:state','preview:navigate','preview:snapshot','preview:set-viewport','preview:chrome-ready','preview:chrome-zoom','preview:chrome-navigate','preview:chrome-back','preview:chrome-forward','preview:chrome-reload','preview:chrome-viewport','preview:chrome-snapshot','preview:chrome-screenshot','preview:chrome-open-external','preview:chrome-network','preview:chrome-network-entry','preview:chrome-network-clear','preview:chrome-network-preserve'])registerCall(name);
  for(const name of ['preview:step-zoom','preview:focus-address'])registerEvent(name);
}
export async function apiForStampedExecution(owner,recordId) {
  const host=owner&&windowSessions.get(owner.id);
  const record=recordId?host?.records.get(recordId):host?.selected;
  if(!record||record.disposed)throw Error('Preview chat is no longer available');
  return (await previewForExecution(record)).api;
}
export async function openPreviewWindow({owner,...options}={}) {
  const host=windowSessions.get((owner||BrowserWindow.getFocusedWindow())?.id);
  const instance=await previewForExecution(host?.selected);
  return instance.api.openPreviewWindow({owner:host.win,...options});
}
export function getPreviewWindow(){return null;}
export function applyPreviewTheme(theme){for(const pending of instances.values())void pending.then(instance=>instance.api.applyPreviewTheme(theme));}
