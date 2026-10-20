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

function recordFor(page: Page, subject: string) {
  return page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
}

function field(scope: Locator, label: string) {
  return scope.getByText(label, { exact: true }).locator("..").locator("dd");
}

async function deleteTestCard(page: Page, subject: string) {
  for (const name of ["Close card editor", "Close card details"]) {
    const close = page.getByRole("button", { name, exact: true });
    if (await close.isVisible()) await close.click();
  }
  await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("all");
  await page.getByLabel("Search collection", { exact: true }).fill(subject);
  const record = recordFor(page, subject);
  await expect(record).toBeVisible();
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete card…", exact: true }).click();
  await page.getByRole("button", { name: "Confirm permanent deletion", exact: true }).click();
  await expect(record).toBeHidden();
}

test("PSA grading and private photos survive a sale, fee correction and return to collection", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const subject = `Browser PSA sale ${testInfo.project.name}`;
  const fixture = process.env.SLABTRAK_TEST_PHOTO;
  if (!fixture) throw new Error("The browser helper must provide an isolated image fixture.");
  await signIn(page);
  const counts = page.locator(".inventory-heading p");
  await expect(counts).toHaveText(/^\d+ active · \d+ sold · \d+ archived$/);
  const initialCounts = (await counts.innerText()).match(/^(\d+) active · (\d+) sold · (\d+) archived$/);
  expect(initialCounts).not.toBeNull();
  const initialActive = Number(initialCounts![1]);
  const initialSold = Number(initialCounts![2]);
  const initialArchived = Number(initialCounts![3]);
  await page.getByRole("button", { name: "+ Add card", exact: true }).click();
  const editor = page.getByRole("dialog", { name: /Add a card|Edit card/ });
  await editor.getByLabel("Player(s) or subject (required)").fill(subject);
  await editor.getByRole("combobox", { name: "Condition", exact: true }).selectOption("graded");
  await editor.getByLabel("Grading company", { exact: true }).fill("PSA");
  await editor.getByLabel("Grade", { exact: true }).fill("9");
  await editor.getByLabel("Certification number", { exact: true }).fill("TEST-SALE-PSA-9");
  await editor.getByLabel("Purchase price", { exact: true }).fill("100");
  await editor.getByLabel("Shipping", { exact: true }).fill("5");
  await editor.getByLabel("Tax", { exact: true }).fill("0");
  await editor.getByLabel("Other costs", { exact: true }).fill("0");
  await editor.getByRole("button", { name: "Save card", exact: true }).click();
  await expect(editor).toBeHidden();
  const record = recordFor(page, subject);
  const details = page.getByRole("dialog", { name: subject, exact: true });
  const show = page.getByRole("combobox", { name: "Show", exact: true });

  try {
    await expect(record.locator(".condition-badge")).toHaveText("PSA 9");
    await expect(counts).toHaveText(`${initialActive + 1} active · ${initialSold} sold · ${initialArchived} archived`);
    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await editor.getByLabel("Upload photo", { exact: true }).setInputFiles(fixture);
    const photo = editor.getByRole("img", { name: `${subject} card photo`, exact: true });
    await expect(photo).toBeVisible();
    await expect(editor.getByRole("button", { name: "Close card editor", exact: true })).toBeEnabled();
    const photoUrl = await photo.getAttribute("src");
    await editor.getByRole("combobox", { name: "Ownership status", exact: true }).selectOption("sold");
    await editor.getByLabel("Sale price", { exact: true }).fill("150");
    await editor.getByLabel("Sale fees", { exact: true }).fill("15");
    await editor.getByLabel("Sold on", { exact: true }).fill("2026-10-20");
    await expect(field(editor, "Net sale")).toHaveText(/(?:USD|\$)\s*135\.00/);
    await expect(field(editor, "Profit vs purchase price")).toHaveText(/(?:USD|\$)\s*35\.00/);
    await expect(field(editor, "Profit after all acquisition costs")).toHaveText(/(?:USD|\$)\s*30\.00/);
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(record).toBeHidden();
    await expect(counts).toHaveText(`${initialActive} active · ${initialSold + 1} sold · ${initialArchived} archived`);
    await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "Home", exact: true }).click();
    const homeCount = page.locator('[aria-label="Collection summary"] .stat').filter({ hasText: "Cards in collection" }).locator("strong");
    await expect(homeCount).toHaveText(String(initialActive));

    await page.getByRole("navigation", { name: "Workspace", exact: true }).getByRole("link", { name: "My Collection", exact: true }).click();
    await show.selectOption("sold");
    await expect(record).toContainText("SOLD");
    await expect(record.locator(".row-value")).toContainText(/(?:USD|\$)\s*135\.00/);
    await expect(record.getByRole("img", { name: /Demo value trend/ })).toHaveCount(0);
    await record.getByRole("button", { name: `View card for ${subject}`, exact: true }).click();
    await expect(details.locator("input, select, textarea, form, [contenteditable=true]")).toHaveCount(0);
    await expect(details.getByRole("button", { name: /save|upload|remove|delete|archive/i })).toHaveCount(0);
    await expect(field(details, "Grading company")).toHaveText("PSA");
    await expect(field(details, "Grade")).toHaveText("9");
    await expect(field(details, "Net sale")).toHaveText(/(?:USD|\$)\s*135\.00/);
    await expect(field(details, "Profit vs purchase price")).toHaveText(/(?:USD|\$)\s*35\.00/);
    await expect(field(details, "Profit after all acquisition costs")).toHaveText(/(?:USD|\$)\s*30\.00/);
    await expect(details.getByRole("img", { name: `${subject} card photo`, exact: true })).toHaveAttribute("src", photoUrl!);
    expect(await details.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await field(details, "Profit after all acquisition costs").scrollIntoViewIfNeeded();
    await testInfo.attach("Recorded PSA 9 sale and profit", { body: await page.screenshot({ path: testInfo.outputPath("sold-card-details.png") }), contentType: "image/png" });
    await details.getByRole("button", { name: "Close card details", exact: true }).click();
    await page.reload();
    await show.selectOption("sold");
    await expect(record).toContainText("PSA 9");
    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await expect(editor.getByLabel("Sale price", { exact: true })).toHaveValue("150.00");
    await expect(editor.getByLabel("Sale fees", { exact: true })).toHaveValue("15.00");
    await expect(editor.getByLabel("Sold on", { exact: true })).toHaveValue("2026-10-20");
    await editor.getByLabel("Sale fees", { exact: true }).fill("20");
    await expect(field(editor, "Net sale")).toHaveText(/(?:USD|\$)\s*130\.00/);
    await expect(field(editor, "Profit vs purchase price")).toHaveText(/(?:USD|\$)\s*30\.00/);
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(record.locator(".row-value")).toContainText(/(?:USD|\$)\s*130\.00/);
    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await editor.getByRole("combobox", { name: "Ownership status", exact: true }).selectOption("owned");
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(record).toBeHidden();
    await show.selectOption("active");
    await expect(record.locator(".condition-badge")).toHaveText("PSA 9");
    await expect(counts).toHaveText(`${initialActive + 1} active · ${initialSold} sold · ${initialArchived} archived`);
    await expect(record.getByRole("img", { name: `${subject} card photo`, exact: true })).toHaveAttribute("src", photoUrl!);
    await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await expect(editor.getByLabel("Certification number", { exact: true })).toHaveValue("TEST-SALE-PSA-9");
    await editor.getByRole("combobox", { name: "Ownership status", exact: true }).selectOption("sold");
    await expect(editor.getByLabel("Sale price", { exact: true })).toHaveValue("");
    await expect(editor.getByLabel("Sale fees", { exact: true })).toHaveValue("");
    await expect(editor.getByLabel("Sold on", { exact: true })).toHaveValue("");
  } finally {
    await deleteTestCard(page, subject);
  }
});

test("zero sale fees remain distinct from unknown purchase costs and recorded losses stay negative", async ({ page }, testInfo) => {
  const subject = `Browser sale loss ${testInfo.project.name}`;
  await signIn(page);
  await page.getByRole("button", { name: "+ Add card", exact: true }).click();
  const editor = page.getByRole("dialog", { name: /Add a card|Edit card/ });
  await editor.getByLabel("Player(s) or subject (required)").fill(subject);
  await editor.getByRole("combobox", { name: "Ownership status", exact: true }).selectOption("sold");
  await editor.getByLabel("Sale price", { exact: true }).fill("20");
  await editor.getByLabel("Sale fees", { exact: true }).fill("0");
  await expect(field(editor, "Net sale")).toHaveText(/(?:USD|\$)\s*20\.00/);
  await expect(field(editor, "Profit vs purchase price")).toHaveText("Unknown");
  await editor.getByRole("button", { name: "Save card", exact: true }).click();
  await expect(editor).toBeHidden();
  const record = recordFor(page, subject);
  const details = page.getByRole("dialog", { name: subject, exact: true });
  try {
    await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("sold");
    await record.getByRole("button", { name: `View card for ${subject}`, exact: true }).click();
    await expect(field(details, "Sale fees")).toHaveText(/(?:USD|\$)\s*0\.00/);
    await expect(field(details, "Net sale")).toHaveText(/(?:USD|\$)\s*20\.00/);
    await expect(field(details, "Profit vs purchase price")).toHaveText("Unknown");
    await expect(field(details, "Profit after all acquisition costs")).toHaveText("Unknown");
    await details.getByRole("button", { name: "Edit", exact: true }).click();
    await editor.getByLabel("Purchase price", { exact: true }).fill("50");
    await expect(field(editor, "Profit vs purchase price")).toHaveText(/[−-](?:USD|\$)\s*30\.00/);
    await editor.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(editor).toBeHidden();
    await expect(field(details, "Profit vs purchase price")).toHaveText(/[−-](?:USD|\$)\s*30\.00/);
    await expect(field(details, "Profit after all acquisition costs")).toHaveText("Unknown");
    await details.getByRole("button", { name: "Close card details", exact: true }).click();
    await page.reload();
    await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("sold");
    await record.getByRole("button", { name: `View card for ${subject}`, exact: true }).click();
    await expect(field(details, "Profit vs purchase price")).toHaveText(/[−-](?:USD|\$)\s*30\.00/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await deleteTestCard(page, subject);
  }
});
