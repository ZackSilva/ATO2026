import { expect, test, type Locator, type Page } from "@playwright/test";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your collection", exact: true })).toBeVisible();
  await expect(page.getByText("Loading cards…", { exact: true })).toBeHidden();
}

async function deleteTestCard(page: Page, record: Locator, subject: string) {
  const dialog = page.getByRole("dialog");
  if (await dialog.isVisible()) {
    await dialog.getByRole("button", { name: "Close card editor", exact: true }).click();
  }
  await page.getByLabel("Search collection", { exact: true }).fill(subject);
  await expect(page.getByText("Loading cards…", { exact: true })).toBeHidden();
  await expect(record).toBeVisible();
  await record.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Delete card…", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm permanent deletion", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(record).toBeHidden();
}

test("demo overview ranges, metrics and richer rows stay separate from saved costs", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const subject = `Chart demo test ${testInfo.project.name} ${Date.now()}`;
  await signIn(page);
  await page.getByRole("button", { name: "+ Add card", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Player(s) or subject (required)").fill(subject);
  await editor.getByRole("button", { name: "Save card", exact: true }).click();
  await expect(editor).toBeHidden();
  const record = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
  await expect(record).toBeVisible();

  try {
    const overview = page.getByRole("region", { name: "Collection value overview", exact: true });
    await expect(overview).toBeVisible();
    await expect(overview).toContainText(/demo/i);
    await expect(page.locator('[aria-label="Collection summary"]')).not.toContainText("Purchase price unknown");
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

    await expect(record.locator(".row-value")).toContainText(/(?:USD|\$)\s*[\d,]+\.\d{2}/);
    await expect(record.locator(".row-purchase")).toContainText(/(?:USD|\$)\s*[\d,]+\.\d{2}/);
    await expect(record.locator(".row-trend").getByRole("img", { name: /Demo value trend/ })).toBeVisible();
    const unfilteredAmount = await amount.innerText();
    await page.getByLabel("Search collection", { exact: true }).fill(`No matching chart test ${Date.now()}`);
    await expect(page.getByRole("heading", { name: "No matching cards.", exact: true })).toBeVisible();
    await expect(amount).toHaveText(unfilteredAmount);
    await page.getByLabel("Search collection", { exact: true }).fill("");
    await expect(record).toBeVisible();

    await record.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
    await expect(editor.getByLabel("Purchase price", { exact: true })).toHaveValue("");
    await editor.getByRole("button", { name: "Close card editor", exact: true }).click();
    await page.reload();
    await expect(record).toBeVisible();
    await record.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
    await expect(editor.getByLabel("Purchase price", { exact: true })).toHaveValue("");
    await editor.getByRole("button", { name: "Close card editor", exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("value-overview-and-rows.png"), fullPage: true });
  } finally {
    await deleteTestCard(page, record, subject);
  }
});
