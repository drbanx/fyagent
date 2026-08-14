export const SUPPORTED_APP_IDS = [
  "claude",
  "codex",
  "gemini",
  "grokbuild",
  "opencode",
  "hermes",
] as const;

export type SupportedAppId = (typeof SUPPORTED_APP_IDS)[number];

export const SUPPORTED_APPS: ReadonlyArray<{
  id: SupportedAppId;
  label: string;
}> = [
  { id: "claude", label: "Claude" },
  { id: "codex", label: "Codex" },
  { id: "gemini", label: "Gemini" },
  { id: "grokbuild", label: "Grok Build" },
  { id: "opencode", label: "OpenCode" },
  { id: "hermes", label: "Hermes" },
];

export type AppAssignments = Record<SupportedAppId, boolean> &
  Record<string, boolean | undefined>;

export interface InstalledSkill {
  id: string;
  name: string;
  description?: string;
  directory: string;
  repoOwner?: string;
  repoName?: string;
  repoBranch?: string;
  readmeUrl?: string;
  apps: AppAssignments;
  installedAt: number;
  contentHash?: string;
  updatedAt: number;
}

export interface DiscoverableSkill {
  key: string;
  name: string;
  description: string;
  directory: string;
  readmeUrl?: string;
  repoOwner: string;
  repoName: string;
  repoBranch: string;
}

export interface SkillsShSkill {
  key: string;
  name: string;
  directory: string;
  repoOwner: string;
  repoName: string;
  repoBranch: string;
  installs: number;
  readmeUrl?: string;
}

export interface SkillsShSearchResult {
  skills: SkillsShSkill[];
  totalCount: number;
  query: string;
}

export interface SkillUpdateInfo {
  id: string;
  name: string;
  currentHash?: string;
  remoteHash: string;
}

export interface SkillRepo {
  owner: string;
  name: string;
  branch: string;
  enabled: boolean;
}

export interface UnmanagedSkill {
  directory: string;
  name: string;
  description?: string;
  foundIn: string[];
  path: string;
}

export interface ImportSkillSelection {
  directory: string;
  apps: AppAssignments;
}

export interface SkillBackupEntry {
  backupId: string;
  backupPath: string;
  createdAt: number;
  skill: InstalledSkill;
}

export interface SkillMigrationResult {
  migratedCount: number;
  skippedCount: number;
  errors: string[];
}

export interface McpServerSpec extends Record<string, unknown> {
  type?: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpServer extends Record<string, unknown> {
  id: string;
  name: string;
  server: McpServerSpec;
  apps: AppAssignments;
  description?: string;
  tags?: string[];
  homepage?: string;
  docs?: string;
  source?: string;
}

export type McpServersMap = Record<string, McpServer>;

export type FeatureSettings = Record<string, unknown> & {
  skillSyncMethod?: "auto" | "symlink" | "copy";
  skillStorageLocation?: "fyagent" | "unified";
};

export const AGENT_CATALOG_IDS = [
  "qoderwork",
  "trae-work",
  "workbuddy",
  "codex",
  "claude-code",
] as const;

export type AgentCatalogId = (typeof AGENT_CATALOG_IDS)[number];

export const AGENT_CATALOG_STATUSES = [
  "pending_verification",
  "manual_install",
  "managed_install",
] as const;

export type AgentCatalogStatus = (typeof AGENT_CATALOG_STATUSES)[number];

export const AGENT_ACTION_STATES = [
  "available",
  "assisted",
  "not_supported",
  "pending_verification",
] as const;

export type AgentActionState = (typeof AGENT_ACTION_STATES)[number];

export const AGENT_OFFICIAL_LINK_IDS = ["product", "cli", "desktop"] as const;

export type AgentOfficialLinkId = (typeof AGENT_OFFICIAL_LINK_IDS)[number];

export interface AgentOfficialLink {
  id: AgentOfficialLinkId;
  label: string;
  url: string;
}

export interface AgentActionCapability {
  state: AgentActionState;
  reason: string;
}

export interface AgentCatalogActions {
  browse: AgentActionCapability;
  observe: AgentActionCapability;
  install: AgentActionCapability;
  configure: AgentActionCapability;
}

export interface AgentCatalogEntry {
  id: AgentCatalogId;
  displayName: string;
  description: string;
  officialLinks: AgentOfficialLink[];
  status: AgentCatalogStatus;
  actions: AgentCatalogActions;
  evidenceLabel: string;
}

export interface AgentCatalogResult {
  contractVersion: 2;
  reviewedAt: string;
  agents: AgentCatalogEntry[];
}

export type ProviderAppId = "claude" | "codex";

export interface ProviderQuickSetupRequest {
  name: string;
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

/** Non-secret projection returned by Provider reads in V2. */
export interface ProviderSummary {
  id: string;
  name: string;
}

export type ProviderSummaryMap = Record<string, ProviderSummary>;

export interface ProviderSummaryQueryData {
  providers: ProviderSummaryMap;
  currentId: string;
}

export type CodexProviderMutationWarning =
  | "CODEX_WEBSOCKET_NON_GPT_MODEL"
  | "CODEX_WEBSOCKET_PROXY_MAY_BE_UNSUPPORTED";

export interface ProviderMutationResult<T> {
  value: T;
  liveConfigChanged: boolean;
  app: ProviderAppId;
  warningCodes?: CodexProviderMutationWarning[];
}

export interface ProviderSwitchResult {
  warnings: string[];
}

export type ProviderQuickSetupFailureCode =
  | "APPLY_FAILED_ROLLED_BACK"
  | "ROLLBACK_PARTIAL_STATE_UNKNOWN";

export interface ProviderQuickSetupCommandError {
  code: ProviderQuickSetupFailureCode;
}

export interface WorkBuddyStatus {
  path: string;
  exists: boolean;
  modelCount: number;
  revision: string | null;
  backupExists: boolean;
  format: "legacyArray" | "objectRoot" | "missing";
}

export interface WorkBuddyModelIdsResult {
  ids: string[];
  revision: string | null;
}

export interface WorkBuddyFetchModelsRequest {
  baseUrl: string;
  apiKey: string;
  allowNoApiKey: boolean;
}

export interface WorkBuddyFetchModelsResult {
  models: string[];
  truncated: boolean;
}

export interface WorkBuddySaveModelsRequest
  extends WorkBuddyFetchModelsRequest {
  selectedModelIds: string[];
  manualModelIds: string[];
  clearExistingApiKeys: boolean;
  expectedRevision: string | null;
  overwriteToken?: string;
}

export interface WorkBuddySaveModelsSavedResult {
  state: "saved";
  revision: string;
  modelCount: number;
  createdEntries: number;
  updatedEntries: number;
}

export interface WorkBuddyOverwriteConfirmationRequiredResult {
  state: "overwrite_confirmation_required";
  token: string;
  existingIds: string[];
}

export interface WorkBuddyConcurrentModificationResult {
  state: "concurrent_modification";
}

export type WorkBuddySaveModelsResult =
  | WorkBuddySaveModelsSavedResult
  | WorkBuddyOverwriteConfirmationRequiredResult
  | WorkBuddyConcurrentModificationResult;

export function createAssignments(
  enabled: readonly SupportedAppId[] = [],
): AppAssignments {
  const enabledSet = new Set(enabled);
  return {
    ...(Object.fromEntries(
      SUPPORTED_APP_IDS.map((id) => [id, enabledSet.has(id)]),
    ) as AppAssignments),
    "claude-desktop": false,
    openclaw: false,
  };
}
