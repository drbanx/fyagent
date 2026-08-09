# Implementation

1. [done] Inventory all current versioned docs, active specs, indexes, skills, tests,
   and references; classify every source section.
2. [done] Establish unique current owners for Windows/application contracts.
3. [done] Establish current CI/release/Trellis tooling owners.
4. [done] Split Codex provider/Desktop and WorkBuddy ownership.
5. [done] Update references/tests and delete replaced specs plus `docs/fyagent/dev/`.
6. [done] Audit every remaining version/MSI/WiX match semantically, preserving true
   machine contracts and excluding immutable archives from rewrite.
7. [in progress] Run task/docs, link/reference, protocol, and release checks;
   compare the archive tree against the pre-task commit. The parent owns the
   final repository-wide check after the canonical release-version update and
   keeps this child open until the remote release evidence permits archival.

## Local migration evidence

The 2026-08-10 migration was re-observed from Git baseline
`50cca3ac5863a323934b4b9071b318492590b7e8` before the versioned package tree
was removed:

- The task-local inventory covers all 197 tracked source files and every
  substantive document section. An independent Git-tree comparison reported
  `reviewed=197`, `covered=197`, and `missing=[]`.
- `docs/fyagent/dev/` is absent. The current responsibility-oriented documents
  and active owner specs contain no fixed `v0.3.0`, retired spec route, or old
  package path as current authority. Protocol/schema/API/toolchain versions
  remain covered by their owner specs and tests.
- The real `.trellis/tasks/archive/` has no index or worktree diff and retains
  tree object `c76153dc5c92ebd09c415b468b096d3aea2424e9` from the baseline above.
- `mise run release:check` passed 21 contract test files with 543/543 tests,
  plus the 4/4 native-fetch suite. The five focused documentation/classifier
  files passed 141/141 tests.
- `mise run typecheck`, `mise run tasks:docs:check`, `mise run tasks:validate`
  (83 tasks), `mise run trellis:verify` (87 managed, 84 pristine, 3
  reconciled), reviewed-file formatting, and `git diff --check` passed.
- An independent read-only documentation review found no remaining P0-P3
  issue. It confirmed the public installer/trust statements, active-owner
  signatures, local-link coverage, inventory disposition, archive integrity,
  and the separation between local evidence and pending native/remote gates.
- The complete inventory is intentionally retained at 36,906 bytes so no
  per-file evidence is discarded. Trellis reports a non-failing 32,768-byte
  automatic context-injection warning; reviewers can read the task-local file
  directly.
