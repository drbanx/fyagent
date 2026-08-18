# 后续测试任务

分支：`cursor/prompt-memory-frontend-align-06e7`  
PR：https://github.com/fy-agent/fyagent/pull/111  
合入：`dev/laiyongjie`  
不要在 `dev/laiyongjie` 上直接改，也不要再 merge `dev/xk`。

```powershell
git fetch origin cursor/prompt-memory-frontend-align-06e7
git checkout cursor/prompt-memory-frontend-align-06e7
git pull origin cursor/prompt-memory-frontend-align-06e7
```

Node 必须是仓库 `.node-version`（当前 24）。不要用 Node 22。

---

## A. 提示词页人工验收（有真实 Agent 提示词的机器）

只测 `#/prompts`。目标：确认「点开就能读正文」，而不是再找分隔条或编辑弹窗。

1. 左轨七个应用都在：Claude、Codex、Gemini、Grok Build、OpenCode、OpenClaw、Hermes。Claude 默认选中。
2. 每个应用轨副文案是「N 条已启用」，不是「提示词库」。切到有启用项的应用，数字要变。
3. 点开一条提示词：中间栏立刻出现可编辑正文。不要出现「编辑」Dialog。不要先看到一长串 ID/时间定义列表。
4. 常见窗口（大约 1152×640 或本机习惯大小）下，**不拉分隔条**也能看到正文。名称/描述在正文下面。
5. 「当前使用的内容」默认折叠。展开后只读，改它不能当第二份可写正文。
6. 「新建提示词」打开空草稿，保存后不自动启用。
7. 「从文件导入」仍可用，是次动作。
8. 启用开关和列表选中互不替代。一应用只能一条启用。已启用项不能直接删，先停用。
9. 未保存时切应用 / 切条目 / 切到记忆页，必须出现放弃确认，不能 `window.confirm`。
10. 搜索「能命中另一条、但藏住当前选中」时，左边列表过滤，**右边编辑器仍是原来那条**。这是本轮修过的回归。
11. 浏览器预览打开提示词页应是 native-only 空态，不要出现演示数据。

不过：不要测提示词市场、跨应用同步、Claude Desktop。这些不在合同里。

---

## B. Windows 电脑：官方门禁 + 桌面验收

这台机器要跑完整 `mise run check`。Linux 云环境会在 `host-native.mjs guard` 被 `linux/x64` 拦住，不能替代 Windows。

### B1. 环境

1. 安装并信任仓库 mise。`mise --version` ≥ 2026.8.6。
2. `node -v` 对齐 `.node-version`。`pnpm -v` 对齐 `package.json#packageManager`。
3. 能编 Tauri / WebView2 的常规 Windows 桌面依赖保持原样。

### B2. 官方 check（必须）

在仓库根目录：

```powershell
mise run check
```

这一条失败就停，先看是宿主合同、Rust、还是前端。不要用 `pnpm test:unit` 的 Linux 失败去改平台合同。

若 check 过了，再补 V2 聚焦门禁（check 里不一定含全部 V2 browser）：

```powershell
mise run lint:v2
mise run typecheck:v2
mise run test:v2
mise run test:v2:browser
mise run build:renderer
```

### B3. 桌面里看三页

用本机编出来的 FyAgent，不要只看浏览器预览。

**提示词 `#/prompts`**

- 按 A 节 1–10 走一遍。
- 125% / 150% 缩放：正文仍在，主按钮仍在，不要横向滚动。

**记忆 `#/memory`**

- 页头只承诺：长期 = OpenClaw + Hermes；每日 = 只有 OpenClaw。
- 长期左轨按 OpenClaw / Hermes 分组，四个固定文件。不要再出现「长期记忆 · 4」。
- 点开直接看正文。没有「记忆信息 / 使用说明」第三栏。
- Hermes 开关和字符上限在编辑头。超限仍可保存。
- OpenClaw 未创建文件：保存才创建。
- 「打开 OpenClaw 工作区」和每日「打开记忆目录」走本机目录，不走浏览器。
- 每日搜索在工作区顶部；列表 + 编辑两栏。

**Skills 发现 `#/skills` → 发现**

- 搜索在第一行。安装目标在页头，不要用 `<select>`。
- 卡片是网格，不是左右详情。
- 卡片能看到：名称、已安装、说明或「来自 owner/repo」、`owner/repo · N 次安装`、`安装到 …`。
- README 链接叫「说明」，纯仓库链接叫「仓库」。点它们走系统浏览器。
- 900×600 或窗口缩到很窄：安装目标可以只剩图标，但仍可用；卡片区仍是主体。
- 结果行要写「将安装到 {当前应用}」。

### B4. 系统回归（确认没伤到别的）

这些页这次只是共用了少量 `.fy-feature-*` CSS，不应改行为：

- Agents / Models 目录几何、外链、Provider / WorkBuddy。
- Skills 已安装三栏、分配开关、卸载。
- MCP 已安装 / 发现、密钥不进普通 UI。
- 顶栏、默认 `#/models`、keep-alive。

Windows 特有：最大化后窗口不要跳、125%/150% 不要把分栏内容画出 pane。这是宿主 + 渲染器一起看的，Linux Playwright 替不了。

### B5. 回报格式

请按页写「过 / 不过 + 窗口尺寸 + 缩放 + 一句现象」。有失败就带：

- 路由（`#/prompts` / `#/memory` / `#/skills`）
- 操作序列
- 期望 vs 实际
- `mise run check` 的失败任务名
