import { fileURLToPath } from 'node:url';
import path from 'node:path';
export function assertApplicationSender(event, { window, appPath, developmentUrl }) {
  if(!window || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame) throw Error('Untrusted IPC sender');
  const value=event.senderFrame?.url || '';
  try {
    const actual=new URL(value);
    if(actual.protocol==='file:' && path.resolve(fileURLToPath(actual))===path.resolve(appPath,'dist','index.html'))return;
    if(developmentUrl){const expected=new URL(developmentUrl);if(['http:','https:'].includes(expected.protocol)&&actual.origin===expected.origin&&actual.pathname===expected.pathname)return;}
  }catch{}
  throw Error('Untrusted IPC document');
}
