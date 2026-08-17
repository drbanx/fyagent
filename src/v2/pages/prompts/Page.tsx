import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useBlocker, type BlockerFunction } from "react-router-dom";

import { errorMessage, isNativeOnlyError } from "../../shared/features/helpers";
import { useFeatures } from "../../shared/features/provider";
import {
  featureKeys,
  usePromptLiveFile,
  usePrompts,
} from "../../shared/features/queries";
import {
  PROMPT_APP_IDS,
  type ManagedPrompt,
  type PromptAppId,
} from "../../shared/features/types";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  EmptyState,
  InlineNotice,
  Input,
  Spinner,
  Switch,
} from "../../shared/ui/primitives";
import {
  SelectionLens,
  SelectionLensTrack,
} from "../../shared/ui/SelectionLens";

import "./page.css";

const APP_LABELS: Record<PromptAppId, string> = {
  claude: "Claude",
  codex: "Codex",
  gemini: "Gemini",
  grokbuild: "Grok Build",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  hermes: "Hermes",
};

const REFRESH_WARNING = "写入可能已完成，但状态刷新失败";

interface PromptDraft {
  name: string;
  description: string;
  content: string;
}

interface EditorState {
  mode: "new" | "edit";
  prompt: ManagedPrompt | null;
  draft: PromptDraft;
  baseline: PromptDraft | null;
}

type DiscardIntent =
  | { kind: "close-editor" }
  | { kind: "switch-app"; app: PromptAppId }
  | { kind: "route" }
  | null;

function toDraft(prompt: ManagedPrompt): PromptDraft {
  return {
    name: prompt.name,
    description: prompt.description ?? "",
    content: prompt.content,
  };
}

function isSameDraft(first: PromptDraft, second: PromptDraft): boolean {
  return (
    first.name === second.name &&
    first.description === second.description &&
    first.content === second.content
  );
}

function createNewEditor(): EditorState {
  return {
    mode: "new",
    prompt: null,
    draft: { name: "", description: "", content: "" },
    baseline: null,
  };
}

function createEditEditor(prompt: ManagedPrompt): EditorState {
  const draft = toDraft(prompt);
  return {
    mode: "edit",
    prompt,
    draft,
    baseline: { ...draft },
  };
}

function formatTimestamp(timestamp: number | undefined): string {
  if (timestamp === undefined) return "—";
  const milliseconds =
    timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function searchPrompts(
  prompts: readonly ManagedPrompt[],
  query: string,
): ManagedPrompt[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...prompts];
  return prompts.filter((prompt) =>
    [prompt.name, prompt.description, prompt.content, prompt.id]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLocaleLowerCase().includes(normalized)),
  );
}

export function PromptsPage() {
  const queryClient = useQueryClient();
  const { ports, notify } = useFeatures();
  const [app, setApp] = useState<PromptAppId>("claude");
  const promptsQuery = usePrompts(app);
  const liveFileQuery = usePromptLiveFile(app);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedPrompt | null>(null);
  const [discardIntent, setDiscardIntent] = useState<DiscardIntent>(null);
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [refreshWarning, setRefreshWarning] = useState(false);
  const writeLock = useRef(false);

  const prompts = useMemo(() => promptsQuery.data ?? [], [promptsQuery.data]);
  const filtered = useMemo(
    () => searchPrompts(prompts, search),
    [prompts, search],
  );
  const selected =
    filtered.find((prompt) => prompt.id === selectedId) ?? filtered[0] ?? null;

  const editorDirty =
    editor !== null &&
    (editor.baseline === null || !isSameDraft(editor.draft, editor.baseline));
  const shouldBlockNavigation = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      editorDirty && currentLocation.pathname !== nextLocation.pathname,
    [editorDirty],
  );
  const blocker = useBlocker(shouldBlockNavigation);
  const activeDiscardIntent: DiscardIntent =
    discardIntent ?? (blocker.state === "blocked" ? { kind: "route" } : null);

  const refresh = async (targetApp: PromptAppId): Promise<boolean> => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: featureKeys.prompts(targetApp),
        refetchType: "none",
      }),
      queryClient.invalidateQueries({
        queryKey: featureKeys.promptLiveFile(targetApp),
        refetchType: "none",
      }),
    ]);
    const results = await Promise.allSettled([
      queryClient.fetchQuery({
        queryKey: featureKeys.prompts(targetApp),
        queryFn: () => ports.prompts.getAll(targetApp),
      }),
      queryClient.fetchQuery({
        queryKey: featureKeys.promptLiveFile(targetApp),
        queryFn: () => ports.prompts.getCurrentFileContent(targetApp),
      }),
    ]);
    return results.every((result) => result.status === "fulfilled");
  };

  const write = async (
    title: string,
    operation: () => Promise<void>,
  ): Promise<"failed" | "refreshed" | "refresh-failed"> => {
    if (writeLock.current) return "failed";
    writeLock.current = true;
    setBusy(true);
    setWriteError(null);
    setRefreshWarning(false);
    const targetApp = app;
    try {
      await operation();
    } catch (error) {
      const message = errorMessage(error);
      setWriteError(`${title}失败：${message}`);
      notify({ tone: "error", title: `${title}失败`, description: message });
      setBusy(false);
      writeLock.current = false;
      return "failed";
    }

    const refreshed = await refresh(targetApp);
    setBusy(false);
    writeLock.current = false;
    if (!refreshed) {
      setRefreshWarning(true);
      notify({ tone: "error", title: REFRESH_WARNING });
      return "refresh-failed";
    }
    notify({ tone: "success", title });
    return "refreshed";
  };

  const requestAppChange = (nextApp: PromptAppId) => {
    if (nextApp === app || busy) return;
    if (editorDirty) {
      setDiscardIntent({ kind: "switch-app", app: nextApp });
      return;
    }
    setEditor(null);
    setDeleteTarget(null);
    setSelectedId(null);
    setSearch("");
    setWriteError(null);
    setRefreshWarning(false);
    setApp(nextApp);
  };

  const requestEditorClose = () => {
    if (busy) return;
    if (editorDirty) {
      setDiscardIntent({ kind: "close-editor" });
      return;
    }
    setEditor(null);
  };

  const cancelDiscard = () => {
    if (activeDiscardIntent?.kind === "route" && blocker.state === "blocked") {
      blocker.reset();
    }
    setDiscardIntent(null);
  };

  const confirmDiscard = () => {
    const intent = activeDiscardIntent;
    setDiscardIntent(null);
    setEditor(null);
    if (intent?.kind === "switch-app") {
      setDeleteTarget(null);
      setSelectedId(null);
      setSearch("");
      setWriteError(null);
      setRefreshWarning(false);
      setApp(intent.app);
    } else if (intent?.kind === "route" && blocker.state === "blocked") {
      blocker.proceed();
    }
  };

  const updateDraft =
    (field: keyof PromptDraft) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setEditor((current) =>
        current
          ? { ...current, draft: { ...current.draft, [field]: value } }
          : current,
      );
      setWriteError(null);
    };

  const saveEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editor || busy || !editor.draft.name.trim()) return;
    const now = Math.floor(Date.now() / 1000);
    const prompt: ManagedPrompt = {
      id: editor.prompt?.id ?? `prompt-${Date.now()}`,
      name: editor.draft.name.trim(),
      description: editor.draft.description.trim() || undefined,
      content: editor.draft.content.trim(),
      enabled: editor.prompt?.enabled ?? false,
      createdAt: editor.prompt?.createdAt ?? now,
      updatedAt: now,
    };
    const result = await write(
      editor.mode === "new" ? "提示词已创建" : "提示词已保存",
      () => ports.prompts.upsert(app, prompt),
    );
    if (result !== "failed") {
      setSelectedId(prompt.id);
      setEditor(null);
    }
  };

  const importFromFile = async () => {
    let importedId = "";
    const result = await write("提示词已从文件导入", async () => {
      importedId = await ports.prompts.importFromFile(app);
    });
    if (result !== "failed" && importedId) setSelectedId(importedId);
  };

  const togglePrompt = async (prompt: ManagedPrompt, enabled: boolean) => {
    await write(enabled ? "提示词已启用" : "提示词已停用", () =>
      enabled
        ? ports.prompts.enable(app, prompt.id)
        : ports.prompts.upsert(app, { ...prompt, enabled: false }),
    );
  };

  const requestDelete = (prompt: ManagedPrompt) => {
    if (prompt.enabled) {
      setWriteError("已启用提示词不能删除，请先停用后再删除");
      return;
    }
    setWriteError(null);
    setDeleteTarget(prompt);
  };

  const nativeUnavailable =
    promptsQuery.data === undefined && isNativeOnlyError(promptsQuery.error);
  const readFailed = promptsQuery.error && promptsQuery.data === undefined;
  const enabledCount = prompts.filter((prompt) => prompt.enabled).length;

  return (
    <div
      className="fy-feature-page fy-prompts-page"
      data-testid="prompts-page"
      data-data-source="native"
    >
      <header className="fy-feature-header">
        <div className="fy-feature-heading">
          <h1>提示词</h1>
          <p>按应用管理提示词，并查看当前使用的内容。</p>
        </div>
        <div className="fy-feature-actions">
          <Button
            disabled={busy || nativeUnavailable}
            onClick={() => void importFromFile()}
          >
            从文件导入
          </Button>
          <Button
            className="fy-control-button-primary"
            disabled={busy || nativeUnavailable}
            onClick={() => setEditor(createNewEditor())}
          >
            新建提示词
          </Button>
        </div>
      </header>

      <div className="fy-feature-toolbar">
        <label className="fy-control-field fy-prompts-app-field">
          当前应用
          <select
            className="fy-control-select"
            aria-label="当前应用"
            value={app}
            disabled={busy}
            onChange={(event) =>
              requestAppChange(event.target.value as PromptAppId)
            }
          >
            {PROMPT_APP_IDS.map((id) => (
              <option key={id} value={id}>
                {APP_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="fy-control-field">
          搜索
          <Input
            type="search"
            aria-label="搜索提示词"
            placeholder="搜索名称、描述、内容或 ID"
            value={search}
            disabled={nativeUnavailable}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      {writeError && <InlineNotice tone="error">{writeError}</InlineNotice>}
      {refreshWarning && (
        <InlineNotice tone="warning">
          {REFRESH_WARNING}
          。已保留上一次成功读取的数据，请重试刷新后再继续操作。
        </InlineNotice>
      )}
      {promptsQuery.error && promptsQuery.data !== undefined && (
        <InlineNotice tone="error">
          提示词刷新失败，正在显示上一次成功数据：
          {errorMessage(promptsQuery.error)}
        </InlineNotice>
      )}

      {nativeUnavailable ? (
        <EmptyState
          title="桌面能力不可用"
          description="提示词管理仅在 FyAgent 桌面应用中可用。"
        />
      ) : promptsQuery.isPending && promptsQuery.data === undefined ? (
        <EmptyState
          title={`正在加载 ${APP_LABELS[app]} 提示词`}
          description="正在读取该应用的提示词"
        >
          <Spinner />
        </EmptyState>
      ) : readFailed ? (
        <EmptyState
          title={`无法加载 ${APP_LABELS[app]} 提示词`}
          description={errorMessage(promptsQuery.error)}
          actions={
            <Button onClick={() => void promptsQuery.refetch()}>重试</Button>
          }
        />
      ) : prompts.length === 0 ? (
        <EmptyState
          title={`${APP_LABELS[app]} 还没有提示词`}
          description="可以新建提示词，或从当前文件导入。"
          actions={
            <>
              <Button disabled={busy} onClick={() => void importFromFile()}>
                从文件导入
              </Button>{" "}
              <Button
                className="fy-control-button-primary"
                disabled={busy}
                onClick={() => setEditor(createNewEditor())}
              >
                新建提示词
              </Button>
            </>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="没有匹配的提示词"
          description={`已加载 ${prompts.length} 条 ${APP_LABELS[app]} 提示词，可清空或调整搜索条件。`}
          actions={<Button onClick={() => setSearch("")}>清空搜索</Button>}
        />
      ) : (
        <div className="fy-feature-master">
          <section
            className="fy-feature-panel fy-prompts-library"
            aria-label="提示词列表"
          >
            <h2>
              提示词库 · {prompts.length}
              <span className="fy-prompts-heading-meta">
                {enabledCount} 条已启用
              </span>
            </h2>
            <SelectionLensTrack id="prompts-list" className="fy-feature-list">
              {filtered.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  className="fy-feature-list-item"
                  aria-current={prompt.id === selected?.id}
                  onClick={() => setSelectedId(prompt.id)}
                >
                  <SelectionLens active={prompt.id === selected?.id} />
                  <strong>{prompt.name}</strong>
                  <span>
                    {prompt.description || "暂无描述"} ·{" "}
                    {prompt.enabled ? "已启用" : "未启用"}
                  </span>
                </button>
              ))}
            </SelectionLensTrack>
          </section>

          {selected && (
            <section
              className="fy-feature-panel fy-feature-detail"
              aria-label="提示词详情"
            >
              <div className="fy-feature-detail-title">
                <h2>{selected.name}</h2>
                <Badge tone={selected.enabled ? "accent" : "neutral"}>
                  {selected.enabled ? "已启用" : "未启用"}
                </Badge>
              </div>
              <p className="fy-feature-description">
                {selected.description || "暂无描述"}
              </p>
              <dl className="fy-feature-definition">
                <dt>应用</dt>
                <dd>{APP_LABELS[app]}</dd>
                <dt>ID</dt>
                <dd>
                  <code className="fy-feature-code">{selected.id}</code>
                </dd>
                <dt>创建时间</dt>
                <dd>{formatTimestamp(selected.createdAt)}</dd>
                <dt>更新时间</dt>
                <dd>{formatTimestamp(selected.updatedAt)}</dd>
              </dl>
              <label className="fy-control-field">
                内容
                <textarea
                  className="fy-control-textarea fy-prompts-content"
                  aria-label="提示词内容"
                  value={selected.content}
                  readOnly
                  spellCheck={false}
                />
              </label>
              <div className="fy-feature-assignment">
                <span>
                  {selected.enabled ? "当前正在使用此提示词" : "启用此提示词"}
                </span>
                <Switch
                  checked={selected.enabled}
                  disabled={busy}
                  label={`${selected.enabled ? "停用" : "启用"}${selected.name}`}
                  onCheckedChange={(enabled) =>
                    void togglePrompt(selected, enabled)
                  }
                />
              </div>
              {selected.enabled && (
                <InlineNotice tone="warning">
                  启用项不能直接删除，请先停用。
                </InlineNotice>
              )}
              <div className="fy-feature-actions">
                <Button
                  disabled={busy}
                  onClick={() => setEditor(createEditEditor(selected))}
                >
                  编辑
                </Button>
                <Button
                  className="fy-control-button-danger"
                  disabled={busy}
                  onClick={() => requestDelete(selected)}
                >
                  删除
                </Button>
              </div>
            </section>
          )}

          <section
            className="fy-feature-panel fy-feature-detail"
            aria-label="当前使用的内容"
          >
            <div className="fy-feature-detail-title">
              <h2>当前使用的内容</h2>
              <Badge>{APP_LABELS[app]}</Badge>
            </div>
            {liveFileQuery.isPending && liveFileQuery.data === undefined ? (
              <Spinner label="正在读取当前使用的内容" />
            ) : liveFileQuery.error && liveFileQuery.data === undefined ? (
              <InlineNotice tone="error">
                暂时无法读取当前使用的内容：{errorMessage(liveFileQuery.error)}
              </InlineNotice>
            ) : liveFileQuery.data === null ? (
              <p className="fy-feature-description">当前没有使用中的内容。</p>
            ) : (
              <textarea
                className="fy-control-textarea fy-prompts-live-content"
                aria-label="当前使用的内容"
                value={liveFileQuery.data ?? ""}
                readOnly
                spellCheck={false}
              />
            )}
            {liveFileQuery.error && liveFileQuery.data !== undefined && (
              <InlineNotice tone="error">
                当前内容刷新失败，正在显示已加载内容：
                {errorMessage(liveFileQuery.error)}
              </InlineNotice>
            )}
          </section>
        </div>
      )}

      {editor && activeDiscardIntent === null && (
        <Dialog
          open
          large
          title={
            editor.mode === "new"
              ? `新建 ${APP_LABELS[app]} 提示词`
              : `编辑 ${editor.prompt?.name ?? "提示词"}`
          }
          description="保存后将刷新提示词和当前使用的内容。保存不会自动启用提示词。"
          onOpenChange={(open) => !open && requestEditorClose()}
          actions={
            <>
              <Button disabled={busy} onClick={requestEditorClose}>
                取消
              </Button>
              <Button
                className="fy-control-button-primary"
                disabled={busy || !editor.draft.name.trim()}
                type="submit"
                form="fy-prompts-editor-form"
              >
                {busy ? "保存中…" : "保存"}
              </Button>
            </>
          }
        >
          <form
            id="fy-prompts-editor-form"
            className="fy-prompts-editor-form"
            onSubmit={saveEditor}
          >
            <label className="fy-control-field">
              名称
              <Input
                autoFocus
                aria-label="名称"
                value={editor.draft.name}
                disabled={busy}
                onChange={updateDraft("name")}
              />
            </label>
            <label className="fy-control-field">
              描述
              <Input
                aria-label="描述"
                value={editor.draft.description}
                disabled={busy}
                onChange={updateDraft("description")}
              />
            </label>
            <label className="fy-control-field fy-prompts-editor-content-field">
              内容
              <textarea
                className="fy-control-textarea fy-prompts-editor-content"
                aria-label="内容"
                value={editor.draft.content}
                disabled={busy}
                spellCheck={false}
                onChange={updateDraft("content")}
              />
            </label>
          </form>
        </Dialog>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除 ${deleteTarget?.name ?? "提示词"}`}
        description="删除后无法从提示词库恢复；只有未启用的提示词可以删除。"
        pending={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          const target = deleteTarget;
          if (!target) return;
          const result = await write("提示词已删除", () =>
            ports.prompts.delete(app, target.id),
          );
          if (result !== "failed") setDeleteTarget(null);
        }}
      />

      <ConfirmDialog
        open={activeDiscardIntent !== null}
        title="放弃未保存的提示词更改"
        description="当前编辑内容尚未保存。确认放弃后再继续切换或离开页面。"
        pending={busy}
        onCancel={cancelDiscard}
        onConfirm={confirmDiscard}
      />
    </div>
  );
}
