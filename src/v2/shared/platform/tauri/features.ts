import { invoke } from "@tauri-apps/api/core";

import type { FeaturePorts } from "../../features/ports";

function validateExternalUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("外部链接无效");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("只允许打开 HTTP(S) 链接");
  }
}

export function createTauriFeaturePorts(): FeaturePorts {
  return {
    skills: {
      getInstalled: () => invoke("get_installed_skills"),
      getBackups: () => invoke("get_skill_backups"),
      deleteBackup: (backupId) => invoke("delete_skill_backup", { backupId }),
      install: (skill, currentApp) =>
        invoke("install_skill_unified", { skill, currentApp }),
      uninstall: (id) => invoke("uninstall_skill_unified", { id }),
      restoreBackup: (backupId, currentApp) =>
        invoke("restore_skill_backup", { backupId, currentApp }),
      toggleApp: (id, app, enabled) =>
        invoke("toggle_skill_app", { id, app, enabled }),
      scanUnmanaged: () => invoke("scan_unmanaged_skills"),
      importFromApps: (imports) =>
        invoke("import_skills_from_apps", { imports }),
      discover: () => invoke("discover_available_skills"),
      checkUpdates: () => invoke("check_skill_updates"),
      update: (id) => invoke("update_skill", { id }),
      migrateStorage: (target) => invoke("migrate_skill_storage", { target }),
      searchSkillsSh: (query, limit, offset) =>
        invoke("search_skills_sh", { query, limit, offset }),
      getRepos: () => invoke("get_skill_repos"),
      addRepo: (repo) => invoke("add_skill_repo", { repo }),
      removeRepo: (owner, name) => invoke("remove_skill_repo", { owner, name }),
      pickZip: () => invoke("open_zip_file_dialog"),
      installFromZip: (filePath, currentApp) =>
        invoke("install_skills_from_zip", { filePath, currentApp }),
    },
    mcp: {
      getAll: () => invoke("get_mcp_servers"),
      upsert: (server) => invoke("upsert_mcp_server", { server }),
      delete: (id) => invoke("delete_mcp_server", { id }),
      toggleApp: (serverId, app, enabled) =>
        invoke("toggle_mcp_app", { serverId, app, enabled }),
      importFromApps: () => invoke("import_mcp_from_apps"),
    },
    settings: {
      get: () => invoke("get_settings"),
      save: (settings) => invoke("save_settings", { settings }),
      openExternal: async (url) => {
        validateExternalUrl(url);
        await invoke("open_external", { url });
      },
    },
  };
}
