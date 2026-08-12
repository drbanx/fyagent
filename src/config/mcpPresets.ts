import type { McpServer, McpServerSpec } from "../types";
import { isMac, isWindows } from "@/lib/platform";

export type McpPreset = Omit<McpServer, "enabled" | "description">;

// 创建受支持平台的 npx 命令配置。
// Windows 需要使用 cmd /c wrapper 来执行 npx.cmd
// macOS 可以直接执行 npx；未知平台不生成可执行预设。
const createNpxCommand = (
  packageName: string,
  extraArgs: string[] = [],
): { command: string; args: string[] } | null => {
  if (isWindows()) {
    return {
      command: "cmd",
      args: ["/c", "npx", ...extraArgs, packageName],
    };
  }
  if (isMac()) {
    return {
      command: "npx",
      args: [...extraArgs, packageName],
    };
  }
  return null;
};

const createNpxPreset = (
  id: string,
  packageName: string,
  tags: string[],
  docs: string,
  homepage: string = docs,
): McpPreset | null => {
  const command = createNpxCommand(packageName, ["-y"]);
  if (!command) return null;
  return {
    id,
    name: packageName,
    tags,
    server: {
      type: "stdio",
      ...command,
    } as McpServerSpec,
    homepage,
    docs,
  };
};

// 预设 MCP（逻辑简化版）：
// - 仅包含最常用、可快速落地的 stdio 模式示例
// - 不涉及分类/模板/测速等复杂逻辑，默认以 disabled 形式"回种"到 config.json
// - 用户可在 MCP 面板中一键启用/编辑
// - description 字段使用国际化 key，在使用时通过 t() 函数获取翻译
export const mcpPresets: McpPreset[] = [
  {
    id: "fetch",
    name: "mcp-server-fetch",
    tags: ["stdio", "http", "web"],
    server: {
      type: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    } as McpServerSpec,
    homepage: "https://github.com/modelcontextprotocol/servers",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  },
  createNpxPreset(
    "time",
    "@modelcontextprotocol/server-time",
    ["stdio", "time", "utility"],
    "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
    "https://github.com/modelcontextprotocol/servers",
  ),
  createNpxPreset(
    "memory",
    "@modelcontextprotocol/server-memory",
    ["stdio", "memory", "graph"],
    "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    "https://github.com/modelcontextprotocol/servers",
  ),
  createNpxPreset(
    "sequential-thinking",
    "@modelcontextprotocol/server-sequential-thinking",
    ["stdio", "thinking", "reasoning"],
    "https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking",
    "https://github.com/modelcontextprotocol/servers",
  ),
  createNpxPreset(
    "context7",
    "@upstash/context7-mcp",
    ["stdio", "docs", "search"],
    "https://github.com/upstash/context7/blob/master/README.md",
    "https://context7.com",
  ),
].filter((preset): preset is McpPreset => preset !== null);

// 获取带国际化描述的预设
export const getMcpPresetWithDescription = (
  preset: McpPreset,
  t: (key: string) => string,
): McpServer => {
  const descriptionKey = `mcp.presets.${preset.id}.description`;
  return {
    ...preset,
    description: t(descriptionKey),
  } as McpServer;
};

export default mcpPresets;
