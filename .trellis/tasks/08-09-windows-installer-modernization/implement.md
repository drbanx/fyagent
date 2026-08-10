# Implementation

1. [done] Inventory MSI/WiX ownership and user-data paths; freeze keep/delete lists.
2. [done] Add NSIS platform config and shared path-validation hook/harness.
3. [done] Update Windows build, artifact collection, release-contract code, and tests
   to setup EXEs while leaving other platforms unchanged.
4. [done] Delete MSI/WiX-only crate, configs, scripts, fixtures, and tests.
5. [done] Add optional signer status/verification and release-note metadata. Keep
   all native build outputs behind one pre-signer immutable artifact ID,
   preflight sealing wholly secret-free; formal signing first emits only an
   untrusted transformed candidate, then a fresh secret-free runner compares it
   with raw bytes, independently verifies policy, and owns trusted evidence.
6. [remote pending] Run x64/ARM64 native lifecycles on a further fresh runner only after the
   exact preflight or formal producer/sealer result tuple succeeds; revalidate
   the sealed installer/evidence pair before execution and prohibit uploads.
7. [done locally] Run config/release/unit/Rust checks locally; retain native lifecycle gates
   for matching GitHub runners.

## Ownership and user-data inventory

This inventory was re-observed from the active Rust/config/WiX implementation
before the NSIS write set began. It is the uninstall boundary for this task.

| Location or class                                                                                                                      | Ownership                    | Uninstall contract                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| Selected `$INSTDIR` payload and installer-created shortcuts                                                                            | Installer                    | Remove                                                                          |
| HKLM application, protocol, and uninstall registration                                                                                 | Installer                    | Remove                                                                          |
| `%ProgramData%\FyAgent\runtime` activation descriptors/locks                                                                           | Installer bootstrap/runtime  | Remove only the installer-created runtime directory after processes are stopped |
| Default or overridden `~/.fyagent` root, including `fyagent.db`, `config.json`, settings, skills, OAuth credentials, logs, and backups | User/application data        | Preserve                                                                        |
| Tauri per-user store `app_paths.json` and roaming/local state under the `com.fyagent.desktop` identity                                 | User/application data        | Preserve                                                                        |
| Claude, Codex, Gemini, Grok, OpenCode, OpenClaw, Hermes, WorkBuddy, and other configured external-tool directories                     | External user data           | Never delete                                                                    |
| Download/cache/temp staging outside `$INSTDIR`                                                                                         | Runtime-owned transient data | Do not recursively treat as installer payload                                   |

The native lifecycle uses a dedicated test home and sentinel data in both the
default FyAgent root and Tauri user-state locations. Acceptance requires those
sentinels to remain after uninstall on each native Windows architecture.

## Signing-runner isolation evidence

The 2026-08-09 local contract pass used the repository-managed toolchain:

- `mise exec -- pnpm exec vitest run tests/releaseWorkflow.test.ts tests/windowsSigningAdapter.test.ts tests/windowsNsisContract.test.ts tests/releaseAssets.test.ts`
  passed 125/125 tests. The workflow and signing assertions bind the five-stage
  preflight and six-stage formal trust chains; exact manifest-bound pinning of
  all ten pre-signer artifacts by the original immutable artifact ID; formal-producer-only secret
  scope; untrusted candidate ownership; fresh secret-free raw/candidate diff,
  Authenticode proof, and fragment generation; exact result tuples and artifact
  names; no lifecycle upload; and controlled unsupported-drive execution.
- `mise run release:check` passed 17 files / 390 unit tests plus 4/4 native-fetch
  tests, including the complete release asset and evidence contract.
- `mise run typecheck` passed.
- `mise run trellis:validate -- .trellis/tasks/08-09-windows-installer-modernization`
  passed for both JSONL context records.
- Reviewed-file Prettier and `git diff --check` passed for the workflow, owning
  tests, active specs, and task records.

These checks prove the static workflow contract only. Matching native x64 and
ARM64 signing/install/uninstall runs remain required remote acceptance evidence.

## NSIS installer static and diagnostic evidence

The 2026-08-09 repository-side NSIS checks passed with the managed toolchain:

- `node scripts/release/verify-windows-nsis-contract.mjs` passed. The verifier
  binds the checked-in Tauri 2.8.1 template provenance, Windows-only NSIS
  configuration, pre-write final-volume path gate, atomic machine-runtime
  security contract, bounded uninstall ownership, compressed WebView2 helper,
  reviewed signer-chain policy, canonical Windows version range, and native
  lifecycle source contract. Unsupported-drive acceptance no longer depends on
  ambient logical-disk enumeration: each native runner must create a unique
  local SMB share, map an unused letter through `WNetAddConnection2W`, prove
  `GetDriveTypeW == DRIVE_REMOTE`, round-trip a marker, and execute both direct
  and reparse-path rejection cases. Fixture setup or exact link/mapping/share
  cleanup failure blocks the lifecycle.
- `mise exec -- pnpm exec vitest run tests/windowsNsisContract.test.ts` passed
  23/23 tests, including mutations that remove the live official-bootstrapper
  case, remove the CurrentUser fake-root attack case, make the required
  unsupported-drive block unreachable, or weaken its executed-case count to
  zero.
- `mise exec -- pnpm typecheck` and the scoped `git diff --check` passed.
- Windows PowerShell 5.1 parsed the lifecycle, evidence, bootstrapper, and
  encoded-loader scripts with zero AST errors. A controlled full loader run
  decoded the UTF-16LE/gzip chunks, invoked one exact sentinel, exited zero,
  and cleared all nine temporary environment values. This subsystem-bridge
  result is compatibility diagnostics only; it is not native installer acceptance.

A short subsystem-bridge probe was also used only while diagnosing the
repository-owned signature fixtures. It was stopped before a complete
install/uninstall lifecycle and is not recorded as native acceptance. Its
unique test sentinels and temporary root were removed without deleting any
user-data parent, and the subsequent read-only audit found zero matching
CurrentUser Root/TrustedPublisher fixture certificates, zero lifecycle
processes, no `%ProgramData%\FyAgent`, no default Program Files installation,
and no custom lifecycle root. Complete x64 and ARM64 WebView2 trust,
install/uninstall, registry, shortcut, ProgramData, and user-data-preservation
acceptance remains gated on the native GitHub `windows-2025` and
`windows-11-arm` runners.

## Release preflight correction evidence

The first exact-SHA dispatch preflight, GitHub Actions run `31333558714` for
source `2047bc67ebc7ae0b3b30fb79526082c62e79ccb4`, passed release eligibility
and then failed closed in both native Windows source-contract jobs before any
build, install, signing, or lifecycle execution. Node/zlib emitted different
RFC 1952 OS header bytes for the same level-9 gzip on Linux and Windows, while
the verifier incorrectly treated the host-specific header as deterministic;
the relevant PowerShell/NSIS extensions also lacked explicit LF checkout
rules. The correction pins those text inputs to LF, normalizes only the
descriptive gzip OS byte to `255` (unknown), and continues to require exact
compressed bytes plus exact decompressed source. A new full dev push CI and
same-SHA dispatch preflight remain mandatory before tagging.

## Native lifecycle timeout correction evidence

The next dispatch preflight, run `31336520793` for exact source commit
`6830fc5b48f37376998835808734952cac19ec3a`, passed eligibility, native builds,
input pinning, and unsigned sealing. Its x64 lifecycle job `93305791602` and
ARM64 lifecycle job `93305791528` both then remained for more than 60 minutes
in `Run native install lifecycle against sealed Windows setup bytes`. Normal
cancellation did not stop them; force-cancel at `2026-08-09T22:49:23Z` was
required. Both job log endpoints remained 404/empty through
`2026-08-09T23:20:11Z`, and no job-level post-checkout execution was observed.
Consequently the exact last executed `CASE` cannot be recovered or claimed.
`verify-assets`, attestation, and publication never materialized, and no tag
or Release was created.

The harness correction adds a 45-minute lifecycle-job ceiling; direct,
bounded process waits for NSIS and cleanup; bounded asynchronously drained
Windows PowerShell signature and native `signtool` execution; case-owned
process-tree kill requests on timeout with only the direct root exit reported;
handle disposal; and UTC start/end, PID, elapsed, exit, and outcome markers. It
preserves all installer and uninstall assertions. The production WebView2
helper is intentionally unchanged because the missing logs do not prove that
helper was the stalled owner, while the bounded outer NSIS process tree
contains its execution without changing the reviewed download or Authenticode
policy.

Local structure and mutation tests cannot replace matching native evidence.
Both x64 and ARM64 lifecycle acceptance criteria remain open until a new
exact-SHA preflight completes normally.

### NSIS uninstall direct-process correction

Exact-SHA push CI run `31342815741` completed 10/10 jobs successfully for
`91a9799a945b4fa612afa23ce5a7b245de0f913d`, including Backend Windows, both
native Windows architectures, and `CI / Required`. A final review before the
next dispatch found that direct bounded waiting was not yet equivalent for a
bare `uninstall.exe /S`: NSIS may let the directly launched stub exit after it
starts a temporary self-copy, racing all subsequent uninstall state checks.
No preflight, tag, or Release was started from that source commit.

The lifecycle now copies the installed uninstaller into a GUID-named directory
under the unique case test root and launches the copy with final, unquoted raw
`/S _?=<install-directory>`. This disables the NSIS self-copy handoff, binds the
bounded direct process and exit code to the real uninstall, and is shared by
default, custom Unicode/space, and best-effort cleanup cases. Installer calls
remain restricted to `/S` or final `/D=`; uninstaller calls require exactly
`/S` plus final `_?=`. Both forms reject quotes and control characters. Cleanup
deletes only the copied executable and its empty directory, without recursion.

Windows PowerShell 5.1 parsing, the NSIS verifier, 25 focused contract tests,
typecheck, `git diff --check`, and `release:check` (22 files, 554 contract tests
plus 4 native-fetch tests) pass. Matching x64 and ARM64 native lifecycle
execution remains the acceptance boundary and is not inferred from these local
checks.
