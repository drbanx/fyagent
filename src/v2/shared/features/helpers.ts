import type {
  DiscoverableSkill,
  InstalledSkill,
  McpServer,
  McpServerSpec,
  SkillTargetId,
} from "./types";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sanitizeMcpConfigurationError(error: unknown): string {
  const message = errorMessage(error);
  const importConflict = message.match(
    /配置冲突；未合并 (claude|codex|gemini|grokbuild|opencode|hermes) 分配/i,
  );
  if (importConflict) {
    const appLabels: Record<string, string> = {
      claude: "Claude",
      codex: "Codex",
      gemini: "Gemini",
      grokbuild: "Grok Build",
      opencode: "OpenCode",
      hermes: "Hermes",
    };
    const appLabel = appLabels[importConflict[1].toLocaleLowerCase()];
    return `检测到同名 MCP 服务器的配置冲突，未合并 ${appLabel} 分配；请统一两端配置或更改服务器 ID`;
  }
  if (message.includes("配置冲突")) {
    return "检测到同名 MCP 服务器的配置冲突；请统一两端配置或更改服务器 ID";
  }
  if (
    /env|header|authorization|token|secret|password|api[-_ ]?key/i.test(message)
  ) {
    return "MCP 配置中的敏感字段未通过校验，请检查对应字段格式";
  }
  if (/\burl\b/i.test(message)) {
    return "MCP 配置中的 URL 未通过校验，请检查连接地址";
  }
  if (/\b(command|args?|cwd|type|transport)\b/i.test(message)) {
    return "MCP 配置中的启动字段未通过校验，请检查传输类型与命令";
  }
  return "MCP 配置保存失败，请检查服务器字段";
}

export function convergeSelection<T extends { id: string }>(
  items: readonly T[],
  selectedId: string | null,
): string | null {
  if (selectedId && items.some((item) => item.id === selectedId)) {
    return selectedId;
  }
  return items[0]?.id ?? null;
}

export function buildSkillSearchText(skill: InstalledSkill): string {
  return [
    skill.name,
    skill.id,
    skill.description,
    skill.directory,
    skill.repoOwner,
    skill.repoName,
    skill.repoOwner && skill.repoName
      ? `${skill.repoOwner}/${skill.repoName}`
      : undefined,
  ]
    .filter(Boolean)
    .join("\n")
    .toLocaleLowerCase();
}

export function buildMcpSearchText(server: McpServer): string {
  const spec = server.server;
  return [
    server.id,
    server.name,
    server.description,
    ...(server.tags ?? []),
    spec.type,
    spec.command,
    ...(spec.args ?? []),
    spec.cwd,
    spec.url,
    server.homepage,
    server.docs,
    server.source,
  ]
    .filter((value): value is string => typeof value === "string")
    .join("\n")
    .toLocaleLowerCase();
}

function directoryTail(directory: string): string {
  return directory.split(/[/\\]/).filter(Boolean).at(-1)?.toLowerCase() ?? "";
}

export function isDiscoverableInstalled(
  discoverable: DiscoverableSkill,
  installed: readonly InstalledSkill[],
): boolean {
  const tail = directoryTail(discoverable.directory);
  return installed.some(
    (skill) =>
      directoryTail(skill.directory) === tail &&
      (skill.repoOwner ?? "").toLowerCase() ===
        discoverable.repoOwner.toLowerCase() &&
      (skill.repoName ?? "").toLowerCase() ===
        discoverable.repoName.toLowerCase(),
  );
}

export interface LineMapResult {
  value: Record<string, string>;
  errors: string[];
}

export function parseKeyValueLines(
  text: string,
  kind: "env" | "headers",
): LineMapResult {
  const value: Record<string, string> = {};
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    if (!rawLine.trim()) return;
    const equals = rawLine.indexOf("=");
    const colon = kind === "headers" ? rawLine.indexOf(":") : -1;
    const candidates = [equals, colon].filter((position) => position > 0);
    const separator = candidates.length ? Math.min(...candidates) : -1;
    if (separator < 1 || !rawLine.slice(0, separator).trim()) {
      errors.push(`第 ${index + 1} 行格式无效`);
      return;
    }
    value[rawLine.slice(0, separator).trim()] = rawLine
      .slice(separator + 1)
      .trim();
  });
  return { value, errors };
}

export function parseAdvancedServerJson(text: string): McpServerSpec {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式无效");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("JSON 必须是单个 MCP server 对象");
  }
  if ("mcpServers" in parsed) {
    throw new Error("请粘贴单个 server 对象，不要使用 mcpServers 容器");
  }
  return parsed as McpServerSpec;
}

export function overlayKnownMcpFields(
  original: McpServerSpec,
  known: McpServerSpec,
): McpServerSpec {
  const result = { ...original };
  for (const key of [
    "type",
    "command",
    "args",
    "env",
    "cwd",
    "url",
    "headers",
  ] as const) {
    delete result[key];
    const value = known[key];
    if (value !== undefined) {
      Object.assign(result, { [key]: value });
    }
  }
  return result;
}

export async function runSequentialBulk<T>(
  ids: readonly string[],
  operation: (id: string) => Promise<T>,
  onProgress?: (completed: number, total: number) => void,
): Promise<{
  successes: string[];
  failures: Array<{ id: string; error: string }>;
}> {
  const successes: string[] = [];
  const failures: Array<{ id: string; error: string }> = [];
  for (const [index, id] of ids.entries()) {
    try {
      await operation(id);
      successes.push(id);
    } catch (error) {
      failures.push({ id, error: errorMessage(error) });
    }
    onProgress?.(index + 1, ids.length);
  }
  return { successes, failures };
}

export function supportedFoundIn(foundIn: readonly string[]): SkillTargetId[] {
  const normalized = new Set(foundIn.map((value) => value.toLowerCase()));
  return [
    "claude",
    "codex",
    "gemini",
    "grokbuild",
    "opencode",
    "hermes",
    "qoderwork",
    "trae-work",
  ].filter((id): id is SkillTargetId => normalized.has(id));
}
