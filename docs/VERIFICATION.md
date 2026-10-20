# Verification record

These are measured checks, not a claim that every supported configuration has been certified.

## Windows

On 2026-10-20 (Windows 11 x64), the packaged Community 0.1.0-beta.1 development build passed: official Grok Build 1.0.62 connection and model metadata, a real bounded response (`COMMUNITY_SMOKE_OK`), independent native session creation, a native PTY command, retained ASAR browser pages and drafts, and no renderer errors. Test profiles were isolated; official conversations used the native CLI store. No personal data is included in this document.

The separate synthetic-home packaged check passed: missing-CLI behavior, unchanged native auth bytes/permissions, sandboxed renderer, native PTY, independent history owners, retained browser, denied geolocation and no application bridge in remote content. It made no model requests.

Native fixture checks passed concurrent chats, FIFO, addressed Stop, reload, late connection events, questions and plan comments, native browsers/PTY and both themes across 24 geometry combinations. These lifecycle tests simulate the ACP agent boundary.

## Release barriers

macOS arm64/x64 and Linux official-CLI acceptance, Windows/Apple signing, and signed update acceptance remain pending. GitHub CI must pass all required targets. RELEASE-ACCEPTANCE.json records those barriers; do not replace pending entries with fixture results.
