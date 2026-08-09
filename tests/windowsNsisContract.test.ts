import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error The release workflow executes this dependency-free helper directly.
import * as nsisContractModule from "../scripts/release/verify-windows-nsis-contract.mjs";

type VerificationResult = Readonly<{
  lifecyclePath: string;
  sectionOrder: string[];
  upstream: Readonly<{ tag: string; commit: string; sha256: string }>;
  workspaceVersion: string;
}>;

const ROOT = path.resolve(__dirname, "..");
const GIT_ATTRIBUTES = path.join(ROOT, ".gitattributes");
const BASE_CONFIG = path.join(ROOT, "src-tauri", "tauri.conf.json");
const WINDOWS_CONFIG = path.join(ROOT, "src-tauri", "tauri.windows.conf.json");
const TEMPLATE = path.join(ROOT, "src-tauri", "nsis", "installer.nsi");
const WEBVIEW_SOURCE = path.join(
  ROOT,
  "src-tauri",
  "nsis",
  "install-webview2-bootstrapper.ps1",
);
const WEBVIEW_LOADER = path.join(
  ROOT,
  "src-tauri",
  "nsis",
  "load-encoded-webview2-command.ps1",
);
const WEBVIEW_INCLUDE = path.join(
  ROOT,
  "src-tauri",
  "nsis",
  "webview2-command.nsh",
);
const LIFECYCLE = path.join(
  ROOT,
  "scripts",
  "release",
  "verify-windows-nsis-lifecycle.ps1",
);
const ROOT_ONLY_FIXTURE = path.join(
  ROOT,
  "tests",
  "fixtures",
  "windows-nsis",
  "root-only-mounted-volume-validator.nsi",
);
const LEXICAL_VOLUME_FIXTURE = path.join(
  ROOT,
  "tests",
  "fixtures",
  "windows-nsis",
  "lexical-mounted-volume-validator.nsi",
);
const temporaryRoots: string[] = [];

const verifyWindowsNsisContract =
  nsisContractModule.verifyWindowsNsisContract as (options?: {
    baseConfigPath?: string;
    windowsConfigPath?: string;
    templatePath?: string;
    cargoManifestPath?: string;
    webviewSourcePath?: string;
    webviewLoaderPath?: string;
    webviewIncludePath?: string;
    lifecyclePath?: string;
  }) => VerificationResult;
const assertFinalPathValidatorContract =
  nsisContractModule.assertFinalPathValidatorContract as (
    source: string,
  ) => void;
const canonicalizeGzipHeader = nsisContractModule.canonicalizeGzipHeader as (
  compressed: Uint8Array,
) => Buffer;
const gzipDeterministically = nsisContractModule.gzipDeterministically as (
  payload: Uint8Array,
) => Buffer;

function temporaryFile(name: string, source: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fyagent-nsis-contract-"));
  temporaryRoots.push(root);
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, source);
  return filePath;
}

function verifyTemplate(source: string): VerificationResult {
  return verifyWindowsNsisContract({
    baseConfigPath: BASE_CONFIG,
    windowsConfigPath: WINDOWS_CONFIG,
    templatePath: temporaryFile("installer.nsi", source),
  });
}

function encodedIncludeForSource(source: string): string {
  const include = fs.readFileSync(WEBVIEW_INCLUDE, "utf8");
  const encoded = gzipDeterministically(
    Buffer.from(source, "utf16le"),
  ).toString("base64");
  const chunks = encoded.match(/.{1,768}/gu) ?? [];
  const declaredCount = Number.parseInt(
    include.match(/FYAGENT_WEBVIEW2_COMMAND_CHUNK_COUNT (\d+)/u)?.[1] ?? "0",
    10,
  );
  expect(chunks).toHaveLength(declaredCount);
  let updated = include;
  for (let index = 0; index < chunks.length; index += 1) {
    const suffix = String(index).padStart(2, "0");
    updated = updated.replace(
      new RegExp(
        `(!define FYAGENT_WEBVIEW2_COMMAND_${suffix} ")[^"]+("$)`,
        "mu",
      ),
      `$1${chunks[index]}$2`,
    );
  }
  return updated;
}

function encodedIncludeForLoader(loader: string): string {
  return fs
    .readFileSync(WEBVIEW_INCLUDE, "utf8")
    .replace(
      /(^!define FYAGENT_WEBVIEW2_LOADER_BASE64 ")[A-Za-z0-9+/=]+("$)/mu,
      `$1${Buffer.from(loader, "utf16le").toString("base64")}$2`,
    );
}

afterAll(() => {
  for (const root of temporaryRoots) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("Windows NSIS installer contract", () => {
  it("pins Tauri 2.8.1 and validates the complete checked-in contract", () => {
    const result = verifyWindowsNsisContract();
    expect(result.upstream).toEqual({
      tag: "tauri-cli-v2.8.1",
      commit: "662b39adb33d1d26f0de213e5a04fc4116fd0683",
      sha256:
        "fe22026f68bdb3292fab376756035496ce0a35e3d580e06ebaa6a28295916eb3",
    });
    expect(result.sectionOrder).toEqual([
      "-FyAgentInstallDirGate",
      "-FyAgentMachineRuntimeBootstrap",
      "EarlyChecks",
      "WebView2",
      "Install",
      "Uninstall",
    ]);
  });

  it("rejects the mounted-volume bypass in a root-only drive fixture", () => {
    const fixture = fs.readFileSync(ROOT_ONLY_FIXTURE, "utf8");
    expect(() => assertFinalPathValidatorContract(fixture)).toThrow(
      /missing GetVolumePathNameW/u,
    );
  });

  it("rejects lexical volume checks that do not follow reparse targets", () => {
    const fixture = fs.readFileSync(LEXICAL_VOLUME_FIXTURE, "utf8");
    expect(() => assertFinalPathValidatorContract(fixture)).toThrow(
      /missing CreateFileW/u,
    );
  });

  it("rejects moving the shared path gate behind WebView2 writes", () => {
    const source = fs.readFileSync(TEMPLATE, "utf8");
    const gate = source.match(
      /Section -FyAgentInstallDirGate[\s\S]*?SectionEnd\n/u,
    )?.[0];
    expect(gate).toBeTruthy();
    const lateGate = source
      .replace(gate ?? "", "")
      .replace(/(Section WebView2[\s\S]*?SectionEnd\n)/u, `$1\n${gate ?? ""}`);
    expect(() => verifyTemplate(lateGate)).toThrow(
      /path gate must be the first executable section/u,
    );
  });

  it("rejects a required drive-classification call hidden in an NSIS comment", () => {
    const source = fs
      .readFileSync(TEMPLATE, "utf8")
      .replace(
        /^\s*System::Call 'kernel32::GetDriveTypeW\(w r3\) i \.r2'$/mu,
        "    ; System::Call 'kernel32::GetDriveTypeW(w r3) i .r2'",
      );
    expect(() => verifyTemplate(source)).toThrow(
      /path validator is missing GetDriveTypeW/u,
    );
  });

  it("rejects ancestor peeling on any error outside the not-found allow-list", () => {
    const source = fs
      .readFileSync(TEMPLATE, "utf8")
      .replace(
        "${AndIf} $9 <> ${FYAGENT_ERROR_PATH_NOT_FOUND}",
        "${AndIf} $9 == ${FYAGENT_ERROR_PATH_NOT_FOUND}",
      );
    expect(() => verifyTemplate(source)).toThrow(
      /ancestor peeling must allow only FILE_NOT_FOUND\/PATH_NOT_FOUND/u,
    );
  });

  it("rejects path-based ACL repair of an unsafe ProgramData preimage", () => {
    const source = fs
      .readFileSync(TEMPLATE, "utf8")
      .replace(
        "Function FyAgentProvisionMachineRuntime",
        "Function FyAgentProvisionMachineRuntime\n  nsExec::ExecToStack 'icacls \"$COMMONAPPDATA\\FyAgent\" /grant:r Administrators:F'",
      );
    expect(() => verifyTemplate(source)).toThrow(
      /must not repair path-based ACLs/u,
    );
  });

  it("rejects removal of handle-based trusted legacy disposition", () => {
    const source = fs
      .readFileSync(TEMPLATE, "utf8")
      .replace("SetFileInformationByHandle", "SetFileInformationByPath");
    expect(() => verifyTemplate(source)).toThrow(
      /handle-based runtime disposition/u,
    );
  });

  it("rejects reintroduced MSI or WiX migration behavior", () => {
    const source = fs
      .readFileSync(TEMPLATE, "utf8")
      .replace(
        "Section EarlyChecks",
        "Section EarlyChecks\n  ExecWait 'msiexec /x legacy.msi' $0",
      );
    expect(() => verifyTemplate(source)).toThrow(
      /retired MSI\/WiX migration logic remains executable/u,
    );
  });

  it("rejects recursive deletion of a caller-selected install directory", () => {
    const source = fs
      .readFileSync(TEMPLATE, "utf8")
      .replace('RMDir "$INSTDIR"', 'RMDir /r "$INSTDIR"');
    expect(() => verifyTemplate(source)).toThrow(
      /must never recursively delete a caller-selected \$INSTDIR/u,
    );
  });

  it("rejects drift between the compressed include and repo-owned WebView2 source", () => {
    const include = fs.readFileSync(WEBVIEW_INCLUDE, "utf8");
    const mutated = include.replace(
      /(!define FYAGENT_WEBVIEW2_COMMAND_00 ")([A-Za-z])/u,
      (_match, prefix: string, character: string) =>
        `${prefix}${character === "A" ? "B" : "A"}`,
    );
    const includePath = temporaryFile("webview2-command.nsh", mutated);
    expect(() =>
      verifyWindowsNsisContract({
        baseConfigPath: BASE_CONFIG,
        windowsConfigPath: WINDOWS_CONFIG,
        templatePath: TEMPLATE,
        webviewIncludePath: includePath,
      }),
    ).toThrow(/deterministic level-9 gzip/u);
  });

  it("canonicalizes the gzip OS header and pins NSIS text inputs to LF", () => {
    const payload = Buffer.from("FyAgent portable gzip fixture", "utf8");
    const hostSpecific = gzipSync(payload, { level: 9 });
    hostSpecific[9] = 10;
    const canonical = canonicalizeGzipHeader(hostSpecific);

    expect(hostSpecific[9]).toBe(10);
    expect(canonical[9]).toBe(255);
    expect(gunzipSync(canonical)).toEqual(payload);
    expect(gzipDeterministically(payload)[9]).toBe(255);

    const attributes = fs.readFileSync(GIT_ATTRIBUTES, "utf8");
    for (const extension of ["ps1", "nsi", "nsh"]) {
      expect(attributes).toMatch(
        new RegExp(`^\\*\\.${extension} text eol=lf$`, "mu"),
      );
    }
  });

  it("locks a PowerShell 5.1-safe loader and rejects unary-comma method arguments", () => {
    const loader = fs.readFileSync(WEBVIEW_LOADER, "utf8");
    expect(loader).toContain(
      "$c=[byte[]][Convert]::FromBase64String($e);$m=[IO.MemoryStream]::new($c)",
    );
    expect(loader).toContain(
      "[IO.Compression.GZipStream]::new($m,[IO.Compression.CompressionMode]0)",
    );
    expect(loader).not.toMatch(/\[IO\.MemoryStream\]::new\(\s*,/u);
    const incompatible = loader.replace(
      "$c=[byte[]][Convert]::FromBase64String($e);$m=[IO.MemoryStream]::new($c)",
      "$m=[IO.MemoryStream]::new(,[Convert]::FromBase64String($e))",
    );
    const loaderPath = temporaryFile(
      "load-encoded-webview2-command.ps1",
      incompatible,
    );
    const includePath = temporaryFile(
      "webview2-command.nsh",
      encodedIncludeForLoader(incompatible),
    );
    expect(() =>
      verifyWindowsNsisContract({
        baseConfigPath: BASE_CONFIG,
        windowsConfigPath: WINDOWS_CONFIG,
        templatePath: TEMPLATE,
        webviewLoaderPath: loaderPath,
        webviewIncludePath: includePath,
      }),
    ).toThrow(/PowerShell 5\.1-safe byte-array MemoryStream constructor/u);

    const ambiguousGzip = loader.replace(
      "[IO.Compression.CompressionMode]0",
      "0",
    );
    expect(() =>
      verifyWindowsNsisContract({
        baseConfigPath: BASE_CONFIG,
        windowsConfigPath: WINDOWS_CONFIG,
        templatePath: TEMPLATE,
        webviewLoaderPath: temporaryFile(
          "load-encoded-webview2-command.ps1",
          ambiguousGzip,
        ),
        webviewIncludePath: temporaryFile(
          "webview2-command.nsh",
          encodedIncludeForLoader(ambiguousGzip),
        ),
      }),
    ).toThrow(/typed PowerShell 5\.1-safe GZip decompression mode/u);
  });

  it("rejects an unqualified elevated PowerShell security command", () => {
    const source = fs
      .readFileSync(WEBVIEW_SOURCE, "utf8")
      .replace(
        "Microsoft.PowerShell.Security\\Get-AuthenticodeSignature",
        "Get-AuthenticodeSignature",
      );
    const sourcePath = temporaryFile(
      "install-webview2-bootstrapper.ps1",
      source,
    );
    const includePath = temporaryFile(
      "webview2-command.nsh",
      encodedIncludeForSource(source),
    );
    expect(() =>
      verifyWindowsNsisContract({
        baseConfigPath: BASE_CONFIG,
        windowsConfigPath: WINDOWS_CONFIG,
        templatePath: TEMPLATE,
        webviewSourcePath: sourcePath,
        webviewIncludePath: includePath,
      }),
    ).toThrow(/unqualified module command/u);
  });

  it("rejects a WebView2 body read that is not bounded by the shared token", () => {
    const source = fs
      .readFileSync(WEBVIEW_SOURCE, "utf8")
      .replace(
        "$responseStream.ReadAsync(\n      $buffer,\n      0,\n      $buffer.Length,\n      $cancellation.Token\n    )",
        "$responseStream.ReadAsync(\n      $buffer,\n      0,\n      $buffer.Length\n    )",
      );
    const sourcePath = temporaryFile(
      "install-webview2-bootstrapper.ps1",
      source,
    );
    const includePath = temporaryFile(
      "webview2-command.nsh",
      encodedIncludeForSource(source),
    );
    expect(() =>
      verifyWindowsNsisContract({
        baseConfigPath: BASE_CONFIG,
        windowsConfigPath: WINDOWS_CONFIG,
        templatePath: TEMPLATE,
        webviewSourcePath: sourcePath,
        webviewIncludePath: includePath,
      }),
    ).toThrow(/cancellation token must bound both/u);
  });

  it.each([
    ["65535.65535.65535", true],
    ["65536.0.0", false],
    ["9007199254740993.0.0", false],
  ])(
    "gates canonical Cargo version %s before NSIS packaging",
    (version, accepted) => {
      const cargoManifestPath = temporaryFile(
        "Cargo.toml",
        `[workspace.package]\nversion = "${version}"\n`,
      );
      const verify = () =>
        verifyWindowsNsisContract({
          baseConfigPath: BASE_CONFIG,
          windowsConfigPath: WINDOWS_CONFIG,
          templatePath: TEMPLATE,
          cargoManifestPath,
        });
      if (accepted) {
        expect(verify().workspaceVersion).toBe(version);
      } else {
        expect(verify).toThrow(/cannot be bundled by NSIS/u);
      }
    },
  );

  it("authorizes destructive cleanup only after clean preconditions and preserves user parents", () => {
    const lifecycle = fs.readFileSync(LIFECYCLE, "utf8");
    expect(lifecycle).toContain("$cleanupAuthorized = $false");
    expect(lifecycle.indexOf("$cleanupAuthorized = $true")).toBeGreaterThan(
      lifecycle.indexOf("A pre-existing ProgramData\\FyAgent"),
    );
    expect(lifecycle).toMatch(
      /finally \{[\s\S]*?if \(\$cleanupAuthorized\) \{[\s\S]*?Invoke-BestEffortNsisUninstall/u,
    );
    expect(lifecycle).toContain("$sentinelParentsCreatedByTest");
    expect(lifecycle).not.toContain(
      "Remove-Item -LiteralPath $userProfileFyagentDirectory",
    );
  });

  it("rejects making the required native unsupported-drive cases unreachable", () => {
    const lifecycle = fs.readFileSync(LIFECYCLE, "utf8");
    const blockStart = lifecycle.indexOf(
      "  $unsupportedDriveCaseCount = Invoke-RequiredUnsupportedDriveAcceptance `",
    );
    const blockEnd = lifecycle.indexOf(
      "\n\n  # CASE: default-install",
      blockStart,
    );
    expect(blockStart).toBeGreaterThanOrEqual(0);
    expect(blockEnd).toBeGreaterThan(blockStart);
    const block = lifecycle.slice(blockStart, blockEnd);
    const unreachable = `  if ($false) {\n${block
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n")}\n  }`;
    const lifecyclePath = temporaryFile(
      "verify-windows-nsis-lifecycle.ps1",
      `${lifecycle.slice(0, blockStart)}${unreachable}${lifecycle.slice(blockEnd)}`,
    );
    expect(() =>
      verifyWindowsNsisContract({
        baseConfigPath: BASE_CONFIG,
        windowsConfigPath: WINDOWS_CONFIG,
        templatePath: TEMPLATE,
        lifecyclePath,
      }),
    ).toThrow(/must be invoked unconditionally/u);
  });

  it("rejects accepting zero executed native unsupported-drive cases", () => {
    const lifecycle = fs
      .readFileSync(LIFECYCLE, "utf8")
      .replace(
        "  if ($unsupportedDriveCaseCount -ne 2) {",
        "  if ($unsupportedDriveCaseCount -ne 0) {",
      );
    const lifecyclePath = temporaryFile(
      "verify-windows-nsis-lifecycle.ps1",
      lifecycle,
    );
    expect(() =>
      verifyWindowsNsisContract({
        baseConfigPath: BASE_CONFIG,
        windowsConfigPath: WINDOWS_CONFIG,
        templatePath: TEMPLATE,
        lifecyclePath,
      }),
    ).toThrow(/require exactly two cases/u);
  });

  it.each([
    "# CASE: webview2-signed-space-unicode-verify",
    "# CASE: webview2-current-user-fake-root-negative",
  ])("rejects deletion of the native lifecycle case %s", (caseLabel) => {
    const lifecycle = fs.readFileSync(LIFECYCLE, "utf8").replace(caseLabel, "");
    const lifecyclePath = temporaryFile(
      "verify-windows-nsis-lifecycle.ps1",
      lifecycle,
    );
    expect(() =>
      verifyWindowsNsisContract({
        baseConfigPath: BASE_CONFIG,
        windowsConfigPath: WINDOWS_CONFIG,
        templatePath: TEMPLATE,
        lifecyclePath,
      }),
    ).toThrow(/native lifecycle is missing CASE:/u);
  });

  it("rejects a Windows config that reintroduces install-scope choice", () => {
    const config = JSON.parse(fs.readFileSync(WINDOWS_CONFIG, "utf8")) as {
      bundle: { windows: { nsis: { installMode: string } } };
    };
    config.bundle.windows.nsis.installMode = "both";
    const configPath = temporaryFile(
      "tauri.windows.conf.json",
      `${JSON.stringify(config, null, 2)}\n`,
    );
    expect(() =>
      verifyWindowsNsisContract({
        baseConfigPath: BASE_CONFIG,
        windowsConfigPath: configPath,
        templatePath: TEMPLATE,
      }),
    ).toThrow(/installMode must be perMachine/u);
  });
});
