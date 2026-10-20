import { expect, test, type Page } from "@playwright/test";

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

async function navigate(page: Page, name: "Home" | "My Collection") {
  await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true, level: 1 })).toBeVisible();
}

test("collection history and row graphs use dated comparable sales while purchase costs remain unknown", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await signIn(page);
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const subject = `Observed value history ${testInfo.project.name}`;
  const response = await page.request.post("/api/cards", { headers, data: {
    subject, year: 2020, sport: "Basketball", manufacturer: "History test", set_name: "Dated sales fixture", card_number: "150",
  } });
  expect(response.status()).toBe(201);
  const card = await response.json();
  const comparablePath = `/api/cards/${card.id}/comparables`;
  const sales = [
    { daysAgo: 60, price: "100.00" }, { daysAgo: 30, price: "200.00" }, { daysAgo: 5, price: "150.00" },
  ].map(sale => ({ ...sale, soldOn: new Date(Date.now() - sale.daysAgo * 86_400_000).toISOString().slice(0, 10) }));
  try {
    for (const [index, sale] of sales.entries()) {
      const saved = await page.request.post(comparablePath, { headers, data: {
        expected_definition_id: card.definition_id, sold_on: sale.soldOn, price: sale.price, currency: "USD",
        condition: "raw", grader: "", grade: "", source: `Value history fixture ${testInfo.project.name} ${index}`,
        source_url: `https://example.invalid/value-history/${testInfo.project.name}/${index}`,
      } });
      expect(saved.status()).toBe(201);
    }
    await navigate(page, "Home");
    const overview = page.getByRole("region", { name: "Collection estimate overview", exact: true });
    await expect(overview).toBeVisible();
    await expect(overview).toHaveAttribute("aria-busy", "false");
    await expect(overview.locator(".value-overview-amount")).toHaveText(/USD\s*150\.00/);
    await expect(page.getByRole("main")).not.toContainText(/demo|fictional/i);
    await expect(page.getByRole("group", { name: "Report source", exact: true })).toHaveCount(0);
    if ((page.viewportSize()?.width ?? 1440) <= 680) {
      await expect(overview.getByRole("button", { name: "Hide value chart", exact: true })).toHaveAttribute("aria-expanded", "true");
    }
    const summary = page.getByRole("region", { name: "Collection summary", exact: true });
    await expect(summary).toBeVisible();
    expect(await overview.evaluate((node, target) => Boolean(node.compareDocumentPosition(target!) & Node.DOCUMENT_POSITION_FOLLOWING), await summary.elementHandle())).toBe(true);

    const slider = overview.getByRole("slider", { name: "Explore collection estimate history", exact: true });
    const ranges = ["All time", "Last year", "Last six months", "Last three months", "Last month", "Last week"];
    for (const range of ranges) {
      await overview.getByRole("button", { name: range, exact: true }).click();
      await expect(overview.getByRole("button", { name: range, exact: true })).toHaveAttribute("aria-pressed", "true");
      for (const other of ranges.filter(name => name !== range)) {
        await expect(overview.getByRole("button", { name: other, exact: true })).toHaveAttribute("aria-pressed", "false");
      }
      await expect(slider).toBeVisible();
      await slider.focus();
      await page.keyboard.press("Home");
      await expect(slider).toHaveAttribute("aria-valuetext", /unknown|insufficient/i);
      await page.keyboard.press("End");
      await expect(slider).toHaveAttribute("aria-valuetext", /USD\s*150\.00/);
      await expect(overview.locator(".value-overview-amount")).toHaveText(/USD\s*150\.00/);
    }
    await overview.getByRole("button", { name: "Last three months", exact: true }).click();
    await slider.focus();
    await page.keyboard.press("Home");
    const first = await slider.getAttribute("aria-valuetext");
    await page.keyboard.press("ArrowRight");
    expect(await slider.getAttribute("aria-valuetext")).not.toBe(first);
    await page.keyboard.press("End");
    await slider.blur();
    await testInfo.attach("Home estimate history from three dated sales", { body: await page.screenshot({ path: testInfo.outputPath("home-observed-history.png"), fullPage: true }), contentType: "image/png" });

    await navigate(page, "My Collection");
    const record = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
    await expect(record).toBeVisible();
    await expect(page.getByLabel("Row values", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Card trend period", { exact: true })).toHaveCount(0);
    await expect(record.locator(".row-value")).toContainText(/USD\s*150\.00/);
    await expect(record.getByText("Comparable sales", { exact: true })).toBeVisible();
    const history = record.getByRole("img", { name: /Sale price history.*3 recorded comparable sales/ });
    await expect(history).toBeVisible();
    await expect(history.locator("circle")).toHaveCount(3);
    for (const sale of sales) {
      await expect(history.locator("desc")).toContainText(new RegExp(`${sale.soldOn}: USD\\s*${sale.price.replace(".", "\\.")}`));
    }
    const more = record.getByRole("button", { name: "More card details", exact: true });
    if (await more.isVisible()) await more.click();
    await expect(record.locator(".row-purchase")).toContainText("Unknown");
    await expect(page.getByRole("main")).not.toContainText(/demo|fictional/i);
    await testInfo.attach("Collection row with observed sales and unknown purchase", { body: await page.screenshot({ path: testInfo.outputPath("collection-observed-sales.png"), fullPage: true }), contentType: "image/png" });

    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit card", exact: true });
    await expect(editor.getByLabel("Purchase price", { exact: true })).toHaveValue("");
    await editor.getByRole("button", { name: "Close card editor", exact: true }).click();
    await page.reload();
    await expect(record.locator(".row-value")).toContainText(/USD\s*150\.00/);
    await expect(history).toBeVisible();
    const savedCard = await (await page.request.get(`/api/cards/${card.id}`)).json();
    expect(savedCard.purchase_price).toBeNull();
    expect(savedCard.total_cost).toBeNull();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    const comparables = await page.request.get(comparablePath);
    if (comparables.ok()) for (const sale of (await comparables.json()).items) {
      expect((await page.request.delete(`${comparablePath}/${sale.id}`, { headers })).status()).toBe(204);
    }
    const latest = await page.request.get(`/api/cards/${card.id}`);
    if (latest.ok()) expect((await page.request.delete(`/api/cards/${card.id}?revision=${(await latest.json()).revision}`, { headers })).status()).toBe(204);
  }
});

test("an unavailable estimate service hides amounts and history, then retry restores the honest empty state", async ({ page }) => {
  await page.route("**/api/estimates", route => route.fulfill({ status: 503, json: { detail: "Estimate storage is temporarily unavailable." } }));
  await signIn(page);
  await navigate(page, "Home");
  const overview = page.getByRole("region", { name: "Collection estimate overview", exact: true });
  await expect(overview.getByRole("alert")).toContainText("Couldn’t load collection estimates.");
  await expect(overview.getByText("Chart unavailable", { exact: true })).toBeVisible();
  await expect(overview.locator(".value-overview-amount")).toHaveText("—");
  await expect(overview.getByRole("slider", { name: "Explore collection estimate history", exact: true })).toHaveCount(0);
  await expect(overview.locator(".value-history-line, .chart-history-point")).toHaveCount(0);

  await page.unroute("**/api/estimates");
  await overview.getByRole("button", { name: "Retry chart", exact: true }).click();
  await expect(overview).toHaveAttribute("aria-busy", "false");
  await expect(overview.getByRole("alert")).toHaveCount(0);
  await expect(overview.locator(".value-overview-amount")).toHaveText("Unknown");
  await expect(overview.getByText("No supported estimate history yet.", { exact: true })).toBeVisible();
  await expect(overview.getByRole("slider", { name: "Explore collection estimate history", exact: true })).toHaveCount(0);
  await expect(overview.locator(".value-history-line, .chart-history-point")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Report source", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Row values", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/demo|fictional/i);
});
