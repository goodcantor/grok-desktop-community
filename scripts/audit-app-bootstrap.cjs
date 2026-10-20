// A real Electron app with its own UI profile. The installed user app stays open.
const {app}=require('electron');
app.disableHardwareAcceleration();
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const profile=path.join(root,'qa','full-ui-profile'+(process.env.GROK_AUDIT_DPI?'-'+Number(process.env.GROK_AUDIT_DPI)*100:''));fs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);
app.getVersion=()=>JSON.parse(fs.readFileSync(path.join(root,'package.json'))).version;
process.env.GROK_DESKTOP_MULTI_INSTANCE='1';
process.env.GROK_DESKTOP_DEV_URL=pathToFileURL(path.join(root,'dist','index.html')).href;
if(!fs.existsSync(path.join(profile,'desktop-state.json')))fs.writeFileSync(path.join(profile,'desktop-state.json'),JSON.stringify({permissionMode:'auto',reasoningEffort:'high',sandboxTerminal:true,allowOutsideProject:false,uiZoom:1}));
import(pathToFileURL(path.join(root,'electron','main.mjs')).href).catch(error=>{console.error(error.stack||String(error));app.exit(1);});
