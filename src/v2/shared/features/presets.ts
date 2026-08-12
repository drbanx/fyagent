import type { McpServer } from "./types";

export interface McpPreset {
  id: string;
  name: string;
  server: McpServer["server"];
  tags?: string[];
  homepage?: string;
  docs?: string;
  source?: string;
}

function npxCommand(packageName: string): { command: string; args: string[] } {
  const windows =
    typeof navigator !== "undefined" &&
    /windows|win32|win64/i.test(`${navigator.platform} ${navigator.userAgent}`);
  return windows
    ? { command: "cmd", args: ["/c", "npx", "-y", packageName] }
    : { command: "npx", args: ["-y", packageName] };
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
  {
    id: "time",
    name: "@modelcontextprotocol/server-time",
    tags: ["stdio", "time", "utility"],
    server: {
      type: "stdio",
      ...npxCommand("@modelcontextprotocol/server-time"),
    },
    homepage: "https://github.com/modelcontextprotocol/servers",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
  },
  {
    id: "memory",
    name: "@modelcontextprotocol/server-memory",
    tags: ["stdio", "memory", "graph"],
    server: {
      type: "stdio",
      ...npxCommand("@modelcontextprotocol/server-memory"),
    },
    homepage: "https://github.com/modelcontextprotocol/servers",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
  },
  {
    id: "sequential-thinking",
    name: "@modelcontextprotocol/server-sequential-thinking",
    tags: ["stdio", "thinking", "reasoning"],
    server: {
      type: "stdio",
      ...npxCommand("@modelcontextprotocol/server-sequential-thinking"),
    },
    homepage: "https://github.com/modelcontextprotocol/servers",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
  },
  {
    id: "context7",
    name: "@upstash/context7-mcp",
    tags: ["stdio", "docs", "search"],
    server: { type: "stdio", ...npxCommand("@upstash/context7-mcp") },
    homepage: "https://context7.com",
    docs: "https://github.com/upstash/context7/blob/master/README.md",
  },
];
