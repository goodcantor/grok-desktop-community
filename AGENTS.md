# Grok Desktop Community — maintainer instructions

Independent MIT client of the official Grok Build CLI. Keep native authentication and conversations in GROK_HOME; never create a second conversation store.

- Skills and delegation are user-invoked only.
- Community has separate UI preferences from Custom. Do not import preferences automatically.
- Use npm ci, npm run typecheck, npm test, npm run build and isolated native/package checks. Install instructions belong in README.md.
- Main is ESM; preload stays CommonJS. Keep renderer sandbox and context isolation enabled. Validate IPC sender, frame and execution ownership.
- Persist unsent delivery transitions atomically. Interrupted messages never replay automatically. Never rewrite native privacy preferences on startup.
- Targets: Windows x64, macOS arm64/x64, Linux x64. Every required job must pass. Build output is release/.
- Never commit dependencies, output, QA profiles, credentials or conversations.
- Publish only to goodcantor/grok-desktop-community. Never push upstream. Package with --publish never; CI owns draft uploads.
- Unsigned community preview drafts may be prepared without credentials. Publishing them requires an explicit owner exception to the signed-only policy. Label them unsigned/ad-hoc, keep updates manual, retain all four native CI checks and never claim notarization or stable certification.
- Signed public Windows artifacts require Authenticode; macOS requires Developer ID, hardened runtime, notarization and stapling. No unsigned public fallback. Release secrets never enter PR jobs.
- Updates use only Community releases and respect active work and unsaved edits.
- Base: upstream v1.4.7, commit 1218f6edf3791c0f39820e8c60563d81c1697a0a. Retain upstream license/copyright.
