import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../tasks/lib.mjs";

export const OVERLAY_MANIFEST = "scripts/trellis/overlay-manifest.json";
export const MANAGED_MANIFEST = ".trellis/.template-hashes.json";

const SHA256 = /^[0-9a-f]{64}$/u;
const OWNER =
  /^\.trellis\/spec\/(?:backend|frontend|guides)\/[A-Za-z0-9._/-]+\.md$/u;

export function normalizeLf(value) {
  return Buffer.isBuffer(value)
    ? value.toString("utf8").replace(/\r\n/g, "\n")
    : String(value).replace(/\r\n/g, "\n");
}

export function sha256Lf(value) {
  return createHash("sha256").update(normalizeLf(value)).digest("hex");
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} has unexpected keys: ${actual.join(", ")}`);
  }
}

export function assertRepositoryRelative(value, label) {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.includes("\\") ||
    value.includes("\0") ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value.split("/").includes("..")
  ) {
    throw new Error(
      `${label} must be a normalized POSIX repository-relative path`,
    );
  }
  return value;
}

function resolveRegularFile(root, relativePath, label) {
  assertRepositoryRelative(relativePath, label);
  const absolute = path.join(root, ...relativePath.split("/"));
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error?.code === "ENOENT")
      throw new Error(`${label} is missing: ${relativePath}`);
    throw error;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(
      `${label} must be a regular non-symlink file: ${relativePath}`,
    );
  }
  const resolvedRoot = fs.realpathSync.native(root);
  const resolved = fs.realpathSync.native(absolute);
  const relative = path.relative(resolvedRoot, resolved);
  if (
    relative === "" ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `${label} resolves outside the repository: ${relativePath}`,
    );
  }
  return absolute;
}

function readJsonFile(root, relativePath, label) {
  const absolute = resolveRegularFile(root, relativePath, label);
  try {
    return JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    throw new Error(`${label} must contain valid JSON: ${error.message}`);
  }
}

function parseHunkRange(value) {
  const match = /^(\d+)(?:,(\d+))?$/u.exec(value);
  if (!match) throw new Error(`Invalid unified-diff range: ${value}`);
  return { start: Number(match[1]), count: Number(match[2] ?? "1") };
}

export function parseUnifiedDiff(source, expectedPath) {
  const lines = normalizeLf(source).split("\n");
  if (!lines[0]?.startsWith("--- ") || !lines[1]?.startsWith("+++ ")) {
    throw new Error("Unified diff must start with --- and +++ headers");
  }
  for (const header of lines.slice(0, 2)) {
    const file = header
      .slice(4)
      .split(/\s/u, 1)[0]
      .replace(/^[ab]\//u, "");
    if (file !== expectedPath) {
      throw new Error(`Unified diff targets ${file}, expected ${expectedPath}`);
    }
  }

  const hunks = [];
  let index = 2;
  while (index < lines.length) {
    if (lines[index] === "") {
      index += 1;
      continue;
    }
    const header = /^@@ -(\d+(?:,\d+)?) \+(\d+(?:,\d+)?) @@(?: .*)?$/u.exec(
      lines[index],
    );
    if (!header)
      throw new Error(`Invalid unified-diff hunk header: ${lines[index]}`);
    const oldRange = parseHunkRange(header[1]);
    const newRange = parseHunkRange(header[2]);
    index += 1;
    const operations = [];
    let oldCount = 0;
    let newCount = 0;
    while (index < lines.length && !lines[index].startsWith("@@ ")) {
      const line = lines[index];
      if (line === "") break;
      const kind = line[0];
      if (!new Set([" ", "+", "-"]).has(kind)) {
        throw new Error(`Unsupported unified-diff line: ${line}`);
      }
      const value = line.slice(1);
      operations.push({ kind, value });
      if (kind !== "+") oldCount += 1;
      if (kind !== "-") newCount += 1;
      index += 1;
    }
    if (oldCount !== oldRange.count || newCount !== newRange.count) {
      throw new Error("Unified-diff hunk counts do not match the header");
    }
    hunks.push({ oldRange, newRange, operations });
  }
  if (hunks.length === 0) throw new Error("Unified diff contains no hunks");
  return hunks;
}

export function applyUnifiedDiff(
  content,
  patchSource,
  expectedPath,
  reverse = false,
) {
  const hunks = parseUnifiedDiff(patchSource, expectedPath);
  const input = normalizeLf(content).split("\n");
  const output = [];
  let cursor = 0;

  for (const hunk of hunks) {
    const range = reverse ? hunk.newRange : hunk.oldRange;
    const target =
      range.count === 0 ? range.start : range.start === 0 ? 0 : range.start - 1;
    if (target < cursor || target > input.length) {
      throw new Error(`Unified diff hunk starts outside ${expectedPath}`);
    }
    output.push(...input.slice(cursor, target));
    cursor = target;
    let consumed = 0;
    let emitted = 0;
    for (const operation of hunk.operations) {
      const consumes =
        operation.kind === " " ||
        (reverse ? operation.kind === "+" : operation.kind === "-");
      const emits =
        operation.kind === " " ||
        (reverse ? operation.kind === "-" : operation.kind === "+");
      if (consumes) {
        if (input[cursor] !== operation.value) {
          throw new Error(
            `Unified diff context mismatch in ${expectedPath} at line ${cursor + 1}`,
          );
        }
        cursor += 1;
        consumed += 1;
      }
      if (emits) {
        output.push(operation.value);
        emitted += 1;
      }
    }
    const expectedConsumed = reverse
      ? hunk.newRange.count
      : hunk.oldRange.count;
    const expectedEmitted = reverse ? hunk.oldRange.count : hunk.newRange.count;
    if (consumed !== expectedConsumed || emitted !== expectedEmitted) {
      throw new Error(
        `Unified diff application count mismatch for ${expectedPath}`,
      );
    }
  }
  output.push(...input.slice(cursor));
  return output.join("\n");
}

function validateJsonTransformDescriptor(descriptor) {
  assertPlainObject(descriptor, "JSON transform");
  assertExactKeys(descriptor, ["schema", "events"], "JSON transform");
  if (descriptor.schema !== "fyagent-trellis-json-transform/v1") {
    throw new Error("JSON transform has an unsupported schema");
  }
  if (!Array.isArray(descriptor.events) || descriptor.events.length !== 2) {
    throw new Error("JSON transform must declare exactly two events");
  }
  const names = new Set();
  for (const event of descriptor.events) {
    assertPlainObject(event, "JSON transform event");
    assertExactKeys(
      event,
      ["name", "matcher", "baseCommands", "outputCommand", "type", "timeout"],
      "JSON transform event",
    );
    if (names.has(event.name))
      throw new Error(`Duplicate JSON transform event: ${event.name}`);
    names.add(event.name);
    if (!new Set(["UserPromptSubmit", "SubagentStart"]).has(event.name)) {
      throw new Error(`Unexpected JSON transform event: ${event.name}`);
    }
    if (
      event.type !== "command" ||
      event.timeout !== 15 ||
      typeof event.outputCommand !== "string" ||
      event.outputCommand === ""
    ) {
      throw new Error(`Invalid JSON transform contract for ${event.name}`);
    }
    assertPlainObject(event.baseCommands, `${event.name} base commands`);
  }
  return descriptor;
}

function applyJsonTransform(content, descriptor, identity, reverse) {
  const document = JSON.parse(normalizeLf(content));
  assertPlainObject(document, "hooks document");
  assertExactKeys(document, ["hooks"], "hooks document");
  assertPlainObject(document.hooks, "hooks map");
  assertExactKeys(
    document.hooks,
    ["UserPromptSubmit", "SubagentStart"],
    "hooks map",
  );

  for (const event of descriptor.events) {
    const groups = document.hooks[event.name];
    if (!Array.isArray(groups) || groups.length !== 1) {
      throw new Error(`${event.name} must contain exactly one hook group`);
    }
    const group = assertPlainObject(groups[0], `${event.name} hook group`);
    assertExactKeys(
      group,
      event.matcher === null ? ["hooks"] : ["matcher", "hooks"],
      `${event.name} hook group`,
    );
    if ((group.matcher ?? null) !== event.matcher) {
      throw new Error(`${event.name} matcher drifted`);
    }
    if (!Array.isArray(group.hooks) || group.hooks.length !== 1) {
      throw new Error(`${event.name} must contain exactly one command hook`);
    }
    const hook = assertPlainObject(
      group.hooks[0],
      `${event.name} command hook`,
    );
    assertExactKeys(
      hook,
      ["type", "command", "timeout"],
      `${event.name} command hook`,
    );
    if (hook.type !== event.type || hook.timeout !== event.timeout) {
      throw new Error(`${event.name} type or timeout drifted`);
    }
    const baseCommand = event.baseCommands[identity];
    if (typeof baseCommand !== "string" || baseCommand === "") {
      throw new Error(
        `${event.name} has no base command for identity ${identity}`,
      );
    }
    const expected = reverse ? event.outputCommand : baseCommand;
    if (hook.command !== expected) {
      throw new Error(
        `${event.name} command does not match the ${reverse ? "output" : "base"}`,
      );
    }
    hook.command = reverse ? baseCommand : event.outputCommand;
  }
  return `${JSON.stringify(document, null, 2)}\n`;
}

function transformPaths(entry) {
  if (entry.transform.type === "json-operations") return [entry.transform.file];
  if (entry.transform.type === "unified-diff")
    return Object.values(entry.transform.files);
  throw new Error(`Unsupported overlay transform type for ${entry.path}`);
}

function validateEntry(root, entry) {
  assertPlainObject(entry, "Overlay entry");
  assertExactKeys(
    entry,
    [
      "path",
      "owner",
      "reason",
      "upstreamIdentities",
      "transform",
      "expectedOutputSha256",
    ],
    "Overlay entry",
  );
  assertRepositoryRelative(entry.path, "Overlay path");
  assertRepositoryRelative(entry.owner, `Overlay owner for ${entry.path}`);
  if (!OWNER.test(entry.owner))
    throw new Error(`Overlay owner is invalid: ${entry.owner}`);
  resolveRegularFile(root, entry.owner, `Overlay owner for ${entry.path}`);
  if (typeof entry.reason !== "string" || entry.reason.trim().length < 12) {
    throw new Error(`Overlay reason is invalid for ${entry.path}`);
  }
  const identities = assertPlainObject(
    entry.upstreamIdentities,
    `Upstream identities for ${entry.path}`,
  );
  if (Object.keys(identities).length === 0) {
    throw new Error(`Overlay has no upstream identities: ${entry.path}`);
  }
  for (const [name, digest] of Object.entries(identities)) {
    if (!/^[A-Za-z0-9._-]+$/u.test(name) || !SHA256.test(digest)) {
      throw new Error(
        `Overlay has an invalid upstream identity: ${entry.path}/${name}`,
      );
    }
  }
  if (
    !SHA256.test(entry.expectedOutputSha256) ||
    Object.values(identities).includes(entry.expectedOutputSha256)
  ) {
    throw new Error(
      `Overlay has an invalid expected output hash: ${entry.path}`,
    );
  }
  assertPlainObject(entry.transform, `Transform for ${entry.path}`);
  if (entry.transform.type === "json-operations") {
    assertExactKeys(
      entry.transform,
      ["type", "file"],
      `Transform for ${entry.path}`,
    );
  } else if (entry.transform.type === "unified-diff") {
    assertExactKeys(
      entry.transform,
      ["type", "files"],
      `Transform for ${entry.path}`,
    );
    assertPlainObject(entry.transform.files, `Patch map for ${entry.path}`);
    const identityNames = Object.keys(identities).sort();
    if (
      JSON.stringify(Object.keys(entry.transform.files).sort()) !==
      JSON.stringify(identityNames)
    ) {
      throw new Error(
        `Patch identities do not match upstream identities for ${entry.path}`,
      );
    }
  } else {
    throw new Error(`Unsupported overlay transform type for ${entry.path}`);
  }
  for (const transformPath of transformPaths(entry)) {
    if (!transformPath.startsWith("scripts/trellis/overlays/")) {
      throw new Error(
        `Overlay transform is outside its owned directory: ${transformPath}`,
      );
    }
    const absolute = resolveRegularFile(
      root,
      transformPath,
      `Transform for ${entry.path}`,
    );
    const source = fs.readFileSync(absolute, "utf8");
    if (entry.transform.type === "unified-diff") {
      parseUnifiedDiff(source, entry.path);
    } else {
      validateJsonTransformDescriptor(JSON.parse(source));
    }
  }
  return entry;
}

export function loadOverlayManifest({
  root = ROOT,
  manifestPath = OVERLAY_MANIFEST,
} = {}) {
  const manifest = readJsonFile(root, manifestPath, "Overlay manifest");
  assertPlainObject(manifest, "Overlay manifest");
  assertExactKeys(manifest, ["schema", "hash", "entries"], "Overlay manifest");
  if (
    manifest.schema !== "fyagent-trellis-overlay/v1" ||
    manifest.hash !== "sha256-lf"
  ) {
    throw new Error("Overlay manifest schema or hash contract is unsupported");
  }
  if (!Array.isArray(manifest.entries) || manifest.entries.length === 0) {
    throw new Error("Overlay manifest must contain entries");
  }
  const paths = new Set();
  for (const entry of manifest.entries) {
    validateEntry(root, entry);
    if (paths.has(entry.path))
      throw new Error(`Duplicate overlay path: ${entry.path}`);
    paths.add(entry.path);
  }
  if ([...paths].some((value) => value.includes("/fyagent-trellis/"))) {
    throw new Error(
      "fyagent-trellis must remain project-owned, not an overlay target",
    );
  }
  return manifest;
}

export function loadManagedManifest({
  root = ROOT,
  managedManifestPath = MANAGED_MANIFEST,
} = {}) {
  const managed = readJsonFile(
    root,
    managedManifestPath,
    "Managed template manifest",
  );
  assertPlainObject(managed, "Managed template manifest");
  assertExactKeys(
    managed,
    ["__version", "hashes"],
    "Managed template manifest",
  );
  if (managed.__version !== 2)
    throw new Error("Managed template manifest must use version 2");
  assertPlainObject(managed.hashes, "Managed template hashes");
  if (Object.keys(managed.hashes).length === 0)
    throw new Error("Managed template manifest is empty");
  for (const [managedPath, digest] of Object.entries(managed.hashes)) {
    assertRepositoryRelative(managedPath, "Managed template path");
    if (!SHA256.test(digest))
      throw new Error(`Managed template hash is invalid: ${managedPath}`);
  }
  if (
    Object.hasOwn(managed.hashes, ".agents/skills/fyagent-trellis/SKILL.md")
  ) {
    throw new Error(
      "fyagent-trellis must not be owned by the upstream template manifest",
    );
  }
  return managed;
}

export function applyEntryTransform(
  entry,
  content,
  identity,
  reverse,
  root = ROOT,
) {
  if (!Object.hasOwn(entry.upstreamIdentities, identity)) {
    throw new Error(`Unknown transform identity ${identity} for ${entry.path}`);
  }
  if (entry.transform.type === "unified-diff") {
    const patchPath = entry.transform.files[identity];
    const patchSource = fs.readFileSync(
      resolveRegularFile(root, patchPath, `Transform for ${entry.path}`),
      "utf8",
    );
    return applyUnifiedDiff(content, patchSource, entry.path, reverse);
  }
  const descriptor = validateJsonTransformDescriptor(
    readJsonFile(root, entry.transform.file, `Transform for ${entry.path}`),
  );
  return applyJsonTransform(content, descriptor, identity, reverse);
}

function validateOutputTransform(root, entry, output, managedHash) {
  const identities = Object.entries(entry.upstreamIdentities).filter(
    ([, digest]) => digest === managedHash,
  );
  if (identities.length === 0) {
    throw new Error(
      `Managed base hash is not declared by overlay: ${entry.path}`,
    );
  }
  const failures = [];
  for (const [identity, digest] of identities) {
    try {
      const base = applyEntryTransform(entry, output, identity, true, root);
      if (sha256Lf(base) !== digest)
        throw new Error("reverse transform base hash mismatch");
      const regenerated = applyEntryTransform(
        entry,
        base,
        identity,
        false,
        root,
      );
      if (sha256Lf(regenerated) !== entry.expectedOutputSha256) {
        throw new Error("forward transform output hash mismatch");
      }
      return;
    } catch (error) {
      failures.push(error.message);
    }
  }
  throw new Error(
    `Overlay transform is stale for ${entry.path}: ${failures.join("; ")}`,
  );
}

export function inspectRepository({
  root = ROOT,
  manifestPath = OVERLAY_MANIFEST,
  managedManifestPath = MANAGED_MANIFEST,
  allowUnreconciled = false,
} = {}) {
  const manifest = loadOverlayManifest({ root, manifestPath });
  const managed = loadManagedManifest({ root, managedManifestPath });
  const overlays = new Map(
    manifest.entries.map((entry) => [entry.path, entry]),
  );
  const plans = [];
  let pristine = 0;
  let reconciled = 0;

  for (const entry of manifest.entries) {
    if (!Object.hasOwn(managed.hashes, entry.path)) {
      throw new Error(`Stale overlay target is not managed: ${entry.path}`);
    }
  }

  for (const [managedPath, managedHash] of Object.entries(managed.hashes)) {
    const absolute = resolveRegularFile(root, managedPath, "Managed template");
    const content = normalizeLf(fs.readFileSync(absolute));
    const actual = sha256Lf(content);
    const entry = overlays.get(managedPath);

    if (actual === managedHash) {
      if (!entry) {
        pristine += 1;
        continue;
      }
      if (!Object.values(entry.upstreamIdentities).includes(managedHash)) {
        throw new Error(
          `Managed base hash is not declared by overlay: ${managedPath}`,
        );
      }
      if (!allowUnreconciled)
        throw new Error(`Overlay is not reconciled: ${managedPath}`);
    } else if (entry && actual === entry.expectedOutputSha256) {
      validateOutputTransform(root, entry, content, managedHash);
      reconciled += 1;
      continue;
    } else if (!entry) {
      throw new Error(`Undeclared managed-template divergence: ${managedPath}`);
    } else {
      const identity = Object.entries(entry.upstreamIdentities).find(
        ([, digest]) => digest === actual,
      );
      if (!identity || !allowUnreconciled) {
        throw new Error(
          `Unknown overlay preimage or output drift: ${managedPath}`,
        );
      }
      const transformed = applyEntryTransform(
        entry,
        content,
        identity[0],
        false,
        root,
      );
      if (sha256Lf(transformed) !== entry.expectedOutputSha256) {
        throw new Error(`Overlay output hash mismatch: ${managedPath}`);
      }
      plans.push({ path: managedPath, content: transformed });
      continue;
    }

    const identity = Object.entries(entry.upstreamIdentities).find(
      ([, digest]) => digest === actual,
    );
    if (!identity)
      throw new Error(`Unknown overlay base identity: ${managedPath}`);
    const transformed = applyEntryTransform(
      entry,
      content,
      identity[0],
      false,
      root,
    );
    if (sha256Lf(transformed) !== entry.expectedOutputSha256) {
      throw new Error(`Overlay output hash mismatch: ${managedPath}`);
    }
    plans.push({ path: managedPath, content: transformed });
  }

  return {
    ok: true,
    managed: Object.keys(managed.hashes).length,
    pristine,
    reconciled,
    planned: plans.length,
    plans,
  };
}

export function verifyRepository(options = {}) {
  const report = inspectRepository({ ...options, allowUnreconciled: false });
  return { ...report, plans: undefined };
}

export function writePlansAtomically(root, plans) {
  if (plans.length === 0) return;
  const prepared = [];
  const committed = [];
  try {
    for (const plan of plans) {
      const absolute = resolveRegularFile(root, plan.path, "Overlay target");
      const original = fs.readFileSync(absolute);
      const mode = fs.statSync(absolute).mode;
      const temporary = `${absolute}.fyagent-overlay-${process.pid}-${prepared.length}.tmp`;
      fs.writeFileSync(temporary, plan.content, { flag: "wx", mode });
      prepared.push({ absolute, temporary, original, mode });
    }
    for (const item of prepared) {
      fs.renameSync(item.temporary, item.absolute);
      committed.push(item);
    }
  } catch (error) {
    for (const item of prepared) fs.rmSync(item.temporary, { force: true });
    for (const item of committed.reverse()) {
      const rollback = `${item.absolute}.fyagent-overlay-rollback-${process.pid}.tmp`;
      fs.writeFileSync(rollback, item.original, {
        flag: "wx",
        mode: item.mode,
      });
      fs.renameSync(rollback, item.absolute);
    }
    throw error;
  }
}

export function reconcileRepository(options = {}) {
  const root = options.root ?? ROOT;
  const preflight = inspectRepository({
    ...options,
    root,
    allowUnreconciled: true,
  });
  writePlansAtomically(root, preflight.plans);
  const verified = verifyRepository({ ...options, root });
  return { ...verified, changed: preflight.plans.length };
}
