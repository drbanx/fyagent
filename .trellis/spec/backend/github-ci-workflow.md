# GitHub CI Workflow Contract

## 1. Scope and stable public result

This contract owns `.github/workflows/ci.yml`,
`scripts/ci/classify-changes.mjs`, `scripts/ci/required-gate.mjs`, and their
fixture suites. It applies to pull requests, merge queue candidates, pushes to
`main` and `dev/laiyongjie`, and manual diagnostics.

This workflow owns scheduling and aggregation, not the underlying product
contracts. Windows installer/runtime gates are defined by
[Windows Installer](./windows-installer.md) and
[Windows Runtime Security](./windows-runtime-security.md); managed-template
divergence is defined by [Trellis Tooling](./trellis-tooling.md).

The only stable aggregate result is:

```text
CI / Required
```

The workflow has no top-level `paths` or `paths-ignore` filter. The aggregate
job uses `if: always()`, so a docs-only change, classifier failure, cancelled
domain job, or timeout cannot make the required result disappear.

The workflow triggers are:

```yaml
pull_request:
  branches: [main]
push:
  branches: [main, dev/laiyongjie]
merge_group:
  types: [checks_requested]
workflow_dispatch:
```

- every `main` push remains a full CI run;
- every `dev/laiyongjie` push is a full CI run and is the only CI event that
  can satisfy the dev-release eligibility contract;
- PR and `merge_group` runs execute only affected domains;
- `workflow_dispatch` is a full diagnostic run and is never release evidence
  because its event is not `push`.

Repository branch protection, rulesets, merge methods, and Main Provenance are
outside this workflow. The current release trust is the exact successful dev
push chain, not an administrator-enforced main-branch claim.

## 2. Explicit change classification

The repository-owned public CLI is:

```text
node scripts/ci/classify-changes.mjs --base <sha> --head <sha> --json
```

Both revisions must be full 40-character commit object IDs. The classifier
does not read `GITHUB_EVENT_NAME`, `GITHUB_REF`, or any other ambient GitHub
policy input. It obtains the changed path set through a NUL-delimited Git diff,
classifies both sides of rename/copy records, and emits exactly:

```json
{
  "domains": {
    "contracts": true,
    "frontend": false,
    "desktop": false,
    "backend": false,
    "windowsNative": false,
    "docsSpec": true
  },
  "unknownPaths": [],
  "forceFull": false
}
```

Path ownership exists only in the classifier module. Workflow YAML may map
domain booleans to jobs, but it must not duplicate repository path globs.

Classification invariants:

- workflow, classifier, release, Trellis verification, task-wrapper, mise, and
  toolchain control-plane paths set `forceFull=true` and every domain true;
- `package.json` and pnpm dependency roots widen contracts/frontend/desktop;
- every `src-tauri/**` change reaches contracts plus its backend/native owner,
  so version, release, manifest, NSIS, and desktop-security static suites cannot
  be skipped by a Rust-only plan;
- Cargo workspace and lock roots widen contracts/backend/windowsNative;
- Windows runtime, NSIS, Windows packaging, and Codex Windows ownership reach
  contracts plus `windowsNative`;
- docs and active Trellis specs reach docsSpec plus the lightweight contracts
  owner;
- a new path without an owner is returned in sorted `unknownPaths`, printed as
  JSON, and makes the CLI fail;
- unknown paths are never silently treated as no-op or full CI;
- missing revisions, non-commit objects, malformed diff output, unsafe paths,
  duplicate flags, and option injection fail closed.

The classifier's `forceFull` is path-derived only. Event policy is applied by
the workflow after classification:

- PR and merge-group candidates keep the classifier plan;
- pushes to either configured branch and manual diagnostics replace the plan
  with `forceFull=true` and every existing domain true;
- event forcing never clears `unknownPaths` or converts a classifier error to
  success.

## 3. Base and head identity

The classifier receives these explicit inputs:

| Event               | Base                    | Head                    | Event policy     |
| ------------------- | ----------------------- | ----------------------- | ---------------- |
| `pull_request`      | `pull_request.base.sha` | `pull_request.head.sha` | affected domains |
| `merge_group`       | `merge_group.base_sha`  | `merge_group.head_sha`  | affected domains |
| `push`              | event `before`          | `github.sha`            | full             |
| `workflow_dispatch` | `github.sha`            | `github.sha`            | full             |

A first branch push whose `before` value is forty zeroes uses `head` as the
classifier base, then relies on the independent event full-run policy. Checkout
uses complete comparison history and never executes a path-filter action as a
second authority.

PR checks intentionally classify the PR head against the explicit base rather
than inferring identity from a local merge commit. Merge queue checks use the
event's explicit group base/head pair. A missing event SHA is a classifier job
failure and therefore a failed `CI / Required`.

## 4. Domain-to-job topology

```text
changes
  ├─ contracts
  ├─ frontend
  ├─ desktop-acceptance-contract
  ├─ backend-linux
  ├─ backend-windows
  ├─ windows-native-contracts (X64, ARM64)
  └─ backend-macos
         ↓
    CI / Required
```

The requested job mapping is exact:

| Job ID                        | Requested when               |
| ----------------------------- | ---------------------------- |
| `contracts`                   | `contracts \|\| docsSpec`    |
| `frontend`                    | `frontend`                   |
| `desktop-acceptance-contract` | `desktop`                    |
| `backend-linux`               | `backend`                    |
| `backend-windows`             | `backend \|\| windowsNative` |
| `windows-native-contracts`    | `windowsNative`              |
| `backend-macos`               | `backend`                    |

Every domain job needs `changes` and may run only after classifier success.
Docs/spec-only changes therefore execute the repository contracts gate but do
not start frontend, Rust, macOS, or Windows-heavy jobs. The contracts job runs
the read-only Trellis overlay verifier before the release/task contract suite.

## 5. Required aggregation and timeout evidence

`scripts/ci/required-gate.mjs` is the pure evaluator for the stable aggregate.
It receives:

1. exact `toJSON(needs)` results for `changes` plus the seven domain job IDs;
2. the exact classifier/event plan emitted by `changes`;
3. the current workflow run-attempt Jobs REST response.

The evaluator requires exact keys and booleans. Its result rules are:

- `changes` must be successful;
- a requested job must be successful;
- a non-requested job must be skipped;
- a requested skip is failure, not an optimization;
- an unrequested job that runs is policy drift and fails;
- failure, cancellation, timeout, missing results, unknown conclusions,
  incomplete pagination, and result/API disagreement all fail;
- matrix conclusions are aggregated without allowing one successful child to
  hide a failed, cancelled, or timed-out child.

GitHub's `needs.<job>.result` exposes only `success`, `failure`, `cancelled`,
and `skipped`; it cannot distinguish a timeout from ordinary failure. The
Required job therefore has job-local `actions: read`, reads the exact current
run and attempt through the Jobs REST API, and uses its explicit `timed_out`
conclusion. The token is scoped only to the collection step. The evaluator
runs in the following step without a token environment.

The API response must be complete: `total_count` equals the received jobs
array length. The current topology is below one page; a future topology that
exceeds the bound must add complete pagination in the same change.

## 6. Concurrency and reruns

- PR, merge-group, main push, and dev push groups cancel stale in-progress
  runs when a newer commit for the same ref/group arrives.
- each manual diagnostic run uses its own run ID/attempt group and sets
  `cancel-in-progress=false`; two manual diagnostics do not cancel each other.
- a native GitHub rerun remains the same run identity with a later attempt and
  keeps the original `GITHUB_SHA`/`GITHUB_REF` semantics.
- release eligibility accepts a successful rerun only while that original SHA
  is still the current remote `dev/laiyongjie` HEAD.

## 7. Job and toolchain contracts

All direct third-party Actions use reviewed full 40-character commit SHAs.
Workflow permissions default to `contents: read`; no CI job has write
permission or accesses repository secrets. Every checkout sets
`persist-credentials: false`.

CI does not invoke mise. Version and toolchain facts come from the standard
repository files through the repository-owned verifier:

- `.node-version` for Node;
- `packageManager` in `package.json` for pnpm;
- `rust-toolchain.toml` for Rust;
- `mise.lock` for the reviewed uv lock value;
- `.python-version` for managed Python.

The workflow does not duplicate literal Node, pnpm, Rust, uv, Python, or
application versions. Rust setup disables its implicit cache. uv setup pins
the resolved reviewed version and disables cache. pnpm installation uses the
frozen lockfile. The frontend full unit suite excludes only the five
host-mise integration suites; the contracts job owns their pure/static
contracts, and the local canonical check owns the real mise boundary.

Backend jobs run locked Cargo check, clippy with warnings denied, and tests on
Linux, Windows, and macOS. Linux additionally owns `cargo fmt --check` and the
reviewed system dependency set. The Windows backend uses the test manifest and
the native x64 `windows-2025` runner.

## 8. Matching-architecture Windows native contract

`windows-native-contracts` is a fail-fast-disabled two-entry matrix:

| Runner           | GitHub architecture | Rust host                 | Managed Python platform |
| ---------------- | ------------------- | ------------------------- | ----------------------- |
| `windows-2025`   | `X64`               | `x86_64-pc-windows-msvc`  | `win-amd64`             |
| `windows-11-arm` | `ARM64`             | `aarch64-pc-windows-msvc` | `win-arm64`             |

Before Cargo execution, each child requires exact `RUNNER_ARCH`, exactly one
`rustc -vV` host line, and equality with the matrix host. Cargo receives that
host through explicit `--target`; an x64 compatibility process cannot satisfy
the ARM64 contract. The exact test name is:

```text
codex_desktop::platform::windows::deployment::tests::native_explicit_sid_main_query_smoke
```

The command requires exactly one passed test. It exercises the real WinRT
explicit-SID `PackageTypes.Main` adapter and malformed-SID HRESULT propagation
without Store, network, a real Codex package, or a multi-account VM.

The same matrix installs the exact managed Python implementation/platform and
executes Trellis task listing through the locked uv environment. Zero tests,
wrong architecture, missing managed Python, malformed Trellis JSON, timeout,
or preview runner unavailability fails the matrix. Cross-compilation and
structural inspection are not substitutes for either native runner.

## 9. Desktop acceptance and Labeler boundaries

The desktop acceptance job remains mock-only. It runs the mock acceptance
contract, native Fetch/MSW/Tauri mock, and visual baseline preflight; it does
not start a native window or claim hardware-in-the-loop evidence.

`.github/workflows/labeler.yml` remains a separate trusted-base workflow. It
uses `pull_request_target` plus numeric manual replay, does not checkout or run
pull-request code, and has only `contents: read` and `pull-requests: write`.
Labeler is not a CI dependency and cannot satisfy `CI / Required`.

## 10. Validation and evidence boundary

Required automated fixtures cover:

- docs/spec, frontend, desktop, backend, Windows native, dependency-root,
  control-plane, multi-path union, rename/delete, and unknown paths;
- malformed/missing/non-commit base/head revisions and option injection;
- PR, merge-group, push, and manual event wiring;
- event-forced full CI for both dev/main pushes and diagnostics;
- legal skip versus required skip, unexpected execution, failure,
  cancellation, timeout, classifier failure, incomplete API evidence, and
  result/conclusion mismatch;
- immutable Action pins, minimal permissions, exact runners/toolchains, and
  the x64/ARM64 explicit-SID smoke wiring.

Local static and hermetic tests prove workflow structure and evaluator logic.
They do not prove a hosted runner exists or that native code executed. Release
closure requires the exact pushed dev HEAD's remote full run to finish with
one successful `CI / Required`, including successful x64 and ARM64 native
matrix children. `windows-11-arm` is public preview; unavailability blocks
acceptance and is never converted into a reduced or cross-built run.

## 11. Wrong and correct patterns

Wrong:

```yaml
on:
  pull_request:
    paths: ["src/**"]
```

```js
unknownPaths.length > 0 ? forceFull() : skipEverything();
```

```yaml
if: ${{ needs.frontend.result != 'failure' }}
```

Correct:

```text
explicit base/head -> repository classifier -> requested domains
requested success + authorized skip + REST conclusion -> CI / Required
exact dev push SHA + successful CI / Required -> release eligibility
```
