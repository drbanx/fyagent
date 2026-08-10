# Implementation plan

## Baseline and stopping rules

- [x] Confirm local HEAD, local upstream ref, and live remote
      `dev/laiyongjie` all equal the task baseline.
- [x] Confirm the only pre-task worktree differences are the three official
      Trellis hook files plus one missing EOF newline in the template hash
      file.
- [x] Restore only the template-hash EOF newline; do not reconcile the hooks.
- [x] Confirm CI/Release workflows are active and the authenticated account has
      repository/workflow permission.
- [ ] Before the one push, fetch and recheck the remote. If it moved, stop; do
      not force, rebase, or merge without a new decision.
- [ ] If implementation requires changing an approved product/security/release
      boundary, stop and return to a one-question decision gate.

## Commit 1 — task planning

Commit: `chore(trellis): plan Windows user runtime and tooling decoupling`

- [x] Create this single complex task without children.
- [x] Write PRD, design, implementation plan, and task-local research.
- [x] Curate real `implement.jsonl` and `check.jsonl` entries from active specs
      and task-local research.
- [x] Validate context, set task metadata/branch, and start the task.
- [x] Stage and commit only this task directory; preserve hook differences.

Validation:

```text
mise run trellis:task -- list-context <task> implement
mise run trellis:task -- list-context <task> check
mise run trellis:validate -- <task>
mise run trellis:task -- current --source
git diff --cached --name-only
```

Rollback: revert only the planning commit before implementation; never edit an
archived predecessor.

## Commit 2 — managed hooks

Commit: `chore(trellis): accept managed 0.6.14 hooks`

- [x] Confirm the three files match the reviewed upstream `0.6.14` bytes.
- [x] Commit only `.codex/hooks.json` and the two registered Python hooks.
- [x] Record the accepted containment/import/input/escaping regression in task
      evidence and final report.

Validation: byte hashes, JSON parse, Python compile, focused managed-template
diff audit, and staged-path audit.

Rollback: revert the commit together with a deliberate decision about whether
the old overlay is restored; do not silently mix upstream registrations with
old runner assumptions.

## Commit 3 — tooling decoupling

Commit: `refactor(tooling): decouple Trellis from project contracts`

- [x] Remove Trellis task include/wrapper, overlay engine/manifest/transforms,
      project skill, Codex hook runner/tasks, and bootstrap prompt injection.
- [x] Remove Trellis/overlay dependencies from aggregate check, CI contracts,
      task generation, classifier, environment checks, and contract fixtures.
- [x] Keep normal task metadata/effect/DAG, toolchain/lock, release, and docs
      consistency gates.
- [x] Preserve upstream `.trellis/**`, upstream skills/hooks/agents,
      `AGENTS.md`, archives, and journals.
- [x] Confirm active runtime code/tests have no replacement Trellis wrapper.

Targeted validation: task loader/contracts, environment/bootstrap tests,
classifier fixtures, hook JSON/Python syntax, and `mise tasks validate`.

Rollback: revert this commit without touching the official hook commit.

## Commit 4 — standalone development documentation

Commit: `docs: establish standalone developer workflow`

- [x] Update CONTRIBUTING and active development/tooling/validation/CI/release
      docs to the standalone mise flow.
- [x] Remove overlay-only active docs and obsolete Trellis prerequisite text.
- [x] Precisely update mixed active specs while retaining durable optional AI
      guidance.
- [x] Regenerate the mise task reference from live metadata.
- [x] Prove maintained docs contain no external input reference and no retired
      project Trellis API.

Targeted validation: generated task docs, docs contract, link/reference scans,
format checks, and spec-owner consistency tests.

Rollback: revert docs/spec changes together so they never contradict tooling.

## Commit 5 — Shell-user runtime

Commit: `refactor(windows): replace machine runtime with shell user context`

- [x] Delete active ProgramData bootstrap/state/lease/HMAC/capability/custom
      activation and pre-Tauri equal-SID startup gate.
- [x] Implement frozen Shell session/SID/profile/LocalAppData/RoamingAppData
      context before any user path.
- [x] Route panic/config/database/log/provider/tray and all user-path consumers
      through that context on Windows.
- [x] Register Tauri single-instance on Windows and normalize bounded untrusted
      arguments before deep-link/lightweight/focus behavior.
- [x] Keep only bounded best-effort legacy cleanup.

Targeted validation: Rust fmt/check/test filters for same-user, Bob/Alice,
missing Shell/profile/path, context drift, every per-user path, activation
bounds, invalid deep links, and focus-only input; static zero-reference scans.

An independent staged-only review found one desktop-only dependency escaping
into the mobile entry point plus five boundary/test gaps: Store write limits,
non-Windows home-override compatibility, lightweight rejection wake policy,
maximized cross-monitor persistence, and the Shell-user fail-closed matrix.
All were fixed before this commit and rechecked in a rebuilt worktree whose
tree hash exactly matched the index. Rust `fmt --check`, `check`, and Clippy
with warnings denied passed; the complete library suite ran 2,667 tests (2,662
passed and five platform-conditioned tests were ignored). Focused frontend and
contract suites passed 129 tests, TypeScript type-check and Prettier passed, the
release-contract gate passed 471 tests, the NSIS source verifier passed, and
both task context files validated. Store, activation, window-state, and
Shell-user/registry focused suites passed their edge matrices. The registry
helper and native test module also passed isolated x64 Windows target
check/Clippy; actual Shell/UAC/WebView/registry-link behavior remains owned by
native CI. Final staged-only quality and security reviews reported no remaining
P0, P1, or P2 findings.

Rollback: revert as one runtime unit; do not revive machine runtime from a
partial commit.

## Commit 6 — Shell-user Codex helper

Commit: `feat(codex): install through the shell user helper`

- [ ] Delete all-users CLI/control/job/DTO/error/deployment branches and
      Stage/Provision APIs.
- [ ] Add the minimal Windows helper binary and independent `asInvoker`
      manifest to Cargo/Tauri/NSIS packaging.
- [ ] Implement fixed CLI/path derivation and Explorer COM launch.
- [ ] Implement one-shot authenticated pipe and bounded protocol.
- [ ] Call current-user `AddPackageByUriAsync` only in the helper.
- [ ] Preserve existing renderer current-user command/DTO behavior.

Targeted validation: helper CLI rejection matrix, pipe SID/PID/nonce/duplicate/
length/timeout/early-exit tests, AddPackage adapter tests, bundle/static command
audit, and Rust fmt/check/test.

Rollback: revert helper and deleted experimental surface together; no mixed
all-user/current-user deployment path.

## Commit 7 — install-root staging and pin

Commit: `fix(codex): stage installers under the install root`

- [ ] Move Windows staging to the fixed install-root cache hierarchy.
- [ ] Query capacity on the resolved installation volume with no fallback.
- [ ] Preserve `.part` atomicity, reparse rejection, UUID child constraints,
      and known-only cleanup.
- [ ] Add the share-restricting read pin, handle identity capture/recheck, and
      lifetime binding through helper/PackageManager completion.
- [ ] Update upgrade/uninstall cleanup for main/helper/known staging while
      preserving unknown data and tolerating legacy-cleanup failure.

Targeted validation: C/D path/capacity/unwritable/no-fallback cases, reparse and
unknown cleanup, existing write handle, replace/rename/delete attempts, file
identity drift, cancellation, and helper completion lifetime.

Rollback: revert staging and pin together; do not leave the helper consuming a
path whose verification continuity is weaker than documented.

## Commit 8 — Windows setup lifecycle

Commit: `test(installer): cover the Windows setup lifecycle`

- [ ] Reverse NSIS contracts from mandatory machine runtime to helper packaging
      and safe legacy cleanup while retaining perMachine/directory/manifests.
- [ ] Pin immutable public v0.3.0 x64/ARM64 MSI baseline metadata and digests.
- [ ] Extend the lifecycle harness for default/D fresh, start/uninstall,
      reinstall, default/D upgrade, legacy preimages, cleanup failure, unknown
      preservation, helper/main/shortcut/registry/location assertions.
- [ ] Add safe temporary VHD/VHDX ownership and finally-style cleanup.

Targeted validation: TypeScript/Node contract suites, PowerShell parser/static
fixtures, NSIS source verifier, release-file verifier, and Windows-specific
harness unit fixtures. Local static results remain non-native evidence.

Rollback: revert tests/contracts/baseline as one unit; do not retain a claimed
gate that workflows cannot execute.

## Commit 9 — native CI and release smoke

Commit: `ci(release): run native Windows lifecycle acceptance`

- [ ] Execute final setup/uninstaller lifecycle in CI x64/ARM64 native matrix.
- [ ] Add secret-free release x64/ARM64 smoke jobs consuming immutable sealed
      candidate IDs/digests without reupload or mutation.
- [ ] Gate preflight and formal verification/attestation/publication on smoke.
- [ ] Preserve exact eligibility, permission separation, signing/sealing,
      thirteen subjects, fourteen attachments, and dispatch publish skip.
- [ ] Update workflow/classifier/required/release fixtures and active owners.

Targeted validation: YAML parse/workflow mutation tests, CI/release topology,
permissions/action pins, immutable artifact flow, subject/attachment counts,
dispatch/formal truth tables, and lifecycle wiring.

Rollback: revert smoke topology and its contract as one unit; candidate
acceptance remains blocked until an equivalent native gate exists.

## Local integration gate

- [ ] Run task/context/docs/contracts targeted suites after every owning batch.
- [ ] Run `mise run format:check`, `mise run typecheck`, and
      `mise run test:unit`.
- [ ] Run `mise run rust:fmt:check`, `mise run rust:check`,
      `mise run rust:clippy`, and `mise run rust:test`.
- [ ] Run release contracts and the final `mise run check`.
- [ ] Run negative reference scans for active all-users, machine-runtime,
      project Trellis wrapper/overlay, external requirement source, and
      historical-file mutation.
- [ ] Dispatch an independent Trellis check review, validate every finding
      against the actual call chain, fix true defects with narrow commits, and
      repeat the affected gates.

## Remote H1 gate

- [ ] Fetch and prove fast-forward ancestry and remote equality to the original
      task base immediately before push.
- [ ] Require a clean worktree and complete intentional commit list.
- [ ] Record `H1 = HEAD`, push once normally to `dev/laiyongjie`, resolve the
      unique exact-SHA push run, and foreground-watch it to completion without
      progress commentary.
- [ ] Require `completed/success`, exact branch/SHA/event, and exactly one
      successful `CI / Required`. Fetch failed logs only on failure; use check
      annotations for no-runner/no-log cases.

## Dispatch preflight gate

- [ ] Re-prove remote branch equals H1 and exact-H1 push CI is successful.
- [ ] Record the release-run boundary, dispatch `release.yml` with
      `source_sha=H1`, resolve exactly one new matching run, and
      foreground-watch it without commentary.
- [ ] Verify eligibility, five native targets, immutable pin, x64/ARM64
      lifecycle smoke, unsigned proof, aggregate/verify/attest success, and
      formal signer/sealer/publish skips.
- [ ] Download `release-attachments` to a unique temporary directory, run
      `node scripts/release/verify-release-files.mjs attachments <dir> 0.3.1`,
      require fourteen nonempty consistent files, and remove the temporary
      directory.
- [ ] On a code/contract failure, add a narrow fix commit and repeat a new-SHA
      push CI/preflight. A proven transient infrastructure failure may rerun
      only the failed attempt; never retry blindly or indefinitely.

## Local closeout

- [ ] Write H1, CI/preflight IDs and URLs, terminal results, native-smoke jobs,
      and attachment verification into task evidence.
- [ ] Confirm all product/test/docs changes were already in H1.
- [ ] Use retained upstream `task.py` to validate and archive the task, then
      `add_session.py` to record the journal.
- [ ] Keep the default archive and journal commits local only.
- [ ] Verify remote `dev/laiyongjie == H1`, local is exactly two commits ahead,
      worktree/index are clean, no tag/Release changed, and no temporary VHD or
      download remains.
