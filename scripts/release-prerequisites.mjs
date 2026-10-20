import fs from 'node:fs';import assert from 'node:assert/strict';
const version=JSON.parse(fs.readFileSync('package.json')).version;assert.equal(process.env.RELEASE_TAG,'v'+version);
const acceptance=JSON.parse(fs.readFileSync('docs/RELEASE-ACCEPTANCE.json'));assert.equal(acceptance.version,version);
for(const row of Object.values(acceptance.targets)){assert.equal(row.officialCli,'passed','Official CLI acceptance pending');assert.equal(row.signedUpdate,'passed','Signed update acceptance pending');assert.ok(row.evidence&&row.cliVersion&&row.date);}
if(process.env.TARGET.startsWith('windows'))assert.ok(process.env.WIN_CSC_LINK&&process.env.WINDOWS_PUBLISHER_NAME,'Windows signer is not provisioned');
if(process.env.TARGET.startsWith('macos'))assert.ok(process.env.MAC_CSC_LINK&&process.env.APPLE_API_KEY,'Apple signing is not provisioned');
