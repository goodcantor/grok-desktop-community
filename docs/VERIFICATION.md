# Verification record

These are measured checks, not a claim that every supported configuration has been certified.

## Automated source checks

On 2026-10-20: TypeScript and all 637 unit tests passed with no skips. A clean dependency install, production build, development package and Windows NSIS packaging completed. These local development artifacts are unsigned and are not release assets.

The full dependency audit has no high/critical findings; eight moderate findings remain in the build-only builder chain. Secret scanning covers the complete inherited Git history and tracked publication files. The required [native CI matrix](https://github.com/goodcantor/grok-desktop-community/actions/workflows/ci.yml) runs Windows x64, macOS arm64/x64 and Linux x64, including native fixture and packaged synthetic-home checks. A release requires a successful run for its exact commit.

## Windows

On 2026-10-20 (Windows 11 x64), the packaged Community 0.1.0-beta.1 development build passed: official Grok Build 1.0.62 connection and model metadata, a real bounded response (`COMMUNITY_SMOKE_OK`), independent native session creation, a native PTY command, retained ASAR browser pages and drafts, and no renderer errors. Test profiles were isolated; official conversations used the native CLI store. No personal data is included in this document.

The separate synthetic-home packaged check passed: missing-CLI behavior, unchanged native auth bytes/permissions, sandboxed renderer, native PTY, independent history owners, retained browser, denied geolocation and no application bridge in remote content. It made no model requests.

Native fixture checks passed concurrent chats, FIFO, addressed Stop, reload, late connection events, questions and plan comments, simultaneous browser opens, native browsers/PTY and both themes across 24 geometry combinations. Separate Electron scale factors 1.25, 1.5 and 2 passed the geometry checks; this does not certify physical multi-monitor behavior. These lifecycle tests simulate the ACP agent boundary.

## Release barriers

macOS arm64/x64 and Linux official-CLI acceptance, Windows/Apple signing, and signed update acceptance remain pending. A simulated request is not proof of official-CLI interoperability, and a successful package command is not proof of a valid installer signature. RELEASE-ACCEPTANCE.json records those barriers; do not replace pending entries with fixture results.
