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
7. [pending] Push all work commits once, synchronously wait for full CI, and run the
   non-publishing release preflight for the same SHA.
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
It does not replace native Windows x64/ARM64 CI, the exact-SHA push gate,
release preflight, formal signing-state verification, publication,
attestation, or closeout-CI evidence. Final frozen-diff engineering and
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
