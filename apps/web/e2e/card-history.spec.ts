import { expect, test, type Page } from "@playwright/test";
import { openCollectionFilters } from "./collection-helpers";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

async function signIn(page: Page) {
  await page.goto("/collection");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Collection", exact: true, level: 1 })).toBeVisible();
}

test("card details retain two-year sale graphs, filter context and remain read-only even after a sale", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await signIn(page);
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const subject = `Historical card ${testInfo.project.name}`;
  const created = await page.request.post("/api/cards", { headers, data: { subject, condition: "graded", grader: "PSA", grade: "9" } });
  expect(created.status()).toBe(201);
  const card = await created.json();
  const path = `/api/cards/${card.id}/comparables`;
  const prices = ["100.05", "120.10", "140.00", "160.00", "150.00"];
  const dates = [730, 400, 60, 30, 5].map(days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10));
  try {
    for (const [index, price] of [...prices, "999.00", "888.00"].entries()) {
      const saved = await page.request.post(path, { headers, data: {
        expected_definition_id: card.definition_id, sold_on: dates[Math.min(index, 4)], price,
        condition: "graded", grader: "PSA", grade: index === 5 ? "8" : "9", currency: index === 6 ? "CAD" : "USD",
        source: `Historical fixture ${index}`, source_url: `https://example.invalid/history/${testInfo.project.name}/${index}`,
      } });
      expect(saved.status()).toBe(201);
    }
    await page.reload();
    const row = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
    await row.getByRole("button", { name: `View card for ${subject}`, exact: true }).click();
    const detail = page.getByRole("dialog", { name: subject, exact: true });
    const history = detail.getByRole("region", { name: "Sales history", exact: true });
    const slider = history.getByRole("slider", { name: "Explore card sales history", exact: true });
    await expect(slider).toBeVisible();
    await expect(history.locator(".sales-history-point")).toHaveCount(5);
    await expect(detail.locator("input, select, textarea")).toHaveCount(0);
    await expect(slider).toHaveAttribute("aria-valuetext", /USD\s*150\.00/);
    await slider.focus(); await page.keyboard.press("Home");
    await expect(slider).toHaveAttribute("aria-valuetext", /USD\s*100\.05/);
    await page.keyboard.press("End");
    await expect(slider).toHaveAttribute("aria-valuetext", /USD\s*150\.00/);
    await expect(history).not.toContainText(/999\.00|888\.00/);
    await history.getByRole("button", { name: "Last week", exact: true }).click();
    await expect(history.locator(".sales-history-point")).toHaveCount(1);
    await expect(history.locator(".sales-history-line")).toHaveCount(0);
    await history.getByRole("button", { name: "All time", exact: true }).click();
    await expect(history.locator(".sales-history-point")).toHaveCount(5);
    await history.scrollIntoViewIfNeeded();
    await testInfo.attach("Read-only card detail with two-year sales history", { body: await page.screenshot({ path: testInfo.outputPath("card-detail-history.png") }), contentType: "image/png" });

    await page.route(`**${path}`, route => route.fulfill({ status: 503, json: { detail: "Sale history temporarily unavailable." } }));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(detail.getByRole("alert")).toContainText("Couldn’t load card sales history.");
    await expect(slider).toHaveCount(0);
    await page.unroute(`**${path}`);
    await detail.getByRole("button", { name: "Retry card sales history", exact: true }).click();
    await expect(slider).toBeVisible();
    await expect(history.locator(".sales-history-point")).toHaveCount(5);

    await detail.getByRole("button", { name: "Edit", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit card", exact: true });
    await expect(editor.getByLabel("Purchase price", { exact: true })).toHaveValue("");
    await editor.getByRole("combobox", { name: "Ownership status", exact: true }).selectOption("sold");
    await editor.getByLabel("Sale price", { exact: true }).fill("200");
    await editor.getByLabel("Sale fees", { exact: true }).fill("10");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    // Saving returns to the read-only view; the sold copy still has market history.
    await expect(detail).toBeVisible();
    await expect(slider).toBeVisible();
    await expect(history.locator(".sales-history-point")).toHaveCount(5);
    await detail.getByRole("button", { name: "Close card details", exact: true }).click();
    await openCollectionFilters(page);
    await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("sold");
    await row.getByRole("button", { name: `View card for ${subject}`, exact: true }).click();
    await expect(slider).toBeVisible();
    await expect(detail.locator("input, select, textarea")).toHaveCount(0);
    await detail.getByRole("link", { name: "View sold comparables ↗", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sold comparables", exact: true, level: 1 })).toBeVisible();
    const fullHistory = page.getByRole("region", { name: "Sales history", exact: true });
    await expect(fullHistory.getByRole("slider")).toBeVisible();
    await expect(fullHistory.locator(".sales-history-point")).toHaveCount(5);
    await expect(page.getByRole("heading", { name: "Recorded sales · 7", exact: true })).toBeVisible();
    await testInfo.attach("Persistent sold-card market graph", { body: await page.screenshot({ path: testInfo.outputPath("sold-card-history.png"), fullPage: true }), contentType: "image/png" });
    const persisted = await (await page.request.get(`/api/cards/${card.id}`)).json();
    expect(persisted.purchase_price).toBeNull(); expect(persisted.sale_net).toBe("190.00"); expect(persisted.net_profit).toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    const report = await page.request.get(path);
    if (report.ok()) for (const sale of (await report.json()).items) expect((await page.request.delete(`${path}/${sale.id}`, { headers })).status()).toBe(204);
    const latest = await page.request.get(`/api/cards/${card.id}`);
    if (latest.ok()) expect((await page.request.delete(`/api/cards/${card.id}?revision=${(await latest.json()).revision}`, { headers })).status()).toBe(204);
  }
});
