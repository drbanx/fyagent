# Repository Task Runner Contract

## 1. Scope / Trigger

Read this reference before adding, renaming, removing, documenting, or
composing a `mise run` task or changing `scripts/tasks/`. The task API is the
stable local entrypoint for developers. Package scripts and Cargo commands
remain implementation leaves; GitHub Actions is an explicit non-mise boundary
and the sole executor for non-host platform work. Optional Trellis files and
prompt hooks do not extend the project task API.

## 2. Layout and Signatures

`mise.toml` explicitly includes these domain files:

```text
.mise/tasks/core.toml
.mise/tasks/frontend.toml
.mise/tasks/rust.toml
.mise/tasks/python.toml
.mise/tasks/upstream.toml
.mise/tasks/contracts.toml
.mise/tasks/release.toml
```

Included TOMLs use mise's task-file format (top-level task tables, no
`[tasks]` prefix). Simple leaves wrap pnpm/Cargo/uv directly. Complex,
parameterized, filesystem, Git, environment, lock, documentation, or
maintenance logic lives in cross-platform Node `.mjs` scripts; core task
behavior may not depend on Bash.

Every public task has:

- a non-empty `description`;
- `env.FYAGENT_TASK_EFFECT` from the approved effect vocabulary;
- a formal `usage` declaration whenever it accepts an argument or flag;
- `interactive = true`, `raw = true`, or an explicit confirmation only when
  its I/O contract requires that behavior.

The canonical required subset is generated from live task metadata into
`docs/fyagent/development/mise-tasks.md`. Later requirements may add tasks when
they satisfy this contract; validation requires the named baseline as a subset
instead of freezing a task count.

## 3. Composition and Side Effects

`check` executes `env:check`, frontend, backend, and contracts. Its complete
task-reference closure must have effect `read-only`. Mutation, dependency
installation, build output, interactive tasks, temporary dependency tools,
Git ref writes, and preview-by-default maintenance tasks never enter that
closure.

`check:backend` uses structured sequential task references in this order:

```text
rust:fmt:check -> rust:check -> rust:clippy -> rust:test
```

Frontend checks may be extended by later contracts without replacing the
stable `check`/`check:frontend` entrypoints. A task must not reference a
nonexistent future test or claim a domain gate before that domain implements
it.

`dev`, `build`, `build:binary`, and `build:debug` are fixed current-host
operations and have no caller argument. `pnpm dev`/`pnpm build` and those mise
tasks route through one shared Node wrapper. The wrapper validates the exact
process OS/architecture against matching absolute `rustc`/`rustdoc` `-vV`
identities. Before probing or launching a toolchain it rejects caller target,
compiler, rustdoc, wrapper, or target-runner/linker controls case-insensitively and
rejects target-bearing ordinary/build/encoded flag sources plus every
target-specific Rust/rustdoc flag source. Process loader/runtime injection
controls are rejected before probing and cleared from toolchain children.
The child owns the absolute tools, empty wrapper/flag settings, and explicit
current-host target. Before starting the toolchain, the wrapper recursively
inspects every effective Cargo config and rejects build target/compiler/
rustdoc/wrapper/flags plus target runner/linker/flags, including config include
cycles and symlinks. The same protected-name classifier rejects corresponding
Cargo config `[env]` keys regardless of case or string/table value. Cargo test
receives its native direct runner through a
CLI TOML argv array built from the current Node process and same wrapper; no
shell quoting is involved. The runner validates target/path/file/native format
and exact PE/Mach-O machine identity, then directly spawns the test binary
with `shell: false`; filters remain argv and never enter a shell.
`rust:check`, `rust:clippy`, and `rust:test` use the same guard; rustfmt does not need a target. `rust:test` accepts at most one test-name
filter, passes it after Cargo's `--`, and rejects every option-like value; in
particular, a caller cannot smuggle `--target` through a variadic usage field.

The lower-level `pnpm tauri` package leaf is retained for reviewed Actions and
maintenance commands that deliberately do not use the local task API. It is
not a standard local entrypoint. This contract enforces canonical wrappers; it
does not claim to intercept an arbitrary hand-written Cargo/Tauri command, and
such a command cannot provide project acceptance evidence.

Portable policy tests can run on the current host, but their result remains a
portable contract result. Windows, macOS, ARM64, and any other non-host native
gate runs only on its matching GitHub Actions runner. Repository tasks never
install or activate a non-host Rust target as part of local execution.

## 4. Parameter Transport

mise parses each `usage` spec and exports `usage_<name>` values. Node wrappers
read those values, parse variadic shell-escaped lists into argv arrays, validate
SemVer/package/tag/enum/path inputs, and spawn a command without a shell.
Arguments must never be concatenated into a command string.

`format:files` accepts one or more reviewed files and first validates every
operand. It routes validated `.jsonl` names
case-insensitively through record formatting: before any write or Prettier
invocation, it reads every such input, normalizes CRLF to LF, preserves blank
rows, validates each nonblank record as JSON, and removes only insignificant
JSON whitespace outside strings. It does not reserialize parsed values, so
large-number spellings, duplicate members, negative zero, and string escapes
remain byte-identical. A JSON parse failure identifies its file and line,
aborts the whole operation, and leaves every JSONL input untouched without
starting Prettier. Only after all JSONL inputs parse does the task forward the
remaining reviewed paths as distinct argv entries to the repository-locked
Prettier. Immediately before committing, it compares every changed JSONL
target with the bytes read during preflight; drift observed by that precommit
check fails without overwriting the newer content. It stages the complete
JSONL output set and uses the shared
rollback-capable writer for per-file replacement. It rejects empty input,
option-like values, parent traversal, repository-external paths, directories,
symlinks, and realpath escapes. Repository-relative and
absolute-inside-repository paths may contain whitespace or Unicode. JSONL
formatting is syntactic record normalization only. A consumer-specific JSONL
schema, if one exists, must be validated by that consumer's executable tests or
tooling.

On native Windows, local mise tasks resolve only the actually used `pnpm`
command to `pnpm.exe`. This matches the audited `mise.lock` assets
`pnpm-win-x64.exe` and `pnpm-win-arm64.exe`; both carry required SHA-256
checksums. The task runner does not synthesize `.cmd` names for pnpm, npm, npx,
or pnpx and does not introduce `cmd.exe`, `shell: true`, or command-string
quoting. Non-Windows commands remain direct. This local mise boundary is
distinct from GitHub Actions, which does not install mise and uses its own
reviewed `pnpm.cmd` batch-shim bridge in the CI toolchain verifier.

Contract tests execute real `mise run` calls for a positional value, a flag,
and a filtered test. Metadata inspection alone is not sufficient proof that
values reach the wrapper.

## 5. Mutation Policies

- `bootstrap` may install locked tools/dependencies but may not trust, install
  system packages, change Git, refresh locks, build, or publish.
- Formatting is an explicit source-modifying leaf and does not prompt. The
  full `format` task retains its frontend-wide behavior; `format:files` is the
  safe reviewed-subset entrypoint. Its JSONL record normalization does not
  replace a consumer-specific schema check.
- Version, dependency, toolchain, Python lock/dependency, icon, task-doc, and
  clean tasks preview by default; `--apply` is required to write.
- `version:set` and `version:bump` delegate to the canonical atomic version
  tool and remain dry-run by default.
- Clean tasks select only an internal allowlist, resolve every target below the
  repository root, and never delete locks, `.git`, `.trellis`, baselines, or
  end-user data.
- `upstream:fetch` fetches one validated tag. Merge preparation requires a
  clean worktree and `--apply`, and may only enter
  `git merge --no-ff --no-commit`. Upstream tasks never change remotes, resolve
  conflicts, commit, tag, or push.
- `release:check` is read-only; no local task signs, uploads, creates, edits, or
  deletes a GitHub Release.
- No local task compiles, packages, or verifies a non-host OS/architecture.
  Release helpers may be referenced by matching native Actions jobs, but no
  local alias or wrapper turns them into a cross-platform acceptance path.

## 6. Generated Documentation

`task-docs.mjs` reads the actual included TOML metadata. It escapes Markdown
pipe characters, emits every loaded task, and writes only when
`tasks:docs:generate --apply` is used. `tasks:docs:check` regenerates in memory
and byte-compares with the committed document.

Maintained repository docs use the live `mise run <task>` API for ordinary
project operations. `docs-contract-check.mjs` scans the public READMEs,
`CONTRIBUTING.md`, `.github` Markdown, and
`docs/fyagent/development/**`; every concrete mise task reference must resolve
through the loaded task metadata. Retired local cross-build tasks have no alias
or deprecation forwarder.

Every concrete `mise run <task>` reference must resolve through the live
task-definition loader. The parser accepts the current documented boolean
flags, short flags, value-taking `--jobs`/`--cd` forms (separate or `=` where
supported), and the `--` option boundary. An unknown option fails closed, and
task membership uses an own-property check so inherited object keys are not
treated as task definitions.

`CONTRIBUTING.md` contains the standalone checkout sequence in one exact fenced
block: `mise trust`, `mise run bootstrap`, `mise run system:check`, and
`mise run dev`. Nearby prose states that trust is a manual developer security
decision outside repository tasks, and the document names `mise run check` as
the complete current-host gate.

Optional `.trellis/**` tasks, specs, scripts, skills, hooks, archives, and
journals remain outside this contributor command contract. The docs checker
does not turn them into contribution, build, CI, or release prerequisites.

## 7. Validation / Error Matrix

| Condition                                                             | Required result                                    |
| --------------------------------------------------------------------- | -------------------------------------------------- |
| Missing description/effect/usage                                      | `tasks:validate` fails                             |
| Missing task reference or DAG cycle                                   | mise/task contract fails                           |
| `check` reaches a non-read-only effect                                | Fail closed                                        |
| A parameter is interpolated into a shell command                      | Reject; spawn validated argv instead               |
| A Windows task forces a pnpm batch shim instead of locked `pnpm.exe`  | Task-runner and DEP0040 contracts fail             |
| A Rust filter begins with `-` or contains `--target`                  | Reject before rustc or Cargo starts                |
| A fixed native operation receives forwarded argv                      | Reject before rustc or Tauri starts                |
| Caller compiler/wrapper/runner/linker/target env redirects a task     | Reject before rustc/rustdoc starts                 |
| Any Rust/rustdoc flag env contains a target token                     | Reject before rustc/rustdoc starts                 |
| Target-specific flags or process-loader/runtime injection are set     | Reject before rustc/rustdoc starts                 |
| Absolute rustc/rustdoc identity and process host disagree             | Reject before Cargo/Tauri starts                   |
| User Cargo config selects target/compiler/wrapper/flags/runner/linker | Reject before the toolchain starts                 |
| A standard task selects a non-host OS/architecture                    | Reject before any toolchain starts                 |
| A local wrapper bridges to a foreign executable/emulator              | Reject; require a native Actions job               |
| Mutation task has neither preview default nor explicit confirmation   | Reject                                             |
| Clean path resolves outside the repository                            | Reject without deletion                            |
| Upstream safety/remotes/worktree do not match                         | Reject before fetch/merge                          |
| Generated task reference differs by one byte                          | `tasks:docs:check` fails                           |
| New active doc uses a legacy entrypoint                               | `docs-contract-check.mjs` fails                    |
| Standalone setup order or manual trust guidance disappears            | `docs-contract-check.mjs` fails                    |
| `format:files` receives an option, directory, symlink, or escape      | Reject before Prettier or JSONL writes             |
| A reviewed `.jsonl` target is not valid UTF-8                         | Identify the file; no Prettier or JSONL write      |
| A nonblank reviewed `.jsonl` record is invalid JSON                   | Identify file and line; no Prettier or JSONL write |
| A changed JSONL target no longer matches its preflight bytes          | Preserve the newer bytes and fail                  |
| A formatted JSONL file violates a consumer-specific schema            | The consumer's executable validation still fails   |

## 8. Tests Required

- `mise tasks validate --errors-only` and `task-contract-check.mjs`.
- Required-task subset, metadata/effect/usage, reference closure, check DAG,
  Rust order, retired task, and forbidden command scans.
- Real parameter/flag transport smoke tests, including dry-run `version:set`,
  a test filter, Python preview input, and upstream tag validation.
- `format:files` tests for empty input, option injection, parent/outside paths,
  directories, symlinks, realpath escape, and successful multi-file whitespace,
  Unicode, and absolute-inside-repository argv transport. Cover mixed JSONL
  and Prettier inputs, CRLF/blank-row-preserving compact JSONL records, token
  preservation for large numbers, duplicate members, escapes, and negative
  zero, a later JSONL parse failure that leaves every JSONL byte-identical and
  never invokes Prettier, Prettier failure before JSONL commit, and JSONL
  preimage drift observed by the precommit check that preserves the newer
  bytes.
- Pure executable-resolution tests must require `pnpm.exe` only on Win32,
  preserve direct non-Windows commands, bind both native Windows pnpm lock
  assets and checksums, and prove the DEP0040 checker uses the shared resolver
  without a `pnpm.cmd` fallback.
- Pure tests for all six supported process-host mappings, strict absolute
  rustc/rustdoc identity, case-insensitive caller compiler/wrapper/runner/linker/
  target and target-bearing flag rejection, plus fixed current-host
  Tauri/Cargo argv and owned child environment.
- Encode Node runner argv as a Cargo CLI TOML array without a shell, including
  absolute paths containing whitespace; validate its current-target repository
  boundary, non-symlink native format and exact machine identity, and direct
  argv execution with current-host-only fixtures and metacharacter filters.
- Recursively scan effective Cargo config sources and includes; reject
  compiler/wrapper/flags/runner/linker controls, symlinks, and include cycles
  before any toolchain process starts.
- Negative Rust `--target` smuggling tests through normal and double-dash
  invocation paths, plus real `pnpm`/mise wrapper smoke proving rejection
  occurs before rustc, Cargo, or Tauri starts.
- Require the aggregate `check` task to begin with the subprocess-free
  host-native guard before `env:check`, so caller compiler/runner/target
  controls cannot reach its rustc toolchain probe.
- Active local-entrypoint scans must cover package scripts and all included
  task TOMLs, reject cross-target/cross-tool execution markers, and leave
  `.github/workflows/**` outside that negative set so native runner targets
  remain required and testable.
- Clean preview tests proving canonical repository-only targets and zero writes.
- Docs generation/check tests including a description containing `|` to prove
  table escaping.
- Maintained-document fixtures covering mise options, continuations,
  own-property task lookup, the exact standalone checkout sequence, manual
  trust guidance, the full local `check` gate, and unknown task rejection.
- `developmentEnvironment.test.ts`, `miseTaskContract.test.ts`,
  `taskDocs.test.ts`, `systemCheck.test.ts`, and
  `localBuildBoundary.test.ts`.

## 9. Wrong vs Correct

Wrong: put every command back into one `mise.toml`, rely on Bash, infer safety
from a task name, concatenate usage input, let check install/update, bypass the
wrapper with a low-level local target command, or hand-edit generated task
rows.

Correct: domain TOMLs describe a stable API, Node wrappers validate boundaries,
effects make composition auditable, guarded native wrappers verify and pin the
current host, and executable tests prove both metadata and real argument flow.
