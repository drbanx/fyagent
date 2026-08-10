# Codex Desktop Installer Contract

## 1. Scope / Trigger

The Codex desktop installer spans Rust domain/source/platform code, the fixed
ordinary installer command surface, trusted application restart commands,
TypeScript query/hook/card consumers, and platform-specific verification. This
specification is the current owner of that executable cross-layer boundary: it
prevents user-controlled installer inputs, wire-format drift, cross-platform
version-label substitution, cross-user Windows package access, unsafe helper
activation, and untrusted process restart or launch. The interactive identity
proof it consumes is owned by
[Windows Runtime Security](./windows-runtime-security.md); the Codex Provider
mutation that may offer a restart is owned by
[Codex Provider Configuration](./codex-provider-configuration.md).

The separate current-user helper does not compensate for the task-wide
accepted regression in the optional upstream Trellis `0.6.14` Codex hooks.
Those hooks still lack FyAgent's former realpath containment, exact-source
import binding, strict session/input checks, and breadcrumb escaping; keep that
residual visible rather than describing this migration as equivalent hook
hardening.

## 2. Signatures

The ordinary Tauri command surface is exactly:

    codex_desktop_get_local_status()
    codex_desktop_check_latest(force: bool)
    codex_desktop_get_job()
    codex_desktop_start_install(request: StartInstallRequest)
    codex_desktop_cancel_install(job_id: string)
    codex_desktop_launch()
    codex_desktop_open_log_directory()

StartInstallRequest serializes as:

    { "expectedReleaseId": "v1:<64 lowercase hex characters>" }

No ordinary command accepts a URL, path, hash, identity, installer scope, or
validation-bypass flag. Windows has no pre-runtime headless/runas installer
mode and no all-users control/job schema.

The bundled Windows-only helper accepts exactly:

    fyagent-user-helper.exe codex-msix-install \
      --job-id <canonical-lowercase-uuid> \
      --pipe <64-lowercase-hex-characters>

It derives its install root from `current_exe()` and its only package path as
`cache/codex-installer/<job-id>/installer.msix` below that root. The helper
accepts no executable, command, URI, package path, scope, or validation bypass.
Its binary is independently manifested `asInvoker`, does not link Tauri, and
enables native deployment only through its private build feature.

The separate trusted Codex application runtime surface is:

    get_codex_desktop_runtime_status()
    request_codex_desktop_restart()
    continue_codex_desktop_restart_with_force(token)
    cancel_codex_desktop_restart_with_force(token) -> ()

These commands accept no PID, process name, executable path, user SID, or
renderer-supplied launch command. The force token is opaque, short-lived,
one-time, and bound server-side to the already verified installation, process,
and interactive-user context. These four commands do not expand the exactly
seven ordinary installer commands above.

The safe remote status exposed by `codex_desktop_check_latest` is:

    RemoteReleaseStatus {
        releaseId: string,
        displayVersion: string,
        platformVersion: PlatformVersion,
        expectedSize: number,
        checkedAt: string,
    }

For the active platform/architecture, `displayVersion` is the same
branch-validated release's UI label; `platformVersion` remains the authoritative
comparison value.

## 3. Contracts

### Source to service

- ReleaseSource may request only the fixed AgentsMirror manifest/checksum and
  platform short-link endpoints represented by TrustedDownloadEndpoint.
- Metadata URLs, redirect targets, delta URLs, and remote filesystem names
  never become a caller-controlled download target.
- The fixed manifest/checksum endpoints use the same manual redirect policy as
  package requests: at most five hops, HTTPS only, no user information, and
  no persisted final URL. This permits the current fixed endpoint's R2
  redirect without turning redirect metadata into a renderer capability.
- The release descriptor is valid only after manifest checksum, derived
  checksum, checksum-file, architecture, size, and platform-version checks
  agree.
- A platform card's `displayVersion` must come from the validated branch it can
  install: Windows uses that architecture's MSIX `version`; macOS uses the
  validated bundle short version. A manifest-wide aggregate version may
  describe another platform and must not be returned as the active Windows
  card's latest version.
- Windows derives the MSIX name from its validated package moniker. macOS
  derives the single safe .dmg name from the validated branch/derived checksum
  records; a missing or ambiguous match fails closed.

### Windows package inspection

- The bounded manifest preflight accepts classic ZIP and single-disk ZIP64.
  A ZIP64 locator must be adjacent to the classic EOCD, identify exactly one
  disk, and point to a fixed 56-byte ZIP64 EOCD with no extensible data. Any
  non-sentinel classic field must agree with the ZIP64 value, and the central
  directory must end exactly where the ZIP64 EOCD begins.
- Raw central-directory inspection remains mandatory before `ZipArchive`:
  every entry must start on disk zero, use a unique safe UTF-8 name, be
  unencrypted, point to a local header before the central directory, and fit
  the exact bounded entry count and directory size. Multi-disk metadata at the
  EOCD, locator, ZIP64 EOCD, or entry level fails closed.
- The parser bounds aggregate declared uncompressed size to 4 GiB but only
  decompresses the root `AppxManifest.xml`, which remains independently
  limited to 512 KiB. Increasing the aggregate declaration bound must never
  remove the manifest read bound or replace Windows PackageManager as the
  signature and package-trust authority.

### Windows interactive-user scope

- Ordinary Windows construction requires the immutable interactive-user
  context created before panic logging and Tauri. It contains the canonical
  Explorer Shell SID/session and Shell-owned Profile/LocalAppData/
  RoamingAppData paths, is internal-only and redacted, and is never
  reconstructed from package metadata or renderer input.
- The authority chain is `GetShellWindow` -> Shell PID/session -> Shell token
  SID and known folders. The elevated process may belong to Bob while the
  Shell belongs to Alice; SID equality is telemetry, not admission. Missing
  Shell, token/session failure, a noncanonical SID, missing Shell path, or a
  later frozen-context drift is unavailable/fail-closed. `WTSQueryUserToken`,
  ambient process environment, Bob, SYSTEM, cwd, and a default drive are not
  ordinary GUI fallbacks.
- Every ordinary inventory call passes the frozen SID and `PackageTypes.Main`
  to `FindPackagesByUserSecurityIdWithPackageTypes`, the locked Rust binding
  for the explicit-user PackageManager overload. Zero/one/multiple trusted
  Stable Main records for that SID mean not installed, one selected install,
  and ambiguous failure. Packages for another SID and non-Main package types
  never enter the candidate set.
- Inventory, helper launch, post-install verification, runtime inspection/
  termination, and launch all accept the same frozen context and return or
  consume context-bound evidence. Each native side-effect boundary re-proves
  the current Shell identity; missing or changed context and package/process
  owner mismatch stop the remaining lifecycle.
- Launch re-enumerates the same-user trusted Stable Main and requires it to be
  exactly the selected application before invoking Explorer. Restart treats
  multiple same-user Stable packages as ambiguous instead of using version or
  scope ordering to guess one. Runtime process evidence also requires the
  process token SID to match the frozen context.
- There is no all-users package facade, staged-package query, Stage, Provision,
  generic elevation command, parent control file, or fallback to another SID.

### Current-user helper and one-shot protocol

- The elevated parent creates the server before launching the fixed sibling
  helper through Explorer COM as the frozen Shell user. Explorer receives only
  the fixed action, canonical job ID, and random 256-bit nonce; neither side
  accepts an arbitrary program, command, package path, or URI. The helper
  launch wait is bounded and only one launch may remain in flight; a late COM
  completion sees a destroyed pipe and therefore cannot reach PackageManager.
- The named pipe uses the session-local `LOCAL\` namespace plus a fixed
  versioned prefix and the nonce,
  first-instance and reject-remote semantics, one message-mode connection, and
  bounded connect/operation timeouts. Its descriptor grants Alice only
  `FILE_WRITE_DATA | SYNCHRONIZE`; SYSTEM and Administrators retain only
  `READ_CONTROL`, never pipe data, synchronize, DACL-write, or owner-write
  access.
  This makes a wrong-token administrator or SYSTEM helper fail its fixed
  client open before it can call PackageManager. No generic-write alias may
  grant `FILE_CREATE_PIPE_INSTANCE`.
- The parent first reads one bounded raw frame because Windows pipe-client
  impersonation binds to the last frame read, but it neither decodes nor
  accepts that frame yet. It then validates the pipe client PID, process and
  impersonated-token SID/session, and exact pinned sibling-helper identity;
  explicitly reverts impersonation; and only then decodes the raw frame. A
  second connection, timeout, early exit, identity drift, or malformed peer is
  terminal and destroys the server.
- The versioned length-prefixed protocol has a small absolute frame cap and
  permits only `started`, strictly increasing `progress` in `0..100`, one
  `success`, or one structured bounded `error`. Unknown versions/variants,
  invalid UTF-8, trailing bytes, oversized lengths, progress regression, a
  missing start, or duplicate terminal frames fail the operation.
- The helper's private native runtime calls only current-user
  `PackageManager.AddPackageByUriAsync` with default signature enforcement. It
  cannot Stage, Provision, invoke another process, construct Tauri, or reuse a
  renderer command.

### Activation sequencing

The helper binary, protocol, Explorer launch, and authenticated parent pipe may
land before the final staging migration, but that scaffolding must remain
outside the production install call chain. During that intermediate batch,
Windows `install_current_user` fails closed after verification; it must not
copy a validated system-temp artifact into the helper's fixed path or run the
helper without an open byte-identity pin.

Production activation is atomic with install-root staging and the share-
restricting verified-file handle in the following staging/pin batch. This
ordering prevents a commit boundary from introducing a re-open/copy TOCTOU
window and keeps rollback from leaving the helper consuming weaker bytes. A
pipe timeout, progress-write failure, handler-registration failure, or early
disconnect must not release that handle while `AddPackageByUriAsync` may still
be running: the helper must cancel and observe the operation's terminal state,
or ownership of the pin must remain alive until helper/PackageManager
completion is independently established.

### Trusted Provider-triggered application restart

- The renderer offers a Codex application restart prompt only after a
  successful Codex Provider mutation reports `liveConfigChanged: true` and the
  backend reports exactly one trusted running instance. Configuration save and
  application restart are separate outcomes; a failed or cancelled restart
  never rolls back saved configuration.
- Windows process identity derives from the already verified Stable Main
  package and the frozen interactive-user SID. A same-PFN process owned by a
  different SID is not a candidate. macOS requires the verified bundle
  identity and path. Fuzzy image/process-name matching and generic termination
  or launch commands are forbidden.
- A restart requests graceful exit and waits at most 8 seconds. If the verified
  process remains alive, return an opaque force-confirmation token. Only a
  second explicit user confirmation may force-terminate it. Cancellation is a
  best-effort discard of the pending capability only: it never closes,
  terminates, or launches a process, and its empty response reveals neither
  token validity nor installation/process existence.
- Launch occurs only after the old verified process exits, through the
  originally selected verified installation. Wait at most 15 seconds for a new
  process belonging to that same trusted installation and context.
  Installation, package owner, context, or identity drift is a no-launch/manual
  failure, not an opportunity to select another candidate.
- Not-running, unsupported, ambiguous, deferred/manual user choice, and restart
  failure never auto-launch a process. On Windows, close and launch re-enumerate
  only the frozen SID's trusted Main packages; zero or multiple matching Stable
  records prevent automatic restart. The ordinary path never queries the
  all-users capability or chooses another SID or highest version.

### Rust to renderer

- Rust serializes camelCase DTO fields and snake_case tagged enum values where
  declared by serde.
- JobSnapshot is a complete authoritative snapshot. The renderer merges events
  by jobId and monotonic sequence; it does not implement installer state
  transitions itself.
- The renderer may format `completedBytes / totalBytes` as a byte pair only
  while the view state is `job_downloading`. Installation progress reuses those
  numeric DTO fields for platform-native progress units: Windows reports a
  `0..100 / 100` deployment ratio and macOS reports `0..3 / 3` installation
  steps. Download verification and installation states may still render the
  derived percentage or an indeterminate progress bar, but must not label their
  counters as bytes.
- Download speed is a renderer-only interval measurement derived from adjacent
  accepted snapshots for the same job, using increasing `completedBytes` and
  `updatedAt`. The first sample, a non-increasing byte/time delta, invalid input,
  a different job, missing progress, or leaving the `downloading`/`download`
  stage resets the displayed speed while retaining a valid current sample as
  the next baseline. Bind a measurement to its `jobId` and `sequence` so an
  effect-driven state update cannot briefly expose the previous snapshot's
  speed; append `/s` only for the download stage. Do not add this display-only
  value to the Rust or TypeScript wire DTO.
- The canonical fixture tests/fixtures/codexDesktopDtoContract.v1.json is
  produced-equivalent to Rust DTO serialization and parsed by the TypeScript
  contract test.

### Job lifecycle

- At most one job may occupy the installer slot.
- A cancellation request keeps that slot until the worker has stopped
  cancellable work and cleaned its temporary files; only then may the snapshot
  become cancelled.
- A settings-triggered application restart must call
  `CodexDesktopService::claim_restart()` before saving state, cleanup, or
  re-exec. `claim_restart()` and `JobStore::try_start()` share one mutex: only
  an empty or terminal slot may claim restart; a cancellable, cancellation-
  pending, installing, or post-install-verifying job returns
  `JOB_ALREADY_RUNNING` without being cancelled or replaced. A successful
  claim rejects later starts until process re-exec clears the in-memory state.
- The renderer's default Tauri capability must not grant
  `process:allow-restart`. Renderer-initiated restarts use the controlled
  `restart_app` command above, so no frontend path can bypass the restart
  claim while an installer job owns the slot. The narrower
  `process:allow-exit` may remain for established explicit quit paths, which
  must continue through the application exit guard; never replace it with
  `process:default`.
- Before an install, the service force-refreshes metadata and rejects a changed
  releaseId with METADATA_CHANGED; the renderer must refresh and require a
  separate new Install/Update action.
- After that refresh and before preflight/download, the service re-detects the
  trusted local Stable application. If its platform version is equal to or
  newer than the descriptor, it launches that verified application and finishes
  the job through the narrow launch-only success path. It must create no temp
  directory and perform no disk probe, download, package validation, or install.
- A terminal checksum mismatch first deletes the fixed local artifact, then
  force-refreshes metadata exactly once for classification: a changed releaseId
  becomes METADATA_CHANGED; an unchanged releaseId remains CHECKSUM_MISMATCH.
- `VerifiedPackage` retains the locked descriptor, not only a previously
  verified path. macOS reopens the canonical UUID artifact immediately before
  DMG attach, rejects a non-regular/link/path-drift artifact, and rechecks exact
  size and SHA-256. Windows, after every metadata/package check succeeds,
  reopens the install-root artifact with `GENERIC_READ + FILE_SHARE_READ`,
  captures and rechecks volume serial/file index/size, and retains that handle
  until the helper and PackageManager are terminal. Neither platform may
  consume an artifact after its continuity check fails; macOS also validates
  the mounted Stable bundle against the same descriptor's exact platform
  version.
- macOS standard-directory scanning uses a tolerant identifier probe before
  Stable-only validation. A malformed, non-file, missing-identity, or
  parse-rejected unrelated bundle is skipped. A top-level `.app` symlink whose
  canonical target escapes `/Applications` or `~/Applications` is also skipped
  before reading its identifier, so an unrelated external alias cannot block
  local discovery;
  only an exact `com.openai.codex` probe enters the strict version, executable,
  architecture, Team, codesign, and Gatekeeper checks. Downloaded/mounted
  package discovery keeps the strict wrapper and rejects every escaped `.app`
  candidate. Directory-enumeration failure, a non-symlink local canonical-path
  escape, or a known Stable candidate's strict failure remains fail closed.

## 4. Validation & Error Matrix

| Condition                                                                                                                      | Required result                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remote metadata has a changed release ID                                                                                       | METADATA_CHANGED, suggested action refresh; do not install the new release implicitly.                                                                                  |
| Manifest-wide aggregate version differs from the active platform branch                                                        | Expose the branch's validated displayVersion and platformVersion; never derive an active-card latest label or update state from the aggregate.                          |
| Locked metadata's artifact checksum mismatches and the refresh changes release ID                                              | METADATA_CHANGED; delete the artifact and require an explicit refreshed action.                                                                                         |
| Trusted local Stable version is equal to or newer than the descriptor                                                          | Launch only; no preflight, download, temporary directory, package validation, or install.                                                                               |
| Another job is active or cancellation cleanup is pending                                                                       | JOB_ALREADY_RUNNING; retain the single-job slot.                                                                                                                        |
| Settings restart races with a start request                                                                                    | Exactly one may claim the same mutex; a running/cancellation-pending job blocks restart, and a successful restart claim blocks later starts.                            |
| Hash sources disagree or an artifact name is unsafe/ambiguous                                                                  | CHECKSUM_MISMATCH, CHECKSUM_MISSING, or RELEASE_METADATA_INVALID; never guess an artifact.                                                                              |
| Metadata or download redirect leaves HTTPS/allowlist policy                                                                    | REDIRECT_REJECTED.                                                                                                                                                      |
| Artifact changes after package verification but before a platform consumes it                                                  | CHECKSUM_MISMATCH or a stable artifact-validation error; do not call deploy or attach.                                                                                  |
| Download is cancelled before installation                                                                                      | Worker cleans temp data, then publishes cancelled.                                                                                                                      |
| Renderer receives `completedBytes` / `totalBytes` after `job_downloading`                                                      | Keep percentage/indeterminate progress, but do not render the numeric pair with byte units.                                                                             |
| A Windows MSIX uses bounded, internally consistent, single-disk ZIP64 metadata                                                 | Continue raw central-directory and `ZipArchive` inspection; do not reject ZIP64 solely because classic EOCD fields contain sentinels.                                   |
| ZIP/ZIP64 disk fields disagree, ZIP64 records are missing/misplaced/extensible, or directory bounds drift                      | PACKAGE_PARSE_FAILED before manifest parsing or PackageManager deployment.                                                                                              |
| Declared ZIP uncompressed total exceeds 4 GiB or its checked sum overflows                                                     | PACKAGE_PARSE_FAILED; do not weaken the separately bounded 512 KiB root-manifest read.                                                                                  |
| Platform verification, signature, identity, architecture, or post-check fails                                                  | Stable platform/package error; do not launch or downgrade.                                                                                                              |
| Process is Bob and the frozen Explorer Shell user is Alice                                                                     | Discover, install, verify, restart, and launch for Alice; never select Bob or require process/Shell SID equality.                                                       |
| Interactive context is missing/drifts, an inventory receipt names another context, or a package/process belongs to another SID | Fail the ordinary operation before the next helper, close, or launch side effect; never fall back to another user or all-users inventory.                               |
| The same interactive SID has more than one trusted Stable Main package                                                         | Discovery returns non-retryable `MULTIPLE_INSTALLATIONS` plus `resolve_path_conflict`; restart reports `ambiguous/installations`; neither selects, closes, or launches. |
| Helper peer PID/image/session/SID is wrong, a second client arrives, or connect/operation timeout expires                      | Destroy the one-shot server and fail the job before accepting a deployment result.                                                                                      |
| Helper frame has an unknown version/kind, exceeds the cap, regresses progress, arrives before `started`, or repeats terminal   | Reject the protocol and fail the job; never reinterpret arbitrary bytes or continue with PackageManager.                                                                |
| Helper scaffolding exists before install-root staging and the verified-file pin are available                                  | Windows install fails closed; do not copy from system temp, activate the helper, or weaken byte continuity.                                                             |
| Pinned Windows artifact identity drifts or cannot be opened with the required share mode                                       | Fail before Explorer launches the helper and keep PackageManager unreachable.                                                                                           |
| Provider save leaves live Codex bytes unchanged, or runtime status is not exactly one trusted running instance                 | Do not offer or start the Provider-triggered restart flow.                                                                                                              |
| Graceful close exceeds 8 seconds                                                                                               | Return an opaque force-confirmation capability; do not terminate automatically.                                                                                         |
| Force continuation is malformed, expired, reused, or bound to a drifted installation/process/context                           | Reject without closing, terminating, or launching another process.                                                                                                      |
| The replacement process is absent after 15 seconds                                                                             | Return restart failure, preserve saved configuration, and direct the user to manual recovery.                                                                           |
| Ordinary renderer tries to provide scope/URL/path/extra request field                                                          | DTO deserialization or validation rejects it.                                                                                                                           |
| Helper CLI adds/reorders/duplicates an option or names a command, package path, URI, scope, noncanonical job ID, or nonce      | Reject before pipe connection or PackageManager creation.                                                                                                               |

Diagnostics may contain only the structured, redacted fields of
InstallerErrorDto; never pass raw credential-bearing URLs, paths, cookies, or
installer command lines to the renderer.

## 5. Good / Base / Bad Cases

### Good

The renderer observes release A, calls start_install with expectedReleaseId A,
and the service re-resolves A before it downloads through the fixed platform
endpoint. A complete snapshot event lets the renderer show progress.

If the manifest's aggregate version differs from the Windows artifact version,
the Windows card displays that artifact's version and compares the canonical
four-part MSIX tuple. It does not imply that a macOS release is installable on
Windows.

### Base

Metadata is unavailable while a verified local app exists. The service reports
the remote failure while the renderer retains the separate local Launch action.

### Bad

    // Wrong: turns a metadata response into a download capability.
    invoke("codex_desktop_start_install", {
      request: { expectedReleaseId, url, path, scope: "all_users" },
    });

The command DTO must reject the extra fields, and the renderer must never offer
such controls.

## 6. Tests Required

- Rust: source checksum/artifact-name derivation, release-ID vectors, job
  transition/sequence/cancellation races, restart-claim-versus-start race,
  default-capability rejection of an uncoordinated renderer process restart
  while retaining only the guarded exit capability,
  replacement-after-verification regression paths that prove Windows deployment
  and macOS attach are not reached,
  macOS malformed-unrelated-bundle scan regressions alongside known-Stable
  fail-closed fixtures, plus the policy split that skips an escaped top-level
  local `.app` symlink while strict mounted-package discovery rejects it,
  service metadata-drift and checksum-reanchor behavior, direct same/newer
  local-version launch-only behavior, platform fixture/fake tests, DTO fixture
  equality, and a fixture whose manifest-wide aggregate version differs from
  the Windows branch and proves `displayVersion` remains branch-specific.
  Windows manifest fixtures must also cover a valid single-disk ZIP64 footer,
  classic/ZIP64 metadata disagreement, missing or misplaced records, inserted
  data between the central directory and ZIP64 EOCD, entry-level non-zero disk
  start, bounded production-scale uncompressed declarations, the 4 GiB limit,
  and checked-sum overflow.
- TypeScript: import and parse tests/fixtures/codexDesktopDtoContract.v1.json;
  enumerate every frozen enum/tag branch and consume the complete snapshot.
  Component coverage must prove `job_downloading` retains percentage plus the
  formatted current/total byte pair and a finite speed after a second valid
  sample. Hook coverage must prove first/invalid/non-increasing samples and
  job/phase/progress resets cannot retain stale speed, while a later valid
  sample recovers from the new baseline. `job_installing` with non-null
  current/total/speed values renders the percentage without any byte or `/s`
  label.
- Integration: static audit that ordinary IPC has no all-users, headless,
  runas, URL/path/scope, or custom-command surface, and each ordinary command
  remains registered exactly once.
- Helper: portable Rust tests reject every CLI shape except the fixed action,
  canonical UUID, and 64-character lowercase nonce; derive only the fixed
  install-root layout; cover every bounded protocol enum, version, length,
  UTF-8, order, monotonic-progress, timeout, early-exit, duplicate-terminal,
  and error mapping path. Static tests prove the crate's default feature is
  protocol/layout-only, the binary opts into its private runtime, the manifest
  is `asInvoker`, client access is minimal, each message is one `WriteFile`,
  and the helper contains AddPackage only—never Stage, Provision, Tauri, or
  generic process execution.
- Parent helper boundary: portable fakes cover nonce creation, first-instance/
  local-only/message-mode pipe creation, Alice/SYSTEM/Administrators DACL,
  PID/token SID/session and exact-image admission, one connection, timeouts,
  malformed/ordered frames, and guaranteed handle destruction. The helper-
  scaffolding batch also proves production Windows installation is fail-closed
  until install-root staging and the verified-file pin activate together.
- Platform acceptance: real Windows x64/ARM64 jobs own Explorer launch, pipe
  identity, PackageManager, setup, UAC, and uninstall evidence. Apple Silicon
  macOS and mainland-network evidence remain separately owned; portable tests
  do not replace any native claim.
- Windows user scope: hermetic multi-SID fakes prove explicit SID/Main calls,
  other-user exclusion, same-user 0/1/multiple behavior, context receipt drift,
  owner drift, post-verify continuity, launch/restart revalidation, and zero
  fallback into another-user or all-users capability. If a unique record becomes
  multiple during post-install or pre-launch revalidation, tests retain
  non-retryable `MULTIPLE_INSTALLATIONS` and prove launch is not called. A
  native smoke on both matching
  Windows architectures calls only the real explicit-SID/Main WinRT adapter,
  permits an empty result, and uses no Store/network/real Codex/multi-account
  dependency.
- Provider-triggered restart: cover unchanged/failed/non-Codex saves, exact-one
  trusted-running admission, graceful success, 8-second force confirmation,
  one-time/mismatched/expired/cancelled capabilities, context/package/process
  drift, no launch before exit, 15-second launch verification, and
  not-running/unsupported/ambiguous/manual outcomes. Multi-SID fixtures prove
  another user's same-PFN process cannot be inspected, closed, or launched and
  that the ordinary restart path never broadens inventory scope.

## 7. Wrong vs Correct

### Wrong

    // A fixed marketing filename breaks when the signed upstream DMG is renamed.
    let artifact_name = "Codex-mac-arm64.dmg";

### Correct

    // Select only the unique safe DMG whose checksum record agrees with the
    // validated macOS branch, then keep downloading through the fixed endpoint.
    let artifact_name = derive_macos_arm64_artifact_file_name(
        &manifest.derived.latest_checksums,
        artifact.sha256.as_deref(),
    )?;

The filename is data used to cross-check integrity metadata, not a path or
remote URL capability.

### Wrong

```rust
// A root aggregate can describe a different platform release.
display_version: manifest.codex_version.to_owned(),
```

### Correct

```rust
// The card can only label the version its active architecture can install.
display_version: validated_windows_artifact.version.to_owned(),
```

Keep update-state comparison on the canonical `platformVersion`, not on either
display string.

### Wrong

```rust
// Copying already-verified temporary bytes to the helper layout breaks the
// identity chain before the Shell user reopens the destination.
std::fs::copy(system_temp_artifact, helper_fixed_path)?;
launch_user_helper(helper_fixed_path)?;
```

### Correct

```rust
// Stage at the helper's fixed install-root path, then pin that exact identity
// against write/delete/rename until PackageManager and the helper are done.
let pinned = VerifiedFilePin::open(final_install_root_artifact)?;
run_pinned_user_helper(&context, job_id, &pinned).await?;
```

Likewise, do not merely inspect the installer job before a delayed restart:
claim the shared job-store mutex first, so a new worker cannot start during the
response/re-exec window.

### Wrong

```tsx
// Installation counters are not necessarily byte counts.
const completedText = formatBytes(progress?.current);
const totalText = formatBytes(progress?.total);
```

### Correct

```tsx
// Only the download stage owns byte-labelled progress in the card.
const showDownloadBytes = state === "job_downloading";
const completedText = showDownloadBytes ? formatBytes(progress?.current) : null;
const totalText = showDownloadBytes ? formatBytes(progress?.total) : null;
```
