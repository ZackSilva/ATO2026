import { expect, test, type Page } from "@playwright/test";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py to use isolated test credentials.");

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByRole("heading", { name: `Welcome, ${username}.` })).toBeVisible();
}

test("sign in persists through reload and independent browser sessions; logout revokes access", async ({ page, browser }) => {
  await signIn(page);
  await page.reload();
  await expect(page.getByRole("heading", { name: `Welcome, ${username}.` })).toBeVisible();
  const sessionCookie = (await page.context().cookies()).find(cookie => cookie.name === "slabtrak_session");
  expect(Boolean(sessionCookie?.httpOnly)).toBe(true);
  expect(await page.evaluate(() => document.cookie.includes("slabtrak_session"))).toBe(false);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  const other = await browser.newContext();
  const second = await other.newPage();
  await signIn(second);
  await page.bringToFront();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign in to SlabTrak." })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await second.reload();
  await expect(second.getByRole("heading", { name: `Welcome, ${username}.` })).toBeVisible();
  await other.close();
});

test("invalid credentials show an actionable error without exposing the password", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill("incorrect-test-password");
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.locator("#access-error")).toHaveText("Invalid username or password.");
});

test("connection failure offers a working retry", async ({ page }) => {
  await page.route("**/api/auth/me", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Storage is temporarily unavailable. Please retry." }) }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Let’s reconnect." })).toBeVisible();
  await page.unroute("**/api/auth/me");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
});

test("keyboard entry and responsive layout", async ({ page }, testInfo) => {
  await page.goto("/");
  const user = page.getByLabel("Username", { exact: true });
  await user.fill(username!);
  await user.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await page.keyboard.type(password!);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Open my workspace" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: `Welcome, ${username}.` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("signed-in.png"), fullPage: true });
  const account = page.getByRole("button", { name: "Account menu", exact: true });
  const menu = page.locator(".account-menu");
  await expect(page.getByRole("main").getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeHidden();
  await account.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open");
  await expect(account).toBeFocused();
  await account.click();
  await page.getByRole("heading", { name: "Collection value", exact: true }).click();
  await expect(menu).not.toHaveAttribute("open");
  await account.click();
  const bounds = await page.locator(".account-dropdown").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath("account-menu.png") });
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("sign-in.png"), fullPage: true });
});


test("account menu retains access after a failed sign-out and supports retry", async ({ page }) => {
  await signIn(page);
  let release: (() => void) | undefined;
  await page.route("**/api/auth/logout", async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ status: 503, json: { detail: "Sign out is temporarily unavailable. Please retry." } });
  });
  try {
    await page.getByRole("button", { name: "Account menu", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByRole("button", { name: "Signing out…", exact: true })).toBeDisabled();
    await expect(page.locator(".account-dropdown")).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => typeof release).toBe("function");
    release!();
    await expect(page.locator("#access-error")).toHaveText("Sign out is temporarily unavailable. Please retry.");
    await expect(page.getByRole("heading", { name: `Welcome, ${username}.` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
    await page.unroute("**/api/auth/logout");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu", exact: true })).toHaveCount(0);
  } finally { release?.(); }
});
