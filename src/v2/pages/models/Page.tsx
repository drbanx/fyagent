import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getAgentIcon, type AgentIconId } from "../../shared/assets/agents";
import type { FeaturePorts } from "../../shared/features/ports";
import { useFeatures } from "../../shared/features/provider";
import {
  useAgentCatalog,
  useProviderSummary,
  useWorkBuddyModelIds,
  useWorkBuddyStatus,
} from "../../shared/features/queries";
import type {
  CodexProviderMutationWarning,
  ProviderAppId,
} from "../../shared/features/types";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  InlineNotice,
  Input,
  Spinner,
} from "../../shared/ui/primitives";
import {
  buildQuickSetupRequest,
  isHttpUrl,
  MODEL_TARGETS,
  parseManualModelIds,
  parseModelTarget,
  QUICK_SETUP_PROVIDER_IDS,
  validateQuickSetup,
  type ModelTarget,
  type QuickSetupErrors,
} from "./quickSetup";
import "./Page.css";

type WorkBuddySaveRequest = Parameters<
  FeaturePorts["workbuddy"]["saveModels"]
>[0];

const TARGET_PRESENTATION: Record<
  ModelTarget,
  { label: string; summary: string }
> = {
  qoderwork: { label: "QoderWork CN", summary: "官方辅助设置" },
  trae: { label: "TRAE Work", summary: "官方辅助设置" },
  workbuddy: { label: "WorkBuddy", summary: "专用模型配置" },
  codex: { label: "Codex", summary: "Provider 快速配置" },
  claude: { label: "Claude Code", summary: "Provider 快速配置" },
};

const TARGET_ICON_IDS: Readonly<Record<ModelTarget, AgentIconId>> = {
  qoderwork: "qoderwork",
  trae: "trae-work",
  workbuddy: "workbuddy",
  codex: "codex",
  claude: "claude-code",
};

type Notice = {
  tone: "info" | "warning" | "error";
  title: string;
  description?: string;
};

function NoticeView({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <InlineNotice tone={notice.tone}>
      <strong>{notice.title}</strong>
      {notice.description && (
        <p className="fy-models-muted">{notice.description}</p>
      )}
    </InlineNotice>
  );
}

function workBuddyErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return null;
  }
  return typeof error.code === "string" ? error.code : null;
}

function WorkBuddyPanel() {
  const { ports } = useFeatures();
  const statusQuery = useWorkBuddyStatus(true);
  const modelIdsQuery = useWorkBuddyModelIds(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKeyState] = useState("");
  const apiKeyRef = useRef("");
  const [allowNoApiKey, setAllowNoApiKey] = useState(false);
  const [clearExistingApiKeys, setClearExistingApiKeys] = useState(false);
  const [manualModels, setManualModels] = useState("");
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState<"fetch" | "save" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    request: WorkBuddySaveRequest;
    token: string;
    existingIds: string[];
  } | null>(null);
  const writeLock = useRef(false);
  const mountedRef = useRef(true);
  const baseUrlInputRef = useRef<HTMLInputElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const manualModelsInputRef = useRef<HTMLTextAreaElement>(null);

  const setApiKey = (value: string) => {
    apiKeyRef.current = value;
    setApiKeyState(value);
  };
  const clearApiKey = () => {
    apiKeyRef.current = "";
    if (mountedRef.current) setApiKeyState("");
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      apiKeyRef.current = "";
    };
  }, []);

  const refreshAuthoritativeState = async (): Promise<boolean> => {
    try {
      const [statusResult, modelIdsResult] = await Promise.all([
        statusQuery.refetch(),
        modelIdsQuery.refetch(),
      ]);
      return (
        !statusResult.isError &&
        statusResult.data !== undefined &&
        !modelIdsResult.isError &&
        modelIdsResult.data !== undefined
      );
    } catch {
      return false;
    }
  };

  const validateConnection = (): boolean => {
    if (!isHttpUrl(baseUrl.trim())) {
      setNotice({
        tone: "error",
        title: "请输入有效的 Base URL",
        description: "只接受不含账号信息的 HTTP(S) 地址。",
      });
      baseUrlInputRef.current?.focus();
      return false;
    }
    if (!allowNoApiKey && !apiKeyRef.current.trim()) {
      setNotice({ tone: "error", title: "请输入 API Key" });
      apiKeyInputRef.current?.focus();
      return false;
    }
    const credential = apiKeyRef.current.trim();
    if (credential) {
      const parsed = new URL(baseUrl.trim());
      const collision =
        parsed.hostname.includes(credential.toLocaleLowerCase("en-US")) ||
        parsed.pathname.split("/").some((segment) => {
          if (segment.includes(credential)) return true;
          try {
            return decodeURIComponent(segment).includes(credential);
          } catch {
            return false;
          }
        });
      if (collision) {
        setNotice({
          tone: "error",
          title: "Base URL 不能包含敏感凭据",
        });
        baseUrlInputRef.current?.focus();
        return false;
      }
    }
    return true;
  };

  const fetchModels = async () => {
    if (writeLock.current || !validateConnection()) return;
    const submittedApiKey = apiKeyRef.current.trim();
    writeLock.current = true;
    setBusy("fetch");
    setNotice(null);
    try {
      const result = await ports.workbuddy.fetchModels({
        baseUrl: baseUrl.trim(),
        apiKey: submittedApiKey,
        allowNoApiKey,
      });
      if (!mountedRef.current) return;
      if (
        submittedApiKey &&
        result.models.some((modelId) =>
          modelId.trim().includes(submittedApiKey),
        )
      ) {
        throw new Error("credential-model-id-conflict");
      }
      setFetchedModels(result.models);
      setSelectedModelIds(new Set(result.models));
      setTruncated(result.truncated);
      setNotice({
        tone: result.truncated ? "warning" : "info",
        title: result.truncated
          ? "模型列表已按安全上限截断"
          : `已读取 ${result.models.length} 个模型`,
        description: "尚未写入 WorkBuddy；请确认选择后再保存。",
      });
    } catch {
      if (mountedRef.current)
        setNotice({
          tone: "error",
          title: "模型读取失败",
          description: "请检查地址、凭据和服务状态后重试。",
        });
    } finally {
      clearApiKey();
      if (mountedRef.current) setBusy(null);
      writeLock.current = false;
    }
  };

  const buildSaveRequest = (): WorkBuddySaveRequest => {
    const selected = [...selectedModelIds];
    const manual = parseManualModelIds(manualModels);
    const request = {
      baseUrl: baseUrl.trim(),
      apiKey: apiKeyRef.current.trim(),
      allowNoApiKey,
      selectedModelIds: selected,
      manualModelIds: manual,
      clearExistingApiKeys,
      expectedRevision:
        modelIdsQuery.data?.revision ?? statusQuery.data?.revision ?? null,
    } satisfies WorkBuddySaveRequest;

    Object.freeze(request.selectedModelIds);
    Object.freeze(request.manualModelIds);
    return Object.freeze(request);
  };

  const saveRequest = async (request: WorkBuddySaveRequest) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy("save");
    setNotice(null);
    let shouldRefresh = true;
    let rereadNotice: {
      confirmed: Notice;
      unconfirmed: Notice;
    } | null = null;
    try {
      const result = await ports.workbuddy.saveModels(request);
      if (!mountedRef.current) return;

      switch (result.state) {
        case "saved":
          setPendingOverwrite(null);
          setNotice({
            tone: "info",
            title: "WorkBuddy 模型配置已保存",
            description: `共 ${result.modelCount} 个模型；新增 ${result.createdEntries}，更新 ${result.updatedEntries}。`,
          });
          break;
        case "concurrent_modification":
          setPendingOverwrite(null);
          rereadNotice = {
            confirmed: {
              tone: "warning",
              title: "配置已被其他操作修改",
              description: "权威状态已重新读取，请检查后再次提交。",
            },
            unconfirmed: {
              tone: "warning",
              title: "配置已被其他操作修改",
              description: "权威状态回读未完成；请刷新状态后再次提交。",
            },
          };
          break;
        case "overwrite_confirmation_required":
          if (request.overwriteToken) {
            setPendingOverwrite(null);
            rereadNotice = {
              confirmed: {
                tone: "error",
                title: "覆盖确认已失效",
                description: "权威状态已重新读取，请重新提交。",
              },
              unconfirmed: {
                tone: "error",
                title: "覆盖确认已失效",
                description: "权威状态回读未完成；请刷新状态后重新提交。",
              },
            };
          } else {
            shouldRefresh = false;
            setPendingOverwrite({
              request,
              token: result.token,
              existingIds: [...result.existingIds],
            });
          }
          break;
      }
    } catch (error) {
      if (mountedRef.current) {
        setPendingOverwrite(null);
        const code = workBuddyErrorCode(error);
        if (
          request.overwriteToken &&
          (code === "WORKBUDDY_OVERWRITE_TOKEN_EXPIRED" ||
            code === "WORKBUDDY_OVERWRITE_TOKEN_INVALID")
        ) {
          rereadNotice = {
            confirmed: {
              tone: "error",
              title: "覆盖确认已失效",
              description: "权威状态已重新读取，请重新提交。",
            },
            unconfirmed: {
              tone: "error",
              title: "覆盖确认已失效",
              description: "权威状态回读未完成；请刷新状态后重新提交。",
            },
          };
        } else {
          setNotice({
            tone: "error",
            title: "保存失败",
            description: "未显示后端原始详情；请刷新状态并检查输入后重试。",
          });
        }
      }
    } finally {
      clearApiKey();
      const rereadConfirmed = shouldRefresh
        ? await refreshAuthoritativeState()
        : false;
      if (mountedRef.current && rereadNotice) {
        setNotice(
          rereadConfirmed ? rereadNotice.confirmed : rereadNotice.unconfirmed,
        );
      }
      if (mountedRef.current) setBusy(null);
      writeLock.current = false;
    }
  };

  const startSave = () => {
    if (writeLock.current || !validateConnection()) return;
    const request = buildSaveRequest();
    const submittedApiKey = request.apiKey.trim();
    if (
      submittedApiKey &&
      [...request.selectedModelIds, ...request.manualModelIds].some((modelId) =>
        modelId.trim().includes(submittedApiKey),
      )
    ) {
      clearApiKey();
      setNotice({
        tone: "error",
        title: "模型 ID 与敏感凭据冲突",
        description: "请检查模型 ID 后重试。",
      });
      manualModelsInputRef.current?.focus();
      return;
    }
    if (
      request.selectedModelIds.length === 0 &&
      request.manualModelIds.length === 0
    ) {
      setNotice({ tone: "error", title: "请至少选择或填写一个模型 ID" });
      manualModelsInputRef.current?.focus();
      return;
    }
    void saveRequest(request);
  };

  const confirmOverwrite = () => {
    if (!pendingOverwrite || writeLock.current) return;
    const frozen = pendingOverwrite;
    setPendingOverwrite(null);
    void saveRequest({
      ...frozen.request,
      overwriteToken: frozen.token,
    });
  };

  const status = statusQuery.data;
  const modelIds = modelIdsQuery.data?.ids ?? [];
  const loading = statusQuery.isLoading || modelIdsQuery.isLoading;
  const readFailed = statusQuery.isError || modelIdsQuery.isError;

  return (
    <section className="fy-models-config-panel" aria-label="WorkBuddy 模型配置">
      <header className="fy-models-config-heading">
        <div>
          <h2>WorkBuddy</h2>
          <p>通过专用后端读取、发现并按 revision 保存模型配置。</p>
        </div>
        <Badge tone="accent">原生 WorkBuddy 命令</Badge>
      </header>

      {loading && <Spinner label="正在读取 WorkBuddy 状态" />}
      {readFailed && (
        <InlineNotice tone="error">
          WorkBuddy 状态暂不可用；这不代表未安装或未配置。
        </InlineNotice>
      )}
      {status && (
        <div className="fy-models-status-grid" data-testid="workbuddy-status">
          <div className="fy-models-status-item">
            <span>配置状态</span>
            <strong>{status.exists ? "已发现配置文件" : "尚无配置文件"}</strong>
          </div>
          <div className="fy-models-status-item">
            <span>模型数量</span>
            <strong>{status.modelCount}</strong>
          </div>
          <div className="fy-models-status-item">
            <span>备份</span>
            <strong>{status.backupExists ? "存在" : "未发现"}</strong>
          </div>
        </div>
      )}
      <div className="fy-models-status-item" data-testid="workbuddy-model-ids">
        <span>当前模型 ID</span>
        <code>{modelIds.length ? modelIds.join(", ") : "未观察到模型 ID"}</code>
      </div>

      <div className="fy-models-form">
        <label className="fy-control-field">
          Base URL
          <Input
            ref={baseUrlInputRef}
            id="workbuddy-base-url"
            name="workbuddy-base-url"
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://gateway.example/v1"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="fy-control-field">
          API Key
          <Input
            ref={apiKeyInputRef}
            id="workbuddy-api-key"
            name="workbuddy-api-key"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="fy-models-checkbox-row">
          <Checkbox
            checked={allowNoApiKey}
            onCheckedChange={setAllowNoApiKey}
            label="允许无 API Key"
            disabled={busy !== null}
          />
          <span>允许无 API Key（请求将完全省略 Authorization）</span>
        </div>
        <div className="fy-models-checkbox-row">
          <Checkbox
            checked={clearExistingApiKeys}
            onCheckedChange={setClearExistingApiKeys}
            label="清除已有模型的 API Key"
            disabled={busy !== null}
          />
          <span>清除被更新模型中已有的 API Key</span>
        </div>

        <div className="fy-models-actions">
          <Button disabled={busy !== null} onClick={() => void fetchModels()}>
            {busy === "fetch" ? "读取中…" : "拉取模型"}
          </Button>
        </div>

        {fetchedModels.length > 0 && (
          <div className="fy-models-form-wide">
            <h3>远端模型</h3>
            {truncated && (
              <p className="fy-models-muted">列表已按后端安全上限截断。</p>
            )}
            <ul className="fy-models-model-list" aria-label="远端模型列表">
              {fetchedModels.map((modelId) => (
                <li key={modelId}>
                  <label className="fy-models-model-option">
                    <Checkbox
                      checked={selectedModelIds.has(modelId)}
                      onCheckedChange={(checked) =>
                        setSelectedModelIds((current) => {
                          const next = new Set(current);
                          if (checked) next.add(modelId);
                          else next.delete(modelId);
                          return next;
                        })
                      }
                      label={`选择模型 ${modelId}`}
                      disabled={busy !== null}
                    />
                    <code>{modelId}</code>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="fy-control-field fy-models-form-wide">
          手动模型 ID
          <textarea
            ref={manualModelsInputRef}
            id="workbuddy-manual-model-ids"
            name="workbuddy-manual-model-ids"
            className="fy-control-textarea"
            rows={4}
            value={manualModels}
            onChange={(event) => setManualModels(event.target.value)}
            placeholder="每行一个，或使用逗号分隔"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="fy-models-actions">
          <Button
            className="fy-control-button-primary"
            disabled={busy !== null || loading || readFailed}
            onClick={startSave}
          >
            {busy === "save" ? "保存中…" : "保存并应用"}
          </Button>
        </div>
      </div>

      <NoticeView notice={notice} />

      <Dialog
        open={Boolean(pendingOverwrite)}
        onOpenChange={(open) => {
          if (!open && busy === null) setPendingOverwrite(null);
        }}
        title="确认覆盖已有模型"
        description={
          pendingOverwrite
            ? `以下模型已存在：${pendingOverwrite.existingIds.slice(0, 6).join(", ")}${pendingOverwrite.existingIds.length > 6 ? "…" : ""}`
            : undefined
        }
        actions={
          <>
            <Button
              disabled={busy !== null}
              onClick={() => setPendingOverwrite(null)}
            >
              取消
            </Button>
            <Button
              className="fy-control-button-danger"
              disabled={busy !== null}
              onClick={confirmOverwrite}
            >
              {busy === "save" ? "处理中…" : "确认覆盖"}
            </Button>
          </>
        }
      >
        <p>确认后只会重放刚才冻结的请求，并使用一次性后端令牌。</p>
      </Dialog>
    </section>
  );
}

const WARNING_COPY: Record<CodexProviderMutationWarning, string> = {
  CODEX_WEBSOCKET_NON_GPT_MODEL:
    "当前 WebSocket 配置包含非 GPT 模型，兼容性需要自行确认。",
  CODEX_WEBSOCKET_PROXY_MAY_BE_UNSUPPORTED:
    "当前代理可能不支持 WebSocket Upgrade。",
};

function sanitizeWarningCodes(
  ...groups: ReadonlyArray<readonly string[] | undefined>
): CodexProviderMutationWarning[] {
  return [
    ...new Set(
      groups
        .flatMap((group) => group ?? [])
        .filter((code): code is CodexProviderMutationWarning =>
          Object.prototype.hasOwnProperty.call(WARNING_COPY, code),
        ),
    ),
  ];
}

function ProviderPanel({ app }: { app: ProviderAppId }) {
  const { ports } = useFeatures();
  const summaryQuery = useProviderSummary(app, true);
  const [name, setName] = useState(
    app === "codex"
      ? "FyAgent Codex Quick Setup"
      : "FyAgent Claude Quick Setup",
  );
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKeyState] = useState("");
  const apiKeyRef = useRef("");
  const [modelId, setModelId] = useState("");
  const [errors, setErrors] = useState<QuickSetupErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [warningCodes, setWarningCodes] = useState<
    CodexProviderMutationWarning[]
  >([]);
  const writeLock = useRef(false);
  const mountedRef = useRef(true);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const baseUrlInputRef = useRef<HTMLInputElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const modelIdInputRef = useRef<HTMLInputElement>(null);

  const setApiKey = (value: string) => {
    apiKeyRef.current = value;
    setApiKeyState(value);
  };
  const clearApiKey = () => {
    apiKeyRef.current = "";
    if (mountedRef.current) setApiKeyState("");
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      apiKeyRef.current = "";
    };
  }, []);

  const providerId = QUICK_SETUP_PROVIDER_IDS[app];
  const providerExists = Boolean(summaryQuery.data?.providers[providerId]);
  const currentId = summaryQuery.data?.currentId ?? "";

  const submit = async () => {
    if (writeLock.current) return;
    const validated = validateQuickSetup(
      {
        name,
        baseUrl,
        apiKey: apiKeyRef.current,
        modelId,
      },
      app,
    );
    if (!validated.ok) {
      setErrors(validated.errors);
      const firstInvalidField = (
        ["name", "baseUrl", "apiKey", "modelId"] as const
      ).find((field) => validated.errors[field]);
      const fieldRefs = {
        name: nameInputRef,
        baseUrl: baseUrlInputRef,
        apiKey: apiKeyInputRef,
        modelId: modelIdInputRef,
      };
      if (firstInvalidField) fieldRefs[firstInvalidField].current?.focus();
      return;
    }

    writeLock.current = true;
    setBusy(true);
    setErrors({});
    setNotice(null);
    setWarningCodes([]);
    let authorityRereadAttempted = false;
    try {
      const request = buildQuickSetupRequest(app, validated.value);
      const applyResult = await ports.providers.applyQuickSetupWithResult(
        request,
        app,
      );
      if (!mountedRef.current) return;
      const warnings = sanitizeWarningCodes(applyResult.warningCodes);
      setWarningCodes(warnings);
      const hasPartialWarning = applyResult.value.warnings.length > 0;
      let refreshed: Awaited<ReturnType<typeof summaryQuery.refetch>> | null =
        null;
      try {
        refreshed = await summaryQuery.refetch();
      } catch {
        refreshed = null;
      } finally {
        authorityRereadAttempted = true;
      }
      if (!mountedRef.current) return;

      const activeIdConfirmed =
        refreshed !== null &&
        !refreshed.isError &&
        refreshed.data?.currentId === providerId;
      const liveDescription = applyResult.liveConfigChanged
        ? "本次原子应用期间，Codex live 配置字节已更新；重启或新建会话是独立步骤。"
        : "本次原子应用期间，后端观察到 Codex live 配置字节未变化；未执行自动重启。";
      if (!activeIdConfirmed) {
        setNotice({
          tone: "warning",
          title:
            "本次配置已原子应用，但回读未确认固定 Quick Setup Provider ID 处于激活状态",
          description:
            app === "codex"
              ? `${liveDescription} 请刷新状态并确认固定 Provider ID 的当前选择。`
              : "回读失败或未返回固定 Quick Setup Provider ID；请刷新状态确认。",
        });
      } else {
        setNotice({
          tone: warnings.length || hasPartialWarning ? "warning" : "info",
          title: "本次配置已原子应用；固定 Quick Setup Provider ID 已确认激活",
          description:
            app === "codex"
              ? hasPartialWarning
                ? `${liveDescription} 权威摘要回读仅确认固定 Provider ID 已激活；非关键投影未完成，将在后续同步时自愈。`
                : `${liveDescription} 权威摘要回读仅确认固定 Provider ID 已激活，不验证本次配置内容字节。`
              : hasPartialWarning
                ? "固定 Quick Setup Provider ID 已确认激活；非关键投影未完成，将在后续同步时自愈。"
                : "权威摘要回读仅确认固定 Quick Setup Provider ID 已激活，不验证本次配置内容字节。",
        });
      }
    } catch (error) {
      if (mountedRef.current) {
        const stateUnknown =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ROLLBACK_PARTIAL_STATE_UNKNOWN";
        setNotice({
          tone: "error",
          title: stateUnknown
            ? "Provider 状态未知，请停止继续写入"
            : "Provider 原子应用失败，已完成回滚",
          description: stateUnknown
            ? "后端未能确认完整补偿；请刷新并人工核对 Provider、live 配置与代理状态。原始错误已隐藏。"
            : "后端已确认完整补偿；未显示可能包含敏感信息的原始错误，请以权威回读为准。",
        });
      }
    } finally {
      clearApiKey();
      if (!authorityRereadAttempted) await summaryQuery.refetch();
      if (mountedRef.current) setBusy(false);
      writeLock.current = false;
    }
  };

  const label = app === "codex" ? "Codex" : "Claude Code";
  const queryUnavailable = summaryQuery.isError;
  const queryPending = summaryQuery.isLoading;

  return (
    <section
      className="fy-models-config-panel"
      aria-label={`${label} 模型配置`}
    >
      <header className="fy-models-config-heading">
        <div>
          <h2>{label}</h2>
          <p>
            通过单次原子命令保存并切换固定 quick-setup
            Provider，再重新读取权威状态。
          </p>
        </div>
        <Badge tone="accent">原生 Provider 命令</Badge>
      </header>

      {queryPending && <Spinner label={`正在读取 ${label} Provider`} />}
      {queryUnavailable && (
        <InlineNotice tone="error">
          Provider 汇总暂不可用；为避免重复创建，当前禁止提交。
        </InlineNotice>
      )}
      {!queryUnavailable && !queryPending && (
        <div className="fy-models-status-grid" data-testid="provider-status">
          <div className="fy-models-status-item">
            <span>Quick Setup Provider</span>
            <strong>
              {providerExists ? "已存在，将更新" : "尚不存在，将新增"}
            </strong>
          </div>
          <div className="fy-models-status-item">
            <span>当前 Provider</span>
            <code>{currentId || "未观察到当前选择"}</code>
          </div>
          <div className="fy-models-status-item">
            <span>固定 ID</span>
            <code>{providerId}</code>
          </div>
        </div>
      )}

      <div className="fy-models-form">
        <div className="fy-control-field">
          <label htmlFor={`${app}-quick-setup-name`}>配置名称</label>
          <Input
            ref={nameInputRef}
            id={`${app}-quick-setup-name`}
            name={`${app}-quick-setup-name`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={
              errors.name ? `${app}-quick-setup-name-error` : undefined
            }
          />
          {errors.name && (
            <span
              id={`${app}-quick-setup-name-error`}
              className="fy-control-field-error"
              role="alert"
            >
              {errors.name}
            </span>
          )}
        </div>
        <div className="fy-control-field">
          <label htmlFor={`${app}-quick-setup-base-url`}>Base URL</label>
          <Input
            ref={baseUrlInputRef}
            id={`${app}-quick-setup-base-url`}
            name={`${app}-quick-setup-base-url`}
            type="url"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder="https://gateway.example/v1"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.baseUrl)}
            aria-describedby={
              errors.baseUrl ? `${app}-quick-setup-base-url-error` : undefined
            }
          />
          {errors.baseUrl && (
            <span
              id={`${app}-quick-setup-base-url-error`}
              className="fy-control-field-error"
              role="alert"
            >
              {errors.baseUrl}
            </span>
          )}
        </div>
        <div className="fy-control-field">
          <label htmlFor={`${app}-quick-setup-api-key`}>API Key</label>
          <Input
            ref={apiKeyInputRef}
            id={`${app}-quick-setup-api-key`}
            name={`${app}-quick-setup-api-key`}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.apiKey)}
            aria-describedby={
              errors.apiKey ? `${app}-quick-setup-api-key-error` : undefined
            }
          />
          {errors.apiKey && (
            <span
              id={`${app}-quick-setup-api-key-error`}
              className="fy-control-field-error"
              role="alert"
            >
              {errors.apiKey}
            </span>
          )}
        </div>
        <div className="fy-control-field">
          <label htmlFor={`${app}-quick-setup-model-id`}>模型 ID</label>
          <Input
            ref={modelIdInputRef}
            id={`${app}-quick-setup-model-id`}
            name={`${app}-quick-setup-model-id`}
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={Boolean(errors.modelId)}
            aria-describedby={
              errors.modelId ? `${app}-quick-setup-model-id-error` : undefined
            }
          />
          {errors.modelId && (
            <span
              id={`${app}-quick-setup-model-id-error`}
              className="fy-control-field-error"
              role="alert"
            >
              {errors.modelId}
            </span>
          )}
        </div>
        <div className="fy-models-actions">
          <Button
            className="fy-control-button-primary"
            disabled={busy || queryPending || queryUnavailable}
            onClick={() => void submit()}
          >
            {busy ? "配置中…" : "保存并切换"}
          </Button>
        </div>
      </div>

      <NoticeView notice={notice} />
      {warningCodes.length > 0 && (
        <InlineNotice tone="warning">
          <strong>Codex 配置警告</strong>
          <ul className="fy-models-warning-list">
            {warningCodes.map((code) => (
              <li key={code}>{WARNING_COPY[code]}</li>
            ))}
          </ul>
        </InlineNotice>
      )}
    </section>
  );
}

function GuidancePanel({ target }: { target: "qoderwork" | "trae" }) {
  const { ports } = useFeatures();
  const catalogQuery = useAgentCatalog();
  const [endpointNote, setEndpointNote] = useState("");
  const [modelNote, setModelNote] = useState("");
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const openLock = useRef(false);
  const mountedRef = useRef(true);
  const catalogId = target === "trae" ? "trae-work" : "qoderwork";
  const entry = catalogQuery.data?.agents.find(
    (agent) => agent.id === catalogId,
  );
  const label = target === "trae" ? "TRAE Work" : "QoderWork CN";

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      openLock.current = false;
    };
  }, []);

  const openOfficial = async () => {
    if (!entry || openLock.current) return;
    openLock.current = true;
    setOpening(true);
    setNotice(null);
    try {
      await ports.settings.openExternal(entry.officialUrl);
    } catch {
      if (mountedRef.current) {
        setNotice({
          tone: "error",
          title: "无法打开官方设置",
          description: "请稍后重试；FyAgent 未执行任何配置写入。",
        });
      }
    } finally {
      openLock.current = false;
      if (mountedRef.current) setOpening(false);
    }
  };

  return (
    <section
      className="fy-models-config-panel"
      aria-label={`${label} 官方辅助设置`}
    >
      <header className="fy-models-config-heading">
        <div>
          <h2>{label}</h2>
          <p>当前仅提供厂商官方设置入口，不探测登录态或私有配置格式。</p>
        </div>
        <Badge tone="warning">待验证</Badge>
      </header>

      <InlineNotice tone="warning">
        FyAgent
        不会写入这些值。端点与模型备注只存在于当前组件内存，切换目标或离开页面即丢弃。
      </InlineNotice>

      <div className="fy-models-guidance-fields">
        <label className="fy-control-field">
          端点备注
          <Input
            id={`${target}-endpoint-note`}
            name={`${target}-endpoint-note`}
            value={endpointNote}
            onChange={(event) => setEndpointNote(event.target.value)}
            placeholder="仅供复制到官方设置时参考"
            autoComplete="off"
          />
        </label>
        <label className="fy-control-field">
          模型备注
          <Input
            id={`${target}-model-note`}
            name={`${target}-model-note`}
            value={modelNote}
            onChange={(event) => setModelNote(event.target.value)}
            placeholder="不会由 FyAgent 保存或提交"
            autoComplete="off"
          />
        </label>
      </div>

      {catalogQuery.isLoading && (
        <Spinner label={`正在读取 ${label} 官方入口`} />
      )}
      {catalogQuery.isError && (
        <InlineNotice tone="error">
          目录暂不可用；为避免跳转到未经验证的地址，按钮已禁用。
        </InlineNotice>
      )}
      <div className="fy-models-actions">
        <Button
          disabled={!entry || opening}
          onClick={() => void openOfficial()}
        >
          {opening ? "正在打开…" : "打开官方设置"}
        </Button>
      </div>
      <NoticeView notice={notice} />
    </section>
  );
}

function TargetPanel({ target }: { target: ModelTarget }) {
  switch (target) {
    case "workbuddy":
      return <WorkBuddyPanel />;
    case "codex":
    case "claude":
      return <ProviderPanel app={target} />;
    case "qoderwork":
    case "trae":
      return <GuidancePanel target={target} />;
  }
}

export function ModelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const target = parseModelTarget(searchParams.get("target"));
  const targets = useMemo(() => MODEL_TARGETS, []);

  return (
    <div
      className="fy-feature-page fy-models-page"
      data-testid="models-page"
      aria-labelledby="fy-models-title"
    >
      <header className="fy-feature-header">
        <div className="fy-feature-heading">
          <h1 id="fy-models-title">模型快速配置</h1>
          <p>
            选择一个 Agent；所有写入都需要明确点击，并在完成后重新读取权威状态。
          </p>
        </div>
      </header>

      <div className="fy-models-layout">
        <aside className="fy-models-target-panel" aria-label="模型配置目标">
          <h2>选择 Agent</h2>
          <div className="fy-models-target-list">
            {targets.map((candidate) => {
              const presentation = TARGET_PRESENTATION[candidate];
              return (
                <button
                  key={candidate}
                  type="button"
                  className="fy-models-target"
                  aria-current={candidate === target ? "true" : undefined}
                  data-testid={`model-target-${candidate}`}
                  onClick={() =>
                    setSearchParams({ target: candidate }, { replace: true })
                  }
                >
                  <img
                    className="fy-models-target-icon"
                    src={getAgentIcon(TARGET_ICON_IDS[candidate])}
                    alt=""
                    aria-hidden="true"
                  />
                  <span className="fy-models-target-copy">
                    <strong>{presentation.label}</strong>
                    <span>{presentation.summary}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>
        <TargetPanel key={target} target={target} />
      </div>
    </div>
  );
}
