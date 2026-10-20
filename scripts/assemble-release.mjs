import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {mergeUpdateMetadata} from './lib/release-metadata.mjs';
const [source,destination]=process.argv.slice(2),version=JSON.parse(fs.readFileSync('package.json')).version;
assert.ok(source&&destination);if(fs.existsSync(destination))assert.equal(fs.readdirSync(destination).length,0,'Assembly destination must be empty');fs.mkdirSync(destination,{recursive:true});
const metadata=new Map();for(const directory of fs.readdirSync(source,{withFileTypes:true})){
 assert.ok(directory.isDirectory());for(const entry of fs.readdirSync(path.join(source,directory.name),{withFileTypes:true})){
  assert.ok(entry.isFile()&&!entry.isSymbolicLink(),'Only flat release artifacts are accepted');const data=fs.readFileSync(path.join(source,directory.name,entry.name));
  if(entry.name.endsWith('.yml')){metadata.set(entry.name,[...(metadata.get(entry.name)||[]),data.toString('utf8')]);continue;}
  const output=path.join(destination,entry.name);if(fs.existsSync(output))assert.ok(fs.readFileSync(output).equals(data),'Conflicting release filename');else fs.writeFileSync(output,data);
 }
}
for(const [name,documents] of metadata)fs.writeFileSync(path.join(destination,name),mergeUpdateMetadata(documents,version));
