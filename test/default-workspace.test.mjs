import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ensureDefaultWorkspace} from '../electron/default-workspace.mjs';

test('default workspace is an ordinary Grok folder and preserves existing work', () => {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'grok-default-workspace-'));
  try {
    const cwd=ensureDefaultWorkspace(home);
    assert.equal(cwd,path.join(home,'Grok'));
    assert.ok(fs.statSync(cwd).isDirectory());
    fs.writeFileSync(path.join(cwd,'notes.txt'),'keep my files');
    assert.equal(ensureDefaultWorkspace(home),cwd);
    assert.equal(fs.readFileSync(path.join(cwd,'notes.txt'),'utf8'),'keep my files');
    assert.equal(fs.existsSync(path.join(home,'.grok')),false);
  } finally {
    assert.ok(path.resolve(home).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(home,{recursive:true,force:true});
  }
});

test('does not replace a file that occupies the workspace path', () => {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'grok-default-workspace-'));
  try {
    fs.writeFileSync(path.join(home,'Grok'),'existing file');
    assert.throws(()=>ensureDefaultWorkspace(home));
    assert.equal(fs.readFileSync(path.join(home,'Grok'),'utf8'),'existing file');
  } finally {
    assert.ok(path.resolve(home).startsWith(path.resolve(os.tmpdir())+path.sep));
    fs.rmSync(home,{recursive:true,force:true});
  }
});
