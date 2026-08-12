# V2 Phase 1 Shell Contract

## 1. Scope / Trigger

Read this contract before changing `src/v2/**`, the V2-only test/configuration
files, or the renderer entry that selects `src/v2/main.tsx`. It is a narrow
Phase 1 exception to the legacy renderer conventions: the existing frontend
specs remain authoritative for every path outside the V2 boundary.

Production V2 code uses this structure:

```text
src/v2/
|- app/                  # composition root, router, errors, and styles
|- pages/<route>/        # one folder for each first-level route
|- widgets/app-shell/    # visible shell composition
|- shared/               # config, assets, UI, design system, and platform ports
`- dev/                  # development-only UI Lab
```

Do not create empty `entities`, `features`, store, or service layers in Phase 1.
The approved Skills and MCP exception follows the dedicated
[V2 Skills and MCP Feature Contract](./v2-skills-mcp.md).

## 2. Signatures

Navigation and native-window behavior use these exact internal contracts:

```ts
export type NavigationItem = {
  id: "agents" | "models" | "skills" | "mcp" | "prompts" | "memory";
  path: "/agents" | "/models" | "/skills" | "/mcp" | "/prompts" | "/memory";
  label: string;
};

export interface WindowFramePort {
  isNative: boolean;
  platform: "browser" | "windows" | "macos" | "linux" | "unknown";
  prepareFrame(): Promise<void>;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
}
```

The lifecycle-ready operation returns `Promise<void>` and owns a module-level
promise/state guard. Its native side effect is the existing payload-free
`frontend-deeplink-ready` event.

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
  Agents, Models, Prompts, and Memory remain empty Phase 1 pages. Skills and
  MCP may render their approved command-backed internal management UI.
- Register the UI Lab only when `import.meta.env.DEV` is true. Production must
  not expose `#/__dev/ui-lab`.

### Styling and text

- V2 is light-only and owns its globals, motion, primitives, and semantic CSS
  custom properties. Every V2 semantic token starts with `--fy-`.
- Do not import legacy `src/index.css`, dark-theme tokens, UI wrappers, or
  `src/i18n/**`. Shell labels and approved Skills/MCP product copy use fixed
  Simplified Chinese literals; multilingual stress strings belong only in the
  UI Lab.
- Namespace V2 selectors. Do not add blanket positioning, globally hide
  scrollbars, use `transition: all`, animate layout/backdrop blur, or ignore
  `prefers-reduced-motion`.

### Layer and platform boundaries

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
`@tauri-apps/**` directly. All direct Tauri imports live below
`src/v2/shared/platform/tauri/**`; consumers depend on `WindowFramePort` or a
V2 platform factory.

Browser window methods resolve safely without side effects while the preview
still renders Windows controls. The Windows adapter prepares the frame with
`setDecorations(false)` and delegates minimize, toggle-maximize, and close to
the current Tauri window. Dragging is enabled only on explicit empty header
regions, never on navigation or controls.

The ready lifecycle emits at most once per renderer lifetime, including under
React StrictMode or repeated calls, and is a browser no-op. It preserves only
the minimum host activation handshake: Phase 1 does not restore legacy
deep-link consumption, database recovery UI, models synchronization, or the
complete startup contract, so this renderer is not Release-ready.

## 4. Validation & Error Matrix

| Condition                                      | Required result                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| Empty hash, root route, or unknown route       | Redirect to `#/models`; Models link alone has `aria-current="page"`     |
| Browser calls any `WindowFramePort` method     | Resolve without throwing and without a native side effect               |
| React StrictMode or callers repeat ready       | One native `frontend-deeplink-ready` emission for the renderer lifetime |
| Production requests the UI Lab path            | Route is absent and the wildcard fallback selects `#/models`            |
| V2 imports a legacy module                     | ESLint and the executable architecture test fail                        |
| Non-Tauri-boundary code imports `@tauri-apps/` | ESLint and the executable architecture test fail                        |
| An unrelated Phase 1 page renders business copy | Shell/content test fails                                               |
| A supported viewport overflows or overlaps     | Playwright geometry gate fails                                          |

## 5. Good / Base / Bad Cases

- **Good:** Clicking `Agent 目录` changes the hash to `#/agents`; that link is
  the only selected link and the content viewport remains empty. Skills and
  MCP render only their matching management UI.
- **Base:** Opening the renderer without a route lands on `#/models`, with all
  six links, three tools, and three Windows controls visible and focusable.
- **Bad:** A widget imports Tauri directly, a component stores `currentView`, a
  V2 stylesheet consumes legacy theme variables, or an effect emits ready on
  every mount. Each violates a static or behavioral gate.

## 6. Tests Required

Run the V2-specific project tasks:

```bash
mise run lint:v2
mise run typecheck:v2
mise run test:v2
mise run test:v2:browser
mise run build:renderer
```

- Unit tests assert default/wildcard redirects, reachability and order of all
  six routes, router-owned selected state, `aria-current`, primary tab order,
  stable accessible names, focusability, inert tool/browser-window clicks, and
  that only the four unrelated Phase 1 pages remain empty.
- Platform tests assert browser no-ops, Windows decoration/action delegation,
  and one ready emission under repeated calls and StrictMode.
- Architecture tests parse V2 imports and reject legacy dependencies, upward
  layer imports, and direct Tauri imports outside `shared/platform/tauri`.
- Playwright runs at `900x600`, `1152x640`, `1232x700`, and `1440x900`. At each
  viewport assert no document/top-bar horizontal overflow; no Brand/Nav/Tools/
  WindowControls overlap; all primary controls visible; a non-zero, empty
  content viewport; hash/selected/ARIA agreement; complete keyboard access;
  and no relevant console, page, or framework-overlay error.
- UI Lab browser tests cover Tooltip, Popover/Portal, focus ring, long Chinese/
  English/Japanese labels, icon treatment, and glass fallback without overflow.
- The production renderer build must succeed with the UI Lab route omitted.

Real Windows Tauri/WebView2 behavior at the current host scale remains a
separate native acceptance gate. Native 125% and 150% display scaling remain
human acceptance and must not be represented by browser emulation alone.

## 7. Wrong vs Correct

Wrong: let a shell component own both routing and native implementation details.

```tsx
const [currentView, setCurrentView] = useState("models");
import { getCurrentWindow } from "@tauri-apps/api/window";
```

Correct: route links derive selection from the router, and shell code receives
the V2 platform port.

```tsx
<NavLink to={item.path}>{item.label}</NavLink>;

async function minimizeWindow(frame: WindowFramePort) {
  await frame.minimize();
}
```
