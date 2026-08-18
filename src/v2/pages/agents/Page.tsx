import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

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
  "skills.read": "查看 Skills",
  "skills.write": "管理 Skills",
  "hooks.read": "查看 Hooks",
  "hooks.write": "管理 Hooks",
  "models.validate": "测试模型连接",
  "models.write": "管理模型设置",
  "mcp.validate": "检查 MCP 配置",
  "mcp.write": "管理 MCP 配置",
};

const capabilityModeLabels: Readonly<Record<AgentCapabilityMode, string>> = {
  direct: "可在 FyAgent 中完成",
  assisted: "请在对应应用中完成",
  unsupported: "不支持",
  unverified: "暂无法确认",
};

const capabilityReasonLabels: Readonly<
  Record<AgentCapabilityReasonCode, string>
> = {
  official_link_reviewed: "可前往官方网站",
  trusted_runtime_identity_unavailable: "暂时无法确认",
  dedicated_agent_flow: "请在对应设置中完成",
  fyagent_skill_synchronization: "可在 FyAgent 中管理",
  fyagent_hook_management: "可在 FyAgent 中管理",
  fyagent_model_validation: "可在 FyAgent 中测试连接",
  fyagent_mcp_validation: "可在 FyAgent 中检查配置",
  vendor_ui_required: "请在对应应用中完成",
  vendor_private_storage_unsupported: "此项暂不支持",
  dedicated_native_contract: "可在 FyAgent 中管理",
  capability_not_applicable: "不适用",
  no_catalog_product_link: "暂无官方网站",
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
  return `${direct} 项可管理 · ${assisted} 项需在应用中完成`;
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
      <InlineNotice tone="warning">暂时无法读取当前状态，请重试。</InlineNotice>
      <p>你也可以查看官方网站获取帮助。</p>
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
    <section className="fy-agent-section" aria-label="WorkBuddy 配置概览">
      <h3>配置概览</h3>
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
      aria-label={`${app === "codex" ? "Codex" : "Claude Code"} 模型配置`}
    >
      <h3>模型配置</h3>
      <div className="fy-agent-observation">
        {query.isPending ? (
          <ObservationLoading label="正在读取模型配置" />
        ) : query.isError || !query.data ? (
          <ObservationFailure onRetry={() => void query.refetch()} />
        ) : (
          <>
            <dl className="fy-agent-observation-grid">
              <div>
                <dt>已保存的配置</dt>
                <dd>{providers.length}</dd>
              </div>
              <div>
                <dt>当前配置</dt>
                <dd>
                  {current?.name ??
                    (query.data.currentId ? "暂时无法确认" : "尚未选择")}
                </dd>
              </div>
            </dl>
            <p className="fy-feature-description">
              此处显示 FyAgent 中保存的模型配置，不代表应用已经安装或登录。
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
          ? "已发送启动请求。"
          : "暂时无法启动应用，请稍后重试。",
      );
    } catch {
      if (mountedRef.current) setLaunchNotice("暂时无法启动应用，请稍后重试。");
    } finally {
      if (mountedRef.current) setLaunching(false);
    }
  };

  return (
    <section className="fy-agent-section" aria-label="应用状态">
      <h3>应用状态</h3>
      <div className="fy-agent-observation">
        {pending ? (
          <ObservationLoading label="正在读取应用状态" />
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
              <p className="fy-feature-description">暂时无法确认安装状态。</p>
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
        <section className="fy-agent-section" aria-label="使用说明">
          <h3>使用说明</h3>
          <InlineNotice tone="warning">
            部分设置需要在对应应用中完成。
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
            message: "Hooks 设置已保存。请重启 QoderWork 以应用更改。",
          });
          break;
        case "overwrite_confirmation_required":
          setOverwriteToken(result.token);
          setNotice({
            tone: "warning",
            message: "配置已被其他更改覆盖，请确认是否继续保存。",
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
          message: "无法保存 Hooks 设置，请重试。",
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
          <p>管理可安全编辑的 Hooks；保存后请重启 QoderWork 以应用更改。</p>
        </div>
        <Badge tone="warning">保存后需重启</Badge>
      </div>

      {loading ? (
        <ObservationLoading label="正在读取 Hooks 设置" />
      ) : !snapshot ? (
        <Button onClick={() => void load()}>重试读取 Hooks</Button>
      ) : !snapshot.supportedStructure ? (
        <InlineNotice tone="warning">
          当前 Hooks 包含暂不支持的内容，请在 QoderWork 中编辑。
        </InlineNotice>
      ) : (
        <div className="fy-agent-hooks-editor">
          {groups.length === 0 && (
            <p className="fy-feature-description">当前没有 Hooks 分组。</p>
          )}
          {groups.map((group, groupIndex) => (
            <article
              key={`${group.event}-${groupIndex}`}
              className="fy-agent-hook-group"
            >
              <div className="fy-agent-hook-grid">
                <label className="fy-control-field">
                  事件
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
                  匹配条件（可选）
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
                    命令
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
                    超时（秒）
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
                    删除命令
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
                  添加命令
                </Button>
                <Button
                  onClick={() =>
                    replaceGroups(
                      groups.filter((_, index) => index !== groupIndex),
                    )
                  }
                >
                  删除分组
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
              添加 Hooks 分组
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
          确认覆盖
        </Button>
      )}

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => !saving && setPreviewOpen(open)}
        title="确认保存 Hooks 设置"
        description="将更新 Hooks 设置，不会运行命令。"
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
            <p>将清空并保存 Hooks 设置。</p>
          ) : (
            groups.map((group, index) => (
              <div key={`${group.event}-${index}`}>
                <strong>{group.event}</strong>
                <span>
                  {group.matcher ? ` · ${group.matcher}` : " · 未设置匹配条件"}
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
  TRAE_MCP_SERVER_VALID: "配置可用",
  TRAE_MCP_UNKNOWN_FIELD: "包含暂不支持的字段",
  TRAE_MCP_INVALID_COMMAND: "启动命令无效",
  TRAE_MCP_COMMAND_NOT_FOUND: "未找到启动程序",
  TRAE_MCP_INVALID_ARGS: "启动参数无效",
  TRAE_MCP_INVALID_ENV: "环境变量无效",
  TRAE_MCP_INVALID_URL: "连接地址无效",
  TRAE_MCP_UNSAFE_ADDRESS: "连接地址不符合安全要求",
  TRAE_MCP_INVALID_HEADERS: "请求头无效",
  TRAE_MCP_CONTROL_CHARACTER: "包含不可用字符",
  TRAE_MCP_LIMIT_EXCEEDED: "配置内容过多",
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
        message: "请输入有效的 MCP 配置。",
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
            ? "配置检查通过。服务尚未启动，请在对应应用中保存。"
            : "发现配置问题。请修正后重试。",
        });
      }
    } catch {
      if (mountedRef.current) {
        setNotice({
          tone: "error",
          message: "无法检查 MCP 配置，请重试。",
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
        message: "已复制配置模板。请在对应应用中补充凭据并保存。",
      });
    } catch {
      setNotice({ tone: "error", message: "无法复制脱敏模板。" });
    }
  };

  return (
    <section className="fy-agent-section" aria-label="MCP 配置检查">
      <div className="fy-agent-section-heading">
        <div>
          <h3>MCP 配置检查</h3>
          <p>检查格式和必要信息，不会启动服务。</p>
        </div>
        <Badge tone="neutral">需在对应应用中保存</Badge>
      </div>
      <label className="fy-control-field">
        MCP 配置（JSON）
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
          {pending ? "正在检查…" : "检查配置"}
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
                  {finding.transport} · 启动程序{" "}
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
            复制配置模板
          </Button>
          <p className="fy-feature-description">
            请在对应应用中补充凭据、确认并保存。
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

function officialLinkActionLabel(link: AgentOfficialLink): string {
  return /官方/.test(link.label) ? link.label : `打开 ${link.label} 官网`;
}

function AgentDetail({
  entry,
  openingKey,
  onOpenOfficial,
}: {
  entry: AgentCatalogEntry;
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
          </div>
          <p className="fy-feature-description">{entry.description}</p>
        </div>
        {entry.officialLinks.length > 0 && (
          <div
            className="fy-agent-official-links"
            role="group"
            aria-label="官方网站"
          >
            {entry.officialLinks.map((link) => {
              const opening = openingKey === officialLinkKey(entry, link);
              return (
                <Button
                  key={link.id}
                  className={
                    officialOnly ? "fy-control-button-primary" : undefined
                  }
                  disabled={
                    openingKey !== null ||
                    (productCapability?.mode !== "direct" &&
                      productCapability?.mode !== "assisted")
                  }
                  onClick={() => onOpenOfficial(link)}
                >
                  {opening ? "正在打开…" : officialLinkActionLabel(link)}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {entry.id === "codex" && <CodexDesktopInstallerPanel />}

      <section className="fy-agent-section" aria-label="可用功能">
        <h3>可用功能</h3>
        <CapabilityGrid entry={entry} />
      </section>

      <AgentObservation selectedId={entry.id} />

      {entry.id === "qoderwork" && <QoderHooksPanel />}
      {(entry.id === "qoderwork" || entry.id === "trae-work") && (
        <ExternalMcpValidationPanel agentId={entry.id} />
      )}

      {target &&
        (modelCapability?.mode === "direct" ||
          modelCapability?.mode === "assisted") && (
          <div className="fy-agent-action-row">
            <Button
              className="fy-control-button-primary"
              onClick={() => navigate(`/models?target=${target}`)}
            >
              配置模型
            </Button>
          </div>
        )}

      <p className="fy-agent-evidence">
        支持 {entry.capabilities.length} 项操作
      </p>
    </CatalogDetail>
  );
}

export function AgentsPage() {
  const { ports, notify } = useFeatures();
  const { pathname } = useLocation();
  const pageActive = pathname === "/agents";
  const [searchParams, setSearchParams] = useSearchParams();
  const catalogQuery = useAgentCatalog();
  const [selectedId, setSelectedId] = useState<AgentCatalogId | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const openLock = useRef(false);
  const entries = catalogQuery.data?.agents ?? [];
  const requestedTarget = pageActive ? searchParams.get("target") : null;
  const targetFromRoute =
    AGENT_CATALOG_IDS.find((id) => id === requestedTarget) ?? null;
  if (pageActive && targetFromRoute && targetFromRoute !== selectedId) {
    setSelectedId(targetFromRoute);
  }
  const convergedId = convergeSelection(entries, selectedId ?? targetFromRoute);
  const selected = entries.find((entry) => entry.id === convergedId) ?? null;

  useEffect(() => {
    if (!pageActive) return;
    if (searchParams.get("target") !== null) return;
    if (!selectedId) return;
    setSearchParams({ target: selectedId }, { replace: true });
  }, [pageActive, searchParams, selectedId, setSearchParams]);

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
        description: "请稍后重试。",
      });
    } finally {
      setOpeningKey(null);
      openLock.current = false;
    }
  };

  return (
    <div
      className="fy-feature-page fy-catalog-page fy-agents-page"
      data-testid="agents-page"
    >
      <header className="fy-feature-header">
        <div className="fy-feature-heading">
          <h1>Agent 目录</h1>
          <p>查看已支持的应用及可管理的功能。</p>
        </div>
      </header>

      {catalogQuery.error && catalogQuery.data !== undefined && (
        <InlineNotice tone="warning">
          暂时无法刷新应用信息，正在显示已加载内容。
        </InlineNotice>
      )}

      {catalogQuery.isPending ? (
        <EmptyState title="正在加载 Agent 目录" description="正在获取应用信息">
          <Spinner label="正在加载 Agent 目录" />
        </EmptyState>
      ) : catalogQuery.isError && catalogQuery.data === undefined ? (
        <EmptyState
          title="无法加载 Agent 目录"
          description="暂时无法获取应用信息，请重试。"
          actions={
            <Button onClick={() => void catalogQuery.refetch()}>重试</Button>
          }
        />
      ) : entries.length === 0 || !selected ? (
        <EmptyState
          title="Agent 目录暂不可用"
          description="暂时没有可显示的应用，请重试。"
          actions={
            <Button onClick={() => void catalogQuery.refetch()}>重试</Button>
          }
        />
      ) : (
        <CatalogMasterDetail>
          <CatalogRail ariaLabel="Agent 选择" title="选择 Agent">
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
            openingKey={openingKey}
            onOpenOfficial={(link) => void openOfficial(selected, link)}
          />
        </CatalogMasterDetail>
      )}
    </div>
  );
}
