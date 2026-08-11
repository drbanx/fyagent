# mise development flow

The standard version files, `mise.toml`, `mise.lock`, `.mise/tasks/`, and task
scripts define the local tool and command surface. Their contract tests verify
tool sources, uv/Python behavior, host-native execution, argument transport,
effects, composition, and maintenance safety. Retained development-environment
and task-runner notes under `.trellis/spec/` are optional AI-assistance
references rather than command prerequisites.

## Entry points

After reviewing a new checkout, use this standalone sequence:

```bash
mise trust
mise run bootstrap
mise run system:check
mise run dev
```

`mise trust` is a manual developer security decision; no repository task runs
it automatically. Routine work then uses `mise run <task>`, and
`mise run check` is the complete current-host pre-commit gate. GitHub Actions
deliberately installs and runs its native toolchain without mise. The generated
[task reference](../mise-tasks.md) is the complete command catalog and must be
regenerated from task metadata rather than edited by hand.

## Optional upstream Codex hooks

The retained Trellis `0.6.14` files under `.codex/` are optional prompt
assistance. They run upstream Python scripts directly and do not participate in
bootstrap, `mise run check`, CI, or release admission. Those flows must remain
usable when the hooks are absent, disabled, or return no context.

Accepting the upstream bytes is an accepted residual risk, not an equivalent
security migration. Compared with the retired FyAgent runner and overlay, the
hooks no longer provide repository and task realpath containment, exact-source
import binding, strict Codex event, session, cwd, stdin, stdout validation, or
markup and control-character escaping. Treat injected context as untrusted
prompt material; do not infer product or release authority from it.

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
