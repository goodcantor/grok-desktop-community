import pty from 'node-pty';
const terminals=new Map();
process.parentPort.on('message',({data:m})=>{try{
  if(m.action==='create'){
    const term=pty.spawn(m.shell,m.args||[],{name:'xterm-256color',cols:m.cols||100,rows:m.rows||24,cwd:m.cwd,env:m.env,useConpty:true});const record={term,closed:false};terminals.set(m.id,record);
    term.onData(data=>process.parentPort.postMessage({event:'data',id:m.id,data}));term.onExit(({exitCode})=>{record.closed=true;terminals.delete(m.id);process.parentPort.postMessage({event:'exit',id:m.id,exitCode});});process.parentPort.postMessage({event:'ready',id:m.id});return;
  }
  const t=terminals.get(m.id);if(!t||t.closed)return;
  if(m.action==='write')t.term.write(m.data);
  if(m.action==='resize')t.term.resize(m.cols,m.rows);
  if(m.action==='pause')t.term.pause();if(m.action==='resume')t.term.resume();
  if(m.action==='close'){t.closed=true;terminals.delete(m.id);t.term.kill();}
}catch(error){process.parentPort.postMessage({event:'error',id:m.id,error:error.message});}});
