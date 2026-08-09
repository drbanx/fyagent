# Windows Installer Contract

## 1. Scope / Trigger

Read this contract before changing the Windows Tauri bundle configuration,
NSIS template or hooks, install-directory admission, WebView2 bootstrapper,
machine-runtime bootstrap, uninstall ownership, Windows signing adapter, or
native installer lifecycle. It owns installer mechanics and per-asset Windows
evidence. The GitHub job graph, frozen release identity, cross-platform asset
set, attestation, and publication transaction remain owned by
[GitHub Release Workflow](./github-release-workflow.md). Runtime startup,
interactive-user proof, protected activation, and the security descriptor that
the installer provisions are owned by
[Windows Runtime Security](./windows-runtime-security.md).

Windows x64 and ARM64 installer claims require matching native hosted runners.
Local structure tests, cross-compilation, or inspection of the setup launcher
cannot replace either install/uninstall lifecycle.

## 2. Signatures

```text
FYAGENT_WINDOWS_MANIFEST = release | test | dev

FyAgent-<version>-Windows-x64-setup.exe
FyAgent-<version>-Windows-arm64-setup.exe

FYAGENT_WINDOWS_SIGNING_MODE = unsigned | provider
FYAGENT_WINDOWS_SIGN_EXPECTED_PUBLISHER
FYAGENT_WINDOWS_SIGN_EXPECTED_CERTIFICATE_SHA256
```

```text
node scripts/release/verify-windows-nsis-contract.mjs

node scripts/release/windows-signing.mjs asset \
  --asset <setup.exe> \
  --architecture <x64|arm64> \
  --version <X.Y.Z> \
  --source-sha <sha> \
  --output <native-fragment.json>

node scripts/release/windows-signing.mjs transform \
  --asset <untrusted-formal-setup.exe> \
  --architecture <x64|arm64> \
  --version <X.Y.Z> \
  --source-sha <sha>

node scripts/release/windows-signing.mjs verify-sealed \
  --raw <frozen-raw-setup.exe> \
  --candidate <untrusted-formal-setup.exe> \
  --architecture <x64|arm64> \
  --version <X.Y.Z> \
  --source-sha <sha> \
  --mode <unsigned|provider> \
  [--expected-publisher <publisher> \
   --expected-certificate-sha256 <sha256>] \
  --output <trusted-native-fragment.json>

node scripts/release/windows-signing.mjs aggregate \
  --x64-status <x64-fragment.json> \
  --arm64-status <arm64-fragment.json> \
  --assets-directory <directory> \
  --version <X.Y.Z> \
  --source-sha <sha> \
  --output signing-status.json

./scripts/release/verify-windows-nsis-lifecycle.ps1 \
  -InstallerPath <setup.exe> \
  -Architecture <x64|arm64> \
  -AppVersion <X.Y.Z>
```

Public signing metadata uses `fyagent-windows-signing-status/v1`. Private
per-architecture fragments use `fyagent-windows-signing-asset/v1` and never
become a second public signing authority.

## 3. Contracts

### Build and bundle selection

- `build.rs` selects the embedded Windows manifest from
  `FYAGENT_WINDOWS_MANIFEST`. Only `release` enables
  `fyagent_windows_release`; `test` and `dev` select the ordinary-user
  manifest. A release-profile build without an explicit selection fails.
- `fyagent-release.manifest` uses `requireAdministrator`; test/dev use
  `asInvoker`. Packaging verifies the application executable's exact PE
  Machine, execution level, and `uiAccess=false` before accepting an asset.
- Cross-platform targets remain in the base Tauri configuration.
  `tauri.windows.conf.json` is the Windows-only merge layer and selects exactly
  `nsis`.
- The NSIS bundle is `perMachine`, defaults to
  `C:\Program Files\FyAgent`, uses English and Simplified Chinese selected from
  the OS language without a selector, and configures WebView2 as
  `downloadBootstrapper`. Silent `/S` and a final
  `/D=<absolute-install-directory>` are supported.
- The checked-in template is a minimal derivative of the template embedded by
  the locked Tauri CLI. The source verifier pins its upstream tag, commit, and
  SHA-256. A template change must retain the documented Tauri merge boundary
  and prove why hooks alone cannot place the final-path gate before every write.

### Final install-directory admission

- The first executable installer section, the GUI directory-page callback, and
  maintenance flow call the same `FyAgentValidateFinalInstallDir` function.
  No payload, registry, shortcut, WebView2, previous-uninstaller, or machine
  runtime write may occur before the relevant call succeeds.
- The validator requires a DOS-rooted absolute shape, normalizes it with
  `GetFullPathNameW`, finds the nearest existing ancestor without creating
  anything, opens that ancestor while following reparse points, obtains the
  final path with `GetFinalPathNameByHandleW`, resolves the mounted volume, and
  accepts only `GetDriveTypeW == DRIVE_FIXED`.
- Relative, drive-relative, UNC, mapped-network, removable, CD-ROM, RAM-disk,
  unresolved, inaccessible, and final-target-resolution failures are denied. A
  fixed volume mounted below another fixed root is classified by its actual
  volume, not its lexical drive prefix.
- Admission deliberately does not inspect or modify install-directory ACLs,
  owners, existing contents, protected-folder classifications, ancestor write
  rights, or user-facing security warnings. Fixed-local-volume placement is a
  product path contract, not an access-control or hardening decision.
- Before copying the application payload, the installer calls the machine
  runtime bootstrap defined by
  [Windows Runtime Security](./windows-runtime-security.md). It must not weaken,
  repair in place, or independently reinterpret that descriptor contract.
- Installer and uninstaller registry access uses the same 64-bit machine view
  on supported x64 and ARM64 systems. Shortcuts and protocol/uninstall records
  are machine-scoped.

### WebView2 bootstrapper

- The repository-owned helper is embedded byte-for-byte through a bounded,
  deterministic encoded command. It invokes the absolute system Windows
  PowerShell with profiles disabled, restricts module lookup to `$PSHOME`, and
  uses module-qualified commands.
- HTTPS redirects, elapsed time, and response size are bounded. Download bytes
  are created below the protected machine-runtime root and remain pinned against
  replacement from signature verification through process exit.
- Execution requires Authenticode `Valid`, Microsoft Corporation subject
  identity, Code Signing EKU, a LocalMachine whole-chain build with online
  revocation, the reviewed leaf allowlist, and the reviewed Microsoft Code
  Signing PCA public-key pin. CurrentUser trust injection cannot satisfy the
  policy. Pin rotation requires a reviewed source change and native live-link
  verification on both architectures.

### Uninstall ownership and user data

- Uninstall removes only installer-owned payload/external binaries/resources,
  matching shortcuts, product/protocol/uninstall registration, the uninstaller,
  and bounded runtime state names delegated by the runtime contract.
- `$INSTDIR` is never removed recursively. Known children are removed first;
  ancestors are removed only when empty. An unrelated file beside the
  installation survives.
- User-owned data survives uninstall, including `~/.fyagent` databases,
  settings, configuration, skills, OAuth state, logs, backups and storage;
  Tauri per-user roaming/local stores for `com.fyagent.desktop`; and Codex,
  Claude, Gemini, WorkBuddy, Bun, mise, or other external-tool homes.
- The installer exposes no user-data deletion checkbox. Native lifecycle tests
  create unique sentinels in independent test homes and prove preservation for
  both default and custom-directory uninstall.

### Signing and sealed asset evidence

- Signer configuration is all-or-none. Absent selector/provider inputs, or
  explicit `unsigned` with absent provider inputs, selects unsigned mode.
  `provider` requires every public policy input and the adapter; an optional
  opaque credential is inherited only by that provider. Partial, blank,
  malformed, relative, failed, or mismatched configuration never falls back to
  unsigned.
- Native build runners receive no signer configuration or credential. Each raw
  setup must be `NotSigned`, have null publisher/signer/timestamp evidence, and
  have an empty PE security directory before it leaves the build runner.
- The provider-neutral transform receives only the absolute candidate path and
  architecture. Repository code never reads or serializes provider-specific
  secret material. Workflow-private secret identifiers and provider syntax are
  not long-term interfaces in this spec. Temporary adapter bytes use a
  create-new random path and are deleted after the attempt.
- A fresh matching-architecture sealer reopens the pinned raw and untrusted
  candidate bytes. Unsigned mode requires byte identity and strict `NotSigned`.
  Provider mode permits only PE checksum/security-directory changes, alignment
  padding, and an appended `WIN_CERTIFICATE`; it requires system status `Valid`,
  exact expected publisher/certificate SHA-256, Code Signing EKU, a timestamp
  certificate, and Time Stamping EKU.
- Link/real-path drift, PE Machine drift, an out-of-policy byte mutation,
  provider-produced evidence, or a verification-time replacement is rejected.
  The setup launcher's Machine does not establish product architecture; the
  installed `fyagent.exe` does.
- x64 and ARM64 fragments must agree on mode and, in provider mode, public
  publisher/certificate policy. Aggregation reopens final bytes and binds name,
  size, SHA-256, source SHA, signature evidence, and attestation subject into
  `signing-status.json`. Release disclosure is generated from this record.

### Native lifecycle

Each sealed architecture-specific setup runs on its matching clean native
runner and proves:

- runner OS/process architecture match the logical target;
- relative, UNC/network, and every exposed non-fixed volume fail before write;
- default silent installation succeeds under Program Files;
- a fixed-volume custom path with spaces and Unicode succeeds through `/S`
  with final `/D=`;
- installed `fyagent.exe` is `0x8664` for x64 or `0xAA64` for ARM64;
- version, HKLM registration, protocol registration, all-users shortcuts, and
  machine-runtime bootstrap state match their contracts;
- silent uninstall removes bounded installer-owned state while preserving every
  user-data sentinel.

Lifecycle cleanup is best effort only for installations created by that test.
It does not use Store access, a real Codex installation, or application UI.
Preview ARM64 runner unavailability blocks acceptance; it does not authorize a
cross-build or a reduced asset set.

## 4. Validation & Error Matrix

| Condition                                                                                                                 | Required result                                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Release-profile build has no explicit manifest mode                                                                       | Fail before compiling/bundling; do not guess.                                       |
| GUI or `/D=` resolves to a relative, remote, non-fixed, inaccessible, or unresolved target                                | Abort before the first installer-owned write.                                       |
| Install directory is user-writable or has an unusual owner/ACL but is on a fixed local volume                             | Apply only the fixed-volume contract; do not add an ACL/owner warning or rejection. |
| Machine-runtime root does not satisfy its exact runtime descriptor                                                        | Fail without repairing or weakening the preimage.                                   |
| Raw candidate contains any signature/security-directory evidence                                                          | Reject before signer or preflight sealing.                                          |
| Provider configuration is partial, blank-active, malformed, or fails                                                      | Hard fail; never emit unsigned evidence as fallback.                                |
| Signature is `HashMismatch`, `UnknownError`, wrong publisher/certificate/EKU/timestamp, or mutates non-Authenticode bytes | Reject the architecture and block release.                                          |
| x64 and ARM64 signing modes or signed identities differ                                                                   | Aggregation fails; emit no public status.                                           |
| Uninstall encounters unrelated install/user data                                                                          | Preserve it; remove only known children and empty owned ancestors.                  |
| Matching native ARM64 runner is unavailable                                                                               | Acceptance remains blocked.                                                         |

## 5. Good / Base / Bad Cases

- Good: both GUI selection and `/S ... /D=D:\FyAgent 测试` reach the same
  validator, resolve to a fixed local volume, then write only after the runtime
  bootstrap succeeds.
- Base: signer configuration is completely absent. Both final setups remain
  byte-identical to raw, strict `NotSigned` evidence is aggregated, and public
  notes explicitly disclose the unsigned state with digests and attestation.
- Good: complete provider configuration transforms only Authenticode-owned PE
  fields; a fresh no-secret runner independently proves publisher, certificate,
  EKUs, timestamp, and final bytes before lifecycle execution.
- Bad: infer safety from `C:` syntax, inspect an install-directory owner, allow a
  partial signer to downgrade to unsigned, trust the provider's own fragment,
  or recursively delete `$INSTDIR`/the user's profile.

## 6. Tests Required

- `tests/windowsNsisContract.test.ts` and
  `scripts/release/verify-windows-nsis-contract.mjs` pin configuration, template
  provenance, first-section ordering, one shared final-path validator,
  handle-derived volume classification, runtime bootstrap ordering, bounded
  uninstall, and absence of retired package surfaces.
- `tests/windowsSigningAdapter.test.ts` covers the complete signer matrix,
  strict unsigned state, provider simulation, publisher/certificate/timestamp/
  EKU policy, Authenticode-only mutation, launcher-architecture independence,
  path replacement, fragment drift, cross-architecture mismatch, and final
  size/SHA binding.
- `tests/releaseWorkflow.test.ts` and `tests/releaseAssets.test.ts` bind native
  runner selection, secret isolation, one-file handoffs, two setup names,
  lifecycle ordering, disclosure, subject count, and attachment count without
  becoming the owner of installer internals.
- Native x64 and ARM64 workflow jobs perform the complete install/verify/
  uninstall lifecycle and sentinel preservation. Portable tests are necessary
  but cannot satisfy these gates.

## 7. Wrong vs Correct

Wrong:

```text
if path starts with "C:\" then accept
if signer fails then publish as unsigned
uninstall: recursively delete $INSTDIR and user configuration
```

Correct:

```text
normalize -> open existing ancestor -> resolve final volume -> require DRIVE_FIXED
raw strict unsigned -> optional provider transform -> fresh independent seal
delete allowlisted installer-owned children -> remove only empty owned ancestors
```
