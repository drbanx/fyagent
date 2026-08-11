# Versioned development-document migration inventory

## Purpose and review baseline

This task-local ledger classifies every file that existed below
`docs/fyagent/dev/` before deletion. It is evidence for this migration, not a
new current product authority. Current implementation and tests take priority
over these former design packages.

Reviewed source set: 197 files.

- `v1-0.0`: 20 files
- `v1-0.1`: 8 files
- `v1-0.2`: 9 files
- `v1-0.2.1`: 25 files
- `v1-0.3.0`: 135 files, including a 111-file frozen repository overlay

The real Trellis archive tree was clean before deletion. At the review HEAD
`50cca3ac5863a323934b4b9071b318492590b7e8`, its Git tree object was
`c76153dc5c92ebd09c415b468b096d3aea2424e9`. The similarly named directories
inside the deleted `v1-0.3.0/repository-overlay/` were copies in a historical
design package, not the real archive.

## Dispositions and owner keys

- **C — current:** a still-valid invariant or explanation. It is rewritten
  from current code/tests into exactly one owner below.
- **S — superseded:** a retired design or contract. It is not migrated. When
  an adjacent current responsibility remains, the row names its replacement
  owner.
- **H — historical:** planning, evidence, rollout, acceptance, or source
  snapshot. Git history is the retention owner; there is no current-doc copy.
- **P — protocol-version:** a real protocol, schema, third-party API, or
  compatibility version. Its named active spec remains the only mutable
  documentation owner.

Owner keys:

- **APP-VERSION** — `.trellis/spec/backend/fyagent-version-contract.md`
- **WIN-INSTALLER** — `.trellis/spec/backend/windows-installer.md`
- **WIN-RUNTIME** — `.trellis/spec/backend/windows-runtime-security.md`
- **CODEX-DESKTOP** — `.trellis/spec/backend/codex-desktop-installer.md`
- **CODEX-PROVIDER** —
  `.trellis/spec/backend/codex-provider-configuration.md`
- **WORKBUDDY** — `.trellis/spec/backend/workbuddy-configuration.md`
- **CI** — `.trellis/spec/backend/github-ci-workflow.md`
- **RELEASE** — `.trellis/spec/backend/github-release-workflow.md`
- **TRELLIS** — `.trellis/spec/backend/trellis-tooling.md`
- **DEV-ENV** — `.trellis/spec/backend/development-environment.md`
- **TASK-RUNNER** — `.trellis/spec/backend/task-runner-contract.md`
- **HOOKS** — `.trellis/spec/backend/development-hooks.md`
- **DEEPLINK** — `.trellis/spec/backend/deeplink-import-security.md`
- **IDENTITY** — `.trellis/spec/backend/application-identity.md`
- **BRAND** — `.trellis/spec/backend/application-brand-assets.md`
- **UPSTREAM** — `.trellis/spec/backend/upstream-sync.md`
- **FRONTEND** — `.trellis/spec/frontend/index.md` and the one guideline it
  routes for the named renderer concern; concrete backend wire contracts stay
  with their backend owner.
- **CURRENT-DOCS** — `docs/fyagent/development/README.md`, which routes to
  responsibility-oriented explanations without duplicating normative specs.
- **GIT-HISTORY** — repository Git history only; no replacement current file.

## `v1-0.0`

### `00-AGENT-START-HERE.md`

- H §§1, 4, 7, 9–10 (package reading order, checkout baseline, agent lanes,
  old commands, and package precedence) → GIT-HISTORY.
- C §2 (official Codex Desktop distribution definition) → CODEX-DESKTOP.
- C §§3.1–3.2, 3.4–3.5 (official-package immutability, fixed source boundary,
  CLI non-install boundary, and non-destructive Codex test boundary) →
  CODEX-DESKTOP.
- S §3.3's claim that the ordinary GUI itself does not elevate → WIN-RUNTIME;
  the current elevated host and interactive Shell-user proof replace it.
- C §§5–6 and 8 (supported Codex Desktop platform flow and completion
  invariants) → CODEX-DESKTOP.

### `01-V1-SCOPE-AND-NON-GOALS.md`

- H §1 and §10 (package-stage purpose and acceptance target) → GIT-HISTORY.
- C §§2–3, 6–7 (Codex Desktop product/source/lifecycle behavior) →
  CODEX-DESKTOP.
- S §4's internal-only/public-release and unsigned-resource assumptions →
  RELEASE; current formal release policy replaces them.
- C §5 (Codex Desktop supported platform and hidden all-users separation) →
  CODEX-DESKTOP.
- H §8's roadmap/non-goal list → GIT-HISTORY. The clean-break identity clause
  is independently current under IDENTITY; the former assertion that public
  signing was out of scope is superseded by RELEASE.
- C §9 (FyAgent identity and historical exceptions) → IDENTITY; generated
  icon invariants route to BRAND.

### `02-REQUIREMENTS-AND-DECISIONS.md`

- H §1 (package priority vocabulary) → GIT-HISTORY.
- C §§2–3 (Codex Desktop behavior, architecture, diagnostics, and
  non-destructive boundaries) → CODEX-DESKTOP; identity-only clauses →
  IDENTITY.
- H §§4–5 (decision register and clarification record) → GIT-HISTORY. Current
  invariants were re-observed in their owner specs; decision numbering is not
  copied.
- H §6 (old traceability table) → GIT-HISTORY.

### `03-AGENT-WORKTREE-EXECUTION.md`

- H §§1–11 (branch/worktree plan, ownership, commit order, status templates,
  environment, and rollback) → GIT-HISTORY.

### `04-ARCHITECTURE.md`

- C §§1, 3–8, 10–13 (Codex Desktop service, source, trust, adapter,
  persistence, concurrency, recovery, and dependency boundaries) →
  CODEX-DESKTOP.
- H §2 (source snapshot anchors) → GIT-HISTORY.
- C §9 (renderer layering explanation) → FRONTEND; Codex IPC types remain
  owned by CODEX-DESKTOP.

### `05-DOMAIN-MODEL-STATE-MACHINE-IPC.md`

- C §§1–15 (Codex Desktop values, release identity, jobs, state machine,
  requests, IPC/events, adapters, post-verification, exit behavior, and test
  invariants) → CODEX-DESKTOP.

### `06-DOWNLOAD-SOURCE-AND-VALIDATION.md`

- C §§1–18 (fixed source, manifest/checksum parsing, download and verification
  pipeline, caching, retry, disk/temp cleanup, and errors) → CODEX-DESKTOP.

### `07-WINDOWS-IMPLEMENTATION.md`

- C §§1–15 (official Codex MSIX inspection, trusted identity, ordinary-user
  lifecycle, launch, post-verification, hidden all-users capability, and
  tests) → CODEX-DESKTOP. Any former implicit-current-user selection is
  replaced by the current explicit Shell SID/context contract.
- S §16 (FyAgent MSI packaging boundary) → WIN-INSTALLER; the current FyAgent
  installer is NSIS, while `MSIX` elsewhere in this file still names the
  official Codex Desktop package and is not an obsolete FyAgent MSI contract.

### `08-MACOS-IMPLEMENTATION.md`

- C §§1–17 (Codex Desktop bundle identity, DMG inspection, trust, copy,
  post-verification, launch, cleanup, and tests) → CODEX-DESKTOP.

### `09-FRONTEND-UI-I18N.md`

- C §§1–11 and 14–15 (Codex Desktop renderer layers, state/actions, copy,
  localization, accessibility, and tests) → FRONTEND; wire/state signatures
  remain CODEX-DESKTOP.
- C §12 (FyAgent identity and generated assets) → BRAND and IDENTITY by their
  non-overlapping responsibilities.
- C §13 (exit behavior during a Codex Desktop job) → CODEX-DESKTOP.

### `10-ERROR-CODES-AND-DIAGNOSTICS.md`

- C §§1–10 (Codex Desktop stable errors, warnings, diagnostics, logging, and
  privacy) → CODEX-DESKTOP.

### Historical package files

- H `11-REPOSITORY-CHANGE-MAP.md` §§1–11 → GIT-HISTORY.
- H `12-IMPLEMENTATION-SEQUENCE.md` §§1–17 → GIT-HISTORY.
- H `13-AUTOMATED-TEST-PLAN.md` §§1–16 → GIT-HISTORY. Current required tests
  are named by CODEX-DESKTOP/FRONTEND rather than copied from the plan.
- H `14-MANUAL-ACCEPTANCE.md` §§1–13 → GIT-HISTORY.
- H `15-FUTURE-ROADMAP.md` §§1–13 → GIT-HISTORY.
- H `16-ADR-DECISION-LOG.md` §§1–6 → GIT-HISTORY.
- H `17-AGENT-COPY-PASTE-PROMPT.md` §§1–6 → GIT-HISTORY.
- H `18-REFERENCES.md` §§1–10 → GIT-HISTORY; active owners cite only sources
  needed by current contracts.
- H `README.md` (entire package index) → GIT-HISTORY.

## `v1-0.1`

### `01-需求规格说明.md`

- H §§1–4 and 8 (package purpose, background, scope snapshot, users, and
  source list) → GIT-HISTORY.
- C §5 (Codex provider capabilities/configuration) → CODEX-PROVIDER; desktop
  discovery/restart/launch clauses → CODEX-DESKTOP.
- C §6 (WorkBuddy behavior) → WORKBUDDY.
- C §7 (non-functional requirements) → CODEX-PROVIDER or WORKBUDDY according
  to the named domain; shared renderer requirements route to FRONTEND.

### `02-系统架构与详细设计.md`

- C §1 (domain-isolation principles) → CODEX-PROVIDER and WORKBUDDY for their
  respective domains.
- H §2 (source baseline map) → GIT-HISTORY.
- C §§3–4 (domain architecture/types) → CODEX-PROVIDER for Codex fields and
  WORKBUDDY for WorkBuddy fields.
- C §§5–7 (Codex TOML, form, capability write/live behavior) →
  CODEX-PROVIDER.
- C §8 (trusted restart coordination) → CODEX-DESKTOP; provider mutation
  outcome remains CODEX-PROVIDER.
- C §§9–12 and 14 (WorkBuddy frontend/backend, compatibility, i18n, and
  diagnostics) → WORKBUDDY; renderer composition conventions route to
  FRONTEND.
- C §13 (WorkBuddy brand asset use) → BRAND. The runtime copy, not the design
  package asset, is the maintained file.
- H §15 (source list) → GIT-HISTORY.

### `03-配置数据模型与安全设计.md`

- H §1 (design-package goal) → GIT-HISTORY.
- C §2 (Codex configuration model) → CODEX-PROVIDER.
- C §§3–8 (WorkBuddy JSON shape, URL/fetch boundary, transaction, formatting,
  and credential lifecycle) → WORKBUDDY.
- C §9 (restart safety) → CODEX-DESKTOP.
- C §10 (domain error model) → CODEX-PROVIDER for Codex errors and WORKBUDDY
  for WorkBuddy errors.
- H §11 (source list) → GIT-HISTORY.

### `04-验收标准与测试场景.md`

- H §§1–2, 13–14 (package acceptance method, platform matrix, and evidence
  format) → GIT-HISTORY.
- C §§3–4 (Codex capability and restart-result tests) → CODEX-PROVIDER.
- C §5 (Codex Desktop lifecycle tests) → CODEX-DESKTOP.
- C §§6–12 (WorkBuddy navigation, URL, API key, fetch, persistence,
  reliability, and regression cases) → WORKBUDDY and FRONTEND according to
  the exercised boundary.

### Remaining files

- H `README.md` §§1–8 → GIT-HISTORY.
- H `assets/workbuddy-icon-256.webp` → GIT-HISTORY; no current consumer
  references this variant.
- H `assets/workbuddy-icon-original.webp` → GIT-HISTORY; no current consumer
  references this source copy.
- H `assets/workbuddy-icon-512.png` → GIT-HISTORY. The maintained
  `src/assets/workbuddy-icon-512.png` has the same SHA-256
  (`060e5e0fe1fce063e24b809a2d655df5a32ef36d97a7322e33b22c245570b868`),
  so deleting the package duplicate does not remove the runtime asset.

## `v1-0.2`

### `01-需求规格与决策基线.md`

- H §§1–4 and 11 (package goal/scope, users, and delivery baseline) →
  GIT-HISTORY.
- C §5 (Codex restart behavior) → CODEX-DESKTOP; capability-result behavior
  stays CODEX-PROVIDER.
- C §6 (WorkBuddy behavior) → WORKBUDDY.
- C §7 (Codex Desktop installed/available version status) → CODEX-DESKTOP.
- C §§8 and 10 (WorkBuddy/header/UI/localization behavior) → FRONTEND, with
  WorkBuddy data semantics owned by WORKBUDDY.
- C §9's elevated runtime/process boundary → WIN-RUNTIME.
- S §9's former FyAgent MSI/release requirements → WIN-INSTALLER and RELEASE.

### `02-现状分析与代码证据.md`

- H §§1–10 (source snapshot, root-cause analysis, reusable-code inventory,
  and gap list) → GIT-HISTORY.

### `03-交互设计与状态矩阵.md`

- C §§1–3 (WorkBuddy information architecture/save flow) → FRONTEND;
  persistence/overwrite semantics remain WORKBUDDY.
- C §§4–5 (Codex restart/version display states) → CODEX-DESKTOP and
  FRONTEND at their respective boundary.
- C §§6–7 and 9–10 (top bar, scrolling, localization, and no-regression UI
  behavior) → FRONTEND.
- C §8 (Windows user-visible elevated-host behavior) → WIN-RUNTIME.

### `04-系统架构与IPC设计.md`

- C §§1–3 (cross-layer architecture) → CURRENT-DOCS; concrete IPC signatures
  stay with their domain owner.
- C §4 (WorkBuddy IPC) → WORKBUDDY.
- C §§5–7 (Codex restart model/state and version DTO) → CODEX-DESKTOP;
  provider mutation result remains CODEX-PROVIDER.
- C §§8–9 (top-bar/window architecture) → FRONTEND.
- C §§10–12 (elevated Windows host, external-process privilege, and IPC
  classification) → WIN-RUNTIME.
- P §13 (`fyagent://v1/import` activation boundary) → DEEPLINK.
- C §§14–15 (diagnostics and compatibility) → each named domain owner; no
  shared duplicate contract is created.

### `05-WorkBuddy数据模型与安全设计.md`

- C §§1–12 and 14–18 (WorkBuddy document model, normalization, persistence,
  overwrite/revision, backup, credentials, errors, data flow, risks, and
  tests) → WORKBUDDY.
- P §13's rule for the third-party `/v1` API path → WORKBUDDY. This is an API
  path compatibility contract, not a historical product-stage label.

### Remaining files

- H `06-实施顺序与仓库变更地图.md` §§1–14 → GIT-HISTORY.
- H `07-验收标准与自动化测试计划.md` §§1–18 → GIT-HISTORY. Current owner
  specs name the live tests; the former MSI release-candidate block is
  superseded.
- C `08-ADR与外部资料.md` §§2–3 (Codex restart identity/ambiguity invariants)
  → CODEX-DESKTOP.
- S `08-ADR与外部资料.md` §4's multi-install auto-selection rule →
  CODEX-DESKTOP; the current same-SID multiple-trusted-Main result is
  fail-closed ambiguity.
- C `08-ADR与外部资料.md` §§5–8 → WORKBUDDY.
- C `08-ADR与外部资料.md` §§9–11 and 21 → FRONTEND.
- C `08-ADR与外部资料.md` §§12 and 14–17, 19–20 → WIN-RUNTIME or the named
  active security owner.
- S `08-ADR与外部资料.md` §13's MSI-era “safe directory” classification →
  WIN-INSTALLER. The fixed-local-drive admission is also superseded: current
  NSIS behavior does not add a FyAgent absolute/local/fixed/UNC/reparse gate.
  The protected `%ProgramData%\FyAgent\runtime` owner/DACL boundary remains a
  separate current contract.
- P `08-ADR与外部资料.md` §18's deep-link credential transport compatibility
  → DEEPLINK.
- H `08-ADR与外部资料.md` §§1, 22–24 → GIT-HISTORY.
- H `README.md` §§1–8 → GIT-HISTORY.

## `v1-0.2.1`

### `01-REQUIREMENTS.md`

- H §§1–3 (package purpose, background, and scope) → GIT-HISTORY.
- S §§4–6 (MSI UI, native custom action, WiX, ACL/owner admission, and old
  uninstall design) → WIN-INSTALLER.
- C §7 (canonical application version) → APP-VERSION.
- C §8's general SemVer, metadata, digest, and transactional release rules →
  RELEASE; S for old MSI/main/fixed-asset details.
- C §9 (fail-closed quality attributes) → the named active owner.
- H §10 (one-time package blockers) → GIT-HISTORY.

### `02-CURRENT-STATE-AND-ROOT-CAUSE.md`

- H §§1–11 (MSI/Error 1720/version/release source snapshot and root-cause
  record) → GIT-HISTORY.

### `03-INSTALLER-UX-AND-DIRECTORY-POLICY.md`

- C §§1–5, 7–9, and 16 (per-machine installer UX, silent/custom path input,
  upgrade/uninstall expectations, examples, and accessibility) →
  WIN-INSTALLER, rewritten for NSIS.
- S §6's absolute local fixed-drive admission → WIN-INSTALLER; current NSIS
  passes the selected path through without that custom admission policy.
- S §6's ACL/owner/reparse/protected-folder security classification and
  warnings → WIN-INSTALLER; the current contract explicitly does not perform
  those judgments.
- S §§10–15 (forbidden-directory taxonomy, MSI properties/priority/errors,
  and MSI-localized presentation) → WIN-INSTALLER.

### `04-NATIVE-INSTALL-DIR-VALIDATOR-DESIGN.md`

- S §§1–20 (MSI custom-action crate/DLL/API, fixed-local-drive validator,
  DACL/owner checks, MSI logging, and its test interface) → WIN-INSTALLER. The
  current NSIS spec deliberately has no shared pre-write `$INSTDIR` validator;
  only the independent machine-runtime security boundary remains current.

### `05-WIX-MSI-INTEGRATION-DESIGN.md`

- S §§1–20 (WiX/MSI dialogs, actions, sequences, properties, ACL, build,
  query, signing, and recovery) → WIN-INSTALLER.

### `06-FYAGENT-VERSIONING-REQUIREMENTS.md`

- C §§1–9 and 11 (stable SemVer, canonical Cargo source, projections,
  commands, Windows numeric representation, invariants, and tests) →
  APP-VERSION, rewritten without fixed product-version narrative.
- H §10 (one-time `0.2.0` to `0.2.1` migration) → GIT-HISTORY.

### `07-SINGLE-SOURCE-AND-VERSION-SCRIPT-DESIGN.md`

- C §§1–13 (canonical metadata and version command behavior) → APP-VERSION,
  validated against the current script rather than copied as reference code.
- H §14 (reference implementation delivery status) → GIT-HISTORY.

### `08-RELEASE-WORKFLOW-VERSION-CONTRACT.md`

- C §§1–5, 7–8, 10–11, and 13–15 (version/tag/build consumption,
  cross-platform names, release phases, embedded verification, supply chain,
  and completion invariants) → RELEASE and APP-VERSION at their separate
  responsibilities.
- S §6 (Windows MSI asset contract) → WIN-INSTALLER and RELEASE.
- P §9 (`fyagent-download-manifest/v2`-class download metadata identity) →
  APP-VERSION and RELEASE; the live schema string remains test-protected.
- S §12's former branch/tag operation → RELEASE; current publication binds the
  exact remote development-branch HEAD and successful same-SHA push CI.

### Planning, package, and reference files

- H `09-IMPLEMENTATION-CHANGE-MAP.md` §§1–12 → GIT-HISTORY.
- H `10-TEST-AND-ACCEPTANCE-PLAN.md` §§1–16 → GIT-HISTORY; current owner specs
  name live version/NSIS/release tests.
- H `11-ADR-RISKS-AND-REFERENCES.md` §§1 and 9–12 → GIT-HISTORY.
- S `11-ADR-RISKS-AND-REFERENCES.md` §§2–4 and 8 (MSI/custom-action/safe-path
  decisions and MSI lifecycle gate) → WIN-INSTALLER.
- H `11-ADR-RISKS-AND-REFERENCES.md` §5's one-time patch target → GIT-HISTORY.
- C `11-ADR-RISKS-AND-REFERENCES.md` §§6–7 (canonical Cargo version and stable
  SemVer) → APP-VERSION.
- H `12-CODEX-EXECUTION-RUNBOOK.md` §§1–7 → GIT-HISTORY; current commands are
  owned by APP-VERSION and the generated mise task reference.
- H `MANIFEST.sha256` → GIT-HISTORY.
- H `PACKAGE-METADATA.md` §§input, baseline, delivery, research → GIT-HISTORY.
- H `PACKAGE-README.md` §§solution, directory, use, boundary → GIT-HISTORY.
- H `README.md` §§1–6 and directory constraints → GIT-HISTORY.
- H `reference/README.md` → GIT-HISTORY.
- S `reference/scripts/version.mjs` → APP-VERSION; the live repository script
  is the only implementation owner.
- S `reference/snippets/Cargo.toml.versioning.toml` → APP-VERSION.
- S `reference/snippets/package.json.versioning.json` → APP-VERSION.
- S `reference/snippets/tauri.conf.versioning.json` → APP-VERSION.
- S `reference/snippets/release-version-contract.yml` → RELEASE.
- S `reference/snippets/installer-actions.Cargo.toml` → WIN-INSTALLER.
- S `reference/snippets/wix-native-custom-actions.wxs` → WIN-INSTALLER.
- S `reference/tests/version.test.mjs` → APP-VERSION; live version tests are
  retained outside the deleted package.

## `v1-0.3.0`

### Core design documents

- H `00-README.md` §§1–8 (package authority, execution authorization,
  baseline, reading order, result summary, and integrity record) →
  GIT-HISTORY.
- H `01-REQUIREMENTS-AND-DECISIONS.md` §§1 and 3, 6 (background, old
  exclusions, and acceptance plan) → GIT-HISTORY.
- C `01-REQUIREMENTS-AND-DECISIONS.md` §§2 and 4 by named responsibility →
  UPSTREAM, DEV-ENV, TASK-RUNNER, CI, RELEASE, and TRELLIS. These are rewritten
  from the finished implementations, not copied as future requirements.
- P `01-REQUIREMENTS-AND-DECISIONS.md` §5's real tool compatibility versions
  → DEV-ENV; real release schema identities → APP-VERSION/RELEASE.
- H `02-CURRENT-STATE-AND-ROOT-CAUSE.md` §§1–9 (dated checkout snapshot,
  propagation maps, root causes, and conclusions) → GIT-HISTORY.

### `03-UPSTREAM-MERGE-DESIGN.md`

- C §§1–5 and 7–8 (immutable upstream tag, two-parent merge, conflict/source
  boundaries, verification, and task safety) → UPSTREAM.
- H §6 and any fixed FyAgent product-version target in §§1–8 → GIT-HISTORY;
  historical release-note handling is not a current product-version contract.

### `04-CROSS-BUILD-REMOVAL-DESIGN.md`

- C §§1–2 and 4–7 (no local cross-platform build entrypoint, host-native
  build boundary, platform config split, documentation, and validation) →
  DEV-ENV; Windows manifest separation itself → WIN-RUNTIME.
- S §3's former automatic trust direction → DEV-ENV/TRELLIS. Trust and
  bootstrap are now explicit human-controlled checkout gates and no repository
  task may change trust state.

### `05-MISE-UV-DEVELOPMENT-ENVIRONMENT.md`

- P §§1–5 and 9 (real toolchain versions, source files, uv ownership,
  initialization, Python boundary, and lock governance) → DEV-ENV.
- C §§6–8 (task layout, argv/side-effect contracts, and local-vs-Actions
  composition) → TASK-RUNNER.
- H §10 (dated implementation evidence and remaining gate list) →
  GIT-HISTORY.
- C §11 (remote-run evidence discipline) → TRELLIS; CI and RELEASE remain the
  normative workflow owners.

### `06-CI-AND-RELEASE-DESIGN.md`

- H §1 (old implementation status) → GIT-HISTORY.
- S §2's old all-push topology and fixed Required-job count → CI; current
  classifier/domain-aware PR behavior and full development-branch push replace
  it.
- C §3 (trusted-base Labeler boundary) → CI.
- S §4's former main-based/fixed-tag release eligibility → RELEASE; the current
  exact development-branch HEAD, annotated tag, and same-SHA push-CI chain
  replaces it.
- C §5 (matching native runner/platform groups) → RELEASE and CI at their
  respective workflow gates.
- S §6's unsigned-only Windows release policy → WIN-INSTALLER/RELEASE; current
  formal policy accepts either fully configured-and-verified signing or fully
  absent-and-explicitly-disclosed signing, never partial fallback.
- C §7 (macOS signing/notarization evidence boundary) → RELEASE.
- P §8's `fyagent-download-manifest/v2`, `fyagent-platform-build/v1`, and
  `fyagent-build-metadata/v1` identities → APP-VERSION/RELEASE.
- S §8's old MSI names and exact old attachment counts → RELEASE.
- C §9 (least privilege and transactional draft publication) → RELEASE.
- H §§10–12 (old residual risks, observation record, and fixed release
  instance) → GIT-HISTORY.

### `07-DEP0040-REMEDIATION-DESIGN.md`

- H §§1–2 and 7–8 (dated dependency root cause, patch record, upstream delta,
  and completion evidence) → GIT-HISTORY.
- P §§3–6 (actual Node compatibility boundary, behavior/dependency tests, and
  warning gate) → DEV-ENV; the live dependency tests remain the evidence.

### `08-DOCUMENTATION-AND-TRELLIS-MIGRATION.md`

- H §§1 and 6, 9 (old migration target, archived-task operation record, and
  completion boundary) → GIT-HISTORY.
- C §§2–3 (current-doc/spec ownership shape) → CURRENT-DOCS and TRELLIS.
- C §4 (project entrypoint versus managed Trellis templates) → TRELLIS.
- C §5 (Codex hook ownership) → HOOKS.
- C §§7–8 (current-doc drift checks and overlay boundary) → TRELLIS and
  TASK-RUNNER at their respective responsibilities.

### Remaining top-level evidence and implementation maps

- H `09-IMPLEMENTATION-PLAN.md` §§1–7 → GIT-HISTORY.
- H `10-RISKS-AND-ACCEPTANCE.md` §§1–5 → GIT-HISTORY. Current accepted release
  risks are stated concisely by RELEASE rather than retained as a rollout
  ledger.
- H `DELIVERY-METADATA.md` §§input, checkout, audit, integrity → GIT-HISTORY.
- H `MANIFEST.sha256` → GIT-HISTORY.
- H `VALIDATION-REPORT.md` §§1–7 → GIT-HISTORY.
- H `decisions/DECISION-REGISTER.md` and both of its decision blocks →
  GIT-HISTORY.
- H `decisions/TRACEABILITY-MATRIX.md` and both of its traceability blocks →
  GIT-HISTORY.
- H `implementation-map/CI-ACCEPTANCE-MATRIX.md` §§1–6 → GIT-HISTORY.
- H `implementation-map/COMMIT-SEQUENCE.md` → GIT-HISTORY.
- H `implementation-map/CONFIG-AND-WORKFLOW-TARGET-SNIPPETS.md` and all six
  configuration/workflow snippets → GIT-HISTORY; live files are the only
  implementation owners.
- H `implementation-map/FILE-CHANGE-MATRIX.md` §§A–G → GIT-HISTORY.
- S `implementation-map/RELEASE-ASSET-CONTRACT.md` §§1–3 and 6–9's fixed
  product version, MSI, old asset counts, unsigned-only state, and old release
  source → RELEASE.
- P `implementation-map/RELEASE-ASSET-CONTRACT.md` §§4–5's real download and
  build metadata schema identities → APP-VERSION/RELEASE.
- H `sources/LOCAL-ARTIFACT-INVENTORY.md` §§input, baseline, analysis workspace
  → GIT-HISTORY.
- H `sources/SOURCE-REGISTER.md` and its use rules → GIT-HISTORY.
- H `sources/UPSTREAM-PROVENANCE.md` §§1–3 → GIT-HISTORY; current immutable
  upstream synchronization facts are independently owned by UPSTREAM.

### Frozen `repository-overlay/`

All 111 files below are **H → GIT-HISTORY**. They are a byte snapshot of a
former checkout, including copied current docs, specs, active tasks, and task
archives. None is migrated independently because the live repository files
and active owner specs are authoritative. Deleting these copied archive paths
does not modify `.trellis/tasks/archive/`.

```text
repository-overlay/README.md
repository-overlay/documentation/.github/pull_request_template.md
repository-overlay/documentation/CONTRIBUTING.md
repository-overlay/documentation/OVERLAY-MAP.md
repository-overlay/documentation/README.md
repository-overlay/documentation/README_DE.md
repository-overlay/documentation/README_JA.md
repository-overlay/documentation/README_ZH.md
repository-overlay/documentation/docs/fyagent/dev/v1-0.0/README.md
repository-overlay/documentation/docs/fyagent/dev/v1-0.1/README.md
repository-overlay/documentation/docs/fyagent/dev/v1-0.2.1/README.md
repository-overlay/documentation/docs/fyagent/dev/v1-0.2/README.md
repository-overlay/documentation/docs/fyagent/development/mise-tasks.md
repository-overlay/documentation/docs/upstream/cc-switch-v3.19.2.md
repository-overlay/documentation/flatpak/README.md
repository-overlay/documentation/tests/e2e/visual-baselines/README.md
repository-overlay/trellis/.agents/skills/fyagent-trellis/SKILL.md
repository-overlay/trellis/.agents/skills/trellis-before-dev/SKILL.md
repository-overlay/trellis/.agents/skills/trellis-brainstorm/SKILL.md
repository-overlay/trellis/.agents/skills/trellis-check/SKILL.md
repository-overlay/trellis/.agents/skills/trellis-continue/SKILL.md
repository-overlay/trellis/.agents/skills/trellis-finish-work/SKILL.md
repository-overlay/trellis/.agents/skills/trellis-start/SKILL.md
repository-overlay/trellis/.trellis/spec/backend/DELETIONS.md
repository-overlay/trellis/.trellis/spec/backend/development-environment.md
repository-overlay/trellis/.trellis/spec/backend/development-hooks.md
repository-overlay/trellis/.trellis/spec/backend/github-release-workflow.md
repository-overlay/trellis/.trellis/spec/backend/index.md
repository-overlay/trellis/.trellis/spec/backend/task-runner-contract.md
repository-overlay/trellis/.trellis/spec/backend/upstream-sync.md
repository-overlay/trellis/.trellis/spec/backend/windows-release-boundary.md
repository-overlay/trellis/.trellis/spec/frontend/index.md
repository-overlay/trellis/.trellis/spec/frontend/quality-guidelines.md
repository-overlay/trellis/.trellis/tasks/08-07-eliminate-dep0040-punycode/check.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-eliminate-dep0040-punycode/design.md
repository-overlay/trellis/.trellis/tasks/08-07-eliminate-dep0040-punycode/implement.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-eliminate-dep0040-punycode/implement.md
repository-overlay/trellis/.trellis/tasks/08-07-eliminate-dep0040-punycode/prd.md
repository-overlay/trellis/.trellis/tasks/08-07-eliminate-dep0040-punycode/task.json
repository-overlay/trellis/.trellis/tasks/08-07-fyagent-upstream-toolchain-release-modernization/check.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-fyagent-upstream-toolchain-release-modernization/design.md
repository-overlay/trellis/.trellis/tasks/08-07-fyagent-upstream-toolchain-release-modernization/implement.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-fyagent-upstream-toolchain-release-modernization/implement.md
repository-overlay/trellis/.trellis/tasks/08-07-fyagent-upstream-toolchain-release-modernization/prd.md
repository-overlay/trellis/.trellis/tasks/08-07-fyagent-upstream-toolchain-release-modernization/task.json
repository-overlay/trellis/.trellis/tasks/08-07-merge-cc-switch-v3-19-2/check.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-merge-cc-switch-v3-19-2/design.md
repository-overlay/trellis/.trellis/tasks/08-07-merge-cc-switch-v3-19-2/implement.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-merge-cc-switch-v3-19-2/implement.md
repository-overlay/trellis/.trellis/tasks/08-07-merge-cc-switch-v3-19-2/prd.md
repository-overlay/trellis/.trellis/tasks/08-07-merge-cc-switch-v3-19-2/task.json
repository-overlay/trellis/.trellis/tasks/08-07-migrate-docs-and-trellis-specs/check.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-migrate-docs-and-trellis-specs/design.md
repository-overlay/trellis/.trellis/tasks/08-07-migrate-docs-and-trellis-specs/implement.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-migrate-docs-and-trellis-specs/implement.md
repository-overlay/trellis/.trellis/tasks/08-07-migrate-docs-and-trellis-specs/prd.md
repository-overlay/trellis/.trellis/tasks/08-07-migrate-docs-and-trellis-specs/task.json
repository-overlay/trellis/.trellis/tasks/08-07-modernize-ci-and-release/check.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-modernize-ci-and-release/design.md
repository-overlay/trellis/.trellis/tasks/08-07-modernize-ci-and-release/implement.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-modernize-ci-and-release/implement.md
repository-overlay/trellis/.trellis/tasks/08-07-modernize-ci-and-release/prd.md
repository-overlay/trellis/.trellis/tasks/08-07-modernize-ci-and-release/task.json
repository-overlay/trellis/.trellis/tasks/08-07-redesign-mise-uv-development-environment/check.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-redesign-mise-uv-development-environment/design.md
repository-overlay/trellis/.trellis/tasks/08-07-redesign-mise-uv-development-environment/implement.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-redesign-mise-uv-development-environment/implement.md
repository-overlay/trellis/.trellis/tasks/08-07-redesign-mise-uv-development-environment/prd.md
repository-overlay/trellis/.trellis/tasks/08-07-redesign-mise-uv-development-environment/task.json
repository-overlay/trellis/.trellis/tasks/08-07-remove-local-cross-builds/check.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-remove-local-cross-builds/design.md
repository-overlay/trellis/.trellis/tasks/08-07-remove-local-cross-builds/implement.jsonl
repository-overlay/trellis/.trellis/tasks/08-07-remove-local-cross-builds/implement.md
repository-overlay/trellis/.trellis/tasks/08-07-remove-local-cross-builds/prd.md
repository-overlay/trellis/.trellis/tasks/08-07-remove-local-cross-builds/task.json
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-0-doc-migration/ARCHIVE-NOTE.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-0-doc-migration/check.jsonl
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-0-doc-migration/implement.jsonl
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-0-doc-migration/prd.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-0-doc-migration/task.json
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-codex-runtime/ARCHIVE-NOTE.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-codex-runtime/check.jsonl
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-codex-runtime/design.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-codex-runtime/implement.jsonl
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-codex-runtime/implement.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-codex-runtime/prd.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-codex-runtime/task.json
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-windows-security/ARCHIVE-NOTE.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-windows-security/check.jsonl
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-windows-security/design.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-windows-security/implement.jsonl
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-windows-security/implement.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-windows-security/prd.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-windows-security/task.json
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy-data-ui/ARCHIVE-NOTE.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy-data-ui/check.jsonl
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy-data-ui/design.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy-data-ui/implement.jsonl
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy-data-ui/implement.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy-data-ui/prd.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy-data-ui/task.json
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy/ARCHIVE-NOTE.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy/check.jsonl
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy/design.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy/implement.jsonl
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy/implement.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy/prd.md
repository-overlay/trellis/.trellis/tasks/archive/2026-08/08-06-fyagent-v1-0-2-workbuddy/task.json
repository-overlay/trellis/.trellis/tasks/archive/2026-08/ARCHIVE-PLAN.md
repository-overlay/trellis/.trellis/workflow.md
repository-overlay/trellis/OVERLAY-MAP.md
```

## Cross-reference and deletion decisions

The following non-package references were observed and assigned to the owner
that will update them in this modernization commit:

- backend spec index and old spec cross-links → active spec owner;
- Codex Desktop and development-environment references to versioned packages
  → active spec owner;
- the desktop acceptance requirements matrix → test/spec owner;
- the task-doc historical fixture → task-doc test owner;
- the local-build current-document list → task/spec owner;
- the Vitest exclusion for the deleted reference package → test-config owner;
- four public README files and three localized installation manuals containing
  fixed-version/MSI current instructions → public-doc owner;
- active child task evidence pointing at replaced specs → task owner.

Historical release notes and the real `.trellis/tasks/archive/` are expressly
not rewritten. Negative tests that reject MSI/WiX assets remain valid current
evidence and are not historical authority.

## Protocol and compatibility preservation checklist

- P `fyagent://v1/import` remains in DEEPLINK and Rust/renderer tests.
- P `fyagent-download-manifest/v2` remains in APP-VERSION/RELEASE and download
  manifest tests.
- P `fyagent-platform-build/v1` and `fyagent-build-metadata/v1` remain in
  RELEASE and metadata tests.
- P WorkBuddy's third-party `/v1` normalization remains in WORKBUDDY and Rust
  URL tests.
- P Node, pnpm, Rust, Python, uv, Action, Trellis, NSIS, OS, and API versions
  remain where they express an actual compatibility contract; product-stage
  labels do not.

## Resulting current-document topology

`docs/fyagent/development/README.md` routes current explanations by
responsibility. Architecture, Windows/Codex, configuration, CI/release,
tooling, Trellis, and validation documents explain flow and operating context
while linking to the active normative owner. They do not restate the owner
spec's complete field, error, asset, or policy tables.
