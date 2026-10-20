import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import fs from "node:fs";
import { installMockBridge } from "./qa-bridge.mjs";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [],
  checks = {};
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(installMockBridge);
await page.addInitScript(() => {
  const api = window.grokDesktop,
    original = api.usageQuery;
  window.__usageMode = "normal";
  window.__usageArgs = [];
  api.usageQuery = async (args) => {
    window.__usageArgs.push(args);
    if (window.__usageMode === "error")
      throw Error("Usage service unavailable");
    const data = await original(args);
    if (args.sessionId || args.period === "7d")
      return {
        ...data,
        totals: Object.fromEntries(
          Object.keys(data.totals).map((key) => [key, null]),
        ),
        turns: [],
        requests: 0,
        conversations: 1,
        unavailable: 0,
        partial: false,
      };
    return {
      ...data,
      totals: { ...data.totals, reasoningTokens: null },
      partial: true,
      unavailable: 0,
      costPartial: window.__usageMode === "partial-cost",
    };
  };
  api.usageBilling = async () => ({
    config: {
      creditUsagePercent: 46,
      currentPeriod: { end: "2026-10-23T02:11:08Z" },
    },
  });
});
try {
  await page.goto(process.env.GROK_DESKTOP_DEV_URL || "http://127.0.0.1:5180");
  await page.locator(".topbar-connection .online").waitFor();
  await page.locator("#boot-splash").waitFor({ state: "detached" });
  const open = () =>
    page
      .locator(".navigation-rail")
      .getByRole("button", { name: "Usage", exact: true })
      .click();
  await open();
  const dialog = page.getByRole("dialog", { name: "Usage", exact: true });
  await dialog
    .getByRole("heading", { name: "No usage recorded yet" })
    .waitFor();
  assert.equal(await dialog.locator(".usage-metrics").count(), 0);
  assert.equal(
    await dialog.getByText("Unavailable", { exact: true }).count(),
    0,
  );
  await dialog.getByText("46% of plan used", { exact: true }).waitFor();
  await page.screenshot({ path: "qa/usage-empty-dark.png" });
  checks.emptyConversation = true;
  await dialog.getByRole("button", { name: "View all local usage" }).click();
  await dialog.locator(".usage-metrics").waitFor();
  assert.equal(
    await dialog.getByRole("combobox", { name: "Usage scope" }).inputValue(),
    "all",
  );
  const cost = dialog
    .locator(".usage-metrics > div")
    .filter({ hasText: "Recorded model cost" })
    .locator("strong");
  assert.equal(await cost.textContent(), "$0.1200");
  checks.costSurvivesMissingOptionalFields = true;
  await page.screenshot({ path: "qa/usage-recorded.png" });
  await page.evaluate(() => {
    window.__usageMode = "partial-cost";
  });
  await dialog.getByRole("button", { name: "Refresh usage" }).click();
  await cost.getByText("≥ $0.1200", { exact: true }).waitFor();
  checks.partialCostIsExplicit = true;
  await dialog
    .getByRole("combobox", { name: "Usage period" })
    .selectOption("7d");
  await dialog
    .getByRole("heading", { name: "No usage recorded in this period" })
    .waitFor();
  checks.emptyPeriod = true;
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const input = page.getByRole("textbox", { name: "Message", exact: true });
  await input.fill("simulate-long");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Stop", exact: true }).waitFor();
  await open();
  await dialog
    .getByRole("combobox", { name: "Usage scope" })
    .selectOption("conversation");
  await dialog
    .getByRole("combobox", { name: "Usage period" })
    .selectOption("all");
  await dialog.getByRole("heading", { name: "Usage is pending" }).waitFor();
  checks.pendingResponse = true;
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page
    .getByRole("button", { name: "Stop", exact: true })
    .waitFor({ state: "hidden" });
  await open();
  await dialog
    .getByRole("heading", { name: "No usage recorded yet" })
    .waitFor();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "qa/usage-empty-light.png" });
  for (const width of [640, 400]) {
    await page.setViewportSize({ width, height: 650 });
    const bounds = await dialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert.equal(
      await dialog.evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
  }
  checks.narrowAndLight = true;
  await page.evaluate(() => {
    window.__usageMode = "error";
  });
  await dialog.getByRole("button", { name: "Refresh usage" }).click();
  await dialog
    .getByRole("alert")
    .getByText(/Usage service unavailable/)
    .waitFor();
  checks.errorMessage = true;
  assert.deepEqual(errors, []);
  fs.writeFileSync("qa/usage-ui.json", JSON.stringify(checks, null, 2));
  console.log("USAGE_UI_OK", checks);
} finally {
  await browser.close();
}
