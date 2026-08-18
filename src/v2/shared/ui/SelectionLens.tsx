import { motion, useReducedMotion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
} from "react";

import { classNames } from "../design-system/classNames";

import "./selection-lens.css";

export const selectionLensTransition = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.62,
} as const;

type LensBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: string;
};

type SelectionLensContextValue = {
  register: (host: HTMLElement | null) => void;
  unregister: (host: HTMLElement) => void;
};

const SelectionLensContext = createContext<SelectionLensContextValue | null>(
  null,
);

function isHiddenFromLayout(element: HTMLElement): boolean {
  let node: HTMLElement | null = element;
  while (node) {
    if (node.hidden) return true;
    node = node.parentElement;
  }
  return false;
}

function observeHiddenAncestors(
  start: HTMLElement,
  onChange: () => void,
): () => void {
  const observer = new MutationObserver(onChange);
  let node: HTMLElement | null = start;
  while (node) {
    observer.observe(node, {
      attributes: true,
      attributeFilter: ["hidden"],
    });
    node = node.parentElement;
  }
  return () => observer.disconnect();
}

export function SelectionLensGroup({
  id,
  inset = 0,
  className,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "id"> & {
  id: string;
  inset?: number;
}) {
  const scopeRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLElement | null>(null);
  const hiddenRef = useRef(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<LensBox | null>(null);
  const [revealKey, setRevealKey] = useState(0);
  const reduceMotion = useReducedMotion() === true;

  const syncBox = useCallback(() => {
    const scope = scopeRef.current;
    const nextHost = hostRef.current;
    if (!scope || !nextHost) {
      return;
    }

    if (isHiddenFromLayout(scope)) {
      hiddenRef.current = true;
      return;
    }

    const scopeRect = scope.getBoundingClientRect();
    const hostRect = nextHost.getBoundingClientRect();
    if (hiddenRef.current) {
      hiddenRef.current = false;
      setRevealKey((key) => key + 1);
    }
    const nextBox = {
      x: hostRect.left - scopeRect.left + inset,
      y: hostRect.top - scopeRect.top + inset,
      width: Math.max(0, hostRect.width - inset * 2),
      height: Math.max(0, hostRect.height - inset * 2),
      borderRadius: getComputedStyle(nextHost).borderRadius,
    };
    setBox((current) =>
      current &&
      current.x === nextBox.x &&
      current.y === nextBox.y &&
      current.width === nextBox.width &&
      current.height === nextBox.height &&
      current.borderRadius === nextBox.borderRadius
        ? current
        : nextBox,
    );
  }, [inset]);

  const register = useCallback((nextHost: HTMLElement | null) => {
    hostRef.current = nextHost;
    setHost(nextHost);
  }, []);

  const unregister = useCallback((currentHost: HTMLElement) => {
    if (hostRef.current !== currentHost) {
      return;
    }
    hostRef.current = null;
    setHost(null);
  }, []);

  useLayoutEffect(() => {
    syncBox();
  });

  useLayoutEffect(() => {
    const scope = scopeRef.current;
    if (!scope || !host) {
      return;
    }

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            syncBox();
          });
    observer?.observe(scope);
    observer?.observe(host);
    window.addEventListener("resize", syncBox);
    const stopHiddenWatch = observeHiddenAncestors(scope, syncBox);
    syncBox();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncBox);
      stopHiddenWatch();
    };
  }, [host, syncBox]);

  return (
    <SelectionLensContext.Provider value={{ register, unregister }}>
      <div
        ref={scopeRef}
        className={classNames("fy-selection-lens-scope", className)}
        data-selection-lens-group={id}
        {...props}
      >
        {children}
        {host && box ? (
          <motion.div
            key={revealKey}
            className="fy-selection-lens"
            initial={
              reduceMotion
                ? false
                : { left: inset, top: inset, width: 0, height: 0 }
            }
            animate={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
            }}
            transition={
              reduceMotion ? { duration: 0 } : selectionLensTransition
            }
            style={{ borderRadius: box.borderRadius }}
            aria-hidden
            data-testid="selection-lens"
            data-selection-lens-reveal={revealKey}
          />
        ) : null}
      </div>
    </SelectionLensContext.Provider>
  );
}

export function SelectionLens({
  active,
}: {
  active: boolean;
  className?: string;
}) {
  const ctx = useContext(SelectionLensContext);
  const markerRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!ctx || !active) {
      return;
    }

    const host = markerRef.current?.parentElement ?? null;
    ctx.register(host);
    return () => {
      if (host) {
        ctx.unregister(host);
      }
    };
  }, [active, ctx]);

  if (!ctx || !active) {
    return null;
  }

  return (
    <span
      ref={markerRef}
      className="fy-selection-lens-target"
      aria-hidden
      data-selection-lens-target=""
    />
  );
}

export function SelectionLensTrack({
  id,
  className,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, "id"> & { id: string }) {
  return (
    <SelectionLensGroup id={id} className={className} {...props}>
      {children}
    </SelectionLensGroup>
  );
}
