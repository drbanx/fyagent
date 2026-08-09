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
   lifecycle, 10/13/14 allowlists, draft re-download, attestation, and Latest
   transaction.
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
- The CI and Release workflow tests bind dev/main push full-run behavior,
  PR/merge-group domain routing, independent current-attempt Jobs REST
  evidence, dispatch non-publication, both live publish rechecks, the existing
  immutable build-input bundle, Windows formal producer/fresh sealer/fresh
  lifecycle trust split, and the exact 10 installer / 13 attestation subject /
  14 attachment allowlists.
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
