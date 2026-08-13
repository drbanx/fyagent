import { afterEach, describe, expect, it, vi } from "vitest";

async function loadPresets(platform: "windows" | "macos" | "unknown") {
  vi.doMock("@/v2/shared/platform/runtime", () => ({
    detectNativePlatform: () => platform,
  }));
  vi.resetModules();
  const [legacy, v2] = await Promise.all([
    import("@/config/mcpPresets"),
    import("@/v2/shared/features/presets"),
  ]);
  expect(legacy.mcpPresets).toBe(v2.mcpPresets);
  return legacy;
}

describe("MCP preset platform commands", () => {
  afterEach(() => {
    vi.doUnmock("@/v2/shared/platform/runtime");
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
