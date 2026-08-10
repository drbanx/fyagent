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
7. [done for current scope] Run local workflow/unit/release-contract checks and
   frozen engineering/security/release review; record already-observed CI and
   preflight evidence separately from deferred formal publication.

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

## Exact-SHA CI and invalid green preflight evidence

The preceding no-remote-run statement records the repository-local freeze
point. Exact-source push CI run `31357521242` later completed 10/10 jobs
successfully for `d9e951860e2e770992bf040add87eec0d99940a3`, including both
native Windows jobs and `CI / Required`.

Dispatch preflight `31358299654` targeted the same SHA. Eligibility, all native
builds, immutable input pinning, both unsigned Windows sealing jobs, and
`verify-assets` succeeded. Attestation job `93365897541` was nevertheless
skipped. Consequently `release-attachments` does not exist and the run contains
16 rather than the required 17 workflow artifacts. Its overall green
conclusion is not valid preflight evidence: the mandatory attestation and exact
fourteen-file transaction payload are absent. No formal tag or Release is
authorized, and the parent preflight step remains pending.

A separate real-install observation also keeps this SHA from closeout. The
Windows runtime bootstrap used `$COMMONAPPDATA`, which is not an NSIS variable
and caused twelve MakeNSIS warning-6000 diagnostics, and its separated
`GetLastError` capture allowed an unrelated error code to contaminate the
failure report. Correction and a new exact-SHA CI/preflight cycle are still
pending. Frame-by-frame inspection found the current x64 setup PE icon identical to
the canonical FyAgent icon. The default icon was traced to preflight run
`31346575437`, artifact `installers-windows-x64` (`9047816162`), setup SHA-256
`69c1c0cc5f89808d80c6a2e43b73b260469bfe477cb9fd69c5abdc6370c07fa7`;
that identified older file is not evidence of current workflow/configuration
drift. This section claims neither a runtime fix nor a successful replacement
preflight.

## Local attestation and packaging correction

The corrected workflow makes intentional producer skips explicit rather than
letting GitHub's default dependency status silently skip downstream work.
`attest` uses a status function and starts by requiring direct `eligibility`
and `verify-assets` results to be `success`; `publish` requires a push event,
formal mode, successful eligibility, and successful attestation. Preflight and
formal truth-table tests, dependency mutations, and execution-guard mutations
lock those transitions fail closed.

The Windows build and aggregation stages also invoke the new PE-resource icon
verifier against the raw matrix setup and both exact final Windows assets. The
runtime source contract now makes NSIS warning 6000 fatal and binds the
supported `$COMMONPROGRAMDATA` variable plus atomic native error capture.

On this repository-local snapshot, Release workflow tests passed 48/48, NSIS
contract tests passed 47/47, and PE-icon tests passed 24/24 (119/119 combined).
`mise run release:check` passed 25/25 files and 628/628 contract tests plus the
4/4 native-fetch suite. Typecheck, `actionlint` v1.7.12, formatting,
`git diff --check`, and the parent-owned full `mise run check` all passed.

Final review additionally proved that the warning-6000 contract rejects later
or hook-provided state overrides, dynamically constructed directives, runtime
macro redefinition, and inactive decoy includes while requiring the canonical
pragma and hook include at top level. The final-artifact PE verifier enforces
canonical resource ordering, raw-ASCII PNG chunk types, whole-tree and
cumulative-payload budgets, data-entry uniqueness, and non-overlapping payload
ranges. Workflow mutations require each raw and final invocation to propagate a
nonzero verifier status.

The invalid run `31358299654` is not upgraded retroactively. A new correction
commit must complete exact-SHA push CI and a same-SHA dispatch preflight in
which attestation succeeds, `release-attachments` exists, all 17 workflow
artifacts are present, and publish remains skipped. Tagging and formal
publication remain pending until that evidence is observed.

## Correction evidence, transfer cancellation, and strategy closeout

The correction was later committed as
`99738a00260da3ea095f8d8750c6d8af97e07cf5`. Exact-source push CI run
`31376383730` completed successfully. Same-source non-publishing preflight run
`31377390554` also completed successfully with attestation, all 17 workflow
artifacts, the exact 14-file attachment payload, and publication skipped. This
supersedes the prior pending-correction statement without retroactively
upgrading run `31358299654`.

The observed annotated `v0.3.1` tag object was
`42edfcdbc5545101d96105d575f1e3286c876e72`, peeled to the correction commit.
Formal attempt `31379896485` ended cancelled during the repository-owner
transfer window after six jobs and eight artifacts; it created no GitHub
Release. Its `repository transferred` annotation and timing are recorded, but
this task does not claim that the cancellation cause was independently audited.

Current eligibility authority is the canonical `fy-agent/fyagent` name and
unchanged repository ID `1313497021`; the pre-transfer redirect is historical
continuity, not an accepted alias. By explicit 2026-08-10 user strategy, a new
post-transfer CI/preflight, formal `v0.3.1`, public asset/attestation
verification, and acceptance of closeout CI are deferred to a future
independent task. The workflow implementation is complete and ready for
archive; no deferred production result is claimed.
