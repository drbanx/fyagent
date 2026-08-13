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
