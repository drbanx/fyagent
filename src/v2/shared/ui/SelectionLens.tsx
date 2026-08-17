import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  createContext,
  useContext,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { classNames } from "../design-system/classNames";

import "./selection-lens.css";

export const selectionLensTransition = {
  type: "spring",
  stiffness: 520,
  damping: 42,
  mass: 0.62,
} as const;

const SelectionLensLayoutIdContext = createContext<string | null>(null);

export function SelectionLensGroup({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <SelectionLensLayoutIdContext.Provider value={id}>
      <LayoutGroup id={id}>{children}</LayoutGroup>
    </SelectionLensLayoutIdContext.Provider>
  );
}

export function SelectionLens({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  const layoutId = useContext(SelectionLensLayoutIdContext);
  const reduceMotion = useReducedMotion() === true;

  if (!active || !layoutId) {
    return null;
  }

  return (
    <motion.div
      layoutId={layoutId}
      className={classNames("fy-selection-lens", className)}
      transition={reduceMotion ? { duration: 0 } : selectionLensTransition}
      aria-hidden
      data-testid="selection-lens"
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
    <SelectionLensGroup id={id}>
      <div className={className} {...props}>
        {children}
      </div>
    </SelectionLensGroup>
  );
}
