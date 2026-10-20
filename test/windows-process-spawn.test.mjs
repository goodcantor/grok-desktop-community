import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {directWindowsExecutable} from '../electron/windows-process-spawn.mjs';
import {terminalTimeoutMs} from '../electron/terminal-timeout.mjs';

test('native argv with quotes is kept outside cmd.exe; batch shims keep their path',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'grok-spawn-'));
  try {
    fs.writeFileSync(path.join(dir,'node.EXE'),'');fs.writeFileSync(path.join(dir,'npm.CMD'),'');
    const args=['-e','process.stdout.write("quoted value")'];
    const plan={file:'node',fileArgs:args,shell:true,cwd:dir,env:{PATH:dir,PATHEXT:'.EXE;.CMD'}};
    const direct=directWindowsExecutable(plan,'win32');
    assert.equal(direct.shell,false);assert.equal(direct.fileArgs,args);assert.equal(direct.file,path.join(dir,'node.EXE'));
    assert.equal(directWindowsExecutable({...plan,file:'npm'},'win32').shell,true);
    assert.equal(directWindowsExecutable(plan,'linux'),plan);
    assert.equal(directWindowsExecutable({...plan,file:'C:\\Program Files\\Node\\node.exe'},'win32').shell,false);
  } finally {fs.unlinkSync(path.join(dir,'node.EXE'));fs.unlinkSync(path.join(dir,'npm.CMD'));fs.rmdirSync(dir);}
});
test('host tools have no wrapper deadline; container safety and explicit overrides are preserved',()=>{
  assert.equal(terminalTimeoutMs('win-host',{}),0);assert.equal(terminalTimeoutMs('bwrap',{}),0);assert.equal(terminalTimeoutMs('docker',{}),900000);
  assert.equal(terminalTimeoutMs('win-host',{GROK_DESKTOP_TERMINAL_TIMEOUT_MS:'45000'}),45000);
  assert.equal(terminalTimeoutMs('docker',{GROK_DESKTOP_TERMINAL_TIMEOUT_MS:'0'}),0);
});

test('real native executable preserves quotes, spaces, apostrophes and shell metacharacters',()=>{
  const text='кириллица "quoted" don\'t & | $ value';
  const plan=directWindowsExecutable({file:process.execPath,fileArgs:['-e','process.stdout.write(process.argv[1])',text],shell:process.platform==='win32',env:process.env,cwd:process.cwd()});
  const result=spawnSync(plan.file,plan.fileArgs,{shell:plan.shell,env:plan.env,encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,text);
});
