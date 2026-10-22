/**
 * Disk hydrate: compact events must update lastContextTokens.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  encodeSessionCwd,
  loadSessionOpenState,
} from "../electron/sessions.mjs";

test("loadSessionOpenState applies auto_compact_completed to lastContextTokens", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "grok-sess-"));
  const prev = process.env.GROK_HOME;
  process.env.GROK_HOME = home;
  try {
    const cwd = path.join(home, "proj");
    const sessionId = "sess-compact-1";
    const dir = path.join(home, "sessions", encodeSessionCwd(cwd), sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "updates.jsonl"),
      [
        JSON.stringify({
          params: {
            update: {
              sessionUpdate: "turn_completed",
              usage: { totalTokens: 80_000 },
            },
          },
        }),
        JSON.stringify({
          method: "_x.ai/session/update",
          params: {
            update: {
              sessionUpdate: "auto_compact_completed",
              tokens_before: 80_000,
              tokens_after: 22_000,
            },
          },
        }),
      ].join("\n"),
    );
    const { usage } = loadSessionOpenState(cwd, sessionId);
    assert.equal(usage.lastContextTokens, 22_000);
    assert.equal(usage.turns, 1);
  } finally {
    if (prev === undefined) delete process.env.GROK_HOME;
    else process.env.GROK_HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test("loadSessionOpenState ctx follows stream meta, not billed turn total", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "grok-sess-"));
  const prev = process.env.GROK_HOME;
  process.env.GROK_HOME = home;
  try {
    const cwd = path.join(home, "proj");
    const sessionId = "sess-ctx-meta-1";
    const dir = path.join(home, "sessions", encodeSessionCwd(cwd), sessionId);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "updates.jsonl"),
      [
        JSON.stringify({
          params: {
            update: { sessionUpdate: "agent_thought_chunk" },
            _meta: { totalTokens: 81_000 },
          },
        }),
        JSON.stringify({
          params: {
            update: {
              sessionUpdate: "turn_completed",
              usage: {
                inputTokens: 381_000,
                outputTokens: 1_200,
                totalTokens: 382_200,
                cachedReadTokens: 302_000,
              },
            },
          },
        }),
      ].join("\n"),
    );
    const { usage } = loadSessionOpenState(cwd, sessionId);
    assert.equal(usage.lastContextTokens, 81_000);
    assert.equal(usage.turns, 1);
    assert.equal(usage.totalTokens, 382_200);
  } finally {
    if (prev === undefined) delete process.env.GROK_HOME;
    else process.env.GROK_HOME = prev;
    fs.rmSync(home, { recursive: true, force: true });
  }
});


test('native history replay preserves goal-plan provenance across a follow-up',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'grok-goal-plan-')),previous=process.env.GROK_HOME;
 process.env.GROK_HOME=home;
 try {
  const cwd=path.join(home,'project'),id='goal-plan',dir=path.join(home,'sessions',encodeSessionCwd(cwd),id);
  fs.mkdirSync(dir,{recursive:true});
  const updates=[{sessionUpdate:'goal_updated',goalId:'g1',status:'active'}, {sessionUpdate:'plan',entries:[{content:'Finish',status:'in_progress'}]}, {sessionUpdate:'user_message_chunk',content:{type:'text',text:'Follow up'}}];
  fs.writeFileSync(path.join(dir,'updates.jsonl'),updates.map(update=>JSON.stringify({params:{update}})).join('\n'));
  const loaded=loadSessionOpenState(cwd,id);assert.equal(loaded.error,null);assert.equal(loaded.items.find(item=>item.kind==='plan').goalId,'g1');
 }finally{if(previous===undefined)delete process.env.GROK_HOME;else process.env.GROK_HOME=previous;fs.rmSync(home,{recursive:true,force:true});}
});
