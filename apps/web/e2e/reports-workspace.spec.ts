import { expect, test, type Page } from "@playwright/test";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

async function signIn(page: Page) {
  await page.goto("/reports");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Reports", exact: true, level: 1 })).toBeVisible();
}

test("Reports always shows collection estimates and recorded costs with independent date scopes", async ({ page }, testInfo) => {
  await signIn(page);
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  // This regression uses the browser runner's disposable, empty account.
  // Comparable prices must never become recorded acquisition costs.
  const initial = await page.request.get("/api/cards?limit=100");
  expect(initial.ok()).toBe(true);
  expect((await initial.json()).total).toBe(0);
  const response = await page.request.post("/api/cards", { headers, data: {
    subject: `Workspace report ${testInfo.project.name}`, year: 2020, sport: "Basketball",
    manufacturer: "Reports test", set_name: "Isolated workspace fixture", card_number: "150",
  } });
  expect(response.status()).toBe(201);
  const card = await response.json();
  const comparablePath = `/api/cards/${card.id}/comparables`;
  try {
    // Older-than-week sales still support the current 180-day estimate snapshot.
    const soldOn = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    for (const [index, price] of ["100.00", "200.00", "150.00"].entries()) {
      const saved = await page.request.post(comparablePath, { headers, data: {
        expected_definition_id: card.definition_id, sold_on: soldOn, price, currency: "USD",
        condition: "raw", grader: "", grade: "", source: `Reports fixture ${testInfo.project.name} ${index}`,
        source_url: `https://example.invalid/reports/${testInfo.project.name}/${index}`,
      } });
      expect(saved.status()).toBe(201);
    }
    await page.reload();
    const estimates = page.getByRole("region", { name: "Collection value", exact: true });
    const history = page.getByRole("region", { name: "Collection estimate overview", exact: true });
    const estimateChart = history.getByRole("slider", { name: "Explore collection estimate history", exact: true });
    const conditionBreakdown = page.getByRole("region", { name: "Collection breakdown", exact: true });
    const recorded = page.getByRole("region", { name: "Recorded finances", exact: true });
    async function expectCollectionReport() {
      await expect(estimates.locator(".market-headline strong")).toHaveText(/USD\s*150\.00/);
      await expect(estimates.locator(".market-coverage")).toContainText(/1 of 1/);
      await expect(estimates.getByText("Current snapshot · independent of the spending period", { exact: true })).toBeVisible();
      await expect(recorded.getByLabel("Finance period", { exact: true })).toHaveValue("all");
      await expect(recorded.locator('[data-metric="acquisition_spending"] .finance-amount')).toHaveText("Unknown");
      await expect(recorded.locator('[data-metric="net_sales"] .finance-amount')).toHaveText(/USD\s*0\.00/);
      await expect(recorded.locator('[data-metric="net_sales"] .finance-coverage')).toContainText("No sales in this period");
      await expect(estimateChart).toBeVisible();
      await expect(estimateChart).toHaveAttribute("aria-valuetext", /USD\s*150\.00/);
      await expect(conditionBreakdown.getByRole("img", { name: /^Estimated value by condition\./ })).toBeVisible();
      await expect(conditionBreakdown.locator('[data-condition="raw"]')).toContainText(/USD\s*150\.00/);
      await expect(conditionBreakdown.locator('[data-condition="graded"]')).toContainText(/No cards/i);
      await expect(conditionBreakdown.locator('[data-condition="graded"] .report-value-bar')).toHaveCount(0);
      await expect(recorded.getByRole("combobox", { name: "Financial chart metric", exact: true })).toBeVisible();
      if ((page.viewportSize()?.width ?? 1440) <= 680) {
        await expect(history.getByRole("button", { name: "Hide value chart", exact: true })).toHaveAttribute("aria-expanded", "true");
        await expect(recorded.getByRole("button", { name: "Hide financial chart", exact: true })).toHaveAttribute("aria-expanded", "true");
      }
      await expect(page.getByRole("group", { name: "Report source", exact: true })).toHaveCount(0);
      await expect(page.getByRole("main")).not.toContainText(/demo|fictional/i);
    }
    await expectCollectionReport();
    const ranges = history.getByRole("group", { name: "Chart time range", exact: true });
    await expect(ranges.getByRole("button")).toHaveCount(6);
    for (const name of ["All time", "Last year", "Last six months", "Last three months", "Last month", "Last week"]) {
      const range = ranges.getByRole("button", { name, exact: true });
      await range.click();
      await expect(range).toHaveAttribute("aria-pressed", "true");
      await expect(estimateChart).toBeVisible();
      await estimateChart.focus();
      await page.keyboard.press("End");
      await expect(estimateChart).toHaveAttribute("aria-valuetext", /USD\s*150\.00/);
      await expect(estimates.locator(".market-headline strong")).toHaveText(/USD\s*150\.00/);
      await expect(recorded.getByLabel("Finance period", { exact: true })).toHaveValue("all");
    }
    // The week still uses older supporting sales; inspecting its dates never changes the snapshot.
    await page.keyboard.press("Home");
    const startDate = await estimateChart.getAttribute("aria-valuetext");
    await expect(estimateChart).toHaveAttribute("aria-valuetext", /USD\s*150\.00/);
    await page.keyboard.press("End");
    expect(await estimateChart.getAttribute("aria-valuetext")).not.toBe(startDate);
    await expect(history.locator(".chart-cursor")).toHaveCount(1);
    await estimateChart.blur();
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === "/api/finances" && new URL(response.url()).searchParams.get("range") === "1w" && response.ok()),
      recorded.getByLabel("Finance period", { exact: true }).selectOption("1w"),
    ]);
    await expect(recorded).toHaveAttribute("aria-busy", "false");
    await expect(estimates.locator(".market-headline strong")).toHaveText(/USD\s*150\.00/);
    await expect(estimates.getByText("Current snapshot · independent of the spending period", { exact: true })).toBeVisible();
    await recorded.getByLabel("Finance period", { exact: true }).selectOption("all");
    await expectCollectionReport();
    expect((await (await page.request.get("/api/cards?limit=100")).json()).total).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach("Workspace Reports: supported estimate and unknown acquisition cost", { body: await page.screenshot({ path: testInfo.outputPath("reports-workspace.png"), fullPage: true }), contentType: "image/png" });

    const breakdown = recorded.locator("details").filter({ has: page.getByText("Sales and cost breakdown", { exact: true }) });
    await expect(breakdown).not.toHaveAttribute("open");
    await expect(recorded.locator('[data-metric="owned_cost"] .finance-amount')).toBeHidden();
    await breakdown.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(breakdown).toHaveAttribute("open", "");
    await expect(breakdown.locator('[data-metric="owned_cost"] .finance-amount')).toHaveText("Unknown");
    await expect(breakdown.locator('[data-metric="gross_sales"] .finance-amount')).toHaveText(/USD\s*0\.00/);
    await breakdown.locator("summary").click();

    await page.reload();
    await expectCollectionReport();
    await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "My Collection", exact: true }).click();
    await expect(page.getByRole("heading", { name: "My Collection", exact: true, level: 1 })).toBeVisible();
    await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "Reports", exact: true }).click();
    await expectCollectionReport();
    const savedCard = await (await page.request.get(`/api/cards/${card.id}`)).json();
    expect(savedCard.purchase_price).toBeNull();
    expect(savedCard.total_cost).toBeNull();
  } finally {
    const comparables = await page.request.get(comparablePath);
    if (comparables.ok()) for (const sale of (await comparables.json()).items) {
      expect((await page.request.delete(`${comparablePath}/${sale.id}`, { headers })).status()).toBe(204);
    }
    const latest = await page.request.get(`/api/cards/${card.id}`);
    if (latest.ok()) expect((await page.request.delete(`/api/cards/${card.id}?revision=${(await latest.json()).revision}`, { headers })).status()).toBe(204);
  }
});

test("condition charts separate currencies and leave unsupported categories unknown", async ({ page }, testInfo) => {
  await signIn(page);
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const ids: string[] = [];
  const soldOn = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  try {
    for (const fixture of [
      { currency: "USD", condition: "raw", prices: ["100.01", "150.25", "200.99"] },
      { currency: "USD", condition: "graded", prices: [] },
      { currency: "CAD", condition: "raw", prices: [] },
      { currency: "CAD", condition: "graded", prices: ["200.01", "275.75", "300.99"] },
    ]) {
      const grading = fixture.condition === "graded" ? { grader: "PSA", grade: "9" } : { grader: "", grade: "" };
      const response = await page.request.post("/api/cards", { headers, data: {
        subject: `Report currency ${testInfo.project.name} ${fixture.currency} ${fixture.condition}`,
        year: 2020, sport: "Basketball", manufacturer: "Reports test", set_name: "Condition currency fixture",
        card_number: `${fixture.currency}-${fixture.condition}`, currency: fixture.currency, condition: fixture.condition,
        ...grading,
      } });
      expect(response.status()).toBe(201);
      const card = await response.json();
      ids.push(card.id);
      for (const [index, price] of fixture.prices.entries()) {
        const saved = await page.request.post(`/api/cards/${card.id}/comparables`, { headers, data: {
          expected_definition_id: card.definition_id, sold_on: soldOn, price, currency: fixture.currency,
          condition: fixture.condition, ...grading, source: `Currency fixture ${testInfo.project.name} ${fixture.currency} ${index}`,
          source_url: `https://example.invalid/reports-currencies/${testInfo.project.name}/${fixture.currency}/${index}`,
        } });
        expect(saved.status()).toBe(201);
      }
    }
    await page.reload();
    const breakdown = page.getByRole("region", { name: "Collection breakdown", exact: true });
    const currency = breakdown.getByRole("combobox", { name: "Breakdown currency", exact: true });
    const chart = breakdown.getByRole("img", { name: /^Estimated value by condition\./ });
    const raw = breakdown.locator('[data-condition="raw"]');
    const graded = breakdown.locator('[data-condition="graded"]');
    await expect(chart).toBeVisible();
    await currency.selectOption("USD");
    await expect(raw).toContainText(/USD\s*150\.25/);
    await expect(raw).toContainText(/1 of 1/);
    await expect(graded).toContainText(/Unknown/);
    await expect(graded).toContainText(/0 of 1/);
    await expect(graded.locator(".report-value-bar")).toHaveCount(0);
    await expect(raw.locator(".report-value-bar")).toHaveCount(1);
    await expect(chart.locator(".report-value-bar")).toHaveCount(1);
    await expect(chart).toHaveAttribute("aria-label", /Raw cards.*USD\s*150\.25/);
    await expect(chart).toHaveAttribute("aria-label", /Graded cards.*Unknown/i);
    await expect(breakdown).not.toContainText(/275\.75|426\.00/);

    await currency.selectOption("CAD");
    await expect(raw).toContainText(/Unknown/);
    await expect(raw).toContainText(/0 of 1/);
    await expect(graded).toContainText(/CAD\s*275\.75/);
    await expect(graded).toContainText(/1 of 1/);
    await expect(raw.locator(".report-value-bar")).toHaveCount(0);
    await expect(graded.locator(".report-value-bar")).toHaveCount(1);
    await expect(chart.locator(".report-value-bar")).toHaveCount(1);
    await expect(chart).toHaveAttribute("aria-label", /Raw cards.*Unknown/i);
    await expect(chart).toHaveAttribute("aria-label", /Graded cards.*CAD\s*275\.75/);
    await expect(breakdown).not.toContainText(/150\.25|426\.00/);

    const snapshot = page.getByRole("region", { name: "Collection value", exact: true });
    await snapshot.getByRole("combobox", { name: "Estimate currency", exact: true }).selectOption("USD");
    await expect(snapshot.locator(".market-headline strong")).toHaveText(/USD\s*150\.25/);
    // The two saved-record reports keep their own currency choices.
    await expect(currency).toHaveValue("CAD");
    const finances = page.getByRole("region", { name: "Recorded finances", exact: true });
    await expect(finances.locator('[data-metric="acquisition_spending"] .finance-amount')).toHaveText("Unknown");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await testInfo.attach("Reports: separate raw and graded evidence in two currencies", { body: await page.screenshot({ path: testInfo.outputPath("reports-condition-currencies.png"), fullPage: true }), contentType: "image/png" });

    // A failed refresh must remove the previously drawn amounts, not leave a plausible stale chart.
    const history = page.getByRole("region", { name: "Collection estimate overview", exact: true });
    await page.route("**/api/estimates", route => route.fulfill({ status: 503, json: { detail: "Estimate storage is temporarily unavailable." } }));
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(history.getByRole("alert")).toContainText("Couldn’t load collection estimates.");
    await expect(history.getByText("Chart unavailable", { exact: true })).toBeVisible();
    await expect(history.getByRole("slider", { name: "Explore collection estimate history", exact: true })).toHaveCount(0);
    await expect(history.locator(".value-history-line, .chart-history-point")).toHaveCount(0);
    await expect(breakdown.getByRole("alert")).toBeVisible();
    await expect(chart).toHaveCount(0);
    await expect(breakdown).not.toContainText(/150\.25|275\.75/);
    await page.unroute("**/api/estimates");
    await history.getByRole("button", { name: "Retry chart", exact: true }).click();
    await expect(history.getByRole("alert")).toHaveCount(0);
    await expect(history.getByRole("slider", { name: "Explore collection estimate history", exact: true })).toHaveAttribute("aria-valuetext", /USD\s*150\.25/);
    await breakdown.getByRole("button", { name: "Retry collection breakdown", exact: true }).click();
    await expect(breakdown.getByRole("alert")).toHaveCount(0);
    await expect(currency).toHaveValue("CAD");
    await expect(graded).toContainText(/CAD\s*275\.75/);
    await expect(raw).toContainText(/Unknown/);
    await expect(chart.locator(".report-value-bar")).toHaveCount(1);
  } finally {
    for (const id of ids) {
      const path = `/api/cards/${id}/comparables`;
      const comparables = await page.request.get(path);
      if (comparables.ok()) for (const sale of (await comparables.json()).items) {
        expect((await page.request.delete(`${path}/${sale.id}`, { headers })).status()).toBe(204);
      }
      const latest = await page.request.get(`/api/cards/${id}`);
      if (latest.ok()) expect((await page.request.delete(`/api/cards/${id}?revision=${(await latest.json()).revision}`, { headers })).status()).toBe(204);
    }
  }
});
