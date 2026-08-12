#!/usr/bin/env node

import process from "node:process";
import { run, usageBoolean } from "./lib.mjs";

export const REQUIREMENTS = Object.freeze({
  darwin: {
    commands: [
      ["git", ["--version"], "Install the Xcode command-line tools."],
      ["xcode-select", ["-p"], "Run xcode-select --install interactively."],
      ["xcrun", ["--find", "clang"], "Install the Xcode command-line tools."],
    ],
  },
  win32: {
    commands: [
      ["git", ["--version"], "Install Git for Windows."],
      [
        "where.exe",
        ["cl.exe"],
        "Open a Visual Studio 2022 Developer shell with the Desktop C++ workload.",
      ],
      [
        "reg.exe",
        [
          "query",
          "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients",
          "/s",
          "/f",
          "WebView2 Runtime",
        ],
        "Install the Microsoft Edge WebView2 Evergreen Runtime.",
      ],
    ],
  },
});

function inspect(platform) {
  const requirements = REQUIREMENTS[platform];
  if (!requirements) {
    return {
      ok: false,
      platform,
      checks: [
        {
          name: "supported-host",
          ok: false,
          hint: `Unsupported host platform: ${platform}`,
        },
      ],
    };
  }
  const checks = [];
  for (const [command, args, hint] of requirements.commands) {
    const result = probe(command, args);
    checks.push({
      name: `${command} ${args.join(" ")}`,
      ok: result.status === 0,
      hint: result.status === 0 ? undefined : hint,
    });
  }
  return { ok: checks.every((check) => check.ok), platform, checks };
}

function probe(command, args) {
  try {
    return run(command, args, { capture: true, allowFailure: true });
  } catch (error) {
    return {
      status: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

const describeIndex = process.argv.indexOf("--describe-platform");
if (describeIndex >= 0) {
  const platform = process.argv[describeIndex + 1];
  const requirements = REQUIREMENTS[platform];
  if (!requirements) {
    console.error(`Unknown platform: ${platform ?? ""}`);
    process.exit(2);
  }
  console.log(JSON.stringify({ platform, requirements }, null, 2));
} else {
  const report = inspect(process.platform);
  if (usageBoolean("json") || process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`System prerequisites (${report.platform}):`);
    for (const check of report.checks) {
      console.log(`  ${check.ok ? "PASS" : "FAIL"} ${check.name}`);
      if (check.hint) console.log(`       ${check.hint}`);
    }
  }
  if (!report.ok) process.exitCode = 1;
}
