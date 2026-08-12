#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { TextDecoder } from "node:util";
import { ROOT, fail, isMain } from "./lib.mjs";

const combine = (...parts) => parts.join("");
const whole = (value, flags = "iu") =>
  new RegExp(
    `(?:^|[^A-Za-z0-9_])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Za-z0-9_])`,
    flags,
  );
const contains = (value, flags = "iu") =>
  new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);

export const SURFACE_MARKERS = Object.freeze({
  kernel: combine("lin", "ux"),
  subsystem: combine("w", "sl"),
  runnerFamily: combine("ubu", "ntu"),
  distributions: Object.freeze([
    combine("de", "bian"),
    combine("fe", "dora"),
    combine("cent", "os"),
    combine("rh", "el"),
    combine("red", " hat"),
    combine("open", "suse"),
    combine("al", "pine"),
    combine("nix", "os"),
  ]),
  imagePackage: combine("app", "image"),
  sandboxPackage: combine("flat", "pak"),
  sandboxCatalog: combine("flat", "hub"),
  archivePackage: combine("d", "eb"),
  nativePackage: combine("r", "pm"),
  displayToolkit: combine("g", "tk"),
  embeddedToolkit: combine("webkit2", "g", "tk"),
  windowProtocol: combine("x", "11"),
  compositorProtocol: combine("way", "land"),
  directoryConvention: combine("x", "dg"),
  objectFormat: combine("e", "lf"),
  serviceManager: combine("sys", "temd"),
  messageBus: combine("d", "bus"),
  packageCommands: Object.freeze([
    combine("a", "pt"),
    combine("a", "pt", "-get"),
    combine("d", "pkg"),
    combine("y", "um"),
    combine("d", "nf"),
    combine("pac", "man"),
    combine("zyp", "per"),
  ]),
  broadRustFamily: combine("un", "ix"),
  displayEnvironment: combine("DIS", "PLAY"),
  packageAddCommand: combine("a", "pk"),
  sandboxInstallCommand: combine("sn", "ap"),
});

const CONTENT_RULES = Object.freeze([
  {
    id: "retired-kernel",
    pattern: contains(SURFACE_MARKERS.kernel),
  },
  {
    id: "subsystem-bridge",
    pattern: contains(SURFACE_MARKERS.subsystem),
  },
  {
    id: "runner-family",
    pattern: contains(SURFACE_MARKERS.runnerFamily),
  },
  ...SURFACE_MARKERS.distributions.map((value) => ({
    id: "distribution-family",
    pattern: whole(value),
  })),
  {
    id: "image-package",
    pattern: contains(SURFACE_MARKERS.imagePackage),
  },
  {
    id: "sandbox-package",
    pattern: contains(SURFACE_MARKERS.sandboxPackage),
  },
  {
    id: "sandbox-catalog",
    pattern: contains(SURFACE_MARKERS.sandboxCatalog),
  },
  {
    id: "archive-package",
    pattern: whole(SURFACE_MARKERS.archivePackage),
  },
  {
    id: "native-package",
    pattern: whole(SURFACE_MARKERS.nativePackage),
  },
  {
    id: "display-toolkit",
    pattern: contains(SURFACE_MARKERS.displayToolkit),
  },
  {
    id: "embedded-display-toolkit",
    pattern: contains(SURFACE_MARKERS.embeddedToolkit),
  },
  {
    id: "window-protocol",
    pattern: whole(SURFACE_MARKERS.windowProtocol),
  },
  {
    id: "compositor-protocol",
    pattern: contains(SURFACE_MARKERS.compositorProtocol),
  },
  {
    id: "directory-convention",
    pattern: contains(SURFACE_MARKERS.directoryConvention),
  },
  {
    id: "native-object-format",
    pattern: whole(SURFACE_MARKERS.objectFormat),
  },
  {
    id: "service-manager",
    pattern: whole(SURFACE_MARKERS.serviceManager),
  },
  {
    id: "message-bus",
    pattern: new RegExp(
      `(?:${SURFACE_MARKERS.messageBus}|${combine("d", "-bus")})`,
      "iu",
    ),
  },
  {
    id: "display-environment",
    pattern: new RegExp(
      `(?:["']${SURFACE_MARKERS.displayEnvironment}["']|(?:^|[^A-Za-z0-9_])${SURFACE_MARKERS.displayEnvironment}\\s*=)`,
      "u",
    ),
  },
  {
    id: "kernel-version-probe",
    pattern: /\/proc[\\/]version/iu,
  },
  {
    id: "host-release-probe",
    pattern: /\/etc[\\/]os-release/iu,
  },
  {
    id: "subsystem-mount-path",
    pattern: /\/mnt[\\/][A-Za-z](?:[\\/]|$)/u,
  },
  {
    id: "retired-home-layout",
    pattern: /\/home(?:[\\/]|$)/iu,
  },
  {
    id: "desktop-entry-shape",
    pattern: /\[Desktop Entry\]/iu,
  },
  {
    id: "open-bundle-target",
    pattern: /["']targets["']\s*:\s*["']all["']/iu,
  },
  {
    id: "negative-host-branch",
    pattern: /(?:process\.)?platform\s*!==?\s*["']win32["']/u,
  },
  {
    id: "negative-host-helper",
    pattern: /!\s*isWindows\s*\(/u,
  },
  ...SURFACE_MARKERS.packageCommands.map((value) => ({
    id: "package-command",
    pattern: whole(value),
  })),
  {
    id: "package-command",
    pattern: /(?:^|[^A-Za-z0-9_])apk\s+add(?:$|[^A-Za-z0-9_])/iu,
  },
  {
    id: "package-command",
    pattern: /(?:^|[^A-Za-z0-9_])snap\s+install(?:$|[^A-Za-z0-9_])/iu,
  },
]);

const PATH_RULES = Object.freeze(
  CONTENT_RULES.filter(
    ({ id }) =>
      ![
        "display-environment",
        "kernel-version-probe",
        "host-release-probe",
        "subsystem-mount-path",
        "retired-home-layout",
        "desktop-entry-shape",
        "open-bundle-target",
        "negative-host-branch",
        "negative-host-helper",
        "package-command",
      ].includes(id),
  ),
);

const ARCHIVE_PREFIX = ".trellis/tasks/archive/";
const TEXT_EXCLUSIONS = new Set(["pnpm-lock.yaml", "src-tauri/Cargo.lock"]);

export const EXPECTED_ACTIVE_TASK = [
  ".trellis",
  "tasks",
  ["08", "12", "remove", SURFACE_MARKERS.kernel, "support"].join("-"),
].join("/");

const ACTIVE_TASK_ID = ["remove", SURFACE_MARKERS.kernel, "support"].join("-");
const UNSUPPORTED_CFG =
  '#[cfg(not(any(target_os = "windows", target_os = "macos")))]';
const TESTABLE_UNSUPPORTED_CFG =
  '#[cfg(any(not(any(target_os = "windows", target_os = "macos")), test))]';

export const RUST_ALLOWANCE_CONTRACT = Object.freeze([
  Object.freeze({
    id: "crate-rejection",
    file: "src-tauri/src/lib.rs",
    condition: UNSUPPORTED_CFG,
    next: 'compile_error!("FyAgent desktop supports only Windows and macOS.");',
  }),
  Object.freeze({
    id: "runtime-path-import",
    file: "src-tauri/src/codex_desktop_runtime.rs",
    condition: UNSUPPORTED_CFG,
    next: "use std::path::Path;",
  }),
  Object.freeze({
    id: "runtime-adapter-import",
    file: "src-tauri/src/codex_desktop_runtime.rs",
    condition: UNSUPPORTED_CFG,
    next: "use crate::codex_desktop::{",
  }),
  Object.freeze({
    id: "runtime-probe-declaration",
    file: "src-tauri/src/codex_desktop_runtime.rs",
    condition: UNSUPPORTED_CFG,
    next: "#[derive(Debug, Default)]",
  }),
  Object.freeze({
    id: "runtime-probe-implementation",
    file: "src-tauri/src/codex_desktop_runtime.rs",
    condition: UNSUPPORTED_CFG,
    next: "impl DiskSpaceProbe for UnavailableDiskSpaceProbe {",
  }),
  Object.freeze({
    id: "runtime-dependency-rejection",
    file: "src-tauri/src/codex_desktop_runtime.rs",
    condition: UNSUPPORTED_CFG,
    next: "fn production_platform_dependencies() ->",
    nextPrefix: true,
  }),
  Object.freeze({
    id: "adapter-declaration",
    file: "src-tauri/src/codex_desktop/platform.rs",
    condition: TESTABLE_UNSUPPORTED_CFG,
    next: "#[derive(Debug, Clone)]",
  }),
  Object.freeze({
    id: "adapter-constructor",
    file: "src-tauri/src/codex_desktop/platform.rs",
    condition: TESTABLE_UNSUPPORTED_CFG,
    next: "impl UnsupportedPlatformAdapter {",
  }),
  Object.freeze({
    id: "adapter-implementation",
    file: "src-tauri/src/codex_desktop/platform.rs",
    condition: TESTABLE_UNSUPPORTED_CFG,
    next: "impl CodexDesktopPlatform for UnsupportedPlatformAdapter {",
  }),
]);

function normalizeRepositoryPath(value) {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.includes("\0") ||
    value.includes("\\") ||
    path.posix.isAbsolute(value)
  ) {
    throw new Error(`Invalid repository path: ${String(value)}`);
  }
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value ||
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(`Non-canonical repository path: ${value}`);
  }
  return value;
}

function isArchivePath(relativePath) {
  return relativePath.startsWith(ARCHIVE_PREFIX);
}

export function validateActiveTaskExclusion(
  value,
  { root = ROOT, io = fs } = {},
) {
  if (value !== EXPECTED_ACTIVE_TASK) {
    throw new Error(
      `The temporary exclusion must be exactly ${EXPECTED_ACTIVE_TASK}`,
    );
  }
  normalizeRepositoryPath(value);

  const taskRoot = path.join(root, ".trellis", "tasks");
  const taskDirectory = path.join(root, ...value.split("/"));
  const taskStat = io.lstatSync(taskDirectory);
  if (!taskStat.isDirectory() || taskStat.isSymbolicLink()) {
    throw new Error("The temporary exclusion must name a real task directory");
  }

  const realTaskRoot = io.realpathSync(taskRoot);
  const realTaskDirectory = io.realpathSync(taskDirectory);
  const relative = path.relative(realTaskRoot, realTaskDirectory);
  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative) ||
    relative.split(path.sep).length !== 1
  ) {
    throw new Error("The temporary exclusion escaped the active task root");
  }

  const metadataPath = path.join(taskDirectory, "task.json");
  const metadataStat = io.lstatSync(metadataPath);
  if (!metadataStat.isFile() || metadataStat.isSymbolicLink()) {
    throw new Error("The temporary exclusion has no regular task metadata");
  }
  const metadata = JSON.parse(io.readFileSync(metadataPath, "utf8"));
  if (
    metadata.id !== ACTIVE_TASK_ID ||
    metadata.name !== ACTIVE_TASK_ID ||
    metadata.status !== "in_progress"
  ) {
    throw new Error("The temporary exclusion is not the exact active task");
  }
  return value;
}

export function parseArguments(argv, environment = process.env) {
  let direct;
  if (argv.length > 0) {
    if (argv.length !== 2 || argv[0] !== "--exclude-active-task") {
      throw new Error(
        "Usage: supported-platform-check.mjs [--exclude-active-task <path>]",
      );
    }
    direct = argv[1];
  }

  const fromTask = environment.usage_exclude_active_task || undefined;
  if (direct && fromTask) {
    throw new Error("The temporary exclusion was provided through two inputs");
  }
  return direct ?? fromTask;
}

export function isExcludedPath(relativePath, activeTask) {
  normalizeRepositoryPath(relativePath);
  return (
    isArchivePath(relativePath) ||
    (activeTask !== undefined &&
      (relativePath === activeTask ||
        relativePath.startsWith(`${activeTask}/`)))
  );
}

export function isTextExcludedPath(relativePath) {
  normalizeRepositoryPath(relativePath);
  return TEXT_EXCLUSIONS.has(relativePath);
}

function stripOpaqueSvgPayload(source) {
  return source.replace(
    /(data:[^"']*?;base64,)[A-Za-z0-9+/=\r\n]+/giu,
    "$1[payload]",
  );
}

function textFromBuffer(buffer) {
  if (buffer.includes(0)) return undefined;
  return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
}

function finding(relativePath, line, rule, excerpt) {
  return {
    path: relativePath,
    line,
    rule,
    excerpt: excerpt.trim().slice(0, 240),
  };
}

export function scanPath(relativePath) {
  normalizeRepositoryPath(relativePath);
  const findings = [];
  for (const rule of PATH_RULES) {
    if (rule.pattern.test(relativePath)) {
      findings.push(finding(relativePath, 0, `path:${rule.id}`, relativePath));
    }
  }
  return findings;
}

export function scanText(relativePath, source) {
  normalizeRepositoryPath(relativePath);
  const inspected = relativePath.toLowerCase().endsWith(".svg")
    ? stripOpaqueSvgPayload(source)
    : source;
  const findings = [];
  for (const [index, line] of inspected.split(/\r?\n/u).entries()) {
    for (const rule of CONTENT_RULES) {
      if (rule.pattern.test(line)) {
        findings.push(finding(relativePath, index + 1, rule.id, line));
      }
    }
  }
  return findings;
}

function nextNonblank(lines, index) {
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const value = lines[cursor].trim();
    if (value !== "") return value;
  }
  return "";
}

function isImplicitRustCondition(attribute) {
  if (!/#\s*\[\s*cfg(?:_attr)?\s*\(/u.test(attribute)) return false;
  if (whole(SURFACE_MARKERS.broadRustFamily).test(attribute)) return true;
  const compact = attribute.replace(/\s+/gu, "");
  if (/not\((?:windows|target_os=["']windows["'])\)/u.test(compact)) {
    return true;
  }
  return /not\(any\((?=[^)]*(?:windows|target_os=["']windows["']))(?=[^)]*(?:macos|target_os=["']macos["']))[^)]*\)\)/u.test(
    compact,
  );
}

function rustAttributeAt(lines, index) {
  const first = lines[index];
  if (!/#\s*\[\s*cfg(?:_attr)?\s*\(/u.test(first)) return undefined;
  const collected = [];
  let squareBalance = 0;
  for (let cursor = index; cursor < lines.length; cursor += 1) {
    const line = lines[cursor];
    collected.push(line.trim());
    squareBalance += (line.match(/\[/gu) ?? []).length;
    squareBalance -= (line.match(/\]/gu) ?? []).length;
    if (squareBalance === 0) return collected.join(" ");
  }
  return collected.join(" ");
}

export function scanRustImplicitPredicates(entries) {
  const findings = [];
  const seen = new Set();

  for (const entry of entries) {
    if (!entry.path.endsWith(".rs")) continue;
    const lines = entry.source.split(/\r?\n/u);
    for (const [index, original] of lines.entries()) {
      const attribute = rustAttributeAt(lines, index);
      if (!attribute || !isImplicitRustCondition(attribute)) continue;
      const adjacent = nextNonblank(lines, index);
      const allowance = RUST_ALLOWANCE_CONTRACT.find(
        (candidate) =>
          !seen.has(candidate.id) &&
          candidate.file === entry.path &&
          candidate.condition === attribute &&
          (candidate.nextPrefix
            ? adjacent.startsWith(candidate.next)
            : adjacent === candidate.next),
      );
      if (allowance) {
        seen.add(allowance.id);
      } else {
        findings.push(
          finding(entry.path, index + 1, "rust:implicit-target", attribute),
        );
      }
    }
  }

  for (const allowance of RUST_ALLOWANCE_CONTRACT) {
    if (!seen.has(allowance.id)) {
      findings.push(
        finding(allowance.file, 0, "rust:allowance-drift", allowance.id),
      );
    }
  }
  return findings;
}

export function listCurrentFiles(root = ROOT, runner = spawnSync) {
  const result = runner(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: root,
      encoding: null,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Unable to enumerate repository files (status ${String(result.status)})`,
    );
  }
  if (!Buffer.isBuffer(result.stdout)) {
    throw new Error("Repository file enumeration returned an invalid payload");
  }
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
    result.stdout,
  );
  const files = decoded
    .split("\0")
    .filter(Boolean)
    .map(normalizeRepositoryPath);
  if (new Set(files).size !== files.length) {
    throw new Error("Repository file enumeration returned duplicate paths");
  }
  return files.sort((left, right) => left.localeCompare(right, "en"));
}

export function readCurrentEntry(root, relativePath, io = fs) {
  const absolute = path.join(
    root,
    ...normalizeRepositoryPath(relativePath).split("/"),
  );
  let stat;
  try {
    stat = io.lstatSync(absolute);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }

  if (stat.isSymbolicLink()) {
    return { path: relativePath, source: io.readlinkSync(absolute, "utf8") };
  }
  if (!stat.isFile()) {
    throw new Error(`Tracked path is not a regular file: ${relativePath}`);
  }
  const buffer = io.readFileSync(absolute);
  const source = textFromBuffer(buffer);
  return { path: relativePath, source };
}

export function inspectRepository({
  root = ROOT,
  activeTask,
  runner = spawnSync,
  io = fs,
} = {}) {
  const excludedTask = activeTask
    ? validateActiveTaskExclusion(activeTask, { root, io })
    : undefined;
  const currentPaths = listCurrentFiles(root, runner);
  const findings = [];
  const rustEntries = [];
  let inspectedFiles = 0;

  for (const relativePath of currentPaths) {
    if (isExcludedPath(relativePath, excludedTask)) continue;
    const entry = readCurrentEntry(root, relativePath, io);
    if (!entry) continue;
    inspectedFiles += 1;
    findings.push(...scanPath(relativePath));
    if (entry.source === undefined || isTextExcludedPath(relativePath)) {
      continue;
    }
    findings.push(...scanText(relativePath, entry.source));
    if (relativePath.endsWith(".rs")) rustEntries.push(entry);
  }
  findings.push(...scanRustImplicitPredicates(rustEntries));
  findings.sort(
    (left, right) =>
      left.path.localeCompare(right.path, "en") ||
      left.line - right.line ||
      left.rule.localeCompare(right.rule, "en"),
  );
  return { findings, inspectedFiles };
}

function main() {
  const activeTask = parseArguments(process.argv.slice(2));
  const report = inspectRepository({ activeTask });
  if (report.findings.length > 0) {
    for (const item of report.findings) {
      const location = item.line > 0 ? `${item.path}:${item.line}` : item.path;
      console.error(`${location} [${item.rule}] ${item.excerpt}`);
    }
    throw new Error(
      `Supported platform surface check found ${report.findings.length} issue(s)`,
    );
  }
  console.log(
    `Supported platform surface check passed (${report.inspectedFiles} current files).`,
  );
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    fail(error);
  }
}
