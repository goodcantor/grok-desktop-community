import fs from 'node:fs';import path from 'node:path';
export function installedPtyShells({platform=process.platform,env=process.env,exists=fs.existsSync}={}){
  const candidates=platform==='win32' ? [
    {id:'pwsh',name:'PowerShell 7',path:path.join(env.ProgramFiles||'C:\\Program Files','PowerShell','7','pwsh.exe'),args:['-NoLogo']},
    {id:'bash',name:'Git Bash',path:'C:\\Program Files\\Git\\bin\\bash.exe',args:['--login']},
    {id:'powershell',name:'Windows PowerShell',path:path.join(env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),args:['-NoLogo']}
  ] : [
    {id:'default',name:'Default shell',path:env.SHELL,args:[]},
    ...(platform==='darwin'?[{id:'zsh',name:'Zsh',path:'/bin/zsh',args:['-l']}]:[]),
    {id:'bash',name:'Bash',path:'/bin/bash',args:['--login']},{id:'sh',name:'Shell',path:'/bin/sh',args:[]}
  ];
  const seen=new Set();return candidates.filter(shell=>shell.path&&path.isAbsolute(shell.path)&&exists(shell.path)&&!seen.has(shell.path)&&seen.add(shell.path));
}
