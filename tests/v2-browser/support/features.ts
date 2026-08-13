import type { Page } from "@playwright/test";

export interface FeatureFixtureCall {
  command: string;
  payload: Record<string, unknown>;
}

export interface RichFeatureFixtureOptions {
  catalogFailure?: boolean;
  observationFailure?: "workbuddy" | "codex" | "claude";
  openExternalFailure?: boolean;
  existingQuickSetup?: "codex" | "claude";
  providerMutation?: "success" | "save_failure" | "switch_failure";
  providerWriteDelayMs?: number;
  workBuddySave?:
    | "saved"
    | "overwrite_then_saved"
    | "concurrent_modification"
    | "failure";
  workBuddyWriteDelayMs?: number;
}

declare global {
  interface Window {
    __FYAGENT_FEATURE_FIXTURE__: {
      calls: FeatureFixtureCall[];
    };
    __TAURI_INTERNALS__: {
      metadata: {
        currentWindow: { label: string };
        currentWebview: { label: string; windowLabel: string };
      };
      invoke: (
        command: string,
        payload?: Record<string, unknown>,
      ) => Promise<unknown>;
    };
  }
}

export async function installRichTauriFeatureFixture(
  page: Page,
  options: RichFeatureFixtureOptions = {},
): Promise<void> {
  await page.addInitScript((fixtureOptions: RichFeatureFixtureOptions) => {
    const assignments = (enabled: string[]) =>
      Object.fromEntries(
        [
          "claude",
          "codex",
          "gemini",
          "grokbuild",
          "opencode",
          "hermes",
          "claude-desktop",
          "openclaw",
        ].map((id) => [id, enabled.includes(id)]),
      );
    const skills = [
      {
        id: "fixture-review",
        name: "Review Companion",
        description: "Deterministic browser acceptance fixture",
        directory: "review-companion",
        repoOwner: "fyagent-fixtures",
        repoName: "skills",
        repoBranch: "main",
        readmeUrl: "https://example.test/review-companion",
        apps: assignments(["claude", "gemini"]),
        installedAt: 1_700_000_000,
        contentHash: "fixture-local-hash",
        updatedAt: 1_700_000_100,
      },
      {
        id: "fixture-notes",
        name: "Release Notes",
        description: "Second populated list item",
        directory: "release-notes",
        apps: assignments(["codex"]),
        installedAt: 1_700_000_200,
        updatedAt: 1_700_000_300,
      },
    ];
    const mcpServers = {
      "fixture-context": {
        id: "fixture-context",
        name: "Fixture Context Server",
        description: "Populated stdio MCP fixture",
        tags: ["fixture", "browser"],
        source: "acceptance",
        server: {
          type: "stdio",
          command: "fixture-mcp",
          args: ["--safe-mode"],
          env: {
            FIXTURE_TOKEN: "synthetic-secret-never-render",
          },
          fixtureExtension: {
            retained: true,
          },
        },
        apps: assignments(["claude", "codex"]),
      },
      "fixture-http": {
        id: "fixture-http",
        name: "Fixture HTTP Server",
        description: "Second populated MCP item",
        server: {
          type: "http",
          url: "https://example.test/mcp",
          headers: {
            Authorization: "Bearer synthetic-header-never-render",
          },
        },
        apps: assignments(["gemini"]),
      },
    };
    const capability = (
      state:
        | "available"
        | "assisted"
        | "not_supported"
        | "pending_verification",
      reason: string,
    ) => ({ state, reason });
    const catalog = {
      contractVersion: 1,
      reviewedAt: "2026-08-13",
      agents: [
        {
          id: "qoderwork",
          displayName: "QoderWork CN",
          description: "Qoder 家族的桌面工作助手；当前仅提供官方入口。",
          officialUrl: "https://qoder.com.cn/qoderwork",
          status: "pending_verification",
          actions: {
            browse: capability("available", "可打开 QoderWork 官方产品入口。"),
            observe: capability(
              "pending_verification",
              "尚未验证稳定的本地状态或登录态合同。",
            ),
            install: capability(
              "assisted",
              "安装由厂商官方流程负责；FyAgent 不下载或安装。",
            ),
            configure: capability(
              "assisted",
              "仅打开厂商官方设置；FyAgent 不写入配置。",
            ),
          },
          evidenceLabel: "官方产品入口；本地接入能力待验证",
        },
        {
          id: "trae-work",
          displayName: "TRAE Work",
          description: "TRAE 的多端工作助手；当前仅提供官方入口。",
          officialUrl: "https://www.trae.cn/",
          status: "pending_verification",
          actions: {
            browse: capability("available", "可打开 TRAE Work 官方产品入口。"),
            observe: capability(
              "pending_verification",
              "尚未验证稳定的本地状态或登录态合同。",
            ),
            install: capability(
              "assisted",
              "安装由厂商官方流程负责；FyAgent 不下载或安装。",
            ),
            configure: capability(
              "assisted",
              "仅打开厂商官方设置；FyAgent 不写入配置。",
            ),
          },
          evidenceLabel: "官方产品入口；本地接入能力待验证",
        },
        {
          id: "workbuddy",
          displayName: "WorkBuddy",
          description: "可通过 FyAgent 读取并保存受限的模型配置。",
          officialUrl: "https://www.workbuddy.cn/",
          status: "manual_install",
          actions: {
            browse: capability("available", "可打开 WorkBuddy 官方产品入口。"),
            observe: capability(
              "available",
              "可读取非敏感的 WorkBuddy 配置状态。",
            ),
            install: capability("assisted", "安装由 WorkBuddy 官方流程负责。"),
            configure: capability(
              "available",
              "可按 WorkBuddy 的版本与确认合同保存模型配置。",
            ),
          },
          evidenceLabel: "WorkBuddy 专用状态与模型配置命令",
        },
        {
          id: "codex",
          displayName: "Codex",
          description: "可通过 FyAgent Provider 管理进行受限的模型配置。",
          officialUrl: "https://chatgpt.com/codex",
          status: "manual_install",
          actions: {
            browse: capability("available", "可打开 Codex 官方产品入口。"),
            observe: capability(
              "available",
              "可读取 FyAgent 中的 Provider 汇总和当前选择。",
            ),
            install: capability("assisted", "安装由 Codex 官方流程负责。"),
            configure: capability(
              "available",
              "可通过现有 Provider 保存与切换合同配置。",
            ),
          },
          evidenceLabel: "Codex Provider 读取、保存与切换命令",
        },
        {
          id: "claude-code",
          displayName: "Claude Code",
          description: "可通过 FyAgent Provider 管理进行受限的模型配置。",
          officialUrl: "https://www.anthropic.com/claude-code",
          status: "manual_install",
          actions: {
            browse: capability(
              "available",
              "可打开 Claude Code 官方产品入口。",
            ),
            observe: capability(
              "available",
              "可读取 FyAgent 中的 Provider 汇总和当前选择。",
            ),
            install: capability(
              "assisted",
              "安装由 Claude Code 官方流程负责。",
            ),
            configure: capability(
              "available",
              "可通过现有 Provider 保存与切换合同配置。",
            ),
          },
          evidenceLabel: "Claude Provider 读取、保存与切换命令",
        },
      ],
    };
    const quickSetupIds = {
      codex: "fyagent-v2-quick-setup-codex",
      claude: "fyagent-v2-quick-setup-claude",
    } as const;
    const providers: Record<string, Record<string, Record<string, unknown>>> = {
      codex: {
        "fixture-codex-current": {
          id: "fixture-codex-current",
          name: "Fixture Codex Current",
        },
      },
      claude: {
        "fixture-claude-current": {
          id: "fixture-claude-current",
          name: "Fixture Claude Current",
        },
      },
    };
    const currentProviderIds: Record<string, string> = {
      codex: "fixture-codex-current",
      claude: "fixture-claude-current",
    };
    if (fixtureOptions.existingQuickSetup) {
      const app = fixtureOptions.existingQuickSetup;
      const id = quickSetupIds[app];
      providers[app][id] = {
        id,
        name: `Existing ${app} quick setup`,
      };
    }
    let workBuddyRevision = "fixture-revision-1";
    let workBuddyModelIds = ["existing-model"];
    let workBuddySaveAttempts = 0;
    const calls: FeatureFixtureCall[] = [];

    const delay = async (milliseconds = 0) => {
      if (milliseconds <= 0) return;
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, milliseconds);
      });
    };

    window.__FYAGENT_FEATURE_FIXTURE__ = { calls };
    window.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: "main" },
        currentWebview: { label: "main", windowLabel: "main" },
      },
      invoke: async (
        command: string,
        payload: Record<string, unknown> = {},
      ) => {
        calls.push({
          command,
          payload: structuredClone(payload),
        });
        switch (command) {
          case "get_agent_catalog":
            if (fixtureOptions.catalogFailure) {
              throw new Error("fixture catalog unavailable");
            }
            return structuredClone(catalog);
          case "get_workbuddy_status":
            if (fixtureOptions.observationFailure === "workbuddy") {
              throw {
                code: "WORKBUDDY_CONFIG_READ_FAILED",
                messageKey: "workbuddy.error.configReadFailed",
                details: {},
              };
            }
            return {
              path: ".workbuddy/models.json",
              exists: true,
              modelCount: workBuddyModelIds.length,
              revision: workBuddyRevision,
              backupExists: true,
              format: "objectRoot",
            };
          case "get_workbuddy_model_ids":
            return {
              ids: structuredClone(workBuddyModelIds),
              revision: workBuddyRevision,
            };
          case "fetch_workbuddy_models":
            return {
              models: ["fixture-model-alpha", "fixture-model-beta"],
              truncated: false,
            };
          case "save_workbuddy_models": {
            await delay(fixtureOptions.workBuddyWriteDelayMs);
            workBuddySaveAttempts += 1;
            if (fixtureOptions.workBuddySave === "failure") {
              throw {
                code: "WORKBUDDY_CONFIG_WRITE_FAILED",
                messageKey: "workbuddy.error.configWriteFailed",
                details: {},
              };
            }
            if (fixtureOptions.workBuddySave === "concurrent_modification") {
              return { state: "concurrent_modification" };
            }
            const request = payload.request as
              | Record<string, unknown>
              | undefined;
            if (
              fixtureOptions.workBuddySave === "overwrite_then_saved" &&
              workBuddySaveAttempts === 1
            ) {
              return {
                state: "overwrite_confirmation_required",
                token: "fixture-opaque-overwrite-token",
                existingIds: ["existing-model"],
              };
            }
            if (
              fixtureOptions.workBuddySave === "overwrite_then_saved" &&
              request?.overwriteToken !== "fixture-opaque-overwrite-token"
            ) {
              throw {
                code: "WORKBUDDY_OVERWRITE_TOKEN_INVALID",
                messageKey: "workbuddy.error.overwriteTokenInvalid",
                details: {},
              };
            }
            workBuddyModelIds = [
              ...new Set(
                [
                  ...((request?.selectedModelIds as string[] | undefined) ??
                    []),
                  ...((request?.manualModelIds as string[] | undefined) ?? []),
                ].filter(Boolean),
              ),
            ];
            workBuddyRevision = `fixture-revision-${workBuddySaveAttempts + 1}`;
            return {
              state: "saved",
              revision: workBuddyRevision,
              modelCount: workBuddyModelIds.length,
              createdEntries: workBuddyModelIds.length,
              updatedEntries: 0,
            };
          }
          case "get_provider_summary": {
            const app = String(payload.app);
            if (fixtureOptions.observationFailure === app) {
              throw new Error(
                `fixture ${app} Provider observation unavailable`,
              );
            }
            return {
              providers: structuredClone(providers[app] ?? {}),
              currentId: currentProviderIds[app] ?? "",
            };
          }
          case "apply_provider_quick_setup_with_result": {
            await delay(fixtureOptions.providerWriteDelayMs);
            if (fixtureOptions.providerMutation === "save_failure") {
              throw new Error("fixture Provider atomic apply rejected");
            }
            if (fixtureOptions.providerMutation === "switch_failure") {
              throw {
                code: "APPLY_FAILED_ROLLED_BACK",
                message: "fixture Provider atomic apply rolled back",
              };
            }
            const app = String(payload.app);
            const request = structuredClone(
              payload.request as Record<string, unknown>,
            );
            const providerId = `fyagent-v2-quick-setup-${app}`;
            providers[app] ??= {};
            providers[app][providerId] = {
              id: providerId,
              name: String(request.name),
            };
            currentProviderIds[app] = providerId;
            return {
              value: { warnings: [] },
              liveConfigChanged: app === "codex",
              app,
              warningCodes:
                app === "codex" ? ["CODEX_WEBSOCKET_NON_GPT_MODEL"] : [],
            };
          }
          case "open_external":
            if (fixtureOptions.openExternalFailure) {
              throw new Error("fixture external open rejected");
            }
            return undefined;
          case "get_installed_skills":
            return structuredClone(skills);
          case "get_mcp_servers":
            return structuredClone(mcpServers);
          case "toggle_skill_app": {
            const skill = skills.find((item) => item.id === payload.id);
            const app = String(payload.app);
            if (skill) skill.apps[app] = Boolean(payload.enabled);
            return Boolean(skill);
          }
          case "toggle_mcp_app": {
            const server =
              mcpServers[String(payload.serverId) as keyof typeof mcpServers];
            const app = String(payload.app);
            if (server) server.apps[app] = Boolean(payload.enabled);
            return undefined;
          }
          case "get_skill_backups":
          case "scan_unmanaged_skills":
          case "discover_available_skills":
          case "check_skill_updates":
          case "get_skill_repos":
            return [];
          case "search_skills_sh":
            return { skills: [], totalCount: 0, query: payload.query ?? "" };
          case "get_settings":
            return { skillSyncMethod: "auto", skillStorageLocation: "fyagent" };
          case "plugin:event|emit":
            return undefined;
          default:
            throw new Error(`Unexpected fixture command: ${command}`);
        }
      },
    };
  }, options);
}

export async function featureFixtureCalls(
  page: Page,
): Promise<FeatureFixtureCall[]> {
  return page.evaluate(() => window.__FYAGENT_FEATURE_FIXTURE__.calls);
}
