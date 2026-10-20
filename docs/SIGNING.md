# Signing setup and release evidence

Public installers are blocked until the owner provisions signing credentials. No purchases or enrollment are performed by the build scripts. Keep credentials in a protected GitHub Environment named release-signing, with goodcantor as an approver. Never provide them to pull-request jobs or paste them into issues.

Windows: provide a supported electron-builder certificate or signing service. The default certificate path uses WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD; hardware/cloud signers must integrate through electron-builder's supported signing hook. Set WINDOWS_PUBLISHER_NAME to the actual certificate CN. Release verification checks Authenticode and the expected publisher. A certificate does not guarantee that SmartScreen reputation warnings disappear immediately.

macOS: provide MAC_CSC_LINK, MAC_CSC_KEY_PASSWORD, APPLE_API_KEY (base64 .p8), APPLE_API_KEY_ID and APPLE_API_ISSUER. CI materializes the API key in the runner temporary directory, imports the Developer ID Application certificate into an ephemeral keychain through electron-builder, signs with hardened runtime, notarizes and validates the stapled ticket. The Apple account owner must obtain the membership and certificates.

Linux: no Authenticode/Developer ID mechanism is claimed. All release artifacts receive SHA-256 checksums, a dependency bill of materials and GitHub build-provenance attestations.

Record genuine official-CLI and signed-update acceptance for every target in RELEASE-ACCEPTANCE.json, including the CLI version, OS, evidence link and date. Fixture checks are separate and cannot satisfy these fields. Never mark pending acceptance as passed just to publish.

Release jobs build on each native OS/architecture and fail closed if signing, acceptance or any mandatory target fails. Packaging uses --publish never. Only the final release job uploads a complete verified set to a draft; publication is a separate protected action. Never rename signed artifacts after update metadata is generated.

The release preflight runs trusted tools from main against the requested tag without signing secrets. It requires a successful exact-commit native CI run. Separate macOS jobs retain distinct artifacts until assembly combines both architectures in the update feed and verifies SHA-512 metadata against the signed files. Actions are pinned to immutable commits; Dependabot proposes reviewed updates.
