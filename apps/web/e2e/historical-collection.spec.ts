import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

type Sale = { sold_on: string; price: string; currency: string; condition: "raw" | "graded"; grader: string; grade: string; source: string; source_url: string };
type Research = { checked_on: string; cards: { identity: Record<string, unknown>; sales: Sale[] }[] };
const research: Research = JSON.parse(readFileSync(new URL("../../../data/historical-collection-2026-10-20.json", import.meta.url), "utf8"));
const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

test("five researched cards retain their dated market observations in collection, detail and Reports", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", level: 1, exact: true })).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const cards: { id: string; subject: string; dates: string[]; count: number }[] = [];
  expect(research.cards).toHaveLength(5);
  try {
    for (const entry of research.cards) {
      const graded = entry.sales.find(sale => sale.condition === "graded")!;
      const response = await page.request.post("/api/cards", { headers, data: { ...entry.identity, condition: "graded", grader: graded.grader, grade: graded.grade } });
      expect(response.status()).toBe(201);
      const card = await response.json();
      const exact = entry.sales.filter(sale => sale.condition === "graded" && sale.grader === graded.grader && sale.grade === graded.grade && sale.currency === "USD");
      cards.push({ id: card.id, subject: card.subject, dates: exact.map(sale => sale.sold_on).sort(), count: exact.length });
      for (const sale of entry.sales) expect((await page.request.post(`/api/cards/${card.id}/comparables`, { headers, data: { ...sale, expected_definition_id: card.definition_id } })).status()).toBe(201);
    }
    await page.reload();
    await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "My Collection", exact: true }).click();
    await expect(page.getByRole("article")).toHaveCount(5);
    for (const card of cards) {
      const row = page.getByRole("article").filter({ has: page.getByRole("heading", { name: card.subject, exact: true }) });
      await expect(row.locator(".sale-history-sparkline circle")).toHaveCount(card.count);
      await row.getByRole("button", { name: `View card for ${card.subject}`, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: card.subject, exact: true });
      const history = dialog.getByRole("region", { name: "Sales history", exact: true });
      await expect(history.locator(".sales-history-point")).toHaveCount(card.count);
      await expect(dialog.locator("input, select, textarea")).toHaveCount(0);
      await expect(history.locator(".sales-history-dates")).toContainText(new Date(`${card.dates[0]}T00:00:00Z`).getUTCFullYear().toString());
      const saved = await (await page.request.get(`/api/cards/${card.id}`)).json();
      expect(saved.purchase_price).toBeNull(); expect(saved.total_cost).toBeNull();
      if (card.subject === "Bob McAdoo") {
        await history.scrollIntoViewIfNeeded();
        await testInfo.attach("Researched 2024–2026 card history", { body: await page.screenshot({ path: testInfo.outputPath("researched-two-year-card.png") }), contentType: "image/png" });
      }
      await dialog.getByRole("button", { name: "Close card details", exact: true }).click();
    }
    await testInfo.attach("Five cards with actual researched sales", { body: await page.screenshot({ path: testInfo.outputPath("five-card-historical-collection.png"), fullPage: true }), contentType: "image/png" });
    await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "Reports", exact: true }).click();
    const estimates = await (await page.request.get("/api/estimates")).json();
    expect(estimates.items).toHaveLength(5);
    for (const item of estimates.items) {
      const card = cards.find(card => card.id === item.card_id)!;
      expect(item.history).toHaveLength(card.count);
      expect(item.history[0].sold_on).toBe(card.dates[0]);
      expect(item.history.at(-1).sold_on).toBe(card.dates.at(-1));
    }
    const history = page.getByRole("region", { name: "Collection estimate overview", exact: true });
    await history.getByRole("button", { name: "All time", exact: true }).click();
    await expect(history.locator(".chart-x-axis")).toContainText("2024");
    await expect(page.getByRole("group", { name: "Report source", exact: true })).toHaveCount(0);
    await expect(page.getByRole("main")).not.toContainText(/\bdemo\b|fictional/i);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach("Reports with researched historical evidence and explicit gaps", { body: await page.screenshot({ path: testInfo.outputPath("historical-reports.png"), fullPage: true }), contentType: "image/png" });
  } finally {
    for (const card of cards) {
      const path = `/api/cards/${card.id}/comparables`;
      const report = await page.request.get(path);
      if (report.ok()) for (const sale of (await report.json()).items) expect((await page.request.delete(`${path}/${sale.id}`, { headers })).status()).toBe(204);
      const latest = await page.request.get(`/api/cards/${card.id}`);
      if (latest.ok()) expect((await page.request.delete(`/api/cards/${card.id}?revision=${(await latest.json()).revision}`, { headers })).status()).toBe(204);
    }
  }
});
