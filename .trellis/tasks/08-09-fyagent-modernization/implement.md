# Implementation

1. [done] Validate and start the Trellis/mise child. Implement, check, and create its
   work commit.
2. [done] Implement, check, and commit the Windows installer child.
3. [done] Implement, check, and commit the Codex Windows user-scope child.
4. [done] Implement CI classification and dev-release eligibility after the final
   Windows paths and tests are known.
5. [done] Migrate current docs/spec ownership only after implementation contracts are
   stable.
6. [done] Bump all canonical versions to `0.3.1`, run targeted gates and full
   `mise run check`, and complete code/security/release reviews.
7. [pending] Push the final unpushed correction batch once, synchronously wait
   for full CI, and run the non-publishing release preflight for the same SHA.
8. [pending] Freeze branch writes, verify the remote SHA again, create/push annotated
   `v0.3.1`, synchronously wait for formal release, and verify the published
   release and attestations.
9. [pending] Archive children in dependency order, archive the parent, record the
   journal with work hashes, push closeout commits once, and wait for final CI.

## Local release-preparation evidence

The 2026-08-10 repository-side release preparation used the managed toolchain
without pushing, creating a tag, or publishing a Release:

- canonical application metadata is `0.3.1`; the version setter changed only
  `[workspace.package].version` in `src-tauri/Cargo.toml` and the matching local
  `fyagent` package entry in `src-tauri/Cargo.lock`;
- `mise run version:check -- --tag v0.3.1` passed, and Cargo metadata resolved
  the application package as `fyagent 0.3.1`;
- `mise run release:check` passed 21/21 files and 544/544 contract tests plus
  the 4/4 native-fetch suite;
- `mise run check` completed with exit code zero on the Linux x64 host. It
  passed environment, type, format, frontend, Rust format/check/clippy/test,
  task/docs, Trellis overlay, version, hook, Python lock, and release gates;
- the six preceding phase commits are `effdaf09`, `f020147b`, `089e35ae`,
  `5556b3f4`, `50cca3ac`, and `c3282b3b`, in the required order.

This proves host-runnable implementation and static workflow contracts only.
It does not replace native Windows x64/ARM64 build/package evidence, the
exact-SHA push gate, release preflight, formal signing-state verification,
publication, attestation, or closeout-CI evidence. Final frozen-diff engineering and
documentation reviews found no remaining P0-P3 issues, and the initial
security review found no remaining Critical/High/Medium/Low finding. Native
preflight later invalidated one premise of that local review: run `31333558714`
on exact SHA `2047bc67ebc7ae0b3b30fb79526082c62e79ccb4` observed that the
universal app carried a code signature while the workflow required a truly
unsigned app. The correction explicitly re-seals the complete app using the
identity-free ad-hoc mode, verifies the original app and the copies reopened
from ZIP and DMG, requires the same app in both containers, and continues to
require a truly unsigned DMG. Public documentation now distinguishes ad-hoc
integrity from Developer ID, certificate-backed identity, notarization, and
Apple trust.

The correction is locally covered by an executable fake-`codesign` fixture:
both universal slices and the strict verification path succeed only for the
expected identity-free resource seal, while authority, linker-only, stapled,
real-team, timestamped, unsealed, and verify-failure states are
rejected. `mise run release:check` passed 22/22 files and 552/552 contract tests
plus the 4/4 native-fetch suite, and the post-correction `mise run check`
completed with exit code zero. These results do not replace the next native
`macos-15` build and preflight. Push CI run `31334049521` separately completed
10/10 jobs successfully for exact SHA
`265a9a8b8e26799afcdd6a5cda0b528672180de7`, including native Windows x64 and
ARM64; that SHA predates this macOS correction and is not eligible for the
final tag.

Rollback: before tag creation, add an owning follow-up commit rather than
amending history. After a tag exists, never move/delete it or mutate a
published Release automatically; keep the parent open and request a new
version decision if source changes are required.

## Historical Windows lifecycle timeout correction

Dispatch preflight run `31336520793` targeted exact source commit
`6830fc5b48f37376998835808734952cac19ec3a`. Its x64 lifecycle job
`93305791602` and ARM64 lifecycle job `93305791528` both remained in
`Run native install lifecycle against sealed Windows setup bytes` for more
than 60 minutes. A normal cancellation did not stop either job; force-cancel
at `2026-08-09T22:49:23Z` was required. Both job log endpoints remained
404/empty through `2026-08-09T23:20:11Z`, and no job-level post-checkout
execution was observed. The exact last executed `CASE` is therefore
unobservable and is not claimed.

Eligibility, native builds, input pinning, and unsigned sealing had completed
successfully before the lifecycle jobs. `verify-assets`, attestation, and
publication did not materialize; no tag or Release was created. Source audit
found no job timeout, `Start-Process -Wait` around lifecycle NSIS and cleanup
execution, and unbounded lifecycle-only signature/native-tool waits. The
correction bounds the job and every harness-owned process, issues a tree-kill
only for the timed-out case's PID and reports the direct root exit without
claiming every descendant exited, and adds UTC/PID/elapsed/exit diagnostics
while preserving the complete WebView2, Authenticode, path, install, registry,
shortcut, runtime, uninstall, and user-data assertions. The production
WebView2 helper remains unchanged: the unavailable logs do not prove a defect
inside that helper, and the outer NSIS case deadline already bounds it without
changing production trust or download semantics.

This correction was local/static evidence for the then-current topology. A
later product decision retired the Actions lifecycle gate: the current Release
workflow does not invoke this harness, and successful matching native
build/package jobs plus the applicable Windows proof/seal branch now feed
exact-asset verification directly. The harness and its timeout diagnostics
remain available for manual investigation. The historical run above does not
prove a preflight under the current topology.

### NSIS uninstall wait follow-up

Push CI run `31342815741` completed 10/10 jobs successfully for exact source
commit `91a9799a945b4fa612afa23ce5a7b245de0f913d`, including Backend Windows,
native Windows x64 and ARM64, and `CI / Required`. Before dispatching another
preflight, final source review found that a bare `uninstall.exe /S` can return
from the directly launched NSIS stub after it starts its temporary self-copy,
before the actual uninstall and the following state assertions complete. The
green CI therefore remained compilation/static evidence rather than native
uninstall acceptance, and no dispatch, tag, or Release was created from that
commit.

The harness now copies the installed uninstaller into a GUID-named directory
under the case test root and starts that copy with exact raw
`/S _?=<install-directory>` arguments. Final, unquoted `_?=` disables the NSIS
self-copy handoff, making the bounded direct `Process` the actual uninstall and
preserving its exit code. Default, custom Unicode/space, and best-effort cleanup
uninstalls share this single path. Temporary cleanup deletes only the copied
file and its empty directory, never recursively widens from the copy root.
Failure diagnostics also retain whichever redirected stdout/stderr streams
completed without replacing the primary process error.

The Windows PowerShell 5.1 parser, NSIS source verifier, 25 focused installer
contract tests, typecheck, `git diff --check`, and `release:check` (22 files,
554 contract tests plus 4 native-fetch tests) passed locally for that manual
harness correction. This remains historical local/static evidence: a new
exact-SHA CI and preflight with successful matching x64/ARM64 build/package
jobs must complete before tag creation. Installer execution is no longer part
of that Release gate.

## Current installer and Release simplification evidence

The post-decision repository check leaves installer execution outside Release
while retaining native package builds, immutable Windows proof/sealing, exact
asset verification, attestation, and formal publication. `mise run
release:check` passed 22/22 files and 578/578 contract tests plus the 4/4
native-fetch suite. The two focused Windows/Release contract files passed
81/81 tests, including mutations that rename an installer-execution job or a
custom `$INSTDIR` rejection instead of reusing retired identifiers. The NSIS
source verifier, Windows PowerShell 5.1 AST parser, typecheck, reviewed-file
format check, and `git diff --check` also passed. Official `actionlint` v1.7.12
accepted the final workflow, and the final full-scope `mise run check`
completed with exit code zero on this same frozen worktree.

This is local/static evidence only. No new push, native package build,
workflow-dispatch preflight, tag, attestation, or GitHub Release was triggered
for this working tree.
