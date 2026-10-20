# Harness adaptation

Reference: official deepseek-ai/deepseek-harness, local commit 528c682e06. Grok remains a client of the official CLI; no Cordis runtime or second conversation store is introduced.

| Area | Existing Grok | Adaptation / acceptance |
| --- | --- | --- |
| Navigation | Sidebar plus rail | Unified sidebar; collapsed rail; grouped/flat, manual/recent order |
| Sessions | One agent per window | Independent records; switching preserves active requests; duplicate session focuses owner |
| Input | Growing editor, modes, drafts | Keep drafts, Chat/Plan/Goal and explicit skills; compact controls |
| Attachments | Images, file/folder picker | File completion, thumbnail viewer, preserved image pipeline |
| Tools | Individual cards | Group successful work; keep failures/waits visible; detailed Activity inspector |
| Questions | Modal, options only | Inline card, custom answers, keyboard navigation, no answer on collapse |
| Permissions / plans | Native reverse requests | Inline waiting cards; preserve exact native decisions and comments |
| Goals / jobs | Native events | Session-owned state; background queue and visible pending interaction |
| Journal | Transcript | Searchable paged Activity with virtual rows and input/output inspector |
| Results | Generic file panel | Successful mutation files at response tail; validated local links |
| Models / extensions | Official CLI / ACP | Existing supported catalog, effort, MCP and plugins; refreshed presentation |
| History | Native files + worker search | Preserve full search, ordinal jumps, export, archive, pins and reading positions |
| Workspace | Files / Git / browser / PTY | Preserve scope gates, dirty edits, page identity and independent zoom |
| Cordis presets / workflows / scheduler | No confirmed compatible contract | Excluded; no placeholder execution controls |
| Cross-session context / history forks | No confirmed ACP contract | Excluded; no copied authoritative history |

## Baseline defects

- AskUserDialog offers only option buttons and requires a selection for every question. Freeform input cannot be submitted. Verify a no-option question and custom text for a question with options.
- MarkdownLink prevents default navigation but handles only HTTP(S). Local file links never open. Verify a scoped local file opens and an outside/symlink target is rejected by existing IPC.
- useProjectSession blocks navigation while busy, and ensureAgent reuses/reloads/disposes the window's sole agent. Verify two simultaneous chats and that stopping one does not cancel the other.

Baseline: 600 unit checks and TypeScript pass before implementation. The personal source snapshot and QA data are retained outside the public repository. Installation instructions remain in README.

## Delivered verification — Custom.14

- `npm ci`, `npx tsc --noEmit`, `npm test` (615 passing, no skips), `npm run build` and `npm run dist:win -- --publish never` completed.
- Native Electron regression covers concurrent executions, background FIFO, addressed Stop, renderer reload, declined quit, stale connection events, pending questions, plan comments, browser ownership, screenshot routing, local file results and PTY. Agent lifecycle scenarios use a controlled ACP-client fixture; they do not issue paid model prompts.
- Both themes retain the input and primary controls at widths 800/1000/1440 and UI zoom 100/125/150/200%. Additional Electron device scale factors 1.25/1.5/2 exercise DPI geometry; this is not a physical multi-monitor hardware certification.
- A 10,000-event Activity fixture keeps fewer than 60 rendered rows. Loaded history remains searchable; earlier pages load on demand.
- The actual installed application connects to the official CLI, creates independent native sessions, executes a PTY command, and retains its ASAR-hosted browser page and draft across chat selection. No model response generation was exercised in that check.
- Installed ASAR equals the checked build. Installation preserved the user's native session history and backed up UI preferences, drafts and queues. A separate installed-app history check verifies shared catalog/search and warm restart without agent execution.

These are historical predecessor results. Current Community checks and remaining release barriers are recorded in [Verification](VERIFICATION.md).

Known boundaries: Activity represents the available normalized ACP timeline rather than a raw transport packet archive. Unobserved mutation outcomes and unavailable usage metrics remain unknown. Existing build warnings concern bundle size and the non-module theme bootstrap; no new runtime dependencies were added.
