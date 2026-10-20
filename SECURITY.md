# Security policy

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/goodcantor/grok-desktop-community/security/advisories/new). Do not post credentials, personal conversations or exploit details in public issues. If that form is unavailable, do not disclose sensitive material publicly; wait for a private reporting channel.

During beta, only the latest Community beta is supported. There is no guaranteed response SLA. We aim to acknowledge reports, reproduce them and coordinate a fix before public disclosure.

The desktop is a client of the official CLI. Its responsibilities include IPC boundaries, safe file handling, queue recovery, browser isolation and release integrity. The CLI process, extensions, MCP servers and explicit host terminals are not inside the Desktop tool-terminal jail. Deny rules, approvals and filesystem isolation are separate controls.

Public release artifacts require platform verification: Authenticode on Windows; Developer ID and notarization on macOS; checksums and provenance for all platforms. PR builds are untrusted and never receive signing secrets. No unsigned public release fallback is permitted.
