# Implementation

1. Validate and start the Trellis/mise child. Implement, check, and create its
   work commit.
2. Implement, check, and commit the Windows installer child.
3. Implement, check, and commit the Codex Windows user-scope child.
4. Implement CI classification and dev-release eligibility after the final
   Windows paths and tests are known.
5. Migrate current docs/spec ownership only after implementation contracts are
   stable.
6. Bump all canonical versions to `0.3.1`, run targeted gates and full
   `mise run check`, and complete code/security/release reviews.
7. Push all work commits once, synchronously wait for full CI, and run the
   non-publishing release preflight for the same SHA.
8. Freeze branch writes, verify the remote SHA again, create/push annotated
   `v0.3.1`, synchronously wait for formal release, and verify the published
   release and attestations.
9. Archive children in dependency order, archive the parent, record the
   journal with work hashes, push closeout commits once, and wait for final CI.

Rollback: before tag creation, add an owning follow-up commit rather than
amending history. After a tag exists, never move/delete it or mutate a
published Release automatically; keep the parent open and request a new
version decision if source changes are required.
