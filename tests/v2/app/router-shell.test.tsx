import type { CSSProperties, ReactNode } from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import type { RouteObject } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { appRoutes } from "@/v2/app/router";

vi.mock("@samasante/liquid-glass", () => ({
  Glass: ({
    children,
    className,
    style,
    "data-testid": testId,
  }: {
    children?: ReactNode;
    className?: string;
    style?: CSSProperties;
    "data-testid"?: string;
  }) => (
    <span className={className} style={style} data-testid={testId}>
      {children}
    </span>
  ),
}));

const navigationContract = [
  { path: "/agents", label: "Agent 目录" },
  { path: "/models", label: "模型" },
  { path: "/skills", label: "Skills" },
  { path: "/mcp", label: "MCP" },
  { path: "/prompts", label: "提示词" },
  { path: "/memory", label: "记忆" },
] as const;

const toolNames = ["Search", "Settings", "Avatar"] as const;
const windowControlNames = ["最小化", "最大化/还原", "关闭"] as const;

type TestRouter = ReturnType<typeof createMemoryRouter>;

function renderRoute(initialEntry: string): TestRouter {
  const router = createMemoryRouter(appRoutes, {
    initialEntries: [initialEntry],
  });

  render(<RouterProvider router={router} />);
  return router;
}

async function expectPath(router: TestRouter, pathname: string): Promise<void> {
  await waitFor(() => {
    expect(router.state.location.pathname).toBe(pathname);
  });
}

function expectSystemOwnedChrome(): void {
  const topBar = screen.getByTestId("top-bar");

  expect(
    Array.from(
      topBar.querySelectorAll(
        '[data-testid="brand"], [data-testid="primary-navigation"], [data-testid="tool-cluster"]',
      ),
    ).map((element) =>
      element.getAttribute("data-testid"),
    ),
  ).toEqual(["brand", "primary-navigation", "tool-cluster"]);
  expect(document.querySelector("[data-tauri-drag-region]")).toBeNull();
  expect(screen.queryByTestId("titlebar-drag-region")).not.toBeInTheDocument();
  expect(screen.queryByTestId("window-controls")).not.toBeInTheDocument();
  for (const name of windowControlNames) {
    expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
  }
}

describe("FyAgent V2 routing", () => {
  it.each(["/", "/route-that-does-not-exist"])(
    "redirects %s to the models route",
    async (initialEntry) => {
      const router = renderRoute(initialEntry);

      await expectPath(router, "/models");
      expect(
        screen.getByRole("link", { name: "模型", current: "page" }),
      ).toHaveAttribute("href", "/models");
      expect(screen.getAllByTestId("liquid-glass-lens")).toHaveLength(1);
    },
  );

  it.each(navigationContract)(
    "makes $path reachable and derives selection from router location",
    async ({ path, label }) => {
      const router = renderRoute(path);

      await expectPath(router, path);
      const navigation = screen.getByRole("navigation", { name: "主导航" });
      const activeLink = within(navigation).getByRole("link", {
        name: label,
      });
      const selectedLinks = within(navigation)
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page");

      expect(activeLink).toHaveAttribute("aria-current", "page");
      expect(selectedLinks).toEqual([activeLink]);
      expect(within(activeLink).getByTestId("liquid-glass-lens")).toBeVisible();
      expect(within(navigation).getAllByTestId("liquid-glass-lens")).toHaveLength(
        1,
      );
      expect(screen.getByRole("main", { name: "内容承载区" })).toBeEmptyDOMElement();
    },
  );

  it("keeps the system-chrome shell available when a child route fails", async () => {
    const [rootRoute] = appRoutes;
    const [contentBoundary] = rootRoute.children ?? [];
    const failingRoute: RouteObject = {
      path: "failure",
      loader: () => {
        throw new Error("Route failed");
      },
      element: <div />,
      hydrateFallbackElement: <div />,
    };
    expect(rootRoute?.errorElement).toBeUndefined();
    expect(contentBoundary?.errorElement).toBeTruthy();
    const routes: RouteObject[] = [
      {
        path: "/",
        element: rootRoute?.element,
        children: [
          {
            errorElement: contentBoundary?.errorElement,
            children: [failingRoute],
          },
        ],
      },
    ];
    const router = createMemoryRouter(routes, {
      initialEntries: ["/failure"],
    });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Route failed");
    expect(screen.getByTestId("top-bar")).toBeVisible();
    expectSystemOwnedChrome();
  });
});

describe("FyAgent V2 shell accessibility", () => {
  it("exposes the frozen labels and landmarks in the primary tab order", async () => {
    const user = userEvent.setup();
    renderRoute("/models");

    const brand = screen.getByTestId("brand");
    const navigation = screen.getByRole("navigation", { name: "主导航" });
    const routeLinks = within(navigation).getAllByRole("link");
    const toolButtons = toolNames.map((name) =>
      screen.getByRole("button", { name }),
    );

    expect(brand).toHaveAccessibleName("FyAgent 品牌");
    expect(screen.getByRole("main", { name: "内容承载区" })).toBeVisible();
    expect(routeLinks.map((link) => link.textContent?.trim())).toEqual(
      navigationContract.map(({ label }) => label),
    );
    expectSystemOwnedChrome();

    const expectedTabOrder = [...routeLinks, ...toolButtons];
    for (const control of expectedTabOrder) {
      await user.tab();
      expect(control).toHaveFocus();
    }
  });

  it("keeps inert shell tools safely clickable", () => {
    renderRoute("/models");

    const buttons = toolNames.map((name) =>
      screen.getByRole("button", { name }),
    );

    for (const button of buttons) {
      expect(button).toBeEnabled();
      expect(button).toHaveAccessibleName();
      expect(() => fireEvent.click(button)).not.toThrow();
    }

    expectSystemOwnedChrome();
  });
});
