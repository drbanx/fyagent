#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const PYTHON_VERSION = "3.14.7";
const HOOK_TIMEOUT_MS = 12_000;
const REVIEWED_PYTHON_RUNTIME = Object.freeze({
  ".trellis/scripts/common/__init__.py":
    "3d5e9347141f0296319a5beb29d69ae714c5a474b9078caeb3edd7c5f6562e22",
  ".trellis/scripts/common/active_task.py":
    "28a81f8828538fb70a15c88edd90eda9d685adbde8862f67f630bce5b27d9832",
  ".trellis/scripts/common/config.py":
    "8d2e5f8ccfcd5f622cd2af002aa761f3d3ffcc653182fefb2268afd102e77bca",
  ".trellis/scripts/common/paths.py":
    "05898ef136cc7c4d861b05fbf2b16d53ddd3e6f311a231d4fcfcb81bde7c45ee",
  ".trellis/scripts/common/trellis_config.py":
    "e282e897183e3ec2f4e6e56349431946e5f98c1c31d3eca4de7fc44e1383a7bf",
});
const ACTIVE_TASK_DEPENDENCIES = Object.freeze([
  ".trellis/scripts/common/__init__.py",
  ".trellis/scripts/common/active_task.py",
  ".trellis/scripts/common/paths.py",
]);
const HOOK_MODES = Object.freeze({
  "workflow-state": Object.freeze({
    dependencies: Object.freeze([
      ...ACTIVE_TASK_DEPENDENCIES,
      ".trellis/scripts/common/trellis_config.py",
    ]),
    eventName: "UserPromptSubmit",
    script: ".codex/hooks/inject-workflow-state.py",
    sha256: "916212b7c66cf09c543e73fc5d3446a8287a41d9a85ec5d7006372d2419570ce",
  }),
  "subagent-context": Object.freeze({
    dependencies: Object.freeze([
      ...ACTIVE_TASK_DEPENDENCIES,
      ".trellis/scripts/common/config.py",
    ]),
    eventName: "SubagentStart",
    script: ".codex/hooks/inject-subagent-context.py",
    sha256: "b5825c4b7f1e576337416b0d0ac4b85e0e8cf9a6678f32db1ffff7bf5cb7f31a",
  }),
});

const scriptPath = fileURLToPath(import.meta.url);

class HookContractError extends Error {}

function fail(message) {
  throw new HookContractError(message);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function findProjectRoot(startPath = process.cwd()) {
  let current = path.resolve(startPath);
  while (true) {
    if (isDirectory(path.join(current, ".trellis"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      fail("cannot find a Trellis project root from " + startPath);
    }
    current = parent;
  }
}

function readRequiredFile(projectRoot, relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    fail(
      relativePath +
        " is required: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  if (!stat.isFile()) {
    fail(relativePath + " must be a regular file");
  }
  const canonicalRoot = fs.realpathSync(projectRoot);
  const canonicalFile = fs.realpathSync(filePath);
  if (!isPathInsideProject(canonicalRoot, canonicalFile)) {
    fail(relativePath + " must resolve inside the FyAgent repository");
  }
  const content = fs.readFileSync(filePath);
  if (content.length === 0 || content.includes(0)) {
    fail(relativePath + " is empty or contains NUL bytes");
  }
  return { filePath, content, text: content.toString("utf8") };
}

function stripTomlComment(line) {
  let quote = null;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote !== null) {
      if (quote === '"' && character === "\\" && !escaped) {
        escaped = true;
        continue;
      }
      if (character === quote && !escaped) {
        quote = null;
      }
      escaped = false;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "#") {
      return line.slice(0, index);
    }
  }
  return line;
}

function parseTomlScopes(text, label) {
  const tables = new Map();
  const assignments = [];
  let scope = "";
  let arrayIndex = 0;

  for (const [zeroBasedLine, sourceLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = zeroBasedLine + 1;
    const line = stripTomlComment(sourceLine).trim();
    if (!line) {
      continue;
    }

    const arrayTable = line.match(/^\[\[([A-Za-z0-9_.-]+)\]\]$/);
    if (arrayTable) {
      arrayIndex += 1;
      scope = "[[" + arrayTable[1] + "]]#" + arrayIndex;
      continue;
    }
    const table = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (table) {
      scope = table[1];
      tables.set(scope, (tables.get(scope) ?? 0) + 1);
      continue;
    }
    if (line.startsWith("[")) {
      fail(label + " has a malformed table header on line " + lineNumber);
    }

    const assignment = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (assignment) {
      assignments.push({
        key: assignment[1],
        lineNumber,
        scope,
        value: assignment[2].trim(),
      });
    }
  }

  return { assignments, tables };
}

function requireTableOnce(document, table, label) {
  const count = document.tables.get(table) ?? 0;
  if (count !== 1) {
    fail(label + " must declare [" + table + "] exactly once; found " + count);
  }
}

function requireScopedValue(
  document,
  { scope, key, expected, label, exclusive = false },
) {
  const matches = document.assignments.filter(
    (assignment) => assignment.scope === scope && assignment.key === key,
  );
  if (matches.length !== 1) {
    const scopeLabel = scope ? "[" + scope + "]" : "the top level";
    fail(
      label +
        " must declare " +
        key +
        " exactly once in " +
        scopeLabel +
        "; found " +
        matches.length,
    );
  }
  if (matches[0].value !== expected) {
    fail(
      label +
        " " +
        key +
        " must be " +
        expected +
        "; found " +
        matches[0].value,
    );
  }
  if (exclusive) {
    const wrongScopes = document.assignments.filter(
      (assignment) => assignment.key === key && assignment.scope !== scope,
    );
    if (wrongScopes.length > 0) {
      fail(
        label +
          " " +
          key +
          " must not appear outside [" +
          scope +
          "]; found line " +
          wrongScopes[0].lineNumber,
      );
    }
  }
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function normalizedTextSha256(content) {
  return sha256(Buffer.from(content.toString("utf8").replace(/\r\n/g, "\n")));
}

function validateReviewedPythonRuntime(projectRoot, mode) {
  const contracts = mode ? [HOOK_MODES[mode]] : Object.values(HOOK_MODES);
  if (contracts.some((contract) => !contract)) {
    fail("unsupported hook mode " + JSON.stringify(mode));
  }

  const reviewedFiles = new Map();
  for (const contract of contracts) {
    reviewedFiles.set(contract.script, contract.sha256);
    for (const dependency of contract.dependencies) {
      reviewedFiles.set(dependency, REVIEWED_PYTHON_RUNTIME[dependency]);
    }
  }

  for (const [relativePath, expectedHash] of reviewedFiles) {
    const source = readRequiredFile(projectRoot, relativePath);
    const actualHash = normalizedTextSha256(source.content);
    if (actualHash !== expectedHash) {
      fail(
        relativePath +
          " integrity check failed; expected " +
          expectedHash +
          ", received " +
          actualHash,
      );
    }
  }
}

function validateProject(projectRoot, mode) {
  const pythonVersion = readRequiredFile(projectRoot, ".python-version");
  const versionLines = pythonVersion.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (versionLines.length !== 1 || versionLines[0] !== PYTHON_VERSION) {
    fail(".python-version must contain exactly " + PYTHON_VERSION);
  }

  const pyproject = readRequiredFile(projectRoot, "pyproject.toml");
  const pyprojectDocument = parseTomlScopes(pyproject.text, "pyproject.toml");
  requireTableOnce(pyprojectDocument, "project", "pyproject.toml");
  requireTableOnce(pyprojectDocument, "tool.uv", "pyproject.toml");
  requireScopedValue(pyprojectDocument, {
    scope: "project",
    key: "requires-python",
    expected: '">=3.14,<3.15"',
    label: "pyproject.toml",
    exclusive: true,
  });
  for (const [key, expected] of [
    ["package", "false"],
    ["python-preference", '"only-managed"'],
    ["python-downloads", '"automatic"'],
  ]) {
    requireScopedValue(pyprojectDocument, {
      scope: "tool.uv",
      key,
      expected,
      label: "pyproject.toml",
      exclusive: true,
    });
  }

  const uvLock = readRequiredFile(projectRoot, "uv.lock");
  const uvLockDocument = parseTomlScopes(uvLock.text, "uv.lock");
  for (const [key, expected] of [
    ["version", "1"],
    ["revision", "3"],
    ["requires-python", '"==3.14.*"'],
  ]) {
    requireScopedValue(uvLockDocument, {
      scope: "",
      key,
      expected,
      label: "uv.lock",
    });
  }

  validateReviewedPythonRuntime(projectRoot, mode);

  const venvRoot = path.join(projectRoot, ".venv");
  let venvStat;
  try {
    venvStat = fs.lstatSync(venvRoot);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { ready: false, reason: ".venv is missing" };
    }
    fail(
      ".venv cannot be inspected: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  if (venvStat.isSymbolicLink() || !venvStat.isDirectory()) {
    fail(".venv must be a repository-local directory, not a symlink");
  }
  const interpreter = path.join(
    venvRoot,
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
  const venvConfig = path.join(venvRoot, "pyvenv.cfg");
  if (!fs.existsSync(interpreter) || !fs.existsSync(venvConfig)) {
    return { ready: false, reason: ".venv is incomplete" };
  }
  if (!fs.statSync(interpreter).isFile() || !fs.statSync(venvConfig).isFile()) {
    fail(".venv interpreter and pyvenv.cfg must be regular files");
  }
  return { ready: true, interpreter };
}

function explicitDisable(environment = process.env) {
  return (
    environment.TRELLIS_HOOKS === "0" ||
    environment.TRELLIS_DISABLE_HOOKS === "1"
  );
}

function parseInput(rawInput, mode) {
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch (error) {
    fail(
      "hook stdin must be valid JSON: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  if (!isPlainObject(input)) {
    fail("hook stdin must be one JSON object");
  }

  const contract = HOOK_MODES[mode];
  if (!contract) {
    fail("unsupported hook mode " + JSON.stringify(mode));
  }
  const eventName = input.hook_event_name ?? input.hookEventName;
  if (eventName !== contract.eventName) {
    fail(
      mode +
        " requires event " +
        contract.eventName +
        "; received " +
        JSON.stringify(eventName),
    );
  }
  if (input.cwd !== undefined && typeof input.cwd !== "string") {
    fail("hook input cwd must be a string when present");
  }
  if (mode === "subagent-context") {
    const agentType = input.agent_type ?? input.agentType;
    if (
      !["trellis-implement", "trellis-check", "trellis-research"].includes(
        agentType,
      )
    ) {
      fail("SubagentStart requires a supported Trellis agent_type");
    }
    if (typeof input.session_id !== "string" || !input.session_id.trim()) {
      fail("SubagentStart requires a non-empty session_id");
    }
  }
  return input;
}

function assertInputWithinProject(input, projectRoot) {
  if (input.cwd === undefined) {
    return;
  }
  let canonicalRoot;
  let canonicalCwd;
  try {
    canonicalRoot = fs.realpathSync(projectRoot);
    canonicalCwd = fs.realpathSync(path.resolve(input.cwd));
  } catch (error) {
    fail(
      "hook input cwd must resolve inside the FyAgent repository: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  if (!isPathInsideProject(canonicalRoot, canonicalCwd)) {
    fail("hook input cwd must remain inside the FyAgent repository");
  }
}

function isPathInsideProject(
  projectRoot,
  candidate,
  pathImplementation = path,
) {
  const relative = pathImplementation.relative(
    projectRoot,
    pathImplementation.resolve(candidate),
  );
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(".." + pathImplementation.sep) &&
      !pathImplementation.isAbsolute(relative))
  );
}

function degradationOutput(mode, reason) {
  const contract = HOOK_MODES[mode];
  const message =
    "FyAgent Codex hook continued without Trellis context because " +
    reason +
    ". Run `mise run bootstrap` from the repository root before the next prompt.";
  return {
    continue: true,
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: contract.eventName,
      additionalContext:
        "<fyagent-hook-bootstrap>\n" + message + "\n</fyagent-hook-bootstrap>",
    },
  };
}

function validateHookOutput(stdout, mode) {
  let output;
  try {
    output = JSON.parse(stdout.trim());
  } catch (error) {
    fail(
      "hook stdout must be exactly one JSON object: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  if (!isPlainObject(output)) {
    fail("hook stdout must be one JSON object");
  }

  if (
    output.continue === true &&
    !Object.prototype.hasOwnProperty.call(output, "hookSpecificOutput")
  ) {
    return output;
  }

  const hookOutput = output.hookSpecificOutput;
  if (!isPlainObject(hookOutput)) {
    fail("hook stdout must contain hookSpecificOutput or continue: true");
  }
  if (hookOutput.hookEventName !== HOOK_MODES[mode].eventName) {
    fail("hook stdout event does not match " + HOOK_MODES[mode].eventName);
  }
  if (
    typeof hookOutput.additionalContext !== "string" ||
    !hookOutput.additionalContext.trim()
  ) {
    fail("hook stdout additionalContext must be a non-empty string");
  }
  if (output.continue !== undefined && output.continue !== true) {
    fail("hook stdout cannot block the prompt with continue: false");
  }
  return output;
}

function buildHookEnvironment({ environment, projectRoot, interpreter }) {
  const childEnvironment = {};
  for (const [key, value] of Object.entries(environment)) {
    const normalizedKey = key.toUpperCase();
    if (
      normalizedKey.startsWith("UV_") ||
      normalizedKey.startsWith("PYTHON") ||
      normalizedKey.startsWith("CONDA_") ||
      normalizedKey.startsWith("DYLD_") ||
      normalizedKey.startsWith("LD_") ||
      [
        "__PYVENV_LAUNCHER__",
        "LIBPATH",
        "SHLIB_PATH",
        "VIRTUAL_ENV",
        "VIRTUAL_ENV_PROMPT",
      ].includes(normalizedKey)
    ) {
      continue;
    }
    childEnvironment[key] = value;
  }

  return {
    ...childEnvironment,
    FYAGENT_CODEX_HOOK_STRICT: "1",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
    PYTHONSAFEPATH: "1",
    PYTHONUTF8: "1",
    UV_LOCKED: "1",
    UV_NO_ENV_FILE: "1",
    UV_NO_SYNC: "1",
    UV_OFFLINE: "1",
    UV_PROJECT: projectRoot,
    UV_PYTHON: interpreter,
    UV_PYTHON_DOWNLOADS: "never",
    UV_WORKING_DIR: projectRoot,
  };
}

function runReadyHook({
  projectRoot,
  mode,
  input,
  interpreter,
  spawn = spawnSync,
  environment = process.env,
}) {
  const contract = HOOK_MODES[mode];
  const executionRoot = fs.realpathSync(projectRoot);
  const hookScript = path.resolve(executionRoot, contract.script);
  const isolatedPycache = path.join(
    os.tmpdir(),
    "fyagent-codex-hook-" + crypto.randomUUID(),
  );
  const args = [
    "run",
    "--locked",
    "--no-sync",
    "--offline",
    "--no-env-file",
    "--project",
    executionRoot,
    "--directory",
    executionRoot,
    "--python",
    interpreter,
    "python",
    "-I",
    "-S",
    "-B",
    "-X",
    "pycache_prefix=" + isolatedPycache,
    "-X",
    "utf8",
    hookScript,
  ];
  const result = spawn("uv", args, {
    cwd: executionRoot,
    encoding: "utf8",
    env: buildHookEnvironment({
      environment,
      projectRoot: executionRoot,
      interpreter,
    }),
    input: JSON.stringify(input) + "\n",
    maxBuffer: 16 * 1024 * 1024,
    timeout: HOOK_TIMEOUT_MS,
    windowsHide: true,
  });
  if (result.error) {
    fail("uv hook process failed: " + result.error.message);
  }
  if (result.signal) {
    fail("uv hook process terminated by " + result.signal);
  }
  if (result.status !== 0) {
    fail(
      "uv hook process exited " +
        String(result.status) +
        (result.stderr?.trim() ? ": " + result.stderr.trim() : ""),
    );
  }
  if (result.stderr?.trim()) {
    fail("uv hook process wrote unexpected stderr: " + result.stderr.trim());
  }
  return validateHookOutput(result.stdout ?? "", mode);
}

function executeHook({
  projectRoot,
  mode,
  input,
  spawn = spawnSync,
  environment = process.env,
}) {
  const readiness = validateProject(projectRoot, mode);
  assertInputWithinProject(input, projectRoot);
  if (!readiness.ready) {
    return degradationOutput(mode, readiness.reason);
  }
  return runReadyHook({
    projectRoot,
    mode,
    input,
    interpreter: readiness.interpreter,
    spawn,
    environment,
  });
}

function snapshotFile(filePath) {
  const stat = fs.lstatSync(filePath, { bigint: true });
  const relativeType = stat.isSymbolicLink()
    ? "symlink"
    : stat.isDirectory()
      ? "directory"
      : "file";
  return {
    type: relativeType,
    size: stat.size.toString(),
    mtimeNs: stat.mtimeNs.toString(),
    sha256: stat.isFile()
      ? sha256(fs.readFileSync(filePath))
      : stat.isSymbolicLink()
        ? sha256(Buffer.from(fs.readlinkSync(filePath)))
        : null,
  };
}

function snapshotTree(projectRoot) {
  const state = {};
  const roots = [".python-version", "pyproject.toml", "uv.lock", ".venv"];
  for (const relativeRoot of roots) {
    const absoluteRoot = path.join(projectRoot, relativeRoot);
    if (!fs.existsSync(absoluteRoot)) {
      state[relativeRoot] = null;
      continue;
    }
    const pending = [absoluteRoot];
    while (pending.length > 0) {
      const current = pending.pop();
      const relative = path
        .relative(projectRoot, current)
        .split(path.sep)
        .join("/");
      state[relative] = snapshotFile(current);
      if (fs.lstatSync(current).isDirectory()) {
        const children = fs.readdirSync(current).sort().reverse();
        for (const child of children) {
          pending.push(path.join(current, child));
        }
      }
    }
  }
  return state;
}

function runCheck(projectRoot) {
  const readiness = validateProject(projectRoot);
  if (!readiness.ready) {
    fail("Codex hooks require bootstrap before check: " + readiness.reason);
  }
  const before = snapshotTree(projectRoot);
  const fixtures = [
    [
      "workflow-state",
      {
        cwd: projectRoot,
        hook_event_name: "UserPromptSubmit",
        prompt: "FyAgent hook contract check",
      },
    ],
    [
      "subagent-context",
      {
        cwd: projectRoot,
        hook_event_name: "SubagentStart",
        agent_type: "trellis-research",
        session_id: "fyagent-hook-contract-check",
      },
    ],
  ];
  for (const [mode, input] of fixtures) {
    executeHook({ projectRoot, mode, input });
  }
  const after = snapshotTree(projectRoot);
  if (JSON.stringify(after) !== JSON.stringify(before)) {
    fail("Codex hooks modified Python project or .venv state");
  }
  console.log("FyAgent Codex hook contract OK");
}

function main() {
  const [mode, ...extra] = process.argv.slice(2);
  if (extra.length > 0) {
    fail("Codex hook runner accepts exactly one mode");
  }
  if (mode === "check") {
    runCheck(findProjectRoot());
    return;
  }
  if (!HOOK_MODES[mode]) {
    fail("unsupported hook mode " + JSON.stringify(mode));
  }
  if (explicitDisable()) {
    return;
  }

  const rawInput = fs.readFileSync(0, "utf8");
  const input = parseInput(rawInput, mode);
  const projectRoot = findProjectRoot();
  const output = executeHook({ projectRoot, mode, input });
  process.stdout.write(JSON.stringify(output) + "\n");
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  try {
    main();
  } catch (error) {
    console.error(
      "[fyagent-codex-hook] " +
        (error instanceof Error ? error.message : String(error)),
    );
    process.exitCode = 1;
  }
}

export {
  HOOK_MODES,
  executeHook,
  explicitDisable,
  isPathInsideProject,
  parseInput,
  snapshotTree,
  validateHookOutput,
  validateProject,
};
