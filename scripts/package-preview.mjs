/** Build a clearly marked, manual-update preview without signing credentials. */
import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const target=process.argv[2];assert.ok(['windows-x64','macos-arm64','macos-x64','linux-x64'].includes(target),'Specify a preview target');
const args=['scripts/package.mjs','--publish','never','-c.forceCodeSigning=false','-c.extraMetadata.communityDistribution=unsigned-preview'];
if(target==='windows-x64')args.push('--win','--x64','-c.nsis.runAfterFinish=false','-c.win.artifactName=GrokDesktopCommunity-${version}-Windows-${arch}-Unsigned-Setup.${ext}');
else if(target.startsWith('macos'))args.push('--mac','dmg',target.endsWith('arm64')?'--arm64':'--x64','-c.mac.identity=-','-c.mac.notarize=false','-c.dmg.sign=false','-c.mac.artifactName=GrokDesktopCommunity-${version}-macOS-${arch}-Unnotarized.${ext}');
else args.push('--linux','deb','AppImage','--x64');
const env={...process.env,CSC_IDENTITY_AUTO_DISCOVERY:'false'};
for(const key of ['CSC_LINK','CSC_KEY_PASSWORD','WIN_CSC_LINK','WIN_CSC_KEY_PASSWORD','MAC_CSC_LINK','MAC_CSC_KEY_PASSWORD','APPLE_API_KEY','APPLE_API_KEY_ID','APPLE_API_ISSUER','APPLE_ID','APPLE_APP_SPECIFIC_PASSWORD'])delete env[key];
const result=spawnSync(process.execPath,args,{stdio:'inherit',env});process.exit(result.status??1);
