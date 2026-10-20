# Architecture

Grok Desktop Custom is a Windows Electron shell around the installed Grok Build CLI. It owns windows, presentation and desktop integrations. The CLI owns agent execution, authentication, models, tools, skills and native conversations.

Read [AGENTS.md](../AGENTS.md) for project rules and [DEVELOPMENT.md](DEVELOPMENT.md) for the contributor workflow. Installation and packaging instructions are maintained in [README.md](../README.md).

## Process boundaries

```text
React renderer
  → typed window.grokDesktop bridge
  → electron/preload.cjs
  → IPC handlers in Electron main
  → execution host → selected chat record → AcpClient → grok agent stdio
                            → ACP tool terminals

Electron main → history / usage workers → native session files
              → PTY utility process → interactive terminal tabs
              → Preview window / docked browser
```

The renderer has no Node integration. Preload remains CommonJS with context isolation enabled. Main-process code and shared runtime helpers use ESM. Workers keep indexing and usage aggregation off the main thread.

## Module map

| Area | Entry points | Responsibility |
| --- | --- | --- |
| Application composition | `electron/main.mjs`, `src/App.tsx` | Startup, windows, menus, service registration and composition of UI controllers |
| Desktop preferences | `electron/desktop-state.mjs` | Defaults, legacy preference normalization, atomic writes and recent project/session pointers |
| Session lifecycle | `electron/window-session.mjs`, `src/hooks/useProjectSession.ts` | Per-window agent ownership, open/resume/restart, hydration and navigation guards |
| ACP transport | `electron/acp-client.mjs`, `shared/acp-rpc.mjs` | CLI process, JSON-RPC lifecycle, notifications, reverse requests and cancellation |
| Files and editor | `electron/ipc/project-files.mjs`, `electron/ipc/workspace-roots.mjs` | Renderer file access, Git summaries, editor selection and permitted browser roots |
| MCP and plugins | `electron/ipc/integrations.mjs`, `electron/grok-cli.mjs` | CLI-backed configuration operations and live-agent OAuth |
| Authentication UI | `src/hooks/useAuthentication.ts` | Login progress, cancellation, API-key submission and logout through the bridge |
| Display preferences | `src/hooks/useAppPreferences.ts` | Hydration, display settings and persistence callbacks; access controls remain in `useAgentSafety` |
| Model selection | `src/hooks/useSessionModel.ts` | Live model metadata and asynchronous model changes scoped to the current session |
| Compaction | `src/hooks/useConversationCompaction.ts` | Manual/automatic compaction, overlap prevention, failure suppression and session isolation |
| Prompt delivery | `src/hooks/usePromptDelivery.ts`, `shared/prompt-delivery.mjs` | Send, queue, steer, stop-and-send, outcomes and delivery ordering |
| Agent events | `src/hooks/useAgentEvents.ts` | Live timeline, usage, permissions, plan/ask/trust gates and background tasks |
| History | `electron/history-service.mjs`, `electron/history-worker.mjs`, `src/hooks/useHistoryReader.ts` | Catalog/search IPC, disposable index, historical windows and reading bookmarks |
| Usage | `electron/usage-service.mjs`, `electron/usage-worker.mjs` | Usage aggregation and cached billing requests |
| Worker transport | `electron/worker-client.mjs` | Lazy worker creation, correlated replies, progress, failure recovery and shutdown |
| Local unsent queue | `electron/queue-store.mjs` | Window queue snapshots, independent from delivered conversation history |
| Composer activity | `components/ChatActivity.tsx`, `components/GoalSummary.tsx`, `hooks/useRunActivity.ts` | Compact live status, expandable task details, goal controls, timers and native diagnostics |
| MCP settings | `components/settings/McpPage.tsx`, `components/settings/mcp/` | Page orchestration, form state, form presentation, diagnostic view model and test report presentation |

Renderer paths in this table are relative to `src/` unless prefixed otherwise. Main keeps window/menu lifecycle together; this refactor does not turn the app into a framework or introduce a global state manager.

## Contracts and types

`src/types/bridge.ts` describes the public preload API. `src/vite-env.d.ts` only attaches that API to `Window` and references Vite types.

Domain contracts live in `src/types/{timeline,auth,integrations,session,app,files,drafts,history,prompt,workspace}.ts`. `src/types/desktop.ts` is their type-only export surface. Feature code should import domain contracts from this surface or their owning module, rather than from an ambient environment declaration.

`shared/` contains runtime logic that both main and renderer can consume, including timeline reduction, permission interpretation, session modes, prompt delivery rules, usage arithmetic and activity derivation. Keep these modules independent of Electron and React. A shared helper that needs Node built-ins does not belong in a renderer import path.

## Data ownership

| Data | Authority | Desktop treatment |
| --- | --- | --- |
| Auth, CLI configuration, skills and MCP/plugin configuration | Existing `GROK_HOME` / `~/.grok` and CLI commands | Delegate to CLI; do not create another credential or config store |
| Conversations and agent events | Native session directories under `~/.grok/sessions/` | Resume through ACP; read for history and usage |
| `desktop-state.json` | Custom application's Electron user-data directory | UI preferences and project/session pointers; retain unknown settings during writes |
| `history-preferences.json` | Custom user-data directory | UI-only pins, collapsed projects and archive visibility |
| `history-index.json`, `usage-cache.json` | Disposable derived caches | Rebuild from native files; never treat caches as conversations |
| Drafts and `queues/` | Custom user-data directory | Local unsent content; preserve close/navigation guards |
| `qa/` | Local verification output | Isolated test profiles, reports and screenshots; not application data |

State writes replace a temporary file atomically. State reads remain synchronous and read the current disk file, so sequential read/modify/write callers in different windows do not use a stale module cache. This is not a multi-process database; the application still relies on its normal single-instance ownership.

## Asynchronous ownership

Every asynchronous operation needs an owner: a window, a session or a specific request.

- `WindowSession` owns an agent and its pending gates. A reply must settle the requesting window's request, never a globally selected window.
- Model changes and compaction ignore results from a replaced session. Compaction also uses an operation token so an old completion cannot unlock a newer operation.
- Historical page requests use increasing tokens. Earlier results and errors cannot replace a later page or resurrect a cleared view.
- `worker-client.mjs` associates events with the worker instance that emitted them. An old worker's late `exit` cannot clear a replacement's requests. Shutdown rejects pending work immediately and cannot restart the client.
- History refresh and MiniSearch maintenance execute inside the worker's serialized operation. Do not re-enable background auto-vacuuming while incremental updates mutate the trie.

History search highlighting uses CSS Highlight ranges over existing text nodes. It does not replace React-owned nodes with `<mark>` elements.

## Access boundaries

Renderer file reads, writes, directory listings and editor/reveal actions always pass through `assertPathInProject`. The permitted family is the open project and its Git-linked worktrees. The Files root chooser exposes that family and validates selected folders.

Agent file tools and terminal working directories have a separate policy: they may additionally access the configured Grok home and validated ACP worktree family, or other paths when explicitly enabled. Tool approval mode, outside-project access and terminal sandboxing are independent settings. Do not make one imply the others.

The interactive terminal, ACP tool terminals and Preview are separate subsystems. Do not replace their ownership or cancellation rules with a generic process launcher during UI cleanup. The full policy and platform details remain in [AGENTS.md](../AGENTS.md).

## Presentation and CSS

The renderer imports styles in `src/main.tsx`:

1. `app.css`: base application and existing feature styles.
2. `shell.css`: custom shell layout and navigation.
3. `workspace.css`: workspace panels, changes and terminal surfaces.
4. `ui.css`: Button, Badge and Radix Disclosure primitives.
5. `composer.css`: editor geometry, settings menus, queue and conversation controls.
6. `usability.css`: shortcut dialog and terminal accessibility refinements.
7. `usage.css`: subscription summary, compact measurements and empty states.
8. `shared/theme-palette.css`: canonical dark/light tokens, also loaded by native splash and Preview chrome.

Composer styles previously spread across version-named override files are now in one feature stylesheet. Redundant exact declarations and obsolete composer selectors were removed without changing shorthand or conditional cascade semantics. Base legacy CSS still exists; new feature changes should update the owning stylesheet instead of adding another versioned override.

The composer uses a short single-line minimum and grows with text. Goal details, plan steps and background tasks expand on demand. Status remains visible above the editor, including while viewing older history. Keyboard hints belong in accessible descriptions, tooltips and keyboard help rather than a permanent extra row.

## Scope of this refactor

The refactor establishes explicit ownership for the most frequently changed shell, composer and integration code. It removes unused legacy sidebar/safety/activity components and the version-specific service aggregator. It does not rewrite ACP transport, the platform sandbox or Preview lifecycle merely to reduce file sizes. Those modules have substantial protocol/platform behavior and should be split only with focused behavioral coverage.


## Independent chat execution

The window facade owns selection and chrome. Each chat record owns its official GrokAcpClient, permission namespace, parked requests, connection generation, live transcript projection and ExecutionQueue. All background records remain live; global safety changes fan out to every record.

Preload captures the selected execution scope for control, file and terminal IPC. Main validates the sender window, record id, native session and generation. Client callbacks additionally check their captured agent instance. Native history can be displayed without a process; explicit engine actions connect on demand.

ExecutionQueue owns single-flight delivery, pending-message persistence, FIFO drain, pause/Stop and unsupported-Steer fallback. React mirrors only the selected queue. Selecting another chat never drains or clears the previous queue. Native conversation files remain authoritative; runtime projections and unsent desktop data are not a second delivered-history store.

Each chat uses a separate retained Preview controller. A dispatcher routes chrome by WebContents and shell operations by execution scope. MCP carries the execution id; a user-sent screenshot returns directly to that owner's main-process queue. PTY tabs carry their session id and retain scrollback while another chat is selected. Disposing a record also disposes its native views and terminals.

The conversation stylesheet owns work summaries, inline waits, response files and Activity. Shared colors remain in the canonical palette. The Harness comparison lists adopted behavior and unsupported engine features.
