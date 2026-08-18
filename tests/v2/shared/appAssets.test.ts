import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  getSupportedAppIcon,
  getSkillTargetIcon,
  skillTargetIconById,
  supportedAppIconById,
} from "@/v2/shared/assets/apps";
import {
  SKILL_TARGET_IDS,
  SUPPORTED_APP_IDS,
  type SupportedAppId,
} from "@/v2/shared/features/types";

const repositoryRoot = path.resolve(process.cwd());
const appAssetRoot = path.join(
  repositoryRoot,
  "src",
  "v2",
  "shared",
  "assets",
  "apps",
);
const agentAssetRoot = path.join(
  repositoryRoot,
  "src",
  "v2",
  "shared",
  "assets",
  "agents",
);

const copiedAssetNames = {
  opencode: "opencode.svg",
} as const;

const reviewedSources: Readonly<Record<keyof typeof copiedAssetNames, string>> =
  {
    opencode: path.join(
      repositoryRoot,
      "src",
      "icons",
      "extracted",
      "opencode-logo-light.svg",
    ),
  };

const expectedAssetPaths: Readonly<Record<SupportedAppId, string>> = {
  claude: path.join(agentAssetRoot, "claude-code.svg"),
  codex: path.join(agentAssetRoot, "codex.svg"),
  opencode: path.join(appAssetRoot, copiedAssetNames.opencode),
  workbuddy: path.join(agentAssetRoot, "workbuddy.png"),
};

describe("V2 supported application assets", () => {
  it("maps every exact supported application ID to one bundled local asset", () => {
    expect(Object.keys(supportedAppIconById)).toEqual(SUPPORTED_APP_IDS);

    for (const id of SUPPORTED_APP_IDS) {
      expect(getSupportedAppIcon(id)).toBe(supportedAppIconById[id]);
      expect(getSupportedAppIcon(id)).toMatch(
        /^\/src\/v2\/shared\/assets\/(?:agents|apps)\//,
      );
    }
  });

  it("keeps Skills at six catalog-aligned targets while the MCP map stays at four", () => {
    expect(Object.keys(skillTargetIconById)).toEqual(SKILL_TARGET_IDS);
    expect(Object.keys(supportedAppIconById)).toEqual(SUPPORTED_APP_IDS);
    expect(getSkillTargetIcon("qoderwork")).toMatch(
      /\/src\/v2\/shared\/assets\/agents\/qoderwork\.png$/,
    );
    expect(getSkillTargetIcon("trae-work")).toMatch(
      /\/src\/v2\/shared\/assets\/agents\/trae-work\.png$/,
    );
    expect(getSkillTargetIcon("workbuddy")).toMatch(
      /\/src\/v2\/shared\/assets\/agents\/workbuddy\.png$/,
    );
  });

  it("keeps non-Agent app art as byte-identical V2-owned copies", () => {
    for (const id of Object.keys(reviewedSources) as Array<
      keyof typeof reviewedSources
    >) {
      expect(
        readFileSync(path.join(appAssetRoot, copiedAssetNames[id])),
      ).toEqual(readFileSync(reviewedSources[id]));
    }
  });

  it("keeps every supported application asset resolvable and non-empty", () => {
    for (const id of SUPPORTED_APP_IDS) {
      expect(readFileSync(expectedAssetPaths[id]).byteLength).toBeGreaterThan(
        0,
      );
    }
  });
});
