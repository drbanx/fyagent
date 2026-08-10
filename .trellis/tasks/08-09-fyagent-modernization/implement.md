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
7. [done for current scope] Record the successful exact-SHA CI and
   non-publishing preflight for correction commit `99738a00260da3ea095f8d8750c6d8af97e07cf5`,
   plus the later owner-transfer/cancelled-formal evidence without upgrading it.
8. [deferred by user decision] Move formal `v0.3.1`, new post-transfer
   CI/preflight, public asset/attestation verification, and closeout CI to a
   future independent task. Do not perform those operations during this closeout.
9. [ready for archive] Validate the transparent closeout documents, then archive
   children in dependency order, archive the parent, record the journal, commit
   locally, and push the closeout commits once to `dev/laiyongjie`. Do not wait
   for or accept the automatic CI from that push.

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

## Exact-SHA push and rejected preflight follow-up

The preceding no-remote-run statement records the local freeze point. The
subsequent push CI run `31357521242` completed 10/10 jobs successfully for exact
source `d9e951860e2e770992bf040add87eec0d99940a3`, including both native Windows
contract jobs (with explicit-SID Main package-inventory smoke) and `CI / Required`.

Dispatch preflight run `31358299654` then used that same source. Eligibility,
all matching native builds, immutable input pinning, both x64 and ARM64 unsigned
sealing jobs, and `verify-assets` succeeded. However, attestation job
`93365897541` was skipped, so `release-attachments` was never created and the
run exposed only 16 of the 17 required workflow artifacts. The run's overall
green conclusion therefore does not satisfy the preflight contract. It proves
neither mandatory attestation nor the exact fourteen-file transaction payload;
step 7 remains pending, and no tag or GitHub Release is authorized from this
evidence.

A real installation attempt against the current Windows setup also exposed a
machine-runtime bootstrap failure. Source and MakeNSIS evidence identified two
active causes: `$COMMONAPPDATA` is not an NSIS variable and produced twelve
warning-6000 diagnostics, while separated `GetLastError` handling allowed an
unrelated operation to contaminate the reported error code. This defect is
being corrected and has not yet passed a new native package/preflight cycle.

The icon is not the observed failure. A frame-by-frame comparison of the
current x64 setup PE icon resources with the canonical FyAgent icon found them
identical. The default executable icon was traced to preflight run
`31346575437`, artifact `installers-windows-x64` (`9047816162`), setup SHA-256
`69c1c0cc5f89808d80c6a2e43b73b260469bfe477cb9fd69c5abdc6370c07fa7`.
That older file reused the same release filename, so it must not be used to
reject the current icon configuration. No installer/runtime fix or replacement
preflight is claimed by this section.

## Local correction after the rejected preflight

The follow-up repository correction closes the two defects exposed by the
same-source preflight and manual install without restoring installer execution
to GitHub Actions:

- the NSIS machine-runtime paths now use the locked NSIS 3.08
  `$COMMONPROGRAMDATA` variable, warning 6000 is fatal, and the `CreateFileW`
  result captures `GetLastError` atomically through `?e` and an immediate
  `Pop`; the owner, DACL, no-follow, handle-pinning, and no-repair protections
  remain unchanged;
- preflight attestation now runs across intentional formal-signing skips and
  fails explicitly unless its direct eligibility and `verify-assets`
  dependencies both succeeded; formal publication likewise requires a
  successful eligibility job and attestation instead of inheriting a silent
  skipped dependency;
- a dependency-free PE-resource verifier now compares every setup icon frame
  against the canonical `icons/icon.ico` in both the raw Windows build and the
  exact x64/ARM64 final-asset aggregation. The current x64 preflight setup
  from run `31358299654`, artifact `installers-windows-x64` (`9051853460`),
  SHA-256
  `a5523fe81f55645cd13f2745a9d1cb35a7194ac98556f7f9fb2bbb39af22c888`,
  passes that verifier. The identified older setup from run `31346575437`
  fails because its icon-group frame count differs from the canonical ICO.

On the corrected local snapshot, the three focused Release/NSIS/icon contract
files passed 119/119 tests. `mise run release:check` passed 25/25 files and
628/628 contract tests plus the 4/4 native-fetch suite; typecheck, the NSIS
source verifier, `actionlint` v1.7.12, supported-file formatting, and
`git diff --check` also passed. The complete `mise run check` then exited zero,
covering the frontend suite, Rust format/check/clippy/test, all task/docs and
Trellis checks, version, hooks, Python lock, and release contracts.

Final review also closed the remaining fail-closed evidence gaps before this
freeze: the warning-6000 rule rejects literal, dynamically constructed,
conditional, later, or hook-provided directive overrides, permits only the
inventoried line-start runtime macros, and prevents their redefinition while
requiring the unique hook include at top level after the canonical directive.
PE resource directories must use strict canonical named/ID ordering; the parser
has whole-file/tree/leaf/name/cumulative-payload budgets, zero-copy leaf views,
and rejects reused data entries plus aliased or overlapping payload ranges. PNG
chunk types are checked as raw ASCII bytes before decoding, so high-bit bytes
cannot impersonate `IHDR`, `IDAT`, or `IEND`. Workflow mutations also prove that
raw and final icon-verifier failures cannot be masked. The older and current
setup identities above make the icon comparison independently reproducible.

This is repository-local evidence. A new correction commit, exact-SHA push CI,
same-SHA preflight with successful attestation and all 17 workflow artifacts,
annotated tag, formal Release, and closeout CI remain pending. No corrected
Windows setup has yet been manually installed. The simplified Release workflow
does not execute installers, so native creation of
`%ProgramData%\FyAgent\runtime` remains an unverified, non-blocking observation
rather than a child-acceptance or archive gate. Step 7 remains pending for the
required CI, preflight, and formal Release evidence.

## Final local integration follow-up

The repository-wide check exposed a renderer sampling defect rather than a
test-runner race. Download speed had been derived only after React rendered the
latest Query snapshot, so React Query batching could accept two adjacent native
events while the effect observed only the second one and had no baseline. The
hook now records each snapshot synchronously only after the existing cache
acceptance predicate succeeds, and uses `jobId` plus `sequence` identity to
prevent the render fallback from sampling it twice. Regressions cover two
accepted events in one React batch, prove that a rejected stale sequence cannot
contaminate the next accepted speed baseline, and prevent a deferred focus
recovery from writing shared cache state after unmount. The focused hook suite
passed 37/37.

The same integration pass replaced the former JSONL formatting workaround with
real task support. `format:files` now preflights and normalizes JSON Lines
record-by-record without reserializing JSON values, checks every changed target
against its preflight bytes before a rollback-capable commit, and continues to
send only supported files to Prettier. The Trellis/mise child task's real
`implement.jsonl` and `check.jsonl` formatted successfully and then passed
`trellis:validate`; the real task contract suite passed 33/33, the CI-safe
formatter suite passed 7/7, and the shared writer suite passed 3/3. The writer
preserves target modes, uses unique same-directory temporary files, and
continues rollback after a recovery error. Schema and containment acceptance
remain separate from syntax formatting.

Finally, the browser compatibility data used by the locked Browserslist graph
was refreshed without adding a direct dependency: `baseline-browser-mapping`
is now `2.11.13` and both active Browserslist paths use
`caniuse-lite` `1.0.30001809`. `pnpm install --frozen-lockfile` accepted the
lock, `pnpm why` resolved those exact versions, and `mise run build:renderer`
completed without either stale browser-data warning. `mise run typecheck` and
the complete `mise run check` then exited zero on this local worktree.

These results do not upgrade the rejected preflight or authorize publication.
The correction still requires a new commit, exact-SHA push CI, a same-SHA
preflight with successful attestation and all 17 artifacts, the formal tag and
Release, and dependency-ordered Trellis closeout. Step 7 remains pending.

## 2026-08-10 strategy closeout and repository transfer evidence

The paragraph above records the status at the local integration checkpoint.
The correction was subsequently committed as
`99738a00260da3ea095f8d8750c6d8af97e07cf5`. Exact-source push CI run
`31376383730` completed successfully, including the complete required matrix.
Non-publishing preflight run `31377390554` then completed successfully for the
same source with mandatory attestation, all 17 workflow artifacts, the exact
14-file `release-attachments` payload, and publication skipped as designed.

The observed annotated `v0.3.1` tag object was
`42edfcdbc5545101d96105d575f1e3286c876e72`, peeled to correction commit
`99738a00260da3ea095f8d8750c6d8af97e07cf5`. Formal attempt `31379896485`
overlapped the repository-owner transfer window and ended cancelled after six
jobs and eight workflow artifacts, with no GitHub Release. A run annotation
reported `repository transferred`; that observation and timing are retained,
but this task does not claim an independently audited causal explanation.

The canonical repository is now `fy-agent/fyagent`, still numeric repository
ID `1313497021`. The pre-transfer URL redirects with HTTP 301 to that same
repository, but current release eligibility intentionally does not accept the
former owner name as an alias.

On 2026-08-10 the user revised the completion strategy to prioritize archival
of the implemented task tree. A new post-transfer CI/preflight, any tag action,
formal `v0.3.1`, published asset/attestation verification, and acceptance of
the automatic closeout CI are explicitly deferred to a future independent
task. Ordered archive/journal commits and one push to `dev/laiyongjie` remain
in the current scope, but the task does not wait for that push's CI. Earlier
sections that say the deferred gates were pending remain accurate historical
checkpoints; they no longer block archival under the revised scope.
