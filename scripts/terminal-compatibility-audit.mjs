import {AcpTerminalManager} from '../electron/acp-terminals.mjs';
import fs from 'node:fs';import path from 'node:path';
const cwd=path.resolve('qa/full-ui-workspace');fs.mkdirSync(cwd,{recursive:true});
const manager=new AcpTerminalManager({defaultCwd:cwd,sandboxTerminal:true});
const cases=[
  ['node argv','node',['-e','process.stdout.write("NODE_QUOTE_OK")'],'NODE_QUOTE_OK'],
  ['packed bash',`/bin/bash -lc 'printf "BASH_PACKED_OK"'`,[],'BASH_PACKED_OK'],
  ['split bash','bash -lc',['printf "BASH_SPLIT_OK"'],'BASH_SPLIT_OK'],
  ['multiline','printf "FIRST\\n"\nprintf "SECOND\\n"',[],'FIRST\nSECOND'],
  ['git argv','git',['-c',"user.name=Audit don't quote",'config','user.name'],"Audit don't quote"],
  ['pwsh absolute','C:\\Program Files\\PowerShell\\7\\pwsh.exe',['-NoProfile','-NonInteractive','-Command','[Console]::Write("PS_QUOTE_OK")'],'PS_QUOTE_OK'],
  ['npm shim','npm',['--version'],null],
];
const report=[];
try {
  for(const [name,command,args,expected] of cases) {
    let term;
    try {
      term=manager.create({command,args,cwd,sessionId:'compatibility-audit'});
      const result=await manager.waitForExit(term);const output=manager.output(term).output.trim();
      const passed=result.exitCode===0&&(expected==null?/^\d+\.\d+/.test(output):output===expected);
      report.push({name,passed,exitCode:result.exitCode,output});
    } catch(error){report.push({name,passed:false,error:error.message});}
    finally{if(term)manager.release(term);}
  }
}finally{manager.disposeAll();}
fs.writeFileSync('qa/terminal-compatibility.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(report.some(row=>!row.passed))process.exitCode=1;
