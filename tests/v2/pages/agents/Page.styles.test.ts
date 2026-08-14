import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(
  path.resolve(process.cwd(), "src", "v2", "pages", "agents", "Page.css"),
  "utf8",
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("V2 Agent page presentation styles", () => {
  it("keeps both grid panels at their intrinsic content height", () => {
    expect(rule(".fy-agent-layout")).toMatch(/align-items:\s*start;/);
    expect(css).not.toMatch(
      /\.fy-agent-catalog\s*,\s*\.fy-agent-detail\s*\{[^}]*(?:height|overflow)\s*:/s,
    );
    expect(css).not.toMatch(
      /\.fy-agent-detail\s*\{[^}]*(?:height|overflow)\s*:/s,
    );
  });

  it("does not paint artificial cards behind catalog artwork", () => {
    const selectorIcon = rule(".fy-agent-selector-icon");
    const detailIcon = rule(".fy-agent-detail-icon");

    expect(selectorIcon).not.toMatch(/background(?:-color)?:/);
    expect(detailIcon).not.toMatch(/background(?:-color)?:/);
    expect(detailIcon).not.toMatch(/(?:^|\s)border:/);
    expect(detailIcon).not.toMatch(/box-shadow:/);
    expect(rule(".fy-agent-detail-icon-native-size")).toMatch(
      /width:\s*48px;[\s\S]*height:\s*48px;/,
    );
  });
});
