import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";
import { installMockBridge } from "./qa-bridge.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
const errors = [],
  checks = {};
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(installMockBridge);
try {
  await page.goto(process.env.GROK_DESKTOP_DEV_URL || "http://127.0.0.1:5180");
  await page.locator(".topbar-connection .online").waitFor();
  await page.evaluate(async () => {
    const React = (await import("/node_modules/.vite/deps/react.js")).default;
    const { createRoot } = (
      await import("/node_modules/.vite/deps/react-dom_client.js")
    ).default;
    const { useHistoryReader } = await import("/src/hooks/useHistoryReader.ts");
    const { useConversationCompaction } = await import(
      "/src/hooks/useConversationCompaction.ts"
    );
    const node = document.createElement("div");
    document.body.append(node);
    window.__hookPending = [];
    window.__hookErrors = [];
    window.__hookMessages = [];
    window.grokDesktop.historyWindow = (args) =>
      new Promise((resolve, reject) =>
        window.__hookPending.push({ kind: "history", args, resolve, reject }),
      );
    window.grokDesktop.compact = () =>
      new Promise((resolve, reject) =>
        window.__hookPending.push({ kind: "compact", resolve, reject }),
      );
    function Fixture() {
      const [sessionId, setSessionId] = React.useState("one");
      const sessionIdRef = React.useRef(sessionId);
      sessionIdRef.current = sessionId;
      const timelineRef = React.useRef(null),
        openingRef = React.useRef(false);
      const compaction = useConversationCompaction({
        project: "project",
        sessionId,
        sessionIdRef,
        openingRef,
        conn: "online",
        lastContextTokens: 70000,
        autoCompactAt: "64k",
        appendSystem: (text) => window.__hookMessages.push(text),
        setError: (error) => window.__hookErrors.push(error),
      });
      const history = useHistoryReader({
        project: "project",
        sessionId,
        conn: "online",
        timelineRef,
        canNavigate: () => true,
        confirmDiscardFiles: () => true,
        setError: (error) => window.__hookErrors.push(error),
        openProject: async () => {
          history.clearHistory();
          return true;
        },
      });
      window.__hooks = { history, compaction, setSessionId, sessionId };
      return React.createElement(
        "pre",
        { id: "refactor-fixture" },
        JSON.stringify({
          busy: history.historyBusy,
          page: history.historyPage?.start,
          compacting: compaction.compacting,
          sessionId,
        }),
      );
    }
    window.__fixtureRoot = createRoot(node);
    window.__fixtureRoot.render(
      React.createElement(React.StrictMode, null, React.createElement(Fixture)),
    );
  });
  await page.locator("#refactor-fixture").waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        window.__hookPending.filter((item) => item.kind === "compact").length,
    ),
    1,
    "StrictMode must not duplicate auto-compaction",
  );
  await page.evaluate(() => {
    void window.__hooks.history.pageHistory(10);
    void window.__hooks.history.pageHistory(20);
    const pending = window.__hookPending.filter(
      (item) => item.kind === "history",
    );
    pending[1].resolve({
      items: [],
      start: 20,
      end: 30,
      total: 100,
      focusOrdinal: null,
    });
  });
  await page.waitForFunction(
    () => window.__hooks.history.historyPage?.start === 20,
  );
  await page.evaluate(() =>
    window.__hookPending
      .find((item) => item.kind === "history")
      .resolve({
        items: [],
        start: 10,
        end: 20,
        total: 100,
        focusOrdinal: null,
      }),
  );
  assert.equal(
    await page.evaluate(() => window.__hooks.history.historyPage.start),
    20,
  );
  await page.evaluate(() => {
    void window.__hooks.history.pageHistory(30);
    window.__hooks.history.clearHistory();
    window.__hookPending.at(-1).reject(Error("obsolete page failure"));
  });
  await page.waitForFunction(
    () =>
      window.__hooks.history.historyPage === null &&
      !window.__hooks.history.historyBusy,
  );
  checks.obsoleteHistoryResponsesIgnored = true;

  await page.evaluate(() => window.__hooks.setSessionId("two"));
  await page.waitForFunction(
    () =>
      window.__hooks.sessionId === "two" &&
      window.__hooks.compaction.compacting,
  );
  await page.evaluate(() =>
    window.__hookPending
      .find((item) => item.kind === "compact")
      .reject(Error("obsolete compact failure")),
  );
  assert.equal(
    await page.evaluate(() => window.__hooks.compaction.compactingRef.current),
    true,
    "old request must not unlock the new session",
  );
  const count = await page.evaluate(
    () => window.__hookPending.filter((item) => item.kind === "compact").length,
  );
  assert.equal(
    await page.evaluate(() => window.__hooks.compaction.runCompress()),
    false,
  );
  assert.equal(
    await page.evaluate(
      () =>
        window.__hookPending.filter((item) => item.kind === "compact").length,
    ),
    count,
  );
  await page.evaluate(() =>
    window.__hookPending
      .filter((item) => item.kind === "compact")
      .at(-1)
      .resolve({ ok: true, tokens_after: 30000 }),
  );
  await page.waitForFunction(() => !window.__hooks.compaction.compacting);
  assert.deepEqual(await page.evaluate(() => window.__hookErrors), []);
  checks.compactionSessionIsolation = true;
  checks.strictModeSingleCompaction = true;
  checks.compactionNoOverlap = true;
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.__fixtureRoot.unmount());
  fs.writeFileSync("qa/refactor-hooks.json", JSON.stringify(checks, null, 2));
  console.log("REFACTOR_HOOKS_OK", checks);
} finally {
  await browser.close();
}
