import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { expectedInstallerNames } from "../scripts/release/release-contract.mjs";

const ROOT = path.resolve(__dirname, "..");
const EXTERNAL_INPUT_MARKERS = [
  ["fyagent", "modernization", "plan"].join("-"),
  ["fyagent", "change", "spec"].join("-"),
  ["", "projects", ["fyagent", "change", "spec"].join("-")].join("/"),
] as const;
const LEGACY_REPOSITORY_SLUG = ["NongHua123", "fyagent"].join("/");
const HISTORICAL_RELEASE_NOTE_PREFIX = "docs/release-notes/v0.3.0-";

const CURRENT_DEVELOPMENT_DOCS = [
  "docs/fyagent/development/README.md",
  "docs/fyagent/development/architecture/ownership.md",
  "docs/fyagent/development/ci-release/ci.md",
  "docs/fyagent/development/ci-release/release.md",
  "docs/fyagent/development/configuration/codex-provider.md",
  "docs/fyagent/development/configuration/workbuddy.md",
  "docs/fyagent/development/mise-tasks.md",
  "docs/fyagent/development/tooling/mise.md",
  "docs/fyagent/development/validation.md",
  "docs/fyagent/development/windows/codex-desktop.md",
  "docs/fyagent/development/windows/installer.md",
] as const;

const LOCALIZED_INSTALLATION_GUIDES = [
  {
    file: "docs/user-manual/en/1-getting-started/1.2-installation.md",
    trustPatterns: [
      /not signed with an Apple Developer ID/,
      /not\s+notarized by Apple/,
      /Open Anyway/,
      /Do not disable Gatekeeper/,
      /remove the file's quarantine attribute/,
    ],
  },
  {
    file: "docs/user-manual/ja/1-getting-started/1.2-installation.md",
    trustPatterns: [
      /Apple Developer ID では署名されておらず/,
      /公証も受けていません/,
      /このまま開く[\s\S]{0,40}Open Anyway/,
      /Gatekeeper を無効にしたり/,
      /quarantine[\s\S]{0,40}削除したりしないで/,
    ],
  },
  {
    file: "docs/user-manual/zh/1-getting-started/1.2-installation.md",
    trustPatterns: [
      /未使用 Apple\s+Developer ID\s+签名/,
      /未经 Apple 公证/,
      /仍要打开[\s\S]{0,40}Open\s+Anyway/,
      /不要关闭 Gatekeeper/,
      /不要移除[\s\S]{0,40}quarantine/,
    ],
  },
] as const;

const PUBLIC_READMES = [
  "README.md",
  "README_DE.md",
  "README_JA.md",
  "README_ZH.md",
] as const;

const CURRENT_PUBLIC_REPOSITORY_FILES = [
  ...PUBLIC_READMES,
  "CONTRIBUTING.md",
  "SECURITY.md",
  "SUPPORT.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/ISSUE_TEMPLATE/doc_issue.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/question.yml",
  "flatpak/com.fyagent.desktop.metainfo.xml",
] as const;

const INSTALLER_NAME_TEMPLATES = expectedInstallerNames("1.2.3").map((name) =>
  name.replace("1.2.3", "X.Y.Z"),
);

function read(relative: string): string {
  return fs
    .readFileSync(path.join(ROOT, relative), "utf8")
    .replace(/\r\n/g, "\n");
}

function markdownFilesUnder(relativeDirectory: string): string[] {
  const files: string[] = [];
  const pending = [relativeDirectory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    for (const entry of fs.readdirSync(path.join(ROOT, current), {
      withFileTypes: true,
    })) {
      const relative = path.posix.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(relative);
      } else if (entry.isFile() && relative.endsWith(".md")) {
        files.push(relative);
      }
    }
  }
  return files.sort();
}

function maintainedKnowledgeMarkdownFiles(): string[] {
  return [
    ...new Set([
      ...markdownFilesUnder("docs/fyagent/development"),
      ...markdownFilesUnder("docs/user-manual"),
      "CONTRIBUTING.md",
      "README.md",
      "README_DE.md",
      "README_JA.md",
      "README_ZH.md",
      "flatpak/README.md",
    ]),
  ].sort();
}

function currentPublicRepositoryFiles(): string[] {
  return [
    ...new Set([
      ...CURRENT_PUBLIC_REPOSITORY_FILES,
      ...markdownFilesUnder("docs/user-manual"),
      ...markdownFilesUnder("docs/release-notes").filter(
        (file) => !file.startsWith(HISTORICAL_RELEASE_NOTE_PREFIX),
      ),
    ]),
  ].sort();
}

function markdownTargets(source: string): string[] {
  return [...source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(
    (match) => match[1],
  );
}

function operationalTextFiles(): string[] {
  return execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\0")
    .filter(
      (file) =>
        file.length > 0 &&
        !file.startsWith(".trellis/") &&
        !file.startsWith(".agents/") &&
        !file.startsWith(".codex/") &&
        file !== "AGENTS.md" &&
        fs.existsSync(path.join(ROOT, file)) &&
        !fs.readFileSync(path.join(ROOT, file)).includes(0),
    );
}

describe("current FyAgent development documentation", () => {
  it("keeps one maintained explanation set", () => {
    expect(fs.existsSync(path.join(ROOT, "docs/fyagent/dev"))).toBe(false);
    expect(markdownFilesUnder("docs/fyagent/development")).toEqual(
      [...CURRENT_DEVELOPMENT_DOCS].sort(),
    );
    for (const file of CURRENT_DEVELOPMENT_DOCS) {
      expect(fs.statSync(path.join(ROOT, file)).isFile(), file).toBe(true);
    }
    expect(
      fs.existsSync(
        path.join(
          ROOT,
          "docs/fyagent/development/trellis/update-and-overlay.md",
        ),
      ),
    ).toBe(false);
  });

  it("documents a standalone mise workflow and keeps Trellis optional", () => {
    const contributing = read("CONTRIBUTING.md");
    expect(contributing).toContain(
      [
        "mise trust",
        "mise run bootstrap",
        "mise run system:check",
        "mise run dev",
      ].join("\n"),
    );
    expect(contributing).toContain("mise run check");
    expect(contributing).toContain(
      "The repository does not require a particular task framework",
    );
    expect(contributing).toContain("under `.trellis/spec/`");
    expect(contributing).toMatch(/Never\s+rewrite archived tasks/u);
    expect(contributing).toMatch(/prior workspace-journal\s+entries/u);
    expect(contributing).not.toContain("under `.trellis/` may be refreshed");

    const maintainedDevelopment = CURRENT_DEVELOPMENT_DOCS.map(read).join("\n");
    for (const retiredInterface of [
      "mise run trellis:",
      "fyagent-trellis",
      "trellis:reconcile",
      "trellis:verify",
      "scripts/trellis/",
    ]) {
      expect(maintainedDevelopment).not.toContain(retiredInterface);
      expect(contributing).not.toContain(retiredInterface);
    }
    for (const file of [
      ...CURRENT_DEVELOPMENT_DOCS,
      "CONTRIBUTING.md",
      ".github/pull_request_template.md",
    ]) {
      expect(read(file), file).not.toMatch(/\]\([^)]*\.trellis\//u);
    }
    expect(read(".github/pull_request_template.md")).not.toContain(
      "Trellis task:",
    );

    expect(read("docs/fyagent/development/README.md")).toMatch(
      /not required to\s+contribute, build, check, run CI, or release FyAgent/u,
    );
    const hookRisk = read("docs/fyagent/development/tooling/mise.md").replace(
      /\s+/gu,
      " ",
    );
    for (const acceptedRegression of [
      "accepted residual risk, not an equivalent security migration",
      "repository and task realpath containment",
      "exact-source import binding",
      "strict Codex event, session, cwd, stdin, stdout",
      "markup and control-character escaping",
    ]) {
      expect(hookRisk).toContain(acceptedRegression);
    }
  });

  it("keeps maintained knowledge free of old package and fixed-release routing", () => {
    for (const file of maintainedKnowledgeMarkdownFiles()) {
      const source = read(file);
      expect(source, file).not.toContain("docs/fyagent/dev/");
      expect(source, file).not.toMatch(/\bv?0\.3\.0\b/);
      expect(source, file).not.toMatch(/\bv3\.16\.0\b/);
      expect(source, file).not.toContain("windows-release-boundary.md");
      expect(source, file).not.toContain("fyagent-v1-0-1-config-domains.md");
      expect(source, file).not.toContain("NongHua123/cc-switch");
      expect(source, file).not.toContain("解除锁定");
    }
    for (const file of markdownFilesUnder("docs/user-manual")) {
      expect(read(file), file).not.toMatch(/\bv3\.\d+(?:\.\d+)?\b/);
    }
  });

  it("keeps localized installation guidance aligned with the release surface", () => {
    for (const file of [
      ...PUBLIC_READMES,
      ...LOCALIZED_INSTALLATION_GUIDES.map((guide) => guide.file),
    ]) {
      const source = read(file);
      for (const installer of INSTALLER_NAME_TEMPLATES) {
        expect(source, `${file} -> ${installer}`).toContain(installer);
      }
      expect(source, file).toContain("NSIS");
      expect(source, file).toMatch(/\bad-hoc\b/iu);
      expect(source, file).not.toMatch(
        /FyAgent-X\.Y\.Z-Windows(?:-(?:x64|arm64))?\.msi/i,
      );
      expect(source, file).not.toContain("FyAgent-X.Y.Z-Windows-Portable.zip");
    }
    for (const file of PUBLIC_READMES) {
      const source = read(file);
      for (const releaseEvidence of [
        "Developer ID",
        "NotSigned",
        "signing-status.json",
      ]) {
        expect(source, `${file} -> ${releaseEvidence}`).toContain(
          releaseEvidence,
        );
      }
    }
    for (const { file, trustPatterns } of LOCALIZED_INSTALLATION_GUIDES) {
      const source = read(file);
      expect(source, file).not.toContain("FyAgent-X.Y.Z-Linux-*");
      for (const trustPattern of trustPatterns) {
        expect(source, `${file} -> ${trustPattern.source}`).toMatch(
          trustPattern,
        );
      }
    }
  });

  it("keeps every local link in maintained knowledge resolvable", () => {
    for (const file of maintainedKnowledgeMarkdownFiles()) {
      const source = read(file);
      for (const rawTarget of markdownTargets(source)) {
        if (/^(?:https?:|mailto:|#)/.test(rawTarget)) continue;
        const withoutAnchor = rawTarget.split("#", 1)[0];
        if (withoutAnchor.length === 0) continue;
        const decoded = decodeURIComponent(withoutAnchor.replace(/^<|>$/g, ""));
        const target = path.resolve(
          path.dirname(path.join(ROOT, file)),
          decoded,
        );
        expect(fs.existsSync(target), `${file} -> ${rawTarget}`).toBe(true);
      }
    }
  });

  it("keeps maintained inputs independent of retired external authorities", () => {
    for (const file of operationalTextFiles()) {
      for (const marker of EXTERNAL_INPUT_MARKERS) {
        expect(read(file), `${file} -> ${marker}`).not.toContain(marker);
      }
    }
    for (const file of currentPublicRepositoryFiles()) {
      expect(read(file), file).not.toContain(LEGACY_REPOSITORY_SLUG);
    }
  });
});
