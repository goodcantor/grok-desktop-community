import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";
import { installMockBridge } from "./qa-bridge.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = {};
try {
  for (const [label, url] of [
    ["before", process.env.GROK_BASELINE_URL],
    ["after", process.env.GROK_DESKTOP_DEV_URL || "http://127.0.0.1:5180"],
  ]) {
    if (!url) continue;
    const page = await browser.newPage({
      viewport: { width: 1042, height: 650 },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(installMockBridge);
    await page.goto(url);
    await page.locator(".topbar-connection .online").waitFor();
    await page.locator("#boot-splash").waitFor({ state: "detached" });
    await page.evaluate(() => {
      window.__qaEmit("agent:session-update", {
        sessionId: "session-atlas-001",
        update: {
          sessionUpdate: "task_backgrounded",
          taskId: "compact-task",
          description: "Watch the renderer",
        },
      });
      window.__qaEmit("agent:session-update", {
        sessionId: "session-atlas-001",
        update: { sessionUpdate: "task_completed", taskId: "compact-task" },
      });
    });
    await page.locator(".activity-tasks").waitFor();
    report[label] = await page.locator(".main > .composer").evaluate((el) => ({
      composerHeight: el.getBoundingClientRect().height,
      controlsHeight: el
        .querySelector(".composer-context")
        .getBoundingClientRect().height,
      taskHeight: el.querySelector(".activity-tasks").getBoundingClientRect()
        .height,
      taskBackground: getComputedStyle(el.querySelector(".activity-tasks"))
        .backgroundColor,
      textareaHeight: el.querySelector("textarea").getBoundingClientRect()
        .height,
    }));
    await page.screenshot({ path: `qa/refactor-composer-${label}.png` });
    if (label === "after") {
      assert.ok(
        report.after.composerHeight < 165,
        "compact idle composer with task chip",
      );
      assert.ok(report.after.taskHeight <= 28);
      assert.equal(report.after.taskBackground, "rgba(0, 0, 0, 0)");
      assert.equal(await page.locator(".composer-keyboard-hint").count(), 0);
      await page.locator(".activity-tasks > button").focus();
      await page.keyboard.press("Enter");
      await page.getByRole("list", { name: "Background tasks" }).waitFor();
      await page.keyboard.press("Space");
      const input = page.getByRole("textbox", { name: "Message", exact: true });
      await input.fill("One\nTwo\nThree\nFour\nFive");
      assert.ok(
        (await input.boundingBox()).height > report.after.textareaHeight,
      );
      await input.fill("");
      await page.evaluate(() => {
        document.documentElement.dataset.theme = "light";
      });
      await page.waitForTimeout(200); // Finish the existing color transition before visual capture.
      await page.screenshot({ path: "qa/refactor-composer-light.png" });
      for (const [width, height] of [
        [800, 650],
        [640, 500],
        [400, 450],
      ]) {
        await page.setViewportSize({ width, height });
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve)),
            ),
        );
        const box = await input.boundingBox();
        assert.ok(
          box.x >= 0 &&
            box.x + box.width <= width + 1 &&
            box.y + box.height <= height,
        );
      }
      report.detailsKeyboardAccessible = true;
      report.multilineGrowth = true;
      report.smallWindows = true;
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  if (report.before) {
    report.heightReduction = Math.round(
      report.before.composerHeight - report.after.composerHeight,
    );
    assert.ok(report.heightReduction >= 55);
  }
  fs.writeFileSync(
    "qa/refactor-composer.json",
    JSON.stringify(report, null, 2),
  );
  console.log("COMPACT_COMPOSER_OK", report);
} finally {
  await browser.close();
}
