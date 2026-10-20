import test from 'node:test';
import assert from 'node:assert/strict';
import { technicalGroups, producedFiles, localFileReference } from '../shared/conversation-view.mjs';
import { applySessionUpdate } from '../shared/session-timeline.mjs';
import { previewMcpHttpServers } from '../electron/preview-mcp-tools.mjs';
test('successful observed mutations produce files; inferred completion, reads and failures do not',()=>{
  const history=[{kind:'user',id:'u'},{kind:'tool',status:'completed',toolKind:'edit',locations:[{path:'a.txt'}],completionObserved:true},{kind:'tool',status:'completed',toolKind:'read',locations:[{path:'read.txt'}],completionObserved:true},{kind:'tool',status:'completed',toolKind:'edit',locations:[{path:'unknown.txt'}]},{kind:'tool',status:'failed',toolKind:'edit',locations:[{path:'failed.txt'}],completionObserved:true},{kind:'assistant',id:'a'}];
  assert.deepEqual(producedFiles(history,5),['a.txt']);
  history.push({kind:'user'},{kind:'assistant'});assert.deepEqual(producedFiles(history,7),[]);
});
test('tool provenance survives updates and native-history replay uses the same reducer',()=>{
  let history=[];history=applySessionUpdate(history,{update:{sessionUpdate:'tool_call',toolCallId:'t',kind:'edit',locations:[{path:'out.md'}],rawInput:{path:'out.md'}}});
  history=applySessionUpdate(history,{update:{sessionUpdate:'tool_call_update',toolCallId:'t',status:'completed'}});
  assert.equal(history[0].toolKind,'edit');assert.equal(history[0].completionObserved,true);assert.deepEqual(history[0].locations,[{path:'out.md'}]);
});
test('intermediate assistant commentary does not duplicate the response file tail',()=>{
  const items=[{kind:'user'},{kind:'tool',status:'completed',toolKind:'edit',completionObserved:true,locations:[{path:'a'}]},{kind:'assistant'},{kind:'tool',status:'completed',toolKind:'edit',completionObserved:true,locations:[{path:'b'}]},{kind:'assistant'}];
  assert.deepEqual(producedFiles(items,2),[]);assert.deepEqual(producedFiles(items,4),['a','b']);
});
test('technical groups retain order, identities and visible message boundaries',()=>{
  const items=[{id:'u',kind:'user'},{id:'t',kind:'thought'},{id:'tool',kind:'tool'},{id:'a',kind:'assistant'},{id:'q',kind:'user',queued:true}];
  const result=technicalGroups(items);assert.equal(result.length,3);assert.deepEqual(result[1].items,items.slice(1,3));
});
test('local references resolve before the existing IPC path gate; protocols and malformed encodings reject',()=>{
  assert.equal(localFileReference('src/main.ts:12','C:\\Project'),'C:\\Project/src/main.ts');
  assert.equal(localFileReference('file:///C:/Project/a%20b.txt#L3','C:\\Project'),'C:/Project/a b.txt');
  assert.equal(localFileReference('javascript:alert(1)','C:\\Project'),null);
  assert.equal(localFileReference('https://example.com','C:\\Project'),null);
  assert.equal(localFileReference('%ZZ','C:\\Project'),null);
  // Outside targets remain available to the realpath-aware project gate, never opened directly.
  assert.equal(localFileReference('../outside.txt','C:\\Project'),'C:\\Project/../outside.txt');
});
test('Preview MCP addresses both window and execution owner',()=>{
  const [server]=previewMcpHttpServers({url:'http://127.0.0.1:1234',token:'test'},7,'record-a',4);
  assert.ok(server.headers.some(row=>row.name==='X-Grok-Desktop-Execution'&&row.value==='record-a'));
  assert.ok(server.headers.some(row=>row.name==='X-Grok-Desktop-Window'&&row.value==='7'));
  assert.ok(server.headers.some(row=>row.name==='X-Grok-Desktop-Generation'&&row.value==='4'));
});
