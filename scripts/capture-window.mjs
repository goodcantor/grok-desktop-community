import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Capture the OS window, including native browser views at Electron zoom.
export async function captureNativeWindow(app,file) {
    const shot=await app.evaluate(async({BrowserWindow,desktopCapturer})=>{
      const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('/dist/index.html'));
      const sources=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:1920,height:1200}});
      const source=sources.find(s=>s.id===win.getMediaSourceId());
      if(source&&!source.thumbnail.isEmpty())return {data:source.thumbnail.toPNG().toString('base64')};
      const handle=win.getNativeWindowHandle();return {handle:(handle.length===8?handle.readBigUInt64LE():BigInt(handle.readUInt32LE())).toString()};
    });
    if(shot.data)fs.writeFileSync(file,Buffer.from(shot.data,'base64'));
    else {
      assert.equal(process.platform,'win32','Native window capture unavailable');
      const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/capture-window.ps1','-WindowHandle',shot.handle,'-OutputPath',file],{windowsHide:true,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);
    }
  }
