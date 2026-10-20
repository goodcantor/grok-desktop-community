import path from 'node:path';
import fs from 'node:fs';
export const COMMUNITY_IDENTITY={appId:'io.github.goodcantor.grokdesktopcommunity',directory:'grok-desktop-community'};
export function configureCommunityDataPath(app){
 // Explicit profiles belong to their caller; never change their location or permissions.
 if(app.commandLine?.hasSwitch?.('user-data-dir'))return;
 const current=path.resolve(app.getPath('userData')),normal=path.resolve(app.getPath('appData'),app.getName());
 const community=path.resolve(app.getPath('appData'),COMMUNITY_IDENTITY.directory);
 if(current!==normal&&current!==community)return;
 if(current!==community)app.setPath('userData',community);
 // The disposable search index can contain conversation text. Restrict the entire profile.
 fs.mkdirSync(community,{recursive:true,mode:0o700});
 if(process.platform!=='win32'){
  const stat=fs.lstatSync(community);
  if(stat.isDirectory()&&!stat.isSymbolicLink())fs.chmodSync(community,0o700);
 }
}
