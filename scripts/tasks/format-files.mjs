#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ROOT, fail, isMain, repositoryPath, run, usageList } from "./lib.mjs";

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

export function formatFiles(files, runCommand = run) {
  const validated = validateFormatFiles(files);
  runCommand("pnpm", ["exec", "prettier", "--write", "--", ...validated]);
}

if (isMain(import.meta.url)) {
  try {
    formatFiles(usageList("files"));
  } catch (error) {
    fail(error);
  }
}
