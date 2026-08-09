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
