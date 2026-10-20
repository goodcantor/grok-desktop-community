/** Pure projections shared by live and restored history. Never write native session files. */
export function technicalGroups(items) {
  const result=[];
  for(const item of items) {
    if(item.kind==='user'&&item.queued)continue;
    if(item.kind==='thought'||item.kind==='tool') {
      const previous=result.at(-1);
      if(previous?.kind==='work')previous.items.push(item);
      else result.push({kind:'work',id:item.id,items:[item]});
    }else result.push({kind:'message',id:item.id,items:[item]});
  }
  return result;
}

export function producedFiles(items, closingIndex) {
  const closing=items[closingIndex];
  if(closing?.kind!=='assistant')return [];
  const later=items.slice(closingIndex+1).find(item=>!(item.kind==='user'&&item.interjectionId));
  if(later&&later.kind!=='user')return [];
  let start=closingIndex;
  while(start>0){start--;if(items[start].kind==='user'&&!items[start].interjectionId)break;}
  const paths=new Map();
  for(const item of items.slice(start,closingIndex)) {
    if(item.kind!=='tool'||item.status!=='completed'||!item.completionObserved)continue;
    if(!['edit','write','create','search_replace'].includes(item.toolKind))continue;
    const candidates=(item.locations||[]).map(location=>location.path).filter(Boolean);
    if(!candidates.length){const raw=item.raw||{};const path=raw.path||raw.file_path||raw.target_file;if(typeof path==='string')candidates.push(path);}
    for(const path of candidates)if(typeof path==='string')paths.set(path.replace(/\\/g,'/').toLowerCase(),path);
  }
  return [...paths.values()];
}

export function localFileReference(href, cwd) {
  if(typeof href!=='string'||!href||!cwd||href.startsWith('#')||href.includes('\0'))return null;
  let path=href;
  try { path=decodeURIComponent(path); } catch { return null; }
  if(/^file:\/\//i.test(path)) {try{const url=new URL(path);if(url.hostname&&url.hostname!=='localhost')return null;path=decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/,'$1');}catch{return null;}}
  else if(/^[a-z][a-z0-9+.-]*:/i.test(path)&&! /^[a-z]:[/\\]/i.test(path))return null;
  path=path.replace(/#L?\d+(?:C\d+)?$/,'').replace(/:\d+(?::\d+)?$/,'');
  if(!path||/[\0\r\n]/.test(path))return null;
  if(!/^(?:[a-z]:[/\\]|[/\\])/i.test(path))path=cwd.replace(/[/\\]$/,'')+'/'+path;
  return path;
}
