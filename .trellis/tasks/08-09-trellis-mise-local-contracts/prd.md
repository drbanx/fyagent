# Trellis and mise local contracts

## Goal

Make FyAgent's Trellis customizations explicit, deterministic, update-safe,
and testable while preserving stable `mise run` developer entrypoints.

## Requirements

- Restore missing canonical root/platform `AGENTS.md` templates and track the
  root file.
- Dynamically classify every managed template path; historical path counts are
  evidence, not a permanent contract.
- Restore bundled workflow/skills to upstream when project behavior can move
  to `fyagent-trellis` or an active spec. Keep only reviewed project overlays.
- Add a versioned overlay manifest with base/output hashes, owner, reason, and
  deterministic patch/structured transforms.
- `trellis:reconcile` is source-modifying, idempotent, and fail-closed on an
  unknown preimage. `trellis:verify` is read-only and rejects every missing,
  undeclared, stale, or mismatched managed path.
- Trellis Python scripts run through uv directly without a device Python
  executable name.
- Add safe cross-shell `format:files`; preserve the existing broad `format`
  task and direct `trellis update` CLI boundary.

## Acceptance Criteria

- [x] Every managed path is pristine or has exactly one declared overlay owner.
- [x] Reconcile handles base/output states idempotently and rejects drift.
- [x] Verify detects missing, undeclared, stale, and hash-mismatched states
      without changing the worktree, and is part of contracts/CI.
- [x] Both missing canonical files are restored and root `AGENTS.md` is tracked.
- [x] uv-direct wrapper and `format:files` edge/cross-shell tests pass.
- [x] A temporary update rehearsal proves idempotence and upstream-drift failure.
