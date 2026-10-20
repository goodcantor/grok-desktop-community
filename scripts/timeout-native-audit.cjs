const {app}=require('electron');
import('./timeout-native-audit.mjs').catch(error=>{console.error(error.stack||String(error));app.exit(1);});
