import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATTESTATION_BUNDLE_NAME,
  BUILD_METADATA_NAME,
  CI_WORKFLOW_PATH,
  DOWNLOAD_MANIFEST_NAME,
  RELEASE_BRANCH,
  WINDOWS_SIGNING_STATUS_NAME,
  EXPECTED_TARGETS,
  EXPECTED_INSTALLERS_BY_TARGET,
  WINDOWS_SIGNING_FRAGMENTS_BY_TARGET,
  assertWindowsBundleVersion,
  buildBuildMetadata,
  expectedAttestationSubjectNames,
  expectedInstallerNames,
  expectedReleaseAttachmentNames,
  assertExactFileSet,
  type ExpectedTarget,
  type PlatformBuildMetadataRecord,
  type ReleaseIdentity,
} from "../scripts/release/release-contract.mjs";

const temporaryRoots: string[] = [];
const repositoryRoot = path.resolve(__dirname, "..");
const collectorScript = path.join(
  repositoryRoot,
  "scripts",
  "release",
  "collect-workflow-artifacts.mjs",
);
const identity: ReleaseIdentity = {
  productVersion: "0.3.0",
  tag: "v0.3.0",
  sourceSha: "b".repeat(40),
  repository: "NongHua123/fyagent",
  repositoryId: "1313497021",
  workflowPath: ".github/workflows/release.yml",
  workflowRef:
    "NongHua123/fyagent/.github/workflows/release.yml@refs/heads/dev/laiyongjie",
  workflowSha: "b".repeat(40),
  runId: "123456",
  runAttempt: "2",
  event: "workflow_dispatch",
  mode: "preflight",
  ciWorkflowPath: CI_WORKFLOW_PATH,
  ciRunId: "987654",
  ciRunAttempt: "3",
};

function temporaryDirectory(): string {
  const root = mkdtempSync(path.join(tmpdir(), "fyagent-release-assets-"));
  temporaryRoots.push(root);
  return root;
}

function writePlatformMetadata(
  directory: string,
  metadataIdentity: ReleaseIdentity = identity,
): void {
  for (const expected of EXPECTED_TARGETS) {
    writeFileSync(
      path.join(directory, `${expected.targetGroup}.json`),
      `${JSON.stringify(platformMetadataRecord(expected, metadataIdentity), null, 2)}\n`,
    );
  }
}

function platformMetadataRecord(
  expected: ExpectedTarget,
  metadataIdentity: ReleaseIdentity = identity,
): PlatformBuildMetadataRecord {
  return {
    schema: "fyagent-platform-build/v1",
    targetGroup: expected.targetGroup,
    platform: expected.platform,
    architecture: expected.architecture,
    runner: {
      requestedLabel: expected.requestedRunnerLabel,
      context: {
        os: expected.expectedRunnerOs,
        arch: expected.expectedRunnerArch,
      },
    },
    container:
      expected.expectedContainer === null
        ? null
        : {
            configuredImage: {
              reference: expected.expectedContainer.imageReference,
              manifestDigest: expected.expectedContainer.manifestDigest,
            },
            observed: {
              osRelease: {
                id: expected.expectedContainer.osReleaseId,
                versionId: expected.expectedContainer.osReleaseVersionId,
              },
              unameMachine: expected.expectedContainer.unameMachine,
            },
          },
    toolchain: {
      node: "v24.19.0",
      pnpm: "10.12.3",
      rustc: "rustc 1.97.1 (reviewed 2026-08-08)",
    },
    identity: metadataIdentity,
  };
}

type MutableRecord = Record<string, unknown>;

function mutatePlatformRecord(
  directory: string,
  targetGroup: string,
  mutate: (record: MutableRecord) => void,
): void {
  const metadataPath = path.join(directory, `${targetGroup}.json`);
  const record = JSON.parse(
    readFileSync(metadataPath, "utf8"),
  ) as MutableRecord;
  mutate(record);
  writeFileSync(metadataPath, `${JSON.stringify(record, null, 2)}\n`);
}

function nestedRecord(record: MutableRecord, key: string): MutableRecord {
  return record[key] as MutableRecord;
}

function writeInstallerArtifacts(directory: string): void {
  const installers = expectedInstallerNames("0.3.0");
  for (const { targetGroup } of EXPECTED_TARGETS) {
    const artifact = path.join(directory, `installers-${targetGroup}`);
    mkdirSync(artifact);
    for (const index of EXPECTED_INSTALLERS_BY_TARGET[targetGroup]) {
      writeFileSync(path.join(artifact, installers[index]), installers[index]);
    }
  }
}

function writeSigningArtifacts(directory: string): void {
  for (const [targetGroup, fragmentName] of Object.entries(
    WINDOWS_SIGNING_FRAGMENTS_BY_TARGET,
  )) {
    const artifact = path.join(directory, `signing-${targetGroup}`);
    mkdirSync(artifact);
    writeFileSync(path.join(artifact, fragmentName), fragmentName);
  }
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { force: true, recursive: true });
  }
});

const UNKNOWN_METADATA_KEY_CASES: Array<
  [string, (record: MutableRecord) => void]
> = [
  ["record root", (record) => (record.unexpected = true)],
  [
    "retired root runnerLabel",
    (record) => (record.runnerLabel = "ubuntu-24.04"),
  ],
  ["retired root containerDigest", (record) => (record.containerDigest = null)],
  ["runner", (record) => (nestedRecord(record, "runner").unexpected = true)],
  [
    "retired runnerOs",
    (record) => (nestedRecord(record, "runner").runnerOs = "Linux"),
  ],
  [
    "retired runnerArch",
    (record) => (nestedRecord(record, "runner").runnerArch = "X64"),
  ],
  [
    "runner context",
    (record) =>
      (nestedRecord(nestedRecord(record, "runner"), "context").unexpected =
        true),
  ],
  [
    "container",
    (record) => (nestedRecord(record, "container").unexpected = true),
  ],
  [
    "configured image",
    (record) =>
      (nestedRecord(
        nestedRecord(record, "container"),
        "configuredImage",
      ).unexpected = true),
  ],
  [
    "container observations",
    (record) =>
      (nestedRecord(nestedRecord(record, "container"), "observed").unexpected =
        true),
  ],
  [
    "OS release observations",
    (record) =>
      (nestedRecord(
        nestedRecord(nestedRecord(record, "container"), "observed"),
        "osRelease",
      ).unexpected = true),
  ],
  [
    "toolchain",
    (record) => (nestedRecord(record, "toolchain").unexpected = true),
  ],
  [
    "identity",
    (record) => (nestedRecord(record, "identity").unexpected = true),
  ],
  [
    "retired imageOs",
    (record) => (nestedRecord(record, "runner").imageOs = "retired"),
  ],
  [
    "retired imageVersion",
    (record) => (nestedRecord(record, "runner").imageVersion = "retired"),
  ],
];

const INVALID_METADATA_CASES: Array<
  [string, string, (record: MutableRecord) => void, RegExp]
> = [
  [
    "runner OS drift",
    "linux-x64",
    (record) =>
      (nestedRecord(nestedRecord(record, "runner"), "context").os = "Windows"),
    /runner context OS drifted/,
  ],
  [
    "runner architecture drift",
    "linux-x64",
    (record) =>
      (nestedRecord(nestedRecord(record, "runner"), "context").arch = "ARM64"),
    /runner context architecture drifted/,
  ],
  [
    "macOS hosted-runner architecture drift",
    "macos-universal",
    (record) =>
      (nestedRecord(nestedRecord(record, "runner"), "context").arch = "X64"),
    /runner context architecture drifted/,
  ],
  [
    "undocumented runner architecture",
    "macos-universal",
    (record) =>
      (nestedRecord(nestedRecord(record, "runner"), "context").arch =
        "UNIVERSAL"),
    /not a documented GitHub value/,
  ],
  [
    "requested runner label drift",
    "linux-x64",
    (record) => (nestedRecord(record, "runner").requestedLabel = "latest"),
    /requested runner label drifted/,
  ],
  [
    "null Linux container",
    "linux-x64",
    (record) => (record.container = null),
    /container must be an object/,
  ],
  [
    "partial Linux container",
    "linux-x64",
    (record) => delete nestedRecord(record, "container").observed,
    /container must contain exactly these keys/,
  ],
  [
    "native-platform container claim",
    "windows-x64",
    (record) => {
      const linuxTarget = EXPECTED_TARGETS.find(
        ({ targetGroup }) => targetGroup === "linux-x64",
      )!;
      record.container = platformMetadataRecord(linuxTarget).container;
    },
    /must record container as null/,
  ],
  [
    "image reference and digest mismatch",
    "linux-x64",
    (record) =>
      (nestedRecord(
        nestedRecord(record, "container"),
        "configuredImage",
      ).reference = "docker.io/library/ubuntu:22.04@sha256:" + "0".repeat(64)),
    /must end with its manifest digest/,
  ],
  [
    "configured image drift",
    "linux-x64",
    (record) => {
      const armTarget = EXPECTED_TARGETS.find(
        ({ targetGroup }) => targetGroup === "linux-arm64",
      )!;
      const configuredImage = nestedRecord(
        nestedRecord(record, "container"),
        "configuredImage",
      );
      configuredImage.reference = armTarget.expectedContainer!.imageReference;
      configuredImage.manifestDigest =
        armTarget.expectedContainer!.manifestDigest;
    },
    /configured container image reference drifted|container manifest digest drifted/,
  ],
  [
    "container OS ID drift",
    "linux-x64",
    (record) =>
      (nestedRecord(
        nestedRecord(nestedRecord(record, "container"), "observed"),
        "osRelease",
      ).id = "debian"),
    /observed container OS ID drifted/,
  ],
  [
    "container OS version drift",
    "linux-x64",
    (record) =>
      (nestedRecord(
        nestedRecord(nestedRecord(record, "container"), "observed"),
        "osRelease",
      ).versionId = "24.04"),
    /observed container OS version drifted/,
  ],
  [
    "container uname drift",
    "linux-x64",
    (record) =>
      (nestedRecord(
        nestedRecord(record, "container"),
        "observed",
      ).unameMachine = "aarch64"),
    /observed container machine drifted/,
  ],
];

describe("release asset and metadata contract", () => {
  it("freezes the exact runner and container acceptance map", () => {
    expect(EXPECTED_TARGETS).toEqual([
      {
        targetGroup: "macos-universal",
        platform: "macos",
        architecture: "universal",
        requestedRunnerLabel: "macos-15",
        expectedRunnerOs: "macOS",
        expectedRunnerArch: "ARM64",
        expectedContainer: null,
      },
      {
        targetGroup: "windows-x64",
        platform: "windows",
        architecture: "x64",
        requestedRunnerLabel: "windows-2025",
        expectedRunnerOs: "Windows",
        expectedRunnerArch: "X64",
        expectedContainer: null,
      },
      {
        targetGroup: "windows-arm64",
        platform: "windows",
        architecture: "arm64",
        requestedRunnerLabel: "windows-11-arm",
        expectedRunnerOs: "Windows",
        expectedRunnerArch: "ARM64",
        expectedContainer: null,
      },
      {
        targetGroup: "linux-x64",
        platform: "linux",
        architecture: "x64",
        requestedRunnerLabel: "ubuntu-24.04",
        expectedRunnerOs: "Linux",
        expectedRunnerArch: "X64",
        expectedContainer: {
          imageReference:
            "docker.io/library/ubuntu:22.04@sha256:0199853f6d6b20b0424f3c5694a72a62764f01e6a771b1eb48a4197848986c7e",
          manifestDigest:
            "sha256:0199853f6d6b20b0424f3c5694a72a62764f01e6a771b1eb48a4197848986c7e",
          osReleaseId: "ubuntu",
          osReleaseVersionId: "22.04",
          unameMachine: "x86_64",
        },
      },
      {
        targetGroup: "linux-arm64",
        platform: "linux",
        architecture: "arm64",
        requestedRunnerLabel: "ubuntu-24.04-arm",
        expectedRunnerOs: "Linux",
        expectedRunnerArch: "ARM64",
        expectedContainer: {
          imageReference:
            "docker.io/library/ubuntu:22.04@sha256:a8cdd2158a73d7e5c02aa351fe269f48f57cf710a241db86e9ede371fc150149",
          manifestDigest:
            "sha256:a8cdd2158a73d7e5c02aa351fe269f48f57cf710a241db86e9ede371fc150149",
          osReleaseId: "ubuntu",
          osReleaseVersionId: "22.04",
          unameMachine: "aarch64",
        },
      },
    ]);
  });

  it("freezes the NSIS-only Windows assets and the complete release file sets", () => {
    expect(RELEASE_BRANCH).toBe("dev/laiyongjie");
    expect(expectedInstallerNames("0.3.0")).toHaveLength(10);
    expect(expectedInstallerNames("0.3.0")).toContain(
      "FyAgent-0.3.0-Windows-x64-setup.exe",
    );
    expect(expectedInstallerNames("0.3.0")).toContain(
      "FyAgent-0.3.0-Windows-arm64-setup.exe",
    );
    expect(expectedInstallerNames("0.3.0")).not.toContain(
      "FyAgent-0.3.0-Windows.msi",
    );
    expect(expectedAttestationSubjectNames("0.3.0")).toEqual([
      ...expectedInstallerNames("0.3.0"),
      DOWNLOAD_MANIFEST_NAME,
      BUILD_METADATA_NAME,
      WINDOWS_SIGNING_STATUS_NAME,
    ]);
    expect(expectedAttestationSubjectNames("0.3.0")).toHaveLength(13);
    expect(expectedReleaseAttachmentNames("0.3.0")).toEqual([
      ...expectedAttestationSubjectNames("0.3.0"),
      ATTESTATION_BUNDLE_NAME,
    ]);
    expect(expectedReleaseAttachmentNames("0.3.0")).toHaveLength(14);
  });

  it("fails closed when a canonical version cannot fit NSIS fixed-file fields", () => {
    expect(() => assertWindowsBundleVersion("65535.65535.65535")).not.toThrow();
    expect(() => assertWindowsBundleVersion("65536.0.0")).toThrow(
      /Windows NSIS version components must be between 0 and 65535/u,
    );
    expect(() => assertWindowsBundleVersion("9007199254740993.0.0")).toThrow(
      /Windows NSIS version components must be between 0 and 65535/u,
    );
    expect(() => expectedInstallerNames("0.65536.0")).toThrow(
      /Windows NSIS version components must be between 0 and 65535/u,
    );
  });

  it("rejects directories, symlinks, missing names, and unapproved ancillary files", () => {
    const directory = temporaryDirectory();
    for (const name of expectedInstallerNames("0.3.0")) {
      writeFileSync(path.join(directory, name), name);
    }
    mkdirSync(path.join(directory, "nested"));
    expect(() =>
      assertExactFileSet(
        directory,
        expectedInstallerNames("0.3.0"),
        "installers",
      ),
    ).toThrow(/Only regular files are allowed/);
  });

  it("collects five isolated installer artifacts without allowing overwrite", () => {
    const root = temporaryDirectory();
    const downloads = path.join(root, "downloads");
    const output = path.join(root, "installers");
    mkdirSync(downloads);
    writeInstallerArtifacts(downloads);
    execFileSync(
      process.execPath,
      [collectorScript, "installers", downloads, output, "0.3.0"],
      { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" },
    );
    expect(readdirSync(output).sort()).toEqual(
      expectedInstallerNames("0.3.0").sort(),
    );
  });

  it("collects exactly two private Windows signing fragments", () => {
    const root = temporaryDirectory();
    const downloads = path.join(root, "downloads");
    const output = path.join(root, "signing-fragments");
    mkdirSync(downloads);
    writeSigningArtifacts(downloads);
    execFileSync(
      process.execPath,
      [collectorScript, "signing", downloads, output, "0.3.0"],
      { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" },
    );
    expect(readdirSync(output).sort()).toEqual(
      Object.values(WINDOWS_SIGNING_FRAGMENTS_BY_TARGET).sort(),
    );
  });

  it("rejects extra signing fragments before aggregation", () => {
    const root = temporaryDirectory();
    const downloads = path.join(root, "downloads");
    mkdirSync(downloads);
    writeSigningArtifacts(downloads);
    writeFileSync(
      path.join(downloads, "signing-windows-x64", "unexpected.json"),
      "unexpected",
    );
    expect(() =>
      execFileSync(
        process.execPath,
        [
          collectorScript,
          "signing",
          downloads,
          path.join(root, "signing-fragments"),
          "0.3.0",
        ],
        { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow(/signing-windows-x64 artifact must contain exactly 1 files/);
  });

  it("rejects duplicate or misplaced installers before flattening artifacts", () => {
    const root = temporaryDirectory();
    const downloads = path.join(root, "downloads");
    mkdirSync(downloads);
    writeInstallerArtifacts(downloads);
    writeFileSync(
      path.join(downloads, "installers-windows-x64", "FyAgent-0.3.0-macOS.dmg"),
      "duplicate",
    );
    expect(() =>
      execFileSync(
        process.execPath,
        [
          collectorScript,
          "installers",
          downloads,
          path.join(root, "installers"),
          "0.3.0",
        ],
        { cwd: repositoryRoot, encoding: "utf8", stdio: "pipe" },
      ),
    ).toThrow(/installers-windows-x64 artifact must contain exactly 1 files/);
  });

  it("aggregates exactly five identity-bound platform records", () => {
    const directory = temporaryDirectory();
    writePlatformMetadata(directory);
    const metadata = buildBuildMetadata({
      metadataDirectory: directory,
      identity,
      generatedAt: "2026-08-08T00:00:00.000Z",
    });
    expect(metadata).toMatchObject({
      schema: "fyagent-build-metadata/v1",
      product: "FyAgent",
      version: "0.3.0",
      tag: "v0.3.0",
      sourceSha: "b".repeat(40),
      repository: {
        nameWithOwner: "NongHua123/fyagent",
        id: "1313497021",
      },
      workflow: {
        path: ".github/workflows/release.yml",
        runId: "123456",
        runAttempt: "2",
        event: "workflow_dispatch",
        mode: "preflight",
        ref: "NongHua123/fyagent/.github/workflows/release.yml@refs/heads/dev/laiyongjie",
        sha: "b".repeat(40),
      },
      requiredCi: {
        path: ".github/workflows/ci.yml",
        runId: "987654",
        runAttempt: "3",
        job: "CI / Required",
        conclusion: "success",
      },
    });
    expect(metadata.targets.map(({ targetGroup }) => targetGroup)).toEqual(
      EXPECTED_TARGETS.map(({ targetGroup }) => targetGroup),
    );
    expect(Object.keys(metadata).sort()).toEqual(
      [
        "schema",
        "product",
        "version",
        "tag",
        "sourceSha",
        "repository",
        "workflow",
        "requiredCi",
        "generatedAt",
        "targets",
      ].sort(),
    );
    for (const target of metadata.targets) {
      expect(Object.keys(target).sort()).toEqual(
        [
          "schema",
          "targetGroup",
          "platform",
          "architecture",
          "runner",
          "container",
          "toolchain",
        ].sort(),
      );
      expect(Object.keys(target.runner).sort()).toEqual(
        ["requestedLabel", "context"].sort(),
      );
      expect(Object.keys(target.runner.context).sort()).toEqual(["arch", "os"]);
      expect(Object.keys(target.toolchain).sort()).toEqual([
        "node",
        "pnpm",
        "rustc",
      ]);
      expect("identity" in target).toBe(false);
      if (target.container === null) continue;
      expect(Object.keys(target.container).sort()).toEqual([
        "configuredImage",
        "observed",
      ]);
      expect(Object.keys(target.container.configuredImage).sort()).toEqual([
        "manifestDigest",
        "reference",
      ]);
      expect(Object.keys(target.container.observed).sort()).toEqual([
        "osRelease",
        "unameMachine",
      ]);
      expect(Object.keys(target.container.observed.osRelease).sort()).toEqual([
        "id",
        "versionId",
      ]);
    }
  });

  it("records the exact Required CI binding for preflight and formal metadata", () => {
    const directory = temporaryDirectory();
    const formalIdentity = {
      ...identity,
      workflowRef:
        "NongHua123/fyagent/.github/workflows/release.yml@refs/tags/v0.3.0",
      workflowSha: identity.sourceSha,
      event: "push",
      mode: "formal",
      ciWorkflowPath: ".github/workflows/ci.yml",
      ciRunId: "987654",
      ciRunAttempt: "3",
    };
    writePlatformMetadata(directory, formalIdentity);
    const metadata = buildBuildMetadata({
      metadataDirectory: directory,
      identity: formalIdentity,
      generatedAt: "2026-08-08T00:00:00.000Z",
    });
    expect(metadata.requiredCi).toEqual({
      path: ".github/workflows/ci.yml",
      runId: "987654",
      runAttempt: "3",
      job: "CI / Required",
      conclusion: "success",
    });

    const secondDirectory = temporaryDirectory();
    writePlatformMetadata(secondDirectory);
    expect(
      buildBuildMetadata({
        metadataDirectory: secondDirectory,
        identity,
        generatedAt: "2026-08-08T00:00:00.000Z",
      }).requiredCi,
    ).toEqual({
      path: ".github/workflows/ci.yml",
      runId: "987654",
      runAttempt: "3",
      job: "CI / Required",
      conclusion: "success",
    });
  });

  it("accepts another canonical stable version and binds its formal tag ref", () => {
    const directory = temporaryDirectory();
    const generalizedIdentity: ReleaseIdentity = {
      ...identity,
      productVersion: "12.34.56",
      tag: "v12.34.56",
      workflowRef:
        "NongHua123/fyagent/.github/workflows/release.yml@refs/tags/v12.34.56",
      event: "push",
      mode: "formal",
    };
    writePlatformMetadata(directory, generalizedIdentity);

    const metadata = buildBuildMetadata({
      metadataDirectory: directory,
      identity: generalizedIdentity,
      generatedAt: "2026-08-08T00:00:00.000Z",
    });

    expect(metadata.version).toBe("12.34.56");
    expect(metadata.tag).toBe("v12.34.56");
    expect(metadata.workflow.ref).toBe(generalizedIdentity.workflowRef);
    expect(expectedInstallerNames(metadata.version)).toHaveLength(10);
  });

  it.each([
    [
      "repository",
      { repository: "fork/fyagent" },
      /Repository identity drifted/,
    ],
    ["repository id", { repositoryId: "42" }, /Repository ID drifted/],
    [
      "workflow",
      { workflowPath: ".github/workflows/other.yml" },
      /workflow path drifted/,
    ],
    [
      "preflight workflow ref",
      {
        workflowRef:
          "NongHua123/fyagent/.github/workflows/release.yml@refs/heads/main",
      },
      /Preflight must use the trusted dev\/laiyongjie workflow ref/,
    ],
    [
      "formal workflow ref",
      {
        workflowRef:
          "NongHua123/fyagent/.github/workflows/release.yml@refs/tags/v12.34.56",
        event: "push",
        mode: "formal",
      },
      /Formal Release workflow ref drifted/,
    ],
    [
      "CI workflow",
      { ciWorkflowPath: ".github/workflows/other.yml" },
      /CI workflow path drifted/,
    ],
    ["CI run", { ciRunId: "0" }, /ciRunId must be numeric/],
    ["CI attempt", { ciRunAttempt: "0" }, /ciRunAttempt must be numeric/],
    ["source SHA", { sourceSha: "c".repeat(39) }, /full 40-character/],
  ])("rejects %s identity drift", (_label, change, error) => {
    const directory = temporaryDirectory();
    writePlatformMetadata(directory);
    expect(() =>
      buildBuildMetadata({
        metadataDirectory: directory,
        identity: { ...identity, ...change },
        generatedAt: "2026-08-08T00:00:00.000Z",
      }),
    ).toThrow(error);
  });

  it.each(UNKNOWN_METADATA_KEY_CASES)(
    "rejects unknown keys at the %s level",
    (_label, mutate) => {
      const directory = temporaryDirectory();
      writePlatformMetadata(directory);
      mutatePlatformRecord(directory, "linux-x64", mutate);
      expect(() =>
        buildBuildMetadata({
          metadataDirectory: directory,
          identity,
          generatedAt: "2026-08-08T00:00:00.000Z",
        }),
      ).toThrow(/must contain exactly these keys/);
    },
  );

  it.each(INVALID_METADATA_CASES)(
    "rejects %s",
    (_label, targetGroup, mutate, error) => {
      const directory = temporaryDirectory();
      writePlatformMetadata(directory);
      mutatePlatformRecord(directory, targetGroup, mutate);
      expect(() =>
        buildBuildMetadata({
          metadataDirectory: directory,
          identity,
          generatedAt: "2026-08-08T00:00:00.000Z",
        }),
      ).toThrow(error);
    },
  );

  it("rejects malformed container digest syntax", () => {
    const directory = temporaryDirectory();
    writePlatformMetadata(directory);
    mutatePlatformRecord(directory, "linux-arm64", (record) => {
      nestedRecord(
        nestedRecord(record, "container"),
        "configuredImage",
      ).manifestDigest = "sha256:ABC";
    });
    expect(() =>
      buildBuildMetadata({
        metadataDirectory: directory,
        identity,
        generatedAt: "2026-08-08T00:00:00.000Z",
      }),
    ).toThrow(/manifest digest must be lowercase SHA-256/);
  });
});
