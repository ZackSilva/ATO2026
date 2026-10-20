import { expect, test, type Locator, type Page } from "@playwright/test";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

async function signIn(page: Page) {
  await page.goto("/collection");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your collection", exact: true })).toBeVisible();
  await expect(page.getByText("Loading cards…", { exact: true })).toBeHidden();
}

async function deleteTestCard(page: Page, record: Locator, subject: string) {
  if (new URL(page.url()).pathname !== "/collection") await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "My Collection", exact: true }).click();
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) {
    await dialog.getByRole("button", { name: "Close card editor", exact: true }).click();
  }
  await page.getByLabel("Search collection", { exact: true }).fill(subject);
  await expect(page.getByText("Loading cards…", { exact: true })).toBeHidden();
  await expect(record).toBeVisible();
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Delete card…", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm permanent deletion", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(record).toBeHidden();
}

test("Home chart is prominent and collection mini graphs distinguish demos from recorded values", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const subject = `Chart demo test ${testInfo.project.name} ${Date.now()}`;
  await signIn(page);
  const addCard = page.getByRole("button", { name: "+ Add card", exact: true });
  if ((page.viewportSize()?.width ?? 1440) <= 680) {
    const actionBounds = await addCard.boundingBox();
    expect(actionBounds?.y).toBeLessThan(400);
  }
  await addCard.click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Player(s) or subject (required)").fill(subject);
  await editor.getByRole("button", { name: "Save card", exact: true }).click();
  await expect(editor).toBeHidden();
  const record = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
  await expect(record).toBeVisible();

  try {
    await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "Home", exact: true }).click();
    const overview = page.getByRole("region", { name: "Collection value overview", exact: true });
    await expect(overview).toBeVisible();
    await expect(overview).toContainText(/demo/i);
    if ((page.viewportSize()?.width ?? 1440) <= 680) {
      await expect(overview.getByRole("button", { name: "Hide value chart", exact: true })).toHaveAttribute("aria-expanded", "true");
    }
    const summary = page.getByRole("region", { name: "Collection summary", exact: true });
    await expect(summary).toBeVisible();
    expect(await overview.evaluate((node, target) => Boolean(node.compareDocumentPosition(target!) & Node.DOCUMENT_POSITION_FOLLOWING), await summary.elementHandle())).toBe(true);

    const metric = overview.getByLabel("Chart metric", { exact: true });
    const slider = overview.getByRole("slider", { name: "Explore demo value history", exact: true });
    const ranges = ["All time", "Last year", "Last six months", "Last three months", "Last month", "Last week"];
    const startPoints = new Set<string>();
    for (const range of ranges) {
      await overview.getByRole("button", { name: range, exact: true }).click();
      await expect(overview.getByRole("button", { name: range, exact: true })).toHaveAttribute("aria-pressed", "true");
      for (const other of ranges.filter(name => name !== range)) {
        await expect(overview.getByRole("button", { name: other, exact: true })).toHaveAttribute("aria-pressed", "false");
      }
      await slider.focus();
      await page.keyboard.press("Home");
      const firstPoint = await slider.getAttribute("aria-valuetext");
      expect(firstPoint).toBeTruthy();
      startPoints.add(firstPoint!);
    }
    expect(startPoints.size).toBe(ranges.length);

    await page.keyboard.press("ArrowRight");
    const nextPoint = await slider.getAttribute("aria-valuetext");
    await page.keyboard.press("End");
    const lastPoint = await slider.getAttribute("aria-valuetext");
    expect(lastPoint).not.toBe(nextPoint);
    await page.keyboard.press("Home");
    expect(await slider.getAttribute("aria-valuetext")).not.toBe(lastPoint);

    const line = overview.locator(".value-history-line");
    const amount = overview.locator(".value-overview-amount");
    await page.keyboard.press("End");
    const collectionValue = await amount.innerText();
    await metric.selectOption("gain");
    await expect(metric).toHaveValue("gain");
    await expect(overview.getByRole("heading", { name: "Unrealized gain / loss", exact: true })).toBeVisible();
    // Gain subtracts a constant purchase baseline, so its normalized shape can match value.
    await expect(amount).not.toHaveText(collectionValue);
    const gainPath = await line.getAttribute("points");
    await metric.selectOption("purchase");
    await expect(metric).toHaveValue("purchase");
    await expect(overview.getByRole("heading", { name: "Purchase total", exact: true })).toBeVisible();
    await expect(line).not.toHaveAttribute("points", gainPath!);
    await metric.selectOption("value");
    await expect(overview.getByRole("heading", { name: "Collection value", exact: true })).toBeVisible();

    await testInfo.attach("Prominent Home demo chart", { body: await page.screenshot({ path: testInfo.outputPath("home-demo-chart.png"), fullPage: true }), contentType: "image/png" });
    await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "My Collection", exact: true }).click();
    await expect(overview).toHaveCount(0);
    const rowValues = page.getByLabel("Row values", { exact: true });
    await expect(rowValues).toHaveValue("demo");
    await expect(record.locator(".row-value")).toContainText(/Demo/i);
    await expect(record.locator(".row-value")).toContainText(/\$[\d,.]+/);
    const trend = record.getByRole("img", { name: /Demo value trend/ });
    await expect(trend).toBeVisible();
    const trendPeriod = page.getByLabel("Card trend period", { exact: true });
    const rowPaths = new Set<string>();
    for (const range of ["all", "1y", "6m", "3m", "1m", "1w"]) {
      await trendPeriod.selectOption(range);
      await expect(trendPeriod).toHaveValue(range);
      const points = await trend.locator("polyline").getAttribute("points");
      expect(points).toBeTruthy();
      rowPaths.add(points!);
    }
    expect(rowPaths.size).toBe(6);
    await testInfo.attach("Collection restored mini graphs", { body: await page.screenshot({ path: testInfo.outputPath("collection-mini-graphs.png"), fullPage: true }), contentType: "image/png" });
    const moreDetails = record.getByRole("button", { name: "More card details", exact: true });
    if (await moreDetails.isVisible()) {
      await expect(moreDetails).toHaveAttribute("aria-expanded", "false");
      await moreDetails.click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(record.getByRole("button", { name: "Fewer card details", exact: true })).toHaveAttribute("aria-expanded", "true");
    }
    await expect(record.locator(".row-purchase")).toContainText(/Unknown/i);
    await expect(record.locator(".row-purchase")).toContainText(/Demo purchase/i);
    await rowValues.selectOption("market");
    await expect(record.locator(".row-value")).toContainText(/Insufficient Market Data/i);
    await expect(record.getByRole("img", { name: /Demo value trend/ })).toHaveCount(0);
    await expect(trendPeriod).toHaveCount(0);
    await page.getByLabel("Search collection", { exact: true }).fill(`No matching chart test ${Date.now()}`);
    await expect(page.getByRole("heading", { name: "No matching cards.", exact: true })).toBeVisible();
    await page.getByLabel("Search collection", { exact: true }).fill("");
    await expect(record).toBeVisible();

    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await expect(editor.getByLabel("Purchase price", { exact: true })).toHaveValue("");
    await editor.getByRole("button", { name: "Close card editor", exact: true }).click();
    await page.reload();
    await expect(record).toBeVisible();
    await expect(rowValues).toHaveValue("demo");
    await expect(trend).toBeVisible();
    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await expect(editor.getByLabel("Purchase price", { exact: true })).toHaveValue("");
    await editor.getByRole("button", { name: "Close card editor", exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("value-overview-and-rows.png"), fullPage: true });
  } finally {
    await deleteTestCard(page, record, subject);
  }
});
