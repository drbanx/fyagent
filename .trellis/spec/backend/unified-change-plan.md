# Unified Change Plan — Codex Provider Switch Contract

## 1. Scope / Trigger

Read this contract before changing the Codex Provider Change Plan tables,
digests, admission, job snapshots/events, reconciliation, Tauri commands,
TypeScript decoder/query, shared dialog, or the production Codex switch entry.
It owns only switching to an existing Codex Provider. Provider create/edit,
other AppTypes, network probes, and real-usage observation remain outside it.

## 2. Signatures

The fixed command surface is:

```text
create_codex_provider_switch_plan(targetProviderId) -> ChangePlan
apply_change_plan(planId, planDigest) -> ApplyChangePlanOutcome
get_change_job(jobId) -> ChangeJobSnapshot
list_recoverable_change_jobs() -> ChangeJobSnapshot[]
change-job://updated -> { jobId, eventSeq }
```

Schema-v16 initialization idempotently creates `change_plans`, `change_jobs`,
and `change_job_events`. It does not increment `SCHEMA_VERSION` or claim v17.

## 3. Contracts

- Plan inspection reads DB current, device current, target definition, effective
  target projection, and Codex live projection. It performs no Provider,
  settings, live-file, job, or network mutation; only the immutable plan row is
  inserted.
- A plan expires after 15 minutes. `planDigest` is stable for equivalent intent
  and baseline while `planId` is unique.
- Admission consumes a matching ready plan and creates exactly one planned job
  in one SQLite transaction. Digest mismatch, expiry, replay, or baseline drift
  creates no job and never calls the writer.
- Apply calls `ProviderService::switch` exactly once. The mutation return cannot
  declare success; DB current, device current, target definition, and the safe
  live projection are independently read back.
- `liveConfigChanged` affects only `restartRequirement`. `usageEvidence` is
  always `not_observed` in this slice.
- A nonterminal job is reconciled by fresh readback after acquiring the Change
  Plan lock. It re-reads the latest snapshot and never replays the writer.
- The renderer decodes unknown enum values to `unknown`, treats unknown job
  states as terminal fail-safe results, polls nonterminal snapshots, and uses a
  validated monotonic event only to invalidate/refetch.
- Only the Codex production switch entry opens `ChangePlanFlow`. Non-Codex
  entries retain the existing direct mutation.

Persisted/IPC payloads contain stable IDs, safe display text, digests, codes,
timestamps, bounded steps/resources, and booleans. They contain no Provider
settings, secret value, raw live configuration, absolute path, or raw backend
error.

## 4. Validation & Error Matrix

| Condition                                         | Required result                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Missing target                                    | `target_not_found`; no plan                                                           |
| Target already current                            | `target_already_current`; no plan                                                     |
| Wrong digest                                      | `invalid_digest`; no job/writer call                                                  |
| Expired plan                                      | `expired`; no job/writer call                                                         |
| Consumed/replayed plan                            | `consumed`; no second job/writer call                                                 |
| Baseline drift                                    | `stale`; no job/writer call; UI offers replan                                         |
| All four target predicates match                  | `succeeded` (or `warning` when an unknown writer outcome nevertheless reached target) |
| Baseline restored and target definition unchanged | `failed`, `writer_failed_baseline_restored`, recovery succeeded                       |
| Live read unavailable                             | never green; `readback_unavailable` and recovery required                             |
| Mixed, third, or target-definition-drift state    | `failed`, recovery required                                                           |
| Unknown renderer enum/status                      | safe `unknown` rendering; no direct fallback                                          |

## 5. Good / Base / Bad Cases

- Good: preview A is admitted once, the existing writer runs once, all four
  readbacks match, and the dialog reports local success plus
  `usageEvidence=not_observed`.
- Base: writer returns an error but all target predicates match. The job reports
  a warning and does not retry.
- Bad: retry a stale/unknown write, infer success from `liveConfigChanged`, copy
  Provider write logic into Change Plan, or fall back to direct Codex mutation
  when a command is unavailable.

## 6. Tests Required

- Rust contract/store tests: serde shape, canonical digest stability, additive
  v16 tables, atomic admission, replay/stale/expiry rejection, and row redaction.
- Rust plan/apply tests: unique ID/stable digest, target-state zero writes,
  writer exactly once, four-resource readback, baseline restored, target
  reached, definition drift, mixed state, and latest-snapshot reconciliation.
- Shared fixture: Rust serialization equals
  `tests/fixtures/changePlanDtoContract.v1.json`; TypeScript decoders parse the
  same plan/outcome/event bytes.
- Renderer tests: preview focus, stale replan, running close protection,
  terminal resource/recovery/evidence rendering, polling stop, and duplicate or
  foreign event rejection.
- Entry regression: Codex sets the dialog target and makes zero direct switch
  mutation calls; non-Codex tests retain direct behavior.
- Integration/static: all four commands are registered exactly once and no
  protected scope is modified.

## 7. Wrong vs Correct

Wrong:

```text
switch mutation returned Ok -> show success toast
nonterminal query waited for apply lock -> reconcile its old in-memory revision
```

Correct:

```text
one admitted writer call -> fresh four-resource readback -> durable result
after acquiring reconcile lock -> reload latest snapshot -> return if terminal
```
