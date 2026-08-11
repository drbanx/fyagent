# WorkBuddy Configuration Contract

## 1. Scope / Trigger

Read this contract before changing WorkBuddy model discovery, URL admission,
credential handling, `models.json` persistence, overwrite/revision semantics,
or renderer navigation and query isolation. WorkBuddy is a top-level
configuration domain; it is not an `AppType`, Provider, MCP, Skill, Prompt,
Profile, Session, usage, environment, migration, or local-proxy domain.

## 2. Signatures

```text
get_workbuddy_status() -> WorkBuddyStatus
get_workbuddy_model_ids() -> WorkBuddyModelIdsResult

fetch_workbuddy_models({ baseUrl, apiKey, allowNoApiKey })
  -> { models: string[], truncated: boolean }

save_workbuddy_models({
  baseUrl,
  apiKey,
  allowNoApiKey,
  selectedModelIds,
  manualModelIds,
  clearExistingApiKeys,
  expectedRevision,
  overwriteToken?,
})
  -> { state: "saved", revision, modelCount, createdEntries, updatedEntries }
   | { state: "overwrite_confirmation_required", token, existingIds }
   | { state: "concurrent_modification" }
```

The dedicated commands accept no `AppType`, Provider ID, renderer-controlled
filesystem path, arbitrary request URL, or log/debug echo field. An overwrite
token is opaque, short-lived, one-time, and bound to the normalized but
otherwise exact save request plus the expected revision.

## 3. Contracts

### User-owned location and URL normalization

- Read and write only the current user's `~/.workbuddy/models.json`, or the
  established `FYAGENT_TEST_HOME` override in hermetic tests. The only backup is
  same-folder `models.json.backup`. Never probe `.codebuddy`, a project path, or
  the real profile from a test.
- Accept only absolute HTTP(S) base URLs with a host and no user information,
  query, or fragment. Strip only terminal `/models`, `/chat/completions`, or
  `/responses`. Append `/v1` only when no decoded path segment already equals
  `v1`. Request exactly `<normalized-base>/models`.
- The `/v1` segment is a live third-party API protocol contract, not an FyAgent
  application-version label. Do not rewrite or remove it during version or
  documentation migrations.

### Bounded model discovery

- Use a short-lived restricted client with a 15-second total deadline, manual
  maximum of three redirects, same-origin enforcement, no HTTPS downgrade, and
  a 2 MiB streamed response limit.
- A nonempty API key is sent only to the original or validated same-origin URL.
  When the user explicitly allows an empty key, omit Authorization entirely.
  Never copy credentials to a redirect outside the admitted origin.
- A valid response is an object containing `data: []`; every element has a
  nonempty string `id`. Preserve upstream order, case, and first occurrence.
- Return at most 1,000 unique IDs. Set `truncated: true` when a valid 1,001st
  unique ID exists, but continue validating the rest of the bounded response so
  truncation cannot conceal a malformed element.

### Revision, overwrite capability, and persistence

- A save takes the in-process write lock, rereads current bytes, checks the
  opaque expected revision, validates the complete existing array and every
  entry ID, detects duplicate target IDs, and only then considers a write.
- Existing target IDs without a valid matching confirmation capability return
  `overwrite_confirmation_required` with one opaque token and unique
  `existingIds`. This preflight creates neither backup nor primary write. The UI
  freezes the exact request and retries only that request with the token.
- The backend consumes the token before rereading, validates request and
  revision binding, rereads under the lock, and checks the revision again.
  Malformed, mismatched, expired, or reused tokens never authorize a write.
- The public revision is a process-local-key HMAC of the complete file bytes,
  not a bare digest. It detects an external API-key-only change without giving
  the renderer a public credential-guess oracle. The key is never persisted or
  serialized; after host restart, old revisions and tokens fail safely and the
  renderer refreshes status.
- Preserve non-target entries, array order, target positions, unknown fields,
  existing `onlyReasoning`, and unknown `reasoning` members. Update only the
  documented connection fields (`url` and policy-controlled `apiKey`); do not
  rebuild or normalize existing entries.
- Commit backup then primary using flush/sync and same-directory atomic
  replacement. Windows uses replacement semantics with no delete-before-rename
  gap. Unix primary and backup credential files remain mode `0600`.

### Credential and renderer isolation

- API keys exist only in component memory, the Tauri request, and the protected
  credential files. They never enter localStorage, sessionStorage, query cache,
  logs, telemetry, URLs, revisions, overwrite tokens, or error DTOs.
- `TopLevelAppId = AppId | "workbuddy"`; `AppId` remains the Provider-domain
  type. WorkBuddy follows Codex and precedes Gemini in the app switcher.
- Missing legacy `visibleApps.workbuddy` resolves to `true`. Entering WorkBuddy
  mounts only its status/configuration surface and performs no Provider,
  current-provider, MCP, Skills, profile, usage, environment/migration, or proxy
  query. The API key clears on unmount and is never refilled from disk.
- A truncated-fetch warning remains visible until a later successful,
  non-truncated fetch replaces it. Failed or stale requests do not silently
  convert the warning into a complete result.

## 4. Validation & Error Matrix

| Condition                                                                     | Required result                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| URL is non-HTTP(S), lacks a host, or contains credentials, query, or fragment | Return `WORKBUDDY_INVALID_URL`; send no request.                                                  |
| Redirect exceeds three hops, changes origin, or downgrades HTTPS              | Return `WORKBUDDY_FETCH_REDIRECT_REJECTED`; never forward the API key.                            |
| Fetch exceeds 15 seconds or 2 MiB, or `data[]` is malformed                   | Return the bounded fetch error and retain no model IDs from that response.                        |
| Empty API key is explicitly allowed                                           | Omit Authorization; do not synthesize an empty bearer value.                                      |
| Existing JSON is invalid, not an array, or contains an invalid entry          | Return a safe configuration error, with only an index when useful; do not repair or overwrite it. |
| Revision changes before save or confirmed overwrite                           | Return `concurrent_modification`; write neither backup nor primary.                               |
| Target IDs already exist without a matching overwrite token                   | Return one confirmation requirement; write neither backup nor primary.                            |
| Token is malformed, expired, mismatched, or reused                            | Consume/reject it, expose no credential or target contents, and write nothing.                    |
| A save updates an existing target                                             | Preserve entry position, unknown fields, and unrelated entries; update only documented fields.    |
| WorkBuddy view unmounts                                                       | Clear the in-memory API key and cancel/isolate its queries from other app domains.                |

## 5. Good / Base / Bad Cases

- Good: `https://gateway.example/api/v1` becomes
  `https://gateway.example/api/v1/models`; the key is sent only to that origin.
- Base: the user explicitly permits an empty key. Discovery sends no
  Authorization header and applies all other network bounds unchanged.
- Good: an external edit changes only an existing API key. The HMAC revision
  changes, the stale save returns `concurrent_modification`, and no public hash
  can be used to test key guesses.
- Bad: append a second `/v1`, follow a credential-bearing redirect, rebuild the
  complete JSON entry, delete the primary before rename on Windows, or store an
  API key in query state.

## 6. Tests Required

- URL fixtures cover terminal endpoint stripping, decoded `/v1` segments,
  spaces/Unicode, invalid schemes, user information, query/fragment rejection,
  same-origin redirects, origin drift, downgrade, hop count, deadline, and body
  limit.
- Response fixtures cover missing/non-array `data`, invalid elements, duplicate
  case-sensitive IDs, stable first occurrence, exactly 1,000/1,001 IDs,
  truncation plus a later malformed element, and empty-key header omission.
- Persistence tests cover empty/new files, invalid root/entries, target
  duplicates, request-bound one-time overwrite tokens, revision drift before
  both initial and confirmed saves, API-key-only external drift, process restart,
  stable ordering/unknown fields, backup ordering, atomic replacement, and Unix
  permissions.
- Security/static tests prove credentials cannot reach logs, URLs, caches,
  errors, revisions, or tokens. Renderer tests prove top-level navigation,
  default visibility, domain-query isolation, truncation state, frozen retry
  payload, and key clearing on unmount.

## 7. Wrong vs Correct

Wrong:

```text
normalized = trimTrailingSlash(baseUrl) + "/v1/models"
revision = sha256(modelsJson)
overwrite confirmed = boolean from renderer
```

Correct:

```text
parsed and admitted base + protocol-aware terminal normalization -> /models
revision = HMAC(process-local key, complete current bytes)
overwrite confirmed = one-time request-and-revision-bound backend capability
```
