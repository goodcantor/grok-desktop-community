import yaml from 'js-yaml';import assert from 'node:assert/strict';
export function mergeUpdateMetadata(documents,version){
 const parsed=documents.map(text=>yaml.load(text,{schema:yaml.JSON_SCHEMA}));assert.ok(parsed.length);
 const files=new Map();
 for(const data of parsed){assert.equal(data.version,version,'Mixed update versions');assert.ok(Array.isArray(data.files)&&data.files.length,'Missing update files');
  for(const file of data.files){assert.ok(typeof file.url==='string'&&file.url===decodeURIComponent(file.url).split(/[\\/]/).at(-1),'Update URL must be an artifact basename');assert.ok(file.sha512,'Missing update checksum');
   if(files.has(file.url))assert.deepEqual(files.get(file.url),file,'Conflicting update artifact');else files.set(file.url,file);
  }
 }
 return yaml.dump({...parsed[0],files:[...files.values()]},{schema:yaml.JSON_SCHEMA,lineWidth:-1});
}
