# V2 Shell Contract

## 1. Scope / Trigger

Read this contract before changing `src/v2/**`, the V2-only test/configuration
files, or the renderer entry that selects `src/v2/main.tsx`. It is a narrow V2
exception to the legacy renderer conventions: the existing frontend
specs remain authoritative for every path outside the V2 boundary.

Production V2 code uses this structure:

```text
src/v2/
|- app/                  # composition root, router, errors, and styles
|- pages/<route>/        # one folder for each first-level route
|- widgets/app-shell/    # visible web-shell composition
|- shared/               # config, assets, UI, design system, and platform ports
`- dev/                  # development-only UI Lab
```

Do not create empty `entities`, `features`, store, or service layers speculatively.
Native title bars, caption buttons, and dragging stay system/Tauri chrome.
React may add only the inert native-macOS Overlay drag strip required for
window move and double-click zoom; it must not reimplement caption buttons.
The approved Skills and MCP exception follows the dedicated
[V2 Skills and MCP Feature Contract](./v2-skills-mcp.md).
Agent directory and model quick setup follow the dedicated
[V2 Agent and Models Contract](./v2-agent-models.md).
Prompt and Memory native business integration follows the dedicated
[V2 Prompts and Memory Native Business Contract](./v2-prompts-memory.md).
The Codex detail may additionally consume the narrow renderer-neutral
`src/shared/codex-desktop/**` contract described by
[Codex Desktop Installer](../backend/codex-desktop-installer.md); this is not a
general legacy-import exception.

## 2. Signatures

Navigation uses this exact internal contract:

```ts
export type NavigationItem = {
  id: "agents" | "models" | "skills" | "mcp" | "prompts" | "memory";
  path: "/agents" | "/models" | "/skills" | "/mcp" | "/prompts" | "/memory";
  label: string;
};
```

The selected-lens adapter is V2-internal and does not expose the dependency's
props or types:

```ts
interface LiquidGlassLensProps {
  children: ReactNode;
  className?: string;
}
```

It wraps `@samasante/liquid-glass@0.1.1` with balanced optics plus
`dispersion: 0`, `live={false}`, and `filterResolution={1}`. The lifecycle-ready
operation returns `Promise<void>` and owns a module-level promise guard. Its
native side effect remains the existing payload-free `frontend-deeplink-ready`
event.

There is deliberately no `WindowFramePort` or React/native caption-action
signature in V2. Adding one requires a new reviewed task and native-window
contract, not an ad hoc shell prop.

The Overlay drag strip is gated only by this helper. Pass an injected runtime
in tests; production calls `detectRuntime()`:

```ts
export function shouldShowMacOverlayDragStrip(
  runtime: RuntimeEnvironment = detectRuntime(),
): boolean {
  return runtime.isNative && runtime.platform === "macos";
}
```

Do not derive this from `navigator.userAgent` alone. Playwright on a Mac host
would otherwise render the strip in browser tests.

## 3. Contracts

### Navigation and content

The navigation source contains exactly these entries in this order:

| ID        | Path       | Label        |
| --------- | ---------- | ------------ |
| `agents`  | `/agents`  | `Agent 目录` |
| `models`  | `/models`  | `模型`       |
| `skills`  | `/skills`  | `Skills`     |
| `mcp`     | `/mcp`     | `MCP`        |
| `prompts` | `/prompts` | `提示词`     |
| `memory`  | `/memory`  | `记忆`       |

- Use a hash data router. The index route and every unknown route redirect to
  `/models`; the stable default URL is `#/models`.
- Derive selected state only from router location. The active link has
  `aria-current="page"`; do not maintain a second `currentView` state.
- Put each production page element below its matching `pages/<route>/` folder.
  All six routes render their approved business surfaces. Prompts and Memory
  use bounded native feature ports and must not widen the existing command,
  filesystem, or synchronization scope. Browser preview reports these features
  as native-only and never seeds business data.
- Register the UI Lab only when `import.meta.env.DEV` is true. Production must
  not expose `#/__dev/ui-lab`.
- React keyboard order is the six navigation links followed by Search,
  Settings, and Avatar. Native caption controls are outside the renderer and
  outside this tab-order contract.

### System-owned native chrome

- The React top bar has exactly three web regions in its chrome row: Brand,
  Primary Navigation, and Tools. It contains no minimize, maximize, close, or
  traffic-light controls.
- Native macOS Overlay may render one inert 28px `data-tauri-drag-region`
  strip above the chrome row. Browser preview, Windows, and tests without a
  native macOS runtime must not render that strip.
- Gate that strip with `shouldShowMacOverlayDragStrip()`. The left
  `--fy-titlebar-traffic-light-width` (78px) spacer uses `pointer-events:
  none` so traffic lights stay clickable; only the remaining surface is the
  drag region. Brand, nav, and tools sit in the 68px chrome row below the
  strip (`--fy-titlebar-drag-height` + `--fy-top-bar-height` = 96px).
- Windows Visible chrome keeps the 68px row and no drag strip. Reports that
  maximize sends UI off-screen are host geometry; follow
  [Main Window Layout](../backend/main-window-layout.md) instead of shrinking
  React layout.
- V2 must not call `setDecorations(false)` or otherwise disable system
  decorations at runtime. Browser preview correctly renders no native controls.
- Do not fake system controls for browser screenshots or geometry tests.
- Direct Tauri imports still live only below
  `src/v2/shared/platform/tauri/**`. The outer shell's only native bridge is the
  ready lifecycle event, not a window-frame facade; feature pages use dedicated
  ports below the same platform boundary.
- The ready lifecycle emits at most once per renderer lifetime, including
  React StrictMode or repeated calls, and is a browser no-op.

### Material and dependency boundary

The V2 shell owns one Blue Ambient / Clear Glass appearance:

```text
L0 ambient background      blue-gray gradients and controlled light fields
L1 content plane           route-owned, translucent, and low-boundary
L2 structural glass        primary navigation track
L3 interactive glass       selected lens, tools, tooltip, and popover
```

- Every semantic token starts with `--fy-`. Material-fill opacity increases
  from ambient to structural to interactive. A base edge may match the
  interactive fill's alpha; the emphasized edge and highlight remain stronger.
- Keep near-white foregrounds, restrained blue/cyan highlights, a visible
  glass edge, an inset highlight, and a depth shadow. Do not use an opaque
  white dashboard, selected underline, rainbow/chromatic effects, or fake
  native chrome.
- Use `@samasante/liquid-glass` only behind `LiquidGlassLens`. Mount at most one
  production instance, inside the active `NavLink`; do not stretch it across
  the navigation track, tools, popovers, content plane, or background.
- The `NavLink` owns hit area, focus, accessible name, and `aria-current`.
  Refraction is decorative enhancement. Project CSS must independently express
  tint, selected border/color/shadow, edge/highlight, and backdrop fallback.
- Keep broad structural glass in CSS. SVG filters are not a substitute for
  accessible state and must not be animated across layout or multiplied across
  controls.

### Styling and responsive behavior

- V2 owns its globals, motion, primitives, and semantic tokens. Do not import
  legacy `src/index.css`, dark-theme tokens, UI wrappers, or `src/i18n/**`.
- Namespace V2 selectors. Do not use `transition: all`, animate layout/backdrop
  blur, globally hide scrollbars, or ignore `prefers-reduced-motion`.
- Keep the chrome row near 68px, brand mark 28px, brand text 19px, navigation
  track 46px, and navigation/tool targets 38px. Native macOS Overlay adds a
  28px inert drag strip above that chrome row so the window can be dragged and
  double-clicked. At 900px, reduce CSS gaps and
  padding without hiding any label or tool or using JavaScript viewport state.
- Preserve Radix Tooltip/Popover/Tabs behavior and portals, Phosphor icons,
  React 18, Tailwind 3, and the existing logo.

### Layer boundaries

Dependencies point downward only:

```text
app -> pages, widgets, shared, dev (DEV-only)
pages -> shared
widgets -> shared
shared -> third-party packages or other shared modules
dev -> shared
```

No V2 module may import legacy `src/App.tsx`, `src/main.tsx`,
`src/components/**`, `src/hooks/**`, `src/lib/**`, `src/i18n/**`, or
`src/index.css`. `pages`, `widgets`, and `app` must not import
`@tauri-apps/**` directly.

The sole cross-root shared exception is `@/shared/codex-desktop`. It contains
only installer DTOs, unknown-input parsers, version/state/snapshot/progress
derivations, and safe error projection. It may not import React, Tauri, legacy
renderer modules, i18n, toast, clipboard, or platform adapters. V2 side effects
still flow through `FeaturePorts.codexDesktop`, with Tauri imports confined to
`src/v2/shared/platform/tauri/**`. Architecture tests allow this exact prefix
only and continue rejecting every other `@/shared/**` or legacy import.

The V2 renderer preserves only the minimum host activation handshake. It does
not restore legacy deep-link consumption, database recovery UI, generalized
model synchronization, or the complete startup contract. The bounded
Agent/Models, Skills, and MCP ports do not by themselves make it Release-ready.

## 4. Validation & Error Matrix

| Condition                                                              | Required result                                                                    |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Empty hash, root route, or unknown route                               | Redirect to `#/models`; Models alone has `aria-current="page"`                     |
| Any normal production route                                            | Exactly one active link and one selected lens                                      |
| UI Lab development route                                               | No primary link active; the lab may render one isolated lens specimen              |
| SVG/backdrop filter unavailable                                        | CSS tint, edge, shadow, focus, and selected state remain readable                  |
| React StrictMode or repeated ready calls                               | One native `frontend-deeplink-ready` emission per renderer lifetime                |
| Production requests the UI Lab path                                    | Route is absent and wildcard fallback selects `#/models`                           |
| Custom caption buttons or `setDecorations(false)` appear                | Unit, architecture, or browser negative assertion fails                            |
| A drag region appears outside native macOS Overlay TopBar               | Architecture test fails; browser preview still has no drag strip                   |
| Drag strip is gated on userAgent instead of `detectRuntime()`           | Mac-host Playwright/jsdom can show a false strip; runtime tests must fail          |
| Windows maximize overflow is “fixed” by shrinking V2 chrome             | Wrong layer; host must skip `set_min_size` while maximized                         |
| V2 calls `setDecorations(false)`                                       | Static contract search and V2 tests fail                                           |
| V2 imports legacy/upward code, or Tauri outside the platform boundary  | ESLint and executable architecture test fail                                       |
| V2 imports neutral code outside `@/shared/codex-desktop`               | Architecture test fails; no broader shared-root allowlist                          |
| Neutral Codex shared code imports React, Tauri, platform, or legacy UI | Architecture test fails; move the side effect behind the V2 port                   |
| A route's rendered state disagrees with its dedicated feature contract | Shell/content test fails                                                           |
| Prompts or Memory becomes empty after integration                      | Final task acceptance fails; validate the resolved tree rather than merge messages |
| Browser Prompts/Memory exposes seeded or private records               | Native-only/preview contract test fails                                             |
| A supported viewport overflows or overlaps                             | Playwright geometry gate fails                                                     |

## 5. Good / Base / Bad Cases

- **Good:** Clicking `Agent 目录` changes the hash to `#/agents`; that
  `NavLink` alone owns `aria-current="page"`, contains the sole selected lens,
  remains keyboard-focusable, and the Agent directory renders its approved
  master/detail UI. Models, Skills, MCP, Prompts, and Memory render only their
  approved bounded feature surfaces.
- **Base:** Opening without a route lands on `#/models`, with six links and
  three tools visible. Browser preview has no system or simulated controls.
- **Fallback:** If refraction cannot render, the selected item remains visibly
  distinct through its CSS material, text, border, shadow, and focus ring.
- **Bad:** React disables decorations, stores `currentView`, renders caption
  buttons/traffic lights, spreads drag regions across interactive chrome,
  stretches one SVG lens across a wide bar, mounts a
  lens per tool, or uses an underline/filter as the only selected indicator.

## 6. Tests Required

Run the V2-specific project tasks:

```bash
mise run lint:v2
mise run typecheck:v2
mise run test:v2
mise run test:v2:browser
mise run build:renderer
```

- Unit tests assert default/wildcard redirects, six-route order, Router-owned
  selection, `aria-current`, a sole active lens, the TopBar's nine-stop primary
  tab order, stable accessible names, inert tool clicks, absence of custom
  caption buttons, six non-empty product pages, and idempotent ready behavior.
  Browser/jsdom shells have no drag strip; native macOS Overlay is allowed one
  inert strip above the chrome row.
- Architecture/static tests reject legacy dependencies, upward layer imports,
  direct Tauri imports outside `shared/platform/tauri`, and the retired
  window-frame contract. They positively allow only the exact neutral Codex
  shared boundary and negatively prove that a neighboring shared path remains
  forbidden.
- Vitest may mock the third-party filter surface to isolate router and semantic
  behavior. Playwright must load the real production dependency.
- Playwright runs at `900x600`, `1152x640`, `1232x700`, and `1440x900`. At each
  viewport assert no document/top-bar overflow; no Brand/Nav/Tools overlap;
  all six links and three tools visible; all six product pages non-empty;
  hash/selected/ARIA/lens agreement;
  the TopBar's nine-stop
  keyboard order on the default shell route; absence of fake chrome; and no
  console, page, or framework-overlay error.
- UI Lab browser tests cover translucent surfaces, backdrop or meaningful CSS
  fallback, selected styling without underline, edge/highlight/shadow,
  Tooltip/Popover portal visibility, focus ring, long multilingual stress
  labels, and reduced-motion state independence.
- The production renderer build must omit the UI Lab route and succeed.
- The final post-merge gate asserts all six routes are non-empty and reruns the
  shell, architecture, and four-viewport browser matrix from the resolved tree.
  Pre-merge results remain diagnostic only.
- The root `FyAgent-前端交互预览.html` is a deterministic, generated standalone
  bundle. The supported-platform text scanner may exclude only that exact root
  file's generated body; the filename, `src/v2/**` sources,
  `scripts/build-v2-preview.mjs`, and every nested same-named file remain in
  scope. Acceptance requires a fresh renderer build, a second generation with
  an identical SHA-256, focused tests that freeze this exact-path boundary, and
  normal scanning of all source-visible platform wording. This exception does
  not claim that the final inline bundle receives an independent full-text
  platform scan; changing the generator or source coverage must revisit it.

The full local project gate remains `mise run check`. Real Windows
Tauri/WebView2 chrome, SVG/backdrop performance, current-host 125%/150% display
scaling, and subjective visual similarity remain separate unverified manual
acceptance evidence unless a task explicitly requires them.

## 7. Wrong vs Correct

Wrong: make React own native chrome and selected state while depending directly
on an optical effect.

```tsx
const [currentView, setCurrentView] = useState("models");
await getCurrentWindow().setDecorations(false);
return <button aria-label="Close" onClick={closeWindow} />;
```

Correct: let Router own the semantic link, wrap only its active label with the
bounded internal lens, and keep native window chrome outside React.

```tsx
<NavLink to={item.path}>
  {({ isActive }) =>
    isActive ? <LiquidGlassLens>{item.label}</LiquidGlassLens> : item.label
  }
</NavLink>
```

Wrong: show the Overlay drag strip because the user agent looks like macOS.

```ts
if (/Mac/i.test(navigator.userAgent)) {
  return <div data-tauri-drag-region />;
}
```

Correct: require a native macOS Tauri runtime.

```ts
if (shouldShowMacOverlayDragStrip()) {
  return <div data-testid="titlebar-drag-region">…</div>;
}
```

Wrong: use the neutral-core exception as a route into a legacy Hook.

```ts
import { useCodexDesktopInstaller } from "@/hooks/useCodexDesktopInstaller";
```

Correct: import only pure Codex contracts and place native effects behind the
V2 feature port.

```ts
import { deriveInstallerViewState } from "@/shared/codex-desktop";
const local = await ports.codexDesktop.getLocalStatus();
```
