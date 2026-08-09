# Codex Provider Configuration Contract

## 1. Scope / Trigger

Read this contract before changing Codex Provider TOML analysis or mutation,
native capability controls, vendor-specific model projection, session-resume
command construction, provider warnings, or the `liveConfigChanged` result.
It owns the Codex provider configuration domain only. Trusted Codex Desktop
discovery, installation, process restart, and launch are owned by
[Codex Desktop Installer](./codex-desktop-installer.md); application version and
release metadata are owned by their dedicated contracts.

## 2. Signatures

```text
add_provider_with_result(provider, app, addToLive?)
update_provider_with_result(provider, app, originalId?)
delete_provider_with_result(id, app)
switch_provider_with_result(id, app)
import_default_config_with_result(app)
  -> { value, liveConfigChanged, app, warningCodes? }

analyze_codex_provider_features(app: "codex", provider, isNew?)
  -> CodexProviderFeatureState

patch_codex_provider_features(app: "codex", provider, intent, isNew?)
  -> {
       tomlText,
       state,
       imageExtensionConfigured?,
       codexNativeCapabilitiesGeneratedProvider?
     }
```

Feature commands reject every `app` other than Codex. No provider command may
accept or return a filesystem path, process identifier, launch command,
credential-bearing diagnostic, or generic application-version field.

Successful Codex add/update mutations may return these stable warning codes:

```text
CODEX_WEBSOCKET_NON_GPT_MODEL
CODEX_WEBSOCKET_PROXY_MAY_BE_UNSUPPORTED
```

## 3. Contracts

### Lossless TOML and native capabilities

- Every Codex Provider exposes image-extension and WebSocket controls in the
  existing, initially collapsed advanced region. Provider ID, `base_url`,
  credentials, official/managed classification, OAuth type, proxy takeover,
  `wire_api`, and `meta.apiFormat` do not make a valid TOML draft ineligible.
- A fixed official Provider is identified only by `category == "official"` or
  ID `codex-official`. Names, URLs, and `requires_openai_auth` are not
  classifiers.
- Analysis and patching use `toml_edit` and preserve comments, blank lines,
  table and field order, unrelated fields, and unrelated headers. An invalid
  complete TOML document keeps both controls visible but disabled and blocks
  capability writes; it is never reconstructed from parsed form state.
- An invalid `http_headers` or `supports_websockets` field is a non-blocking,
  non-sensitive diagnostic. Ordinary saves preserve the invalid field. Only an
  explicit operation on the corresponding control may repair it.
- The image capability owns only the case-insensitive
  `x-openai-actor-authorization` header whose value is exactly
  `local-image-extension`. Enabling removes every case variant and writes one
  canonical key. Disabling removes every variant and then removes an empty
  header table. Other valid header entries survive.
- If `http_headers` is not a string map, explicit image enable replaces that
  field with the managed map and explicit disable deletes it. No unrelated save
  performs this repair.
- WebSocket configuration is format-agnostic. Enabling always writes boolean
  `supports_websockets = true`; disabling removes the field rather than writing
  `false`. Responses, Chat, Anthropic, managed OAuth, official, and proxy
  Providers remain saveable with the field present.

### Migration metadata and official-provider ownership

- `ProviderMeta.imageExtensionConfigured` is migration-only private metadata.
  For a non-official Provider, missing metadata plus no managed/conflicting
  header is a legacy pending-on draft; no bulk migration writes live TOML.
  The first successful new-provider save or explicit historical choice marks
  the row configured. Displayed state still derives from TOML.
- A fixed official Provider defaults both native capabilities off. Merely
  opening or saving it creates no Provider table.
- The first actual enable creates `model_provider = "custom"` and a minimal
  table with `name = "OpenAI"`, `requires_openai_auth = true`, and
  `wire_api = "responses"` when no suitable table exists.
- `ProviderMeta.codexNativeCapabilitiesGeneratedProvider` claims ownership only
  when the capability operation created that table. A pre-existing inactive
  `custom` table may be reused but is never claimed.
- When both controls are off, an owned table is removed only if it still has
  the exact managed shape and no user fields. Otherwise only capability-owned
  fields are removed. An explicit Provider table takes precedence over unified
  Codex session-history injection.

### Vendor projection and safe session resume

- A native Responses Provider receives a vendor model catalog only when the
  active `base_url` parses as HTTPS to a reviewed hostname. The DeepSeek rule
  permits exactly `deepseek.com` and its dot-delimited subdomains.
- Scheme, hostname, and authority are parsed structurally. Substrings, paths,
  or user information such as `deepseek.com.evil.example`,
  `notdeepseek.com`, or `deepseek.com@evil.example` retain the neutral native
  template and receive no vendor harness instructions.
- Session resume crosses a shell-command boundary. Every persisted session ID
  passes the shared fail-closed validator before command construction. It must
  be nonempty ASCII; its first character is alphanumeric or `_`, and every
  remaining character is alphanumeric, `_`, `-`, or `.`.
- An unsafe ID remains visible in session history but has no `resumeCommand`.
  Do not quote or escape it into a shell string. A wider future grammar requires
  typed argv plus platform-specific launch/copy handling.

### Warnings, proxy projection, and live mutation evidence

- Warning codes are computed from the final saved Provider only when
  WebSocket is `true`. Inspect nonempty top-level `model`, `review_model`, and
  `modelCatalog.models[].model`; use the segment after the final `/` and accept
  an ASCII case-insensitive `gpt-` prefix. Any recognizable non-GPT model emits
  the model warning; no recognizable models do not.
- Active Codex proxy takeover adds the proxy warning. Warnings are omitted for
  switches, failed saves, and empty-risk results. They communicate configuration
  risk, not a transport failure or a claim that the local HTTP/SSE proxy
  supports WebSocket Upgrade.
- Normal and official proxy projections preserve explicit WebSocket state and
  the managed image header while continuing to rewrite routing `base_url` and
  `wire_api` under the proxy contract.
- `liveConfigChanged` is `true` only when a successful operation changes the
  final bytes of the current interactive user's `~/.codex/config.toml`.
  It contains no bytes, digest, path, or credential. Non-Codex mutations return
  `false`. The renderer may use the flag to offer the trusted restart flow from
  [Codex Desktop Installer](./codex-desktop-installer.md), but saving and
  restarting remain separate outcomes.

## 4. Validation & Error Matrix

| Condition                                                                                            | Required result                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| A non-Codex app calls a native-feature command                                                       | Reject before TOML analysis or mutation.                                                                                |
| The complete Codex TOML document is invalid                                                          | Keep controls visible but disabled; never reconstruct or overwrite the document.                                        |
| A managed header or WebSocket field has an invalid shape                                             | Preserve it on unrelated saves; show a non-sensitive diagnostic; repair only on an explicit matching control operation. |
| Chat, Anthropic, official, managed, or proxied Provider saves with WebSocket enabled                 | Save successfully and preserve the explicit choice; add applicable warning codes without rewriting it.                  |
| An official Provider has empty TOML and both capabilities remain off                                 | Preserve empty TOML and create no table or ownership metadata.                                                          |
| A persisted session ID fails the conservative ASCII grammar                                          | Omit `resumeCommand`; never interpolate the raw ID into a shell command.                                                |
| A DeepSeek-looking URL has HTTP, user information, a suffix-confusion hostname, or only a path match | Use the neutral template; grant no vendor behavior.                                                                     |
| A mutation succeeds but final live Codex bytes do not change                                         | Return `liveConfigChanged: false`; do not offer an automatic restart.                                                   |
| A mutation fails                                                                                     | Preserve prior live bytes and omit risk/restart success signals.                                                        |

## 5. Good / Base / Bad Cases

- Good: explicit image enable normalizes only the managed header while
  preserving comments, custom headers, table order, and unrelated Provider
  fields.
- Base: a valid Provider contains no recognizable models. WebSocket remains
  enabled, the save succeeds, and no non-GPT warning is invented.
- Good: `https://api.deepseek.com/v1` matches the reviewed hostname rule;
  `https://deepseek.com.evil.example/v1` does not.
- Bad: derive official-provider identity from display name, rewrite invalid TOML
  from form state, use proxy preservation as proof of WebSocket transport, or
  quote an unsafe persisted session ID into a command string.

## 6. Tests Required

- Rust/TOML fixtures cover lossless unrelated edits, complete-document failure,
  invalid field shapes, case-variant header normalization, empty-table cleanup,
  WebSocket enable/remove, and official minimal-table ownership/cleanup.
- Migration fixtures cover pending legacy rows, explicit choices, newly created
  Providers, reused unowned tables, and exact owned-shape retirement.
- Hostname fixtures cover the approved HTTPS host and subdomains plus scheme,
  user-info, substring, suffix, and path-confusion rejections.
- Session fixtures cover ordinary UUID/provider-prefixed IDs and every rejected
  empty, leading-hyphen, non-ASCII, whitespace, quote, separator, and control
  character class.
- Result tests cover byte-exact `liveConfigChanged`, non-Codex false results,
  warning ordering/deduplication, GPT/non-GPT catalogs, proxy warnings, switches,
  and failed saves. Renderer tests prove only successful changed Codex saves can
  offer the separate trusted restart flow.

## 7. Wrong vs Correct

Wrong:

```text
provider URL contains "deepseek.com" -> enable vendor behavior
session resume = "codex resume '" + persistedId + "'"
save succeeded -> liveConfigChanged = true
```

Correct:

```text
parsed HTTPS hostname matches reviewed host rule -> vendor behavior
persisted ID passes conservative ASCII grammar -> construct established command
successful final live bytes differ -> liveConfigChanged = true
```
