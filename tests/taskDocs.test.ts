import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const DOCUMENT = path.join(
  ROOT,
  "docs",
  "fyagent",
  "development",
  "mise-tasks.md",
);
const GENERATOR = path.join(ROOT, "scripts", "tasks", "task-docs.mjs");
const DOCS_CHECKER = path.join(
  ROOT,
  "scripts",
  "tasks",
  "docs-contract-check.mjs",
);

type Generator = {
  escapeMarkdownCell(value: unknown): string;
  generateTaskDocs(): string;
};
type TaskDefinitions = Record<string, Record<string, unknown>>;
type DocsChecker = {
  NEW_CHECKOUT_GATE_MARKERS: Readonly<{ start: string; end: string }>;
  OPERATIONAL_TRELLIS_DOCUMENTS: readonly string[];
  extractMarkdownCommandCandidates(source: string): string[];
  isOperationalTrellisDocument(file: string): boolean;
  validateMiseTaskReferences(
    file: string,
    source: string,
    tasks: TaskDefinitions,
  ): void;
  validateOperationalTrellisDocument(
    file: string,
    source: string,
    tasks: TaskDefinitions,
  ): void;
};

let generator: Generator;
let docsChecker: DocsChecker;

beforeAll(async () => {
  generator = (await import(
    /* @vite-ignore */ pathToFileURL(GENERATOR).href
  )) as Generator;
  docsChecker = (await import(
    /* @vite-ignore */ pathToFileURL(DOCS_CHECKER).href
  )) as DocsChecker;
});

describe("generated mise task documentation", () => {
  it("is a byte-for-byte rendering of live task metadata", () => {
    const document = fs.readFileSync(DOCUMENT, "utf8").replace(/\r\n/g, "\n");
    expect(document).toBe(generator.generateTaskDocs());
    expect(document).toContain(
      "> Generated from `.mise/tasks/*.toml` by `mise run tasks:docs:generate --apply`.",
    );

    const result = execFileSync(process.execPath, [GENERATOR, "check"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(result).toContain("byte-for-byte current");
  });

  it("documents every currently loaded task without freezing future extensions", () => {
    const tasks = JSON.parse(
      execFileSync("mise", ["tasks", "ls", "--local", "--json"], {
        cwd: ROOT,
        encoding: "utf8",
      }),
    ) as Array<{ name: string }>;
    const document = fs.readFileSync(DOCUMENT, "utf8");

    expect(tasks.length).toBeGreaterThanOrEqual(80);
    for (const task of tasks) {
      const escapedName = task.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(document, task.name).toMatch(
        new RegExp("\\| `" + escapedName + "` +\\|"),
      );
    }
  });

  it("escapes Markdown pipes and normalizes multiline metadata", () => {
    expect(generator.escapeMarkdownCell("left|right\n next")).toBe(
      "left\\|right next",
    );
  });
});

describe("operational Trellis documentation contract", () => {
  const tasks: TaskDefinitions = {
    ["__proto__"]: {},
    a: {},
    bootstrap: {},
    constructor: {},
    "odd.task-1": {},
    "system:check": {},
    "trellis:context": {},
  };
  const gateStart = "<!-- fyagent:new-checkout-environment-gate:start -->";
  const gateEnd = "<!-- fyagent:new-checkout-environment-gate:end -->";
  const setupCommands = [
    "mise trust",
    "mise run bootstrap",
    "mise run system:check",
  ].join("\n");
  const manualSetupBody = [
    "For every new checkout, a human developer must explicitly review `mise.toml`.",
    "After that review, the developer manually runs this sequence in order:",
    "```bash",
    setupCommands,
    "```",
    "This gate is not automatic. Skills, hooks, and repository tasks must not automatically invoke `mise trust` or trigger `mise run bootstrap`.",
  ].join("\n");
  const manualSetup = [gateStart, manualSetupBody, gateEnd].join("\n");
  it("scans only the project-owned entrypoint, not upstream Trellis templates", () => {
    expect(docsChecker.OPERATIONAL_TRELLIS_DOCUMENTS).toEqual([
      ".agents/skills/fyagent-trellis/SKILL.md",
    ]);
    expect(docsChecker.NEW_CHECKOUT_GATE_MARKERS).toEqual({
      start: gateStart,
      end: gateEnd,
    });
  });

  it.each([
    ".agents/skills/trellis-meta/references/customize-local/overview.md",
    ".agents/skills/trellis-channel/references/progress-debugging.md",
    ".agents/skills/trellis-start/SKILL.md",
    ".trellis/workflow.md",
    ".trellis/scripts/task.py",
    ".trellis/spec/backend/development-hooks.md",
    ".trellis/spec/backend/github-ci-workflow.md",
    "docs/fyagent/development/mise-tasks.md",
    ".trellis/tasks/archive/2026-08/example/task.json",
  ])(
    "excludes generic, internal, historical, Wrong, and CI material: %s",
    (file) => {
      expect(docsChecker.isOperationalTrellisDocument(file)).toBe(false);
    },
  );

  it.each([
    [
      "fenced Python with an option value",
      ["```bash", "python -X utf8 ./.trellis/scripts/task.py list", "```"].join(
        "\n",
      ),
      /direct Python\/py/,
    ],
    [
      "inline py launcher",
      "Use `py -3 .trellis/scripts/get_context.py --mode packages`.",
      /direct Python\/py/,
    ],
    [
      "double-backtick inline command",
      "Use ``python .trellis/scripts/task.py list``.",
      /direct Python\/py/,
    ],
    [
      "Run imperative",
      "Run python3 .trellis/scripts/task.py current",
      /direct Python\/py/,
    ],
    [
      "Execute imperative",
      "Execute: python .trellis/scripts/task.py list",
      /direct Python\/py/,
    ],
    [
      "list item",
      "- py -3 .trellis/scripts/get_context.py --mode packages",
      /direct Python\/py/,
    ],
    [
      "blockquote",
      "> python .trellis/scripts/task.py list",
      /direct Python\/py/,
    ],
    [
      "shell prompt",
      "$ python .trellis/scripts/task.py list",
      /direct Python\/py/,
    ],
    [
      "PowerShell prompt",
      "PS> py -3 .trellis/scripts/task.py list",
      /direct Python\/py/,
    ],
    [
      "backslash continuation",
      [
        "```bash",
        "python -X utf8 \\",
        "  .trellis/scripts/task.py list",
        "```",
      ].join("\n"),
      /direct Python\/py/,
    ],
    [
      "PowerShell backtick continuation",
      ["- py -3 `", "  .trellis/scripts/get_context.py --mode packages"].join(
        "\n",
      ),
      /direct Python\/py/,
    ],
    [
      "cmd caret continuation",
      ["C:\\repo> python -X utf8 ^", "  .trellis/scripts/task.py list"].join(
        "\n",
      ),
      /direct Python\/py/,
    ],
    [
      "uv run through Python",
      "Run uv --quiet run --locked python ./.trellis/scripts/task.py list",
      /direct uv/,
    ],
    [
      "uv direct script",
      "`uv run --script .trellis/scripts/task.py list`",
      /direct uv/,
    ],
    [
      "uv run with a valued option",
      "- uv run --python 3.12 .trellis/scripts/task.py list",
      /direct uv/,
    ],
  ])(
    "rejects a direct Trellis script command in a %s",
    (_label, source, expected) => {
      expect(() =>
        docsChecker.validateOperationalTrellisDocument(
          ".agents/skills/trellis-before-dev/SKILL.md",
          source,
          tasks,
        ),
      ).toThrow(expected);
    },
  );

  it.each([
    [
      "and after an ordinary command",
      "`. .; echo ok && python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "semicolon after a directory change",
      "`cd .; uv run .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct uv/,
    ],
    [
      "a leading environment assignment",
      "`FOO=1 python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "the env wrapper and its assignment",
      "`env FOO=1 python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "sudo and its user option",
      "`sudo --user root python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "sudo directly",
      "`sudo python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "a pipeline consumer",
      "`printf input | python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "a command substitution",
      "`echo $(python .trellis/scripts/task.py list)`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "a command substitution inside double quotes",
      '`echo "$(python .trellis/scripts/task.py list)"`',
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "recursive grep after another command",
      "`cd . && grep -R pattern .agents/skills`",
      ".agents/skills/trellis-check/SKILL.md",
      /recursive grep/,
    ],
    [
      "a single background operator",
      "`echo ok & python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "a leading background operator",
      "`& python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "a stderr pipeline",
      "`echo ok |& python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "env short chdir option",
      "`env -C . python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "env long chdir option",
      "`env --chdir . python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "sudo short chdir option",
      "`sudo -D . python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "sudo long chdir option",
      "`sudo --chdir . python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "an environment assignment after sudo",
      "`sudo FOO=1 python .trellis/scripts/task.py list`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /direct Python\/py/,
    ],
    [
      "command substitution nesting over the limit",
      "`$(echo $(echo $(echo $(echo python))))`",
      ".agents/skills/trellis-before-dev/SKILL.md",
      /nesting exceeds the parser limit/,
    ],
  ])(
    "rejects a prohibited command hidden by %s",
    (_label, source, file, expected) => {
      expect(() =>
        docsChecker.validateOperationalTrellisDocument(file, source, tasks),
      ).toThrow(expected);
    },
  );

  it.each([
    [
      "ordinary prose",
      "Python and uv are implementation details. The .trellis/scripts/task.py file remains internal.",
    ],
    [
      "plain line beginning with Python",
      "Python uses the uv-managed environment; `.trellis/scripts/task.py` is an internal file.",
    ],
    [
      "imperative prose rather than a command",
      "Run Python tooling only after reading about .trellis/scripts/task.py.",
    ],
    ["unrelated inline Python", '`python -c "print(1)"`'],
    [
      "a different first Python script operand",
      "`python helper.py .trellis/scripts/task.py`",
    ],
    ["uv command outside run", "- uv lock --check --offline"],
    ["uv run of another executable", "`uv run echo .trellis/scripts/task.py`"],
    [
      "a quoted Python command after an operator",
      '`echo "python .trellis/scripts/task.py list"`',
    ],
    [
      "a quoted uv command passed to printf",
      "`printf '%s' 'uv run .trellis/scripts/task.py list'`",
    ],
    ["quoted shell operators", "`echo '&& ; |'"],
  ])("allows %s without a command false positive", (_label, source) => {
    expect(() =>
      docsChecker.validateOperationalTrellisDocument(
        ".agents/skills/trellis-before-dev/SKILL.md",
        source,
        tasks,
      ),
    ).not.toThrow();
  });

  it.each([
    ["lowercase short option", "mise run -s 'bash -lc' a"],
    [
      "boolean long options",
      "mise run --quiet --skip-tools --deny-net trellis:context",
    ],
    ["boolean short cluster", "mise run -qf trellis:context"],
    [
      "equals and separate valued options",
      "mise run --jobs=2 --cd . -- odd.task-1",
    ],
    ["separate jobs value", "mise run --jobs 2 a"],
    ["known prototype-shaped own task", "mise run constructor"],
    ["known leading-underscore task", "mise run __proto__"],
    ["generic generated-doc placeholder", "Use `mise run <task>`."],
    [
      "backslash continuation",
      ["mise run --jobs \\", "  2 odd.task-1"].join("\n"),
    ],
    [
      "PowerShell backtick continuation",
      ["mise run --cd . `", "  -- a"].join("\n"),
    ],
    ["cmd caret continuation", ["mise run -q ^", "  a"].join("\n")],
  ])("parses and validates a mise run reference with %s", (_label, source) => {
    expect(() =>
      docsChecker.validateMiseTaskReferences("fixture.md", source, tasks),
    ).not.toThrow();
  });

  it.each([
    ["unknown task", "mise run trellis:not-real", /unknown mise task/],
    [
      "inherited object key",
      "mise run toString",
      /unknown mise task: toString/,
    ],
    [
      "unknown option",
      "mise run --mystery trellis:context",
      /unknown mise run option/,
    ],
    [
      "value on boolean option",
      "mise run --quiet=true trellis:context",
      /invalid mise run option/,
    ],
    ["missing jobs value", "mise run --jobs", /missing mise run option value/],
    [
      "missing cd value before the option boundary",
      "mise run --cd -- a",
      /missing mise run option value/,
    ],
  ])(
    "fails closed for a mise reference with %s",
    (_label, source, expected) => {
      expect(() =>
        docsChecker.validateMiseTaskReferences("fixture.md", source, tasks),
      ).toThrow(expected);
    },
  );

  it("validates every mise run reference on the same line", () => {
    expect(() =>
      docsChecker.validateMiseTaskReferences(
        "fixture.md",
        "Use `mise run a` and then `mise run missing`.",
        tasks,
      ),
    ).toThrow(/unknown mise task: missing/);
  });

  it.each([
    ["-r", "grep -r 'mise run' .agents/skills"],
    ["-R", "Run grep -R pattern .agents/skills"],
    ["short option cluster", "> grep -nri pattern .agents/skills"],
    ["mixed short option cluster", "$ grep -ER pattern .agents/skills"],
    ["--recursive", "`grep --recursive pattern .agents/skills`"],
  ])("rejects recursive grep spelled as %s", (_label, source) => {
    expect(() =>
      docsChecker.validateOperationalTrellisDocument(
        ".agents/skills/trellis-check/SKILL.md",
        source,
        tasks,
      ),
    ).toThrow(/recursive grep/);
  });

  it.each([
    ["grep operand after --", "`grep -- -r fixture.txt`"],
    ["rg", "```bash\nrg -r pattern .agents/skills\n```"],
    [
      "grep prose",
      "Recursive grep options such as -r and --recursive are discussed here.",
    ],
  ])("allows non-recursive command case: %s", (_label, source) => {
    expect(() =>
      docsChecker.validateOperationalTrellisDocument(
        ".agents/skills/trellis-check/SKILL.md",
        source,
        tasks,
      ),
    ).not.toThrow();
  });

  it.each([
    [
      "legacy mise exec in prose",
      "Do not restore the retired `mise exec --` entrypoint.",
      /legacy mise exec/,
    ],
    ["bare finish command", "/finish-work", /noncanonical \/finish-work/],
  ])("keeps the whole-document ban for %s", (_label, source, expected) => {
    expect(() =>
      docsChecker.validateOperationalTrellisDocument(
        ".agents/skills/trellis-before-dev/SKILL.md",
        source,
        tasks,
      ),
    ).toThrow(expected);
  });

  it("accepts explicit human-controlled setup in the project entrypoint", () => {
    expect(() =>
      docsChecker.validateOperationalTrellisDocument(
        ".agents/skills/fyagent-trellis/SKILL.md",
        manualSetup,
        tasks,
      ),
    ).not.toThrow();
  });

  it.each([
    [
      "reversed setup commands",
      manualSetup.replace(
        setupCommands,
        ["mise run bootstrap", "mise trust", "mise run system:check"].join(
          "\n",
        ),
      ),
      /one exact ordered setup command fence/,
    ],
    [
      "negated human review",
      manualSetup.replace("must explicitly review", "must not review"),
      /explicit review to a human developer/,
    ],
    [
      "missing checkout scope",
      manualSetup.replace("new checkout", "repository setup"),
      /new or fresh checkout/,
    ],
    [
      "commands scattered outside a fence",
      manualSetup.replace(
        ["```bash", setupCommands, "```"].join("\n"),
        [
          "`mise trust`",
          "`mise run bootstrap`",
          "`mise run system:check`",
        ].join("\n"),
      ),
      /one exact ordered setup command fence/,
    ],
    [
      "extra setup command",
      manualSetup.replace(
        "mise run system:check",
        "mise run system:check\nmise run trellis:context",
      ),
      /one exact ordered setup command fence/,
    ],
    [
      "manual ownership removed",
      manualSetup.replace("the developer manually runs", "automation runs"),
      /manual setup execution/,
    ],
    [
      "manual execution reassigned after review",
      manualSetup.replace(
        "After that review, the developer manually runs",
        "The human developer reviews the result. Automation manually runs",
      ),
      /manual setup execution/,
    ],
    [
      "no-automatic ownership scattered",
      manualSetup.replace(
        "Skills, hooks, and repository tasks must not automatically",
        "Automation must not automatically",
      ),
      /tie the no-automatic rule/,
    ],
    [
      "duplicate bounded block",
      `${manualSetup}\n${manualSetup}`,
      /exactly one bounded new-checkout gate/,
    ],
    [
      "missing end marker",
      manualSetup.replace(gateEnd, ""),
      /exactly one bounded new-checkout gate/,
    ],
  ])("rejects setup quality drift: %s", (_label, source, expected) => {
    expect(() =>
      docsChecker.validateOperationalTrellisDocument(
        ".agents/skills/fyagent-trellis/SKILL.md",
        source,
        tasks,
      ),
    ).toThrow(expected);
  });

  it("keeps FyAgent update and native-evidence rules in the project entrypoint", () => {
    const source = fs.readFileSync(
      path.join(ROOT, ".agents/skills/fyagent-trellis/SKILL.md"),
      "utf8",
    );
    for (const contract of [
      "trellis update --dry-run",
      "mise run trellis:reconcile",
      "mise run trellis:verify",
      "matching native GitHub Actions runners own",
      "Local structure checks and cross-compilation do not replace native",
    ]) {
      expect(source).toContain(contract);
    }
  });
});
