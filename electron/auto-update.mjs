/** Community-only, explicit updates. Never destroys windows or bypasses quit guards. */
import { createRequire } from 'node:module';
import { app, BrowserWindow, dialog, shell } from 'electron';
import {communityDistribution} from './distribution.mjs';
import { configureCommunityUpdater, installCommunityUpdate } from './update-controller.mjs';
const require=createRequire(import.meta.url);
let updater=null,busy=false,installing=false,allowPrerelease=false,hooks={},available=null;
const parent=()=>BrowserWindow.getFocusedWindow()||BrowserWindow.getAllWindows().find(win=>!win.isDestroyed());
async function box(options){const owner=parent();return owner?dialog.showMessageBox(owner,options):dialog.showMessageBox(options);}
export function isQuittingForUpdate(){return installing;}
export function setAllowPrerelease(value){allowPrerelease=Boolean(value);if(updater)updater.allowPrerelease=allowPrerelease||app.getVersion().includes('-');}
export function getAllowPrerelease(){return allowPrerelease;}
function wire(options={}){
  hooks=options;
  if(updater)return updater;
  updater=require('electron-updater').autoUpdater;
  configureCommunityUpdater(updater,allowPrerelease||app.getVersion().includes('-'));
  updater.on('update-available',info=>{available=info;});
  updater.on('update-not-available',()=>{available=null;});
  updater.on('error',()=>{busy=false;});
  return updater;
}
export function setupAutoUpdater(options={}){hooks=options;if(communityDistribution(app).updates==='verified')wire(options);}
export async function checkForUpdatesInteractive(options={}){
  if(!app.isPackaged){await box({type:'info',buttons:['OK'],message:'Updates require an installed Community build.'});return {ok:false,reason:'dev'};}
  if(communityDistribution(app).updates==='manual'){
    const choice=await box({type:'info',buttons:['Open Releases','Cancel'],defaultId:1,cancelId:1,message:'This build uses manual updates.',detail:'Community previews have no verified publisher signature. Download a new installer from the Community Releases page, check its SHA-256, finish active tasks and close Community before replacing it. The app will not download or install an update automatically.'});
    if(choice.response===0)await shell.openExternal('https://github.com/goodcantor/grok-desktop-community/releases');
    return {ok:true,manual:true};
  }
  if(busy)return {ok:false,reason:'busy'};
  busy=true;
  try{
    const client=wire(options);
    available=null;
    await client.checkForUpdates();
    if(!available){await box({type:'info',buttons:['OK'],message:'No newer Community update is available.'});return {ok:true,current:app.getVersion()};}
    const choice=await box({type:'info',buttons:['Download update','Later'],defaultId:1,cancelId:1,message:`Community ${available.version} is available.`,detail:'Only releases from goodcantor/grok-desktop-community are used. Downloading does not install the update.'});
    if(choice.response!==0)return {ok:true,deferred:true};
    await client.downloadUpdate();
    const install=await box({type:'question',buttons:['Install and restart','Later'],defaultId:1,cancelId:1,message:'The Community update is ready.',detail:'Installation requires all tasks to be idle and file edits saved. Drafts and unsent queues are retained.'});
    if(install.response!==0)return {ok:true,deferred:true};
    const installed=await installCommunityUpdate({updater:client,prepare:hooks.prepareUpdate||(()=>false),markInstalling:value=>{installing=value;},unlock:hooks.unlockUpdate||(()=>{})});
    if(!installed)await box({type:'info',buttons:['OK'],message:'Finish active tasks and save file edits before updating.'});
    return {ok:installed,deferred:!installed};
  }catch(error){await hooks.unlockUpdate?.();installing=false;await box({type:'error',buttons:['OK'],message:'Community update failed.',detail:String(error?.message||error).split('\n')[0].slice(0,240)});return {ok:false,reason:'error'};}
  finally{busy=false;}
}
