import test from 'node:test';
import assert from 'node:assert/strict';
import {usageFromEvents,aggregateUsage,normalizeUsage} from '../electron/usage-core.mjs';
import {applyUsageUpdate,emptyUsage} from '../shared/usage.mjs';
test('custom8 usage deduplicates native prompt IDs and preserves unknown costs',()=>{
  const event={timestamp:1700000000,params:{sessionId:'s',_meta:{eventId:'e1'},update:{sessionUpdate:'turn_completed',prompt_id:'p1',usage:{inputTokens:100,outputTokens:10,totalTokens:110,cachedReadTokens:80,reasoningTokens:5},elapsed_ms:1200}}};
  const turns=usageFromEvents([event,event].map(JSON.stringify).join('\n'));assert.equal(turns.length,1);assert.equal(turns[0].costUsdTicks,null);assert.equal(turns[0].totalTokens,110);assert.equal(turns[0].elapsedMs,1200);
  const live=applyUsageUpdate(emptyUsage(),event.params);assert.equal(applyUsageUpdate(live,event.params).totalTokens,110);
});
test('custom8 missing or interrupted usage stays partial, never free',()=>{const rows=usageFromEvents(JSON.stringify({timestamp:1700000000,params:{update:{sessionUpdate:'turn_completed',prompt_id:'p2',stop_reason:'cancelled'}}}));assert.equal(rows[0].partial,true);assert.equal(rows[0].inputTokens,null);assert.equal(normalizeUsage({costIsPartial:true}).partial,true);});
test('custom8 scope and period aggregate without adding cache or reasoning twice',()=>{
  const now=Date.now(),a={...normalizeUsage({inputTokens:100,outputTokens:20,totalTokens:120,cachedReadTokens:90,reasoningTokens:15}),endedAt:new Date(now).toISOString(),id:'p'},b={...a,endedAt:new Date(now-20*864e5).toISOString()};
  const rows=[{cwd:process.cwd(),id:'s',title:'Chat',source:'native',turns:[a,b]},{cwd:process.cwd()+'/other',id:'s2',source:'native',turns:[a]}];
  const r=aggregateUsage(rows,{cwd:process.cwd(),period:'7d',now});assert.equal(r.requests,1);assert.equal(r.totals.totalTokens,120);assert.equal(r.totals.cachedReadTokens,90);assert.equal(aggregateUsage(rows,{request:true}).requests,1);
});
