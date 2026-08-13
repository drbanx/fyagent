import { expect, test, type Locator } from "@playwright/test";

import {
  expectHealthyPage,
  expectNoHorizontalOverflow,
  monitorPageHealth,
  openV2Page,
} from "./support";
import {
  featureFixtureCalls,
  installRichTauriFeatureFixture,
} from "./support/features";

const agentOrder = [
  "QoderWork CN",
  "TRAE Work",
  "WorkBuddy",
  "Codex",
  "Claude Code",
] as const;

const modelTargetOrder = [
  "QoderWork CN",
  "TRAE Work",
  "WorkBuddy",
  "Codex",
  "Claude Code",
] as const;

const modelTargetIconSources = [
  "qoderwork.svg",
  "trae-work.png",
  "workbuddy.png",
  "inline-svg",
  "inline-svg",
] as const;

function agentSelector(page: Parameters<typeof openV2Page>[0]): Locator {
  return page.getByRole("region", { name: "Agent 选择" });
}

function agentItem(
  page: Parameters<typeof openV2Page>[0],
  name: (typeof agentOrder)[number],
): Locator {
  return agentSelector(page)
    .locator(".fy-agent-selector-item")
    .filter({ has: page.getByText(name, { exact: true }) });
}

async function expectFixtureCommand(
  page: Parameters<typeof openV2Page>[0],
  command: string,
): Promise<void> {
  await expect
    .poll(async () => {
      const calls = await featureFixtureCalls(page);
      return calls.filter((call) => call.command === command).length;
    })
    .toBeGreaterThan(0);
}

test("Agent catalog keeps exact native order and accessible master-detail selection", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page);
  const health = monitorPageHealth(page);
  await openV2Page(page, "/agents");

  await expect(
    page.getByRole("heading", { level: 1, name: "Agent 目录" }),
  ).toBeVisible();
  const items = agentSelector(page).locator(".fy-agent-selector-item");
  await expect(items).toHaveCount(5);
  expect(
    await items.evaluateAll((elements) =>
      elements.map(
        (element) => element.querySelector("strong")?.textContent?.trim() ?? "",
      ),
    ),
  ).toEqual([...agentOrder]);
  expect(
    await items.evaluateAll((elements) =>
      elements.map((element) => ({
        tagName: element.tagName,
        tabIndex: (element as HTMLElement).tabIndex,
      })),
    ),
  ).toEqual(
    agentOrder.map(() => ({
      tagName: "BUTTON",
      tabIndex: 0,
    })),
  );

  await expect(
    items.filter({ has: page.getByText("QoderWork CN") }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    page.getByRole("region", { name: "QoderWork CN 详情" }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "QoderWork CN 图标" }),
  ).toBeVisible();

  await items.first().focus();
  await page.keyboard.press("Tab");
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(items.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(
    page.getByRole("region", { name: "TRAE Work 详情" }),
  ).toBeVisible();
  const traeDetailIcon = page.getByRole("img", { name: "TRAE Work 图标" });
  expect(
    await traeDetailIcon.evaluate((image: HTMLImageElement) => ({
      naturalWidth: image.naturalWidth,
      renderedWidth: image.getBoundingClientRect().width,
      renderedHeight: image.getBoundingClientRect().height,
    })),
  ).toEqual({ naturalWidth: 48, renderedWidth: 48, renderedHeight: 48 });
  await expect(items.locator('[aria-current="true"]')).toHaveCount(0);
  await expect(
    agentSelector(page).locator('[aria-current="true"]'),
  ).toHaveCount(1);

  await expectNoHorizontalOverflow(page);
  await expectHealthyPage(page, health);
});

test("QoderWork and TRAE invoke only their exact official URLs", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page);
  const health = monitorPageHealth(page);
  await openV2Page(page, "/agents");

  const qoderDetail = page.getByRole("region", {
    name: "QoderWork CN 详情",
  });
  await expect(qoderDetail.getByRole("button")).toHaveCount(1);
  await qoderDetail.getByRole("button", { name: "打开官方入口" }).click();

  await agentItem(page, "TRAE Work").click();
  const traeDetail = page.getByRole("region", { name: "TRAE Work 详情" });
  await expect(traeDetail.getByRole("button")).toHaveCount(1);
  await traeDetail.getByRole("button", { name: "打开官方入口" }).click();

  await expect
    .poll(async () =>
      (await featureFixtureCalls(page)).filter(
        (call) => call.command === "open_external",
      ),
    )
    .toEqual([
      {
        command: "open_external",
        payload: { url: "https://qoder.com.cn/qoderwork" },
      },
      {
        command: "open_external",
        payload: { url: "https://www.trae.cn/" },
      },
    ]);
  const commands = (await featureFixtureCalls(page)).map(
    (call) => call.command,
  );
  expect(commands).not.toContain("apply_provider_quick_setup_with_result");
  expect(commands).not.toContain("switch_provider_with_result");
  expect(commands).not.toContain("save_workbuddy_models");

  await expectHealthyPage(page, health);
});

test("Agent observations stay lazy, real-read backed, and degrade to unknown", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page, {
    observationFailure: "workbuddy",
  });
  const health = monitorPageHealth(page);
  await openV2Page(page, "/agents");

  let commands = (await featureFixtureCalls(page)).map((call) => call.command);
  expect(commands).toContain("get_agent_catalog");
  expect(commands).not.toContain("get_workbuddy_status");
  expect(commands).not.toContain("get_providers");

  await agentItem(page, "WorkBuddy").click();
  const observation = page.getByRole("region", {
    name: "WorkBuddy 本机观察",
  });
  await expect(observation).toContainText("状态保持未知", { timeout: 10_000 });
  await expect(observation).not.toContainText("未安装");
  await expectFixtureCommand(page, "get_workbuddy_status");

  await agentItem(page, "Codex").click();
  await expect(
    page.getByRole("region", { name: "Codex Provider 观察" }),
  ).toContainText("Fixture Codex Current");
  await agentItem(page, "Claude Code").click();
  await expect(
    page.getByRole("region", { name: "Claude Code Provider 观察" }),
  ).toContainText("Fixture Claude Current");

  commands = (await featureFixtureCalls(page)).map((call) => call.command);
  expect(commands).toContain("get_provider_summary");
  expect(commands).not.toContain("get_providers");
  expect(commands).not.toContain("get_current_provider");
  await expectNoHorizontalOverflow(page);
  await expectHealthyPage(page, health);
});

test("Agent catalog failure stays explicit and never falls back to a static support list", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page, { catalogFailure: true });
  const health = monitorPageHealth(page);
  await openV2Page(page, "/agents");

  await expect(
    page.getByRole("heading", { name: "无法加载 Agent 目录" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("当前目录合同不可用")).toBeVisible();
  await expect(agentSelector(page)).toHaveCount(0);
  expect(
    (await featureFixtureCalls(page)).filter(
      (call) => call.command === "get_agent_catalog",
    ).length,
  ).toBeGreaterThanOrEqual(1);

  await expectHealthyPage(page, health);
});

test("Models keeps the five exact targets and third-party notes transient", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page);
  const health = monitorPageHealth(page);
  await openV2Page(page, "/models");

  const modelPage = page.getByTestId("models-page");
  await expect(modelPage).toBeVisible();
  const targetButtons = modelPage.locator('[data-testid^="model-target-"]');
  await expect(targetButtons).toHaveCount(5);
  expect(
    await targetButtons.evaluateAll((elements) =>
      elements.map(
        (element) => element.querySelector("strong")?.textContent?.trim() ?? "",
      ),
    ),
  ).toEqual([...modelTargetOrder]);
  const targetIcons = targetButtons.locator("img");
  await expect(targetIcons).toHaveCount(5);
  expect(
    await targetIcons.evaluateAll((elements) =>
      elements.map((element) => ({
        source: (element as HTMLImageElement).src.startsWith(
          "data:image/svg+xml",
        )
          ? "inline-svg"
          : new URL((element as HTMLImageElement).src).pathname
              .split("/")
              .at(-1),
        alt: element.getAttribute("alt"),
        ariaHidden: element.getAttribute("aria-hidden"),
        local:
          (element as HTMLImageElement).src.startsWith("data:image/svg+xml") ||
          new URL((element as HTMLImageElement).src).origin === location.origin,
      })),
    ),
  ).toEqual(
    modelTargetIconSources.map((source) => ({
      source,
      alt: "",
      ariaHidden: "true",
      local: true,
    })),
  );
  await expect(page.getByTestId("model-target-qoderwork")).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(
    page.getByRole("region", { name: "QoderWork CN 官方辅助设置" }),
  ).toBeVisible();

  await page.getByTestId("model-target-qoderwork").click();
  await page.getByLabel("端点备注").fill("https://transient.example.test/v1");
  await page.getByLabel("模型备注").fill("transient-qoder-model");
  await expect(modelPage).toContainText("FyAgent 不会写入这些值");
  await page.getByRole("button", { name: "打开官方设置" }).click();
  await page.getByTestId("model-target-trae").click();
  await page.getByLabel("端点备注").fill("transient-trae-endpoint");
  await page.getByLabel("模型备注").fill("transient-trae-model");
  await page.getByRole("button", { name: "打开官方设置" }).click();
  await page.getByTestId("model-target-qoderwork").click();
  await expect(page.getByLabel("端点备注")).toHaveValue("");
  await expect(page.getByLabel("模型备注")).toHaveValue("");
  await expect(modelPage).not.toContainText("配置成功");

  const calls = await featureFixtureCalls(page);
  expect(calls.filter((call) => call.command === "open_external")).toEqual([
    {
      command: "open_external",
      payload: { url: "https://qoder.com.cn/qoderwork" },
    },
    {
      command: "open_external",
      payload: { url: "https://www.trae.cn/" },
    },
  ]);
  expect(
    calls.filter((call) =>
      [
        "apply_provider_quick_setup_with_result",
        "switch_provider_with_result",
        "save_workbuddy_models",
      ].includes(call.command),
    ),
  ).toEqual([]);

  await expectNoHorizontalOverflow(page);
  await expectHealthyPage(page, health);
});

test("Provider read failure disables writes and remains an unknown observation", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page, {
    observationFailure: "codex",
  });
  const health = monitorPageHealth(page);
  await openV2Page(page, "/models?target=codex");

  await expect(page.locator("body")).toContainText("Provider 汇总暂不可用", {
    timeout: 10_000,
  });
  await expect(page.getByRole("button", { name: "保存并切换" })).toBeDisabled();
  await expect(page.locator("body")).not.toContainText("未安装");
  const calls = await featureFixtureCalls(page);
  expect(
    calls.filter((call) =>
      [
        "apply_provider_quick_setup_with_result",
        "switch_provider_with_result",
      ].includes(call.command),
    ),
  ).toEqual([]);

  await expectHealthyPage(page, health);
});

test("WorkBuddy freezes overwrite input, sends revision, rereads, and clears credentials", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page, {
    workBuddySave: "overwrite_then_saved",
  });
  const health = monitorPageHealth(page);
  const apiKey = "browser-workbuddy-secret";
  await openV2Page(page, "/models?target=workbuddy");

  await page.getByLabel("Base URL").fill("https://workbuddy.example.test/v1");
  await page.getByLabel("API Key", { exact: true }).fill(apiKey);
  await page.getByLabel("手动模型 ID").fill("manual-browser-model");
  await page.getByRole("button", { name: "保存并应用" }).click();

  const dialog = page.getByRole("dialog", { name: "确认覆盖已有模型" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "确认覆盖" }).click();
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");

  await expect
    .poll(
      async () =>
        (await featureFixtureCalls(page)).filter(
          (call) => call.command === "save_workbuddy_models",
        ).length,
    )
    .toBe(2);
  const calls = await featureFixtureCalls(page);
  const saveCalls = calls.filter(
    (call) => call.command === "save_workbuddy_models",
  );
  const firstRequest = saveCalls[0].payload.request as Record<string, unknown>;
  const secondRequest = saveCalls[1].payload.request as Record<string, unknown>;
  expect(firstRequest).toMatchObject({
    baseUrl: "https://workbuddy.example.test/v1",
    apiKey,
    manualModelIds: ["manual-browser-model"],
    expectedRevision: "fixture-revision-1",
  });
  expect(secondRequest).toEqual({
    ...firstRequest,
    overwriteToken: "fixture-opaque-overwrite-token",
  });
  expect(
    calls.filter((call) => call.command === "get_workbuddy_status").length,
  ).toBeGreaterThanOrEqual(2);
  expect(
    calls.filter((call) => call.command === "get_workbuddy_model_ids").length,
  ).toBeGreaterThanOrEqual(2);

  const secretSurfaces = await page.evaluate(
    (secret) => ({
      body: document.body.textContent ?? "",
      hash: window.location.hash,
      localStorage: Object.values(window.localStorage),
      sessionStorage: Object.values(window.sessionStorage),
      secret,
    }),
    apiKey,
  );
  expect(secretSurfaces.body).not.toContain(apiKey);
  expect(secretSurfaces.hash).not.toContain(apiKey);
  expect(secretSurfaces.localStorage).not.toContain(apiKey);
  expect(secretSurfaces.sessionStorage).not.toContain(apiKey);

  await expectNoHorizontalOverflow(page);
  await expectHealthyPage(page, health);
});

test("WorkBuddy write failures stay redacted and clear the submitted credential", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page, { workBuddySave: "failure" });
  const health = monitorPageHealth(page);
  const apiKey = "browser-workbuddy-error-secret";
  await openV2Page(page, "/models?target=workbuddy");

  await page.getByLabel("Base URL").fill("https://failure.example.test/v1");
  await page.getByLabel("API Key", { exact: true }).fill(apiKey);
  await page.getByLabel("手动模型 ID").fill("failure-model");
  await page.getByRole("button", { name: "保存并应用" }).click();

  await expect(page.locator("body")).toContainText("保存失败");
  await expect(page.locator("body")).toContainText("未显示后端原始详情");
  await expect(page.locator("body")).not.toContainText(apiKey);
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  expect(
    (await featureFixtureCalls(page)).filter(
      (call) => call.command === "save_workbuddy_models",
    ),
  ).toHaveLength(1);

  await expectHealthyPage(page, health);
});

test("WorkBuddy concurrent modification rereads authority instead of claiming success", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page, {
    workBuddySave: "concurrent_modification",
  });
  const health = monitorPageHealth(page);
  await openV2Page(page, "/models?target=workbuddy");

  await page.getByLabel("Base URL").fill("https://conflict.example.test/v1");
  await page
    .getByLabel("API Key", { exact: true })
    .fill("browser-conflict-secret");
  await page.getByLabel("手动模型 ID").fill("conflict-model");
  await page.getByRole("button", { name: "保存并应用" }).click();

  await expect(page.locator("body")).toContainText("配置已被其他操作修改");
  await expect(page.locator("body")).not.toContainText(
    "WorkBuddy 模型配置已保存",
  );
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  const calls = await featureFixtureCalls(page);
  expect(
    calls.filter((call) => call.command === "get_workbuddy_status").length,
  ).toBeGreaterThanOrEqual(2);
  expect(
    calls.filter((call) => call.command === "get_workbuddy_model_ids").length,
  ).toBeGreaterThanOrEqual(2);

  await expectHealthyPage(page, health);
});

test("Codex quick setup locks duplicate submission and sends exact provider payload", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page, {
    providerWriteDelayMs: 250,
  });
  const health = monitorPageHealth(page);
  const apiKey = "browser-codex-secret";
  await openV2Page(page, "/models");
  await page.getByTestId("model-target-codex").click();

  await page.getByLabel("配置名称").fill("Browser Codex");
  await page.getByLabel("Base URL").fill("https://codex.example.test/v1");
  await page.getByLabel("API Key").fill(apiKey);
  await page.getByLabel("模型 ID").fill("gpt-browser");
  const providerPanel = page.getByRole("region", { name: "Codex 模型配置" });
  const submit = providerPanel.locator("button.fy-control-button-primary");
  await submit.click();
  await expect(submit).toBeDisabled();
  await submit.dispatchEvent("click");
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");

  await expect
    .poll(
      async () =>
        (await featureFixtureCalls(page)).filter(
          (call) => call.command === "apply_provider_quick_setup_with_result",
        ).length,
    )
    .toBe(1);
  const calls = await featureFixtureCalls(page);
  const applyCalls = calls.filter(
    (call) => call.command === "apply_provider_quick_setup_with_result",
  );
  expect(applyCalls).toHaveLength(1);
  expect(applyCalls[0].payload).toMatchObject({
    app: "codex",
    request: {
      name: "Browser Codex",
      baseUrl: "https://codex.example.test/v1",
      apiKey,
      modelId: "gpt-browser",
    },
  });
  expect(
    calls.filter((call) => call.command === "switch_provider_with_result"),
  ).toEqual([]);
  expect(
    calls.filter(
      (call) =>
        call.command === "get_provider_summary" && call.payload.app === "codex",
    ).length,
  ).toBeGreaterThanOrEqual(2);

  const rendered = await page.locator("body").innerText();
  expect(rendered).not.toContain(apiKey);
  expect(page.url()).not.toContain(apiKey);
  expect(await page.evaluate(() => Object.values(localStorage))).not.toContain(
    apiKey,
  );
  expect(
    await page.evaluate(() => Object.values(sessionStorage)),
  ).not.toContain(apiKey);
  await expectHealthyPage(page, health);
});

test("Claude quick setup updates its reserved row with exact settings and switches it", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page, {
    existingQuickSetup: "claude",
  });
  const health = monitorPageHealth(page);
  const apiKey = "browser-claude-secret";
  await openV2Page(page, "/models?target=claude");

  await page.getByLabel("配置名称").fill("Browser Claude");
  await page.getByLabel("Base URL").fill("https://claude.example.test/v1");
  await page.getByLabel("API Key").fill(apiKey);
  await page.getByLabel("模型 ID").fill("claude-browser");
  await page.getByRole("button", { name: "保存并切换" }).click();
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");

  await expect
    .poll(
      async () =>
        (await featureFixtureCalls(page)).filter(
          (call) => call.command === "apply_provider_quick_setup_with_result",
        ).length,
    )
    .toBe(1);
  const calls = await featureFixtureCalls(page);
  const applyCalls = calls.filter(
    (call) => call.command === "apply_provider_quick_setup_with_result",
  );
  expect(applyCalls).toHaveLength(1);
  expect(applyCalls[0].payload).toMatchObject({
    app: "claude",
    request: {
      name: "Browser Claude",
      baseUrl: "https://claude.example.test/v1",
      apiKey,
      modelId: "claude-browser",
    },
  });
  expect(
    calls.filter((call) => call.command === "switch_provider_with_result"),
  ).toEqual([]);
  await expectHealthyPage(page, health);
});

test("Provider atomic failure reports rollback instead of a partial result", async ({
  page,
}) => {
  await installRichTauriFeatureFixture(page, {
    providerMutation: "switch_failure",
  });
  const health = monitorPageHealth(page);
  await openV2Page(page, "/models?target=codex");

  await page.getByLabel("配置名称").fill("Partial Codex");
  await page.getByLabel("Base URL").fill("https://partial.example.test/v1");
  await page.getByLabel("API Key").fill("partial-secret");
  await page.getByLabel("模型 ID").fill("partial-model");
  await page.getByRole("button", { name: "保存并切换" }).click();

  await expect(page.locator("body")).toContainText(
    "Provider 原子应用失败，已完成回滚",
  );
  await expect(page.locator("body")).not.toContainText("partial-secret");
  const calls = await featureFixtureCalls(page);
  expect(
    calls.filter(
      (call) => call.command === "apply_provider_quick_setup_with_result",
    ),
  ).toHaveLength(1);
  expect(
    calls.filter((call) => call.command === "switch_provider_with_result"),
  ).toHaveLength(0);
  await expect(page.getByLabel("API Key", { exact: true })).toHaveValue("");
  await expectHealthyPage(page, health);
});
