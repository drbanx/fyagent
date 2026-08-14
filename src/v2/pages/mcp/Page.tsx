import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import {
  buildMcpSearchText,
  convergeSelection,
  errorMessage,
  overlayKnownMcpFields,
  parseAdvancedServerJson,
  parseKeyValueLines,
  runSequentialBulk,
  sanitizeMcpConfigurationError,
} from "../../shared/features/helpers";
import { mcpPresets } from "../../shared/features/presets";
import { useFeatures } from "../../shared/features/provider";
import { featureKeys, useMcpServers } from "../../shared/features/queries";
import { useWideFeatureLayout } from "../../shared/features/responsive";
import {
  createMcpAssignments,
  MCP_TARGETS,
  type McpServer,
  type McpServerSpec,
  type McpTargetId,
} from "../../shared/features/types";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  Dialog,
  EmptyState,
  InlineNotice,
  Input,
  Spinner,
} from "../../shared/ui/primitives";
import { AssignmentPanel } from "../../shared/ui/AssignmentPanel";

const DEFAULT_NEW_APPS: McpTargetId[] = [
  "claude",
  "codex",
  "gemini",
  "grokbuild",
];

function transportOf(server: McpServer): "stdio" | "http" | "sse" {
  if (server.server.type === "http" || server.server.type === "sse") {
    return server.server.type;
  }
  return "stdio";
}

function ServerDetail({
  server,
  busy,
  onToggle,
  onEdit,
  onDelete,
  onOpen,
  showAssignment,
}: {
  server: McpServer;
  busy: boolean;
  onToggle: (app: McpTargetId, enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpen: (url: string) => void;
  showAssignment: boolean;
}) {
  const spec = server.server;
  return (
    <section
      className="fy-feature-panel fy-feature-detail"
      aria-label="MCP 详情"
    >
      <div className="fy-feature-detail-title">
        <h2>{server.name}</h2>
        <Badge tone="accent">{transportOf(server)}</Badge>
      </div>
      {server.description && (
        <p className="fy-feature-description">{server.description}</p>
      )}
      {server.tags && server.tags.length > 0 && (
        <div className="fy-feature-actions">
          {server.tags.map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      )}
      <dl className="fy-feature-definition">
        <dt>ID</dt>
        <dd>
          <code className="fy-feature-code">{server.id}</code>
        </dd>
        {spec.command && (
          <>
            <dt>命令</dt>
            <dd>
              <code className="fy-feature-code">{spec.command}</code>
            </dd>
          </>
        )}
        {spec.args && spec.args.length > 0 && (
          <>
            <dt>参数</dt>
            <dd>
              {spec.args.map((argument) => (
                <code className="fy-feature-code" key={argument}>
                  {argument}
                </code>
              ))}
            </dd>
          </>
        )}
        {spec.cwd && (
          <>
            <dt>工作目录</dt>
            <dd>
              <code className="fy-feature-code">{spec.cwd}</code>
            </dd>
          </>
        )}
        {spec.url && (
          <>
            <dt>URL</dt>
            <dd>
              <code className="fy-feature-code">{spec.url}</code>
            </dd>
          </>
        )}
        {spec.env && (
          <>
            <dt>环境变量</dt>
            <dd>{Object.keys(spec.env).length} 项（仅在编辑器中可见）</dd>
          </>
        )}
        {spec.headers && (
          <>
            <dt>请求头</dt>
            <dd>{Object.keys(spec.headers).length} 项（仅在编辑器中可见）</dd>
          </>
        )}
        {server.source && (
          <>
            <dt>来源</dt>
            <dd>{server.source}</dd>
          </>
        )}
      </dl>
      <div className="fy-feature-actions">
        {server.homepage && (
          <Button onClick={() => onOpen(server.homepage!)}>主页</Button>
        )}
        {server.docs && (
          <Button onClick={() => onOpen(server.docs!)}>文档</Button>
        )}
        <Button onClick={onEdit} disabled={busy}>
          编辑
        </Button>
        <Button
          className="fy-control-button-danger"
          onClick={onDelete}
          disabled={busy}
        >
          删除
        </Button>
      </div>
      {showAssignment && (
        <div className="fy-feature-inline-assignment">
          <AssignmentPanel
            apps={server.apps}
            disabled={busy}
            labelSuffix="MCP 分配"
            onToggle={onToggle}
            targets={MCP_TARGETS}
          />
        </div>
      )}
    </section>
  );
}

export function McpPage() {
  const queryClient = useQueryClient();
  const { ports, notify } = useFeatures();
  const wideLayout = useWideFeatureLayout();
  const query = useMcpServers();
  const servers = useMemo(() => Object.values(query.data ?? {}), [query.data]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<McpServer | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McpServer | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const writeLock = useRef(false);
  const filtered = useMemo(() => {
    const value = search.trim().toLocaleLowerCase();
    return value
      ? servers.filter((server) => buildMcpSearchText(server).includes(value))
      : servers;
  }, [search, servers]);
  const convergedId = convergeSelection(filtered, selectedId);
  const selected = filtered.find((server) => server.id === convergedId) ?? null;
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: featureKeys.mcp });
  const write = async (title: string, operation: () => Promise<void>) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy(true);
    try {
      await operation();
      notify({ tone: "success", title });
    } catch (error) {
      notify({
        tone: "error",
        title: `${title}失败`,
        description: sanitizeMcpConfigurationError(error),
      });
    } finally {
      await refresh();
      setProgress(null);
      setBusy(false);
      writeLock.current = false;
    }
  };
  const toggle = (server: McpServer, app: McpTargetId, enabled: boolean) =>
    write("分配已更新", async () => {
      await ports.mcp.toggleApp(server.id, app, enabled);
    });
  const bulkAssign = (app: McpTargetId, enabled: boolean) =>
    write("批量分配完成", async () => {
      const ids = servers
        .filter((server) => Boolean(server.apps[app]) !== enabled)
        .map((server) => server.id);
      const result = await runSequentialBulk(
        ids,
        (id) => ports.mcp.toggleApp(id, app, enabled),
        (done, total) => setProgress({ done, total }),
      );
      if (result.failures.length)
        throw new Error(
          `${result.failures.length} 项失败，${result.successes.length} 项成功`,
        );
    });
  const openExternal = async (url: string) => {
    try {
      await ports.settings.openExternal(url);
    } catch (error) {
      notify({
        tone: "error",
        title: "无法打开链接",
        description: errorMessage(error),
      });
    }
  };
  const importExisting = () =>
    write("MCP 导入", async () => {
      const count = await ports.mcp.importFromApps();
      notify({
        tone: "info",
        title: count === 0 ? "没有发现可导入的 MCP" : `已导入 ${count} 个 MCP`,
      });
    });
  return (
    <div className="fy-feature-page fy-mcp-page">
      <header className="fy-feature-header">
        <div className="fy-feature-heading">
          <h1>MCP</h1>
          <p>统一管理 MCP 服务与 Agent 分配</p>
        </div>
        <div className="fy-feature-actions">
          <Button disabled={busy} onClick={() => void importExisting()}>
            导入现有
          </Button>
          <Button
            className="fy-control-button-primary"
            disabled={busy}
            onClick={() => setEditing("new")}
          >
            添加 MCP
          </Button>
        </div>
      </header>
      {progress && (
        <>
          <div className="fy-feature-progress">
            <span
              style={{
                width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="fy-feature-description">
            正在处理 {progress.done}/{progress.total}
          </p>
        </>
      )}
      {query.error && query.data !== undefined && (
        <InlineNotice tone="error">
          刷新失败，正在显示上一次成功数据：{errorMessage(query.error)}
        </InlineNotice>
      )}
      {query.isLoading ? (
        <EmptyState title="正在加载 MCP" description="正在读取统一 MCP 数据">
          <Spinner />
        </EmptyState>
      ) : query.error && query.data === undefined ? (
        <EmptyState
          title="无法加载 MCP"
          description={errorMessage(query.error)}
          actions={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      ) : servers.length === 0 ? (
        <EmptyState
          title="还没有 MCP 服务"
          description="添加新的 MCP，或从现有 Agent 配置导入"
          actions={
            <>
              <Button onClick={() => void importExisting()}>导入现有</Button>{" "}
              <Button
                className="fy-control-button-primary"
                onClick={() => setEditing("new")}
              >
                添加 MCP
              </Button>
            </>
          }
        />
      ) : (
        <>
          <div className="fy-feature-toolbar">
            <Input
              type="search"
              aria-label="搜索 MCP"
              placeholder="搜索名称、命令、URL、标签或来源"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              title="没有匹配的 MCP"
              description="密钥和请求头不会参与搜索"
            />
          ) : (
            <div className="fy-feature-master">
              <section className="fy-feature-panel" aria-label="MCP 列表">
                <h2>MCP 服务 · {servers.length}</h2>
                <div className="fy-feature-list">
                  {filtered.map((server) => (
                    <button
                      key={server.id}
                      className="fy-feature-list-item"
                      aria-current={server.id === selected?.id}
                      onClick={() => setSelectedId(server.id)}
                    >
                      <strong>{server.name}</strong>
                      <span>
                        {server.description ||
                          server.tags?.join(" · ") ||
                          "无描述"}{" "}
                        · {transportOf(server)} ·{" "}
                        {
                          MCP_TARGETS.filter((app) => server.apps[app.id])
                            .length
                        }{" "}
                        Agent
                      </span>
                    </button>
                  ))}
                </div>
              </section>
              {selected && (
                <ServerDetail
                  server={selected}
                  busy={busy}
                  onToggle={(app, enabled) => toggle(selected, app, enabled)}
                  onEdit={() => setEditing(selected)}
                  onDelete={() => setDeleteTarget(selected)}
                  onOpen={openExternal}
                  showAssignment={!wideLayout}
                />
              )}
              {selected && wideLayout && (
                <section className="fy-feature-panel">
                  <AssignmentPanel
                    apps={selected.apps}
                    disabled={busy}
                    labelSuffix="MCP 分配"
                    onToggle={(app, enabled) => toggle(selected, app, enabled)}
                    targets={MCP_TARGETS}
                  />
                  <hr />
                  <h3>全量分配</h3>
                  {MCP_TARGETS.map((app) => (
                    <div key={app.id} className="fy-feature-assignment">
                      <span>{app.label}</span>
                      <span>
                        <Button
                          disabled={busy}
                          onClick={() => bulkAssign(app.id, true)}
                        >
                          全开
                        </Button>{" "}
                        <Button
                          disabled={busy}
                          onClick={() => bulkAssign(app.id, false)}
                        >
                          全关
                        </Button>
                      </span>
                    </div>
                  ))}
                </section>
              )}
            </div>
          )}
        </>
      )}
      {editing !== null && (
        <McpEditor
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          existingIds={new Set(servers.map((server) => server.id))}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={(server) =>
            void write(
              editing === "new" ? "MCP 已添加" : "MCP 已更新",
              async () => {
                await ports.mcp.upsert(server);
                setEditing(null);
              },
            )
          }
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除 ${deleteTarget?.name ?? "MCP"}`}
        description="将从统一管理及所有已启用 Agent 配置中删除。"
        pending={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          const target = deleteTarget;
          if (target)
            await write("MCP 已删除", async () => {
              await ports.mcp.delete(target.id);
            });
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

type Mode = "quick" | "advanced";

function McpEditor({
  initial,
  existingIds,
  busy,
  onClose,
  onSave,
}: {
  initial: McpServer | null;
  existingIds: Set<string>;
  busy: boolean;
  onClose: () => void;
  onSave: (server: McpServer) => void;
}) {
  const spec = initial?.server ?? {};
  const [id, setId] = useState(initial?.id ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [homepage, setHomepage] = useState(initial?.homepage ?? "");
  const [docs, setDocs] = useState(initial?.docs ?? "");
  const [transport, setTransport] = useState<"stdio" | "http" | "sse">(
    spec.type === "http" || spec.type === "sse" ? spec.type : "stdio",
  );
  const [command, setCommand] = useState(spec.command ?? "");
  const [args, setArgs] = useState((spec.args ?? []).join("\n"));
  const [cwd, setCwd] = useState(spec.cwd ?? "");
  const [url, setUrl] = useState(spec.url ?? "");
  const [env, setEnv] = useState(
    Object.entries(spec.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  const [headers, setHeaders] = useState(
    Object.entries(spec.headers ?? {})
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n"),
  );
  const [apps, setApps] = useState(() =>
    initial ? { ...initial.apps } : createMcpAssignments(DEFAULT_NEW_APPS),
  );
  const [mode, setMode] = useState<Mode>("quick");
  const [advanced, setAdvanced] = useState(JSON.stringify(spec, null, 2));
  const [errors, setErrors] = useState<string[]>([]);
  const [preset, setPreset] = useState("custom");
  const original = useRef<McpServer | null>(
    initial ? structuredClone(initial) : null,
  );
  const draft = useRef<McpServerSpec>(structuredClone(spec));
  const applyPreset = (presetId: string) => {
    setPreset(presetId);
    if (presetId === "custom") return;
    const value = mcpPresets.find((item) => item.id === presetId);
    if (!value) return;
    setId(value.id);
    setName(value.name);
    setTags((value.tags ?? []).join(", "));
    setHomepage(value.homepage ?? "");
    setDocs(value.docs ?? "");
    setTransport(
      value.server.type === "http" || value.server.type === "sse"
        ? value.server.type
        : "stdio",
    );
    setCommand(value.server.command ?? "");
    setArgs((value.server.args ?? []).join("\n"));
    setCwd(value.server.cwd ?? "");
    setUrl(value.server.url ?? "");
    setEnv("");
    setHeaders("");
    draft.current = structuredClone(value.server);
    setAdvanced(JSON.stringify(value.server, null, 2));
  };
  const applySpecToQuickForm = (value: McpServerSpec) => {
    setTransport(
      value.type === "http" || value.type === "sse" ? value.type : "stdio",
    );
    setCommand(value.command ?? "");
    setArgs((value.args ?? []).join("\n"));
    setCwd(value.cwd ?? "");
    setUrl(value.url ?? "");
    setEnv(
      Object.entries(value.env ?? {})
        .map(([key, item]) => `${key}=${item}`)
        .join("\n"),
    );
    setHeaders(
      Object.entries(value.headers ?? {})
        .map(([key, item]) => `${key}: ${item}`)
        .join("\n"),
    );
  };
  const quickSpec = (): McpServerSpec => {
    const envResult = parseKeyValueLines(env, "env");
    const headersResult = parseKeyValueLines(headers, "headers");
    if (envResult.errors.length || headersResult.errors.length)
      throw new Error(
        [
          ...envResult.errors.map((item) => `环境变量：${item}`),
          ...headersResult.errors.map((item) => `请求头：${item}`),
        ].join("；"),
      );
    if (transport === "stdio") {
      if (!command.trim()) throw new Error("stdio 需要 command");
      return {
        type: "stdio",
        command: command.trim(),
        ...(args.trim() ? { args: args.split(/\r?\n/).filter(Boolean) } : {}),
        ...(cwd.trim() ? { cwd: cwd.trim() } : {}),
        ...(Object.keys(envResult.value).length
          ? { env: envResult.value }
          : {}),
      };
    }
    if (!url.trim()) throw new Error(`${transport} 需要 URL`);
    try {
      new URL(url.trim());
    } catch {
      throw new Error("URL 格式无效");
    }
    return {
      type: transport,
      url: url.trim(),
      ...(Object.keys(headersResult.value).length
        ? { headers: headersResult.value }
        : {}),
    };
  };
  const switchMode = (next: Mode) => {
    try {
      if (next === "advanced") {
        draft.current = overlayKnownMcpFields(draft.current, quickSpec());
        setAdvanced(JSON.stringify(draft.current, null, 2));
      } else {
        draft.current = parseAdvancedServerJson(advanced);
        applySpecToQuickForm(draft.current);
      }
      setMode(next);
      setErrors([]);
    } catch (error) {
      setErrors([errorMessage(error)]);
    }
  };
  const submit = () => {
    const nextErrors: string[] = [];
    const trimmedId = id.trim();
    if (!trimmedId) nextErrors.push("ID 为必填项");
    if (!initial && existingIds.has(trimmedId)) nextErrors.push("ID 已存在");
    if (!name.trim()) nextErrors.push("名称为必填项");
    let spec: McpServerSpec | null = null;
    try {
      spec =
        mode === "advanced"
          ? parseAdvancedServerJson(advanced)
          : overlayKnownMcpFields(draft.current, quickSpec());
    } catch (error) {
      nextErrors.push(errorMessage(error));
    }
    if (nextErrors.length || !spec) {
      setErrors(nextErrors);
      return;
    }
    const base = original.current ?? {};
    onSave({
      ...base,
      id: initial?.id ?? trimmedId,
      name: name.trim(),
      server: spec,
      apps: { ...(initial?.apps ?? {}), ...apps },
      description: description.trim() || undefined,
      tags: tags
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      homepage: homepage.trim() || undefined,
      docs: docs.trim() || undefined,
    } as McpServer);
  };
  return (
    <Dialog
      open
      onOpenChange={(next) => !next && !busy && onClose()}
      title={initial ? `编辑 ${initial.name}` : "添加 MCP"}
      description="快速表单与高级 JSON 共享同一份 server 草稿；敏感字段仅在这里显示。"
      large
      actions={
        <>
          <Button onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button
            className="fy-control-button-primary"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      {errors.length > 0 && (
        <InlineNotice tone="error">
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </InlineNotice>
      )}
      <div className="fy-feature-form-grid">
        {!initial && (
          <label className="fy-control-field">
            模板
            <select
              className="fy-control-select"
              value={preset}
              onChange={(event) => applyPreset(event.target.value)}
            >
              <option value="custom">Custom</option>
              {mcpPresets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="fy-control-field">
          ID
          <Input
            value={id}
            onChange={(event) => setId(event.target.value)}
            disabled={Boolean(initial)}
          />
        </label>
        <label className="fy-control-field">
          名称
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="fy-control-field">
          描述
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="fy-control-field">
          标签（逗号分隔）
          <Input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
          />
        </label>
        <label className="fy-control-field">
          主页
          <Input
            value={homepage}
            onChange={(event) => setHomepage(event.target.value)}
          />
        </label>
        <label className="fy-control-field">
          文档
          <Input
            value={docs}
            onChange={(event) => setDocs(event.target.value)}
          />
        </label>
        <div
          className="fy-feature-form-span fy-feature-tabs"
          role="tablist"
          aria-label="编辑模式"
        >
          <button
            type="button"
            className="fy-feature-tab"
            role="tab"
            aria-selected={mode === "quick"}
            onClick={() => switchMode("quick")}
          >
            快速配置
          </button>
          <button
            type="button"
            className="fy-feature-tab"
            role="tab"
            aria-selected={mode === "advanced"}
            onClick={() => switchMode("advanced")}
          >
            高级 JSON
          </button>
        </div>
        {mode === "quick" ? (
          <>
            <label className="fy-control-field">
              传输类型
              <select
                className="fy-control-select"
                value={transport}
                onChange={(event) =>
                  setTransport(event.target.value as typeof transport)
                }
              >
                <option value="stdio">stdio</option>
                <option value="http">http</option>
                <option value="sse">sse</option>
              </select>
            </label>
            {transport === "stdio" ? (
              <>
                <label className="fy-control-field">
                  命令
                  <Input
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                  />
                </label>
                <label className="fy-control-field fy-feature-form-span">
                  参数（每行一个）
                  <textarea
                    className="fy-control-textarea"
                    rows={4}
                    value={args}
                    onChange={(event) => setArgs(event.target.value)}
                  />
                </label>
                <label className="fy-control-field">
                  工作目录
                  <Input
                    value={cwd}
                    onChange={(event) => setCwd(event.target.value)}
                  />
                </label>
                <label className="fy-control-field fy-feature-form-span">
                  环境变量（KEY=VALUE）
                  <textarea
                    className="fy-control-textarea"
                    rows={4}
                    value={env}
                    onChange={(event) => setEnv(event.target.value)}
                  />
                </label>
              </>
            ) : (
              <>
                <label className="fy-control-field fy-feature-form-span">
                  URL
                  <Input
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                </label>
                <label className="fy-control-field fy-feature-form-span">
                  请求头（Name: Value 或 Name=Value）
                  <textarea
                    className="fy-control-textarea"
                    rows={4}
                    value={headers}
                    onChange={(event) => setHeaders(event.target.value)}
                  />
                </label>
              </>
            )}
          </>
        ) : (
          <label className="fy-control-field fy-feature-form-span">
            单个 server JSON
            <textarea
              className="fy-control-textarea"
              rows={14}
              value={advanced}
              onChange={(event) => setAdvanced(event.target.value)}
              spellCheck={false}
            />
          </label>
        )}
        <fieldset className="fy-feature-form-span">
          <legend>初始 Agent 分配</legend>
          <div className="fy-feature-check-grid">
            {MCP_TARGETS.map((app) => (
              <label key={app.id} className="fy-feature-check">
                <Checkbox
                  checked={Boolean(apps[app.id])}
                  onCheckedChange={(checked) =>
                    setApps((current) => ({ ...current, [app.id]: checked }))
                  }
                  label={`分配到 ${app.label}`}
                />
                {app.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </Dialog>
  );
}
