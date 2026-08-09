# Implementation

1. Recompute managed states and write a task-local disposition table.
2. Restore canonical missing/upstream-owned files and relocate FyAgent rules.
3. Implement overlay manifest, patch/transform fixtures, reconcile, and verify.
4. Add mise task metadata and direct uv script execution.
5. Add `format:files` argv validation and cross-platform unit fixtures.
6. Extend the FyAgent Trellis update runbook and contracts gate.
7. Run `mise run tasks:validate`, task/docs unit tests, fixture rehearsal,
   `mise run trellis:verify`, and `git diff --check` before the work commit.
