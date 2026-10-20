import {useEffect, useLayoutEffect, useId, type ReactNode} from 'react';
import {platform as domPlatform, autoUpdate, flip, offset, shift, size, useDismiss, useFloating, useInteractions, FloatingPortal, type Placement, type VirtualElement} from '@floating-ui/react';

/** Nonmodal layers never make the editor inert or consume an outside click. */
export function AnchoredPopover({anchor,onClose,children,label,className='',placement='top-start',tooltip=false,role='dialog',initialFocus=false}: {
  anchor:HTMLElement|VirtualElement|null;onClose:()=>void;children:ReactNode;label:string;className?:string;placement?:Placement;tooltip?:boolean;role?:'dialog'|'menu';initialFocus?:boolean;
}) {
  const id=useId();
  const contextElement=anchor instanceof HTMLElement?anchor:anchor?.contextElement;
  const focusTarget=contextElement instanceof HTMLElement?(contextElement.matches('button,input,select')?contextElement:contextElement.querySelector<HTMLElement>('button,input,select')):null;
  const {refs,floatingStyles,context}=useFloating({open:true,placement,strategy:'fixed',elements:{reference:anchor instanceof HTMLElement?anchor:null},
    onOpenChange:(open,event)=>{if(!open){onClose();if(event?.type==='keydown')focusTarget?.focus();}},
    whileElementsMounted:autoUpdate,
    platform:{...domPlatform,
      async getElementRects(args){const rects=await domPlatform.getElementRects.call(this,args),zoom=Number(getComputedStyle(document.body).zoom)||1;const r=rects.reference;return {...rects,reference:{x:r.x/zoom,y:r.y/zoom,width:r.width/zoom,height:r.height/zoom}};},
      async getClippingRect(args){const r=await domPlatform.getClippingRect.call(this,args),zoom=Number(getComputedStyle(document.body).zoom)||1;return {x:r.x/zoom,y:r.y/zoom,width:r.width/zoom,height:r.height/zoom};}
    },middleware:[offset(8),flip({padding:12}),shift({padding:12}),size({padding:12,apply:({availableHeight,availableWidth,elements})=>{Object.assign(elements.floating.style,{maxHeight:`${Math.max(60,availableHeight)}px`,maxWidth:`${availableWidth}px`});}})]});
  useLayoutEffect(()=>{refs.setPositionReference(anchor);},[anchor,refs.setPositionReference]);
  const dismiss=useDismiss(context,{outsidePressEvent:'pointerdown'});
  const {getFloatingProps}=useInteractions([dismiss]);
  useEffect(()=>{
    if(tooltip)return;
    const close=(e:Event)=>{if((e as CustomEvent).detail!==id)onClose();};
    document.dispatchEvent(new CustomEvent('grok:popover-open',{detail:id}));
    const keyboard=(event:KeyboardEvent)=>{if(document.activeElement!==focusTarget||!['ArrowDown','ArrowUp'].includes(event.key))return;const items=refs.floating.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)');if(!items?.length)return;event.preventDefault();items[event.key==='ArrowUp'?items.length-1:0].focus();};
    document.addEventListener('grok:popover-open',close);document.addEventListener('keydown',keyboard);
    return()=>{document.removeEventListener('grok:popover-open',close);document.removeEventListener('keydown',keyboard);};
  },[id,tooltip,focusTarget]);
  useEffect(()=>{if(!initialFocus)return;const frame=requestAnimationFrame(()=>refs.floating.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus());return()=>cancelAnimationFrame(frame);},[initialFocus]);
  const content=<div ref={refs.setFloating} style={floatingStyles} className={`anchored-popover ${className}`} role={tooltip?'tooltip':role} aria-label={label} {...getFloatingProps({onKeyDown:(e:React.KeyboardEvent<HTMLDivElement>)=>{
    if(!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(e.key)||(e.target as HTMLElement).matches('input,textarea,select'))return;
    const nodes=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)'));
    if(!nodes.length)return;e.preventDefault();const n=nodes.indexOf(document.activeElement as HTMLElement);
    nodes[e.key==='Home'?0:e.key==='End'?nodes.length-1:(n+(e.key==='ArrowUp'||e.key==='ArrowLeft'?-1:1)+nodes.length)%nodes.length].focus();
  }})}>{children}</div>;
  return <FloatingPortal>{content}</FloatingPortal>;
}
