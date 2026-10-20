import type {TimelineItem} from '../src/types/timeline';
export function technicalGroups(items:TimelineItem[]):{kind:'work'|'message';id:string;items:TimelineItem[]}[];
export function producedFiles(items:TimelineItem[],closingIndex:number):string[];
export function localFileReference(href:string|undefined,cwd:string|null):string|null;
