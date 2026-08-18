import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { QuestionIcon } from "@phosphor-icons/react/dist/csr/Question";
import { useEffect, useMemo, useRef, useState } from "react";

import { classNames } from "../../shared/design-system/classNames";
import { useFeatures } from "../../shared/features/provider";
import {
  useAgentCatalog,
  useTraeWorkModelIds,
} from "../../shared/features/queries";
import type { TraeWorkSaveModelsRequest } from "../../shared/features/types";
import { CatalogDetail } from "../../shared/ui/catalog";
import { ExternalLinkButton } from "../../shared/ui/ExternalLinkButton";
import {
  Button,
  Checkbox,
  Dialog,
  InlineNotice,
  Input,
  SecretInput,
  Spinner,
  Tooltip,
} from "../../shared/ui/primitives";
import {
  FieldFeedback,
  focusControl,
  isErrorNotice,
  ModelsSection,
  useFieldNotices,
  type Notice,
} from "./feedback";
import { GroupedModelChips, ModelSearchField } from "./modelChips";
import { ModelsPanelHeader } from "./modelsShared";
import { isHttpUrl, parseManualModelIds } from "./quickSetup";
import {
  addUniqueModelIds,
  filterModelIds,
  nativeErrorCode,
} from "./workBuddyModels";

const EMPTY_MODEL_IDS: readonly string[] = [];

type NoticeField =
  | "baseUrl"
  | "apiKey"
  | "fetch"
  | "draft"
  | "save"
  | "existing";

export function TraeModelsPanel({ active }: { active: boolean }) {
  const { ports } = useFeatures();
  const catalogQuery = useAgentCatalog(active);
  const modelIdsQuery = useTraeWorkModelIds(active);
  const [apiFormat, setApiFormat] =
    useState<TraeWorkSaveModelsRequest["apiFormat"]>("openai_chat_completions");
  const [urlMode, setUrlMode] =
    useState<TraeWorkSaveModelsRequest["urlMode"]>("base_url");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKeyState] = useState("");
  const apiKeyRef = useRef("");
  const [allowNoApiKey, setAllowNoApiKey] = useState(false);
  const [allowLoopback, setAllowLoopback] = useState(false);
  const [allowPrivateNetwork, setAllowPrivateNetwork] = useState(false);
  const [manualDraft, setManualDraft] = useState("");
  const [draftModelIds, setDraftModelIds] = useState<string[]>([]);
  const [ownedByById, setOwnedByById] = useState<Record<string, string>>({});
  const [existingSearch, setExistingSearch] = useState("");
  const [draftSearch, setDraftSearch] = useState("");
  const [existingOpen, setExistingOpen] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState<"fetch" | "save" | "delete" | null>(null);
  const { notices, show, clear, dismiss } = useFieldNotices<NoticeField>();
  const [pendingOverwrite, setPendingOverwrite] = useState<{
    request: TraeWorkSaveModelsRequest;
    token: string;
    existingIds: string[];
  } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const writeLock = useRef(false);
  const mountedRef = useRef(true);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const apiKeyInputRef = useRef<HTMLInputElement>(null);
  const manualModelsInputRef = useRef<HTMLInputElement>(null);
  const entry = catalogQuery.data?.agents.find(
    (agent) => agent.id === "trae-work",
  );
  const productLink = entry?.officialLinks.find((link) => link.id === "product");
  const productCapability = entry?.capabilities.find(
    (capability) => capability.id === "product.open",
  );

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
      const result = await modelIdsQuery.refetch();
      return !result.isError && result.data !== undefined;
    } catch {
      return false;
    }
  };

  const validateConnection = (): boolean => {
    if (!isHttpUrl(url.trim())) {
      show("baseUrl", {
        tone: "error",
        title: "请输入有效的服务地址",
        description: "只接受不含账号信息的 HTTP(S) 地址。",
      });
      focusControl(urlInputRef.current);
      return false;
    }
    if (!allowNoApiKey && !apiKeyRef.current.trim()) {
      show("apiKey", { tone: "error", title: "请输入 API Key" });
      focusControl(apiKeyInputRef.current);
      return false;
    }
    return true;
  };

  const connectionFields = () => ({
    apiFormat,
    urlMode,
    url: url.trim(),
    apiKey: apiKeyRef.current.trim(),
    allowNoApiKey,
    allowLoopback,
    allowPrivateNetwork,
  });

  const fetchModels = async () => {
    if (writeLock.current || !validateConnection()) return;
    writeLock.current = true;
    setBusy("fetch");
    clear();
    try {
      const result = await ports.traeWork.fetchModels(connectionFields());
      if (!mountedRef.current) return;
      const ids = result.models.map((model) => model.id);
      const nextOwned: Record<string, string> = {};
      for (const model of result.models) {
        if (model.ownedBy) nextOwned[model.id] = model.ownedBy;
      }
      setOwnedByById((current) => ({ ...current, ...nextOwned }));
      setDraftModelIds((current) => addUniqueModelIds(current, ids));
      setTruncated(result.truncated);
      show("fetch", {
        tone: result.truncated ? "warning" : "info",
        title: result.truncated
          ? "已达到可显示的模型数量上限"
          : `已读取 ${ids.length} 个模型`,
        description: "请确认选择后再保存。",
      });
    } catch {
      if (mountedRef.current)
        show("fetch", {
          tone: "error",
          title: "模型读取失败",
          description: "请检查地址、凭据和服务状态后重试。",
        });
    } finally {
      if (mountedRef.current) setBusy(null);
      writeLock.current = false;
    }
  };

  const collectDraftIds = (): string[] =>
    addUniqueModelIds(draftModelIds, parseManualModelIds(manualDraft));

  const fillManualModels = () => {
    const pending = parseManualModelIds(manualDraft);
    if (pending.length === 0) {
      show("draft", { tone: "error", title: "请输入模型 ID" });
      focusControl(manualModelsInputRef.current);
      return;
    }
    const submittedApiKey = apiKeyRef.current.trim();
    if (
      submittedApiKey &&
      pending.some((modelId) => modelId.includes(submittedApiKey))
    ) {
      show("draft", {
        tone: "error",
        title: "模型 ID 不能包含 API Key",
        description: "请检查模型 ID 后重试。",
      });
      focusControl(manualModelsInputRef.current);
      return;
    }
    setDraftModelIds((current) => addUniqueModelIds(current, pending));
    setManualDraft("");
    dismiss("draft");
  };

  const buildSaveRequest = (
    draftIds: string[],
    removedModelIds: string[] = [],
  ): TraeWorkSaveModelsRequest => {
    const request = {
      ...connectionFields(),
      selectedModelIds: draftIds,
      removedModelIds,
      expectedRevision: modelIdsQuery.data?.revision ?? null,
    } satisfies TraeWorkSaveModelsRequest;
    Object.freeze(request.selectedModelIds);
    Object.freeze(request.removedModelIds);
    return Object.freeze(request);
  };

  const saveRequest = async (request: TraeWorkSaveModelsRequest) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy("save");
    clear();
    let shouldRefresh = true;
    let rereadNotice: { confirmed: Notice; unconfirmed: Notice } | null = null;
    try {
      const result = await ports.traeWork.saveModels(request);
      if (!mountedRef.current) return;
      switch (result.state) {
        case "saved":
          setPendingOverwrite(null);
          setDraftModelIds([]);
          setManualDraft("");
          show("save", {
            tone: "info",
            title: "TRAE 模型配置已保存",
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
        const code = nativeErrorCode(error);
        if (
          request.overwriteToken &&
          (code === "TRAE_OVERWRITE_TOKEN_EXPIRED" ||
            code === "TRAE_OVERWRITE_TOKEN_INVALID")
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
        } else if (code === "TRAE_SAVE_PROBE_REJECTED") {
          show("save", {
            tone: "error",
            title: "保存前连接检查未通过",
            description: "请检查地址、凭据和模型 ID 后重试。",
          });
        } else {
          show("save", {
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
        show(
          "save",
          rereadConfirmed ? rereadNotice.confirmed : rereadNotice.unconfirmed,
        );
      }
      if (mountedRef.current) setBusy(null);
      writeLock.current = false;
    }
  };

  const startSave = () => {
    if (writeLock.current) return;
    const draftIds = collectDraftIds();
    if (draftIds.length === 0) {
      show("draft", { tone: "error", title: "请至少添加一个模型 ID" });
      focusControl(manualModelsInputRef.current);
      return;
    }
    if (!validateConnection()) return;
    if (parseManualModelIds(manualDraft).length > 0) {
      setDraftModelIds(draftIds);
      setManualDraft("");
    }
    void saveRequest(buildSaveRequest(draftIds));
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

  const deleteExistingModel = async (modelId: string) => {
    if (writeLock.current) return;
    writeLock.current = true;
    setBusy("delete");
    dismiss("existing");
    const request = buildSaveRequest([], [modelId]);
    let notice: Notice | null = null;
    try {
      let result = await ports.traeWork.saveModels(request);
      if (result.state === "overwrite_confirmation_required" && result.token) {
        result = await ports.traeWork.saveModels({
          ...request,
          overwriteToken: result.token,
        });
      }
      if (!mountedRef.current) return;
      switch (result.state) {
        case "saved":
          setPendingDeleteId(null);
          notice = { tone: "info", title: "已删除该模型配置" };
          break;
        case "concurrent_modification":
          notice = {
            tone: "warning",
            title: "配置已被其他操作修改",
            description: "已刷新当前设置，请检查后再删除。",
          };
          break;
        case "overwrite_confirmation_required":
          notice = {
            tone: "error",
            title: "删除确认已失效",
            description: "请刷新当前设置后重新删除。",
          };
          break;
      }
    } catch {
      if (mountedRef.current) {
        notice = {
          tone: "error",
          title: "删除失败",
          description: "请刷新当前设置后重试。",
        };
      }
    } finally {
      await refreshAuthoritativeState();
      if (mountedRef.current && notice) show("existing", notice);
      if (mountedRef.current) setBusy(null);
      writeLock.current = false;
    }
  };

  const modelIds = modelIdsQuery.data?.modelIds ?? EMPTY_MODEL_IDS;
  const filteredExistingIds = useMemo(
    () => filterModelIds(modelIds, existingSearch),
    [modelIds, existingSearch],
  );
  const filteredDraftIds = useMemo(
    () => filterModelIds(draftModelIds, draftSearch),
    [draftModelIds, draftSearch],
  );
  const loading = modelIdsQuery.isLoading;
  const readFailed = modelIdsQuery.isError;

  return (
    <CatalogDetail
      className="fy-models-config-panel"
      ariaLabel="TRAE Work CN 模型设置"
    >
      <ModelsPanelHeader
        title="TRAE Work CN"
        summary="查看并管理 TRAE Work CN 的模型设置。添加或修改后请保存并应用。"
        pending={
          draftModelIds.length > 0 ||
          Boolean(manualDraft.trim()) ||
          Boolean(url.trim()) ||
          Boolean(apiKey.trim())
        }
      >
        <Button
          className="fy-control-button-primary fy-models-commit-button"
          disabled={busy !== null || loading || readFailed}
          onClick={startSave}
        >
          {busy === "save" ? "保存中…" : "保存并应用"}
        </Button>
      </ModelsPanelHeader>
      <FieldFeedback id="trae-save-error" notice={notices.save} />

      {loading && <Spinner label="正在读取 TRAE 模型设置" />}
      {readFailed && (
        <InlineNotice tone="error">
          暂时无法读取 TRAE 配置，请重试。
        </InlineNotice>
      )}

      <section
        className="fy-models-existing"
        data-testid="trae-model-ids"
        data-invalid={isErrorNotice(notices.existing) || undefined}
        aria-label="当前已有的第三方模型 ID"
      >
        <button
          type="button"
          className="fy-models-existing-toggle"
          aria-expanded={existingOpen}
          onClick={() => setExistingOpen((open) => !open)}
        >
          <h3>当前已有的第三方模型 ID</h3>
          <span className="fy-models-existing-meta">
            <span>已有第三方模型数量</span>
            <strong className="fy-models-existing-count">
              {modelIds.length}
            </strong>
            <CaretDownIcon
              className={classNames(
                "fy-models-caret",
                existingOpen && "fy-models-caret-open",
              )}
              size={18}
              aria-hidden
            />
          </span>
        </button>
        {existingOpen ? (
          <>
            {modelIds.length > 0 ? (
              <ModelSearchField
                id="trae-existing-search"
                label="搜索已有模型"
                value={existingSearch}
                onChange={setExistingSearch}
              />
            ) : null}
            <GroupedModelChips
              ids={filteredExistingIds}
              removable
              removeDisabled={busy !== null || loading || readFailed}
              onRemove={(modelId) => {
                if (busy !== null || writeLock.current) return;
                setPendingDeleteId(modelId);
              }}
              emptyLabel={
                existingSearch.trim() ? "没有匹配的模型 ID" : "未观察到模型 ID"
              }
            />
            <FieldFeedback id="trae-existing-error" notice={notices.existing} />
          </>
        ) : null}
      </section>

      <ModelsSection
        title="连接设置"
        titleId="trae-connection-title"
        invalid={
          isErrorNotice(notices.baseUrl) || isErrorNotice(notices.apiKey)
        }
      >
        <div className="fy-models-form">
          <label className="fy-control-field">
            API 格式
            <select
              className="fy-control-input"
              value={apiFormat}
              onChange={(event) =>
                setApiFormat(
                  event.target.value as TraeWorkSaveModelsRequest["apiFormat"],
                )
              }
              disabled={busy !== null}
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
                setUrlMode(
                  event.target.value as TraeWorkSaveModelsRequest["urlMode"],
                )
              }
              disabled={busy !== null}
            >
              <option value="base_url">服务地址</option>
              <option value="complete_url">完整 API 地址</option>
            </select>
          </label>
          <label className="fy-control-field fy-models-form-wide" htmlFor="trae-url">
            {urlMode === "base_url" ? "服务地址" : "完整 API 地址"}
            <Input
              ref={urlInputRef}
              id="trae-url"
              type="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                dismiss("baseUrl");
              }}
              placeholder="https://gateway.example/v1"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={isErrorNotice(notices.baseUrl)}
              aria-describedby={
                notices.baseUrl ? "trae-url-error" : undefined
              }
            />
            <FieldFeedback id="trae-url-error" notice={notices.baseUrl} />
          </label>
          <div className="fy-control-field">
            <label htmlFor="trae-api-key">API Key</label>
            <SecretInput
              ref={apiKeyInputRef}
              id="trae-api-key"
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                dismiss("apiKey");
              }}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={isErrorNotice(notices.apiKey)}
              aria-describedby={
                notices.apiKey ? "trae-api-key-error" : undefined
              }
              revealLabel="显示 API Key"
              hideLabel="隐藏 API Key"
            />
            <FieldFeedback id="trae-api-key-error" notice={notices.apiKey} />
          </div>
          <div className="fy-models-form-wide fy-models-consent-list">
            <div className="fy-models-checkbox-row fy-models-checkbox-row-inline">
              <Checkbox
                checked={allowNoApiKey}
                onCheckedChange={(checked) => {
                  setAllowNoApiKey(checked);
                  if (checked) dismiss("apiKey");
                }}
                label="允许无 API Key"
                disabled={busy !== null}
              />
              <span>不使用 API Key</span>
              <Tooltip
                label={
                  <span className="fy-models-help-copy">
                    给不需要鉴权的本地模型使用。勾选后请求不会携带 API Key。
                  </span>
                }
              >
                <button
                  type="button"
                  className="fy-models-help"
                  aria-label="不使用 API Key 说明"
                >
                  <QuestionIcon size={16} weight="regular" aria-hidden />
                </button>
              </Tooltip>
            </div>
            <label className="fy-models-checkbox-row">
              <Checkbox
                checked={allowLoopback}
                onCheckedChange={setAllowLoopback}
                label="允许本机地址"
                disabled={busy !== null}
              />
              我确认目标是本机地址（如适用）
            </label>
            <label className="fy-models-checkbox-row">
              <Checkbox
                checked={allowPrivateNetwork}
                onCheckedChange={setAllowPrivateNetwork}
                label="允许私有网络地址"
                disabled={busy !== null}
              />
              我确认目标是受信任的私有网络地址（如适用）
            </label>
          </div>
        </div>
      </ModelsSection>

      <section
        className="fy-models-draft"
        data-testid="trae-draft-models"
        data-invalid={isErrorNotice(notices.draft) || undefined}
        aria-label="待保存的模型 ID"
      >
        <h3>待保存的模型 ID</h3>
        {truncated ? (
          <p className="fy-models-muted">已达到可显示的模型数量上限。</p>
        ) : null}
        {draftModelIds.length > 0 ? (
          <ModelSearchField
            id="trae-draft-search"
            label="搜索待保存模型"
            value={draftSearch}
            onChange={setDraftSearch}
          />
        ) : null}
        <GroupedModelChips
          ids={filteredDraftIds}
          removable
          removeDisabled={busy !== null}
          ownedByById={ownedByById}
          onRemove={(modelId) =>
            setDraftModelIds((current) =>
              current.filter((id) => id !== modelId),
            )
          }
          emptyLabel={
            draftSearch.trim()
              ? "没有匹配的模型 ID"
              : "尚未添加模型。可拉取远程模型，或手动填入模型 ID。"
          }
        />
        <div className="fy-models-action-block">
          <div className="fy-models-actions">
            <Button disabled={busy !== null} onClick={() => void fetchModels()}>
              {busy === "fetch" ? "读取中…" : "拉取模型"}
            </Button>
            <Button
              className="fy-control-button-danger"
              disabled={busy !== null || draftModelIds.length === 0}
              onClick={() => {
                setDraftModelIds([]);
                setTruncated(false);
              }}
            >
              清除所有模型
            </Button>
            <ExternalLinkButton
              url={productLink?.url}
              disabled={
                !productLink ||
                (productCapability?.mode !== "direct" &&
                  productCapability?.mode !== "assisted") ||
                busy !== null
              }
              errorTitle="无法打开 TRAE 官方设置"
            >
              打开 TRAE 官方模型设置
            </ExternalLinkButton>
          </div>
          <FieldFeedback id="trae-fetch-error" notice={notices.fetch} />
        </div>
        <div className="fy-models-manual-row">
          <label className="fy-control-field fy-models-manual-field">
            自定义模型 ID
            <Input
              ref={manualModelsInputRef}
              id="trae-manual-model-ids"
              value={manualDraft}
              onChange={(event) => {
                setManualDraft(event.target.value);
                dismiss("draft");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  fillManualModels();
                }
              }}
              placeholder="输入模型 ID，多个用逗号分隔"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={isErrorNotice(notices.draft)}
              aria-describedby={
                notices.draft ? "trae-draft-error" : undefined
              }
            />
          </label>
          <Button disabled={busy !== null} onClick={fillManualModels}>
            填入
          </Button>
        </div>
        <FieldFeedback id="trae-draft-error" notice={notices.draft} />
      </section>

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
      <Dialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open && busy !== "delete") setPendingDeleteId(null);
        }}
        title="确认删除模型"
        description="此操作将会删除该模型配置，不可恢复，是否确认删除"
        actions={
          <>
            <Button
              disabled={busy === "delete"}
              onClick={() => setPendingDeleteId(null)}
            >
              取消
            </Button>
            <Button
              className="fy-control-button-danger"
              disabled={busy === "delete" || pendingDeleteId === null}
              onClick={() => {
                if (pendingDeleteId) void deleteExistingModel(pendingDeleteId);
              }}
            >
              {busy === "delete" ? "删除中…" : "确认删除"}
            </Button>
          </>
        }
      >
        {pendingDeleteId ? (
          <p>
            将删除 <code>{pendingDeleteId}</code>。
          </p>
        ) : null}
      </Dialog>
    </CatalogDetail>
  );
}
