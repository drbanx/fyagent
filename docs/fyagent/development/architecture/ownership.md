# Current-state ownership

FyAgent keeps long-lived knowledge in two layers:

1. Active Trellis specs state the invariant, forbidden behavior, and required
   evidence for one responsibility.
2. Development documents explain how responsibilities connect and where to
   operate or debug them.

Code and tests remain the executable evidence. A rule that changes with code
has one normative spec owner; a development document links to that owner
instead of repeating its complete field, status, error, or asset table.

## Cross-layer map

```text
Developer operation
  -> guarded mise task
  -> implementation or validation leaf
  -> owner-spec test evidence

Pull request / merge group
  -> repository change classifier
  -> affected domain jobs
  -> CI / Required

Development-branch release source
  -> exact successful full push CI
  -> release preflight
  -> annotated formal tag at the same source
  -> native builds and evidence
  -> transactional public Release

Elevated Windows host
  -> same-session Shell identity proof
  -> immutable interactive-user context
  -> Codex Desktop ordinary-user lifecycle
  -> context-preserving restart or launch
```

The [backend spec index](../../../../.trellis/spec/backend/index.md) owns the
responsibility catalog. The
[frontend spec index](../../../../.trellis/spec/frontend/index.md) owns
renderer layering and points back to backend wire contracts when a flow crosses
Tauri IPC.

## Context routing

Normal implementation work reads, in order:

1. the active task artifacts;
2. the applicable active spec owner;
3. the nearest current development explanation;
4. current code and tests.

Archived Trellis tasks and Git history are consulted only when the task is
explicitly historical, forensic, or provenance-oriented. A prior rollout
decision never overrides current implementation plus its active owner spec.
