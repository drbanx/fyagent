#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";
import {
  ROOT,
  fail,
  isMain,
  repositoryPath,
  run,
  usageList,
  writeFilesAtomically,
} from "./lib.mjs";

function isInsideRepository(absolutePath) {
  const relative = path.relative(ROOT, absolutePath);
  return (
    relative !== "" &&
    relative !== "." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export function validateFormatFiles(files) {
  if (files.length === 0) {
    throw new Error("At least one file is required");
  }

  return files.map((file) => {
    if (typeof file !== "string" || file === "") {
      throw new Error("Format targets must be non-empty file paths");
    }
    if (file.startsWith("-")) {
      throw new Error(`Prettier options are forbidden: ${file}`);
    }
    if (file.split(/[\\/]/u).includes("..")) {
      throw new Error(`Parent path traversal is forbidden: ${file}`);
    }

    const absolute = path.isAbsolute(file)
      ? path.resolve(file)
      : repositoryPath(file);
    if (!isInsideRepository(absolute)) {
      throw new Error(`Path must be a child of the repository: ${file}`);
    }

    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error(
        `Format target must be a regular non-symlink file: ${file}`,
      );
    }
    const real = fs.realpathSync.native(absolute);
    if (!isInsideRepository(real)) {
      throw new Error(`Format target resolves outside the repository: ${file}`);
    }
    return file;
  });
}

function absoluteFormatPath(file) {
  return path.isAbsolute(file) ? path.resolve(file) : repositoryPath(file);
}

function isJsonlFile(file) {
  return path.extname(file).toLowerCase() === ".jsonl";
}

// JSON.parse validates syntax, but reserializing its value would round large
// numbers and collapse duplicate object members. Compact the original tokens.
function compactJsonRecord(line) {
  let compact = "";
  let inString = false;
  let escaped = false;

  for (const character of line) {
    if (inString) {
      compact += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') {
      inString = true;
      compact += character;
    } else if (!/[\t\r ]/u.test(character)) {
      compact += character;
    }
  }

  return compact;
}

function decodeJsonl(bytes, file) {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error(`Invalid UTF-8 in JSONL file: ${file}`);
  }
}

export function normalizeJsonl(content, file) {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line, index) => {
      if (/^[\t\r ]*$/u.test(line)) return "";

      try {
        JSON.parse(line);
        return compactJsonRecord(line);
      } catch {
        throw new Error(`Invalid JSONL record at ${file}:${index + 1}`);
      }
    })
    .join("\n");
}

function normalizedJsonlChanges(files) {
  const plans = new Map();
  for (const file of files) {
    const absolute = absoluteFormatPath(file);
    const relative = path.relative(ROOT, absolute);
    const originalBytes = fs.readFileSync(absolute);
    const original = decodeJsonl(originalBytes, file);
    const normalized = normalizeJsonl(original, file);
    if (normalized !== original) {
      plans.set(relative, {
        absolute,
        file,
        originalBytes,
        relative,
        normalized,
      });
    }
  }
  return [...plans.values()];
}

function assertJsonlPreimages(plans) {
  for (const plan of plans) {
    const current = fs.readFileSync(plan.absolute);
    if (!current.equals(plan.originalBytes)) {
      throw new Error(`JSONL target changed after preflight: ${plan.file}`);
    }
  }
}

export function formatFiles(files, runCommand = run) {
  const validated = validateFormatFiles(files);
  const jsonlFiles = validated.filter(isJsonlFile);
  const prettierFiles = validated.filter((file) => !isJsonlFile(file));
  // Parse every JSONL target before Prettier can modify another reviewed file.
  const jsonlPlans = normalizedJsonlChanges(jsonlFiles);

  if (prettierFiles.length > 0) {
    runCommand("pnpm", ["exec", "prettier", "--write", "--", ...prettierFiles]);
  }
  if (jsonlPlans.length > 0) {
    assertJsonlPreimages(jsonlPlans);
    writeFilesAtomically(
      jsonlPlans.map(({ relative, normalized }) => [relative, normalized]),
    );
  }
}

if (isMain(import.meta.url)) {
  try {
    formatFiles(usageList("files"));
  } catch (error) {
    fail(error);
  }
}
