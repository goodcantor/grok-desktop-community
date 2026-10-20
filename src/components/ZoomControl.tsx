import {useEffect,useState} from 'react';
export function ZoomControl() {
  const [zoom,setZoom]=useState(1);
  useEffect(()=>{
    let active=true;
    void window.grokDesktop.getZoom().then(value=>{if(active&&typeof value==='number')setZoom(value);}).catch(()=>{});
    const off=window.grokDesktop.on('app:zoom',value=>{if(typeof value==='number')setZoom(value);});
    return()=>{active=false;off();};
  },[]);
  const change=async(value:number)=>{try {setZoom(await window.grokDesktop.setZoom(value));}catch {/* Keep the last confirmed scale. */}};
  return <div className="zoom-control" aria-label="Interface zoom">
    <button aria-label="Zoom out" disabled={zoom<=0.5} onClick={()=>void change(Math.round((zoom-0.1)*100)/100)}>−</button>
    <button aria-label="Reset zoom" title="Reset zoom · Ctrl+0" onClick={()=>void change(1)}>{Math.round(zoom*100)}%</button>
    <button aria-label="Zoom in" disabled={zoom>=2} onClick={()=>void change(Math.round((zoom+0.1)*100)/100)}>+</button>
  </div>;
}
