# Implementation

1. Inventory all current versioned docs, active specs, indexes, skills, tests,
   and references; classify every source section.
2. Establish unique current owners for Windows/application contracts.
3. Establish current CI/release/Trellis tooling owners.
4. Split Codex provider/Desktop and WorkBuddy ownership.
5. Update references/tests and delete replaced specs plus `docs/fyagent/dev/`.
6. Audit every remaining version/MSI/WiX match semantically, preserving true
   machine contracts and excluding immutable archives from rewrite.
7. Run task/docs, link/reference, protocol, release, and full project checks;
   compare archive tree against the pre-task commit.
