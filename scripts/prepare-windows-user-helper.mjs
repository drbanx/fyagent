#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TAURI_DIR = path.join(ROOT, "src-tauri");
const HELPER_DIR = path.join(TAURI_DIR, "user-helper");
const SUPPORTED_TARGETS = new Set([
  "x86_64-pc-windows-msvc",
  "aarch64-pc-windows-msvc",
]);

function fail(message) {
  process.stderr.write(`prepare-windows-user-helper: ${message}\n`);
  process.exit(1);
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    fail(`${name} must be supplied by trusted Windows build orchestration`);
  }
  return value;
}

function checkedDesktopVersion() {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "version.mjs"), "check"],
    {
      cwd: ROOT,
      env: process.env,
      encoding: "utf8",
      shell: false,
    },
  );
  if (result.error) {
    fail(`version contract check could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(
      `version contract check exited with status ${result.status ?? "unknown"}`,
    );
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
    fail("version contract check emitted unexpected stderr");
  }

  const match =
    /^FyAgent version contract OK: ((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))\r?\n$/u.exec(
      result.stdout,
    );
  if (!match) {
    fail("version contract check emitted unexpected stdout");
  }
  return match[1];
}

const target = requiredEnvironment("TAURI_ENV_TARGET_TRIPLE");
if (!SUPPORTED_TARGETS.has(target)) {
  fail(`unsupported target ${JSON.stringify(target)}`);
}

const desktopVersion = checkedDesktopVersion();

const debug = process.env.TAURI_ENV_DEBUG === "true";
const profile = debug ? "debug" : "release";
const targetDirectory = path.join(HELPER_DIR, "target");
const cargoArguments = [
  "build",
  "--manifest-path",
  path.join(HELPER_DIR, "Cargo.toml"),
  "--locked",
  "--features",
  "helper-runtime",
  "--bin",
  "fyagent-user-helper",
  "--target",
  target,
  "--target-dir",
  targetDirectory,
];
if (!debug) {
  cargoArguments.push("--release");
}

const result = spawnSync("cargo", cargoArguments, {
  cwd: ROOT,
  env: process.env,
  stdio: "inherit",
  shell: false,
});
if (result.error) {
  fail(`cargo could not start: ${result.error.message}`);
}
if (result.status !== 0) {
  fail(`cargo exited with status ${result.status ?? "unknown"}`);
}

const source = path.join(
  targetDirectory,
  target,
  profile,
  "fyagent-user-helper.exe",
);
let sourceMetadata;
try {
  sourceMetadata = fs.statSync(source, { throwIfNoEntry: true });
} catch {
  fail("cargo did not produce the expected helper executable");
}
if (!sourceMetadata.isFile() || sourceMetadata.size === 0) {
  fail("the built helper executable is not a non-empty regular file");
}

const binaries = path.join(TAURI_DIR, "binaries");
fs.mkdirSync(binaries, { recursive: true });
const destination = path.join(binaries, `fyagent-user-helper-${target}.exe`);
const temporary = `${destination}.part`;
fs.rmSync(temporary, { force: true });
fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL);
try {
  fs.renameSync(temporary, destination);
} catch (error) {
  if (error?.code !== "EEXIST" && error?.code !== "EPERM") {
    throw error;
  }
  fs.rmSync(destination, { force: true });
  fs.renameSync(temporary, destination);
}

process.stdout.write(
  `prepared fyagent-user-helper ${desktopVersion} for ${target} (${profile})\n`,
);
