# External Agent P0 Safety Contract

## 1. Scope / Trigger

Read this contract before changing the static Agent catalog, external-agent
runtime observation or launch, QoderWork/TRAE Work Skill targets, Qoder Hooks,
TRAE model endpoint preflight, external MCP validation, or their Tauri
permissions. These capabilities are deliberately narrower than Provider,
proxy, prompt, session, installer, and vendor-private configuration domains.

P0 proves only FyAgent-owned validation and controlled local file operations.
Vendor application detection, launch, Skill recognition, Qoder restart effects,
model compatibility, and vendor-side save remain separate HIL evidence and
must stay `unverified` when that evidence was not executed.

## 2. Signatures

The static catalog is deterministic, non-networking, and exact-versioned:

```text
get_agent_catalog() -> {
  contractVersion: 3,
  reviewedAt,
  agents: [{
    id, variantId, displayName, description,
    officialLinks: [{ id, label, url }],
    capabilities: [{ id, mode, reasonCode, evidenceIds }]
  }]
}
```

`id` is one of
`qoderwork | trae-work | workbuddy | codex | claude-code | opencode`,
in that catalog order. Every entry declares the same closed 11-capability
sequence:

```text
product.open app.detect app.launch skills.read skills.write
hooks.read hooks.write models.validate models.write mcp.validate mcp.write
```

Runtime and launch are separate commands and accept no renderer path, URL, or
executable:

```text
get_external_agent_status({ agentId })
  -> { agentId, detected, running, version, installSource, capabilities }

launch_external_agent({ agentId, destination })
  -> { agentId, destination, state, reasonCode }
```

`detected` and `running` are `boolean | null`. `destination` is exactly
`home | skills | hooks | models | mcp`.

Qoder Hooks and TRAE preflight commands are:

```text
get_qoderwork_hooks()
save_qoderwork_hooks({ request })

validate_traework_model_config({ request })
test_traework_model_endpoint({ requestId, request })
cancel_traework_model_endpoint({ requestId })
validate_external_mcp_config({ agentId, config })
```

The Skills domain uses the closed eight-value `SkillTargetId` union: the six
legacy AppType values plus `qoderwork` and `trae-work`. Only the original six
may convert to `AppType` or participate in direct MCP assignment.

## 3. Contracts

### Catalog, runtime, and permissions

- Catalog v2, future versions, unknown enums, excess fields, duplicate IDs,
  invalid order, and invalid official links fail closed in Rust and TypeScript.
- Static capability declarations never read local state. Runtime observation
  never converts unknown to false or infers installation from a settings path.
- Launch is positive only through a trusted executable/bundle/signing adapter.
  Without one it returns a controlled `unverified` or `unavailable` result.
- Tauri permissions keep observe, launch, Qoder write, and endpoint probe as
  separate sets. Because defining the first application ACL manifest makes
  Tauri enforce ACL for every application command, the local `main` capability
  also carries an explicit compatibility set covering the complete pre-ACL
  handler surface. The compatibility and feature-specific sets are disjoint,
  their union must equal the registered handler commands, no remote origin is
  granted, and no generic filesystem/shell permission is introduced.

### Skills and persistence

- Database schema 17 adds default-false `enabled_qoderwork` and
  `enabled_trae_work` columns. Migration preserves every legacy row and its six
  existing flags; DAO reads and writes all eight flags.
- QoderWork and TRAE Work targets are derived only from trusted home as
  `.qoderwork/skills` and `.trae-cn/skills`. Both are copy-only.
- Target adapters reuse the existing SkillService archive, conflict, hash,
  copy, path-validation, and authoritative-reread behavior. They do not enter
  Provider, proxy, prompt, session, or direct MCP configuration.

### Qoder Hooks document

- The only document is trusted-home `.qoderwork/settings.json`, bounded to
  2 MiB. IPC exposes only revision, existence, supported groups,
  `restartRequired: true`, and projection support.
- Structured writes support the closed event set, validate bounds without
  executing commands, preserve unknown top-level JSON, and replace only
  `hooks`. An unsupported hooks shape blocks the write.
- Save holds a per-document lock, compares the expected HMAC revision, and
  requires a bounded, expiring, request-digest-bound, one-use overwrite token
  when reviewed content has drifted. It writes backup first, uses a
  same-directory temporary file, flushes/syncs, atomically replaces, and
  authoritatively rereads.
- Windows operations pin and revalidate directory handles and reject
  reparse/hard-link/identity races. Errors never claim rollback or success when
  final authority is unknown.

### TRAE model endpoint preflight

- Validation accepts only the closed API format and URL-mode enums and returns
  a backend-generated canonical UUID v4. The same ID must be echoed into one
  endpoint request; at most 16 probes may be active and every terminal path
  removes its cancellation handle.
- API keys use a non-serializable redacted type and exist only for the current
  request. Public request fields may not equal the full credential.
- Default transport is HTTPS, zero redirect, 3-second connect timeout,
  10-second overall deadline, 1 MiB response-body cap, and no decompression.
- Resolve and classify all A/AAAA results before connecting, reject blocked or
  mixed classes, and pin the approved socket while retaining original
  Host/SNI. Explicit/system proxy modes fail with
  `PROXY_DNS_PIN_UNSUPPORTED` until that invariant can be proven; never fall
  back to direct.
- Results contain only the closed terminal state, reason code, duration bucket,
  status class, and request ID. They never include URL, model, key, response
  body, headers, or transport diagnostics.

### External MCP validation

- Input is exactly `{ mcpServers: object }`; each entry is exactly stdio
  `{ command, args?, env? }` or HTTP `{ url, headers? }`.
- Reject unknown/mixed transport fields, prototype-pollution keys, control
  characters, unsafe URLs/addresses, and every configured size/count limit.
- Stdio checks path/executable availability without invoking a process, shell,
  installer, or server. HTTP performs URL and literal-address validation only;
  it performs no DNS or network operation.
- Findings expose only server ID, transport, closed reason codes,
  `boolean | null` executable availability, and `hasSecrets`. Templates replace
  all env/header values with `<redacted>` before IPC or clipboard use.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Catalog version/order/enum/link drifts | Reject the whole catalog; do not render a legacy fallback |
| Runtime detection is unavailable | Return `null`/`unverified`; never report not installed |
| Launch lacks trusted runtime identity | Return controlled unverified/unavailable; start nothing |
| Schema 16 data migrates | Preserve all old rows/flags and default both new flags to false |
| Skill destination is linked, escaped, raced, or hash-drifted | Fail closed; do not claim sync |
| Qoder JSON/hooks projection is unsafe | Return controlled unsupported/invalid result; write nothing |
| Qoder revision drifts | Require one-use overwrite confirmation or return concurrent modification |
| TRAE URL/DNS/proxy cannot preserve policy | Return a closed rejection code before an unsafe connection |
| TRAE request is cancelled/times out/fails | Remove active state and return only a sanitized terminal result |
| MCP server mixes transports or exceeds limits | Reject; execute and persist nothing |
| A secret reaches DTO, error, log, DOM, query, storage, URL, snapshot, or default clipboard | Security regression gate fails |

## 5. Good / Base / Bad Cases

- **Good:** a Qoder hooks save preserves unrelated top-level keys, verifies the
  expected revision under lock, writes a backup and atomic replacement, rereads
  the file, and tells the renderer that restart is still required.
- **Good:** a TRAE probe validates a canonical request ID, approves and pins all
  resolved addresses, observes cancellation/deadline/body limits, then returns
  only `reachable` plus non-sensitive buckets.
- **Base:** an external Agent has no trusted runtime identity. Catalog guidance
  and official links remain available, while detection and launch stay
  `unverified`.
- **Bad:** infer installation from `.qoderwork`, accept a renderer executable,
  route Qoder/TRAE through `AppType`, fall back around a proxy pin failure,
  execute an MCP command, or serialize a credential-bearing error.

## 6. Tests Required

Run the full host and renderer gates:

```powershell
mise run rust:fmt:check
mise run rust:clippy
mise run rust:test
mise run typecheck:v2
mise run lint:v2
mise run test:v2
mise run test:v2:browser
mise run build:renderer
mise run format:check
git diff --check
```

Focused Rust coverage must include catalog fail-closed parsing, status/launch
unknown semantics, schema 16-to-17 preservation, eight-target round trips,
Skill path/TOCTOU/hash handling, Qoder projection/revision/token/backup/atomic
behavior, TRAE URL/DNS/pin/proxy/deadline/body/cancel cleanup, and MCP
union/no-execute/redaction. Renderer tests must assert exact command/payload
wires, eight Skills versus six MCP targets, secret cleanup on every terminal or
lifecycle path, catalog geometry at the maintained viewports and 760/761px,
keyboard/focus behavior, and browser non-authority.

The host permission test must derive the registered `generate_handler!`
commands and require exact equality with the disjoint union of all active app
permission manifests. Checking only the newly added commands is insufficient:
a partial app ACL silently revokes every unrelated application command.

Automated fixtures prove only their executed layer. They never upgrade real
vendor detection, launch, configuration acceptance, restart effectiveness, or
Skill loading to verified.

## 7. Wrong vs Correct

Wrong: let the renderer choose process/filesystem/network authority.

```ts
await invoke("launch_external_agent", { path: form.executable });
await invoke("save_qoderwork_hooks", { path: form.settingsPath, rawJson });
await fetch(form.url, { headers: { Authorization: `Bearer ${apiKey}` } });
```

Correct: send only closed IDs and bounded request DTOs to the narrow native
commands, then accept sanitized terminal results.

```ts
await invoke("launch_external_agent", {
  agentId: "qoderwork",
  destination: "hooks",
});
const validated = await invoke("validate_traework_model_config", { request });
await invoke("test_traework_model_endpoint", {
  requestId: validated.requestId,
  request,
});
```

Wrong: retain secrets or manufacture positive vendor evidence.

```ts
queryClient.setQueryData(["trae", request], result);
localStorage.setItem("trae-key", apiKey);
setStatus("TRAE configuration saved");
```

Correct: keep credentials in the component/current invoke, clear them on every
terminal/lifecycle path, and describe success only as FyAgent preflight.

```ts
try {
  await ports.trae.testEndpoint(requestId, request);
} finally {
  clearSensitiveDraft();
}
```
