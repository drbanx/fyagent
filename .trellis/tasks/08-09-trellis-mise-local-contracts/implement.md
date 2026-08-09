# Implementation

1. Recompute managed states and write a task-local disposition table.
2. Restore canonical missing/upstream-owned files and relocate FyAgent rules.
3. Implement overlay manifest, patch/transform fixtures, reconcile, and verify.
4. Add mise task metadata and direct uv script execution.
5. Add `format:files` argv validation and cross-platform unit fixtures.
6. Extend the FyAgent Trellis update runbook and contracts gate.
7. Run `mise run tasks:validate`, task/docs unit tests, fixture rehearsal,
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
