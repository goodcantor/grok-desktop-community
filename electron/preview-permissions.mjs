const configured = new WeakSet();
/** Preview is a project browser, never a grant of host devices or site permissions. */
export function configurePreviewPermissions(session) {
  if(configured.has(session))return;
  session.setPermissionCheckHandler(()=>false);
  session.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false));
  session.setDevicePermissionHandler(()=>false);
  configured.add(session);
}
