# 子任务拆分（全部按 Sol 快速模型执行）

> 说明：本地暂不直接起多模型执行，作为下发模板给外部子任务人/子会话使用。每项任务在你确认后可并行开三路。

## 统一交付约束
- 模型：`Sol`（快速）  
- 每项完成后必须产出：说明文档 + 代码改动 + 最小验收清单 + 一个独立提交。
- 完成顺序：`#25` → `#26` → `#27` → `#28`，其中 `#28` 依赖前三项的状态字段。

## 任务 1：#25 官方来源与许可来源链路（Model: Sol）
- 负责人级：后端合同负责人
- 目标：
  - 输出 source_metadata v1 字段字典（含 distribution_allowed、license_scope、origin_url、host_chain）
  - 提供 unknown 策略
- 交付：
  1. `src-tauri` 后端 DTO 和 mapper
  2. 文档：字段字典与可视化文案
  3. 单测：官方来源缺失场景
- 评估指标：
  - `source_state=unknown` 时前端不出现“可安装”
- 预期提交：`feat(#25): add source metadata contract`

## 任务 2：#26 完整性证据层（Model: Sol）
- 负责人级：后端安全职责
- 目标：
  - 将 hash、签名、撤回状态结构化输出
  - 明确 `unknown` 映射规则
- 交付：
  1. `package_integrity` 字段与状态码枚举
  2. 证据来源、时间戳、签名者链路输出
  3. 单测：revocation unknown / revoked / valid
- 评估指标：
  - 三项任一缺失不再自动 pass
- 预期提交：`feat(#26): add integrity evidence contract`

## 任务 3：#27 预检事实与 unknown（Model: Sol）
- 负责人级：前后端联调
- 目标：
  - 完成 preflight 结果码标准化为 pass/fail/warn/unknown
  - 加入重试与人工修复路径
- 交付：
  1. preflight code schema
  2. 环境事实采集字段（OS/arch/space/network/perm）
  3. 单测：unknown 到 fail/warn 的映射
- 评估指标：
  - 不出现“unknown 当 pass”的回显
- 预期提交：`feat(#27): normalize preflight states`

## 任务 4：#28 安装计划不可静默变化（Model: Sol）
- 负责人级：执行链路负责人
- 目标：
  - 引入 `plan_snapshot_id/snapshot_stale/diff_reason`
  - 前端强制重确认
- 交付：
  1. plan hash + 重建 endpoint
  2. 安装流程中的 snapshot recheck（防重放）
  3. UI：灰度阻断样式与重确认按钮
- 评估指标：
  - 关键字段变更自动触发 snapshot stale
- 预期提交：`feat(#28): install snapshot and non-silent-change`

## 合并前检查（所有子任务都要）
- stale-reference 清单是否完成（#35/#41/#49/#50/#51）
- 四层状态图中是否存在 `unknown` 绿化缺陷
- 文案是否避免“默认可信/已验证”虚假承诺

## 交付节奏建议
- 每完成一项，先发起一次 review（不改主流程），再推进下一项。
- 所有改动提交后同步到 GitHub 评论 + 飞书任务同步清单（后续你可直接发布）。
