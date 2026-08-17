# Design

## Boundaries

只改 V2 renderer、对应 Vitest，以及 V2 shell 契约中与选中透镜相关的段落。不改 Tauri、遗留 `src/components/**`、依赖版本。

```text
shared/ui/SelectionLens.tsx     # 唯一 framer-motion 适配器
  |- SelectionLensGroup(id)     # LayoutGroup + layoutId context
  |- SelectionLens(active)      # 仅 active 时渲染 layoutId pill
  `- SelectionLensTrack         # 可选 DOM 包裹，避免各页手写 Group

接入：
  PrimaryNav                    # 六菜单
  CatalogList / CatalogListItem # Agent / 模型侧栏
  feature tabs / list items     # Skills, MCP, Prompts, Memory
  UiLabPage tabs
```

## Motion

与源项目相同：条件渲染 + 共享 `layoutId`。不测 `offsetWidth`，不用 CSS `left/width` 过渡。

- 默认弹簧：`{ type: "spring", stiffness: 520, damping: 42, mass: 0.62 }`
- `useReducedMotion()` 为真时改为 `{ duration: 0 }`
- `layoutId` 取自最近的 `SelectionLensGroup` id，避免跨轨串动画
- 新点击会让同一共享元素改目标，这就是可打断

`framer-motion` 只允许从 `SelectionLens.tsx` 导入，对标 `LiquidGlassLens` 对 `@samasante/liquid-glass` 的边界。

## Material

源项目：`bg-(--surface-muted) shadow-(--shadow-control) rounded-(--radius-control)`。

映射到 V2 L3 interactive glass，不引入灰色不透明底：

- 填充：`--fy-glass-interactive` + 现有透镜渐变
- 边：`--fy-border-strong`
- 内高光：`--fy-highlight`
- 外阴影：`--fy-shadow-control`
- 模糊：`blur(16px) saturate(1.3)`（CSS backdrop，不是 SVG filter）
- 圆角：继承宿主；顶栏胶囊额外 `inset: 1px; border-radius: 18px`，对齐现有 36px 透镜

选中宿主去掉自己的 `background` / 选中描边 / 选中阴影，只保留文字色，避免滑块还在路上时新项先亮。

## LiquidGlassLens

契约不变：生产实例最多一个，且只在激活 `NavLink` 内。它不再提供滑动填充；导航里的 `.fy-liquid-glass-lens` 去掉与滑块重复的底、边、阴影、backdrop，只留几何给折射。UI Lab 标本仍用完整透镜外观。

禁止把 `Glass` 放到 `layoutId` 节点上。

## Integration

每个互斥选项组一个 `SelectionLensGroup`。选项按钮 `position: relative`，滑块 `absolute inset-0`，其余子元素 `relative; z-index: 1`。tabs 的文本包一层 span，避免文本节点被滑块盖住。

不把 Switch、Checkbox、`<select>`、分页当成选项轨。
