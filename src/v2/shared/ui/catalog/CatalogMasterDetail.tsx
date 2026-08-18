import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { AgentBrandAsset } from "../../assets/agents";
import { classNames } from "../../design-system/classNames";
import { SelectionLens, SelectionLensGroup } from "../SelectionLens";

import "./catalog.css";

const CATALOG_RAIL_MIN_WIDTH = 220;
const CATALOG_RAIL_MAX_WIDTH = 420;
const CATALOG_DETAIL_MIN_WIDTH = 360;
const CATALOG_RESIZE_GUTTER = 14;
const CATALOG_RESIZE_STEP = 16;
const CATALOG_STACK_QUERY = "(max-width: 760px)";

type CatalogMasterDetailStyle = CSSProperties & {
  "--fy-catalog-rail-width"?: string;
};

interface CatalogMasterDetailProps {
  children: ReactNode;
  className?: string;
}

function isCatalogStacked(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia(CATALOG_STACK_QUERY).matches
  );
}

function clampCatalogRailWidth(width: number, containerWidth: number): number {
  if (!Number.isFinite(width)) {
    return CATALOG_RAIL_MIN_WIDTH;
  }
  const availableMax =
    containerWidth > 0
      ? containerWidth - CATALOG_RESIZE_GUTTER - CATALOG_DETAIL_MIN_WIDTH
      : CATALOG_RAIL_MAX_WIDTH;
  const max = Math.max(
    CATALOG_RAIL_MIN_WIDTH,
    Math.min(CATALOG_RAIL_MAX_WIDTH, availableMax),
  );
  return Math.min(max, Math.max(CATALOG_RAIL_MIN_WIDTH, Math.round(width)));
}

function measureRailWidth(container: HTMLElement): number {
  const rail = container.querySelector(".fy-catalog-rail");
  const width = rail?.getBoundingClientRect().width ?? 0;
  return width > 0 ? Math.round(width) : CATALOG_RAIL_MIN_WIDTH;
}

export function CatalogMasterDetail({
  children,
  className,
}: CatalogMasterDetailProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [railWidth, setRailWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const panes = Children.toArray(children);
  const rail = panes[0];
  const detail = panes.slice(1);
  const showResizeHandle = detail.length > 0;

  const applyDrag = useCallback((clientX: number) => {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;
    setRailWidth(
      clampCatalogRailWidth(
        drag.startWidth + (clientX - drag.startX),
        container.getBoundingClientRect().width,
      ),
    );
  }, []);

  const endResize = useCallback(() => {
    if (!dragRef.current && !resizing) return;
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setResizing(false);
  }, [resizing]);

  useEffect(() => {
    if (!resizing) return;
    const onMove = (event: PointerEvent) => applyDrag(event.clientX);
    const onUp = () => endResize();
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [applyDrag, endResize, resizing]);

  const valueNow = railWidth ?? CATALOG_RAIL_MIN_WIDTH;

  const beginResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button === 1 || event.button === 2 || isCatalogStacked()) {
        return;
      }
      const container = containerRef.current;
      if (!container) return;
      dragRef.current = {
        startX: event.clientX,
        startWidth: railWidth ?? measureRailWidth(container),
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setResizing(true);
    },
    [railWidth],
  );

  const onHandlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      applyDrag(event.clientX);
    },
    [applyDrag],
  );

  const onResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (isCatalogStacked()) return;
      const container = containerRef.current;
      if (!container) return;
      const containerWidth = container.getBoundingClientRect().width;
      const current = railWidth ?? measureRailWidth(container);
      let next: number;
      switch (event.key) {
        case "ArrowLeft":
          next = current - CATALOG_RESIZE_STEP;
          break;
        case "ArrowRight":
          next = current + CATALOG_RESIZE_STEP;
          break;
        case "Home":
          next = CATALOG_RAIL_MIN_WIDTH;
          break;
        case "End":
          next = clampCatalogRailWidth(CATALOG_RAIL_MAX_WIDTH, containerWidth);
          break;
        default:
          return;
      }
      event.preventDefault();
      setRailWidth(clampCatalogRailWidth(next, containerWidth));
    },
    [railWidth],
  );

  const style: CatalogMasterDetailStyle | undefined =
    railWidth === null
      ? undefined
      : { "--fy-catalog-rail-width": `${railWidth}px` };

  return (
    <div
      ref={containerRef}
      className={classNames("fy-catalog-master-detail", className)}
      data-resizing={resizing ? "true" : undefined}
      style={style}
    >
      {rail}
      {showResizeHandle ? (
        <>
          <CatalogResizeHandle
            max={CATALOG_RAIL_MAX_WIDTH}
            valueNow={valueNow}
            onPointerDown={beginResize}
            onPointerMove={onHandlePointerMove}
            onPointerUp={endResize}
            onKeyDown={onResizeKeyDown}
            onReset={() => setRailWidth(null)}
          />
          <div className="fy-catalog-pane">{detail}</div>
        </>
      ) : null}
    </div>
  );
}

function CatalogResizeHandle({
  max,
  valueNow,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
  onReset,
}: {
  max: number;
  valueNow: number;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onReset: () => void;
}) {
  return (
    <div
      className="fy-catalog-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整目录与详情的宽度"
      aria-valuemin={CATALOG_RAIL_MIN_WIDTH}
      aria-valuemax={max}
      aria-valuenow={valueNow}
      aria-valuetext={`${valueNow} 像素`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
    />
  );
}

interface CatalogRailProps {
  ariaLabel: string;
  title: string;
  children: ReactNode;
  meta?: ReactNode;
  as?: "aside" | "section";
  className?: string;
}

export function CatalogRail({
  ariaLabel,
  title,
  children,
  meta,
  as = "section",
  className,
}: CatalogRailProps) {
  const content = (
    <>
      <div className="fy-catalog-rail-heading">
        <h2>{title}</h2>
        {meta && <div className="fy-catalog-rail-meta">{meta}</div>}
      </div>
      {children}
    </>
  );
  const classes = classNames("fy-feature-panel", "fy-catalog-rail", className);

  return as === "aside" ? (
    <aside className={classes} aria-label={ariaLabel}>
      {content}
    </aside>
  ) : (
    <section className={classes} aria-label={ariaLabel}>
      {content}
    </section>
  );
}

export function CatalogList({ children }: { children: ReactNode }) {
  return (
    <SelectionLensGroup
      id="catalog-list"
      className="fy-catalog-list"
      role="list"
    >
      {children}
    </SelectionLensGroup>
  );
}

type CatalogBrandFrameSize = "list" | "detail";
type CatalogBrandFrameStyle = CSSProperties & {
  "--fy-catalog-optical-scale": number;
};

interface BrandIconFrameProps {
  asset: AgentBrandAsset;
  size: CatalogBrandFrameSize;
  accessibilityLabel?: string;
}

export function BrandIconFrame({
  asset,
  size,
  accessibilityLabel,
}: BrandIconFrameProps) {
  const optics = asset[size];
  const decorative = accessibilityLabel === undefined;
  const style: CatalogBrandFrameStyle = {
    "--fy-catalog-optical-scale": optics.opticalScale,
  };

  return (
    <span
      className="fy-catalog-brand-frame"
      data-size={size}
      data-background={optics.background}
      data-corner={optics.corner}
      style={style}
    >
      <img
        className="fy-catalog-brand-artwork"
        src={asset.iconUrl}
        alt={accessibilityLabel ?? ""}
        aria-hidden={decorative ? "true" : undefined}
      />
    </span>
  );
}

interface CatalogListItemProps {
  asset: AgentBrandAsset;
  label: string;
  summary: ReactNode;
  selected: boolean;
  onSelect: () => void;
  testId?: string;
  disabled?: boolean;
}

export function CatalogListItem({
  asset,
  label,
  summary,
  selected,
  onSelect,
  testId,
  disabled,
}: CatalogListItemProps) {
  return (
    <div role="listitem">
      <button
        type="button"
        className="fy-catalog-list-item"
        aria-current={selected ? "true" : undefined}
        data-testid={testId}
        disabled={disabled}
        onClick={onSelect}
      >
        <SelectionLens active={selected} />
        <BrandIconFrame asset={asset} size="list" />
        <span className="fy-catalog-list-copy">
          <strong>{label}</strong>
          <span>{summary}</span>
        </span>
      </button>
    </div>
  );
}

interface CatalogDetailProps {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}

export function CatalogDetail({
  ariaLabel,
  children,
  className,
}: CatalogDetailProps) {
  return (
    <section
      className={classNames("fy-feature-panel", "fy-catalog-detail", className)}
      aria-label={ariaLabel}
    >
      {children}
    </section>
  );
}
