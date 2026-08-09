# FyAgent modernization

## Goal

Modernize FyAgent's local Trellis contracts, Windows distribution, Codex
Windows user scope, CI/release gates, and current documentation as one
traceable delivery, then publish and verify the formal public `v0.3.1`
release from `dev/laiyongjie`.

## Requirements

- The five child tasks own all implementation. This parent owns dependency
  order, cross-child invariants, remote acceptance, release, and closeout.
- Execute children in this order: Trellis/mise; Windows installer and Codex
  Windows scope; CI/release; docs/spec migration.
- Keep the formal executable elevation and same-session Shell-user security
  boundaries while replacing MSI/WiX with NSIS setup executables.
- A formal Windows release may be unsigned only when both assets are proven
  `NotSigned`, the state is disclosed publicly, and digests plus attestation
  remain available. Complete signer configuration requires sign-and-verify;
  partial or invalid configuration fails closed.
- Do not merge or change `main`, repository protection, or merge settings.
  Release eligibility is exact equality between the formal tag SHA, the
  current remote `dev/laiyongjie` HEAD, and that SHA's successful full push CI.
- Repository code, tasks, specs, CI, and documentation must be self-contained
  and must not reference the source planning package.
- Preserve Trellis archives and true protocol/schema/toolchain versions.

## Acceptance Criteria

- [ ] Every child satisfies and records its own local and native/remote evidence.
- [ ] All work commits are pushed together and the exact remote HEAD passes
      the complete `CI / Required` gate.
- [ ] Release preflight succeeds without publishing.
- [ ] Annotated tag `v0.3.1` points to that exact HEAD and publishes a normal,
      public, Latest GitHub Release with the verified asset set.
- [ ] Windows x64 and ARM64 signing states are verified and publicly disclosed;
      the release includes SHA-256/download metadata and GitHub attestation.
- [ ] All five children, then this parent, are archived only after the release
      evidence exists; the journal references work commits, not archive commits.
- [ ] The archive/journal closeout push passes a final full `CI / Required`.
- [ ] `main`, remote protection settings, historical archives, and the source
      planning package remain unchanged.

## Out of Scope

- Merging to `main`, Main Provenance, branch/ruleset changes, or choosing a
  specific signing provider.
- Claiming Authenticode trust for an unsigned artifact.
- Replacing native Windows ARM64 acceptance with cross-compilation or emulation.
