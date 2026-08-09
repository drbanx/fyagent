---
name: fyagent-trellis
description: "FyAgent project entrypoint for the repository's mise-backed Trellis lifecycle. Use when a contributor needs the canonical local setup, context, task, validation, or closeout route without duplicating the general Trellis skills."
---

# FyAgent Trellis Entry Point

Use the existing Trellis lifecycle skills for planning, implementation,
checking, spec updates, and closeout. This file only selects FyAgent's stable
command boundary; it does not copy or replace those skills.

## Environment boundary

<!-- fyagent:new-checkout-environment-gate:start -->

For every new checkout, a human developer must explicitly review `mise.toml`,
the included `.mise/tasks/*.toml` files, the standard version files, and
`mise.lock`. After that review, the developer manually runs this sequence in
order:

```bash
mise trust
mise run bootstrap
mise run system:check
```

This gate is not automatic. Skills, hooks, and repository tasks must not automatically invoke `mise trust` or trigger `mise run bootstrap`; `bootstrap` runs only as the top-level command explicitly entered by the developer. If the checkout is untrusted or unprepared, stop and ask the developer to complete the sequence instead of attempting to repair the environment.

<!-- fyagent:new-checkout-environment-gate:end -->

Repository Trellis operations run through the uv-managed Python environment:

```bash
mise run trellis:context
mise run trellis:context -- --mode phase
mise run trellis:task -- current --source
mise run trellis:validate -- .trellis/tasks/<task-dir>
```

Use `trellis-start` or `trellis-continue` to enter the lifecycle,
`trellis-before-dev` before implementation, `trellis-check` after changes,
`trellis-update-spec` for durable knowledge, and `trellis-finish-work` only
after work commits exist. Planning approval, implementation approval, quality
checks, work commits, task archive, and journal remain distinct gates.

## Boundaries

- Do not call Trellis Python scripts directly in routine project instructions.
- Do not make a skill, hook, or repository task automatically trust or
  bootstrap a checkout. A repository task must never change mise trust state.
- Do not make a repository task install system packages, change Git remotes,
  create a tag, push, or publish a Release.
- A child task may archive only after its own acceptance evidence is real. The
  modernization parent remains open until remote CI, formal Release, closeout
  evidence, and every child archive are complete.
