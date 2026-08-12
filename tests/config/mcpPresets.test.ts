import { afterEach, describe, expect, it, vi } from "vitest";

async function loadPresets(platform: "windows" | "macos" | "unknown") {
  vi.doMock("@/lib/platform", () => ({
    isMac: () => platform === "macos",
    isWindows: () => platform === "windows",
  }));
  vi.resetModules();
  return import("@/config/mcpPresets");
}

describe("MCP preset platform commands", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/platform");
    vi.resetModules();
  });

  it("wraps npx with cmd only on Windows", async () => {
    const { mcpPresets } = await loadPresets("windows");
    const time = mcpPresets.find((preset) => preset.id === "time");

    expect(time?.server).toMatchObject({
      type: "stdio",
      command: "cmd",
      args: ["/c", "npx", "-y", "@modelcontextprotocol/server-time"],
    });
  });

  it("uses direct npx only on macOS", async () => {
    const { mcpPresets } = await loadPresets("macos");
    const time = mcpPresets.find((preset) => preset.id === "time");

    expect(time?.server).toMatchObject({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-time"],
    });
  });

  it("does not publish platform-specific npx presets on an unknown host", async () => {
    const { mcpPresets } = await loadPresets("unknown");

    expect(mcpPresets.map((preset) => preset.id)).toEqual(["fetch"]);
  });
});
