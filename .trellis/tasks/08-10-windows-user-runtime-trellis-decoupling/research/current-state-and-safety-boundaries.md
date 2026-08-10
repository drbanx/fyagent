# Current state and safety boundaries

## Purpose

This research captures the repository state that the replacement design must
either preserve or intentionally supersede. It is task-local evidence, not a
second product specification.

## Baseline identity

- Task base: `b6f60dfe0b4e815fdb9eb3ba446c827dc41e0527` on
  `dev/laiyongjie`.
- At task creation, local HEAD, the local upstream ref, and live remote branch
  all matched that SHA.
- The worktree held only upstream-managed changes to `.codex/hooks.json` and
  the two Python hook files, plus a missing final newline in
  `.trellis/.template-hashes.json`. The newline was restored without entering
  a commit.
- CI, Release, Label PRs, and Dependency Graph workflows were active. The
  authenticated account had `repo` and `workflow` scopes.
- No active Trellis task existed before this task. Archived 08-09 work remains
  historical evidence and must not be modified.

## Intentional contract reversals

The current checkout enforces three choices that this approved task replaces:

1. FyAgent-specific Trellis overlay/wrapper/managed-hook enforcement.
2. A protected ProgramData machine runtime plus process-SID-equals-Shell-SID
   startup admission and authenticated custom activation forwarding.
3. A release contract that deliberately excludes executable installer
   lifecycle smoke.

The replacement retains the existing NSIS perMachine/directory UX, dual
manifest selection, exact-SHA release eligibility, native target set,
signer/fresh-sealer split, attested subject set, attachment set, and formal
single-publication transaction.

## Hook update evidence and accepted risk

The three dirty hook files match the reviewed upstream Trellis `0.6.14` bases
that the former overlay manifest expected as inputs. They remove project-only:

- repository/task realpath containment for context files;
- exact-path binding for dynamically imported Trellis modules;
- strict Codex event/session/input failure behavior;
- markup/control-character escaping in workflow breadcrumbs;
- the ambient-system-Python avoidance supplied by the project hook runner.

The task intentionally accepts those upstream bytes and deletes the project
overlay/runner instead of reconciling back to hardened output. This is a known
security regression in prompt-assistance hooks, not an equivalent migration.
Product runtime authority must not depend on these hooks.

## Windows runtime observations

- `src-tauri/src/main.rs` currently invokes the all-users headless entry and
  the pre-Tauri Windows startup gate.
- Windows single-instance registration is currently excluded while macOS and
  Linux use `tauri-plugin-single-instance` with existing deep-link,
  lightweight-window, and focus handling.
- `src-tauri/src/windows_runtime/` owns ProgramData runtime state/lease,
  equal-user proof, HMAC/capability activation, and the custom pipe.
- The current immutable interactive context contains only process session,
  Shell session, and canonical SID, and equality is an admission condition.
- User directory access is distributed across panic, configuration, database,
  logs, provider/runtime, tray, and installer code; replacement requires a
  semantic consumer audit, not only changing one path helper.

The locked Tauri single-instance implementation on Windows uses a predictable
named mutex, hidden window, and `WM_COPYDATA` without an application-layer
peer capability. Therefore callback argv are local untrusted input. Existing
deep-link envelope limits and validation should be reused; plugin input cannot
directly invoke a privileged side effect.

## Codex installer observations

- The current experimental all-users path uses headless/runas job-control
  files, `StagePackageByUriAsync`, and
  `ProvisionPackageForAllUsersAsync` outside the ordinary renderer commands.
- The current-user PackageManager path still executes inside the elevated main
  process, so it targets the wrong user in a Bob-admin/Alice-Shell scenario.
- Windows staging currently derives from the process temporary directory,
  which does not bind it to the selected install root or its volume.
- Existing package validation already covers descriptor, size, checksum,
  bounded ZIP/manifest, publisher/identity/architecture/version, and
  post-verification continuity checks. The replacement should reuse those
  validators and change the final consumption boundary.
- The existing Explorer COM launcher is the correct privilege boundary to
  reuse for a fixed helper executable.

## Verified-file handoff

The selected design relies on documented Windows sharing and identity facts:

- A `CreateFileW` handle opened with only `FILE_SHARE_READ` permits concurrent
  reads but prevents later write and delete sharing until the handle closes.
  Windows rename/delete operations require compatible delete sharing.
- `GetFileInformationByHandle` exposes volume serial number, file index, and
  size for identity continuity checks.
- `PackageManager.AddPackageByUriAsync` installs a package for the calling
  user's PackageManager context.

Primary references:

- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilew
- https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfileinformationbyhandle
- https://learn.microsoft.com/en-us/uwp/api/windows.management.deployment.packagemanager.addpackagebyuriasync?view=winrt-26100

The main process must hold the share-restricting read handle from the final
identity recheck through the helper's terminal PackageManager result. A fixed
path without this pin is insufficient when the selected install directory is
user-writable.

## Installer/release observations

- Formal app builds use `requireAdministrator`; test/development builds use
  `asInvoker`. NSIS is perMachine and exposes the standard directory page.
- The lifecycle harness currently exercises installer mechanics but treats
  unsafe ProgramData preimages as failure and is not a Release gate.
- CI has matching `windows-2025` x64 and `windows-11-arm` ARM64 native paths,
  but release currently relies on build/package proof rather than executing
  final setup/uninstall.
- Release dispatch is a five-target same-SHA preflight. It attests candidate
  bytes and skips publish; tag push is the only formal publication path.
- The current public release baseline is `v0.3.0`; immutable Windows MSI asset
  IDs/names/sizes and repository-pinned SHA-256 values must be captured by the
  lifecycle baseline contract before download.
- Version remains `0.3.1`, but an existing annotated `v0.3.1` tag already
  points to another historical SHA. This task must not move/reuse it and does
  not establish a future formal `v0.3.1` closure.

## Remote closure invariant

Release eligibility binds dispatch to the current remote
`dev/laiyongjie` HEAD and the exact successful full push CI attempt for the
same SHA. Therefore all nine work commits must be pushed together as H1 before
dispatch. Archiving/journaling after preflight would move the branch and make
that preflight no longer describe remote HEAD, so those two commits stay local
only by design.
