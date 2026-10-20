import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { extractFile } from '@electron/asar';

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const tag = 'custom' + version.split('custom.').at(-1);
const archive = path.resolve('release-custom/win-unpacked/resources/app.asar');
const installer = path.resolve(`release-custom/GrokDesktopCustom-${version}-Setup.exe`);
const verifiedRuntimeFiles = [];
function verify(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) verify(file);
    else if (folder === 'dist' || file.startsWith('dist' + path.sep) || /\.(mjs|cjs|js|html|css)$/.test(file)) {
      assert.ok(fs.readFileSync(file).equals(extractFile(archive, file)), `Packaged file differs: ${file}`);
      verifiedRuntimeFiles.push(file);
    }
  }
}
for (const folder of ['electron', 'shared', 'dist']) verify(folder);
assert.equal(JSON.parse(extractFile(archive, 'package.json').toString()).version, version);
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(`qa/${tag}-package.json`, JSON.stringify({ version, verifiedRuntimeFiles, archiveSha256: digest(archive), installerSha256: digest(installer) }, null, 2));
console.log('PACKAGE_VERIFIED', version, verifiedRuntimeFiles.length);
