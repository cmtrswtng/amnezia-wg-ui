import { test, expect } from "@playwright/test";

const DAY = 86400000;
function demoClients() {
  const now = Date.now();
  return [
    ["1", "Александр · iPhone", ["Личное"], true, -30, 24, 12, 50],
    ["2", "MacBook Pro", ["Работа"], true, -50, 2, 78, 100],
    ["3", "Android · Pixel", ["Семья"], true, -90, 16, 5, null],
    ["4", "Ubuntu Server", ["Работа", "Сервер"], true, -86400, 42, 35, 100],
    ["5", "iPad Air", ["Личное"], false, -9000, null, 2, null],
    ["6", "Windows · Desktop", ["Дом"], true, -300, 5, 16, 30],
  ].map(([id, name, tags, enabled, handshake, days, used, quota]) => ({
    id,
    name,
    tags,
    enabled,
    address: `10.8.0.${Number(id) + 1}`,
    publicKey: `example-${id}`,
    createdAt: new Date(now - Number(id) * DAY).toISOString(),
    expiredAt: days ? new Date(now + days * DAY).toISOString() : null,
    latestHandshakeAt: new Date(now + handshake * 1000).toISOString(),
    downloadableConfig: true,
    transferRx: used * 1024 ** 3,
    transferTx: used * 0.22 * 1024 ** 3,
    quotaBytes: quota ? quota * 1024 ** 3 : null,
    quotaUsedBytes: used * 1024 ** 3,
    quotaUsedPercent: quota ? Math.round((used / quota) * 100) : null,
    quotaCycleDays: 30,
  }));
}
async function mockApi(page, authenticated = true) {
  const state = { clients: demoClients(), authenticated };
  await page.addInitScript(() => localStorage.setItem("lang", "ru"));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    let body = null;
    if (path === "/api/session") {
      if (request.method() === "POST") state.authenticated = true;
      if (request.method() === "DELETE") state.authenticated = false;
      body = { authenticated: state.authenticated, requiresPassword: true };
    } else if (
      path === "/api/wireguard/client" &&
      request.method() === "POST"
    ) {
      const payload = request.postDataJSON();
      state.clients.push({
        ...state.clients[0],
        ...payload,
        id: "new",
        expiredAt: payload.expiredDate,
        address: "10.8.0.20",
      });
      body = { success: true };
    } else if (path === "/api/wireguard/client") body = state.clients;
    else if (/\/client\/.+\/(enable|disable)$/.test(path)) {
      const [, id, action] = path.match(/\/client\/(.+)\/(enable|disable)$/);
      state.clients.find((client) => client.id === id).enabled =
        action === "enable";
      body = { success: true };
    } else if (path === "/api/wireguard/audit")
      body = [
        {
          ts: new Date().toISOString(),
          actor: "admin",
          action: "client.create",
          clientName: "MacBook Pro",
        },
      ];
    else if (path === "/api/ui-avatar-settings")
      body = { gravatar: false, dicebear: null };
    else if (path === "/api/ui-chart-type") body = "2";
    else if (path === "/api/lang") body = "ru";
    else body = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return state;
}

test("desktop cards, search, compact view and navigation", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockApi(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "MacBook Pro", exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".stat-card").nth(1).locator(".stat-number [aria-hidden]"),
  ).toHaveText("6");
  // Capture the settled CountUp/entrance animation, rather than its initial frame.
  await page.waitForTimeout(800);
  await page
    .locator(".client-card")
    .first()
    .hover({ position: { x: 120, y: 60 } });
  await expect(page.locator(".client-card").first()).toHaveCSS(
    "--spotlight-x",
    /px$/,
  );
  await page.screenshot({
    path: test.info().outputPath("admin-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("searchbox", { name: "Поиск клиентов" })
    .fill("10.8.0.3");
  await expect(page.locator(".client-card")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Поиск клиентов" }).fill("Семья");
  await expect(
    page.getByRole("heading", { name: "Android · Pixel" }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Поиск клиентов" }).fill("");
  await page.getByRole("button", { name: "Компактный список" }).click();
  await expect(page.locator(".clients-list")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("admin-list.png"),
    fullPage: true,
    animations: "disabled",
  });
  // Spotlight cards create stacking contexts; the menu must stay above later rows.
  const firstRow = page.locator(".client-card").first();
  await firstRow.locator("summary").click();
  await firstRow
    .getByRole("button", { name: "Удалить клиента", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Обзор", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Новые клиенты" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Журнал", exact: true }).click();
  await expect(page.getByText("Клиент создан", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("360px mobile layout and keyboard-safe client dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockApi(page);
  await page.goto("/");
  await expect(page.locator(".client-card")).toHaveCount(6);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.locator(".stat-card").nth(1).locator(".stat-number [aria-hidden]"),
  ).toHaveText("6");
  await page.waitForTimeout(800);
  await page.screenshot({
    path: test.info().outputPath("admin-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  const create = page.getByRole("button", {
    name: "Создать клиента",
    exact: true,
  });
  await create.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const name = dialog.getByLabel("Имя", { exact: true });
  await expect(name).toBeFocused();
  await name.fill("Новый Android");
  await dialog.getByLabel("Теги", { exact: true }).fill("Семья");
  await dialog.getByRole("button", { name: "+7 дней" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Новый Android" }),
  ).toBeVisible();
  await create.click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(create).toBeFocused();
});

test("login and logout do not retain private client data", async ({ page }) => {
  await mockApi(page, false);
  await page.goto("/");
  await page.getByLabel("Пароль").fill("test-only-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "MacBook Pro", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page.getByLabel("Пароль")).toBeVisible();
  await expect(page.locator(".client-card")).toHaveCount(0);
});
