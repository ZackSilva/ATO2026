import { expect, test, type Page } from "@playwright/test";
import type { Card } from "../lib/cards";
import type { Comparable } from "../lib/estimates";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

const cleanup = new Map<string, { card: Card; headers: Record<string, string>; saleIds: string[] }>();
test.afterEach(async ({ page }, testInfo) => {
  const fixture = cleanup.get(testInfo.testId);
  if (!fixture) return;
  cleanup.delete(testInfo.testId);
  // Hooks receive their own cleanup budget even when the test body times out.
  testInfo.setTimeout(30_000);
  const failures: string[] = [];
  for (const saleId of fixture.saleIds) {
    try {
      const removed = await page.request.delete(`/api/cards/${fixture.card.id}/comparables/${saleId}`, { headers: fixture.headers, timeout: 10_000 });
      if (![204, 404].includes(removed.status())) failures.push(`Comparable cleanup returned ${removed.status()}.`);
    } catch { failures.push("Comparable cleanup request failed."); }
  }
  try {
    const current = await page.request.get(`/api/cards/${fixture.card.id}`, { timeout: 10_000 });
    if (current.ok()) {
      const removed = await page.request.delete(`/api/cards/${fixture.card.id}?revision=${(await current.json()).revision}`, { headers: fixture.headers, timeout: 10_000 });
      if (removed.status() !== 204) failures.push(`Card cleanup returned ${removed.status()}.`);
    } else if (current.status() !== 404) failures.push(`Card lookup returned ${current.status()}.`);
  } catch { failures.push("Card cleanup request failed."); }
  if (failures.length) {
    await testInfo.attach("Fixture cleanup failure", { body: Buffer.from(failures.join("\n")), contentType: "text/plain" });
    if (testInfo.status === testInfo.expectedStatus) throw new Error(failures.join(" "));
  }
});

async function createCard(page: Page, subject: string, graded: boolean) {
  await page.goto("/collection");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Collection", level: 1, exact: true })).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const created = await page.request.post("/api/cards", { headers, data: {
    subject, year: 2020, sport: "Basketball", manufacturer: "Valuation test",
    set_name: "Exact match fixture", card_number: "7",
    ...(graded ? { condition: "graded", grader: "PSA", grade: "9" } : {}),
  } });
  expect(created.status()).toBe(201);
  return { card: await created.json() as Card, headers, csrf: session.csrf_token as string };
}

for (const graded of [true, false]) {
  test(`${graded ? "graded" : "raw"} exact-card confirmation updates estimates, preserves historical evidence and keeps acquisition costs unknown`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const subject = `Automatic ${graded ? "graded" : "raw"} ${testInfo.project.name}`;
    const { card, headers, csrf } = await createCard(page, subject, graded);
    const fixture = { card, headers, saleIds: [] as string[] };
    cleanup.set(testInfo.testId, fixture);
    const path = `/api/cards/${card.id}/comparables`;
    const linkPath = `/api/cards/${card.id}/market-link`;
    const today = new Date().toISOString().slice(0, 10);
    const date = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const imageUrl = "https://example.invalid/automatic-listing-preview.svg";
    const condition = graded ? "graded" : "raw";
    const grader = graded ? "PSA" : "", grade = graded ? "9" : "";
    type PricingState = "saved" | "pending" | "live" | "failed";
    const saved: Comparable[] = [];
    // Only seed historical evidence through the maintenance API. Authentication,
    // ownership and private acquisition records use the real disposable database.
    for (const [index, price] of ["10.00", "20.00", "30.00"].entries()) {
      const result = await page.request.post(path, { headers, data: {
        expected_definition_id: card.definition_id, sold_on: date(40 - index), price,
        currency: "USD", condition, grader, grade,
        source: `Saved historical fixture ${index}`, source_url: `https://example.invalid/saved/${card.id}/${index}`,
      } });
      expect(result.status()).toBe(201);
      const sale = await result.json() as Comparable;
      saved.push(sale); fixture.saleIds.push(sale.id);
    }
    const live = ["100.00", "150.00", "200.00"].map((price, index) => ({
      ...saved[index], id: `live-${index}`, sold_on: date(5 - index), price,
      source: "eBay auction fixture", source_url: `https://example.invalid/live/${card.id}/${index}`, image_url: imageUrl,
    }));
    let state: PricingState = "saved";
    let linked = false, failRefresh = false, pendingReports = 0, providerSearches = 0;
    const confirmations: unknown[] = [];
    const estimate = (current: PricingState) => {
      const usable = current === "saved" || current === "live";
      const items = current === "saved" ? saved : current === "live" ? live : [];
      return {
        card_id: card.id, currency: "USD", condition, grader, grade, raw_condition: "unspecified",
        amount: usable ? current === "saved" ? "20.00" : "150.00" : null,
        low: usable ? items[0].price : null, high: usable ? items[2].price : null,
        sample_count: items.length, latest_sale: items.at(-1)?.sold_on ?? null,
        latest_matching_sale: items.at(-1)?.sold_on ?? null, days_since_latest_sale: usable ? 3 : null,
        confidence: usable ? "low" : "insufficient", reason: "Isolated browser valuation fixture.", stale: !usable,
        history: items.map(({ sold_on, price }) => ({ sold_on, price })),
        source: current === "saved" ? "saved" : "cardsight",
        pricing_status: current === "saved" ? "saved" : current === "failed" ? "unavailable" : current,
        fetched_at: current === "live" ? new Date().toISOString() : null, refresh_after: null,
        pricing_note: current === "failed" ? "Provider unavailable. Previous live prices are not shown." : null,
      };
    };
    const report = (current: PricingState) => {
      const items = current === "saved" ? saved : current === "live" ? live : [];
      return { items, matching_sale_ids: items.map(item => item.id), estimate: estimate(current) };
    };
    await page.route(imageUrl, route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="112"><rect width="80" height="112" fill="#345a69"/><rect x="8" y="10" width="64" height="90" fill="#d4be8d"/></svg>' }));
    await page.route("**/api/market/search", route => { providerSearches += 1; return route.abort(); });
    await page.route(`**${linkPath}**`, async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === "GET") return route.fulfill({ json: {
        configured: true, link: linked ? { card_id: "exact-card", parallel_id: null,
          grade_id: graded ? "grade-normal" : null, confirmed_at: `${today}T12:00:00Z`, valid: true } : null,
      } });
      expect(request.headers()["x-csrf-token"]).toBe(csrf);
      const body = request.postDataJSON();
      if (url.pathname.endsWith("/candidates")) {
        expect(body).toEqual({ expected_definition_id: card.definition_id });
        return route.fulfill({ json: { definition_id: card.definition_id,
          candidates: [
            { id: "similar-other-card", name: "Similar issue", number: "8", year: "2020",
              release_name: "Wrong release", set_name: "Other issue", parallel_id: null, parallel_name: null,
              eligible: false, reason: "Card number does not match." },
            { id: "exact-card", name: subject, number: "7", year: "2020",
              release_name: "Exact match fixture", set_name: "Exact match fixture", parallel_id: null,
              parallel_name: null, eligible: true, reason: "Review this exact card before confirming." },
          ], grade_options: graded ? [
            { id: "grade-normal", label: "PSA 9 · Standard label" },
            { id: "grade-qualified", label: "PSA 9 · Qualified label" },
          ] : [], note: "Provider responses and listing photo are browser fixtures; no live provider call.",
        } });
      }
      if (url.pathname.endsWith("/refresh")) {
        expect(body).toEqual({}); state = failRefresh ? "failed" : "live";
      } else if (request.method() === "DELETE") {
        expect(body).toEqual({ expected_definition_id: card.definition_id, expected_card_id: "exact-card", expected_confirmed_at: `${today}T12:00:00Z` });
        linked = false; state = "saved";
      } else {
        expect(body).toEqual({ expected_definition_id: card.definition_id, expected_card_id: null, expected_confirmed_at: null,
          card_id: "exact-card", grade_id: graded ? "grade-normal" : null });
        confirmations.push(body); linked = true; state = graded ? "live" : "pending";
      }
      return route.fulfill({ json: {} });
    });
    await page.route(`**${path}`, route => {
      if (route.request().method() !== "GET") return route.continue();
      const current = state;
      if (current === "pending") { pendingReports += 1; state = "live"; }
      return route.fulfill({ json: { ...report(current), saved_history: linked ? report("saved") : null } });
    });
    await page.route("**/api/estimates", route => route.fulfill({ json: {
      as_of: today, window_days: 180, minimum_sales: 3, items: [estimate(state)],
    } }));

    await page.goto(`/collection/${card.id}/market`);
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*20\.00/);
    await page.getByRole("button", { name: "Find exact card", exact: true }).click();
    const candidates = page.getByRole("list", { name: "Exact card candidates", exact: true });
    const wrong = candidates.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Similar issue", exact: true }) });
    const exact = candidates.getByRole("listitem").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
    await expect(wrong.getByRole("button", { name: /^Use this match/ })).toBeDisabled();
    if (graded) {
      await expect(exact.getByRole("button", { name: /^Use this match/ })).toBeDisabled();
      await page.getByRole("combobox", { name: "Grading label", exact: true }).selectOption("grade-normal");
    } else await expect(page.getByRole("combobox", { name: "Grading label", exact: true })).toHaveCount(0);
    expect(confirmations).toHaveLength(0);
    await exact.getByRole("button", { name: /^Use this match/ }).click();
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*150\.00/);
    expect(confirmations).toHaveLength(1);
    if (!graded) expect(pendingReports).toBe(1);
    await expect(page.getByText("Exact card matched. Completed sales for this card support automatic estimates.", { exact: true })).toBeVisible();
    const history = page.locator("main > .card-sales-history");
    await expect(history.locator(".sales-history-point")).toHaveCount(3);
    const preview = history.getByRole("img", { name: /^Listing preview for eBay auction fixture/ });
    await preview.scrollIntoViewIfNeeded();
    await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await history.getByRole("slider").focus(); await history.getByRole("slider").press("Home");
    await expect(history.getByRole("link", { name: "View sale source ↗", exact: true })).toHaveAttribute("href", live[0].source_url);
    await expect(history).toContainText(/USD\s*100\.00/);
    const sales = page.locator("main > .saved-sales-list");
    await expect(sales).not.toHaveAttribute("open", "");
    await sales.locator("summary").click();
    await expect(sales.getByRole("list", { name: "Comparable sales", exact: true }).getByRole("listitem")).toHaveCount(3);
    await sales.locator("summary").click();
    await expect(history.getByRole("slider")).toBeVisible();
    const historical = page.locator(".saved-historical-evidence");
    await expect(historical).not.toHaveAttribute("open", "");
    await historical.locator(":scope > summary").click();
    await expect(historical.locator(".sales-history-point")).toHaveCount(3);
    await expect(historical.getByRole("region", { name: "Selected comparable sale", exact: true })).toContainText("Saved historical fixture");
    await historical.locator(":scope > summary").click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach("Automatic valuation browser fixture: explicit exact-card match, provider-photo rendering and separate saved historical evidence; no live provider request", {
      body: await page.screenshot({ path: testInfo.outputPath(`automatic-${condition}-valuation.png`), fullPage: true }), contentType: "image/png",
    });
    const nav = page.getByRole("navigation", { name: "Workspace", exact: true });
    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.locator(".market-headline strong")).toHaveText(/USD\s*150\.00/);
    await nav.getByRole("link", { name: "Reports", exact: true }).click();
    await expect(page.getByRole("region", { name: "Collection value", exact: true }).locator(".market-headline strong")).toHaveText(/USD\s*150\.00/);
    await expect(page.locator('[data-metric="acquisition_spending"] .finance-amount')).toHaveText("Unknown");
    await page.goto(`/collection/${card.id}/market`);
    failRefresh = true;
    await page.getByRole("button", { name: "Refresh estimate", exact: true }).click();
    await expect(page.getByTestId("card-market-estimate")).toHaveText("Insufficient Market Data");
    await expect(history.locator(".sales-history-point")).toHaveCount(0);
    await expect(page.getByText("Provider unavailable. Previous live prices are not shown.", { exact: true })).toBeVisible();
    await expect(historical).toHaveCount(1);
    await page.getByRole("button", { name: "Remove match", exact: true }).click();
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*20\.00/);
    await expect(historical).toHaveCount(0);
    await expect(history.locator(".sales-history-point")).toHaveCount(3);
    expect(await (await page.request.get(`/api/cards/${card.id}`)).json()).toEqual(card);
    expect(card.purchase_price).toBeNull();
    expect(providerSearches).toBe(0);
  });
}
