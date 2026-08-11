#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { ROOT, fail, isMain } from "./lib.mjs";
import { generateTaskDocs } from "./task-docs.mjs";
import { loadTaskDefinitions } from "./task-contract-check.mjs";

const GENERATED_DOC = "docs/fyagent/development/mise-tasks.md";
const STANDALONE_SETUP_DOC = "CONTRIBUTING.md";
const MISE_CLI = "mi" + "se";
const TRUST_ACTION = "tr" + "ust";
const STANDALONE_SETUP_COMMANDS = Object.freeze([
  `${MISE_CLI} ${TRUST_ACTION}`,
  `${MISE_CLI} run bootstrap`,
  `${MISE_CLI} run system:check`,
  `${MISE_CLI} run dev`,
]);
const MISE_RUN_BOOLEAN_LONG_OPTIONS = new Set([
  "--affected",
  "--affected-explain",
  "--affected-json",
  "--continue-on-error",
  "--force",
  "--dry-run",
  "--quiet",
  "--raw",
  "--silent",
  "--deny-all",
  "--deny-env",
  "--deny-net",
  "--deny-read",
  "--deny-write",
  "--fresh-env",
  "--no-cache",
  "--no-deps",
  "--no-timings",
  "--skip-deps",
  "--skip-tools",
  "--task-cache-explain",
  "--task-cache-explain-json",
  "--task-cache-stats",
]);
const MISE_RUN_VALUE_LONG_OPTIONS = new Set([
  "--affected-base",
  "--affected-head",
  "--cd",
  "--jobs",
  "--output",
  "--shell",
  "--tool",
  "--allow-env",
  "--allow-net",
  "--allow-read",
  "--allow-write",
  "--task-cache",
  "--timeout",
]);
const MISE_RUN_BOOLEAN_SHORT_OPTIONS = new Set(["c", "f", "n", "q", "r", "S"]);
const MISE_RUN_VALUE_SHORT_OPTIONS = new Set(["C", "j", "o", "s", "t"]);

function markdownFilesUnder(relativeRoot) {
  const absoluteRoot = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const visit = (absolute) => {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const child = path.join(absolute, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(path.relative(ROOT, child).split(path.sep).join("/"));
      }
    }
  };
  visit(absoluteRoot);
  return files;
}

export function validateStandaloneSetup(file, source) {
  const normalized = source.replace(/\r\n/g, "\n");
  const fencedBodies = [
    ...normalized.matchAll(
      /(?:^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n[ \t]*\1[ \t]*(?=\n|$)/g,
    ),
  ].map((match) => match[2].trim());
  const expected = STANDALONE_SETUP_COMMANDS.join("\n");
  if (!fencedBodies.includes(expected)) {
    throw new Error(
      `${file} must contain the standalone setup sequence in exact order`,
    );
  }
  if (!normalized.includes("mise run check")) {
    throw new Error(`${file} must name mise run check as the full local gate`);
  }
  const prose = normalized
    .replace(/(?:`{3,}|~{3,})[\s\S]*?(?:`{3,}|~{3,})/g, " ")
    .replace(/\s+/g, " ");
  const trustReference = `\`${STANDALONE_SETUP_COMMANDS[0]}\``;
  const trustIndex = prose.indexOf(trustReference);
  const trustGuidance =
    trustIndex >= 0 ? prose.slice(trustIndex, trustIndex + 720) : "";
  if (
    !/\bdeveloper security decision\b[^.!?]{0,240}\bnever run automatically\b[^.!?]{0,160}\bproject task\b/i.test(
      trustGuidance,
    )
  ) {
    throw new Error(
      `${file} must keep repository trust as a manual developer decision outside project tasks`,
    );
  }
}

function tokenizeCommand(source) {
  const tokens = [];
  let current = "";
  let quote = null;
  const push = () => {
    if (current) tokens.push(current);
    current = "";
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (character === quote) {
        quote = null;
      } else if (
        character === "\\" &&
        quote === '"' &&
        ["\\", '"'].includes(source[index + 1])
      ) {
        current += source[index + 1];
        index += 1;
      } else {
        current += character;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (/\s/.test(character)) {
      push();
    } else if (character === "\\" && /[\s"']/.test(source[index + 1] ?? "")) {
      current += source[index + 1];
      index += 1;
    } else {
      current += character;
    }
  }
  push();
  return tokens;
}

function splitContinuation(value) {
  const trimmed = value.trimEnd();
  const marker = trimmed.at(-1);
  if (!["\\", "`", "^"].includes(marker)) {
    return { continued: false, value: trimmed };
  }
  if (marker === "`" && (trimmed.match(/`/g)?.length ?? 0) > 1) {
    return { continued: false, value: trimmed };
  }
  return { continued: true, value: trimmed.slice(0, -1).trimEnd() };
}

function continuedSourceLines(source) {
  const lines = [];
  let pending = "";
  for (const physicalLine of source.replace(/\r\n/g, "\n").split("\n")) {
    const continuation = splitContinuation(physicalLine);
    pending = pending
      ? `${pending} ${continuation.value.trimStart()}`
      : continuation.value;
    if (!continuation.continued) {
      lines.push(pending);
      pending = "";
    }
  }
  if (pending) lines.push(pending);
  return lines;
}

function consumeMiseRunOption(file, tokens, index) {
  const token = tokens[index];
  if (token.startsWith("--")) {
    const [option, inlineValue] = token.split("=", 2);
    if (MISE_RUN_BOOLEAN_LONG_OPTIONS.has(option)) {
      if (inlineValue !== undefined) {
        throw new Error(`${file} has invalid mise run option: ${token}`);
      }
      return index + 1;
    }
    if (MISE_RUN_VALUE_LONG_OPTIONS.has(option)) {
      if (inlineValue !== undefined) {
        if (!inlineValue) {
          throw new Error(
            `${file} has missing mise run option value: ${option}`,
          );
        }
        return index + 1;
      }
      if (
        tokens[index + 1] === undefined ||
        tokens[index + 1].startsWith("--")
      ) {
        throw new Error(`${file} has missing mise run option value: ${option}`);
      }
      return index + 2;
    }
    throw new Error(`${file} has unknown mise run option: ${token}`);
  }

  const short = token.slice(1);
  if (
    [...short].every((option) => MISE_RUN_BOOLEAN_SHORT_OPTIONS.has(option))
  ) {
    return index + 1;
  }
  const valueOption = short[0];
  if (MISE_RUN_VALUE_SHORT_OPTIONS.has(valueOption)) {
    if (short.length > 1) return index + 1;
    if (tokens[index + 1] === undefined || tokens[index + 1].startsWith("--")) {
      throw new Error(
        `${file} has missing mise run option value: -${valueOption}`,
      );
    }
    return index + 2;
  }
  throw new Error(`${file} has unknown mise run option: ${token}`);
}

function cleanTaskReference(token) {
  const cleaned = token.replace(/^[`*(\[]+/, "").replace(/[`*),;\].!?]+$/, "");
  if (cleaned === "<task>") return cleaned;
  if (!cleaned || /[\s`'"<>|&;()[\]{}]/.test(cleaned)) return null;
  return cleaned;
}

function parseMiseTaskReference(file, reference) {
  const tokens = tokenizeCommand(reference);
  let index = 2;
  while (index < tokens.length && tokens[index].startsWith("-")) {
    if (tokens[index] === "--") {
      index += 1;
      break;
    }
    index = consumeMiseRunOption(file, tokens, index);
  }
  const name = cleanTaskReference(tokens[index] ?? "");
  if (!name) throw new Error(`${file} has an invalid mise run task reference`);
  return name;
}

export function validateMiseTaskReferences(file, source, tasks) {
  for (const line of continuedSourceLines(source)) {
    const pattern = /\bmise(?:\.exe)?\s+run\b/gi;
    for (const match of line.matchAll(pattern)) {
      let reference = line.slice(match.index);
      const inlineEnd = reference.indexOf("`");
      if (inlineEnd !== -1) reference = reference.slice(0, inlineEnd);
      const name = parseMiseTaskReference(file, reference);
      if (name === "<task>") continue;
      if (!Object.hasOwn(tasks, name)) {
        throw new Error(`${file} references unknown mise task: ${name}`);
      }
    }
  }
}

export function validateDocsContract() {
  const generatedPath = path.join(ROOT, GENERATED_DOC);
  if (!fs.existsSync(generatedPath)) {
    throw new Error(`Missing ${GENERATED_DOC}`);
  }
  const committed = fs
    .readFileSync(generatedPath, "utf8")
    .replace(/\r\n/g, "\n");
  if (committed !== generateTaskDocs()) {
    throw new Error("Generated task documentation is stale");
  }

  const tasks = loadTaskDefinitions();
  const maintainedDocs = [
    "README.md",
    "README_EN.md",
    "README_JA.md",
    "CONTRIBUTING.md",
    ...markdownFilesUnder(".github"),
    ...markdownFilesUnder("docs/fyagent/development"),
  ];
  for (const file of [...new Set(maintainedDocs)].sort()) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    validateMiseTaskReferences(file, source, tasks);
  }
  validateStandaloneSetup(
    STANDALONE_SETUP_DOC,
    fs.readFileSync(path.join(ROOT, STANDALONE_SETUP_DOC), "utf8"),
  );
  return {
    ok: true,
    generated: GENERATED_DOC,
    maintainedDocs: [...new Set(maintainedDocs)].sort(),
    standaloneSetup: STANDALONE_SETUP_DOC,
  };
}

if (isMain(import.meta.url)) {
  try {
    console.log(JSON.stringify(validateDocsContract(), null, 2));
  } catch (error) {
    fail(error);
  }
}
