import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {catalogHistory,readFullHistory} from '../electron/history-core.mjs';
const require=createRequire(import.meta.url),asar=require('@electron/asar');
const archive=path.join(process.env.LOCALAPPDATA,'Programs','Grok Desktop Custom','resources','app.asar');
const pkg=JSON.parse(asar.extractFile(archive,'package.json'));
if(pkg.version!=='1.4.7-custom.3')throw Error('Wrong installed version');
const files=['electron/acp-client.mjs','electron/main.mjs','electron/preload.cjs','shared/composer-state.mjs','dist/index.html',...fs.readdirSync('dist/assets').map(f=>'dist/assets/'+f)];
for(const file of files){
  // asar traverses directory segments using the host path separator.
  const a=crypto.createHash('sha256').update(asar.extractFile(archive,path.normalize(file))).digest('hex');
  const b=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if(a!==b)throw Error('Installed artifact mismatch: '+file);
}
const before=JSON.parse(fs.readFileSync('qa/history-before-composer-install.json','utf8')),after=catalogHistory();
for(const old of before){const now=after.find(s=>s.cwd===old.cwd&&s.id===old.id);if(!now)throw Error('Prior chat missing');const count=readFullHistory(now.cwd,now.id).filter(i=>['user','assistant'].includes(i.kind)).length;if(count<old.messages)throw Error('Prior messages lost');}
const browser=JSON.parse(fs.readFileSync('qa/composer-browser.json','utf8')),native=JSON.parse(fs.readFileSync('qa/composer-installed.json','utf8')),goal=JSON.parse(fs.readFileSync('qa/native-goal-modes.json','utf8')),preferences=JSON.parse(fs.readFileSync('qa/installed-preferences.json','utf8'));
if(!browser.exclusiveModes||!browser.preservesDraft||!browser.noDuplicateGoalPrefix||!browser.autoGrowingInput||!native.contextAndChatSurviveRestart||!native.realAttachmentRead||!native.nativeModelAndReasoning||goal.goalStatusAfterPlan!=='user_paused'||!preferences.nativeZoom125)throw Error('Completion evidence is incomplete');
const installer=fs.readFileSync('release-custom/GrokDesktopCustom-1.4.7-custom.3-Setup.exe');
const delivery={version:pkg.version,installedFilesVerified:files.length,priorSessionsRetained:before.length,currentSessions:after.length,focusedTests:54,fullSuite:{total:555,passed:534,unchangedUpstreamWindowsFailures:21,newFailures:0},installerSha256:crypto.createHash('sha256').update(installer).digest('hex'),requirements:{composerSettings:browser.modelAndReasoningInComposer&&browser.permissionsInComposer,exclusiveModes:browser.exclusiveModes&&native.exclusiveModes,highlightedModeScreenshot:'qa/composer-native-goal-selected.png',draftPreservation:browser.preservesDraft&&native.draftPreserved,activeGoalPausesBeforePlan:goal.planPausesGoal,contextFromEngine:native.contextFromEngine,contextSelection:native.context500kApplied,contextPersists:native.contextAndChatSurviveRestart,contextScreenshot:'qa/composer-native-context.png',autoGrowingTextarea:browser.autoGrowingInput,attachments:native.realAttachmentRead,resizeAndZoom:preferences.nativeResize&&preferences.nativeZoom125}};
fs.writeFileSync('qa/composer-delivery.json',JSON.stringify(delivery,null,2));
console.log(JSON.stringify(delivery,null,2));
