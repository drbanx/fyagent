import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AgentsPage } from "@/v2/pages/agents/Page";
import type {
  CodexDesktopPort,
  FeaturePorts,
} from "@/v2/shared/features/ports";
import { FeatureProvider } from "@/v2/shared/features/provider";
import type {
  AgentActionCapability,
  AgentCatalogEntry,
  AgentCatalogId,
  AgentCatalogResult,
} from "@/v2/shared/features/types";
import { createBrowserFeaturePorts } from "@/v2/shared/platform/browser/features";

const available: AgentActionCapability = {
  state: "available",
  reason: "由测试中的原生合同提供。",
};

const assisted: AgentActionCapability = {
  state: "assisted",
  reason: "由厂商官方流程负责。",
};

const pending: AgentActionCapability = {
  state: "pending_verification",
  reason: "本地接入能力尚待验证。",
};

const notSupported: AgentActionCapability = {
  state: "not_supported",
  reason: "该动作不受支持。",
};

function entry(
  id: AgentCatalogId,
  displayName: string,
  status: AgentCatalogEntry["status"],
): AgentCatalogEntry {
  const officialOnly = id === "qoderwork" || id === "trae-work";
  const officialLinks: AgentCatalogEntry["officialLinks"] =
    id === "codex"
      ? []
      : id === "claude-code"
        ? [
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
          ]
        : [
            {
              id: "product",
              label: `打开 ${displayName} 官方页面`,
              url:
                id === "qoderwork"
                  ? "https://qoder.com.cn/qoderwork"
                  : id === "trae-work"
                    ? "https://work.trae.cn/"
                    : "https://www.workbuddy.cn/",
            },
          ];
  return {
    id,
    displayName,
    description: `${displayName} 的目录说明`,
    officialLinks,
    status,
    actions: {
      browse: id === "codex" ? notSupported : available,
      observe: officialOnly ? pending : available,
      install: id === "codex" ? available : assisted,
      configure: officialOnly ? assisted : available,
    },
    evidenceLabel: `${displayName} 测试证据`,
  };
}

function catalog(): AgentCatalogResult {
  return {
    contractVersion: 2,
    reviewedAt: "2026-08-14",
    agents: [
      entry("qoderwork", "QoderWork CN", "pending_verification"),
      entry("trae-work", "TRAE Work", "pending_verification"),
      entry("workbuddy", "WorkBuddy", "manual_install"),
      entry("codex", "Codex", "managed_install"),
      entry("claude-code", "Claude Code", "manual_install"),
    ],
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderPage(ports: FeaturePorts) {
  return render(
    <MemoryRouter initialEntries={["/agents"]}>
      <FeatureProvider ports={ports}>
        <AgentsPage />
        <LocationProbe />
      </FeatureProvider>
    </MemoryRouter>,
  );
}

function configuredPorts(): FeaturePorts {
  const ports = createBrowserFeaturePorts();
  ports.catalog.get = async () => catalog();
  ports.workbuddy.getStatus = async () => ({
    path: "C:/redacted/models.json",
    exists: true,
    modelCount: 3,
    revision: "opaque-revision",
    backupExists: true,
    format: "legacyArray",
  });
  ports.providers.getSummary = async (app) => ({
    providers: {
      [`fyagent-${app}`]: {
        id: `fyagent-${app}`,
        name: `${app} current`,
        websiteUrl: "https://provider.example",
        category: "custom",
      },
    },
    currentId: `fyagent-${app}`,
  });
  ports.codexDesktop = {
    getLocalStatus: async () => ({
      state: "not_installed",
      platform: "windows",
      architecture: "x86_64",
    }),
    checkLatest: async () => ({
      releaseId: `v1:${"a".repeat(64)}`,
      displayVersion: "1.2.3.4",
      platformVersion: {
        kind: "windows_msix",
        major: 1,
        minor: 2,
        build: 3,
        revision: 4,
      },
      expectedSize: 4096,
      checkedAt: "2026-08-14T00:00:00.000Z",
    }),
    getJob: async () => null,
    startInstall: vi.fn(),
    cancelInstall: vi.fn(),
    launch: vi.fn(),
    openLogDirectory: vi.fn(),
    subscribeJobUpdates: async () => () => undefined,
  } satisfies CodexDesktopPort;
  return ports;
}

describe("V2 Agent directory", () => {
  it("renders the native catalog in order and supports keyboard selection", async () => {
    const user = userEvent.setup();
    renderPage(configuredPorts());

    const selector = await screen.findByRole("region", {
      name: "Agent 选择",
    });
    const buttons = within(selector).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "QoderWork CN能力待验证",
      "TRAE Work能力待验证",
      "WorkBuddy手动安装",
      "Codex内置安装",
      "Claude Code手动安装",
    ]);
    expect(buttons[0]).toHaveAttribute("aria-current", "true");
    expect(
      screen.getByRole("region", { name: "QoderWork CN 详情" }),
    ).toBeVisible();

    await user.tab();
    expect(buttons[0]).toHaveFocus();
    await user.tab();
    expect(buttons[1]).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(buttons[1]).toHaveAttribute("aria-current", "true");
    expect(buttons[0]).not.toHaveAttribute("aria-current");
    expect(
      screen.getByRole("region", { name: "TRAE Work 详情" }),
    ).toBeVisible();
  });

  it("renders every catalog-owned official link and no Codex external action", async () => {
    const user = userEvent.setup();
    const ports = configuredPorts();
    ports.settings.openExternal = vi.fn(async () => undefined);
    renderPage(ports);

    await user.click(
      await screen.findByRole("button", {
        name: "打开 QoderWork CN 官方页面",
      }),
    );
    await user.click(await screen.findByRole("button", { name: /TRAE Work/ }));
    expect(
      screen.queryByRole("button", { name: "配置模型" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "打开 TRAE Work 官方页面" }),
    );

    await user.click(screen.getByRole("button", { name: /WorkBuddy/ }));
    await user.click(
      screen.getByRole("button", { name: "打开 WorkBuddy 官方页面" }),
    );

    await user.click(screen.getByRole("button", { name: /Claude Code/ }));
    await user.click(screen.getByRole("button", { name: "Claude Code CLI" }));
    await user.click(screen.getByRole("button", { name: "Claude Desktop" }));

    await user.click(screen.getByRole("button", { name: /^Codex/ }));
    const codexDetail = screen.getByRole("region", { name: "Codex 详情" });
    expect(
      within(codexDetail).queryByRole("button", { name: /官方|CLI/ }),
    ).not.toBeInTheDocument();

    expect(ports.settings.openExternal).toHaveBeenCalledTimes(5);
    expect(ports.settings.openExternal).toHaveBeenNthCalledWith(
      1,
      "https://qoder.com.cn/qoderwork",
    );
    expect(ports.settings.openExternal).toHaveBeenNthCalledWith(
      2,
      "https://work.trae.cn/",
    );
    expect(ports.settings.openExternal).toHaveBeenNthCalledWith(
      3,
      "https://www.workbuddy.cn/",
    );
    expect(ports.settings.openExternal).toHaveBeenNthCalledWith(
      4,
      "https://docs.anthropic.com/en/docs/claude-code/getting-started",
    );
    expect(ports.settings.openExternal).toHaveBeenNthCalledWith(
      5,
      "https://claude.com/download",
    );
  });

  it("keeps one open lock while showing pending state only on the active link", async () => {
    const user = userEvent.setup();
    let releaseOpen!: () => void;
    const opening = new Promise<void>((resolve) => {
      releaseOpen = resolve;
    });
    const ports = configuredPorts();
    ports.settings.openExternal = vi.fn(() => opening);
    renderPage(ports);

    await user.click(
      await screen.findByRole("button", { name: /Claude Code/ }),
    );
    const cliLink = screen.getByRole("button", { name: "Claude Code CLI" });
    const desktopLink = screen.getByRole("button", {
      name: "Claude Desktop",
    });
    await user.click(cliLink);
    expect(cliLink).toHaveTextContent("正在打开…");
    expect(desktopLink).toBeDisabled();
    expect(ports.settings.openExternal).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: /WorkBuddy/ }));
    const workBuddyLink = screen.getByRole("button", {
      name: "打开 WorkBuddy 官方页面",
    });
    expect(workBuddyLink).toBeDisabled();
    expect(workBuddyLink).toHaveTextContent("打开 WorkBuddy 官方页面");

    releaseOpen();
    await waitFor(() => expect(workBuddyLink).toBeEnabled());
  });

  it("lazily reads WorkBuddy status and navigates to its model target", async () => {
    const user = userEvent.setup();
    const ports = configuredPorts();
    ports.workbuddy.getStatus = vi.fn(ports.workbuddy.getStatus);
    renderPage(ports);

    await screen.findByRole("region", { name: "QoderWork CN 详情" });
    expect(ports.workbuddy.getStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /WorkBuddy/ }));
    const observation = await screen.findByRole("region", {
      name: "WorkBuddy 本机观察",
    });
    expect(within(observation).getByText("3")).toBeVisible();
    expect(within(observation).getByText("数组格式")).toBeVisible();
    expect(within(observation).getByText("存在")).toBeVisible();
    expect(ports.workbuddy.getStatus).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveTextContent("C:/redacted/models.json");
    expect(document.body).not.toHaveTextContent("opaque-revision");

    await user.click(screen.getByRole("button", { name: "配置模型" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/models?target=workbuddy",
    );
  });

  it("renders only sanitized Provider summaries and uses the Claude target", async () => {
    const user = userEvent.setup();
    const ports = configuredPorts();
    ports.providers.getSummary = vi.fn(ports.providers.getSummary);
    renderPage(ports);

    await user.click(
      await screen.findByRole("button", { name: /Claude Code/ }),
    );
    const observation = await screen.findByRole("region", {
      name: "Claude Code Provider 观察",
    });
    expect(within(observation).getByText("claude current")).toBeVisible();
    expect(within(observation).getByText("1")).toBeVisible();
    expect(observation).toHaveTextContent("不代表 Agent 已安装、已登录");
    expect(ports.providers.getSummary).toHaveBeenCalledWith("claude");

    await user.click(screen.getByRole("button", { name: "配置模型" }));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/models?target=claude",
    );
  });

  it("keeps an unavailable observation unknown and redacts backend text", async () => {
    const user = userEvent.setup();
    const ports = configuredPorts();
    ports.providers.getSummary = vi.fn(async () => {
      throw new Error("sk-super-secret provider read failed");
    });
    renderPage(ports);

    await user.click(await screen.findByRole("button", { name: /Codex/ }));
    const observation = await screen.findByRole("region", {
      name: "Codex Provider 观察",
    });
    expect(
      await within(observation).findByText(/状态保持未知/, undefined, {
        timeout: 5_000,
      }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent("sk-super-secret");
    expect(observation).not.toHaveTextContent("未安装");
    expect(observation).not.toHaveTextContent("已验证");
  });

  it("mounts the native installer only for Codex and cleans up on selection change", async () => {
    const user = userEvent.setup();
    const ports = configuredPorts();
    const cleanup = vi.fn();
    ports.codexDesktop.getLocalStatus = vi.fn(
      ports.codexDesktop.getLocalStatus,
    );
    ports.codexDesktop.subscribeJobUpdates = vi.fn(async () => cleanup);
    renderPage(ports);

    await screen.findByRole("region", { name: "QoderWork CN 详情" });
    expect(ports.codexDesktop.getLocalStatus).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: "Codex Desktop 安装器" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Codex/ }));
    expect(
      await screen.findByRole("region", { name: "Codex Desktop 安装器" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(ports.codexDesktop.getLocalStatus).toHaveBeenCalled(),
    );

    await user.click(screen.getByRole("button", { name: /WorkBuddy/ }));
    await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
    expect(
      screen.queryByRole("region", { name: "Codex Desktop 安装器" }),
    ).not.toBeInTheDocument();
  });

  it("does not replace an unavailable native catalog with static entries", async () => {
    const ports = configuredPorts();
    ports.catalog.get = vi.fn(async () => {
      throw new Error("catalog unavailable");
    });
    renderPage(ports);

    expect(
      await screen.findByRole(
        "heading",
        { name: "无法加载 Agent 目录" },
        { timeout: 5_000 },
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /QoderWork/ }),
    ).not.toBeInTheDocument();
    expect(ports.catalog.get).toHaveBeenCalledTimes(2);
  });
});
