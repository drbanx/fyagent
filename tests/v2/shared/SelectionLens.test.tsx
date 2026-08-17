import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  SelectionLens,
  SelectionLensGroup,
  SelectionLensTrack,
  selectionLensTransition,
} from "@/v2/shared/ui/SelectionLens";

describe("SelectionLens", () => {
  it("keeps the source L1 control spring", () => {
    expect(selectionLensTransition).toEqual({
      type: "spring",
      stiffness: 520,
      damping: 42,
      mass: 0.62,
    });
  });

  it("renders one hidden pill only on the active option", () => {
    render(
      <SelectionLensTrack id="demo-track" role="list">
        <button type="button">
          <SelectionLens active={false} />
          Idle
        </button>
        <button type="button" aria-current="true">
          <SelectionLens active />
          Current
        </button>
      </SelectionLensTrack>,
    );

    expect(screen.getAllByTestId("selection-lens")).toHaveLength(1);
    expect(screen.getByTestId("selection-lens")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("does not render outside a group", () => {
    const { container } = render(<SelectionLens active />);

    expect(
      container.querySelector("[data-testid='selection-lens']"),
    ).toBeNull();
  });

  it("keeps a shared layout id inside the group", () => {
    render(
      <SelectionLensGroup id="shared-track">
        <SelectionLens active />
      </SelectionLensGroup>,
    );

    expect(screen.getByTestId("selection-lens")).toBeVisible();
  });
});
