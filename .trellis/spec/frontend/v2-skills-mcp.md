# V2 Skills and MCP Feature Contract

## 1. Scope / Trigger

Read this contract before changing the V2 Skills or MCP pages, their shared
feature types, query state, controls, platform adapters, or feature tests. It
defines a frontend-only integration over the existing Tauri commands. It does
not authorize changes to Rust commands, persistence, the outer V2 shell, or
the four unrelated Phase 1 pages.

Production V2 feature code is limited to these boundaries:

```text
pages/skills, pages/mcp -> shared/features, shared/ui
shared/features        -> shared/platform feature ports
shared/platform/tauri  -> @tauri-apps/api/core.invoke
```

Legacy renderer modules are not a compatibility layer for V2. Do not import
from `src/components`, `src/hooks`, `src/lib`, or `src/i18n`.

## 2. Signatures

The supported application identity is the exact six-member union below. User
interfaces must not add Claude Desktop or OpenClaw to this list.

```ts
type SupportedAppId =
  | "claude"
  | "codex"
  | "gemini"
  | "grokbuild"
  | "opencode"
  | "hermes";

interface SkillsPort {
  getInstalled(): Promise<InstalledSkill[]>;
  getBackups(): Promise<SkillBackupEntry[]>;
  deleteBackup(backupId: string): Promise<boolean>;
  install(skill: DiscoverableSkill, currentApp: SupportedAppId): Promise<InstalledSkill>;
  uninstall(id: string): Promise<{ backupPath?: string }>;
  restoreBackup(backupId: string, currentApp: SupportedAppId): Promise<InstalledSkill>;
  toggleApp(id: string, app: SupportedAppId, enabled: boolean): Promise<boolean>;
  scanUnmanaged(): Promise<UnmanagedSkill[]>;
  importFromApps(imports: ImportSkillSelection[]): Promise<InstalledSkill[]>;
  discover(): Promise<DiscoverableSkill[]>;
  checkUpdates(): Promise<SkillUpdateInfo[]>;
  update(id: string): Promise<InstalledSkill>;
  migrateStorage(target: "fyagent" | "unified"): Promise<SkillMigrationResult>;
  searchSkillsSh(query: string, limit: number, offset: number): Promise<SkillsShSearchResult>;
  getRepos(): Promise<SkillRepo[]>;
  addRepo(repo: SkillRepo): Promise<boolean>;
  removeRepo(owner: string, name: string): Promise<boolean>;
  pickZip(): Promise<string | null>;
  installFromZip(filePath: string, currentApp: SupportedAppId): Promise<InstalledSkill[]>;
}

interface McpPort {
  getAll(): Promise<Record<string, McpServer>>;
  upsert(server: McpServer): Promise<void>;
  delete(id: string): Promise<boolean>;
  toggleApp(serverId: string, app: SupportedAppId, enabled: boolean): Promise<void>;
  importFromApps(): Promise<number>;
}

interface SettingsPort {
  get(): Promise<FeatureSettings>;
  save(settings: FeatureSettings): Promise<boolean>;
  openExternal(url: string): Promise<void>;
}
```

## 3. Contracts

### Platform and command boundary

- Only `src/v2/shared/platform/tauri/**` imports `@tauri-apps/**`.
- The Tauri adapter maps the port methods to the existing snake-case command
  names and camel-case payload keys. It must not call deprecated per-app APIs.
- Browser reads return empty authority snapshots. Browser writes reject with a
  clear native-only error and never report success.
- Feature tests inject ports or a page-load Tauri IPC fixture. Production code
  must not contain test routes, fixture switches, or synthetic data.

### State and writes

- A FeatureProvider owns one stable QueryClient and a session-only install
  target. The default target is Claude; navigation preserves it, while a full
  application restart resets it.
- Server data is authoritative. Successful writes and partial failures both
  invalidate and reread the affected resources before the UI settles.
- One write lock disables only conflicting writes. Reads, search, selection,
  and details remain available. Batch writes run sequentially and report
  progress and a final success/failure summary.
- Skill storage migration calls only `migrate_skill_storage`. Sync-method
  saves first read the complete settings object and merge the changed field.

### MCP configuration and secrets

- List search uses explicit public-field allow-lists. It never recursively
  stringifies an MCP server and never indexes `env` or `headers`.
- Ordinary details show only secret-field item counts. Values may appear only
  in the explicit editor.
- Quick and advanced modes share one canonical `McpServerSpec`. Quick edits
  replace known fields while preserving unknown extension fields, unknown
  top-level fields, and hidden application flags.
- Advanced JSON accepts one non-array object and rejects an `mcpServers`
  container. Invalid JSON cannot be saved or replaced by a mode switch.
- User-facing errors and logs must not interpolate MCP configuration objects,
  environment variables, headers, tokens, or secret-bearing URLs.

### Presentation boundary

- User-visible CSS is namespaced under `.fy-skills-*`, `.fy-mcp-*`, or
  `.fy-control-*` and consumes only `--fy-*` tokens.
- At most one six-application assignment panel exists in the DOM and
  accessibility tree. Responsive layout changes whether it is the third
  column or a details section; CSS must not hide a duplicate semantic panel.
- Changes must not alter the TopBar, brand, primary navigation, window
  controls, ContentViewport shell, route order, light-only tokens, or the
  Agents, Models, Prompts, and Memory page contents.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Browser performs a feature read | Return an empty collection or settings snapshot without a side effect |
| Browser performs a feature write | Reject with the native-only error; never show a success toast |
| Initial authority read fails | Show an error/retry state, not an empty-state success |
| Refresh fails after old data exists | Keep old data and show an inline error |
| Batch write partially fails | Report counts, keep no stale optimistic claim, and reread authority |
| MCP search term matches only an env/header value | Return no match |
| env/header line has no delimiter or an empty key | Show a line error and block save |
| Advanced JSON is invalid, an array, or an `mcpServers` container | Stay in advanced mode and block save |
| New MCP ID is blank or duplicates an authoritative ID | Block save before invoking Tauri |
| A backend error may contain MCP configuration | Show a fixed secret-safe message |
| Viewport changes between two- and three-column layouts | Render exactly one assignment panel with six unique switches |

## 5. Good / Base / Bad Cases

- **Good:** A user toggles Codex for one Skill. The UI invokes
  `toggle_skill_app` with `{ id, app: "codex", enabled }`, locks only
  conflicting writes, then rereads installed Skills before settling.
- **Base:** A browser preview has no fixture. Both pages show their native-safe
  empty states; attempts to mutate reject instead of simulating persistence.
- **Bad:** MCP search uses `JSON.stringify(server)`, a toast prints an invoke
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
  and error propagation across Skills, MCP, Settings, and external links.
- Pure tests cover public-field search, secret exclusion, selection
  convergence, repository parsing, installed-key matching, pagination,
  env/header/args parsing, advanced JSON validation, and extension retention.
- Component tests cover empty, loading, error, pending, write/refetch, dialogs,
  assignment, destructive confirmation, and secret-safe presentation.
- Browser tests cover `900x600`, `1152x640`, `1232x700`, and `1440x900`, with
  populated two-/three-column layouts, a single six-switch panel, no overflow,
  no secret rendering, exact invoke payloads, and authoritative refetch.
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
