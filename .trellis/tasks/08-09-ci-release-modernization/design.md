# Design

`scripts/ci/classify-changes.mjs --base <sha> --head <sha> --json` owns path
classification. Workflow YAML consumes its stable booleans instead of
duplicating globs. The required evaluator receives job conclusions plus the
requested-domain set and the exact current-attempt Jobs REST response. This
lets the stable aggregate distinguish a legitimate skipped domain from a
cancelled, failed, or timed-out requested job. Push/manual full-run policy is
workflow-owned; the classifier remains a pure base/head path contract.

The dev-release eligibility engine is pure logic over normalized GitHub/Git
metadata. A separate repository collector uses read-only GitHub APIs to bind
the live dev ref, annotated formal tag, CI workflow, latest exact-source dev
push attempt, and its Required job/check. It freezes a decision before builds.
Publication re-runs the same collector against that frozen decision before
draft creation and immediately before the final PATCH. Publication stays a
draft transaction until remote byte re-download, metadata, signing-state,
attestation, and the second live identity gate succeed.

The release trust chain deliberately does not depend on `main`, Main
Provenance, branch protection, or rulesets. Build-input pinning, successful
matching native build/package jobs, and the Windows preflight-proof or formal
producer/fresh-sealer branches feed exact-asset verification directly. No
Release job executes an installer; the retained lifecycle harness is an
out-of-band manual diagnostic rather than part of the native byte trust chain.
