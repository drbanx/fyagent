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
