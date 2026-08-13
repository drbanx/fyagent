import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getAgentIcon } from "../../shared/assets/agents";
import { convergeSelection } from "../../shared/features/helpers";
import { useFeatures } from "../../shared/features/provider";
import {
  useAgentCatalog,
  useProviderSummary,
  useWorkBuddyStatus,
} from "../../shared/features/queries";
import type {
  AgentActionCapability,
  AgentCatalogEntry,
  AgentCatalogId,
  ProviderAppId,
} from "../../shared/features/types";
import {
  Badge,
  Button,
  EmptyState,
  InlineNotice,
  Spinner,
} from "../../shared/ui/primitives";

import "./Page.css";

type CatalogActionId = keyof AgentCatalogEntry["actions"];

const actionLabels: Readonly<Record<CatalogActionId, string>> = {
  browse: "官方入口",
  observe: "状态观察",
  install: "安装方式",
  configure: "模型配置",
};

const actionStateLabels: Readonly<
  Record<AgentActionCapability["state"], string>
> = {
  available: "可用",
  assisted: "官方协助",
  not_supported: "不支持",
  pending_verification: "待验证",
};

const catalogStatusLabels: Readonly<
  Record<AgentCatalogEntry["status"], string>
> = {
  manual_install: "手动安装",
  pending_verification: "能力待验证",
};

function capabilityTone(
  state: AgentActionCapability["state"],
): "neutral" | "accent" | "warning" {
  if (state === "available") return "accent";
  if (state === "pending_verification") return "warning";
  return "neutral";
}

function catalogStatusTone(
  status: AgentCatalogEntry["status"],
): "neutral" | "warning" {
  return status === "pending_verification" ? "warning" : "neutral";
}

function CapabilityGrid({ entry }: { entry: AgentCatalogEntry }) {
  return (
    <div className="fy-agent-capabilities">
      {(Object.keys(actionLabels) as CatalogActionId[]).map((actionId) => {
        const capability = entry.actions[actionId];
        return (
          <article key={actionId} className="fy-agent-capability">
            <div className="fy-agent-capability-header">
              <strong>{actionLabels[actionId]}</strong>
              <Badge tone={capabilityTone(capability.state)}>
                {actionStateLabels[capability.state]}
              </Badge>
            </div>
            <p>{capability.reason}</p>
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

function AgentObservation({ selectedId }: { selectedId: AgentCatalogId }) {
  return (
    <>
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

function modelTarget(id: AgentCatalogId): string | null {
  if (id === "workbuddy" || id === "codex") return id;
  if (id === "claude-code") return "claude";
  return null;
}

function AgentDetail({
  entry,
  contractVersion,
  reviewedAt,
  opening,
  onOpenOfficial,
}: {
  entry: AgentCatalogEntry;
  contractVersion: number;
  reviewedAt: string;
  opening: boolean;
  onOpenOfficial: () => void;
}) {
  const navigate = useNavigate();
  const target = modelTarget(entry.id);
  const officialOnly = entry.id === "qoderwork" || entry.id === "trae-work";

  return (
    <section
      className="fy-feature-panel fy-agent-detail"
      aria-label={`${entry.displayName} 详情`}
    >
      <div className="fy-agent-identity">
        <img
          className={`fy-agent-detail-icon${entry.id === "trae-work" ? " fy-agent-detail-icon-native-size" : ""}`}
          src={getAgentIcon(entry.id)}
          alt={`${entry.displayName} 图标`}
        />
        <div className="fy-agent-identity-copy">
          <div className="fy-agent-identity-title">
            <h2>{entry.displayName}</h2>
            <Badge tone={catalogStatusTone(entry.status)}>
              {catalogStatusLabels[entry.status]}
            </Badge>
          </div>
          <p className="fy-feature-description">{entry.description}</p>
        </div>
      </div>

      <section className="fy-agent-section" aria-label="能力范围">
        <h3>能力范围</h3>
        <CapabilityGrid entry={entry} />
      </section>

      <AgentObservation selectedId={entry.id} />

      <div className="fy-agent-action-row">
        <Button
          className={officialOnly ? "fy-control-button-primary" : undefined}
          disabled={opening || entry.actions.browse.state !== "available"}
          onClick={onOpenOfficial}
        >
          {opening ? "正在打开…" : officialOnly ? "打开官方入口" : "打开官网"}
        </Button>
        {target && entry.actions.configure.state === "available" && (
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
        {entry.evidenceLabel}
      </p>
    </section>
  );
}

export function AgentsPage() {
  const { ports, notify } = useFeatures();
  const catalogQuery = useAgentCatalog();
  const [selectedId, setSelectedId] = useState<AgentCatalogId | null>(null);
  const [openingId, setOpeningId] = useState<AgentCatalogId | null>(null);
  const openLock = useRef(false);
  const entries = catalogQuery.data?.agents ?? [];
  const convergedId = convergeSelection(entries, selectedId);
  const selected = entries.find((entry) => entry.id === convergedId) ?? null;

  const openOfficial = async (entry: AgentCatalogEntry) => {
    if (openLock.current) return;
    openLock.current = true;
    setOpeningId(entry.id);
    try {
      await ports.settings.openExternal(entry.officialUrl);
    } catch {
      notify({
        tone: "error",
        title: "无法打开官方入口",
        description: "请稍后重试；FyAgent 未执行任何安装或配置操作。",
      });
    } finally {
      setOpeningId(null);
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
        <div className="fy-agent-layout">
          <section
            className="fy-feature-panel fy-agent-catalog"
            aria-label="Agent 选择"
          >
            <div className="fy-agent-catalog-heading">
              <h2>选择 Agent</h2>
              <span>
                合同 v{catalogQuery.data.contractVersion} · 复核于{" "}
                {catalogQuery.data.reviewedAt}
              </span>
            </div>
            <div className="fy-agent-selector" role="list">
              {entries.map((entry) => (
                <div key={entry.id} role="listitem">
                  <button
                    type="button"
                    className="fy-agent-selector-item"
                    aria-current={entry.id === selected.id ? "true" : undefined}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <img
                      className="fy-agent-selector-icon"
                      src={getAgentIcon(entry.id)}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="fy-agent-selector-copy">
                      <strong>{entry.displayName}</strong>
                      <span className="fy-agent-selector-state">
                        {catalogStatusLabels[entry.status]}
                      </span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <AgentDetail
            entry={selected}
            contractVersion={catalogQuery.data.contractVersion}
            reviewedAt={catalogQuery.data.reviewedAt}
            opening={openingId !== null}
            onOpenOfficial={() => void openOfficial(selected)}
          />
        </div>
      )}
    </div>
  );
}
