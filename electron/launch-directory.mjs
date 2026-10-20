import fs from 'node:fs';
import path from 'node:path';
/** Electron dev argv includes the entry script; packaged argv starts at exe. */
export function requestedLaunchDirectory(argv,packaged=true) {
  const args=argv.slice(packaged?1:2);
  const flag=args.findIndex(arg=>arg==='--cwd'||arg.startsWith('--cwd='));
  const candidates=flag>=0?[args[flag].startsWith('--cwd=')?args[flag].slice(6):args[flag+1]]:args.filter(arg=>!arg.startsWith('-'));
  for(const candidate of candidates) {
    if(!candidate)continue;
    try {const resolved=path.resolve(candidate);if(fs.statSync(resolved).isDirectory())return resolved;}catch {/* Ignore a missing directory. */}
  }
  return null;
}
