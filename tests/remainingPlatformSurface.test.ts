import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const CHECKER = path.join(
  ROOT,
  "scripts",
  "tasks",
  "supported-platform-check.mjs",
);

type Finding = {
  path: string;
  line: number;
  rule: string;
  excerpt: string;
};

type SurfaceMarkers = {
  kernel: string;
  subsystem: string;
  runnerFamily: string;
  distributions: readonly string[];
  imagePackage: string;
  sandboxPackage: string;
  sandboxCatalog: string;
  archivePackage: string;
  nativePackage: string;
  displayToolkit: string;
  embeddedToolkit: string;
  windowProtocol: string;
  compositorProtocol: string;
  directoryConvention: string;
  objectFormat: string;
  serviceManager: string;
  messageBus: string;
  packageCommands: readonly string[];
  broadRustFamily: string;
  displayEnvironment: string;
  packageAddCommand: string;
  sandboxInstallCommand: string;
};

type RustAllowance = {
  id: string;
  file: string;
  condition: string;
  next: string;
  nextPrefix?: boolean;
};

type CheckerModule = {
  EXPECTED_ACTIVE_TASK: string;
  RUST_ALLOWANCE_CONTRACT: readonly RustAllowance[];
  SURFACE_MARKERS: SurfaceMarkers;
  inspectRepository(options?: Record<string, unknown>): {
    findings: Finding[];
    inspectedFiles: number;
  };
  isExcludedPath(relativePath: string, activeTask?: string): boolean;
  isTextExcludedPath(relativePath: string): boolean;
  listCurrentFiles(
    root?: string,
    runner?: (...args: unknown[]) => unknown,
  ): string[];
  parseArguments(
    argv: string[],
    environment?: Record<string, string>,
  ): string | undefined;
  readCurrentEntry(root: string, relativePath: string, io?: unknown): unknown;
  scanPath(relativePath: string): Finding[];
  scanRustImplicitPredicates(
    entries: Array<{ path: string; source: string }>,
  ): Finding[];
  scanText(relativePath: string, source: string): Finding[];
  validateActiveTaskExclusion(
    value: string,
    options?: Record<string, unknown>,
  ): string;
};

let checker: CheckerModule;

beforeAll(async () => {
  checker = (await import(
    /* @vite-ignore */ pathToFileURL(CHECKER).href
  )) as CheckerModule;
});

function activeTaskFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fyagent-surface-"));
  const relative = checker.EXPECTED_ACTIVE_TASK;
  const directory = path.join(root, ...relative.split("/"));
  fs.mkdirSync(directory, { recursive: true });
  const id = path.basename(directory).replace(/^\d+-\d+-/u, "");
  fs.writeFileSync(
    path.join(directory, "task.json"),
    `${JSON.stringify({ id, name: id, status: "in_progress" })}\n`,
  );
  return { directory, relative, root };
}

function permittedRustEntries() {
  return [
    ...new Set(checker.RUST_ALLOWANCE_CONTRACT.map(({ file }) => file)),
  ].map((relativePath) => ({
    path: relativePath,
    source: fs.readFileSync(path.join(ROOT, relativePath), "utf8"),
  }));
}

describe("durable supported-platform surface contract", () => {
  it("constructs every retired marker without making the checker or test self-match", () => {
    for (const relativePath of [
      "scripts/tasks/supported-platform-check.mjs",
      "tests/remainingPlatformSurface.test.ts",
    ]) {
      const source = fs.readFileSync(path.join(ROOT, relativePath), "utf8");
      expect(checker.scanText(relativePath, source), relativePath).toEqual([]);
      expect(checker.scanPath(relativePath), relativePath).toEqual([]);
    }
  });

  it("rejects direct platform, distribution, package, display, and host-probe samples", () => {
    const markers = checker.SURFACE_MARKERS;
    const samples = [
      markers.kernel,
      `is${markers.kernel}`,
      `${markers.subsystem}.exe`,
      markers.runnerFamily,
      ...markers.distributions,
      markers.imagePackage,
      markers.sandboxPackage,
      markers.sandboxCatalog,
      `artifact.${markers.archivePackage}`,
      `artifact.${markers.nativePackage}`,
      markers.displayToolkit,
      markers.embeddedToolkit,
      markers.windowProtocol,
      markers.compositorProtocol,
      `${markers.directoryConvention.toUpperCase()}_DATA_HOME`,
      markers.objectFormat,
      markers.serviceManager,
      markers.messageBus,
      `"${markers.displayEnvironment}"`,
      ["", ["pr", "oc"].join(""), "version"].join("/"),
      ["", "etc", "os-release"].join("/"),
      ["", "mnt", "c", "tools"].join("/"),
      ["", ["ho", "me"].join(""), "demo"].join("/"),
      ["[Desktop", " Entry]"].join(""),
      ['{ "tar', 'gets": "all" }'].join(""),
      ["platform ", '!== "win32"'].join(""),
      ["!is", "Windows()"].join(""),
      ...markers.packageCommands,
      `${markers.packageAddCommand} add package`,
      `${markers.sandboxInstallCommand} install package`,
    ];

    for (const [index, sample] of samples.entries()) {
      expect(
        checker.scanText(`fixture-${index}.txt`, sample),
        sample,
      ).not.toEqual([]);
    }
  });

  it("audits filenames and strips only encoded SVG payload bytes", () => {
    const marker = checker.SURFACE_MARKERS.kernel;
    expect(checker.scanPath(`assets/${marker}-package.json`)).not.toEqual([]);

    const encoded = Buffer.from(marker, "utf8").toString("base64");
    const opaque = `<svg><image href="data:image/png;base64,${encoded}" /></svg>`;
    expect(checker.scanText("assets/icon.svg", opaque)).toEqual([]);
    expect(
      checker.scanText(
        "assets/icon.svg",
        `${opaque}\n<title>${marker}</title>`,
      ),
    ).not.toEqual([]);
  });

  it("keeps the exclusion set closed and the temporary task input exact", () => {
    const marker = checker.SURFACE_MARKERS.kernel;
    expect(
      checker.isExcludedPath(`.trellis/tasks/archive/${marker}/task.json`),
    ).toBe(true);
    expect(checker.isExcludedPath(`.trellis/tasks/current/${marker}.md`)).toBe(
      false,
    );
    expect(checker.isTextExcludedPath("pnpm-lock.yaml")).toBe(true);
    expect(checker.isTextExcludedPath("src-tauri/Cargo.lock")).toBe(true);
    expect(checker.isTextExcludedPath("mise.lock")).toBe(false);

    const fixture = activeTaskFixture();
    try {
      expect(
        checker.validateActiveTaskExclusion(fixture.relative, {
          root: fixture.root,
        }),
      ).toBe(fixture.relative);
      expect(
        checker.isExcludedPath(
          `${fixture.relative}/research.md`,
          fixture.relative,
        ),
      ).toBe(true);
      for (const invalid of [
        ".trellis/tasks/*",
        `${fixture.relative}/child`,
        fixture.relative.replaceAll("/", "\\"),
        `.trellis/tasks/archive/${path.basename(fixture.relative)}`,
      ]) {
        expect(() =>
          checker.validateActiveTaskExclusion(invalid, { root: fixture.root }),
        ).toThrow();
      }

      fs.writeFileSync(
        path.join(fixture.directory, "task.json"),
        `${JSON.stringify({
          id: path.basename(fixture.directory).replace(/^\d+-\d+-/u, ""),
          name: path.basename(fixture.directory).replace(/^\d+-\d+-/u, ""),
          status: "complete",
        })}\n`,
      );
      expect(() =>
        checker.validateActiveTaskExclusion(fixture.relative, {
          root: fixture.root,
        }),
      ).toThrow(/exact active task/);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("accepts only one explicit argument channel", () => {
    const expected = checker.EXPECTED_ACTIVE_TASK;
    expect(
      checker.parseArguments(["--exclude-active-task", expected], {}),
    ).toBe(expected);
    expect(
      checker.parseArguments([], { usage_exclude_active_task: expected }),
    ).toBe(expected);
    expect(checker.parseArguments([], {})).toBeUndefined();
    expect(() =>
      checker.parseArguments(["--exclude-active-task", expected], {
        usage_exclude_active_task: expected,
      }),
    ).toThrow(/two inputs/);
    expect(() => checker.parseArguments(["--unknown"], {})).toThrow(/Usage/);
  });

  it("freezes every fail-closed Rust allowance by file, condition, and adjacent structure", () => {
    const entries = permittedRustEntries();
    expect(checker.RUST_ALLOWANCE_CONTRACT).toHaveLength(9);
    expect(checker.scanRustImplicitPredicates(entries)).toEqual([]);

    const first = checker.RUST_ALLOWANCE_CONTRACT[0];
    const drifted = entries.map((entry) =>
      entry.path === first.file
        ? {
            ...entry,
            source: entry.source.replace(first.next, `${first.next} drift`),
          }
        : entry,
    );
    expect(checker.scanRustImplicitPredicates(drifted)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "rust:allowance-drift" }),
        expect.objectContaining({ rule: "rust:implicit-target" }),
      ]),
    );

    const broad = {
      path: "src-tauri/tests/fixture.rs",
      source: `#[cfg(\n  ${checker.SURFACE_MARKERS.broadRustFamily}\n)]\nfn fixture() {}`,
    };
    expect(checker.scanRustImplicitPredicates([...entries, broad])).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: broad.path,
          rule: "rust:implicit-target",
        }),
      ]),
    );
  });

  it("fails closed when Git enumeration or file reads fail", () => {
    expect(() =>
      checker.listCurrentFiles(ROOT, () => ({
        error: undefined,
        status: 1,
        stdout: Buffer.alloc(0),
      })),
    ).toThrow(/Unable to enumerate/);

    const denied = Object.assign(new Error("denied"), { code: "EACCES" });
    expect(() =>
      checker.readCurrentEntry(ROOT, "README.md", {
        lstatSync() {
          throw denied;
        },
      }),
    ).toThrow("denied");

    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "fyagent-utf8-"));
    try {
      fs.writeFileSync(
        path.join(fixture, "invalid.txt"),
        Buffer.from([0xc3, 0x28]),
      );
      expect(() => checker.readCurrentEntry(fixture, "invalid.txt")).toThrow();
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("publishes a read-only parameterized task inside the contract gate", async () => {
    const taskContract = (await import(
      /* @vite-ignore */ pathToFileURL(
        path.join(ROOT, "scripts", "tasks", "task-contract-check.mjs"),
      ).href
    )) as {
      loadTaskDefinitions(): Record<
        string,
        {
          env: { FYAGENT_TASK_EFFECT: string };
          run: unknown;
          usage?: string;
        }
      >;
    };
    const tasks = taskContract.loadTaskDefinitions();
    const task = tasks["supported-platform:check"];
    expect(task.env.FYAGENT_TASK_EFFECT).toBe("read-only");
    expect(task.usage).toContain("--exclude-active-task <path>");
    expect(tasks["check:contracts"].run).toEqual(
      expect.arrayContaining([{ task: "supported-platform:check" }]),
    );
  });
});
