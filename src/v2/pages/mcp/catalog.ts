import { UserFacingError } from "../../shared/features/helpers";
import {
  buildNpxCommand,
  type McpLaunchPlatform,
} from "../../shared/features/mcpLaunch";
import { mcpRecipeIdentity } from "../../shared/features/mcpSecurity";
import {
  createMcpAssignments,
  type McpServer,
  type McpServerSpec,
  type McpTargetId,
} from "../../shared/features/types";

export type McpCatalogCategory =
  | "china"
  | "devtools"
  | "collab"
  | "maps"
  | "multimodal"
  | "basics";

export type McpProvenance = "official" | "reference" | "community";

export type McpInstallFieldType =
  | "text"
  | "password"
  | "path"
  | "select"
  | "multi-select";

export interface McpInstallFieldOption {
  value: string;
  label: string;
}

export interface McpInstallField {
  key: string;
  label: string;
  type: McpInstallFieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: readonly McpInstallFieldOption[];
}

export type McpInstallValues = Record<string, string | string[]>;

export interface McpCatalogItem {
  id: string;
  name: string;
  description: string;
  categories: readonly McpCatalogCategory[];
  tags: readonly string[];
  publisher: string;
  provenance: McpProvenance;
  homepage?: string;
  docs?: string;
  requirements: readonly ("none" | "node" | "uv")[];
  fields: readonly McpInstallField[];
  authLabel: string;
  risk?: string;
  recommended?: boolean;
  build(
    values: McpInstallValues,
    apps: readonly McpTargetId[],
    platform: McpLaunchPlatform,
  ): McpServer;
}

export const MCP_CATALOG_CATEGORIES: ReadonlyArray<{
  id: "all" | McpCatalogCategory;
  label: string;
}> = [
  { id: "all", label: "全部" },
  { id: "china", label: "国内服务" },
  { id: "devtools", label: "开发工具" },
  { id: "collab", label: "办公协作" },
  { id: "maps", label: "地图出行" },
  { id: "multimodal", label: "AI 多模态" },
  { id: "basics", label: "基础能力" },
];

const DINGTALK_PROFILES: readonly McpInstallFieldOption[] = [
  { value: "chatbot", label: "机器人" },
  { value: "calendar", label: "日历" },
  { value: "contact", label: "通讯录" },
  { value: "todo", label: "待办" },
];

const YUNXIAO_TOOLSETS: readonly McpInstallFieldOption[] = [
  { value: "codeup", label: "Codeup 代码" },
  { value: "projex", label: "Projex 项目" },
  { value: "flow", label: "流水线" },
  { value: "packages", label: "制品" },
];

function requiredText(
  values: McpInstallValues,
  key: string,
  label: string,
): string {
  const value = values[key];
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new UserFacingError(`请填写${label}`);
  return text;
}

function selectedList(values: McpInstallValues, key: string): string[] {
  const value = values[key];
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function assertRequiredFields(
  fields: readonly McpInstallField[],
  values: McpInstallValues,
): void {
  for (const field of fields) {
    if (!field.required) continue;
    if (field.type === "multi-select" || field.type === "path") {
      if (selectedList(values, field.key).length === 0) {
        throw new UserFacingError(`请填写${field.label}`);
      }
      continue;
    }
    requiredText(values, field.key, field.label);
  }
}

function catalogItem(
  config: Omit<McpCatalogItem, "build"> & {
    buildSpec: (
      values: McpInstallValues,
      platform: McpLaunchPlatform,
    ) => McpServerSpec;
  },
): McpCatalogItem {
  const { buildSpec, ...item } = config;
  return {
    ...item,
    build(values, apps, platform) {
      if (apps.length === 0) {
        throw new UserFacingError("请选择至少一个 Agent");
      }
      assertRequiredFields(item.fields, values);
      return {
        id: item.id,
        name: item.name,
        description: item.description,
        tags: [...item.tags],
        homepage: item.homepage,
        docs: item.docs,
        apps: createMcpAssignments(apps),
        server: buildSpec(values, platform),
      };
    },
  };
}

function npxSpec(
  packageName: string,
  platform: McpLaunchPlatform,
  extra: {
    extraArgs?: readonly string[];
    env?: Record<string, string>;
  } = {},
): McpServerSpec {
  const launch = buildNpxCommand(packageName, extra.extraArgs ?? [], platform);
  return {
    type: "stdio",
    ...launch,
    ...(extra.env ? { env: extra.env } : {}),
  };
}

export const MCP_CATALOG: readonly McpCatalogItem[] = [
  catalogItem({
    id: "amap",
    name: "高德地图 MCP",
    description: "地点搜索、路线规划、天气与地理编码。",
    categories: ["china", "maps"],
    tags: ["地图", "出行", "HTTP"],
    publisher: "高德开放平台",
    provenance: "official",
    homepage: "https://lbs.amap.com/api/mcp-server/summary",
    docs: "https://lbs.amap.com/api/mcp-server/summary",
    requirements: ["none"],
    authLabel: "API Key",
    recommended: true,
    fields: [
      {
        key: "key",
        label: "API Key",
        type: "password",
        required: true,
        help: "Key 仅用于生成 MCP 配置；普通详情与搜索会脱敏。",
      },
    ],
    buildSpec: (values) => ({
      type: "http",
      url: `https://mcp.amap.com/mcp?key=${requiredText(values, "key", "API Key")}`,
    }),
  }),
  catalogItem({
    id: "baidu-map",
    name: "百度地图 MCP",
    description: "地点检索、路线规划与地理编码。",
    categories: ["china", "maps"],
    tags: ["地图", "出行", "stdio"],
    publisher: "百度地图开放平台",
    provenance: "official",
    homepage: "https://lbsyun.baidu.com/faq/api?title=mcp/introduce",
    docs: "https://lbsyun.baidu.com/faq/api?title=mcp/introduce",
    requirements: ["node"],
    authLabel: "API Key",
    fields: [
      {
        key: "apiKey",
        label: "百度地图 API Key",
        type: "password",
        required: true,
      },
    ],
    buildSpec: (values, platform) =>
      npxSpec("@baidumap/mcp-server-baidu-map", platform, {
        env: {
          BAIDU_MAP_API_KEY: requiredText(values, "apiKey", "百度地图 API Key"),
        },
      }),
  }),
  catalogItem({
    id: "feishu",
    name: "飞书 OpenAPI MCP",
    description: "文档、消息、日历等企业协作能力。",
    categories: ["china", "collab"],
    tags: ["飞书", "办公", "stdio"],
    publisher: "飞书开放平台",
    provenance: "official",
    homepage:
      "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/mcp_integration/mcp_introduction",
    docs: "https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/mcp_integration/mcp_introduction",
    requirements: ["node"],
    authLabel: "App ID + Secret",
    risk: "可访问企业文档、消息与日历等数据。",
    fields: [
      { key: "appId", label: "App ID", type: "text", required: true },
      {
        key: "appSecret",
        label: "App Secret",
        type: "password",
        required: true,
      },
    ],
    buildSpec: (values, platform) =>
      npxSpec("@larksuiteoapi/lark-mcp", platform, {
        extraArgs: [
          "mcp",
          "-a",
          requiredText(values, "appId", "App ID"),
          "-s",
          requiredText(values, "appSecret", "App Secret"),
        ],
      }),
  }),
  catalogItem({
    id: "dingtalk",
    name: "钉钉 MCP",
    description: "通讯录、日历、机器人与待办等企业协作能力。",
    categories: ["china", "collab"],
    tags: ["钉钉", "办公", "stdio"],
    publisher: "钉钉开放平台",
    provenance: "official",
    homepage: "https://open.dingtalk.com/document/orgapp/mcp-server",
    docs: "https://open.dingtalk.com/document/orgapp/mcp-server",
    requirements: ["node"],
    authLabel: "Client ID + Secret",
    risk: "可访问企业通讯录、日程与待办等数据。",
    fields: [
      { key: "clientId", label: "Client ID", type: "text", required: true },
      {
        key: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
      },
      {
        key: "profiles",
        label: "能力 Profiles",
        type: "multi-select",
        required: true,
        help: "按需开启，不要一次授予全部能力。",
        options: DINGTALK_PROFILES,
      },
    ],
    buildSpec: (values, platform) => {
      const profiles = selectedList(values, "profiles");
      if (profiles.includes("ALL")) {
        throw new UserFacingError("请按需选择钉钉能力，不要使用全部授权。");
      }
      return npxSpec("dingtalk-mcp@latest", platform, {
        env: {
          DINGTALK_Client_ID: requiredText(values, "clientId", "Client ID"),
          DINGTALK_Client_Secret: requiredText(
            values,
            "clientSecret",
            "Client Secret",
          ),
          ACTIVE_PROFILES: profiles.join(","),
        },
      });
    },
  }),
  catalogItem({
    id: "yunxiao",
    name: "云效 DevOps MCP",
    description: "阿里云效代码、项目与流水线协作。",
    categories: ["china", "devtools"],
    tags: ["云效", "DevOps", "HTTP"],
    publisher: "阿里云云效",
    provenance: "official",
    homepage:
      "https://help.aliyun.com/zh/yunxiao/developer-reference/use-the-alibaba-cloud-devops-mcp-server",
    docs: "https://help.aliyun.com/zh/yunxiao/developer-reference/use-the-alibaba-cloud-devops-mcp-server",
    requirements: ["none"],
    authLabel: "Access Token",
    risk: "部分工具具有写操作，请按需限制 toolsets。",
    fields: [
      {
        key: "token",
        label: "Personal Access Token",
        type: "password",
        required: true,
      },
      {
        key: "toolsets",
        label: "Toolsets",
        type: "multi-select",
        options: YUNXIAO_TOOLSETS,
        help: "留空则使用远端默认能力集合。",
      },
    ],
    buildSpec: (values) => {
      const toolsets = selectedList(values, "toolsets");
      const url = toolsets.length
        ? `https://openapi-rdc.aliyuncs.com/ai/mcp?toolsets=${encodeURIComponent(toolsets.join(","))}`
        : "https://openapi-rdc.aliyuncs.com/ai/mcp";
      return {
        type: "http",
        url,
        headers: {
          Authorization: `Bearer ${requiredText(values, "token", "Personal Access Token")}`,
        },
      };
    },
  }),
  catalogItem({
    id: "context7",
    name: "Context7",
    description: "按库检索最新文档，辅助编码 Agent 引用正确 API。",
    categories: ["devtools"],
    tags: ["文档", "检索", "HTTP"],
    publisher: "Context7",
    provenance: "official",
    homepage: "https://context7.com",
    docs: "https://github.com/upstash/context7",
    requirements: ["none"],
    authLabel: "API Key（可选）",
    recommended: true,
    fields: [
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        help: "推荐填写；留空也可先注册远程连接。",
      },
    ],
    buildSpec: (values) => {
      const apiKey =
        typeof values.apiKey === "string" ? values.apiKey.trim() : "";
      return {
        type: "http",
        url: "https://mcp.context7.com/mcp",
        ...(apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {}),
      };
    },
  }),
  catalogItem({
    id: "playwright",
    name: "Playwright MCP",
    description: "浏览器自动化与页面探索。",
    categories: ["devtools"],
    tags: ["浏览器", "自动化", "stdio"],
    publisher: "Microsoft",
    provenance: "official",
    homepage: "https://github.com/microsoft/playwright-mcp",
    docs: "https://github.com/microsoft/playwright-mcp",
    requirements: ["node"],
    authLabel: "无",
    recommended: true,
    risk: "可访问网页、会话状态并执行页面操作；MCP 本身不是安全边界。",
    fields: [],
    buildSpec: (_values, platform) =>
      npxSpec("@playwright/mcp@latest", platform),
  }),
  catalogItem({
    id: "filesystem",
    name: "Filesystem",
    description: "按白名单目录读写本地文件。",
    categories: ["basics"],
    tags: ["文件", "本地", "stdio"],
    publisher: "Model Context Protocol",
    provenance: "reference",
    homepage: "https://github.com/modelcontextprotocol/servers",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
    requirements: ["node"],
    authLabel: "目录白名单",
    risk: "本地文件高权限。必须指定允许目录，空目录不等于全盘。",
    fields: [
      {
        key: "paths",
        label: "允许目录",
        type: "path",
        required: true,
        placeholder: "每行一个目录",
        help: "至少填写一个明确目录。",
      },
    ],
    buildSpec: (values, platform) => {
      const paths = selectedList(values, "paths");
      if (paths.length === 0) {
        throw new UserFacingError("请至少指定一个允许目录");
      }
      return npxSpec("@modelcontextprotocol/server-filesystem", platform, {
        extraArgs: paths,
      });
    },
  }),
  catalogItem({
    id: "time",
    name: "Time",
    description: "查询时间与时区转换。",
    categories: ["basics"],
    tags: ["时间", "工具", "stdio"],
    publisher: "Model Context Protocol",
    provenance: "reference",
    homepage: "https://github.com/modelcontextprotocol/servers",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/time",
    requirements: ["uv"],
    authLabel: "无",
    recommended: true,
    fields: [],
    buildSpec: () => ({
      type: "stdio",
      command: "uvx",
      args: ["mcp-server-time"],
    }),
  }),
  catalogItem({
    id: "memory",
    name: "Memory",
    description: "本地知识图谱记忆，供会话间回忆。",
    categories: ["basics"],
    tags: ["记忆", "stdio"],
    publisher: "Model Context Protocol",
    provenance: "reference",
    homepage: "https://github.com/modelcontextprotocol/servers",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
    requirements: ["node"],
    authLabel: "无",
    fields: [],
    buildSpec: (_values, platform) =>
      npxSpec("@modelcontextprotocol/server-memory", platform),
  }),
  catalogItem({
    id: "fetch",
    name: "Fetch",
    description: "抓取网页内容供模型阅读。",
    categories: ["basics"],
    tags: ["网页", "抓取", "stdio"],
    publisher: "Model Context Protocol",
    provenance: "reference",
    homepage: "https://github.com/modelcontextprotocol/servers",
    docs: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
    requirements: ["uv"],
    authLabel: "无",
    risk: "可能访问本地或内部地址，请确认目标范围。",
    fields: [],
    buildSpec: () => ({
      type: "stdio",
      command: "uvx",
      args: ["mcp-server-fetch"],
    }),
  }),
];

export const MCP_PROVENANCE_LABEL: Record<McpProvenance, string> = {
  official: "官方",
  reference: "官方参考实现",
  community: "社区",
};

export function findCatalogItem(id: string): McpCatalogItem | undefined {
  return MCP_CATALOG.find((item) => item.id === id);
}

export function catalogSearchText(item: McpCatalogItem): string {
  return [
    item.id,
    item.name,
    item.description,
    item.publisher,
    item.authLabel,
    ...item.tags,
    ...item.categories.map(
      (category) =>
        MCP_CATALOG_CATEGORIES.find((entry) => entry.id === category)?.label ??
        category,
    ),
  ]
    .join("\n")
    .toLocaleLowerCase();
}

export function catalogRecipeIdentity(
  item: McpCatalogItem,
  platform: McpLaunchPlatform,
): string {
  const placeholders: McpInstallValues = {};
  for (const field of item.fields) {
    if (field.type === "multi-select") {
      placeholders[field.key] = field.options?.[0]
        ? [field.options[0].value]
        : ["placeholder"];
      continue;
    }
    if (field.type === "path") {
      placeholders[field.key] = ["C:\\catalog-placeholder"];
      continue;
    }
    placeholders[field.key] = "placeholder";
  }
  return mcpRecipeIdentity(
    item.build(placeholders, ["claude"], platform).server,
  );
}

export function matchesCatalogRecipe(
  item: McpCatalogItem,
  server: McpServer,
  platform: McpLaunchPlatform,
): boolean {
  return (
    mcpRecipeIdentity(server.server) === catalogRecipeIdentity(item, platform)
  );
}
