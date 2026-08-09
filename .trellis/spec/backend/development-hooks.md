# Codex Development Hook Contract

## 1. Scope / Trigger

Read this contract before changing `.codex/hooks.json`, either registered Codex
Python hook, `.mise/tasks/hooks.toml`, `pyproject.toml`, `uv.lock`, or
`scripts/tasks/codex-hook-runner.mjs`.

The hooks expose Trellis workflow and curated task context to Codex. They are a
prompt-assistance boundary, not an environment bootstrapper: a prompt may
continue without injected context when the valid project environment has not
yet prepared `.venv`, but malformed protocol or damaged project state must not
be reported as a successful hook invocation.

## 2. Signatures

### Codex registration

```text
UserPromptSubmit:
  mise run --silent --skip-tools --deny-net codex:hook:workflow-state

SubagentStart (trellis-implement|trellis-check|trellis-research):
  mise run --silent --skip-tools --deny-net codex:hook:subagent-context
```

Both registrations keep the nested Codex hook schema and a 15-second timeout.
They must not call Python, uv, or a hook script directly.

### Trellis template overlay ownership

Trellis owns the canonical bases for `.codex/hooks.json`,
`.codex/hooks/inject-workflow-state.py`, and
`.codex/hooks/inject-subagent-context.py`. FyAgent preserves its reviewed task
boundary and hook hardening through exactly three declared overlays in
`scripts/trellis/overlay-manifest.json` using schema
`fyagent-trellis-overlay/v1`.

The JSON registration uses a structural transform that validates the event,
matcher, command-hook shape, and timeout before replacing only the two
canonical commands. Each Python hook uses an exact-preimage unified patch.
Every entry records its owner, reason, accepted upstream base SHA-256 values,
transform file, and expected output SHA-256.

`mise run trellis:reconcile` accepts only an exact expected output (idempotent
no-op) or an exact declared upstream base. It preflights every entry and output
hash before atomically writing any target. `mise run trellis:verify` is
read-only: it dynamically compares all paths in
`.trellis/.template-hashes.json`, requires every divergence to map uniquely to
one exact overlay output, and rejects missing files, undeclared divergence,
stale overlays, unknown owners, mismatched base metadata, or output drift.
The project-owned `fyagent-trellis` skill must never become a managed upstream
path or overlay target.

The three task names are stable:

```text
codex:hook:workflow-state
codex:hook:subagent-context
codex:hooks:check
```

Every task is read-only metadata and `raw = true`. Raw mode is required because
stdin is one hook JSON object and stdout is one hook JSON object; line prefixes,
task labels, buffering wrappers, or status prose corrupt the protocol.

### Python execution

The Node runner is the only task entry point. In a prepared environment it
binds uv to the reviewed repository and interpreter, then launches the absolute
reviewed hook under isolated Python. The authoritative argument shape is shown
in the "Correct" example below.

`--locked` rejects project/lock drift. `--no-sync`, `--offline`, and
`--no-env-file` prohibit a prompt from creating or repairing `.venv`, resolving
packages, downloading a Python build, changing the lock, or loading ambient uv
configuration. The runner also disables bytecode writes and assigns a fresh
external pycache prefix so the hook cannot create or consume repository
`__pycache__` as a prompt side effect.

## 3. Project and Protocol Contracts

Before deciding whether `.venv` is ready, the runner uses a dependency-free,
minimal TOML scope parser and validates:

- `.python-version` contains exactly `3.14.7`;
- `pyproject.toml` declares `[project].requires-python = ">=3.14,<3.15"` and
  declares `[tool.uv].package = false`, `python-preference = "only-managed"`,
  and `python-downloads = "automatic"` exactly once in those tables;
- `uv.lock` declares top-level `version = 1`, `revision = 3`, and the
  uv-normalized `requires-python = "==3.14.*"` exactly once;
- the selected registered Python hook and every repository Python module it
  dynamically imports are regular, non-empty files whose
  line-ending-normalized SHA-256 matches the reviewed runner allowlist, so LF
  and CRLF checkouts share one integrity identity.

For `UserPromptSubmit`, stdin must be an object whose event is exactly
`UserPromptSubmit`. For `SubagentStart`, the event must be exactly
`SubagentStart`, `agent_type` must be one of the three registered Trellis roles,
and `session_id` must be non-empty. A supplied `cwd` must be a string inside the
FyAgent repository.

A successful Python process must exit zero, write no stderr, and emit exactly
one JSON object. That object is either a non-blocking `{ "continue": true }`
no-context response or contains a matching `hookSpecificOutput.hookEventName`
and non-empty `additionalContext`. Empty, multiple, non-JSON, wrong-event, or
`continue: false` output is a protocol failure.

The runner sets `FYAGENT_CODEX_HOOK_STRICT=1` for registered Codex events. This
makes missing, timed-out, malformed, or non-object stdin and internal native
SubagentStart errors fail closed. The Python scripts retain their established
generic fallback behavior when another platform invokes them without that
Codex-only marker.

That strict marker is also the authoritative platform signal. Ambient Cursor,
Claude, CodeBuddy, ZCode, Trae, or other compatibility variables must not
redirect a registered Codex event to another platform's session key or output
protocol. Generic direct invocations, where the marker is absent, retain the
upstream host-detection order described below.

The Python hooks also retain the Trellis 0.6.14 host compatibility rules. In
the workflow-state hook, a vendor-specific project variable such as
`CODEBUDDY_PROJECT_DIR`, `ZCODE_PROJECT_DIR`, or `TRAE_PROJECT_DIR` takes
precedence over the shared `CLAUDE_PROJECT_DIR` compatibility alias. A native
SubagentStart handler tries the payload `cwd` first and then the Python process
`cwd`, because some shared hook hosts report `/` instead of their project
directory. That fallback belongs only to generic shared-host invocation. In
strict Codex mode both hooks resolve the project exclusively from their process
cwd, which uv binds to the reviewed repository; a payload nested checkout must
not redirect dynamic modules or task state. The Node runner additionally
rejects every supplied `cwd` that resolves outside the FyAgent repository
before it starts Python.

The runner must bind uv to the validated repository, prepared interpreter, and
absolute reviewed hook path with explicit `--project`, `--directory`,
`--python`, and `--no-env-file` arguments. Before spawning uv it removes
inherited `UV_*`, `PYTHON*`, virtual-environment, and native loader override
variables, then adds only the locked/offline/no-sync values required by this
contract. Python runs in isolated mode. Ambient `UV_WORKING_DIR`, `UV_PROJECT`,
`UV_PYTHON`, `PYTHONPATH`, or loader state must therefore be unable to change
the script or interpreter that executes.

The reviewed closure currently includes the `common` package anchor,
`paths.py`, and `active_task.py`, plus `trellis_config.py` for workflow state
and `config.py` for subagent context. Strict hooks never add
`.trellis/scripts` to import search order: they construct a synthetic `common`
package and load each reviewed `.py` by its exact absolute source path. This
prevents a new stdlib-shadow file, `common.py`, native extension, or sourceless
bytecode sibling from replacing a pinned module. Python also receives `-S`,
`-B`, and a fresh per-invocation `pycache_prefix`, so site packages and a
pre-existing repository bytecode cache cannot replace hash-checked source.
Any source change, including an upstream Trellis update, requires explicit
review and a corresponding runner hash update.

Every strict active-task path and every `file` or `directory` entry read from
`implement.jsonl` or `check.jsonl` is repository-root relative. Resolve the
repository and candidate through the native filesystem before reading, and
reject absolute paths, Windows drive/UNC forms, `..` traversal, cross-volume
paths, and symlink or junction escapes. A strict Codex containment failure is a
hook error and must never include the referenced file's contents in output.

The workflow-state hook applies the same realpath boundary before reading an
active task's `task.json`: the resolved directory must remain under
`.trellis/tasks`, and `task.json` itself must not be a symlink. Task ids and
statuses must match their bounded machine identifiers before entering the
developer context; breadcrumb fields escape markup and collapse control
characters as defense in depth.

Native Codex SubagentStart resolves the active task only from the parent
`session_id`, with environment and single-session fallbacks disabled, so one
Codex window cannot borrow another window's task. If no matching context is
available, the handler emits `{ "continue": true }`. Research context directs
the child through the project command boundary:

```text
mise run trellis:context -- --mode packages
```

## 4. Readiness and Error Matrix

| Condition                                                                                                                                          | Required result                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `TRELLIS_HOOKS=0` or `TRELLIS_DISABLE_HOOKS=1`                                                                                                     | Exit zero with no output; this is the only runner-level silent result.                                      |
| Valid project and hook files, but `.venv` is missing or incomplete                                                                                 | Emit `continue: true` plus visible `mise run bootstrap` guidance; do not invoke uv and do not modify files. |
| `.python-version`, `pyproject.toml`, or `uv.lock` is missing, malformed, duplicates a required key, uses a wrong table, or has an unapproved value | Non-zero exit with no success JSON.                                                                         |
| Registered Python hook or imported repository module is missing, empty, symlinked, or differs from its reviewed hash                               | Non-zero exit before environment degradation.                                                               |
| Hook event, role, session, cwd, or stdin JSON is invalid                                                                                           | Non-zero exit before invoking uv.                                                                           |
| uv is missing, times out, is signalled, or exits non-zero                                                                                          | Non-zero exit; do not reinterpret this as an unprepared environment.                                        |
| Hook writes stderr or invalid stdout                                                                                                               | Non-zero exit; do not forward partial output.                                                               |
| Valid hook emits context or an explicit no-context response                                                                                        | Normalize and forward one JSON object unchanged in meaning.                                                 |

Project or lock damage is different from first-time environment readiness. The
former requires repair by a developer; the latter is an expected pre-bootstrap
state and must not block the user's prompt.

The `.venv` root must be a real repository-local directory rather than a
symlink or junction. Otherwise the hook could execute or mutate environment
state outside the tree covered by the side-effect snapshot. The registered
event `cwd` must also resolve within the repository. Reject symlink escapes; on
Windows a path from a different drive is outside even when `path.relative`
returns an absolute path instead of a `..` prefix.

## 5. Side-Effect Boundary

Hook execution must not run `mise trust`, `mise install`, `uv sync`, `uv lock`,
`uv add`, pip installation, system package installation, Git commands, network
requests, or release commands. It must not update hashes, mtimes, or membership
under `.venv`, `pyproject.toml`, `uv.lock`, or `.python-version`.

`codex:hooks:check` requires a prepared environment. It runs both registered
paths with contract fixtures, snapshots the Python project and `.venv` before
and after, and fails if content, hashes, mtimes, or tree membership change. It
does not bootstrap an environment on behalf of the caller.

## 6. Tests Required

- Parse `.codex/hooks.json` and assert the nested schema, exact mise commands,
  matcher, and 15-second timeouts.
- Resolve every task with `mise tasks info --json` and assert `raw = true` and
  the read-only effect metadata.
- Pipe a real JSON event through the exact mise command and parse stdout as one
  unprefixed JSON object.
- Test the exact uv argument vector and offline/no-sync environment with a
  controlled process adapter, including absolute project/interpreter/script
  binding, isolated Python, a fresh bytecode-cache prefix, and removal of
  ambient uv/Python/loader overrides.
- Snapshot hashes and nanosecond mtimes around both prepared and unprepared
  paths.
- Cover explicit disablement, unprepared `.venv`, damaged hook hash, malformed
  lock, required TOML keys in the wrong table, duplicate keys, unapproved
  values, invalid JSON/event/role/session/cwd (including a Windows cross-drive
  path, the filesystem root, and a symlink escape), a symlinked `.venv`, child
  failure, unexpected stderr, and invalid stdout.
- Import the shared Python hooks with the managed interpreter and prove that
  vendor project variables beat `CLAUDE_PROJECT_DIR`, while the native
  SubagentStart handler can fall back from payload `cwd = "/"` to its process
  cwd without enabling the Node runner to accept `/`.
- Assert that native SubagentStart keeps parent-session-only task resolution,
  emits an explicit no-context response, and injects the exact mise-backed
  research context command rather than a direct Trellis Python invocation.
- Prove JSONL file/directory entries and active-task paths reject absolute,
  parent-traversal, Windows drive/UNC, cross-volume, and symlink/junction escape
  forms without exposing an outside file's contents.
- Prove workflow-state rejects task directories outside `.trellis/tasks`,
  task-directory and `task.json` symlink escapes, and malformed task ids or
  statuses; injected markup must not close the workflow-state envelope.
- Tamper with both an entry hook and an imported `common` module, and require
  the integrity gate to fail before Python starts. Repeat the allowlist check
  with CRLF-normalized copies of the whole reviewed source closure.
- Add stdlib-shadow and native-extension candidates beside the reviewed
  sources and prove exact source loading ignores them without executing their
  code.
- Compile all Python hook files and run `codex:hooks:check` after bootstrap.

## 7. Wrong vs Correct

### Wrong

```text
python3 .codex/hooks/inject-workflow-state.py
uv run .codex/hooks/inject-workflow-state.py
uv run --locked .codex/hooks/inject-workflow-state.py
```

These bypass the managed task boundary or permit synchronization/network work
during a prompt.

### Correct

```text
mise run --silent --skip-tools --deny-net codex:hook:workflow-state
  -> raw read-only task
  -> uv run --locked --no-sync --offline --no-env-file
       --project <repo> --directory <repo> --python <repo-venv>
       python -I -S -B -X pycache_prefix=<fresh-path> -X utf8
       <absolute-reviewed-hook>
```

The only recovery instruction for an unprepared valid environment is the
visible, user-invoked `mise run bootstrap` path.
