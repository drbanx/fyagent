# GitHub Release Workflow Contract

## 1. Scope and release authority

This contract owns `.github/workflows/release.yml`, the repository release
helpers under `scripts/release/`, their fixture suites, and the transaction
that may publish a FyAgent GitHub Release. Read it before changing release
events, eligibility, native runners, signer configuration, artifact ownership,
attestation, Release notes, or the final publication request.

Per-asset NSIS mechanics, fixed-volume admission, Windows signing evidence, and
native install/uninstall semantics are owned by
[Windows Installer](./windows-installer.md). Formal startup and the protected
machine-runtime descriptor are owned by
[Windows Runtime Security](./windows-runtime-security.md). This workflow owns
their orchestration, frozen inputs, aggregate evidence, and publication gate.

The workflow supports two entry modes:

```yaml
workflow_dispatch:
  inputs:
    source_sha:
      required: true
push:
  tags:
    - "v*.*.*"
```

The YAML tag filter is only routing. The repository-owned eligibility engine
accepts exactly stable `vX.Y.Z` with no prerelease, build metadata, missing
component, or leading zero.

- `workflow_dispatch` is a full five-target preflight for the current trusted
  `dev/laiyongjie` HEAD. It may build, execute native lifecycle checks, create
  workflow artifacts, and attest candidate bytes, but it can never create or
  update a GitHub Release.
- a tag `push` is the only formal publication path. The remote tag must be an
  annotated tag whose target commit equals the current remote
  `dev/laiyongjie` HEAD and the exact successful full push CI source.
- neither mode reads release authority from `main`, branch protection, a
  ruleset, merge settings, or a Main Provenance workflow. This project does
  not claim that those administrator controls exist.
- no branch push, manual signed mode, manual tag dispatch, partial target mode,
  cross-architecture substitute, local publish path, or update-in-place path
  exists.

Creating/pushing the tag and invoking the remote preflight are parent-task
operations. Local tests and this specification do not authorize either action.

## 2. Frozen release identity

Eligibility is the sole producer of these values:

```text
app_version   = canonical Cargo stable version
release_tag   = "v" + app_version
source_sha    = current remote dev/laiyongjie HEAD
workflow_sha  = source_sha
release_mode  = preflight | formal
ci_run_id     = exact successful dev push CI run
ci_attempt    = exact successful attempt of that run
```

Every platform build, metadata writer, signer boundary, lifecycle job,
attestation, and publication step consumes these values unchanged. Downstream
jobs must not strip a ref, reread a second version source, select a newer CI
attempt, or substitute a different source/workflow SHA.

Both modes bind the same exact successful dev push CI. Preflight is therefore
evidence for the same source that may later be tagged; it is not an unbound
manual diagnostic. Formal mode additionally binds the remote annotated tag.

The frozen output has exact keys:

```json
{
  "appVersion": "X.Y.Z",
  "releaseTag": "vX.Y.Z",
  "sourceSha": "<40 lowercase hex>",
  "workflowSha": "<same SHA>",
  "ciRunId": "<positive decimal>",
  "ciRunAttempt": "<positive decimal>",
  "mode": "preflight | formal"
}
```

Later remote checks compare every key to this frozen value. A newer successful
rerun is not silently substituted after the initial decision.

## 3. Repository-owned eligibility and remote evidence

`scripts/release/dev-release-eligibility.mjs` is pure logic over normalized
schema `fyagent-dev-release-eligibility-input/v1`. It performs no network or
Git operation. The repository-owned remote collector reads GitHub through the
workflow token, constructs that exact schema, calls the pure evaluator, and
may compare against a previously frozen output.

Eligibility fails closed unless all of these facts agree:

1. repository name/id are `NongHua123/fyagent` / `1313497021`;
2. the workflow is `Release` at `.github/workflows/release.yml` and its
   workflow SHA equals the candidate source;
3. the canonical version is stable `X.Y.Z` and the tag is exactly `vX.Y.Z`;
4. the live `refs/heads/dev/laiyongjie` target equals candidate, event,
   workflow, and checkout source SHA;
5. preflight event/ref/workflow ref are the dev branch and its explicit
   `source_sha` input equals the frozen source; remote tag evidence is absent;
6. formal event/ref/workflow ref are the same version tag, the remote ref
   points to a Git `tag` object rather than directly to a commit, the annotated
   tag name is exact, and its target is the frozen commit;
7. the CI workflow belongs to the same repository, is active, is named `CI`,
   and has path `.github/workflows/ci.yml`;
8. among exact-source `push` runs whose head repository is the same repository
   and whose head branch is `dev/laiyongjie`, the latest run number/attempt is
   completed successfully; an older green run cannot mask a later failed,
   cancelled, timed-out, or running attempt;
9. the selected attempt contains exactly one completed/successful
   `CI / Required` job and one matching check-run from the `github-actions`
   app, bound to the same run, attempt, check suite, source SHA, API URL, and
   job details URL.

Unknown keys, malformed IDs/SHA/statuses, incomplete pagination, HTTP errors,
wrong repository/workflow/event/branch, a moved branch, a lightweight tag,
missing evidence, duplicate Required results, or evidence URL drift are
failures. Tokens and API responses are not written to Release notes or logs.

Initial eligibility freezes the decision before any build. Formal publication
then performs two independent live rechecks with the same collector and exact
frozen value:

- once when the publish job begins, before creating a draft;
- once after draft upload/re-download/digest verification and immediately
  before the one final publication PATCH.

A branch move, tag replacement, CI attempt change, identity drift, or API
failure at either point stops publication. The workflow never moves/deletes
the tag to repair a failed run.

The independent [Windows Installer](./windows-installer.md) contract
additionally requires every version component to fit `0..65535` before Tauri
packages an installer. That narrow representation gate does not create a
second application version.

## 4. Job and trust topology

```text
eligibility
  ├─ build-windows (x64, ARM64) ─┐
  ├─ build-linux   (x64, ARM64)  ├─ pin-release-build-inputs
  └─ build-macos   (universal) ──┘              │
                                                 ├─ preflight proof ───────┐
                                                 └─ formal transform       │
                                                     └─ fresh formal seal ┤
                                                                          └─ windows-lifecycle

pin-release-build-inputs + windows-lifecycle
  └─ verify-assets ──> attest ──> publish (formal push only)
```

All build jobs receive only frozen values and check out `source_sha`
directly. Before any signer code executes, the secret-free pin job waits for
all native builds, validates the exact directory/file set, records every
file's version/source/size/SHA-256 in `trusted-build-inputs.json`, and uploads
one `trusted-build-inputs` artifact. Its original artifact ID/digest are job
outputs. All trusted consumers download that original ID. Deleting it causes a
failure; uploading a same-name replacement yields another ID and cannot
replace the pinned bytes.

The preflight and formal Windows paths are mutually exclusive:

- `prove-windows-preflight` contains no provider configuration or secret
  expression. It explicitly requests unsigned mode, proves strict
  `NotSigned`, binds the raw bytes, and uniquely creates the preflight final
  installer and private signing fragment.
- `sign-windows-formal` is the only secret-bearing provider job. It consumes
  pinned raw bytes, validates the mode/configuration matrix, executes the
  provider-neutral transform, and uploads only an explicitly untrusted
  `formal-candidate-*` artifact. It cannot create trusted signing fragments or
  final installer artifacts and never executes the candidate.
- `seal-windows-formal` runs on a fresh matching native runner with no signer
  secret, credential, adapter, dependency install, or candidate build. It
  downloads the original pinned raw input plus the untrusted candidate,
  re-proves raw `NotSigned`, admits only byte-identical unsigned output or an
  Authenticode-only mutation, independently probes the public signature
  policy, and exclusively creates the formal final pair.
- `windows-lifecycle` runs on another fresh matching native runner. It has no
  signer secrets or upload step, rebinds the sealed installer to its fragment,
  executes the complete elevated lifecycle, and cannot change the artifacts
  later consumed by aggregation.

The formal provider therefore has authority to transform its candidate or
cause a denial of service, but it cannot replace pinned build inputs or create
trusted release evidence. Elevated candidate execution never shares a runner
with signer material.

## 5. Runner, architecture, and toolchain contract

Direct third-party Actions use reviewed full commit SHAs. Required jobs do not
use `*-latest`, restore candidate-controlled release caches, or execute mise.
Node is established before pnpm. pnpm and Rust Action caches are explicitly
disabled.

| Target          | Runner/build environment                                | Exact installer output             |
| --------------- | ------------------------------------------------------- | ---------------------------------- |
| Windows x64     | `windows-2025`, native `X64`                            | x64 NSIS setup EXE                 |
| Windows ARM64   | `windows-11-arm`, native `ARM64`                        | ARM64 NSIS setup EXE               |
| Linux x64       | `ubuntu-24.04`, pinned Ubuntu 22.04 amd64 container     | AppImage, DEB, RPM                 |
| Linux ARM64     | `ubuntu-24.04-arm`, pinned Ubuntu 22.04 arm64 container | AppImage, DEB, RPM                 |
| macOS universal | `macos-15`, both Apple targets                          | DMG and ZIP from one universal app |

Linux uses the reviewed multi-architecture Ubuntu image children:

```text
amd64 docker.io/library/ubuntu:22.04@sha256:0199853f6d6b20b0424f3c5694a72a62764f01e6a771b1eb48a4197848986c7e
arm64 docker.io/library/ubuntu:22.04@sha256:a8cdd2158a73d7e5c02aa351fe269f48f57cf710a241db86e9ede371fc150149
```

Each target verifies documented `runner.os`/`runner.arch`, the requested
runner label, source HEAD, Node 24.19.0, pnpm 10.12.3, and Rust 1.97.1. Linux
also verifies configured digest, `/etc/os-release`, `uname -m`, and a single
exact workspace `safe.directory`. There is no QEMU, binfmt impersonation,
opposite-architecture toolchain, or reduced-target fallback. ARM runner
unavailability blocks acceptance.

The locked Tauri bundler requires Linux AppImage extraction mode for nested
tool execution. That variable is limited to the package step; it does not
grant mount, FUSE, privileged-container, or `SYS_ADMIN` capability and must be
re-evaluated when the locked Tauri CLI/bundler changes.

## 6. Platform security and lifecycle gates

### Windows

- application and bundle commands use the formal release manifest and verify
  exact PE architecture, `requireAdministrator`, `uiAccess=false`, and one
  execution-level manifest entry;
- `verify-windows-nsis-contract.mjs` runs before packaging and on the produced
  setup. It binds the reviewed Tauri template, Windows-only NSIS target,
  shared pre-write final-path validator, fixed local volume, strict
  ProgramData creation/admission, and bounded uninstall ownership;
- raw setup bytes leave build runners only after strict `NotSigned` proof and
  an empty PE security directory;
- the final x64 and ARM64 bytes must agree on signed/unsigned mode. Complete
  provider configuration requires `Valid`, expected publisher/certificate,
  Code Signing EKU, and timestamp policy. Missing signer mode may produce
  strict unsigned evidence. Partial, empty-active, malformed, failed,
  mismatched, or post-sign-mutated states fail and never downgrade;
- final bytes run native default and custom fixed-drive install, program and
  HKLM/shortcut verification, unsupported local/network/reparse path rejection,
  uninstall, installer-owned cleanup, and user-data sentinel preservation;
- architecture is proved from installed `fyagent.exe`, not the NSIS launcher.

### macOS

- one universal app contains `arm64` and `x86_64`, the frozen version, and
  bundle identifier `com.fyagent.desktop`;
- the current public policy is unsigned/ad-hoc only. A Developer ID authority,
  real TeamIdentifier, notarization, or stapled ticket is rejected;
- ZIP and DMG originate from the same app and are re-opened to prove version
  and executable digest identity.

### Linux

- each native container produces exactly one AppImage, DEB, and RPM;
- ELF/package architecture and package version match the frozen target before
  normalization;
- AppImage extraction compatibility is step-scoped and package stderr remains
  visible; no format is optional in preflight or formal mode.

## 7. Assets, metadata, signing disclosure, and attestation

The installer allowlist contains exactly ten versioned files:

```text
FyAgent-X.Y.Z-macOS.dmg
FyAgent-X.Y.Z-macOS.zip
FyAgent-X.Y.Z-Windows-x64-setup.exe
FyAgent-X.Y.Z-Windows-arm64-setup.exe
FyAgent-X.Y.Z-Linux-x86_64.AppImage
FyAgent-X.Y.Z-Linux-x86_64.deb
FyAgent-X.Y.Z-Linux-x86_64.rpm
FyAgent-X.Y.Z-Linux-arm64.AppImage
FyAgent-X.Y.Z-Linux-arm64.deb
FyAgent-X.Y.Z-Linux-arm64.rpm
```

Any Windows format other than the two NSIS setup executables, plus v-prefixed
filenames, unversioned names, architecture aliases, missing files, extras,
directories, symlinks, empty files, or overwrites is forbidden.

`download-manifest.json` schema `fyagent-download-manifest/v2` binds each
installer's exact name, platform, architecture, format, size, SHA-256, URL,
version, tag, source SHA, and publication instant.

Five `fyagent-platform-build/v1` records bind target/runner/container,
toolchain, repository/workflow/run, source, release mode, and the same Required
CI run/attempt in both modes. `build-metadata.json` schema
`fyagent-build-metadata/v1` reconstructs those records through exact key
allowlists and emits non-null `requiredCi`.

The two private Windows fragments are normalized into public
`signing-status.json`. Release notes generate their Windows table only from
that verified metadata. Unsigned assets must explicitly say both architectures
are not Authenticode signed and still list SHA-256, source SHA, and
attestation. Signed mode reports the verified public certificate policy; no
credential or adapter secret is included.

Attestation subjects are the ten installers plus `download-manifest.json`,
`build-metadata.json`, and `signing-status.json` (13 subjects). The Sigstore
bundle is copied to `artifact-attestation.sigstore.json`; it is the fourteenth
Release attachment and does not attest itself.

## 8. Permissions and publication transaction

Workflow default permission is `contents: read`.

- remote eligibility/rechecks receive only `contents: read`, `actions: read`,
  and `checks: read`;
- attestation receives `contents: read`, `id-token: write`,
  `attestations: write`, and `artifact-metadata: write`;
- the formal publish job alone receives `contents: write` after every build,
  lifecycle, exact-asset, metadata, and attestation dependency succeeds;
- provider secrets exist only in the formal transform job. They never reach
  builds, preflight, fresh sealing, lifecycle, aggregation, notes, or specs.

The publish job has an explicit formal tag-push condition; dispatch evaluates
to false. It performs this transaction:

1. re-evaluate live remote eligibility against the frozen identity;
2. require the exact 14 attachments and dynamic English notes file
   `docs/release-notes/${RELEASE_TAG}-en.md`;
3. generate the signing disclosure from verified metadata;
4. list all Releases, including drafts, and refuse any existing release with
   the tag;
5. create one private draft with a run/source ownership marker;
6. upload all attachments, list them, re-download by identity, and prove exact
   name, asset ID, non-empty state, and SHA-256 equality;
7. re-read the draft identity/state/marker and re-evaluate live remote
   eligibility against the same frozen output immediately before publication;
8. issue one PATCH to `draft=false`, `prerelease=false`, `make_latest=true`;
9. re-read by Release ID, verify exact published identity/asset IDs, and
   independently confirm it is Latest.

No failure handler deletes a draft, retries the final PATCH, updates an
existing Release, or moves/deletes the tag. Before PATCH, failures leave and
report the draft for a separate human decision. After PATCH is attempted, one
read-only observation reports draft/published/unknown; an ambiguous outcome is
never called private or successful.

## 9. Failure matrix

| Condition                                                                                                                  | Required result                                        |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Candidate/version/tag/event/workflow/dev HEAD differs                                                                      | Fail before native builds.                             |
| Formal tag is lightweight, points elsewhere, or changes                                                                    | Fail; never repair or move the tag.                    |
| Exact-source dev CI is absent/running/failed/cancelled/timed out, stale, wrong identity, or lacks unique Required evidence | Fail; never accept an older green commit/attempt.      |
| Preflight reaches a publish path or provider secret                                                                        | Static/remote gate fails.                              |
| Native runner, architecture, toolchain, Linux digest/OS, or source drifts                                                  | Fail that target; no fallback.                         |
| Pinned build input ID/digest/manifest/file set drifts                                                                      | Fail before provider or trusted consumption.           |
| Signer configuration is partial/invalid or fresh signature proof fails                                                     | Fail; do not downgrade to unsigned.                    |
| Windows sealed binding/lifecycle, macOS identity, or Linux package set fails                                               | Stop aggregation and publication.                      |
| Ten/thirteen/fourteen file allowlist or digest differs                                                                     | Stop verification, attestation, or publication.        |
| Live dev/tag/CI identity changes during the transaction                                                                    | Stop before creating the draft or before final PATCH.  |
| A draft/published Release already exists                                                                                   | Refuse update, replacement, or deletion.               |
| Upload/re-download/pre-PATCH verification fails                                                                            | Leave draft untouched and report it.                   |
| Final PATCH is failed or ambiguous                                                                                         | Observe once; do not retry/delete or claim completion. |

## 10. Validation and evidence boundary

Local gates cover the pure classifier/eligibility/required evaluators, remote
collector fixtures, version/release metadata, workflow structure, exact asset
sets, signing adapter policy, Windows NSIS contract, task docs, type checking,
formatting, and action-pin audits. Hermetic tests must include wrong repository,
workflow, event, branch, SHA, tag type, version, stale success, newer failed or
timed-out attempt, moved branch, pagination, HTTP failure, frozen-output drift,
dispatch publication, asset loss/extra, signer policy, and transaction failure.

Local Linux execution cannot establish Windows PowerShell/NSIS/AuthentiCode,
native x64/ARM64 install lifecycle, macOS bundle, Linux non-host architecture,
GitHub attestation, or public Release evidence. Closure requires, in order:

1. one unified work push whose current dev HEAD completes full
   `CI / Required`;
2. a successful same-SHA dispatch preflight;
3. an annotated stable tag at that SHA and successful formal workflow;
4. a public, non-prerelease, Latest Release with exact assets, disclosure,
   digests, metadata, and attestation;
5. a closeout-only Trellis archive/journal push whose new dev HEAD again
   completes full `CI / Required`.

`windows-11-arm` remains public preview and may block the run. Unsigned Windows
installers may trigger trust prompts; disclosure, SHA-256, and attestation make
the origin auditable but are not equivalent to Authenticode. The repository's
unprotected `main` and lack of Main Provenance remain accepted out-of-scope
risks and are not represented as release guarantees.
