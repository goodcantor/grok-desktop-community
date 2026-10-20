import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {git,gitSnapshot,gitAction,splitGitHunks} from '../electron/git-service.mjs';
test('custom8 Git stages hunks, rejects stale patches, commits Unicode and pushes FF only',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'grok-custom8-git-')),cwd=path.join(temp,'Проект spaces'),remote=path.join(temp,'remote.git');fs.mkdirSync(cwd);
  try{
    await git(cwd,['init','-b','main']);await git(cwd,['config','user.name','Grok QA']);await git(cwd,['config','user.email','qa@example.invalid']);
    fs.writeFileSync(path.join(cwd,'тест file.txt'),Array.from({length:30},(_,i)=>`line ${i}`).join('\n')+'\n');await gitAction(cwd,{action:'stage'});await gitAction(cwd,{action:'commit',message:'Первый коммит'});
    const file=path.join(cwd,'тест file.txt');fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('line 2\n','new 2\n').replace('line 25\n','new 25\n'));
    const snapshot=await gitSnapshot(cwd);assert.equal(splitGitHunks(snapshot.diff).length,2);await gitAction(cwd,{action:'hunk',mode:'working',hash:snapshot.hash,file:0,hunk:0});
    const staged=await gitSnapshot(cwd,'staged');assert.match(staged.diff,/new 2/);assert.doesNotMatch(staged.diff,/new 25/);await assert.rejects(gitAction(cwd,{action:'hunk',mode:'working',hash:snapshot.hash,file:0,hunk:0}),/Refresh/);
    await gitAction(cwd,{action:'hunk',mode:'staged',hash:staged.hash,file:0,hunk:0});assert.equal((await gitSnapshot(cwd,'staged')).diff,'');await gitAction(cwd,{action:'stage'});await gitAction(cwd,{action:'commit',message:"Fix don't / кириллица\n\nDetails"});
    await git(temp,['init','--bare',remote]);await git(cwd,['remote','add','origin',remote]);await git(cwd,['push','-u','origin','main']);await gitAction(cwd,{action:'fetch'});await gitAction(cwd,{action:'pull'});await gitAction(cwd,{action:'push'});
    await gitAction(cwd,{action:'create',branch:'feature/qa'});assert.equal((await gitSnapshot(cwd)).branch,'feature/qa');await gitAction(cwd,{action:'checkout',branch:'main'});
    await assert.rejects(gitAction(cwd,{action:'stage',paths:['../escape']}),/Invalid/);await assert.rejects(gitSnapshot(cwd,'branch','--bad'),/unknown|option|revision|single/i);
  }finally{const resolved=path.resolve(temp);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('grok-custom8-git-'));fs.rmSync(resolved,{recursive:true,force:true});}
});
