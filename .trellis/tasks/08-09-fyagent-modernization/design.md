# Design

The parent is a coordination and evidence boundary, not an implementation
target. Each child owns one independently testable contract. The parent tracks
the ordered dependency graph and the release transaction:

```text
Trellis/mise -> (NSIS installer + Codex Windows scope)
             -> CI/release -> docs/spec -> v0.3.1 -> archive/journal
```

Work remains on `dev/laiyongjie`. Earlier correction pushes remain in the
branch ancestry. The final unpushed correction batch is pushed once, and its
remote HEAD must contain every reviewed work commit. Formal release
eligibility re-resolves that remote branch and a successful `push` CI run by
repository, workflow identity, branch, and exact SHA. `workflow_dispatch` is
preflight-only. The tag workflow uploads through a draft transaction,
re-downloads and verifies bytes, publishes only after all gates pass, and never
moves an existing tag.

The release-time equality is intentionally point-in-time. After publication,
the branch may advance only with ordered Trellis archive and journal commits.
That closeout push receives a second full CI gate.

Platform acceptance comes from successful matching native build/package jobs.
The Windows preflight proof or formal signing/fresh-sealing branch then feeds
exact-asset verification directly. Release never launches the setup executable
or runs install -> verify -> uninstall; the lifecycle harness remains available
only for manual diagnosis.
