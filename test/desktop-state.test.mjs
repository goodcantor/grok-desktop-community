import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createDesktopStateStore,
  normalizeDesktopState,
} from "../electron/desktop-state.mjs";

test("state defaults and legacy access migration preserve explicit choices and unknown UI fields", () => {
  assert.equal(
    normalizeDesktopState({ alwaysApprove: true }).permissionMode,
    "always-approve",
  );
  assert.equal(
    normalizeDesktopState({ permissionMode: "ask", alwaysApprove: true })
      .permissionMode,
    "ask",
  );
  const state = normalizeDesktopState({
    permissionMode: "auto",
    allowOutsideProject: true,
    sandboxTerminal: false,
    uiZoom: 1.25,
    theme: "light",
    worktreeSources: {},
    recentProjects: [null, "project"],
  });
  assert.equal(state.permissionMode, "auto");
  assert.equal(state.allowOutsideProject, true);
  assert.equal(state.sandboxTerminal, false);
  assert.equal(state.uiZoom, 1.25);
  assert.equal(state.theme, "light");
  assert.deepEqual(state.recentProjects, ["project"]);
  assert.equal("worktreeSources" in state, false);
  assert.equal("alwaysApprove" in state, false);
  for (const value of [null, [], "invalid"]) {
    const defaults = normalizeDesktopState(value);
    assert.equal(defaults.permissionMode, "ask");
    assert.equal(defaults.sandboxTerminal, true);
    assert.equal(defaults.allowOutsideProject, false);
  }
});

test("state reads current disk values; failed serialization preserves the previous file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "grok-state-"));
  try {
    const file = path.join(root, "profile", "desktop-state.json");
    const store = createDesktopStateStore(file);
    assert.equal(store.loadState().theme, "dark");
    store.saveState({
      theme: "light",
      permissionMode: "auto",
      customSetting: "keep",
    });
    assert.equal(store.loadState().theme, "light");
    const bad = {};
    bad.self = bad;
    assert.throws(() => store.saveState(bad), /circular/i);
    assert.equal(store.loadState().customSetting, "keep");
    assert.deepEqual(fs.readdirSync(path.dirname(file)), [
      "desktop-state.json",
    ]);
    store.rememberProjectSession("one", "s1");
    store.rememberProjectSession("two", "s2");
    store.rememberProjectSession("one", "s3");
    const state = store.loadState();
    assert.deepEqual(state.recentProjects, ["one", "two"]);
    assert.deepEqual(state.sessionsByProject, { one: "s3", two: "s2" });
    assert.equal(state.permissionMode, "auto");
    assert.equal(state.customSetting, "keep");
    fs.writeFileSync(file, "broken");
    assert.equal(store.loadState().permissionMode, "ask");
  } finally {
    const resolved = path.resolve(root);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith("grok-state-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
