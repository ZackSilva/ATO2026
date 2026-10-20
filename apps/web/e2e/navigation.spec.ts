import { expect, test } from "@playwright/test";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

test("workspace links open distinct pages, retain the session and support history and reload", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const logins: string[] = [];
  page.on("request", request => { if (new URL(request.url()).pathname === "/api/auth/login") logins.push(request.method()); });
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", level: 1, exact: true })).toBeVisible();
  const session = (await page.context().cookies()).find(cookie => cookie.name === "slabtrak_session")?.value;
  expect(session).toBeTruthy();
  const navigation = page.getByRole("navigation", { name: "Workspace", exact: true });
  const routes = [
    { name: "Home", path: "/" },
    { name: "My Collection", path: "/collection" },
    { name: "Reports", path: "/reports" },
    { name: "Discover", path: "/discover" },
    { name: "Settings", path: "/settings" },
  ];
  await expect(navigation.getByRole("link")).toHaveCount(routes.length);
  for (const route of routes) {
    const link = navigation.getByRole("link", { name: route.name, exact: true });
    await expect(link).toHaveAttribute("href", route.path);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${route.path === "/" ? "/" : route.path}$`));
    await expect(page.getByRole("heading", { name: route.name, level: 1, exact: true })).toBeVisible();
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(page.getByLabel("Username", { exact: true })).toHaveCount(0);
    const finances = page.getByRole("region", { name: "Recorded finances", exact: true });
    if (route.name === "Reports") await expect(finances).toBeVisible();
    else await expect(finances).toHaveCount(0);
    if (route.name === "Home") {
      await expect(page.getByRole("region", { name: "Collection estimate overview", exact: true })).toBeVisible();
      await expect(page.getByRole("group", { name: "Report source", exact: true })).toHaveCount(0);
    }
    if (route.name === "My Collection") {
      await expect(page.getByRole("heading", { name: "Your collection", level: 2, exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "+ Add card", exact: true })).toBeEnabled();
      await expect(page.getByRole("region", { name: "Collection estimate overview", exact: true })).toHaveCount(0);
    }
    if (route.name === "Settings") await expect(page.locator(".session-details dd")).toHaveText(username!);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach(`${route.name} page`, { body: await page.screenshot({ path: testInfo.outputPath(`navigation-${route.name.toLowerCase().replaceAll(" ", "-")}.png`), fullPage: true }), contentType: "image/png" });
    await page.reload();
    await expect(page.getByRole("heading", { name: route.name, level: 1, exact: true })).toBeVisible();
    expect((await page.context().cookies()).find(cookie => cookie.name === "slabtrak_session")?.value).toBe(session);
  }
  await navigation.getByRole("link", { name: "My Collection", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Collection", level: 1, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Settings", level: 1, exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "My Collection", level: 1, exact: true })).toBeVisible();
  expect(logins).toEqual(["POST"]);
  expect((await page.request.post("/api/cards", { data: { subject: "Missing CSRF must never be saved" }, headers: { Origin: "http://localhost:3000" } })).status()).toBe(403);
});

test("direct workspace routes require sign-in before exposing private content", async ({ page }) => {
  for (const path of ["/collection", "/reports", "/discover", "/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Sign in to SlabTrak.", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Workspace", exact: true })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Recorded finances", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Add card", exact: true })).toHaveCount(0);
  }
});
