# Release flow

The [GitHub Release workflow spec](../../../../.trellis/spec/backend/github-release-workflow.md)
owns source eligibility, native build topology, asset/evidence aggregation,
attestation, and the publication transaction. The
[application version spec](../../../../.trellis/spec/backend/fyagent-version-contract.md)
owns canonical SemVer and versioned asset names.

## Exact-source progression

```text
current remote development-branch HEAD
  -> successful full push CI for that exact SHA
  -> same-SHA dispatch preflight, never publication
  -> frozen branch state
  -> annotated stable tag targeting that exact SHA
  -> formal native build and evidence workflow
  -> private draft upload and re-download verification
  -> one final publication transition
```

Both preflight and formal mode require the same current development-branch
source and successful push-CI evidence. Dispatch can build and verify candidate
assets but its publication condition is always false. A formal run refuses a
lightweight tag, a moved branch, stale green CI, identity mismatch, partial
signer configuration, incomplete native evidence, or asset drift.

Release metadata retains real schema identities for download manifests,
platform builds, aggregate build metadata, and Windows signing status. The
Windows signing table in public notes is generated from verified metadata;
credentials and provider commands never become documentation or attachments.

The task archive/journal closeout happens only after the public Release is
verified. That bookkeeping push advances the branch without moving the release
tag and must complete one final full CI run.
