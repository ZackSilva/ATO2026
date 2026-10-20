import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type Sale = { sold_on: string; price: string; currency: string; condition: "raw" | "graded"; grader: string; grade: string; source: string; source_url: string };
type Evidence = { checked_on: string; cards: { identity: Record<string, unknown>; research_url: string; sales: Sale[] }[] };
const evidence: Evidence = JSON.parse(readFileSync(new URL("../../../data/researched-sales-2026-10-20.json", import.meta.url), "utf8"));
const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

test("researched sales produce graded and raw estimates while purchase costs remain unknown", async ({ page }, testInfo) => {
  // Historical observations keep their actual dates. Refresh the pack when it ages out.
  const today = Date.now();
  const dates = evidence.cards.flatMap(card => card.sales.map(sale => Date.parse(`${sale.sold_on}T00:00:00Z`)));
  test.skip(dates.some(date => date > today || today - date >= 180 * 86400000), "The dated research pack needs fresh sales; never move real sale dates.");
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true, level: 1 })).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const cards: { id: string; definition_id: string; subject: string }[] = [];
  const expected = ["42,850.00", "542.79", "5,656.54", "2,247.00", "140.00"];
  try {
    for (const entry of evidence.cards) {
      const grading = entry.sales.find(sale => sale.condition === "graded")!;
      const response = await page.request.post("/api/cards", { headers, data: { ...entry.identity, condition: "graded", grader: grading.grader, grade: grading.grade } });
      expect(response.status()).toBe(201);
      const card = await response.json(); cards.push(card);
      for (const sale of entry.sales) {
        const saved = await page.request.post(`/api/cards/${card.id}/comparables`, { headers, data: { ...sale, expected_definition_id: card.definition_id } });
        expect(saved.status()).toBe(201);
      }
    }
    const raw = await page.request.post("/api/cards", { headers, data: evidence.cards[1].identity });
    expect(raw.status()).toBe(201); cards.push(await raw.json());
    await page.reload();
    await expect(page.locator(".market-headline strong")).toHaveText(/USD\s*51,436\.33/);
    await expect(page.getByText(/5 of 5 unsold cards/)).toBeVisible();
    await page.getByRole("link", { name: "Review cards and sold comparables ↗", exact: true }).click();
    await expect(page.getByRole("heading", { name: "My Collection", exact: true, level: 1 })).toBeVisible();
    await expect(page.getByLabel("Row values", { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "My Collection", exact: true, level: 1 })).toBeVisible();
    await expect(page.getByLabel("Row values", { exact: true })).toHaveCount(0);
    for (const [index, card] of cards.entries()) {
      const row = page.getByRole("article").filter({ has: page.getByRole("heading", { name: card.subject, exact: true }) }).filter({ hasText: index === 4 ? "RAW" : `PSA ${index === 1 ? "8" : index === 3 ? "10" : "9"}` });
      await expect(row.locator(".row-value")).toContainText(expected[index]);
      const disclosure = row.getByRole("button", { name: "More card details", exact: true });
      if (await disclosure.isVisible()) await disclosure.click();
      await expect(row.locator(".row-purchase")).toContainText("Unknown");
      const saved = await (await page.request.get(`/api/cards/${card.id}`)).json();
      expect(saved.purchase_price).toBeNull(); expect(saved.total_cost).toBeNull();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach("Source-backed estimates and unknown purchases", { body: await page.screenshot({ path: testInfo.outputPath("researched-collection.png"), fullPage: true }), contentType: "image/png" });
    await page.goto(`/collection/${cards[1].id}/market`);
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*542\.79/);
    await expect(page.getByRole("heading", { name: "Recorded sales · 6", exact: true })).toBeVisible();
    await page.locator("summary").filter({ hasText: /^Recorded sales · 6$/ }).click();
    await expect(page.locator(".market-comparables").getByRole("link", { name: "View sale source ↗" })).toHaveCount(6);
    await expect(page.getByText(/sources are not independently verified/)).toBeVisible();
    await testInfo.attach("Reported sales, provenance and raw context", { body: await page.screenshot({ path: testInfo.outputPath("researched-barkley-sales.png"), fullPage: true }), contentType: "image/png" });
    await page.getByRole("link", { name: "← My Collection", exact: true }).click();
    await expect(page.getByLabel("Row values", { exact: true })).toHaveCount(0);
  } finally {
    for (const card of cards) {
      const sales = await page.request.get(`/api/cards/${card.id}/comparables`);
      if (sales.ok()) for (const sale of (await sales.json()).items) expect((await page.request.delete(`/api/cards/${card.id}/comparables/${sale.id}`, { headers })).status()).toBe(204);
      const saved = await page.request.get(`/api/cards/${card.id}`);
      if (saved.ok()) expect((await page.request.delete(`/api/cards/${card.id}?revision=${(await saved.json()).revision}`, { headers })).status()).toBe(204);
    }
  }
});
