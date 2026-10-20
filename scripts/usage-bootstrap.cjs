const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version;
app.disableHardwareAcceleration();
app.setPath('userData', process.env.GROK_USAGE_QA_PROFILE);
app.getVersion = () => version;
process.env.GROK_DESKTOP_MULTI_INSTANCE = '1';
process.env.GROK_DESKTOP_DEV_URL = pathToFileURL(path.join(root, 'dist/index.html')).href;
import(pathToFileURL(path.join(root, 'electron/main.mjs')).href).catch(error => {
  console.error(error.stack || String(error));
  app.exit(1);
});
