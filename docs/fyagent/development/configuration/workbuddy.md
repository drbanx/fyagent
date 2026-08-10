# WorkBuddy configuration flow

Current WorkBuddy services, typed renderer flows, and tests define URL
normalization, remote model discovery, document parsing, overwrite/revision
behavior, backup and atomic replacement, errors, and IPC. Retained WorkBuddy
notes under `.trellis/spec/` are optional AI-assistance review material.
WorkBuddy remains independent of Codex provider configuration even when the
renderer presents both as configuration experiences.

## Data flow

```text
WorkBuddy page input
  -> typed renderer API/query layer
  -> bounded URL and credential validation
  -> remote model projection
  -> current ~/.workbuddy/models.json snapshot
  -> revision/overwrite decision
  -> backup and atomic replacement
  -> refreshed typed status
```

The third-party API's `/v1` path and the WorkBuddy document shapes are real
compatibility contracts. They remain in current code, spec, and tests; they
are not product-stage documentation labels.

Backend tests under `src-tauri/src/services/workbuddy/` own parsing,
normalization, write, concurrency, and failure fixtures. Renderer tests under
`tests/components/workbuddy/` own form, query, conflict, and accessible-state
behavior.
