import fs from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const HELPER_ROOT = "src-tauri/user-helper";

function read(relativePath: string): string {
  return fs
    .readFileSync(path.join(ROOT, relativePath), "utf8")
    .replace(/\r\n/gu, "\n");
}

function productionRust(relativePath: string): string {
  return read(relativePath).split("#[cfg(test)]", 1)[0];
}

const manifest = parseToml(read(`${HELPER_ROOT}/Cargo.toml`)) as Record<
  string,
  any
>;
const cli = productionRust(`${HELPER_ROOT}/src/cli.rs`);
const layout = productionRust(`${HELPER_ROOT}/src/layout.rs`);
const protocol = productionRust(`${HELPER_ROOT}/src/protocol.rs`);
const runtime = read(`${HELPER_ROOT}/src/windows.rs`);
const main = read(`${HELPER_ROOT}/src/main.rs`);
const helperBuild = read(`${HELPER_ROOT}/build.rs`);
const helperManifest = read(
  `${HELPER_ROOT}/windows/fyagent-user-helper.manifest`,
);
const windowsAdapter = read(
  "src-tauri/src/codex_desktop/platform/windows/mod.rs",
);
const parentHelper = read(
  "src-tauri/src/codex_desktop/platform/windows/helper.rs",
);
const processLaunch = read("src-tauri/src/platform/process_launch.rs");
const explorerLaunch = read(
  "src-tauri/src/platform/windows/interactive_user.rs",
);
const prepareHelper = read("scripts/prepare-windows-user-helper.mjs");
const windowsTauriConfig = JSON.parse(
  read("src-tauri/tauri.windows.conf.json"),
) as Record<string, any>;

describe("Codex current-user helper static contract", () => {
  it("keeps the independent crate protocol-only by default", () => {
    expect(manifest.features?.default).toEqual([]);
    expect(new Set(manifest.features?.["helper-runtime"])).toEqual(
      new Set(["dep:url", "dep:windows", "dep:windows-future"]),
    );

    const binaries = manifest.bin as Array<Record<string, unknown>>;
    expect(binaries).toHaveLength(1);
    expect(binaries[0]).toMatchObject({
      name: "fyagent-user-helper",
      path: "src/main.rs",
      "required-features": ["helper-runtime"],
    });

    const windowsDependencies =
      manifest.target?.['cfg(target_os = "windows")']?.dependencies;
    expect(Object.keys(windowsDependencies).sort()).toEqual([
      "url",
      "windows",
      "windows-future",
    ]);
    for (const dependency of Object.values(windowsDependencies) as Array<
      Record<string, unknown>
    >) {
      expect(dependency.optional).toBe(true);
    }

    expect(JSON.stringify(manifest)).not.toMatch(/tauri/iu);
    expect(main).toMatch(/#\[cfg\(target_os = "windows"\)\]\s+mod windows;/u);
    expect(main).toContain(
      '#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]',
    );
  });

  it("accepts only the fixed action, canonical job ID, and 256-bit nonce", () => {
    expect(cli).toContain('INSTALL_ACTION: &str = "codex-msix-install"');
    expect(cli).toContain('JOB_ID_FLAG: &str = "--job-id"');
    expect(cli).toContain('PIPE_FLAG: &str = "--pipe"');
    expect(cli).toMatch(/PIPE_NONCE_BYTES:\s*usize\s*=\s*64\s*;/u);
    expect(cli).toMatch(/JOB_ID_BYTES:\s*usize\s*=\s*36\s*;/u);
    expect(cli).toContain("Vec::with_capacity(5)");
    expect(cli).toMatch(/if raw\[0\] != INSTALL_ACTION/u);
    expect(cli).toMatch(/if raw\[1\] != JOB_ID_FLAG/u);
    expect(cli).toMatch(/if raw\[3\] != PIPE_FLAG/u);

    const acceptedFlags = cli.match(/"--[a-z-]+"/gu) ?? [];
    expect(acceptedFlags).toEqual(['"--job-id"', '"--pipe"']);
    expect(cli).not.toMatch(/current_dir|temp_dir|std::env::var/u);
  });

  it("derives one fixed install-root package path and local pipe name", () => {
    for (const contract of [
      'CACHE_DIRECTORY: &str = "cache"',
      'CODEX_INSTALLER_DIRECTORY: &str = "codex-installer"',
      'INSTALLER_FILE_NAME: &str = "installer.msix"',
      String.raw`USER_HELPER_PIPE_PREFIX: &str = r"\\.\pipe\LOCAL\FyAgent.UserHelper.v1."`,
    ]) {
      expect(layout).toContain(contract);
    }

    expect(layout).toMatch(
      /current_executable\s*\.parent\(\)[\s\S]+?\.join\(CACHE_DIRECTORY\)[\s\S]+?\.join\(CODEX_INSTALLER_DIRECTORY\)[\s\S]+?\.join\(job_id\.as_str\(\)\)[\s\S]+?\.join\(INSTALLER_FILE_NAME\)/u,
    );
    expect(layout).toMatch(/ExecutablePathNotAbsolute/u);
    expect(layout).toMatch(/ExecutablePathNotNormalized/u);
    expect(layout).not.toMatch(
      /current_dir|temp_dir|USERPROFILE|PROGRAMDATA/iu,
    );
  });

  it("keeps the wire format versioned, bounded, and enum-only", () => {
    expect(protocol).toMatch(/PROTOCOL_VERSION:\s*u8\s*=\s*1\s*;/u);
    expect(protocol).toMatch(/FRAME_LENGTH_BYTES:\s*usize\s*=\s*4\s*;/u);
    expect(protocol).toMatch(/MAX_ERROR_MESSAGE_BYTES:\s*usize\s*=\s*256\s*;/u);
    expect(protocol).toContain(
      "MAX_PAYLOAD_BYTES: usize = 2 + 1 + 2 + MAX_ERROR_MESSAGE_BYTES",
    );
    expect(protocol).toContain(
      "MAX_FRAME_BYTES: usize = FRAME_LENGTH_BYTES + MAX_PAYLOAD_BYTES",
    );

    const messageEnum = protocol.match(
      /pub enum HelperMessage\s*\{([\s\S]*?)\n\}/u,
    )?.[1];
    expect(messageEnum).toBeDefined();
    expect(messageEnum).toMatch(/\bStarted\b/u);
    expect(messageEnum).toMatch(/\bProgress\b[\s\S]*completed:\s*u8/u);
    expect(messageEnum).toMatch(/\bSuccess\b/u);
    expect(messageEnum).toMatch(
      /\bError\b[\s\S]*code:\s*HelperErrorCode[\s\S]*message:\s*String/u,
    );
    expect(messageEnum).not.toMatch(/Path|Command|Uri|Scope/iu);

    for (const rejection of [
      "PayloadTooLarge",
      "TrailingBytes",
      "UnsupportedVersion",
      "UnknownMessageKind",
      "InvalidProgress",
      "ErrorMessageTooLong",
      "InvalidUtf8",
    ]) {
      expect(protocol).toContain(rejection);
    }
  });

  it("uses one minimal pipe write per message and only current-user AddPackage", () => {
    expect(layout).toMatch(
      /USER_HELPER_PIPE_CLIENT_ACCESS_MASK:\s*u32\s*=\s*0x0010_0002\s*;/u,
    );
    expect(runtime).toContain("USER_HELPER_PIPE_CLIENT_ACCESS_MASK");
    expect(runtime).toMatch(/CreateFileW\([\s\S]+?OPEN_EXISTING/u);
    expect(runtime.match(/\bWriteFile\s*\(/gu)).toHaveLength(1);
    expect(runtime).toMatch(/written as usize == frame\.len\(\)/u);

    expect(runtime.match(/\.AddPackageByUriAsync\s*\(/gu)).toHaveLength(1);
    expect(runtime).not.toMatch(
      /StagePackage|ProvisionPackage|RegisterPackage|RequestAddPackage|PackageVolume/iu,
    );
    expect(runtime).not.toMatch(
      /std::process::Command|Command::new|CreateProcess|ShellExecute|cmd\.exe|powershell/iu,
    );
    expect(runtime).not.toMatch(/tauri/iu);
  });

  it("embeds an independent ordinary-user manifest", () => {
    expect(helperManifest).toMatch(
      /<requestedExecutionLevel\s+level="asInvoker"\s+uiAccess="false"\s*\/>/u,
    );
    expect(helperManifest).not.toMatch(
      /requireAdministrator|highestAvailable/u,
    );
    expect(read(`${HELPER_ROOT}/windows/fyagent-user-helper.rc`).trim()).toBe(
      '1 24 "fyagent-user-helper.manifest"',
    );
    expect(helperBuild).toContain(
      'embed_resource::ParamsIncludeDirs(&["windows"])',
    );
    expect(helperBuild).toContain(".manifest_required()");
  });

  it("builds and stages only locked matching-version Windows helpers", () => {
    const supportedTargetBlock = prepareHelper.match(
      /const SUPPORTED_TARGETS = new Set\(\[([\s\S]*?)\]\);/u,
    )?.[1];
    expect(supportedTargetBlock?.match(/[a-z0-9_]+-pc-windows-msvc/gu)).toEqual(
      ["x86_64-pc-windows-msvc", "aarch64-pc-windows-msvc"],
    );
    expect(prepareHelper).toMatch(/SUPPORTED_TARGETS\.has\(target\)/u);

    expect(prepareHelper).toMatch(
      /desktopManifest\.workspace\?\.package\?\.version/u,
    );
    expect(manifest.package?.version).toEqual({ workspace: true });
    expect(prepareHelper).toMatch(
      /helperManifest\.package\?\.version\?\.workspace === true/u,
    );
    expect(prepareHelper).toMatch(/!helperInheritsVersion/u);

    for (const argument of [
      /"--locked"/u,
      /"--features"\s*,\s*"helper-runtime"/u,
      /"--bin"\s*,\s*"fyagent-user-helper"/u,
      /"--target"\s*,\s*target/u,
      /"--target-dir"\s*,\s*targetDirectory/u,
    ]) {
      expect(prepareHelper).toMatch(argument);
    }
    expect(prepareHelper).toMatch(/spawnSync\("cargo", cargoArguments/u);
    expect(prepareHelper).toContain("shell: false");

    expect(prepareHelper).toMatch(
      /sourceMetadata\.isFile\(\)[\s\S]+?sourceMetadata\.size === 0/u,
    );
    expect(prepareHelper).toContain("`fyagent-user-helper-${target}.exe`");
    const copy = prepareHelper.indexOf(
      "fs.copyFileSync(source, temporary, fs.constants.COPYFILE_EXCL)",
    );
    const rename = prepareHelper.indexOf(
      "fs.renameSync(temporary, destination)",
    );
    expect(prepareHelper).toContain("const temporary = `${destination}.part`");
    expect(copy).toBeGreaterThanOrEqual(0);
    expect(rename).toBeGreaterThan(copy);
  });

  it("packages one fixed Tauri sidecar name and ignores staged binaries", () => {
    expect(windowsTauriConfig.bundle?.externalBin).toEqual([
      "binaries/fyagent-user-helper",
    ]);
    expect(windowsTauriConfig.build?.beforeDevCommand).toContain(
      "node scripts/prepare-windows-user-helper.mjs",
    );
    expect(windowsTauriConfig.build?.beforeBuildCommand).toContain(
      "node scripts/prepare-windows-user-helper.mjs",
    );

    const ignoreRules = read("src-tauri/binaries/.gitignore")
      .split("\n")
      .filter(Boolean);
    expect(ignoreRules).toEqual(["*", "!.gitignore"]);
  });

  it("creates one local authenticated pipe and pins the admitted helper image", () => {
    for (const boundary of [
      "FILE_FLAG_FIRST_PIPE_INSTANCE",
      "PIPE_TYPE_MESSAGE",
      "PIPE_READMODE_MESSAGE",
      "PIPE_REJECT_REMOTE_CLIENTS",
      "GetNamedPipeClientProcessId",
      "GetNamedPipeClientSessionId",
      "OpenProcessToken",
      "ImpersonateNamedPipeClient",
      "OpenThreadToken",
      "RevertToSelf",
    ]) {
      expect(parentHelper).toContain(boundary);
    }
    expect(parentHelper).toContain("BCryptGenRandom");
    expect(parentHelper).toMatch(/let mut random = \[0_u8; 32\]/u);
    expect(parentHelper).toContain(
      "D:P(A;;0x00100002;;;{shell_sid})(A;;RC;;;SY)(A;;RC;;;BA)",
    );
    expect(parentHelper).not.toMatch(/\(A;;GA;;;(?:SY|BA)\)/u);
    expect(parentHelper).toMatch(
      /CreateNamedPipeW\([\s\S]+?PIPE_ACCESS_INBOUND[\s\S]+?FILE_FLAG_FIRST_PIPE_INSTANCE[\s\S]+?PIPE_REJECT_REMOTE_CLIENTS[\s\S]+?\n\s*1,/u,
    );

    const runner = parentHelper.match(
      /pub\(super\) fn run_pinned_user_helper\([\s\S]*?\n\}/u,
    )?.[0];
    expect(runner).toBeDefined();
    const imagePin = runner?.indexOf("PinnedHelperImage::open") ?? -1;
    const launch = runner?.indexOf("launch_fyagent_user_helper_as_user") ?? -1;
    const rawFirstFrame = runner?.indexOf("server.read_frame") ?? -1;
    const admission = runner?.indexOf("server.validate_client") ?? -1;
    const decode = runner?.indexOf("decode_protocol_frame") ?? -1;
    const consume = runner?.indexOf("consume_protocol") ?? -1;
    expect(imagePin).toBeGreaterThanOrEqual(0);
    expect(launch).toBeGreaterThan(imagePin);
    expect(rawFirstFrame).toBeGreaterThan(launch);
    expect(admission).toBeGreaterThan(rawFirstFrame);
    expect(decode).toBeGreaterThan(admission);
    expect(consume).toBeGreaterThan(decode);

    expect(parentHelper).toContain("fyagent-helper-peer-token");
    expect(parentHelper).toMatch(
      /PipeClientImpersonation::begin[\s\S]+?OpenThreadToken[\s\S]+?impersonation\.revert\(\)\?/u,
    );
    expect(parentHelper).toContain("TERMINAL_CLOSE_TIMEOUT");
    expect(parentHelper).toContain("ERROR_BROKEN_PIPE");
    expect(parentHelper).toContain("ERROR_NO_DATA");

    expect(parentHelper).toMatch(
      /CreateFileW\([\s\S]+?GENERIC_READ\.0,[\s\S]+?FILE_SHARE_READ,[\s\S]+?FILE_FLAG_OPEN_REPARSE_POINT/u,
    );
    expect(parentHelper).toContain("GetFileInformationByHandle");
    expect(parentHelper).toMatch(
      /connected_image\.identity\(\) != expected_identity/u,
    );
  });

  it("launches only the fixed sibling helper and typed arguments through Explorer", () => {
    expect(processLaunch).toContain(
      'USER_HELPER_FILE_NAME: &str = "fyagent-user-helper.exe"',
    );
    expect(processLaunch).toMatch(
      /current_exe\(\)[\s\S]+?\.parent\(\)[\s\S]+?\.join\(USER_HELPER_FILE_NAME\)/u,
    );
    expect(processLaunch).toMatch(
      /!metadata\.is_file\(\)[\s\S]+?metadata\.file_type\(\)\.is_symlink\(\)[\s\S]+?FILE_ATTRIBUTE_REPARSE_POINT/u,
    );

    const helperLauncher = explorerLaunch.match(
      /fn launch_fyagent_user_helper\([\s\S]*?\n\s*\}/u,
    )?.[0];
    expect(helperLauncher).toBeDefined();
    expect(helperLauncher).toContain("fixed_user_helper_path()");
    expect(helperLauncher).toContain(
      '"{INSTALL_ACTION} --job-id {job_id} --pipe {}"',
    );
    expect(helperLauncher).toContain("pipe_nonce.as_str()");
    expect(helperLauncher).toContain(
      "launch_path_from_explorer_with_arguments",
    );
    expect(helperLauncher).not.toContain("to_string_lossy");
    expect(explorerLaunch).toMatch(
      /fn launch_path_from_explorer_sta[\s\S]+?encode_wide\(\)[\s\S]+?BSTR::from_wide/u,
    );
    expect(explorerLaunch).toContain("USER_HELPER_LAUNCH_TIMEOUT");
    expect(explorerLaunch).toContain("USER_HELPER_LAUNCH_IN_FLIGHT");
    expect(explorerLaunch).toMatch(
      /launch_path_from_explorer_with_arguments[\s\S]+?sync_channel\(1\)[\s\S]+?recv_timeout\(USER_HELPER_LAUNCH_TIMEOUT\)/u,
    );
    expect(helperLauncher).not.toMatch(
      /--(?:path|uri|program|command|scope)|runas/iu,
    );
  });

  it("keeps helper activation fail-closed until install-root pinning lands", () => {
    expect(parentHelper).toMatch(
      /#\[allow\(dead_code\)\]\s+pub\(super\) fn run_pinned_user_helper/u,
    );

    const installMethodStart = windowsAdapter.indexOf(
      "    fn install_current_user<'a>(",
    );
    const installMethodEnd = windowsAdapter.indexOf(
      "\n    fn launch<'a>(",
      installMethodStart,
    );
    expect(installMethodStart).toBeGreaterThanOrEqual(0);
    expect(installMethodEnd).toBeGreaterThan(installMethodStart);
    const installMethod = windowsAdapter.slice(
      installMethodStart,
      installMethodEnd,
    );

    expect(installMethod).toContain("#[cfg(not(test))]");
    expect(installMethod).toContain(
      "InstallerErrorCode::WindowsDeploymentFailed",
    );
    expect(installMethod).toMatch(
      /helper remains disabled until verified package pinning is active/u,
    );
    expect(installMethod).not.toContain("run_pinned_user_helper");
  });
});
