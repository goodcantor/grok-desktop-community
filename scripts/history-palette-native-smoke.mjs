import { _electron as electron } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
const version = JSON.parse(fs.readFileSync("package.json", "utf8")).version,
  tag = "custom" + version.split("custom.").at(-1);
const profile = path.resolve("qa/" + tag + "-history-profile");
fs.mkdirSync(profile, { recursive: true });
const source = path.join(
    process.env.APPDATA,
    "grok-desktop-custom/history-index.json",
  ),
  cache = path.join(profile, "history-index.json");
if (fs.existsSync(source)) fs.copyFileSync(source, cache);
const env = {
  ...process.env,
  GROK_DESKTOP_MULTI_INSTANCE: "1",
  GROK_BINARY: path.resolve("qa/history-check-no-agent.exe"),
};
delete env.ELECTRON_RUN_AS_NODE;
const checks = {};
const digest = (file) =>
  fs.existsSync(file)
    ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    : null;
const preferences = path.join(
    process.env.APPDATA,
    "grok-desktop-custom/history-preferences.json",
  ),
  before = digest(preferences);
try {
  for (let launch = 0; launch < 2; launch++) {
    const app = await electron.launch({
      executablePath:
        process.env.GROK_CUSTOM_TEST_EXE ||
        "node_modules/electron/dist/electron.exe",
      args: process.env.GROK_CUSTOM_TEST_EXE
        ? [`--user-data-dir=${profile}`]
        : ["scripts/history-palette-bootstrap.cjs"],
      env,
    });
    let page;
    try {
      for (let i = 0; i < 200; i++) {
        page = app.windows().find((p) => p.url().endsWith("/dist/index.html"));
        if (page) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(page);
      await page
        .locator("#boot-splash")
        .waitFor({ state: "detached", timeout: 60000 });
      assert.equal(
        (await page.evaluate(() => window.grokDesktop.getInfo())).version,
        JSON.parse(fs.readFileSync("package.json", "utf8")).version,
      );
      const [catalog, repeated, search] = await page.evaluate(() =>
        Promise.all([
          window.grokDesktop.historyCatalog(),
          window.grokDesktop.historyCatalog(),
          window.grokDesktop.searchHistory({
            query: "historyPaletteMissingNeedle",
          }),
        ]),
      );
      assert.ok(catalog.sessions.length > 0);
      assert.equal(repeated.sessions.length, catalog.sessions.length);
      assert.equal(search.total, 0);
      const usable = catalog.sessions.find((row) =>
        row.title?.match(/[\p{L}\p{N}]{3,}/u),
      );
      if (usable) {
        const token = usable.title.match(/[\p{L}\p{N}]{3,}/u)[0];
        const found = await page.evaluate(
          (query) => window.grokDesktop.searchHistory({ query }),
          token,
        );
        assert.ok(found.total > 0);
      }
      assert.equal(
        JSON.parse(fs.readFileSync(cache, "utf8")).index.dirtCount,
        0,
      );
      checks[launch ? "warmRestart" : "existingCache"] = {
        catalog: true,
        search: true,
        sessions: catalog.sessions.length,
      };
      await page.screenshot({
        path: `qa/${tag}-${process.env.GROK_CUSTOM_TEST_EXE ? "installed" : "native"}-history-${launch}.png`,
      });
    } finally {
      await app
        .evaluate(({ dialog }) => {
          dialog.showMessageBoxSync = () => 1;
        })
        .catch(() => {});
      await app.close();
    }
  }
  assert.equal(digest(preferences), before);
  checks.userPreferencesUnchanged = true;
  // The copied cache contains private indexed terms and is not a QA deliverable.
  fs.unlinkSync(cache);
  fs.writeFileSync(
    process.env.GROK_CUSTOM_TEST_EXE
      ? `qa/${tag}-installed-history.json`
      : `qa/${tag}-native.json`,
    JSON.stringify(checks, null, 2),
  );
  console.log("HISTORY_NATIVE_OK", checks);
} finally {
  // This isolated cache copy contains private indexed terms. Never retain it as a QA artifact.
  if (fs.existsSync(cache)) fs.unlinkSync(cache);
}
