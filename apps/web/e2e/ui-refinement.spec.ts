import { expect, test, type Page } from "@playwright/test";
import { openCollectionFilters } from "./collection-helpers";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

async function signIn(page: Page, path = "/") {
  await page.goto(path);
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Workspace", exact: true })).toBeVisible();
}

test("collection search expands filters, retains visible selections, and supports keyboard clearing", async ({ page }, testInfo) => {
  await signIn(page, "/collection");
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const ids: string[] = [];
  const prefix = `Toolbar fixture ${testInfo.project.name}`;
  try {
    for (const fields of [{ subject: `${prefix} raw` }, { subject: `${prefix} graded`, condition: "graded", grader: "PSA", grade: "9" }]) {
      const response = await page.request.post("/api/cards", { headers, data: fields });
      expect(response.status()).toBe(201); ids.push((await response.json()).id);
    }
    await page.reload();
    const search = page.getByLabel("Search collection", { exact: true });
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    await expect(filters).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("combobox", { name: "Condition", exact: true })).toHaveCount(0);
    await search.fill(prefix);
    await expect(page.getByRole("article")).toHaveCount(2);
    await openCollectionFilters(page);
    await page.getByRole("combobox", { name: "Condition", exact: true }).selectOption("graded");
    await expect(page.getByRole("article")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Remove Graded filter", exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Condition", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(filters).toBeFocused();
    await expect(filters).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("article")).toHaveCount(1);
    await page.getByRole("button", { name: "Remove Graded filter", exact: true }).click();
    await expect(filters).toBeFocused();
    await expect(page.getByRole("article")).toHaveCount(2);
    await openCollectionFilters(page);
    await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("all");
    await page.getByRole("combobox", { name: "Sort", exact: true }).selectOption("subject");
    await filters.click();
    await expect(page.getByLabel("2 active filters", { exact: true })).toBeVisible();
    await expect(page.getByText("Loading cards…", { exact: true })).toBeHidden();
    await testInfo.attach("Collapsed search with active filters", { body: await page.screenshot({ path: testInfo.outputPath("collection-compact-search.png"), fullPage: true }), contentType: "image/png" });
    await page.getByRole("button", { name: "Reset filters", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reset filters", exact: true })).toHaveCount(0);
    await expect(search).toHaveValue(prefix);
    await page.getByRole("button", { name: "Clear search", exact: true }).click();
    await expect(search).toBeFocused();
    await expect(search).toHaveValue("");
    await openCollectionFilters(page);
    await expect(page.getByRole("combobox", { name: "Show", exact: true })).toHaveValue("active");
    await expect(page.getByRole("combobox", { name: "Sort", exact: true })).toHaveValue("newest");
    await expect(page.getByText("Loading cards…", { exact: true })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach("Expanded collection filters", { body: await page.screenshot({ path: testInfo.outputPath("collection-expanded-filters.png"), fullPage: true }), contentType: "image/png" });
  } finally {
    for (const id of ids) {
      const card = await (await page.request.get(`/api/cards/${id}`)).json();
      expect((await page.request.delete(`/api/cards/${id}?revision=${card.revision}`, { headers })).status()).toBe(204);
    }
  }
});

test("Home methodology and Settings notes disclose details without overwhelming the overview", async ({ page }, testInfo) => {
  await signIn(page);
  const market = page.getByRole("region", { name: "Collection estimates", exact: true });
  await expect(market.getByText("Recorded sales · no live feed", { exact: true })).toBeVisible();
  await expect(market.getByRole("progressbar", { name: "Cards with market estimates", exact: true })).toBeVisible();
  const method = market.locator("details");
  await expect(method).not.toHaveAttribute("open");
  await method.getByText("How estimates work", { exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(method).toHaveAttribute("open", "");
  await expect(method).toContainText("Currencies are never combined");
  await method.getByText("How estimates work", { exact: true }).click();
  await testInfo.attach("Compact Home collection estimates", { body: await page.screenshot({ path: testInfo.outputPath("home-compact-estimates.png"), fullPage: true }), contentType: "image/png" });
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Settings", exact: true }).click();
  for (const name of ["Account", "Private storage", "Market data", "Display"]) await expect(page.getByRole("region", { name, exact: true })).toBeVisible();
  await expect(page.locator(".session-details dd")).toHaveText(username!);
  await expect(page.getByText("Setup needed", { exact: true })).toBeVisible();
  await expect(page.getByText("Local storage", { exact: true })).toBeVisible();
  const notes = page.locator(".settings-notes");
  await notes.getByText("Installation notes", { exact: true }).click();
  await expect(notes).toHaveAttribute("open", "");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await testInfo.attach("Settings sections and options", { body: await page.screenshot({ path: testInfo.outputPath("settings-options.png"), fullPage: true }), contentType: "image/png" });
  await page.getByRole("link", { name: "View market data", exact: false }).click();
  await expect(page.getByRole("heading", { name: "My Collection", exact: true, level: 1 })).toBeVisible();
  await expect(page.getByLabel("Row values", { exact: true })).toHaveCount(0);
});
