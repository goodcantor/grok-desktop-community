import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'community-privacy-'));process.env.GROK_HOME=home;
const privacy=await import('../electron/coding-data.mjs');
after(()=>fs.rmSync(home,{recursive:true,force:true}));
for(const value of [undefined,true,false])test(`privacy read preserves native bytes and permissions: ${value}`,()=>{
 const file=path.join(home,'auth.json');fs.writeFileSync(file,JSON.stringify({test:{key:'fixture',coding_data_retention_opt_out:value}}));fs.chmodSync(file,0o600);
 const before=fs.readFileSync(file),mode=fs.statSync(file).mode;const result=privacy.getCodingDataStatus();
 assert.equal(result.optedIn,value===undefined?null:!value);assert.equal(result.managed,true);
 assert.deepEqual(fs.readFileSync(file),before);assert.equal(fs.statSync(file).mode,mode);
 assert.equal(privacy.setCodingDataOptIn,undefined);assert.equal(privacy.ensureCodingDataDefaultOptIn,undefined);
});
test('unavailable native preference stays unknown',()=>{fs.rmSync(path.join(home,'auth.json'));assert.equal(privacy.getCodingDataStatus().optedIn,null);});
