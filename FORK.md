# Provenance and architecture boundary

Community derives from liaan/grok-desktop v1.4.7 (1218f6edf3791c0f39820e8c60563d81c1697a0a), followed by the personal Custom improvements and public-release hardening. Upstream Git history and MIT copyright remain intact.

User → Community Electron/React shell → official grok agent stdio over ACP → native GROK_HOME.

The desktop does not implement or bundle models, agent tools, skills, an alternate OAuth token store or an authoritative conversation database. Native session files remain shared; UI preferences and unsent recovery state belong to Community. Unsupported agent features are not simulated as working product controls.
