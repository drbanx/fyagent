# Rebuild Windows user-scoped runtime and decouple Trellis

## Goal

Replace the Windows machine-runtime and all-users Codex installation model with
a fail-closed Shell-user model that works when an elevated FyAgent process and
the interactive Explorer Shell belong to different users. At the same time,
remove FyAgent's project-specific Trellis/mise coupling while retaining the
upstream-managed Trellis workspace as optional contributor assistance.

The accepted delivery candidate remains version `0.3.1`. One exact work SHA,
called `H1`, must be pushed to `dev/laiyongjie`, pass its full push CI, and pass
the same-SHA release dispatch preflight. The task is archived and journaled
locally only after those remote gates succeed.

## Product requirements

### Windows interactive user

- Create one immutable `WindowsInteractiveUserContext` before panic logging,
  configuration, database, tray initialization, or any user-path lookup.
- Resolve the interactive Explorer Shell's session, canonical SID, profile,
  LocalAppData, and RoamingAppData. A formal build fails explicitly when any
  required Shell identity or path cannot be proven.
- Support `process user = Bob` and `Shell user = Alice`. FyAgent user data,
  Codex inventory, Codex installation, restart, and launch belong to Alice.
- Never fall back to Bob, SYSTEM, the current directory, `%USERPROFILE%`, or
  another process-environment-derived user when the Shell context is absent or
  invalid.
- Remove the pre-Tauri process-SID-equals-Shell-SID gate, ProgramData runtime
  bootstrap/state/lease, capability/HMAC activation pipe, and experimental
  all-users command/deployment surface.
- Keep only bounded, known-name, best-effort cleanup for legacy
  `%ProgramData%\FyAgent\runtime` state. Unknown content and cleanup failures
  must not cause recursive deletion or block uninstall.

### Single-instance and untrusted activation input

- Register `tauri-plugin-single-instance` on Windows as well as macOS/Linux.
- Reuse the existing deep-link, lightweight-window, and focus behavior.
- Preserve bounded activation argument count, per-item size, and aggregate
  size. Invalid or oversized input is ignored/rejected before business logic.
- Treat the plugin's local mutex/window/`WM_COPYDATA` input as untrusted. A
  second-instance argument must never directly trigger elevated filesystem,
  helper, or PackageManager side effects.

### Current-user Codex helper

- Keep the existing renderer semantics: the Install/Update control means
  current-user installation only. Do not add an installer scope choice.
- Bundle a Windows-only `fyagent-user-helper.exe` with an independent
  `asInvoker` manifest and no Tauri UI/runtime linkage.
- The helper accepts exactly:

  ```text
  fyagent-user-helper.exe codex-msix-install --job-id <uuid> --pipe <256-bit-hex-nonce>
  ```

- It derives its installation root from `current_exe()` and the MSIX path from
  the fixed job layout. It accepts no arbitrary executable, command, URI, or
  package path.
- The elevated parent launches the helper through the existing Explorer COM
  boundary so it runs as the frozen Shell user.
- Use a one-shot local pipe with a fixed prefix and high-entropy nonce,
  first-instance semantics, an Alice SID + SYSTEM/Administrators DACL, client
  PID/token-SID verification, bounded versioned enum messages, a timeout, one
  connection, and destruction after completion.
- The protocol permits only `started`, bounded `progress`, `success`, and a
  structured `error`. The helper calls only current-user
  `PackageManager.AddPackageByUriAsync` and reports progress/outcome.

### Install-root staging and verified-byte continuity

- Stage Windows downloads at
  `<install-root>\cache\codex-installer\<uuid>\installer.msix` using direct-child
  UUID directories, `.part` to final rename, a fixed filename, reparse
  rejection, and known-only cleanup.
- Probe free space on the actual install-root volume. An unresolvable volume,
  unwritable root, or insufficient space fails; there is no `C:` fallback.
- After all size, checksum, ZIP/manifest, publisher, identity, architecture,
  version, and OS checks succeed, reopen the exact file using
  `GENERIC_READ + FILE_SHARE_READ`, record and recheck volume serial/file
  index/size, and hold the handle until PackageManager has completed.
- The held share mode must prevent write, delete, and rename between elevated
  verification and Shell-user consumption without adding a staging ACL or
  making the helper re-hash the file.

### Installer and lifecycle

- Preserve NSIS `perMachine`, the standard directory page, the formal
  `requireAdministrator` application manifest, and test/development
  `asInvoker` manifests.
- Package and uninstall both the main executable and helper, while deleting
  only known staging content and empty owned ancestors.
- Preserve the installed path across reinstall/upgrade, including a previous
  install on `D:`.
- Native x64 and ARM64 lifecycle acceptance covers default and
  `D:\FyAgent-Acceptance` fresh install/start/uninstall, same-version reinstall,
  upgrade from the immutable public `v0.3.0` MSI baseline, D-drive upgrade,
  bounded legacy ProgramData preimages, cleanup failures, unknown-file
  retention, main/helper presence, shortcuts, registry values, and final
  installation location.
- If a runner has no `D:`, create a task-owned temporary VHD/VHDX, format and
  assign only that image, and best-effort detach/delete it on every exit path.
  Never alter a runner's existing disks.
- The old MSI baseline is repository-pinned by tag, asset ID/name, size, and
  SHA-256; no `latest` URL or unchecked download is permitted.

### Tooling and documentation

- Commit the upstream-managed Trellis `0.6.14` hook registration and Python
  hook bytes as received.
- Remove the FyAgent Trellis overlay/reconcile/verify implementation, Trellis
  mise task include and wrapper, project-local `fyagent-trellis` skill, Codex
  hook runner, and automatic bootstrap prompt injection.
- Remove contracts that make `.trellis/**`, Trellis tasks/specs, overlay state,
  or Trellis CLI use a prerequisite for contribution, build, check, CI, or
  release. Do not create a replacement wrapper.
- Retain upstream `.trellis/**`, `AGENTS.md`, upstream skills/agents/hooks, and
  every archived task and journal as optional assistance and history.
- Keep standard mise task, locked toolchain, release, and developer-document
  consistency checks that do not depend on Trellis.
- Establish the standalone flow
  `mise trust -> mise run bootstrap -> mise run system:check -> mise run dev`,
  with `mise run check` as the pre-commit full gate.
- Remove obsolete project-contract wording from active specs precisely; retain
  durable AI-assistance knowledge that remains true.

### CI and release preflight

- A push to `dev/laiyongjie` remains a full CI run summarized by the unique
  `CI / Required` job.
- CI and release use native `windows-2025` x64 and `windows-11-arm` ARM64
  runners to execute the actual final NSIS setup and uninstaller lifecycle.
- Release lifecycle smoke jobs are separate, secret-free (`contents: read`,
  `persist-credentials: false`), and consume the sealed candidate through its
  immutable artifact ID/digest. Smoke evidence never rewrites or reuploads the
  signer/sealer candidate.
- Both dispatch preflight and formal topology depend on smoke success, while
  exact-SHA eligibility, signer isolation, fresh sealing, thirteen attested
  subjects, fourteen release attachments, and the one formal publication
  transaction remain intact.
- In dispatch mode, formal signing/sealing and publication remain skipped;
  unsigned preflight proof, verification, attestation, and exact fourteen-file
  attachment inventory must succeed.

## Delivery requirements

- Produce nine intentional domain commits in the approved order. A discovered
  defect may add a narrow `fix(...)` commit; do not amend or hide fixes in a
  catch-all commit.
- Before the only push, fetch and require remote `dev/laiyongjie` to remain the
  original task baseline ancestor. Never force-push or silently rebase/merge a
  remote move.
- Push the complete implementation once. Capture that exact SHA as `H1` and
  wait in the foreground for its unique push CI run to complete.
- After successful exact-`H1` CI, dispatch `release.yml` with
  `source_sha=H1`, wait in the foreground, verify the job topology and download
  and verify the exact fourteen release attachments for version `0.3.1`.
- Do not create, move, or delete a tag. Do not create a draft, prerelease, or
  formal GitHub Release. The existing unrelated `v0.3.1` tag is untouched.
- Archive this task and record the session only after preflight succeeds. Keep
  those two closeout commits local; the remote remains at `H1` and the local
  branch is exactly two commits ahead with a clean worktree.

## Explicit non-goals

- No web/API/database-schema change and no renderer-facing all-users option.
- No unrelated dependency upgrade, long-lived Windows service/broker,
  ProgramData runtime replacement, staging ACL, helper-side checksum pass,
  history rewrite, historical task/journal edit, CHANGELOG edit, or version
  bump.
- No claim that local Linux checks prove Windows setup, UAC, VHD,
  PackageManager, or native x64/ARM64 behavior.
- No formal `v0.3.1` release closure claim.

## Accepted residual risk

The upstream Trellis `0.6.14` Codex hooks are intentionally retained without
FyAgent's former project overlay. This removes the project's realpath
containment, exact-source import binding, strict Codex session/input checks,
and breadcrumb escaping. These hooks remain prompt-assistance code, but the
change is an explicit security regression acceptance, not an equivalent
security migration. It must remain visible in task evidence and the final
report.

## Acceptance criteria

- [ ] All nine primary commits exist in order and are individually scoped.
- [ ] Active product/tooling code has zero all-users and ProgramData runtime
      execution paths; historical archive/journal evidence is unchanged.
- [ ] Windows Shell-user context, untrusted single-instance input, helper IPC,
      install-root staging, and pinned-file contracts have unit/static tests.
- [ ] Installer contracts and lifecycle harness cover x64/ARM64, default/D
      paths, reinstall, immutable v0.3.0 upgrades, legacy state, bounded
      cleanup, and VHD teardown.
- [ ] Current active specs and developer docs describe the replacement model
      and standalone mise workflow without making Trellis a project contract.
- [ ] Targeted frontend/Rust/contract checks and final `mise run check` pass.
- [ ] Remote `H1` has one successful full push CI with one successful
      `CI / Required`.
- [ ] Same-SHA dispatch preflight succeeds with required native lifecycle
      smoke, unsigned proof, verification, attestation, skipped formal/publish
      jobs, and exactly fourteen verified attachments.
- [ ] No tag or GitHub Release changed; no temporary VHD/download remains.
- [ ] Task evidence records `H1`, run IDs/URLs, conclusions, smoke jobs, and
      attachment verification.
- [ ] Remote stays at `H1`; local has exactly the archive and journal commits
      above it; index and worktree are clean.
