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
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [box, setBox] = useState<LensBox | null>(null);
  const reduceMotion = useReducedMotion() === true;

  const syncBox = useCallback(() => {
    const scope = scopeRef.current;
    const nextHost = hostRef.current;
    if (!scope || !nextHost) {
      return;
    }

    const scopeRect = scope.getBoundingClientRect();
    const hostRect = nextHost.getBoundingClientRect();
    setBox({
      x: hostRect.left - scopeRect.left + inset,
      y: hostRect.top - scopeRect.top + inset,
      width: Math.max(0, hostRect.width - inset * 2),
      height: Math.max(0, hostRect.height - inset * 2),
      borderRadius: getComputedStyle(nextHost).borderRadius,
    });
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
    syncBox();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncBox);
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
            className="fy-selection-lens"
            initial={false}
            animate={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
            }}
            transition={reduceMotion ? { duration: 0 } : selectionLensTransition}
            style={{ borderRadius: box.borderRadius }}
            aria-hidden
            data-testid="selection-lens"
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
