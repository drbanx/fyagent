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

function powershellFunctionBlock(
  source: string,
  name: string,
  nextName: string,
): string {
  const start = source.indexOf(`function ${name} {`);
  const end = source.indexOf(`\nfunction ${nextName} {`, start + 1);
  if (start < 0 || end <= start) {
    throw new Error(`PowerShell function ${name} is missing or unterminated`);
  }
  return source.slice(start, end);
}

function powershellCaseBody(
  source: string,
  name: string,
  nextMarker: string,
): string {
  const marker = `  # CASE: ${name}\n`;
  const start = source.indexOf(marker);
  const end = source.indexOf(nextMarker, start + marker.length);
  if (start < 0 || end <= start) {
    throw new Error(`PowerShell case ${name} is missing or unterminated`);
  }
  return withoutPowerShellComments(
    source.slice(start + marker.length, end),
  ).trim();
}

function withoutPowerShellComments(source: string): string {
  return source.replace(/<#[\s\S]*?#>/gu, "").replace(/#[^\r\n]*/gu, "");
}

function powershellBraceDepthBetween(
  source: string,
  start: number,
  end: number,
): number {
  const executable = withoutPowerShellComments(source.slice(start, end));
  return [...executable].reduce((depth, character) => {
    if (character === "{") return depth + 1;
    if (character === "}") return depth - 1;
    return depth;
  }, 0);
}

function requireExecutableMarker(
  source: string,
  marker: string,
  description: string,
): void {
  if (!source.includes(marker)) {
    throw new Error(`native lifecycle is missing ${description}: ${marker}`);
  }
}

function assertBoundedLifecycleProcessContract(source: string): void {
  const executable = withoutPowerShellComments(source);
  if (/Start-Process[\s\S]{0,320}?\s-Wait\b/u.test(executable)) {
    throw new Error("native lifecycle must not use Start-Process -Wait");
  }
  if (/\.WaitForExit\(\s*\)/u.test(executable)) {
    throw new Error("native lifecycle contains an unbounded WaitForExit call");
  }

  for (const timeout of [
    "$nsisProcessTimeoutMilliseconds = 10 * 60 * 1000",
    "$cleanupNsisTimeoutMilliseconds = 2 * 60 * 1000",
    "$signatureVerifierTimeoutMilliseconds = 3 * 60 * 1000",
    "$nativeToolTimeoutMilliseconds = 2 * 60 * 1000",
    "$processRootExitAfterTreeKillTimeoutMilliseconds = 15 * 1000",
    "$redirectedOutputDrainTimeoutMilliseconds = 15 * 1000",
  ]) {
    requireExecutableMarker(executable, timeout, "bounded timeout");
  }

  const stopTree = powershellFunctionBlock(
    executable,
    "Stop-CaseOwnedProcessTree",
    "Receive-RedirectedProcessOutput",
  );
  for (const marker of [
    "$Process.Kill($true)",
    "$Process.WaitForExit($processRootExitAfterTreeKillTimeoutMilliseconds)",
    "root-already-exited-before-tree-kill",
    "tree-kill-issued-root-still-running-after-",
    "tree-kill-issued-root-exited",
  ]) {
    requireExecutableMarker(stopTree, marker, "process-tree kill behavior");
  }
  if (stopTree.includes("return 'terminated'")) {
    throw new Error(
      "process-tree diagnostics must not claim descendant termination",
    );
  }

  const receiveOutput = powershellFunctionBlock(
    executable,
    "Receive-RedirectedProcessOutput",
    "Get-CapturedProcessOutputFailureDetail",
  );
  const waitAll = receiveOutput.indexOf("[Threading.Tasks.Task]::WaitAll(");
  const firstGetResult = receiveOutput.indexOf(".GetAwaiter().GetResult()");
  if (waitAll < 0 || firstGetResult <= waitAll) {
    throw new Error(
      "native lifecycle may read redirected output only after bounded Task.WaitAll",
    );
  }
  if (
    (receiveOutput.match(/\.GetAwaiter\(\)\.GetResult\(\)/gu) ?? []).length !==
    2
  ) {
    throw new Error("bounded output drain must collect both completed streams");
  }
  for (const marker of [
    "$StandardOutputTask.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion",
    "$StandardErrorTask.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion",
    "StandardOutput = $standardOutput",
    "StandardError = $standardError",
  ]) {
    requireExecutableMarker(
      receiveOutput,
      marker,
      "completed redirected stream salvage",
    );
  }

  const outputDetail = powershellFunctionBlock(
    executable,
    "Get-CapturedProcessOutputFailureDetail",
    "Invoke-BoundedCaseProcess",
  );
  for (const marker of [
    '"stdout=$($StandardOutput.TrimEnd())"',
    '"stderr=$($StandardError.TrimEnd())"',
    "return '; captured-output-formatting-failed'",
  ]) {
    requireExecutableMarker(
      outputDetail,
      marker,
      "non-masking captured output diagnostics",
    );
  }

  const boundedProcess = powershellFunctionBlock(
    executable,
    "Invoke-BoundedCaseProcess",
    "Get-Registry64Value",
  );
  if ((boundedProcess.match(/ReadToEndAsync\(\)/gu) ?? []).length !== 2) {
    throw new Error(
      "native lifecycle must asynchronously drain both stdout and stderr",
    );
  }
  const stdoutDrainStart = boundedProcess.indexOf(
    "$standardOutputTask = $process.StandardOutput.ReadToEndAsync()",
  );
  const stderrDrainStart = boundedProcess.indexOf(
    "$standardErrorTask = $process.StandardError.ReadToEndAsync()",
  );
  const processWait = boundedProcess.indexOf(
    "$process.WaitForExit($TimeoutMilliseconds)",
  );
  if (
    stdoutDrainStart < 0 ||
    stderrDrainStart < 0 ||
    processWait <= stdoutDrainStart ||
    processWait <= stderrDrainStart
  ) {
    throw new Error(
      "native lifecycle must begin draining both redirected streams before waiting",
    );
  }
  for (const marker of [
    "$process.WaitForExit($TimeoutMilliseconds)",
    "Stop-CaseOwnedProcessTree -Process $process -CaseName $CaseName",
    "$outcome = 'timed-out'",
    "$outcome = 'unexpected-exit'",
    "$outcome = 'output-drain-failed'",
    "$outcome = 'dispose-failed'",
    "CASE START name={0} utc={1} pid={2} timeoutMs={3}",
    "CASE END name={0} utc={1} pid={2} elapsedMs={3} exitCode={4} outcome={5}",
    "throw $operationFailure",
  ]) {
    requireExecutableMarker(boundedProcess, marker, "bounded process behavior");
  }
  if ((boundedProcess.match(/\$process\.Dispose\(\)/gu) ?? []).length !== 1) {
    throw new Error("native lifecycle must dispose every owned Process handle");
  }
  requireExecutableMarker(
    boundedProcess,
    "try {\n      $process.Dispose()\n    } catch {",
    "non-masking process disposal",
  );
  if (
    (boundedProcess.match(/Get-CapturedProcessOutputFailureDetail/gu) ?? [])
      .length !== 3
  ) {
    throw new Error(
      "timeout, output-drain, and unexpected-exit failures must retain captured output",
    );
  }
  if (
    (boundedProcess.match(/\$standardOutput = \$drain\.StandardOutput/gu) ?? [])
      .length !== 2 ||
    (boundedProcess.match(/\$standardError = \$drain\.StandardError/gu) ?? [])
      .length !== 2
  ) {
    throw new Error(
      "timeout and completed-process drain paths must retain both captured streams",
    );
  }
  const finalStdoutAssignment = boundedProcess.lastIndexOf(
    "$standardOutput = $drain.StandardOutput",
  );
  const finalStderrAssignment = boundedProcess.lastIndexOf(
    "$standardError = $drain.StandardError",
  );
  const drainFailureCheck = boundedProcess.lastIndexOf(
    "if (-not $drain.Completed)",
  );
  if (
    finalStdoutAssignment < 0 ||
    finalStderrAssignment < 0 ||
    drainFailureCheck <= finalStdoutAssignment ||
    drainFailureCheck <= finalStderrAssignment
  ) {
    throw new Error(
      "completed redirected streams must be retained before reporting drain failure",
    );
  }

  const nsisProcess = powershellFunctionBlock(
    executable,
    "Invoke-NsisProcess",
    "Invoke-NsisUninstall",
  );
  for (const marker of [
    "[ValidateSet('Install', 'Uninstall')]",
    "$ArgumentKind -ceq 'Install'",
    "$ArgumentKind -ceq 'Uninstall'",
    "$Arguments.Count -eq 1 -or $Arguments.Count -eq 2",
    "$Arguments[0] -ceq '/S'",
    "$Arguments[1].Length -gt 3 -and\n        $Arguments[1].StartsWith('/D=', [StringComparison]::Ordinal)",
    "$Arguments[1].Length -gt 3 -and\n    $Arguments[1].StartsWith('_?=', [StringComparison]::Ordinal)",
    "$argument.Contains([char]34)",
    "foreach ($character in $argument.ToCharArray())",
    "[char]::IsControl($character)",
    "$startInfo.Arguments = [string]::Join(' ', $Arguments)",
    "-ExpectedExit $expectedExit",
  ]) {
    requireExecutableMarker(
      nsisProcess,
      marker,
      "NSIS process launch contract",
    );
  }
  if (nsisProcess.includes("ArgumentList.Add")) {
    throw new Error("NSIS /D= launch must preserve its unquoted raw syntax");
  }
  const controlValidation = nsisProcess.indexOf(
    "[char]::IsControl($character)",
  );
  const rawArguments = nsisProcess.indexOf(
    "$startInfo.Arguments = [string]::Join(' ', $Arguments)",
  );
  const caseLog = nsisProcess.indexOf(
    "Write-Host \"CASE ${CaseName}: $FilePath $($Arguments -join ' ')\"",
  );
  if (
    controlValidation < 0 ||
    rawArguments <= controlValidation ||
    caseLog <= rawArguments
  ) {
    throw new Error(
      "NSIS arguments must be validated before raw transport or logging",
    );
  }

  const uninstall = powershellFunctionBlock(
    executable,
    "Invoke-NsisUninstall",
    "Invoke-BestEffortNsisUninstall",
  );
  for (const marker of [
    "$sourceUninstaller = [IO.Path]::GetFullPath(",
    "(Join-Path $InstallDirectory 'uninstall.exe')",
    "$resolvedWorkingDirectory = (Resolve-Path -LiteralPath $WorkingDirectory).Path",
    "$copyRoot = [IO.Path]::GetFullPath(",
    "'nsis-uninstall-' + [Guid]::NewGuid().ToString('N')",
    "$copyRootInfo.Parent.FullName",
    "$workingDirectoryInfo.FullName",
    "$copiedUninstaller = [IO.Path]::GetFullPath(",
    "[IO.Path]::GetDirectoryName($copiedUninstaller)",
    "[IO.File]::Copy($sourceUninstaller, $copiedUninstaller, $false)",
    "-FilePath $copiedUninstaller",
    "-Arguments @('/S', \"_?=$InstallDirectory\")",
    "-ArgumentKind Uninstall",
    "Remove-Item -LiteralPath $copiedUninstaller -Force -ErrorAction Stop",
    "Remove-Item -LiteralPath $copyRoot -Force -ErrorAction Stop",
    "throw $operationFailure",
    "case-local uninstaller cleanup also failed",
    "case-local uninstaller cleanup failed",
  ]) {
    requireExecutableMarker(
      uninstall,
      marker,
      "NSIS uninstall execution contract",
    );
  }
  if (uninstall.includes("-Arguments @('/S')")) {
    throw new Error("NSIS uninstall must never fall back to a bare /S launch");
  }
  const copyUninstaller = uninstall.indexOf(
    "[IO.File]::Copy($sourceUninstaller, $copiedUninstaller, $false)",
  );
  const invokeCopiedUninstaller = uninstall.indexOf(
    "-FilePath $copiedUninstaller",
  );
  const removeCopiedUninstaller = uninstall.indexOf(
    "Remove-Item -LiteralPath $copiedUninstaller -Force -ErrorAction Stop",
  );
  const removeCopyRoot = uninstall.indexOf(
    "Remove-Item -LiteralPath $copyRoot -Force -ErrorAction Stop",
  );
  if (
    copyUninstaller < 0 ||
    invokeCopiedUninstaller <= copyUninstaller ||
    removeCopiedUninstaller <= invokeCopiedUninstaller ||
    removeCopyRoot <= removeCopiedUninstaller
  ) {
    throw new Error(
      "NSIS uninstall must copy, execute, then remove its case-local uninstaller",
    );
  }
  if (uninstall.includes("Remove-Item -LiteralPath $copyRoot -Recurse")) {
    throw new Error(
      "NSIS uninstall cleanup must never recursively widen beyond its copied file",
    );
  }

  const cleanup = powershellFunctionBlock(
    executable,
    "Invoke-BestEffortNsisUninstall",
    "Get-OwnerDaclSddl",
  );
  for (const marker of [
    "try {\n    $uninstaller = Join-Path $InstallDirectory 'uninstall.exe'",
    "Invoke-NsisUninstall `",
    "-TimeoutMilliseconds $cleanupNsisTimeoutMilliseconds",
    'Write-Warning "Cleanup ${CaseName} failed: $($_.Exception.Message)"',
  ]) {
    requireExecutableMarker(cleanup, marker, "best-effort cleanup isolation");
  }
  if (
    cleanup.includes("Invoke-NsisProcess") ||
    cleanup.includes("-Arguments @('/S')")
  ) {
    throw new Error(
      "best-effort cleanup must share the case-local NSIS uninstall path",
    );
  }

  const mainTryMarker = "$sentinelParentsCreatedByTest = @{}\n\ntry {";
  const mainTryMarkerIndex = source.indexOf(mainTryMarker);
  const mainTryStart = source.indexOf("try {", mainTryMarkerIndex);
  if (mainTryMarkerIndex < 0 || mainTryStart < 0) {
    throw new Error("native lifecycle main try block is missing");
  }
  for (const caseName of [
    "default-uninstall-user-data-preservation",
    "custom-uninstall-user-data-preservation",
  ]) {
    const caseMarker = `  # CASE: ${caseName}\n`;
    const caseMarkerIndex = source.indexOf(caseMarker, mainTryStart);
    const helperIndex = source.indexOf(
      "Invoke-NsisUninstall `",
      caseMarkerIndex + caseMarker.length,
    );
    if (
      caseMarkerIndex < 0 ||
      helperIndex < 0 ||
      powershellBraceDepthBetween(source, mainTryStart, caseMarkerIndex) !==
        1 ||
      powershellBraceDepthBetween(source, mainTryStart, helperIndex) !== 1
    ) {
      throw new Error(
        "ordinary uninstall helpers must be direct statements in the main lifecycle try block",
      );
    }
  }

  for (const [actual, expected] of [
    [
      powershellCaseBody(
        source,
        "default-uninstall-user-data-preservation",
        "  # CASE: preexisting-runtime-extra-ace-negative",
      ),
      `Invoke-NsisUninstall \`
    -InstallDirectory $defaultInstallDir \`
    -CaseName 'default-uninstall-user-data-preservation' \`
    -WorkingDirectory $testRoot
  Assert-UninstalledState -InstallDirectory $defaultInstallDir -UserSentinels $userSentinels`,
    ],
    [
      powershellCaseBody(
        source,
        "custom-uninstall-user-data-preservation",
        '  Write-Host "Windows NSIS native lifecycle verified for $Architecture."',
      ),
      `Invoke-NsisUninstall \`
    -InstallDirectory $customInstallDir \`
    -CaseName 'custom-uninstall-user-data-preservation' \`
    -WorkingDirectory $testRoot
  Assert-UninstalledState -InstallDirectory $customInstallDir -UserSentinels $userSentinels`,
    ],
  ] as const) {
    if (actual !== expected) {
      throw new Error(
        "ordinary uninstall cases must contain only the shared uninstall helper followed by their state assertion",
      );
    }
  }
  if (
    (executable.match(/Invoke-NsisUninstall `$/gmu) ?? []).length !== 3 ||
    executable.includes("$defaultUninstaller") ||
    executable.includes("$customUninstaller")
  ) {
    throw new Error(
      "every ordinary and cleanup uninstall must use the shared case-local helper",
    );
  }

  const signatureVerifier = powershellFunctionBlock(
    executable,
    "Invoke-WebView2SignatureVerification",
    "Save-OfficialWebView2BootstrapperFixture",
  );
  const nativeTool = powershellFunctionBlock(
    executable,
    "Invoke-NativeTool",
    "Invoke-FakeCurrentUserRootAttackFixture",
  );
  for (const [block, expectedExit] of [
    [signatureVerifier, "-ExpectedExit $expectedExit"],
    [nativeTool, "-ExpectedExit Zero"],
  ] as const) {
    requireExecutableMarker(
      block,
      "$startInfo.RedirectStandardOutput = $true",
      "stdout redirect",
    );
    requireExecutableMarker(
      block,
      "$startInfo.RedirectStandardError = $true",
      "stderr redirect",
    );
    requireExecutableMarker(
      block,
      "[void]$startInfo.ArgumentList.Add($argument)",
      "lossless helper argument transport",
    );
    requireExecutableMarker(block, expectedExit, "helper exit expectation");
  }
  if (
    (
      executable.match(
        /\[void\]\$startInfo\.ArgumentList\.Add\(\$argument\)/gu,
      ) ?? []
    ).length !== 2
  ) {
    throw new Error(
      "only the PowerShell verifier and native tool may use ArgumentList",
    );
  }
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

  it("rejects unbounded lifecycle process waits and missing timeout diagnostics", () => {
    const lifecycle = fs.readFileSync(LIFECYCLE, "utf8");
    expect(() =>
      assertBoundedLifecycleProcessContract(lifecycle),
    ).not.toThrow();

    const mutations = [
      {
        label: "Start-Process process-tree wait",
        source: `${lifecycle}\nStart-Process -FilePath $InstallerPath -Wait\n`,
      },
      {
        label: "unbounded direct process wait",
        source: lifecycle.replace(
          "$process.WaitForExit($TimeoutMilliseconds)",
          "$process.WaitForExit()\n      # $process.WaitForExit($TimeoutMilliseconds)",
        ),
      },
      {
        label: "single-process termination",
        source: lifecycle.replace(
          "$Process.Kill($true)",
          "$Process.Kill()\n    # $Process.Kill($true)",
        ),
      },
      {
        label: "unbounded root wait after tree kill",
        source: lifecycle.replace(
          "$Process.WaitForExit($processRootExitAfterTreeKillTimeoutMilliseconds)",
          "$Process.WaitForExit()\n    # $Process.WaitForExit($processRootExitAfterTreeKillTimeoutMilliseconds)",
        ),
      },
      {
        label: "descendant termination overclaim",
        source: lifecycle.replace(
          "return 'tree-kill-issued-root-exited'",
          "return 'terminated'\n    # return 'tree-kill-issued-root-exited'",
        ),
      },
      {
        label: "unbounded cleanup",
        source: lifecycle.replace(
          "-TimeoutMilliseconds $cleanupNsisTimeoutMilliseconds",
          "-TimeoutMilliseconds $nsisProcessTimeoutMilliseconds\n      # -TimeoutMilliseconds $cleanupNsisTimeoutMilliseconds",
        ),
      },
      {
        label: "cleanup error isolation",
        source: lifecycle.replace(
          "try {\n    $uninstaller = Join-Path $InstallDirectory 'uninstall.exe'",
          "$uninstaller = Join-Path $InstallDirectory 'uninstall.exe'",
        ),
      },
      {
        label: "quoted NSIS ArgumentList transport",
        source: lifecycle.replace(
          "$startInfo.Arguments = [string]::Join(' ', $Arguments)",
          "foreach ($argument in $Arguments) {\n    [void]$startInfo.ArgumentList.Add($argument)\n  }\n  # $startInfo.Arguments = [string]::Join(' ', $Arguments)",
        ),
      },
      {
        label: "non-Ordinal NSIS /D prefix admission",
        source: lifecycle.replace(
          "$Arguments[1].StartsWith('/D=', [StringComparison]::Ordinal)",
          "$Arguments[1].StartsWith('/D=')\n        # $Arguments[1].StartsWith('/D=', [StringComparison]::Ordinal)",
        ),
      },
      {
        label: "empty NSIS /D admission",
        source: lifecycle.replace(
          "$Arguments[1].Length -gt 3 -and\n        $Arguments[1].StartsWith('/D=', [StringComparison]::Ordinal)",
          "$true -and\n        $Arguments[1].StartsWith('/D=', [StringComparison]::Ordinal)\n        # nonempty /D= check removed",
        ),
      },
      {
        label: "non-Ordinal NSIS uninstall prefix admission",
        source: lifecycle.replace(
          "$Arguments[1].StartsWith('_?=', [StringComparison]::Ordinal)",
          "$Arguments[1].StartsWith('_?=')\n    # $Arguments[1].StartsWith('_?=', [StringComparison]::Ordinal)",
        ),
      },
      {
        label: "empty NSIS uninstall prefix admission",
        source: lifecycle.replace(
          "$Arguments[1].Length -gt 3 -and\n    $Arguments[1].StartsWith('_?=', [StringComparison]::Ordinal)",
          "$true -and\n    $Arguments[1].StartsWith('_?=', [StringComparison]::Ordinal)\n    # nonempty _?= check removed",
        ),
      },
      {
        label: "NSIS control-character admission",
        source: lifecycle.replace(
          "if ([char]::IsControl($character)) {",
          "if ($false) { # if ([char]::IsControl($character)) {",
        ),
      },
      {
        label: "stdout async drain",
        source: lifecycle.replace(
          "$standardOutputTask = $process.StandardOutput.ReadToEndAsync()",
          "$standardOutputTask = $process.StandardOutput.ReadToEnd()\n      # $standardOutputTask = $process.StandardOutput.ReadToEndAsync()",
        ),
      },
      {
        label: "stderr async drain",
        source: lifecycle.replace(
          "$standardErrorTask = $process.StandardError.ReadToEndAsync()",
          "$standardErrorTask = $process.StandardError.ReadToEnd()\n      # $standardErrorTask = $process.StandardError.ReadToEndAsync()",
        ),
      },
      {
        label: "stdout drain starts after process wait",
        source: lifecycle.replace(
          "$standardOutputTask = $process.StandardOutput.ReadToEndAsync()",
          "$null = $process.WaitForExit($TimeoutMilliseconds)\n      $standardOutputTask = $process.StandardOutput.ReadToEndAsync()",
        ),
      },
      {
        label: "stderr drain starts after process wait",
        source: lifecycle.replace(
          "$standardErrorTask = $process.StandardError.ReadToEndAsync()",
          "$null = $process.WaitForExit($TimeoutMilliseconds)\n      $standardErrorTask = $process.StandardError.ReadToEndAsync()",
        ),
      },
      {
        label: "unbounded redirected output result",
        source: lifecycle.replace(
          "if (-not [Threading.Tasks.Task]::WaitAll(",
          "$null = $StandardOutputTask.GetAwaiter().GetResult()\n    if (-not [Threading.Tasks.Task]::WaitAll(",
        ),
      },
      {
        label: "completed stdout salvage after drain failure",
        source: lifecycle.replace(
          "$StandardOutputTask.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion",
          "$false\n      # $StandardOutputTask.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion",
        ),
      },
      {
        label: "completed stderr salvage after drain failure",
        source: lifecycle.replace(
          "$StandardErrorTask.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion",
          "$false\n      # $StandardErrorTask.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion",
        ),
      },
      {
        label: "captured stdout retained on timeout",
        source: lifecycle.replace(
          "$standardOutput = $drain.StandardOutput",
          "$standardOutput = ''\n        # $standardOutput = $drain.StandardOutput",
        ),
      },
      {
        label: "captured stderr retained on timeout",
        source: lifecycle.replace(
          "$standardError = $drain.StandardError",
          "$standardError = ''\n        # $standardError = $drain.StandardError",
        ),
      },
      {
        label: "signature verifier exit outcome",
        source: lifecycle.replace(
          "    -CaptureOutput `\n    -ExpectedExit $expectedExit",
          "    -CaptureOutput\n    # -ExpectedExit $expectedExit",
        ),
      },
      {
        label: "native tool exit outcome",
        source: lifecycle.replace(
          "    -CaptureOutput `\n    -ExpectedExit Zero",
          "    -CaptureOutput\n    # -ExpectedExit Zero",
        ),
      },
      {
        label: "captured stdout failure detail",
        source: lifecycle.replace(
          '"stdout=$($StandardOutput.TrimEnd())"',
          "'discarded-stdout'\n      # \"stdout=$($StandardOutput.TrimEnd())\"",
        ),
      },
      {
        label: "captured stderr failure detail",
        source: lifecycle.replace(
          '"stderr=$($StandardError.TrimEnd())"',
          "'discarded-stderr'\n      # \"stderr=$($StandardError.TrimEnd())\"",
        ),
      },
      {
        label: "captured output diagnostic non-masking fallback",
        source: lifecycle.replace(
          "return '; captured-output-formatting-failed'",
          "throw\n    # return '; captured-output-formatting-failed'",
        ),
      },
      {
        label: "timeout captured output propagation",
        source: lifecycle.replace(
          "$capturedOutputDetail = Get-CapturedProcessOutputFailureDetail `",
          "$capturedOutputDetail = ''\n      # Get-CapturedProcessOutputFailureDetail `",
        ),
      },
      {
        label: "case-local uninstaller copy",
        source: lifecycle.replace(
          "[IO.File]::Copy($sourceUninstaller, $copiedUninstaller, $false)",
          "$null = $sourceUninstaller\n    # [IO.File]::Copy($sourceUninstaller, $copiedUninstaller, $false)",
        ),
      },
      {
        label: "case-local uninstaller execution",
        source: lifecycle.replace(
          "-FilePath $copiedUninstaller",
          "-FilePath $sourceUninstaller\n      # -FilePath $copiedUninstaller",
        ),
      },
      {
        label: "bare silent uninstall",
        source: lifecycle.replace(
          "-Arguments @('/S', \"_?=$InstallDirectory\")",
          "-Arguments @('/S')\n      # -Arguments @('/S', \"_?=$InstallDirectory\")",
        ),
      },
      {
        label: "reordered NSIS uninstall arguments",
        source: lifecycle.replace(
          "-Arguments @('/S', \"_?=$InstallDirectory\")",
          "-Arguments @(\"_?=$InstallDirectory\", '/S')\n      # -Arguments @('/S', \"_?=$InstallDirectory\")",
        ),
      },
      {
        label: "recursive case-local uninstaller cleanup",
        source: lifecycle.replace(
          "Remove-Item -LiteralPath $copyRoot -Force -ErrorAction Stop",
          "Remove-Item -LiteralPath $copyRoot -Recurse -Force -ErrorAction Stop\n        # Remove-Item -LiteralPath $copyRoot -Force -ErrorAction Stop",
        ),
      },
      {
        label: "cleanup uninstall bypasses shared helper",
        source: lifecycle.replace(
          "Invoke-NsisUninstall `\n      -InstallDirectory $InstallDirectory `",
          "Invoke-NsisProcess `\n      -FilePath $uninstaller `\n      -Arguments @('/S') `\n      # Invoke-NsisUninstall `\n      # -InstallDirectory $InstallDirectory `",
        ),
      },
      {
        label: "ordinary uninstall bypasses shared helper",
        source: lifecycle.replace(
          "Invoke-NsisUninstall `\n    -InstallDirectory $defaultInstallDir `",
          "Invoke-NsisProcess `\n    -FilePath (Join-Path $defaultInstallDir 'uninstall.exe') `\n    -Arguments @('/S') `\n    # Invoke-NsisUninstall `\n    # -InstallDirectory $defaultInstallDir `",
        ),
      },
      {
        label: "dead helper with live bare silent uninstall",
        source: lifecycle.replace(
          "Invoke-NsisUninstall `\n    -InstallDirectory $defaultInstallDir `\n    -CaseName 'default-uninstall-user-data-preservation' `\n    -WorkingDirectory $testRoot",
          "if ($false) {\n    Invoke-NsisUninstall `\n      -InstallDirectory $defaultInstallDir `\n      -CaseName 'default-uninstall-user-data-preservation' `\n      -WorkingDirectory $testRoot\n  }\n  [void](Invoke-NsisProcess `\n    -FilePath (Join-Path $defaultInstallDir 'uninstall.exe') `\n    -Arguments @('/S') `\n    -ShouldSucceed $true `\n    -CaseName 'default-uninstall-user-data-preservation' `\n    -WorkingDirectory $testRoot)",
        ),
      },
      {
        label: "dead ordinary case with aliased live bare silent uninstall",
        source: lifecycle.replace(
          `  # CASE: default-uninstall-user-data-preservation
  Invoke-NsisUninstall \`
    -InstallDirectory $defaultInstallDir \`
    -CaseName 'default-uninstall-user-data-preservation' \`
    -WorkingDirectory $testRoot
  Assert-UninstalledState -InstallDirectory $defaultInstallDir -UserSentinels $userSentinels`,
          `  if ($false) {
  # CASE: default-uninstall-user-data-preservation
  Invoke-NsisUninstall \`
    -InstallDirectory $defaultInstallDir \`
    -CaseName 'default-uninstall-user-data-preservation' \`
    -WorkingDirectory $testRoot
  Assert-UninstalledState -InstallDirectory $defaultInstallDir -UserSentinels $userSentinels
  }
  $installedUninstallerPath = Join-Path $defaultInstallDir 'uninstall.exe'
  [void](Invoke-NsisProcess \`
    -FilePath $installedUninstallerPath \`
    -Arguments @('/S') \`
    -ShouldSucceed $true \`
    -CaseName 'default-uninstall-user-data-preservation' \`
    -WorkingDirectory $testRoot)`,
        ),
      },
      {
        label: "case end diagnostics",
        source: lifecycle.replace(
          "'CASE END name={0} utc={1} pid={2} elapsedMs={3} exitCode={4} outcome={5}' -f",
          "'CASE FINISH name={0} utc={1} pid={2} elapsedMs={3} exitCode={4} outcome={5}' -f\n      # 'CASE END name={0} utc={1} pid={2} elapsedMs={3} exitCode={4} outcome={5}' -f",
        ),
      },
      {
        label: "process disposal",
        source: lifecycle.replace(
          "$process.Dispose()",
          "$null = $process\n      # $process.Dispose()",
        ),
      },
    ];

    for (const mutation of mutations) {
      expect(mutation.source, mutation.label).not.toBe(lifecycle);
      expect(
        () => assertBoundedLifecycleProcessContract(mutation.source),
        mutation.label,
      ).toThrow();
    }
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
