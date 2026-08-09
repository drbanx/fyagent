# Design

Windows-specific JSON merge configuration selects only the NSIS target and
owns per-machine, language, WebView2, and template settings. The Tauri 2.8.1
default template calls the documented `NSIS_HOOK_PREINSTALL` only after its
WebView2 bootstrap and first `SetOutPath`, so that hook cannot enforce the
required before-any-write boundary. FyAgent therefore pins the matching
upstream template and keeps the smallest reviewed delta: validate the final
`$INSTDIR` before WebView2 or output selection, remove MSI migration and the
user-data deletion option, and provision the protected machine runtime root.
The path decision is intentionally limited to absolute local fixed-drive
admission; it does not restore the former install-directory ACL, owner,
protected-folder, warning, or hardening policy.

That product boundary also leaves the explicitly accepted concurrent-mutation
risk when a caller chooses a path beneath a user-writable ancestor. Preventing
every path-component or generated-resource switch through installation would
require ACL admission/temporary hardening or a handle-relative custom payload
extractor, all of which would change the locked product decision. The validator
therefore proves the resolved placement at admission time and does not claim to
be an access-control boundary.

The release pipeline deterministically renames native Tauri outputs to
`FyAgent-<version>-Windows-x64-setup.exe` and
`FyAgent-<version>-Windows-arm64-setup.exe`. Signing produces a per-asset
machine-readable status consumed by asset verification and release notes.
An absent selector and zero signer inputs, or the explicit `unsigned` selector,
selects the reviewed unsigned branch. The `provider` selector requires every
provider input; any provider input without that selector, partial input, or
empty input is an error rather than an unsigned fallback.

Windows build, sealing, and lifecycle are separate native-runner trust phases.
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

`windows-lifecycle` starts on a further fresh matching-architecture runner.
Its `always()` admission accepts only successful eligibility/raw build/pinning plus
preflight success with both formal jobs skipped, or preflight skipped with both
formal producer and sealer successful. It contains no secret expression,
signer environment, or upload step. It downloads the unique sealed installer/
fragment pair, validates identity, size, SHA-256, and mode-specific evidence,
and only then executes the elevated native lifecycle. Lifecycle failure blocks
downstream jobs but cannot modify the immutable artifacts later downloaded by
aggregation. The build runner continues to own platform metadata.

The NSIS-owned machine state is the application payload, shortcuts, protocol
and uninstall registration, install-directory marker, and
`%ProgramData%\FyAgent\runtime` bootstrap. User-scoped application state is
outside installer ownership and survives uninstall.
