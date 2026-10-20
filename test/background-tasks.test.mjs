import test from "node:test";
import assert from "node:assert/strict";
import { applyBackgroundUpdate } from "../shared/background-tasks.mjs";

test("both ACP task identifier spellings settle the existing background task", () => {
  for (const idKey of ["task_id", "taskId"]) {
    const running = applyBackgroundUpdate([], {
      sessionUpdate: "task_backgrounded",
      [idKey]: "build-1",
      description: "Build app",
    });
    assert.equal(running[0].status, "running");
    const completed = applyBackgroundUpdate(running, {
      sessionUpdate: "task_completed",
      [idKey]: "build-1",
    });
    assert.equal(completed.length, 1);
    assert.equal(completed[0].status, "completed");
    assert.equal(completed[0].title, "Build app");
    assert.ok(completed[0].endedAt >= completed[0].startedAt);
  }
});
