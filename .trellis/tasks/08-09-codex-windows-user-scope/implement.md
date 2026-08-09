# Implementation

1. [done] Trace the current identity-to-discovery-to-restart data flow and
   freeze the separate all-users `FindPackages()` ownership.
2. [done] Add the immutable interactive context, make Shell proof
   authoritative, and remove WTS token acquisition from the ordinary path.
3. [done] Thread context-bound inventory/operation evidence through ordinary
   discovery, deployment, post-verification, runtime control, and launch.
4. [done] Change only ordinary inventory to explicit SID plus Main; reject
   same-user ambiguity without changing all-users staging/provisioning.
5. [done] Extend fakes for SID/package-types/context receipts and add
   multi-SID, ambiguity, owner/context drift, and zero-fallback tests.
6. [in progress] Add the exact native WinRT smoke to matching x64/ARM64 CI,
   run targeted local gates, then retain both native executions as remote
   acceptance gates.

## Local implementation evidence

The 2026-08-10 repository-side pass used the managed toolchain and proved the
host-neutral and static contracts:

- `mise run rust:test` passed 2,639 host-runnable library tests plus every
  host-runnable integration suite, including same/other/invalid owner matching,
  platform-neutral initial/post-install ambiguity, and a restart ambiguity path
  that performs zero close/launch actions.
- `mise run rust:check`, `mise run rust:clippy`, and
  `mise run rust:fmt:check` passed after the Shell-only identity, explicit-SID
  inventory, aligned Win32 token buffers, and context-bound lifecycle changes.
- `mise run test:unit -- tests/codexDesktopDtoContract.test.ts
tests/config/localeKeyParity.test.ts tests/codexWindowsUserScopeContract.test.ts
tests/ciWorkflow.test.ts` passed 18/18 tests. These bind the public
  `MULTIPLE_INSTALLATIONS` DTO/i18n contract, executable revalidation call
  sites, the sole all-users `FindPackages()` owner, aligned Win32 buffers, and
  the exact x64/ARM64 native-smoke workflow command.
- `mise run typecheck`, task validation, reviewed-file formatting, and
  `git diff --check` passed for this workstream.

Linux cannot compile or execute the Windows-only multi-SID/context-receipt/
all-users fake module or the WinRT call. Required x64 Windows CI runs those
hermetic adapter tests. The checked-in exact native smoke exercises both a
valid current-SID/Main query and malformed-SID HRESULT propagation, accepts an
empty package result, and has no Store, network, real Codex, or multi-account
dependency. Matching x64 and ARM64 GitHub runners must each compile and execute
that one exact smoke before this child can be accepted and archived; runner
scheduling or native failure remains blocking.

## Remote correction evidence

The first complete dev-branch push run, GitHub Actions run `31331434192` for
source SHA `4fb00890348b418e5eac593973ef43fc5785d9ac`, failed closed before
release preflight. Both native Windows legs exposed a missing test-only
`SuggestedAction` import, and the Windows backend additionally exposed the
path-included domain test's missing crate-root `windows_runtime` module.
Neither failure was a runner-capacity or transient platform error, so the
failed SHA is not eligible for rerun or release.

The follow-up correction adds no product behavior: it restores those two
Windows-only compile graphs and adds a host-runnable source contract to the
CI-safe release suite. Acceptance remains pending until a new dev HEAD passes
the complete `CI / Required` workflow, including both matching-architecture
native legs.

The corrected source SHA `ad34cb107384ddf17f1141343f80c967935e4baf`
then reached both native runners: GitHub Actions run `31332259714` passed the
x64 and ARM64 explicit-SID/Main smoke jobs. Its sole required-job failure was
the full Windows backend Clippy gate, which showed that the shared
`UntrustedTarget` restart outcome is constructed by the macOS adapter but had
an obsolete Windows-specific dead-code assumption. The required aggregate
again failed closed. The next correction makes that platform ownership
explicit without changing the outcome or public restart state; a new complete
dev-push run remains mandatory.
