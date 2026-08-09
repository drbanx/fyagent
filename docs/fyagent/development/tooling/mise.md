# mise development flow

The [development environment spec](../../../../.trellis/spec/backend/development-environment.md)
owns tool sources, versions, uv/Python behavior, host-native execution, and
lock governance. The
[task runner spec](../../../../.trellis/spec/backend/task-runner-contract.md)
owns public task metadata, argument transport, effects, composition, and
maintenance safety.

## Entry points

After a human reviews and trusts a new checkout, routine work uses
`mise run <task>`. GitHub Actions deliberately installs and runs its native
toolchain without mise. The generated
[task reference](../mise-tasks.md) is the complete command catalog and must be
regenerated from task metadata rather than edited by hand.

```text
standard ecosystem version files + mise.lock
  -> guarded repository task
  -> validated argv and current-host toolchain
  -> package/Cargo/uv implementation leaf
```

Local build and Rust wrappers reject caller-controlled target/compiler/runner
redirection before starting the toolchain. Cross-platform claims therefore
come from matching native Actions runners, not a local cross-target command.

Use `mise run format:files -- <files...>` for a reviewed subset of files and
`mise run format` for the established frontend-wide operation. Use
`mise run tasks:docs:check` to prove that the generated task catalog matches
live metadata.
