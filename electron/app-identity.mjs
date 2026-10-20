import path from 'node:path';
export const COMMUNITY_IDENTITY={appId:'io.github.goodcantor.grokdesktopcommunity',directory:'grok-desktop-community'};
export function configureCommunityDataPath(app){
 const current=path.resolve(app.getPath('userData')),normal=path.resolve(app.getPath('appData'),app.getName());
 // Preserve an explicit --user-data-dir or an isolated test profile.
 if(current===normal)app.setPath('userData',path.join(app.getPath('appData'),COMMUNITY_IDENTITY.directory));
}
