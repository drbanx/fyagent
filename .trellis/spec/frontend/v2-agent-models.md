# V2 Agent Directory and Models Quick-Setup Contract

## 1. Scope / Trigger

Read this contract before changing the V2 Agent directory, Models quick setup,
their local Agent assets, the versioned native catalog (including OpenCode),
WorkBuddy model ports, Claude/Codex Provider quick setup, or the sanitized
Provider summary boundary.
The common shell, native-chrome, router, and layer rules remain in
[V2 Shell](./v2-shell.md). Skills/MCP and Prompt/Memory have separate feature
contracts and must not be folded into the Agent capability catalog.

The product boundary is deliberately asymmetric. Agents and Models share one
`CatalogMasterDetail` geometry and local brand metadata, but each detail keeps
its own capability workflow:

- QoderWork CN, TRAE Work, and WorkBuddy each expose one catalog-owned product
  link; Claude Code exposes separate CLI and Desktop links; OpenCode exposes
  `product` then `cli`. QoderWork additionally exposes safe Hooks/MCP
  preparation, while TRAE Models owns connection preflight and external MCP
  validation.
- WorkBuddy additionally uses its dedicated revision-checked configuration
  domain.
- Codex exposes no catalog link. Its detail owns the FyAgent-managed desktop
  installer while Codex and Claude Code retain bounded Provider quick setup.
- OpenCode model write is assisted vendor UI only: the Models page must not
  mount Provider quick setup or a managed installer for it.
- Browser preview never impersonates authoritative desktop state or installer
  success.

## 2. Signatures

The payload-free Rust catalog command serializes this exact versioned shape:

```ts
type AgentCatalogId =
  | "qoderwork"
  | "trae-work"
  | "workbuddy"
  | "codex"
  | "claude-code"
  | "opencode";

type AgentOfficialLinkId = "product" | "cli" | "desktop";

type AgentOfficialLink = {
  id: AgentOfficialLinkId;
  label: string;
  url: string;
};

type AgentCatalogResult = {
  contractVersion: 3;
  reviewedAt: string;
  agents: Array<{
    id: AgentCatalogId;
    variantId:
      | "qoderwork-cn"
      | "trae-work-cn"
      | "workbuddy"
      | "codex"
      | "claude-code"
      | "opencode";
    displayName: string;
    description: string;
    officialLinks: AgentOfficialLink[];
    capabilities: Array<{
      id:
        | "product.open" | "app.detect" | "app.launch"
        | "skills.read" | "skills.write"
        | "hooks.read" | "hooks.write"
        | "models.validate" | "models.write"
        | "mcp.validate" | "mcp.write";
      mode: "direct" | "assisted" | "unsupported" | "unverified";
      reasonCode: string;
      evidenceIds: string[];
    }>;
  }>;
};

get_agent_catalog() -> AgentCatalogResult

get_external_agent_status({ agentId }) -> {
  agentId: AgentCatalogId;
  detected: boolean | null;
  running: boolean | null;
  version: string | null;
  installSource:
    | "managed_installer" | "official_installer" | "system_package"
    | "user_installation" | null;
  capabilities: Array<{
    id: AgentCatalogResult["agents"][number]["capabilities"][number]["id"];
    state:
      | "available" | "assisted" | "unavailable" | "unverified"
      | "blocked_by_version" | "probe_failed";
    reasonCode: string;
  }>;
}

launch_external_agent({
  agentId,
  destination: "home" | "skills" | "hooks" | "models" | "mcp",
}) -> { agentId, destination, state, reasonCode }
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
  codexFeatures?: {
    imageExtension?: boolean;
    websockets?: boolean;
  };
};

apply_provider_quick_setup_with_result({ request, app })
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
    "CODEX_WEBSOCKET_NON_GPT_MODEL" | "CODEX_WEBSOCKET_PROXY_MAY_BE_UNSUPPORTED"
  >;
};
```

WorkBuddy signatures and revision/overwrite semantics remain authoritative in
[WorkBuddy Configuration](../backend/workbuddy-configuration.md). API keys are
mutation arguments only and never query keys or query data.

## 3. Contracts

### Catalog and local assets

- `get_agent_catalog` is deterministic, non-networking, non-secret, and ordered
  exactly: QoderWork CN, TRAE Work, WorkBuddy, Codex, Claude Code, OpenCode.
- The v3 link matrix is exact: QoderWork CN, TRAE Work, and WorkBuddy each own
  one `product` link; Claude Code owns `cli` then `desktop`; OpenCode owns
  `product` then `cli`; Codex owns an empty list and keeps its dedicated
  managed installer outside generic launch. Link IDs are unique per entry,
  labels are nonempty, and URLs are absolute HTTPS values owned by Rust.
- V1 `officialUrl`, catalog v2, future catalog versions, and unknown capability,
  mode, evidence, variant, or runtime values fail closed in the
  Tauri adapter. The renderer never guesses a legacy shape or carries a second
  URL table.
- The UI renders catalog capability mode/reason/evidence and the separate
  runtime capability state; it does not derive
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
- Both pages use the shared `CatalogMasterDetail` geometry, backed by the
  shared `SplitPanes` chassis: default rail
  `clamp(220px, 24vw, 268px)`, 14px separator gutter, 56px rows, 36px list
  frames, 64px detail frames, stable scrollbar gutter, the 760px
  master/detail stack (list becomes two columns; the separator is hidden),
  and the 520px list collapse to one column. Page CSS must not redefine
  catalog columns, brand-ID sizing, or another responsive rail.
  `CatalogMasterDetail` keeps the catalog brand list and the separator name
  `调整目录与详情的宽度`. Other product pages reuse `SplitPanes` without
  catalog rail/list/brand classes.
- Above 760px the two panes fill the remaining feature-page height and
  scroll independently. Split-pane children fill that pane (`height: 100%`,
  `overflow: auto`), matching the catalog rail. The detail panel is at least
  the pane height and
  grows with its content so its chrome does not clip overflowing cards.
  Both catalog pages share the feature-page inset: 20px page padding and
  the 16px header-to-pane gap from `.fy-feature-header`. `.fy-catalog-page`
  sets `gap: 0`. Page CSS must not add another `gap` or `padding-top` on
  `.fy-agents-page` / `.fy-models-page`.
  A keyboard-accessible vertical separator resizes the
  rail between 220px and min(420px, remaining width minus a 360px detail
  floor). Width is session-local component state and never enters the URL or
  storage. Double-click restores the default clamp.
- QoderWork/TRAE/WorkBuddy/OpenCode and Claude link actions call only
  `settings.openExternal(link.url)` from the catalog. Models selects an explicit
  `product` link when it needs product guidance; it never depends on array
  position. These actions do not inspect login state, download packages, read
  private config, persist notes, accept an API key, or emit configuration
  success.
- Official catalog links render in the Agent detail identity, top-right.
  Display copy for labels that already contain `官方` stays as catalog text;
  `cli`/`desktop` labels become `打开 {catalog label} 官网`. The renderer
  does not rewrite Rust labels or URLs.
- The Agent detail keeps one external-open lock and one pending link ID. A
  failure renders fixed text without echoing the URL. Codex renders no official
  link region and mounts the managed installer panel only while Codex is
  selected, immediately below the identity heading; leaving Codex releases its
  event subscription.
- WorkBuddy status and Provider summaries are lazy/bounded observations. A read
  failure is `unknown/unavailable`, never `not installed`, `not configured`, or
  verified absence.
- External runtime status preserves `null` as unknown. A launch control is
  positive only when the native runtime capability is explicitly `available`;
  the renderer never submits a path, URL, or executable.
- Qoder Hooks uses exact revisioned snapshots and an explicit preview. A
  backend overwrite token may be replayed once with the frozen request; a
  successful save states only that the file was saved and QoderWork must be
  restarted. Qoder/TRAE MCP preparation displays and copies only the backend's
  redacted template and never claims a server was started or vendor config was
  saved.
- Configuration actions navigate only with a known non-secret `target` query.

### Models target selection

- The exact selector order is QoderWork CN, TRAE Work, WorkBuddy, Codex, Claude
  Code, OpenCode. Missing, empty, or unknown `target` resolves to QoderWork CN.
- All six selectors use the same reviewed local Agent asset map. No selector
  image is loaded from a remote URL.
- Target state is component-local. API keys and form content never enter the
  hash, URL query, local/session storage, or cross-target state. The Models
  page stays mounted after its first visit: leaving for another primary route
  hides it (`hidden`/`inert`) instead of unmounting, so in-session form
  content including API keys remains until a write's terminal outcome or the
  persistent page actually unmounts. The other five primary routes keep the same
  in-session page. Target panels that have been opened stay
  mounted and hidden the same way. Process reload still starts empty.
- TRAE model setup requires explicit connection-test consent, calls native
  validation before the probe, echoes the backend UUID into the probe/cancel
  commands, accepts only closed terminal results, and clears the API key on
  success, rejection, error, timeout, and cancel. A reachable result proves
  only the FyAgent preflight; final save remains in TRAE Work. Switching
  Models targets or hiding the page for another primary route does not clear
  the in-session form; those values still never enter query cache, URL, or
  storage. Actual unmount of the persistent Models page still clears the key
  and cancels an in-flight probe.

### WorkBuddy

- Cache only sanitized status and model-ID DTOs. The API key lives in component
  memory and native discovery/save requests. A successful or failed fetch keeps
  the key so the user can review the draft and save without re-entering it.
  Save terminal outcomes still clear the key. Switching Models targets, hiding
  the page behind another primary route, and in-session keep-alive do not.
  Actual unmount of the persistent Models page still clears it. A visibility
  toggle may reveal the value in the input only; it never enters query cache,
  URL, storage, notices, or logs.
- Existing third-party model IDs are grouped by model family and start
  collapsed. Clicking a chip remove asks for confirmation that the model
  configuration will be deleted and cannot be recovered; confirming writes
  immediately via `removedModelIds` and does not wait for 「保存并应用」. The
  renderer may auto-replay one backend overwrite token after that UI
  confirmation so the user is not asked twice. Fetch and manual entry share one
  draft list: pull merges remote IDs, fill adds typed IDs, and save splits the
  draft back into selected versus manual IDs. Both the existing list and the
  draft list can be filtered by model ID. The panel does not display backup,
  configuration-file status, or the persisted-key-clear checkbox.
- Discovery, revision, overwrite capability, atomic persistence, concurrent
  modification, and authoritative reread follow the backend WorkBuddy
  contract. The UI freezes one exact overwrite request and replays it only with
  its opaque one-time token.
- A remote response or local document in which a model ID contains a complete credential
  fails closed before DTO/query/DOM construction. The frontend repeats the
  collision rejection before save as defense in depth.
- Saving is disabled while authoritative status/model IDs are unavailable.
  Reread copy says "confirmed" only after both queries succeed. The save
  control lives in the sticky detail heading with the panel title, not in a
  trailing section below the form. Unsaved draft IDs or connection input show
  a `待保存` badge.

### Claude Code and Codex

- Validate trimmed nonempty name/key/model, an absolute HTTP(S) Base URL with a
  host and no userinfo/query/fragment, reserved-ID collision, public-field
  credential collision, and credential-in-URL collision in both renderer and
  Rust. Errors are generic and never echo the field values.
- The V2 port is `applyQuickSetupWithResult(request, app)`. Codex may attach
  optional `codexFeatures.imageExtension` / `codexFeatures.websockets`; Claude
  must omit `codexFeatures`. OpenCode is not a `ProviderAppId` and must not
  call this port.
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
  success. The apply control lives in the sticky detail heading with the panel
  title, not at the end of the form.
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

| Condition                                                                                  | Required result                                                                                         |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Catalog version/order/ID/link/capability/evidence state drifts                             | Exact Rust/V2 contract test fails                                                                       |
| V1 `officialUrl`, catalog v2/future, unknown enum, duplicate ID, non-HTTPS URL, or Codex link arrives | Runtime parse fails; catalog is unavailable                                                  |
| Codex is selected                                                                          | Show the managed installer below the identity heading and no official-link button                       |
| A non-Codex entry is selected                                                              | Do not read or subscribe to the Codex installer                                                         |
| Native external open fails                                                                 | Show fixed controlled failure text; do not install or configure                                         |
| QoderWork/TRAE selected                                                                    | Only catalog-declared and native-port capabilities are available; vendor-private writes remain unavailable |
| Native observation fails                                                                   | Show controlled unavailable/unknown; never infer absence                                                |
| Runtime value is unknown                                                                   | Preserve `null`/`unverified`; never display "not installed"                                            |
| Qoder Hooks revision or overwrite request drifts                                           | Write nothing or require one exact token replay; never claim save                                       |
| TRAE preflight reaches any terminal result                                                 | Clear key/request state; report only FyAgent validation, never vendor save                               |
| External MCP result contains an original env/header value                                  | Reject the result and expose no copy action                                                             |
| Models target missing or unknown                                                           | Select QoderWork CN; issue no write                                                                     |
| OpenCode is the Models target                                                              | Render vendor-UI guidance only; do not call Provider quick setup or the Codex installer                 |
| Any selector lacks a local icon                                                            | Asset mapping/unit/browser gate fails                                                                   |
| WorkBuddy remote/local ID contains a complete API key                                      | Generic fail-closed error before DTO/cache/DOM/write                                                    |
| WorkBuddy revision or overwrite token drifts                                               | Write nothing; reread before claiming state                                                             |
| Provider Base URL has userinfo/query/fragment or a credential component                    | Reject before DB/current/live mutation                                                                  |
| Provider request is empty, generic, wrong-ID, or has public/secret collision               | Reject in Rust; no state mutation                                                                       |
| Concurrent Provider/live writer                                                            | Serialize or detect conflict; never return a split DB/current/live state                                |
| Required atomic step fails and compensation succeeds                                       | Return `APPLY_FAILED_ROLLED_BACK`; UI may say rollback confirmed                                        |
| Compensation is incomplete                                                                 | Return `ROLLBACK_PARTIAL_STATE_UNKNOWN`; stop writes and state that authority is unknown                |
| Mutation succeeds but sanitized reread fails/mismatches                                    | Show the atomic apply result as unconfirmed; never claim fixed-ID activation                            |
| Mutation succeeds and another serialized request replaces the reserved row                 | Keep this request's guard-time warnings; reread may confirm only fixed-ID activation, never exact bytes |
| Browser preview calls authoritative read/write                                             | Return native-only unavailable; never return production-looking fake state                              |
| API key appears in URL/storage/query/log/error/DOM/snapshot                                | Security regression test fails                                                                          |

## 5. Good / Base / Bad Cases

- Good: `/models` opens on QoderWork CN at the top, all six local icons render,
  and the page resolves the catalog's explicit `product` link when assisted
  guidance is requested.
- Good: OpenCode's Models panel only offers vendor-UI guidance plus catalog
  `product` open and navigation to Agents; it never submits Provider quick
  setup.
- Good: TRAE validation returns a canonical request ID, the renderer passes the
  same ID to one cancellable probe, clears the key in `finally`, and describes
  `reachable` as a local preflight rather than vendor configuration success.
- Good: Qoder Hooks saves a previewed revisioned request and reports the
  required restart without claiming the running process consumed it.
- Good: Claude Code renders independent CLI and Desktop official-site actions
  in the detail identity, while Codex renders no link and reuses the existing
  native installer contract through a V2 port, placed below the title.
- Good: a Codex quick setup passes one minimum request to Rust, applies under the
  shared config lock, returns request-attributed non-secret warnings/live-change
  state, clears the key, and describes a matching `currentId` reread only as
  fixed-ID activation confirmation.
- Base: browser preview renders the pages but authoritative panels report that
  desktop state is unavailable; test-only fixtures may exercise UI branches.
- Bad: hard-code a second capability matrix, treat `null` runtime as absence,
  pass an executable/path to launch, retain a key for retry, expose an MCP
  secret template, compose generic add/update/switch calls in React, or say
  "rolled back" after partial compensation.

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

- exact catalog v3 version/order/variant/capability/mode/reason/evidence/link
  ID/label/HTTPS matrix and v2/future/unknown/excess fail-closed cases,
  Claude CLI/Desktop order, OpenCode product/CLI order, Codex zero-link
  behavior, and command registration;
- six local assets, official Qoder/TRAE digests/passive formats, Qoder default,
  exact Models order, master/detail keyboard/ARIA, four maintained viewports;
- exact official-link IPC, renderer official-site display labels in the
  identity, per-link lock/error behavior, Codex negative-link behavior, and
  negative download/login/config behavior;
- independently scrolling catalog panes, a clamped keyboard/pointer separator,
  the 760px stack hiding that separator, and the shared catalog page inset
  (`gap: 0`, no extra Agents/Models page `gap` or `padding-top`);
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
- StrictMode replay, repeat-click locks, no API
  key in DOM/hash/localStorage/sessionStorage/query cache or logged fixtures.
  Models page keep-alive across primary-route switches and previously opened
  target panels; the other primary routes keep the same in-session page.
  Secrets stay in component memory only. Immediate WorkBuddy
  existing-model delete after an unrecoverable-delete confirmation.
- exact external status/launch, Qoder read/save/token, external MCP validation,
  and TRAE validate/probe/cancel IPC payloads and result parsers; terminal
  probe outcomes still clear the TRAE key.

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
await ports.providers.applyQuickSetupWithResult(
  {
    name,
    baseUrl,
    apiKey,
    modelId,
  },
  app,
);
const summary = await ports.providers.getSummary(app);
if (summary.currentId !== QUICK_SETUP_PROVIDER_IDS[app]) {
  showUnconfirmedState();
}
```

Wrong: read the first catalog URL or manufacture a Codex website action in the
renderer.

```ts
await ports.settings.openExternal(entry.officialLinks[0].url);
```

Correct: select the semantic product link only for targets that own one, and
let Codex use the managed installer port.

```ts
const productLink = entry.officialLinks.find((link) => link.id === "product");
if (productLink) await ports.settings.openExternal(productLink.url);
```

Wrong: stack a Models page flex gap on top of the shared feature header
margin, so the catalog columns sit lower than Agent directory.

```css
.fy-models-page {
  gap: 16px;
}
```

Correct: both catalog pages use only `.fy-feature-page` padding (20px) and
`.fy-feature-header` margin-bottom (16px). `.fy-catalog-page` keeps `gap: 0`.
