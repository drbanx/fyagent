# Codex Windows user scope

## Goal

Bind the ordinary Codex Windows package lifecycle to the same-session
interactive Shell user and prevent installations owned by other users from
affecting discovery, updates, verification, or restart/launch.

## Requirements

- Create one immutable interactive-user context from process session, Shell
  window PID/session, Shell token SID, and process SID comparison.
- Fail closed on missing Shell, token/session errors, or SID mismatch.
- Ordinary inventory explicitly queries the context SID with
  `PackageTypes.Main`; retain trusted package identity/publisher/architecture/
  AUMID filtering.
- Carry the same context through discover, install/update, post-verify, and
  restart/launch. Each ordinary native boundary accepts the frozen context and
  returns context-bound evidence; missing evidence, context drift, or package/
  process owner drift stops the lifecycle before the next side effect.
- Zero/one/multiple same-user trusted Stable Main candidates map to absent,
  selected, and ambiguous failure. Other users' packages do not count.
- Keep ordinary and all-users capability paths separate; do not replace the
  all-users query or add a fallback.
- Treat more than one same-user trusted Stable Main as ambiguous for both
  install/launch discovery and restart planning; do not reuse the existing
  restart comparator to guess one Windows package.
- Expose ordinary discovery ambiguity as the platform-neutral,
  non-retryable `MULTIPLE_INSTALLATIONS` error with
  `resolve_path_conflict`; expose restart planning ambiguity as
  `ambiguous/installations`. Neither state may authorize close or launch.

## Acceptance Criteria

- [x] Multi-SID fixtures prove other-user isolation and same-user ambiguity.
- [x] Adapter tests assert explicit SID plus Main and same-context post-verify.
- [x] Ordinary fakes prove all-users capability is never called.
- [x] WTS token acquisition is absent from ordinary GUI identity proof while
      formal Shell/process mismatch continues to block startup.
- [x] Native Windows smoke verifies WinRT plumbing without Store, network,
      real Codex, or a real multi-account VM.
- [x] Matching x64 and ARM64 native CI legs execute that exact smoke once;
      scheduling or native API failure blocks acceptance.
