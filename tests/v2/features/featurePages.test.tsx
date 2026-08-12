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
  type McpServer,
  type UnmanagedSkill,
} from "@/v2/shared/features/types";
import { createBrowserFeaturePorts } from "@/v2/shared/platform/browser/features";

function renderFeature(page: React.ReactNode, ports: FeaturePorts) {
  return render(<FeatureProvider ports={ports}>{page}</FeatureProvider>);
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

    await user.click(within(dialog).getByRole("tab", { name: "高级 JSON" }));
    const advanced = within(dialog).getByLabelText("单个 server JSON");
    const advancedValue = JSON.parse((advanced as HTMLTextAreaElement).value);
    advancedValue.secondExtension = "preserved";
    fireEvent.change(advanced, {
      target: { value: JSON.stringify(advancedValue) },
    });
    await user.click(within(dialog).getByRole("tab", { name: "快速配置" }));
    await user.click(within(dialog).getByRole("tab", { name: "高级 JSON" }));
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
    const ports = createBrowserFeaturePorts();
    ports.mcp.importFromApps = vi.fn(async () => 0);

    renderFeature(<McpPage />, ports);
    await screen.findByText("还没有 MCP 服务");
    await user.click(screen.getAllByRole("button", { name: "导入现有" })[0]);

    expect(await screen.findByText("没有发现可导入的 MCP")).toBeVisible();
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
    const importFromApps = vi.fn(async () => []);
    const ports = createBrowserFeaturePorts();
    ports.skills.scanUnmanaged = async () => [unmanaged];
    ports.skills.importFromApps = importFromApps;

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
  });
});
