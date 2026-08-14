import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ModelsPage } from "@/v2/pages/models/Page";
import { QUICK_SETUP_PROVIDER_IDS } from "@/v2/pages/models/quickSetup";
import { getAgentIcon } from "@/v2/shared/assets/agents";
import type { FeaturePorts } from "@/v2/shared/features/ports";
import { FeatureProvider } from "@/v2/shared/features/provider";
import type { AgentCatalogResult } from "@/v2/shared/features/types";
import { createBrowserFeaturePorts } from "@/v2/shared/platform/browser/features";

function renderPage(ports: FeaturePorts, target?: string) {
  const initialEntry = target ? `/models?target=${target}` : "/models";
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[initialEntry]}>
        <FeatureProvider ports={ports}>
          <ModelsPage />
        </FeatureProvider>
      </MemoryRouter>
    </StrictMode>,
  );
}

function catalog(): AgentCatalogResult {
  const capability = {
    state: "assisted" as const,
    reason: "测试仅允许打开官方入口。",
  };
  const browseCapability = {
    state: "available" as const,
    reason: "测试允许打开官方入口。",
  };
  return {
    contractVersion: 2,
    reviewedAt: "2026-08-14",
    agents: [
      {
        id: "qoderwork",
        displayName: "QoderWork CN",
        description: "QoderWork CN 官方辅助设置",
        officialLinks: [
          {
            id: "product",
            label: "打开 QoderWork 官方页面",
            url: "https://qoder.com.cn/qoderwork",
          },
        ],
        status: "pending_verification",
        actions: {
          browse: browseCapability,
          observe: capability,
          install: capability,
          configure: capability,
        },
        evidenceLabel: "测试目录合同",
      },
      {
        id: "trae-work",
        displayName: "TRAE Work",
        description: "TRAE Work 官方辅助设置",
        officialLinks: [
          {
            id: "desktop",
            label: "非产品链接应被忽略",
            url: "https://ignored.example.test/trae",
          },
          {
            id: "product",
            label: "打开 TRAE Work 官方页面",
            url: "https://work.trae.cn/",
          },
        ],
        status: "pending_verification",
        actions: {
          browse: browseCapability,
          observe: capability,
          install: capability,
          configure: capability,
        },
        evidenceLabel: "测试目录合同",
      },
    ],
  };
}

function workBuddyPorts(): FeaturePorts {
  const ports = createBrowserFeaturePorts();
  ports.workbuddy.getStatus = vi.fn<FeaturePorts["workbuddy"]["getStatus"]>(
    async () => ({
      path: "C:/redacted/models.json",
      exists: true,
      modelCount: 1,
      revision: "revision-1",
      backupExists: true,
      format: "objectRoot",
    }),
  );
  ports.workbuddy.getModelIds = vi.fn<FeaturePorts["workbuddy"]["getModelIds"]>(
    async () => ({
      ids: ["existing-model"],
      revision: "revision-1",
    }),
  );
  return ports;
}

describe("V2 Models page", () => {
  it("renders the exact selector order, local decorative icons, and QoderWork default", () => {
    const ports = createBrowserFeaturePorts();
    renderPage(ports);

    const selector = screen.getByRole("complementary", {
      name: "模型配置目标",
    });
    const buttons = within(selector).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "QoderWork CN官方辅助设置",
      "TRAE Work官方辅助设置",
      "WorkBuddy专用模型配置",
      "CodexProvider 快速配置",
      "Claude CodeProvider 快速配置",
    ]);

    const expectedIcons = [
      getAgentIcon("qoderwork"),
      getAgentIcon("trae-work"),
      getAgentIcon("workbuddy"),
      getAgentIcon("codex"),
      getAgentIcon("claude-code"),
    ];
    buttons.forEach((button, index) => {
      const icon = button.querySelector("img");
      expect(icon).toHaveAttribute("src", expectedIcons[index]);
      expect(icon).toHaveAttribute("alt", "");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    });
    expect(screen.getByTestId("model-target-qoderwork")).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(
      screen.getByRole("region", { name: "QoderWork CN 官方辅助设置" }),
    ).toBeVisible();
  });

  it("opens the explicit product link instead of relying on array position", async () => {
    const user = userEvent.setup();
    const ports = createBrowserFeaturePorts();
    ports.catalog.get = vi.fn(async () => catalog());
    ports.settings.openExternal = vi.fn(async () => undefined);
    renderPage(ports, "trae");

    await user.click(
      await screen.findByRole("button", { name: "打开官方设置" }),
    );
    expect(ports.settings.openExternal).toHaveBeenCalledWith(
      "https://work.trae.cn/",
    );
    expect(ports.settings.openExternal).not.toHaveBeenCalledWith(
      "https://ignored.example.test/trae",
    );
  });

  it("freezes the WorkBuddy overwrite request, rereads authority, and clears credentials", async () => {
    const user = userEvent.setup();
    const ports = workBuddyPorts();
    ports.workbuddy.saveModels = vi
      .fn()
      .mockResolvedValueOnce({
        state: "overwrite_confirmation_required",
        token: "opaque-overwrite-token",
        existingIds: ["existing-model"],
      })
      .mockResolvedValueOnce({
        state: "saved",
        revision: "revision-2",
        modelCount: 1,
        createdEntries: 0,
        updatedEntries: 1,
      });
    renderPage(ports, "workbuddy");

    await screen.findByText("已发现配置文件");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://workbuddy.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "first-secret");
    await user.type(screen.getByLabelText("手动模型 ID"), "manual-model");
    await user.click(screen.getByRole("button", { name: "保存并应用" }));

    const confirm = await screen.findByRole("button", { name: "确认覆盖" });
    expect(screen.getByLabelText("API Key")).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://changed.example/v1" },
    });
    fireEvent.change(screen.getByLabelText("API Key"), {
      target: { value: "replacement-secret" },
    });
    fireEvent.change(screen.getByLabelText("手动模型 ID"), {
      target: { value: "replacement-model" },
    });
    await user.click(confirm);

    await screen.findByText("WorkBuddy 模型配置已保存");
    expect(ports.workbuddy.saveModels).toHaveBeenCalledTimes(2);
    const firstRequest = vi.mocked(ports.workbuddy.saveModels).mock.calls[0][0];
    const secondRequest = vi.mocked(ports.workbuddy.saveModels).mock
      .calls[1][0];
    expect(firstRequest).toEqual({
      baseUrl: "https://workbuddy.example/v1",
      apiKey: "first-secret",
      allowNoApiKey: false,
      selectedModelIds: [],
      manualModelIds: ["manual-model"],
      clearExistingApiKeys: false,
      expectedRevision: "revision-1",
    });
    expect(secondRequest).toEqual({
      ...firstRequest,
      overwriteToken: "opaque-overwrite-token",
    });
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(ports.workbuddy.getStatus).toHaveBeenCalledTimes(2);
    expect(ports.workbuddy.getModelIds).toHaveBeenCalledTimes(2);
  });

  it("locks duplicate WorkBuddy fetches, preserves truncation, and clears the key", async () => {
    const user = userEvent.setup();
    const ports = workBuddyPorts();
    type FetchResult = Awaited<
      ReturnType<FeaturePorts["workbuddy"]["fetchModels"]>
    >;
    let resolveFetch!: (result: FetchResult) => void;
    const pendingFetch = new Promise<FetchResult>((resolve) => {
      resolveFetch = resolve;
    });
    ports.workbuddy.fetchModels = vi.fn(() => pendingFetch);
    renderPage(ports, "workbuddy");

    await screen.findByText("已发现配置文件");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://fetch.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "fetch-secret");
    const fetchButton = screen.getByRole("button", { name: "拉取模型" });
    fireEvent.click(fetchButton);
    fireEvent.click(fetchButton);

    expect(ports.workbuddy.fetchModels).toHaveBeenCalledTimes(1);
    expect(ports.workbuddy.fetchModels).toHaveBeenCalledWith({
      baseUrl: "https://fetch.example/v1",
      apiKey: "fetch-secret",
      allowNoApiKey: false,
    });
    resolveFetch({ models: ["model-a", "model-b"], truncated: true });

    expect(await screen.findByText("模型列表已按安全上限截断")).toBeVisible();
    expect(screen.getByText("model-a")).toBeVisible();
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(document.body).not.toHaveTextContent("fetch-secret");
  });

  it("redacts WorkBuddy fetch failures and clears the submitted key", async () => {
    const user = userEvent.setup();
    const ports = workBuddyPorts();
    ports.workbuddy.fetchModels = vi.fn(async () => {
      throw new Error("fetch-secret must not escape");
    });
    renderPage(ports, "workbuddy");

    await screen.findByText("已发现配置文件");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://failure.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "fetch-secret");
    await user.click(screen.getByRole("button", { name: "拉取模型" }));

    expect(await screen.findByText("模型读取失败")).toBeVisible();
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(document.body).not.toHaveTextContent("fetch-secret");
  });

  it("rejects a WorkBuddy success response whose model ID contains the submitted key", async () => {
    const user = userEvent.setup();
    const ports = workBuddyPorts();
    ports.workbuddy.fetchModels = vi.fn(async () => ({
      models: ["safe-model", "prefix-fetch-secret-suffix"],
      truncated: false,
    }));
    ports.workbuddy.saveModels = vi.fn();
    renderPage(ports, "workbuddy");

    await screen.findByText("已发现配置文件");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://hostile.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "fetch-secret");
    await user.click(screen.getByRole("button", { name: "拉取模型" }));

    expect(await screen.findByText("模型读取失败")).toBeVisible();
    expect(screen.queryByText("safe-model")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("fetch-secret");
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(ports.workbuddy.saveModels).not.toHaveBeenCalled();
  });

  it("blocks a WorkBuddy save whose model ID contains the submitted key", async () => {
    const user = userEvent.setup();
    const ports = workBuddyPorts();
    ports.workbuddy.saveModels = vi.fn();
    renderPage(ports, "workbuddy");

    await screen.findByText("已发现配置文件");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://conflict.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "conflict-secret");
    await user.type(
      screen.getByLabelText("手动模型 ID"),
      "prefix-conflict-secret-suffix",
    );
    await user.click(screen.getByRole("button", { name: "保存并应用" }));

    expect(await screen.findByText("模型 ID 与敏感凭据冲突")).toBeVisible();
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(ports.workbuddy.saveModels).not.toHaveBeenCalled();
  });

  it("does not claim a WorkBuddy authoritative reread when either refresh fails", async () => {
    const user = userEvent.setup();
    const ports = workBuddyPorts();
    vi.mocked(ports.workbuddy.getStatus)
      .mockResolvedValueOnce({
        path: "C:/redacted/models.json",
        exists: true,
        modelCount: 1,
        revision: "revision-1",
        backupExists: true,
        format: "objectRoot",
      })
      .mockRejectedValue(new Error("status refresh failed"));
    ports.workbuddy.saveModels = vi.fn(async () => ({
      state: "concurrent_modification" as const,
    }));
    renderPage(ports, "workbuddy");

    await screen.findByText("已发现配置文件");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://conflict.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "conflict-secret");
    await user.type(screen.getByLabelText("手动模型 ID"), "conflict-model");
    await user.click(screen.getByRole("button", { name: "保存并应用" }));

    expect(
      await screen.findByText("权威状态回读未完成；请刷新状态后再次提交。"),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent("权威状态已重新读取");
    expect(screen.getByLabelText("API Key")).toHaveValue("");
  });

  it("does not claim a reread after an expired overwrite token when refresh fails", async () => {
    const user = userEvent.setup();
    const ports = workBuddyPorts();
    vi.mocked(ports.workbuddy.getModelIds)
      .mockResolvedValueOnce({
        ids: ["existing-model"],
        revision: "revision-1",
      })
      .mockRejectedValue(new Error("model IDs refresh failed"));
    ports.workbuddy.saveModels = vi
      .fn()
      .mockResolvedValueOnce({
        state: "overwrite_confirmation_required" as const,
        token: "expired-token",
        existingIds: ["existing-model"],
      })
      .mockRejectedValueOnce({
        code: "WORKBUDDY_OVERWRITE_TOKEN_EXPIRED",
        messageKey: "workbuddy.error.overwriteTokenExpired",
        details: {},
      });
    renderPage(ports, "workbuddy");

    await screen.findByText("已发现配置文件");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://expired.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "expired-secret");
    await user.type(screen.getByLabelText("手动模型 ID"), "expired-model");
    await user.click(screen.getByRole("button", { name: "保存并应用" }));
    await user.click(await screen.findByRole("button", { name: "确认覆盖" }));

    expect(await screen.findByText("覆盖确认已失效")).toBeVisible();
    expect(
      screen.getByText("权威状态回读未完成；请刷新状态后重新提交。"),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent("权威状态已重新读取");
    expect(screen.getByLabelText("API Key")).toHaveValue("");
  });

  it("blocks WorkBuddy saves while authoritative local state is unavailable", async () => {
    const ports = workBuddyPorts();
    ports.workbuddy.getStatus = vi.fn(async () => {
      throw new Error("status unavailable");
    });
    ports.workbuddy.getModelIds = vi.fn(async () => {
      throw new Error("model IDs unavailable");
    });
    ports.workbuddy.saveModels = vi.fn();
    renderPage(ports, "workbuddy");

    expect(
      await screen.findByText(
        "WorkBuddy 状态暂不可用；这不代表未安装或未配置。",
        undefined,
        { timeout: 5_000 },
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "保存并应用" })).toBeDisabled();
    expect(ports.workbuddy.saveModels).not.toHaveBeenCalled();
  });

  it("atomically applies Codex once with the exact provider payload", async () => {
    const user = userEvent.setup();
    const ports = createBrowserFeaturePorts();
    let currentProviderId = "current-codex";
    ports.providers.getSummary = vi.fn(async () => ({
      providers: {},
      currentId: currentProviderId,
    }));
    type ApplyResult = Awaited<
      ReturnType<FeaturePorts["providers"]["applyQuickSetupWithResult"]>
    >;
    let resolveApply!: (result: ApplyResult) => void;
    const pendingApply = new Promise<ApplyResult>((resolve) => {
      resolveApply = resolve;
    });
    ports.providers.applyQuickSetupWithResult = vi.fn<
      FeaturePorts["providers"]["applyQuickSetupWithResult"]
    >(() => pendingApply);
    renderPage(ports, "codex");

    await screen.findByText("尚不存在，将新增");
    await user.clear(screen.getByLabelText("配置名称"));
    await user.type(screen.getByLabelText("配置名称"), "Codex Gateway");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://codex.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "codex-secret");
    await user.type(screen.getByLabelText("模型 ID"), "gpt-5");
    const submit = screen.getByRole("button", { name: "保存并切换" });
    await user.click(submit);
    expect(submit).toBeDisabled();
    fireEvent.click(submit);
    expect(ports.providers.applyQuickSetupWithResult).toHaveBeenCalledTimes(1);
    currentProviderId = QUICK_SETUP_PROVIDER_IDS.codex;
    resolveApply({
      value: { warnings: [] },
      liveConfigChanged: true,
      app: "codex" as const,
      warningCodes: ["CODEX_WEBSOCKET_PROXY_MAY_BE_UNSUPPORTED"],
    });

    await screen.findByText(
      "本次配置已原子应用；固定 Quick Setup Provider ID 已确认激活",
    );
    expect(ports.providers.applyQuickSetupWithResult).toHaveBeenCalledTimes(1);
    expect(ports.providers.applyQuickSetupWithResult).toHaveBeenCalledWith(
      {
        name: "Codex Gateway",
        baseUrl: "https://codex.example/v1",
        apiKey: "codex-secret",
        modelId: "gpt-5",
      },
      "codex",
    );
    expect(
      screen.getByText("当前代理可能不支持 WebSocket Upgrade。"),
    ).toBeVisible();
    expect(screen.getByText(/Codex live 配置字节已更新/)).toBeVisible();
    expect(
      screen.getByText(
        /权威摘要回读仅确认固定 Provider ID 已激活，不验证本次配置内容字节/,
      ),
    ).toBeVisible();
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(ports.providers.getSummary).toHaveBeenCalledTimes(2);
  });

  it("treats an unclassified apply failure as unknown and stops writes", async () => {
    const user = userEvent.setup();
    const ports = createBrowserFeaturePorts();
    ports.providers.getSummary = vi.fn(async () => ({
      providers: {
        [QUICK_SETUP_PROVIDER_IDS.claude]: {
          id: QUICK_SETUP_PROVIDER_IDS.claude,
          name: "Sanitized existing Provider",
        },
      },
      currentId: "another-provider",
    }));
    ports.providers.applyQuickSetupWithResult = vi.fn(async () => {
      throw new Error("atomic response contains claude-secret");
    });
    renderPage(ports, "claude");

    await screen.findByText("已存在，将更新");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://claude.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "claude-secret");
    await user.type(screen.getByLabelText("模型 ID"), "claude-model");
    await user.click(screen.getByRole("button", { name: "保存并切换" }));

    await screen.findByText("Provider 状态未知，请停止继续写入");
    expect(ports.providers.applyQuickSetupWithResult).toHaveBeenCalledTimes(1);
    expect(ports.providers.applyQuickSetupWithResult).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.any(String),
        baseUrl: "https://claude.example/v1",
        apiKey: "claude-secret",
        modelId: "claude-model",
      }),
      "claude",
    );
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(document.body).not.toHaveTextContent("claude-secret");
    expect(ports.providers.getSummary).toHaveBeenCalledTimes(2);
    expect(
      screen.getByRole("button", { name: "状态未知，已停止写入" }),
    ).toBeDisabled();
  });

  it("stops further writes when the backend reports partial rollback", async () => {
    const user = userEvent.setup();
    const ports = createBrowserFeaturePorts();
    ports.providers.getSummary = vi.fn(async () => ({
      providers: {},
      currentId: "",
    }));
    ports.providers.applyQuickSetupWithResult = vi.fn(async () => {
      throw {
        code: "ROLLBACK_PARTIAL_STATE_UNKNOWN",
        hidden: "partial-secret",
      };
    });
    renderPage(ports, "codex");

    await screen.findByText("尚不存在，将新增");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://partial.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "partial-secret");
    await user.type(screen.getByLabelText("模型 ID"), "gpt-partial");
    await user.click(screen.getByRole("button", { name: "保存并切换" }));

    await screen.findByText("Provider 状态未知，请停止继续写入");
    expect(document.body).not.toHaveTextContent("partial-secret");
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(ports.providers.applyQuickSetupWithResult).toHaveBeenCalledTimes(1);
    const blockedButton = screen.getByRole("button", {
      name: "状态未知，已停止写入",
    });
    expect(blockedButton).toBeDisabled();
    await user.click(blockedButton);
    expect(ports.providers.applyQuickSetupWithResult).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("model-target-claude"));
    await screen.findByRole("heading", { name: "Claude Code" });
    await user.click(screen.getByTestId("model-target-codex"));
    expect(
      await screen.findByRole("button", {
        name: "状态未知，已停止写入",
      }),
    ).toBeDisabled();
    expect(ports.providers.applyQuickSetupWithResult).toHaveBeenCalledTimes(1);
  });

  it("surfaces only a generic partial warning from an atomic apply", async () => {
    const user = userEvent.setup();
    const ports = createBrowserFeaturePorts();
    ports.providers.getSummary = vi.fn(async () => ({
      providers: {},
      currentId: QUICK_SETUP_PROVIDER_IDS.codex,
    }));
    ports.providers.applyQuickSetupWithResult = vi.fn(async () => ({
      value: { warnings: ["mcp_sync_failed"] },
      liveConfigChanged: true,
      app: "codex" as const,
      warningCodes: ["CODEX_WEBSOCKET_NON_GPT_MODEL" as const],
    }));
    renderPage(ports, "codex");

    await screen.findByText("尚不存在，将新增");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://partial.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "partial-secret");
    await user.type(screen.getByLabelText("模型 ID"), "gpt-partial");
    await user.click(screen.getByRole("button", { name: "保存并切换" }));

    await screen.findByText(
      "本次配置已原子应用；固定 Quick Setup Provider ID 已确认激活",
    );
    expect(
      screen.getByText(
        "当前 WebSocket 配置包含非 GPT 模型，兼容性需要自行确认。",
      ),
    ).toBeVisible();
    expect(screen.getByText(/非关键投影未完成/)).toBeVisible();
    expect(screen.getByLabelText("API Key")).toHaveValue("");
    expect(document.body).not.toHaveTextContent("partial-secret");
    expect(ports.providers.applyQuickSetupWithResult).toHaveBeenCalledTimes(1);
    expect(ports.providers.getSummary).toHaveBeenCalledTimes(2);
  });

  it("does not claim current Provider when the authoritative reread disagrees", async () => {
    const user = userEvent.setup();
    const ports = createBrowserFeaturePorts();
    ports.providers.getSummary = vi.fn(async () => ({
      providers: {},
      currentId: "another-provider",
    }));
    ports.providers.applyQuickSetupWithResult = vi.fn(async () => ({
      value: { warnings: [] },
      liveConfigChanged: true,
      app: "codex" as const,
    }));
    renderPage(ports, "codex");

    await screen.findByText("尚不存在，将新增");
    await user.type(
      screen.getByLabelText("Base URL"),
      "https://unconfirmed.example/v1",
    );
    await user.type(screen.getByLabelText("API Key"), "unconfirmed-secret");
    await user.type(screen.getByLabelText("模型 ID"), "gpt-unconfirmed");
    await user.click(screen.getByRole("button", { name: "保存并切换" }));

    expect(
      await screen.findByText(
        "本次配置已原子应用，但回读未确认固定 Quick Setup Provider ID 处于激活状态",
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(
        "本次配置已原子应用；固定 Quick Setup Provider ID 已确认激活",
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("API Key")).toHaveValue("");
  });

  it("clears credentials and third-party notes whenever their target unmounts", async () => {
    const user = userEvent.setup();
    const ports = workBuddyPorts();
    ports.catalog.get = vi.fn(async () => catalog());
    renderPage(ports, "workbuddy");

    await screen.findByText("已发现配置文件");
    await user.type(screen.getByLabelText("API Key"), "target-only-secret");
    await user.click(screen.getByTestId("model-target-qoderwork"));
    await screen.findByRole("heading", { name: "QoderWork CN" });
    await user.type(screen.getByLabelText("端点备注"), "transient-endpoint");
    await user.type(screen.getByLabelText("模型备注"), "transient-model");

    await user.click(screen.getByTestId("model-target-workbuddy"));
    expect(await screen.findByLabelText("API Key")).toHaveValue("");
    await user.click(screen.getByTestId("model-target-qoderwork"));
    expect(await screen.findByLabelText("端点备注")).toHaveValue("");
    expect(screen.getByLabelText("模型备注")).toHaveValue("");
  });
});
