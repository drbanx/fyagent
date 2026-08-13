import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { AgentsPage } from "@/v2/pages/agents/Page";
import type { FeaturePorts } from "@/v2/shared/features/ports";
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

function entry(
  id: AgentCatalogId,
  displayName: string,
  status: AgentCatalogEntry["status"],
): AgentCatalogEntry {
  const officialOnly = id === "qoderwork" || id === "trae-work";
  return {
    id,
    displayName,
    description: `${displayName} 的目录说明`,
    officialUrl: `https://official.example/${id}`,
    status,
    actions: {
      browse: available,
      observe: officialOnly ? pending : available,
      install: assisted,
      configure: officialOnly ? assisted : available,
    },
    evidenceLabel: `${displayName} 测试证据`,
  };
}

function catalog(): AgentCatalogResult {
  return {
    contractVersion: 1,
    reviewedAt: "2026-08-13",
    agents: [
      entry("qoderwork", "QoderWork CN", "pending_verification"),
      entry("trae-work", "TRAE Work", "pending_verification"),
      entry("workbuddy", "WorkBuddy", "manual_install"),
      entry("codex", "Codex", "manual_install"),
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
      "Codex手动安装",
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

  it("opens QoderWork and TRAE only through their catalog official URLs", async () => {
    const user = userEvent.setup();
    let releaseOpen!: () => void;
    const opening = new Promise<void>((resolve) => {
      releaseOpen = resolve;
    });
    const ports = configuredPorts();
    ports.settings.openExternal = vi.fn(() => opening);
    renderPage(ports);

    await user.click(await screen.findByRole("button", { name: /TRAE Work/ }));
    expect(
      screen.queryByRole("button", { name: "配置模型" }),
    ).not.toBeInTheDocument();

    const open = screen.getByRole("button", { name: "打开官方入口" });
    await user.click(open);
    expect(ports.settings.openExternal).toHaveBeenCalledWith(
      "https://official.example/trae-work",
    );
    expect(open).toBeDisabled();

    releaseOpen();
    await waitFor(() => expect(open).toBeEnabled());
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
    expect(
      await screen.findByText(/状态保持未知/, undefined, { timeout: 5_000 }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent("sk-super-secret");
    expect(document.body).not.toHaveTextContent("未安装");
    expect(document.body).not.toHaveTextContent("已验证");
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
