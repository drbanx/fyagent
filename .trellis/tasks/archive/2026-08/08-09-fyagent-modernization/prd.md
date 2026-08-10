# FyAgent modernization

## Goal

Modernize FyAgent's local Trellis contracts, Windows distribution, Codex
Windows user scope, CI/release gates, and current documentation as one
traceable delivery on `dev/laiyongjie`, preserve the available local and remote
evidence, and prepare the five children plus this parent for ordered archival.

## Requirements

- The five child tasks own all implementation. This parent owns dependency
  order, cross-child invariants, evidence classification, and local closeout.
- Execute children in this order: Trellis/mise; Windows installer and Codex
  Windows scope; CI/release; docs/spec migration.
- Keep the formal executable elevation and same-session Shell-user security
  boundaries while replacing MSI/WiX with NSIS setup executables.
- A formal Windows release may be unsigned only when both assets are proven
  `NotSigned`, the state is disclosed publicly, and digests plus attestation
  remain available. Complete signer configuration requires sign-and-verify;
  partial or invalid configuration fails closed.
- The implemented Release acceptance contract requires successful matching
  native build/package jobs on every platform. Windows additionally requires
  unsigned/signing proof and
  fresh sealing, but the workflow does not execute an install -> verify ->
  uninstall lifecycle; the retained harness is a manual diagnostic only.
- Do not merge or change `main`, repository protection, or merge settings.
  Release eligibility is exact equality between the formal tag SHA, the
  current remote `dev/laiyongjie` HEAD, and that SHA's successful full push CI.
- Repository code, tasks, specs, CI, and documentation must be self-contained
  and must not reference the source planning package.
- Preserve Trellis archives and true protocol/schema/toolchain versions.

## Acceptance Criteria

- [x] Every child records its implemented scope, local validation, already
      observed native/remote evidence, and any observation that remains
      unverified; installer execution is not represented as a Release gate.
- [x] The correction work at `99738a00260da3ea095f8d8750c6d8af97e07cf5`
      has exact-source successful push CI and successful non-publishing
      preflight evidence, while the later cancelled formal attempt is retained
      as a cancellation rather than upgraded to Release evidence.
- [x] The repository keeps the exact-SHA eligibility, native package,
      proof/sealing, asset, attestation, and publication contracts executable
      even though their next production execution is deferred.
- [x] The five children and this parent contain archive-ready evidence in
      dependency order; the actual moves remain the Trellis archive operation.
- [x] `main`, remote protection settings, historical archives, and the source
      planning package remain unchanged.

## Deferred Follow-up

By explicit user strategy decision on 2026-08-10, the following are not
acceptance criteria for this task tree and move to a future independent task:

- a new exact-SHA CI run and non-publishing preflight after the repository
  owner transfer;
- disposition or recreation of `v0.3.1` and a successful formal Release run;
- public Release asset, download-manifest, signing disclosure, digest, and
  Sigstore/GitHub attestation verification;
- acceptance of or waiting for the automatic CI run created by the current-
  scope archive/journal push.

This deferral does not claim that any item above passed. The future task must
re-read live repository, ref, Release, and Actions state before acting.
Ordered archival, journal recording, local closeout commits, and one push of
those commits to `dev/laiyongjie` remain in the current scope; the current task
does not wait for or accept the CI run that push may create.

## Out of Scope

- Merging to `main`, Main Provenance, branch/ruleset changes, or choosing a
  specific signing provider.
- Claiming Authenticode trust for an unsigned artifact.
- Replacing native Windows ARM64 acceptance with cross-compilation or emulation.
