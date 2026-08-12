import { expect, test, type Locator } from "@playwright/test";

import {
  boxesOverlap,
  expectHealthyPage,
  expectNoHorizontalOverflow,
  monitorPageHealth,
  openV2Page,
  requiredBox,
} from "./support";

const navigationContract = [
  { path: "/agents", label: "Agent 目录" },
  { path: "/models", label: "模型" },
  { path: "/skills", label: "Skills" },
  { path: "/mcp", label: "MCP" },
  { path: "/prompts", label: "提示词" },
  { path: "/memory", label: "记忆" },
] as const;

const visibleControlTestIds = [
  "search",
  "settings",
  "avatar",
  "window-minimize",
  "window-maximize",
  "window-close",
] as const;

const shellRegionTestIds = [
  "brand",
  "primary-navigation",
  "tool-cluster",
  "window-controls",
] as const;

const primaryControlTestIds = [
  "#/agents",
  "#/models",
  "#/skills",
  "#/mcp",
  "#/prompts",
  "#/memory",
  ...visibleControlTestIds,
] as const;

function routeLink(navigation: Locator, label: string): Locator {
  return navigation.getByRole("link", { name: label, exact: true });
}

function escapedRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("keeps the complete shell visible, separate, and overflow-free", async ({
  page,
}) => {
  const health = monitorPageHealth(page);
  await openV2Page(page, "/models");

  await expectNoHorizontalOverflow(page);

  const topBar = page.getByTestId("top-bar");
  const topBarFits = await topBar.evaluate(
    (element) => element.scrollWidth <= element.clientWidth + 1,
  );
  expect(topBarFits, "TopBar must not overflow horizontally").toBe(true);

  const regionBoxes = new Map<
    string,
    Awaited<ReturnType<typeof requiredBox>>
  >();
  for (const testId of shellRegionTestIds) {
    regionBoxes.set(
      testId,
      await requiredBox(page.getByTestId(testId), testId),
    );
  }

  for (
    let firstIndex = 0;
    firstIndex < shellRegionTestIds.length;
    firstIndex += 1
  ) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < shellRegionTestIds.length;
      secondIndex += 1
    ) {
      const firstId = shellRegionTestIds[firstIndex];
      const secondId = shellRegionTestIds[secondIndex];
      const firstBox = regionBoxes.get(firstId);
      const secondBox = regionBoxes.get(secondId);

      expect(firstBox).toBeDefined();
      expect(secondBox).toBeDefined();
      expect(
        boxesOverlap(firstBox!, secondBox!),
        `${firstId} must not overlap ${secondId}`,
      ).toBe(false);
    }
  }

  const navigation = page.getByRole("navigation", { name: "主导航" });
  for (const { label } of navigationContract) {
    await expect(routeLink(navigation, label)).toBeVisible();
  }
  for (const testId of visibleControlTestIds) {
    await expect(page.getByTestId(testId)).toBeVisible();
  }

  const contentViewport = page.getByTestId("content-viewport");
  const contentBox = await requiredBox(contentViewport, "content viewport");
  expect(contentBox.width).toBeGreaterThan(0);
  expect(contentBox.height).toBeGreaterThan(0);
  expect(
    await contentViewport.evaluate((element) => element.textContent?.trim()),
  ).toBe("");

  await expectHealthyPage(page, health);
});

test("keeps hash, selected link, and aria-current aligned for every route", async ({
  page,
}) => {
  const health = monitorPageHealth(page);
  await openV2Page(page, "/models");

  const navigation = page.getByRole("navigation", { name: "主导航" });
  for (const { path, label } of navigationContract) {
    const link = routeLink(navigation, label);
    await link.click();

    await expect(page).toHaveURL(
      new RegExp(`${escapedRegularExpression(`#${path}`)}$`),
    );
    await expect(link).toHaveAttribute("aria-current", "page");
    const selectedLinks = navigation.locator('a[aria-current="page"]');
    await expect(selectedLinks).toHaveCount(1);
    await expect(selectedLinks).toHaveText(label);
    if (["/skills", "/mcp"].includes(path)) {
      await expect(page.getByTestId("content-viewport")).not.toHaveText("");
    } else {
      await expect(page.getByTestId("content-viewport")).toHaveText("");
    }
  }

  await expectHealthyPage(page, health);
});

test("reaches every primary control with the keyboard in document order", async ({
  page,
}) => {
  const health = monitorPageHealth(page);
  await openV2Page(page, "/models");

  const focusedControlIds: string[] = [];
  for (let index = 0; index < primaryControlTestIds.length; index += 1) {
    await page.keyboard.press("Tab");
    focusedControlIds.push(
      (await page.evaluate(() => {
        const activeElement = document.activeElement;
        return (
          activeElement?.getAttribute("data-testid") ??
          activeElement?.getAttribute("href")
        );
      })) ?? "",
    );
  }

  expect(focusedControlIds).toEqual([...primaryControlTestIds]);

  await expectHealthyPage(page, health);
});
