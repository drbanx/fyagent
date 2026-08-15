import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { McpPage } from "@/v2/pages/mcp/Page";
import { SkillsPage } from "@/v2/pages/skills/Page";
import type { FeaturePorts } from "@/v2/shared/features/ports";
import { FeatureProvider } from "@/v2/shared/features/provider";
import {
  createAssignments,
  type DiscoverableSkill,
  type InstalledSkill,
  type McpServer,
  type UnmanagedSkill,
} from "@/v2/shared/features/types";
import { createBrowserFeaturePorts } from "@/v2/shared/platform/browser/features";

function renderFeature(page: React.ReactNode, ports: FeaturePorts) {
  return render(<FeatureProvider ports={ports}>{page}</FeatureProvider>);
}

function installedSkill(id: string, name: string): InstalledSkill {
  return {
    id,
    name,
    directory: id,
    apps: createAssignments(["claude"]),
    installedAt: 1,
    updatedAt: 1,
  };
}

function discoverableSkill(): DiscoverableSkill {
  return {
    key: "acme/skills/review-skill",
    name: "Review Skill",
    description: "Review changes",
    directory: "review-skill",
    repoOwner: "acme",
    repoName: "skills",
    repoBranch: "main",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("V2 MCP management", () => {
  it("keeps secrets out of ordinary UI and preserves advanced extensions", async () => {
    const user = userEvent.setup();
    const secret = "ultra-private-token";
    const server: McpServer = {
      id: "docs",
      name: "Docs server",
      description: "Documentation helper",
      apps: { ...createAssignments(["claude"]), hiddenClient: true },
      server: {
        type: "stdio",
        command: "npx",
        env: { SECRET_TOKEN: secret },
        extension: { keep: true },
      },
    };
    const upsert = vi.fn(async (serverToSave: McpServer) => {
      void serverToSave;
    });
    const ports = createBrowserFeaturePorts();
    ports.mcp.getAll = async () => ({ docs: server });
    ports.mcp.upsert = upsert;

    renderFeature(<McpPage />, ports);

    expect(
      await screen.findByRole("heading", { name: "Docs server" }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(secret);
    expect(screen.getAllByRole("switch")).toHaveLength(6);
    expect(screen.getByText(/stdio · 1 Agent/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "编辑" }));
    const dialog = screen.getByRole("dialog", { name: "编辑 Docs server" });
    expect(within(dialog).getByDisplayValue(/SECRET_TOKEN/)).toHaveValue(
      `SECRET_TOKEN=${secret}`,
    );

    await user.click(within(dialog).getByRole("tab", { name: "JSON 编辑" }));
    const advanced = within(dialog).getByLabelText("单个服务配置（JSON）");
    const advancedValue = JSON.parse((advanced as HTMLTextAreaElement).value);
    advancedValue.secondExtension = "preserved";
    fireEvent.change(advanced, {
      target: { value: JSON.stringify(advancedValue) },
    });
    await user.click(within(dialog).getByRole("tab", { name: "快速配置" }));
    await user.click(within(dialog).getByRole("tab", { name: "JSON 编辑" }));
    expect((advanced as HTMLTextAreaElement).value).toContain(
      "secondExtension",
    );

    await user.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert.mock.calls[0][0]).toMatchObject({
      apps: { hiddenClient: true },
      server: {
        env: { SECRET_TOKEN: secret },
        extension: { keep: true },
        secondExtension: "preserved",
      },
    });
  });

  it("distinguishes a zero-result import", async () => {
    const user = userEvent.setup();
    let reads = 0;
    const ports = createBrowserFeaturePorts();
    ports.mcp.getAll = vi.fn(async () => {
      reads += 1;
      if (reads === 1) return {};
      throw new Error("MCP refresh unavailable");
    });
    ports.mcp.importFromApps = vi.fn(async () => 0);

    renderFeature(<McpPage />, ports);
    await screen.findByText("还没有 MCP 服务");
    await user.click(screen.getAllByRole("button", { name: "导入现有" })[0]);

    expect(await screen.findByText("没有发现可导入的 MCP")).toBeVisible();
    expect(
      await screen.findByText(/刷新失败，正在显示上一次成功数据/, undefined, {
        timeout: 4_000,
      }),
    ).toHaveTextContent("请稍后重试。");
    expect(document.body).not.toHaveTextContent("MCP refresh unavailable");
    expect(screen.getByText("还没有 MCP 服务")).toBeVisible();
    expect(screen.queryByText("无法加载 MCP")).not.toBeInTheDocument();
  });

  it("keeps cached MCP data visible when a write-triggered refresh fails", async () => {
    const user = userEvent.setup();
    const server: McpServer = {
      id: "docs",
      name: "Docs server",
      apps: createAssignments(["claude"]),
      server: { type: "stdio", command: "npx" },
    };
    let reads = 0;
    const getAll = vi.fn(async () => {
      reads += 1;
      if (reads === 1) return { docs: server };
      throw new Error("MCP refresh unavailable");
    });
    const ports = createBrowserFeaturePorts();
    ports.mcp.getAll = getAll;
    ports.mcp.toggleApp = vi.fn(async () => undefined);

    renderFeature(<McpPage />, ports);
    expect(
      await screen.findByRole("heading", { name: "Docs server" }),
    ).toBeVisible();

    const assignment = screen.getByRole("switch", {
      name: "Claude MCP 分配",
    });
    await user.click(assignment);

    expect(
      await screen.findByText(/刷新失败，正在显示上一次成功数据/, undefined, {
        timeout: 4_000,
      }),
    ).toHaveTextContent("请稍后重试。");
    expect(document.body).not.toHaveTextContent("MCP refresh unavailable");
    expect(screen.getByRole("heading", { name: "Docs server" })).toBeVisible();
    expect(assignment).toBeChecked();
    expect(screen.queryByText("无法加载 MCP")).not.toBeInTheDocument();
  });

  it("redacts backend configuration details from import and toggle errors", async () => {
    const user = userEvent.setup();
    const secret = "sk-sentinel-secret";
    const server: McpServer = {
      id: "docs",
      name: "Docs server",
      apps: createAssignments(["claude"]),
      server: { type: "stdio", command: "npx" },
    };
    const ports = createBrowserFeaturePorts();
    ports.mcp.getAll = async () => ({ docs: server });
    ports.mcp.importFromApps = vi.fn(async () => {
      throw new Error(`parser source: OPENAI_API_KEY = ${secret}`);
    });
    ports.mcp.toggleApp = vi.fn(async () => {
      throw new Error(`parser source: OPENAI_API_KEY = ${secret}`);
    });

    renderFeature(<McpPage />, ports);
    await screen.findByRole("heading", { name: "Docs server" });
    await user.click(screen.getAllByRole("button", { name: "导入现有" })[0]);
    expect(
      await screen.findByText(
        "MCP 配置中的敏感字段未通过校验，请检查对应字段格式",
      ),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent(secret);

    await user.click(screen.getByRole("switch", { name: "Claude MCP 分配" }));
    await waitFor(() => expect(ports.mcp.toggleApp).toHaveBeenCalledTimes(1));
    expect(document.body).not.toHaveTextContent(secret);
  });

  it("keeps cross-app import conflicts actionable without echoing the server ID", async () => {
    const user = userEvent.setup();
    const ports = createBrowserFeaturePorts();
    ports.mcp.importFromApps = vi.fn(async () => {
      throw new Error(
        "MCP 服务器 'secret-shaped-server-id' 在多个应用中的配置冲突；未合并 codex 分配",
      );
    });

    renderFeature(<McpPage />, ports);
    await screen.findByText("还没有 MCP 服务");
    await user.click(screen.getAllByRole("button", { name: "导入现有" })[0]);

    expect(
      await screen.findByText(
        "检测到同名 MCP 服务器的配置冲突，未合并 Codex 分配；请统一两端配置或更改服务器 ID",
      ),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent("secret-shaped-server-id");
  });
});

describe("V2 Skills management", () => {
  it("submits the supported foundIn intersection when importing unmanaged Skills", async () => {
    const user = userEvent.setup();
    const unmanaged: UnmanagedSkill = {
      directory: "review-skill",
      name: "Review Skill",
      foundIn: ["Claude", "CODEX", "openclaw"],
      path: "C:/tmp/review-skill",
    };
    const importFromApps = vi.fn(
      async (
        imports: Parameters<FeaturePorts["skills"]["importFromApps"]>[0],
      ) => {
        void imports;
        return [];
      },
    );
    let imported = false;
    const getRepos = vi.fn(async () =>
      imported
        ? [{ owner: "acme", name: "skills", branch: "main", enabled: true }]
        : [],
    );
    const ports = createBrowserFeaturePorts();
    ports.skills.scanUnmanaged = async () => [unmanaged];
    ports.skills.getRepos = getRepos;
    ports.skills.importFromApps = vi.fn(async (imports) => {
      imported = true;
      await importFromApps(imports);
      return [];
    });

    renderFeature(<SkillsPage />, ports);
    await screen.findByText("还没有安装 Skill");
    await user.click(screen.getByRole("button", { name: "更多" }));
    await user.click(screen.getByRole("button", { name: "导入本地 Skill" }));

    const dialog = await screen.findByRole("dialog", {
      name: "导入本地 Skills",
    });
    expect(
      within(dialog).getByRole("checkbox", { name: /Claude/ }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: /Codex/ }),
    ).toBeChecked();
    expect(
      within(dialog).getByRole("checkbox", { name: /Gemini/ }),
    ).not.toBeChecked();

    await user.click(
      within(dialog).getByRole("button", { name: "导入所选 · 1" }),
    );
    await waitFor(() => expect(importFromApps).toHaveBeenCalledTimes(1));
    expect(importFromApps).toHaveBeenCalledWith([
      {
        directory: "review-skill",
        apps: expect.objectContaining({
          claude: true,
          codex: true,
          gemini: false,
          grokbuild: false,
          opencode: false,
          hermes: false,
        }),
      },
    ]);
    await waitFor(() => expect(getRepos).toHaveBeenCalledTimes(2));
    await user.click(screen.getByRole("tab", { name: "发现" }));
    expect(screen.queryByText("尚未配置仓库")).not.toBeInTheDocument();
  });

  it("keeps cached Skills visible when a write-triggered refresh fails", async () => {
    const user = userEvent.setup();
    const skill = installedSkill("review-skill", "Review Skill");
    let reads = 0;
    const getInstalled = vi.fn(async () => {
      reads += 1;
      if (reads === 1) return [skill];
      throw new Error("Skills refresh unavailable");
    });
    const ports = createBrowserFeaturePorts();
    ports.skills.getInstalled = getInstalled;
    ports.skills.toggleApp = vi.fn(async () => true);

    renderFeature(<SkillsPage />, ports);
    expect(
      await screen.findByRole("heading", { name: "Review Skill" }),
    ).toBeVisible();

    const assignment = screen.getByRole("switch", {
      name: "Claude Skill 分配",
    });
    await user.click(assignment);

    expect(
      await screen.findByText(
        /刷新失败，正在显示上一次成功加载的数据/,
        undefined,
        { timeout: 4_000 },
      ),
    ).toHaveTextContent("请稍后重试。");
    expect(document.body).not.toHaveTextContent("Skills refresh unavailable");
    expect(screen.getByRole("heading", { name: "Review Skill" })).toBeVisible();
    expect(assignment).toBeChecked();
    expect(screen.queryByText("无法加载 Skills")).not.toBeInTheDocument();
  });

  it("refreshes update availability after a partially successful batch", async () => {
    const user = userEvent.setup();
    const alpha = installedSkill("alpha", "Alpha Skill");
    const beta = installedSkill("beta", "Beta Skill");
    let updateReads = 0;
    const checkUpdates = vi.fn(async () => {
      updateReads += 1;
      return updateReads === 1
        ? [
            { id: alpha.id, name: alpha.name, remoteHash: "alpha-next" },
            { id: beta.id, name: beta.name, remoteHash: "beta-next" },
          ]
        : [{ id: beta.id, name: beta.name, remoteHash: "beta-next" }];
    });
    const update = vi.fn(async (id: string) => {
      if (id === beta.id) throw new Error("Beta update failed");
      return alpha;
    });
    const ports = createBrowserFeaturePorts();
    ports.skills.getInstalled = async () => [alpha, beta];
    ports.skills.checkUpdates = checkUpdates;
    ports.skills.update = update;

    renderFeature(<SkillsPage />, ports);
    await screen.findByRole("heading", { name: "Alpha Skill" });
    await user.click(screen.getByRole("button", { name: "检查更新" }));
    const updateAll = await screen.findByRole("button", {
      name: "更新全部 · 2",
    });

    await user.click(updateAll);

    expect(
      await screen.findByRole("button", { name: "更新全部 · 1" }),
    ).toBeVisible();
    expect(update).toHaveBeenCalledTimes(2);
    expect(checkUpdates).toHaveBeenCalledTimes(2);
    expect(screen.getByText("批量更新完成失败")).toBeVisible();
    expect(screen.getByText("1 项失败，1 项成功")).toBeVisible();
  });

  it("keeps discovery installation locked until authority refresh completes", async () => {
    const user = userEvent.setup();
    const discoverable = discoverableSkill();
    const installed = {
      ...installedSkill("review-skill", "Review Skill"),
      repoOwner: discoverable.repoOwner,
      repoName: discoverable.repoName,
    };
    const refreshed = deferred<InstalledSkill[]>();
    let installedReads = 0;
    const ports = createBrowserFeaturePorts();
    ports.skills.getInstalled = vi.fn(() => {
      installedReads += 1;
      return installedReads === 1 ? Promise.resolve([]) : refreshed.promise;
    });
    ports.skills.getRepos = async () => [
      { owner: "acme", name: "skills", branch: "main", enabled: true },
    ];
    ports.skills.discover = async () => [discoverable];
    ports.skills.install = vi.fn(async () => installed);

    renderFeature(<SkillsPage />, ports);
    await screen.findByText("还没有安装 Skill");
    await user.click(screen.getByRole("tab", { name: "发现" }));
    const install = await screen.findByRole("button", {
      name: "安装到 Claude",
    });

    await user.click(install);
    await waitFor(() => expect(install).toBeDisabled());
    fireEvent.click(install);
    expect(ports.skills.install).toHaveBeenCalledTimes(1);

    refreshed.resolve([installed]);
    expect(
      await screen.findByRole("button", { name: "已安装" }),
    ).toBeDisabled();
    expect(ports.skills.getInstalled).toHaveBeenCalledTimes(2);
  });

  it("refreshes authority after a partially failed discovery installation", async () => {
    const user = userEvent.setup();
    const discoverable = discoverableSkill();
    const installed = {
      ...installedSkill("review-skill", "Review Skill"),
      repoOwner: discoverable.repoOwner,
      repoName: discoverable.repoName,
    };
    let backendInstalled = false;
    const getInstalled = vi.fn(async () =>
      backendInstalled ? [installed] : [],
    );
    const ports = createBrowserFeaturePorts();
    ports.skills.getInstalled = getInstalled;
    ports.skills.getRepos = async () => [
      { owner: "acme", name: "skills", branch: "main", enabled: true },
    ];
    ports.skills.discover = async () => [discoverable];
    ports.skills.install = vi.fn(async () => {
      backendInstalled = true;
      throw new Error("partial install");
    });

    renderFeature(<SkillsPage />, ports);
    await screen.findByText("还没有安装 Skill");
    await user.click(screen.getByRole("tab", { name: "发现" }));
    await user.click(
      await screen.findByRole("button", { name: "安装到 Claude" }),
    );

    expect(await screen.findByText("请稍后重试。")).toBeVisible();
    expect(screen.queryByText("partial install")).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "已安装" }),
    ).toBeDisabled();
    expect(getInstalled).toHaveBeenCalledTimes(2);
  });

  it("blocks discovery installation when installed authority is unavailable", async () => {
    const user = userEvent.setup();
    const ports = createBrowserFeaturePorts();
    ports.skills.getInstalled = vi.fn(async () => {
      throw new Error("installed authority unavailable");
    });
    ports.skills.getRepos = async () => [
      { owner: "acme", name: "skills", branch: "main", enabled: true },
    ];
    ports.skills.discover = async () => [discoverableSkill()];

    renderFeature(<SkillsPage />, ports);
    await user.click(screen.getByRole("tab", { name: "发现" }));

    expect(
      await screen.findByText("无法加载已安装 Skills", undefined, {
        timeout: 5_000,
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "安装到 Claude" }),
    ).not.toBeInTheDocument();
  });

  it("distinguishes an unavailable repository authority from an empty one", async () => {
    const user = userEvent.setup();
    const ports = createBrowserFeaturePorts();
    ports.skills.getRepos = vi.fn(async () => {
      throw new Error("repository authority unavailable");
    });
    ports.skills.discover = async () => [discoverableSkill()];

    renderFeature(<SkillsPage />, ports);
    await screen.findByText("还没有安装 Skill");
    await user.click(screen.getByRole("tab", { name: "发现" }));

    expect(
      await screen.findByText("无法加载仓库配置", undefined, {
        timeout: 5_000,
      }),
    ).toBeVisible();
    expect(screen.queryByText("尚未配置仓库")).not.toBeInTheDocument();
  });

  it("treats a cancelled ZIP picker as a no-op", async () => {
    const user = userEvent.setup();
    const getInstalled = vi.fn(async () => []);
    const ports = createBrowserFeaturePorts();
    ports.skills.getInstalled = getInstalled;
    ports.skills.pickZip = vi.fn(async () => null);
    ports.skills.installFromZip = vi.fn(async () => []);

    renderFeature(<SkillsPage />, ports);
    await screen.findByText("还没有安装 Skill");
    await user.click(screen.getByRole("button", { name: "更多" }));
    await user.click(screen.getByRole("button", { name: "从 ZIP 安装" }));

    await waitFor(() => expect(ports.skills.pickZip).toHaveBeenCalledTimes(1));
    expect(ports.skills.installFromZip).not.toHaveBeenCalled();
    expect(getInstalled).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("ZIP 安装完成")).not.toBeInTheDocument();
  });
});
