import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { useMemo, useState } from "react";

import { classNames } from "../../shared/design-system/classNames";
import { useTraeWorkModelIds } from "../../shared/features/queries";
import { CatalogDetail } from "../../shared/ui/catalog";
import { InlineNotice, Spinner } from "../../shared/ui/primitives";
import { GroupedModelChips, ModelSearchField } from "./modelChips";
import { ModelsPanelHeader } from "./modelsShared";
import { filterModelIds } from "./workBuddyModels";

const EMPTY_MODEL_IDS: readonly string[] = [];

export function TraeModelsPanel({ active }: { active: boolean }) {
  const modelIdsQuery = useTraeWorkModelIds(active);
  const [existingSearch, setExistingSearch] = useState("");
  const [existingOpen, setExistingOpen] = useState(false);

  const modelIds = modelIdsQuery.data?.modelIds ?? EMPTY_MODEL_IDS;
  const filteredExistingIds = useMemo(
    () => filterModelIds(modelIds, existingSearch),
    [modelIds, existingSearch],
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
        summary="自定义模型需在 TRAE Work CN 中添加。FyAgent 不会写入其本地模型配置。"
      />

      <InlineNotice>
        TRAE Work CN 以云端模型列表为准。写入本机缓存的自定义模型会在应用启动时被覆盖，因此无法在此保存或应用。
      </InlineNotice>

      {loading && <Spinner label="正在读取 TRAE 当前模型" />}
      {readFailed && (
        <InlineNotice tone="error">暂时无法读取 TRAE 当前模型，请重试。</InlineNotice>
      )}

      <section
        className="fy-models-existing"
        data-testid="trae-model-ids"
        aria-label="TRAE 当前第三方模型 ID"
      >
        <button
          type="button"
          className="fy-models-existing-toggle"
          aria-expanded={existingOpen}
          onClick={() => setExistingOpen((open) => !open)}
        >
          <h3>TRAE 当前第三方模型 ID</h3>
          <span className="fy-models-existing-meta">
            <span>当前可见数量</span>
            <strong className="fy-models-existing-count">{modelIds.length}</strong>
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
                label="搜索当前模型"
                value={existingSearch}
                onChange={setExistingSearch}
              />
            ) : null}
            <GroupedModelChips
              ids={filteredExistingIds}
              emptyLabel={
                existingSearch.trim()
                  ? "没有匹配的模型 ID"
                  : "未观察到第三方模型 ID。请在 TRAE Work CN 中添加。"
              }
            />
          </>
        ) : null}
      </section>
    </CatalogDetail>
  );
}
