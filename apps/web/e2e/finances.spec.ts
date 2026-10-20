import { expect, test, type Locator, type Page } from "@playwright/test";
import { openCollectionFilters } from "./collection-helpers";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

async function signIn(page: Page) {
  await page.goto("/collection");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your collection", exact: true })).toBeVisible();
}

async function navigate(page: Page, name: "My Collection" | "Reports") {
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
}

// These records use the same authenticated API as the editor, in the helper's
// disposable database. Keeping IDs also lets cleanup work after a UI failure.
async function fixtures(page: Page) {
  const session = await page.request.get("/api/auth/me");
  expect(session.ok()).toBe(true);
  const headers = { "X-CSRF-Token": (await session.json()).csrf_token, Origin: "http://localhost:3000" };
  const ids: string[] = [];
  return {
    async add(subject: string, data: Record<string, unknown> = {}) {
      const response = await page.request.post("/api/cards", { headers, data: { subject, ...data } });
      expect(response.status()).toBe(201);
      const card = await response.json();
      ids.push(card.id);
      return card;
    },
    async cleanup() {
      for (const id of ids) {
        const response = await page.request.get(`/api/cards/${id}`);
        if (response.status() === 404) continue;
        expect(response.ok()).toBe(true);
        const card = await response.json();
        expect((await page.request.delete(`/api/cards/${id}?revision=${card.revision}`, { headers })).status()).toBe(204);
      }
    },
  };
}

function metric(region: Locator, key: string) {
  return region.locator(`[data-metric="${key}"]`);
}

async function amount(region: Locator, key: string, expected: string) {
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await expect(metric(region, key).locator(".finance-amount")).toHaveText(new RegExp(`(?:USD|CAD|\\$)\\s*${escaped}$`));
}

test("recorded totals include archived cards beyond one page, keep currencies separate and use transaction dates", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await signIn(page);
  const data = await fixtures(page);
  const today = new Date().toISOString().slice(0, 10);
  const old = new Date(Date.now() - 800 * 86_400_000).toISOString().slice(0, 10);
  try {
    for (let i = 0; i < 25; i++) await data.add(`Finance archived unknown ${i}`, { archived: true });
    await data.add("Finance sold gain", { purchase_price: "100", shipping: "5", tax: "0", other_cost: "0", acquired_on: old, sold: true, sale_price: "150", sale_fees: "15", sold_on: today });
    await data.add("Finance sold loss", { purchase_price: "50", shipping: "0", tax: "0", other_cost: "0", acquired_on: today, sold: true, sale_price: "20", sale_fees: "0", sold_on: today });
    await data.add("Finance undated unknown sale", { sold: true, sale_price: "30", sale_fees: "5" });
    await data.add("Finance archived owned", { archived: true, purchase_price: "200", shipping: "10", tax: "0", other_cost: "0", acquired_on: old });
    await data.add("Finance Canadian zero", { currency: "CAD", purchase_price: "0", shipping: "0", tax: "0", other_cost: "0", acquired_on: today, sold: true, sale_price: "0", sale_fees: "0", sold_on: today });
    await navigate(page, "Reports");
    const finances = page.getByRole("region", { name: "Recorded finances", exact: true });
    const currency = finances.getByRole("combobox", { name: "Financial currency", exact: true });
    const period = finances.getByRole("combobox", { name: "Finance period", exact: true });
    await currency.selectOption("USD");
    await amount(finances, "acquisition_spending", "365.00");
    await amount(finances, "owned_cost", "210.00");
    await amount(finances, "gross_sales", "200.00");
    await amount(finances, "sale_fees", "20.00");
    await amount(finances, "net_sales", "180.00");
    await amount(finances, "profit_vs_purchase", "5.00");
    await amount(finances, "realized_profit", "0.00");
    await expect(metric(finances, "acquisition_spending").locator(".finance-coverage")).toContainText(/3\s+of\s+29/);
    await expect(metric(finances, "realized_profit").locator(".finance-coverage")).toContainText(/2\s+of\s+3/);
    await expect(finances.getByRole("slider", { name: "Explore recorded financial activity", exact: true })).toBeVisible();
    if ((page.viewportSize()?.width ?? 1440) <= 680) {
      await expect(finances.getByRole("button", { name: "Hide financial chart", exact: true })).toHaveAttribute("aria-expanded", "true");
    }

    await navigate(page, "My Collection");
    await openCollectionFilters(page);
    await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("all");
    const pages = page.getByRole("navigation", { name: "Collection pages", exact: true });
    await expect(pages).toContainText("of 30");
    await expect(page.getByRole("article")).toHaveCount(24);
    await pages.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(6);
    await expect(finances).toHaveCount(0);
    await page.getByLabel("Search collection", { exact: true }).fill("Finance Canadian zero");
    await expect(page.getByRole("article")).toHaveCount(1);
    await navigate(page, "Reports");
    await amount(finances, "net_sales", "180.00");
    await currency.selectOption("CAD");
    await amount(finances, "net_sales", "0.00");
    await amount(finances, "realized_profit", "0.00");
    await expect(metric(finances, "realized_profit").locator(".finance-coverage")).toContainText(/1\s+of\s+1/);
    await currency.selectOption("USD");

    const chartMetric = finances.getByRole("combobox", { name: "Financial chart metric", exact: true });
    for (const range of ["1y", "6m", "3m", "1m", "1w"]) {
      await period.selectOption(range);
      await amount(finances, "acquisition_spending", "50.00");
      await amount(finances, "owned_cost", "210.00");
      await amount(finances, "gross_sales", "170.00");
      await amount(finances, "sale_fees", "15.00");
      await amount(finances, "net_sales", "155.00");
      // An old purchase still forms the basis of profit for a sale today.
      await amount(finances, "profit_vs_purchase", "5.00");
      await amount(finances, "realized_profit", "0.00");
    }
    for (const key of ["acquisition_spending", "gross_sales", "sale_fees", "net_sales", "profit_vs_purchase", "realized_profit"]) {
      await chartMetric.selectOption(key);
      const chart = finances.getByRole("slider", { name: "Explore recorded financial activity", exact: true });
      await expect(chart).toBeVisible();
      await chart.focus();
      await page.keyboard.press("End");
      await expect(chart).toHaveAttribute("aria-valuetext", /\S+/);
    }
    await period.selectOption("all");
    await amount(finances, "net_sales", "180.00");
    await finances.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach("Recorded finances with partial cost coverage", { body: await page.screenshot({ path: testInfo.outputPath("recorded-finances.png"), fullPage: true }), contentType: "image/png" });
  } finally { await data.cleanup(); }
});

test("saving, selling, correcting fees, unselling and deleting refresh recorded financial summaries", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await signIn(page);
  const data = await fixtures(page);
  const subject = `Finance refresh ${testInfo.project.name}`;
  try {
    await data.add(subject, { purchase_price: "100", shipping: "5", tax: "0", other_cost: "0" });
    await navigate(page, "Reports");
    const finances = page.getByRole("region", { name: "Recorded finances", exact: true });
    await amount(finances, "owned_cost", "105.00");
    await navigate(page, "My Collection");
    const record = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
    const editor = page.getByRole("dialog", { name: "Edit card", exact: true });
    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await editor.getByLabel("Purchase price", { exact: true }).fill("90");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    await navigate(page, "Reports");
    await amount(finances, "owned_cost", "95.00");
    await navigate(page, "My Collection");
    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await editor.getByRole("combobox", { name: "Ownership status", exact: true }).selectOption("sold");
    await editor.getByLabel("Sale price", { exact: true }).fill("150");
    await editor.getByLabel("Sale fees", { exact: true }).fill("15");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    await navigate(page, "Reports");
    await amount(finances, "owned_cost", "0.00");
    await amount(finances, "net_sales", "135.00");
    await amount(finances, "realized_profit", "40.00");
    await navigate(page, "My Collection");
    await openCollectionFilters(page);
    await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("sold");
    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await editor.getByLabel("Sale fees", { exact: true }).fill("20");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    await navigate(page, "Reports");
    await amount(finances, "net_sales", "130.00");
    await amount(finances, "realized_profit", "35.00");
    await navigate(page, "My Collection");
    await openCollectionFilters(page);
    await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("sold");
    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await editor.getByRole("combobox", { name: "Ownership status", exact: true }).selectOption("owned");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    await navigate(page, "Reports");
    await amount(finances, "net_sales", "0.00");
    await amount(finances, "owned_cost", "95.00");
    await navigate(page, "My Collection");
    await openCollectionFilters(page);
    await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("active");
    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await editor.getByRole("button", { name: "Delete card…", exact: true }).click();
    await editor.getByRole("button", { name: "Confirm permanent deletion", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(record).toBeHidden();
    await navigate(page, "Reports");
    await expect(finances).toContainText(/no recorded|no cards|add a card/i);
  } finally { await data.cleanup(); }
});

test("financial connection errors offer retry and unknown costs remain unknown", async ({ page }) => {
  await page.route("**/api/finances?*", route => route.fulfill({ status: 503, json: { detail: "Financial storage is temporarily unavailable. Please retry." } }));
  await signIn(page);
  await expect(page.getByRole("button", { name: "+ Add card", exact: true })).toBeEnabled();
  await navigate(page, "Reports");
  const finances = page.getByRole("region", { name: "Recorded finances", exact: true });
  await expect(finances.getByRole("alert")).toContainText("Couldn’t load the financial summary.");
  const data = await fixtures(page);
  try {
    await data.add("Finance unknown costs", { sold: true, sale_price: "20", sale_fees: "0" });
    await page.unroute("**/api/finances?*");
    await finances.getByRole("button", { name: "Retry financial summary", exact: true }).click();
    await amount(finances, "net_sales", "20.00");
    await expect(metric(finances, "acquisition_spending").locator(".finance-amount")).toHaveText(/unknown|not recorded/i);
    await expect(metric(finances, "realized_profit").locator(".finance-amount")).toHaveText(/unknown|not recorded/i);
    await expect(metric(finances, "realized_profit").locator(".finance-coverage")).toContainText(/0\s+of\s+1/);
    await expect(finances.getByRole("alert")).toHaveCount(0);
  } finally { await data.cleanup(); }
});
