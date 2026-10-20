import {clampZoom,stepZoom} from '../shared/zoom.mjs';

export function installZoom(wc,{initial=1,onChange=()=>{}}={}) {
  let current=clampZoom(initial);
  const apply=value=>{
    if(wc.isDestroyed())return 1;
    const factor=clampZoom(value);current=factor;wc.setZoomFactor(factor);onChange(factor);return factor;
  };
  wc.on('zoom-changed',(_event,direction)=>apply(stepZoom(wc.getZoomFactor(),direction)));
  wc.on('before-input-event',(event,input)=>{
    if(input.type!=='keyDown'||!(input.control||input.meta)||input.alt)return;
    if(['+','=','-','0'].includes(input.key)) {
      event.preventDefault();apply(input.key==='0'?1:stepZoom(wc.getZoomFactor(),input.key==='-'?'out':'in'));
    }
  });
  wc.on('did-finish-load',()=>apply(current));
  return {apply};
}
