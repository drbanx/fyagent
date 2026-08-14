import { beforeEach, describe, expect, it, vi } from "vitest";

import { CODEX_DESKTOP_PAYLOAD_ERROR } from "@/shared/codex-desktop";
import type {
  InstallerErrorDto,
  JobSnapshot,
  LocalInstallStatus,
  RemoteReleaseStatus,
} from "@/shared/codex-desktop";
import {
  createBrowserFeaturePorts,
  NATIVE_ONLY_ERROR,
} from "@/v2/shared/platform/browser/features";
import type {
  AgentActionState,
  AgentCatalogResult,
} from "@/v2/shared/features/types";

const invoke = vi.fn();
const listen = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

const installerReleaseId = `v1:${"a".repeat(64)}`;
const installerRemote: RemoteReleaseStatus = {
  releaseId: installerReleaseId,
  displayVersion: "26.814.1000",
  platformVersion: {
    kind: "windows_msix",
    major: 26,
    minor: 814,
    build: 1000,
    revision: 0,
  },
  expectedSize: 1_048_576,
  checkedAt: "2026-08-14T05:00:00Z",
};
const installerLocal: LocalInstallStatus = {
  state: "not_installed",
  platform: "windows",
  architecture: "x86_64",
};

function installerError(): InstallerErrorDto {
  return {
    code: "DOWNLOAD_FAILED",
    stage: "downloading",
    messageKey: "codexDesktop.error.downloadFailed",
    retryable: true,
    suggestedAction: "retry",
    details: {
      endpointKind: "artifact",
      attempt: 1,
      maxAttempts: 3,
      httpStatus: 503,
      platformErrorCode: null,
      redactedMessage: "Fixture download failed",
      context: { operation: "download" },
    },
  };
}

function installerJob(
  stage: JobSnapshot["stage"] = "checking",
  sequence = 0,
): JobSnapshot {
  return {
    jobId: "fixture-job-001",
    sequence,
    stage,
    release: installerRemote,
    startedAt: "2026-08-14T05:00:01Z",
    updatedAt: "2026-08-14T05:00:02Z",
    progress: null,
    cancellable: stage === "checking",
    result: null,
    error: stage === "failed" ? installerError() : null,
  };
}

const capability = (state: AgentActionState) => ({
  state,
  reason: `${state} fixture capability`,
});

function catalogFixture(): AgentCatalogResult {
  return {
    contractVersion: 2,
    reviewedAt: "2026-08-14",
    agents: [
      {
        id: "qoderwork",
        displayName: "QoderWork CN",
        description: "QoderWork catalog fixture",
        officialLinks: [
          {
            id: "product",
            label: "打开 QoderWork 官方页面",
            url: "https://qoder.com.cn/qoderwork",
          },
        ],
        status: "pending_verification",
        actions: {
          browse: capability("available"),
          observe: capability("pending_verification"),
          install: capability("assisted"),
          configure: capability("assisted"),
        },
        evidenceLabel: "QoderWork fixture evidence",
      },
      {
        id: "trae-work",
        displayName: "TRAE Work",
        description: "TRAE Work catalog fixture",
        officialLinks: [
          {
            id: "product",
            label: "打开 TRAE Work 官方页面",
            url: "https://work.trae.cn/",
          },
        ],
        status: "pending_verification",
        actions: {
          browse: capability("available"),
          observe: capability("pending_verification"),
          install: capability("assisted"),
          configure: capability("assisted"),
        },
        evidenceLabel: "TRAE Work fixture evidence",
      },
      {
        id: "workbuddy",
        displayName: "WorkBuddy",
        description: "WorkBuddy catalog fixture",
        officialLinks: [
          {
            id: "product",
            label: "打开 WorkBuddy 官方页面",
            url: "https://www.workbuddy.cn/",
          },
        ],
        status: "manual_install",
        actions: {
          browse: capability("available"),
          observe: capability("available"),
          install: capability("assisted"),
          configure: capability("available"),
        },
        evidenceLabel: "WorkBuddy fixture evidence",
      },
      {
        id: "codex",
        displayName: "Codex",
        description: "Codex catalog fixture",
        officialLinks: [],
        status: "managed_install",
        actions: {
          browse: capability("not_supported"),
          observe: capability("available"),
          install: capability("available"),
          configure: capability("available"),
        },
        evidenceLabel: "Codex fixture evidence",
      },
      {
        id: "claude-code",
        displayName: "Claude Code",
        description: "Claude Code catalog fixture",
        officialLinks: [
          {
            id: "cli",
            label: "Claude Code CLI",
            url: "https://docs.anthropic.com/en/docs/claude-code/getting-started",
          },
          {
            id: "desktop",
            label: "Claude Desktop",
            url: "https://claude.com/download",
          },
        ],
        status: "manual_install",
        actions: {
          browse: capability("available"),
          observe: capability("available"),
          install: capability("assisted"),
          configure: capability("available"),
        },
        evidenceLabel: "Claude fixture evidence",
      },
    ],
  };
}

describe("V2 feature ports", () => {
  beforeEach(() => {
    invoke.mockReset();
    listen.mockReset();
  });

  it("keeps native observations unavailable in browsers and rejects writes", async () => {
    const ports = createBrowserFeaturePorts();
    await expect(ports.catalog.get()).rejects.toThrow(NATIVE_ONLY_ERROR);
    await expect(ports.codexDesktop.getLocalStatus()).rejects.toThrow(
      NATIVE_ONLY_ERROR,
    );
    await expect(ports.codexDesktop.checkLatest(false)).rejects.toThrow(
      NATIVE_ONLY_ERROR,
    );
    await expect(ports.codexDesktop.getJob()).rejects.toThrow(
      NATIVE_ONLY_ERROR,
    );
    await expect(
      ports.codexDesktop.startInstall(installerReleaseId),
    ).rejects.toThrow(NATIVE_ONLY_ERROR);
    await expect(
      ports.codexDesktop.cancelInstall("fixture-job-001"),
    ).rejects.toThrow(NATIVE_ONLY_ERROR);
    await expect(ports.codexDesktop.launch()).rejects.toThrow(
      NATIVE_ONLY_ERROR,
    );
    await expect(ports.codexDesktop.openLogDirectory()).rejects.toThrow(
      NATIVE_ONLY_ERROR,
    );
    await expect(
      ports.codexDesktop.subscribeJobUpdates(vi.fn()),
    ).rejects.toThrow(NATIVE_ONLY_ERROR);
    await expect(ports.providers.getSummary("codex")).rejects.toThrow(
      NATIVE_ONLY_ERROR,
    );
    await expect(ports.workbuddy.getStatus()).rejects.toThrow(
      NATIVE_ONLY_ERROR,
    );
    await expect(ports.workbuddy.getModelIds()).rejects.toThrow(
      NATIVE_ONLY_ERROR,
    );
    await expect(ports.skills.getInstalled()).resolves.toEqual([]);
    await expect(ports.mcp.getAll()).resolves.toEqual({});
    await expect(ports.settings.get()).resolves.toEqual({});
    await expect(
      ports.providers.applyQuickSetupWithResult(
        {
          name: "Draft",
          baseUrl: "https://example.test/v1",
          apiKey: "key",
          modelId: "model",
        },
        "codex",
      ),
    ).rejects.toThrow(NATIVE_ONLY_ERROR);
    await expect(
      ports.workbuddy.fetchModels({
        baseUrl: "https://example.test/v1",
        apiKey: "test-key",
        allowNoApiKey: false,
      }),
    ).rejects.toThrow(NATIVE_ONLY_ERROR);
    await expect(ports.mcp.importFromApps()).rejects.toThrow(NATIVE_ONLY_ERROR);
  });

  it("uses exact Agent, Provider, and WorkBuddy commands and validates Provider summaries", async () => {
    const { createTauriFeaturePorts } = await import(
      "@/v2/shared/platform/tauri/features"
    );
    const sentinelSecret = "SENTINEL-PROVIDER-SECRET";
    invoke.mockImplementation(async (command: string) => {
      if (command === "get_agent_catalog") return catalogFixture();
      if (command === "get_provider_summary") {
        return {
          providers: {
            "provider-a": {
              id: "provider-a",
              name: "Provider A",
            },
          },
          currentId: "provider-a",
        };
      }
      if (command === "get_workbuddy_status") {
        return {
          path: "~/.workbuddy/models.json",
          exists: true,
          modelCount: 1,
          revision: "opaque-revision",
          backupExists: false,
          format: "legacyArray",
        };
      }
      if (command === "get_workbuddy_model_ids") {
        return { ids: ["model-a"], revision: "opaque-revision" };
      }
      if (command === "fetch_workbuddy_models") {
        return { models: ["model-a"], truncated: false };
      }
      if (command === "save_workbuddy_models") {
        return {
          state: "saved",
          revision: "next-revision",
          modelCount: 1,
          createdEntries: 1,
          updatedEntries: 0,
        };
      }
      return {
        value: { warnings: [] },
        liveConfigChanged: false,
        app: "codex",
      };
    });

    const ports = createTauriFeaturePorts();
    const request = {
      name: "Quick setup",
      baseUrl: "https://example.test/v1",
      apiKey: "mutation-only-key",
      modelId: "model-a",
    };
    const fetchRequest = {
      baseUrl: "https://example.test/v1",
      apiKey: "workbuddy-key",
      allowNoApiKey: false,
    };
    const saveRequest = {
      ...fetchRequest,
      selectedModelIds: ["model-a"],
      manualModelIds: [],
      clearExistingApiKeys: false,
      expectedRevision: "opaque-revision",
      overwriteToken: "opaque-token",
    };

    await ports.catalog.get();
    const summary = await ports.providers.getSummary("codex");
    await ports.providers.applyQuickSetupWithResult(request, "codex");
    await ports.workbuddy.getStatus();
    await ports.workbuddy.getModelIds();
    await ports.workbuddy.fetchModels(fetchRequest);
    await ports.workbuddy.saveModels(saveRequest);

    expect(summary.providers).toEqual({
      "provider-a": {
        id: "provider-a",
        name: "Provider A",
      },
    });
    expect(JSON.stringify(summary)).not.toContain(sentinelSecret);
    expect(summary.providers["provider-a"]).not.toHaveProperty(
      "settingsConfig",
    );
    expect(invoke.mock.calls).toEqual([
      ["get_agent_catalog"],
      ["get_provider_summary", { app: "codex" }],
      ["apply_provider_quick_setup_with_result", { request, app: "codex" }],
      ["get_workbuddy_status"],
      ["get_workbuddy_model_ids"],
      ["fetch_workbuddy_models", { request: fetchRequest }],
      ["save_workbuddy_models", { request: saveRequest }],
    ]);
  });

  it("rejects a Provider map whose key and public ID disagree", async () => {
    const { createTauriFeaturePorts } = await import(
      "@/v2/shared/platform/tauri/features"
    );
    invoke.mockResolvedValue({
      providers: {
        "provider-map-key": {
          id: "different-provider-id",
          name: "Mismatched Provider",
        },
      },
      currentId: "provider-map-key",
    });

    await expect(
      createTauriFeaturePorts().providers.getSummary("codex"),
    ).rejects.toThrow("Provider public summary is unavailable");
  });

  it("decodes only the exact Agent catalog v2 wire contract", async () => {
    const { createTauriFeaturePorts } = await import(
      "@/v2/shared/platform/tauri/features"
    );
    const ports = createTauriFeaturePorts();
    const expected = catalogFixture();
    invoke.mockResolvedValueOnce(expected);
    await expect(ports.catalog.get()).resolves.toEqual(expected);

    const invalidPayloads: unknown[] = [];

    const legacy = structuredClone(expected);
    Object.assign(legacy, { contractVersion: 1 });
    invalidPayloads.push(legacy);

    const invalidDate = structuredClone(expected);
    Object.assign(invalidDate, { reviewedAt: "2026-02-30" });
    invalidPayloads.push(invalidDate);

    const extraTopLevelKey = structuredClone(expected);
    Object.assign(extraTopLevelKey, { officialUrl: "https://example.test" });
    invalidPayloads.push(extraTopLevelKey);

    const wrongAgentOrder = structuredClone(expected);
    wrongAgentOrder.agents.reverse();
    invalidPayloads.push(wrongAgentOrder);

    const unknownStatus = structuredClone(expected);
    Object.assign(unknownStatus.agents[3], { status: "installed" });
    invalidPayloads.push(unknownStatus);

    const unknownActionState = structuredClone(expected);
    Object.assign(unknownActionState.agents[0].actions.browse, {
      state: "enabled",
    });
    invalidPayloads.push(unknownActionState);

    const emptyLabel = structuredClone(expected);
    emptyLabel.agents[0].officialLinks[0].label = "";
    invalidPayloads.push(emptyLabel);

    for (const url of [
      "http://qoder.com.cn/qoderwork",
      "https://user@qoder.com.cn/qoderwork",
      "https://qoder.com.cn/qoderwork?source=test",
      "https://qoder.com.cn/qoderwork#fragment",
    ]) {
      const invalidUrl = structuredClone(expected);
      invalidUrl.agents[0].officialLinks[0].url = url;
      invalidPayloads.push(invalidUrl);
    }

    const duplicateProductLink = structuredClone(expected);
    duplicateProductLink.agents[0].officialLinks.push({
      ...duplicateProductLink.agents[0].officialLinks[0],
    });
    invalidPayloads.push(duplicateProductLink);

    const codexExternalLink = structuredClone(expected);
    codexExternalLink.agents[3].officialLinks.push({
      id: "product",
      label: "Codex product",
      url: "https://example.test/codex",
    });
    invalidPayloads.push(codexExternalLink);

    const reversedClaudeLinks = structuredClone(expected);
    reversedClaudeLinks.agents[4].officialLinks.reverse();
    invalidPayloads.push(reversedClaudeLinks);

    for (const payload of invalidPayloads) {
      invoke.mockResolvedValueOnce(payload);
      await expect(ports.catalog.get()).rejects.toThrow(
        "Agent catalog is unavailable",
      );
    }
  });

  it("validates Codex Desktop results and uses only the exact installer IPC", async () => {
    const unlisten = vi.fn();
    let eventHandler:
      | ((event: { payload: unknown }) => void)
      | undefined;
    listen.mockImplementation(
      async (
        _eventName: string,
        handler: (event: { payload: unknown }) => void,
      ) => {
        eventHandler = handler;
        return unlisten;
      },
    );
    invoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "codex_desktop_get_local_status":
          return installerLocal;
        case "codex_desktop_check_latest":
          return installerRemote;
        case "codex_desktop_get_job":
          return null;
        case "codex_desktop_start_install":
          return installerJob("checking", 1);
        case "codex_desktop_cancel_install":
          return installerJob("cancelled", 2);
        case "codex_desktop_launch":
        case "codex_desktop_open_log_directory":
          return undefined;
        default:
          throw new Error(`Unexpected command: ${command}`);
      }
    });

    const { createTauriFeaturePorts } = await import(
      "@/v2/shared/platform/tauri/features"
    );
    const ports = createTauriFeaturePorts();
    await expect(ports.codexDesktop.getLocalStatus()).resolves.toEqual(
      installerLocal,
    );
    await expect(ports.codexDesktop.checkLatest(true)).resolves.toEqual(
      installerRemote,
    );
    await expect(ports.codexDesktop.getJob()).resolves.toBeNull();
    await expect(
      ports.codexDesktop.startInstall(installerReleaseId),
    ).resolves.toEqual(installerJob("checking", 1));
    await expect(
      ports.codexDesktop.cancelInstall("fixture-job-001"),
    ).resolves.toEqual(installerJob("cancelled", 2));
    await expect(ports.codexDesktop.launch()).resolves.toBeUndefined();
    await expect(
      ports.codexDesktop.openLogDirectory(),
    ).resolves.toBeUndefined();

    expect(invoke.mock.calls).toEqual([
      ["codex_desktop_get_local_status"],
      ["codex_desktop_check_latest", { force: true }],
      ["codex_desktop_get_job"],
      [
        "codex_desktop_start_install",
        { request: { expectedReleaseId: installerReleaseId } },
      ],
      ["codex_desktop_cancel_install", { jobId: "fixture-job-001" }],
      ["codex_desktop_launch"],
      ["codex_desktop_open_log_directory"],
    ]);
    expect(JSON.stringify(invoke.mock.calls[3])).not.toMatch(
      /url|path|hash|scope|bypass/i,
    );

    const onSnapshot = vi.fn();
    const cleanup = await ports.codexDesktop.subscribeJobUpdates(onSnapshot);
    expect(listen).toHaveBeenCalledWith(
      "codex-desktop-installer://job-updated",
      expect.any(Function),
    );
    const failedSnapshot = installerJob("failed", 3);
    eventHandler?.({ payload: failedSnapshot });
    expect(onSnapshot).toHaveBeenCalledWith(failedSnapshot);

    const invalidErrorSnapshot = structuredClone(failedSnapshot);
    Object.assign(invalidErrorSnapshot.error?.details ?? {}, {
      redactedMessage: 503,
    });
    expect(() => eventHandler?.({ payload: invalidErrorSnapshot })).toThrow(
      CODEX_DESKTOP_PAYLOAD_ERROR,
    );
    expect(onSnapshot).toHaveBeenCalledTimes(1);
    cleanup();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid Codex Desktop requests and payloads before React sees them", async () => {
    const { createTauriFeaturePorts } = await import(
      "@/v2/shared/platform/tauri/features"
    );
    const ports = createTauriFeaturePorts();

    await expect(
      ports.codexDesktop.startInstall("https://example.test/release.msix"),
    ).rejects.toThrow(CODEX_DESKTOP_PAYLOAD_ERROR);
    await expect(ports.codexDesktop.cancelInstall(" job-001 ")).rejects.toThrow(
      "Codex desktop installer request is invalid",
    );
    expect(invoke).not.toHaveBeenCalled();

    invoke.mockResolvedValueOnce({ ...installerLocal, unexpected: true });
    await expect(ports.codexDesktop.getLocalStatus()).rejects.toThrow(
      CODEX_DESKTOP_PAYLOAD_ERROR,
    );

    invoke.mockResolvedValueOnce({
      ...installerRemote,
      checkedAt: "2026-08-14",
    });
    await expect(ports.codexDesktop.checkLatest(false)).rejects.toThrow(
      CODEX_DESKTOP_PAYLOAD_ERROR,
    );

    invoke.mockResolvedValueOnce({
      ...installerJob("checking"),
      sequence: Number.NaN,
    });
    await expect(ports.codexDesktop.getJob()).rejects.toThrow(
      CODEX_DESKTOP_PAYLOAD_ERROR,
    );
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

  it("opens a validated HTTP(S) URL through the exact native command", async () => {
    const { createTauriFeaturePorts } = await import(
      "@/v2/shared/platform/tauri/features"
    );
    invoke.mockResolvedValue(undefined);
    const ports = createTauriFeaturePorts();
    await ports.settings.openExternal("https://qoder.com.cn/qoderwork");
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("open_external", {
      url: "https://qoder.com.cn/qoderwork",
    });
  });
});
