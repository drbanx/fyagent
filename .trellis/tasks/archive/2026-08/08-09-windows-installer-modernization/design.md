# Design

Windows-specific JSON merge configuration selects only the NSIS target and
owns per-machine, language, WebView2, and template settings. The Tauri 2.8.1
default template calls the documented `NSIS_HOOK_PREINSTALL` only after its
WebView2 bootstrap and first `SetOutPath`. FyAgent pins the matching upstream
template and keeps the reviewed deltas needed to remove MSI migration and the
user-data deletion option, provision the protected machine runtime root, bound
uninstall ownership, and apply the configured FyAgent icon to both installer
and uninstaller. The directory page and final `/D=` value use standard NSIS
handling; the repository deliberately has no custom absolute/fixed/local/UNC/
reparse/drive-type or ACL/owner admission policy for `$INSTDIR`.

The selected install directory is therefore not an FyAgent security boundary.
NSIS and Windows may still reject malformed input or fail an actual write, but
FyAgent does not pre-classify the user's choice. This decision does not weaken
the separate `%ProgramData%\FyAgent\runtime` contract: its exact owner/DACL,
handle validation, and non-repair behavior remain mandatory before payload
copy.

The release pipeline deterministically renames native Tauri outputs to
`FyAgent-<version>-Windows-x64-setup.exe` and
`FyAgent-<version>-Windows-arm64-setup.exe`. Signing produces a per-asset
machine-readable status consumed by asset verification and release notes.
An absent selector and zero signer inputs, or the explicit `unsigned` selector,
selects the reviewed unsigned branch. The `provider` selector requires every
provider input; any provider input without that selector, partial input, or
empty input is an error rather than an unsigned fallback.

Windows build and sealing are separate native-runner trust phases.
The build matrix installs dependencies and runs Cargo/Tauri/NSIS without any
signer configuration, proves the normalized candidate has no Authenticode
certificate or PE security directory, emits the build runner's platform
metadata, and uploads an exact one-file private raw artifact.

`pin-release-build-inputs` waits for Windows, Linux, and macOS builds before any
provider code can execute. It admits exactly two Windows raw artifacts, three
non-Windows installer artifacts, and five metadata artifacts; copies them into
one exact bundle; and records every file's size, SHA-256, version, and source
SHA. The upload action's original immutable artifact ID is a job output.
Preflight, formal production, fresh sealing, and final aggregation download
only that old ID and re-verify the manifest. Deleting or overwriting its name
therefore fails an old-ID download instead of substituting release bytes.

Dispatch selects `prove-windows-preflight` after pinning; its entire job payload has no
secret or provider expression, proves strict unsigned evidence, and owns the
preflight sealed pair. A formal tag first selects `sign-windows-formal`; only
that producer receives optional provider secrets. It clears staging and managed
process variables, removes the decoded adapter, uploads one untrusted
`formal-candidate-*`, and ends without probing post-provider bytes, generating
trusted evidence, or owning final artifacts. `seal-windows-formal` then starts
on a separate fresh matching-architecture runner with no secrets. It downloads
the pinned raw and untrusted candidate, independently requires byte-identical
strict unsigned output or an Authenticode-only mutation with the expected
publisher/certificate/timestamp policy, generates the trusted fragment, and
exclusively uploads the formal sealed pair. These jobs install only the exact
Node runtime and never run pnpm install, Cargo, Tauri, a project build, or the
candidate installer.

Release defines no `windows-lifecycle` job and does not invoke the manual
`verify-windows-nsis-lifecycle.ps1` diagnostic. `verify-assets` admits only the
successful eligibility/raw build/pinning tuple plus either successful
preflight sealing with both formal jobs skipped, or skipped preflight with both
formal producer and sealer successful. It downloads the immutable sealed pair,
revalidates exact assets and evidence, and feeds attestation/publication. The
build runner continues to own platform metadata; matching native setup
build/package success is the Windows platform acceptance boundary.

The NSIS-owned machine state is the application payload, shortcuts, protocol
and uninstall registration, install-directory marker, and
`%ProgramData%\FyAgent\runtime` bootstrap. User-scoped application state is
outside installer ownership and survives uninstall.
