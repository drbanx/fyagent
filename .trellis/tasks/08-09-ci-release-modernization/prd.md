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
  remote dev HEAD equality, an annotated tag targeting that commit, and a
  successful exact-SHA push CI from the correct repository/workflow/branch.
- Preflight binds the same dev HEAD and successful CI attempt. Publication
  repeats live eligibility when the publish job begins and immediately before
  the final PATCH, comparing both observations with the frozen decision.
- `workflow_dispatch` is preflight-only. Formal publication preserves the
  multi-platform asset transaction and attestation and consumes verified
  Windows signing-state disclosure.
- Platform acceptance is successful native build/package output. Windows also
  requires unsigned/signing proof and fresh sealing, but Release does not run
  an install -> verify -> uninstall Actions job. The retained lifecycle script
  is a manual diagnostic, not a release gate.

## Acceptance Criteria

- [x] Classifier fixtures cover each domain, dependency/control roots, unknown
      paths, and base/head errors; workflow fixtures cover dev/main full-run
      policy and PR/merge-group affected-domain policy.
- [x] Required aggregation rejects failure/cancel/timeout and accepts only
      explicitly non-required skips while requiring independent Jobs API
      evidence for every requested job.
- [x] Eligibility fixtures reject old green commits, wrong identity/event/
      branch/SHA, moved branch, lightweight/moved tags, incomplete API
      evidence, missing/failed/newer run, frozen-result drift, and version
      mismatch.
- [x] Dispatch cannot reach publish; exact-SHA tag flow publishes only after
      two live remote rechecks, verified assets, signing state, digests, and
      attestation.
- [x] Workflow topology routes successful native builds and the mutually
      exclusive Windows proof/seal branches directly into exact-asset
      verification without executing an installer lifecycle.
- [x] Existing `main` workflow behavior remains unchanged and this workstream
      performs no repository-setting mutation. The parent retains the final
      remote settings observation.
