import {spawn} from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {buildGrokEnv} from './grok-home.mjs';
export function git(cwd,args,input,timeout=30000) {
  return new Promise((resolve,reject)=>{const child=spawn('git',['-c','core.quotepath=false',...args],{cwd,env:{...buildGrokEnv(),GIT_TERMINAL_PROMPT:'0'},windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='',size=0;
    const timer=setTimeout(()=>{child.kill();reject(Error('Git operation timed out'));},timeout);
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',b=>{size+=b.length;if(size>16*1024*1024){child.kill();return;}out+=b.toString('utf8');});child.stderr.on('data',b=>err+=b.toString('utf8'));
    child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0&&size<=16*1024*1024?resolve(out):reject(Error(size>16*1024*1024?'Diff too large; open in your editor':err.trim()||`Git exited ${code}`));});child.stdin.on('error',()=>{});child.stdin.end(input||'');
  });
}
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function validatePath(p){if(typeof p!=='string'||!p||p.includes('\0')||p.startsWith('-')||path.isAbsolute(p)||p.split(/[\\/]/).includes('..'))throw Error('Invalid repository path');return p;}
export function splitGitHunks(diff){const parts=diff.split(/(?=^@@ -\d)/m);return parts.slice(1).map((text,i)=>({id:i,patch:parts[0]+text,text}));}
export async function gitSnapshot(cwd,mode='working',base='HEAD') {
  const root=(await git(cwd,['rev-parse','--show-toplevel'])).trim();
  if(!['working','staged','branch'].includes(mode))throw Error('Invalid diff view');
  if(mode==='branch')base=(await git(root,['rev-parse','--verify','--end-of-options',`${base}^{commit}`])).trim();
  const diffArgs=mode==='staged'?['--cached']:mode==='branch'?[`${base}...HEAD`]:[];
  const [branch,branches,status,diff]=await Promise.all([git(root,['branch','--show-current']),git(root,['for-each-ref','--format=%(refname:short)','refs/heads','refs/remotes']),git(root,['status','--porcelain=v1','-z','-uall']),git(root,['diff','--no-ext-diff','--no-color',...diffArgs,'--'])]);
  const tokens=status.split('\0'),files=[];for(let i=0;i<tokens.length;i++){const s=tokens[i];if(!s)continue;const file={path:s.slice(3),index:s[0],worktree:s[1],original:null};if(/[RC]/.test(s.slice(0,2)))file.original=tokens[++i];files.push(file);}
  return {root,branch:branch.trim(),branches:branches.trim().split('\n').filter(Boolean),files,diff,hash:digest(diff),mode,base};
}
export async function gitAction(cwd,args) {
  const root=(await git(cwd,['rev-parse','--show-toplevel'])).trim();
  const paths=(args.paths||[]).map(validatePath);
  if(args.action==='stage')return git(root,['add','--',...(paths.length?paths:['.'])]);
  if(args.action==='unstage')return git(root,['restore','--staged','--',...(paths.length?paths:['.'])]);
  if(args.action==='discard'){if(!paths.length)throw Error('Choose files to discard');return git(root,['restore','--worktree','--',...paths]);}
  if(args.action==='hunk'){
    if(!['working','staged'].includes(args.mode)||!Number.isInteger(args.hunk))throw Error('Invalid hunk');
    const snap=await gitSnapshot(root,args.mode);if(snap.hash!==args.hash)throw Error('Changes updated on disk. Refresh the diff and try again.');
    const segments=snap.diff.split(/(?=^diff --git )/m).filter(Boolean),segment=segments[args.file];if(!segment)throw Error('File no longer exists');
    const patch=splitGitHunks(segment)[args.hunk]?.patch;if(!patch)throw Error('Hunk no longer exists');
    const flags=['--cached',...(args.mode==='staged'?['--reverse']:[])];await git(root,['apply','--check',...flags,'-'],patch);return git(root,['apply',...flags,'-'],patch);
  }
  if(args.action==='commit'){const message=String(args.message||'');if(!message.trim())throw Error('Enter a commit message');return git(root,['commit','-F','-'],message,120000);}
  if(['checkout','create'].includes(args.action)){const branch=String(args.branch||'');await git(root,['check-ref-format','--branch',branch]);return git(root,args.action==='create'?['switch','-c',branch]:['switch',branch]);}
  if(['fetch','pull','push'].includes(args.action))return git(root,args.action==='pull'?['pull','--ff-only']:args.action==='fetch'?['fetch','--prune']:['push'],null,120000);
  throw Error('Unsupported Git action');
}
export function installGitIpc({ipcMain,sessionFromEvent}) {
  const root=e=>{const cwd=(sessionFromEvent(e)?.agent?.cwd || sessionFromEvent(e)?.lastCwd);if(!cwd)throw Error('No workspace open');return cwd;};const locks=new Set();
  ipcMain.handle('git:snapshot',(e,args={})=>gitSnapshot(root(e),args.mode,args.base));
  ipcMain.handle('git:action',async(e,args)=>{const cwd=root(e),key=fs.realpathSync(cwd).toLowerCase();if(locks.has(key))throw Error('Another Git operation is running');locks.add(key);try{return await gitAction(cwd,args);}finally{locks.delete(key);}});
}
