# Implementation

1. [done] Recompute managed states and write a task-local disposition table.
2. [done] Restore canonical missing/upstream-owned files and relocate FyAgent rules.
3. [done] Implement overlay manifest, patch/transform fixtures, reconcile, and verify.
4. [done] Add mise task metadata and direct uv script execution.
5. [done] Add `format:files` argv validation and cross-platform unit fixtures.
6. [done] Extend the FyAgent Trellis update runbook and contracts gate.
7. [done] Run `mise run tasks:validate`, task/docs unit tests, fixture rehearsal,
   `mise run trellis:verify`, and `git diff --check` before the work commit.

## Managed-path disposition

The implementation observation at task start produced this ownership map.
Counts are evidence for this checkout only; verification always recomputes the
full managed set from `.trellis/.template-hashes.json`.

| Managed path                                                      | Disposition                                          | Durable owner                                |
| ----------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------- |
| `AGENTS.md`                                                       | Restore missing upstream template and track it       | Trellis template manifest                    |
| `.agents/skills/trellis-meta/references/platform-files/agents.md` | Restore missing upstream template                    | Trellis template manifest                    |
| `.agents/skills/trellis-start/SKILL.md`                           | Restore upstream bytes                               | Trellis template manifest                    |
| `.agents/skills/trellis-continue/SKILL.md`                        | Restore upstream bytes                               | Trellis template manifest                    |
| `.agents/skills/trellis-before-dev/SKILL.md`                      | Restore upstream bytes                               | Trellis template manifest                    |
| `.agents/skills/trellis-brainstorm/SKILL.md`                      | Restore upstream bytes                               | Trellis template manifest                    |
| `.agents/skills/trellis-check/SKILL.md`                           | Restore upstream bytes                               | Trellis template manifest                    |
| `.agents/skills/trellis-finish-work/SKILL.md`                     | Restore upstream bytes                               | Trellis template manifest                    |
| `.trellis/workflow.md`                                            | Restore upstream bytes                               | Trellis template manifest                    |
| `.trellis/scripts/hooks/linear_sync.py`                           | Keep canonical bytes; repair stale managed hash only | Trellis template manifest                    |
| `.codex/hooks.json`                                               | Retain one declared structural overlay               | `.trellis/spec/backend/development-hooks.md` |
| `.codex/hooks/inject-subagent-context.py`                         | Retain one declared exact-preimage patch             | `.trellis/spec/backend/development-hooks.md` |
| `.codex/hooks/inject-workflow-state.py`                           | Retain one declared exact-preimage patch             | `.trellis/spec/backend/development-hooks.md` |

## Local implementation evidence

The repository-managed checks completed before release preparation and were
reconfirmed by the parent repository-wide check on 2026-08-10:

- overlay/reconcile fixtures covered exact base, idempotent output, missing
  files, undeclared divergence, stale output, unknown preimages, and upstream
  drift without mutating the verification worktree;
- `format:files` fixtures covered empty argv, option injection, repository
  escape, multiple paths, spaces, and Unicode while preserving the broad
  `format` task;
- `mise run trellis:verify` reported 87 managed paths, 84 pristine paths, and
  the three declared reconciled overlays;
- task validation, task-documentation checks, fixture rehearsal, reviewed-file
  formatting, and `git diff --check` passed.

These local acceptance criteria are complete. The task remains open only for
the parent-owned formal Release and dependency-ordered archive boundary.

## JSONL formatter follow-up

A final integration run reproduced the prior formatting failure against the
task's real `implement.jsonl`: `format:files` passed every reviewed path to
Prettier, which cannot infer a parser for JSON Lines. Excluding the task context
files would have left the reviewed-subset formatter incomplete, so the task now
dispatches validated `.jsonl` inputs to a built-in record formatter. It parses
every nonblank record before any formatting starts, removes only insignificant
whitespace outside strings, preserves the original JSON tokens and blank rows,
and stages the complete JSONL change set before using the existing
rollback-capable writer. A malformed record identifies its file and line,
starts no Prettier process, and leaves every input unchanged. After Prettier,
the task compares every changed JSONL target with its preflight bytes
immediately before commit, so drift already visible to that check fails without
being overwritten. Validated non-JSONL paths still reach the locked Prettier as
separate argv entries. Trellis schema
and repository-containment acceptance remain owned by `trellis:validate`;
successful syntax normalization does not replace it.

The corrected task was exercised against this child's actual
`implement.jsonl` and `check.jsonl`; both normalized successfully and the child
then passed `mise run trellis:validate`. The real mise task contract suite
passed 33/33, including mixed Prettier/JSONL dispatch, a second JSONL file with
multiple records and an internal blank row, and fail-closed malformed CLI
behavior. A separate CI-safe formatter suite covers token preservation for
large numbers, duplicate members, escapes, and negative zero; all-input parse
preflight; Prettier failure; precommit drift preservation; invalid UTF-8; and
rejection of a UTF-8 BOM or non-JSON whitespace-only records; it passed 7/7.
The CI-safe shared-writer suite passed 3/3 for unique same-directory temporary
files, mode preservation, partial-write rollback, cleanup, and recovery-error
aggregation.
`mise run typecheck` and the repository-wide `mise run check` also exited zero
on the same local snapshot. This follow-up changes no remote evidence boundary:
the child remains open until the parent-owned Release and ordered archive
closeout complete.
