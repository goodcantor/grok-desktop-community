import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const version=JSON.parse(fs.readFileSync('package.json')).version;
const args=process.argv.slice(2),target=args[args.indexOf('--target')+1];
const acceptance=JSON.parse(fs.readFileSync('docs/RELEASE-ACCEPTANCE.json'));
assert.equal(acceptance.version,version,'Acceptance version differs');
const required=['windows-x64','macos-arm64','macos-x64','linux-x64'];assert.ok(required.includes(target),'Specify --target');
const row=acceptance.targets[target];assert.equal(row?.officialCli,'passed',`${target}: official CLI acceptance pending`);assert.equal(row?.signedUpdate,'passed',`${target}: signed update acceptance pending`);assert.ok(row?.evidence&&row?.date&&row?.cliVersion,'Acceptance evidence required');
const files=fs.readdirSync('release').filter(name=>name.startsWith('GrokDesktopCommunity-'+version+'-'));
const arch=target.endsWith('arm64')?'arm64':'x64';const platform=target.startsWith('windows')?'Windows':target.startsWith('macos')?'macOS':'Linux';
const artifacts=files.filter(name=>name.includes(`-${platform}-${arch}`)&&/\.(exe|dmg|zip|AppImage)$/.test(name));
assert.ok(artifacts.length,'No release artifacts');
if(target.startsWith('windows')){
 assert.ok(process.env.WINDOWS_PUBLISHER_NAME,'Expected Windows publisher required');
 for(const file of [...artifacts.filter(f=>f.endsWith('.exe')).map(f=>path.resolve('release',f)),path.resolve('release/win-unpacked/Grok Desktop Community.exe')])execFileSync('powershell.exe',['-NoProfile','-File','scripts/verify-windows-signature.ps1','-Path',file,'-ExpectedPublisher',process.env.WINDOWS_PUBLISHER_NAME],{stdio:'inherit'});
}else if(target.startsWith('macos')){
 const app=path.resolve(`release/mac${arch==='arm64'?'-arm64':''}/Grok Desktop Community.app`);
 execFileSync('codesign',['--verify','--deep','--strict',app],{stdio:'inherit'});
 const details=execFileSync('codesign',['-dv','--verbose=4',app],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 // codesign details go to stderr; spctl validates the Developer ID/notarization trust chain.
 void details;execFileSync('spctl',['--assess','--type','execute','--verbose=4',app],{stdio:'inherit'});execFileSync('xcrun',['stapler','validate',app],{stdio:'inherit'});
}
const sums=artifacts.map(file=>`${crypto.createHash('sha256').update(fs.readFileSync(path.join('release',file))).digest('hex')}  ${file}`).join('\n')+'\n';
fs.writeFileSync(`release/SHA256SUMS-${target}.txt`,sums);
fs.writeFileSync(`release/verification-${target}.json`,JSON.stringify({version,target,verified:true,artifacts,acceptance:row},null,2));
console.log('RELEASE_TARGET_VERIFIED',target);
