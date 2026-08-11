import { describe, expect, it, vi } from "vitest";
// @ts-expect-error The workflow executes this dependency-free JavaScript helper directly.
import * as stepOutcomesModule from "../scripts/ci/evaluate-step-outcomes.mjs";

type StepOutcomeReport = {
  ok: boolean;
  results: Array<{ id: string; outcome: string; conclusion: string }>;
  errors: string[];
};

const evaluateStepOutcomes = stepOutcomesModule.evaluateStepOutcomes as (
  steps: unknown,
  requiredStepIds: string[],
) => StepOutcomeReport;
const parseRequiredStepIds = stepOutcomesModule.parseRequiredStepIds as (
  value: unknown,
) => string[];
const runStepOutcomeCli = stepOutcomesModule.runStepOutcomeCli as (
  env?: Record<string, string | undefined>,
) => number;

const success = Object.freeze({
  outputs: {},
  outcome: "success",
  conclusion: "success",
});

describe("CI collected step outcome evaluator", () => {
  it("accepts every required diagnostic only when its raw outcome succeeded", () => {
    expect(
      evaluateStepOutcomes(
        { check: success, clippy: success, tests: success },
        ["check", "clippy", "tests"],
      ),
    ).toEqual({
      ok: true,
      results: [
        { id: "check", outcome: "success", conclusion: "success" },
        { id: "clippy", outcome: "success", conclusion: "success" },
        { id: "tests", outcome: "success", conclusion: "success" },
      ],
      errors: [],
    });
  });

  it("fails on the pre-continue-on-error outcome instead of the rewritten conclusion", () => {
    const report = evaluateStepOutcomes(
      {
        check: success,
        clippy: {
          outputs: {},
          outcome: "failure",
          conclusion: "success",
        },
        tests: {
          outputs: {},
          outcome: "skipped",
          conclusion: "skipped",
        },
      },
      ["check", "clippy", "tests"],
    );

    expect(report.ok).toBe(false);
    expect(report.errors).toEqual(["clippy: failure", "tests: skipped"]);
  });

  it("fails closed on missing, malformed, duplicate, or unknown step data", () => {
    expect(evaluateStepOutcomes({}, ["clippy"]).errors).toEqual([
      "clippy: missing step result",
    ]);
    expect(
      evaluateStepOutcomes(
        { clippy: { outcome: "neutral", conclusion: "success" } },
        ["clippy"],
      ).errors,
    ).toEqual(['clippy: unknown outcome "neutral"']);
    expect(() => parseRequiredStepIds("clippy,clippy")).toThrow(
      "unique comma-separated lowercase step ids",
    );
    expect(() => parseRequiredStepIds("Clippy")).toThrow(
      "unique comma-separated lowercase step ids",
    );
  });

  it("returns a failing CLI status after reporting every collected failure", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    expect(
      runStepOutcomeCli({
        CI_REQUIRED_STEPS: "check,clippy,tests",
        CI_STEP_RESULTS: JSON.stringify({
          check: success,
          clippy: {
            outputs: {},
            outcome: "failure",
            conclusion: "success",
          },
          tests: {
            outputs: {},
            outcome: "failure",
            conclusion: "success",
          },
        }),
      }),
    ).toBe(1);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      "check: success",
      "clippy: failure",
      "tests: failure",
    ]);
    expect(error.mock.calls.map(([line]) => line)).toEqual([
      "CI diagnostic failed: clippy: failure",
      "CI diagnostic failed: tests: failure",
    ]);

    log.mockRestore();
    error.mockRestore();
  });
});
