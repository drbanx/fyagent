# Implementation

1. [done] Inventory MSI/WiX ownership and user-data paths; freeze keep/delete lists.
2. [done] Add NSIS platform config, standard path selection, protected machine
   runtime bootstrap, canonical installer/uninstaller icon, and contract checks
   that forbid a custom installation-path gate.
3. [done] Update Windows build, artifact collection, release-contract code, and tests
   to setup EXEs while leaving other platforms unchanged.
4. [done] Delete MSI/WiX-only crate, configs, scripts, fixtures, and tests.
5. [done] Add optional signer status/verification and release-note metadata. Keep
   all native build outputs behind one pre-signer immutable artifact ID,
   preflight sealing wholly secret-free; formal signing first emits only an
   untrusted transformed candidate, then a fresh secret-free runner compares it
   with raw bytes, independently verifies policy, and owns trusted evidence.
6. [done locally] Remove the Release lifecycle job. Route the exact successful
   preflight/formal result tuples directly into immutable sealed-asset
   verification, attestation, and publication; retain the lifecycle script only
   as an optional manual diagnostic.
7. [done locally] Run config/release/unit/Rust checks locally; require matching
   native x64/ARM64 build and package success without an Actions
   install/verify/uninstall gate.

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

The optional manual lifecycle diagnostic uses a dedicated test home and
sentinel data in both the default FyAgent root and Tauri user-state locations.
Those checks remain useful operator diagnostics but are not Release acceptance.

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

At that point these checks proved the static workflow contract only; matching
native x64 and ARM64 signing/install/uninstall runs were still treated as
required remote acceptance evidence.

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
and no custom lifecycle root. Under the then-current contract, complete x64 and
ARM64 WebView2 trust, install/uninstall, registry, shortcut, ProgramData, and
user-data-preservation acceptance remained gated on the native GitHub
`windows-2025` and `windows-11-arm` runners.

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
compressed bytes plus exact decompressed source. At that time a new full dev
push CI and same-SHA dispatch preflight remained mandatory before tagging.

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

Under the then-current contract, local structure and mutation tests could not
replace matching native evidence, and both x64 and ARM64 lifecycle acceptance
criteria remained open pending a new exact-SHA preflight.

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
plus 4 native-fetch tests) passed. At that point matching x64 and ARM64 native
lifecycle execution was still the acceptance boundary and was not inferred
from those local checks.

## Subsequent installer and Release simplification decision

The lifecycle runs, timeout, diagnostics, and corrections above are retained as
historical evidence of what was attempted and why the earlier workflow behaved
as it did. They do not describe the current acceptance contract. After those
runs, the product decision changed in two explicit ways:

- FyAgent no longer pre-validates the user-selected `$INSTDIR`. The standard
  NSIS directory page and final `/D=` value are passed through without a custom
  absolute/fixed/local/UNC/reparse/drive-type gate. NSIS/Windows behavior and
  actual write failures remain; the independent protected
  `%ProgramData%\FyAgent\runtime` owner/DACL contract is unchanged.
- Release no longer defines or waits for a native install/verify/uninstall
  lifecycle job. Matching x64 and ARM64 build/package success plus immutable
  sealing, exact asset verification, attestation, and publication are the
  active gates. `verify-windows-nsis-lifecycle.ps1` remains only as a bounded
  manual diagnostic.

The Windows configuration now pins canonical `icons/icon.ico`, and the custom
NSIS template applies it to both setup and uninstaller UI. Current contract
tests must prove these decisions and reject any accidental reintroduction of a
Release lifecycle job or custom installation-path policy.

### Current post-decision local evidence

The default NSIS source verifier now reads only the packaging/config/template
boundary; the manual lifecycle source is checked only when explicitly supplied
for diagnostics. `mise run release:check` passed 22/22 files and 578/578
contract tests plus the 4/4 native-fetch suite. The focused NSIS and Release
workflow files passed 81/81 tests, including renamed `$INSTDIR` rejection and
renamed installer-execution job mutations. The Windows PowerShell 5.1 AST
parser, typecheck, reviewed-file format check, and `git diff --check` passed.

No matching x64/ARM64 package build or manual installer execution was performed
for this working tree, so those native observations are not inferred from the
local contracts.

## Exact-SHA package and manual-install follow-up

The preceding statement describes the local freeze point. Push CI run
`31357521242` subsequently completed 10/10 jobs successfully for exact source
`d9e951860e2e770992bf040add87eec0d99940a3`, including the native Windows x64
and ARM64 contract jobs (with explicit-SID Main package-inventory smoke) and
aggregate `CI / Required`.

Same-source dispatch preflight `31358299654` passed eligibility, all native
builds, immutable input pinning, x64 and ARM64 unsigned sealing, and
`verify-assets`. It is not accepted as a complete preflight: attestation job
`93365897541` was skipped, `release-attachments` is absent, and only 16 of the
17 required workflow artifacts exist. An overall green run cannot substitute
for those missing outputs, so this child remains open pending a corrected
exact-SHA native cycle.

A real installation attempt also found that the setup could not complete its
protected machine-runtime bootstrap. MakeNSIS emitted twelve warning-6000
diagnostics because `$COMMONAPPDATA` is not an NSIS variable. In addition, the
implementation separated the native operation from `GetLastError` capture,
allowing an intervening operation to pollute the reported code. Follow-up work
is in progress; this record does not claim that either cause is fixed or that a
replacement setup has passed installation.

The current x64 setup's PE icon resources were compared frame by frame with the
canonical FyAgent icon and matched. The default icon observation was traced to
preflight run `31346575437`, artifact `installers-windows-x64` (`9047816162`),
setup SHA-256
`69c1c0cc5f89808d80c6a2e43b73b260469bfe477cb9fd69c5abdc6370c07fa7`;
that older artifact reused the same filename and is not the current setup
bytes. The current blocker is therefore the runtime bootstrap and incomplete
attestation path, not the configured installer/uninstaller icon.

## Local runtime and final-icon correction

The runtime bootstrap correction replaces every unsupported `$COMMONAPPDATA`
reference with the locked NSIS 3.08 `$COMMONPROGRAMDATA` variable and makes
warning 6000 fatal. `CreateFileW` now captures its error through the same
`System::Call` using `?e`, followed immediately by `Pop $9`; the separate
`GetLastError` call is gone. Contract mutations reject the old variable,
missing or displaced error capture, inserted error-state mutation, and
warning-6000 regression while retaining the existing protected runtime
owner/DACL, reparse, no-repair, and handle-pinning checks.

The existing setup/uninstaller icon wiring is now complemented by a
dependency-free PE-resource verifier. Release checks it once against each raw
matrix setup and again against both exact final Windows installers, requiring
one group icon whose referenced frames and bytes equal canonical
`icons/icon.ico`, with no extra or unreferenced icon resources. It accepts the
current x64 setup downloaded from preflight `31358299654`, artifact
`installers-windows-x64` (`9051853460`), SHA-256
`a5523fe81f55645cd13f2745a9d1cb35a7194ac98556f7f9fb2bbb39af22c888`.
It rejects the identified run-`31346575437` setup because its icon-group frame
count differs from the canonical ICO.

The corrected local snapshot passed 47/47 NSIS contract tests and 24/24 PE-icon
tests; the combined Release/NSIS/icon focus passed 119/119. `mise run
release:check` passed 25/25 files and 628/628 contract tests plus 4/4
native-fetch tests, and the parent-owned full `mise run check` exited zero.
Typecheck, the source verifier, formatting, and `git diff --check` also passed.

The final review hardened those contracts further: warning 6000 remains fatal
only when the canonical pragma is the sole pragma across the repo-owned
executable closure, is active at top level, and precedes the unique top-level
installer hook. Literal, define-expanded, dynamically constructed,
conditional-decoy, and stack-based overrides are rejected; only the inventoried
line-start runtime macros are allowed, and repo-owned sources cannot redefine
them. The PE parser requires canonical named/ID resource ordering, bounds total
parse work and cumulative payload, uses zero-copy payload views, rejects reused
data entries plus aliased or overlapping payload ranges, and validates PNG
chunk names from raw ASCII bytes before decoding. Workflow mutations prove a
raw or final icon-verifier failure cannot be ignored.

This is not native installation evidence. A replacement x64/ARM64 build must
show no warning 6000 and pass the raw/final PE-icon gates. A real install
observation for protected runtime-directory creation remains unverified and
non-blocking; it is not a child-acceptance or archive gate. The child remains
open for the exact-SHA CI/preflight and formal Release evidence; the retired
Actions lifecycle is not reinstated.
