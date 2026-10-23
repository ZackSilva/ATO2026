import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { Card } from "../lib/cards";
import type { Comparable, ComparableReport, MarketEstimate } from "../lib/estimates";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

// These are synthetic browser fixtures, not observed catalog identities, certificates, or sales.
// Authentication, saving the user's draft, and cleanup use the real disposable test database.
const providerId = "f5905629-72a5-4fb3-8aab-42b871884201";
const draft = {
  id: providerId, subject: "Synthetic entry fixture", year: 2023, sport: "Baseball",
  manufacturer: "Fixture manufacturer", set_name: "Synthetic product", card_number: "17", parallel: "",
};
const proposal = {
  state: "found", verification_url: "https://www.psacard.com/cert/12345678",
  notice: "Synthetic certificate fixture; review before applying. No authenticity claim.",
  draft: { ...draft, condition: "graded", grader: "PSA", grade: "9", certification: "12345678" },
};
const cleanup = new Map<string, { headers: Record<string, string>; ids: string[] }>();

test.afterEach(async ({ page }, info) => {
  const fixture = cleanup.get(info.testId);
  if (!fixture) return;
  cleanup.delete(info.testId);
  info.setTimeout(30_000);
  const failures: string[] = [];
  for (const id of fixture.ids) {
    try {
      const current = await page.request.get(`/api/cards/${id}`, { timeout: 10_000 });
      if (current.status() === 404) continue;
      expect(current.ok()).toBe(true);
      const card = await current.json() as Card;
      const removed = await page.request.delete(`/api/cards/${id}?revision=${card.revision}`, {
        headers: fixture.headers, timeout: 10_000,
      });
      if (removed.status() !== 204) failures.push(`Card cleanup returned ${removed.status()}.`);
    } catch { failures.push("Card cleanup request failed."); }
  }
  if (failures.length) {
    await info.attach("Fixture cleanup failure", { body: Buffer.from(failures.join("\n")), contentType: "text/plain" });
    if (info.status === info.expectedStatus) throw new Error(failures.join(" "));
  }
});

async function openEntry(page: Page, info: TestInfo) {
  // Catch provider-facing calls unless a test deliberately supplies a synthetic response below.
  await page.route("**/api/market/**", route => route.fulfill({ status: 503, json: { detail: "Synthetic provider unavailable." } }));
  await page.route("**/api/certificates/**", route => route.fulfill({ status: 503, json: { detail: "Synthetic certificate unavailable." } }));
  await page.route("**/api/certificates/status", route => route.fulfill({ json: { graders: [
    { grader: "PSA", supported: true, configured: true, verification_url: "https://www.psacard.com/cert/" },
    ...["BGS", "SGC", "CGC"].map(grader => ({ grader, supported: false, configured: false, verification_url: "" })),
  ] } }));
  await page.goto("/collection");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My Collection", exact: true })).toBeVisible();
  const session = await (await page.request.get("/api/auth/me")).json();
  const fixture = { headers: { Origin: new URL(page.url()).origin, "X-CSRF-Token": session.csrf_token as string }, ids: [] as string[] };
  cleanup.set(info.testId, fixture);
  await page.getByRole("button", { name: "+ Add card", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Add a card", exact: true });
  await expect(editor).toBeVisible();
  return { editor, fixture };
}

async function saveDraft(page: Page, editor: Locator, fixture: { ids: string[] }, estimate = false) {
  const response = page.waitForResponse(value => new URL(value.url()).pathname === "/api/cards" && value.request().method() === "POST");
  await editor.getByRole("button", { name: estimate ? "Estimate Value" : "Save card", exact: true }).click();
  const saved = await response;
  expect(saved.status()).toBe(201);
  const card = await saved.json() as Card;
  fixture.ids.push(card.id);
  await expect(editor).toBeHidden();
  return card;
}

function marketReport(card: Card, priced: boolean): ComparableReport {
  const sales: Comparable[] = priced ? ["100.00", "150.00", "200.00"].map((price, index) => ({
    id: `synthetic-entry-sale-${index}`, definition_id: card.definition_id,
    sold_on: new Date(Date.now() - (5 - index) * 86_400_000).toISOString().slice(0, 10), price,
    currency: "USD", condition: card.condition, grader: card.grader, grade: card.grade,
    raw_condition: "unspecified", source: "Synthetic browser auction fixture",
    source_url: `https://example.invalid/synthetic-entry/${index}`, created_at: new Date().toISOString(),
  })) : [];
  const estimate: MarketEstimate = {
    card_id: card.id, currency: "USD", condition: card.condition, grader: card.grader, grade: card.grade,
    amount: priced ? "150.00" : null, low: priced ? "100.00" : null, high: priced ? "200.00" : null,
    sample_count: sales.length, latest_sale: sales.at(-1)?.sold_on ?? null,
    confidence: priced ? "low" : "insufficient", reason: "Synthetic browser evidence; no exact sales before confirmation.",
    source: "cardsight", pricing_status: priced ? "live" : "insufficient", raw_condition: "unspecified",
    fetched_at: priced ? new Date().toISOString() : null,
    history: sales.map(({ sold_on, price }) => ({ sold_on, price })),
  };
  return { items: sales, matching_sale_ids: sales.map(sale => sale.id), estimate };
}

async function mockMarket(page: Page, exact = true) {
  const state = { confirmed: false, confirmations: [] as unknown[], candidateRequests: 0 };
  let currentCard: Card | null = null;
  await page.route("**/api/estimates", route => route.fulfill({ json: {
    as_of: new Date().toISOString().slice(0, 10), window_days: 180, minimum_sales: 3,
    items: currentCard ? [marketReport(currentCard, state.confirmed).estimate] : [],
  } }));
  await page.route("**/api/cards/*/market-link**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const id = path.split("/")[3];
    const card = await (await page.request.get(`/api/cards/${id}`)).json() as Card;
    currentCard = card;
    if (request.method() === "GET") return route.fulfill({ json: { configured: true, link: state.confirmed ? {
      card_id: providerId, parallel_id: null, grade_id: null, confirmed_at: new Date().toISOString(), valid: true,
    } : null } });
    expect(request.headers()["x-csrf-token"]).toBeTruthy();
    if (path.endsWith("/candidates")) {
      state.candidateRequests += 1;
      expect(request.postDataJSON()).toEqual({ expected_definition_id: card.definition_id });
      return route.fulfill({ json: { definition_id: card.definition_id, grade_options: [],
        candidates: exact ? [{ id: providerId, name: card.subject, number: card.card_number,
          year: String(card.year), release_name: card.set_name, set_name: "Base Set", parallel_id: null,
          parallel_name: null, eligible: true, reason: "Review this synthetic exact-match fixture." }] : [],
        note: "Synthetic matching fixture. No live provider request or account quota used.",
      } });
    }
    const body = request.postDataJSON();
    expect(body.card_id).toBe(providerId);
    expect(body.expected_card_id).toBeNull();
    state.confirmations.push(body);
    state.confirmed = true;
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/cards/*/comparables", async route => {
    const id = new URL(route.request().url()).pathname.split("/")[3];
    const card = await (await page.request.get(`/api/cards/${id}`)).json() as Card;
    return route.fulfill({ json: marketReport(card, state.confirmed) });
  });
  return state;
}

test("query-first entry saves before explicit exact-match pricing and shows its sales graph", async ({ page }, info) => {
  test.setTimeout(60_000);
  const { editor, fixture } = await openEntry(page, info);
  const state = await mockMarket(page);
  let searches = 0, details = 0;
  await page.route("**/api/market/catalog/search", route => {
    searches += 1;
    expect(route.request().postDataJSON()).toEqual({ query: "2023 synthetic entry 17" });
    return route.fulfill({ json: { items: [draft], truncated: false, note: "Synthetic catalog fixture for review." } });
  });
  await page.route("**/api/market/catalog/card", route => {
    details += 1;
    expect(route.request().postDataJSON()).toEqual({ card_id: providerId });
    return route.fulfill({ json: { item: { ...draft, sport: "", manufacturer: "" }, note: "Review the synthetic card and parallel before saving." } });
  });
  const query = editor.getByLabel("Player, year, set, or card number", { exact: true });
  await expect(query).toBeFocused();
  await query.pressSequentially("2023 synthetic entry 17");
  expect(searches).toBe(0);
  await editor.getByRole("button", { name: "Search cards", exact: true }).click();
  await editor.getByRole("button", { name: /^Use card details/ }).click();
  await expect(editor.getByLabel("Player(s) or subject (required)", { exact: true })).toHaveValue(draft.subject);
  await expect(editor.getByLabel("Year", { exact: true })).toHaveValue("2023");
  await expect(editor.getByLabel("Sport / category", { exact: true })).toHaveValue(draft.sport);
  await expect(editor.getByLabel("Manufacturer", { exact: true })).toHaveValue(draft.manufacturer);
  await expect(editor.getByLabel("Set", { exact: true })).toHaveValue(draft.set_name);
  await expect(editor.getByLabel("Card number", { exact: true })).toHaveValue("17");
  for (const cost of ["Purchase price", "Shipping", "Tax", "Other costs"]) await expect(editor.getByLabel(cost, { exact: true })).toHaveValue("");
  expect(searches).toBe(1); expect(details).toBe(1);
  const card = await saveDraft(page, editor, fixture, true);
  expect(card.purchase_price).toBeNull(); expect(card.shipping).toBeNull(); expect(card.condition).toBe("raw");
  const estimate = page.getByRole("dialog", { name: "Estimate Value", exact: true });
  await expect(estimate).toBeVisible();
  await expect(estimate.getByRole("list", { name: "Exact card candidates", exact: true })).toBeVisible();
  await expect(estimate.locator(".estimate-result strong")).toHaveText("Not enough sales data");
  expect(state.candidateRequests).toBe(1); expect(state.confirmations).toHaveLength(0);
  await estimate.getByRole("button", { name: /^Use this match/ }).click();
  await expect(estimate.locator(".estimate-result strong")).toHaveText(/USD\s*150\.00/);
  expect(state.confirmations).toHaveLength(1);
  await expect(estimate.locator(".sales-history-point")).toHaveCount(3);
  await estimate.locator(".saved-sales-list summary").click();
  await expect(estimate.getByRole("list", { name: "Comparable sales", exact: true }).getByRole("listitem")).toHaveCount(3);
  await expect(estimate).toContainText("Synthetic browser auction fixture");
  await info.attach("Synthetic exact-match estimate with visible sales and graph", { body: await page.screenshot({ path: info.outputPath("entry-estimate-sales.png"), fullPage: true }), contentType: "image/png" });
  await estimate.getByRole("button", { name: "Done", exact: true }).click();
  const row = page.getByRole("article").filter({ has: page.getByRole("button", { name: `View card for ${card.subject}`, exact: true }) });
  await expect(row.locator(".row-value strong")).toHaveText(/USD\s*150\.00/);
  await expect(row.locator(".sale-history-sparkline circle")).toHaveCount(3);
  await page.getByRole("button", { name: `View card for ${card.subject}`, exact: true }).click();
  const detail = page.getByRole("dialog", { name: card.subject, exact: true });
  await detail.getByRole("button", { name: "Estimate Value", exact: true }).click();
  await expect(estimate.locator(".estimate-result strong")).toHaveText(/USD\s*150\.00/);
  await estimate.getByRole("button", { name: "Close value estimate", exact: true }).click();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("button", { name: "Estimate Value", exact: true })).toBeFocused();
  expect((await (await page.request.get(`/api/cards/${card.id}`)).json()).purchase_price).toBeNull();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("PSA blur lookup proposes reviewed details while preserving entered costs and avoiding duplicate requests", async ({ page }, info) => {
  const { editor, fixture } = await openEntry(page, info);
  let lookups = 0;
  await page.route("**/api/certificates/lookup", route => {
    lookups += 1;
    expect(route.request().postDataJSON()).toEqual({ grader: "PSA", certification: "12345678" });
    return route.fulfill({ json: proposal });
  });
  await editor.getByLabel("Player(s) or subject (required)", { exact: true }).fill("Unchanged manual draft");
  await editor.getByLabel("Purchase price", { exact: true }).fill("123.45");
  await editor.getByLabel("Notes", { exact: true }).fill("My acquisition note must survive lookup.");
  await editor.getByRole("combobox", { name: "Condition", exact: true }).selectOption("graded");
  await editor.getByLabel("Grade", { exact: true }).fill("8");
  await expect(editor.getByText("PSA lookup runs when you leave this field.", { exact: false })).toBeVisible();
  const certificate = editor.getByLabel("Certification number", { exact: true });
  await certificate.fill("12345678");
  await editor.getByLabel("Grade", { exact: true }).focus();
  await expect(editor.getByRole("heading", { name: "Certificate details to review", exact: true })).toBeVisible();
  await expect(editor.getByLabel("Player(s) or subject (required)", { exact: true })).toHaveValue("Unchanged manual draft");
  await expect(editor.getByLabel("Grade", { exact: true })).toHaveValue("8");
  await editor.getByRole("button", { name: "Use certificate details", exact: true }).click();
  await expect(editor.getByLabel("Player(s) or subject (required)", { exact: true })).toHaveValue(draft.subject);
  await expect(editor.getByLabel("Grading company", { exact: true })).toHaveValue("PSA");
  await expect(editor.getByLabel("Grade", { exact: true })).toHaveValue("9");
  await expect(certificate).toHaveValue("12345678");
  await expect(editor.getByLabel("Purchase price", { exact: true })).toHaveValue("123.45");
  await certificate.focus(); await editor.getByLabel("Grade", { exact: true }).focus();
  expect(lookups).toBe(1);
  await info.attach("Reviewed synthetic certificate details preserve entered acquisition cost", { body: await page.screenshot({ path: info.outputPath("reviewed-certificate-draft.png"), fullPage: true }), contentType: "image/png" });
  const card = await saveDraft(page, editor, fixture);
  expect(card.grade).toBe("9"); expect(card.certification).toBe("12345678");
  expect(card.purchase_price).toBe("123.45"); expect(card.shipping).toBeNull();
  expect(card.notes).toBe("My acquisition note must survive lookup.");
  await expect(page.getByRole("dialog", { name: "Estimate Value", exact: true })).toHaveCount(0);
  const report = await (await page.request.get(`/api/cards/${card.id}/comparables`)).json();
  expect(report.estimate.amount).toBeNull();
});

test("unsupported graders stay manual and an abandoned PSA request cannot apply after a grader change", async ({ page }, info) => {
  const { editor } = await openEntry(page, info);
  let lookups = 0, firstReturned = false;
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
  await page.route("**/api/certificates/lookup", async route => {
    lookups += 1;
    expect(route.request().postDataJSON()).toEqual({ grader: "PSA", certification: "12345678" });
    if (lookups === 1) {
      await firstGate;
      await route.fulfill({ json: proposal });
      firstReturned = true;
    } else await route.fulfill({ json: proposal });
  });
  await editor.getByLabel("Player(s) or subject (required)", { exact: true }).fill("Manual identity stays intact");
  await editor.getByRole("combobox", { name: "Condition", exact: true }).selectOption("graded");
  const grader = editor.getByLabel("Grading company", { exact: true });
  const certificate = editor.getByLabel("Certification number", { exact: true });
  for (const company of ["BGS", "SGC", "CGC"]) {
    await grader.fill(company);
    await certificate.fill("12345678"); await editor.getByLabel("Grade", { exact: true }).focus();
    await expect(editor.getByText(`Automated ${company} lookup is not supported. Enter the details manually.`, { exact: true })).toBeVisible();
    await expect(editor.getByRole("button", { name: "Look up certificate", exact: true })).toHaveCount(0);
    await expect(editor.getByRole("link", { name: `Check on ${company}’s official site`, exact: true })).toBeVisible();
  }
  expect(lookups).toBe(0);
  await grader.fill("PSA");
  await expect(editor.getByRole("button", { name: "Look up certificate", exact: true })).toBeEnabled();
  await certificate.focus(); await editor.getByLabel("Grade", { exact: true }).focus();
  await expect.poll(() => lookups).toBe(1);
  await expect(editor.getByText("Looking up certificate details…", { exact: true })).toBeVisible();
  await grader.fill("BGS");
  await expect(editor.getByText("Automated BGS lookup is not supported. Enter the details manually.", { exact: true })).toBeVisible();
  releaseFirst();
  await expect.poll(() => firstReturned).toBe(true);
  await expect(editor.getByRole("heading", { name: "Certificate details to review", exact: true })).toHaveCount(0);
  await expect(editor.getByLabel("Player(s) or subject (required)", { exact: true })).toHaveValue("Manual identity stays intact");
  await expect(grader).toHaveValue("BGS");
  await grader.fill("PSA");
  await expect(editor.getByRole("button", { name: "Look up certificate", exact: true })).toBeEnabled();
  await certificate.focus(); await editor.getByLabel("Grade", { exact: true }).focus();
  await expect(editor.getByRole("heading", { name: "Certificate details to review", exact: true })).toBeVisible();
  expect(lookups).toBe(2);
  await expect(editor.getByLabel("Player(s) or subject (required)", { exact: true })).toHaveValue("Manual identity stays intact");
});

test("provider failure and no exact match keep entered details and save an unpriced card", async ({ page }, info) => {
  const { editor, fixture } = await openEntry(page, info);
  const state = await mockMarket(page, false);
  let searches = 0;
  await page.route("**/api/market/catalog/search", route => {
    searches += 1;
    return searches === 1 ? route.fulfill({ status: 503, json: { detail: "Synthetic catalog provider unavailable." } })
      : route.fulfill({ json: { items: [], truncated: false, note: "Synthetic empty catalog response." } });
  });
  const subject = `Manual failed lookup ${info.project.name}`;
  await editor.getByLabel("Player(s) or subject (required)", { exact: true }).fill(subject);
  await editor.getByLabel("Purchase price", { exact: true }).fill("42.50");
  await editor.getByLabel("Notes", { exact: true }).fill("Keep this draft when lookup fails.");
  await editor.getByLabel("Player, year, set, or card number", { exact: true }).fill("failed synthetic catalog");
  await editor.getByRole("button", { name: "Search cards", exact: true }).click();
  await expect(editor.getByRole("alert")).toContainText("your draft is unchanged");
  await expect(editor.getByLabel("Player(s) or subject (required)", { exact: true })).toHaveValue(subject);
  await editor.getByLabel("Player, year, set, or card number", { exact: true }).fill("no matching synthetic card");
  await editor.getByRole("button", { name: "Search cards", exact: true }).click();
  await expect(editor.getByText("No matching cards found. Try a different search or enter the details below.", { exact: true })).toBeVisible();
  await expect(editor.getByLabel("Purchase price", { exact: true })).toHaveValue("42.50");
  await expect(editor.getByLabel("Notes", { exact: true })).toHaveValue("Keep this draft when lookup fails.");
  const card = await saveDraft(page, editor, fixture, true);
  expect(card.subject).toBe(subject); expect(card.purchase_price).toBe("42.50");
  expect(card.shipping).toBeNull(); expect(card.tax).toBeNull(); expect(card.other_cost).toBeNull();
  const estimate = page.getByRole("dialog", { name: "Estimate Value", exact: true });
  await expect(estimate.getByText("No exact candidates found. Review this card’s year, set, number and variant before trying again.", { exact: true })).toBeVisible();
  await expect(estimate.locator(".estimate-result strong")).toHaveText("Not enough sales data");
  await expect(estimate.getByRole("button", { name: /^Use this match/ })).toHaveCount(0);
  expect(state.confirmations).toHaveLength(0); expect(searches).toBe(2);
  await expect(estimate.locator(".sales-history-point")).toHaveCount(0);
  await estimate.getByRole("button", { name: "Done", exact: true }).click();
  const saved = await (await page.request.get(`/api/cards/${card.id}`)).json() as Card;
  expect(saved.notes).toBe("Keep this draft when lookup fails.");
  expect(saved.purchase_price).toBe("42.50");
});

test("custom auction research preserves exact estimates and saves only the query across reopening and edits", async ({ page }, info) => {
  test.setTimeout(60_000);
  const { editor, fixture } = await openEntry(page, info);
  await mockMarket(page, false);
  const subject = `Synthetic research ${info.project.name}`;
  await editor.getByLabel("Player(s) or subject (required)", { exact: true }).fill(subject);
  await editor.getByLabel("Purchase price", { exact: true }).fill("42.50");
  const card = await saveDraft(page, editor, fixture, true);
  let searches = 0, comparableWrites = 0;
  page.on("request", request => {
    if (new URL(request.url()).pathname.endsWith("/comparables") && request.method() !== "GET") comparableWrites++;
  });
  await page.route("**/api/market/search", route => {
    searches++;
    return route.fulfill({ json: {
      query: route.request().postDataJSON().query, provider: "cardsight", fetched_at: new Date().toISOString(),
      returned_count: 1, discarded_count: 0, truncated: false, notice: "Synthetic research fixture.",
      items: [{ id: "synthetic-research-sale", title: "Different synthetic issue — not estimate evidence", price: "900.00", currency: "USD",
        sold_on: new Date().toISOString().slice(0, 10), source: "Synthetic browser fixture", source_url: "https://example.invalid/research-sale",
        image_url: null, condition: "unknown", grader: "", grade: "", parallel: null, matched_card: null }],
    } });
  });
  const estimate = page.getByRole("dialog", { name: "Estimate Value", exact: true });
  const research = estimate.getByRole("region", { name: "Research auction sales", exact: true });
  await expect(estimate.locator(".estimate-result strong")).toHaveText("Not enough sales data");
  await research.getByLabel("Card search", { exact: true }).fill("synthetic auction research");
  expect(searches).toBe(0);
  await research.getByRole("button", { name: "Search sales", exact: true }).click();
  await expect(research.getByText("1 auction sale found", { exact: false })).toBeVisible();
  await expect(research.locator(".sales-history-point")).toHaveCount(1);
  await expect(estimate.locator(".estimate-result strong")).toHaveText("Not enough sales data");
  await expect(research.getByRole("button", { name: "Save as comparable", exact: true })).toHaveCount(0);
  await research.getByRole("button", { name: "Save research query", exact: true }).click();
  await expect(research.getByRole("status")).toHaveText(/Research query saved/);
  // A second save must use the returned revision rather than the original card revision.
  await research.getByLabel("Card search", { exact: true }).fill("synthetic refined research");
  await research.getByRole("button", { name: "Save research query", exact: true }).click();
  await expect(research.getByRole("status")).toHaveText(/Research query saved/);
  await info.attach("Research chart remains separate from the exact card estimate", { body: await page.screenshot({ path: info.outputPath("auction-research.png"), fullPage: true }), contentType: "image/png" });
  await estimate.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator(".save-pricing-notice").getByRole("button", { name: "Estimate Value", exact: true }).click();
  await expect(estimate.getByLabel("Card search", { exact: true })).toHaveValue("synthetic refined research");
  expect(searches).toBe(1);
  await estimate.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit card", exact: true });
  await edit.getByLabel("Notes", { exact: true }).fill("Ordinary edit preserves research query.");
  await edit.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(edit).toBeHidden();
  const stored = await (await page.request.get(`/api/cards/${card.id}`)).json() as Card;
  expect(stored.market_query).toBe("synthetic refined research");
  expect(stored.purchase_price).toBe("42.50");
  expect(stored.shipping).toBeNull(); expect(stored.tax).toBeNull(); expect(stored.other_cost).toBeNull();
  expect(comparableWrites).toBe(0);
});

test("saved auction research performs one explicit request and never retries a provider failure", async ({ page }, info) => {
  const { editor, fixture } = await openEntry(page, info);
  await mockMarket(page, false);
  await editor.getByLabel("Player(s) or subject (required)", { exact: true }).fill(`Synthetic failed research ${info.project.name}`);
  await saveDraft(page, editor, fixture, true);
  const estimate = page.getByRole("dialog", { name: "Estimate Value", exact: true });
  const research = estimate.getByRole("region", { name: "Research auction sales", exact: true });
  let searches = 0;
  await page.route("**/api/market/search", route => {
    searches++;
    return route.fulfill({ status: 503, json: { detail: "Synthetic auction provider unavailable." } });
  });
  await estimate.getByLabel("Card search", { exact: true }).fill("saved synthetic query");
  await estimate.getByRole("button", { name: "Save research query", exact: true }).click();
  await expect(research.getByRole("status")).toHaveText(/Research query saved/);
  await estimate.getByRole("button", { name: "Done", exact: true }).click();
  await page.locator(".save-pricing-notice").getByRole("button", { name: "Estimate Value", exact: true }).click();
  await expect(estimate.getByLabel("Card search", { exact: true })).toHaveValue("saved synthetic query");
  await expect(estimate.locator(".estimate-result strong")).toHaveText("Not enough sales data");
  expect(searches).toBe(0);
  await estimate.getByRole("button", { name: "Search sales", exact: true }).click();
  await expect(research.getByRole("alert")).toHaveText("Synthetic auction provider unavailable.");
  await page.waitForTimeout(600);
  expect(searches).toBe(1);
  await expect(estimate.getByRole("button", { name: "Search sales", exact: true })).toBeEnabled();
  await info.attach("Explicit failed research request without retry", { body: await page.screenshot({ path: info.outputPath("research-provider-failure.png"), fullPage: true }), contentType: "image/png" });
});
