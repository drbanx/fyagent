# Continuous integration flow

The [GitHub CI workflow spec](../../../../.trellis/spec/backend/github-ci-workflow.md)
is the normative owner for triggers, change classification, job selection,
native runner evidence, cancellation, and the stable `CI / Required` result.

## Pull request and merge-group flow

```text
explicit base SHA + head SHA
  -> repository-owned change classifier
  -> known responsibility domains
  -> affected jobs, or the lightweight docs/contracts path
  -> one required aggregate result
```

Path ownership lives in the classifier rather than being duplicated across
workflow filters. A new path that has no mapping is a classification failure,
not an implicit full build or an implicit skip. Control-plane changes force the
full domain set.

## Branch-push flow

Pushes to the development release branch run the complete CI surface. This is
intentional: only the current remote development-branch HEAD can become a
release source, so it needs exact full-push evidence. The existing main-branch
full-CI behavior remains independent of release authority.

Use `mise run check` for the complete current-host local gate. Local success
does not produce a GitHub required check or matching-architecture native
evidence.
