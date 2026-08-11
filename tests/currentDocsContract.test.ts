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

const WINDOWS_CODEX_DESKTOP_DOC =
  "docs/fyagent/development/windows/codex-desktop.md";
const WINDOWS_INSTALLER_DOC = "docs/fyagent/development/windows/installer.md";
const VALIDATION_DOC = "docs/fyagent/development/validation.md";
const V031_RELEASE_NOTES = "docs/release-notes/v0.3.1-en.md";
const CODEX_INSTALLER_SPEC = ".trellis/spec/backend/codex-desktop-installer.md";
const PACKAGE_BRIDGE_ROOT =
  "FyAgent.PackageBridge-{96F39D37-0F42-486F-8C86-3631C12171C5}";

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

  it("documents the protected ProgramData A1 package bridge without an HTTP or NSIS fallback", () => {
    const codexDesktop = read(WINDOWS_CODEX_DESKTOP_DOC);
    const installer = read(WINDOWS_INSTALLER_DOC);
    const installerSpec = read(CODEX_INSTALLER_SPEC);
    const bridgeAuthority = `${codexDesktop}\n${installerSpec}`;

    for (const fixedBoundary of [
      "FOLDERID_ProgramData",
      PACKAGE_BRIDGE_ROOT,
      "installer.msix",
      "FYABRIDG",
      "UrlCreateFromPathW",
      "PathCreateFromUrlW",
      "AddPackageByUriAsync",
    ]) {
      expect(bridgeAuthority, fixedBoundary).toContain(fixedBoundary);
    }

    expect(bridgeAuthority).toMatch(
      /Hello[\s\S]+?bridge control[\s\S]+?Started[\s\S]+?admission[\s\S]+?progress[\s\S]+?(?:success|error)/iu,
    );
    expect(bridgeAuthority).toMatch(/protected(?:[- ]DACL|[^.\n]{0,24}ACL)/iu);
    expect(bridgeAuthority).toMatch(
      /(?:no|without)[^\n.]{0,100}HTTP[^\n.]{0,100}fallback/iu,
    );
    expect(bridgeAuthority).toMatch(
      /A1[\s\S]+?Windows 10[\s\S]+?Windows 11[\s\S]+?x64[\s\S]+?ARM64/iu,
    );
    expect(bridgeAuthority).toMatch(
      /(?:minimum supported Windows version|Windows support floor)[^\n.]{0,120}(?:does not change|unchanged|not raised)/iu,
    );
    expect(bridgeAuthority).toMatch(
      /A2[\s\S]+?future independent native validation[\s\S]+?explicit[\s\S]+?decision/iu,
    );
    expect(bridgeAuthority).toMatch(
      /A2[\s\S]+?(?:never a runtime fallback|runtime[^.]{0,120}never selects A2)/iu,
    );

    for (const [file, source] of [
      [WINDOWS_CODEX_DESKTOP_DOC, codexDesktop],
      [CODEX_INSTALLER_SPEC, installerSpec],
      [VALIDATION_DOC, read(VALIDATION_DOC)],
      [V031_RELEASE_NOTES, read(V031_RELEASE_NOTES)],
    ] as const) {
      const normalized = source.replace(/\s+/gu, " ");
      expect(normalized, file).toMatch(
        /(?:does not run|runs no|do not run)[^.]{0,100}HIL[^.]{0,120}(?:local|locally)[^.]{0,120}(?:Actions|GitHub Actions)/iu,
      );
      expect(normalized, file).toMatch(
        /static contract[^.]{0,160}Windows-target compilation checks[^.]{0,120}(?:code\/security )?review/iu,
      );
      expect(normalized, file).toMatch(
        /Windows 10(?:\/11|[^.]{0,30}Windows 11)/iu,
      );
      expect(normalized, file).toMatch(/x64\/ARM64/iu);
      expect(normalized, file).toMatch(
        /(?:Bob-elevated\/Alice|elevated-Bob\/(?:standard-)?Alice)/iu,
      );
      for (const [label, pattern] of [
        ["PackageManager", /PackageManager/iu],
        ["file URI", /file[- ]URI/iu],
        ["ACL", /ACL/iu],
        ["cleanup", /cleanup/iu],
      ] as const) {
        expect(normalized, `${file} -> ${label}`).toMatch(pattern);
      }
      expect(normalized, file).toMatch(/explicit,? unverified residual risk/iu);
      expect(normalized, file).toMatch(
        /(?:must not|cannot|prohibit|Do not treat)[^.]{0,160}native[- ]compatibility[^.]{0,160}native[- ]runtime/iu,
      );
    }

    for (const [file, source] of [
      [WINDOWS_CODEX_DESKTOP_DOC, codexDesktop],
      [CODEX_INSTALLER_SPEC, installerSpec],
    ] as const) {
      const normalized = source.replace(/\s+/gu, " ");
      expect(normalized, file).toMatch(
        /Before admission[^.]{0,320}structured error[^.]{0,120}PackageManager has not run/iu,
      );
      expect(normalized, file).toMatch(
        /After admission[^.]{0,420}invalid progress[^.]{0,100}terminal[^.]{0,160}(?:duplicate|extra data)[^.]{0,160}protocol\/transport[^.]{0,160}timeout[^.]{0,160}unclean close[^.]{0,200}(?:best-effort cancellation|best-effort cancel)[^.]{0,200}permanent process-lifetime quarantine/iu,
      );
      expect(normalized, file).toContain("Job remains `Installing`");
      expect(normalized, file).toMatch(
        /no terminal result is published to the renderer/iu,
      );
      expect(normalized, file).toMatch(
        /Only an authenticated valid terminal status[^.]{0,160}matching valid terminal frame[^.]{0,120}clean pipe close[^.]{0,80}(?:permit|cleanup)/iu,
      );
    }

    for (const retiredPositiveContract of [
      "FYAHHTTP",
      "exclusive numeric-loopback source",
      "one-operation HTTP source",
      "HTTP/1.1 `HEAD`/`GET`",
      "WinSock",
      "SO_EXCLUSIVEADDRUSE",
      "http://127.0.0.1",
    ]) {
      expect(bridgeAuthority, retiredPositiveContract).not.toContain(
        retiredPositiveContract,
      );
    }

    expect(installer).toContain(PACKAGE_BRIDGE_ROOT);
    expect(installer).toMatch(
      /NSIS[^\n.]{0,160}(?:does not|never)[^\n.]{0,120}(?:own|enumerate|repair|remove)[^\n.]{0,120}(?:PackageBridge|package bridge)/iu,
    );
    expect(installer).toMatch(
      /(?:application|bridge module)[^\n.]{0,120}(?:owns|owns both)[^\n.]{0,120}(?:cleanup|orphan)/iu,
    );
    expect(installer).toMatch(/%ProgramData%\\FyAgent\\runtime/iu);
    expect(installer).toMatch(
      /(?:separate|distinct|independent)[^\n.]{0,120}(?:PackageBridge|package bridge)[^\n.]{0,160}(?:retired|legacy)[^\n.]{0,80}runtime/iu,
    );
  });

  it("marks the v0.3.1 notes as an unpublished preflight candidate with a historical tag mismatch", () => {
    const notes = read(V031_RELEASE_NOTES);
    expect(notes).toContain("# FyAgent v0.3.1 candidate (unpublished)");
    expect(notes).toMatch(
      /existing annotated `v0\.3\.1` tag[^.]{0,120}(?:different historical SHA|historical SHA that differs)/iu,
    );
    expect(notes).toMatch(/must not move or reuse it/iu);
    expect(notes).toMatch(
      /(?:current work|current batch)[^.]{0,120}(?:not the formal source|cannot be its formal source)[^.]{0,120}cannot (?:formally )?publish/iu,
    );
    expect(notes).toMatch(
      /future[^.]{0,80}independent version\/tag decision/iu,
    );
    expect(notes).toMatch(/same-SHA[^.]{0,80}non-publishing preflight/iu);
    expect(notes).not.toContain("The formal source is the exact `v0.3.1`");
    expect(notes).not.toMatch(/^\d+\. annotated `v0\.3\.1` tag equality/mu);
  });

  it("keeps maintained knowledge free of old package and fixed-release routing", () => {
    for (const file of maintainedKnowledgeMarkdownFiles()) {
      const source = read(file);
      expect(source, file).not.toContain("docs/fyagent/dev/");
      if (file === "docs/fyagent/development/windows/installer.md") {
        expect(source.match(/\bv?0\.3\.0\b/gu), file).toHaveLength(1);
      } else {
        expect(source, file).not.toMatch(/\bv?0\.3\.0\b/u);
      }
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
