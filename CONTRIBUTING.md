# Contributing

Small, focused improvements are welcome. Open an issue before broad product changes. Read AGENTS.md for maintainer boundaries and README.md for setup commands.

Use an isolated development profile and synthetic GROK_HOME for tests. Do not run checks against another person's conversations, kill their running app, or submit paid model prompts without an explicit test purpose. Native shell tests and real official-CLI checks must be reported separately.

Before a pull request: npm ci, npm run typecheck, npm test, npm run build, and relevant native/package checks. Describe the concrete problem, resulting behavior, tests and known limits. Keep native conversations authoritative; UI data contains only preferences and unsent recovery state.

Contributions are under the existing MIT license. Preserve upstream attribution. Do not include generated output, profiles, logs, tokens, private test data or dependency directories. Security findings use the private reporting channel in SECURITY.md.
