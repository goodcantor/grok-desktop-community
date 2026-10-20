# Historical Custom development notes

These are archived notes for the personal predecessor, not Community installation instructions. Local paths and aliases are not provided by Community.

# Grok Desktop Custom

A personal Windows build based on [liaan/grok-desktop v1.4.7](https://github.com/liaan/grok-desktop/releases/tag/v1.4.7), with an English, monochrome chat interface.

## What changed

- Chat opens automatically in `~/Grok` and resumes the latest general conversation. No project setup is required; General chat returns here from any project.
- Settings live in the composer: model, advertised reasoning levels, approvals, outside-workspace access and terminal sandbox. The + menu adds files/folders, images and explicit commands/skills. Chat / Plan / Goal has its own visible selector.
- Chat / Plan / Goal are mutually exclusive modes with one visible selected mode. Switching modes preserves the draft. Plan pauses an active goal; starting or resuming a goal leaves plan mode. Follow-ups do not recreate an active goal.
- The textarea grows with its contents and can also be resized. Context is shown as a ring with a used/remaining tooltip and a context popover. Selectable sizes come from the model catalog; the live capacity and occupancy come from the engine control plane. On the installed engine, 256k and 500k are available and persist per session. Unknown capacity stays unknown.
- File/folder references keep the existing filesystem permission rules. Images are submitted through the existing image pipeline.
- `/plan` enters the native planning mode; `/chat` returns to regular chat. `/goal <objective>` and `/goal status|pause|resume|clear` go to the official engine. `/model <id>` and `/effort low|medium|high|xhigh` use the same APIs as the selectors. `/new`, `/compact` and `/preview` remain available.
- For files elsewhere on the PC, choose that folder through Open project, or configure outside-workspace access under Settings → Access → Permissions.
- A focused chat layout, dark and light themes, on-demand Files / Changes / Browser panels.
- One sidebar for all local projects, pinned chats and collapsible project groups.
- Ctrl+K searches conversation titles and every user/assistant message, including old messages and code. Results open at the matching message with highlighting and history navigation.
- Local, incremental MiniSearch indexing in a worker. The cache can be rebuilt; the native ~/.grok/sessions history is the only source of truth.
- Fixed an upstream deferred-React-state issue where permission buttons could remove a request without replying to the agent. Both single and batch approvals are covered by the UI smoke check.

## Custom.4 interaction update

- The editor stays editable during connection, mode changes and image encoding. Startup shows an editor immediately; slow or failed connections offer explicit retry/restart controls.
- Anchored nonmodal menus use an 8 CSS px gap, viewport collision handling, keyboard navigation and outside-click focus. Compact container layouts work at high zoom and narrow widths.
- Text, file references and pasted images persist as unsent local drafts. A newer draft cannot be cleared by an older submission; source history remains the native Grok store.
- Queue follow-ups can be edited, moved or removed. Delivery options distinguish Queue, Steer and Stop and send. Empty Enter does nothing. Failed messages offer Restore text.
- Reasoning changes affect the calling session; Settings → Models controls the default for new chats and engine sessions.
- History supports UI-only archive/restore and Markdown export. Search has project filters and conversation groups; Ctrl+F searches the entire current chat. Ctrl+Shift+P opens actions and explicit slash commands; Ctrl+N starts a chat in the current folder.
- Files and Changes have separate buttons; panel size/tab are remembered, unsaved file edits remain protected. Reading positions are remembered and Jump to latest appears when reading older messages.
- Settings include Appearance, Chat, Models, Access, Extensions and Diagnostics, with search and a redacted connection report.

## Custom.5 runtime reliability update

- Removed the shell's fixed 30-minute deadline for `session/prompt`. The official agent owns turn completion; pending requests survive long goals and permission waits, and still reject on engine exit/disposal. Control RPC deadlines remain bounded.
- Refuse overlapping prompts in the same agent while keeping Steer, Stop and control calls available. Diagnostics include actual model/effort, prompt state, last activity and approval counts without conversation content.
- Long tasks and five minutes without events show an informative status. Stop without an engine acknowledgement offers an explicit restart after 15 seconds; no prompt is replayed automatically. An early Stop is repeated once if subsequent work starts.
- Windows native executables are spawned directly with their original argv. This fixes `node -e`, `python -c`, Git messages and similar arguments losing embedded quotes through `cmd.exe`. Batch shims retain their existing shell handling.
- Desktop is an ACP client of the official CLI, not a feature-identical TUI. Terminal hosting, permission UI, Preview MCP and local queue behaviour belong to Desktop. In custom.5 a tool shell retained a separate 15-minute deadline; custom.6 changes that policy as described below. Native engine cancellation and service errors can still delay completion.

## Custom.6 browser and interaction audit

- Browser opens beside the chat, with address/history controls, Fluid/Desktop/Tablet/Mobile viewports, text Snapshot, Network inspection and explicit Send screenshot. Switching to Files or Changes keeps the live page and form values. Dialogs and popovers correctly cover the native browser views; the right panel has an explicit close button and becomes an overlay in narrow windows.
- Ctrl+wheel and Ctrl+plus/minus/0 adjust and reset interface zoom; a footer control shows the percentage. Interface zoom survives restart. Browser page zoom is independent, and Ctrl+L focuses its address field. Native bounds track UI zoom, resizing and Windows DPI.
- Unsaved file edits survive panel switches and same-project chat changes. Closing a dirty window asks whether to keep editing. File context menus now share the anchored, keyboard-accessible popup component. Theme controls have proper accessible names.
- Fixed packed/split Bash commands and executable paths containing spaces, including PowerShell under Program Files. Native executables preserve argv and embedded quotes; multiline commands still use temporary scripts.
- Host tool processes no longer have a Desktop-imposed duration limit, allowing long builds and local servers. Stop/disposal still cleans up processes. Docker and WSL-bwrap retain the historical 15-minute safety timeout. An explicit `GROK_DESKTOP_TERMINAL_TIMEOUT_MS` overrides either policy (`0` disables the limit). This is independent of the removed 30-minute ACP prompt deadline.
- Browser cookies use the existing isolated `persist:grok-desktop-preview` partition. Grok authorization, history, permissions, skills and engine updates remain shared and unchanged.

## Custom.7 conversation activity

- A compact workspace header groups Files / Changes / Browser and highlights the open panel. Connection health stays separate from request progress.
- Current response activity lives inside the transcript: Starting, Thinking, Writing, Running a tool, Waiting for permission/answer and Stopping. The elapsed clock uses the actual pending ACP request; tool names come from observed tool calls. Silence is reported as silence, never fake completion or a model progress percentage. Soft recovery controls remain available.
- The goal card displays the native objective, phase, elapsed time, token count/budget and pause reason. Its live time estimate stops when paused. Pause during a response is explicitly Stop & pause; commands wait for engine confirmation, and clearing requires confirmation.
- Next up is the single unsent queue, with waiting times, editing, reordering, removal and a pause/resume control. Stop and failed requests pause the queue; editing also pauses it and must finish before resuming. Queued messages only appear in the transcript when delivered, in the correct chronological position. Unsent queue data remains in its window; switching chats or closing prompts before discarding it. Sent history and saved drafts are unaffected.
- The transcript records the last response outcome and duration, including a stopped or failed request. Reading older messages continues to preserve scroll position.
- Text typed during New chat connection transfers into that new chat, using the existing pending-draft migration instead of leaving it in the previous session.

## Custom.9 task controls and UI audit

- Current activity is always above the message field, including while reading older history: real tool activity, thinking/writing, compaction, approval waits, Stop and response outcome/duration.
- Goal, plan steps, background tasks and the queue share bounded space above the editor. The editor and current activity stay outside that scrolling area. Plans use the same Lucide step indicators in the transcript and dock.
- Radix Collapsible powers keyboard-accessible disclosures and the queue; shared Button / Badge / Disclosure components establish the next component layer alongside existing Floating UI menus. This is incremental adoption, not a complete shadcn migration.
- Fixed Steer resetting tool activity, plan updates overwriting earlier requests, early/live goal events being lost to runtime polling, and restored queues disappearing on chat navigation.
- Interface migration preserves access preferences. Always approve describes tool approvals without implying unrestricted filesystem access. Updated transitive js-yaml; production npm audit reports zero known vulnerabilities.
- Review changes opens Changes after a completed response. Composer actions use Lucide icons with visible focus states and concise keyboard hints.

The competitor comparison, decisions and remaining priorities are in [the UI audit](docs/UX-AUDIT-2026-10-18.md).

## Custom.10 usability and alerts

- Background notifications for completed/failed responses and requests that need input. Settings → Chat controls notifications and optional sound. Alerts exclude message/command content, respect Privacy mode and return to their owning window without approving anything. Windows Do not disturb may suppress delivery.
- Ctrl+N starts a chat; Ctrl+Shift+N opens a window. Ctrl+/ opens searchable keyboard help, also available in Settings and the command palette. The palette includes Terminal, Compress, Usage and Focus message input.
- Manual Compress shows its state above the editor and blocks overlapping sends while preserving your draft.
- Terminal tabs and resize support the keyboard; shell selection falls back to an installed shell, empty terminals can be restarted, theme changes preserve scrollback, and the editor/terminal fit small windows at high zoom.
- All 586 unit checks now pass on Windows with no skips. Previously failing cross-platform fixtures, editor path handling and outdated assertions were corrected without dropping coverage.

See [the follow-up usability audit](docs/USABILITY-AUDIT-2026-10-18.md) for Reddit sources, verification details and remaining limitations.

## Custom.11 history recovery and palette

- Fixed history catalog/search worker crashes (`Cannot read properties of undefined (reading 'keys')`) caused by automatic MiniSearch vacuuming overlapping incremental updates. Maintenance now runs within the serialized worker operation; old caches remain compatible, invalid references rebuild from native history, and disposable-cache write errors do not hide chats.
- Worker exit/error handling cannot invalidate a newly started worker. Native conversations, UI pins and archive preferences remain separate from the disposable search cache.
- The shell, native startup splash, reload overlay and Preview chrome share `shared/theme-palette.css`. Removed legacy purple accents and checked dark/light text and state contrast.
- All 588 unit checks pass. Additional checks: `node scripts/palette-ui-smoke.mjs` (renderer server required) and `node scripts/history-palette-native-smoke.mjs` (isolated Electron profile, copy of the existing cache, no agent execution). Reports are under `qa/custom11-*`; private index copies are removed after the checks.

## Custom.12 code organization and compact controls

- Split authentication, display preferences, model selection, compaction, historical reading and run diagnostics into feature hooks. `App.tsx` composes those controllers. MCP form state, form UI and diagnostic presentation have their own modules.
- Extracted desktop-state persistence and file/integration IPC registrations from main. History and usage share a tested worker request lifecycle. Replaced the version-specific service aggregator with explicit service registration and removed three unused legacy UI components.
- Domain types and the preload bridge contract live in `src/types/`; the Vite environment declaration only attaches the bridge to `Window`. TypeScript now rejects unused locals and parameters.
- Composer controls share one feature stylesheet. Removed 71 redundant exact declarations, obsolete selectors and version-named stylesheet imports. Task/goal details use transparent expandable rows; the empty input is shorter and keyboard hints no longer occupy a permanent row. At a 1042×650 viewport, the measured composer with a task chip shrank from 234 px to 135 px; text still grows the input.
- Fixed stale compaction/page responses, camel-case background-task completion and legacy permission migration. Renderer file/editor IPC stays scoped to the project and linked worktrees regardless of agent outside-project access; the Files root selector now exposes those permitted roots.

## Custom.13 usage clarity

- Fresh conversations show a compact empty state with a shortcut to all local usage. Chats with messages but no saved usage remain distinct from empty chats; unknown values are never converted to zero.
- Usage uses four transparent primary measurements and compact optional details. Recorded model cost stays visible when another optional field is missing; incomplete cost is marked as a lower bound. Subscription usage remains separate from local response records.
- Rebuilt the disposable usage cache format and refresh it when native chat history changes. Cache write failures no longer hide computed results.

English developer documentation: [Architecture](docs/ARCHITECTURE.md) and [Developer guide](docs/DEVELOPMENT.md).

## Custom.14 Harness adaptation

- One sidebar with grouped/flat chats, recent/manual order, execution states and workspace attention indicators. Narrow windows retain New chat and open the history drawer from Chats.
- Multiple chats own independent official Grok processes. Main drains background FIFO queues; Stop, Steer, permissions and restart address one execution. Switching and renderer reload preserve live work and drafts. Existing native history can be viewed without starting an agent.
- Questions, permissions, folder trust, connector input and plan review live beside the composer. Custom text answers, multiple pending questions and plan comments use the native protocol. Collapsing a card sends no decision.
- Chat folds technical steps into summaries. Activity is a virtualized, searchable ledger of loaded history with input/output details. Files from this response require an observed successful mutation. Local file links use the existing realpath-aware IPC. Images have a full-size viewer, and `@` completes workspace files.
- Each chat retains an independent native browser page. Preview MCP identifies the execution; user screenshots return to its queue in main. Terminal tabs retain their session identity and scrollback.
- Closing a working window offers Keep working or Stop tasks and close. Restored unsent queues stay paused. Native `~/.grok` conversations remain authoritative.

The comparison and exclusions are in [Harness adaptation](docs/HARNESS-MIGRATION.md). Cordis presets, new scheduling/workflow engines, cross-session context and unsupported history branching are excluded. MCP/plugin configuration binds to restarted or new agents; other running chats keep their existing configuration until restarted.

`node scripts/harness-native-smoke.mjs` tests the real Electron shell with an isolated UI profile and a simulated agent boundary. It covers concurrent execution, queue ownership, reload, drafts, independent browsers, questions, plan comments, PTY, connection generations and late events. It checks both themes at widths 800/1000/1440 and zoom 100/125/150/200%; `GROK_AUDIT_DPI` selects 1.25/1.5/2. The separate native-history check reads shared history without agent execution. `node scripts/harness-packaged-smoke.mjs` verifies the packaged/installed ASAR with the official CLI, a real PTY command, independent native sessions and retained browser pages, without sending model prompts. Reports are under `qa/harness-native*.json` and `qa/custom14-*`.
