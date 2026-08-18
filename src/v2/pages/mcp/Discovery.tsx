import { useMemo, useState } from "react";

import {
  MCP_CATALOG,
  MCP_CATALOG_CATEGORIES,
  MCP_PROVENANCE_LABEL,
  catalogSearchText,
  matchesCatalogRecipe,
  type McpCatalogCategory,
  type McpCatalogItem,
  type McpInstallValues,
} from "./catalog";
import { DEFAULT_NEW_APPS } from "./constants";
import { InstallDialog } from "./InstallDialog";
import { currentMcpLaunchPlatform } from "../../shared/features/mcpLaunch";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
} from "../../shared/ui/primitives";
import type { McpServer, McpTargetId } from "../../shared/features/types";

const REQUIREMENT_LABEL: Record<
  McpCatalogItem["requirements"][number],
  string
> = {
  none: "无需本地运行时",
  node: "需要 Node.js / npx",
  uv: "需要 uv / uvx",
};

function requirementText(item: McpCatalogItem): string {
  return item.requirements
    .map((requirement) => REQUIREMENT_LABEL[requirement])
    .join(" · ");
}

function categoryLabels(item: McpCatalogItem): string {
  return item.categories
    .map(
      (category) =>
        MCP_CATALOG_CATEGORIES.find((entry) => entry.id === category)?.label ??
        category,
    )
    .join(" · ");
}

export function McpDiscovery({
  servers,
  busy,
  onInstall,
  onViewInstalled,
  onOpen,
}: {
  servers: readonly McpServer[];
  busy: boolean;
  onInstall: (server: McpServer) => Promise<boolean>;
  onViewInstalled: (id: string) => void;
  onOpen: (url: string) => void;
}) {
  const platform = currentMcpLaunchPlatform();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | McpCatalogCategory>("all");
  const [dialogItem, setDialogItem] = useState<McpCatalogItem | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [confirmItem, setConfirmItem] = useState<McpCatalogItem | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const installedById = useMemo(
    () => new Map(servers.map((server) => [server.id, server])),
    [servers],
  );

  const items = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return MCP_CATALOG.filter((item) => {
      if (category !== "all" && !item.categories.includes(category)) {
        return false;
      }
      if (!query) return true;
      return catalogSearchText(item).includes(query);
    });
  }, [category, search]);

  const closeDialog = () => {
    setDialogItem(null);
    setOverwrite(false);
  };

  const installBuilt = async (server: McpServer) => {
    setInstallingId(server.id);
    try {
      const installed = await onInstall(server);
      if (installed) closeDialog();
    } finally {
      setInstallingId(null);
    }
  };

  const installWithValues = (
    item: McpCatalogItem,
    values: McpInstallValues,
    apps: readonly McpTargetId[],
    replaceExisting: boolean,
  ) => {
    const existing = installedById.get(item.id);
    if (existing && !replaceExisting) {
      throw new Error("该 MCP 已存在");
    }
    void installBuilt(item.build(values, apps, platform));
  };

  const startInstall = (item: McpCatalogItem, replaceExisting: boolean) => {
    const existing = installedById.get(item.id);
    if (existing && !replaceExisting) return;
    if (item.fields.length > 0) {
      setOverwrite(replaceExisting);
      setDialogItem(item);
      return;
    }
    void installBuilt(item.build({}, DEFAULT_NEW_APPS, platform));
  };

  return (
    <div className="fy-mcp-discovery">
      <div className="fy-feature-toolbar">
        <Input
          type="search"
          aria-label="搜索精选 MCP"
          placeholder="搜索名称、描述、标签或厂商"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="fy-control-select"
          aria-label="分类筛选"
          value={category}
          onChange={(event) =>
            setCategory(event.target.value as "all" | McpCatalogCategory)
          }
        >
          {MCP_CATALOG_CATEGORIES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>
      {items.length === 0 ? (
        <EmptyState
          title="没有匹配的精选 MCP"
          description="试试其他关键词或分类。凭据不会参与搜索。"
        />
      ) : (
        <div className="fy-feature-grid" aria-label="精选 MCP">
          {items.map((item) => {
            const existing = installedById.get(item.id);
            const sameRecipe = existing
              ? matchesCatalogRecipe(item, existing, platform)
              : false;
            const pending = busy || installingId === item.id;
            return (
              <article key={item.id} className="fy-feature-card">
                <header className="fy-mcp-card-meta">
                  <h3>{item.name}</h3>
                  {item.recommended && <Badge tone="accent">推荐</Badge>}
                  <Badge>{MCP_PROVENANCE_LABEL[item.provenance]}</Badge>
                </header>
                <p>{item.description}</p>
                <p className="fy-mcp-card-note">{categoryLabels(item)}</p>
                <p className="fy-mcp-card-note">
                  {requirementText(item)} · 认证：{item.authLabel}
                </p>
                {item.risk && <p className="fy-mcp-card-note">{item.risk}</p>}
                <footer>
                  {existing && sameRecipe ? (
                    <>
                      <Button disabled>已安装</Button>
                      <Button onClick={() => onViewInstalled(item.id)}>
                        查看
                      </Button>
                    </>
                  ) : existing ? (
                    <>
                      <Button disabled>已存在</Button>
                      <Button onClick={() => onViewInstalled(item.id)}>
                        查看
                      </Button>
                      <Button
                        className="fy-control-button-primary"
                        disabled={pending}
                        onClick={() => setConfirmItem(item)}
                      >
                        重新配置
                      </Button>
                    </>
                  ) : (
                    <Button
                      className="fy-control-button-primary"
                      disabled={pending}
                      onClick={() => startInstall(item, false)}
                    >
                      {pending
                        ? "安装中…"
                        : item.fields.length > 0
                          ? "配置并安装"
                          : "安装"}
                    </Button>
                  )}
                  {item.docs && (
                    <button
                      type="button"
                      className="fy-mcp-card-link"
                      onClick={() => onOpen(item.docs!)}
                    >
                      文档
                    </button>
                  )}
                  {!item.docs && item.homepage && (
                    <button
                      type="button"
                      className="fy-mcp-card-link"
                      onClick={() => onOpen(item.homepage!)}
                    >
                      主页
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
      {dialogItem && (
        <InstallDialog
          key={`${dialogItem.id}:${overwrite ? "overwrite" : "new"}`}
          item={dialogItem}
          busy={busy || installingId === dialogItem.id}
          overwrite={overwrite}
          onClose={closeDialog}
          onInstall={(values, apps) =>
            installWithValues(dialogItem, values, apps, overwrite)
          }
        />
      )}
      <ConfirmDialog
        open={confirmItem !== null}
        title={`重新配置 ${confirmItem?.name ?? "MCP"}`}
        description="将覆盖现有配置。已填写的密钥以外的手动修改不会保留。"
        pending={busy}
        onCancel={() => setConfirmItem(null)}
        onConfirm={() => {
          const item = confirmItem;
          setConfirmItem(null);
          if (item) startInstall(item, true);
        }}
      />
    </div>
  );
}
