# Privacy

Community is a local desktop shell. It has no application analytics or automatic conversation uploads. It sends requests to the official Grok CLI; that CLI, model services, user-configured MCP servers and websites opened in Preview have their own network and privacy behavior. Model processing is not entirely local.

## Storage

- Native authentication, conversations, skills and extensions: GROK_HOME, normally ~/.grok, shared with the official CLI and other clients.
- UI preferences, unsent drafts/media, delivery recovery records and disposable indexes: the separate grok-desktop-community user-data directory (Windows: %APPDATA%; macOS: ~/Library/Application Support; Linux: $XDG_CONFIG_HOME or ~/.config).
- Preview website cookies and browser storage: the Community Electron profile. Pages in different chats retain independent views but share the browser cookie partition within Community.

Community does not import Custom preferences or rewrite coding-data sharing on startup. Missing account sharing information is shown as unknown/native default. Inspect or change it with /privacy in the official CLI. Signing in/out and official engine updates are explicit CLI operations.

## Network and permissions

Unsigned previews use manual updates and open only the Community Releases page when requested; they do not download or install updates in-app. Signed distributions check only the Community repository and require explicit download/install action. The official CLI owns model requests, authorization and its own updates. Preview contacts URLs opened by the user or their agent; screenshots are submitted only using the explicit screenshot action.

Preview denies sensitive site permissions by default. Tool-terminal isolation is distinct from file path gates and approval mode. Host terminals, the CLI process and MCP servers can have your user account access; do not treat the desktop shell as a sandbox for all code.

## Diagnostics and reports

Debug logging is off by default. Standard debug records omit commands, arguments, environment variables, prompt/output text and credential fields. Local crash logs can include errors, stack traces and paths. Nothing is uploaded automatically. Review any diagnostics or screenshots before sharing; never attach auth.json, API keys, indexed history caches or private conversations to an issue.

Delete Community UI data only after exporting needed unsent drafts. Uninstalling Community does not require deleting shared GROK_HOME. The official provider's [privacy and service policies](https://x.ai/legal) apply to its services.
