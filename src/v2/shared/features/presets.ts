import type { McpServer } from "./types";
import { detectNativePlatform } from "../platform/runtime";

export interface McpPreset {
  id: string;
  name: string;
  server: McpServer["server"];
  tags?: string[];
  homepage?: string;
  docs?: string;
  source?: string;
}

type NativePlatform = ReturnType<typeof detectNativePlatform>;

function isWindows(platform: NativePlatform): boolean {
  return platform === "windows";
}

function isMacOS(platform: NativePlatform): boolean {
  return platform === "macos";
}

function npxCommand(
  packageName: string,
): { command: string; args: string[] } | null {
  const platform = detectNativePlatform(globalThis.navigator);
  if (isWindows(platform)) {
    return { command: "cmd", args: ["/c", "npx", "-y", packageName] };
  }
  if (isMacOS(platform)) {
    return { command: "npx", args: ["-y", packageName] };
  }
  return null;
}

function npxPreset(
  id: string,
  packageName: string,
  tags: string[],
  docs: string,
  homepage: string = docs,
): McpPreset | null {
  const command = npxCommand(packageName);
  if (!command) return null;
  return {
    id,
    name: packageName,
    tags,
    server: { type: "stdio", ...command },
    homepage,
    docs,
  };
}

export const mcpPresets: readonly McpPreset[] = [
  {
    id: "fetch",
    name: "mcp-server-fetch",
    tags: ["stdio", "http", "web"],
    server: { type: "stdio", command: "uvx", args: ["mcp-server-fetch"] },
    homepage: "https://github.com/modelcontextprotocol/servers",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  npxPreset(
    "time",
    "@modelcontextprotocol/server-time",
    ["stdio", "time", "utility"],
    "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
    "https://github.com/modelcontextprotocol/servers",
  ),
  npxPreset(
    "memory",
    "@modelcontextprotocol/server-memory",
    ["stdio", "memory", "graph"],
    "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    "https://github.com/modelcontextprotocol/servers",
  ),
  npxPreset(
    "sequential-thinking",
    "@modelcontextprotocol/server-sequential-thinking",
    ["stdio", "thinking", "reasoning"],
    "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    "https://github.com/modelcontextprotocol/servers",
  ),
  npxPreset(
    "context7",
    "@upstash/context7-mcp",
    ["stdio", "docs", "search"],
    "https://github.com/upstash/context7/blob/master/README.md",
    "https://context7.com",
  ),
].filter((preset): preset is McpPreset => preset !== null);
