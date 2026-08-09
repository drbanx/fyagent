# GitHub Release Workflow Contract

## 1. Scope / Trigger

This contract applies to `.github/workflows/release.yml`, its native platform
jobs, release evidence generators, artifact attestations, and the one-time
GitHub Release publication step for FyAgent 0.3.0.

The workflow supports exactly two entry modes:

```yaml
on:
  push:
    tags:
      - "v0.3.0"
  workflow_dispatch:
    inputs:
      source_sha:
        required: true
```

- `workflow_dispatch` is an unsigned, full five-target-group preflight for the
  exact trusted `main` workflow commit. Its lowercase 40-character
  `source_sha`, `GITHUB_SHA`, and `GITHUB_WORKFLOW_SHA` must be identical so
  the standard GitHub attestation provenance describes the bytes actually
  built. It produces workflow artifacts and attestations but never creates or
  updates a GitHub Release.
- a push of the exact `v0.3.0` tag is the only formal path. The tag, product
  version, workflow ref, event SHA, checked-out commit, `origin/main` ancestry,
  and successful same-SHA Required CI must all agree.
- no branch push, broad `v*` tag, manual signed mode, manual tag dispatch,
  partial platform mode, or local publish path exists.

Local implementation, decisions, and static tests do not authorize dispatch,
tag creation, rerun, cancellation, or publication; every release must satisfy
the remote gates below. When a run is explicitly authorized, the initiating
flow waits synchronously for the whole run to reach `completed`, reads the
result once, and retrieves failed-job logs only after a failure. It does not
delegate monitoring or attach a polling watcher.

## 2. Frozen Values and Job Topology

```text
eligibility
  app_version = 0.3.0
  release_tag = v0.3.0
  source_sha = immutable main commit
  release_mode = preflight | formal
  ci_run_id / ci_run_attempt = exact successful main push CI (formal only)

eligibility ─┬─> build-windows (windows-x64, windows-arm64) ─┐
             ├─> build-linux   (linux-x64, linux-arm64)       ├─> pin-release-build-inputs
             └─> build-macos   (macos-universal) ─────────────┘            │
                       ┌─────────────────────────────────────────────────────┤
                       ├─ dispatch -> prove-windows-preflight ──────────────┐│
                       └─ formal -> sign-windows-formal -> seal-windows-formal ┴─> windows-lifecycle

pin-release-build-inputs + windows-lifecycle -> verify-assets -> attest -> publish (formal only)
```

Every platform build receives the same values only from `eligibility`. It
checks out `source_sha` directly, validates the product tag through
`version:check`, and records the trusted workflow SHA; formal metadata also
records the selected Required CI run, while preflight records
`requiredCi: null`. Before signer code, a secret-free job bundles the exact ten
build artifacts with a file-digest manifest. Consumers use its original
immutable ID, never its name. Preflight has five trust stages and formal has
six: build, pin, proof or untrusted transform/fresh seal, lifecycle, and
aggregation. No job may derive a version from a ref, package.json, Tauri
configuration, a bundle filename, or a second version source.

## 3. Eligibility Contract

Eligibility fails closed unless all of the following are true:

1. `GITHUB_REPOSITORY` is `NongHua123/fyagent` and
   `GITHUB_REPOSITORY_ID` is `1313497021`.
2. before checkout, the request envelope proves the executing workflow is
   `Release` at `.github/workflows/release.yml` and accepts only trusted
   `refs/heads/main` dispatch or exact `refs/tags/v0.3.0` push.
3. dispatch requires `source_sha == GITHUB_SHA == GITHUB_WORKFLOW_SHA`; formal
   requires workflow/event/tag/candidate commits to peel to the same source.
4. the trusted `scripts/version.mjs` is copied into an isolated temporary tree
   and reads candidate files as data; eligibility never installs dependencies
   or executes a candidate version script.
5. a fresh fetch proves the trusted workflow SHA is on `origin/main`; formal
   additionally proves `source_sha` is an `origin/main` ancestor.
6. formal mode alone requires the active CI workflow identity to be exactly
   `.github/workflows/ci.yml`.
7. in formal mode, among main push CI runs for the exact source, the latest run/attempt is
   completed successfully. An older success cannot mask a newer failure,
   cancellation, or in-progress attempt.
8. the formal selected attempt contains exactly one completed/successful
   `CI / Required` job.
9. its check suite contains exactly one matching `CI / Required` check-run from
   the `github-actions` app whose head SHA, API job/check URL, and details URL
   are bound to that selected run and job.

Standard `actions/attest` binds dispatch provenance to workflow `GITHUB_SHA`,
so this one-workflow design cannot truthfully attest a different unmerged
candidate. Preflight therefore runs after merge on the exact trusted `main`
SHA. Supporting unmerged candidates requires a separate trusted reusable
workflow or custom predicate and is outside this contract.

This workflow-only admission is intentionally weaker than administrator-backed
branch/tag rulesets or a protected environment. FyAgent 0.3.0 accepts that
residual supply-chain risk; the repository must not claim that main or the tag
is administrator-protected.

## 4. Runner, Toolchain, and Build Contract

Direct third-party Actions use reviewed full 40-character commit SHAs. Required
Release jobs do not use `*-latest` runners. Actions do not install or execute
mise. Release jobs do not restore or save dependency caches; candidate build
code cannot populate a trusted-main cache later consumed by formal release.
The native build jobs establish the repository-declared Node version before
running non-standalone `pnpm/action-setup`, whose installer requires `npm` on
`PATH`; relying on a runner image's incidental npm installation is invalid.
Both pnpm setup and `setup-rust-toolchain` declare `cache: false` explicitly.
The Rust action enables `Swatinem/rust-cache` by default when that input is
omitted, so absence of the field is not evidence that Release caching is off.

Each Windows target uses three matching-architecture hosted runners in a
preflight and four in a formal run. Preflight uses a build runner, a no-secret
proof/sealer, and a lifecycle runner. Formal inserts a secret-bearing
untrusted producer before a separate no-secret verifier/sealer and then uses a
no-secret lifecycle runner. The build runner installs dependencies, runs Cargo/Tauri,
proves the normalized NSIS
candidate is strictly `NotSigned` with an empty PE security directory, records
platform metadata, and uploads one private `raw-<target-group>` artifact. It
has no secret expression, signer staging variable, provider adapter, final
lifecycle, or final `installers-*` output.

`pin-release-build-inputs` waits for every native build and records each exact
file's size/SHA-256/version/source SHA. Its original artifact ID/digest are job
outputs. Overwrite creates a new ID; deletion makes old-ID download fail. The
preflight sealer and formal producer are mutually exclusive consumers.
`prove-windows-preflight` exists only for `workflow_dispatch` preflight. Its
entire job payload has no secret expression or signer-provider configuration;
it explicitly selects `FYAGENT_WINDOWS_SIGNING_MODE=unsigned`, requires strict
`NotSigned` evidence with null certificate fields, byte-binds that evidence to
the installer, uploads one `installers-*` artifact and one private `signing-*`
artifact, and ends. `sign-windows-formal` exists only for a formal tag push. It
is the only job whose payload receives the base64 adapter and optional opaque
credential secrets. It validates the all-or-none selector/configuration,
removes staging and managed signer variables, invokes the provider-neutral
transform, deletes the materialized adapter, and uploads only one
architecture-specific `formal-candidate-*` artifact. That artifact and any
provider-produced output are explicitly untrusted: the producer neither
creates a signing fragment, owns an `installers-*`/`signing-*` artifact, probes
post-provider bytes, nor executes the candidate.

`seal-windows-formal` runs next on another fresh matching-architecture runner
with only `contents: read`, no secret expression, adapter, or credential. It
downloads the pinned bundle by its original ID plus the untrusted formal
candidate from the same run, re-verifies the bundle manifest, checks out the frozen repository probe independently, requires
the raw input to remain strict `NotSigned`, and admits only one of two states:
byte-identical strict unsigned output, or an Authenticode-only mutation with
system status `Valid`, the complete public publisher/certificate policy, Code
Signing EKU, and timestamp policy. Only this fresh job generates the trusted
per-architecture fragment and uniquely uploads the formal `installers-*` and
`signing-*` artifacts. These Windows boundary jobs establish the exact Node
version and never run pnpm setup, dependency installation, Cargo, Tauri, or a
project build.

`windows-lifecycle` is a final fresh matching-architecture runner and has no
secret expression, signer environment, or upload step. Because one sealing job
is intentionally skipped, its `always()` admission accepts only two exact
result tuples after successful build-input pinning: dispatch/preflight with preflight sealing `success` and both
formal producer/sealer jobs `skipped`, or push/formal with preflight sealing
`skipped` and both formal producer and fresh sealer `success`; eligibility and
the raw Windows build and pin job must also be successful. Failure, cancellation, or any
other success/skip combination is rejected. The lifecycle runner downloads the
sealed installer and fragment,
admits an exact one-file pair, rechecks identity, size, and SHA-256, reasserts
the unsigned/null-certificate contract for preflight, and only then executes
the complete elevated native install/verify/uninstall lifecycle. It never
uploads or overwrites release evidence. `verify-assets` downloads the same old
pinned ID for Linux/macOS installers and all metadata, then adds only the
Windows pair produced after the provider runner ended. Windows platform
metadata remains the build runner's byte-bound record.

| Target group      | Runner             | Build user space                       | Required output                    |
| ----------------- | ------------------ | -------------------------------------- | ---------------------------------- |
| `windows-x64`     | `windows-2025`     | native x64                             | one x64 NSIS setup EXE             |
| `windows-arm64`   | `windows-11-arm`   | native ARM64                           | one ARM64 NSIS setup EXE           |
| `linux-x64`       | `ubuntu-24.04`     | native Ubuntu 22.04 amd64 child digest | AppImage, DEB, RPM                 |
| `linux-arm64`     | `ubuntu-24.04-arm` | native Ubuntu 22.04 arm64 child digest | AppImage, DEB, RPM                 |
| `macos-universal` | `macos-15`         | macOS with both Apple targets          | DMG and ZIP from one universal app |

Linux uses the reviewed, fully qualified Ubuntu 22.04 image children directly:

```text
amd64 docker.io/library/ubuntu:22.04@sha256:0199853f6d6b20b0424f3c5694a72a62764f01e6a771b1eb48a4197848986c7e
arm64 docker.io/library/ubuntu:22.04@sha256:a8cdd2158a73d7e5c02aa351fe269f48f57cf710a241db86e9ede371fc150149
```

The workflow verifies `RUNNER_ARCH`, `/etc/os-release`, and `uname -m` before
building, so a wrong host plus binfmt cannot impersonate a native target. There
is no QEMU or opposite-architecture fallback. ARM runner unavailability is a
retryable infrastructure failure, not authorization to cross-build or publish
a reduced asset set.

GitHub job containers restore their ordinary `HOME` after checkout has written
its temporary global Git configuration. Each Linux build therefore clears any
inherited global `safe.directory` values, adds only the exact
`$GITHUB_WORKSPACE` path, proves that it is the sole value visible across the
effective configuration scopes, and immediately proves its HEAD equals the
frozen source SHA. Wildcard or additional safe-directory trust, recursive
ownership changes, or disabling Git's ownership check are forbidden.

Each target proves Node 24.19.0, pnpm 10.12.3, and Rust 1.97.1 at runtime. Every
`fyagent-platform-build/v1` record uses one source-explicit shape:

- `runner.requestedLabel` is the exact matrix routing request; it is not a
  runtime-discovered host label or immutable hosted-image identity.
- `runner.context.os` and `runner.context.arch` come only from documented
  `${{ runner.os }}` and `${{ runner.arch }}` values mapped into the
  workflow-owned `ACTUAL_RUNNER_OS` and `ACTUAL_RUNNER_ARCH` variables.
  `windows-x64` requires `Windows` / `X64`, `windows-arm64` requires `Windows`
  / `ARM64`, `macos-universal` requires `macOS` / `ARM64`, and both Linux
  targets use the exact pairs below. The macOS output architecture remains
  `universal`; that output fact is distinct from, and does not weaken, the
  current `macos-15` hosted-runner architecture contract.
- Windows and macOS record exactly `container: null` and reject any supplied
  container evidence.
- Linux records the configured
  `container.configuredImage.reference` and `.manifestDigest` from the exact
  matrix image request, plus emission-time observations in
  `container.observed.osRelease.id`, `.versionId`, and `.unameMachine`.
  `linux-x64` requires `ubuntu` / `22.04` / `x86_64` with the amd64 reference
  above; `linux-arm64` requires `ubuntu` / `22.04` / `aarch64` with the arm64
  reference above.

Immediately before serialization, Linux repeats the runner, `/etc/os-release`,
and `uname -m` gates. The writer never reads ambient `RUNNER_OS`, `RUNNER_ARCH`,
`ImageOS`, or `ImageVersion`; missing, partial, contradictory, or malformed
owned evidence fails. The configured image reference is reviewed workflow
input, not an in-container digest measurement, so metadata has no synthetic
`verified` flag, actual-image digest, or hosted-image version.

The locked `@tauri-apps/cli` 2.8.1 embeds `tauri-bundler` 2.6.1, before the
nested AppImage-plugin propagation fixed by `tauri-apps/tauri#14241`. The Linux
package step alone therefore exports `APPIMAGE_EXTRACT_AND_RUN=1` and invokes
Tauri with `--verbose`. This keeps nested `linuxdeploy` execution in extraction
mode on the unprivileged container; it does not add `SYS_ADMIN`, privileged
container mode, a `/dev/fuse` device, or any other mount capability. The
workaround must be removed or revalidated when the locked Tauri CLI/bundler is
upgraded.

## 5. Platform Security Gates

### Windows

- both native jobs set `FYAGENT_WINDOWS_MANIFEST=release` on the application
  build and NSIS bundle commands.
- the NSIS bundle command uses `--verbose`, captures `$LASTEXITCODE`
  immediately, and fails before enumerating output when Tauri exits nonzero.
- the application executable is inspected before and after bundling for exact
  x64/ARM64 PE Machine, `requireAdministrator`, `uiAccess=false`, bundle
  version, and exactly one `requestedExecutionLevel`.
- `verify-windows-nsis-contract.mjs` runs before build and after bundling. It
  pins the checked-in Tauri-template provenance, Windows-only `nsis` config,
  first-section final-path gate, final-handle fixed-volume classification,
  atomic ProgramData creation or fail-closed trusted-preimage admission, and
  bounded uninstall ownership.
- both raw setup executables are strictly unsigned before leaving their native
  build runners. A formal producer may transform each exact raw file through
  the provider-neutral adapter, but its result remains untrusted. A separate
  fresh no-secret runner re-downloads the pinned raw and transformed bytes and owns
  the definitive diff, signature-policy proof, fragment, and sealed outputs.
  Fully absent signer configuration proves strict `NotSigned`; complete
  configuration must produce `Valid` plus the expected publisher/certificate
  and timestamp policy. Partial, malformed, mismatched, or failed
  configuration cannot fall back to unsigned.
- signer secrets exist only in the formal-tag signing step. The mutually
  exclusive dispatch step explicitly requests unsigned evidence and contains
  no signer secret or credential expression. Neither the build runner nor
  dependency installation, Cargo, Tauri, the native lifecycle, or artifact
  aggregation receives secrets. The formal producer clears staging and managed
  signer variables, deletes the adapter, uploads only an untrusted candidate,
  and ends without executing or producing trusted evidence for it. The fresh
  formal sealer has no secret/provider material, runs the independent
  repository probe, compares against pinned raw bytes, and exclusively uploads
  the installer/evidence pair. A further fresh no-secret lifecycle runner
  re-downloads that immutable pair before the elevated candidate executes and
  cannot replace the pair later consumed by aggregation.
- the same final bytes then run a complete native install/verify/uninstall
  lifecycle. Product architecture comes from installed `fyagent.exe`, never
  the NSIS launcher. The lifecycle covers default Program Files, fixed-drive
  custom space/Unicode `/S ... /D=...`, unsafe path rejection, HKLM registration,
  all-users shortcuts, strict ProgramData SDDL, bounded cleanup, and user-data
  sentinel preservation.
- native signing fragments are workflow-internal. The verified x64/ARM64
  aggregate becomes public `signing-status.json`, is attested, and drives the
  Windows signing table appended to the public Release notes.

### macOS

- one `universal-apple-darwin` app must contain both `arm64` and `x86_64`
  slices, version 0.3.0, and bundle identifier `com.fyagent.desktop`.
- a truly unsigned app or ad-hoc signature is acceptable. A Developer ID
  Authority or real TeamIdentifier is forbidden.
- the app and DMG must not validate as stapled/notarized. The workflow may run
  negative `stapler validate` checks; it must never run `stapler staple`,
  `notarytool`, or a signing secret path.
- ZIP and DMG are created from the same app. The ZIP is expanded, the DMG is
  verified and mounted read-only, and both copies must retain the app version
  and executable SHA-256.

### Linux

- each native container must produce exactly one raw AppImage, DEB, and RPM.
- the package step uses the step-scoped extraction-mode compatibility variable
  and `--verbose`; later validation/normalization steps do not inherit it.
- AppImage ELF architecture, DEB version/architecture, and RPM
  version/architecture must match the frozen target before normalization.
- missing formats are failures; no format is optional in the formal or
  preflight matrix.

## 6. Asset, Manifest, Metadata, and Attestation Contract

The installer allowlist contains exactly ten files:

```text
FyAgent-0.3.0-macOS.dmg
FyAgent-0.3.0-macOS.zip
FyAgent-0.3.0-Windows-x64-setup.exe
FyAgent-0.3.0-Windows-arm64-setup.exe
FyAgent-0.3.0-Linux-x86_64.AppImage
FyAgent-0.3.0-Linux-x86_64.deb
FyAgent-0.3.0-Linux-x86_64.rpm
FyAgent-0.3.0-Linux-arm64.AppImage
FyAgent-0.3.0-Linux-arm64.deb
FyAgent-0.3.0-Linux-arm64.rpm
```

Every platform artifact remains in its named directory until
`collect-workflow-artifacts.mjs` validates the expected artifact tree. The
collector refuses missing, extra, misplaced, nested, symlinked, or duplicate
files and copies with no-overwrite semantics. Flattening in the download Action
must not mask a duplicate.

`generate-download-manifest.mjs` then requires the exact ten non-empty
installers and emits `download-manifest.json` schema
`fyagent-download-manifest/v2`. It records product, version, tag, source SHA,
publication instant, and each installer's name, platform, architecture, format,
size, SHA-256, and final URL.

`generate-build-metadata.mjs` requires exactly five platform metadata records.
It validates target/runner/container identity, repository ID, trusted workflow
ref/SHA/run, release mode, source, and exact runner/toolchain evidence before
emitting `build-metadata.json`. Every input object uses an exact key allowlist
at the record, runner, runner-context, container, configured-image,
observation, OS-release, toolchain, and identity levels. Unknown or retired
keys fail; after validation the aggregate reconstructs each target from the
allowlist instead of spreading parsed input. `requiredCi` is `null` for
preflight and the unique bound path/run/attempt object for formal mode.

Local and read-only release evidence shows that neither draft metadata schema
has been publicly released or consumed, so this change finalizes
`fyagent-platform-build/v1` and `fyagent-build-metadata/v1` in place before
their first publication. If any public v1 consumer is discovered before that
publication, both identifiers and all writers/validators/types/tests/docs must
move atomically to v2; the formal path then accepts only v2. There is no v1
compatibility reader, defaulting path, or synthesized equivalence.

The attestation subjects are exactly the ten installers plus
`download-manifest.json`, `build-metadata.json`, and public
`signing-status.json` (13 subjects). `actions/attest` v4.2.2 is mandatory and
receives only those files. Its Sigstore bundle is copied to the fixed
independent name `artifact-attestation.sigstore.json`, producing exactly 14
allowed Release attachments. The bundle and signing status are evidence and do
not count as installers.

## 7. Permission and Publication Transaction

```yaml
permissions:
  contents: read
```

- eligibility alone adds `actions: read` and `checks: read`.
- attestation alone adds `id-token: write`, `attestations: write`, and
  `artifact-metadata: write`.
- publish alone adds `contents: write` after eligibility, all native builds,
  exact-asset verification, evidence generation, and attestation succeed.
- provider credentials and provider-specific adapter bytes are GitHub secrets;
  their values are never stored in repository files, workflow logs, Release
  notes, or long-lived specifications. The workflow materializes the bounded
  adapter into a random create-new runner-temporary file only for the signing
  step, passes an optional opaque credential through the environment without
  reading it, and deletes the adapter afterward. Repository code validates only
  the adapter boundary and expected public signing policy.

Publish rechecks the exact formal event/tag/source and the 14-file allowlist,
requires the English v0.3.0 Release Notes plus a signing disclosure generated
from verified metadata, and uses the authenticated Release
list (including drafts) to fail if any `v0.3.0` Release already exists. It then
creates one private draft carrying a run/source ownership marker, uploads the
14 files, lists and re-downloads them, proves exact names/non-empty states and
SHA-256 equality, then re-reads the draft ID/tag/marker/state and exact asset
IDs immediately before one final PATCH to stable/non-prerelease/latest. A
successful PATCH response is not sufficient: publish re-reads the Release by
ID, verifies the published identity and exact asset IDs, and confirms the
latest Release before declaring the transaction complete.
No failure path automatically deletes the draft: Release DELETE has no atomic
conditional guard, so deletion could race a concurrent publication. A failed
transaction reports its Release ID/URL for a separate manual decision. Once a
PATCH has been attempted, its exit handler performs one read-only API lookup
and reports the observed state as draft, published, or unknown; it never
retries PATCH and never claims the Release remains private when the outcome is
ambiguous. Any retry fails closed while that draft or published Release exists.
The workflow never updates an existing Release or moves/deletes the tag.
Because GitHub does not offer a general conditional guard for this unsafe
PATCH, an administrator could still race the final read/PATCH; that narrow
workflow-only residual risk is accepted alongside the absence of repository
rulesets and is not described as atomic administrator protection.

## 8. Failure Matrix

| Condition                                                                                                         | Required result                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Dispatch SHA is not full/lowercase or differs from trusted main workflow/event provenance                         | Fail eligibility before any platform build.                                                                         |
| Formal ref, workflow ref, tag commit, event commit, product version, or source differ                             | Fail eligibility; do not build or publish.                                                                          |
| Latest same-SHA main CI attempt is absent, running, failed, cancelled, or lacks the unique Required job/check     | Fail eligibility; an older success is not accepted.                                                                 |
| A native runner/architecture, Ubuntu child digest, or tool version drifts                                         | Fail that platform job; no fallback target is allowed.                                                              |
| Node is not established before pnpm, a Linux container lacks exact workspace trust, or a Release cache is enabled | Fail platform bootstrap; do not rely on runner-preinstalled tools, wildcard Git trust, or implicit Action defaults. |
| Windows bundle/static contract or raw unsigned proof fails                                                        | Fail the build runner before uploading the private raw candidate.                                                   |
| Pinned build-input directory, file, manifest, source, digest, or original artifact ID drifts                      | Fail before provider code or downstream consumption; a same-name replacement is never accepted.                     |
| Raw artifact set, formal producer policy/secret cleanup, or provider transform fails                              | Fail the untrusted producer; no trusted formal fragment or final artifact exists.                                   |
| Fresh formal raw diff, independent Authenticode policy, or sealed binding fails                                   | Fail the no-secret sealer; lifecycle and downstream verification remain blocked.                                    |
| Producer/sealer result tuple, sealed installer/evidence binding, or native lifecycle fails                        | Fail the secret-free lifecycle admission or execution; never replace the already sealed artifacts.                  |
| macOS app is not universal, identity differs, distribution identity/ticket exists, or ZIP/DMG copies differ       | Fail macOS output before artifact upload.                                                                           |
| Linux nested AppImage execution or package count/version/architecture differs                                     | Fail Linux output with verbose downstream stderr before artifact upload; do not add mount privileges.               |
| Artifact tree or exact ten/thirteen/fourteen allowlist differs                                                    | Fail verification/attestation/publish.                                                                              |
| Mandatory attestation or bundle is absent                                                                         | Fail; do not characterize hashes alone as v0.3.0 provenance success.                                                |
| Dispatch reaches publish                                                                                          | Static workflow test fails; remote preflight must create no Release.                                                |
| A draft or published Release already exists                                                                       | Refuse to update, replace, or delete it.                                                                            |
| Upload/re-download fails before final PATCH                                                                       | Leave the draft untouched, report ID/URL, and require manual decision.                                              |
| Final PATCH has a failed or ambiguous outcome                                                                     | Read state by ID, report draft/published/unknown, and never retry or delete.                                        |

## 9. Validation and Evidence Boundary

Local checks include Prettier, actionlint, version contract tests, the release
workflow/static Windows boundary suite, download-manifest behavior tests,
asset/metadata collector tests, and `tests/writePlatformMetadata.test.ts`. The
writer suite invokes the real CLI for all five targets and covers missing,
blank, partial, extra, contradictory, malformed, existing-output, hostile
ambient-variable, and writer-to-aggregate cases. Aggregate tests reject unknown
keys at every nested input level and prove canonical output reconstruction.
Local execution is restricted to the current host OS and architecture. A
subsystem bridge, foreign executable, cross target, emulator, or locally copied
non-host toolchain cannot establish native release evidence. PowerShell
runtime, Windows NSIS/signing/lifecycle, Linux package, macOS bundle, and every
non-host architecture check run only in their matching native GitHub Actions
jobs. No local cross-OS or cross-architecture result counts toward acceptance.

A green local suite proves the implementation contract, not publication.
Release closure requires the exact source's main `CI / Required`, one
successful post-merge same-SHA full-matrix preflight, the tag-triggered
formal run, the public stable Release, independent re-download/digest checks,
and attestation evidence. D113 acceptance alone cannot satisfy these gates.
Trellis archival, journal, and branch cleanup are repository closeout gates,
not substitutes for or retroactive changes to Release evidence.

## 10. v0.3.0 Historical Evidence

The prior release instance remains independently auditable at source
`bde1370bbaffd345c3d9875708615eaf96140591`: main CI `31259389682`, preflight
`31259905022`, annotated tag object
`e6706d4bdc33a184cf641204574df1fc2962ca4c`, formal run `31260931509`, and
[stable/latest v0.3.0](https://github.com/NongHua123/fyagent/releases/tag/v0.3.0)
(Release ID `367220197`). Its re-download, digest, metadata, and Sigstore checks
describe that historical MSI-era release only; they do not satisfy the current
NSIS/formal-sealer contract or any future release gate. The repository had no
ruleset, branch/tag protection, or Release environment, so its recorded trust
remains workflow-scoped.
