# Codex provider configuration flow

Current provider services, commands, typed renderer facades, and tests define
configuration capabilities, persisted fields, mutation results, and the
renderer/backend boundary. Codex Desktop services and tests separately define
trusted desktop-process discovery and restart execution. Retained provider and
desktop-installer notes under `.trellis/spec/` are optional AI-assistance
review material.

## Responsibility split

```text
provider form
  -> typed renderer facade
  -> provider configuration command/service
  -> atomic configuration mutation
  -> capability/restart result
  -> trusted Codex Desktop restart coordinator, when required
```

A configuration mutation may report that a trusted desktop restart is needed,
but that result does not itself authorize process termination or launch. The
desktop lifecycle revalidates its own identity and interactive-user context
before each side effect.

Use the provider command/service tests for configuration semantics, the Codex
Desktop tests for restart ambiguity and process effects, and renderer tests for
typed form/query behavior. Do not rejoin this domain with WorkBuddy under a
version-named container.
