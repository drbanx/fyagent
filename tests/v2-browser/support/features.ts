import type { Page } from "@playwright/test";

export interface FeatureFixtureCall {
  command: string;
  payload: Record<string, unknown>;
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
): Promise<void> {
  await page.addInitScript(() => {
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
    const calls: FeatureFixtureCall[] = [];

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
  });
}

export async function featureFixtureCalls(
  page: Page,
): Promise<FeatureFixtureCall[]> {
  return page.evaluate(() => window.__FYAGENT_FEATURE_FIXTURE__.calls);
}
