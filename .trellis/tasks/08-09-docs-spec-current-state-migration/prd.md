# Docs and spec current-state migration

## Goal

Make active specs and `docs/fyagent/development/` the self-contained current
authority, retire versioned current-design packages, and preserve real machine
protocol/schema/toolchain contracts and immutable Trellis history.

## Requirements

- Build a task-local complete migration inventory with current, superseded,
  historical, or protocol-version disposition and one current owner.
- Migrate only still-valid rules after their implementation is real, then
  delete `docs/fyagent/dev/` without creating another product-doc archive.
- Split active ownership by application version, Windows installer/runtime,
  Codex Desktop/provider, WorkBuddy, CI, Release, and Trellis tooling.
- Remove replaced specs instead of deprecated stubs or dual ownership.
- Remove product-stage/fixed-version/MSI authority while preserving deep-link
  `v1`, download/build schemas, third-party `/v1`, and actual tool versions.
- Update indexes, skills, task-doc/requirements tests, and links. Never rewrite
  `.trellis/tasks/archive/` or require the source planning package.

## Acceptance Criteria

- [x] Every old current-doc section has one reviewed disposition and owner.
- [x] `docs/fyagent/dev/` no longer exists and current docs use responsibility-
      based paths under `docs/fyagent/development/`.
- [x] Active specs contain no old package, `v0.3.0`, MSI/WiX rollout, or stale
      main-provenance statement as current authority.
- [x] True protocol/schema/toolchain versions remain and their tests pass.
- [x] Current links/indexes/spec/task docs pass, archives are unchanged, and no
      operational repository file references the source planning package.

## Deferred Follow-up

The current repository authority is `fy-agent/fyagent`; dated pre-transfer
URLs remain historical evidence only. Formal `v0.3.1`, new remote
CI/preflight, public Release assets, and closeout CI were deferred by the
2026-08-10 strategy to a future independent task. Current documentation must
not claim those future observations exist.
