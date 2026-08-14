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

const reviewedSources: Readonly<
  Record<Exclude<SupportedAppId, "claude" | "codex">, string>
> = {
  gemini: path.join(repositoryRoot, "src", "icons", "extracted", "gemini.svg"),
  grokbuild: path.join(repositoryRoot, "src", "icons", "extracted", "grok.svg"),
  opencode: path.join(
    repositoryRoot,
    "src",
    "icons",
    "extracted",
    "opencode-logo-light.svg",
  ),
  hermes: path.join(repositoryRoot, "src", "icons", "extracted", "hermes.png"),
};

const copiedAssetNames: Readonly<
  Record<Exclude<SupportedAppId, "claude" | "codex">, string>
> = {
  gemini: "gemini.svg",
  grokbuild: "grokbuild.svg",
  opencode: "opencode.svg",
  hermes: "hermes.png",
};

const expectedAssetPaths: Readonly<Record<SupportedAppId, string>> = {
  claude: path.join(
    repositoryRoot,
    "src",
    "v2",
    "shared",
    "assets",
    "agents",
    "claude-code.svg",
  ),
  codex: path.join(
    repositoryRoot,
    "src",
    "v2",
    "shared",
    "assets",
    "agents",
    "codex.svg",
  ),
  gemini: path.join(appAssetRoot, copiedAssetNames.gemini),
  grokbuild: path.join(appAssetRoot, copiedAssetNames.grokbuild),
  opencode: path.join(appAssetRoot, copiedAssetNames.opencode),
  hermes: path.join(appAssetRoot, copiedAssetNames.hermes),
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

  it("keeps Skills at eight local targets while the MCP-compatible map stays at six", () => {
    expect(Object.keys(skillTargetIconById)).toEqual(SKILL_TARGET_IDS);
    expect(Object.keys(supportedAppIconById)).toEqual(SUPPORTED_APP_IDS);
    expect(getSkillTargetIcon("qoderwork")).toMatch(
      /\/src\/v2\/shared\/assets\/agents\/qoderwork\.svg$/,
    );
    expect(getSkillTargetIcon("trae-work")).toMatch(
      /\/src\/v2\/shared\/assets\/agents\/trae-work\.png$/,
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
