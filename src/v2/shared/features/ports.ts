import type {
  DiscoverableSkill,
  FeatureSettings,
  ImportSkillSelection,
  InstalledSkill,
  McpServer,
  McpServersMap,
  SkillBackupEntry,
  SkillMigrationResult,
  SkillRepo,
  SkillsShSearchResult,
  SkillUpdateInfo,
  SupportedAppId,
  UnmanagedSkill,
} from "./types";

export interface SkillsPort {
  getInstalled(): Promise<InstalledSkill[]>;
  getBackups(): Promise<SkillBackupEntry[]>;
  deleteBackup(backupId: string): Promise<boolean>;
  install(
    skill: DiscoverableSkill,
    currentApp: SupportedAppId,
  ): Promise<InstalledSkill>;
  uninstall(id: string): Promise<{ backupPath?: string }>;
  restoreBackup(
    backupId: string,
    currentApp: SupportedAppId,
  ): Promise<InstalledSkill>;
  toggleApp(
    id: string,
    app: SupportedAppId,
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
    currentApp: SupportedAppId,
  ): Promise<InstalledSkill[]>;
}

export interface McpPort {
  getAll(): Promise<McpServersMap>;
  upsert(server: McpServer): Promise<void>;
  delete(id: string): Promise<boolean>;
  toggleApp(
    serverId: string,
    app: SupportedAppId,
    enabled: boolean,
  ): Promise<void>;
  importFromApps(): Promise<number>;
}

export interface SettingsPort {
  get(): Promise<FeatureSettings>;
  save(settings: FeatureSettings): Promise<boolean>;
  openExternal(url: string): Promise<void>;
}

export interface FeaturePorts {
  skills: SkillsPort;
  mcp: McpPort;
  settings: SettingsPort;
}
