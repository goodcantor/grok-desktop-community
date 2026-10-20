import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {installZoom} from '../electron/zoom.mjs';
import {clampZoom,stepZoom} from '../shared/zoom.mjs';
import {requestedLaunchDirectory} from '../electron/launch-directory.mjs';
import {wireSecondInstance} from '../electron/desktop-worktrees.mjs';
import {fitPreviewViewport} from '../shared/preview-geometry.mjs';

test('zoom requests are bounded and move from nonstandard saved factors',()=>{
  assert.equal(clampZoom('invalid'),1);assert.equal(clampZoom(30),2);assert.equal(clampZoom(-2),.5);
  assert.equal(stepZoom(1.2,'in'),1.25);assert.equal(stepZoom(1.2,'out'),1.1);
});
test('large preview viewports fit the panel without cropping or distorting aspect ratio',()=>{
  const result=fitPreviewViewport(500,400,{width:1280,height:800});assert.equal(result.width,500);assert.equal(result.height,312);assert.equal(result.scale,500/1280);
  assert.deepEqual(fitPreviewViewport(700,600,{width:0,height:0}),{width:700,height:600,scale:1});
});
test('a second launch arriving before readiness keeps its directory arguments',async()=>{
  const app=new EventEmitter();let ready=false,resolveReady;app.isReady=()=>ready;app.whenReady=()=>new Promise(resolve=>resolveReady=resolve);
  const received=[];wireSecondInstance(app,argv=>received.push(argv));const argv=['Grok.exe','--cwd','C:\\A project'];app.emit('second-instance',{},argv);
  ready=true;resolveReady();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(received,[argv]);
});
test('zoom controller preserves the changed value across navigation and handles keyboard reset',()=>{
  const wc=new EventEmitter();wc.factor=1;wc.isDestroyed=()=>false;wc.setZoomFactor=n=>wc.factor=n;wc.getZoomFactor=()=>wc.factor;
  const changed=[];const control=installZoom(wc,{initial:1.25,onChange:n=>changed.push(n)});wc.emit('did-finish-load');assert.equal(wc.factor,1.25);
  control.apply(1.5);wc.emit('did-finish-load');assert.equal(wc.factor,1.5);
  let prevented=false;wc.emit('before-input-event',{preventDefault:()=>prevented=true},{type:'keyDown',control:true,key:'0'});assert.equal(wc.factor,1);assert.equal(prevented,true);
  wc.emit('zoom-changed',{},'out');assert.equal(wc.factor,.9);assert.ok(changed.length>=4);
});
test('cold and second launches preserve an explicit working folder with spaces',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grok launch '));
  try {
    assert.equal(requestedLaunchDirectory(['Grok.exe',dir]),dir);
    assert.equal(requestedLaunchDirectory(['Grok.exe','--cwd',dir]),dir);
    assert.equal(requestedLaunchDirectory(['Grok.exe','--cwd='+dir]),dir);
    assert.equal(requestedLaunchDirectory(['electron.exe','entry.cjs',dir],false),dir);
    assert.equal(requestedLaunchDirectory(['Grok.exe','--cwd',path.join(dir,'missing')]),null);
  }finally{fs.rmdirSync(dir);}
});
