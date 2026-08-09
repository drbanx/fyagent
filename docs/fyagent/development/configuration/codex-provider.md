# Codex provider configuration flow

The [Codex provider configuration spec](../../../../.trellis/spec/backend/codex-provider-configuration.md)
owns configuration capabilities, persisted provider fields, mutation results,
and the renderer/backend boundary. The
[Codex Desktop installer spec](../../../../.trellis/spec/backend/codex-desktop-installer.md)
separately owns trusted desktop-process discovery and restart execution.

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
