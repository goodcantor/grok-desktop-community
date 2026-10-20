import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Local unsent messages only. Delivered messages belong to the native CLI history. */
let queueRoot = null;
export function configureQueueStore(root) { queueRoot=root; }
const queueFile=key=>{if(!queueRoot)throw Error('Queue store unavailable');return path.join(queueRoot,'queues',crypto.createHash('sha256').update(String(key)).digest('hex')+'.json');};
export function validateQueue(value) {
  const entries=Array.isArray(value)?value:value?.version===2?[...(value.pending||[]),...(value.inFlight?[value.inFlight]:[]),...(value.failed?[value.failed]:[])]:null;
  if(!entries||!entries.every(item=>item&&typeof item.id==='string'&&item.id&&typeof item.text==='string'&&Array.isArray(item.images)&&item.images.every(image=>image&&typeof image.data==='string'&&typeof image.mimeType==='string')))throw Error('Saved queue is invalid; original file retained for recovery');
  return value;
}
export function readQueue(key) {
  try{return validateQueue(JSON.parse(fs.readFileSync(queueFile(key),'utf8')));}
  catch(error){if(error.code==='ENOENT')return [];throw Error('Saved queue could not be read; original file retained for recovery');}
}
export function writeQueue(key,items) {
  validateQueue(items);
  const serialized=JSON.stringify(items);
  if(!(Array.isArray(items)||items?.version===2)||serialized.length>32*1024*1024)throw Error('Invalid queue');
  const file=queueFile(key);fs.mkdirSync(path.dirname(file),{recursive:true});
  const temporary=file+'.tmp';try{fs.writeFileSync(temporary,serialized);fs.renameSync(temporary,file);}finally{fs.rmSync(temporary,{force:true});}
  return true;
}
export function installQueueIpc({ipcMain,app}) {
  configureQueueStore(app.getPath('userData'));
  ipcMain.handle('queue:read',(_e,key)=>readQueue(key));
  ipcMain.handle('queue:save',(_e,{key,items})=>writeQueue(key,items));
}
