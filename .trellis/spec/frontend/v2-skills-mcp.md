# V2 Skills and MCP Feature Contract

## 1. Scope / Trigger

Read this contract before changing the V2 Skills or MCP pages, their shared
feature types, query state, controls, platform adapters, or feature tests. It
defines the renderer boundary over the native Skills/MCP commands. Native
target, persistence, and security rules are authoritative in
[External Agent P0 Safety](../backend/external-agent-p0.md); this page does not
authorize widening the outer V2 shell or unrelated feature domains.

Production V2 feature code is limited to these boundaries:

```text
pages/skills, pages/mcp -> shared/features, shared/ui
shared/features        -> shared/platform feature ports
shared/platform/tauri  -> @tauri-apps/api/core.invoke
```

Legacy renderer modules are not a compatibility layer for V2. Do not import
from `src/components`, `src/hooks`, `src/lib`, or `src/i18n`.

## 2. Signatures

Skills and direct MCP assignment intentionally use different closed identities.
User interfaces must not merge these collections or add Claude Desktop or
OpenClaw to either list.

```ts
type McpTargetId =
  | "claude"
  | "codex"
  | "gemini"
  | "grokbuild"
  | "opencode"
  | "hermes";

type SkillTargetId = McpTargetId | "qoderwork" | "trae-work";

const MCP_TARGETS: ReadonlyArray<{ id: McpTargetId; label: string }>;
const SKILL_TARGETS: ReadonlyArray<{ id: SkillTargetId; label: string }>;

const supportedAppIconById: Record<McpTargetId, string>;
const skillTargetIconById: Record<SkillTargetId, string>;

function getSupportedAppIcon(id: McpTargetId): string;
function getSkillTargetIcon(id: SkillTargetId): string;

interface SkillsPort {
  getInstalled(): Promise<InstalledSkill[]>;
  getBackups(): Promise<SkillBackupEntry[]>;
  deleteBackup(backupId: string): Promise<boolean>;
  install(
    skill: DiscoverableSkill,
    currentApp: SkillTargetId,
  ): Promise<InstalledSkill>;
  uninstall(id: string): Promise<{ backupPath?: string }>;
  restoreBackup(
    backupId: string,
    currentApp: SkillTargetId,
  ): Promise<InstalledSkill>;
  toggleApp(
    id: string,
    app: SkillTargetId,
    enabled: boolean,
  ): Promise<boolean>;
  scanUnmanaged(): Promise<UnmanagedSkill[]>;
  importFromApps(imports: ImportSkillSelection[]): Promise<InstalledSkill[]>;
  discover(): Promise<DiscoverableSkill[]>;
  checkUpdates(): Promise<SkillUpdateInfo[]>;
  update(id: string): Promise<InstalledSkill>;
  migrateStorage(target: "fyagent" | "unified"): Promise<SkillMigrationResult>;
  searchSkillsSh(
    query: string,
    limit: number,
    offset: number,
  ): Promise<SkillsShSearchResult>;
  getRepos(): Promise<SkillRepo[]>;
  addRepo(repo: SkillRepo): Promise<boolean>;
  removeRepo(owner: string, name: string): Promise<boolean>;
  pickZip(): Promise<string | null>;
  installFromZip(
    filePath: string,
    currentApp: SkillTargetId,
  ): Promise<InstalledSkill[]>;
}

interface McpPort {
  getAll(): Promise<Record<string, McpServer>>;
  upsert(server: McpServer): Promise<void>;
  delete(id: string): Promise<boolean>;
  toggleApp(
    serverId: string,
    app: McpTargetId,
    enabled: boolean,
  ): Promise<void>;
  importFromApps(): Promise<number>;
}

interface SettingsPort {
  get(): Promise<FeatureSettings>;
  save(settings: FeatureSettings): Promise<boolean>;
  openExternal(url: string): Promise<void>;
}

function useOpenExternal(): {
  openExternal: (
    url: string,
    options?: { errorTitle?: string },
  ): Promise<void>;
  openingUrl: string | null;
};

function ExternalLinkButton(props: {
  url?: string;
  children: ReactNode;
  errorTitle?: string;
  busyLabel?: string;
}): JSX.Element;
```

## 3. Contracts

### Platform and command boundary

- Only `src/v2/shared/platform/tauri/**` imports `@tauri-apps/**`.
- The Tauri adapter maps the port methods to the existing snake-case command
  names and camel-case payload keys. It must not call deprecated per-app APIs.
- Skill ports accept all eight `SkillTargetId` values. MCP CRUD/import/direct
  assignment accepts only the original six `McpTargetId` values; QoderWork and
  TRAE Work external MCP preparation uses the separate sanitized validator and
  never enters direct assignment.
- Browser reads return empty authority snapshots. Browser writes reject with a
  clear native-only error and never report success.
- MCP presets have one source under `shared/features`: Windows uses
  `cmd /c npx`, and every other native platform uses direct `npx`. Time and
  Fetch use `uvx`. The legacy renderer adapter only re-exports this source.
- Feature tests inject ports or a page-load Tauri IPC fixture. Production code
  must not contain test routes, fixture switches, or synthetic data.

### State and writes

- A FeatureProvider owns one stable QueryClient and a session-only install
  target. The default target is Claude; navigation preserves it, while a full
  application restart resets it.
- Skill assignment authority contains eight booleans. Missing persisted
  `qoderwork` or `trae-work` values parse as false; the existing six values are
  preserved. QoderWork/TRAE Work sync is copy-only and its successful UI copy
  claims directory synchronization, not vendor recognition or loading.
- Server data is authoritative. Successful writes and partial failures both
  invalidate and reread the affected resources before the UI settles.
- Disabling or deleting an MCP assignment removes it from that application's
  live configuration before clearing the authoritative flag. Multi-application
  cleanup commits each successful removal so a later failure remains exactly
  retryable without a false disabled claim.
- Cross-application MCP imports merge assignments only when normalized server
  specifications are equivalent. A conflicting shared ID is preflighted before
  any server from that source application is persisted.
- OpenCode and Hermes imports preserve explicit source disablement: disabled
  commands clear an existing assignment and never create a new managed row.
- One write lock disables only conflicting writes. Reads, search, selection,
  and details remain available. Batch writes run sequentially and report
  progress and a final success/failure summary.
- Skill storage migration calls only `migrate_skill_storage`. Sync-method
  saves first read the complete settings object and merge the changed field.

### MCP configuration and secrets

- List search uses explicit public-field allow-lists. It never recursively
  stringifies an MCP server, never indexes `env` or `headers`, never indexes
  URL query values, and never indexes argument values that follow sensitive
  flags such as `-s` or `--token`.
- Ordinary details show only secret-field item counts for `env` and `headers`.
  Those values may appear only in the explicit editor or a catalog install
  dialog. Ordinary details must redact sensitive URL query values and
  sensitive command arguments.
- Installed Skills and MCP use the same three-column workspace: list, detail,
  and assignment, laid out with the shared `SplitPanes` chassis (14px
  gutter, pointer/keyboard resize, independent pane scroll). Each column
  scrolls independently; the content viewport must
  not grow with the left-hand list. Split-pane children fill the pane height
  (`min-height: 100%` and `height: 100%`) and scroll inside the pane
  (`overflow: auto`), matching catalog rails. Do not leave `height: 100%`
  on a feature panel without overflow, or assignment rows and cards paint
  past the panel chrome. Assignment rows wrap (`flex-wrap: wrap`,
  `min-width: 0`) so “全开 / 全关” stay inside the pane.   The Discover tab
  stays a card grid and must not use this master-detail chassis.   Discovery
  chrome puts search first, then source/status `SelectionLens` tracks;
  do not use a `<select>`. The install-target track lives in the page
  header with decorative app icons so it does not push the card grid
  down. Repository chips appear only when more
  than one repository is loaded. Result copy names the current install
  target.   Skill Discover cards show the name and
  install state in the header, a clamped description or directory/source
  note, then a text meta line of repository and optional install count. Group
  headings appear only when a repository has two or more skills; those
  cards omit the repeated repository. Cards open a document URL as
  “说明”, otherwise the GitHub repository as “仓库”, through
  `ExternalLinkButton`. Do not group cards by wrapping a second
  card around `DiscoveryCard`. Skill uninstall and MCP edit/delete stay
  in the detail header above source, assignment, and install cards so they
  remain reachable without scrolling the middle pane. MCP details must show
  install provenance and current assignment chips, matching Skills.
- Installed Skill details show the resolved SSOT install path, not only the
  directory name. The path stays on one truncated line with a copy action and
  is computed at list time, not persisted. MCP details show a local install
  directory when `cwd` or an absolute stdio command path is available; npx,
  uvx, and remote transports show that no local directory exists.
- MCP has permanent Installed and Discover tabs. Discover is a static curated
  catalog of about 20–30 installable items: each card is either one-click or a
  credential/config form. Discover classification is only “直接安装” versus
  “配置安装”, plus an “全部” default. Prefer popular no-credential stdio/HTTP
  recipes for the remaining slots. It does not add a market API, persist catalog
  metadata, or widen the six-target assignment set. Entries that need OAuth,
  post-start login, SSE-only transport, or unverified high-privilege cloud
  control stay out of the catalog. New remote recipes use Streamable HTTP
  only.
- Discover card “文档” / “主页” and installed-detail homepage/docs, plus
  installed Skill “打开仓库” / “查看说明”, render `ExternalLinkButton`.
  That control is the only HTTP(S) jump: it calls `useOpenExternal`, which
  owns one FeatureProvider lock and `settings.openExternal`. Discover shows
  docs when present, otherwise homepage, never both. Do not add
  `.fy-mcp-card-link`, `<a href>`, `window.open`, or a page-local
  `openExternal` wrapper. Failures toast and never echo the URL.
- Quick and advanced modes share one canonical `McpServerSpec`. Quick edits
  replace known fields while preserving unknown extension fields, unknown
  top-level fields, and hidden application flags.
- Advanced JSON accepts one non-array object and rejects an `mcpServers`
  container. Invalid JSON cannot be saved or replaced by a mode switch.
- User-facing errors and logs must not interpolate MCP configuration objects,
  environment variables, headers, tokens, or secret-bearing URLs.

### Presentation boundary

- User-visible CSS is namespaced under `.fy-feature-*` or `.fy-control-*`.
  Skills and MCP own only the page wrappers `.fy-skills-page` and
  `.fy-mcp-page`; do not invent a parallel `.fy-skills-*` / `.fy-mcp-*` theme.
  Consume only `--fy-*` tokens.
- The shared assignment panel resolves all eight Skill targets through
  `skillTargetIconById` / `getSkillTargetIcon`. MCP passes its six-target
  collection explicitly and still goes through that map. `supportedAppIconById`
  / `getSupportedAppIcon` cover only the six MCP identities. Runtime code must
  not import a legacy asset path or a remote URL. A reviewed byte-for-byte
  local asset copy is acceptable when V2 owns the resulting path and the asset
  inventory is updated.
- Assignment icons are decorative beside the existing text:
  `alt=""` and `aria-hidden="true"`. The switch keeps the sole accessible name
  `${app.label} ${labelSuffix}`; an icon must not create a duplicate label.
- At most one assignment panel exists in the DOM and
  accessibility tree. Responsive layout changes whether it is the third
  column or a details section; CSS must not hide a duplicate semantic panel.
- Changes must not alter the TopBar, brand, primary navigation, window chrome
  ownership, ContentViewport shell, route order, existing shell-owned Blue
  Ambient token values or appearance, or the Agents, Models, Prompts, and
  Memory page contents.
- Feature controls may add the minimum required semantic tokens under the
  `--fy-*` namespace without changing the shell-owned appearance.

## 4. Validation & Error Matrix

| Condition                                                        | Required result                                                         |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Browser performs a feature read                                  | Return an empty collection or settings snapshot without a side effect   |
| Browser performs a feature write                                 | Reject with the native-only error; never show a success toast           |
| Initial authority read fails                                     | Show an error/retry state, not an empty-state success                   |
| Refresh fails after old data exists                              | Keep old data and show an inline error                                  |
| Batch write partially fails                                      | Report counts, keep no stale optimistic claim, and reread authority     |
| MCP search term matches only an env/header value                 | Return no match                                                         |
| MCP search term matches only a URL query secret or sensitive arg | Return no match                                                         |
| env/header line has no delimiter or an empty key                 | Show a line error and block save                                        |
| Advanced JSON is invalid, an array, or an `mcpServers` container | Stay in advanced mode and block save                                    |
| New MCP ID is blank or duplicates an authoritative ID            | Block save before invoking Tauri                                        |
| A backend error may contain MCP configuration                    | Show a fixed secret-safe message                                        |
| Imported shared ID has a different executable specification      | Reject that application's import without partial persistence            |
| OpenCode/Hermes source entry has `enabled: false`                | Keep it disabled; do not create or activate a managed assignment        |
| MCP live cleanup fails while disabling or deleting               | Retain the failed assignment and retryable authoritative record         |
| A Skill response omits either new external target                | Default that target to false without changing any legacy assignment     |
| QoderWork or TRAE Work is submitted to direct MCP assignment     | Type/runtime adapter rejects before invoke                              |
| A supported app is missing from the local icon map               | Type/asset test fails; never render a remote fallback or broken image   |
| An assignment icon contributes an accessible name                | Component accessibility test fails; switch text remains the sole name   |
| Viewport changes between two- and three-column layouts           | Render exactly one panel: eight unique Skill or six unique MCP switches |
| Discover/docs or Skill repo is opened without ExternalLinkButton | Component test fails; the click must hit `settings.openExternal`        |
| A second HTTP(S) jump starts while one is in flight              | Ignored; only the in-flight control shows pending copy                  |

## 5. Good / Base / Bad Cases

- **Good:** A user toggles Codex for one Skill. The UI invokes
  `toggle_skill_app` with `{ id, app: "codex", enabled }`, locks only
  conflicting writes, then rereads installed Skills before settling. The row
  shows the V2-owned Codex icon decoratively without changing the switch name.
- **Good:** An old installed-Skill row has only the six legacy flags. The
  adapter preserves those values, supplies false for both new targets, and a
  later QoderWork sync uses only the trusted fixed copy destination.
- **Base:** A browser preview has no fixture. Both pages show their native-safe
  empty states; attempts to mutate reject instead of simulating persistence.
- **Bad:** MCP search uses `JSON.stringify(server)`, a QoderWork ID is passed to
  direct MCP assignment, a toast prints an invoke
  error containing headers, quick mode reconstructs the whole server object,
  or both responsive assignment panels remain mounted. Each violates a
  security, compatibility, or accessibility contract.

## 6. Tests Required

Run the V2 gates from the repository task API:

```powershell
mise run lint:v2
mise run typecheck:v2
mise run test:v2
mise run test:v2:browser
mise run build:renderer
mise run format:check
git diff --check
```

- Adapter tests assert every command name, exact camel-case payload, return,
  and error propagation across Skills, MCP, Settings, and external links,
  including eight-value Skill and six-value MCP separation.
- Pure tests cover public-field search, secret exclusion, URL/args redaction,
  selection convergence, repository parsing, installed-key matching,
  pagination, env/header/args parsing, advanced JSON validation, extension
  retention, and each MCP catalog builder.
- Component tests cover empty, loading, error, pending, write/refetch, dialogs,
  assignment, destructive confirmation, secret-safe presentation, an exhaustive
  eight-ID icon map, eight decodable local assets, decorative icon semantics,
  eight unique Skill switches, six unique MCP switches, Discover/docs and
  Skill repo clicks through `ExternalLinkButton` → `settings.openExternal`,
  and one shared in-flight lock.
- Browser tests cover `900x600`, `1152x640`, `1232x700`, and `1440x900`, with
  populated two-/three-column layouts, a single correctly-sized assignment
  panel, visible split separators above 760px, assignment rows contained
  inside their pane, no overflow, no secret rendering, exact invoke payloads, and
  authoritative refetch.
- Browser tests do not replace native Windows Tauri/WebView2 acceptance,
  actual filesystem/config writes, or 125%/150% display-scale review.

## 7. Wrong vs Correct

Wrong: expose every field and replace the server with the quick-form subset.

```ts
const matches = JSON.stringify(server).includes(query);
const next = { type, command, args, env };
throw new Error(JSON.stringify(server));
```

Correct: search only public fields, merge known edits into the canonical
draft, and keep user-visible failure text secret-safe.

```ts
const matches = searchMcpServers([server], query).length > 0;
const next = { ...canonicalSpec, type, command, args, env };
throw new Error("MCP 配置保存失败，请检查配置后重试");
```

Wrong: derive an icon URL dynamically or make its alt text repeat the app
label.

```tsx
<img src={`https://icons.example/${app.id}.svg`} alt={app.label} />
```

Correct: use the exhaustive local V2 map and keep the image decorative.

```tsx
<img src={getSkillTargetIcon(app.id)} alt="" aria-hidden="true" />
```

Wrong: fill a split pane with `height: 100%` and leave the feature panel
overflow visible, so bulk-assign buttons paint past the card.

```css
.fy-split-pane > * {
  height: 100%;
}
.fy-feature-assignment {
  display: flex;
  white-space: nowrap;
}
```

Correct: reuse `SplitPanes` child overflow from the catalog rail, and let
assignment rows wrap inside the pane.

```css
.fy-split-pane > * {
  min-height: 100%;
  height: 100%;
  overflow: auto;
}
.fy-feature-assignment {
  flex-wrap: wrap;
  min-width: 0;
}
```

Wrong: MCP Discover opens docs through a page-owned callback and a custom
underline button.

```tsx
<button className="fy-mcp-card-link" onClick={() => onOpen(item.docs!)}>
  文档
</button>
```

Correct: the same `ExternalLinkButton` used by Skills, Agents, and Models.

```tsx
<ExternalLinkButton url={item.docs}>文档</ExternalLinkButton>
```
