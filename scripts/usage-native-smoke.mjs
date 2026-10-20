import { _electron as electron } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { usageCatalog } from '../electron/usage-core.mjs';

const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
const tag = 'custom' + version.split('custom.').at(-1);
const installed = Boolean(process.env.GROK_CUSTOM_TEST_EXE);
const profile = path.resolve(`qa/${tag}-usage-profile`);
fs.mkdirSync(profile, { recursive: true });
const userProfile = path.join(process.env.APPDATA, 'grok-desktop-custom');
const digest = file => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null;
const preferences = ['desktop-state.json', 'history-preferences.json'].map(name => path.join(userProfile, name));
const before = preferences.map(digest);
const cache = path.join(profile, 'usage-cache.json');
const historyCache = path.join(profile, 'history-index.json');
const originalCache = path.join(userProfile, 'usage-cache.json');
if (fs.existsSync(originalCache)) fs.copyFileSync(originalCache, cache);
fs.writeFileSync(path.join(profile, 'desktop-state.json'), JSON.stringify({ permissionMode: 'ask', sandboxTerminal: true, allowOutsideProject: false, uiZoom: 1 }));
const rows = usageCatalog();
const empty = rows.find(row => row.source === 'empty');
assert.ok(empty, 'native history has a fresh conversation for the regression check');
assert.ok(rows.some(row => row.turns.some(turn => turn.totalTokens > 0)));
const env = { ...process.env, GROK_DESKTOP_MULTI_INSTANCE: '1', GROK_USAGE_QA_PROFILE: profile, GROK_BINARY: path.resolve('qa/usage-check-no-agent.exe') };
delete env.ELECTRON_RUN_AS_NODE;
delete env.GROK_DESKTOP_DEV_URL;
const checks = {};
let app;
try {
  app = await electron.launch({ executablePath: process.env.GROK_CUSTOM_TEST_EXE || 'node_modules/electron/dist/electron.exe', args: installed ? [`--user-data-dir=${profile}`] : ['scripts/usage-bootstrap.cjs'], env });
  let page;
  for (let i = 0; i < 200; i++) {
    page = app.windows().find(p => p.url().endsWith('/dist/index.html'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page);
  await page.locator('#boot-splash').waitFor({ state: 'detached', timeout: 60000 });
  const info = await page.evaluate(() => window.grokDesktop.getInfo());
  assert.equal(info.version, version);
  assert.equal(path.resolve(info.userData), profile);
  const selected = await page.evaluate(row => window.grokDesktop.usageQuery({ cwd: row.cwd, sessionId: row.id }), { cwd: empty.cwd, id: empty.id });
  assert.equal(selected.requests, 0);
  assert.equal(selected.unavailable, 0);
  assert.equal(selected.partial, false);
  assert.equal(selected.totals.totalTokens, null);
  checks.freshConversationIsEmpty = true;
  const all = await page.evaluate(() => window.grokDesktop.usageQuery({ period: 'all' }));
  assert.ok(all.requests > 0);
  assert.ok(all.totals.totalTokens > 0);
  assert.ok(all.coverage.totalTokens.known > 0);
  checks.nativeUsageAvailable = true;
  assert.equal(JSON.parse(fs.readFileSync(cache, 'utf8')).version, 2);
  checks.cacheRebuilt = true;
  const repeated = await page.evaluate(() => window.grokDesktop.usageQuery({ period: 'all' }));
  assert.ok(repeated.totals.totalTokens > 0);
  checks.warmCache = true;
} finally {
  if (app) {
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
    await app.close();
  }
  for (const file of [cache, cache + '.tmp', historyCache, historyCache + '.tmp']) if (fs.existsSync(file)) fs.unlinkSync(file);
}
assert.deepEqual(preferences.map(digest), before);
checks.userPreferencesUnchanged = true;
fs.writeFileSync(`qa/${tag}-${installed ? 'installed' : 'native'}-usage.json`, JSON.stringify({ version, ...checks }, null, 2));
console.log('USAGE_NATIVE_OK', checks);
