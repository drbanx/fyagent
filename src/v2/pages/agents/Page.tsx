import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { getAgentBrand } from "../../shared/assets/agents";
import { CodexDesktopInstallerPanel } from "../../shared/codex-desktop/CodexDesktopInstallerPanel";
import { convergeSelection } from "../../shared/features/helpers";
import { useFeatures } from "../../shared/features/provider";
import {
  useAgentCatalog,
  useProviderSummary,
  useWorkBuddyStatus,
} from "../../shared/features/queries";
import type {
  AgentCapabilityId,
  AgentCapabilityMode,
  AgentCapabilityReasonCode,
  AgentCatalogEntry,
  AgentCatalogId,
  ExternalAgentRuntimeStatus,
  ExternalMcpAgentId,
  ExternalMcpFindingReasonCode,
  ExternalMcpValidationResult,
  AgentOfficialLink,
  ProviderAppId,
  QoderWorkHookGroup,
  QoderWorkHooksSnapshot,
} from "../../shared/features/types";
import {
  AGENT_CATALOG_IDS,
  QODERWORK_HOOK_EVENTS,
} from "../../shared/features/types";
import {
  Badge,
  Button,
  Dialog,
  EmptyState,
  InlineNotice,
  Input,
  Spinner,
} from "../../shared/ui/primitives";
import {
  BrandIconFrame,
  CatalogDetail,
  CatalogList,
  CatalogListItem,
  CatalogMasterDetail,
  CatalogRail,
} from "../../shared/ui/catalog";

import "./Page.css";

const capabilityLabels: Readonly<Record<AgentCapabilityId, string>> = {
  "product.open": "官方入口",
  "app.detect": "应用识别",
  "app.launch": "应用启动",
  "skills.read": "Skills 读取",
  "skills.write": "Skills 同步",
  "hooks.read": "Hooks 读取",
  "hooks.write": "Hooks 保存",
  "models.validate": "模型预检",
  "models.write": "模型写入",
  "mcp.validate": "MCP 预检",
  "mcp.write": "MCP 写入",
};

const capabilityModeLabels: Readonly<Record<AgentCapabilityMode, string>> = {
  direct: "FyAgent 直连",
  assisted: "官方协助",
  unsupported: "不支持",
  unverified: "未验证",
};

const capabilityReasonLabels: Readonly<
  Record<AgentCapabilityReasonCode, string>
> = {
  official_link_reviewed: "官方入口已复核",
  trusted_runtime_identity_unavailable: "缺少可信运行时身份，保持未验证",
  dedicated_agent_flow: "由专用 Agent 流程处理",
  fyagent_skill_synchronization: "使用 FyAgent Skills 同步合同",
  fyagent_hook_management: "使用 FyAgent Qoder Hooks 安全文档合同",
  fyagent_model_validation: "仅执行 FyAgent 模型连接预检",
  fyagent_mcp_validation: "仅执行 FyAgent MCP 配置预检",
  vendor_ui_required: "最终操作必须在厂商界面完成",
  vendor_private_storage_unsupported: "不写入厂商私有存储",
  dedicated_native_contract: "由独立原生命令合同处理",
  capability_not_applicable: "当前能力不适用",
  no_catalog_product_link: "目录不提供产品网页入口",
};

function capabilityTone(
  mode: AgentCapabilityMode,
): "neutral" | "accent" | "warning" {
  if (mode === "direct") return "accent";
  if (mode === "unverified") return "warning";
  return "neutral";
}

function catalogSummary(entry: AgentCatalogEntry): string {
  const direct = entry.capabilities.filter(
    (capability) => capability.mode === "direct",
  ).length;
  const assisted = entry.capabilities.filter(
    (capability) => capability.mode === "assisted",
  ).length;
  return `${direct} 项直连 · ${assisted} 项协助`;
}

function capability(entry: AgentCatalogEntry, id: AgentCapabilityId) {
  return entry.capabilities.find((candidate) => candidate.id === id);
}

function CapabilityGrid({ entry }: { entry: AgentCatalogEntry }) {
  return (
    <div className="fy-agent-capabilities">
      {entry.capabilities.map((item) => {
        return (
          <article key={item.id} className="fy-agent-capability">
            <div className="fy-agent-capability-header">
              <strong>{capabilityLabels[item.id]}</strong>
              <Badge tone={capabilityTone(item.mode)}>
                {capabilityModeLabels[item.mode]}
              </Badge>
            </div>
            <p>{capabilityReasonLabels[item.reasonCode]}</p>
          </article>
        );
      })}
    </div>
  );
}

function ObservationFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="fy-agent-observation-error">
      <InlineNotice tone="warning">
        当前无法读取本机状态。状态保持未知，不能据此判断是否安装、登录或可用。
      </InlineNotice>
      <p>可以重试读取，或继续打开官方入口查看厂商说明。</p>
      <div>
        <Button onClick={onRetry}>重试读取</Button>
      </div>
    </div>
  );
}

function ObservationLoading({ label }: { label: string }) {
  return (
    <div className="fy-agent-observation-loading">
      <Spinner label={label} />
      <span>{label}</span>
    </div>
  );
}

function WorkBuddyObservation({ active }: { active: boolean }) {
  const query = useWorkBuddyStatus(active);
  if (!active) return null;

  return (
    <section className="fy-agent-section" aria-label="WorkBuddy 本机观察">
      <h3>本机配置观察</h3>
      <div className="fy-agent-observation">
        {query.isPending ? (
          <ObservationLoading label="正在读取 WorkBuddy 配置状态" />
        ) : query.isError || !query.data ? (
          <ObservationFailure onRetry={() => void query.refetch()} />
        ) : (
          <dl className="fy-agent-observation-grid">
            <div>
              <dt>配置文件</dt>
              <dd>{query.data.exists ? "已读取" : "尚未创建"}</dd>
            </div>
            <div>
              <dt>模型条目</dt>
              <dd>{query.data.modelCount}</dd>
            </div>
            <div>
              <dt>配置格式</dt>
              <dd>
                {query.data.format === "legacyArray"
                  ? "数组格式"
                  : query.data.format === "objectRoot"
                    ? "对象格式"
                    : "尚无配置"}
              </dd>
            </div>
            <div>
              <dt>本地备份</dt>
              <dd>{query.data.backupExists ? "存在" : "未观察到"}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}

function ProviderObservation({
  app,
  active,
}: {
  app: ProviderAppId;
  active: boolean;
}) {
  const query = useProviderSummary(app, active);
  if (!active) return null;

  const providers = query.data ? Object.values(query.data.providers) : [];
  const current = query.data?.currentId
    ? query.data.providers[query.data.currentId]
    : undefined;

  return (
    <section
      className="fy-agent-section"
      aria-label={`${app === "codex" ? "Codex" : "Claude Code"} Provider 观察`}
    >
      <h3>FyAgent Provider 观察</h3>
      <div className="fy-agent-observation">
        {query.isPending ? (
          <ObservationLoading label="正在读取 Provider 汇总" />
        ) : query.isError || !query.data ? (
          <ObservationFailure onRetry={() => void query.refetch()} />
        ) : (
          <>
            <dl className="fy-agent-observation-grid">
              <div>
                <dt>Provider 记录</dt>
                <dd>{providers.length}</dd>
              </div>
              <div>
                <dt>当前选择</dt>
                <dd>
                  {current?.name ??
                    (query.data.currentId ? "无法从汇总确认" : "尚未选择")}
                </dd>
              </div>
            </dl>
            <p className="fy-feature-description">
              这里只显示 FyAgent 内的脱敏 Provider 汇总，不代表 Agent
              已安装、已登录或模型端点可用。
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function runtimeBooleanLabel(value: boolean | null): string {
  if (value === null) return "未验证";
  return value ? "已确认" : "未检测到";
}

function ExternalRuntimeObservation({
  selectedId,
}: {
  selectedId: AgentCatalogId;
}) {
  const { ports } = useFeatures();
  const [status, setStatus] = useState<ExternalAgentRuntimeStatus | null>(null);
  const [pending, setPending] = useState(true);
  const [failed, setFailed] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchNotice, setLaunchNotice] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setPending(true);
    setFailed(false);
    setLaunchNotice(null);
    try {
      const next = await ports.externalAgents.getStatus(selectedId);
      if (mountedRef.current) setStatus(next);
    } catch {
      if (mountedRef.current) {
        setStatus(null);
        setFailed(true);
      }
    } finally {
      if (mountedRef.current) setPending(false);
    }
  }, [ports.externalAgents, selectedId]);

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => {
      if (mountedRef.current) void refresh();
    });
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const launchCapability = status?.capabilities.find(
    (item) => item.id === "app.launch",
  );
  const launchAvailable = launchCapability?.state === "available";

  const launch = async () => {
    if (!launchAvailable || launching) return;
    setLaunching(true);
    setLaunchNotice(null);
    try {
      const result = await ports.externalAgents.launch(selectedId, "home");
      if (!mountedRef.current) return;
      setLaunchNotice(
        result.state === "available"
          ? "已将启动请求交给受信任的原生适配器。"
          : "原生适配器未确认可启动；未执行猜测性进程操作。",
      );
    } catch {
      if (mountedRef.current)
        setLaunchNotice("启动请求失败；未执行猜测性进程操作。");
    } finally {
      if (mountedRef.current) setLaunching(false);
    }
  };

  return (
    <section className="fy-agent-section" aria-label="本机运行状态">
      <h3>本机运行状态</h3>
      <div className="fy-agent-observation">
        {pending ? (
          <ObservationLoading label="正在读取受控运行状态" />
        ) : failed || !status ? (
          <ObservationFailure onRetry={() => void refresh()} />
        ) : (
          <>
            <dl className="fy-agent-observation-grid">
              <div>
                <dt>已安装</dt>
                <dd>{runtimeBooleanLabel(status.detected)}</dd>
              </div>
              <div>
                <dt>正在运行</dt>
                <dd>{runtimeBooleanLabel(status.running)}</dd>
              </div>
              <div>
                <dt>版本</dt>
                <dd>{status.version ?? "未验证"}</dd>
              </div>
              <div>
                <dt>安装来源</dt>
                <dd>{status.installSource ?? "未验证"}</dd>
              </div>
            </dl>
            {launchAvailable && (
              <div className="fy-agent-action-row">
                <Button
                  className="fy-control-button-primary"
                  disabled={launching}
                  onClick={() => void launch()}
                >
                  {launching ? "正在请求启动…" : "启动应用"}
                </Button>
              </div>
            )}
            {launchNotice && <InlineNotice>{launchNotice}</InlineNotice>}
            {status.detected === null && (
              <p className="fy-feature-description">
                未验证不等于未安装；FyAgent
                不会根据产品名、配置目录或静态目录推断本机状态。
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function AgentObservation({ selectedId }: { selectedId: AgentCatalogId }) {
  return (
    <>
      <ExternalRuntimeObservation key={selectedId} selectedId={selectedId} />
      <WorkBuddyObservation active={selectedId === "workbuddy"} />
      <ProviderObservation app="codex" active={selectedId === "codex"} />
      <ProviderObservation app="claude" active={selectedId === "claude-code"} />
      {(selectedId === "qoderwork" || selectedId === "trae-work") && (
        <section className="fy-agent-section" aria-label="接入边界">
          <h3>接入边界</h3>
          <InlineNotice tone="warning">
            FyAgent
            当前不会探测登录态、读取厂商私有配置、下载安装包或写入模型设置。
          </InlineNotice>
        </section>
      )}
    </>
  );
}

type LocalPanelNotice = {
  tone: "info" | "warning" | "error";
  message: string;
};

function cloneHookGroups(groups: QoderWorkHookGroup[]): QoderWorkHookGroup[] {
  return groups.map((group) => ({
    ...group,
    hooks: group.hooks.map((hook) => ({ ...hook })),
  }));
}

function QoderHooksPanel() {
  const { ports } = useFeatures();
  const [snapshot, setSnapshot] = useState<QoderWorkHooksSnapshot | null>(null);
  const [groups, setGroups] = useState<QoderWorkHookGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [overwriteToken, setOverwriteToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<LocalPanelNotice | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    setOverwriteToken(null);
    try {
      const next = await ports.qoderwork.getHooks();
      if (!mountedRef.current) return;
      setSnapshot(next);
      setGroups(cloneHookGroups(next.groups));
    } catch {
      if (mountedRef.current) {
        setSnapshot(null);
        setGroups([]);
        setNotice({ tone: "error", message: "无法读取 QoderWork Hooks。" });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [ports.qoderwork]);

  useEffect(() => {
    mountedRef.current = true;
    queueMicrotask(() => {
      if (mountedRef.current) void load();
    });
    return () => {
      mountedRef.current = false;
      setOverwriteToken(null);
    };
  }, [load]);

  const replaceGroups = (next: QoderWorkHookGroup[]) => {
    setGroups(next);
    setOverwriteToken(null);
    setNotice(null);
  };

  const updateGroup = (
    groupIndex: number,
    update: (group: QoderWorkHookGroup) => QoderWorkHookGroup,
  ) => {
    replaceGroups(
      groups.map((group, index) =>
        index === groupIndex ? update(group) : group,
      ),
    );
  };

  const draftValid =
    snapshot?.supportedStructure === true &&
    groups.every((group) =>
      group.hooks.every(
        (hook) =>
          hook.command.trim().length > 0 &&
          (hook.timeout === undefined ||
            (Number.isInteger(hook.timeout) &&
              hook.timeout > 0 &&
              hook.timeout <= 600)),
      ),
    );

  const save = async (token?: string) => {
    if (!snapshot || !draftValid || saving) return;
    setSaving(true);
    setPreviewOpen(false);
    setNotice(null);
    try {
      const result = await ports.qoderwork.saveHooks({
        expectedRevision: snapshot.revision,
        groups: cloneHookGroups(groups),
        ...(token === undefined ? {} : { overwriteToken: token }),
      });
      if (!mountedRef.current) return;
      switch (result.state) {
        case "saved":
          setSnapshot(result.snapshot);
          setGroups(cloneHookGroups(result.snapshot.groups));
          setOverwriteToken(null);
          setNotice({
            tone: "info",
            message:
              "Hooks 文件已保存。必须重启 QoderWork 才能由厂商运行时重新加载；FyAgent 未执行 Hook command，也不声称当前运行时已生效。",
          });
          break;
        case "overwrite_confirmation_required":
          setOverwriteToken(result.token);
          setNotice({
            tone: "warning",
            message:
              "检测到需要再次确认的覆盖冲突。一次性令牌只用于当前已预览草稿。",
          });
          break;
        case "concurrent_modification":
          setOverwriteToken(null);
          setNotice({
            tone: "warning",
            message: "文件已被其他进程修改，本次未写入。请重新读取后再编辑。",
          });
          break;
      }
    } catch {
      if (mountedRef.current) {
        setOverwriteToken(null);
        setNotice({
          tone: "error",
          message: "Hooks 保存失败；未显示原始文件或命令内容。",
        });
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  };

  return (
    <section className="fy-agent-section" aria-label="QoderWork Hooks 配置">
      <div className="fy-agent-section-heading">
        <div>
          <h3>QoderWork Hooks</h3>
          <p>只编辑受支持投影；验证和保存都不会执行 Hook command。</p>
        </div>
        <Badge tone="warning">保存后需重启</Badge>
      </div>

      {loading ? (
        <ObservationLoading label="正在读取 QoderWork Hooks" />
      ) : !snapshot ? (
        <Button onClick={() => void load()}>重试读取 Hooks</Button>
      ) : !snapshot.supportedStructure ? (
        <InlineNotice tone="warning">
          当前 hooks 包含无法无损投影的结构，结构化保存已禁用。
        </InlineNotice>
      ) : (
        <div className="fy-agent-hooks-editor">
          {groups.length === 0 && (
            <p className="fy-feature-description">当前没有 Hook group。</p>
          )}
          {groups.map((group, groupIndex) => (
            <article
              key={`${group.event}-${groupIndex}`}
              className="fy-agent-hook-group"
            >
              <div className="fy-agent-hook-grid">
                <label className="fy-control-field">
                  Event
                  <select
                    className="fy-control-input"
                    value={group.event}
                    onChange={(event) =>
                      updateGroup(groupIndex, (current) => ({
                        ...current,
                        event: event.target
                          .value as QoderWorkHookGroup["event"],
                      }))
                    }
                  >
                    {QODERWORK_HOOK_EVENTS.map((event) => (
                      <option key={event} value={event}>
                        {event}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="fy-control-field">
                  Matcher（可选）
                  <Input
                    value={group.matcher ?? ""}
                    onChange={(event) =>
                      updateGroup(groupIndex, (current) => ({
                        event: current.event,
                        hooks: current.hooks,
                        ...(event.target.value.trim().length === 0
                          ? {}
                          : { matcher: event.target.value }),
                      }))
                    }
                    autoComplete="off"
                  />
                </label>
              </div>
              {group.hooks.map((hook, hookIndex) => (
                <div key={hookIndex} className="fy-agent-hook-command-row">
                  <label className="fy-control-field">
                    Command
                    <Input
                      value={hook.command}
                      onChange={(event) =>
                        updateGroup(groupIndex, (current) => ({
                          ...current,
                          hooks: current.hooks.map((candidate, index) =>
                            index === hookIndex
                              ? { ...candidate, command: event.target.value }
                              : candidate,
                          ),
                        }))
                      }
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <label className="fy-control-field fy-agent-hook-timeout">
                    Timeout（秒）
                    <Input
                      type="number"
                      min={1}
                      max={600}
                      value={hook.timeout ?? ""}
                      onChange={(event) =>
                        updateGroup(groupIndex, (current) => ({
                          ...current,
                          hooks: current.hooks.map((candidate, index) =>
                            index === hookIndex
                              ? {
                                  type: "command",
                                  command: candidate.command,
                                  ...(event.target.value === ""
                                    ? {}
                                    : { timeout: Number(event.target.value) }),
                                }
                              : candidate,
                          ),
                        }))
                      }
                    />
                  </label>
                  <Button
                    onClick={() =>
                      updateGroup(groupIndex, (current) => ({
                        ...current,
                        hooks: current.hooks.filter(
                          (_, index) => index !== hookIndex,
                        ),
                      }))
                    }
                  >
                    删除 command
                  </Button>
                </div>
              ))}
              <div className="fy-agent-action-row">
                <Button
                  onClick={() =>
                    updateGroup(groupIndex, (current) => ({
                      ...current,
                      hooks: [
                        ...current.hooks,
                        { type: "command", command: "" },
                      ],
                    }))
                  }
                >
                  添加 command
                </Button>
                <Button
                  onClick={() =>
                    replaceGroups(
                      groups.filter((_, index) => index !== groupIndex),
                    )
                  }
                >
                  删除 group
                </Button>
              </div>
            </article>
          ))}
          <div className="fy-agent-action-row">
            <Button
              onClick={() =>
                replaceGroups([
                  ...groups,
                  {
                    event: "SessionStart",
                    hooks: [{ type: "command", command: "" }],
                  },
                ])
              }
            >
              添加 Hook group
            </Button>
            <Button
              className="fy-control-button-primary"
              disabled={!draftValid || saving}
              onClick={() => setPreviewOpen(true)}
            >
              预览保存
            </Button>
            <Button disabled={saving} onClick={() => void load()}>
              重新读取
            </Button>
          </div>
        </div>
      )}

      {notice && (
        <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
      )}
      {overwriteToken && (
        <Button
          className="fy-control-button-primary"
          disabled={saving}
          onClick={() => void save(overwriteToken)}
        >
          使用一次性令牌确认覆盖
        </Button>
      )}

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => !saving && setPreviewOpen(open)}
        title="确认保存 QoderWork Hooks"
        description="只替换 settings.json 的 hooks 键；保存不会执行任何命令。"
        large
        actions={
          <>
            <Button disabled={saving} onClick={() => setPreviewOpen(false)}>
              返回编辑
            </Button>
            <Button
              className="fy-control-button-primary"
              disabled={!draftValid || saving}
              onClick={() => void save()}
            >
              {saving ? "正在保存…" : "确认保存"}
            </Button>
          </>
        }
      >
        <div className="fy-agent-hooks-preview">
          {groups.length === 0 ? (
            <p>将保存空 hooks 投影。</p>
          ) : (
            groups.map((group, index) => (
              <div key={`${group.event}-${index}`}>
                <strong>{group.event}</strong>
                <span>
                  {group.matcher ? ` · ${group.matcher}` : " · 无 matcher"}
                </span>
                <ul>
                  {group.hooks.map((hook, hookIndex) => (
                    <li key={hookIndex}>
                      <code>{hook.command}</code>
                      {hook.timeout ? ` · ${hook.timeout} 秒` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </Dialog>
    </section>
  );
}

const mcpFindingCopy: Readonly<Record<ExternalMcpFindingReasonCode, string>> = {
  TRAE_MCP_SERVER_VALID: "服务器结构有效",
  TRAE_MCP_UNKNOWN_FIELD: "包含不支持的字段",
  TRAE_MCP_INVALID_COMMAND: "stdio command 无效",
  TRAE_MCP_COMMAND_NOT_FOUND: "未找到 stdio executable",
  TRAE_MCP_INVALID_ARGS: "stdio args 无效",
  TRAE_MCP_INVALID_ENV: "stdio env 无效",
  TRAE_MCP_INVALID_URL: "HTTP URL 无效",
  TRAE_MCP_UNSAFE_ADDRESS: "HTTP 地址不符合安全策略",
  TRAE_MCP_INVALID_HEADERS: "HTTP headers 无效",
  TRAE_MCP_CONTROL_CHARACTER: "包含控制字符",
  TRAE_MCP_LIMIT_EXCEEDED: "配置超过安全边界",
};

function ExternalMcpValidationPanel({
  agentId,
}: {
  agentId: ExternalMcpAgentId;
}) {
  const { ports } = useFeatures();
  const [configText, setConfigText] = useState("");
  const [result, setResult] = useState<ExternalMcpValidationResult | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<LocalPanelNotice | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setConfigText("");
      setResult(null);
    };
  }, [agentId]);

  const validate = async () => {
    if (pending) return;
    setResult(null);
    setNotice(null);
    let config: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(configText);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        Object.keys(parsed).length !== 1 ||
        !("mcpServers" in parsed) ||
        typeof (parsed as Record<string, unknown>).mcpServers !== "object" ||
        (parsed as Record<string, unknown>).mcpServers === null ||
        Array.isArray((parsed as Record<string, unknown>).mcpServers)
      )
        throw new Error("invalid");
      config = parsed as Record<string, unknown>;
    } catch {
      setNotice({
        tone: "error",
        message: "请输入只包含 mcpServers object 的有效 JSON。",
      });
      return;
    }

    setPending(true);
    try {
      const next = await ports.externalMcp.validate(agentId, config);
      if (mountedRef.current) {
        setResult(next);
        setNotice({
          tone: next.valid ? "info" : "warning",
          message: next.valid
            ? "FyAgent 已完成静态预检；未启动 server，也未写入厂商配置。"
            : "静态预检发现问题；未启动 server，也未写入厂商配置。",
        });
      }
    } catch {
      if (mountedRef.current) {
        setNotice({
          tone: "error",
          message: "MCP 配置预检失败；敏感配置值与原始错误均未保留。",
        });
      }
    } finally {
      if (mountedRef.current) {
        setConfigText("");
        setPending(false);
      }
    }
  };

  const copyRedactedTemplate = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(result.redactedTemplate, null, 2),
      );
      setNotice({
        tone: "info",
        message: "已复制脱敏模板；请在厂商界面补充敏感值并完成最终保存。",
      });
    } catch {
      setNotice({ tone: "error", message: "无法复制脱敏模板。" });
    }
  };

  return (
    <section className="fy-agent-section" aria-label="MCP 配置预检">
      <div className="fy-agent-section-heading">
        <div>
          <h3>MCP 配置预检</h3>
          <p>只验证 stdio/HTTP 结构与本机可解析性，不执行 server。</p>
        </div>
        <Badge tone="neutral">厂商 UI 完成</Badge>
      </div>
      <label className="fy-control-field">
        mcpServers JSON
        <textarea
          className="fy-control-input fy-agent-mcp-textarea"
          value={configText}
          onChange={(event) => {
            setConfigText(event.target.value);
            setResult(null);
            setNotice(null);
          }}
          placeholder={'{"mcpServers":{"example":{"command":"example"}}}'}
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="fy-agent-action-row">
        <Button
          className="fy-control-button-primary"
          disabled={pending || configText.trim().length === 0}
          onClick={() => void validate()}
        >
          {pending ? "正在预检…" : "执行静态预检"}
        </Button>
      </div>
      {notice && (
        <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
      )}
      {result && (
        <div className="fy-agent-mcp-result">
          <ul>
            {result.findings.map((finding) => (
              <li key={finding.serverId}>
                <strong>{finding.serverId}</strong>
                <span>
                  {finding.transport} · executable{" "}
                  {finding.executableAvailable === null
                    ? "不适用"
                    : finding.executableAvailable
                      ? "可解析"
                      : "不可解析"}
                  {finding.hasSecrets ? " · 含敏感字段（值已移除）" : ""}
                </span>
                <ul>
                  {finding.reasonCodes.map((reasonCode) => (
                    <li key={reasonCode}>{mcpFindingCopy[reasonCode]}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <pre>{JSON.stringify(result.redactedTemplate, null, 2)}</pre>
          <Button onClick={() => void copyRedactedTemplate()}>
            复制脱敏模板
          </Button>
          <p className="fy-feature-description">
            FyAgent 不保存或执行该配置。请在厂商 UI 中补齐凭据、复核并最终保存。
          </p>
        </div>
      )}
    </section>
  );
}

function modelTarget(id: AgentCatalogId): string | null {
  if (id === "workbuddy" || id === "codex") return id;
  if (id === "claude-code") return "claude";
  return null;
}

function officialLinkKey(
  entry: AgentCatalogEntry,
  link: AgentOfficialLink,
): string {
  return `${entry.id}:${link.id}`;
}

function AgentDetail({
  entry,
  contractVersion,
  reviewedAt,
  openingKey,
  onOpenOfficial,
}: {
  entry: AgentCatalogEntry;
  contractVersion: number;
  reviewedAt: string;
  openingKey: string | null;
  onOpenOfficial: (link: AgentOfficialLink) => void;
}) {
  const navigate = useNavigate();
  const target = modelTarget(entry.id);
  const officialOnly = entry.id === "qoderwork" || entry.id === "trae-work";
  const productCapability = capability(entry, "product.open");
  const modelCapability = capability(entry, "models.write");

  return (
    <CatalogDetail
      className="fy-agent-detail"
      ariaLabel={`${entry.displayName} 详情`}
    >
      <div className="fy-agent-identity">
        <BrandIconFrame asset={getAgentBrand(entry.id)} size="detail" />
        <div className="fy-agent-identity-copy">
          <div className="fy-agent-identity-title">
            <h2>{entry.displayName}</h2>
            <Badge tone="neutral">{entry.variantId}</Badge>
          </div>
          <p className="fy-feature-description">{entry.description}</p>
        </div>
      </div>

      <section className="fy-agent-section" aria-label="能力范围">
        <h3>能力范围</h3>
        <CapabilityGrid entry={entry} />
      </section>

      <AgentObservation selectedId={entry.id} />

      {entry.id === "qoderwork" && <QoderHooksPanel />}
      {(entry.id === "qoderwork" || entry.id === "trae-work") && (
        <ExternalMcpValidationPanel agentId={entry.id} />
      )}

      {entry.id === "codex" && <CodexDesktopInstallerPanel />}

      <div className="fy-agent-action-row">
        {entry.officialLinks.map((link) => {
          const opening = openingKey === officialLinkKey(entry, link);
          return (
            <Button
              key={link.id}
              className={officialOnly ? "fy-control-button-primary" : undefined}
              disabled={
                openingKey !== null ||
                (productCapability?.mode !== "direct" &&
                  productCapability?.mode !== "assisted")
              }
              onClick={() => onOpenOfficial(link)}
            >
              {opening ? "正在打开…" : link.label}
            </Button>
          );
        })}
        {target &&
          (modelCapability?.mode === "direct" ||
            modelCapability?.mode === "assisted") && (
            <Button
              className="fy-control-button-primary"
              onClick={() => navigate(`/models?target=${target}`)}
            >
              配置模型
            </Button>
          )}
      </div>

      <p className="fy-agent-evidence">
        目录合同 v{contractVersion} · 复核于 {reviewedAt} ·{" "}
        {entry.capabilities.length} 项封闭能力声明
      </p>
    </CatalogDetail>
  );
}

export function AgentsPage() {
  const { ports, notify } = useFeatures();
  const [searchParams, setSearchParams] = useSearchParams();
  const catalogQuery = useAgentCatalog();
  const [selectedId, setSelectedId] = useState<AgentCatalogId | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const openLock = useRef(false);
  const entries = catalogQuery.data?.agents ?? [];
  const requestedTarget = searchParams.get("target");
  const targetFromRoute = AGENT_CATALOG_IDS.find(
    (id) => id === requestedTarget,
  );
  const convergedId = convergeSelection(
    entries,
    selectedId ?? targetFromRoute ?? null,
  );
  const selected = entries.find((entry) => entry.id === convergedId) ?? null;

  const openOfficial = async (
    entry: AgentCatalogEntry,
    link: AgentOfficialLink,
  ) => {
    if (openLock.current) return;
    openLock.current = true;
    setOpeningKey(officialLinkKey(entry, link));
    try {
      await ports.settings.openExternal(link.url);
    } catch {
      notify({
        tone: "error",
        title: "无法打开官方入口",
        description: "请稍后重试；FyAgent 未执行任何安装或配置操作。",
      });
    } finally {
      setOpeningKey(null);
      openLock.current = false;
    }
  };

  return (
    <div className="fy-feature-page fy-agents-page">
      <header className="fy-feature-header">
        <div className="fy-feature-heading">
          <h1>Agent 目录</h1>
          <p>从同一份原生目录合同查看接入范围，并进入受支持的模型配置</p>
        </div>
      </header>

      {catalogQuery.error && catalogQuery.data !== undefined && (
        <InlineNotice tone="warning">
          目录刷新暂时失败，正在显示上一次成功读取的合同。
        </InlineNotice>
      )}

      {catalogQuery.isPending ? (
        <EmptyState
          title="正在加载 Agent 目录"
          description="正在读取本机提供的版本化目录合同"
        >
          <Spinner label="正在加载 Agent 目录" />
        </EmptyState>
      ) : catalogQuery.isError && catalogQuery.data === undefined ? (
        <EmptyState
          title="无法加载 Agent 目录"
          description="当前目录合同不可用；页面不会使用静态能力列表代替原生事实。"
          actions={
            <Button onClick={() => void catalogQuery.refetch()}>重试</Button>
          }
        />
      ) : entries.length === 0 || !selected ? (
        <EmptyState
          title="Agent 目录暂不可用"
          description="原生目录没有返回可展示条目；请重试读取。"
          actions={
            <Button onClick={() => void catalogQuery.refetch()}>重试</Button>
          }
        />
      ) : (
        <CatalogMasterDetail>
          <CatalogRail
            ariaLabel="Agent 选择"
            title="选择 Agent"
            meta={
              <>
                合同 v{catalogQuery.data.contractVersion} · 复核于{" "}
                {catalogQuery.data.reviewedAt}
              </>
            }
          >
            <CatalogList>
              {entries.map((entry) => (
                <CatalogListItem
                  key={entry.id}
                  asset={getAgentBrand(entry.id)}
                  label={entry.displayName}
                  summary={catalogSummary(entry)}
                  selected={entry.id === selected.id}
                  onSelect={() => {
                    setSelectedId(entry.id);
                    setSearchParams({ target: entry.id }, { replace: true });
                  }}
                />
              ))}
            </CatalogList>
          </CatalogRail>

          <AgentDetail
            entry={selected}
            contractVersion={catalogQuery.data.contractVersion}
            reviewedAt={catalogQuery.data.reviewedAt}
            openingKey={openingKey}
            onOpenOfficial={(link) => void openOfficial(selected, link)}
          />
        </CatalogMasterDetail>
      )}
    </div>
  );
}
