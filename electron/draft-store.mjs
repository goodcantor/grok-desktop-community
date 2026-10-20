import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Unsent UI state only. Never writes the native session store. */
export class DraftStore {
  constructor(root) {this.root=root;}
  file(key) {if(typeof key!=='string'||!key||key.length>4096)throw Error('Invalid draft key');return path.join(this.root,crypto.createHash('sha256').update(key).digest('hex')+'.json');}
  read(key) {
    try {const value=JSON.parse(fs.readFileSync(this.file(key),'utf8'));if(value.version!==1||typeof value.text!=='string'||!Number.isFinite(value.revision)||!Array.isArray(value.files)||!Array.isArray(value.images))return null;
      value.missingImages=[];
      value.images=(value.images||[]).flatMap(image=>{try{return [{...image,data:fs.readFileSync(this.media(image.hash)).toString('base64')}];}catch{value.missingImages.push(image.name||'Image');return [];}});
      value.files=(value.files||[]).map(file=>({...file,available:fs.existsSync(file.path)}));return value;
    }catch{return null;}
  }
  media(hash) {if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid attachment');return path.join(this.root,'media',hash);}
  write(key,value) {
    const file=this.file(key),old=this.read(key);
    if(old&&old.revision>value.revision)return {saved:false};
    if(typeof value.text!=='string'||value.text.length>2000000||!Number.isFinite(value.revision))throw Error('Invalid draft');
    fs.mkdirSync(path.join(this.root,'media'),{recursive:true});
    const images=(value.images||[]).slice(0,24).map(image=>{
      if(!/^image\/(png|jpeg|webp|gif)$/.test(image.mimeType))throw Error('Unsupported draft image');
      const bytes=Buffer.from(image.data,'base64');if(bytes.length>12*1024*1024)throw Error('Draft image exceeds 12 MB');
      const hash=crypto.createHash('sha256').update(bytes).digest('hex');const target=this.media(hash);
      if(!fs.existsSync(target))fs.writeFileSync(target,bytes);
      return {id:String(image.id),name:String(image.name||'Image'),mimeType:image.mimeType,hash};
    });
    const draft={version:1,revision:value.revision,text:value.text,mode:['chat','plan','goal'].includes(value.mode)?value.mode:'chat',files:(value.files||[]).slice(0,100).filter(f=>typeof f.path==='string'&&path.isAbsolute(f.path)).map(f=>({path:f.path,name:path.basename(f.path),kind:f.kind==='folder'?'folder':'file'})),images};
    const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(draft));fs.renameSync(tmp,file);return {saved:true};
  }
  remove(key,revision) {const value=this.read(key);if(value&&value.revision<=revision)fs.unlinkSync(this.file(key));}
  collectMedia() {
    if(!fs.existsSync(this.root))return;const keep=new Set();
    for(const name of fs.readdirSync(this.root)){if(!name.endsWith('.json'))continue;try{const d=JSON.parse(fs.readFileSync(path.join(this.root,name),'utf8'));for(const image of d.images||[])keep.add(image.hash);}catch{}}
    const media=path.join(this.root,'media');if(!fs.existsSync(media))return;
    for(const name of fs.readdirSync(media)){if(!/^[a-f0-9]{64}$/.test(name))continue;const target=this.media(name);if(!keep.has(name)&&Date.now()-fs.statSync(target).mtimeMs>86400000)fs.unlinkSync(target);}
  }
}

export function installDraftIpc({ipcMain,app}) {
  const store=new DraftStore(path.join(app.getPath('userData'),'drafts'));store.collectMedia();
  ipcMain.handle('draft:read',(_e,key)=>store.read(key));
  ipcMain.handle('draft:write',(_e,key,value)=>store.write(key,value));
  ipcMain.handle('draft:delete',(_e,key,revision)=>store.remove(key,revision));
  ipcMain.handle('attachments:describe',(_e,paths)=>paths.slice(0,100).map(file=>{if(!path.isAbsolute(file))throw Error('Expected a local file');try{const stat=fs.statSync(file);return {path:file,name:path.basename(file),kind:stat.isDirectory()?'folder':'file',available:true,size:stat.size};}catch{return {path:file,name:path.basename(file),kind:'file',available:false};}}));
}
