import type { FeaturePorts } from "../../features/ports";

export const NATIVE_ONLY_ERROR = "此操作仅在 FyAgent 桌面应用中可用";

const rejectWrite = async (): Promise<never> => {
  throw new Error(NATIVE_ONLY_ERROR);
};

export function createBrowserFeaturePorts(): FeaturePorts {
  return {
    skills: {
      getInstalled: async () => [],
      getBackups: async () => [],
      deleteBackup: rejectWrite,
      install: rejectWrite,
      uninstall: rejectWrite,
      restoreBackup: rejectWrite,
      toggleApp: rejectWrite,
      scanUnmanaged: async () => [],
      importFromApps: rejectWrite,
      discover: async () => [],
      checkUpdates: async () => [],
      update: rejectWrite,
      migrateStorage: rejectWrite,
      searchSkillsSh: async (query) => ({ skills: [], totalCount: 0, query }),
      getRepos: async () => [],
      addRepo: rejectWrite,
      removeRepo: rejectWrite,
      pickZip: rejectWrite,
      installFromZip: rejectWrite,
    },
    mcp: {
      getAll: async () => ({}),
      upsert: rejectWrite,
      delete: rejectWrite,
      toggleApp: rejectWrite,
      importFromApps: rejectWrite,
    },
    settings: {
      get: async () => ({}),
      save: rejectWrite,
      openExternal: rejectWrite,
    },
  };
}
