import { describe, expect, it, vi } from "vitest";

import {
  buildMcpSearchText,
  convergeSelection,
  overlayKnownMcpFields,
  parseAdvancedServerJson,
  parseKeyValueLines,
  runSequentialBulk,
  sanitizeMcpConfigurationError,
} from "@/v2/shared/features/helpers";
import { createAssignments, type McpServer } from "@/v2/shared/features/types";

describe("V2 feature helpers", () => {
  it("converges selection to a visible item", () => {
    const items = [{ id: "a" }, { id: "b" }];
    expect(convergeSelection(items, "b")).toBe("b");
    expect(convergeSelection(items, "gone")).toBe("a");
    expect(convergeSelection([], "gone")).toBeNull();
  });

  it("never adds MCP env or headers to searchable text", () => {
    const server: McpServer = {
      id: "demo",
      name: "Visible",
      description: "Safe",
      apps: createAssignments(),
      server: {
        type: "stdio",
        command: "npx",
        env: { SECRET_TOKEN: "ultra-secret-value" },
        headers: { Authorization: "Bearer private-token" },
      },
    };
    const text = buildMcpSearchText(server);
    expect(text).toContain("visible");
    expect(text).toContain("npx");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("private-token");
    expect(text).not.toContain("authorization");
  });

  it("does not echo secret-bearing MCP configuration errors", () => {
    expect(
      sanitizeMcpConfigurationError(
        new Error("Authorization header contains secret-token"),
      ),
    ).toBe("MCP 配置中的敏感字段未通过校验，请检查对应字段格式");
    expect(sanitizeMcpConfigurationError(new Error("URL is required"))).toBe(
      "MCP 配置中的 URL 未通过校验，请检查连接地址",
    );
    expect(
      sanitizeMcpConfigurationError(
        new Error("value xyz-unknown was rejected"),
      ),
    ).toBe("MCP 配置保存失败，请检查服务器字段");
  });

  it("parses env and headers at the required earliest separator", () => {
    expect(parseKeyValueLines("TOKEN=a=b", "env")).toEqual({
      value: { TOKEN: "a=b" },
      errors: [],
    });
    expect(parseKeyValueLines("Authorization: Bearer=a", "headers")).toEqual({
      value: { Authorization: "Bearer=a" },
      errors: [],
    });
    expect(parseKeyValueLines("malformed", "env").errors).toEqual([
      "第 1 行格式无效",
    ]);
  });

  it("rejects containers and preserves extensions during quick overlays", () => {
    expect(() => parseAdvancedServerJson('{"mcpServers":{}}')).toThrow(
      "完整配置列表",
    );
    expect(
      overlayKnownMcpFields(
        { command: "old", env: { SECRET: "x" }, extension: { keep: true } },
        { type: "http", url: "https://example.com" },
      ),
    ).toEqual({
      extension: { keep: true },
      type: "http",
      url: "https://example.com",
    });
  });

  it("runs bulk operations sequentially and reports partial failure", async () => {
    const order: string[] = [];
    const operation = vi.fn(async (id: string) => {
      order.push(id);
      if (id === "b") throw new Error("failed");
    });
    const result = await runSequentialBulk(["a", "b", "c"], operation);
    expect(order).toEqual(["a", "b", "c"]);
    expect(result.successes).toEqual(["a", "c"]);
    expect(result.failures).toEqual([{ id: "b", error: "请稍后重试。" }]);
  });
});
