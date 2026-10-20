/** Fit the complete emulated viewport in the available browser panel. */
export function fitPreviewViewport(width,height,spec) {
  width=Math.max(0,width);height=Math.max(0,height);
  if(!spec?.width||!spec?.height)return {width,height,scale:1};
  const scale=Math.min(1,width/spec.width,height/spec.height);
  return {width:Math.floor(spec.width*scale),height:Math.floor(spec.height*scale),scale};
}
