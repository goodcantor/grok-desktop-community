import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {DraftStore} from '../electron/draft-store.mjs';

test('drafts keep text, mode and files; an older writer or acknowledgement cannot erase newer input',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'grok-draft-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const store=new DraftStore(root),key='workspace\0session',draft={revision:2,text:'Проверь Bluetooth\nconst answer = 42;',mode:'plan',files:[{path:path.join(root,'missing.txt'),kind:'file'}],images:[]};
  store.write(key,draft);assert.equal(new DraftStore(root).read(key).text,draft.text);assert.equal(store.read(key).mode,'plan');assert.equal(store.read(key).files[0].available,false);
  assert.equal(store.write(key,{...draft,revision:1,text:'old'}).saved,false);store.remove(key,1);assert.equal(store.read(key).text,draft.text);store.remove(key,2);assert.equal(store.read(key),null);
});
test('draft images are separate content-addressed files and a missing image does not destroy the text',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'grok-draft-image-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const store=new DraftStore(root),key='image';
  const image={id:'one',name:'screen.png',mimeType:'image/png',data:Buffer.from('test image').toString('base64')};
  store.write(key,{revision:1,text:'Screenshot question',mode:'chat',files:[],images:[image]});const raw=JSON.parse(fs.readFileSync(store.file(key),'utf8'));assert.equal(raw.images[0].data,undefined);assert.equal(store.read(key).images[0].data,image.data);
  fs.unlinkSync(store.media(raw.images[0].hash));assert.equal(store.read(key).text,'Screenshot question');assert.deepEqual(store.read(key).missingImages,['screen.png']);
});
test('corrupt draft data and invalid image references cannot break startup or escape the owned cache',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'grok-draft-invalid-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const store=new DraftStore(root);
  fs.writeFileSync(store.file('corrupt'),'{broken');assert.equal(store.read('corrupt'),null);assert.throws(()=>store.media('../outside'));assert.throws(()=>store.write('invalid',{revision:1,text:'',images:[{mimeType:'text/html',data:'YWJj'}]}));
});
