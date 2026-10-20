export const ZOOM_STEPS=[0.5,0.67,0.75,0.8,0.9,1,1.1,1.25,1.5,1.75,2];
export function clampZoom(value) {const n=Number(value);return Number.isFinite(n)?Math.max(0.5,Math.min(2,n)):1;}
export function stepZoom(value,direction) {
  const current=clampZoom(value);
  return direction==='in' ? ZOOM_STEPS.find(n=>n>current+0.001)??2 : [...ZOOM_STEPS].reverse().find(n=>n<current-0.001)??0.5;
}
