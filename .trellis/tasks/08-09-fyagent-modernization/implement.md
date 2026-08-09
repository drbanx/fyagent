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
documentation reviews found no remaining P0-P3 issues, and the security review
found no remaining Critical/High/Medium/Low finding after the macOS unsigned
gate was made fail-closed for both the application and DMG.

Rollback: before tag creation, add an owning follow-up commit rather than
amending history. After a tag exists, never move/delete it or mutate a
published Release automatically; keep the parent open and request a new
version decision if source changes are required.
