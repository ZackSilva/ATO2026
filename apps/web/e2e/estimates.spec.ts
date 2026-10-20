import { expect, test, type Page } from "@playwright/test";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

async function setup(page: Page, subject: string, graded = false) {
  await page.goto("/collection");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Collection", exact: true, level: 1 })).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const response = await page.request.post("/api/cards", { headers, data: { subject, year: 2020, sport: "Basketball", manufacturer: "Test", set_name: "Evidence fixture", card_number: "7", ...(graded ? { condition: "graded", grader: "PSA", grade: "9" } : {}) } });
  expect(response.status()).toBe(201);
  const card = await response.json();
  const path = `/api/cards/${card.id}/comparables`;
  return {
    card,
    async cleanup() {
      const report = await page.request.get(path);
      if (report.ok()) for (const sale of (await report.json()).items) expect((await page.request.delete(`${path}/${sale.id}`, { headers })).status()).toBe(204);
      const latest = await page.request.get(`/api/cards/${card.id}`);
      if (latest.ok()) expect((await page.request.delete(`/api/cards/${card.id}?revision=${(await latest.json()).revision}`, { headers })).status()).toBe(204);
    },
  };
}

async function record(page: Page, price: string, source: string, currency = "USD") {
  const form = page.getByRole("form", { name: "Record sold comparable", exact: true });
  await form.getByLabel("Sold price", { exact: true }).fill(price);
  await form.getByLabel("Sale currency", { exact: true }).fill(currency);
  await form.getByLabel("Sale source", { exact: true }).fill(source);
  await form.getByLabel("Sale source URL (optional)", { exact: true }).fill(`https://example.invalid/sold/${encodeURIComponent(source)}`);
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith("/comparables") && response.request().method() === "POST"),
    form.getByRole("button", { name: "Record sold comparable", exact: true }).click(),
  ]);
  await expect(page.getByText("Loading sold comparables…", { exact: true })).toBeHidden();
  await expect(form.getByRole("button", { name: "Record sold comparable", exact: true })).toBeEnabled();
}

test("raw cards calculate from sold comparables, retain evidence and keep purchases and reports separate", async ({ page }, testInfo) => {
  const subject = `Raw estimate ${testInfo.project.name}`;
  const data = await setup(page, subject);
  try {
    await page.reload();
    await page.getByLabel("Row values", { exact: true }).selectOption("market");
    const row = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
    await expect(row.locator(".row-value")).toContainText("Insufficient Market Data");
    await row.getByRole("button", { name: `View card for ${subject}`, exact: true }).click();
    const detail = page.getByRole("dialog");
    await expect(detail.locator("input, select, textarea")).toHaveCount(0);
    await detail.getByRole("link", { name: "View and manage sold comparables ↗", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sold comparables", level: 1, exact: true })).toBeVisible();
    await record(page, "10.00", "Raw sale one");
    await record(page, "30.00", "Raw sale two");
    await expect(page.getByTestId("card-market-estimate")).toHaveText("Insufficient Market Data");
    await record(page, "20.00", "Raw sale three");
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*20\.00/);
    await expect(page.getByText(/Raw condition is unverified/)).toBeVisible();
    await record(page, "900.00", "Canadian raw context", "CAD");
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*20\.00/);
    await page.reload();
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*20\.00/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach("Raw sold evidence and estimate", { body: await page.screenshot({ path: testInfo.outputPath("raw-market-evidence.png"), fullPage: true }), contentType: "image/png" });
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "My Collection", exact: true }).click();
    await page.getByLabel("Row values", { exact: true }).selectOption("market");
    await expect(row.locator(".row-value")).toContainText(/USD\s*20\.00/);
    const more = row.getByRole("button", { name: "More card details", exact: true });
    if (await more.isVisible()) await more.click();
    await expect(row.locator(".row-purchase")).toContainText("Unknown");
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.locator(".market-headline strong")).toHaveText(/USD\s*20\.00/);
    await expect(page.getByText(/1 of 1 unsold cards/)).toBeVisible();
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "Reports", exact: true }).click();
    await expect(page.locator('[data-metric="acquisition_spending"] .finance-amount')).toHaveText("Unknown");
    await expect(page.locator('[data-metric="gross_sales"] .finance-amount')).toHaveText(/USD\s*0\.00/);
    await page.goto(`/collection/${data.card.id}/market`);
    await page.getByRole("listitem").filter({ hasText: "Raw sale one" }).getByRole("button", { name: "Remove sale", exact: true }).click();
    await page.getByRole("button", { name: "Confirm removal", exact: true }).click();
    await expect(page.getByTestId("card-market-estimate")).toHaveText("Insufficient Market Data");
  } finally { await data.cleanup(); }
});

test("graded estimates match grade, show other grades as context and reject duplicate evidence", async ({ page }, testInfo) => {
  const data = await setup(page, `Graded estimate ${testInfo.project.name}`, true);
  try {
    await page.goto(`/collection/${data.card.id}/market`);
    await expect(page.getByLabel("Comparable condition", { exact: true })).toHaveValue("graded");
    await record(page, "199.99", "PSA nine sale one");
    await record(page, "200.01", "PSA nine sale two");
    await record(page, "999.99", "PSA nine sale three");
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*200\.01/);
    await page.getByLabel("Comparable grade", { exact: true }).fill("8");
    await record(page, "10.00", "PSA eight context");
    await expect(page.getByRole("heading", { name: /PSA 8/ })).toBeVisible();
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*200\.01/);
    await record(page, "199.99", "PSA nine sale one");
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("This completed sale is already recorded.");
    await expect(page.getByRole("heading", { name: "Recorded sales · 4", exact: true })).toBeVisible();
    await expect(page.getByLabel("Sold price", { exact: true })).toHaveValue("199.99");
    await testInfo.attach("Graded market context and duplicate protection", { body: await page.screenshot({ path: testInfo.outputPath("graded-market-evidence.png"), fullPage: true }), contentType: "image/png" });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("link", { name: "My Collection", exact: true }).click();
    await page.getByLabel("Row values", { exact: true }).selectOption("market");
    const row = page.getByRole("article");
    await row.getByRole("button", { name: /View card for Graded estimate/ }).click();
    const detail = page.getByRole("dialog");
    await expect(detail.locator("input, select, textarea")).toHaveCount(0);
    await expect(detail).toContainText("PSA");
    await expect(detail).toContainText("200.01");
  } finally { await data.cleanup(); }
});
