# Windows runtime and Codex Desktop flow

Two distinct responsibilities meet in the Windows Codex Desktop path:

- the [Windows runtime security spec](../../../../.trellis/spec/backend/windows-runtime-security.md)
  owns elevated-host startup, Shell/process identity proof, single-instance
  activation, and privilege boundaries;
- the [Codex Desktop installer spec](../../../../.trellis/spec/backend/codex-desktop-installer.md)
  owns official-package discovery, installation/update, post-verification,
  restart, launch, and the separation between ordinary and all-users
  capabilities.

## Ordinary-user data flow

```text
formal Windows startup
  -> process session and owner
  -> current Shell window, process, session, and token owner
  -> one immutable interactive-user context
  -> explicit-SID package discovery
  -> install or update for the same context
  -> post-verification for the same context
  -> restart or launch only if identity still matches
```

The runtime proof is created once and revalidated around native operations.
The Codex Desktop layer consumes it; it does not reconstruct another notion of
the interactive user. Ordinary package discovery cannot fall back to the
all-users inventory capability.

Official Codex Desktop packages on Windows are MSIX packages. That package
format belongs to the software FyAgent manages and is independent of the
format used to install FyAgent itself.

## Testing boundary

Portable Rust fixtures cover identity mismatch, multiple-user inventory,
ambiguous trusted packages, capability separation, and context propagation.
The native Windows smoke exercises the explicit-SID package-manager adapter
without requiring Store access, network access, or a real Codex installation.
Neither form of test substitutes for FyAgent's separate setup-executable
lifecycle gate.
