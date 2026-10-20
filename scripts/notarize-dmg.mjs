/** Release-only: notarize the final signed disk image before checksums are emitted. */
import {notarize} from '@electron/notarize';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
assert.equal(process.platform,'darwin','DMG notarization requires macOS');
const target=process.argv[2];assert.ok(['macos-arm64','macos-x64'].includes(target));
const version=JSON.parse(fs.readFileSync('package.json')).version;
const appPath=path.resolve('release',`GrokDesktopCommunity-${version}-${target.replace('macos-','macOS-')}.dmg`);
assert.ok(fs.statSync(appPath).isFile());
const {APPLE_API_KEY:appleApiKey,APPLE_API_KEY_ID:appleApiKeyId,APPLE_API_ISSUER:appleApiIssuer}=process.env;
assert.ok(appleApiKey&&appleApiKeyId&&appleApiIssuer,'Apple notarization credentials are required');
execFileSync('codesign',['--verify','--strict',appPath],{stdio:'inherit'});
await notarize({tool:'notarytool',appPath,appleApiKey,appleApiKeyId,appleApiIssuer});
console.log('DMG_NOTARIZED',path.basename(appPath));
