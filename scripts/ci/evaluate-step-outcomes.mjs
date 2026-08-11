#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

const KNOWN_OUTCOMES = new Set(["success", "failure", "cancelled", "skipped"]);

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function parseRequiredStepIds(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("CI_REQUIRED_STEPS must list at least one step id");
  }

  const ids = value.split(",");
  if (
    ids.some((id) => !/^[a-z][a-z0-9-]*$/.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    throw new Error(
      "CI_REQUIRED_STEPS must contain unique comma-separated lowercase step ids",
    );
  }
  return ids;
}

export function evaluateStepOutcomes(steps, requiredStepIds) {
  if (!isPlainObject(steps)) {
    return {
      ok: false,
      results: [],
      errors: ["CI_STEP_RESULTS must be a JSON object"],
    };
  }

  const results = [];
  const errors = [];
  for (const id of requiredStepIds) {
    const step = steps[id];
    if (!isPlainObject(step)) {
      errors.push(`${id}: missing step result`);
      continue;
    }

    const { outcome, conclusion } = step;
    if (!KNOWN_OUTCOMES.has(outcome)) {
      errors.push(`${id}: unknown outcome ${JSON.stringify(outcome)}`);
      continue;
    }
    if (!KNOWN_OUTCOMES.has(conclusion)) {
      errors.push(`${id}: unknown conclusion ${JSON.stringify(conclusion)}`);
      continue;
    }

    results.push({ id, outcome, conclusion });
    if (outcome !== "success") {
      errors.push(`${id}: ${outcome}`);
    }
  }

  return { ok: errors.length === 0, results, errors };
}

export function runStepOutcomeCli(env = process.env) {
  try {
    const requiredStepIds = parseRequiredStepIds(env.CI_REQUIRED_STEPS);
    if (typeof env.CI_STEP_RESULTS !== "string") {
      throw new Error("CI_STEP_RESULTS is required");
    }
    const report = evaluateStepOutcomes(
      JSON.parse(env.CI_STEP_RESULTS),
      requiredStepIds,
    );

    for (const result of report.results) {
      console.log(`${result.id}: ${result.outcome}`);
    }
    if (!report.ok) {
      for (const error of report.errors) {
        console.error(`CI diagnostic failed: ${error}`);
      }
      return 1;
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exitCode = runStepOutcomeCli();
}
