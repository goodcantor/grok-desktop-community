import {installedPtyShells} from './pty-shells.mjs';
import {utilityProcess} from 'electron';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
import {buildGrokEnv} from './grok-home.mjs';
export function installPtyIpc({ipcMain,app,sessionFromEvent,loadState}) {
  const owners=new Map();
  const getOwner=e=>{let owner=owners.get(e.sender.id);if(owner)return owner;
    const child=utilityProcess.fork(fileURLToPath(new URL('./pty-host.mjs',import.meta.url)),[],{serviceName:'Grok terminals',stdio:'pipe',execArgv:[]});
    owner={child,tabs:new Map(),sender:e.sender};owners.set(e.sender.id,owner);
    child.stdout?.on('data',()=>{});child.stderr?.on('data',()=>{});
    child.on('message',m=>{if(!owner.tabs.has(m.id))return;if(m.event==='exit')owner.tabs.get(m.id).exited=true;if(!e.sender.isDestroyed())e.sender.send('pty:event',m);});
    child.on('exit',()=>{owners.delete(e.sender.id);if(!e.sender.isDestroyed())e.sender.send('pty:event',{event:'host-exit'});});
    e.sender.once('destroyed',()=>{owners.delete(e.sender.id);child.kill();});return owner;
  };
  const shells=()=>installedPtyShells();
  ipcMain.handle('pty:shells',()=>shells());
  ipcMain.handle('pty:create',(e,args={})=>{const cwd=(sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);if(!cwd)throw Error('Open a workspace first');const shell=shells().find(s=>s.id===(args.shell||'pwsh'))||shells()[0];if(!shell)throw Error('No supported shell installed');const owner=getOwner(e),id=crypto.randomUUID(),row={id,cwd,recordId:sessionFromEvent(e)?.recordId,sessionId:sessionFromEvent(e)?.lastSessionId,shell:shell.name,exited:false};owner.tabs.set(id,row);const record=sessionFromEvent(e);if(record){record.terminalDisposers||=[];record.terminalDisposers.push(()=>{if(owner.tabs.has(id)){owner.child.postMessage({action:'close',id});owner.tabs.delete(id);}});}owner.child.postMessage({action:'create',id,cwd,shell:shell.path,args:shell.args,env:buildGrokEnv(),cols:100,rows:24});return row;});
  ipcMain.handle('pty:list',e=>[...(owners.get(e.sender.id)?.tabs.values()||[])]);
  ipcMain.handle('pty:command',(e,m)=>{const owner=owners.get(e.sender.id);if(!owner?.tabs.has(m.id))throw Error('Terminal not found');if(owner.tabs.get(m.id).recordId!==sessionFromEvent(e)?.recordId)throw Error('Terminal belongs to another chat');if(!['write','resize','close','pause','resume'].includes(m.action))throw Error('Invalid terminal action');if(m.action==='write'&&(typeof m.data!=='string'||m.data.length>1024*1024))throw Error('Input too large');if(m.action==='resize'&&(!Number.isInteger(m.cols)||!Number.isInteger(m.rows)||m.cols<2||m.rows<1||m.cols>1000||m.rows>1000))throw Error('Invalid terminal size');owner.child.postMessage(m);if(m.action==='close')owner.tabs.delete(m.id);return true;});
  app.on('will-quit',()=>{for(const o of owners.values())o.child.kill();owners.clear();});
}
