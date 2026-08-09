# FyAgent development knowledge

This directory contains current architecture explanations and operator
runbooks. Normative engineering invariants live in the active
[Trellis backend specs](../../../.trellis/spec/backend/index.md) and
[frontend specs](../../../.trellis/spec/frontend/index.md); executable behavior
lives in code and tests. A development document may explain a flow or point to
commands, but it does not create a second copy of a mutable contract.

For an ordinary task, start with the active Trellis task, the applicable spec
index, and the document below that owns the explanation you need. Archived
tasks and Git history are evidence for an explicit historical investigation,
not default current context.

## Responsibility map

| Area                                 | Current explanation                                                                    | Normative owner                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Knowledge and architecture ownership | [Architecture ownership](architecture/ownership.md)                                    | [Backend spec index](../../../.trellis/spec/backend/index.md) and [frontend spec index](../../../.trellis/spec/frontend/index.md)                              |
| FyAgent Windows installer            | [Windows installer](windows/installer.md)                                              | [Windows installer spec](../../../.trellis/spec/backend/windows-installer.md)                                                                                  |
| Windows runtime security             | [Windows and Codex Desktop flow](windows/codex-desktop.md)                             | [Windows runtime security spec](../../../.trellis/spec/backend/windows-runtime-security.md)                                                                    |
| Codex Desktop lifecycle              | [Windows and Codex Desktop flow](windows/codex-desktop.md)                             | [Codex Desktop installer spec](../../../.trellis/spec/backend/codex-desktop-installer.md)                                                                      |
| Codex provider configuration         | [Codex provider flow](configuration/codex-provider.md)                                 | [Codex provider configuration spec](../../../.trellis/spec/backend/codex-provider-configuration.md)                                                            |
| WorkBuddy configuration              | [WorkBuddy flow](configuration/workbuddy.md)                                           | [WorkBuddy configuration spec](../../../.trellis/spec/backend/workbuddy-configuration.md)                                                                      |
| CI                                   | [CI flow](ci-release/ci.md)                                                            | [GitHub CI workflow spec](../../../.trellis/spec/backend/github-ci-workflow.md)                                                                                |
| Release                              | [Release flow](ci-release/release.md)                                                  | [GitHub Release workflow spec](../../../.trellis/spec/backend/github-release-workflow.md)                                                                      |
| Local tools and tasks                | [mise development flow](tooling/mise.md) and [generated task reference](mise-tasks.md) | [Development environment](../../../.trellis/spec/backend/development-environment.md) and [task runner](../../../.trellis/spec/backend/task-runner-contract.md) |
| Trellis updates and overlays         | [Trellis update and overlay flow](trellis/update-and-overlay.md)                       | [Trellis tooling spec](../../../.trellis/spec/backend/trellis-tooling.md)                                                                                      |
| Validation and evidence              | [Validation guide](validation.md)                                                      | The affected owner spec's `Tests Required` section                                                                                                             |

## Version words that remain intentional

Do not remove a version string merely because it contains `v1` or another
number. Real compatibility identities remain current, including:

- the `fyagent://v1/import` deep-link protocol;
- release and build metadata schema identities;
- WorkBuddy's third-party `/v1` API path;
- pinned toolchain, Action, runner, operating-system, and installer-tool
  versions.

Product-stage labels and fixed past-release narratives are not current
authority. Historical public release notes remain historical records and are
not rewritten as part of current development documentation.
