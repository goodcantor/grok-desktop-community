export const COMMUNITY_FEED = Object.freeze({ provider:'github', owner:'goodcantor', repo:'grok-desktop-community' });
export function configureCommunityUpdater(updater, prerelease) {
  updater.setFeedURL({...COMMUNITY_FEED});
  updater.autoDownload=false; updater.autoInstallOnAppQuit=false;
  updater.allowDowngrade=false; updater.allowPrerelease=Boolean(prerelease);
}
/** The caller performs all window/task guards before the stock installer is invoked. */
export async function installCommunityUpdate({updater,prepare,markInstalling,unlock}) {
  if(!await prepare()){await unlock();return false;}
  markInstalling(true);
  try { updater.quitAndInstall(false,true); return true; }
  catch(error){markInstalling(false);await unlock();throw error;}
}
