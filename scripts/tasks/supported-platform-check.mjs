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
    id: "reversed-negative-host-branch",
    pattern: /["']win32["']\s*!==?\s*(?:process\.)?platform/u,
  },
  {
    id: "negative-host-helper",
    pattern: /!\s*isWindows\s*\(/u,
  },
  {
    id: "negative-host-helper",
    pattern:
      /(?:isWindows\s*\([^)]*\)\s*={2,3}\s*false|false\s*={2,3}\s*isWindows\s*\([^)]*\))/u,
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
        "reversed-negative-host-branch",
        "negative-host-helper",
        "package-command",
      ].includes(id),
  ),
);

const ARCHIVE_PREFIX = ".trellis/tasks/archive/";
const TEXT_EXCLUSIONS = new Set(["pnpm-lock.yaml", "src-tauri/Cargo.lock"]);
export const ACTIVE_TASK_ENV = "FYAGENT_SUPPORTED_PLATFORM_ACTIVE_TASK";

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

const DATA_HOME_VARIABLE = `${SURFACE_MARKERS.directoryConvention.toUpperCase()}_DATA_HOME`;
const BIN_DIRECTORY_VARIABLE = `${SURFACE_MARKERS.directoryConvention.toUpperCase()}_BIN_DIR`;
export const MACOS_POSIX_CONTRACT = Object.freeze([
  Object.freeze({
    id: "data-home-declaration",
    file: "src-tauri/src/opencode_config.rs",
    snippet: `#[cfg(any(target_os = "macos", test))]\npub(crate) const OPENCODE_DATA_HOME_ENV: &str = "${DATA_HOME_VARIABLE}";`,
  }),
  Object.freeze({
    id: "data-home-macos-read",
    file: "src-tauri/src/opencode_config.rs",
    snippet:
      '#[cfg(target_os = "macos")]\npub(crate) fn get_opencode_data_dir() -> PathBuf {\n    resolve_opencode_data_dir(\n        &crate::config::get_home_dir(),\n        std::env::var_os(OPENCODE_DATA_HOME_ENV).as_deref(),',
  }),
  Object.freeze({
    id: "data-home-windows-ignore",
    file: "src-tauri/src/opencode_config.rs",
    snippet:
      '#[cfg(target_os = "windows")]\npub(crate) fn get_opencode_data_dir() -> PathBuf {\n    resolve_opencode_data_dir(&crate::config::get_home_dir(), None)',
  }),
  Object.freeze({
    id: "session-data-resolver",
    file: "src-tauri/src/session_manager/providers/opencode.rs",
    snippet: "crate::opencode_config::get_opencode_data_dir()",
  }),
  Object.freeze({
    id: "session-scan-db-resolver",
    file: "src-tauri/src/session_manager/providers/opencode.rs",
    snippet: "let db_path = crate::opencode_config::get_opencode_db_path();",
  }),
  Object.freeze({
    id: "session-delete-db-resolver",
    file: "src-tauri/src/session_manager/providers/opencode.rs",
    snippet: "&crate::opencode_config::get_opencode_db_path(),",
  }),
  Object.freeze({
    id: "usage-db-resolver",
    file: "src-tauri/src/services/session_usage_opencode.rs",
    snippet: "use crate::opencode_config::get_opencode_db_path;",
  }),
  Object.freeze({
    id: "cli-bin-macos-read",
    file: "src-tauri/src/commands/misc.rs",
    snippet: `#[cfg(target_os = "macos")]\n        let ambient_paths = (\n            std::env::var_os("OPENCODE_INSTALL_DIR"),\n            std::env::var_os("${BIN_DIRECTORY_VARIABLE}"),\n            std::env::var_os("GOPATH"),\n        );`,
  }),
  Object.freeze({
    id: "cli-bin-windows-ignore",
    file: "src-tauri/src/commands/misc.rs",
    snippet:
      '#[cfg(target_os = "windows")]\n        let ambient_paths = (None, None, None);',
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
  {
    root = ROOT,
    io = fs,
    sessionResolver = resolveAuthoritativeActiveTask,
    runner = spawnSync,
  } = {},
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
  const authoritative = sessionResolver(root, runner);
  if (authoritative !== value) {
    throw new Error(
      "The temporary exclusion does not match the current session task",
    );
  }
  return value;
}

export function resolveAuthoritativeActiveTask(
  root = ROOT,
  runner = spawnSync,
) {
  const result = runner(
    "python",
    [".trellis/scripts/task.py", "current", "--source", "--json"],
    { cwd: root, encoding: "utf8", windowsHide: true },
  );
  if (result.error) throw result.error;
  if (result.status !== 0 || typeof result.stdout !== "string") {
    throw new Error("The current session has no active-task pointer");
  }
  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch {
    throw new Error("The active-task command returned invalid JSON");
  }
  if (
    payload === null ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.stale !== false ||
    payload.current_task === null ||
    typeof payload.current_task !== "object" ||
    Array.isArray(payload.current_task) ||
    typeof payload.current_task.dir !== "string" ||
    typeof payload.source !== "string" ||
    !/^session:[A-Za-z0-9._-]+$/u.test(payload.source)
  ) {
    throw new Error(
      "The temporary exclusion is not directly active in the current session",
    );
  }
  return payload.current_task.dir;
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

  const optionalEnvironmentValue = (name) => {
    if (!Object.hasOwn(environment, name)) return undefined;
    const value = environment[name];
    if (typeof value !== "string" || value === "") {
      throw new Error(`${name} must be a non-empty string when provided`);
    }
    return value;
  };
  const fromTask = optionalEnvironmentValue("usage_exclude_active_task");
  const fromLeaf = optionalEnvironmentValue(ACTIVE_TASK_ENV);
  const provided = [direct, fromTask, fromLeaf].filter(
    (value) => value !== undefined,
  );
  if (provided.length > 1) {
    throw new Error(
      "The temporary exclusion was provided through multiple inputs",
    );
  }
  return direct ?? fromTask ?? fromLeaf;
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

const OPAQUE_BINARY_EXTENSIONS = new Set([
  ".icns",
  ".ico",
  ".jpg",
  ".png",
  ".webp",
]);

function isKnownOpaqueBinary(relativePath, buffer) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (!OPAQUE_BINARY_EXTENSIONS.has(extension)) return false;
  const startsWith = (...bytes) =>
    bytes.every((value, index) => buffer[index] === value);
  return (
    startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a) ||
    startsWith(0xff, 0xd8, 0xff) ||
    (buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP") ||
    startsWith(0x00, 0x00, 0x01, 0x00) ||
    buffer.subarray(0, 4).toString("ascii") === "icns"
  );
}

function textFromBuffer(buffer, relativePath) {
  let source;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    source = new TextDecoder("utf-16le", { fatal: true }).decode(
      buffer.subarray(2),
    );
  } else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    source = new TextDecoder("utf-16be", { fatal: true }).decode(
      buffer.subarray(2),
    );
  } else {
    const payload =
      buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
        ? buffer.subarray(3)
        : buffer;
    if (payload.includes(0)) {
      throw new Error(
        `NUL-containing text requires a supported byte-order mark: ${relativePath}`,
      );
    }
    source = new TextDecoder("utf-8", { fatal: true }).decode(payload);
  }
  if (source.includes("\0")) {
    throw new Error(`Decoded text contains NUL: ${relativePath}`);
  }
  return source;
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

export function validateArchiveEntry(root, relativePath, io = fs) {
  normalizeRepositoryPath(relativePath);
  if (!isArchivePath(relativePath)) {
    throw new Error("Archive validation requires an archive path");
  }
  const remainder = relativePath.slice(ARCHIVE_PREFIX.length);
  const parts = remainder.split("/");
  const payload = parts.slice(2);
  const fileName = payload.at(-1) ?? "";
  const validLocation =
    /^\d{4}-\d{2}$/u.test(parts[0] ?? "") &&
    /^\d{2}(?:-\d{2})?-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(parts[1] ?? "") &&
    (payload.length === 1 ||
      (payload.length === 2 && payload[0] === "research"));
  const extension = path.posix.extname(fileName).toLowerCase();
  const validDocument =
    extension === ".md" ||
    (extension === ".json" && fileName === "task.json") ||
    (extension === ".jsonl" &&
      (fileName === "check.jsonl" || fileName === "implement.jsonl"));
  if (!validLocation || !validDocument) {
    throw new Error(
      `Archive payload is not a standard task document: ${relativePath}`,
    );
  }
  const absolute = path.join(root, ...relativePath.split("/"));
  const stat = io.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Archive payload must be a regular file: ${relativePath}`);
  }
  if ((stat.mode & 0o111) !== 0) {
    throw new Error(`Archive payload must not be executable: ${relativePath}`);
  }
  // The canonical archive identity and historical document names are part of
  // the user-approved historical exclusion. Structure, file type, symlink,
  // and executable checks above keep the prefix from becoming an opaque
  // runtime payload area without rewriting or rejecting historical names.
  return [];
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
  if (/not\((?:macos|target_os=["']macos["'])\)/u.test(compact)) {
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

export function scanMacosPosixContract(entries) {
  const findings = [];
  for (const contract of MACOS_POSIX_CONTRACT) {
    const entry = entries.find(
      ({ path: entryPath }) => entryPath === contract.file,
    );
    const count = entry ? entry.source.split(contract.snippet).length - 1 : 0;
    if (count !== 1) {
      findings.push(
        finding(contract.file, 0, "macos-posix:contract-drift", contract.id),
      );
    }
  }
  return findings;
}

function javascriptSource(relativePath) {
  return /\.(?:c|m)?js(?:x)?$|\.tsx?$/iu.test(relativePath);
}

export function scanJavaScriptImplicitPredicates(entries) {
  const findings = [];
  for (const entry of entries) {
    if (!javascriptSource(entry.path)) continue;
    const source = entry.source;
    const positiveWindows =
      /\bif\s*\(\s*(?:(?:process\.)?platform\s*={2,3}\s*["']win32["']|["']win32["']\s*={2,3}\s*(?:process\.)?platform|isWindows\s*\([^)]*\))\s*\)/gu;
    for (const match of source.matchAll(positiveWindows)) {
      const tail = source.slice(match.index, match.index + 1200);
      const branchContext = source.slice(
        Math.max(0, match.index - 1200),
        match.index + 1200,
      );
      const hasMacBranch =
        /(?:isMac\s*\(|(?:process\.)?platform\s*={2,3}\s*["']darwin["']|["']darwin["']\s*={2,3}\s*(?:process\.)?platform)/u.test(
          branchContext,
        );
      if (
        !hasMacBranch &&
        /(?:\}\s*else\b|\}\s*(?:return|const|let|var)\b)/u.test(tail)
      ) {
        const line = source.slice(0, match.index).split(/\r?\n/u).length;
        findings.push(
          finding(entry.path, line, "js:implicit-target", match[0]),
        );
      }
    }

    const switches = source.matchAll(
      /\bswitch\s*\([^)]*(?:process\.)?platform[^)]*\)\s*\{([\s\S]{0,3000}?)\n?\}/gu,
    );
    for (const match of switches) {
      const body = match[1];
      if (
        /case\s+["']win32["']/u.test(body) &&
        !/case\s+["']darwin["']/u.test(body) &&
        /\bdefault\s*:/u.test(body) &&
        !/\bdefault\s*:[\s\S]*?\bthrow\b/u.test(body)
      ) {
        const line = source.slice(0, match.index).split(/\r?\n/u).length;
        findings.push(
          finding(entry.path, line, "js:implicit-target", "switch default"),
        );
      }
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
  const source = isKnownOpaqueBinary(relativePath, buffer)
    ? undefined
    : textFromBuffer(buffer, relativePath);
  return { path: relativePath, source };
}

export function inspectRepository({
  root = ROOT,
  activeTask,
  runner = spawnSync,
  io = fs,
  sessionResolver = resolveAuthoritativeActiveTask,
} = {}) {
  const excludedTask = activeTask
    ? validateActiveTaskExclusion(activeTask, {
        root,
        io,
        runner,
        sessionResolver,
      })
    : undefined;
  const currentPaths = listCurrentFiles(root, runner);
  const findings = [];
  const rustEntries = [];
  const javascriptEntries = [];
  let inspectedFiles = 0;

  for (const relativePath of currentPaths) {
    if (isArchivePath(relativePath)) {
      inspectedFiles += 1;
      findings.push(...validateArchiveEntry(root, relativePath, io));
      continue;
    }
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
    if (javascriptSource(relativePath)) javascriptEntries.push(entry);
  }
  findings.push(...scanRustImplicitPredicates(rustEntries));
  findings.push(...scanMacosPosixContract(rustEntries));
  findings.push(...scanJavaScriptImplicitPredicates(javascriptEntries));
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
