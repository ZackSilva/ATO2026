import { expect, test, type Locator, type Page } from "@playwright/test";
import type { MarketSearch } from "../lib/market-search";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

async function signIn(page: Page, path = "/discover") {
  await page.goto(path);
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discover", exact: true, level: 1 })).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  return session.csrf_token as string;
}

const soldOn = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

function fixtureResult(query: string, condition: "raw" | "graded" = "raw"): MarketSearch {
  return {
    query, provider: "cardsight", fetched_at: new Date().toISOString(),
    discarded_count: 1, returned_count: 3, truncated: false,
    notice: "Test fixture response. Live provider access is not verified by this browser test.",
    items: ["100.00", "125.00", "150.00"].map((price, index) => ({
      id: `fixture-${condition}-${index}`, title: `Test fixture Jordan auction ${index + 1}`,
      price, currency: "USD", sold_on: soldOn(20 - index * 5), source: "Fixture auction house",
      source_url: `https://example.invalid/auction-fixture/${condition}/${index}`,
      condition, grader: condition === "graded" ? "PSA" : "", grade: condition === "graded" ? "9" : "",
      parallel: null, matched_card: null, image_url: null,
    })),
  };
}

async function expectFits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function inspectPoint(page: Page, point: Locator, touch: boolean) {
  await point.scrollIntoViewIfNeeded();
  const box = await point.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2, y = box!.y + box!.height / 2;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.move(x, y);
}

test("auction search fixture: missing provider key disables search without manual sale or import controls", async ({ page }, testInfo) => {
  let searches = 0;
  await page.route("**/api/market/status", route => route.fulfill({ json: { provider: "cardsight", configured: false } }));
  await page.route("**/api/market/search", route => { searches += 1; return route.fulfill({ status: 503, json: { detail: "Fixture provider is not connected." } }); });
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Connect CardSight to search sales", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search sales", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Card search", { exact: true })).toBeDisabled();
  await expect(page.locator('input[type="file"], textarea')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /import|record sold comparable/i })).toHaveCount(0);
  expect(searches).toBe(0);
  await expectFits(page);
  await testInfo.attach("Provider setup fixture; no live provider request", {
    body: await page.screenshot({ path: testInfo.outputPath("auction-setup-fixture.png"), fullPage: true }), contentType: "image/png",
  });
});

test("auction search fixture: explicit raw and graded queries render source evidence and history without mutating collection", async ({ page }, testInfo) => {
  const requests: { body: Record<string, unknown>; csrf: string | undefined; method: string }[] = [];
  await page.route("**/api/market/status", route => route.fulfill({ json: { provider: "cardsight", configured: true } }));
  await page.route("**/api/market/search", async route => {
    const request = route.request();
    const body = request.postDataJSON();
    requests.push({ body, csrf: request.headers()["x-csrf-token"], method: request.method() });
    await route.fulfill({ json: fixtureResult(body.query, body.condition === "graded" ? "graded" : "raw") });
  });
  const prefilled = "1986 Fleer Michael Jordan #57";
  const csrf = await signIn(page, `/discover?q=${encodeURIComponent(prefilled)}`);
  const before = await (await page.request.get("/api/cards")).json();
  const query = page.getByLabel("Card search", { exact: true });
  await expect(query).toHaveValue(prefilled);
  const submit = page.getByRole("button", { name: "Search sales", exact: true });
  await expect(submit).toBeEnabled();
  expect(requests).toHaveLength(0);
  await query.fill(`${prefilled} raw`);
  await page.getByText("Search filters", { exact: true }).click();
  await page.getByLabel("Sale condition", { exact: true }).selectOption("raw");
  await page.getByLabel("Sale period", { exact: true }).selectOption("1y");
  expect(requests).toHaveLength(0);
  await submit.click();
  await expect(page.getByRole("heading", { name: "3 auction sales found", exact: true })).toBeVisible();
  expect(requests).toEqual([{ body: { query: `${prefilled} raw`, condition: "raw", period: "1y", grader: "", grade: "" }, csrf, method: "POST" }]);
  const results = page.getByRole("region", { name: "3 auction sales found", exact: true });
  const salesDropdown = results.locator("details.sales-dropdown");
  await expect(salesDropdown).not.toHaveAttribute("open", "");
  await expect(results.getByRole("region", { name: "Sales history", exact: true }).getByRole("slider")).toBeVisible();
  await salesDropdown.locator("summary").click();
  await expect(results.getByRole("list", { name: "Auction sales", exact: true }).getByText("Raw · condition not assessed", { exact: true })).toHaveCount(3);
  const history = results.getByRole("region", { name: "Sales history", exact: true });
  await expect(history.locator(".sales-history-point")).toHaveCount(3);
  await expect(history.getByRole("slider")).toHaveAttribute("aria-valuetext", /USD\s*150\.00/);
  await expect(results.getByRole("link", { name: "View auction source ↗", exact: true }).first()).toHaveAttribute("href", "https://example.invalid/auction-fixture/raw/2");
  await expect(results).toContainText("1 record was omitted by filters or validation.");
  await expect(results).toContainText("Live provider access is not verified");
  await query.fill(`${prefilled} PSA 9`);
  await page.getByLabel("Sale condition", { exact: true }).selectOption("graded");
  await page.getByLabel("Grading company", { exact: true }).fill("PSA");
  await page.getByLabel("Grade", { exact: true }).fill("9");
  await page.getByLabel("Sale period", { exact: true }).selectOption("6m");
  expect(requests).toHaveLength(1);
  await submit.click();
  await expect(salesDropdown).not.toHaveAttribute("open", "");
  await salesDropdown.locator("summary").click();
  await expect(results.getByRole("list", { name: "Auction sales", exact: true }).getByText("PSA 9", { exact: true })).toHaveCount(3);
  expect(requests[1]).toEqual({ body: { query: `${prefilled} PSA 9`, condition: "graded", period: "6m", grader: "PSA", grade: "9" }, csrf, method: "POST" });
  await expect(results.getByRole("link", { name: "View auction source ↗", exact: true }).first()).toHaveAttribute("href", "https://example.invalid/auction-fixture/graded/2");
  expect(await (await page.request.get("/api/cards")).json()).toEqual(before);
  await expectFits(page);
  await testInfo.attach("Auction search fixture results; no live provider verification", {
    body: await page.screenshot({ path: testInfo.outputPath("auction-search-fixture.png"), fullPage: true }), contentType: "image/png",
  });
});

test("auction search fixture: pending, quota and outage errors clear stale charts and retry distinguishes empty results", async ({ page }, testInfo) => {
  let attempt = 0;
  let release: (() => void) | undefined;
  await page.route("**/api/market/status", route => route.fulfill({ json: { provider: "cardsight", configured: true } }));
  await page.route("**/api/market/search", async route => {
    const body = route.request().postDataJSON();
    attempt += 1;
    if (attempt === 1) return route.fulfill({ json: fixtureResult(body.query) });
    if (attempt === 2) {
      await new Promise<void>(resolve => { release = resolve; });
      return route.fulfill({ status: 429, json: { detail: "Fixture search quota reached." } });
    }
    if (attempt === 3) return route.fulfill({ status: 503, json: { detail: "Fixture provider is temporarily unavailable." } });
    return route.fulfill({ json: { ...fixtureResult(body.query), items: [], returned_count: 0, discarded_count: 0 } });
  });
  await signIn(page);
  await page.getByLabel("Card search", { exact: true }).fill("Michael Jordan fixture search");
  const submit = page.getByRole("button", { name: "Search sales", exact: true });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("region", { name: "Sales history", exact: true })).toBeVisible();
  try {
    await submit.click();
    await expect(page.getByRole("status").filter({ hasText: "Finding completed auction sales…" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Searching auctions…", exact: true })).toBeDisabled();
    await expect(page.getByRole("region", { name: "Sales history", exact: true })).toHaveCount(0);
    await expect.poll(() => typeof release).toBe("function");
    release!();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Fixture search quota reached.");
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Fixture provider is temporarily unavailable.");
    await expect(page.getByRole("heading", { name: /auction sales found/ })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Sales history", exact: true })).toHaveCount(0);
    await submit.click();
    await expect(page.getByRole("heading", { name: "0 auction sales found", exact: true })).toBeVisible();
    await expect(page.getByText("No completed auctions matched these filters. Try another card description or a wider period.", { exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Sales history", exact: true })).toHaveCount(0);
    expect(attempt).toBe(4);
    await expectFits(page);
    await testInfo.attach("Empty auction response fixture after quota and outage retries", {
      body: await page.screenshot({ path: testInfo.outputPath("auction-empty-fixture.png"), fullPage: true }), contentType: "image/png",
    });
  } finally { release?.(); }
});

test("auction sale inspection links list evidence to pointer, touch, keyboard and range selection without another search", async ({ page }, testInfo) => {
  const base = fixtureResult("1986 Fleer Michael Jordan #57 PSA 9", "graded");
  const observations = [
    { id: "old-sale", daysAgo: 400, price: "90.00" },
    { id: "same-day-low", daysAgo: 40, price: "100.00" },
    { id: "same-day-high", daysAgo: 40, price: "200.00" },
    { id: "identical-first", daysAgo: 20, price: "150.00" },
    { id: "identical-second", daysAgo: 20, price: "150.00" },
  ];
  const report: MarketSearch = {
    ...base, discarded_count: 0, returned_count: observations.length,
    items: observations.map((observation, index) => ({
      ...base.items[0], id: observation.id, price: observation.price, sold_on: soldOn(observation.daysAgo),
      title: `1986 Fleer Michael Jordan #57 PSA 9 auction ${index + 1} — full source description ${observation.id}`,
      source: "eBay", source_url: `https://www.ebay.com/itm/fixture-${observation.id}`,
      image_url: observation.id === "same-day-low" ? "https://example.invalid/listing-preview.png" : observation.id === "same-day-high" ? "https://example.invalid/listing-unavailable.png" : null,
    })),
  };
  let searches = 0;
  await page.route("https://example.invalid/listing-preview.png", route => route.fulfill({
    contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="112"><rect width="80" height="112" fill="#1b4a62"/><rect x="8" y="8" width="64" height="96" fill="#d5c18a"/></svg>',
  }));
  await page.route("https://example.invalid/listing-unavailable.png", route => route.fulfill({ status: 404, body: "Missing fixture image" }));
  await page.route("**/api/market/status", route => route.fulfill({ json: { provider: "cardsight", configured: true } }));
  await page.route("**/api/market/search", route => { searches += 1; return route.fulfill({ json: report }); });
  await signIn(page);
  await page.getByLabel("Card search", { exact: true }).fill(report.query);
  await page.getByRole("button", { name: "Search sales", exact: true }).click();
  const list = page.getByRole("list", { name: "Auction sales", exact: true });
  const history = page.getByRole("region", { name: "Sales history", exact: true });
  const slider = history.getByRole("slider", { name: "Explore card sales history", exact: true });
  const detail = page.getByRole("region", { name: "Selected auction sale", exact: true });
  const points = history.locator(".sales-history-point");
  const salesDropdown = page.locator("details").filter({ has: page.getByText("Sales · 5", { exact: true }) });
  await expect(salesDropdown).not.toHaveAttribute("open", "");
  await expect(history.getByRole("slider")).toBeVisible();
  await expect(list).toBeHidden();
  await salesDropdown.locator("summary").click();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await expect(points).toHaveCount(5);
  for (const sale of report.items) await expect(list.locator(`[data-sale-id="${sale.id}"]`)).toContainText(sale.title);
  const previewTitle = report.items[1].title, failedTitle = report.items[2].title;
  const preview = list.getByRole("img", { name: `Listing preview for ${previewTitle}`, exact: true });
  await preview.scrollIntoViewIfNeeded();
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await list.locator('[data-sale-id="same-day-high"]').scrollIntoViewIfNeeded();
  await expect(list.getByRole("img", { name: `Listing image unavailable for ${failedTitle}`, exact: true })).toBeVisible();

  async function expectSelected(id: string) {
    const sale = report.items.find(item => item.id === id)!;
    await expect(detail).toContainText(sale.title);
    await expect(detail).toContainText("PSA 9");
    await expect(detail).toContainText("eBay");
    await expect(detail.getByRole("link", { name: "View selected auction source ↗", exact: true })).toHaveAttribute("href", sale.source_url);
    await expect(list.locator('[data-selected="true"]')).toHaveCount(1);
    await expect(list.locator(`[data-sale-id="${id}"]`)).toHaveAttribute("data-selected", "true");
  }

  await inspectPoint(page, points.nth(1), Boolean(testInfo.project.use.hasTouch));
  await expectSelected("same-day-low");
  await expect(detail.getByRole("img", { name: `Listing preview for ${previewTitle}`, exact: true })).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", /USD\s*100\.00/);
  await inspectPoint(page, points.nth(2), Boolean(testInfo.project.use.hasTouch));
  await expectSelected("same-day-high");
  await expect(detail.getByRole("img", { name: `Listing image unavailable for ${failedTitle}`, exact: true })).toBeVisible();
  await expect(slider).toHaveAttribute("aria-valuetext", /USD\s*200\.00/);

  await slider.focus();
  await slider.press("Home");
  await expectSelected("old-sale");
  await slider.press("End");
  await expectSelected("identical-second");
  await slider.press("ArrowLeft");
  await expectSelected("identical-first");
  await slider.press("ArrowRight");
  await expectSelected("identical-second");
  await history.getByRole("button", { name: "Previous sale", exact: true }).click();
  await expectSelected("identical-first");
  await history.getByRole("button", { name: "Next sale", exact: true }).click();
  await expectSelected("identical-second");

  await history.getByRole("button", { name: "Last week", exact: true }).click();
  await expect(history).toContainText("No matching sales in this range.");
  await expect(detail).toHaveCount(0);
  await expect(list.locator('[data-selected="true"]')).toHaveCount(0);
  await expect(list.getByRole("listitem")).toHaveCount(5);
  await history.getByRole("button", { name: "All time", exact: true }).click();
  await expectSelected("identical-second");
  await expectFits(page);
  expect(searches).toBe(1);
  await salesDropdown.locator("summary").click();
  await expect(list).toBeHidden();
  await expect(slider).toBeVisible();
  await expect(detail).toBeVisible();
  await salesDropdown.locator("summary").click();
  await expectSelected("identical-second");
  await history.scrollIntoViewIfNeeded();
  await testInfo.attach("Selected completed auction with graph and linked sales list; fixture evidence", {
    body: await page.screenshot({ path: testInfo.outputPath("auction-sale-inspection-fixture.png"), fullPage: true }), contentType: "image/png",
  });
});
