// Electron 44 materializes its runtime lazily; fresh packaging must provision it first.
import 'electron';
import {spawnSync} from 'node:child_process';import path from 'node:path';
const cli=path.resolve('node_modules/electron-builder/out/cli/cli.js');
const args=process.argv.slice(2);
if(process.platform==='win32')args.push('-c.npmRebuild=false');
const result=spawnSync(process.execPath,[cli,...args],{stdio:'inherit',env:process.env});process.exit(result.status??1);
