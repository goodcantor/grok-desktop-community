# Grok Desktop Community

[![Quality and native packages](https://github.com/goodcantor/grok-desktop-community/actions/workflows/ci.yml/badge.svg)](https://github.com/goodcantor/grok-desktop-community/actions/workflows/ci.yml)

An independent, open-source desktop client for the official **Grok Build CLI**. Chat right away, then open a project when you need files, Git, terminals or a browser.

**Public beta preparation · 0.1.0-beta.1.** Signed downloads are not available yet. Windows, macOS and Linux releases are gated on native acceptance and signing. This is a community project, not an official xAI desktop product.

![Grok Desktop Community](docs/screenshots/community-dark.png)

## Why Community?

- Independent chats keep working while you switch; each has its own queue, approvals and recovery.
- Plain Chat, native Plan and Goal flows, custom answers and inline permission cards.
- Search your shared native conversation history, keep drafts, pin and organize chats.
- Read a concise response or inspect tool activity, reasoning and confirmed file results.
- Use Files, Git Changes, a native terminal and a retained browser page for each chat.
- English interface, light/dark themes, keyboard shortcuts and accessible layouts at high zoom.

Screenshots use demo data in the real application. [Light theme](docs/screenshots/community-light.png) · [Inline questions](docs/screenshots/community-questions.png). No personal conversations or credentials are included.

## Download and install

Use [GitHub Releases](https://github.com/goodcantor/grok-desktop-community/releases). There is currently no signed public installer; source builds are for development. Do not download packages claiming to be official Community releases from other sites.

| Target | Planned download | Acceptance baseline |
| --- | --- | --- |
| Windows x64 | Setup.exe | Windows 11 |
| macOS Apple Silicon | arm64 DMG | macOS 14+ |
| macOS Intel | x64 DMG | macOS 14+ |
| Linux x64 | AppImage | Ubuntu 24.04 |

1. Install the official [Grok Build CLI](https://docs.x.ai/build/overview) for your platform. Community does not bundle or replace the agent.
2. Install the signed Community package when published. On Linux, make the AppImage executable before opening it; a working bubblewrap backend is needed for isolated tool terminals.
3. Open Community and sign in through the official CLI flow, or use your existing native login. Access and billing follow your Grok account or API configuration; an MIT GUI license does not provide model access.
4. Start chatting. Open a project only when you need workspace tools.

The official CLI must be available before a session connects. Current development compatibility was checked against Grok Build 1.0.62; newer versions require capability checks rather than assuming every TUI feature has a Desktop API.

## Safety and data

Native authentication, skills, MCP and conversations remain in `GROK_HOME` (normally `~/.grok`). Community has its own UI preferences; it does not import settings from Custom or upstream Desktop. See [Privacy](PRIVACY.md).

Tool approvals, file path restrictions and terminal isolation are separate controls. **When isolation is enabled but unavailable, tool terminals are blocked.** Explicit host shell mode runs with your user account privileges; a project working directory is not a filesystem jail. Interactive terminals are user-operated host shells. The CLI process and configured MCP servers are outside the Desktop tool-terminal jail.

Community never changes coding-data sharing on startup. Inspect or change that account setting using `/privacy` in the official CLI. Preview denies sensitive site permissions by default; websites receive no application bridge.

Saved queues restore paused. Interrupted delivery is shown for review and is never replayed automatically. Check native history before retrying a message whose delivery is uncertain.

## Updates

Help → Check for updates uses only `goodcantor/grok-desktop-community`. Download and installation require explicit action. Installation waits for idle tasks and saved file edits. Beta builds track beta releases; stable builds require opting into preview releases. Community cannot install an upstream Desktop update over itself.

## Troubleshooting

- **CLI missing:** install it from the official guide, then use Refresh or restart Community. Community does not change your global `grok` command.
- **Sign-in failed:** retry the official browser/device flow. Never include auth.json, API keys or login URLs in an issue.
- **Terminal isolation unavailable:** configure the reported backend, or explicitly choose host access in Settings after reviewing its privileges. Chat remains available.
- **History missing:** confirm both clients use the same `GROK_HOME`. The search index is disposable; native conversations are authoritative.
- **Update unavailable:** check the Releases page. A missing release, network error or signature failure must not install anything.

Report bugs using the [issue form](https://github.com/goodcantor/grok-desktop-community/issues/new/choose). Security reports belong in [private vulnerability reporting](https://github.com/goodcantor/grok-desktop-community/security/advisories/new), not public issues. There is no promise of a response SLA during beta.

## Build from source

Use Node 22.19+ and the native operating system for the target package:

```sh
npm ci
npm run typecheck
npm test
npm run build
npm run test:native
npm run pack -- --publish never
```

Development packages may be unsigned and are not public release assets. Release CI requires verified Windows signing and Apple Developer ID/notarization; there is no unsigned release fallback. Linux artifacts include checksums and provenance. [Developer guide](docs/DEVELOPMENT.md) · [Release process](AGENTS.md) · [Roadmap](ROADMAP.md).

## License and credits

MIT, retaining [Karman de Lange / liaan's Grok Desktop](https://github.com/liaan/grok-desktop) copyright. Community is based on upstream v1.4.7, with the personal Custom improvements adapted for public distribution. Grok Build is installed separately under its own upstream terms. DeepSeek Harness informed compatible interface flows; its agent runtime is not bundled. See [Third-party notices](THIRD_PARTY_NOTICES.md) and [historical Custom notes](docs/CUSTOM-HISTORY.md).
