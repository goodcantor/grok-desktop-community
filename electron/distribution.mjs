import fs from 'node:fs';import path from 'node:path';
export function distributionPolicy(value,packaged=true){
 const channel=packaged&&['signed','unsigned-preview'].includes(value)?value:'development';
 return {channel,updates:channel==='signed'?'verified':'manual'};
}
export function communityDistribution(app){
 try{return distributionPolicy(JSON.parse(fs.readFileSync(path.join(app.getAppPath(),'package.json'),'utf8')).communityDistribution,app.isPackaged);}
 catch{return distributionPolicy(null);}
}
