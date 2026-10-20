/** One draft has one execution mode. Slash prefixes never accumulate. */
export function draftIntent(input, selected = 'chat') {
  let text = String(input || '').trimStart(), mode = selected, explicit = false;
  for (;;) {
    const match = text.match(/^\/(plan|goal|chat)(?:\s+|$)/i);
    if (!match) break;
    const candidate = match[1].toLowerCase();
    const rest = text.slice(match[0].length);
    if (candidate === 'goal' && /^(status|pause|resume|clear)\s*$/i.test(rest)) break;
    mode = candidate; explicit = true; text = rest;
  }
  return {mode, text, explicit};
}

export function contextMeter(used, total) {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(used) || used < 0) return null;
  const percent = Math.min(100, Math.max(0, Math.round(used / total * 100)));
  return {used, total, percent, left: 100 - percent};
}

export function goalFromUpdate(previous, params, now=Date.now()) {
  const update = params?.update ?? params;
  const kind = update?.sessionUpdate ?? update?.session_update;
  if (kind !== 'goal_updated') return previous;
  if (update.status === 'cleared') return null;
  const value=name=>update[name]??update[name.replace(/[A-Z]/g,c=>'_'+c.toLowerCase())];
  const goalId=value('goalId');
  const changed=(goalId&&previous?.goalId&&goalId!==previous.goalId)||(update.objective&&previous?.objective&&update.objective!==previous.objective);
  const next={...(changed?{}:previous),status:String(update.status||previous?.status||'unknown'),objective:String(update.objective||previous?.objective||'')};
  for(const key of ['goalId','phase','pauseMessage','lastEvent','lastEventDetail'])if(value(key)!==undefined)next[key]=value(key)==null?null:String(value(key));
  for(const key of ['elapsedMs','tokensUsed','tokenBudget'])if(value(key)!==undefined)next[key]=Number.isFinite(value(key))&&value(key)>=0?value(key):null;
  for(const key of ['planning','verifyingCompletion'])next[key]=Boolean(value(key));
  if(value('elapsedMs')!==undefined)next.observedAt=now;
  return next;
}

export function snapshotModel(model) {
  const meta = model?._meta || {};
  const positive = n => Number.isSafeInteger(n) && n > 0;
  const contextWindow = [meta.totalContextTokens, meta.contextWindow, model.contextWindow].find(positive) || null;
  const contextWindows = [...new Set([contextWindow, ...(Array.isArray(meta.contextWindows) ? meta.contextWindows : [])].filter(positive))];
  const reasoningEfforts = (Array.isArray(meta.reasoningEfforts) ? meta.reasoningEfforts : []).map(e => ({value: String(e.id || e.value || ''), label: String(e.label || e.id || e.value || '')})).filter(e => e.value);
  return {modelId: String(model.modelId), name: String(model.name || model.modelId), description: String(model.description || ''), contextWindow, contextWindows, reasoningEfforts, supportsReasoningEffort: meta.supportsReasoningEffort !== false};
}
