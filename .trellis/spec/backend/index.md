# Backend Development Guidelines

This layer records executable backend contracts for the Rust/Tauri host.
Current authority is the unique active spec owner below, the current task's
approved artifacts and evidence, and current developer-facing material under
`docs/fyagent/development/`. Archived tasks and Git history are historical
evidence only. They must not override an active version, installer, security,
release, configuration, or tooling contract. When behavior changes, update its
unique owner and enforcing test; update a product document only when that
document is owned by the change.

## Pre-Development Checklist

Before changing Rust/Tauri host code:

1. Locate the owning contract below; do not add a second rule where an existing
   installer, version, security, release, or platform contract already owns it.
2. For a Tauri command, serialized DTO, event, or persisted-data change, also
   read the [Frontend Development Guidelines](../frontend/index.md) and its
   [Type Safety](../frontend/type-safety.md) boundary before changing either
   side.
3. For user files, credentials, deep links, process control, installers, or
   release artifacts, identify the validation/error case and the test that will
   prove it before editing implementation code.
4. Run local commands through the shared
   [Development Environment Contract](./development-environment.md); do not
   substitute a machine-global Node, Rust, or pnpm toolchain, and never select
   a non-host OS/architecture locally. Native compile/test entrypoints must use
   their guarded mise task (or the guarded `pnpm dev`/`pnpm build` alias), not
   the low-level `pnpm tauri` maintenance/Actions leaf.
5. Preserve protocol and schema versions as protocol facts, but never infer the
   application version or current behavior from an archived design label.

## Guidelines

| Guide                                                                     | Use it for                                                                                                                                         |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Codex Desktop Installer](./codex-desktop-installer.md)                   | Fixed-source installer service, IPC DTOs/job events, same-session Windows package ownership, and trusted Codex application restart/launch.         |
| [Codex Provider Configuration](./codex-provider-configuration.md)         | Lossless Codex Provider TOML, native capabilities, vendor/session projection, warnings, and live-config change evidence.                           |
| [WorkBuddy Configuration](./workbuddy-configuration.md)                   | WorkBuddy model discovery, restricted third-party `/v1` access, credential-safe persistence, and renderer-domain isolation.                        |
| [Application Version and Installer Assets](./fyagent-version-contract.md) | Cargo version single source, version commands, frozen release values, exact cross-platform asset names, and evidence sets.                         |
| [GitHub CI Workflow](./github-ci-workflow.md)                             | Repository-owned change classification, domain-aware PR/merge-group jobs, full dev/main pushes, and the stable `CI / Required` aggregate.          |
| [GitHub Release Workflow](./github-release-workflow.md)                   | Exact dev-HEAD/tag/successful-push-CI identity, full preflight/formal topology, asset transaction, attestation, and public Release.                |
| [Windows Installer](./windows-installer.md)                               | NSIS bundle, install-path behavior, bounded uninstall, per-asset signing policy, x64/ARM64 native build/package, and manual lifecycle diagnostics. |
| [Windows Runtime Security](./windows-runtime-security.md)                 | Formal startup and interactive-user proof, protected machine runtime, authenticated activation, and elevated CLI boundary.                         |
| [Development Environment](./development-environment.md)                   | Locked mise-first local tool versions, host-native compiler/runner/linker boundary, and WSL PATH isolation.                                        |
| [Repository Task Runner](./task-runner-contract.md)                       | Canonical mise task metadata, argv transport, DAG effects, maintenance safety, and generated task documentation.                                   |
| [Trellis Tooling](./trellis-tooling.md)                                   | Managed-template updates, deterministic project overlays, read-only divergence verification, and current-authority routing.                        |
| [Codex Development Hooks](./development-hooks.md)                         | Codex hook registration/protocol, strict context injection, and ownership of the three declared hook overlays.                                     |
| [Application Brand Assets](./application-brand-assets.md)                 | Cross-platform app icons, About reuse, macOS tray templates, and validation.                                                                       |
| [Application Identity](./application-identity.md)                         | Cross-layer FyAgent identity, clean-break behavior, and provenance exceptions.                                                                     |
| [CC Switch Upstream Synchronization](./upstream-sync.md)                  | Immutable upstream tag verification, two-parent merge ancestry, conflict precedence, and provenance boundaries.                                    |
| [Deep-Link Import Security](./deeplink-import-security.md)                | Untrusted `fyagent://v1/import` request validation, explicit provider activation approval, and credential-safe confirmation.                       |

## Quality Check

Run the **Tests Required** section of every contract affected by the change.
For ordinary Rust/Tauri changes, the baseline local checks are:

```bash
mise run rust:fmt:check
mise run rust:clippy
mise run rust:test
```

Add the applicable renderer, version, Windows, macOS, or release contract
checks rather than reporting an unrelated local command as platform or release
evidence. Canonical local native commands verify and pin the current host
OS/architecture; matching native Actions jobs own all non-host evidence. A
code-spec update that changes a contract must name its enforcing test;
successful local static checks never prove a native package, artifact
attestation, or remotely published Release.
