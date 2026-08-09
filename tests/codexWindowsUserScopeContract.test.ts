import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf8").replace(/\r\n/g, "\n");

const startup = read("src-tauri/src/windows_runtime/native.rs");
const startupDomain = read("src-tauri/src/windows_runtime/mod.rs");
const deployment = read(
  "src-tauri/src/codex_desktop/platform/windows/deployment.rs",
);
const adapter = read("src-tauri/src/codex_desktop/platform/windows/mod.rs");
const runtime = read("src-tauri/src/codex_desktop/platform/windows/runtime.rs");
const ci = read(".github/workflows/ci.yml");

describe("Codex Windows interactive-user contract", () => {
  it("uses the Shell process as the sole ordinary startup identity proof", () => {
    expect(startup).not.toContain("WTSQueryUserToken");
    expect(startup).toContain("GetShellWindow");
    expect(startup).toContain("GetWindowThreadProcessId");
    expect(startup).toContain("ProcessIdToSessionId");
    expect(startup).toContain("OpenProcessToken");
    expect(startup).toContain("TokenUser");

    expect(startupDomain).toContain("struct InteractiveUserContext");
    expect(startupDomain).toContain("process_session_id");
    expect(startupDomain).toContain("shell_session_id");
    expect(startupDomain).toContain("canonical_sid");
    expect(startupDomain).not.toMatch(
      /derive\([^)]*(?:Serialize|Deserialize)[^)]*\)\s*\n[^\n]*InteractiveUserContext/,
    );
  });

  it("keeps the explicit-SID Main query separate from all-users staging", () => {
    expect(
      deployment.match(/FindPackagesByUserSecurityIdWithPackageTypes/g),
    ).toHaveLength(1);
    expect(deployment.match(/PackageTypes::Main/g)).toHaveLength(1);
    expect(deployment.match(/\.FindPackages\(\)/g)).toHaveLength(1);
    expect(deployment).not.toContain("FindPackagesWithPackageTypes");
    expect(deployment).toMatch(
      /fn staged_package_family_name\([\s\S]*?\.FindPackages\(\)/,
    );

    const ordinaryFacade = deployment.match(
      /trait WindowsPackageManager[\s\S]*?\n}/,
    )?.[0];
    expect(ordinaryFacade).toBeDefined();
    expect(ordinaryFacade).not.toMatch(/all[_-]?users|FindPackages/);
  });

  it("threads the frozen context through inventory, deployment, runtime, and launch", () => {
    expect(adapter).toContain("Arc<InteractiveUserContext>");
    expect(deployment).toContain("InteractiveUserContext");
    expect(deployment).toMatch(/packages_for_user\s*\(/);
    expect(deployment).toMatch(/deploy_current_user\s*\(/);
    expect(deployment).toMatch(/launch_aumid\s*\(/);
    expect(deployment).toContain(
      "revalidate_interactive_user_context(context)",
    );
    expect(runtime).toContain("OpenProcessToken");
    expect(runtime).toContain("TokenUser");
    expect(runtime).toContain("revalidate_interactive_user_context(context)");
    expect(runtime).toContain(
      "user_sid_matches_context(context, process_sid.as_deref())",
    );
    expect(startup).toMatch(
      /pub\(super\) fn revalidate_interactive_user_context\([\s\S]{0,800}interactive_user_proof_matches_context\(/,
    );
  });

  it("uses aligned backing storage for native SID structures", () => {
    for (const source of [startup, deployment, runtime]) {
      expect(source).not.toMatch(
        /vec!\[0_u8; required as usize\][\s\S]{0,500}cast::<TOKEN_USER>/,
      );
    }
    expect(startup).not.toContain("[0_u8; SECURITY_MAX_SID_SIZE as usize]");
  });

  it("runs the one native adapter smoke on both matching Windows architectures", () => {
    expect(ci).toContain("windows-2025");
    expect(ci).toContain("windows-11-arm");
    expect(ci).toContain("rust_host: x86_64-pc-windows-msvc");
    expect(ci).toContain("rust_host: aarch64-pc-windows-msvc");
    expect(ci).toContain("$env:RUNNER_ARCH -cne '${{ matrix.architecture }}'");
    expect(ci).toContain("--target '${{ matrix.rust_host }}'");
    expect(ci).toContain(
      "codex_desktop::platform::windows::deployment::tests::native_explicit_sid_main_query_smoke",
    );
    expect(ci).toContain("test result: ok\\. 1 passed; 0 failed");
    expect(deployment).toMatch(
      /fn native_explicit_sid_main_query_smoke\(\)[\s\S]*packages_for_user_sid_main\("not-a-windows-sid"\)/,
    );
  });
});
