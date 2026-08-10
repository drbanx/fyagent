import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error The task runner executes this JavaScript helper directly.
import { formatFiles } from "../scripts/tasks/format-files.mjs";

const ROOT = path.resolve(__dirname, "..");
const FIXTURE_ROOT = path.join(ROOT, ".fyagent", "test-fixtures");

function withFixture(run: (fixture: string) => void) {
  fs.mkdirSync(FIXTURE_ROOT, { recursive: true });
  const fixture = fs.mkdtempSync(
    path.join(FIXTURE_ROOT, "format-files-contract-"),
  );
  try {
    run(fixture);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

describe("reviewed-file JSONL formatting", () => {
  it("formats every JSONL file and record while preserving JSON token spelling", () => {
    withFixture((fixture) => {
      const first = path.join(fixture, "first.jsonl");
      const second = path.join(fixture, "second.JSONL");
      const ordinary = path.join(fixture, "ordinary.json");
      const relativeFirst = path.relative(ROOT, first);
      const relativeOrdinary = path.relative(ROOT, ordinary);
      fs.writeFileSync(
        first,
        ' { "large": 9007199254740993, "duplicate": 1, "duplicate": 2 } \r\n \t\r\n { "escaped": "\\u0061", "negativeZero": -0 } \r\n',
      );
      fs.writeFileSync(second, " [ true, false, null ] \n");
      fs.writeFileSync(ordinary, '{"ordinary":true}\n');

      const calls: Array<{ command: string; args: string[] }> = [];
      formatFiles(
        [relativeFirst, relativeOrdinary, second],
        (command: string, args: string[]) => calls.push({ command, args }),
      );

      expect(calls).toEqual([
        {
          command: "pnpm",
          args: ["exec", "prettier", "--write", "--", relativeOrdinary],
        },
      ]);
      expect(fs.readFileSync(first, "utf8")).toBe(
        '{"large":9007199254740993,"duplicate":1,"duplicate":2}\n\n{"escaped":"\\u0061","negativeZero":-0}\n',
      );
      expect(fs.readFileSync(second, "utf8")).toBe("[true,false,null]\n");
    });
  });

  it("preflights every JSONL record before invoking Prettier or writing", () => {
    withFixture((fixture) => {
      const valid = path.join(fixture, "valid.jsonl");
      const invalid = path.join(fixture, "invalid.jsonl");
      const ordinary = path.join(fixture, "ordinary.json");
      const validOriginal = ' { "valid": true } \n';
      const invalidOriginal = '{"valid":true}\nnot-json\n';
      fs.writeFileSync(valid, validOriginal);
      fs.writeFileSync(invalid, invalidOriginal);
      fs.writeFileSync(ordinary, '{"ordinary":true}\n');

      let calls = 0;
      expect(() =>
        formatFiles(
          [
            path.relative(ROOT, ordinary),
            path.relative(ROOT, valid),
            path.relative(ROOT, invalid),
          ],
          () => {
            calls += 1;
          },
        ),
      ).toThrow(`Invalid JSONL record at ${path.relative(ROOT, invalid)}:2`);
      expect(calls).toBe(0);
      expect(fs.readFileSync(valid, "utf8")).toBe(validOriginal);
      expect(fs.readFileSync(invalid, "utf8")).toBe(invalidOriginal);
      expect(fs.readFileSync(ordinary, "utf8")).toBe('{"ordinary":true}\n');
    });
  });

  it("does not commit JSONL changes when Prettier fails", () => {
    withFixture((fixture) => {
      const jsonl = path.join(fixture, "context.jsonl");
      const ordinary = path.join(fixture, "ordinary.json");
      const original = ' { "context": true } \n';
      fs.writeFileSync(jsonl, original);
      fs.writeFileSync(ordinary, '{"ordinary":true}\n');

      expect(() =>
        formatFiles(
          [path.relative(ROOT, jsonl), path.relative(ROOT, ordinary)],
          () => {
            throw new Error("Prettier failed");
          },
        ),
      ).toThrow("Prettier failed");
      expect(fs.readFileSync(jsonl, "utf8")).toBe(original);
    });
  });

  it("preserves JSONL drift observed by the precommit check", () => {
    withFixture((fixture) => {
      const jsonl = path.join(fixture, "context.jsonl");
      const ordinary = path.join(fixture, "ordinary.json");
      const concurrent = '{"concurrent":true}\n';
      fs.writeFileSync(jsonl, ' { "context": true } \n');
      fs.writeFileSync(ordinary, '{"ordinary":true}\n');

      expect(() =>
        formatFiles(
          [path.relative(ROOT, jsonl), path.relative(ROOT, ordinary)],
          () => fs.writeFileSync(jsonl, concurrent),
        ),
      ).toThrow(
        `JSONL target changed after preflight: ${path.relative(ROOT, jsonl)}`,
      );
      expect(fs.readFileSync(jsonl, "utf8")).toBe(concurrent);
    });
  });

  it("rejects invalid UTF-8 without invoking Prettier", () => {
    withFixture((fixture) => {
      const jsonl = path.join(fixture, "invalid-utf8.jsonl");
      const original = Buffer.from([0x7b, 0x22, 0xff, 0x22, 0x7d]);
      fs.writeFileSync(jsonl, original);

      let calls = 0;
      expect(() =>
        formatFiles([path.relative(ROOT, jsonl)], () => {
          calls += 1;
        }),
      ).toThrow(`Invalid UTF-8 in JSONL file: ${path.relative(ROOT, jsonl)}`);
      expect(calls).toBe(0);
      expect(fs.readFileSync(jsonl)).toEqual(original);
    });
  });

  it("rejects non-JSON whitespace instead of silently deleting its record", () => {
    withFixture((fixture) => {
      const jsonl = path.join(fixture, "non-json-whitespace.jsonl");
      const original = '{"valid":true}\n\u00a0\n';
      fs.writeFileSync(jsonl, original);

      expect(() =>
        formatFiles([path.relative(ROOT, jsonl)], () => {
          throw new Error("Prettier must not run");
        }),
      ).toThrow(`Invalid JSONL record at ${path.relative(ROOT, jsonl)}:2`);
      expect(fs.readFileSync(jsonl, "utf8")).toBe(original);
    });
  });

  it("rejects a UTF-8 BOM instead of conditionally dropping it", () => {
    withFixture((fixture) => {
      const jsonl = path.join(fixture, "bom.jsonl");
      const original = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('{"valid":true}\n'),
      ]);
      fs.writeFileSync(jsonl, original);

      expect(() =>
        formatFiles([path.relative(ROOT, jsonl)], () => {
          throw new Error("Prettier must not run");
        }),
      ).toThrow(`Invalid JSONL record at ${path.relative(ROOT, jsonl)}:1`);
      expect(fs.readFileSync(jsonl)).toEqual(original);
    });
  });
});
