# Trellis update and overlay flow

The [Trellis tooling spec](../../../../.trellis/spec/backend/trellis-tooling.md)
owns managed-template verification, overlay manifest semantics, reconcile
failure behavior, wrapper execution, and current-context precedence. The
project-local `fyagent-trellis` skill is the operator entrypoint.

## Reviewed update sequence

1. Preview a Trellis update and review every managed-path decision.
2. Review upstream migrations and backups before applying the update.
3. Apply the reviewed Trellis update with the Trellis CLI.
4. Run `mise run trellis:reconcile` to reapply only declared FyAgent overlays
   whose bytes match an approved upstream base.
5. Run `mise run trellis:verify`, inspect the diff, and execute the affected
   task/spec tests.

The overlay manifest is repository-owned evidence, not an instruction to
blindly preserve every historical divergence. Unknown preimages, missing
managed files, undeclared divergence, stale overlay output, and hash drift are
failures. Reconcile is source-modifying; verify is read-only.

Trellis commands run through the repository's uv-managed direct-script
wrapper. Routine instructions do not depend on a system `python`, `python3`,
or `py` executable name.

For normal work, load the active task and active specs before development
documents. Archived tasks and Git history are consulted only for an explicit
historical investigation.
