# Design

The parent is a coordination and evidence boundary, not an implementation
target. Each child owns one independently testable contract. The parent tracks
the ordered dependency graph and the release transaction:

```text
Trellis/mise -> (NSIS installer + Codex Windows scope)
             -> CI/release implementation -> docs/spec -> archive

future independent task:
current-owner CI/preflight -> formal v0.3.1 -> public asset proof -> closeout CI
```

Work remains on `dev/laiyongjie`. Earlier correction pushes remain in the
branch ancestry. The repository continues to implement formal release
eligibility by re-resolving the remote branch and a successful `push` CI run by
repository, workflow identity, branch, and exact SHA. `workflow_dispatch` is
preflight-only. The tag workflow uploads through a draft transaction,
re-downloads and verifies bytes, publishes only after all gates pass, and never
moves an existing tag.

On 2026-08-10 the user separated production execution from this task tree.
Formal `v0.3.1`, a new post-transfer CI/preflight, published-asset verification,
and closeout CI are future-task responsibilities. Ordered Trellis archival in
the current session records existing evidence, then the archive/journal commits
are pushed once to `dev/laiyongjie`. The current task does not wait for or
accept the automatic CI from that push, and does not imply that any deferred
production gate ran.

Platform acceptance comes from successful matching native build/package jobs.
The Windows preflight proof or formal signing/fresh-sealing branch then feeds
exact-asset verification directly. Release never launches the setup executable
or runs install -> verify -> uninstall; the lifecycle harness remains available
only for manual diagnosis.
