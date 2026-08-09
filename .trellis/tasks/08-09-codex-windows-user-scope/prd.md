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
  restart/launch. Context or owner drift stops the lifecycle.
- Zero/one/multiple same-user trusted Stable Main candidates map to absent,
  selected, and ambiguous failure. Other users' packages do not count.
- Keep ordinary and all-users capability paths separate; do not replace the
  all-users query or add a fallback.

## Acceptance Criteria

- [ ] Multi-SID fixtures prove other-user isolation and same-user ambiguity.
- [ ] Adapter tests assert explicit SID plus Main and same-context post-verify.
- [ ] Ordinary fakes prove all-users capability is never called.
- [ ] WTS token acquisition is absent from ordinary GUI identity proof while
      formal Shell/process mismatch continues to block startup.
- [ ] Native Windows smoke verifies WinRT plumbing without Store, network,
      real Codex, or a real multi-account VM.
