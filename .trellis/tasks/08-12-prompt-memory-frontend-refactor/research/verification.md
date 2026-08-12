# Prompt / Memory 前端历史验证基线

历史验证时间：2026-08-12

> 本文件当前只保留设计冻结前的历史基线，不能作为本轮完成证据。三条模块单测与完整集成全部重新执行后，将以本轮真实输出替换下表。

## 结果

| 检查 | 历史基线（待重跑） |
| --- | --- |
| `pnpm lint:v2` | 通过，无 lint error |
| `pnpm typecheck:v2` | 通过 |
| `pnpm test:v2` | 10 个文件、40 条测试全部通过 |
| `pnpm test:v2:browser` | 28 条全部通过 |
| `pnpm build:renderer` | Vite 161 modules 构建通过；standalone 生成成功 |
| Trellis context validate | `implement.jsonl` 5 项、`check.jsonl` 4 项，通过 |
| `git diff --check` | 通过 |
| `git diff --name-only -- src-tauri` | 空，后端零改动 |

## 浏览器覆盖

- Chromium：900×600、1152×640、1232×700、1440×900。
- 关键交互：Prompt 多规则启用、真实目标展示；Memory 长期记忆同步任务、会话提炼；路由和键盘顺序。
- 白屏回归：直接打开 `FyAgent-前端交互预览.html`、`src/index.html`、`dist/index.html` 均进入 Prompt 页面，并可切换到 Memory。
- 页面健康：测试监控 console error、page error 和框架错误浮层。

## 视觉证据

- `prompt-cross-agent-1586x992.png`
- `memory-cross-agent-1586x992.png`
- 证据级别：`runtime_screenshot`。
- 未运行自动图片差异，因此不标记为 `pixel_diff`。

## 能力边界

- 页面根节点均为 `data-data-source="prototype"`。
- 保存、扫描和同步反馈均明确为前端/本机扫描预览。
- 没有调用 Prompt/Memory native persistence，没有修改真实 Agent 文件。
- 本机私人正文、凭据和完整会话未进入仓库 prototype 数据。
