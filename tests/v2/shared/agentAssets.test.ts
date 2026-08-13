import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  agentIconById,
  agentIconIds,
  getAgentIcon,
} from "@/v2/shared/assets/agents";

const repositoryRoot = path.resolve(process.cwd());
const assetRoot = path.join(
  repositoryRoot,
  "src",
  "v2",
  "shared",
  "assets",
  "agents",
);

const officialAssetDigests = {
  "qoderwork.svg":
    "2924a0fe240e0ca63895e345f65efbb6780b5c8e8b97a3ecf98c610f6e01fc41",
  "trae-work.png":
    "49d523938a22af5a70dd79923725df38674823026e2f917e76337319969f4af4",
} as const;

function assetPath(fileName: string): string {
  return path.join(assetRoot, fileName);
}

function sha256(fileName: string): string {
  return createHash("sha256")
    .update(readFileSync(assetPath(fileName)))
    .digest("hex");
}

function readPngMetadata(fileName: string): {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
} {
  const bytes = readFileSync(assetPath(fileName));
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
  };
}

describe("V2 Agent catalog assets", () => {
  it("maps every exact native catalog ID to one bundled local asset", () => {
    expect(agentIconIds).toEqual([
      "qoderwork",
      "trae-work",
      "workbuddy",
      "codex",
      "claude-code",
    ]);
    expect(Object.keys(agentIconById)).toEqual(agentIconIds);

    for (const id of agentIconIds) {
      expect(getAgentIcon(id)).toBe(agentIconById[id]);
      expect(getAgentIcon(id)).toMatch(/^\/src\/v2\/shared\/assets\/agents\//);
    }
  });

  it("preserves the exact official QoderWork and TRAE Work source bytes", () => {
    for (const [fileName, digest] of Object.entries(officialAssetDigests)) {
      expect(sha256(fileName)).toBe(digest);
    }

    expect(readPngMetadata("trae-work.png")).toEqual({
      width: 48,
      height: 48,
      bitDepth: 8,
      colorType: 6,
    });
  });

  it("keeps the Qoder SVG passive and internally referenced", () => {
    const svgText = readFileSync(assetPath("qoderwork.svg"), "utf8");
    const document = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const root = document.documentElement;

    expect(document.querySelector("parsererror")).toBeNull();
    expect(root.localName).toBe("svg");
    expect(root.getAttribute("width")).toBe("180");
    expect(root.getAttribute("height")).toBe("180");
    expect(root.getAttribute("viewBox")).toBe("0 0 180 180");

    const elementNames = [
      ...new Set(
        Array.from(
          document.querySelectorAll("*"),
          (element) => element.localName,
        ),
      ),
    ].sort();
    expect(elementNames).toEqual([
      "clipPath",
      "defs",
      "g",
      "path",
      "rect",
      "svg",
    ]);
    expect(
      document.querySelector(
        "script, foreignObject, image, style, filter, audio, video",
      ),
    ).toBeNull();

    for (const element of document.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        const name = attribute.name.toLowerCase();
        expect(name.startsWith("on")).toBe(false);
        expect(["href", "xlink:href", "src"]).not.toContain(name);
      }
    }

    const urlReferences = Array.from(
      svgText.matchAll(/url\(([^)]+)\)/g),
      (match) => match[1],
    );
    expect(urlReferences).toHaveLength(2);
    expect(urlReferences.every((reference) => reference.startsWith("#"))).toBe(
      true,
    );
  });

  it("keeps reviewed WorkBuddy, Codex, and Claude Code art as V2-owned copies", () => {
    const reviewedSources = {
      "workbuddy.png": path.join(
        repositoryRoot,
        "src",
        "assets",
        "workbuddy-icon-512.png",
      ),
      "codex.svg": path.join(
        repositoryRoot,
        "src",
        "icons",
        "extracted",
        "openai.svg",
      ),
      "claude-code.svg": path.join(
        repositoryRoot,
        "src",
        "icons",
        "extracted",
        "claude.svg",
      ),
    } as const;

    for (const [fileName, sourcePath] of Object.entries(reviewedSources)) {
      expect(readFileSync(assetPath(fileName))).toEqual(
        readFileSync(sourcePath),
      );
    }

    expect(readPngMetadata("workbuddy.png")).toMatchObject({
      width: 512,
      height: 512,
      bitDepth: 8,
      colorType: 6,
    });
  });
});
