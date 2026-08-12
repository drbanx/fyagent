import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBrowserFeaturePorts,
  NATIVE_ONLY_ERROR,
} from "@/v2/shared/platform/browser/features";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

describe("V2 feature ports", () => {
  beforeEach(() => invoke.mockReset());

  it("provides harmless browser reads and explicit rejected writes", async () => {
    const ports = createBrowserFeaturePorts();
    await expect(ports.skills.getInstalled()).resolves.toEqual([]);
    await expect(ports.mcp.getAll()).resolves.toEqual({});
    await expect(ports.settings.get()).resolves.toEqual({});
    await expect(ports.mcp.importFromApps()).rejects.toThrow(NATIVE_ONLY_ERROR);
  });

  it("uses exact existing Tauri commands and camelCase payloads", async () => {
    const { createTauriFeaturePorts } = await import(
      "@/v2/shared/platform/tauri/features"
    );
    invoke.mockResolvedValue(undefined);
    const ports = createTauriFeaturePorts();
    const skill = {
      key: "owner/repo:skill-a",
      name: "Skill A",
      description: "A",
      directory: "skill-a",
      repoOwner: "owner",
      repoName: "repo",
      repoBranch: "main",
    };
    const repo = {
      owner: "owner",
      name: "repo",
      branch: "main",
      enabled: true,
    };
    const server = {
      id: "server-a",
      name: "Server A",
      server: { type: "stdio" as const, command: "npx" },
      apps: {
        claude: true,
        codex: false,
        gemini: false,
        grokbuild: false,
        opencode: false,
        hermes: false,
      },
    };
    await ports.skills.getInstalled();
    await ports.skills.getBackups();
    await ports.skills.deleteBackup("backup-a");
    await ports.skills.install(skill, "claude");
    await ports.skills.uninstall("skill-a");
    await ports.skills.restoreBackup("backup-a", "gemini");
    await ports.skills.toggleApp("skill-a", "codex", true);
    await ports.skills.scanUnmanaged();
    await ports.skills.importFromApps([
      { directory: "skill-a", apps: server.apps },
    ]);
    await ports.skills.discover();
    await ports.skills.checkUpdates();
    await ports.skills.update("skill-a");
    await ports.skills.migrateStorage("unified");
    await ports.skills.searchSkillsSh("react", 20, 40);
    await ports.skills.getRepos();
    await ports.skills.addRepo(repo);
    await ports.skills.removeRepo("owner", "repo");
    await ports.skills.pickZip();
    await ports.skills.installFromZip("C:/skill.zip", "hermes");
    await ports.mcp.getAll();
    await ports.mcp.upsert(server);
    await ports.mcp.delete("server-a");
    await ports.mcp.toggleApp("server-a", "hermes", false);
    await ports.mcp.importFromApps();
    await ports.settings.get();
    await ports.settings.save({ skillSyncMethod: "copy" });
    expect(invoke.mock.calls).toEqual([
      ["get_installed_skills"],
      ["get_skill_backups"],
      ["delete_skill_backup", { backupId: "backup-a" }],
      ["install_skill_unified", { skill, currentApp: "claude" }],
      ["uninstall_skill_unified", { id: "skill-a" }],
      ["restore_skill_backup", { backupId: "backup-a", currentApp: "gemini" }],
      ["toggle_skill_app", { id: "skill-a", app: "codex", enabled: true }],
      ["scan_unmanaged_skills"],
      [
        "import_skills_from_apps",
        { imports: [{ directory: "skill-a", apps: server.apps }] },
      ],
      ["discover_available_skills"],
      ["check_skill_updates"],
      ["update_skill", { id: "skill-a" }],
      ["migrate_skill_storage", { target: "unified" }],
      ["search_skills_sh", { query: "react", limit: 20, offset: 40 }],
      ["get_skill_repos"],
      ["add_skill_repo", { repo }],
      ["remove_skill_repo", { owner: "owner", name: "repo" }],
      ["open_zip_file_dialog"],
      [
        "install_skills_from_zip",
        { filePath: "C:/skill.zip", currentApp: "hermes" },
      ],
      ["get_mcp_servers"],
      ["upsert_mcp_server", { server }],
      ["delete_mcp_server", { id: "server-a" }],
      [
        "toggle_mcp_app",
        { serverId: "server-a", app: "hermes", enabled: false },
      ],
      ["import_mcp_from_apps"],
      ["get_settings"],
      ["save_settings", { settings: { skillSyncMethod: "copy" } }],
    ]);
  });

  it("rejects non-http external URLs before invoking native code", async () => {
    const { createTauriFeaturePorts } = await import(
      "@/v2/shared/platform/tauri/features"
    );
    const ports = createTauriFeaturePorts();
    await expect(ports.settings.openExternal("file:///secret")).rejects.toThrow(
      "HTTP",
    );
    expect(invoke).not.toHaveBeenCalled();
  });
});
