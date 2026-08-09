# CI and release modernization

## Goal

Run only affected domains for PR/merge-group changes while keeping one stable
required result, and publish formal releases only from the exact successful
full-CI HEAD of `dev/laiyongjie`.

## Requirements

- A repository-owned classifier receives explicit base/head SHAs and emits
  domains, unknown paths, and force-full state from one tested path map.
- Dependency/control-plane roots widen domains or force full CI. Unknown paths
  fail rather than silently skip or default full.
- PR and merge-group run affected domains; docs/spec-only still runs a light
  required gate. `CI / Required` always exists and distinguishes legitimate
  skip from failure, cancellation, and timeout.
- Every `dev/laiyongjie` push runs the complete CI matrix. Preserve current
  `main` push CI and do not add Main Provenance or change repository settings.
- Formal tag eligibility requires strict SemVer/canonical version, current
  remote dev HEAD equality, and a successful exact-SHA push CI from the
  correct repository/workflow/branch.
- `workflow_dispatch` is preflight-only. Formal publication preserves the
  multi-platform asset transaction and attestation and consumes verified
  Windows signing-state disclosure.

## Acceptance Criteria

- [ ] Classifier fixtures cover each domain, dependency/control roots, unknown
      paths, base/head errors, and dev force-full.
- [ ] Required aggregation rejects failure/cancel/timeout and accepts only
      explicitly non-required skips.
- [ ] Eligibility fixtures reject old green commits, wrong identity/event/
      branch/SHA, moved branch, missing/failed run, and version mismatch.
- [ ] Dispatch cannot reach publish; exact-SHA tag flow publishes only after
      verified assets, signing state, digests, and attestation.
- [ ] Existing `main` behavior/settings remain untouched.
