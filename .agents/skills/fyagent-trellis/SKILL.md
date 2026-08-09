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
mise run trellis:verify
```

Use `trellis-start` or `trellis-continue` to enter the lifecycle,
`trellis-before-dev` before implementation, `trellis-check` after changes,
`trellis-update-spec` for durable knowledge, and `trellis-finish-work` only
after work commits exist. Planning approval, implementation approval, quality
checks, work commits, task archive, and journal remain distinct gates.

## Managed template updates

Trellis owns its bundled lifecycle templates. FyAgent-specific setup, command,
native-execution, and release-evidence rules belong here or in an active
project spec; do not edit an upstream lifecycle skill to carry them. Before
changing a managed path or overlay, read
`.trellis/spec/backend/trellis-tooling.md`; the exact three hook divergences are
owned by `.trellis/spec/backend/development-hooks.md`.

Use this reviewed update sequence when adopting a Trellis release:

1. Run `trellis update --dry-run` and inspect every managed-path decision.
2. Have a human developer review the proposed upstream changes, migrations,
   and backups before applying them.
3. Run `trellis update` with the reviewed options.
4. Run `mise run trellis:reconcile` to apply only declared overlays whose
   current bytes match an approved upstream base.
5. Run `mise run trellis:verify` and review `git diff`, targeted tests, and all
   affected active specs before committing.

The overlay authority is `scripts/trellis/overlay-manifest.json`. Unknown
preimages, missing managed files, undeclared divergence, stale overlays, and
output-hash drift are errors. `trellis:reconcile` modifies source only after
every declared transform passes its preflight; `trellis:verify` is read-only.
The Trellis CLI remains the only owner of update dry-run, migration, and backup
semantics.

For a reviewed subset of repository files, use
`mise run format:files -- <files...>`. The full `mise run format` task retains
its existing frontend-wide behavior.

## Execution and evidence

- Resolve current task, phase, packages, and records through the mise-backed
  Trellis tasks above. Treat `.trellis/scripts/**` as internal implementation.
- Before changing code, load the active task artifacts and the relevant
  `.trellis/spec/**` owners. Current authority comes from the unique active
  spec owner, the current task's approved artifacts/evidence, and
  `docs/fyagent/development/`. Archived tasks and Git history are evidence, not
  current authority; a protocol or schema suffix remains a protocol fact and
  is not an application-version source.
- Local build, test, package, and verification commands target only the
  current OS and architecture; matching native GitHub Actions runners own
  every non-host gate.
- After an authorized Actions trigger, the initiating flow waits for the whole
  run to complete, inspects the final result once, and fetches failed-job logs
  only on failure.
- A cross-platform or release claim requires evidence from the matching native
  job. Local structure checks and cross-compilation do not replace native
  installer, runtime, signing, or architecture evidence.

## Boundaries

- Do not call Trellis Python scripts directly in routine project instructions.
- Do not add `fyagent-trellis` itself to upstream managed-template ownership or
  to the overlay manifest.
- Do not make a skill, hook, or repository task automatically trust or
  bootstrap a checkout. A repository task must never change mise trust state.
- Do not make a repository task install system packages, change Git remotes,
  create a tag, push, or publish a Release.
- A child task may archive only after its own acceptance evidence is real. The
  modernization parent remains open until remote CI, formal Release, closeout
  evidence, and every child archive are complete.
