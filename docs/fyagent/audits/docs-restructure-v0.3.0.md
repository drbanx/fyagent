---
type: audit
status: blocked
updated: 2026-08-10
review_on: 2026-08-11
authority: .omo/plans/docs-restructure-v0.3.0.md
source: git:b6f60dfe0b4e815fdb9eb3ba446c827dc41e0527
evidence: code_audit
---

# FyAgent 文档重构基线审计

## 现在的结论

本轮文档重构以 `origin/dev/laiyongjie` 的提交
`b6f60dfe0b4e815fdb9eb3ba446c827dc41e0527` 为目标基线。这个选择面向当前项目和
v0.3.1 开发线，不再回到已经落后的 `origin/main` / v0.3.0 文档状态上重复施工。

Gate 0 已完成。官方 portable `mise 2026.8.2` 已下载，安装包 SHA-256 与 winget 清单
`f6c383ecb54876baec7d353c663959ec5866044d19920f68bef6014e7a1c41fd` 一致，也满足仓库
要求的最低版本。当前唯一阻塞是 `mise trust --show` 明确返回 `E:\fyagent: untrusted`。
按照项目的 Trellis 规则，任务本身不能执行 `mise trust`，也不能改用环境变量或零散命令
绕过统一入口。

## 审计方法

- 审计日期：2026-08-10
- 目标提交：`b6f60dfe0b4e815fdb9eb3ba446c827dc41e0527`
- 取样方式：`git archive` 生成目标提交的只读快照
- 对照提交：当前规划分支 `ccde71d1`
- 证据等级：`code_audit`
- 未提供的证据：没有启动目标基线应用，没有拍摄运行时截图，也没有运行 `mise`
  质量门禁

## 目标基线事实

| 项目 | 结果 | 说明 |
|---|---:|---|
| 根 README | 4 份 | `README.md`、`README_ZH.md`、`README_JA.md`、`README_DE.md` |
| 三语手册 Markdown | 78 份 | 中、英、日各 26 份，均包含本语言索引 |
| 手册 PNG | 40 张 | 集中放在共享 assets 目录，不按语言各存一套 |
| 手册图片引用 | 84 处 | 中、英、日各 28 处 |
| 当前开发文档 | 12 份 | 位于 `docs/fyagent/development/` |
| 旧版开发设计包 | 0 份 | `docs/fyagent/dev/` 已在目标基线删除 |
| README 首屏截图 | 6 张 | 中、英、日各 2 张 |
| 已检查的本地链接 | 372 处 | 三份 README、三语手册和当前开发文档，失效链接为 0 |

目标基线已经完成一次“当前状态文档迁移”：旧的版本化设计包被删除，现行开发知识被
整理到 `docs/fyagent/development/`。这部分不能再按旧计划恢复成 9 份固定正文，否则会
重新制造第二套开发事实来源。

## 仍然存在的问题

### 1. 对外入口还不够干净

- `README_DE.md` 仍然存在，三份主 README 仍然链接德语版。
- `scripts/tasks/docs-contract-check.mjs`、`tests/localBuildBoundary.test.ts` 和
  `tests/desktopSecurityBoundary.test.ts` 仍把德语 README 当作活动文档。
- 三份主 README 仍各自保留了大段环境、构建、测试和技术栈内容。当前开发文档入口已经
  存在，所以 README 应保留简短贡献入口，把会变化的开发细节交给规范与开发文档。
- 根目录 `session-manager.md` 仍是一份写着“v1 仅 macOS”的旧 PRD，却没有历史材料标记。

### 2. 用户手册仍按五章组织

每种语言目前有 25 篇正文，目录为：快速入门、供应商管理、扩展功能、代理与高可用、
常见问题。三个索引还带有一长段“当前亮点”，内容会随版本快速过期，也让用户很难先找
到手头要做的事。

六章重组仍有价值，但必须从这 25 篇现行正文出发重新映射。旧计划中把 60 个文件直接
搬家、再新建 9 篇的数字只作历史估算，不能未经重算就执行。

### 3. README 截图仍带旧产品身份

目标提交中的 6 张 README 截图与旧规划分支中的 Git blob 完全相同：

| 文件 | Git blob |
|---|---|
| `assets/screenshots/main-en.png` | `c15d827754553acd0567812cf52e97811e4e834b` |
| `assets/screenshots/add-en.png` | `b48c7029916a9b4a1e887b72c0dbdf2875d039c6` |
| `assets/screenshots/main-zh.png` | `8da4b66f05dc641079e2f0aca9edc1ce5c89fb48` |
| `assets/screenshots/add-zh.png` | `37359c2fedc75ffa0887c4e887090815cf1856e5` |
| `assets/screenshots/main-ja.png` | `52c8686c52c095d901776c607de61f2de57908ff` |
| `assets/screenshots/add-ja.png` | `db7bd8bc8956f1c672cd675321c03ba725a9dd15` |

这些图里的可见应用身份仍是 `CC Switch`。它们不能继续承担 FyAgent 的产品证明。替换图
必须来自真实 FyAgent 运行时；ChatGPT 生图只负责概念主视觉和插图，不能伪造产品界面。

### 4. 发布记录缺少总入口

`docs/release-notes/` 同时保存 FyAgent v0.3.x 与 CC Switch v3.x 历史记录，但没有索引解释
两套版本号的关系。旧名字在历史 Release Notes 和许可证来源说明中是合法证据，不应做
全仓替换。

`docs/guides/` 共 22 个文件。旧名称命中 6 处：3 处是上游 PR #5071 链接，另外 3 处
说明内容基于 CC Switch v3.19.1 上游变化；这些都应保留。`deplink.html` 和
`flatpak/README.md` 没有旧身份命中。

## 旧计划动作的 delta

| 旧动作 | 目标基线结论 | 现在怎么做 |
|---|---|---|
| 删除德语 README | 保留 | 连同三份 README 导航、合同脚本和两个测试清单一起原子修改 |
| 修正 75 篇旧身份 | 改写 | 目标基线已有大批现行内容更新；只审计活动文档和可见截图，不做机械全量替换 |
| 移动 Session Manager PRD | 保留 | 移入历史/归档位置，并在首屏说明它不是当前产品合同 |
| 新建 Release Notes 索引 | 保留 | 解释 FyAgent v0.3.x 与上游 CC Switch v3.x 的关系 |
| 把 README 拆成 9 份开发正文 | 取消原文件方案 | 复用现有 12 份 current-state 文档，只从 README 删除重复细节并提供清楚入口 |
| 删除 `docs/fyagent/dev/` 版本设计包 | 已完成 | 不恢复；以目标基线现有删除结果为准 |
| 三语手册改为六章 | 改写 | 先为现行 25 篇正文制作一次性映射，再移动文件和补缺页 |
| 60 个文件 rename | 重算后保留 | 目标基线仍是每种语言 20 个旧目录文件，共 60 个；移动和正文修改分开验证 |
| 全部截图审计与 shot card | 保留 | 先完成 6 张 README P0 proof frame，再处理手册截图 |
| VibeKey 对照与概念样例 | 保留已有成果 | 迁入目标分支；v1 继续标为 superseded，v2 继续标为 concept_candidate |
| 批量生成营销图 | 不纳入本轮 | 本轮先完成资产矩阵、提示词卡和 1 张样例，正式批量生产另立任务 |

## 重新收口后的执行顺序

1. 开发者在本机安装并信任符合 `mise.toml` 要求的 `mise >= 2026.8.0`。
2. 从目标提交创建新的工作分支，迁入本计划、VibeKey 审计和两版概念样例。
3. 运行 `mise run bootstrap` 与 `mise run trellis:context -- --mode packages`，读取目标分支
   的当前规范。
4. 先处理德语 README、合同脚本和测试清单的闭包，并立即跑目标检查。
5. 瘦身三份 README；内容用自然语言说明产品能帮人完成什么，开发细节只保留入口。
6. 重组三语手册和发布记录入口，补齐链接检查与旧身份白名单。
7. 启动真实 FyAgent，按 shot card 重拍 6 张 README 截图。证据等级达到
   `runtime_screenshot` 后才替换旧图。
8. 整理视觉资产矩阵、四类提示词卡和 v2 安全区预览；概念图与真实截图配对评审。
9. 运行目标测试、合同检查、完整 `mise run check` 和 `git diff --check`。

## 当前阻塞如何解除

需要开发者在这个 Windows 环境中完成两件事：

1. 在任务之外信任 `E:\fyagent\mise.toml`。
2. 若希望以后直接输入 `mise`，再按官方 Windows 安装方式将它加入环境；这不影响本轮已
   校验的 portable 版本继续执行。

完成后，本任务从 Preflight 继续，不需要重新讨论目标基线。
