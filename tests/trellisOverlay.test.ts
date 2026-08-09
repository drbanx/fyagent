import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error Repository task libraries are executed directly as JavaScript.
import * as overlayModule from "../scripts/trellis/overlay-lib.mjs";

const ROOT = path.resolve(__dirname, "..");
const fixtures: string[] = [];

type OverlayEntry = {
  path: string;
  owner: string;
  reason: string;
  upstreamIdentities: Record<string, string>;
  expectedOutputSha256: string;
  transform:
    | { type: "json-operations"; file: string }
    | { type: "unified-diff"; files: Record<string, string> };
};

type OverlayManifest = {
  schema: string;
  hash: string;
  entries: OverlayEntry[];
};

function write(relativeRoot: string, relativePath: string, content: string) {
  const absolute = path.join(relativeRoot, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}

function readJson<T>(root: string, relativePath: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(root, ...relativePath.split("/")), "utf8"),
  ) as T;
}

function writeJson(root: string, relativePath: string, value: unknown) {
  write(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function hashFile(absolute: string): string {
  return createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
}

function snapshot(root: string) {
  const records: Array<[string, string, bigint]> = [];
  const visit = (absolute: string) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) {
        const stat = fs.statSync(child, { bigint: true });
        records.push([
          path.relative(root, child).split(path.sep).join("/"),
          hashFile(child),
          stat.mtimeNs,
        ]);
      }
    }
  };
  visit(root);
  return records.sort(([left], [right]) => left.localeCompare(right));
}

function snapshotFiles(root: string, relativePaths: string[]) {
  return relativePaths.sort().map((relativePath) => {
    const absolute = path.join(root, ...relativePath.split("/"));
    const stat = fs.statSync(absolute, { bigint: true });
    return [relativePath, hashFile(absolute), stat.mtimeNs] as const;
  });
}

function productionManifest(): OverlayManifest {
  return overlayModule.loadOverlayManifest({ root: ROOT }) as OverlayManifest;
}

function fixture(
  options: {
    states?: Record<
      string,
      { state: "output" | "base" | "unknown"; identity?: string }
    >;
  } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fyagent-overlay-"));
  fixtures.push(root);
  const manifest = productionManifest();

  fs.cpSync(
    path.join(ROOT, "scripts", "trellis", "overlays"),
    path.join(root, "scripts", "trellis", "overlays"),
    { recursive: true },
  );
  writeJson(root, "scripts/trellis/overlay-manifest.json", manifest);
  write(
    root,
    ".trellis/spec/backend/development-hooks.md",
    "# Fixture overlay owner\n",
  );

  const hashes: Record<string, string> = {};
  for (const entry of manifest.entries) {
    const identity =
      options.states?.[entry.path]?.identity ??
      Object.keys(entry.upstreamIdentities)[0];
    const output = fs.readFileSync(
      path.join(ROOT, ...entry.path.split("/")),
      "utf8",
    );
    const state = options.states?.[entry.path]?.state ?? "output";
    const content =
      state === "base"
        ? (overlayModule.applyEntryTransform(
            entry,
            output,
            identity,
            true,
            ROOT,
          ) as string)
        : state === "unknown"
          ? "unknown preimage\n"
          : output;
    write(root, entry.path, content);
    hashes[entry.path] = entry.upstreamIdentities[identity];
  }

  write(root, "AGENTS.md", "canonical fixture\n");
  hashes["AGENTS.md"] = overlayModule.sha256Lf("canonical fixture\n") as string;
  writeJson(root, ".trellis/.template-hashes.json", {
    __version: 2,
    hashes,
  });
  return root;
}

afterEach(() => {
  while (fixtures.length > 0) {
    fs.rmSync(fixtures.pop()!, { recursive: true, force: true });
  }
});

describe("Trellis managed-template overlays", () => {
  it("verifies the real repository without changing content or mtimes", () => {
    const managed = overlayModule.loadManagedManifest({ root: ROOT }) as {
      hashes: Record<string, string>;
    };
    const managedPaths = Object.keys(managed.hashes);
    const before = snapshotFiles(ROOT, managedPaths);
    const manifestBefore = snapshot(path.join(ROOT, "scripts", "trellis"));
    const report = overlayModule.verifyRepository({ root: ROOT }) as {
      ok: boolean;
      managed: number;
      pristine: number;
      reconciled: number;
    };
    expect(report).toMatchObject({ ok: true, reconciled: 3 });
    expect(report.managed).toBeGreaterThan(report.reconciled);
    expect(snapshotFiles(ROOT, managedPaths)).toEqual(before);
    expect(snapshot(path.join(ROOT, "scripts", "trellis"))).toEqual(
      manifestBefore,
    );
  });

  it("reconciles every exact base and is idempotent on exact outputs", () => {
    const manifest = productionManifest();
    const states = Object.fromEntries(
      manifest.entries.map((entry) => [entry.path, { state: "base" as const }]),
    );
    const root = fixture({ states });

    const first = overlayModule.reconcileRepository({ root }) as {
      changed: number;
      reconciled: number;
    };
    expect(first).toMatchObject({
      changed: manifest.entries.length,
      reconciled: manifest.entries.length,
    });
    for (const entry of manifest.entries) {
      expect(
        overlayModule.sha256Lf(
          fs.readFileSync(path.join(root, ...entry.path.split("/"))),
        ),
        entry.path,
      ).toBe(entry.expectedOutputSha256);
    }
    const before = snapshot(root);
    expect(overlayModule.reconcileRepository({ root })).toMatchObject({
      changed: 0,
    });
    expect(snapshot(root)).toEqual(before);
  });

  it("accepts the explicit python3 upstream variant", () => {
    const pathName = ".codex/hooks/inject-subagent-context.py";
    const root = fixture({
      states: {
        [pathName]: { state: "base", identity: "python3" },
      },
    });
    expect(overlayModule.reconcileRepository({ root })).toMatchObject({
      changed: 1,
      reconciled: 3,
    });
    expect(overlayModule.verifyRepository({ root })).toMatchObject({
      ok: true,
    });
  });

  it("preflights all paths and writes nothing for an unknown preimage", () => {
    const manifest = productionManifest();
    const states = Object.fromEntries(
      manifest.entries.map((entry, index) => [
        entry.path,
        { state: index === manifest.entries.length - 1 ? "unknown" : "base" },
      ]),
    ) as Record<string, { state: "base" | "unknown" }>;
    const root = fixture({ states });
    const before = snapshot(root);
    expect(() => overlayModule.reconcileRepository({ root })).toThrow(
      /Unknown overlay preimage or output drift/,
    );
    expect(snapshot(root)).toEqual(before);
  });

  it("rejects missing, undeclared, and output-drifted managed files", () => {
    const missing = fixture();
    fs.rmSync(path.join(missing, "AGENTS.md"));
    expect(() => overlayModule.verifyRepository({ root: missing })).toThrow(
      /Managed template is missing: AGENTS\.md/,
    );

    const undeclared = fixture();
    fs.appendFileSync(path.join(undeclared, "AGENTS.md"), "drift\n");
    expect(() => overlayModule.verifyRepository({ root: undeclared })).toThrow(
      /Undeclared managed-template divergence: AGENTS\.md/,
    );

    const outputDrift = fixture();
    fs.appendFileSync(
      path.join(outputDrift, ".codex", "hooks", "inject-workflow-state.py"),
      "# drift\n",
    );
    expect(() => overlayModule.verifyRepository({ root: outputDrift })).toThrow(
      /Unknown overlay preimage or output drift/,
    );
  });

  it("rejects stale targets, base metadata, owners, and transforms", () => {
    const staleTarget = fixture();
    const managed = readJson<{
      __version: number;
      hashes: Record<string, string>;
    }>(staleTarget, ".trellis/.template-hashes.json");
    delete managed.hashes[".codex/hooks.json"];
    writeJson(staleTarget, ".trellis/.template-hashes.json", managed);
    expect(() => overlayModule.verifyRepository({ root: staleTarget })).toThrow(
      /Stale overlay target is not managed/,
    );

    const staleBase = fixture();
    const baseManifest = readJson<{
      __version: number;
      hashes: Record<string, string>;
    }>(staleBase, ".trellis/.template-hashes.json");
    baseManifest.hashes[".codex/hooks.json"] = "0".repeat(64);
    writeJson(staleBase, ".trellis/.template-hashes.json", baseManifest);
    expect(() => overlayModule.verifyRepository({ root: staleBase })).toThrow(
      /Managed base hash is not declared by overlay/,
    );

    const invalidOwner = fixture();
    const ownerManifest = readJson<OverlayManifest>(
      invalidOwner,
      "scripts/trellis/overlay-manifest.json",
    );
    ownerManifest.entries[0].owner = "docs/not-an-active-spec.md";
    writeJson(
      invalidOwner,
      "scripts/trellis/overlay-manifest.json",
      ownerManifest,
    );
    expect(() =>
      overlayModule.verifyRepository({ root: invalidOwner }),
    ).toThrow(/Overlay owner is invalid/);

    const staleTransform = fixture();
    const patchPath = path.join(
      staleTransform,
      "scripts/trellis/overlays/inject-workflow-state.patch",
    );
    fs.writeFileSync(
      patchPath,
      fs
        .readFileSync(patchPath, "utf8")
        .replace("+import importlib.util", "+import stale_importlib.util"),
    );
    expect(() =>
      overlayModule.verifyRepository({ root: staleTransform }),
    ).toThrow(/Overlay transform is stale/);
  });

  it("rejects duplicate entries, invalid reasons, wrong outputs, and missing patches", () => {
    const duplicate = fixture();
    const duplicateManifest = readJson<OverlayManifest>(
      duplicate,
      "scripts/trellis/overlay-manifest.json",
    );
    duplicateManifest.entries.push(
      structuredClone(duplicateManifest.entries[0]),
    );
    writeJson(
      duplicate,
      "scripts/trellis/overlay-manifest.json",
      duplicateManifest,
    );
    expect(() => overlayModule.verifyRepository({ root: duplicate })).toThrow(
      /Duplicate overlay path/,
    );

    const invalidReason = fixture();
    const reasonManifest = readJson<OverlayManifest>(
      invalidReason,
      "scripts/trellis/overlay-manifest.json",
    );
    reasonManifest.entries[0].reason = "short";
    writeJson(
      invalidReason,
      "scripts/trellis/overlay-manifest.json",
      reasonManifest,
    );
    expect(() =>
      overlayModule.verifyRepository({ root: invalidReason }),
    ).toThrow(/Overlay reason is invalid/);

    const wrongOutput = fixture();
    const outputManifest = readJson<OverlayManifest>(
      wrongOutput,
      "scripts/trellis/overlay-manifest.json",
    );
    outputManifest.entries[0].expectedOutputSha256 = "f".repeat(64);
    writeJson(
      wrongOutput,
      "scripts/trellis/overlay-manifest.json",
      outputManifest,
    );
    expect(() => overlayModule.verifyRepository({ root: wrongOutput })).toThrow(
      /Unknown overlay preimage or output drift/,
    );

    const missingPatch = fixture();
    fs.rmSync(
      path.join(
        missingPatch,
        "scripts/trellis/overlays/inject-workflow-state.patch",
      ),
    );
    expect(() =>
      overlayModule.verifyRepository({ root: missingPatch }),
    ).toThrow(/Transform .* is missing/);
  });

  it("rejects a known-hash hooks.json whose structural contract drifted", () => {
    const root = fixture({
      states: {
        ".codex/hooks.json": { state: "base", identity: "python" },
      },
    });
    const hooksPath = path.join(root, ".codex", "hooks.json");
    const hooks = JSON.parse(fs.readFileSync(hooksPath, "utf8")) as {
      hooks: { SubagentStart: Array<{ matcher: string }> };
    };
    hooks.hooks.SubagentStart[0].matcher = "^drift$";
    write(root, ".codex/hooks.json", `${JSON.stringify(hooks, null, 2)}\n`);
    const digest = overlayModule.sha256Lf(fs.readFileSync(hooksPath)) as string;
    const manifest = readJson<OverlayManifest>(
      root,
      "scripts/trellis/overlay-manifest.json",
    );
    manifest.entries[0].upstreamIdentities.python = digest;
    writeJson(root, "scripts/trellis/overlay-manifest.json", manifest);
    const managed = readJson<{
      __version: number;
      hashes: Record<string, string>;
    }>(root, ".trellis/.template-hashes.json");
    managed.hashes[".codex/hooks.json"] = digest;
    writeJson(root, ".trellis/.template-hashes.json", managed);

    expect(() => overlayModule.reconcileRepository({ root })).toThrow(
      /SubagentStart matcher drifted/,
    );
  });

  it("rejects an unreconciled declared base in read-only verification", () => {
    const root = fixture({
      states: {
        ".codex/hooks.json": { state: "base", identity: "python" },
      },
    });
    expect(() => overlayModule.verifyRepository({ root })).toThrow(
      /Overlay is not reconciled: \.codex\/hooks\.json/,
    );
  });
});
