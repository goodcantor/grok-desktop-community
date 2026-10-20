import yaml from 'js-yaml';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import crypto from 'node:crypto';
const dir=process.argv[2],version=JSON.parse(fs.readFileSync('package.json')).version,files=fs.readdirSync(dir);
for(const target of ['windows-x64','macos-arm64','macos-x64','linux-x64']){
 const row=JSON.parse(fs.readFileSync(path.join(dir,`verification-${target}.json`)));assert.equal(row.version,version);assert.equal(row.verified,true);assert.ok(row.artifacts.length);
 for(const line of fs.readFileSync(path.join(dir,`SHA256SUMS-${target}.txt`),'utf8').trim().split('\n')){const [expected,file]=line.split('  ');assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex'),expected);}
}
const prefix='GrokDesktopCommunity-'+version+'-';for(const suffix of ['Windows-x64-Setup.exe','macOS-arm64.dmg','macOS-x64.dmg','macOS-arm64.zip','macOS-x64.zip','Linux-x64.AppImage'])assert.ok(files.includes(prefix+suffix),'Missing '+suffix);
const channel=version.includes('-')?'beta':'latest';
for(const name of [`${channel}.yml`,`${channel}-mac.yml`,`${channel}-linux.yml`]){
 const metadata=yaml.load(fs.readFileSync(path.join(dir,name),'utf8'),{schema:yaml.JSON_SCHEMA});assert.equal(metadata.version,version);
 for(const file of metadata.files){assert.equal(file.url,path.basename(file.url));const artifact=fs.readFileSync(path.join(dir,file.url));assert.equal(crypto.createHash('sha512').update(artifact).digest('base64'),file.sha512);if(file.size!=null)assert.equal(artifact.length,file.size);}
 if(name.includes('-mac'))for(const arch of ['arm64','x64'])assert.ok(metadata.files.some(file=>file.url.endsWith(`-macOS-${arch}.zip`)),'Missing macOS updater architecture');
}
const installers=files.filter(file=>/\.(exe|dmg|AppImage)$/.test(file));
const notes='# Grok Desktop Community '+version+'\n\nIndependent community client for the official Grok Build CLI. Install the CLI first; model access follows your account.\n\n'+installers.map(file=>`- [${file}](https://github.com/goodcantor/grok-desktop-community/releases/download/v${version}/${file})`).join('\n')+'\n\nChecksums, SBOM and provenance accompany the release. See README for installation, privacy and known beta limits.\n';fs.writeFileSync(path.join(dir,'RELEASE-NOTES.md'),notes);
