import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { getAgentBrand, type AgentIconId } from "../../shared/assets/agents";
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
  TraeModelProbeResult,
  TraeWorkModelRequest,
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
  CatalogDetail,
  CatalogList,
  CatalogListItem,
  CatalogMasterDetail,
  CatalogRail,
} from "../../shared/ui/catalog";
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
  qoderwork: { label: "QoderWork CN", summary: "内置模型 / Hooks / MCP" },
  trae: { label: "TRAE Work", summary: "模型连接预检" },
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
    <CatalogDetail
      className="fy-models-config-panel"
      ariaLabel="WorkBuddy 模型配置"
    >
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
    </CatalogDetail>
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

function ProviderPanel({
  app,
  writesBlocked,
  onBlockWrites,
}: {
  app: ProviderAppId;
  writesBlocked: boolean;
  onBlockWrites: (app: ProviderAppId) => void;
}) {
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
    if (writeLock.current || writesBlocked) return;
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
    let keepWriteLock = false;
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
        const rollbackConfirmed =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "APPLY_FAILED_ROLLED_BACK";
        const stateUnknown = !rollbackConfirmed;
        if (stateUnknown) {
          keepWriteLock = true;
          onBlockWrites(app);
        }
        setNotice({
          tone: "error",
          title: stateUnknown
            ? "Provider 状态未知，请停止继续写入"
            : "Provider 原子应用失败，已完成回滚",
          description: stateUnknown
            ? "后端未能确认完整补偿；当前页面已停止后续写入。请重新进入页面并人工核对 Provider、live 配置与代理状态。原始错误已隐藏。"
            : "后端已确认完整补偿；未显示可能包含敏感信息的原始错误，请以权威回读为准。",
        });
      }
    } finally {
      clearApiKey();
      if (!authorityRereadAttempted) await summaryQuery.refetch();
      if (mountedRef.current) setBusy(false);
      if (!keepWriteLock) writeLock.current = false;
    }
  };

  const label = app === "codex" ? "Codex" : "Claude Code";
  const queryUnavailable = summaryQuery.isError;
  const queryPending = summaryQuery.isLoading;

  return (
    <CatalogDetail
      className="fy-models-config-panel"
      ariaLabel={`${label} 模型配置`}
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
            disabled={busy || writesBlocked || queryPending || queryUnavailable}
            onClick={() => void submit()}
          >
            {busy
              ? "配置中…"
              : writesBlocked
                ? "状态未知，已停止写入"
                : "保存并切换"}
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
    </CatalogDetail>
  );
}

function QoderGuidancePanel() {
  const { ports } = useFeatures();
  const navigate = useNavigate();
  const catalogQuery = useAgentCatalog();
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const openLock = useRef(false);
  const mountedRef = useRef(true);
  const entry = catalogQuery.data?.agents.find(
    (agent) => agent.id === "qoderwork",
  );
  const productLink = entry?.officialLinks.find(
    (link) => link.id === "product",
  );
  const productCapability = entry?.capabilities.find(
    (capability) => capability.id === "product.open",
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      openLock.current = false;
    };
  }, []);

  const openOfficial = async () => {
    if (!productLink || openLock.current) return;
    openLock.current = true;
    setOpening(true);
    setNotice(null);
    try {
      await ports.settings.openExternal(productLink.url);
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
    <CatalogDetail
      className="fy-models-config-panel"
      ariaLabel="QoderWork CN 模型与能力入口"
    >
      <header className="fy-models-config-heading">
        <div>
          <h2>QoderWork CN</h2>
          <p>
            QoderWork 使用厂商内置模型能力；FyAgent 不写入未公开的模型私有存储。
          </p>
        </div>
        <Badge tone="neutral">厂商内置模型</Badge>
      </header>

      <InlineNotice>
        可在 Agent 目录中读取/编辑 Qoder Hooks，并对 MCP JSON 做不执行 server
        的静态预检。模型选择和最终 MCP 配置仍在 QoderWork 厂商界面完成。
      </InlineNotice>

      {catalogQuery.isLoading && (
        <Spinner label="正在读取 QoderWork 官方入口" />
      )}
      {catalogQuery.isError && (
        <InlineNotice tone="error">
          目录暂不可用；为避免跳转到未经验证的地址，按钮已禁用。
        </InlineNotice>
      )}
      <div className="fy-models-actions">
        <Button
          className="fy-control-button-primary"
          onClick={() => navigate("/agents?target=qoderwork")}
        >
          管理 Hooks / 预检 MCP
        </Button>
        <Button
          disabled={
            !productLink ||
            (productCapability?.mode !== "direct" &&
              productCapability?.mode !== "assisted") ||
            opening
          }
          onClick={() => void openOfficial()}
        >
          {opening ? "正在打开…" : "打开官方设置"}
        </Button>
      </div>
      <NoticeView notice={notice} />
    </CatalogDetail>
  );
}

const traeProbeCopy: Readonly<
  Record<
    TraeModelProbeResult["state"],
    { tone: Notice["tone"]; title: string; description: string }
  >
> = {
  reachable: {
    tone: "info",
    title: "FyAgent 本次连接预检可达",
    description:
      "这只证明本次受限请求通过 FyAgent 预检，不表示 TRAE 已保存配置、完全兼容或厂商最终检查会成功。请回到 TRAE 完成最终保存。",
  },
  auth_rejected: {
    tone: "warning",
    title: "端点拒绝了本次认证预检",
    description: "API Key 已清除；请在 TRAE 厂商界面复核凭据后重试。",
  },
  model_rejected: {
    tone: "warning",
    title: "端点拒绝了模型标识",
    description: "API Key 已清除；请在 TRAE 厂商界面复核模型 ID。",
  },
  network_rejected: {
    tone: "warning",
    title: "连接被网络安全策略或远端响应拒绝",
    description: "未回显地址或响应正文；请检查 HTTPS、代理、DNS 与网络授权。",
  },
  timeout: {
    tone: "warning",
    title: "连接预检超时",
    description: "API Key 已清除；超时不代表 TRAE 已保存或端点不可用。",
  },
  cancelled: {
    tone: "warning",
    title: "连接预检已取消",
    description: "API Key 已清除，未产生 TRAE 配置写入。",
  },
};

function TraePreflightPanel() {
  const { ports } = useFeatures();
  const catalogQuery = useAgentCatalog();
  const [apiFormat, setApiFormat] = useState<TraeWorkModelRequest["apiFormat"]>(
    "openai_chat_completions",
  );
  const [urlMode, setUrlMode] =
    useState<TraeWorkModelRequest["urlMode"]>("base_url");
  const [url, setUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [allowNoApiKey, setAllowNoApiKey] = useState(false);
  const [allowLoopback, setAllowLoopback] = useState(false);
  const [allowPrivateNetwork, setAllowPrivateNetwork] = useState(false);
  const [probeConsent, setProbeConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [opening, setOpening] = useState(false);
  const mountedRef = useRef(true);
  const activeRequestIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const apiKeyRef = useRef("");
  const openLock = useRef(false);
  const entry = catalogQuery.data?.agents.find(
    (agent) => agent.id === "trae-work",
  );
  const productLink = entry?.officialLinks.find(
    (link) => link.id === "product",
  );
  const productCapability = entry?.capabilities.find(
    (capability) => capability.id === "product.open",
  );

  const clearApiKey = () => {
    apiKeyRef.current = "";
    if (mountedRef.current) setApiKey("");
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      apiKeyRef.current = "";
      const requestId = activeRequestIdRef.current;
      activeRequestIdRef.current = null;
      cancelRequestedRef.current = true;
      if (requestId)
        void ports.traeWork
          .cancelModelEndpoint(requestId)
          .catch(() => undefined);
    };
  }, [ports.traeWork]);

  const buildRequest = (): TraeWorkModelRequest | null => {
    const trimmedUrl = url.trim();
    const trimmedModelId = modelId.trim();
    if (!trimmedUrl || !trimmedModelId) {
      setNotice({
        tone: "error",
        title: "请填写 URL 和模型 ID",
        description: "结构校验不会把输入写入 URL、缓存或本地存储。",
      });
      return null;
    }
    try {
      const parsed = new URL(trimmedUrl);
      if (
        (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      )
        throw new Error("invalid");
    } catch {
      setNotice({
        tone: "error",
        title: "URL 结构无效",
        description:
          "只接受无 userinfo、query、fragment 的 HTTP(S) URL；后端仍会执行 DNS 与地址安全校验。",
      });
      return null;
    }
    if (!allowNoApiKey && apiKeyRef.current.trim().length === 0) {
      setNotice({
        tone: "error",
        title: "请填写 API Key 或明确允许无 Key 预检",
        description: "API Key 只用于当前一次原生命令。",
      });
      return null;
    }
    if (!probeConsent) {
      setNotice({
        tone: "error",
        title: "需要明确同意本次网络预检",
        description: "未同意时不会发起网络请求。",
      });
      return null;
    }
    return {
      apiFormat,
      urlMode,
      url: trimmedUrl,
      modelId: trimmedModelId,
      apiKey: apiKeyRef.current,
      allowNoApiKey,
      allowLoopback,
      allowPrivateNetwork,
    };
  };

  const runProbe = async () => {
    if (pending) return;
    setNotice(null);
    const request = buildRequest();
    if (!request) {
      clearApiKey();
      setProbeConsent(false);
      return;
    }
    cancelRequestedRef.current = false;
    setPending(true);
    try {
      const validation = await ports.traeWork.validateModelConfig(request);
      if (!mountedRef.current) return;
      activeRequestIdRef.current = validation.requestId;
      if (cancelRequestedRef.current) {
        await ports.traeWork.cancelModelEndpoint(validation.requestId);
        if (mountedRef.current) setNotice(traeProbeCopy.cancelled);
        return;
      }
      const result = await ports.traeWork.testModelEndpoint(
        validation.requestId,
        request,
      );
      if (!mountedRef.current) return;
      const copy = traeProbeCopy[result.state];
      setNotice(copy);
    } catch {
      if (mountedRef.current) {
        setNotice({
          tone: "error",
          title: "TRAE 模型预检失败",
          description:
            "请求已终止，API Key 与原始错误已清除；FyAgent 未写入 TRAE 配置。",
        });
      }
    } finally {
      activeRequestIdRef.current = null;
      cancelRequestedRef.current = false;
      clearApiKey();
      if (mountedRef.current) {
        setPending(false);
        setProbeConsent(false);
      }
    }
  };

  const cancelProbe = async () => {
    const requestId = activeRequestIdRef.current;
    cancelRequestedRef.current = true;
    clearApiKey();
    if (!requestId) return;
    try {
      await ports.traeWork.cancelModelEndpoint(requestId);
      if (mountedRef.current) {
        setNotice({
          tone: "warning",
          title: "已发送取消请求",
          description: "API Key 已立即清除，等待原生预检进入终态。",
        });
      }
    } catch {
      if (mountedRef.current) {
        setNotice({
          tone: "warning",
          title: "无法确认取消结果",
          description: "API Key 已立即清除；离开页面会再次请求取消。",
        });
      }
    }
  };

  const openOfficial = async () => {
    if (!productLink || openLock.current) return;
    openLock.current = true;
    setOpening(true);
    try {
      await ports.settings.openExternal(productLink.url);
    } catch {
      if (mountedRef.current) {
        setNotice({
          tone: "error",
          title: "无法打开 TRAE 官方设置",
          description: "FyAgent 未执行任何配置写入。",
        });
      }
    } finally {
      openLock.current = false;
      if (mountedRef.current) setOpening(false);
    }
  };

  return (
    <CatalogDetail
      className="fy-models-config-panel"
      ariaLabel="TRAE Work 模型连接预检"
    >
      <header className="fy-models-config-heading">
        <div>
          <h2>TRAE Work</h2>
          <p>
            结构校验后发起一次受限网络预检；最终模型保存仍在 TRAE 厂商界面完成。
          </p>
        </div>
        <Badge tone="warning">FyAgent 预检</Badge>
      </header>

      <div className="fy-models-form">
        <label className="fy-control-field">
          API Format
          <select
            className="fy-control-input"
            value={apiFormat}
            onChange={(event) =>
              setApiFormat(
                event.target.value as TraeWorkModelRequest["apiFormat"],
              )
            }
            disabled={pending}
          >
            <option value="openai_chat_completions">
              OpenAI Chat Completions
            </option>
            <option value="anthropic_messages">Anthropic Messages</option>
          </select>
        </label>
        <label className="fy-control-field">
          URL 模式
          <select
            className="fy-control-input"
            value={urlMode}
            onChange={(event) =>
              setUrlMode(event.target.value as TraeWorkModelRequest["urlMode"])
            }
            disabled={pending}
          >
            <option value="base_url">Base URL</option>
            <option value="complete_url">完整 Endpoint URL</option>
          </select>
        </label>
        <label className="fy-control-field fy-models-form-wide">
          {urlMode === "base_url" ? "Base URL" : "完整 Endpoint URL"}
          <Input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://gateway.example/v1"
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
          />
        </label>
        <label className="fy-control-field">
          模型 ID
          <Input
            value={modelId}
            onChange={(event) => setModelId(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={pending}
          />
        </label>
        <label className="fy-control-field">
          API Key
          <Input
            type="password"
            value={apiKey}
            onChange={(event) => {
              apiKeyRef.current = event.target.value;
              setApiKey(event.target.value);
            }}
            autoComplete="off"
            spellCheck={false}
            disabled={pending || allowNoApiKey}
          />
        </label>
        <div className="fy-models-form-wide fy-models-consent-list">
          <label className="fy-models-checkbox-row">
            <Checkbox
              checked={allowNoApiKey}
              onCheckedChange={(checked) => {
                setAllowNoApiKey(checked);
                if (checked) clearApiKey();
              }}
              label="允许无 API Key 预检"
              disabled={pending}
            />
            允许无 API Key 预检
          </label>
          <label className="fy-models-checkbox-row">
            <Checkbox
              checked={allowLoopback}
              onCheckedChange={setAllowLoopback}
              label="允许 loopback 地址"
              disabled={pending}
            />
            我确认目标是本机 loopback 地址（如适用）
          </label>
          <label className="fy-models-checkbox-row">
            <Checkbox
              checked={allowPrivateNetwork}
              onCheckedChange={setAllowPrivateNetwork}
              label="允许私有网络地址"
              disabled={pending}
            />
            我确认目标是受信任的私有网络地址（如适用）
          </label>
          <label className="fy-models-checkbox-row">
            <Checkbox
              checked={probeConsent}
              onCheckedChange={setProbeConsent}
              label="同意发起一次网络预检"
              disabled={pending}
            />
            我明确同意 FyAgent 发起一次受限网络预检
          </label>
        </div>
        <div className="fy-models-actions">
          <Button
            className="fy-control-button-primary"
            disabled={pending}
            onClick={() => void runProbe()}
          >
            {pending ? "正在预检…" : "验证并测试连接"}
          </Button>
          {pending && (
            <Button onClick={() => void cancelProbe()}>取消预检</Button>
          )}
          <Button
            disabled={
              !productLink ||
              (productCapability?.mode !== "direct" &&
                productCapability?.mode !== "assisted") ||
              opening
            }
            onClick={() => void openOfficial()}
          >
            {opening ? "正在打开…" : "打开 TRAE 官方模型设置"}
          </Button>
        </div>
      </div>
      <NoticeView notice={notice} />
      <InlineNotice>
        预检不会保存模型到 TRAE。即使本次可达，也必须回到 TRAE
        厂商界面完成配置并接受厂商自己的最终检查。
      </InlineNotice>
    </CatalogDetail>
  );
}

function TargetPanel({
  target,
  blockedProviderWrites,
  onBlockProviderWrites,
}: {
  target: ModelTarget;
  blockedProviderWrites: Partial<Record<ProviderAppId, boolean>>;
  onBlockProviderWrites: (app: ProviderAppId) => void;
}) {
  switch (target) {
    case "workbuddy":
      return <WorkBuddyPanel />;
    case "codex":
    case "claude":
      return (
        <ProviderPanel
          app={target}
          writesBlocked={Boolean(blockedProviderWrites[target])}
          onBlockWrites={onBlockProviderWrites}
        />
      );
    case "qoderwork":
      return <QoderGuidancePanel />;
    case "trae":
      return <TraePreflightPanel />;
  }
}

export function ModelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [blockedProviderWrites, setBlockedProviderWrites] = useState<
    Partial<Record<ProviderAppId, boolean>>
  >({});
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

      <CatalogMasterDetail>
        <CatalogRail as="aside" ariaLabel="模型配置目标" title="选择 Agent">
          <CatalogList>
            {targets.map((candidate) => {
              const presentation = TARGET_PRESENTATION[candidate];
              return (
                <CatalogListItem
                  key={candidate}
                  asset={getAgentBrand(TARGET_ICON_IDS[candidate])}
                  label={presentation.label}
                  summary={presentation.summary}
                  selected={candidate === target}
                  testId={`model-target-${candidate}`}
                  onSelect={() =>
                    setSearchParams({ target: candidate }, { replace: true })
                  }
                />
              );
            })}
          </CatalogList>
        </CatalogRail>
        <TargetPanel
          key={target}
          target={target}
          blockedProviderWrites={blockedProviderWrites}
          onBlockProviderWrites={(app) =>
            setBlockedProviderWrites((current) => ({
              ...current,
              [app]: true,
            }))
          }
        />
      </CatalogMasterDetail>
    </div>
  );
}
