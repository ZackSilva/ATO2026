import { readFileSync } from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Comparable } from "../lib/estimates";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

type HistoricalPack = {
  checked_on: string;
  cards: { identity: Record<string, unknown> & { subject: string }; sales: Omit<Comparable, "id" | "definition_id" | "created_at">[] }[];
};
const pack: HistoricalPack = JSON.parse(readFileSync(new URL("../../../data/historical-collection-2026-10-20.json", import.meta.url), "utf8"));
const barry = pack.cards.find(card => card.identity.subject === "Barry Sanders")!;

async function inspectPoint(page: Page, point: Locator, touch: boolean) {
  await point.scrollIntoViewIfNeeded();
  const box = await point.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2, y = box!.y + box!.height / 2;
  if (touch) await page.touchscreen.tap(x, y);
  else { await page.mouse.move(x, y); await page.mouse.click(x, y); }
}

test("saved Barry Sanders listing previews and sales dropdown preserve the visible history and exact historical source", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  // Fix only the browser's viewing date; preserve the researched sale dates and amounts.
  await page.clock.setFixedTime(new Date(`${pack.checked_on}T12:00:00Z`));
  // The intercepted preview tests image rendering, not the historical listing's photo provenance.
  const imageUrl = "https://example.invalid/listing-preview.png";
  await page.route(imageUrl, route => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="112"><rect width="80" height="112" fill="#1b4a62"/><rect x="8" y="8" width="64" height="96" fill="#d5c18a"/></svg>',
  }));
  let providerSearches = 0;
  await page.route("**/api/market/search", route => { providerSearches += 1; return route.abort(); });
  await page.goto("/collection");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Collection", level: 1, exact: true })).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const created = await page.request.post("/api/cards", { headers, data: { ...barry.identity, condition: "graded", grader: "PSA", grade: "9" } });
  expect(created.status()).toBe(201);
  const card = await created.json();
  const path = `/api/cards/${card.id}/comparables`;
  const matching: Comparable[] = [];
  try {
    for (const sale of barry.sales) {
      const response = await page.request.post(path, { headers, data: { ...sale, image_url: sale.sold_on === "2026-10-03" && sale.price === "37.75" ? imageUrl : null, expected_definition_id: card.definition_id } });
      expect(response.status()).toBe(201);
      matching.push(await response.json());
    }
    const otherGrade = await page.request.post(path, { headers, data: {
      ...barry.sales[0], expected_definition_id: card.definition_id, grade: "10", price: "9999.00",
      source: "Other-grade exclusion fixture", source_url: "https://example.invalid/other-grade",
    } });
    expect(otherGrade.status()).toBe(201);
    const excluded = await otherGrade.json();
    matching.sort((a, b) => a.sold_on.localeCompare(b.sold_on) || Number(a.price) - Number(b.price));
    await page.reload();
    const row = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Barry Sanders", exact: true }) });
    await row.getByRole("button", { name: "View card for Barry Sanders", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Barry Sanders", exact: true });
    const history = dialog.getByRole("region", { name: "Sales history", exact: true });
    const selected = dialog.getByRole("region", { name: "Selected comparable sale", exact: true });
    const list = dialog.getByRole("list", { name: "Comparable sales", exact: true });
    const slider = history.getByRole("slider", { name: "Explore card sales history", exact: true });
    await expect(history.locator(".sales-history-point")).toHaveCount(matching.length);
    const disclosure = dialog.locator("details.saved-sales-list");
    await expect(disclosure.locator("summary")).toHaveText(`Sales · ${matching.length}`);
    await expect(disclosure).not.toHaveAttribute("open", "");
    await expect(slider).toBeVisible();
    await expect(selected).toBeVisible();
    await expect(list).toBeHidden();
    await disclosure.locator("summary").click();
    await expect(list.getByRole("listitem")).toHaveCount(matching.length);
    await expect(list.locator(`[data-sale-id="${excluded.id}"]`)).toHaveCount(0);
    await expect(dialog).not.toContainText("9,999.00");

    async function expectSelected(sale: Comparable) {
      await expect(selected.getByRole("link", { name: "View sale source ↗", exact: true })).toHaveAttribute("href", sale.source_url);
      await expect(selected).toContainText(sale.source);
      await expect(selected).toContainText("PSA 9");
      const title = `${sale.source} · ${sale.sold_on}`;
      if (sale.image_url) {
        const preview = selected.getByRole("img", { name: `Listing preview for ${title}`, exact: true });
        await preview.scrollIntoViewIfNeeded();
        await expect(preview).toBeVisible();
        await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      } else {
        await expect(selected.getByRole("img", { name: `Listing image unavailable for ${title}`, exact: true })).toBeVisible();
      }
      await expect(list.locator('[data-selected="true"]')).toHaveCount(1);
      await expect(list.locator(`[data-sale-id="${sale.id}"]`)).toHaveAttribute("data-selected", "true");
    }

    const earlier = matching.findIndex(sale => sale.sold_on === "2026-10-03" && sale.price === "37.75");
    const later = matching.findIndex(sale => sale.sold_on === "2026-10-04" && sale.price === "41.00");
    expect(earlier).toBeGreaterThanOrEqual(0); expect(later).toBeGreaterThanOrEqual(0);
    await inspectPoint(page, history.locator(".sales-history-point").nth(earlier), Boolean(testInfo.project.use.hasTouch));
    await expectSelected(matching[earlier]);
    const imageTitle = `${matching[earlier].source} · ${matching[earlier].sold_on}`;
    const imageRow = list.locator(`[data-sale-id="${matching[earlier].id}"]`);
    const rowPreview = imageRow.getByRole("img", { name: `Listing preview for ${imageTitle}`, exact: true });
    await rowPreview.scrollIntoViewIfNeeded();
    await expect.poll(() => rowPreview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await disclosure.locator("summary").click();
    await expect(list).toBeHidden();
    await expect(slider).toBeVisible();
    await expect(selected.getByRole("img", { name: `Listing preview for ${imageTitle}`, exact: true })).toBeVisible();
    await disclosure.locator("summary").click();
    await expectSelected(matching[earlier]);
    await expect(slider).toHaveAttribute("aria-valuetext", /USD\s*37\.75/);
    await inspectPoint(page, history.locator(".sales-history-point").nth(later), Boolean(testInfo.project.use.hasTouch));
    await expectSelected(matching[later]);
    const missingTitle = `${matching[later].source} · ${matching[later].sold_on}`;
    const missingRow = list.locator(`[data-sale-id="${matching[later].id}"]`);
    await missingRow.scrollIntoViewIfNeeded();
    await expect(missingRow.getByRole("img", { name: `Listing image unavailable for ${missingTitle}`, exact: true })).toBeVisible();
    await expect(slider).toHaveAttribute("aria-valuetext", /USD\s*41\.00/);
    await slider.focus(); await slider.press("Home");
    await expectSelected(matching[0]);
    await slider.press("End");
    await expectSelected(matching.at(-1)!);
    await history.getByRole("button", { name: "Previous sale", exact: true }).click();
    await expectSelected(matching.at(-2)!);
    await history.getByRole("button", { name: "Last week", exact: true }).click();
    await expect(history).toContainText("No matching sales in this range.");
    await expect(selected).toHaveCount(0);
    await expect(list.locator('[data-selected="true"]')).toHaveCount(0);
    await history.getByRole("button", { name: "All time", exact: true }).click();
    await expectSelected(matching.at(-1)!);
    await inspectPoint(page, history.locator(".sales-history-point").nth(earlier), Boolean(testInfo.project.use.hasTouch));
    await expectSelected(matching[earlier]);
    await history.scrollIntoViewIfNeeded();
    await testInfo.attach("Barry Sanders saved-history source with intercepted test image and collapsible sales list; historical prices and dates preserved", {
      body: await page.screenshot({ path: testInfo.outputPath("barry-sanders-selected-history.png") }), contentType: "image/png",
    });
    await dialog.getByRole("link", { name: "View sold comparables ↗", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Sold comparables", level: 1, exact: true })).toBeVisible();
    const fullHistory = page.getByRole("region", { name: "Sales history", exact: true });
    const fullSelected = page.getByRole("region", { name: "Selected comparable sale", exact: true });
    await expect(fullHistory.locator(".sales-history-point")).toHaveCount(matching.length);
    await inspectPoint(page, fullHistory.locator(".sales-history-point").nth(earlier), Boolean(testInfo.project.use.hasTouch));
    await expect(fullSelected.getByRole("link", { name: "View sale source ↗", exact: true })).toHaveAttribute("href", matching[earlier].source_url);
    const fullPreview = fullSelected.getByRole("img", { name: `Listing preview for ${imageTitle}`, exact: true });
    await fullPreview.scrollIntoViewIfNeeded();
    await expect.poll(() => fullPreview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const recorded = page.locator("details").filter({ has: page.getByRole("heading", { name: `Recorded sales · ${matching.length + 1}`, exact: true }) });
    await expect(recorded).not.toHaveAttribute("open", "");
    await expect(page.locator(".market-comparables")).toBeHidden();
    await expect(fullHistory.getByRole("slider")).toBeVisible();
    await recorded.locator("summary").click();
    await expect(page.locator(".market-comparables").getByRole("listitem")).toHaveCount(matching.length + 1);
    const recordedPreview = page.locator(".market-comparables").getByRole("img", { name: `Listing preview for ${imageTitle}`, exact: true });
    await recordedPreview.scrollIntoViewIfNeeded();
    await expect.poll(() => recordedPreview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await recorded.locator("summary").click();
    await expect(page.locator(".market-comparables")).toBeHidden();
    await expect(fullHistory.getByRole("slider")).toBeVisible();
    await expect(fullSelected.getByRole("link", { name: "View sale source ↗", exact: true })).toHaveAttribute("href", matching[earlier].source_url);
    expect(providerSearches).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await fullHistory.scrollIntoViewIfNeeded();
    await testInfo.attach("Barry Sanders market graph selected historical sale with source evidence", {
      body: await page.screenshot({ path: testInfo.outputPath("barry-sanders-market-sale.png"), fullPage: true }), contentType: "image/png",
    });
  } finally {
    const report = await page.request.get(path);
    if (report.ok()) for (const sale of (await report.json()).items) expect((await page.request.delete(`${path}/${sale.id}`, { headers })).status()).toBe(204);
    const latest = await page.request.get(`/api/cards/${card.id}`);
    if (latest.ok()) expect((await page.request.delete(`/api/cards/${card.id}?revision=${(await latest.json()).revision}`, { headers })).status()).toBe(204);
  }
});
