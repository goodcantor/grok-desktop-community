# Developer guide

Start with [the architecture map](ARCHITECTURE.md). Project constraints and maintainer instructions are in [AGENTS.md](../AGENTS.md). Use [README.md](../README.md#build-from-source) for the supported environment and build/package commands; this guide does not duplicate installation instructions.

## Working on a feature

Trace the complete path before editing:

```text
component → feature hook → DesktopBridge type → preload method
          → IPC handler → session/CLI/service → result/event → renderer
```

Keep UI state close to the feature. `App.tsx` composes controllers and passes callbacks; it should not accumulate another implementation of history paging, authentication or compaction. Do not move state into a global store just to avoid props. Explicit callbacks make ownership and side effects visible.

For pure derivations used in several processes, add or extend a focused `shared/` module. For Electron services, expose a small registration function that accepts its actual platform dependencies. Pure modules and IPC registrations can then be tested without launching Electron.

## Changing the preload API

1. Add or update the domain contract in `src/types/`.
2. Update `DesktopBridge` in `src/types/bridge.ts`.
3. Implement the narrow method in `electron/preload.cjs`. Do not expose `ipcRenderer`, `fs` or an arbitrary command evaluator.
4. Register the handler in its owning service or `electron/ipc/` module and wire registration from main.
5. Validate arguments and derive the owner from the IPC event. Do not trust a renderer-supplied window ID or a filesystem path merely because it came from the UI.
6. Update `scripts/qa-bridge.mjs` when browser interaction checks need the new method.

Changing the bridge requires a full Electron restart. Vite hot reload updates renderer code only; it does not replace main, preload, workers or an existing agent process. An installed executable continues to run its packaged sources until rebuilt and installed.

## Session and request lifecycle

Before applying a delayed response, verify that it still belongs to the active session/request. Clear request ownership when leaving a feature, replacing a session or shutting down. A stale failure needs the same guard as a stale success.

Use the existing delivery controller for queued messages and interjections. Do not append a queued item to the delivered transcript before the engine accepts it. Preserve the draft, queue pause state and dirty-file protections on cancellation, connection failure and navigation.

Use `createWorkerClient` for request/reply workers that follow the existing `{id, method, args}` / `{id, result|error}` protocol. Workers may send progress events separately. Worker computation remains responsible for its own serialization and cache policy; the client only owns transport lifecycle.

Do not infer an MCP connection from a successful CLI configuration listing. Configuration, live connection, folder trust and OAuth are different states. The MCP page orchestrates operations; its `mcp/` modules own form state and presentation. Secret names may be displayed, but stored secret values must not be loaded into the form.

## UI changes

Use the existing local Button, Badge and Disclosure components. Disclosures use Radix behavior; anchored menus use Floating UI; icons use Lucide. The project has no complete shadcn migration. Extend the existing primitives when needed rather than introducing a second component system for one control.

Use semantic theme variables from `shared/theme-palette.css`. Keep background fills for surfaces that benefit from a visual boundary. Small task/status controls should use transparent rows and compact badges. Do not achieve compactness by hiding Stop, approval waits or keyboard focus.

Keep these cases working:

- Empty and multiline input, automatic growth, manual resize and saved drafts.
- Active response, tool execution, approvals, compaction, stopped/failed response.
- Goal pause/resume/clear with confirmation from the engine.
- Reading older messages while live status stays visible.
- Queue editing, reordering, paused restoration and keyboard operation.
- Narrow windows, high zoom, terminal open and both themes.

## Verification

Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:native`. The native shell check uses an isolated synthetic GROK_HOME and controlled ACP boundary with real Electron, PTY and browser surfaces. Use `GROK_AUDIT_DPI=1.25`, `1.5`, or `2` for device scale geometry runs.

`npm run pack -- --publish never` creates a development package. Windows uses the upstream node-pty Node-API prebuilds; it skips an unnecessary rebuild requiring extra Visual Studio Spectre libraries. Other platforms retain native rebuilding. macOS development packaging without signing uses explicit `-c.mac.identity=null -c.mac.notarize=false`; it is never a public release.

`npm run test:package` checks the packaged shell with a synthetic native home and a deliberately missing CLI: private data stays untouched, no model requests occur, and real file/PTY/browser operations exercise ASAR packaging and renderer isolation. `GROK_COMMUNITY_TEST_EXE` selects an explicit executable.

`node scripts/official-cli-smoke.mjs --prompt` is an explicitly invoked real CLI acceptance check. It creates native QA conversations, sends one bounded model prompt, and may incur account usage. It never runs in PR CI. Review the script first, use your own authorized account, and keep diagnostics private. `GROK_CUSTOM_TEST_EXE` selects the native executable in this predecessor-compatible helper.

Release instructions are in AGENTS.md and docs/SIGNING.md. All target acceptance must be genuine; fixture results cannot substitute for official-CLI or signed update acceptance.

## QA data and diagnostics

Write private artifacts to ignored qa/. Do not publish raw caches, tokens, full conversations or real auth files. Use synthetic homes for automated checks. Never close a user's working application to make a test pass. Historical version-specific smoke scripts are retained as predecessor references; the commands above are the maintained Community entry points.

## Known build advisories

High/critical audit findings are a CI failure. Eight moderate findings currently remain in the build-only electron-builder → @electron/get → global-agent → roarr → sprintf-js chain; they are not packaged production dependencies. Avoid downgrading the builder solely to silence this report. The full dependency graph is still audited because Electron is listed as a development dependency but ships as the runtime.
