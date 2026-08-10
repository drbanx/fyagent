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

export function assertInstallPathPolicyContract(
  source,
  repoOwnedIncludeSources = [],
) {
  const blocks = parseNsisBlocks(source);
  const executableSource = stripNsisComments(source);
  const executableRepoOwnedIncludes = repoOwnedIncludeSources.map((include) =>
    stripNsisComments(include),
  );
  const executableClosure = [
    executableSource,
    ...executableRepoOwnedIncludes,
  ].join("\n");

  for (const forbidden of [
    "FyAgentValidateFinalInstallDir",
    "FyAgentValidateInstallDirPageLeave",
    "-FyAgentInstallDirGate",
    "fyagentInvalidInstallDir",
    "FYAGENT_DRIVE_FIXED",
    "GetFullPathNameW",
    "GetFinalPathNameByHandleW",
    "GetVolumePathNameW",
    "GetDriveTypeW",
  ]) {
    contract(
      !executableClosure.includes(forbidden),
      `installer must not reintroduce custom installation-path restriction ${forbidden}`,
    );
  }
  for (const executableInclude of executableRepoOwnedIncludes) {
    const installDirUse = executableInclude
      .split("\n")
      .map((line) => line.trim())
      .find((line) => /\$INSTDIR\b/iu.test(line));
    contract(
      installDirUse === undefined,
      `repo-owned NSIS include/hook must not inspect or rewrite $INSTDIR: ${installDirUse}`,
    );
  }
  const directoryPage = "!insertmacro MUI_PAGE_DIRECTORY";
  const directoryPageIndex = executableSource.indexOf(directoryPage);
  contract(
    directoryPageIndex >= 0 &&
      executableSource.indexOf(directoryPage, directoryPageIndex + 1) < 0,
    "installer must retain exactly one standard NSIS directory page",
  );
  const precedingPageIndex = Math.max(
    executableSource.lastIndexOf(
      "!insertmacro MUI_PAGE_",
      directoryPageIndex - 1,
    ),
    executableSource.lastIndexOf(
      "!insertmacro MUI_UNPAGE_",
      directoryPageIndex - 1,
    ),
  );
  const directoryPageDeclaration = executableSource.slice(
    precedingPageIndex < 0 ? 0 : precedingPageIndex,
    directoryPageIndex + directoryPage.length,
  );
  contract(
    !directoryPageDeclaration.includes("MUI_PAGE_CUSTOMFUNCTION_LEAVE"),
    "directory page must not bind a custom leave-time path gate",
  );
  contract(
    directoryPageDeclaration.includes(
      "!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive",
    ),
    "standard NSIS directory page must retain its passive-mode pre callback",
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
    JSON.stringify(sections.map((block) => block.name)) ===
      JSON.stringify([
        "-FyAgentMachineRuntimeBootstrap",
        "EarlyChecks",
        "WebView2",
        "Install",
        "Uninstall",
      ]),
    "installer sections must not add a custom installation-path gate",
  );

  const webviewIndex = sections.findIndex((block) => block.name === "WebView2");
  const installIndex = sections.findIndex((block) => block.name === "Install");
  const bootstrapIndex = sections.findIndex(
    (block) => block.name === "-FyAgentMachineRuntimeBootstrap",
  );
  contract(bootstrapIndex === 0, "machine runtime bootstrap section drifted");
  contract(
    webviewIndex > bootstrapIndex,
    "WebView2 section must follow runtime bootstrap",
  );
  contract(installIndex > webviewIndex, "Install section must follow WebView2");
  contract(
    stripNsisComments(namedBlock(blocks, "section", "Install").body).includes(
      "SetOutPath $INSTDIR",
    ),
    "Install section must select the user-chosen output path",
  );

  const installDirLines = executableSource
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.includes("$INSTDIR"));
  const allowedInstallDirLinePatterns = [
    /^\$\{OrIf\} \$\{FileExists\} "\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe"$/u,
    /^nsis_tauri_utils::RunAsUser "\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe" (?:""|"\$R0")$/u,
    /^\$\{If\} \$INSTDIR == "\$\{PLACEHOLDER_INSTALL_DIR\}"$/u,
    /^StrCpy \$INSTDIR (?:"\$(?:PROGRAMFILES64|PROGRAMFILES|LOCALAPPDATA)\\\$\{PRODUCTNAME\}"|\$4)$/u,
    /^SetOutPath \$INSTDIR$/u,
    /^CreateDirectory "\$INSTDIR\\\\\{\{this\}\}"$/u,
    /^!insertmacro APP_ASSOCIATE .+ "\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe,0" .+ "\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe \$\\"%1\$\\""$/u,
    /^WriteRegStr SHCTX .+\$INSTDIR.*$/u,
    /^WriteUninstaller "\$INSTDIR\\uninstall\.exe"$/u,
    /^Delete "\$INSTDIR\\.+"$/u,
    /^\$\{GetSize\} "\$INSTDIR" "\/M=uninstall\.exe \/S=0K \/G=0" \$0 \$1 \$2$/u,
    /^\$\{If\} \$R7 == "\$\\"\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe\$\\" \$\\"%1\$\\""$/u,
    /^RMDir(?: \/(?:REBOOTOK|r))? "\$INSTDIR(?:\\\\\{\{this\}\})?"$/u,
    /^!insertmacro (?:IsShortcutTarget|SetShortcutTarget) .+ "\$INSTDIR\\(?:\$OldMainBinaryName|\$\{MAINBINARYNAME\}\.exe)"$/u,
    /^CreateShortcut .+ "\$INSTDIR\\\$\{MAINBINARYNAME\}\.exe"$/u,
  ];
  for (const line of installDirLines) {
    contract(
      allowedInstallDirLinePatterns.some((pattern) => pattern.test(line)),
      `installer must not use $INSTDIR for custom path admission: ${line}`,
    );
  }
  contract(
    installDirLines.filter((line) => line === "SetOutPath $INSTDIR").length ===
      1,
    "installer must select the user-chosen output path exactly once",
  );
  contract(
    installDirLines.filter((line) => line.startsWith("StrCpy $INSTDIR "))
      .length === 6,
    "installer must not rewrite the user-chosen path outside default/maintenance restoration",
  );

  const restorePreviousInstallLocation = stripNsisComments(
    namedBlock(blocks, "function", "RestorePreviousInstallLocation").body,
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  contract(
    JSON.stringify(restorePreviousInstallLocation) ===
      JSON.stringify([
        'ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""',
        'StrCmp $4 "" +2 0',
        "StrCpy $INSTDIR $4",
      ]),
    "RestorePreviousInstallLocation may only read the registered path, skip an empty value, and copy a non-empty value verbatim to $INSTDIR",
  );

  const reinstall = stripNsisComments(
    namedBlock(blocks, "function", "PageLeaveReinstall").body,
  );
  contract(
    reinstall.includes("ExecWait '$R1' $0"),
    "maintenance flow must invoke the existing NSIS uninstaller",
  );
  contract(
    !/(?:GetDriveTypeW|FyAgentValidateFinalInstallDir|-FyAgentInstallDirGate)/u.test(
      reinstall,
    ),
    "maintenance flow must not reintroduce the retired path restriction",
  );
  const registryInstallPathAliasUses = reinstall
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\$4\b/u.test(line));
  contract(
    JSON.stringify(registryInstallPathAliasUses) ===
      JSON.stringify([
        'ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""',
        'StrCpy $R1 "$R1 _?=$4"',
      ]),
    "maintenance registry install-path alias $4 may only be passed to the existing uninstaller",
  );
}

function assertCanonicalIconContract(source, repoOwnedIncludeSources) {
  const sources = [
    { label: "template", source },
    ...repoOwnedIncludeSources.map((include, index) => ({
      label: `repo-owned include ${index + 1}`,
      source: include,
    })),
  ];
  const directives = [];

  for (const candidate of sources) {
    for (const line of stripNsisComments(candidate.source).split("\n")) {
      const match = line.match(/^\s*!(define|undef)\b(.*)$/iu);
      if (!match) continue;
      const tokens = match[2].trim().split(/\s+/u);
      while (tokens[0]?.startsWith("/")) tokens.shift();
      const symbol = tokens[0]?.toUpperCase();
      if (symbol !== "MUI_ICON" && symbol !== "MUI_UNICON") continue;
      directives.push({
        kind: match[1].toLowerCase(),
        label: candidate.label,
        line: line.trim(),
        symbol,
      });
    }
  }

  for (const symbol of ["MUI_ICON", "MUI_UNICON"]) {
    const matches = directives.filter(
      (directive) => directive.symbol === symbol,
    );
    contract(
      matches.length === 1 &&
        matches[0].kind === "define" &&
        matches[0].label === "template" &&
        matches[0].line === `!define ${symbol} "\${INSTALLERICON}"`,
      `installer and uninstaller must each have exactly one canonical FyAgent icon definition across the repo-owned NSIS closure (${symbol})`,
    );
  }
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

function powerShellExecutableProjection(source) {
  return normalizedLines(source.replace(/<#[\s\S]*?#>/gu, ""))
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n")
    .replace(/`\n\s*/gu, " ");
}

function assertResolvedInstallerLifecycleCalls(source) {
  const expectedCalls = new Map([
    ["default-install", { arguments: "@('/S')", shouldSucceed: "$true" }],
    [
      "preexisting-runtime-extra-ace-negative",
      {
        arguments: "@('/S', \"/D=$customInstallDir\")",
        shouldSucceed: "$false",
      },
    ],
    [
      "preexisting-runtime-unknown-content-negative",
      {
        arguments: "@('/S', \"/D=$customInstallDir\")",
        shouldSucceed: "$false",
      },
    ],
    [
      "preexisting-runtime-no-delete-share-negative",
      {
        arguments: "@('/S', \"/D=$customInstallDir\")",
        shouldSucceed: "$false",
      },
    ],
    [
      "custom-space-unicode-silent-D",
      {
        arguments: "@('/S', \"/D=$customInstallDir\")",
        shouldSucceed: "$true",
      },
    ],
  ]);
  const executable = powerShellExecutableProjection(source);
  const functionDefinitions = [
    ...executable.matchAll(/^function Invoke-NsisProcess \{$/gimu),
  ];
  contract(
    functionDefinitions.length === 1,
    "manual lifecycle must define Invoke-NsisProcess exactly once",
  );
  const uninstallHelperCalls = [
    ...executable.matchAll(
      /\[void\]\(\s*Invoke-NsisProcess\s+-FilePath\s+\$copiedUninstaller\s+-Arguments\s+@\(\s*'\/S'\s*,\s*"_\?=\$InstallDirectory"\s*\)\s+-ShouldSucceed\s+\$true\s+-CaseName\s+\$CaseName\s+-WorkingDirectory\s+\$WorkingDirectory\s+-ArgumentKind\s+Uninstall\s+-TimeoutMilliseconds\s+\$TimeoutMilliseconds\s*\)/giu,
    ),
  ];
  contract(
    uninstallHelperCalls.length === 1,
    "manual lifecycle must retain exactly one approved case-local uninstaller Invoke-NsisProcess call",
  );

  const mainLifecycleStart = executable.indexOf("$cleanupAuthorized = $true");
  const mainLifecycleEnd = executable.indexOf(
    'Write-Host "Windows NSIS native lifecycle verified for $Architecture."',
    mainLifecycleStart,
  );
  contract(
    mainLifecycleStart >= 0 && mainLifecycleEnd > mainLifecycleStart,
    "manual lifecycle setup invocation boundary is missing",
  );
  const mainLifecycle = executable.slice(mainLifecycleStart, mainLifecycleEnd);
  const resolvedInstallerReferences = [
    ...mainLifecycle.matchAll(/-FilePath\s+\$resolvedInstaller\b/giu),
  ];
  const resolvedInstallerCalls = [
    ...mainLifecycle.matchAll(
      /\[void\]\(\s*Invoke-NsisProcess\s+-FilePath\s+\$resolvedInstaller\s+-Arguments\s+(?<arguments>@\([^)]*\))\s+-ShouldSucceed\s+(?<shouldSucceed>\$(?:true|false))\s+-CaseName\s+'(?<caseName>[^']+)'\s+-WorkingDirectory\s+\$testRoot\s*\)/giu,
    ),
  ];
  contract(
    resolvedInstallerReferences.length === expectedCalls.size,
    "manual lifecycle resolved-installer invocation set drifted",
  );
  contract(
    resolvedInstallerCalls.length === resolvedInstallerReferences.length,
    "manual lifecycle resolved-installer invocations must use literal arguments, case name, expected outcome, and the test working directory",
  );

  const observedCases = new Set();
  for (const match of resolvedInstallerCalls) {
    contract(
      match?.groups,
      "manual lifecycle resolved-installer invocations must use literal arguments, case name, expected outcome, and the test working directory",
    );
    const { arguments: argumentsValue, caseName, shouldSucceed } = match.groups;
    const expected = expectedCalls.get(caseName);
    contract(
      expected !== undefined && !observedCases.has(caseName),
      `manual lifecycle contains an unexpected or duplicate resolved-installer case ${caseName}`,
    );
    contract(
      argumentsValue.replace(/\s+/gu, "") ===
        expected.arguments.replace(/\s+/gu, "") &&
        shouldSucceed === expected.shouldSucceed,
      `manual lifecycle resolved-installer case ${caseName} has unexpected arguments or outcome`,
    );
    observedCases.add(caseName);
  }
  contract(
    observedCases.size === expectedCalls.size,
    "manual lifecycle is missing an approved resolved-installer case",
  );

  const allInvokeNsisProcessReferences = [
    ...executable.matchAll(/\bInvoke-NsisProcess\b/giu),
  ];
  contract(
    allInvokeNsisProcessReferences.length ===
      functionDefinitions.length +
        uninstallHelperCalls.length +
        resolvedInstallerCalls.length,
    "manual lifecycle Invoke-NsisProcess invocation set drifted",
  );
}

export function assertLifecycleContract(source) {
  for (const required of [
    "[string]$InstallerPath",
    "[string]$Architecture",
    "[string]$AppVersion",
    "Get-PeMachine",
    "0x8664",
    "0xAA64",
    "DisplayVersion",
    "RegistryView]::Registry64",
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
  for (const retired of [
    "CASE: relative-path-negative",
    "CASE: unc-network-negative",
    "CASE: access-denied-ancestor-negative",
    "CASE: reparse-network-negative",
    "CASE: unsupported-drive-network-negative",
    "CASE: reparse-unsupported-drive-network-negative",
    "FyAgent.NsisLifecycle.NativeNetworkDrive",
    "Invoke-RequiredUnsupportedDriveAcceptance",
    "SmbShare\\New-SmbShare",
    "Assert-RejectedInstallLeftNoMachineWrites",
    "before its final path was admitted",
  ]) {
    contract(
      !source.includes(retired),
      `manual lifecycle must not enforce the retired installation-path restriction ${retired}`,
    );
  }
  assertResolvedInstallerLifecycleCalls(source);
  const mainLifecycleStart = source.indexOf("$cleanupAuthorized = $true");
  contract(
    mainLifecycleStart >= 0,
    "native lifecycle never reaches an authorized clean-run execution",
  );
  const mainLifecycle = source.slice(mainLifecycleStart);

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
    /function Assert-FailedRuntimeBootstrapLeftNoInstallWrites[\s\S]*?Test-Path -LiteralPath \$CandidateInstallDirectory/u.test(
      source,
    ),
    "rejected machine-runtime cases must prove the final directory was never created",
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
    nsis?.installerIcon === "icons/icon.ico",
    "NSIS installer icon must use the canonical FyAgent icon",
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
  const lifecyclePath =
    options.lifecyclePath === undefined
      ? null
      : path.resolve(options.lifecyclePath);
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
  const lifecycleSource =
    lifecyclePath === null ? null : fs.readFileSync(lifecyclePath, "utf8");
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
  assertCanonicalIconContract(source, [webviewInclude]);
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

  assertInstallPathPolicyContract(source, [webviewInclude]);
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
  if (lifecycleSource !== null) {
    assertLifecycleContract(lifecycleSource);
  }

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
