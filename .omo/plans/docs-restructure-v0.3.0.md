# FyAgent v0.3.0 文档体系重构计划（v4 — 视觉资产规划增强版）

> **Plan state**
>
> - intent: clear
> - status: ready_for_execution
> - review_completed: 2026-08-10
> - review_evidence: code_audit
> - sample_evidence: generated_asset_visual_inspection
> - implementation_approval_required: true
> - slug: docs-restructure-v0.3.0
> - source_of_truth: 当前工作树；冻结设计包与历史 Release Notes 仅作证据，不作覆盖源
> - environment_note: 本次评审时当前 PowerShell 找不到 `mise`；实施前必须由开发者完成本机安装/信任，任务自身只运行 `mise run bootstrap`，不得代替开发者执行 `mise trust`

## v4 评审修订摘要

1. 删除 `README_DE.md` 的级联范围补齐到 `scripts/tasks/docs-contract-check.mjs`、`tests/localBuildBoundary.test.ts`、`tests/desktopSecurityBoundary.test.ts`；否则合同检查和测试会直接读取已删除文件。
2. README 瘦身改为三语分别迁移，共 9 个正文文件 + 1 个索引；不再把中/日文内容丢失或隐式指向英文正文。
3. 当前基线修正为 75 个既有章节、40 张 PNG、84 处图片引用；40 张图片均被引用，不存在“34 张”基线。
4. Agent 工具能力按源码修正为：7 个工具参与版本探测，6 个工具支持安装/升级，Codex CLI 仅探测、不进入安装/升级动作。
5. WorkBuddy 前端错误码枚举修正为 22 个；源码锚点改用符号名，不再依赖易漂移行号。
6. 章节路径和可见编号更新要求使用一次性映射或按 `5→6、4→5、3→4、2→3` 降序处理，防止连续替换级联误伤。
7. 验证命令统一使用 `rg`、PowerShell 和仓库 `mise run` 入口；删除 Bash 专属的 `test`、`grep`、`ls`、`wc`、进程替换。
8. `git` 不记录“是否执行过 git mv”；验收改为 `git diff --summary -M` / `git show --summary -M` 的重命名识别结果。
9. 审计结果必须写入稳定文件，不能只放 commit message；历史设计包、上游来源、旧 Release Notes 的合法旧名称显式排除。
10. 计划不再宣称“零代码改动”：不改产品运行时代码，但会做 1 个合同脚本和 2 个测试清单的必要维护。
11. 新增对外营销与讲解视觉资产工作流：资产矩阵、提示词合同、品牌/版权边界、1 张 ChatGPT 生图样例及其可追溯说明；批量生产其余资产仍需独立评审。

---

## 1. 目标与成功标准

把当前公开 README、三语用户手册和开发者入口整理为 FyAgent v0.3.0 的现行文档体系，并建立可复用的对外营销/讲解视觉方向，同时保留 CC Switch 上游来源、历史版本和冻结设计包的可追溯性。

完成时必须同时满足：

- 三份现行根 README 不再链接德语 README，相关合同/测试不再把它当活动文件。
- 三语用户手册各有 6 章、28 个章节文件，目录、索引、正文编号和相对链接一致。
- 英/中/日 README 中的架构、开发指南、项目结构内容分别无损迁出。
- 活动文档中的仓库链接、Deep Link 和数据目录使用 FyAgent 身份；历史/法律来源不被改写。
- 40 张现有截图全部有审计结论，84 处现有引用全部可追溯到有效文件。
- 15 张未来重截目标有可执行人物卡，但本任务不生成或替换截图。
- 对外视觉资产有明确用途矩阵、提示词模板、生成/确定性合成边界和 1 张可评审主视觉样例。
- 计划涉及的合同检查、目标测试和完整当前宿主质量门禁全部通过。

---

## 2. 已核实基线

| 项目 | 当前值 | 证据 |
|---|---:|---|
| 三语既有章节 | 75 | 每语 25 个，合计 75 个 |
| 需要重编号的既有章节 | 60 | 每语 20 个，合计 60 个 |
| 现有截图 | 40 | `docs/user-manual/assets/*.png` |
| 现有截图引用 | 84 | zh/en/ja 各 28 处 |
| 未被引用的截图 | 0 | 40 张全部至少被引用一次 |
| 手册本地链接/图片路径 | 285 | 评审时检查，0 个失效 |
| `docs/guides/` 文件 | 22 | 其中 6 个旧名称命中均为上游来源说明 |
| `deplink.html` / `flatpak/README.md` 旧名称命中 | 0 / 0 | 评审时 `rg` 检查 |
| 工具版本探测 | 7 个 | `TOOL_NAMES` |
| 可安装/升级工具 | 6 个 | `LIFECYCLE_TOOLS`，排除 Codex |
| WorkBuddy 错误码 | 22 个 | `WorkBuddyErrorCode` |
| 当前产品版本 | 0.3.0 | `node scripts/version.mjs get` |
| 营销主视觉样例 | 1 张，1672×941 | `docs/fyagent/marketing/assets/samples/fyagent-unified-control-hero-v1.png` |

README 三语开发章节当前边界仅作为评审基线；实施必须按 `<summary>` 标记定位，不得按行号切割：

| 文件 | 架构 | 开发指南 | 项目结构 |
|---|---|---|---|
| `README.md` | 233–274 | 276–401 | 403–442 |
| `README_ZH.md` | 233–274 | 276–395 | 397–436 |
| `README_JA.md` | 237–278 | 280–404 | 406–445 |

---

## 3. 范围

### Wave 1 — 身份与活动文件闭包

- 删除 `README_DE.md`。
- 从 `README.md`、`README_ZH.md`、`README_JA.md` 移除 Deutsch 链接。
- 从以下活动文件清单移除 `README_DE.md`：
  - `scripts/tasks/docs-contract-check.mjs` 的 `LEGACY_ENTRYPOINT_HANDOFF` 和 `activeDocs`；
  - `tests/localBuildBoundary.test.ts` 的 `CURRENT_DOCUMENTS`；
  - `tests/desktopSecurityBoundary.test.ts` 的 `activeWindowsInstallDocs`。
- `git mv session-manager.md docs/fyagent/dev/session-manager.md`，并在正文最前添加“历史 PRD、非当前产品合同”的醒目标记；原正文信息保持不变。
- 更新 `docs/user-manual/README.md` 和三语 `README.md` 的版本、日期、仓库链接并删除 v3.16.0 亮点段。
- 修正 75 个既有章节中的当前产品仓库链接、Deep Link、数据路径和产品名。
- 新建 `docs/release-notes/README.md`，说明 FyAgent 与上游历史版本边界。
- 审计 `docs/guides/`、`deplink.html`、`flatpak/README.md`，将结果写入 `docs/fyagent/development/docs-restructure-audit-v0.3.0.md`。

### Wave 2 — README 三语瘦身

- 新建：
  - `docs/fyagent/development/en/{architecture,guide,structure}.md`
  - `docs/fyagent/development/zh/{architecture,guide,structure}.md`
  - `docs/fyagent/development/ja/{architecture,guide,structure}.md`
  - `docs/fyagent/development/README.md`
- 从三份根 README 分别迁出对应语言的 3 个 `<details>` 区块。
- 三份根 README 改为链接各自语言的正文；统一索引同时链接现有生成文档 `mise-tasks.md`。
- `mise-tasks.md` 是生成文件，本计划只链接，不手工修改。

### Wave 3 — 用户手册六章重组

- 60 个既有章节重编号并保留 Git 重命名识别。
- 新增三语章节：
  - `2-agent-tools/2.1-install.md`
  - `2-agent-tools/2.2-update-diagnose.md`
  - `4-extensions/4.6-workbuddy.md`
- 扩展三语 `4-extensions/4.3-skills.md`。
- 重写三语手册索引，更新全部路径链接、锚点和可见章节编号。
- 新章节不得引用尚不存在的未来截图；人物卡中的文件名是拍摄规格，不是可嵌入链接。

### Wave 4 — 截图审计、人物卡与验证

- 审计 40 张现有截图和 84 处现有引用，在审计报告中逐图记录：引用位置、语言、品牌/UI 状态、结论（保留/重截/未来本地化）、对应人物卡（如有）。
- 新建 `docs/user-manual/assets/shot-cards/README.md` 和 15 张人物卡。
- 运行手册结构、链接、品牌、内容无损、Git 重命名、合同检查、目标测试和完整质量门禁。

### Wave 5 — 对外营销与讲解视觉资产

- 新建 `docs/fyagent/marketing/visual-asset-plan.md`，记录受众、渠道、资产矩阵、尺寸/裁切、文案承载方式、优先级和负责人。
- 新建 `docs/fyagent/marketing/prompts/README.md`，沉淀主视觉、功能插图、讲解图和 UI 辅助插图的结构化提示词卡。
- 纳入本轮已生成的概念样例：
  - `docs/fyagent/marketing/assets/samples/fyagent-unified-control-hero-v1.png`
  - `docs/fyagent/marketing/visual-direction-sample-v1.md`
- 对样例做构图、品牌一致性、第三方标识、文字、响应式裁切、文件体积和可访问性评审；决定保留、定向迭代或废弃。
- 本 Wave 只完成规划、提示词库和 1 张主视觉样例；矩阵内其余正式资产另行排期，不以占位图冒充完成。

### Out of scope

- 实际重截、生成或替换截图。
- 批量生成视觉资产矩阵中的全部正式图片，以及把概念样例直接发布到官网/商店/社媒。
- Grok Build 独立章节；它只在工具管理或供应商语境中同级说明。
- AgentsPanel 文档；当前仍是 Coming Soon。
- v3.16→v3.19 的上游功能正文搬运。
- 既有章节对 FyAgent 当前 UI 的逐章全面重写。
- 德语用户手册或德语 README 的后续维护。
- 产品运行时代码：`src/`、`src-tauri/`。
- `.trellis/`、`.agents/`、`.github/`。
- 冻结设计包 `docs/fyagent/dev/v1-0.3.0/**` 及其 `MANIFEST.sha256`。

### Must-NOT-Have

- 不删除或改写 `docs/release-notes/v3.*.md`、`docs/upstream/**`、`CHANGELOG.md` 中的历史事实。
- 不修改 `LICENSE`、`LICENSING.md`、`COMMERCIAL-LICENSE.md`、`THIRD_PARTY_NOTICES.md`。
- 不修改 `CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`SECURITY.md`、`SUPPORT.md`。
- 不丢失三语 README 被迁出区块的正文信息。
- 不保留重命名后旧章节路径的副本。
- 不在新增章节中写 TODO、占位符或虚构未实现能力。
- 不把计划中的源码行号当长期合同；以符号、类型和行为为准。

---

## 4. 设计决策

### 4.1 身份替换规则

活动替换范围仅为：

- `README.md`、`README_ZH.md`、`README_JA.md`；
- `docs/user-manual/README.md`；
- `docs/user-manual/{zh,en,ja}/**/*.md`。

精确替换：

| 原模式 | 新模式 | 规则 |
|---|---|---|
| `github.com/NongHua123/cc-switch` | `github.com/NongHua123/fyagent` | 当前仓库链接 |
| `ccswitch://` | `fyagent://` | 当前 Deep Link |
| `~/.cc-switch/` | `~/.fyagent/` | 当前数据路径 |
| `.cc-switch` | `.fyagent` | 其他当前路径语境 |

`CC Switch`（带空格）按语境处理：

1. 链接、路径、协议中的当前产品身份：替换。
2. 根 README 法律声明、上游来源、历史版本事实：保留。
3. `docs/guides/` 中指向 `farion1231/cc-switch` 的上游 PR 和 v3.19.1 来源说明：保留并写入审计报告。
4. 其余指代当前产品的地方：替换为 `FyAgent`。

禁止用“全仓必须清零”验收。仓库已有大量冻结设计、上游来源和旧 Release Notes 合法命中；验收只扫描活动范围，并对活动范围内保留的 `CC Switch` 建立逐条白名单。

### 4.2 删除德语 README 的闭包

同一 Wave 内原子完成：根文件删除 → 三份语言切换器更新 → 合同脚本更新 → 两个测试清单更新 → 目标测试与合同检查。以下位置允许继续出现 `README_DE.md`，因为它们记录历史事实或冻结快照：

- `docs/fyagent/dev/v1-0.3.0/**`；
- `docs/release-notes/v3.16.0-*.md`；
- `.trellis/tasks/archive/**`。

### 4.3 README 内容无损迁移

- 按 `<summary>` 文本定位三个区块，不使用固定行号。
- 每个目标文件增加本语言 H1；其后正文逐字迁移，仅修复因目录改变而失效的相对链接。
- 在审计报告记录 9 个映射的源标记、目标路径、正文行数和规范化 SHA-256；哈希比较排除 `<details>/<summary>` 包装和目标 H1。
- 三份根 README 只保留简短开发者文档链接块：

```text
README.md    → development/en/*.md
README_ZH.md → development/zh/*.md
README_JA.md → development/ja/*.md
```

### 4.4 六章结构

```text
docs/user-manual/{zh,en,ja}/
├── 1-getting-started/   5
├── 2-agent-tools/       2  NEW
├── 3-providers/         6  原 2-providers
├── 4-extensions/        6  原 3-extensions + WorkBuddy
├── 5-proxy/             5  原 4-proxy
└── 6-faq/               4  原 5-faq
```

每语 28 个章节；三语合计 84 个章节文件，不含各语言索引 README。

### 4.5 Rename Map

以下映射对 zh/en/ja 各执行一次：

```text
2-providers/2.1-add.md              → 3-providers/3.1-add.md
2-providers/2.2-switch.md           → 3-providers/3.2-switch.md
2-providers/2.3-edit.md             → 3-providers/3.3-edit.md
2-providers/2.4-sort-duplicate.md   → 3-providers/3.4-sort-duplicate.md
2-providers/2.5-usage-query.md      → 3-providers/3.5-usage-query.md
2-providers/2.6-claude-desktop.md   → 3-providers/3.6-claude-desktop.md

3-extensions/3.1-mcp.md             → 4-extensions/4.1-mcp.md
3-extensions/3.2-prompts.md         → 4-extensions/4.2-prompts.md
3-extensions/3.3-skills.md          → 4-extensions/4.3-skills.md
3-extensions/3.4-sessions.md        → 4-extensions/4.4-sessions.md
3-extensions/3.5-workspace.md       → 4-extensions/4.5-workspace.md

4-proxy/4.1-service.md              → 5-proxy/5.1-service.md
4-proxy/4.2-routing.md              → 5-proxy/5.2-routing.md
4-proxy/4.3-failover.md             → 5-proxy/5.3-failover.md
4-proxy/4.4-usage.md                → 5-proxy/5.4-usage.md
4-proxy/4.5-model-test.md           → 5-proxy/5.5-model-test.md

5-faq/5.1-config-files.md           → 6-faq/6.1-config-files.md
5-faq/5.2-questions.md              → 6-faq/6.2-questions.md
5-faq/5.3-deeplink.md               → 6-faq/6.3-deeplink.md
5-faq/5.4-env-conflict.md           → 6-faq/6.4-env-conflict.md
```

### 4.6 交叉引用更新

1. 路径和文件名使用一个映射表一次性转换；若执行者采用字符串替换，必须按 `5→6、4→5、3→4、2→3` 降序执行。
2. 对可见编号做同样的一次性映射，覆盖中文“第 N 章/N.M 节”、英文 `Chapter/Section`、日文 `第N章/N.M節` 及 Markdown 链接标签。
3. 用 `rg` 全仓查找指向 `docs/user-manual` 旧路径的反向引用；历史冻结目录只记录、不修改。
4. 更新后运行相对链接/图片路径解析检查，失效数量必须为 0。

### 4.7 新章节内容合同

#### `2.1-install.md` — 工具安装与版本状态

- 入口：设置 → 关于 → 工具管理。
- 7 个版本探测对象：Claude Code、Codex CLI、Gemini CLI、Grok Build、OpenCode、OpenClaw、Hermes。
- 6 个可安装/升级对象：除 Codex CLI 外的其余工具；明确说明 Codex 卡片只探测版本。
- 一键命令复制、WSL shell/flag、安装后版本刷新与验证。
- 源码合同：`TOOL_NAMES`、`LIFECYCLE_TOOLS`、`ONE_CLICK_INSTALL_COMMANDS`、`handleCopyInstallCommands`、`refreshToolVersions`。

#### `2.2-update-diagnose.md` — 升级与安装冲突诊断

- 版本与 latest 探测、单工具/批量串行升级、每个工具独立成败。
- 更新前多安装位置探测与确认。
- 全量诊断覆盖 7 个探测对象；安装/升级动作只覆盖 6 个生命周期工具。
- 升级后补诊；硬失败、版本未变、安装后不可运行三类结果。
- 源码合同：`probeToolInstallations`、`handleDiagnoseAll`、`executeRun`、`handleRunToolAction`。

#### `4.6-workbuddy.md` — WorkBuddy 模型配置注入

- WorkBuddy 定位和顶层应用切换入口。
- Base URL、API Key 显示/隐藏、允许无 Key、HTTP 非加密警告。
- 获取模型、截断提示、客户端搜索过滤、勾选/全选/手工模型 ID。
- revision 并发保护、overwrite token 二次确认、已有模型状态。
- 错误表覆盖 `WorkBuddyErrorCode` 当前 22 个码，按 URL/鉴权/网络响应/配置读写/并发覆盖/内部错误分组，不宣称固定数量是永久合同。
- 源码合同：`buildSaveRequest`、`handleFetch`、`handleSave`、`WorkBuddyErrorCode`、`WorkBuddySaveModelsResult`。

#### `4.3-skills.md` 扩展

- GitHub 下载（60 秒超时）→ `~/.fyagent/skills/` SSOT → 数据库记录/内容哈希 → 应用目录同步。
- 同步策略必须写成“按配置使用 symlink 或 copy；Auto 优先 symlink、失败回退 copy”，不能笼统写成永远使用软链接。
- 内容哈希更新检测、手动检查、更新标签。
- `~/.fyagent/skill-backups/`、最近 20 个备份、卸载顺序。
- 路径消毒、目录逃逸、归档/符号链接防护、同名冲突。
- 自定义仓库、启停、skills.sh 公共目录。
- 源码合同：`install`、`uninstall`、`check_updates`、`create_uninstall_backup`、`sync_to_app_dir`、路径与归档防护函数。

### 4.8 Release Notes 索引

`docs/release-notes/README.md` 至少包含：

| 范围 | 产品 | 说明 |
|---|---|---|
| v0.3.0+ | FyAgent | 独立版本体系 |
| 仓库现存 v3.6.0–v3.19.1 文件 | CC Switch | 上游历史 Release Notes |

并说明：FyAgent v0.3.0 的源码基线包含 CC Switch v3.19.2；该来源记录位于 `docs/upstream/cc-switch-v3.19.2.md`，仓库当前没有 v3.19.2 Release Note 文件，不得虚构。

### 4.9 截图人物卡

- 现有 18 张 Claude Desktop 本地化截图继续保留 `-en` / `-ja`；不得用“en/ja 全部复用中文截图”覆盖既有事实。
- 其余 22 张无语言后缀截图当前由三语手册共用。
- 未来重截默认先产出中文裸文件名；英文/日文是否本地化由审计报告逐图决定。
- 人物卡命名：`NNN-<image-name>.md`；每张至少包含章节、目标文件名、尺寸、主题、语言、前置数据、界面状态、必显元素、隐私/脱敏要求、验收方式。

15 张人物卡：

| # | 章节 | 目标文件名 | 主题 |
|---:|---|---|---|
| 001 | 1.3 | `main-overview.png` | 主界面全景 |
| 002 | 1.4 | `quickstart-add-provider.png` | 添加供应商流程 |
| 003 | 1.5 | `settings-general.png` | 设置页通用区 |
| 004 | 2.1 | `about-tool-install.png` | 工具安装区 |
| 005 | 2.2 | `about-diagnose-conflict.png` | 冲突诊断结果 |
| 006 | 3.1 | `provider-card-list.png` | 供应商列表 |
| 007 | 3.3 | `provider-edit-form.png` | 编辑供应商 |
| 008 | 4.1 | `mcp-panel.png` | MCP 管理 |
| 009 | 4.2 | `prompts-editor.png` | 提示词编辑器 |
| 010 | 4.3 | `skills-panel.png` | Skills 管理 |
| 011 | 4.4 | `sessions-list.png` | 会话列表 |
| 012 | 4.6 | `workbuddy-connection.png` | WorkBuddy 连接 |
| 013 | 4.6 | `workbuddy-models.png` | WorkBuddy 模型选择 |
| 014 | 5.1 | `proxy-service.png` | 代理服务 |
| 015 | 5.3 | `failover-queue.png` | 故障转移队列 |

### 4.10 对外营销与讲解视觉系统

视觉原型锁定为 **Developer Tool / AI Product**：深石墨背景、精确网格、单一青绿/电蓝高亮信号、少量暖橙状态点、克制的 3D 工程材质。禁止回退到 `Inter + 灰卡片 + 紫色渐变` 的通用 SaaS 模板。

设计 token：

| Token | 值/规则 |
|---|---|
| `bg` | `#0B1017` 深石墨 |
| `surface` | `#121A26` / `#EEF5FA` 深浅两级表面 |
| `accent-primary` | `#27D9C4` 青绿 |
| `accent-secondary` | `#2F7DFF` 电蓝 |
| `signal` | `#FF9D2E`，只作少量状态点 |
| `radius` | 圆形连接器 + 12–20 px 面板圆角 |
| `lighting` | 单一柔和棚拍光，克制边缘高光 |
| `texture` | 哑光石墨、雾面浅色表面、抛光连接管线 |

优先资产矩阵：

| 优先级 | 资产 | 主要用途 | 画幅 | 生产方式 |
|---|---|---|---|---|
| P0 | 统一管理主视觉 | README、官网首屏、发布文章 | 16:9 | ChatGPT 生图概念 + 原始 Logo/文案确定性合成 |
| P0 | OG / 社媒横图 | GitHub、X、公众号分享卡 | 1200×630 | 主视觉安全裁切 + 确定性标题 |
| P1 | 多工具统一管理讲解图 | 产品介绍、路演 | 16:9 | `infographic-diagram` 无文字底图 + SVG/HTML 标签 |
| P1 | 安装/升级/冲突诊断插图 | 2.1、2.2 章节与功能营销 | 3:2 | `stylized-concept`，真实能力由源码合同约束 |
| P1 | Skills 生命周期插图 | 4.3 章节 | 3:2 | 下载→SSOT→同步→备份流程；文字后置 |
| P1 | WorkBuddy 模型注入插图 | 4.6 章节 | 3:2 | 连接→获取→选择→写入流程；文字后置 |
| P1 | 本地优先与配置安全图 | 官网“为什么选择”/演示稿 | 16:9 | 结构化讲解图 + 确定性数据/标签 |
| P2 | 发布海报 | 中文社区、更新公告 | 4:5 / 1:1 | 主视觉变体 + 版本文案后置 |
| P2 | 空状态/引导插图组 | 文档、未来 UI 候选 | 4:3 | 只生成插图主体；按钮、图标、控件保持代码/矢量原生 |

提示词合同：

1. 使用 `ads-marketing`、`infographic-diagram`、`stylized-concept` 或 `ui-mockup` 等明确 use case，不写一句话式模糊提示词。
2. 每张提示词卡包含用途、受众、画幅、场景、主体、构图、色板、材质、必保留项、禁用项和后期合成项。
3. 生图阶段默认不生成正文、按钮文字、流程标签或第三方 Logo；准确文字与原始 FyAgent Logo 使用 SVG/HTML/设计工具确定性合成。
4. 如果使用 `assets/fyagent.png` 作为参考，必须标注“项目自有品牌参考”；不得把第三方产品图标喂给模型后生成近似商标。
5. UI 截图属于真实运行时证据，不用生图替代；生图只能做概念插图、背景和讲解场景。
6. 每个输出保存提示词、模型路径（built-in/CLI）、参考图、尺寸、SHA-256、评审状态和已知限制。

首个样例与完整提示词见 `docs/fyagent/marketing/visual-direction-sample-v1.md`。该图当前为 `concept`：中心 Logo 是生成结果，不作为品牌母版；正式发布时应以原始 `assets/fyagent.png` 确定性合成并复核清晰度。

---

## 5. 实施顺序与依赖

### Preflight

1. 确认 `mise` 可用且仓库已由开发者信任。
2. 运行 `mise run bootstrap`。
3. 运行 `git status --short --branch`，保留并避开既有用户改动。
4. 重跑第 2 节基线计数；若数量变化，先更新计划基线再实施。

### Wave 1

1. 原子完成德语 README 删除闭包，并立即运行目标测试与 `check:contracts`。
2. 移动 `session-manager.md` 并添加历史标记。
3. 更新 4 个手册索引 README。
4. 按精确规则处理 75 个章节。
5. 新建 Release Notes 索引。
6. 写入 guides/deplink/flatpak 审计结果。

### Wave 2

7. 按三语 `<summary>` 标记提取 9 个正文文件。
8. 写入 `docs/fyagent/development/README.md`。
9. 用各语言链接块替换根 README 的原区块。
10. 记录 9 组无损迁移哈希并复核相对链接。

### Wave 3

11. 按 Rename Map 移动 60 个文件。
12. 新建 9 个章节文件并扩展 3 个 Skills 章节。
13. 重写三语手册索引。
14. 一次性更新路径、文件名和可见编号。
15. 运行旧路径扫描和相对链接解析；失败先修复再进入 Wave 4。

### Wave 4

16. 审计 40 张图片与 84 处引用并写入稳定报告。
17. 新建 shot-cards README + 15 张人物卡。
18. 运行最终验证、独立复读和 Git diff 检查。

### Wave 5

19. 写入视觉资产矩阵与渠道/尺寸/裁切合同。
20. 写入至少 4 类结构化提示词卡：主视觉、功能插图、讲解图、UI 辅助插图。
21. 复核并登记现有主视觉样例的提示词、参考图、尺寸、SHA-256 和限制。
22. 做一次桌面/移动安全裁切预览；决定样例保留、迭代或废弃，不直接发布。
23. 将未生产的正式资产转成后续任务，不在本计划内批量生成。

依赖关系：

```text
Preflight → Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5
```

Wave 内也存在明确顺序；不得再假设“Wave 内 todos 无依赖”。

---

## 6. 收口清单

- [ ] C1. 删除 DE README 的文件、链接、合同脚本和测试依赖闭包完成。
- [ ] C2. 4 个手册索引 README 的版本/日期/链接已更新，三语亮点段已删除。
- [ ] C3. 75 个既有章节的当前身份修正完成，历史事实白名单已记录。
- [ ] C4. Session Manager 孤儿 PRD 已移动并标为历史，不再冒充当前合同。
- [ ] C5. Release Notes 索引和综合审计报告存在。
- [ ] C6. 9 个三语开发正文 + 1 个索引完成，9 组迁移哈希一致。
- [ ] C7. 每语 28 个章节、旧目录不存在、三语索引与文件系统一致。
- [ ] C8. 60 个迁移文件被 Git 识别为 rename，旧路径无副本。
- [ ] C9. 40 张截图、84 处引用全部有审计结论；16 个 shot-card Markdown 文件存在。
- [ ] C10. 活动范围品牌、版本、旧章节路径和本地链接检查全部通过。
- [ ] C11. 目标测试、`check:contracts`、完整 `mise run check` 和 `git diff --check` 全部通过。
- [ ] C12. 视觉资产矩阵、至少 4 类提示词卡和 1 张可追溯样例完成；样例有明确 concept/final 状态与发布前限制。

---

## 7. 验收与验证

### 7.1 活动身份与 DE 闭包

```powershell
rg -n -i 'cc-switch|ccswitch|\.cc-switch' docs/user-manual README.md README_ZH.md README_JA.md
rg -n 'v3\.16\.0' docs/user-manual
rg -n --fixed-strings 'README_DE.md' README.md README_ZH.md README_JA.md scripts tests
```

预期：均无输出。`rg` 的 exit code 1 表示“无匹配”，在此为成功结果。

另行运行：

```powershell
rg -n --fixed-strings 'CC Switch' docs/user-manual README.md README_ZH.md README_JA.md
```

预期：只出现审计报告批准的法律/历史语境；每个命中均人工复核。

### 7.2 文件拓扑

```powershell
if (Test-Path 'README_DE.md') { throw 'README_DE.md still exists' }
if (Test-Path 'session-manager.md') { throw 'root session-manager.md still exists' }
if (-not (Test-Path 'docs/fyagent/dev/session-manager.md')) { throw 'moved session PRD missing' }

foreach ($lang in 'zh','en','ja') {
  $count = (Get-ChildItem "docs/user-manual/$lang" -Recurse -File -Filter '*.md' |
    Where-Object Name -ne 'README.md').Count
  if ($count -ne 28) { throw "$lang chapter count: $count" }
}

foreach ($lang in 'zh','en','ja') {
  foreach ($old in '2-providers','3-extensions','4-proxy','5-faq') {
    if (Test-Path "docs/user-manual/$lang/$old") { throw "stale dir: $lang/$old" }
  }
}

$cards = (Get-ChildItem 'docs/user-manual/assets/shot-cards' -File -Filter '*.md').Count
if ($cards -ne 16) { throw "shot-card count: $cards" }
```

### 7.3 旧路径与反向引用

```powershell
rg -n '2-providers/|3-extensions/|4-proxy/|5-faq/' docs/user-manual
rg -n 'user-manual.*(2-providers|3-extensions|4-proxy|5-faq)' . -g '*.md' -g '!docs/fyagent/dev/v1-0.3.0/**' -g '!.trellis/tasks/archive/**'
```

预期：无活动命中。

### 7.4 内容与链接完整性

- 审计报告中的 9 组 README 迁移正文哈希一致。
- 三语索引目录树与实际目录逐项一致。
- 所有 Markdown 相对链接和图片路径解析到现有文件，失效数为 0。
- 40 个现有 PNG 文件名全部出现在截图审计表；报告汇总引用数为 84。
- 新章节未嵌入不存在的未来截图路径。

### 7.5 Git 重命名与仓库门禁

```powershell
git diff --summary -M
git diff --check
mise run test:unit -- tests/localBuildBoundary.test.ts tests/desktopSecurityBoundary.test.ts
mise run check:contracts
mise run check
```

预期：

- `git diff --summary -M` 将 60 个既有章节识别为 rename；若相似度因内容扩展降低，先拆分“纯移动”和“正文修改”两个提交再复核。
- `git diff --check` 无 whitespace 错误。
- 两个目标测试、合同门禁和完整当前宿主门禁均通过。

提交后用 `git show --summary -M <commit>` 复核 rename；不要声称 Git 保存了 `git mv` 命令本身。

### 7.6 营销视觉样例

```powershell
$sample = 'docs/fyagent/marketing/assets/samples/fyagent-unified-control-hero-v1.png'
if (-not (Test-Path $sample)) { throw 'marketing sample missing' }
Get-FileHash -Algorithm SHA256 $sample
```

预期：

- 样例尺寸为 1672×941，约 16:9；左侧具备标题安全区，右侧清晰表达“多工具 → 一个管理中枢”。
- 无内嵌文字、水印和第三方 Logo；实际发布前用项目原始 Logo 做确定性合成。
- SHA-256 为 `2D5767DEA12F6B0456D887B6E21D786B1DEE47C2CBC8B69FDBB5951A0C2926A2`。
- `visual-direction-sample-v1.md` 保存最终提示词、参考图角色、生成方式、已知限制和下一轮单变量迭代建议。

---

## 8. 审计报告最低结构

`docs/fyagent/development/docs-restructure-audit-v0.3.0.md` 至少包含：

1. 基线计数和执行日期。
2. `docs/guides/`、`deplink.html`、`flatpak/README.md` 的每个旧名称命中、语境和处理结论。
3. 活动范围 `CC Switch` 白名单。
4. 9 个 README 迁移映射、正文行数和规范化 SHA-256。
5. 40 张截图表：文件名、84 处引用位置汇总、语言、品牌/UI 状态、结论、人物卡。
6. 最终命令、exit code、关键输出摘要和证据等级。
7. 营销视觉样例的路径、提示词文档、SHA-256、视觉评审结论与是否获准发布。

审计报告是交付物；commit message 只链接它，不承载唯一证据。

---

## 9. 风险与回退

| 风险 | 影响 | 缓解/回退 |
|---|---|---|
| 删除 DE README 未更新依赖清单 | 合同检查/测试读文件失败 | 同 Wave 原子修改 1 个脚本 + 2 个测试，先跑目标门禁 |
| 三语内容被合并成英文单份 | 中文/日文开发信息丢失 | 9 个语言正文 + 规范化哈希 |
| 连续替换造成 2→3→4→5→6 级联 | 路径和章节号错乱 | 一次性映射或降序替换；旧路径扫描 + 链接解析 |
| 大量正文修改降低 rename 相似度 | Git 历史难追踪 | 纯移动与正文修改分提交；用 `-M` 复核 |
| 当前产品替换误伤上游/法律事实 | 来源失真 | 活动范围 + 逐条白名单；冻结包完全不改 |
| Skills 文档把 copy 回退写成“总是 symlink” | 用户预期错误 | 按 `sync_to_app_dir` 的 Auto/Symlink/Copy 行为写作 |
| 新章节引用未来截图 | 文档立即出现 404 | 本计划只写人物卡，不嵌入未生成图片 |
| 截图审计发现大量需重截 | 后续工作量扩大 | 本计划只分类并产出人物卡；实际拍摄拆成后续任务 |
| 生成式 Logo/文字变形 | 对外品牌失真、可读性差 | 生图只做概念主体；原始 Logo 和准确文字后期确定性合成 |
| 生成近似第三方商标或虚构 UI | 法务/信任风险 | 使用通用几何节点；发布前人工检查；真实 UI 只用运行时截图 |
| 一张样例被误当完整营销系统 | 资产覆盖不足 | 样例标为 concept；矩阵未完成项必须进入后续任务 |
| 实施环境缺少 `mise` | 无法提供质量门禁证据 | Preflight 失败即停止；不绕过 canonical task 入口 |

回退按 Wave 进行；每个 Wave 保持独立提交。文件移动和内容编辑分开提交时，优先回退当前 Wave，不回退无关用户改动。

---

## 10. 完成定义

只有 C1–C12 全部勾选、审计报告写入真实结果、最新验证命令全部通过，计划才可从 `ready_for_execution` 转为 `completed`。本计划评审证据等级为 `code_audit`，概念样例另做了 `generated_asset_visual_inspection`；实际 UI 截图重拍不在范围内，因此不得宣称 `runtime_screenshot` 或 `pixel_diff` 验收，概念样例也不得冒充真实 UI 证据。
