import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BlockerFunction } from "react-router-dom";

import { errorMessage, isNativeOnlyError } from "../../shared/features/helpers";
import { useFeatures } from "../../shared/features/provider";
import {
  featureKeys,
  useDailyMemoryFile,
  useDailyMemoryFiles,
  useDailyMemorySearch,
  useHermesMemoryLimits,
  useMemoryDocument,
} from "../../shared/features/queries";
import type {
  DailyMemoryFileInfo,
  DailyMemorySearchResult,
  HermesMemoryKind,
  MemoryDocumentId,
  OpenClawDirectory,
} from "../../shared/features/types";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  InlineNotice,
  Input,
  Spinner,
  Switch,
} from "../../shared/ui/primitives";
import { usePrimaryBlocker } from "../../shared/ui/PrimaryBlocker";
import {
  SelectionLens,
  SelectionLensTrack,
} from "../../shared/ui/SelectionLens";

import "./page.css";

type MemoryTab = "long-term" | "daily";
type Notice = { tone: "info" | "error" | "warning"; message: string };
type TransitionRequest = (transition: () => void) => void;
type DiscardIntent =
  | { kind: "local"; transition: () => void }
  | { kind: "route" }
  | null;

interface MemoryDocumentDefinition {
  id: MemoryDocumentId;
  title: string;
  description: string;
  path: string;
  source: "OpenClaw" | "Hermes";
  hermesKind?: HermesMemoryKind;
}

const MEMORY_DOCUMENTS: readonly MemoryDocumentDefinition[] = [
  {
    id: "openclaw-memory",
    title: "OpenClaw · MEMORY.md",
    description: "OpenClaw 工作区的长期共享记忆",
    path: "workspace/MEMORY.md",
    source: "OpenClaw",
  },
  {
    id: "openclaw-user",
    title: "OpenClaw · USER.md",
    description: "OpenClaw 工作区的用户信息",
    path: "workspace/USER.md",
    source: "OpenClaw",
  },
  {
    id: "hermes-memory",
    title: "Hermes · MEMORY.md",
    description: "Hermes 的长期记忆",
    path: "memories/MEMORY.md",
    source: "Hermes",
    hermesKind: "memory",
  },
  {
    id: "hermes-user",
    title: "Hermes · USER.md",
    description: "Hermes 的用户信息",
    path: "memories/USER.md",
    source: "Hermes",
    hermesKind: "user",
  },
] as const;

function todayFilename(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}.md`;
}

function normalizeMemoryTimestamp(value: number): number {
  return value > 0 && value < 1_000_000_000_000 ? value * 1000 : value;
}

function formatModifiedAt(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "未知";
  return new Date(normalizeMemoryTimestamp(value)).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileMeta(file: DailyMemoryFileInfo | DailyMemorySearchResult): string {
  return `${file.sizeBytes} 字节 · ${formatModifiedAt(file.modifiedAt)}`;
}

function NativeOrErrorState({
  error,
  feature,
  onRetry,
}: {
  error: unknown;
  feature: "长期记忆" | "每日记忆";
  onRetry: () => void;
}) {
  const nativeOnly = isNativeOnlyError(error);
  return (
    <EmptyState
      title={nativeOnly ? "需要 FyAgent 桌面应用" : `无法加载${feature}`}
      description={
        nativeOnly
          ? `${feature}仅在 FyAgent 桌面应用中可用。`
          : errorMessage(error)
      }
      actions={nativeOnly ? undefined : <Button onClick={onRetry}>重试</Button>}
    />
  );
}

export function MemoryPage() {
  const [activeTab, setActiveTab] = useState<MemoryTab>("long-term");
  const [dirty, setDirty] = useState(false);
  const [discardIntent, setDiscardIntent] = useState<DiscardIntent>(null);
  const shouldBlockNavigation = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
    [dirty],
  );
  const blocker = usePrimaryBlocker(shouldBlockNavigation);
  const activeDiscardIntent: DiscardIntent =
    discardIntent ?? (blocker.state === "blocked" ? { kind: "route" } : null);

  const requestTransition: TransitionRequest = (transition) => {
    if (!dirty) {
      transition();
      return;
    }
    setDiscardIntent({ kind: "local", transition });
  };

  const confirmDiscard = () => {
    const intent = activeDiscardIntent;
    setDiscardIntent(null);
    setDirty(false);
    if (intent?.kind === "local") {
      intent.transition();
    } else if (intent?.kind === "route" && blocker.state === "blocked") {
      blocker.proceed();
    }
  };

  const cancelDiscard = () => {
    if (activeDiscardIntent?.kind === "route" && blocker.state === "blocked") {
      blocker.reset();
    }
    setDiscardIntent(null);
  };

  const switchTab = (tab: MemoryTab) => {
    if (tab === activeTab) return;
    requestTransition(() => {
      setDirty(false);
      setActiveTab(tab);
    });
  };

  return (
    <div className="fy-feature-page fy-memory-page" data-testid="memory-page">
      <header className="fy-feature-header">
        <div className="fy-feature-heading">
          <h1>记忆</h1>
          <p>管理 OpenClaw 与 Hermes 的长期记忆和每日记录。</p>
        </div>
      </header>
      <SelectionLensTrack
        id="memory-type-tabs"
        className="fy-feature-tabs"
        role="tablist"
        aria-label="记忆类型"
      >
        <button
          type="button"
          className="fy-feature-tab"
          role="tab"
          aria-selected={activeTab === "long-term"}
          onClick={() => switchTab("long-term")}
        >
          <SelectionLens active={activeTab === "long-term"} />
          <span>长期记忆</span>
        </button>
        <button
          type="button"
          className="fy-feature-tab"
          role="tab"
          aria-selected={activeTab === "daily"}
          onClick={() => switchTab("daily")}
        >
          <SelectionLens active={activeTab === "daily"} />
          <span>每日记忆</span>
        </button>
      </SelectionLensTrack>
      {activeTab === "long-term" ? (
        <LongTermView
          onDirtyChange={setDirty}
          requestTransition={requestTransition}
        />
      ) : (
        <DailyView
          onDirtyChange={setDirty}
          requestTransition={requestTransition}
        />
      )}
      <ConfirmDialog
        open={activeDiscardIntent !== null}
        title="放弃未保存的更改？"
        description="当前编辑内容尚未保存，继续后这些更改将丢失。"
        onCancel={cancelDiscard}
        onConfirm={confirmDiscard}
      />
    </div>
  );
}

function LongTermView({
  onDirtyChange,
  requestTransition,
}: {
  onDirtyChange: (dirty: boolean) => void;
  requestTransition: TransitionRequest;
}) {
  const queryClient = useQueryClient();
  const { ports } = useFeatures();
  const [selectedId, setSelectedId] =
    useState<MemoryDocumentId>("openclaw-memory");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyOperation, setBusyOperation] = useState<string | null>(null);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const writeLock = useRef(false);
  const documentQuery = useMemoryDocument(selectedId);
  const limitsQuery = useHermesMemoryLimits();
  const selected =
    MEMORY_DOCUMENTS.find((document) => document.id === selectedId) ??
    MEMORY_DOCUMENTS[0];

  async function performWrite<T>(
    label: string,
    successMessage: string,
    operation: () => Promise<void>,
    refresh: () => Promise<T>,
  ): Promise<T | undefined> {
    if (writeLock.current) return undefined;
    writeLock.current = true;
    setBusyOperation(label);
    setNotice(null);
    try {
      await operation();
      try {
        const refreshed = await refresh();
        setNotice({ tone: "info", message: successMessage });
        return refreshed;
      } catch (refreshError) {
        setNotice({
          tone: "warning",
          message: `写入可能已完成，但状态刷新失败：${errorMessage(refreshError)}`,
        });
      }
    } catch (operationError) {
      setNotice({
        tone: "error",
        message: `${label}失败：${errorMessage(operationError)}`,
      });
    } finally {
      setBusyOperation(null);
      writeLock.current = false;
    }
    return undefined;
  }

  const save = (content: string) =>
    performWrite(
      "保存长期记忆",
      `${selected.title} 已保存`,
      () => ports.memory.writeDocument(selectedId, content),
      async () => {
        await queryClient.invalidateQueries({
          queryKey: featureKeys.memoryDocument(selectedId),
          refetchType: "none",
        });
        const result = await documentQuery.refetch();
        if (result.isError) throw result.error;
        onDirtyChange(false);
        return result.data ?? null;
      },
    );

  const toggleHermes = (kind: HermesMemoryKind, enabled: boolean) =>
    performWrite(
      "更新 Hermes 记忆状态",
      `Hermes ${kind === "memory" ? "MEMORY.md" : "USER.md"} 已${
        enabled ? "启用" : "停用"
      }`,
      () => ports.memory.setHermesEnabled(kind, enabled),
      async () => {
        await queryClient.invalidateQueries({
          queryKey: featureKeys.hermesMemoryLimits,
          refetchType: "none",
        });
        const result = await limitsQuery.refetch();
        if (result.isError) throw result.error;
      },
    );

  const openDirectory = async (target: OpenClawDirectory) => {
    if (directoryBusy) return;
    setDirectoryBusy(true);
    setNotice(null);
    try {
      await ports.memory.openOpenClawDirectory(target);
    } catch (openError) {
      setNotice({
        tone: "error",
        message: `无法打开目录：${errorMessage(openError)}`,
      });
    } finally {
      setDirectoryBusy(false);
    }
  };

  const selectDocument = (id: MemoryDocumentId) => {
    if (id === selectedId) return;
    requestTransition(() => {
      onDirtyChange(false);
      setSelectedId(id);
      setNotice(null);
    });
  };

  if (documentQuery.isLoading) {
    return (
      <EmptyState title="正在加载长期记忆" description="正在读取所选记忆资源">
        <Spinner />
      </EmptyState>
    );
  }
  if (documentQuery.error && documentQuery.data === undefined) {
    return (
      <NativeOrErrorState
        error={documentQuery.error}
        feature="长期记忆"
        onRetry={() => void documentQuery.refetch()}
      />
    );
  }

  const hermesLimit = selected.hermesKind
    ? limitsQuery.data?.[selected.hermesKind]
    : undefined;
  const hermesEnabled = selected.hermesKind
    ? selected.hermesKind === "memory"
      ? limitsQuery.data?.memoryEnabled
      : limitsQuery.data?.userEnabled
    : undefined;

  return (
    <>
      {notice && (
        <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
      )}
      {documentQuery.error && documentQuery.data !== undefined && (
        <InlineNotice tone="error">
          刷新失败，正在显示上一次成功内容：
          {errorMessage(documentQuery.error)}
        </InlineNotice>
      )}
      <div className="fy-feature-master fy-memory-master">
        <section className="fy-feature-panel" aria-label="长期记忆资源">
          <h2>长期记忆 · 4</h2>
          <SelectionLensTrack
            id="memory-document-list"
            className="fy-feature-list"
          >
            {MEMORY_DOCUMENTS.map((document) => (
              <button
                key={document.id}
                type="button"
                className="fy-feature-list-item"
                aria-current={document.id === selectedId}
                onClick={() => selectDocument(document.id)}
              >
                <SelectionLens active={document.id === selectedId} />
                <strong>{document.title}</strong>
                <span>{document.description}</span>
              </button>
            ))}
          </SelectionLensTrack>
        </section>
        <LongTermEditor
          key={selectedId}
          busy={busyOperation !== null}
          initialContent={documentQuery.data ?? null}
          limit={hermesLimit}
          resource={selected}
          onDirtyChange={onDirtyChange}
          onSave={save}
        />
        <section className="fy-feature-panel fy-feature-detail">
          <h2>记忆信息</h2>
          <dl className="fy-feature-definition">
            <dt>来源</dt>
            <dd>{selected.source}</dd>
            <dt>状态</dt>
            <dd>{documentQuery.data === null ? "尚未创建" : "可编辑"}</dd>
          </dl>
          {selected.hermesKind && (
            <>
              <div className="fy-feature-assignment">
                <span>Hermes 中启用</span>
                {limitsQuery.isLoading ? (
                  <Spinner label="正在读取 Hermes 状态" />
                ) : (
                  <Switch
                    checked={hermesEnabled ?? false}
                    disabled={busyOperation !== null || limitsQuery.isError}
                    label={`在 Hermes 中${
                      hermesEnabled ? "停用" : "启用"
                    } ${selected.title}`}
                    onCheckedChange={(enabled) =>
                      void toggleHermes(selected.hermesKind!, enabled)
                    }
                  />
                )}
              </div>
              <dl className="fy-feature-definition">
                <dt>字符上限</dt>
                <dd>{hermesLimit ?? "无法读取"}</dd>
              </dl>
              {limitsQuery.error && (
                <InlineNotice tone="error">
                  无法读取 Hermes 限额和启停状态：
                  {errorMessage(limitsQuery.error)}
                </InlineNotice>
              )}
            </>
          )}
          {selected.source === "OpenClaw" && (
            <Button
              disabled={directoryBusy}
              onClick={() => void openDirectory("workspace")}
            >
              打开 OpenClaw 工作区
            </Button>
          )}
        </section>
      </div>
    </>
  );
}

function LongTermEditor({
  busy,
  initialContent,
  limit,
  resource,
  onDirtyChange,
  onSave,
}: {
  busy: boolean;
  initialContent: string | null;
  limit?: number;
  resource: MemoryDocumentDefinition;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (content: string) => Promise<string | null | undefined>;
}) {
  const [baseline, setBaseline] = useState(initialContent ?? "");
  const [draft, setDraft] = useState(baseline);
  const [exists, setExists] = useState(initialContent !== null);
  const dirty = draft !== baseline;
  const missing = !exists;
  const characterCount = Array.from(draft).length;
  const overLimit = limit !== undefined && characterCount > limit;
  return (
    <section
      className="fy-feature-panel fy-feature-detail fy-memory-editor-panel"
      aria-label="长期记忆编辑器"
    >
      <div className="fy-feature-detail-title">
        <h2>{resource.title}</h2>
        <Badge tone={missing ? "warning" : "accent"}>
          {missing ? "尚未创建" : "已读取"}
        </Badge>
        {dirty && <Badge tone="warning">未保存</Badge>}
      </div>
      <p className="fy-feature-description">{resource.description}</p>
      <dl className="fy-feature-definition">
        <dt>字符数</dt>
        <dd>
          {characterCount}
          {limit !== undefined ? ` / ${limit}` : ""}
        </dd>
      </dl>
      {missing && (
        <InlineNotice>此内容尚未创建。点击“保存”后即可创建。</InlineNotice>
      )}
      {overLimit && (
        <InlineNotice tone="warning">
          当前内容为 {characterCount} 字符，超过 Hermes 的 {limit}
          字符上限。仍可保存，但部分内容可能无法被 Hermes 使用。
        </InlineNotice>
      )}
      <label className="fy-memory-editor-field">
        <span>记忆内容</span>
        <textarea
          className="fy-control-textarea fy-memory-editor-textarea"
          value={draft}
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            onDirtyChange(value !== baseline);
          }}
          disabled={busy}
          spellCheck={false}
        />
      </label>
      <div className="fy-feature-actions">
        <Button
          className="fy-control-button-primary"
          disabled={busy || (!dirty && !missing)}
          onClick={() => {
            void onSave(draft).then((content) => {
              if (content === undefined) return;
              const authoritative = content ?? "";
              setBaseline(authoritative);
              setDraft(authoritative);
              setExists(content !== null);
              onDirtyChange(false);
            });
          }}
        >
          {busy ? "保存中…" : "保存"}
        </Button>
      </div>
    </section>
  );
}

function DailyView({
  onDirtyChange,
  requestTransition,
}: {
  onDirtyChange: (dirty: boolean) => void;
  requestTransition: TransitionRequest;
}) {
  const queryClient = useQueryClient();
  const { ports } = useFeatures();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editorReset, setEditorReset] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyOperation, setBusyOperation] = useState<string | null>(null);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const writeLock = useRef(false);
  const listQuery = useDailyMemoryFiles();
  const resolvedFile = selectedFile ?? listQuery.data?.[0]?.filename ?? null;
  const fileQuery = useDailyMemoryFile(resolvedFile);
  const searchQuery = useDailyMemorySearch(debouncedSearch);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [search]);

  const rows = useMemo(
    () => (debouncedSearch ? (searchQuery.data ?? []) : (listQuery.data ?? [])),
    [debouncedSearch, listQuery.data, searchQuery.data],
  );

  async function performWrite<T>(
    label: string,
    successMessage: string,
    operation: () => Promise<void>,
    refresh: () => Promise<T>,
  ): Promise<T | undefined> {
    if (writeLock.current) return undefined;
    writeLock.current = true;
    setBusyOperation(label);
    setNotice(null);
    try {
      await operation();
      try {
        const refreshed = await refresh();
        setNotice({ tone: "info", message: successMessage });
        return refreshed;
      } catch (refreshError) {
        setNotice({
          tone: "warning",
          message: `写入可能已完成，但状态刷新失败：${errorMessage(refreshError)}`,
        });
      }
    } catch (operationError) {
      setNotice({
        tone: "error",
        message: `${label}失败：${errorMessage(operationError)}`,
      });
    } finally {
      setBusyOperation(null);
      writeLock.current = false;
    }
    return undefined;
  }

  const save = (content: string) => {
    if (!resolvedFile) {
      return Promise.resolve<string | null | undefined>(undefined);
    }
    return performWrite(
      "保存每日记忆",
      `${resolvedFile} 已保存`,
      () => ports.memory.writeDailyFile(resolvedFile, content),
      async () => {
        await queryClient.invalidateQueries({
          queryKey: featureKeys.dailyMemoryFile(resolvedFile),
          refetchType: "none",
        });
        const fileResult = await fileQuery.refetch();
        if (fileResult.isError) throw fileResult.error;
        await queryClient.invalidateQueries({
          queryKey: featureKeys.dailyMemoryFiles,
          refetchType: "none",
        });
        const listResult = await listQuery.refetch();
        if (listResult.isError) throw listResult.error;
        await queryClient.invalidateQueries({
          queryKey: ["v2", "memory", "daily", "search"],
          refetchType: "active",
        });
        onDirtyChange(false);
        return fileResult.data ?? null;
      },
    );
  };

  const remove = async () => {
    const filename = deleteTarget;
    if (!filename) return;
    setDeleteTarget(null);
    await performWrite(
      "删除每日记忆",
      `${filename} 已删除`,
      () => ports.memory.deleteDailyFile(filename),
      async () => {
        await queryClient.invalidateQueries({
          queryKey: featureKeys.dailyMemoryFiles,
          refetchType: "none",
        });
        const result = await listQuery.refetch();
        if (result.isError) throw result.error;
        await queryClient.invalidateQueries({
          queryKey: featureKeys.dailyMemoryFile(filename),
          refetchType: "none",
        });
        await queryClient.invalidateQueries({
          queryKey: ["v2", "memory", "daily", "search"],
          refetchType: "active",
        });
        setSelectedFile(result.data?.[0]?.filename ?? null);
        setEditorReset((value) => value + 1);
        onDirtyChange(false);
      },
    );
  };

  const openDirectory = async () => {
    if (directoryBusy) return;
    setDirectoryBusy(true);
    setNotice(null);
    try {
      await ports.memory.openOpenClawDirectory("memory");
    } catch (openError) {
      setNotice({
        tone: "error",
        message: `无法打开目录：${errorMessage(openError)}`,
      });
    } finally {
      setDirectoryBusy(false);
    }
  };

  const selectFile = (filename: string) => {
    if (filename === resolvedFile) return;
    requestTransition(() => {
      onDirtyChange(false);
      setSelectedFile(filename);
      setNotice(null);
    });
  };

  if (listQuery.isLoading) {
    return (
      <EmptyState title="正在加载每日记忆" description="正在读取每日记录">
        <Spinner />
      </EmptyState>
    );
  }
  if (listQuery.error && listQuery.data === undefined) {
    return (
      <NativeOrErrorState
        error={listQuery.error}
        feature="每日记忆"
        onRetry={() => void listQuery.refetch()}
      />
    );
  }

  return (
    <>
      {notice && (
        <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
      )}
      <div className="fy-feature-toolbar">
        <Input
          type="search"
          aria-label="搜索每日记忆"
          placeholder="搜索每日记录"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button disabled={directoryBusy} onClick={() => void openDirectory()}>
          打开记忆目录
        </Button>
        <Button
          className="fy-control-button-primary"
          disabled={busyOperation !== null}
          onClick={() => selectFile(todayFilename())}
        >
          创建或打开今天
        </Button>
      </div>
      {listQuery.error && listQuery.data !== undefined && (
        <InlineNotice tone="error">
          列表刷新失败，正在显示上一次成功数据：
          {errorMessage(listQuery.error)}
        </InlineNotice>
      )}
      {debouncedSearch && searchQuery.isFetching && (
        <InlineNotice>正在搜索每日记忆…</InlineNotice>
      )}
      {debouncedSearch && searchQuery.error && (
        <InlineNotice tone="error">
          搜索失败：{errorMessage(searchQuery.error)}
        </InlineNotice>
      )}
      {(listQuery.data ?? []).length === 0 && !resolvedFile ? (
        <EmptyState
          title="还没有每日记忆"
          description="打开并保存今天的记录后会自动创建。"
          actions={
            <Button
              className="fy-control-button-primary"
              onClick={() => selectFile(todayFilename())}
            >
              创建或打开今天
            </Button>
          }
        />
      ) : debouncedSearch &&
        !searchQuery.isFetching &&
        !searchQuery.error &&
        rows.length === 0 ? (
        <EmptyState
          title="没有匹配的每日记忆"
          description="请尝试其他关键词。"
        />
      ) : (
        <div className="fy-feature-master fy-memory-master">
          <section className="fy-feature-panel" aria-label="每日记忆列表">
            <h2>
              {debouncedSearch ? "搜索结果" : "每日文件"} · {rows.length}
            </h2>
            <SelectionLensTrack
              id="memory-daily-list"
              className="fy-feature-list fy-memory-daily-list"
            >
              {rows.map((file) => (
                <button
                  key={file.filename}
                  type="button"
                  className="fy-feature-list-item"
                  aria-current={file.filename === resolvedFile}
                  onClick={() => selectFile(file.filename)}
                >
                  <SelectionLens active={file.filename === resolvedFile} />
                  <strong>{file.filename}</strong>
                  <span>
                    {"matchCount" in file
                      ? `${file.matchCount} 处匹配 · ${file.snippet}`
                      : file.preview || file.date}
                  </span>
                  <span>{fileMeta(file)}</span>
                </button>
              ))}
            </SelectionLensTrack>
          </section>
          {resolvedFile ? (
            fileQuery.isLoading ? (
              <section className="fy-feature-panel">
                <Spinner label="正在读取每日记忆" />
              </section>
            ) : fileQuery.error && fileQuery.data === undefined ? (
              <section className="fy-feature-panel">
                <EmptyState
                  title="无法读取每日记忆"
                  description={errorMessage(fileQuery.error)}
                  actions={
                    <Button onClick={() => void fileQuery.refetch()}>
                      重试
                    </Button>
                  }
                />
              </section>
            ) : (
              <DailyEditor
                key={`${resolvedFile}:${editorReset}`}
                busy={busyOperation !== null}
                filename={resolvedFile}
                initialContent={fileQuery.data ?? null}
                onDelete={() =>
                  requestTransition(() => {
                    onDirtyChange(false);
                    setEditorReset((value) => value + 1);
                    setDeleteTarget(resolvedFile);
                  })
                }
                onDirtyChange={onDirtyChange}
                onSave={save}
              />
            )
          ) : (
            <section className="fy-feature-panel">
              <EmptyState
                title="选择每日记忆"
                description="从左侧选择一个文件，或打开今天的记录。"
              />
            </section>
          )}
          <section className="fy-feature-panel fy-feature-detail">
            <h2>使用说明</h2>
            <p className="fy-feature-description">
              每日记忆按日期整理。选择记录后即可编辑、保存或删除。
            </p>
          </section>
        </div>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={`删除 ${deleteTarget ?? "每日记忆"}？`}
        description="该 OpenClaw 每日记忆文件将从本机删除。"
        pending={busyOperation === "删除每日记忆"}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void remove()}
      />
    </>
  );
}

function DailyEditor({
  busy,
  filename,
  initialContent,
  onDelete,
  onDirtyChange,
  onSave,
}: {
  busy: boolean;
  filename: string;
  initialContent: string | null;
  onDelete: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onSave: (content: string) => Promise<string | null | undefined>;
}) {
  const [baseline, setBaseline] = useState(initialContent ?? "");
  const [draft, setDraft] = useState(baseline);
  const [exists, setExists] = useState(initialContent !== null);
  const dirty = draft !== baseline;
  const missing = !exists;
  const characterCount = Array.from(draft).length;
  return (
    <section
      className="fy-feature-panel fy-feature-detail fy-memory-editor-panel"
      aria-label="每日记忆编辑器"
    >
      <div className="fy-feature-detail-title">
        <h2>{filename}</h2>
        <Badge tone={missing ? "warning" : "accent"}>
          {missing ? "尚未创建" : "已读取"}
        </Badge>
        {dirty && <Badge tone="warning">未保存</Badge>}
      </div>
      <dl className="fy-feature-definition">
        <dt>字符数</dt>
        <dd>{characterCount}</dd>
      </dl>
      {missing && (
        <InlineNotice>今天的记录尚未创建。点击“保存”后即可创建。</InlineNotice>
      )}
      <label className="fy-memory-editor-field">
        <span>每日记忆内容</span>
        <textarea
          className="fy-control-textarea fy-memory-editor-textarea"
          value={draft}
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            onDirtyChange(value !== baseline);
          }}
          disabled={busy}
          spellCheck={false}
        />
      </label>
      <div className="fy-feature-actions">
        <Button
          className="fy-control-button-primary"
          disabled={busy || (!dirty && !missing)}
          onClick={() => {
            void onSave(draft).then((content) => {
              if (content === undefined) return;
              const authoritative = content ?? "";
              setBaseline(authoritative);
              setDraft(authoritative);
              setExists(content !== null);
              onDirtyChange(false);
            });
          }}
        >
          {busy ? "保存中…" : "保存"}
        </Button>
        {!missing && (
          <Button
            className="fy-control-button-danger"
            disabled={busy}
            onClick={onDelete}
          >
            删除
          </Button>
        )}
      </div>
    </section>
  );
}
