# Trellis Tooling Contract

## 1. Scope / Trigger

Read this contract before updating Trellis, changing a managed template,
declaring a FyAgent overlay, modifying the overlay engine, or changing the
project-local Trellis command and authority boundary. It owns managed-path
reconciliation and verification. Generic `mise run` metadata, argv transport,
and task composition remain owned by
[Repository Task Runner](./task-runner-contract.md); the exact Codex hook
targets and hook protocol remain owned by
[Codex Development Hooks](./development-hooks.md).

## 2. Signatures

```text
trellis update --dry-run
trellis update

mise run trellis:reconcile
mise run trellis:verify
mise run trellis:context [-- --mode <phase|packages|...>]
mise run trellis:task -- current --source
mise run trellis:validate -- .trellis/tasks/<task-dir>
mise run format:files -- <files...>
```

The overlay manifest is `scripts/trellis/overlay-manifest.json` with this
stable top-level identity:

```json
{
  "schema": "fyagent-trellis-overlay/v1",
  "hash": "sha256-lf",
  "entries": []
}
```

Each entry contains one repository-relative managed `path`, active-spec
`owner`, nonempty `reason`, one or more named `upstreamIdentities`, a
`transform`, and `expectedOutputSha256`. Supported transforms are a structural
`json-operations` file or named exact-preimage `unified-diff` files.

## 3. Contracts

### Current authority and managed ownership

- Current development authority is the active `.trellis/spec/**` owner, the
  current task's approved artifacts and evidence, and current developer-facing
  material under `docs/fyagent/development/`. Archived tasks and Git history
  are immutable historical evidence, not operational authority.
- The external modernization input is not a repository dependency or current
  reference. Repository development, checking, building, and release routes
  remain self-contained if that input is unavailable.
- Trellis CLI/template state dynamically defines managed paths through
  `.trellis/.template-hashes.json`. Never freeze a historical file count or
  manually label a template-identical file as project-owned.
- Root `AGENTS.md` retains the current generated Trellis instruction block;
  text outside the managed block remains project-owned. Bundled lifecycle
  skills and `.trellis/workflow.md` remain upstream template content.
- FyAgent-specific environment, native-evidence, release, and current-context
  rules live in active specs or `.agents/skills/fyagent-trellis/SKILL.md`.
  That project entry skill is neither an upstream managed path nor an overlay
  target.

### Reviewed Trellis update sequence

Adopting a Trellis release uses this ordered gate:

1. Run `trellis update --dry-run` and inspect every managed-path decision.
2. Human-review proposed upstream changes, migrations, and backups.
3. Run `trellis update` with the reviewed options.
4. Run `mise run trellis:reconcile`.
5. Run `mise run trellis:verify`.
6. Review `git diff`, targeted tests, and every affected active spec before
   committing.

Only the Trellis CLI owns update dry-run, migration, and backup semantics.
FyAgent reconciliation neither invokes nor emulates those operations.

### Deterministic overlays

- Hashes are SHA-256 after LF line-ending normalization. Every declared owner
  resolves to an active spec. Paths are unique and must be actual dynamic
  managed paths; transform files are repository-owned, regular, bounded files.
- Reconciliation performs a complete no-write preflight for all entries. If a
  target equals its expected output hash, it is an idempotent no-op. If it
  equals exactly one declared upstream base, apply only that base's structural
  transform and verify the expected output hash.
- Missing targets, unknown preimages, ambiguous bases, patch conflicts,
  invalid JSON operations, invalid owners, missing transform files, or output
  drift fail the complete operation. No target changes before all entries pass
  preflight; a write failure rolls already-written targets back to their
  original bytes.
- Verification is read-only. It recomputes managed divergence dynamically and
  requires each divergent path to map to exactly one manifest entry whose
  current bytes equal the expected output. It rejects missing managed files,
  undeclared or duplicate divergence, stale overlays, overlay entries for
  non-divergent files, invalid/mismatched base metadata, and output-hash drift.
- The current declared divergences are the exact Codex registration and two
  context-injection hook targets owned by
  [Codex Development Hooks](./development-hooks.md). A new project divergence
  requires a reviewed owner, reason, exact upstream identity, transform, output
  hash, and failure fixture in the same change.

### Execution and reviewed-file formatting

- Trellis task wrappers execute uv-managed scripts directly as
  `uv run --locked <script>`; they do not name system `python`, `python3`, or
  `py`. Routine instructions use mise tasks rather than internal
  `.trellis/scripts/**` paths.
- `format:files` requires at least one path and validates every reviewed
  repository-relative or absolute-inside-repository regular file before it
  formats anything, including paths with whitespace and Unicode. Validated
  `.jsonl` names are selected case-insensitively for a built-in record
  formatter: it normalizes CRLF to LF, keeps blank rows, validates each nonblank
  record, and removes only insignificant whitespace outside JSON strings. It
  does not reserialize values, preserving large numeric literals, duplicate
  members, negative zero, and string escapes. It parses every JSONL target
  before starting Prettier or writing a JSONL target; a parse failure reports
  the file and line, starts no Prettier process, and leaves the complete JSONL
  change set unchanged. When JSONL preflight succeeds, only non-JSONL targets
  are passed as distinct argv entries to the repository-locked Prettier without
  a shell. Immediately before commit, every changed JSONL target must still
  match its preflight bytes; drift observed by that check fails without being
  overwritten. The task then stages all JSONL outputs and uses the shared
  rollback-capable writer for per-file replacement.
- `format:files` rejects option-like values, parent traversal, external paths,
  directories, symlinks, realpath escapes, or an empty list before formatting.
  It does not change the frontend-wide semantics of `mise run format`. Its
  record formatter provides syntax normalization, not Trellis task semantics:
  `mise run trellis:validate -- .trellis/tasks/<task-dir>` remains the authority
  for Trellis JSONL context-record schema and repository-containment checks.
- The project entry skill never automatically trusts or bootstraps a checkout.
  A human explicitly reviews the locked environment and runs the documented
  `mise trust` -> `mise run bootstrap` -> `mise run system:check` sequence.

## 4. Validation & Error Matrix

| Condition                                                                                          | Required result                                                                                                |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| A managed target already equals its declared output                                                | `trellis:reconcile` is an idempotent no-op.                                                                    |
| A managed target equals exactly one declared base                                                  | Apply that deterministic transform and verify the output hash before writing.                                  |
| A target is missing, has an unknown preimage, conflicts, or produces another hash                  | Fail closed and leave every managed target at its original bytes.                                              |
| Dynamic managed content diverges without one exact overlay                                         | `trellis:verify` fails read-only.                                                                              |
| An overlay is stale, duplicated, has an invalid owner, or targets a non-divergent/non-managed file | Verification fails; do not silently bless it.                                                                  |
| A template update changes a hook base                                                              | Review the upstream change and add its exact identity/transform only if the project overlay remains necessary. |
| A Trellis wrapper names a system Python executable                                                 | Task/spec contract fails before routine use.                                                                   |
| `format:files` receives no files, an option, directory, symlink, or repository escape              | Reject before Prettier or JSONL writes.                                                                        |
| A reviewed `.jsonl` target is not valid UTF-8                                                      | Report its path; do not invoke Prettier or commit any JSONL change.                                            |
| A nonblank reviewed `.jsonl` line is invalid JSON                                                  | Report its file and line; do not invoke Prettier or commit any JSONL change.                                   |
| A changed JSONL target differs from the bytes read before Prettier                                 | Preserve the newer bytes and fail before JSONL commit.                                                         |
| Formatted Trellis JSONL needs semantic/schema or containment acceptance                            | Run `trellis:validate`; successful syntax formatting is not acceptance evidence.                               |
| An operational guide treats archive/history as current authority                                   | Documentation/spec gate fails.                                                                                 |

## 5. Good / Base / Bad Cases

- Good: a reviewed upstream hook base matches one declared identity;
  reconciliation computes the expected bytes, preflights all entries, then
  writes atomically and verification reports the exact declared divergence.
- Base: every overlay target already equals its expected output.
  Reconciliation performs no writes and verification leaves the worktree
  byte-for-byte unchanged.
- Good: two reviewed files containing spaces and Unicode are passed as separate
  argv entries to the locked Prettier.
- Good: a reviewed Trellis context JSONL file is normalized record-by-record,
  then accepted separately by `trellis:validate`; Prettier receives only its
  supported non-JSONL inputs.
- Bad: update a template hash to bless local bytes, patch an unknown preimage,
  keep a stale overlay for an upstream-identical file, call a Trellis script
  through `python3`, or use an archived design package as current authority.

## 6. Tests Required

- Overlay tests cover schema and owner validity, LF-normalized hashes, exact
  base application for each transform type, expected-output no-op, unknown and
  ambiguous preimages, missing targets/transforms, patch conflict, wrong output,
  stale/duplicate/undeclared divergence, and full rollback after a write fault.
- A verification side-effect test snapshots the worktree before and after
  `mise run trellis:verify` and requires byte identity on both success and
  failure paths.
- Task contracts prove every Trellis wrapper uses direct locked uv script
  invocation and that no routine project instruction bypasses mise.
- Formatting tests cover empty input, option injection, traversal, absolute
  external paths, directories, symlinks/realpath escape, multiple files,
  whitespace, Unicode, and absolute paths inside the repository. They also
  cover mixed JSONL/Prettier dispatch, CRLF and blank-row-preserving compact
  JSONL records, preservation of large numeric literals, duplicate members,
  escapes, and negative zero, a later malformed JSONL record that leaves
  earlier JSONL inputs untouched and never invokes Prettier, Prettier failure
  before JSONL commit, and precommit drift rejection that preserves newer
  bytes.
- Documentation/spec checks validate live task names, the single explicit
  checkout gate, current-authority links, and absence of operational references
  to retired versioned design packages or external plan inputs.

## 7. Wrong vs Correct

Wrong:

```text
managed divergence exists -> overwrite template hash or apply patch anyway
python3 .trellis/scripts/get_task.py current
archive says X -> X is still current
```

Correct:

```text
exact declared base -> deterministic transform -> exact output -> atomic write
mise run trellis:task -- current --source
active owner + current task/current development docs -> current contract
```
