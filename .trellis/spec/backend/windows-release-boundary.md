# Windows Installer and Runtime Security Boundary

## 1. Scope / Trigger

This contract applies to formal Windows builds, NSIS packaging, install-path
admission, machine-runtime provisioning, Authenticode evidence, native
install/uninstall acceptance, early startup, and single-instance activation.
These surfaces form one elevated boundary even though packaging and runtime
logic are implemented by different modules.

Windows x64 and ARM64 release evidence must come from matching native GitHub
hosted runners. A local non-Windows build, an opposite-architecture toolchain,
or inspection of a setup launcher cannot substitute for either lifecycle.

## 2. Stable Interfaces

```text
FYAGENT_WINDOWS_MANIFEST = release | test | dev

FyAgent-<version>-Windows-x64-setup.exe
FyAgent-<version>-Windows-arm64-setup.exe

FYAGENT_WINDOWS_SIGNING_MODE = unsigned | provider
FYAGENT_WINDOWS_SIGNER_ADAPTER_BASE64 (GitHub secret configuration)
FYAGENT_WINDOWS_SIGNER_CREDENTIAL (optional opaque GitHub secret)
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

The public aggregate schema is `fyagent-windows-signing-status/v1`. Native
per-architecture fragments use `fyagent-windows-signing-asset/v1` and remain
workflow-internal.

The runtime entry points remain:

```rust
pub(crate) const fn formal_windows_build() -> bool;
pub fn early_windows_startup_gate() -> WindowsStartupDisposition;
pub fn runtime_privilege_status() -> RuntimePrivilegeStatus;
pub(crate) fn install_activation_handler<F>(handler: F)
    -> Result<(), WindowsStartupErrorCode>;
```

## 3. Build and Installer Contract

- `build.rs` selects the embedded manifest from `FYAGENT_WINDOWS_MANIFEST`.
  `release` is the only value that enables `fyagent_windows_release`; `test`
  and `dev` select the ordinary-user manifest. A release-profile build without
  an explicit selection fails rather than guessing.
- `fyagent-release.manifest` remains `requireAdministrator`; the test manifest
  remains `asInvoker`. The release workflow verifies the installed application
  executable's manifest and exact PE Machine before and after bundling.
- The base Tauri configuration continues to own cross-platform bundle targets.
  `tauri.windows.conf.json` is the Windows-only merge layer and selects exactly
  `nsis`. It does not change macOS or Linux packaging.
- The Windows installer is `perMachine`, defaults to
  `C:\Program Files\FyAgent`, uses English and Simplified Chinese according to
  the OS language without a selector, and uses WebView2
  `downloadBootstrapper` mode. Silent `/S` and a final `/D=<absolute path>` are
  supported.
- The checked-in template is a minimal derivative of the template embedded by
  the locked Tauri CLI. Its tag, commit, and upstream SHA-256 are recorded in
  the source verifier. A custom template is necessary because the documented
  pre-install hook in the locked version runs after WebView2 handling and the
  first output-path selection, while the final path must be admitted before
  either can write.
- The first executable section calls `FyAgentValidateFinalInstallDir`. The GUI
  directory-page callback and maintenance flow call the same function. No
  file, registry, shortcut, WebView2, existing-uninstaller, or ProgramData
  write may occur before the relevant call succeeds.
- The validator first requires a DOS-rooted absolute shape, then normalizes
  with `GetFullPathNameW`. It finds the nearest existing ancestor without
  creating anything, opens it while following reparse points, resolves its
  final path with `GetFinalPathNameByHandleW`, resolves the actual mounted
  volume, and accepts only `GetDriveTypeW == DRIVE_FIXED`.
- Relative, drive-relative, UNC, mapped-network, removable, CD-ROM, RAM-disk,
  unresolved, inaccessible, and final-target-resolution failures are denied.
  A fixed drive mounted beneath another fixed root is classified by its actual
  mounted volume, not by the lexical drive root.
- Install-directory admission deliberately does not inspect or modify ACLs,
  owners, existing contents, protected-folder classifications, or ancestor
  write rights. The fixed-local-volume rule is a product placement contract,
  not an ACL-hardening policy. A caller who selects a directory beneath a
  concurrently mutable user-writable ancestor therefore accepts the residual
  path-switching risk that follows from that product decision; the installer
  does not add ACL admission, temporary hardening, or a handle-relative custom
  payload extractor to turn placement validation into an access-control gate.
- Before copying the application payload, the installer provisions
  `%ProgramData%\FyAgent` and its `runtime` child as non-reparse directories.
  A missing directory is created atomically with protected inheritance, a
  Builtin Administrators owner, and only SYSTEM/Administrators inheritable
  full-control ACEs. An existing directory is admitted only when a no-follow
  handle proves a directory/non-reparse object and an exact owner/DACL already
  accepted by the runtime; an unsafe preimage is rejected without repair or
  mutation. A trusted legacy runtime containing only the bounded runtime state
  names is retired by held handles and recreated atomically; an unknown file or
  a handle that blocks deletion fails closed.
- The WebView2 `downloadBootstrapper` path uses a repository-owned helper
  embedded byte-for-byte through a bounded deterministic encoded command. It
  invokes the absolute system Windows PowerShell with profile loading disabled,
  restricts module discovery to `$PSHOME`, and uses module-qualified commands.
  The HTTPS response is size/time bounded and must remain HTTPS after redirects.
  Download bytes are created under the protected ProgramData root and pinned
  against replacement from signature verification through process exit.
- WebView2 execution requires Authenticode `Valid`, Microsoft Corporation
  subject identity, Code Signing EKU, a successful LocalMachine certificate
  chain with online whole-chain revocation, the reviewed leaf allowlist, and a
  reviewed Microsoft Code Signing PCA public-key pin. A CurrentUser-injected
  root or trusted-publisher certificate cannot satisfy this policy. Pin
  rotation is an explicit reviewed source change and a live official-fwlink
  verification on both native runners is a release gate.
- Registry and shortcut state is machine-scoped. Both installer and
  uninstaller use the same 64-bit registry view on supported x64/ARM64 systems.

## 4. Uninstall Ownership and User Data

The uninstaller removes only installer-owned payload files, external binaries,
resource files and empty resource ancestors, its own uninstaller, matching
shortcuts, product/protocol/uninstall registration, and the bounded machine
runtime state names under `%ProgramData%\FyAgent\runtime`.

`$INSTDIR` is never removed recursively. Empty directories may be removed only
after known children have been deleted. ProgramData cleanup removes only known
runtime state/lease patterns and then empty directories.

The following are user-owned and must survive uninstall:

- `~/.fyagent`, including database, configuration, settings, skills, OAuth,
  logs, backups, and storage;
- Tauri per-user roaming and local stores for `com.fyagent.desktop`;
- Codex, Claude, Gemini, WorkBuddy, Bun, mise, and other external-tool homes;
- any unrelated file placed beside an installation.

The installer offers no user-data deletion checkbox or warning flow. A native
lifecycle uses unique sentinels in the owned user-data locations and proves
they remain after both default-directory and custom-directory uninstall.

## 5. Signing and Release Evidence

- Signer configuration is all-or-none. A missing selector and absent provider
  inputs, or an explicit `unsigned` selector with absent provider inputs,
  selects unsigned mode. `provider` activates all three provider inputs. Any
  provider input, including the optional opaque credential, without that
  selector is a hard failure. Partial definition, empty required value,
  malformed value, missing adapter, relative adapter path, provider failure,
  or policy mismatch is a hard failure and never falls back to unsigned.
- Dependency installation, Cargo, Tauri, NSIS bundling, and platform-metadata
  generation run on a native build runner that receives no signer secret or
  signer configuration environment. It proves one exact raw setup candidate is
  `NotSigned` with no certificate evidence and an empty PE security directory,
  then uploads that candidate under an architecture-specific private artifact
  name.
- Before either path continues, `pin-release-build-inputs` waits for all native
  builds, validates the exact two Windows raw, three non-Windows installer, and
  five metadata artifacts, and publishes one manifest-bound bundle. Its
  original immutable artifact ID is a job output; preflight, formal signing,
  fresh sealing, and aggregation download only that ID and re-verify every
  file's size/SHA-256/version/source SHA. Artifact overwrite creates a new ID,
  while deleting the original makes the release fail. Preflight proof and
  formal production are mutually exclusive at the job level. Preflight has a
  five-stage trust chain; formal has six. Every
  architecture-specific Windows job uses a matching native runner with only
  `contents: read`, checks out the frozen source, and never installs
  dependencies or runs Cargo/Tauri/build code outside the raw build. Windows
  platform metadata remains owned by the build runner and is never replaced by
  later-runner observations.
- In provider mode the workflow decodes the bounded secret adapter bytes into a
  random, create-new file under the hosted runner temporary directory. The
  repository-owned provider-neutral boundary then invokes that absolute
  PowerShell script with only `-ArtifactPath` and `-Architecture`. An optional
  opaque credential secret is inherited by the provider without being read,
  serialized, or printed by repository code. The adapter is deleted after the
  signing attempt. Staging configuration, including the encoded adapter and
  opaque credential source variables, is removed from the child environment
  before repository code or the provider process starts.
- `workflow_dispatch` runs only `prove-windows-preflight`, which explicitly
  selects `unsigned`, emits strict `NotSigned`/null-certificate evidence even
  when repository signer configuration exists, uploads the installer and
  fragment once, and ends. A formal tag push runs only
  `sign-windows-formal` as the secret-bearing producer. Before it ends, the
  producer clears staging and managed signer variables, deletes the adapter,
  and uploads exactly one architecture-specific `formal-candidate-*` artifact.
  It never emits or uploads a trusted fragment, never owns the final
  `installers-*`/`signing-*` artifact names, never probes post-provider bytes,
  and never executes the candidate.
- `seal-windows-formal` is a separate fresh matching-architecture runner with
  no secret expression, adapter, credential, or provider-produced fragment. It
  downloads the old pinned artifact ID and untrusted formal candidate, uses the
  probe from a fresh immutable checkout, re-proves raw strict unsigned state,
  and compares the candidate to raw. Unsigned mode requires byte identity and
  strict `NotSigned`; provider mode requires an Authenticode-only mutation,
  system `Valid`, and the public expected publisher, signer certificate, EKU,
  and timestamp policy. This runner alone creates the trusted fragment and
  uploads the final formal `installers-*`/`signing-*` pair.
- `windows-lifecycle` is a further fresh matching-architecture runner. Its
  `always()` condition admits only dispatch with preflight `success` and both
  formal jobs `skipped`, or formal push with preflight `skipped` and both the
  producer and fresh sealer `success`, plus successful eligibility, raw build,
  and build-input pinning. The job receives no secret expression or signer environment and has
  no upload step. It downloads the sealed pair, admits exact one-file
  artifacts, revalidates identity/size/SHA-256 and unsigned preflight evidence,
  then executes the full native lifecycle. No lifecycle or cleanup path may
  upload, overwrite, or replace the artifacts later consumed by aggregation.
- Before resolving the selector, the workflow clears every managed signer
  process variable and rebuilds only validated configuration. Job/runner
  ambient state and earlier `$GITHUB_ENV` writes cannot select or replace a
  signer.
- The Authenticode evidence probe disables module auto-loading, imports only
  absolute manifests under its running PowerShell's `$PSHOME`, and uses
  module-qualified commands. A user-writable `PSModulePath` entry cannot replace
  signature, file, or JSON evidence commands. Signer policy and credential
  variables are removed from the probe child; only the provider adapter child
  inherits the optional opaque credential.
- Every raw candidate must initially be `NotSigned`, have no publisher, signer, or
  timestamp certificate, and have an empty PE security directory. In unsigned
  mode the independently sealed candidate must also be byte-identical to raw;
  that state is final and is disclosed publicly.
- Signed mode requires Authenticode `Valid`, the exact expected publisher and
  signer-certificate SHA-256, Code Signing EKU, a timestamp certificate, and
  Time Stamping EKU. The provider may change only PE checksum/security-directory
  fields, alignment padding, and the appended `WIN_CERTIFICATE` table.
- The fresh sealer rejects a link/real-path change, launcher Machine change, or
  any mutation outside Authenticode-owned fields even if the provider reported
  success. Provider-side probes or fragments are not trusted inputs. The NSIS
  launcher's PE Machine does not establish product architecture; only
  installed `fyagent.exe` does.
- x64 and ARM64 fragments must agree on mode and, when signed, publisher and
  signer-certificate policy. Aggregation re-reads the final installer bytes and
  binds filename, size, SHA-256, source SHA, signing evidence, and attestation
  subject data into `signing-status.json`.
- `signing-status.json` is a public Release attachment and an attestation
  subject. Release notes are generated from this verified record and explicitly
  disclose each architecture's Authenticode status, publisher/timestamp state,
  SHA-256, source SHA, and attestation reference.

`HashMismatch`, `UnknownError`, invalid status, missing timestamp, publisher or
certificate mismatch, cross-architecture inconsistency, post-sign byte drift,
fragment drift, or final artifact drift blocks release.

## 6. Native Lifecycle Contract

Each matching native runner operates on the exact normalized setup bytes after
the signing decision. It must prove:

- the runner OS and process architecture match the logical target;
- relative and UNC/network inputs fail, and every exposed non-fixed drive type
  fails;
- default silent install succeeds under Program Files;
- a fixed-drive custom path containing spaces and Unicode succeeds with `/S`
  and final `/D=`;
- the installed `fyagent.exe` is `0x8664` for x64 or `0xAA64` for ARM64;
- application version, HKLM uninstall/protocol registration, all-users
  shortcuts, and strict ProgramData owner/DACL match the contract;
- pre-existing extra ProgramData ACEs, reparse points, unknown content, and
  stale handles fail without modifying the rejected preimage; a precisely
  trusted legacy runtime is deleted by handle and atomically rebuilt;
- silent uninstall removes installer-owned state and empty install/runtime
  directories while preserving all user-data sentinels.

The lifecycle performs best-effort cleanup of installations it created even
when an assertion fails. It does not execute a real user Codex installation,
Store access, or application UI. It deliberately downloads the official
WebView2 bootstrapper over the fixed HTTPS link and verifies both a live
positive and hostile trust fixtures; if the runner does not already contain
WebView2, the installer also exercises the same secured bootstrapper execution
path.

## 7. Runtime Startup and Activation Contract

- `early_windows_startup_gate` runs before Tauri construction. A formal release
  continues only when privilege status is available, elevated, locally
  administrative, and proven to match the interactive user. Any unavailable or
  mismatched proof returns a stable blocked outcome.
- That proof is generated once from the current process token SID/session and
  `GetShellWindow`'s process, session, and token SID. The process and Shell
  sessions and canonical SIDs must match exactly; no Shell or any lookup error
  fails closed. The ordinary GUI path never calls `WTSQueryUserToken`, whose
  LocalSystem/`SE_TCB_NAME` service contract is outside this application.
- The resulting internal `InteractiveUserContext` is the sole ordinary Codex
  Windows user identity. Long-running package/restart operations re-prove the
  live process/Shell facts against it but never replace it with a new context.
  Development builds may continue when startup proof is unavailable, but the
  ordinary Codex Windows adapter then remains unavailable.
- Runtime state and lease objects live in the installer-provisioned protected
  ProgramData root. Every root/state/lease open rejects reparse points and
  verifies canonical object type, an admitted Builtin Administrators or
  LocalSystem owner, and the exact admitted DACL. Narrow `SeRestorePrivilege`
  use is restored by RAII.
- The state file supplies deterministic instance lookup only. The live pipe
  name is a fresh high-entropy nonce and the activation capability is a
  separate secret; neither is replaced by a static pipe, mutex, PID, image-name
  lookup, or path guess.
- A forwarding client opens the pipe with `CreateFileW` and identification-only
  security quality-of-service flags, sends a bounded challenge, verifies the
  server HMAC proof, then sends the capability-bound request HMAC and bounded
  argv. It never sends argv before endpoint proof and never uses
  `CallNamedPipe`.
- The server authenticates client identity and validates the frame and HMAC
  before invoking the activation handler. Corrupt, stale, expired, unbounded,
  or unauthenticated routes fail closed.
- In a formal elevated Windows release, tool-version probes and lifecycle
  commands stop at the elevated CLI boundary before searching for or executing
  user CLI tools. Development and test builds retain ordinary-user behavior.

## 8. Required Tests

- `tests/windowsNsisContract.test.ts` and
  `verify-windows-nsis-contract.mjs` pin configuration, template provenance,
  first-section ordering, shared final-path validation, final-handle volume
  classification, ProgramData ACL reset, bounded uninstall, and absence of
  legacy installer surfaces.
- `tests/windowsSigningAdapter.test.ts` covers absent/partial/malformed signer
  configuration, strict unsigned state, signed provider simulation, publisher,
  certificate, timestamp and EKU policy, Authenticode-only mutation, launcher
  architecture independence, producer probe limits, frozen-raw/candidate
  identity and diff, fresh verification-time mutation, link/realpath
  replacement, fragment drift, cross-architecture mismatch, and final SHA/size
  binding.
- `tests/releaseWorkflow.test.ts`, `tests/releaseAssets.test.ts`, and native
  workflow steps bind the raw-build/untrusted-producer/fresh-sealer topology,
  job-level secret isolation, unique artifact ownership, exact one-file
  handoffs, producer/sealer/lifecycle result truth table, two setup filenames,
  matching runners, signing fragments, lifecycle order, public status, release
  disclosure, subject count, attachment count, and removal of legacy package
  upload/query paths.
- `src-tauri/src/windows_runtime/mod.rs` unit tests retain bounded frame
  encode/decode, tamper/control/trailing-data rejection, privilege gating,
  SDDL predicates, descriptor decisions, and both server/request HMAC proofs.
- Non-Windows static tests are necessary but do not replace x64 and ARM64 native
  installation evidence. ARM64 preview-runner unavailability blocks acceptance
  instead of enabling cross-build or reduced-asset fallback.
