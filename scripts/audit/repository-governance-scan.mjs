#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCANNER_VERSION = 1;
const MAX_GIT_OUTPUT_BYTES = 768 * 1024 * 1024;
const MAX_BLOB_BYTES = 512 * 1024 * 1024;
const TARGET_BATCH_BYTES = 64 * 1024 * 1024;
const REDACTED_PATH = "<redacted-path>";

const SECRET_PATTERNS = Object.freeze([
  {
    category: "openai-api-key",
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/gu,
  },
  {
    category: "github-token",
    pattern: /\bgh[opusr]_[A-Za-z0-9]{20,}\b/gu,
  },
  {
    category: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/gu,
  },
  {
    category: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gu,
  },
]);

class SafeScanFailure extends Error {
  constructor(category) {
    super(category);
    this.name = "SafeScanFailure";
    this.category = category;
  }
}

function fail(category) {
  throw new SafeScanFailure(category);
}

function runGit(args, input, failureCategory) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: null,
    input,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_OPTIONAL_LOCKS: "0",
      LC_ALL: "C",
      LANG: "C",
    },
  });

  if (
    result.error !== undefined ||
    result.signal !== null ||
    result.status !== 0 ||
    !Buffer.isBuffer(result.stdout) ||
    !Buffer.isBuffer(result.stderr)
  ) {
    fail(failureCategory);
  }
  return result.stdout;
}

function splitNul(buffer, failureCategory) {
  if (buffer.length === 0) return [];
  if (buffer[buffer.length - 1] !== 0) fail(failureCategory);
  const records = [];
  let start = 0;
  for (let cursor = 0; cursor < buffer.length; cursor += 1) {
    if (buffer[cursor] !== 0) continue;
    records.push(buffer.subarray(start, cursor));
    start = cursor + 1;
  }
  return records;
}

function parseAscii(buffer, pattern, failureCategory) {
  const value = buffer.toString("ascii");
  if (!pattern.test(value) || !Buffer.from(value, "ascii").equals(buffer)) {
    fail(failureCategory);
  }
  return value;
}

function objectFormat() {
  const output = runGit(
    ["rev-parse", "--show-object-format"],
    undefined,
    "repository-format-failed",
  );
  const value = output.toString("ascii").trim();
  if (value === "sha1") return { length: 40, pattern: /^[0-9a-f]{40}$/u };
  if (value === "sha256") return { length: 64, pattern: /^[0-9a-f]{64}$/u };
  fail("repository-format-invalid");
}

function countMatches(text, pattern) {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text) !== null) count += 1;
  pattern.lastIndex = 0;
  return count;
}

function classifications(bytes) {
  const text = bytes.toString("latin1");
  const results = [];
  for (const { category, pattern } of SECRET_PATTERNS) {
    const count = countMatches(text, pattern);
    if (count > 0) results.push({ category, count });
  }
  return results;
}

function sanitizePath(rawPath) {
  if (rawPath === null) return null;
  const decoded = rawPath.toString("utf8");
  if (!Buffer.from(decoded, "utf8").equals(rawPath)) return REDACTED_PATH;
  if (decoded.length === 0 || /[\p{Cc}\p{Cf}]/u.test(decoded)) {
    return REDACTED_PATH;
  }
  if (
    /(?:^|[^A-Za-z0-9])(?:[A-Za-z]:[\\/])?Users[\\/](?!<)[^\\/\s]+/iu.test(
      decoded,
    ) ||
    /(?:^|[\\/])(?:home|Users)[\\/](?!<)[^\\/\s]+/u.test(decoded) ||
    classifications(Buffer.from(decoded, "utf8")).length > 0
  ) {
    return REDACTED_PATH;
  }
  return decoded;
}

function parseCurrentTree(treeOid, oidFormat) {
  const output = runGit(
    ["ls-tree", "-r", "-z", "--full-tree", treeOid],
    undefined,
    "current-enumeration-failed",
  );
  const objects = new Map();

  for (const record of splitNul(output, "current-enumeration-invalid")) {
    const tab = record.indexOf(0x09);
    if (tab < 0) fail("current-enumeration-invalid");
    const metadata = parseAscii(
      record.subarray(0, tab),
      /^(?:100644|100755|120000) blob [0-9a-f]{40,64}$/u,
      "current-enumeration-invalid",
    );
    const [mode, type, oid] = metadata.split(" ");
    if (
      !["100644", "100755", "120000"].includes(mode) ||
      type !== "blob" ||
      !oidFormat.pattern.test(oid)
    ) {
      fail("current-enumeration-invalid");
    }
    const rawPath = record.subarray(tab + 1);
    if (rawPath.length === 0) fail("current-enumeration-invalid");
    const existing = objects.get(oid);
    if (existing === undefined) {
      objects.set(oid, { oid, rawPath, pathCount: 1 });
    } else {
      existing.pathCount += 1;
    }
  }
  return objects;
}

function parseHistory(oidFormat) {
  const oidOutput = runGit(
    ["rev-list", "--objects", "--all", "--no-object-names", "-z"],
    undefined,
    "history-enumeration-failed",
  );
  const orderedOids = splitNul(oidOutput, "history-enumeration-invalid").map(
    (record) =>
      parseAscii(record, oidFormat.pattern, "history-enumeration-invalid"),
  );
  if (new Set(orderedOids).size !== orderedOids.length) {
    fail("history-enumeration-invalid");
  }

  // In -z mode Git emits one OID token followed by optional metadata tokens,
  // including `path=<path>`. The no-object-names pass above is the enumeration
  // authority; this second pass can only attach a validated path hint.
  const namedOutput = runGit(
    ["rev-list", "--objects", "--all", "-z"],
    undefined,
    "history-path-enumeration-failed",
  );
  const namedRecords = splitNul(
    namedOutput,
    "history-path-enumeration-invalid",
  );
  const objects = new Map();
  let namedIndex = 0;
  for (let oidIndex = 0; oidIndex < orderedOids.length; oidIndex += 1) {
    const oid = orderedOids[oidIndex];
    const oidRecord = namedRecords[namedIndex];
    if (
      oidRecord === undefined ||
      oidRecord.length !== oidFormat.length ||
      oidRecord.toString("ascii") !== oid
    ) {
      fail("history-path-enumeration-invalid");
    }
    namedIndex += 1;

    let rawPath = null;
    const nextOid = orderedOids[oidIndex + 1];
    const possiblePath = namedRecords[namedIndex];
    if (
      possiblePath !== undefined &&
      (nextOid === undefined || possiblePath.toString("ascii") !== nextOid)
    ) {
      const pathPrefix = Buffer.from("path=", "ascii");
      if (
        possiblePath.length <= pathPrefix.length ||
        !possiblePath.subarray(0, pathPrefix.length).equals(pathPrefix)
      ) {
        fail("history-path-enumeration-invalid");
      }
      rawPath = possiblePath.subarray(pathPrefix.length);
      namedIndex += 1;
    }
    objects.set(oid, { oid, rawPath, pathCount: rawPath === null ? 0 : 1 });
  }
  if (namedIndex !== namedRecords.length) {
    fail("history-path-enumeration-invalid");
  }
  return objects;
}

function batchCheck(objects, oidFormat) {
  const ordered = [...objects.values()].sort((left, right) =>
    left.oid.localeCompare(right.oid),
  );
  if (ordered.length === 0) return [];
  const input = Buffer.from(
    `${ordered.map(({ oid }) => oid).join("\n")}\n`,
    "ascii",
  );
  const output = runGit(
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    input,
    "object-metadata-failed",
  );
  const lines = output.toString("ascii").split("\n");
  if (lines.pop() !== "" || lines.length !== ordered.length) {
    fail("object-metadata-invalid");
  }

  const blobs = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const match = lines[index].match(
      /^([0-9a-f]{40,64}) (blob|tree|commit|tag) ([0-9]+)$/u,
    );
    if (match === null || match[1] !== ordered[index].oid) {
      fail("object-metadata-invalid");
    }
    const [, oid, type, rawSize] = match;
    if (!oidFormat.pattern.test(oid)) fail("object-metadata-invalid");
    const size = Number(rawSize);
    if (!Number.isSafeInteger(size) || size < 0) {
      fail("object-metadata-invalid");
    }
    if (type === "blob") {
      if (size > MAX_BLOB_BYTES) fail("object-size-unsupported");
      blobs.push({ ...ordered[index], size });
    }
  }
  return blobs;
}

function blobBatches(blobs) {
  const batches = [];
  let batch = [];
  let bytes = 0;
  for (const blob of blobs) {
    if (batch.length > 0 && bytes + blob.size > TARGET_BATCH_BYTES) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(blob);
    bytes += blob.size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

function readBlobBatch(batch, oidFormat, visit) {
  const input = Buffer.from(
    `${batch.map(({ oid }) => oid).join("\n")}\n`,
    "ascii",
  );
  const output = runGit(["cat-file", "--batch"], input, "object-read-failed");
  let cursor = 0;

  for (const expected of batch) {
    const lineEnd = output.indexOf(0x0a, cursor);
    if (lineEnd < 0) fail("object-read-invalid");
    const header = parseAscii(
      output.subarray(cursor, lineEnd),
      /^[0-9a-f]{40,64} blob [0-9]+$/u,
      "object-read-invalid",
    );
    const [oid, type, rawSize] = header.split(" ");
    const size = Number(rawSize);
    if (
      !oidFormat.pattern.test(oid) ||
      oid !== expected.oid ||
      type !== "blob" ||
      size !== expected.size
    ) {
      fail("object-read-invalid");
    }
    const bodyStart = lineEnd + 1;
    const bodyEnd = bodyStart + size;
    if (bodyEnd >= output.length || output[bodyEnd] !== 0x0a) {
      fail("object-read-invalid");
    }
    visit(expected, output.subarray(bodyStart, bodyEnd));
    cursor = bodyEnd + 1;
  }
  if (cursor !== output.length) fail("object-read-invalid");
}

function resolveTreeish(treeish, oidFormat) {
  if (
    typeof treeish !== "string" ||
    treeish.length === 0 ||
    treeish.includes("\0")
  ) {
    fail("invalid-arguments");
  }
  const output = runGit(
    ["rev-parse", "--verify", "--end-of-options", `${treeish}^{tree}`],
    undefined,
    "treeish-resolution-failed",
  );
  const oid = output.toString("ascii").trim();
  if (
    !oidFormat.pattern.test(oid) ||
    output.toString("ascii").trimEnd() !== oid
  ) {
    fail("treeish-resolution-invalid");
  }
  return oid;
}

function parseArguments(args) {
  if (args.length === 3 && args[0] === "current" && args[1] === "--treeish") {
    return { mode: "current", treeish: args[2] };
  }
  if (args.length === 1 && args[0] === "history") {
    return { mode: "history", treeish: null };
  }
  fail("invalid-arguments");
}

function emptyReport(mode = "invalid") {
  return {
    scannerVersion: SCANNER_VERSION,
    mode,
    sourceOid: null,
    counts: { objects: 0, blobs: 0, paths: 0, findings: 0 },
    findings: [],
    sizes: [],
    failures: [],
  };
}

export function scanRepository(args) {
  const parsed = parseArguments(args);
  const report = emptyReport(parsed.mode);
  const oidFormat = objectFormat();
  let objects;

  if (parsed.mode === "current") {
    report.sourceOid = resolveTreeish(parsed.treeish, oidFormat);
    objects = parseCurrentTree(report.sourceOid, oidFormat);
  } else {
    objects = parseHistory(oidFormat);
  }

  const blobs = batchCheck(objects, oidFormat);
  report.counts.objects = objects.size;
  report.counts.blobs = blobs.length;
  report.counts.paths = blobs.reduce((sum, blob) => sum + blob.pathCount, 0);

  for (const batch of blobBatches(blobs)) {
    readBlobBatch(batch, oidFormat, (blob, bytes) => {
      const safePath = sanitizePath(blob.rawPath);
      report.sizes.push({
        category: "blob-size",
        path: safePath,
        oid: blob.oid,
        count: blob.pathCount,
        size: blob.size,
      });
      for (const finding of classifications(bytes)) {
        report.findings.push({
          category: finding.category,
          path: safePath,
          oid: blob.oid,
          count: finding.count,
          size: blob.size,
        });
      }
    });
  }

  report.findings.sort((left, right) =>
    `${left.oid}:${left.category}`.localeCompare(
      `${right.oid}:${right.category}`,
    ),
  );
  report.sizes.sort((left, right) => left.oid.localeCompare(right.oid));
  report.counts.findings = report.findings.reduce(
    (sum, finding) => sum + finding.count,
    0,
  );
  return report;
}

function safeFailureReport(error) {
  const report = emptyReport();
  report.failures.push({
    category:
      error instanceof SafeScanFailure ? error.category : "internal-failure",
    path: null,
    oid: null,
    count: 1,
    size: 0,
  });
  return report;
}

function main() {
  try {
    process.stdout.write(
      `${JSON.stringify(scanRepository(process.argv.slice(2)))}\n`,
    );
  } catch (error) {
    process.stderr.write(`${JSON.stringify(safeFailureReport(error))}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
