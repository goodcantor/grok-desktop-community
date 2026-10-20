import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import assert from 'node:assert/strict';
const version=JSON.parse(fs.readFileSync('package.json')).version;assert.equal(process.env.RELEASE_TAG,'v'+version);
const acceptance=JSON.parse(fs.readFileSync('docs/RELEASE-ACCEPTANCE.json'));assert.equal(acceptance.version,version);
for(const row of Object.values(acceptance.targets)){assert.equal(row.officialCli,'passed','Official CLI acceptance pending');assert.equal(row.signedUpdate,'passed','Signed update acceptance pending');assert.ok(row.evidence&&row.cliVersion&&row.date);}
if(process.env.TARGET.startsWith('windows'))assert.ok(process.env.WIN_CSC_LINK&&process.env.WINDOWS_PUBLISHER_NAME,'Windows signer is not provisioned');
if(process.env.TARGET.startsWith('macos'))assert.ok(process.env.MAC_CSC_LINK&&process.env.APPLE_API_KEY,'Apple signing is not provisioned');

const tagCommit=execFileSync('git',['rev-parse','--verify',`refs/tags/${process.env.RELEASE_TAG}^{commit}`],{encoding:'utf8'}).trim();
const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();assert.equal(tagCommit,head,'Checkout must match an existing release tag');
if(process.env.GITHUB_ACTIONS==='true'){
 assert.equal(process.env.GITHUB_REPOSITORY,'goodcantor/grok-desktop-community');
 const response=await fetch(`https://api.github.com/repos/goodcantor/grok-desktop-community/actions/workflows/ci.yml/runs?head_sha=${head}&event=push`,{headers:{Authorization:`Bearer ${process.env.GITHUB_TOKEN}`,Accept:'application/vnd.github+json'}});
 assert.ok(response.ok,'Cannot verify required quality run');const runs=await response.json();assert.ok(runs.workflow_runs.some(run=>run.head_sha===head&&run.conclusion==='success'),'The exact release commit must pass all native quality jobs');
}
