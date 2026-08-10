# Implementation

1. [done] Add the classifier CLI, authoritative path map, declaration surface,
   and hermetic Git/path fixtures.
2. [done] Add explicit comparison identity, conditional domain jobs,
   event-aware concurrency, and the always-present Required evaluator backed
   by exact current-attempt Jobs REST evidence.
3. [done] Force full CI for dev/main pushes and diagnostics while keeping
   PR/merge-group affected-domain execution and docs/spec contracts.
4. [done] Add the pure exact-key dev-release eligibility engine and exhaustive
   preflight/formal/CI/tag/frozen-decision fixtures.
5. [done] Add the remote evidence collector, generalize Release from a
   fixed version/main ancestry to strict SemVer + live dev HEAD + annotated tag
   - exact successful dev push CI, and keep dispatch non-publishing.
6. [done] Bind both metadata modes to CI identity, add the two publish
   rechecks, and preserve the existing pinned assets, Windows signing/sealing/
   proof boundary, direct exact-asset routing, 10/13/14 allowlists, draft
   re-download, attestation, and Latest transaction.
7. [done locally; remote pending] Run local workflow/unit/release-contract
   checks and frozen engineering/security/release review. The parent owns the
   completed repository-wide local check and still owns the real dev push,
   preflight, annotated tag, formal Release, and closeout-CI observations.

## Local implementation evidence

The 2026-08-10 repository-side pass used the managed toolchain and proved the
classifier, Required aggregator, release eligibility, and publication
contracts without performing remote writes:

- `mise run release:check` passed 20 release-contract test files with 537/537
  tests plus the 4/4 native-fetch suite. This includes 22 classifier fixtures,
  10 Required-result fixtures, 91 pure eligibility fixtures, 18 remote evidence
  collector fixtures, and 29 Release workflow topology fixtures.
- The classifier tests cover every domain, control/dependency expansion,
  production Tauri/Cargo/NSIS contract ownership, Git rename/copy behavior,
  unknown paths, malformed revisions, option injection, and an empty diff.
- The eligibility and collector tests cover strict stable versions including
  the Cargo `u64` boundary, exact repository/workflow/event/branch/SHA and
  annotated-tag identity, latest successful dev push attempt, complete REST
  pagination, Required job/check binding, reruns appearing during collection,
  frozen-result drift, moved refs, lightweight tags, and token redaction.
- At that repository-side pass, the CI and Release workflow tests bound
  dev/main push full-run behavior,
  PR/merge-group domain routing, independent current-attempt Jobs REST
  evidence, dispatch non-publication, both live publish rechecks, the existing
  immutable build-input bundle, Windows formal producer/fresh sealer/fresh
  lifecycle trust split that existed at that time, and the exact 10 installer /
  13 attestation subject / 14 attachment allowlists.
- `mise run typecheck`, repository-managed reviewed-file formatting,
  `git diff --check`, Trellis task validation, and `trellis:verify` are retained
  as this phase's final local gates. Official `actionlint` v1.7.12 was verified
  against its published checksum and accepted both changed workflows from a
  unique temporary directory that was removed afterward.

Read-only live GitHub API probes confirmed the repository's workflow, ref,
annotated-tag, workflow-run, attempt-job, and check-run response shapes and the
exact-SHA run filter. They did not create or modify a run, tag, Release, or
repository setting. Real `dev/laiyongjie` push CI, dispatch preflight, annotated
tag, formal Release, and closeout CI remain parent-task acceptance gates; this
child stays open until those observations exist.

## Historical preflight lifecycle timeout follow-up

Dispatch preflight run `31336520793` for exact source commit
`6830fc5b48f37376998835808734952cac19ec3a` reached the secret-free Windows
lifecycle after eligibility, builds, input pinning, and unsigned sealing had
succeeded. Both x64 job `93305791602` and ARM64 job `93305791528` remained in
the lifecycle step for more than 60 minutes. Normal cancellation did not stop
them, and force-cancel was required at `2026-08-09T22:49:23Z`. Both job log
endpoints remained 404/empty through `2026-08-09T23:20:11Z`, with no job-level
post-checkout execution observed. The exact last `CASE` is therefore unknown.
Downstream asset verification, attestation, and publication did not
materialize, and no tag or Release exists.

At that time, the workflow correction gave each `windows-lifecycle` matrix
child an exact 45-minute hard timeout. Lifecycle-local process deadlines and
case diagnostics remain owned by the Windows installer contract.

A later product decision retired this Actions gate. The current Release
workflow has no `windows-lifecycle` job and does not invoke the manual harness;
successful x64/ARM64 native build/package jobs plus the applicable Windows
proof/seal branch now feed exact-asset verification directly. The run and
timeout above remain historical evidence and do not prove a newer preflight.
Real exact-SHA push CI, a preflight under the current topology, the annotated
tag, formal Release, and closeout CI remain unobserved acceptance gates.

## Current simplified Release topology evidence

The repository workflow now has no lifecycle job or lifecycle-script
invocation. Its exact job allowlist routes successful native builds and the
applicable Windows proof/seal branch directly to `verify-assets`, then
attestation and formal publication. A mutation that adds a differently named
Windows job and executes a setup executable is rejected. `mise run
release:check` passed 22/22 files and 578/578 contract tests plus the 4/4
native-fetch suite; the focused Release/NSIS files passed 81/81 tests.
Official `actionlint` v1.7.12 accepted the final workflow, and the parent-owned
full-scope `mise run check` completed with exit code zero on the same frozen
worktree.

These results are repository-local. No remote Actions run, tag, attestation, or
Release was created for this working tree.
