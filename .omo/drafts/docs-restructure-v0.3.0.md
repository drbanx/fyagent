# FyAgent v0.3.0 文档体系重构计划

> **Draft state**
> - intent: clear
> - review_required: false
> - status: superseded → 见 .omo/plans/docs-restructure-v0.3.0.md（v4 视觉资产规划增强版）
> - slug: docs-restructure-v0.3.0

## TL;DR (For humans)

将 FyAgent 仓库从 CC Switch 继承的文档体系，以 FyAgent v0.3.0 中国版身份完全重构。核心动作：
1. 移除德语 README
2. 根目录 session-manager.md 归位到设计文档目录
3. 用户手册全部链接、版本号、产品名从 CC Switch → FyAgent
4. README 瘦身（架构/开发指南移至 docs/fyagent/）
5. 用户手册新增 3 个中国版特有章节（Agent 工具管理、WorkBuddy、Skills 扩展）
6. 截图人物卡创建

不做：v3.16→v3.19 海外功能搬运、Grok Build 深度文档、AgentsPanel（未实现）。

## Scope

### In scope
- `README_DE.md` — 删除
- `session-manager.md` — 移至 `docs/fyagent/dev/`
- `docs/user-manual/README.md` — 版本号/链接更新
- `docs/user-manual/zh/README.md` — 版本号/链接更新 + 手册结构更新
- `docs/user-manual/en/README.md` — 同上
- `docs/user-manual/ja/README.md` — 同上
- `docs/user-manual/{zh,en,ja}/` 全部 22×3=66 个章节文件 — CC Switch → FyAgent 产品名/链接替换
- `docs/user-manual/{zh,en,ja}/` — 新增章节：
  - `2-agent-tools/` (2.1 安装 CLI 工具, 2.2 升级与诊断)
  - `3-extensions/3.5-workbuddy.md` (WorkBuddy 模型配置注入)
  - 扩展 `3-extensions/3.3-skills.md` (补充安装/卸载/更新/备份细节)
- `README.md` — 架构总览/开发指南/项目结构 section 移至 `docs/fyagent/development/`
- `README_ZH.md` — 同上
- `README_JA.md` — 同上
- `docs/release-notes/README.md` — 新建，说明版本体系
- `docs/user-manual/assets/` — 截图人物卡文档 + 新截图（FyAgent 中文界面）
- 原 `2-providers/2.6-claude-desktop.md` — 合并入供应商管理统编章节
- 所有 `cc-switch` 链接 → `fyagent`

### Out of scope
- Grok Build 深度章节（保留提及但不展开）
- AgentsPanel 文档（代码未实现）
- v3.16→v3.19 CC Switch 海外功能
- 德语用户手册
- `.trellis/` 内部文档
- `.agents/skills/` Skill 文件
- `.github/` 模板和工作流

## Must-NOT-Have

- 不得删除 v3.x 历史 release notes（保留作为上游追溯）
- 不得修改 LICENSE / LICENSING / COMMERCIAL-LICENSE / THIRD_PARTY_NOTICES（许可体系不变）
- 不得修改 CONTRIBUTING.md / CODE_OF_CONDUCT.md / SECURITY.md / SUPPORT.md（治理文档已是 FyAgent 身份）
- 不得删除任何用户手册章节（仅重组和新增，不删减）
- 不得触碰 src/ 或 src-tauri/ 产品代码

## Intent & Routing

- intent: clear — 用户已明确所有方向性决策
- review_required: false — 用户自行组织外部评审
- classification: Standard（1-5 个目录，清晰的重构任务）

## Design

### 文档体系分工

```
README (四语)          用户手册 (三语 en/zh/ja)
├─ 30秒电梯演讲        ├─ 1. 快速入门
├─ 功能亮点            ├─ 2. Agent 工具管理  ← 新增
├─ FAQ                 ├─ 3. 扩展功能
├─ 快速开始            ├─ 4. 代理与高可用
├─ 下载安装            └─ 5. 常见问题
└─ 贡献入口 →
                       docs/fyagent/development/
                       ├─ 架构总览 (从 README 移入)
                       ├─ 开发指南 (从 README 移入)
                       ├─ 项目结构 (从 README 移入)
                       ├─ mise-tasks.md
                       └─ session-manager.md (从根目录移入)
```

### 用户手册结构调整

原 5 章 22 节 → 新 5 章 24 节（+2 新增，Claude Desktop 并入供应商管理）：

```
原结构                          新结构
1-getting-started (5节)    →   1-getting-started (5节)  [重写/更新截图]
2-providers (6节)          →   2-agent-tools (3节)      [新增 2.1/2.2, 原2.x合并为2.3]
3-extensions (5节)         →   3-extensions (5节)       [3.3扩展, 3.5新增WorkBuddy]
4-proxy (5节)              →   4-proxy (5节)            [更新截图/链接]
5-faq (4节)                →   5-faq (4节)             [更新链接]
```

### 截图人物卡格式

每张需要的截图产出一个人物卡 Markdown 文件 `docs/user-manual/assets/shot-cards/`:

```markdown
## 📸 截图人物卡 #N
- **章节**: 1.3 界面概览
- **文件名**: main-overview-zh.png
- **语言**: 简体中文
- **界面状态**: 首次启动后主界面，至少2个供应商
- **分辨率**: 1280×800
- **主题**: 浅色
```

## Implementation waves

### Wave 1: 硬伤修复（纯文本替换，零风险）
1. 删除 `README_DE.md`
2. 移动 `session-manager.md` → `docs/fyagent/dev/`
3. 用户手册三语 README 版本号/链接批量替换
4. 66 个章节文件 product name 批量替换 (CC Switch → FyAgent)
5. `docs/release-notes/README.md` 新建

### Wave 2: README 瘦身（内容迁移，不丢信息）
6. 从 `README.md` 提取 Architecture/Development/Project Structure sections
7. 创建 `docs/fyagent/development/architecture.md`
8. 创建 `docs/fyagent/development/guide.md`
9. 创建 `docs/fyagent/development/structure.md`
10. 四语 README 移除对应 sections，保留跳转链接
11. 更新 `docs/fyagent/development/` 下 `mise-tasks.md` 引用

### Wave 3: 手册结构重组（新增章节 + 内容整合）
12. 创建 `docs/user-manual/{zh,en,ja}/2-agent-tools/` 目录
13. 编写 2.1-install.md（CLI 工具安装 — 三语）
14. 编写 2.2-update-diagnose.md（升级与诊断 — 三语）
15. 原 `2-providers/` 6 节压缩整合为 2.3-providers.md（三语）
16. 创建 `3-extensions/3.5-workbuddy.md`（三语）
17. 扩展 `3-extensions/3.3-skills.md`（补充安装/卸载/备份细节 — 三语）
18. 更新各语言 README.md 目录结构

### Wave 4: 截图人物卡 + 验证
19. 创建 `docs/user-manual/assets/shot-cards/` 目录
20. 为每个需要更新/新增的截图编写人物卡
21. 运行全量链接检查
22. 验证所有 `cc-switch` 引用已清除

## Dependency matrix

```
Wave 1 ──→ Wave 2 ──→ Wave 3 ──→ Wave 4
  │                      │
  └── 独立于后续 wave    └── 依赖 Wave 1 的链接修正
```

- Wave 1 完全独立，无依赖
- Wave 2 依赖 Wave 1（README 分支在 Wave 1 后应干净）
- Wave 3 依赖 Wave 1（链接/版本号已修正）+ Wave 2（README 已瘦身，职责清晰）
- Wave 4 依赖 Wave 3（章节确定后才能定截图范围）

## Todos

- [ ] 1. 删除 README_DE.md — 移除德语 README — 确认文件不存在于根目录
- [ ] 2. 移动 session-manager.md → docs/fyagent/dev/session-manager.md — 设计文档归位 — 确认旧路径无残留，新路径文件存在
- [ ] 3. docs/user-manual/README.md — 更新版本号 v3.16.0→v0.3.0、日期、GitHub 链接 cc-switch→fyagent — grep 确认无 cc-switch 残留
- [ ] 4. docs/user-manual/{zh,en,ja}/README.md — 三语手册索引更新版本号+链接+目录结构 — 三语 grep 确认
- [ ] 5. docs/user-manual/{zh,en,ja}/ 全部 66 个章节 — CC Switch→FyAgent 产品名替换 + 链接替换 — 全量 grep cc-switch 返回零
- [ ] 6. docs/release-notes/README.md — 新建版本体系说明 — 文件存在且内容完整
- [ ] 7. README.md — 提取 Architecture/Development/Project Structure → docs/fyagent/development/ — 三个新文件存在，README 中对应 sections 已移除
- [ ] 8. README_ZH.md — 同上瘦身 — 确认
- [ ] 9. README_JA.md — 同上瘦身 — 确认
- [ ] 10. docs/fyagent/development/ 下创建架构/开发指南/项目结构三文件 — 内容完整，从 README 无损迁移
- [ ] 11. 创建 docs/user-manual/{zh,en,ja}/2-agent-tools/2.1-install.md — CLI 工具安装章节 — 三语文件存在，内容覆盖 AboutSection 中的 install 流程
- [ ] 12. 创建 docs/user-manual/{zh,en,ja}/2-agent-tools/2.2-update-diagnose.md — 升级与诊断章节 — 三语文件存在，内容覆盖版本探测、更新检测、冲突诊断
- [ ] 13. 整合原 2-providers/ 为 docs/user-manual/{zh,en,ja}/2-agent-tools/2.3-providers.md — 供应商管理统编 — 内容不丢失，Claude Desktop 专节融入
- [ ] 14. 创建 docs/user-manual/{zh,en,ja}/3-extensions/3.5-workbuddy.md — WorkBuddy 模型配置注入 — 三语文件存在，覆盖连接/获取模型/写入配置/错误处理
- [ ] 15. 扩展 docs/user-manual/{zh,en,ja}/3-extensions/3.3-skills.md — 补充安装/卸载/备份/更新检测细节 — 内容完整
- [ ] 16. 更新三语手册 README.md 目录结构 — 反映新增/移动章节 — 目录与实际文件一致
- [ ] 17. 创建 docs/user-manual/assets/shot-cards/ — 截图人物卡目录 + 卡片文件 — 每个需要截图的位置有对应人物卡
- [ ] 18. 全量验证 — grep cc-switch 全仓库零残留 + 链接有效性 — grep 返回空，关键链接可访问

## Acceptance

1. `grep -r "cc-switch" docs/user-manual/` 返回空（除 release-notes 历史文件外）
2. `grep -r "cc-switch" README*.md` 返回空
3. `grep -r "v3.16.0" docs/user-manual/` 返回空
4. `README_DE.md` 文件不存在
5. `session-manager.md` 不存在于根目录，存在于 `docs/fyagent/dev/`
6. `docs/release-notes/README.md` 存在
7. 所有三语用户手册索引 README 中目录结构与实际文件一致
8. `docs/fyagent/development/architecture.md`, `guide.md`, `structure.md` 三文件存在且内容完整
9. 新增章节（2.1, 2.2, 2.3, 3.5）三语文件均存在
10. 截图人物卡目录存在，卡面覆盖所有待截图位置

## QA

| 验证项 | 方法 | 证据 |
|--------|------|------|
| CC Switch 引用清除 | `grep -r "cc-switch" --include="*.md" docs/ README*.md CONTRIBUTING.md` | 输出为空 |
| 版本号更新 | `grep -r "v3.16.0" docs/user-manual/` | 输出为空 |
| 文件移动完整性 | `ls docs/fyagent/dev/session-manager.md && ! ls session-manager.md` | 新旧路径正确 |
| 链接有效性 | 抽查关键页面链接 200 | HTTP 200 |
| 目录一致性 | 各语言 README 目录 vs 实际文件列表 diff | diff 为空 |

## Risks / Rollback

- **风险**: 批量替换可能误伤 CHANGELOG 中合法的 "cc-switch" 历史引用 → 缓解：CHANGELOG 不在替换范围内，release-notes 历史文件保留原样
- **风险**: README 瘦身可能丢失信息 → 缓解：逐 section 迁移，迁移后 diff 确认内容完整
- **回退**: 全部操作为文件移动/编辑，git revert 即可完整回退任意 wave

## Final verification wave

- [ ] F1. 全仓库 `cc-switch` + `v3.16.0` 残留检查
- [ ] F2. 三语手册目录 vs 文件系统一致性检查
- [ ] F3. README 四语瘦身后内容完整性 diff
- [ ] F4. 新增章节内容覆盖度检查（对照 AboutSection / WorkBuddyPage / skill.rs 源码）
