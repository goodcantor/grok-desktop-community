import fs from 'node:fs';
import path from 'node:path';

/** Native Windows executables accept argv directly. cmd.exe's shell:true
 * concatenation consumes embedded quotes (e.g. node -e or python -c).
 * Keep the existing shell path for batch shims and shell builtins.
 */
export function directWindowsExecutable(plan, platform = process.platform) {
  if (platform !== 'win32' || !plan.shell) return plan;
  const file = String(plan.file || '');
  if (/\.(exe|com)$/i.test(file)) return {...plan,shell:false};
  const env=plan.env||process.env;
  const dirs=/[\\/]/.test(file) ? [''] : [plan.cwd||process.cwd(),...(env.PATH||env.Path||'').split(';')];
  const extensions=path.win32.extname(file) ? [''] : (env.PATHEXT||'.COM;.EXE;.BAT;.CMD').split(';');
  for(const dir of dirs) {
    for(const ext of extensions) {
      const candidate=dir ? path.join(dir.replace(/^"|"$/g,''),file+ext) : file+ext;
      try {
        if(!fs.statSync(candidate).isFile())continue;
        return /\.(exe|com)$/i.test(candidate) ? {...plan,file:candidate,shell:false} : plan;
      } catch {/* Try the next PATH entry. */}
    }
  }
  return plan;
}
