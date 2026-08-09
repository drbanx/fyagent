#!/usr/bin/env node

import { createHash, X509Certificate } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync, gzipSync } from "node:zlib";
import { assertWindowsBundleVersion } from "./release-contract.mjs";

export const TAURI_NSIS_UPSTREAM = Object.freeze({
  tag: "tauri-cli-v2.8.1",
  commit: "662b39adb33d1d26f0de213e5a04fc4116fd0683",
  sha256: "fe22026f68bdb3292fab376756035496ce0a35e3d580e06ebaa6a28295916eb3",
});

const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

function contract(condition, message) {
  if (!condition) {
    throw new Error(`Windows NSIS contract violation: ${message}`);
  }
}

const GZIP_OS_OFFSET = 9;
const GZIP_OS_UNKNOWN = 255;

export function canonicalizeGzipHeader(compressed) {
  const canonical = Buffer.from(compressed);
  contract(
    canonical.length > GZIP_OS_OFFSET &&
      canonical[0] === 0x1f &&
      canonical[1] === 0x8b &&
      canonical[2] === 0x08,
    "canonical gzip input must contain a complete deflate header",
  );
  // RFC 1952 makes the OS byte descriptive only. Node/zlib writes a
  // host-specific value, so freeze it to "unknown" before byte comparison.
  canonical[GZIP_OS_OFFSET] = GZIP_OS_UNKNOWN;
  return canonical;
}

export function gzipDeterministically(payload) {
  return canonicalizeGzipHeader(gzipSync(payload, { level: 9 }));
}

function readJson(filePath, label) {
  let source;
  try {
    source = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${filePath}: ${error.message}`);
  }

  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function normalizedLines(source) {
  return source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

const nativePowerShellValidatedLoaders = new Set();

function assertPowerShell51LoaderContract(loader, loaderPath, chunkCount) {
  contract(
    loader.includes(
      "$c=[byte[]][Convert]::FromBase64String($e);$m=[IO.MemoryStream]::new($c)",
    ),
    "WebView2 loader must use the PowerShell 5.1-safe byte-array MemoryStream constructor",
  );
  contract(
    !/\[IO\.MemoryStream\]::new\(\s*,/u.test(loader),
    "WebView2 loader must not use a unary-comma method argument rejected by PowerShell 5.1",
  );
  contract(
    loader.includes(
      "[IO.Compression.GZipStream]::new($m,[IO.Compression.CompressionMode]0)",
    ) && !/\[IO\.Compression\.GZipStream\]::new\(\$m,\s*0\)/u.test(loader),
    "WebView2 loader must use a typed PowerShell 5.1-safe GZip decompression mode",
  );
  const callOperators = loader.match(/&/gu) ?? [];
  contract(
    !/(?:\bNew-Object\b|\bImport-Module\b|\bInvoke-Expression\b|\biex\b)/iu.test(
      loader,
    ) &&
      callOperators.length === 1 &&
      loader.includes("&([ScriptBlock]::Create("),
    "WebView2 loader must not use module-resolved or unconstrained indirect commands",
  );
  if (process.platform !== "win32") return;

  const loaderDigest = createHash("sha256").update(loader).digest("hex");
  if (nativePowerShellValidatedLoaders.has(loaderDigest)) return;
  const systemRoot = process.env.SystemRoot;
  contract(
    typeof systemRoot === "string" && path.isAbsolute(systemRoot),
    "native Windows validation requires an absolute SystemRoot",
  );
  const windowsPowerShell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  contract(
    fs.statSync(windowsPowerShell).isFile(),
    "native Windows validation requires system Windows PowerShell 5.1",
  );
  const parseScript = [
    "$ErrorActionPreference='Stop'",
    "if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { exit 95 }",
    "$tokens=$null",
    "$errors=$null",
    "[Management.Automation.Language.Parser]::ParseFile($env:FYAGENT_PS51_LOADER_PATH,[ref]$tokens,[ref]$errors)|Out-Null",
    "if ($errors.Count -ne 0) { [Console]::Error.Write($errors[0].Message); exit 96 }",
  ].join(";");
  const parseResult = spawnSync(
    windowsPowerShell,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", parseScript],
    {
      encoding: "utf8",
      env: { ...process.env, FYAGENT_PS51_LOADER_PATH: loaderPath },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  contract(
    !parseResult.error && parseResult.status === 0,
    `system Windows PowerShell 5.1 rejected the WebView2 loader AST (${parseResult.stderr.trim() || parseResult.status})`,
  );

  const controlledSource =
    "if ($PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1) { exit 95 };return 'FYAGENT_PS51_LOADER_OK'";
  const controlledPayload = gzipDeterministically(
    Buffer.from(controlledSource, "utf16le"),
  ).toString("base64");
  const executionEnvironment = { ...process.env };
  for (const name of Object.keys(executionEnvironment)) {
    if (/^FY_WV2_\d+$/u.test(name)) delete executionEnvironment[name];
  }
  for (let index = 0; index < chunkCount; index += 1) {
    executionEnvironment[`FY_WV2_${index}`] =
      index === 0 ? controlledPayload : "";
  }
  const encodedLoader = Buffer.from(loader, "utf16le").toString("base64");
  const executionResult = spawnSync(
    windowsPowerShell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encodedLoader,
    ],
    {
      encoding: "utf8",
      env: executionEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  contract(
    !executionResult.error &&
      executionResult.status === 0 &&
      executionResult.stdout.trim() === "FYAGENT_PS51_LOADER_OK",
    `system Windows PowerShell 5.1 could not execute the controlled WebView2 loader fixture (${executionResult.stderr.trim() || executionResult.status})`,
  );
  nativePowerShellValidatedLoaders.add(loaderDigest);
}

// NSIS comments may follow executable text, while semicolons inside quoted
// SDDL/command strings are data. Security contracts operate only on the
// executable projection so a commented-out API can never satisfy a gate.
export function stripNsisComments(source) {
  return normalizedLines(source)
    .map((line) => {
      let quote = null;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (quote !== null) {
          if (character === quote && line[index - 1] !== "$") {
            quote = null;
          }
          continue;
        }
        if (character === '"' || character === "'" || character === "`") {
          quote = character;
          continue;
        }
        if (character === ";") {
          return line.slice(0, index);
        }
      }
      return line;
    })
    .join("\n");
}

function sectionName(declaration) {
  const remainder = declaration.replace(/^Section(?:\s+\/o)?\s+/, "").trim();
  const quoted = remainder.match(/^"([^"]+)"/);
  return quoted ? quoted[1] : remainder.split(/\s+/u, 1)[0];
}

export function parseNsisBlocks(source) {
  const lines = normalizedLines(source);
  const blocks = [];

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    const functionMatch = trimmed.match(/^Function\s+([^\s;]+)\s*$/u);
    const sectionMatch = trimmed.match(/^Section(?:\s+\/o)?\s+.+$/u);
    if (!functionMatch && !sectionMatch) {
      continue;
    }

    const kind = functionMatch ? "function" : "section";
    const endToken = functionMatch ? "FunctionEnd" : "SectionEnd";
    const end = lines.findIndex(
      (line, candidate) => candidate > index && line.trim() === endToken,
    );
    contract(end > index, `${kind} at line ${index + 1} has no ${endToken}`);

    blocks.push({
      kind,
      name: functionMatch ? functionMatch[1] : sectionName(trimmed),
      startLine: index + 1,
      endLine: end + 1,
      body: lines.slice(index + 1, end).join("\n"),
    });
    index = end;
  }

  return blocks;
}

function namedBlock(blocks, kind, name) {
  const matches = blocks.filter(
    (block) => block.kind === kind && block.name === name,
  );
  contract(matches.length === 1, `expected exactly one ${kind} ${name}`);
  return matches[0];
}

function assertOrdered(source, tokens, label) {
  let cursor = -1;
  for (const token of tokens) {
    const index = source.indexOf(token, cursor + 1);
    contract(index >= 0, `${label} is missing ${token}`);
    contract(index > cursor, `${label} has ${token} out of order`);
    cursor = index;
  }
}

export function assertFinalPathValidatorContract(source) {
  const blocks = parseNsisBlocks(source);
  const executableSource = stripNsisComments(source);
  const validator = stripNsisComments(
    namedBlock(blocks, "function", "FyAgentValidateFinalInstallDir").body,
  );

  for (const required of [
    "GetFullPathNameW",
    "GetFileAttributesW",
    "GetLastError",
    "${FYAGENT_ERROR_FILE_NOT_FOUND}",
    "${FYAGENT_ERROR_PATH_NOT_FOUND}",
    "GetVolumePathNameW",
    "CreateFileW",
    "${FYAGENT_FILE_FLAG_BACKUP_SEMANTICS}",
    "GetFinalPathNameByHandleW",
    "CloseHandle",
    "GetDriveTypeW",
    "${FYAGENT_DRIVE_FIXED}",
  ]) {
    contract(
      validator.includes(required),
      `path validator is missing ${required}`,
    );
  }
  assertOrdered(
    validator,
    [
      "GetFullPathNameW",
      "GetFileAttributesW",
      "GetLastError",
      "CreateFileW",
      "GetFinalPathNameByHandleW",
      "CloseHandle",
      "GetVolumePathNameW",
      "GetDriveTypeW",
    ],
    "path validator",
  );
  contract(
    /GetFileAttributesW\(w r1\) i \.r2'[\s\S]*?GetLastError\(\) i \.r9'[\s\S]*?\$9 <> \$\{FYAGENT_ERROR_FILE_NOT_FOUND\}[\s\S]*?\$9 <> \$\{FYAGENT_ERROR_PATH_NOT_FOUND\}[\s\S]*?fyagent_install_dir_invalid[\s\S]*?\$\{GetParent\}/u.test(
      validator,
    ),
    "path ancestor peeling must allow only FILE_NOT_FOUND/PATH_NOT_FOUND errors",
  );
  contract(
    !/CreateFileW\([^\r\n]*FILE_FLAG_OPEN_REPARSE_POINT/u.test(validator),
    "path validator must follow reparse points before volume classification",
  );
  contract(
    /CloseHandle\(p r5\) i \.r5'[\s\S]*?\$5 == 0[\s\S]*?fyagent_install_dir_invalid/u.test(
      validator,
    ),
    "path validator must fail closed when CloseHandle fails",
  );
  contract(
    /StrCmp\s+\$0\s+"\\\\\?\\UNC\\"\s+fyagent_install_dir_invalid/u.test(
      validator,
    ),
    "path validator must actively reject a final SMB/UNC target",
  );
  contract(
    /StrCpy\s+\$0\s+\$INSTDIR\s+1\s+1[\s\S]*StrCmp\s+\$0\s+":"/u.test(
      validator,
    ),
    "path validator must require a drive-letter colon",
  );
  contract(
    /StrCpy\s+\$0\s+\$INSTDIR\s+1\s+2[\s\S]*StrCmp\s+\$0\s+"\\"/u.test(
      validator,
    ),
    "path validator must require a rooted backslash",
  );
  contract(
    /!define\s+FYAGENT_DRIVE_FIXED\s+3(?:\s|$)/u.test(executableSource),
    "DRIVE_FIXED must be the exact Win32 value 3",
  );
  contract(
    /IntCmp\s+\$2\s+\$\{FYAGENT_DRIVE_FIXED\}\s+fyagent_install_dir_valid/u.test(
      validator,
    ),
    "only DRIVE_FIXED may enter the valid branch",
  );
  contract(
    !/(?:GetNamedSecurityInfo|GetFileSecurity|GetSecurityInfo|icacls|owner|DACL|protected folder)/iu.test(
      validator,
    ),
    "path validator must not classify ACL, owner, or protected-folder policy",
  );

  const directoryLeave = stripNsisComments(
    namedBlock(blocks, "function", "FyAgentValidateInstallDirPageLeave").body,
  );
  contract(
    directoryLeave.includes("Call FyAgentValidateFinalInstallDir"),
    "interactive directory page must call the shared validator",
  );
  contract(
    executableSource.includes(
      "!define MUI_PAGE_CUSTOMFUNCTION_LEAVE FyAgentValidateInstallDirPageLeave",
    ),
    "directory page must bind its leave callback",
  );

  for (const initName of [".onInit", "un.onInit"]) {
    const init = stripNsisComments(
      namedBlock(blocks, "function", initName).body,
    );
    contract(
      init.includes("SetRegView 64"),
      `${initName} must select the native 64-bit registry view`,
    );
  }

  const sections = blocks.filter((block) => block.kind === "section");
  contract(
    sections[0]?.name === "-FyAgentInstallDirGate",
    "final path gate must be the first executable section",
  );
  contract(
    sections[1]?.name === "-FyAgentMachineRuntimeBootstrap",
    "machine runtime bootstrap must immediately follow the path gate",
  );
  const gate = stripNsisComments(
    namedBlock(blocks, "section", "-FyAgentInstallDirGate").body,
  );
  contract(
    gate.includes("Call FyAgentValidateFinalInstallDir"),
    "first section must call the shared validator",
  );
  contract(
    gate.includes("SetErrorLevel 2") && gate.includes("Abort"),
    "silent /D rejection must fail with a nonzero installer status",
  );

  const writeOpcode =
    /^\s*(?:SetOutPath|File(?:Write|\s)|CreateDirectory|CopyFiles|WriteReg\w*|WriteUninstaller|CreateShortcut|Delete(?:Reg\w*)?|RMDir|NSISdl::download|ExecWait)\b/imu;
  contract(
    !writeOpcode.test(gate),
    "path gate itself must not write files, registry, shortcuts, or ProgramData",
  );

  const webviewIndex = sections.findIndex((block) => block.name === "WebView2");
  const installIndex = sections.findIndex((block) => block.name === "Install");
  const bootstrapIndex = sections.findIndex(
    (block) => block.name === "-FyAgentMachineRuntimeBootstrap",
  );
  contract(bootstrapIndex === 1, "machine runtime bootstrap section drifted");
  contract(
    webviewIndex > bootstrapIndex,
    "WebView2 section must follow runtime bootstrap",
  );
  contract(installIndex > webviewIndex, "Install section must follow WebView2");
  contract(
    stripNsisComments(namedBlock(blocks, "section", "Install").body).includes(
      "SetOutPath $INSTDIR",
    ),
    "Install section must select the validated output path",
  );

  const reinstall = stripNsisComments(
    namedBlock(blocks, "function", "PageLeaveReinstall").body,
  );
  const uninstallIndex = reinstall.indexOf("ExecWait '$R1' $0");
  contract(
    uninstallIndex >= 0,
    "maintenance flow must invoke the existing NSIS uninstaller",
  );
  contract(
    reinstall.lastIndexOf(
      "Call FyAgentValidateFinalInstallDir",
      uninstallIndex,
    ) >= 0,
    "maintenance writes must also be preceded by the shared path validator",
  );
}

function assertRuntimeProvisionContract(source, blocks) {
  const executableSource = stripNsisComments(source);
  const openMatch = executableSource.match(
    /!macro FyAgentOpenExistingTrustedRuntimeDirectory Path Label OutputHandle MissingFlag([\s\S]*?)!macroend/u,
  );
  contract(openMatch, "missing handle-validated ProgramData preimage macro");
  const openExisting = openMatch[1];
  for (const required of [
    "CreateFileW",
    "FYAGENT_FILE_READ_ATTRIBUTES",
    "FYAGENT_DELETE",
    "FYAGENT_READ_CONTROL",
    "FYAGENT_FILE_SHARE_READ",
    "FYAGENT_FILE_FLAG_BACKUP_SEMANTICS",
    "FYAGENT_FILE_FLAG_OPEN_REPARSE_POINT",
    "GetFileInformationByHandle",
    "FYAGENT_FILE_ATTRIBUTE_DIRECTORY",
    "FYAGENT_FILE_ATTRIBUTE_REPARSE_POINT",
    "GetSecurityInfo",
    "ConvertSecurityDescriptorToStringSecurityDescriptorW",
    "LocalFree",
    "CloseHandle",
  ]) {
    contract(
      openExisting.includes(required),
      `runtime preimage validation is missing ${required}`,
    );
  }
  const pinnedOpen = openExisting.match(/CreateFileW\([^\r\n]+/u)?.[0] ?? "";
  contract(
    pinnedOpen.includes("FYAGENT_DELETE") &&
      pinnedOpen.includes("FYAGENT_READ_CONTROL") &&
      pinnedOpen.includes("i ${FYAGENT_FILE_SHARE_READ}") &&
      !pinnedOpen.includes("FYAGENT_FILE_SHARE_ALL") &&
      !pinnedOpen.includes("FILE_SHARE_WRITE") &&
      !pinnedOpen.includes("FILE_SHARE_DELETE"),
    "runtime preimage handles must not share write or delete access",
  );
  assertOrdered(
    openExisting,
    [
      "CreateFileW",
      "GetFileInformationByHandle",
      "FYAGENT_FILE_ATTRIBUTE_DIRECTORY",
      "FYAGENT_FILE_ATTRIBUTE_REPARSE_POINT",
      "GetSecurityInfo",
      "ConvertSecurityDescriptorToStringSecurityDescriptorW",
      "CloseHandle",
    ],
    "runtime preimage handle validation",
  );
  contract(
    !/(?:icacls|SetSecurityInfo|SetKernelObjectSecurity|SetNamedSecurityInfo)/iu.test(
      openExisting,
    ),
    "an unsafe ProgramData preimage must never be repaired in place",
  );

  const createMatch = executableSource.match(
    /!macro FyAgentCreateTrustedRuntimeDirectory Path Label OutputHandle MissingFlag([\s\S]*?)!macroend/u,
  );
  contract(createMatch, "missing atomic ProgramData creation macro");
  const createFresh = createMatch[1];
  assertOrdered(
    createFresh,
    [
      "ConvertStringSecurityDescriptorToSecurityDescriptorW",
      "FYAGENT_SECURITY_ATTRIBUTES_SIZE",
      "CreateDirectoryW",
      "LocalFree",
      "FyAgentOpenExistingTrustedRuntimeDirectory",
    ],
    "atomic runtime creation",
  );
  contract(
    !createFresh.includes("FYAGENT_ERROR_ALREADY_EXISTS"),
    "atomic runtime creation must reject a competing existing path",
  );

  const dispositionMatch = executableSource.match(
    /!macro FyAgentMarkRuntimeDirectoryForDeletion Handle([\s\S]*?)!macroend/u,
  );
  contract(dispositionMatch, "missing handle-based runtime disposition macro");
  assertOrdered(
    dispositionMatch[1],
    [
      "SetFileInformationByHandle",
      "FYAGENT_FILE_DISPOSITION_INFO",
      "System::Free",
    ],
    "handle-based runtime disposition",
  );
  contract(
    executableSource.includes(
      '!define FYAGENT_RUNTIME_ROOT_SDDL "O:BAD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)"',
    ),
    "runtime creation must use the Rust-admitted Administrators owner SDDL",
  );

  const provision = stripNsisComments(
    namedBlock(blocks, "function", "FyAgentProvisionMachineRuntime").body,
  );
  assertOrdered(
    provision,
    [
      '!insertmacro FyAgentOpenExistingTrustedRuntimeDirectory "$COMMONAPPDATA\\FyAgent" runtime_parent',
      '!insertmacro FyAgentOpenExistingTrustedRuntimeDirectory "$COMMONAPPDATA\\FyAgent\\runtime" runtime_leaf',
      'Delete "$COMMONAPPDATA\\FyAgent\\runtime\\business-*.state"',
      'Delete "$COMMONAPPDATA\\FyAgent\\runtime\\business-*.lock"',
      "!insertmacro FyAgentMarkRuntimeDirectoryForDeletion $FyAgentRuntimeLeafHandle",
      "CloseHandle(p $FyAgentRuntimeLeafHandle)",
      '${FileExists} "$COMMONAPPDATA\\FyAgent\\runtime"',
      "!insertmacro FyAgentMarkRuntimeDirectoryForDeletion $FyAgentRuntimeParentHandle",
      "CloseHandle(p $FyAgentRuntimeParentHandle)",
      '${FileExists} "$COMMONAPPDATA\\FyAgent"',
      '!insertmacro FyAgentCreateTrustedRuntimeDirectory "$COMMONAPPDATA\\FyAgent" runtime_create_parent',
      '!insertmacro FyAgentCreateTrustedRuntimeDirectory "$COMMONAPPDATA\\FyAgent\\runtime" runtime_create_leaf',
      "StrCpy $FyAgentRuntimeProvisionValid 1",
    ],
    "trusted legacy runtime rebuild",
  );
  contract(
    !/(?:icacls|SetSecurityInfo|SetKernelObjectSecurity|SetNamedSecurityInfo)/iu.test(
      provision,
    ),
    "runtime bootstrap must not repair path-based ACLs",
  );

  const bootstrap = stripNsisComments(
    namedBlock(blocks, "section", "-FyAgentMachineRuntimeBootstrap").body,
  );
  assertOrdered(
    bootstrap,
    [
      '!insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"',
      "Call FyAgentProvisionMachineRuntime",
      "SetErrorLevel 3",
      "Abort",
    ],
    "pre-WebView machine runtime bootstrap",
  );

  const install = stripNsisComments(
    namedBlock(blocks, "section", "Install").body,
  );
  assertOrdered(
    install,
    [
      '!insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"',
      'File "${MAINBINARYSRCPATH}"',
    ],
    "post-download app-stop check",
  );
  contract(
    !install.includes("Call FyAgentProvisionMachineRuntime"),
    "machine runtime must be provisioned exactly once before WebView2",
  );
}

function assertUninstallOwnershipContract(source, blocks) {
  const executableSource = stripNsisComments(source);
  const uninstall = stripNsisComments(
    namedBlock(blocks, "section", "Uninstall").body,
  );
  assertOrdered(
    uninstall,
    [
      '!insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"',
      'Delete "$COMMONAPPDATA\\FyAgent\\runtime\\business-*.state"',
      'Delete "$COMMONAPPDATA\\FyAgent\\runtime\\business-*.lock"',
      'RMDir "$COMMONAPPDATA\\FyAgent\\runtime"',
      'RMDir "$COMMONAPPDATA\\FyAgent"',
    ],
    "runtime uninstall ownership",
  );
  contract(
    !/RMDir\s+\/r(?:\s+\/REBOOTOK)?\s+"?\$INSTDIR/iu.test(executableSource),
    "uninstaller must never recursively delete a caller-selected $INSTDIR",
  );
  contract(
    !/RMDir\s+\/r\s+"?\$COMMONAPPDATA\\FyAgent/iu.test(executableSource),
    "ProgramData cleanup must delete only known runtime files and empty directories",
  );
  contract(
    !/(?:DeleteAppData|RmDir\s+\/r\s+"?\$(?:APPDATA|LOCALAPPDATA))/iu.test(
      executableSource,
    ),
    "uninstaller must not offer or perform recursive user-data deletion",
  );
  contract(
    uninstall.includes('DeleteRegKey SHCTX "${MANUPRODUCTKEY}"'),
    "uninstaller must remove the installer-owned install-location marker",
  );
}

function readWorkspaceVersion(cargoManifestPath) {
  const source = fs.readFileSync(cargoManifestPath, "utf8");
  const workspacePackage = source.match(
    /^\[workspace\.package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/mu,
  );
  contract(workspacePackage, "Cargo manifest is missing [workspace.package]");
  const version = workspacePackage[1].match(
    /^version\s*=\s*"([^"]+)"\s*(?:#.*)?$/mu,
  );
  contract(
    version,
    "Cargo [workspace.package] is missing its canonical version",
  );
  return version[1];
}

function assertWebView2CommandContract({
  source,
  include,
  loader,
  loaderPath,
  template,
  blocks,
  fakeRootPem,
  fakeLeafPem,
}) {
  const executableTemplate = stripNsisComments(template);
  const chunkCountMatch = include.match(
    /^!define FYAGENT_WEBVIEW2_COMMAND_CHUNK_COUNT (\d+)$/mu,
  );
  contract(chunkCountMatch, "WebView2 include is missing its chunk count");
  const chunkCount = Number.parseInt(chunkCountMatch[1], 10);
  contract(
    chunkCount > 0 && chunkCount < 100,
    "WebView2 chunk count is invalid",
  );

  const chunks = [
    ...include.matchAll(
      /^!define FYAGENT_WEBVIEW2_COMMAND_(\d{2}) "([A-Za-z0-9+/=]+)"$/gmu,
    ),
  ];
  contract(
    chunks.length === chunkCount,
    "WebView2 include chunk count drifted",
  );
  for (let index = 0; index < chunks.length; index += 1) {
    contract(
      chunks[index][1] === String(index).padStart(2, "0"),
      "WebView2 include chunks must be contiguous and ordered",
    );
    contract(
      chunks[index][2].length <= 768,
      "WebView2 include chunk exceeds the reviewed NSIS string bound",
    );
  }
  const encodedPayload = chunks.map((match) => match[2]).join("");
  contract(
    encodedPayload.length <= 8192,
    `WebView2 encoded payload exceeds its environment budget (${encodedPayload.length})`,
  );
  const compressedSource = Buffer.from(encodedPayload, "base64");
  contract(
    compressedSource[GZIP_OS_OFFSET] === GZIP_OS_UNKNOWN,
    "WebView2 payload gzip header must use the canonical unknown OS",
  );
  const expectedCompressedSource = gzipDeterministically(
    Buffer.from(source, "utf16le"),
  );
  contract(
    compressedSource.equals(expectedCompressedSource),
    "WebView2 payload is not the deterministic level-9 gzip of its repo-owned source",
  );
  contract(
    gunzipSync(compressedSource).toString("utf16le") === source,
    "WebView2 compressed command does not decode to its repo-owned source",
  );

  const loaderMatch = include.match(
    /^!define FYAGENT_WEBVIEW2_LOADER_BASE64 "([A-Za-z0-9+/=]+)"$/mu,
  );
  contract(loaderMatch, "WebView2 include is missing its encoded loader");
  const decodedLoader = Buffer.from(loaderMatch[1], "base64").toString(
    "utf16le",
  );
  contract(
    decodedLoader === loader,
    "WebView2 encoded loader does not byte-match its repo-owned source",
  );
  contract(
    loader.includes(`foreach($i in 0..${chunkCount - 1})`) &&
      loader.includes("[IO.Compression.GZipStream]::new") &&
      loader.includes("[ScriptBlock]::Create") &&
      !/(?:\biex\b|\|\s*%)/iu.test(loader),
    "WebView2 loader must read only the fixed chunk set without module commands",
  );
  assertPowerShell51LoaderContract(loader, loaderPath, chunkCount);

  const setNames = [
    ...include.matchAll(
      /SetEnvironmentVariableW\(w "(FY_WV2_\d+)", w "\$\{FYAGENT_WEBVIEW2_COMMAND_\d{2}\}"\)/gu,
    ),
  ].map((match) => match[1]);
  const clearNames = [
    ...include.matchAll(/SetEnvironmentVariableW\(w "(FY_WV2_\d+)", p 0\)/gu),
  ].map((match) => match[1]);
  const expectedNames = Array.from(
    { length: chunkCount },
    (_, index) => `FY_WV2_${index}`,
  );
  contract(
    JSON.stringify(setNames) === JSON.stringify(expectedNames) &&
      JSON.stringify(clearNames) === JSON.stringify(expectedNames),
    "WebView2 chunk environment must be written and cleared exactly once",
  );

  assertOrdered(
    source,
    [
      '$env:PSModulePath = "$PSHOME\\Modules"',
      "$PSModuleAutoLoadingPreference = 'None'",
      "$PSHOME\\Modules\\Microsoft.PowerShell.Management\\Microsoft.PowerShell.Management.psd1",
      "$PSHOME\\Modules\\Microsoft.PowerShell.Security\\Microsoft.PowerShell.Security.psd1",
      "Microsoft.PowerShell.Core\\Set-StrictMode",
    ],
    "trusted PowerShell module initialization",
  );
  contract(
    (source.match(/\$env:/gu) ?? []).length === 1,
    "production WebView2 semantics must not be activated or overridden by environment",
  );
  contract(
    !/^\s*(?:\$[A-Za-z][A-Za-z0-9]*\s*=\s*)?(?:Get-Item|Get-Acl|Get-AuthenticodeSignature|Start-Process|Remove-Item|Import-Module|ForEach-Object|Select-Object|Where-Object)\b/mu.test(
      source,
    ),
    "elevated WebView2 helper contains an unqualified module command",
  );
  for (const required of [
    "Microsoft.PowerShell.Management\\Get-Item",
    "Microsoft.PowerShell.Management\\Get-Acl",
    "Microsoft.PowerShell.Security\\Get-AuthenticodeSignature",
    "O=Microsoft Corporation",
    "1.3.6.1.5.5.7.3.3",
    "CB97E8E85E8E9321FB2646E9574EFD17669B3B0581D24262AC7C8A227433A244",
    "50E824592CAA59C7DB9615D676738C7E4EEE522622440C4C2152D0668D68C6D9",
    "[Security.Cryptography.X509Certificates.X509Chain]::new($true)",
    "[Security.Cryptography.X509Certificates.X509RevocationMode]::Online",
    "[Security.Cryptography.X509Certificates.X509RevocationFlag]::EntireChain",
    "Get-RsaSubjectPublicKeyInfoSha256",
    "[IO.FileShare]::None",
    "[IO.FileShare]::Read",
    "[Net.Http.HttpClientHandler]::new()",
    "$httpHandler.MaxAutomaticRedirections = 5",
    "$httpClient.Timeout = [TimeSpan]::FromMinutes(2)",
    "[Threading.CancellationTokenSource]::new",
    "$cancellation.Token",
    "$responseStream.ReadAsync(",
    "$response.RequestMessage.RequestUri.Scheme",
    "[Uri]::UriSchemeHttps",
    "$maximumBootstrapperBytes = 64MB",
    "[Diagnostics.ProcessStartInfo]::new()",
    "$startInfo.UseShellExecute = $false",
    "$process.WaitForExit()",
    "Microsoft.PowerShell.Management\\Remove-Item",
  ]) {
    contract(
      source.includes(required),
      `WebView2 helper is missing ${required}`,
    );
  }
  contract(
    !/Remove-Item[\s\S]{0,160}-Recurse/iu.test(source),
    "WebView2 cleanup must not recurse",
  );
  contract(
    !/(?:\$TEMP|\$PLUGINSDIR|GetEnvironmentVariable\([^)]*(?:URL|PUBLISH|ARG|MODE))/iu.test(
      source,
    ),
    "WebView2 production policy must not use user-controlled paths or semantic overrides",
  );
  contract(
    /GetAsync\([\s\S]*?\$cancellation\.Token[\s\S]*?ReadAsync\([\s\S]*?\$cancellation\.Token/u.test(
      source,
    ),
    "one hard cancellation token must bound both WebView2 headers and body reads",
  );

  const fakeRoot = new X509Certificate(fakeRootPem);
  const fakeLeaf = new X509Certificate(fakeLeafPem);
  contract(
    fakeRoot.ca,
    "fake CurrentUser root fixture must be a CA certificate",
  );
  contract(
    fakeLeaf.subject.includes("O=Microsoft Corporation") &&
      fakeLeaf.verify(fakeRoot.publicKey) &&
      fakeLeaf.keyUsage?.includes("1.3.6.1.5.5.7.3.3"),
    "fake CurrentUser fixture must be a valid O=Microsoft Corporation leaf chain",
  );
  const fakeRootSpkiSha256 = createHash("sha256")
    .update(fakeRoot.publicKey.export({ type: "spki", format: "der" }))
    .digest("hex")
    .toUpperCase();
  contract(
    !source.includes(fakeRootSpkiSha256),
    "fake CurrentUser root SPKI must not be admitted by the production PCA allow-list",
  );
  assertOrdered(
    source,
    [
      "[IO.FileShare]::Read",
      "Assert-MicrosoftAuthenticode -Path $bootstrapperPath",
      "[Diagnostics.ProcessStartInfo]::new()",
      "$process.WaitForExit()",
      "$reader.Dispose()",
    ],
    "pinned WebView2 signature and execution",
  );

  const webview = stripNsisComments(
    namedBlock(blocks, "section", "WebView2").body,
  );
  assertOrdered(
    webview,
    [
      "FyAgentSetWebView2CommandEnvironment",
      '"$SYSDIR\\WindowsPowerShell\\v1.0\\powershell.exe"',
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand ${FYAGENT_WEBVIEW2_LOADER_BASE64}",
      "FyAgentClearWebView2CommandEnvironment",
    ],
    "secure WebView2 invocation",
  );
  contract(
    !/(?:NSISdl::download|\$TEMP|\$PLUGINSDIR)/iu.test(webview),
    "WebView2 section must not stage or execute from a user-writable path",
  );
  const commandLine = webview
    .split("\n")
    .find(
      (line) =>
        line.includes("powershell.exe") && line.includes("-EncodedCommand"),
    );
  contract(commandLine, "WebView2 PowerShell command line is missing");
  const canonicalExpandedCommand = commandLine
    .replace("${FYAGENT_WEBVIEW2_LOADER_BASE64}", loaderMatch[1])
    .replace("$SYSDIR", "C:\\Windows\\System32");
  contract(
    canonicalExpandedCommand.length < 1024 &&
      canonicalExpandedCommand.length < 32767,
    `WebView2 EncodedCommand is too long (${canonicalExpandedCommand.length} UTF-16 code units)`,
  );
  contract(
    executableTemplate.includes(
      '!if "${INSTALLWEBVIEW2MODE}" != "downloadBootstrapper"',
    ),
    "custom template must fail compilation for a non-downloadBootstrapper mode",
  );
}

function assertLifecycleContract(source) {
  for (const required of [
    "[string]$InstallerPath",
    "[string]$Architecture",
    "[string]$AppVersion",
    "Get-PeMachine",
    "0x8664",
    "0xAA64",
    "DisplayVersion",
    "RegistryView]::Registry64",
    "CASE: relative-path-negative",
    "CASE: unc-network-negative",
    "CASE: access-denied-ancestor-negative",
    "CASE: reparse-network-negative",
    "CASE: unsupported-drive-network-negative",
    "CASE: reparse-unsupported-drive-network-negative",
    "CASE: default-install",
    "CASE: preexisting-runtime-extra-ace-negative",
    "CASE: preexisting-runtime-unknown-content-negative",
    "CASE: preexisting-runtime-no-delete-share-negative",
    "CASE: trusted-legacy-runtime-rebuild",
    "CASE: custom-space-unicode-silent-D",
    "CASE: webview2-signed-space-unicode-verify",
    "CASE: webview2-current-user-fake-root-negative",
    "https://go.microsoft.com/fwlink/p/?LinkId=2124703",
    "StoreName]::Root",
    "StoreName]::TrustedPublisher",
    "StoreLocation]::CurrentUser",
    "Get-AuthenticodeSignature -LiteralPath $unsignedPe",
    "SignatureStatus]::Valid",
    "$publisherStore.Remove($leafPublic)",
    "$rootStore.Remove($rootPublic)",
    "$cleanupFailures",
    "$cleanupAuthorized = $false",
    "$cleanupAuthorized = $true",
    "$sentinelParentsCreatedByTest",
    "User data sentinel was deleted by uninstall",
  ]) {
    contract(
      source.includes(required),
      `native lifecycle is missing ${required}`,
    );
  }
  const mainLifecycleStart = source.indexOf("$cleanupAuthorized = $true");
  contract(
    mainLifecycleStart >= 0,
    "native lifecycle never reaches an authorized clean-run execution",
  );
  const mainLifecycle = source.slice(mainLifecycleStart);

  const unsupportedFixtureStart = source.indexOf(
    "if (-not ('FyAgent.NsisLifecycle.NativeNetworkDrive' -as [type]))",
  );
  const unsupportedFixtureEnd = source.indexOf(
    "\nfunction Invoke-WebView2SignatureVerification",
    unsupportedFixtureStart,
  );
  contract(
    unsupportedFixtureStart >= 0 &&
      unsupportedFixtureEnd > unsupportedFixtureStart,
    "required unsupported-drive fixture is missing or unterminated",
  );
  const unsupportedFixture = source.slice(
    unsupportedFixtureStart,
    unsupportedFixtureEnd,
  );
  for (const required of [
    "System32\\WindowsPowerShell\\v1.0\\Modules\\SmbShare\\SmbShare.psd1",
    "Microsoft.PowerShell.Core\\Import-Module",
    "SmbShare\\New-SmbShare",
    "-FullAccess $currentIdentity",
    "-Temporary",
    "WNetAddConnection2W",
    "WNetCancelConnection2W",
    "GetDriveTypeW",
    "DRIVE_REMOTE = 4",
    "The mapped unsupported drive did not round-trip through its SMB backing path.",
    "CASE: unsupported-drive-network-negative",
    "CASE: reparse-unsupported-drive-network-negative",
    "[IO.File]::Delete($markerPath)",
    "[IO.Directory]::Delete($reparseLink)",
    "SmbShare\\Remove-SmbShare",
    "$cleanupFailures.Count -ne 0",
    "Unsupported-drive operation failed before cleanup",
  ]) {
    contract(
      unsupportedFixture.includes(required),
      `required unsupported-drive fixture is missing ${required}`,
    );
  }
  contract(
    /\$actualDriveType -ne\s+\[FyAgent\.NsisLifecycle\.NativeNetworkDrive\]::DRIVE_REMOTE/u.test(
      unsupportedFixture,
    ),
    "controlled unsupported drive must be proven as DRIVE_REMOTE",
  );
  contract(
    !unsupportedFixture.includes("Get-CimInstance Win32_LogicalDisk") &&
      !unsupportedFixture.includes("$unsupportedDisks"),
    "required unsupported-drive acceptance must not depend on ambient disk enumeration",
  );
  contract(
    normalizedLines(unsupportedFixture).filter(
      (line) => line.trim() === "$caseCount += 1",
    ).length === 2,
    "required unsupported-drive fixture must count exactly two executed cases",
  );
  contract(
    unsupportedFixture.includes("if ($caseCount -ne 2)"),
    "required unsupported-drive fixture must reject a non-two case count",
  );
  assertOrdered(
    unsupportedFixture,
    [
      "[IO.File]::Delete($markerPath)",
      "[IO.Directory]::Delete($reparseLink)",
      "::Disconnect(",
      "SmbShare\\Remove-SmbShare",
      "$cleanupFailures.Count -ne 0",
    ],
    "required unsupported-drive cleanup",
  );
  const unsupportedMainContract = [
    "  $unsupportedDriveCaseCount = Invoke-RequiredUnsupportedDriveAcceptance `",
    "    -InstallerPath $resolvedInstaller `",
    "    -WorkingDirectory $testRoot `",
    "    -Identifier $runId",
    "  if ($unsupportedDriveCaseCount -ne 2) {",
    '    throw "The native lifecycle executed $unsupportedDriveCaseCount unsupported-drive cases instead of 2."',
    "  }",
  ].join("\n");
  contract(
    mainLifecycle.includes(unsupportedMainContract),
    "required unsupported-drive acceptance must be invoked unconditionally and require exactly two cases",
  );
  assertOrdered(
    mainLifecycle,
    [
      "CASE: webview2-signed-space-unicode-verify",
      "Save-OfficialWebView2BootstrapperFixture -DestinationPath $signedCandidate",
      "Invoke-WebView2SignatureVerification",
      "webview2-signed-space-unicode-verify",
      "CASE: webview2-current-user-fake-root-negative",
      "Invoke-FakeCurrentUserRootAttackFixture",
    ],
    "native WebView2 live trust fixtures",
  );

  const fakeRootFixtureStart = source.indexOf(
    "function Invoke-FakeCurrentUserRootAttackFixture",
  );
  const fakeRootFixtureEnd = source.indexOf("\n$runId =", fakeRootFixtureStart);
  contract(
    fakeRootFixtureStart >= 0 && fakeRootFixtureEnd > fakeRootFixtureStart,
    "native lifecycle fake-root attack fixture is missing or unterminated",
  );
  const fakeRootFixture = source.slice(
    fakeRootFixtureStart,
    fakeRootFixtureEnd,
  );
  assertOrdered(
    fakeRootFixture,
    [
      "$defaultSignature = Get-AuthenticodeSignature -LiteralPath $unsignedPe",
      "SignatureStatus]::Valid",
      "Invoke-WebView2SignatureVerification",
      "webview2-current-user-fake-root-negative",
    ],
    "native CurrentUser fake-root trust attack fixture",
  );
  contract(
    /if \(\$null -ne \$publisherStore[\s\S]*?try \{[\s\S]*?\$publisherStore\.Remove\(\$leafPublic\)[\s\S]*?\} catch \{[\s\S]*?Fake TrustedPublisher cleanup failed[\s\S]*?\}\s*\}\s*if \(\$null -ne \$rootStore[\s\S]*?try \{[\s\S]*?\$rootStore\.Remove\(\$rootPublic\)[\s\S]*?\} catch \{[\s\S]*?Fake CurrentUser root cleanup failed/u.test(
      fakeRootFixture,
    ),
    "native fake-root cleanup must independently remove both CurrentUser certificates",
  );
  contract(
    /function Assert-RejectedInstallLeftNoMachineWrites[\s\S]*?Test-Path -LiteralPath \$CandidateInstallDirectory/u.test(
      source,
    ),
    "rejected-path lifecycle cases must prove the final directory was never created",
  );
  contract(
    !source.includes("Remove-Item -LiteralPath $userProfileFyagentDirectory"),
    "native lifecycle must never delete a pre-existing real user-data parent",
  );
  contract(
    /finally \{[\s\S]*?if \(\$cleanupAuthorized\) \{[\s\S]*?Invoke-BestEffortNsisUninstall/u.test(
      source,
    ),
    "destructive lifecycle cleanup must remain behind clean-run authorization",
  );
}

function assertConfigContract(baseConfig, windowsConfig) {
  contract(
    baseConfig?.bundle?.windows === undefined,
    "base Tauri config must not retain a Windows WiX/MSI surface",
  );
  contract(
    JSON.stringify(windowsConfig?.bundle?.targets) === JSON.stringify(["nsis"]),
    "Windows override must bundle exactly NSIS",
  );
  const windows = windowsConfig?.bundle?.windows;
  contract(
    windows && typeof windows === "object",
    "Windows bundle config is missing",
  );
  contract(
    windows.wix === undefined,
    "Windows override must not configure WiX",
  );
  contract(
    JSON.stringify(windows.webviewInstallMode) ===
      JSON.stringify({ type: "downloadBootstrapper" }),
    "WebView2 mode must be downloadBootstrapper",
  );

  const nsis = windows.nsis;
  contract(
    nsis?.template === "nsis/installer.nsi",
    "custom NSIS template path drifted",
  );
  contract(
    nsis?.installerHooks === "nsis/webview2-command.nsh",
    "secure WebView2 encoded-command include path drifted",
  );
  contract(
    nsis?.installMode === "perMachine",
    "NSIS installMode must be perMachine",
  );
  contract(
    JSON.stringify(nsis?.languages) ===
      JSON.stringify(["English", "SimpChinese"]),
    "NSIS languages must be English and SimpChinese",
  );
  contract(
    nsis?.displayLanguageSelector === false,
    "installer language must follow the OS without a selector",
  );
}

export function verifyWindowsNsisContract(options = {}) {
  const baseConfigPath = path.resolve(
    options.baseConfigPath ??
      path.join(DEFAULT_ROOT, "src-tauri", "tauri.conf.json"),
  );
  const windowsConfigPath = path.resolve(
    options.windowsConfigPath ??
      path.join(DEFAULT_ROOT, "src-tauri", "tauri.windows.conf.json"),
  );
  const templatePath = path.resolve(
    options.templatePath ??
      path.join(DEFAULT_ROOT, "src-tauri", "nsis", "installer.nsi"),
  );
  const cargoManifestPath = path.resolve(
    options.cargoManifestPath ??
      path.join(DEFAULT_ROOT, "src-tauri", "Cargo.toml"),
  );
  const webviewSourcePath = path.resolve(
    options.webviewSourcePath ??
      path.join(
        DEFAULT_ROOT,
        "src-tauri",
        "nsis",
        "install-webview2-bootstrapper.ps1",
      ),
  );
  const webviewLoaderPath = path.resolve(
    options.webviewLoaderPath ??
      path.join(
        DEFAULT_ROOT,
        "src-tauri",
        "nsis",
        "load-encoded-webview2-command.ps1",
      ),
  );
  const webviewIncludePath = path.resolve(
    options.webviewIncludePath ??
      path.join(DEFAULT_ROOT, "src-tauri", "nsis", "webview2-command.nsh"),
  );
  const lifecyclePath = path.resolve(
    options.lifecyclePath ??
      path.join(
        DEFAULT_ROOT,
        "scripts",
        "release",
        "verify-windows-nsis-lifecycle.ps1",
      ),
  );
  const fakeRootCertificatePath = path.resolve(
    options.fakeRootCertificatePath ??
      path.join(
        DEFAULT_ROOT,
        "tests",
        "fixtures",
        "windows-nsis",
        "fake-current-user-root.pem",
      ),
  );
  const fakeLeafCertificatePath = path.resolve(
    options.fakeLeafCertificatePath ??
      path.join(
        DEFAULT_ROOT,
        "tests",
        "fixtures",
        "windows-nsis",
        "fake-microsoft-code-signing-leaf.pem",
      ),
  );

  const baseConfig = readJson(baseConfigPath, "base Tauri config");
  const windowsConfig = readJson(windowsConfigPath, "Windows Tauri config");
  const source = fs.readFileSync(templatePath, "utf8");
  const executableSource = stripNsisComments(source);
  const webviewSource = fs.readFileSync(webviewSourcePath, "utf8");
  const webviewLoader = fs.readFileSync(webviewLoaderPath, "utf8");
  const webviewInclude = fs.readFileSync(webviewIncludePath, "utf8");
  const lifecycleSource = fs.readFileSync(lifecyclePath, "utf8");
  const fakeRootPem = fs.readFileSync(fakeRootCertificatePath, "utf8");
  const fakeLeafPem = fs.readFileSync(fakeLeafCertificatePath, "utf8");
  const blocks = parseNsisBlocks(source);

  assertConfigContract(baseConfig, windowsConfig);
  const workspaceVersion = readWorkspaceVersion(cargoManifestPath);
  try {
    assertWindowsBundleVersion(workspaceVersion);
  } catch (error) {
    contract(
      false,
      `canonical Cargo version cannot be bundled by NSIS: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  for (const [label, value] of Object.entries(TAURI_NSIS_UPSTREAM)) {
    contract(
      source.includes(value),
      `template provenance is missing upstream ${label}`,
    );
  }
  contract(
    executableSource.includes("RequestExecutionLevel admin"),
    "per-machine template must require administrator execution",
  );
  contract(
    executableSource.includes(
      'StrCpy $INSTDIR "$PROGRAMFILES64\\${PRODUCTNAME}"',
    ),
    "64-bit default install path must remain Program Files",
  );
  contract(
    !/(?:WixMode|wix_loop|msiexec|Uninstall previous WiX installation)/iu.test(
      executableSource,
    ),
    "retired MSI/WiX migration logic remains executable",
  );

  assertFinalPathValidatorContract(source);
  assertRuntimeProvisionContract(source, blocks);
  assertUninstallOwnershipContract(source, blocks);
  assertWebView2CommandContract({
    source: webviewSource,
    include: webviewInclude,
    loader: webviewLoader,
    loaderPath: webviewLoaderPath,
    template: source,
    blocks,
    fakeRootPem,
    fakeLeafPem,
  });
  assertLifecycleContract(lifecycleSource);

  return Object.freeze({
    templatePath,
    baseConfigPath,
    windowsConfigPath,
    cargoManifestPath,
    lifecyclePath,
    workspaceVersion,
    upstream: TAURI_NSIS_UPSTREAM,
    sectionOrder: blocks
      .filter((block) => block.kind === "section")
      .map((block) => block.name),
  });
}

function parseArguments(argv) {
  const options = {};
  const keys = new Map([
    ["--base-config", "baseConfigPath"],
    ["--windows-config", "windowsConfigPath"],
    ["--template", "templatePath"],
    ["--cargo-manifest", "cargoManifestPath"],
    ["--webview-source", "webviewSourcePath"],
    ["--webview-loader", "webviewLoaderPath"],
    ["--webview-include", "webviewIncludePath"],
    ["--lifecycle", "lifecyclePath"],
    ["--fake-root-certificate", "fakeRootCertificatePath"],
    ["--fake-leaf-certificate", "fakeLeafCertificatePath"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const property = keys.get(argv[index]);
    contract(property, `unknown argument ${argv[index]}`);
    contract(index + 1 < argv.length, `${argv[index]} requires a path`);
    options[property] = argv[index + 1];
    index += 1;
  }
  return options;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyWindowsNsisContract(
      parseArguments(process.argv.slice(2)),
    );
    process.stdout.write(
      `Windows NSIS contract verified (${result.upstream.tag}; sections: ${result.sectionOrder.join(
        ", ",
      )})\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
