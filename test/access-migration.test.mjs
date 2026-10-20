import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {migrateCustom8} from '../electron/access-migration.mjs';

test('interface migration preserves access defaults and existing owner choices',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'grok-access-'));
  try{
    for(const permissionMode of ['ask','auto','always-approve']){
      const file=path.join(root,permissionMode+'.json');
      const before={permissionMode,allowOutsideProject:false,sandboxTerminal:true};
      fs.writeFileSync(file,JSON.stringify(before));
      const next=migrateCustom8(file,before);
      assert.deepEqual(next,{...before,custom8AccessMigration:true});
      assert.deepEqual(JSON.parse(fs.readFileSync(file+'.before-custom8','utf8')),before);
      assert.equal(migrateCustom8(file,next),next);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
