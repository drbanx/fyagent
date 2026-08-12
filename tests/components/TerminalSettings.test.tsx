import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalSettings } from "@/components/settings/TerminalSettings";

const platform = vi.hoisted(() => ({ value: "unknown" }));

vi.mock("@/lib/platform", () => ({
  isMac: () => platform.value === "macos",
  isWindows: () => platform.value === "windows",
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("TerminalSettings", () => {
  beforeEach(() => {
    platform.value = "unknown";
  });

  it("fails closed without offering terminal choices on an unsupported host", () => {
    render(<TerminalSettings value="terminal" onChange={vi.fn()} />);

    expect(
      screen.getByText("settings.terminal.unsupportedPlatform"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("ignores a retired persisted value and shows the Windows default", () => {
    platform.value = "windows";
    const onChange = vi.fn();

    render(<TerminalSettings value="retired-terminal" onChange={onChange} />);

    expect(screen.getByRole("combobox")).toHaveTextContent(
      "settings.terminal.options.windows.cmd",
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
