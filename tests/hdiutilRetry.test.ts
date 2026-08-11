import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const RETRY_HDIUTIL = path.join(ROOT, "scripts", "release", "retry-hdiutil.sh");
const temporaryRoots: string[] = [];

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fyagent-hdiutil-"));
  temporaryRoots.push(root);
  const binRoot = path.join(root, "bin");
  const callRoot = path.join(root, "calls");
  const outputPath = path.join(root, "release assets", "FyAgent test.dmg");
  const statePath = path.join(root, "attempt.txt");
  const sleepLog = path.join(root, "sleep.log");
  fs.mkdirSync(binRoot);
  fs.mkdirSync(callRoot);
  fs.mkdirSync(path.dirname(outputPath));

  fs.writeFileSync(
    path.join(binRoot, "hdiutil"),
    `#!/usr/bin/env bash
set -euo pipefail

attempt=0
if [ -f "$FYAGENT_FAKE_STATE" ]; then
  attempt="$(<"$FYAGENT_FAKE_STATE")"
fi
attempt=$((attempt + 1))
printf '%s\n' "$attempt" > "$FYAGENT_FAKE_STATE"

args_file="$FYAGENT_FAKE_CALL_ROOT/args.$attempt"
: > "$args_file"
for argument in "$@"; do
  printf '%s\n' "$argument" >> "$args_file"
done

if [ -e "$FYAGENT_FAKE_OUTPUT" ]; then
  echo 'stale partial output reached hdiutil' >&2
  exit 97
fi

: > "$FYAGENT_FAKE_OUTPUT"
if [ "$attempt" -le "$FYAGENT_FAKE_BUSY_FAILURES" ]; then
  echo 'hdiutil: create failed - Resource busy' >&2
  exit 73
fi
if [ "$FYAGENT_FAKE_MODE" = fail ]; then
  echo 'hdiutil: create failed - permission denied' >&2
  exit 42
fi

echo 'created: fake disk image'
`,
    { mode: 0o755 },
  );
  fs.writeFileSync(
    path.join(binRoot, "sleep"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$1" >> "$FYAGENT_FAKE_SLEEP_LOG"
`,
    { mode: 0o755 },
  );

  function run(
    busyFailures: number,
    mode: "fail" | "succeed",
    hdiutilArguments: string[],
  ) {
    fs.writeFileSync(outputPath, "stale output");
    return spawnSync(
      "bash",
      [RETRY_HDIUTIL, outputPath, "--", ...hdiutilArguments],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          FYAGENT_FAKE_BUSY_FAILURES: String(busyFailures),
          FYAGENT_FAKE_CALL_ROOT: callRoot,
          FYAGENT_FAKE_MODE: mode,
          FYAGENT_FAKE_OUTPUT: outputPath,
          FYAGENT_FAKE_SLEEP_LOG: sleepLog,
          FYAGENT_FAKE_STATE: statePath,
          PATH: `${binRoot}:${process.env.PATH ?? ""}`,
        },
      },
    );
  }

  function calls(): string[][] {
    if (!fs.existsSync(statePath)) return [];
    const count = Number(fs.readFileSync(statePath, "utf8").trim());
    return Array.from({ length: count }, (_, index) =>
      fs
        .readFileSync(path.join(callRoot, `args.${index + 1}`), "utf8")
        .trimEnd()
        .split("\n"),
    );
  }

  function sleeps(): string[] {
    return fs.existsSync(sleepLog)
      ? fs.readFileSync(sleepLog, "utf8").trim().split("\n")
      : [];
  }

  return { calls, outputPath, run, sleeps };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { force: true, recursive: true });
  }
});

describe("hdiutil Resource busy retry", () => {
  it("removes partial output and succeeds after two Resource busy failures", () => {
    const fixture = createFixture();
    const args = [
      "create",
      "-volname",
      "FyAgent",
      "-srcfolder",
      "/tmp/stage",
      "-ov",
      "-format",
      "UDZO",
      fixture.outputPath,
    ];

    const result = fixture.run(2, "succeed", args);

    expect(result.status, result.stderr).toBe(0);
    expect(fixture.calls()).toEqual([args, args, args]);
    expect(fixture.sleeps()).toEqual(["2", "4"]);
    expect(fs.existsSync(fixture.outputPath)).toBe(true);
  });

  it("returns the original status immediately for a non-Resource busy error", () => {
    const fixture = createFixture();
    const args = ["create", "-format", "UDZO", fixture.outputPath];

    const result = fixture.run(0, "fail", args);

    expect(result.status, result.stderr).toBe(42);
    expect(fixture.calls()).toEqual([args]);
    expect(fixture.sleeps()).toEqual([]);
    expect(fs.existsSync(fixture.outputPath)).toBe(false);
  });

  it("stops after five Resource busy failures with bounded backoff", () => {
    const fixture = createFixture();
    const args = ["create", "-format", "UDZO", fixture.outputPath];

    const result = fixture.run(5, "succeed", args);

    expect(result.status, result.stderr).toBe(73);
    expect(fixture.calls()).toEqual([args, args, args, args, args]);
    expect(fixture.sleeps()).toEqual(["2", "4", "8", "16"]);
    expect(fs.existsSync(fixture.outputPath)).toBe(false);
  });

  it("preserves every hdiutil argument without shell re-parsing", () => {
    const fixture = createFixture();
    const args = [
      "create",
      "-volname",
      "Fy Agent * $(unchanged)",
      "-srcfolder",
      "/tmp/stage with spaces",
      "--opaque=value with spaces",
      fixture.outputPath,
    ];

    const result = fixture.run(0, "succeed", args);

    expect(result.status, result.stderr).toBe(0);
    expect(fixture.calls()).toEqual([args]);
    expect(fixture.sleeps()).toEqual([]);
  });
});
