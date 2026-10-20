import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export function ImageViewer({src,alt,onClose}:{src:string;alt:string;onClose:()=>void}) {
  const close=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement;close.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}if(e.key==='Tab'){e.preventDefault();close.current?.focus();}};window.addEventListener('keydown',key);return()=>{window.removeEventListener('keydown',key);previous?.focus();};},[onClose]);
  return <div className="image-viewer" role="dialog" aria-modal="true" aria-label={alt} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><button ref={close} className="icon-button" aria-label="Close image" onClick={onClose}><X size={20}/></button><img src={src} alt={alt}/></div>;
}
