# Prompt / Memory 前端实施入口

## 1. 权威执行文件

实际执行顺序、owner、命令、提交和停止条件只以 `execution-plan.md` 为准。详细行为和测试矩阵见 `detailed-design-overview.md`。

本文不保留旧的“已完成批次”或旧测试结果，避免把前一轮 40 unit / 28 browser 等基线冒充本轮验收。

## 2. 当前阶段

- Trellis 状态：`in_progress`。
- 当前阶段：`DESIGN_FREEZE=2026-08-12` 后的三线路并行实施。
- 代码实施：等待 Prompt、Memory、shared/standalone 三个独占 owner 按冻结设计执行。
- 本轮新鲜测试：0；符合设计评审阶段零测试门禁。
- 下一门禁：三个模块分别完成且各自聚焦单测通过，主 Agent 核验后才能首次运行完整集成。

冻结后才把任务切为 `in_progress`，同时派发三个执行 Agent。

## 3. 实施线路

### Prompt owner

- `src/v2/pages/prompts/Page.tsx`
- `src/v2/pages/prompts/page.css`
- `src/v2/pages/prompts/prototype.ts`
- `tests/v2/pages/prompts/Page.test.tsx`

只运行：

```bash
pnpm test:v2 -- tests/v2/pages/prompts/Page.test.tsx
```

### Memory owner

- `src/v2/pages/memory/Page.tsx`
- `src/v2/pages/memory/page.css`
- `src/v2/pages/memory/prototype.ts`
- `tests/v2/pages/memory/Page.test.tsx`

只运行：

```bash
pnpm test:v2 -- tests/v2/pages/memory/Page.test.tsx
```

### Shared / standalone owner

- `src/v2/shared/config/agentTargets.ts`
- `tests/v2/shared/config/agentTargets.test.ts`
- `scripts/build-v2-preview.mjs`
- `tests/v2/scripts/build-v2-preview.test.ts`

只运行：

```bash
pnpm test:v2 -- tests/v2/shared/config/agentTargets.test.ts tests/v2/scripts/build-v2-preview.test.ts
```

三个 Agent 不是单独工作；只改 owner 文件，不修改/格式化/回滚其他线路成果，不运行完整测试、browser 或 build。

## 4. 主 Agent 集成门禁

必须同时满足：

1. 三线路实现返回。
2. 三个模块单测分别新鲜通过。
3. 主 Agent 用命令核验关键文件与 owner 无越界。
4. Prompt/Memory 已消费稳定 shared contract。

此后才第一次运行：

```bash
pnpm lint:v2
pnpm typecheck:v2
pnpm test:v2
pnpm build:renderer
pnpm test:v2:browser
```

失败时先修 owning module、重跑其模块单测，再重跑失败的完整命令。

## 5. 最终验收

- 四档 viewport：900×600、1152×640、1232×700、1440×900。
- standalone `file://` 直接打开并可切 Prompt/Memory。
- Prompt 多规则、多目标、新建/保存/dirty route guard 实际可点。
- Memory Daily/Session 只读、提炼、保存、目标多选、pending task 与 dirty route guard 实际可点。
- 1586×992 两页新截图只标 `runtime_screenshot`。
- Trellis validate、`git diff --check` 通过。
- 基线 `e33d37dd6f9d58c11207f843b5c33750a79dbb4a...HEAD` 与 worktree 两层保护审计均无 `src-tauri` 或并行模块误纳。
- 无私人正文、用户名绝对路径或凭据进入仓库。
- Agent/models/skills/mcp/navigation/router/AppShell/Shell 与无关图片目录受保护。

## 6. Git 交付

在当前 `codex/prompt-memory-frontend-refactor` 分支做多个显式 path 小提交并逐次推送：

1. design freeze。
2. shared contract / standalone。
3. Prompt。
4. Memory。
5. integration tests / runtime evidence。
6. verification / spec / task review 状态。

混合工作区禁止 `git add -A`。不新建分支，不合并，不创建 PR，除非用户另行要求。

## 7. 最终状态

所有新鲜验收通过并完成文档回写后，将 `task.json.status` 设回 `review`。不标 completed，不 archive。
