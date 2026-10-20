// Remote pages receive no Node or application bridge. Only Ctrl+wheel is
// forwarded for their own zoom, with sender validation in the main process.
const {ipcRenderer}=require('electron');
let lastWheel=0;
window.addEventListener('wheel',event=>{
  if(!(event.ctrlKey||event.metaKey)||!event.deltaY)return;
  event.preventDefault();const now=Date.now();if(now-lastWheel<80)return;lastWheel=now;
  ipcRenderer.send('preview:step-zoom',event.deltaY<0?'in':'out');
},{passive:false,capture:true});
window.addEventListener('keydown',event=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='l'){event.preventDefault();ipcRenderer.send('preview:focus-address');return;}
  if(!(event.ctrlKey||event.metaKey)||event.altKey||!['+','=','-','0'].includes(event.key))return;
  event.preventDefault();ipcRenderer.send('preview:step-zoom',event.key==='0'?'reset':event.key==='-'?'out':'in');
},{capture:true});
