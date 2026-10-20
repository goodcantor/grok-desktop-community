import fs from 'node:fs';
import path from 'node:path';

export function migrateCustom8(file,state) {
  if(state.custom8AccessMigration)return state;
  if(fs.existsSync(file)&&!fs.existsSync(file+'.before-custom8'))fs.copyFileSync(file,file+'.before-custom8');
  // An interface upgrade preserves access choices, including safe defaults.
  const next={...state,custom8AccessMigration:true};
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(next,null,2));return next;
}
