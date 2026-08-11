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

The separate helper does not compensate for the accepted optional Trellis
`0.6.14` hook regression: the former FyAgent containment, exact-import,
session/input, and breadcrumb-escaping overlay checks are not retained.

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

It derives its install root from `current_exe()` only to bind the installed
helper image. It does not derive a package path from that tree. After `Hello`
peer authentication it accepts one fixed bridge control and independently
resolves the fixed CommonApplicationData bridge. The helper accepts no
executable, command, URI, package path, bridge root, operation ID, scope, or
validation bypass on the CLI. Its binary is independently manifested
`asInvoker`, does not link Tauri, and enables native deployment only through its
private build feature.

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
  completion cannot rely on the nonce alone to reach PackageManager.
- The named pipe uses the session-local `LOCAL\` namespace plus a fixed
  versioned prefix and the nonce,
  first-instance and reject-remote semantics, one message-mode connection, and
  bounded connect/operation timeouts. It is duplex because the parent sends one
  fixed-width bridge control after authenticating `Hello`. Its
  BA-owned descriptor grants Alice only `FILE_READ_DATA`, `FILE_WRITE_DATA`,
  `READ_CONTROL`, and `SYNCHRONIZE`; SYSTEM and Administrators retain only
  `READ_CONTROL`. No generic-write alias may grant `FILE_CREATE_PIPE_INSTANCE`.
- The BA-owned admission and cancellation events grant Alice only
  `READ_CONTROL | SYNCHRONIZE`; the parent alone keeps modify-state handles.
  The helper opens, never creates, both events and the pipe once, and verifies
  the actual owner of all three handles is Builtin Administrators. After
  parent teardown, missing objects or Alice-created replacements therefore
  fail before `Hello`/AddPackage. Cancellation is tested before admission so
  simultaneous signals cannot deploy.
- The parent first reads one bounded raw frame because Windows pipe-client
  impersonation binds to the last frame read, but it neither decodes nor
  accepts that frame yet. It validates the pipe-reported client PID/session,
  opens the process only for synchronization and exact pinned image proof, and
  obtains SID/session from the impersonated pipe-client token—never from a
  separately opened process token. It explicitly reverts impersonation before
  decoding the raw frame and requires it to be the fieldless `Hello`.
- The parent-to-helper bridge control is exactly 80 bytes: `0..8 = "FYABRIDG"`,
  `8 = version 2`, `9..24 = zero`, three u64-le fields at `24..48` for expected
  volume serial/file index/size, and the random 256-bit operation ID at
  `48..80`. It contains no host, URI, filename, filesystem path, user SID, mode,
  or hash. The operation ID is generated by the parent, never appears on the
  CLI, renders only as one 64-character lowercase hexadecimal directory, and is
  never reused.
- The only admitted ordering is `Hello` -> authenticate PID/session/SID/image ->
  bridge control -> helper bridge/URI proof ->
  `Started { volume serial, file index, size }` -> parent context/pin recheck ->
  admission signal -> strictly increasing `progress` in `0..100` -> one
  `success` or one structured bounded `error`. Unknown versions/variants,
  invalid UTF-8, trailing bytes, oversized lengths, progress regression, missing
  or duplicate steps, or any out-of-order control/frame/signal fails. Before
  admission, such protocol/transport failures may terminate with a structured
  error because PackageManager has not run. After admission, any invalid
  progress or terminal, duplicate/extra data, protocol/transport failure,
  timeout, early exit, or unclean close requires best-effort cancellation and
  then permanent process-lifetime quarantine: the Job remains `Installing`, no
  terminal result is published to the renderer, and no cleanup occurs. The
  helper must not resolve an operation before control or call PackageManager
  before admission.
- The helper's private native runtime calls only current-user
  `PackageManager.AddPackageByUriAsync` with default signature enforcement. It
  cannot Stage, Provision, invoke another process, construct Tauri, or reuse a
  renderer command.

### Protected ProgramData package bridge and lifetime

- The only package-consumption path is
  `<FOLDERID_ProgramData>\FyAgent.PackageBridge-{96F39D37-0F42-486F-8C86-3631C12171C5}\v1\<64-lowercase-hex-operation-id>\installer.msix`.
  It is a one-operation PackageBridge owned by the application installer module,
  not the retired `%ProgramData%\FyAgent\runtime` state/lease/HMAC/control tree,
  not install-root staging, and not an NSIS-owned directory.
- The parent resolves `FOLDERID_ProgramData` with the known-folder API and
  requires a local fixed NTFS volume with stable file IDs. It never hard-codes
  `C:\ProgramData`, reads an environment override, or falls back to Temp, cwd,
  the install-root package name, a network source, or HTTP. It also evaluates
  ProgramData-parent access; any Alice `DELETE_CHILD` route that can invalidate
  the fixed root fails closed.
- The fixed product root and `v1` are held-parent/no-follow directories. A new
  object is created with, and an existing object is accepted only after proving,
  exact BA owner/group and one stable protected allow-only DACL independent of
  Alice: BA gets lifecycle management, SYSTEM gets necessary read/traverse, and
  Authenticated Users (`AU`) gets stable directory `FILE_GENERIC_EXECUTE`
  semantics—traverse, read attributes, `READ_CONTROL`, and synchronize—to reach
  an already-known child, never list/create/write/delete/delete-child. Drift is
  rejected, not repaired, and the stable roots are never rebound to the first
  Alice.
- Every operation directory and `.part`/final file is create-new through held
  parent handles. Its separate protected DACL grants BA management, minimum
  SYSTEM read/traverse, and minimum read/traverse to the exact frozen Alice SID.
  Alice has no create, append, write, rename, POSIX replace, delete,
  delete-child, hard-link, reparse, write-DAC, or write-owner route. Broad users,
  Authenticated Users, Everyone, and application-package groups receive no
  operation-object access through inheritance.
- Before the copy, `GetDiskFreeSpaceExW` queries the actual ProgramData volume;
  the extra full MSIX copy is an accepted disk cost and actual copy failures are
  authoritative. The parent streams only from the already verified source
  handle into create-new `installer.msix.part`, handles short reads/writes while
  computing exact length and SHA-256, calls `FlushFileBuffers`, and performs a
  handle-relative no-replace rename. It then reopens `installer.msix` no-follow
  with `GENERIC_READ + FILE_SHARE_READ` and proves exact SHA/size/source-object
  continuity, file ID, owner/group/DACL, ordinary-file/reparse/placeholder state,
  and link count. Parent preflight remains release SHA/size plus bounded ZIP/
  manifest publisher/name/version/architecture/OS validation; the native MSIX
  signature chain remains PackageManager's sink authority.
- After control, the helper independently resolves the fixed hierarchy, proves
  every ancestor and the final leaf no-follow, and requires the parent-supplied
  identity. It calls `UrlCreateFromPathW` only for the protected object's
  ordinary DOS path, round-trips it with `PathCreateFromUrlW`, rejects UNC/host,
  query/fragment, extended or overlong paths and encoding ambiguity, then
  reopens no-follow and proves the same file identity before `Started`. The URI
  is a consumer-compatible name, not the security boundary.
- The parent keeps the verified source pin, bridge ancestor/file handles,
  helper-image pin, controls, pipe, and admitted process in one lifetime through
  settlement. Normal cleanup is permitted only after an authenticated
  non-`Started` WinRT terminal status, its matching valid terminal frame, and a
  clean pipe close. Timeout, protocol loss, ambiguous synchronous AddPackage
  failure, unknown operation status, crash, or termination leaves the immutable
  operation as an orphan; helper exit code or process termination is never
  terminal proof.
- The application bridge module owns normal cleanup and the next elevated bridge
  creation's bounded orphan cleanup. Both operate through held handles and admit
  only the fixed hierarchy, canonical operation IDs, exact expected
  owner/group/DACL, `installer.msix.part`, `installer.msix`, and empty owned
  directories. Unknown, reparse, ACL-drifted, inaccessible, nonempty, or changing
  objects survive. NSIS never enumerates, repairs, or removes PackageBridge.

### A1 evidence and residual-risk boundary

- A1 is the only implementation in this delivery: Alice calls current-user
  `AddPackageByUriAsync` on the protected local file URI after admission. The
  product minimum Windows version remains unchanged; existing host/package
  `MinVersion` and OS preflight fail before helper launch when unsupported.
- This delivery intentionally does not run HIL, locally or in GitHub Actions.
  Its present evidence is limited to static contract tests, scoped
  Windows-target compilation checks, and code/security review. Those checks do
  not verify A1 on real Windows 10 or Windows 11, x64 or ARM64, a real
  Bob-elevated/Alice-Explorer-Shell boundary, PackageManager consumption of the
  protected DOS file URI, effective ACL and mutation-denial behavior, or
  terminal/orphan cleanup. All remain explicit, unverified residual risks, and
  this delivery must not be described as native-compatible or native-runtime-
  verified on the basis of the present evidence.
- A2 is not a compiled or shipped fallback branch in A1. Only future independent
  native validation plus an explicit, separately authorized design decision may
  start a separate A2 implementation/review. If separately implemented, the
  parent may Stage only the same protected bridge to a true terminal result and
  the Alice helper may Register only the exact PackageFullName. It supplies no
  dependency/optional/related URI, rejects or independently proves dirty staged
  state, never Provisions, and never blindly calls `RemoveForAllUsers`. Runtime
  HRESULT, ACL, disk, timeout, or laboratory availability never selects A2.

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
- Every normal exit or settings-triggered restart must call
  `CodexDesktopService::claim_process_lifecycle_transition()` before saving
  state, cleanup, exit, or re-exec. That claim and `JobStore::try_start()` share
  one mutex: only an empty or terminal slot may claim the process lifecycle.
  A cancellable, cancellation-pending, installing, or post-install-verifying
  job returns `JOB_ALREADY_RUNNING` without being cancelled or replaced. A
  successful process-lifetime, idempotent claim rejects later starts until exit
  or re-exec.
- The renderer's default Tauri capability must not grant
  `process:allow-restart`, `process:allow-exit`, or `process:default`.
  Renderer-initiated restarts use the controlled `restart_app` command above;
  explicit renderer exits use the fixed-code `exit_app` command. Both commands
  acquire the same process-lifetime lifecycle claim before cleanup, exit, or
  re-exec, so the renderer cannot forge `RESTART_EXIT_CODE` or bypass an
  installing/quarantined job's process-lifetime pin.
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
  captures and rechecks volume serial/file index/size, copies only from that
  handle into the protected bridge, and retains both source and bridge
  capabilities until authenticated WinRT settlement. Neither platform may
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

### Residual process boundaries

- The Alice helper is `asInvoker`, not a protected process. Same-SID code
  injection, memory writes, or handle manipulation remain within Alice's
  existing current-user PackageManager authority; resisting that attacker
  requires the excluded protected broker/service architecture.
- Normal renderer, restart, exit, setup, and uninstall paths preserve an
  admitted `HelperLifetime`. Administrator force-kill, process crash, and OS
  shutdown can still destroy this in-process authority and are not durable
  terminal proof; they leave a protected immutable bridge orphan for the next
  application-owned elevated bridge creation to inspect conservatively.
- NSIS requests normal shutdown and never force-terminates FyAgent or its
  helper. Its final process lookup is a point-in-time check, not an atomic
  launch interlock; a persistent installer/application handoff is outside this
  contract. NSIS owns neither PackageBridge settlement nor orphan cleanup.

## 4. Validation & Error Matrix

- Remote release-ID drift, including drift discovered while classifying a
  checksum failure -> `METADATA_CHANGED`; delete the artifact and require an
  explicit refreshed action.
- Aggregate version differs from the active platform branch -> expose the
  branch-validated `displayVersion` and `platformVersion` only.
- Equal/newer trusted Stable is already present -> launch only; no temp,
  preflight, download, validation, or install.
- Another job or cancellation cleanup owns the slot ->
  `JOB_ALREADY_RUNNING`. A lifecycle-claim/start race has exactly one winner.
- Hash/name metadata disagrees or is ambiguous -> `CHECKSUM_MISMATCH`,
  `CHECKSUM_MISSING`, or `RELEASE_METADATA_INVALID`; never guess. A redirect
  leaving HTTPS/allowlist policy -> `REDIRECT_REJECTED`.
- A verified artifact or pinned identity drifts -> stable artifact-validation
  error before deploy/attach/helper launch.
- Download cancellation -> stop I/O, clean job temp, then publish cancelled.
- Counters arrive outside `job_downloading` -> percentage/indeterminate only;
  never byte labels or `/s`.
- Valid bounded single-disk ZIP64 -> continue inspection. Disk/record/bounds
  disagreement, aggregate >4 GiB, or checked overflow ->
  `PACKAGE_PARSE_FAILED`; retain the 512 KiB manifest bound.
- Signature, identity, architecture, platform, or post-check fails -> stable
  package/platform error; never launch or downgrade.
- Bob process/Alice Shell -> all ordinary operations use Alice. Missing/drifted
  context, foreign owner/receipt, or multiple trusted Stable Main packages ->
  fail closed without user-scope fallback or candidate selection.
- Wrong helper PID/image/session/SID, package identity, second client,
  pre-admission invalid frame/order/transport, or admission timeout -> cancel
  before admission, report only a structured error, and never call
  PackageManager.
- Wrong bridge GUID/version, unsafe ProgramData volume/parent, fixed-root or
  `v1` ACL/owner/group drift, operation preimage, or Alice `DELETE_CHILD` route
  -> fail without repair or alternate source.
- ProgramData capacity failure, short copy, hash/size/object drift, reparse/
  placeholder/hard-link state, or DOS file-URI round-trip ambiguity -> fail
  without Temp/cwd/install-root/network fallback and retain source pins until
  settlement is known.
- Any post-admission invalid progress/terminal, duplicate or extra data,
  protocol/transport error, timeout/disconnect, unclean close, or unobservable
  AddPackage terminal -> best-effort cancel, then permanent process-lifetime
  quarantine. Keep the Job `Installing`, publish no renderer terminal, perform
  no cleanup, retain the complete lifetime or immutable orphan, and never reuse
  the operation ID. Only an authenticated valid terminal status, its matching
  valid terminal frame, and a clean pipe close permit cleanup.
- No HIL is run in this delivery -> record the Windows runtime behaviors as
  unverified residual risks and make no native-compatibility or
  native-runtime-verification claim. Only future independent native validation
  plus an explicit, separately authorized decision may open an A2
  implementation/review; never select A2 at runtime.
- Provider bytes unchanged or runtime not exactly one trusted process -> no
  restart offer. Graceful close >8 seconds -> opaque force token only. Invalid,
  expired, reused, or drifted token -> no close/terminate/launch. Replacement
  absent after 15 seconds -> failure with manual recovery.
- Renderer adds scope/URL/path/extra fields, or helper CLI adds/reorders/
  duplicates fields or uses a noncanonical ID/nonce -> reject before the
  privileged boundary.

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
  installed helper layout; cover every bounded protocol enum, version, length,
  UTF-8, order, progress, timeout, early-exit, duplicate-terminal, and error
  mapping path. Cover exact 80-byte `FYABRIDG` version/reserved/identity/
  operation-ID validation, canonical 64-hex rendering, and DOS file-URI
  construction/round trip. Static tests prove `asInvoker`, minimal duplex access,
  AddPackage only, and no Stage, Provision, Tauri, generic execution, arbitrary
  URI/path, HTTP, Temp, cwd, or install-root fallback.
- Parent/helper bridge: tests cover cryptographic nonce/operation-ID generation,
  first-instance local message pipe, exact DACL/BA ownership, raw-frame peer
  authentication, exact `Hello`/control/`Started`/admit ordering, identity
  rechecks, and one connection. Bridge tests cover the fixed GUID/root/version,
  stable root ACL versus exact-Alice operation ACL, held-parent create-new/
  no-follow operations, ProgramData parent effective rights and volume capacity,
  short copy/hash/flush/no-replace rename, file/link/reparse/placeholder/owner/
  group/DACL drift, Unicode/space/%/# URI round trips, and every Alice mutation
  attempt. Failure tests prove authenticated non-`Started` WinRT terminal plus
  valid terminal frame plus clean-close settlement, immutable ambiguous orphans,
  application-owned next-creation known-only cleanup, NSIS non-ownership, and
  complete-lifetime retention for every ambiguous post-admit path. Job tests
  race the atomic lifecycle claim against `try_start` and prove renderer
  capabilities expose no raw process exit/restart API.
- Platform acceptance: this delivery runs no Windows HIL, locally or in
  Actions. Static contracts, scoped Windows-target compilation checks, and
  review do not prove Explorer launch, pipe identity, PackageManager, setup,
  UAC, uninstall, protected file-URI consumption, effective ACL enforcement, or
  cleanup on real Windows 10/11, x64/ARM64, or Bob-elevated/Alice-Shell systems.
  Those are explicit unverified residual risks; portable evidence must not be
  reported as native compatibility or native runtime verification. Apple
  Silicon macOS and mainland-network evidence remain separately owned. A2
  remains absent and requires future independent native validation plus a
  separate explicit decision; missing evidence or any runtime condition never
  selects it.
- Windows user scope: hermetic multi-SID fakes prove explicit SID/Main calls,
  other-user exclusion, same-user 0/1/multiple behavior, context receipt drift,
  owner drift, post-verify continuity, launch/restart revalidation, and zero
  fallback into another-user or all-users capability. If a unique record becomes
  multiple during post-install or pre-launch revalidation, tests retain
  non-retryable `MULTIPLE_INSTALLATIONS` and prove launch is not called. No
  native smoke runs in this delivery; real explicit-SID/Main WinRT adapter
  behavior on either Windows architecture remains unverified rather than being
  inferred from the hermetic fakes.
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
// Pin the install-root artifact, create one protected immutable bridge copy,
// and keep both object capabilities through authenticated WinRT settlement.
let pinned = VerifiedFilePin::open(final_install_root_artifact)?;
let bridge = PackageBridgeLifetime::create(&context, &pinned)?;
run_pinned_user_helper(&context, job_id, pinned, bridge, progress, deadlines)?;
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
