# V2 Agent Directory and Models Quick-Setup Contract

## 1. Scope / Trigger

Read this contract before changing the V2 Agent directory, Models quick setup,
their local Agent assets, the versioned native catalog, WorkBuddy model ports,
Claude/Codex Provider quick setup, or the sanitized Provider summary boundary.
The common shell, native-chrome, router, and layer rules remain in
[V2 Shell](./v2-shell.md). Skills/MCP and Prompt/Memory have separate feature
contracts and must not be folded into the Agent capability catalog.

The product boundary is deliberately asymmetric:

- QoderWork CN and TRAE Work are visible `pending_verification` candidates with
  official assisted links only.
- WorkBuddy uses its dedicated revision-checked configuration domain.
- Codex and Claude Code use a bounded quick-setup-specific Provider operation.
- Browser preview never impersonates authoritative desktop state.

## 2. Signatures

The payload-free Rust catalog command serializes this exact versioned shape:

```ts
type AgentCatalogId =
  | "qoderwork"
  | "trae-work"
  | "workbuddy"
  | "codex"
  | "claude-code";

type AgentCatalogResult = {
  contractVersion: 1;
  reviewedAt: string;
  agents: Array<{
    id: AgentCatalogId;
    displayName: string;
    description: string;
    officialUrl: string;
    status: "pending_verification" | "manual_install";
    actions: Record<
      "browse" | "observe" | "install" | "configure",
      {
        state:
          | "available"
          | "assisted"
          | "not_supported"
          | "pending_verification";
        reason: string;
      }
    >;
    evidenceLabel: string;
  }>;
};

get_agent_catalog() -> AgentCatalogResult
```

V2 reads a non-secret Provider projection in one native snapshot:

```ts
type ProviderAppId = "claude" | "codex";
type ProviderSummary = { id: string; name: string };
type ProviderSummaryQueryData = {
  providers: Record<string, ProviderSummary>;
  currentId: string;
};

get_provider_summary({ app }) -> ProviderSummaryQueryData
```

Quick setup accepts a dedicated minimum request, never the generic Provider
wire. Rust derives the reserved ID, category, notes, and app-specific stored
shape:

```ts
type ProviderQuickSetupRequest = {
  name: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
};

apply_provider_quick_setup_with_result({ app, request })
  -> ProviderMutationResult<{
       warnings: string[];
     }>
  | { code: "APPLY_FAILED_ROLLED_BACK" }
  | { code: "ROLLBACK_PARTIAL_STATE_UNKNOWN" };
```

The success envelope contains only non-secret stable fields:

```ts
type ProviderMutationResult<T> = {
  value: T;
  liveConfigChanged: boolean;
  app: ProviderAppId;
  warningCodes?: Array<
    | "CODEX_WEBSOCKET_NON_GPT_MODEL"
    | "CODEX_WEBSOCKET_PROXY_MAY_BE_UNSUPPORTED"
  >;
};
```

WorkBuddy signatures and revision/overwrite semantics remain authoritative in
[WorkBuddy Configuration](../backend/workbuddy-configuration.md). API keys are
mutation arguments only and never query keys or query data.

## 3. Contracts

### Catalog and local assets

- `get_agent_catalog` is deterministic, non-networking, non-secret, and ordered
  exactly: QoderWork CN, TRAE Work, WorkBuddy, Codex, Claude Code.
- The UI renders the catalog's status/action reasons; it does not derive
  capability from the display name, icon, URL, installed files, or a duplicate
  frontend matrix.
- Every entry resolves through `src/v2/shared/assets/agents`. QoderWork uses the
  reviewed official SVG; TRAE uses the reviewed official 48x48 PNG without
  recoloring or runtime upscaling beyond its native detail size. List icons are
  decorative; the detail identity owns the useful accessible name.
- Third-party marks identify their own products only. Their presence is not
  vendor endorsement, redistribution permission, or FyAgent application
  identity.

### Agent directory

- Render a keyboard-accessible left selector and right detail. The selected
  button owns `aria-current`; initial selection follows native catalog order.
- QoderWork/TRAE actions call only `settings.openExternal(officialUrl)` from the
  catalog. They do not inspect login state, download packages, read private
  config, persist notes, accept an API key, or emit configuration success.
- WorkBuddy status and Provider summaries are lazy/bounded observations. A read
  failure is `unknown/unavailable`, never `not installed`, `not configured`, or
  verified absence.
- Configuration actions navigate only with a known non-secret `target` query.

### Models target selection

- The exact selector order is QoderWork CN, TRAE Work, WorkBuddy, Codex, Claude
  Code. Missing, empty, or unknown `target` resolves to QoderWork CN.
- All five selectors use the same reviewed local Agent asset map. No selector
  image is loaded from a remote URL.
- Target state is component-local. API keys and form content never enter the
  hash, URL query, local/session storage, or cross-target state. Target change
  and unmount clear sensitive values and stale write intent.

### WorkBuddy

- Cache only sanitized status and model-ID DTOs. The API key lives in component
  memory and one native request, then clears on every terminal outcome.
- Discovery, revision, overwrite capability, atomic persistence, concurrent
  modification, and authoritative reread follow the backend WorkBuddy
  contract. The UI freezes one exact overwrite request and replays it only with
  its opaque one-time token.
- A remote response or local document in which a model ID contains a complete credential
  fails closed before DTO/query/DOM construction. The frontend repeats the
  collision rejection before save as defense in depth.
- Saving is disabled while authoritative status/model IDs are unavailable.
  Reread copy says "confirmed" only after both queries succeed.

### Claude Code and Codex

- Validate trimmed nonempty name/key/model, an absolute HTTP(S) Base URL with a
  host and no userinfo/query/fragment, reserved-ID collision, public-field
  credential collision, and credential-in-URL collision in both renderer and
  Rust. Errors are generic and never echo the field values.
- Rust derives one stable reserved Provider ID per app. The renderer cannot
  submit a generic Provider, arbitrary ID, category, metadata, usage script,
  icon, sort order, or live-config fragment.
- One per-app/config critical section serializes quick setup with every writer
  of the same Provider/current/live files. Guarded internals never reacquire the
  non-reentrant public lock.
- The operation captures exact task-owned DB/current/live/backup/runtime
  preimages, applies the normalized request, synchronizes current/live state,
  and compensates every mutated surface if a later required step fails.
  Non-critical projection warnings are explicit; an incomplete compensation is
  `ROLLBACK_PARTIAL_STATE_UNKNOWN`, not success and not "rolled back" copy.
- Compute `warningCodes` from this normalized, committed request while the
  per-app guard is still held. The command must not release the guard and reread
  the fixed reserved row to infer warnings, because a later serialized request
  may already own that row.
- File/database work runs off the Tauri IPC/UI thread. Repeat clicks are locked
  in the renderer, but backend serialization is authoritative across windows
  and other callers.
- After success, reread the sanitized Provider snapshot. Claim only that the
  fixed Quick Setup Provider ID is active when `currentId` equals the reserved
  ID. This is not proof that the reread contains this request's exact bytes: a
  later serialized writer may legitimately have replaced the same reserved
  row. A failed/mismatched reread is unconfirmed even when apply returned
  success.
- Codex may report live-byte change and stable warning codes. Restart, process
  availability, model availability, login, subscription reuse, and endpoint
  health are separate and remain unclaimed.

### Sanitized Provider summary

- The native summary command builds one snapshot under the same app guard and
  returns only `id` and `name`. It never serializes generic Provider settings,
  notes, metadata, website/category, usage credentials, or live fragments to
  V2.
- Before projection, inspect every app-specific credential carrier, including
  settings JSON, Codex TOML bearer fields, and usage-script credentials. If a
  public ID/name collides with a credential, fail the whole summary generically.
- Map key must equal summary ID. A nonempty current ID must exist in the same
  safe map. The Tauri adapter runtime-validates this exact wire again before
  React Query sees it.
- The normal browser adapter returns native-only unavailability. Rich fixtures
  live only in focused tests and are always labelled/non-authoritative.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Catalog version/order/ID/URL/action state drifts | Exact Rust/V2 contract test fails |
| QoderWork/TRAE selected | Only transient guidance and exact catalog official link are available |
| Native observation fails | Show controlled unavailable/unknown; never infer absence |
| Models target missing or unknown | Select QoderWork CN; issue no write |
| Any selector lacks a local icon | Asset mapping/unit/browser gate fails |
| WorkBuddy remote/local ID contains a complete API key | Generic fail-closed error before DTO/cache/DOM/write |
| WorkBuddy revision or overwrite token drifts | Write nothing; reread before claiming state |
| Provider Base URL has userinfo/query/fragment or a credential component | Reject before DB/current/live mutation |
| Provider request is empty, generic, wrong-ID, or has public/secret collision | Reject in Rust; no state mutation |
| Concurrent Provider/live writer | Serialize or detect conflict; never return a split DB/current/live state |
| Required atomic step fails and compensation succeeds | Return `APPLY_FAILED_ROLLED_BACK`; UI may say rollback confirmed |
| Compensation is incomplete | Return `ROLLBACK_PARTIAL_STATE_UNKNOWN`; stop writes and state that authority is unknown |
| Mutation succeeds but sanitized reread fails/mismatches | Show the atomic apply result as unconfirmed; never claim fixed-ID activation |
| Mutation succeeds and another serialized request replaces the reserved row | Keep this request's guard-time warnings; reread may confirm only fixed-ID activation, never exact bytes |
| Browser preview calls authoritative read/write | Return native-only unavailable; never return production-looking fake state |
| API key appears in URL/storage/query/log/error/DOM/snapshot | Security regression test fails |

## 5. Good / Base / Bad Cases

- Good: `/models` opens on QoderWork CN at the top, all five local icons render,
  and the page offers only official assisted guidance until a native-supported
  target is explicitly selected.
- Good: a Codex quick setup passes one minimum request to Rust, applies under the
  shared config lock, returns request-attributed non-secret warnings/live-change
  state, clears the key, and describes a matching `currentId` reread only as
  fixed-ID activation confirmation.
- Base: browser preview renders the pages but authoritative panels report that
  desktop state is unavailable; test-only fixtures may exercise UI branches.
- Bad: hard-code a second capability matrix, treat an empty Provider map as a
  real native read, compose generic add/update/switch calls in React, retain a
  key for retry, or say "rolled back" after partial compensation.

## 6. Tests Required

Run:

```powershell
mise run lint:v2
mise run typecheck:v2
mise run test:v2
mise run test:v2:browser
mise run build:renderer
mise run rust:fmt:check
mise run rust:check
mise run rust:clippy
mise run rust:test
```

Required focused coverage includes:

- exact catalog version/order/status/action/HTTPS and command registration;
- five local assets, official Qoder/TRAE digests/passive formats, Qoder default,
  exact Models order, master/detail keyboard/ARIA, four maintained viewports;
- exact official-link IPC and negative download/login/config behavior;
- normal browser native-only reads/writes and rich fake-Tauri test isolation;
- WorkBuddy discovery success/truncation/failure/duplicate lock, revision,
  frozen overwrite, expired token, external-edit TOCTOU, authoritative reread,
  API-key lifecycle, remote echo, and malicious local-document collisions;
- minimum Provider request/unknown-field rejection, fixed derived IDs/shapes,
  empty/URL/credential collisions, success warnings, current reread mismatch,
  full rollback, rollback-partial structured outcome, and secret-free errors;
- barrier/timeout tests across quick setup and generic add/update/delete/switch,
  current/live reapply, MCP config writers, post-write observation failure, and
  all Codex live/catalog files; no deadlock and no split state;
- concurrent same-reserved-ID tests prove each response keeps warnings computed
  for its own guarded request, and renderer copy never treats an ID-only reread
  as exact configuration-content confirmation;
- Provider summary app allowlist, credential carriers, exact DTO, key/ID/current
  consistency, Tauri runtime parser, React Query/DOM secret-negative scans;
- StrictMode replay, unmount/target-change cleanup, repeat-click locks, no API
  key in DOM/hash/localStorage/sessionStorage/query cache or logged fixtures.

Browser tests prove renderer/IPC wiring only. Rust tests prove service/command
contracts. Real Windows Tauri HIL and an isolated/reversible native mutation are
separate acceptance evidence.

## 7. Wrong vs Correct

Wrong: let the renderer submit and activate a generic Provider in independent
steps.

```ts
await ports.providers.updateWithResult(app, provider);
await ports.providers.switchWithResult(app, provider.id);
```

Correct: submit the minimum request once, then independently confirm the safe
native snapshot.

```ts
await ports.providers.applyQuickSetupWithResult(app, {
  name,
  baseUrl,
  apiKey,
  modelId,
});
const summary = await ports.providers.getSummary(app);
if (summary.currentId !== QUICK_SETUP_PROVIDER_IDS[app]) {
  showUnconfirmedState();
}
```
