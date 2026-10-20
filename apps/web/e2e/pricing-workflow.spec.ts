import { expect, test, type Page } from "@playwright/test";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

const soldOn = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

async function setup(page: Page, subject: string, graded = true) {
  await page.goto("/collection");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Collection", exact: true, level: 1 })).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const created = await page.request.post("/api/cards", { headers, data: {
    subject, year: 2020, sport: "Basketball", manufacturer: "Test", set_name: "Pricing workflow", card_number: "7",
    ...(graded ? { condition: "graded", grader: "PSA", grade: "9" } : { raw_condition: "excellent" }),
  } });
  expect(created.status()).toBe(201);
  const card = await created.json();
  const path = `/api/cards/${card.id}/comparables`;
  return {
    card, path, headers,
    async report() {
      const response = await page.request.get(path);
      expect(response.status()).toBe(200);
      return response.json();
    },
    async cleanup() {
      const report = await page.request.get(path);
      if (report.ok()) for (const sale of (await report.json()).items) {
        expect((await page.request.delete(`${path}/${sale.id}`, { headers })).status()).toBe(204);
      }
      const latest = await page.request.get(`/api/cards/${card.id}`);
      if (latest.ok()) expect((await page.request.delete(`/api/cards/${card.id}?revision=${(await latest.json()).revision}`, { headers })).status()).toBe(204);
    },
  };
}

test("raw condition changes select matching sales and stale prices retain their historical graph", async ({ page }, testInfo) => {
  const subject = `Raw condition ${testInfo.project.name}`;
  const data = await setup(page, subject, false);
  try {
    await page.reload();
    const row = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
    await row.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Edit card", exact: true });
    await expect(editor.getByLabel("Raw condition", { exact: true })).toHaveValue("excellent");
    await editor.getByLabel("Raw condition", { exact: true }).selectOption("near_mint");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    expect((await (await page.request.get(`/api/cards/${data.card.id}`)).json()).raw_condition).toBe("near_mint");
    const samples = [
      { days: 120, price: "100.00", condition: "near_mint" },
      { days: 110, price: "101.00", condition: "near_mint" },
      { days: 100, price: "102.00", condition: "near_mint" },
      { days: 730, price: "80.00", condition: "near_mint" },
      { days: 3, price: "999.00", condition: "excellent" },
      { days: 2, price: "1000.00", condition: "excellent" },
      { days: 1, price: "1001.00", condition: "excellent" },
      { days: 0, price: "900.00", condition: "unspecified" },
    ];
    for (const [index, sample] of samples.entries()) {
      const response = await page.request.post(data.path, { headers: data.headers, data: {
        expected_definition_id: data.card.definition_id, sold_on: soldOn(sample.days), price: sample.price,
        condition: "raw", raw_condition: sample.condition, source: `Raw condition auction ${index}`,
        source_url: `https://example.invalid/pricing/${testInfo.project.name}/raw/${index}`,
      } });
      expect(response.status()).toBe(201);
    }
    await page.goto(`/collection/${data.card.id}/market`);
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*101\.00/);
    await expect(page.getByRole("status").filter({ hasText: /^Evidence needs a refresh/ })).toBeVisible();
    await expect(page.locator("main input, main select, main textarea")).toHaveCount(0);
    const history = page.getByRole("region", { name: "Sales history", exact: true });
    await expect(history.locator(".sales-history-point")).toHaveCount(4);
    await expect(history.getByRole("slider")).toHaveAttribute("aria-valuetext", /USD\s*102\.00/);
    expect((await data.report()).estimate.sample_count).toBe(3);
    await testInfo.attach("Raw condition matching with visible stale evidence and two-year history", {
      body: await page.screenshot({ path: testInfo.outputPath("raw-condition-history.png"), fullPage: true }), contentType: "image/png",
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.goto("/collection");
    await row.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await editor.getByLabel("Raw condition", { exact: true }).selectOption("excellent");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    await page.goto(`/collection/${data.card.id}/market`);
    await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*1,000\.00/);
    await expect(page.getByRole("status").filter({ hasText: /^Evidence needs a refresh/ })).toBeHidden();
    await expect(history.locator(".sales-history-point")).toHaveCount(3);
    expect((await data.report()).estimate.history).toHaveLength(3);
  } finally { await data.cleanup(); }
});
