import type { FeaturePorts } from "../../features/ports";

export const NATIVE_ONLY_ERROR = "此操作仅在 FyAgent 桌面应用中可用";

const rejectNativeOnly = async (): Promise<never> => {
  throw new Error(NATIVE_ONLY_ERROR);
};

export function createBrowserFeaturePorts(): FeaturePorts {
  return {
    // The native command is the only Agent capability authority. Browser
    // preview renders the controlled unavailable state instead of carrying a
    // second capability matrix that could drift into a support claim.
    catalog: {
      get: rejectNativeOnly,
    },
    providers: {
      getSummary: rejectNativeOnly,
      applyQuickSetupWithResult: rejectNativeOnly,
    },
    workbuddy: {
      getStatus: rejectNativeOnly,
      getModelIds: rejectNativeOnly,
      fetchModels: rejectNativeOnly,
      saveModels: rejectNativeOnly,
    },
    skills: {
      getInstalled: async () => [],
      getBackups: async () => [],
      deleteBackup: rejectNativeOnly,
      install: rejectNativeOnly,
      uninstall: rejectNativeOnly,
      restoreBackup: rejectNativeOnly,
      toggleApp: rejectNativeOnly,
      scanUnmanaged: async () => [],
      importFromApps: rejectNativeOnly,
      discover: async () => [],
      checkUpdates: async () => [],
      update: rejectNativeOnly,
      migrateStorage: rejectNativeOnly,
      searchSkillsSh: async (query) => ({ skills: [], totalCount: 0, query }),
      getRepos: async () => [],
      addRepo: rejectNativeOnly,
      removeRepo: rejectNativeOnly,
      pickZip: rejectNativeOnly,
      installFromZip: rejectNativeOnly,
    },
    mcp: {
      getAll: async () => ({}),
      upsert: rejectNativeOnly,
      delete: rejectNativeOnly,
      toggleApp: rejectNativeOnly,
      importFromApps: rejectNativeOnly,
    },
    settings: {
      get: async () => ({}),
      save: rejectNativeOnly,
      openExternal: rejectNativeOnly,
    },
  };
}
