import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import {
  assertExpectedReleaseId,
  parseJobSnapshot,
  parseLocalInstallStatus,
  parseOptionalJobSnapshot,
  parseRemoteReleaseStatus,
} from "@/shared/codex-desktop";

import type { FeaturePorts } from "../../features/ports";
import {
  AGENT_ACTION_STATES,
  AGENT_CATALOG_IDS,
  AGENT_CATALOG_STATUSES,
  AGENT_OFFICIAL_LINK_IDS,
  type AgentActionCapability,
  type AgentCatalogActions,
  type AgentCatalogEntry,
  type AgentCatalogId,
  type AgentCatalogResult,
  type AgentOfficialLink,
  type AgentOfficialLinkId,
  type ProviderQuickSetupRequest,
  type ProviderSummaryQueryData,
} from "../../features/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

const AGENT_ACTION_IDS = ["browse", "observe", "install", "configure"] as const;

const CODEX_DESKTOP_JOB_UPDATED_EVENT = "codex-desktop-installer://job-updated";

const EXPECTED_AGENT_LINK_IDS = {
  qoderwork: ["product"],
  "trae-work": ["product"],
  workbuddy: ["product"],
  codex: [],
  "claude-code": ["cli", "desktop"],
} as const satisfies Readonly<
  Record<AgentCatalogId, readonly AgentOfficialLinkId[]>
>;

function isOneOf<T extends string>(
  value: unknown,
  candidates: readonly T[],
): value is T {
  return typeof value === "string" && candidates.some((item) => item === value);
}

function isReviewedDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function isOfficialHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value) return false;
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.length > 0 &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.search === "" &&
      parsed.hash === ""
    );
  } catch {
    return false;
  }
}

function parseAgentCapability(value: unknown): AgentActionCapability {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["state", "reason"]) ||
    !isOneOf(value.state, AGENT_ACTION_STATES) ||
    typeof value.reason !== "string" ||
    value.reason.trim().length === 0
  )
    throw new Error("Agent catalog is unavailable");
  return { state: value.state, reason: value.reason };
}

function parseAgentActions(value: unknown): AgentCatalogActions {
  if (!isRecord(value) || !hasExactKeys(value, [...AGENT_ACTION_IDS]))
    throw new Error("Agent catalog is unavailable");
  return {
    browse: parseAgentCapability(value.browse),
    observe: parseAgentCapability(value.observe),
    install: parseAgentCapability(value.install),
    configure: parseAgentCapability(value.configure),
  };
}

function parseAgentOfficialLink(value: unknown): AgentOfficialLink {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "label", "url"]) ||
    !isOneOf(value.id, AGENT_OFFICIAL_LINK_IDS) ||
    typeof value.label !== "string" ||
    value.label.trim().length === 0 ||
    value.label.trim() !== value.label ||
    !isOfficialHttpsUrl(value.url)
  )
    throw new Error("Agent catalog is unavailable");
  return { id: value.id, label: value.label, url: value.url };
}

function parseAgentCatalogEntry(
  value: unknown,
  expectedId: AgentCatalogId,
): AgentCatalogEntry {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "displayName",
      "description",
      "officialLinks",
      "status",
      "actions",
      "evidenceLabel",
    ]) ||
    value.id !== expectedId ||
    typeof value.displayName !== "string" ||
    value.displayName.trim().length === 0 ||
    typeof value.description !== "string" ||
    value.description.trim().length === 0 ||
    !Array.isArray(value.officialLinks) ||
    !isOneOf(value.status, AGENT_CATALOG_STATUSES) ||
    typeof value.evidenceLabel !== "string" ||
    value.evidenceLabel.trim().length === 0
  )
    throw new Error("Agent catalog is unavailable");

  const officialLinks = value.officialLinks.map(parseAgentOfficialLink);
  const linkIds = new Set<AgentOfficialLinkId>();
  const linkLabels = new Set<string>();
  for (const link of officialLinks) {
    if (linkIds.has(link.id) || linkLabels.has(link.label))
      throw new Error("Agent catalog is unavailable");
    linkIds.add(link.id);
    linkLabels.add(link.label);
  }

  const expectedLinkIds = EXPECTED_AGENT_LINK_IDS[expectedId];
  if (
    officialLinks.length !== expectedLinkIds.length ||
    officialLinks.some((link, index) => link.id !== expectedLinkIds[index])
  )
    throw new Error("Agent catalog is unavailable");

  return {
    id: expectedId,
    displayName: value.displayName,
    description: value.description,
    officialLinks,
    status: value.status,
    actions: parseAgentActions(value.actions),
    evidenceLabel: value.evidenceLabel,
  };
}

function parseAgentCatalog(value: unknown): AgentCatalogResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["contractVersion", "reviewedAt", "agents"]) ||
    value.contractVersion !== 2 ||
    !isReviewedDate(value.reviewedAt) ||
    !Array.isArray(value.agents) ||
    value.agents.length !== AGENT_CATALOG_IDS.length
  )
    throw new Error("Agent catalog is unavailable");

  const candidates = value.agents;
  return {
    contractVersion: 2,
    reviewedAt: value.reviewedAt,
    agents: AGENT_CATALOG_IDS.map((expectedId, index) =>
      parseAgentCatalogEntry(candidates[index], expectedId),
    ),
  };
}

function parseProviderSummary(value: unknown): ProviderSummaryQueryData {
  if (!isRecord(value) || !hasExactKeys(value, ["providers", "currentId"]))
    throw new Error("Provider public summary is unavailable");
  if (!isRecord(value.providers) || typeof value.currentId !== "string")
    throw new Error("Provider public summary is unavailable");

  const providers: ProviderSummaryQueryData["providers"] = {};
  for (const [key, candidate] of Object.entries(value.providers)) {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ["id", "name"]) ||
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      candidate.id !== key
    )
      throw new Error("Provider public summary is unavailable");
    providers[key] = { id: candidate.id, name: candidate.name };
  }
  if (value.currentId !== "" && !(value.currentId in providers))
    throw new Error("Provider public summary is unavailable");
  return { providers, currentId: value.currentId };
}

function assertQuickSetupRequest(
  request: ProviderQuickSetupRequest,
): ProviderQuickSetupRequest {
  if (
    !isRecord(request) ||
    !hasExactKeys(request, ["name", "baseUrl", "apiKey", "modelId"]) ||
    !Object.values(request).every((value) => typeof value === "string")
  )
    throw new Error("Provider quick setup request is invalid");
  return request;
}

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

function assertJobId(jobId: string): string {
  if (jobId.trim().length === 0 || jobId.trim() !== jobId)
    throw new Error("Codex desktop installer request is invalid");
  return jobId;
}

export function createTauriFeaturePorts(): FeaturePorts {
  return {
    catalog: {
      get: async () =>
        parseAgentCatalog(await invoke<unknown>("get_agent_catalog")),
    },
    codexDesktop: {
      getLocalStatus: async () =>
        parseLocalInstallStatus(
          await invoke<unknown>("codex_desktop_get_local_status"),
        ),
      checkLatest: async (force) => {
        if (typeof force !== "boolean")
          throw new Error("Codex desktop installer request is invalid");
        return parseRemoteReleaseStatus(
          await invoke<unknown>("codex_desktop_check_latest", { force }),
        );
      },
      getJob: async () =>
        parseOptionalJobSnapshot(
          await invoke<unknown>("codex_desktop_get_job"),
        ),
      startInstall: async (expectedReleaseId) =>
        parseJobSnapshot(
          await invoke<unknown>("codex_desktop_start_install", {
            request: {
              expectedReleaseId: assertExpectedReleaseId(expectedReleaseId),
            },
          }),
        ),
      cancelInstall: async (jobId) =>
        parseJobSnapshot(
          await invoke<unknown>("codex_desktop_cancel_install", {
            jobId: assertJobId(jobId),
          }),
        ),
      launch: async () => {
        await invoke("codex_desktop_launch");
      },
      openLogDirectory: async () => {
        await invoke("codex_desktop_open_log_directory");
      },
      subscribeJobUpdates: async (onSnapshot) =>
        listen<unknown>(CODEX_DESKTOP_JOB_UPDATED_EVENT, (event) => {
          onSnapshot(parseJobSnapshot(event.payload));
        }),
    },
    providers: {
      getSummary: async (app) =>
        parseProviderSummary(await invoke("get_provider_summary", { app })),
      applyQuickSetupWithResult: (request, app) =>
        invoke("apply_provider_quick_setup_with_result", {
          request: assertQuickSetupRequest(request),
          app,
        }),
    },
    workbuddy: {
      getStatus: () => invoke("get_workbuddy_status"),
      getModelIds: () => invoke("get_workbuddy_model_ids"),
      fetchModels: (request) => invoke("fetch_workbuddy_models", { request }),
      saveModels: (request) => invoke("save_workbuddy_models", { request }),
    },
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
