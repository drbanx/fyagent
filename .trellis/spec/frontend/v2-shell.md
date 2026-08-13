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
Native title bars, caption buttons, and dragging are system/Tauri chrome and
must not be reimplemented in the React tree.
The approved Skills and MCP exception follows the dedicated
[V2 Skills and MCP Feature Contract](./v2-skills-mcp.md).
Agent directory and model quick setup follow the dedicated
[V2 Agent and Models Contract](./v2-agent-models.md).

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
  remain bounded local-only prototypes and must not claim native persistence or
  backend synchronization.
- Register the UI Lab only when `import.meta.env.DEV` is true. Production must
  not expose `#/__dev/ui-lab`.
- React keyboard order is the six navigation links followed by Search,
  Settings, and Avatar. Native caption controls are outside the renderer and
  outside this tab-order contract.

### System-owned native chrome

- The React top bar has exactly three web regions: Brand, Primary Navigation,
  and Tools. It contains no minimize, maximize, close, traffic-light, or
  title-bar drag-region DOM.
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
- Keep the top bar near 68px, brand mark 28px, brand text 19px, navigation
  track 46px, and navigation/tool targets 38px. At 900px, reduce CSS gaps and
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
| Custom controls/drag region/frame port appears                         | Unit, architecture, or browser negative assertion fails                            |
| V2 calls `setDecorations(false)`                                       | Static contract search and V2 tests fail                                           |
| V2 imports legacy/upward code, or Tauri outside the platform boundary  | ESLint and executable architecture test fail                                       |
| A route's rendered state disagrees with its dedicated feature contract | Shell/content test fails                                                           |
| Prompts or Memory becomes empty after integration                      | Final task acceptance fails; validate the resolved tree rather than merge messages |
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
  buttons/traffic lights, stretches one SVG lens across a wide bar, mounts a
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
  chrome/drag regions, six non-empty product pages, and idempotent ready behavior.
- Architecture/static tests reject legacy dependencies, upward layer imports,
  direct Tauri imports outside `shared/platform/tauri`, and the retired
  window-frame contract.
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
