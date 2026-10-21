import { expect, test } from "@playwright/test";
import type { Card } from "../lib/cards";
import type { ComparableReport, Estimates } from "../lib/estimates";
import type { MarketCandidates } from "../lib/market-link";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password || process.env.SLABTRAK_TEST_LIVE_MARKET !== "1") throw new Error("Use the isolated browser helper with explicit live-provider opt-in.");

const cleanup = new Map<string, { copies: Card[]; headers: Record<string, string> }>();
test.afterEach(async ({ page }, testInfo) => {
  const fixture = cleanup.get(testInfo.testId);
  if (!fixture) return;
  cleanup.delete(testInfo.testId);
  testInfo.setTimeout(30_000);
  const failures: string[] = [];
  for (const card of [...fixture.copies].reverse()) {
    try {
      const current = await page.request.get(`/api/cards/${card.id}`, { timeout: 10_000 });
      if (current.ok()) {
        const removed = await page.request.delete(`/api/cards/${card.id}?revision=${(await current.json()).revision}`, { headers: fixture.headers, timeout: 10_000 });
        if (removed.status() !== 204) failures.push(`Card cleanup returned ${removed.status()}.`);
      } else if (current.status() !== 404) failures.push(`Card lookup returned ${current.status()}.`);
    } catch { failures.push("Live test card cleanup request failed."); }
  }
  if (failures.length) {
    await testInfo.attach("Live fixture cleanup failure", { body: Buffer.from(failures.join("\n")), contentType: "text/plain" });
    if (testInfo.status === testInfo.expectedStatus) throw new Error(failures.join(" "));
  }
});

test("real exact-card confirmation values raw and PSA-graded Barkley copies without changing acquisition records", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto("/collection");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Collection", exact: true, level: 1 })).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  const headers = { Origin: "http://localhost:3000", "X-CSRF-Token": session.csrf_token };
  const copies: Card[] = [];
  cleanup.set(testInfo.testId, { copies, headers });
  const reports = new Map<string, ComparableReport>();
  const evidence: Record<string, unknown>[] = [];
    for (const graded of [false, true]) {
      const response = await page.request.post("/api/cards", { headers, data: {
        subject: "Charles Barkley", year: 1986, sport: "Basketball", manufacturer: "Fleer",
        set_name: "Fleer", card_number: "7", condition: graded ? "graded" : "raw",
        ...(graded ? { grader: "PSA", grade: "8" } : { raw_condition: "unspecified" }),
      } });
      expect(response.status()).toBe(201);
      copies.push(await response.json() as Card);
    }
    for (const card of copies) {
      const path = `/api/cards/${card.id}/comparables`;
      const beforeReport = await (await page.request.get(path)).json() as ComparableReport;
      expect(beforeReport.items).toHaveLength(0);
      expect(card.purchase_price).toBeNull();
      expect(card.total_cost).toBeNull();
      await page.goto(`/collection/${card.id}/market`);
      const candidatesResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/cards/${card.id}/market-link/candidates` && response.request().method() === "POST");
      await page.getByRole("button", { name: "Find exact card", exact: true }).click();
      const candidateResponse = await candidatesResponse;
      expect(candidateResponse.status()).toBe(200);
      const catalog = await candidateResponse.json() as MarketCandidates;
      const exact = catalog.candidates.filter(candidate => candidate.eligible);
      expect(exact).toHaveLength(1);
      expect(exact[0].name).toBe("Charles Barkley");
      expect(exact[0].year).toBe("1986-87");
      expect(exact[0].number).toBe("7");
      expect(exact[0].parallel_id).toBeNull();
      expect(exact[0].release_name).toMatch(/Fleer/i);
      if (card.condition === "graded") {
        expect(catalog.grade_options.length).toBeGreaterThan(0);
        if (catalog.grade_options.length > 1) {
          const nonAutograph = catalog.grade_options.filter(option => !/autograph|\bDNA\b|qualified/i.test(option.label));
          const standard = nonAutograph.filter(option => /standard|numerical|card/i.test(option.label));
          const selected = standard.length === 1 ? standard : nonAutograph;
          expect(selected, "The PSA grading label must be unambiguous before confirming live pricing.").toHaveLength(1);
          await page.getByRole("combobox", { name: "Grading label", exact: true }).selectOption(selected[0].id);
        }
      } else {
        expect(catalog.grade_options).toHaveLength(0);
        await expect(page.getByRole("combobox", { name: "Grading label", exact: true })).toHaveCount(0);
      }
      const choices = page.getByRole("list", { name: "Exact card candidates", exact: true }).getByRole("button", { name: /^Use this match/ }).and(page.locator("button:enabled"));
      await expect(choices).toHaveCount(1);
      const confirmationResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/cards/${card.id}/market-link` && response.request().method() === "POST");
      await choices.click();
      expect((await confirmationResponse).status()).toBe(200);
      await expect(page.getByTestId("card-market-estimate")).toHaveText(/USD\s*[\d,]+\.\d{2}/, { timeout: 30_000 });
      const result = await page.request.get(path);
      expect(result.status()).toBe(200);
      const report = await result.json() as ComparableReport;
      reports.set(card.id, report);
      expect(report.estimate.source).toBe("cardsight");
      expect(report.estimate.pricing_status).toBe("live");
      expect(Number(report.estimate.amount)).toBeGreaterThan(0);
      expect(report.estimate.sample_count).toBeGreaterThanOrEqual(3);
      expect(report.saved_history?.items).toHaveLength(0);
      const matching = report.items.filter(sale => report.matching_sale_ids.includes(sale.id));
      expect(matching.length).toBeGreaterThanOrEqual(3);
      expect(matching.every(sale => sale.condition === card.condition)).toBe(true);
      if (card.condition === "graded") expect(matching.every(sale => sale.grader === "PSA" && sale.grade === "8")).toBe(true);
      const history = page.locator("main > .card-sales-history");
      await expect(history.locator(".sales-history-point")).toHaveCount(matching.length);
      const slider = history.getByRole("slider", { name: "Explore card sales history", exact: true });
      await expect(slider).toBeVisible();
      const sales = page.locator("main > .saved-sales-list");
      await expect(sales).not.toHaveAttribute("open", "");
      await sales.locator("summary").click();
      await expect(sales.getByRole("listitem")).toHaveCount(matching.length);
      await sales.locator("summary").click();
      await expect(slider).toBeVisible();
      const point = history.locator(".sales-history-point").last();
      await point.scrollIntoViewIfNeeded();
      const box = await point.boundingBox(); expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      const selected = history.getByRole("region", { name: "Selected comparable sale", exact: true });
      const source = selected.getByRole("link", { name: "View sale source ↗", exact: true });
      await expect(source).toHaveAttribute("href", /^https:\/\//);
      const sourceUrl = await source.getAttribute("href");
      const sale = matching.find(item => item.source_url === sourceUrl);
      expect(sale).toBeDefined();
      const title = `${sale!.source} · ${sale!.sold_on}`;
      const preview = selected.getByRole("img", { name: `Listing preview for ${title}`, exact: true });
      const unavailable = selected.getByRole("img", { name: `Listing image unavailable for ${title}`, exact: true });
      await selected.scrollIntoViewIfNeeded();
      if (sale!.image_url) {
        await expect.poll(async () => (await unavailable.count()) > 0 || ((await preview.count()) > 0 && await preview.evaluate(image => (image as HTMLImageElement).complete)), { timeout: 10_000 }).toBe(true);
      }
      const imageLoaded = (await preview.count()) > 0 && await preview.evaluate(image => (image as HTMLImageElement).naturalWidth > 0);
      if (!imageLoaded) await expect(unavailable).toBeVisible();
      evidence.push({ condition: card.condition, grader: card.grader, grade: card.grade,
        amount: report.estimate.amount, sample_count: report.estimate.sample_count,
        provider: report.estimate.source, fetched_at: report.estimate.fetched_at,
        selected_sale_source: sale!.source, selected_sale_date: sale!.sold_on,
        selected_image_provided: !!sale!.image_url, selected_image_loaded: imageLoaded,
      });
      expect(await (await page.request.get(`/api/cards/${card.id}`)).json()).toEqual(card);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach(`Real CardSight ${card.condition} exact-card estimate and auction source`, {
        body: await page.screenshot({ path: testInfo.outputPath(`live-automatic-${card.condition}.png`), fullPage: true }), contentType: "image/png",
      });
    }
    const first = await (await page.request.get("/api/estimates")).json() as Estimates;
    for (const card of copies) {
      const estimate = first.items.find(item => item.card_id === card.id);
      expect(estimate?.source).toBe("cardsight"); expect(estimate?.pricing_status).toBe("live");
      expect(estimate?.amount).toBe(reports.get(card.id)!.estimate.amount);
    }
    const nav = page.getByRole("navigation", { name: "Workspace", exact: true });
    await nav.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.locator(".market-coverage")).toContainText("2 of 2");
    await nav.getByRole("link", { name: "Reports", exact: true }).click();
    await expect(page.getByRole("region", { name: "Collection value", exact: true }).locator(".market-coverage")).toContainText("2 of 2");
    await expect(page.locator('[data-metric="acquisition_spending"] .finance-amount')).toHaveText("Unknown");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Reports", exact: true, level: 1 })).toBeVisible();
    const again = await (await page.request.get("/api/estimates")).json() as Estimates;
    for (const card of copies) {
      expect(again.items.find(item => item.card_id === card.id)?.fetched_at).toBe(first.items.find(item => item.card_id === card.id)?.fetched_at);
      expect(await (await page.request.get(`/api/cards/${card.id}`)).json()).toEqual(card);
      const history = await (await page.request.get(`/api/cards/${card.id}/comparables`)).json() as ComparableReport;
      expect(history.saved_history?.items).toHaveLength(0);
    }
    await testInfo.attach("Live automatic valuation evidence; real provider responses, no intercepted endpoints or listing images", {
      body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: "application/json",
    });
    await testInfo.attach("Real raw and graded estimates in Reports; acquisition spending remains unknown", {
      body: await page.screenshot({ path: testInfo.outputPath("live-automatic-reports.png"), fullPage: true }), contentType: "image/png",
    });
});
