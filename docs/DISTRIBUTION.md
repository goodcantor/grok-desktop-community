# Distribution without a signing budget

Research checked on 2026-10-20. These are distribution choices, not claims that Community has been approved by a signing service or an app store.

| Path | What it provides | What remains |
| --- | --- | --- |
| GitHub community preview | Free direct installer downloads, SHA-256, source history and build provenance | Windows is unsigned; macOS is ad-hoc signed without Apple notarization. OS policy may block first launch. Manual updates only. |
| Microsoft Store MSIX | Microsoft signs accepted MSIX packages; new individual registration has no onboarding fee in the supported flow | Owner must complete government-ID/selfie verification, reserve the package identity and pass Store certification. An EXE submitted to the Store does not get free Authenticode signing. |
| SignPath Foundation | Free signing service for eligible open-source projects | Application/review, published project, MFA and signing approval policy. Fork eligibility must be checked; approval is not automatic. |
| Apple Developer ID | Signed/notarized direct macOS distribution | Requires Apple Developer membership or a suitable sponsor; an ad-hoc signature does not replace it. |

## Evidence from other projects

- [Upstream Grok Desktop releases](https://github.com/liaan/grok-desktop/releases) distribute unsigned Windows/macOS builds with first-launch instructions. Community keeps the preview clearly marked and does not publish commands that disable protection globally or clear quarantine.
- [SignPath's project directory](https://signpath.org/projects.html) includes VSCodium, Super Productivity and other open-source desktop apps. See the [eligibility conditions](https://signpath.org/terms) before applying; no affiliation is claimed.
- Microsoft documents [free individual registration](https://learn.microsoft.com/en-us/windows/apps/publish/whats-new-individual-developer) and [Store signing for MSIX](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options). Registration is a human account/identity step, not something this repository performs automatically.
- GitHub documents [free standard hosted runners for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions). Preview binaries upload directly to a draft Release instead of consuming large Actions-artifact storage. The workflow never enables paid runners or changes billing settings.

## Preview preparation and publication

The unsigned-preview workflow can prepare a complete draft without certificates. All four native source-quality targets must pass for the exact source commit. The workflow installs each platform's actual payload in a temporary CI environment, runs synthetic-home smoke checks, records publisher-signature status and includes SBOMs, checksums and provenance. Linux offers a DEB plus an AppImage whose application archive is compared with the tested installed DEB.

These checks do not reproduce a browser-downloaded installer on a physical machine. Full official-CLI acceptance on macOS/Linux and signed-update acceptance remain pending. Checksums establish file integrity; provenance links the binary to a GitHub build. Neither is an OS publisher signature or a malware-safety guarantee.

The workflow produces only a draft prerelease. Publishing an unsigned preview requires the owner's explicit exception to the previous signed-only release policy. Signed/stable release gates remain separate and unchanged. Never label the preview signed, stable, notarized or certified.

For user installation, first launch, update and uninstall instructions use [README](../README.md#download-and-install).
