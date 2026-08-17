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
  qoderwork: { label: "QoderWork CN", summary: "模型、Hooks 和 MCP" },
  trae: { label: "TRAE Work", summary: "测试模型连接" },
  workbuddy: { label: "WorkBuddy", summary: "管理模型设置" },
  codex: { label: "Codex", summary: "快速配置模型" },
  claude: { label: "Claude Code", summary: "快速配置模型" },
  opencode: { label: "OpenCode", summary: "在 OpenCode 中完成模型设置" },
};

const TARGET_ICON_IDS: Readonly<Record<ModelTarget, AgentIconId>> = {
  qoderwork: "qoderwork",
  trae: "trae-work",
  workbuddy: "workbuddy",
  codex: "codex",
  claude: "claude-code",
  opencode: "opencode",
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
        title: "请输入有效的服务地址",
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
          title: "服务地址不能包含 API Key",
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
          ? "已达到可显示的模型数量上限"
          : `已读取 ${result.models.length} 个模型`,
        description: "请确认选择后再保存。",
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
              description: "已刷新当前设置，请检查后再次提交。",
            },
            unconfirmed: {
              tone: "warning",
              title: "配置已被其他操作修改",
              description: "暂时无法刷新当前设置，请刷新后再次提交。",
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
                description: "已刷新当前设置，请重新提交。",
              },
              unconfirmed: {
                tone: "error",
                title: "覆盖确认已失效",
                description: "暂时无法刷新当前设置，请刷新后重新提交。",
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
              description: "已刷新当前设置，请重新提交。",
            },
            unconfirmed: {
              tone: "error",
              title: "覆盖确认已失效",
              description: "暂时无法刷新当前设置，请刷新后重新提交。",
            },
          };
        } else {
          setNotice({
            tone: "error",
            title: "保存失败",
            description: "请刷新当前设置、检查输入后重试。",
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
        title: "模型 ID 不能包含 API Key",
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
          <p>查看并管理 WorkBuddy 的模型设置。</p>
        </div>
      </header>

      {loading && <Spinner label="正在读取 WorkBuddy 状态" />}
      {readFailed && (
        <InlineNotice tone="error">
          暂时无法读取 WorkBuddy 配置，请重试。
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
          服务地址
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
          <span>不使用 API Key</span>
        </div>
        <div className="fy-models-checkbox-row">
          <Checkbox
            checked={clearExistingApiKeys}
            onCheckedChange={setClearExistingApiKeys}
            label="清除已有模型的 API Key"
            disabled={busy !== null}
          />
          <span>更新时清除已保存的 API Key</span>
        </div>

        <div className="fy-models-actions">
          <Button disabled={busy !== null} onClick={() => void fetchModels()}>
            {busy === "fetch" ? "读取中…" : "拉取模型"}
          </Button>
        </div>

        {fetchedModels.length > 0 && (
          <div className="fy-models-form-wide">
            <h3>可用模型</h3>
            {truncated && (
              <p className="fy-models-muted">已达到可显示的模型数量上限。</p>
            )}
            <ul className="fy-models-model-list" aria-label="可用模型列表">
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
        <p>确认后将使用当前选择覆盖已有模型。</p>
      </Dialog>
    </CatalogDetail>
  );
}

const WARNING_COPY: Record<CodexProviderMutationWarning, string> = {
  CODEX_WEBSOCKET_NON_GPT_MODEL:
    "当前模型可能与此连接方式不兼容，请确认后使用。",
  CODEX_WEBSOCKET_PROXY_MAY_BE_UNSUPPORTED:
    "当前网络代理可能影响连接，请确认后使用。",
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
    app === "codex" ? "FyAgent Codex" : "FyAgent Claude",
  );
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKeyState] = useState("");
  const apiKeyRef = useRef("");
  const [modelId, setModelId] = useState("");
  const [imageExtension, setImageExtension] = useState(false);
  const [websockets, setWebsockets] = useState(false);
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
      const request = buildQuickSetupRequest(
        app,
        validated.value,
        app === "codex" ? { imageExtension, websockets } : undefined,
      );
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
        ? "重启或新建会话后即可使用新的设置。"
        : "请在应用中刷新或新建会话后查看更改。";
      if (!activeIdConfirmed) {
        setNotice({
          tone: "warning",
          title: "模型设置已保存，待确认",
          description:
            app === "codex"
              ? `${liveDescription} 请刷新状态后确认当前配置。`
              : "请刷新状态后确认当前配置。",
        });
      } else {
        setNotice({
          tone: warnings.length || hasPartialWarning ? "warning" : "info",
          title: "模型设置已保存并设为当前配置",
          description:
            app === "codex"
              ? hasPartialWarning
                ? `${liveDescription} 部分设置仍需确认。`
                : liveDescription
              : hasPartialWarning
                ? "保存完成，但部分设置仍需确认。"
                : "请在应用中刷新或新建会话后查看更改。",
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
            ? "无法确认当前设置"
            : "未能保存设置，已还原之前的状态",
          description: stateUnknown
            ? "为避免覆盖现有设置，已暂停继续保存。请重新打开页面并检查当前配置。"
            : "请检查输入后重试。",
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
          <p>配置服务地址、模型和 API Key，并设为当前配置。</p>
        </div>
      </header>

      {queryPending && <Spinner label={`正在读取 ${label} 配置`} />}
      {queryUnavailable && (
        <InlineNotice tone="error">
          暂时无法读取当前配置，请稍后重试。
        </InlineNotice>
      )}
      {!queryUnavailable && !queryPending && (
        <div className="fy-models-status-grid" data-testid="provider-status">
          <div className="fy-models-status-item">
            <span>保存的配置</span>
            <strong>{providerExists ? "已有设置，将更新" : "尚未设置"}</strong>
          </div>
          <div className="fy-models-status-item">
            <span>当前配置</span>
            <strong>{currentId ? "已设置" : "尚未设置"}</strong>
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
          <label htmlFor={`${app}-quick-setup-base-url`}>服务地址</label>
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
        {app === "codex" && (
          <div className="fy-models-codex-features" data-testid="codex-features">
            <div className="fy-models-checkbox-row">
              <Checkbox
                checked={imageExtension}
                onCheckedChange={setImageExtension}
                label="启用内置生图扩展"
              />
              <span>启用内置生图扩展</span>
            </div>
            <div className="fy-models-checkbox-row">
              <Checkbox
                checked={websockets}
                onCheckedChange={setWebsockets}
                label="启用 WebSocket 传输"
              />
              <span>启用 WebSocket 传输</span>
            </div>
          </div>
        )}
        <div className="fy-models-actions">
          <Button
            className="fy-control-button-primary"
            disabled={busy || writesBlocked || queryPending || queryUnavailable}
            onClick={() => void submit()}
          >
            {busy
              ? "配置中…"
              : writesBlocked
                ? "暂时无法确认当前设置"
                : "保存并设为当前配置"}
          </Button>
        </div>
      </div>

      <NoticeView notice={notice} />
      {warningCodes.length > 0 && (
        <InlineNotice tone="warning">
          <strong>Codex 使用提示</strong>
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
          description: "请稍后重试。",
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
      ariaLabel="QoderWork CN 模型设置"
    >
      <header className="fy-models-config-heading">
        <div>
          <h2>QoderWork CN</h2>
          <p>在 QoderWork 中选择模型，并在 FyAgent 中管理相关设置。</p>
        </div>
        <Badge tone="neutral">在 QoderWork 中完成模型设置</Badge>
      </header>

      <InlineNotice>
        可在应用目录中管理 Hooks 和检查 MCP 配置；模型设置请在 QoderWork
        中完成。
      </InlineNotice>

      {catalogQuery.isLoading && (
        <Spinner label="正在读取 QoderWork 官方入口" />
      )}
      {catalogQuery.isError && (
        <InlineNotice tone="error">
          暂时无法获取官方网站，请稍后重试。
        </InlineNotice>
      )}
      <div className="fy-models-actions">
        <Button
          className="fy-control-button-primary"
          onClick={() => navigate("/agents?target=qoderwork")}
        >
          管理 Hooks 和 MCP
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

function OpenCodeGuidancePanel() {
  const { ports } = useFeatures();
  const navigate = useNavigate();
  const catalogQuery = useAgentCatalog();
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const openLock = useRef(false);
  const mountedRef = useRef(true);
  const entry = catalogQuery.data?.agents.find(
    (agent) => agent.id === "opencode",
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
          description: "请稍后重试。",
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
      ariaLabel="OpenCode 模型设置"
    >
      <header className="fy-models-config-heading">
        <div>
          <h2>OpenCode</h2>
          <p>在 OpenCode 中选择模型，并在 FyAgent 中管理 MCP 与 Skills。</p>
        </div>
        <Badge tone="neutral">在 OpenCode 中完成模型设置</Badge>
      </header>

      <InlineNotice>
        模型配置请在 OpenCode 中完成；FyAgent 可管理 MCP 与 Skills 同步。
      </InlineNotice>

      {catalogQuery.isLoading && (
        <Spinner label="正在读取 OpenCode 官方入口" />
      )}
      {catalogQuery.isError && (
        <InlineNotice tone="error">
          暂时无法获取官方网站，请稍后重试。
        </InlineNotice>
      )}
      <div className="fy-models-actions">
        <Button
          className="fy-control-button-primary"
          onClick={() => navigate("/agents?target=opencode")}
        >
          管理 MCP 和 Skills
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
    title: "连接测试通过",
    description: "请返回 TRAE 保存设置后继续使用。",
  },
  auth_rejected: {
    tone: "warning",
    title: "无法验证 API Key",
    description: "请检查 API Key 后重试。",
  },
  model_rejected: {
    tone: "warning",
    title: "无法使用该模型 ID",
    description: "请检查模型 ID 后重试。",
  },
  network_rejected: {
    tone: "warning",
    title: "无法连接到服务",
    description: "请检查服务地址、网络和访问权限。",
  },
  timeout: {
    tone: "warning",
    title: "连接测试超时",
    description: "请稍后重试。",
  },
  cancelled: {
    tone: "warning",
    title: "连接测试已取消",
    description: "你可以调整设置后再次测试。",
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
        title: "请填写服务地址和模型 ID",
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
        title: "服务地址无效",
        description:
          "请输入有效的 HTTP(S) 服务地址，且不要包含账号信息或额外参数。",
      });
      return null;
    }
    if (!allowNoApiKey && apiKeyRef.current.trim().length === 0) {
      setNotice({
        tone: "error",
        title: "请填写 API Key 或选择不使用 API Key",
        description: "API Key 仅用于本次连接测试，结束后不会保留。",
      });
      return null;
    }
    if (!probeConsent) {
      setNotice({
        tone: "error",
        title: "请确认后开始连接测试",
        description: "确认后将测试一次连接。",
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
          title: "TRAE 连接测试失败",
          description: "请检查输入后重试。",
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
          title: "正在取消连接测试",
          description: "请稍候。",
        });
      }
    } catch {
      if (mountedRef.current) {
        setNotice({
          tone: "warning",
          title: "暂时无法确认取消结果",
          description: "请稍候后重试。",
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
          description: "请稍后重试。",
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
      ariaLabel="TRAE Work 模型连接测试"
    >
      <header className="fy-models-config-heading">
        <div>
          <h2>TRAE Work</h2>
          <p>测试服务地址和模型是否可用。设置需在 TRAE 中保存。</p>
        </div>
        <Badge tone="warning">连接测试</Badge>
      </header>

      <div className="fy-models-form">
        <label className="fy-control-field">
          API 格式
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
            <option value="base_url">服务地址</option>
            <option value="complete_url">完整 API 地址</option>
          </select>
        </label>
        <label className="fy-control-field fy-models-form-wide">
          {urlMode === "base_url" ? "服务地址" : "完整 API 地址"}
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
              label="允许不使用 API Key"
              disabled={pending}
            />
            允许不使用 API Key
          </label>
          <label className="fy-models-checkbox-row">
            <Checkbox
              checked={allowLoopback}
              onCheckedChange={setAllowLoopback}
              label="允许本机地址"
              disabled={pending}
            />
            我确认目标是本机地址（如适用）
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
              label="同意连接测试"
              disabled={pending}
            />
            我同意发起一次连接测试
          </label>
        </div>
        <div className="fy-models-actions">
          <Button
            className="fy-control-button-primary"
            disabled={pending}
            onClick={() => void runProbe()}
          >
            {pending ? "正在测试…" : "测试连接"}
          </Button>
          {pending && (
            <Button onClick={() => void cancelProbe()}>取消测试</Button>
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
      <InlineNotice>此测试不会保存设置。请返回 TRAE 完成配置。</InlineNotice>
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
    case "opencode":
      return <OpenCodeGuidancePanel />;
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
          <p>选择一个应用，配置模型并保存设置。</p>
        </div>
      </header>

      <CatalogMasterDetail>
        <CatalogRail as="aside" ariaLabel="模型配置目标" title="选择应用">
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
