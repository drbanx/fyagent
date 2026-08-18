import { describe, expect, it } from "vitest";

import { MCP_CATALOG, findCatalogItem } from "@/v2/pages/mcp/catalog";
import { DEFAULT_NEW_APPS } from "@/v2/pages/mcp/constants";
import { mcpPresets } from "@/v2/shared/features/presets";
import { UserFacingError } from "@/v2/shared/features/helpers";
import {
  mcpUrlSearchToken,
  redactMcpArgs,
} from "@/v2/shared/features/mcpSecurity";

function item(id: string) {
  const catalogItem = MCP_CATALOG.find((entry) => entry.id === id);
  if (!catalogItem) throw new Error(`missing catalog item ${id}`);
  return catalogItem;
}

describe("MCP curated catalog", () => {
  it("ships the first-wave items and keeps unverified entries out", () => {
    expect(MCP_CATALOG.map((entry) => entry.id)).toEqual([
      "amap",
      "baidu-map",
      "feishu",
      "dingtalk",
      "yunxiao",
      "context7",
      "playwright",
      "filesystem",
      "time",
      "memory",
      "fetch",
    ]);
    expect(findCatalogItem("time")?.name).toBe("Time");
    expect(findCatalogItem("unknown-server")).toBeUndefined();
  });

  it("builds Windows and macOS npx commands", () => {
    const playwright = item("playwright");
    expect(playwright.build({}, DEFAULT_NEW_APPS, "windows").server).toEqual({
      type: "stdio",
      command: "cmd",
      args: ["/c", "npx", "-y", "@playwright/mcp@latest"],
    });
    expect(playwright.build({}, DEFAULT_NEW_APPS, "macos").server).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    });
    expect(playwright.build({}, DEFAULT_NEW_APPS, "unknown").server).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    });
  });

  it("requires business fields before building credentialed items", () => {
    expect(() => item("amap").build({}, DEFAULT_NEW_APPS, "macos")).toThrow(
      UserFacingError,
    );
    expect(() =>
      item("filesystem").build({ paths: [] }, DEFAULT_NEW_APPS, "macos"),
    ).toThrow(UserFacingError);
    expect(() =>
      item("dingtalk").build(
        {
          clientId: "id",
          clientSecret: "secret",
          profiles: ["ALL"],
        },
        DEFAULT_NEW_APPS,
        "macos",
      ),
    ).toThrow(UserFacingError);
  });

  it("puts the Amap key in the URL and keeps it out of the search token", () => {
    const server = item("amap").build(
      { key: "amap-query-secret" },
      DEFAULT_NEW_APPS,
      "macos",
    );
    expect(server.server).toEqual({
      type: "http",
      url: "https://mcp.amap.com/mcp?key=amap-query-secret",
    });
    expect(mcpUrlSearchToken(server.server.url ?? "")).toBe(
      "https://mcp.amap.com/mcp",
    );
  });

  it("masks the Feishu app secret in display args", () => {
    const server = item("feishu").build(
      { appId: "cli_app", appSecret: "feishu-app-secret" },
      DEFAULT_NEW_APPS,
      "windows",
    );
    expect(server.server.command).toBe("cmd");
    expect(redactMcpArgs(server.server.args ?? [])).toEqual([
      "/c",
      "npx",
      "-y",
      "@larksuiteoapi/lark-mcp",
      "mcp",
      "-a",
      "cli_app",
      "-s",
      "••••••",
    ]);
    expect(JSON.stringify(server.apps)).toEqual(
      JSON.stringify({
        claude: true,
        codex: true,
        gemini: true,
        grokbuild: true,
        opencode: false,
        hermes: false,
      }),
    );
  });

  it("stores Baidu and DingTalk secrets in env rather than the command line", () => {
    const baidu = item("baidu-map").build(
      { apiKey: "baidu-ak" },
      DEFAULT_NEW_APPS,
      "macos",
    );
    expect(baidu.server.env).toEqual({ BAIDU_MAP_API_KEY: "baidu-ak" });
    const dingtalk = item("dingtalk").build(
      {
        clientId: "ding-id",
        clientSecret: "ding-secret",
        profiles: ["chatbot", "calendar"],
      },
      DEFAULT_NEW_APPS,
      "macos",
    );
    expect(dingtalk.server.env).toEqual({
      DINGTALK_Client_ID: "ding-id",
      DINGTALK_Client_Secret: "ding-secret",
      ACTIVE_PROFILES: "chatbot,calendar",
    });
    expect(dingtalk.server.env?.ACTIVE_PROFILES).not.toBe("ALL");
  });

  it("builds Yunxiao and Context7 as Streamable HTTP", () => {
    const yunxiao = item("yunxiao").build(
      { token: "yunxiao-token", toolsets: ["codeup", "flow"] },
      DEFAULT_NEW_APPS,
      "macos",
    );
    expect(yunxiao.server).toEqual({
      type: "http",
      url: "https://openapi-rdc.aliyuncs.com/ai/mcp?toolsets=codeup%2Cflow",
      headers: { Authorization: "Bearer yunxiao-token" },
    });
    const context7 = item("context7").build({}, DEFAULT_NEW_APPS, "macos");
    expect(context7.server).toEqual({
      type: "http",
      url: "https://mcp.context7.com/mcp",
    });
  });

  it("keeps time and fetch catalog commands aligned with presets", () => {
    const time = item("time").build({}, DEFAULT_NEW_APPS, "windows");
    const fetch = item("fetch").build({}, DEFAULT_NEW_APPS, "windows");
    expect(mcpPresets.find((preset) => preset.id === "time")?.server).toEqual(
      time.server,
    );
    expect(mcpPresets.find((preset) => preset.id === "fetch")?.server).toEqual(
      fetch.server,
    );
    expect(
      item("memory").build({}, DEFAULT_NEW_APPS, "windows").server,
    ).toEqual({
      type: "stdio",
      command: "cmd",
      args: ["/c", "npx", "-y", "@modelcontextprotocol/server-memory"],
    });
  });
});
