import { expect, test, type Page } from "@playwright/test";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Username", { exact: true }).fill(username!);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByRole("heading", { name: "Your collection", exact: true })).toBeVisible();
  await expect(page.getByText("Loading cards…", { exact: true })).toBeHidden();
}

async function addCard(page: Page, subject: string, graded = false) {
  await page.getByRole("button", { name: "+ Add card", exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Player(s) or subject (required)").fill(subject);
  await editor.getByLabel("Year", { exact: true }).fill("2024");
  await editor.getByLabel("Set", { exact: true }).fill("Test collection");
  await editor.getByLabel("Purchase price", { exact: true }).fill("19.99");
  await editor.getByLabel("Shipping", { exact: true }).fill("0.01");
  await editor.getByLabel("Tax", { exact: true }).fill("0");
  await editor.getByLabel("Other costs", { exact: true }).fill("0");
  if (graded) {
    await editor.getByRole("combobox", { name: "Condition", exact: true }).selectOption("graded");
    await editor.getByLabel("Grading company").fill("BGS");
    await editor.getByLabel("Grade", { exact: true }).fill("9.5");
    await editor.getByLabel("Centering", { exact: true }).fill("9.5");
    await editor.getByLabel("Serial number", { exact: true }).fill("5");
    await editor.getByLabel("Print run (out of)", { exact: true }).fill("99");
  }
  await editor.getByRole("button", { name: "Save card", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole("heading", { name: subject, exact: true })).toBeVisible();
}

test("add, find, edit, archive, restore and deliberately delete a persistent graded card", async ({ page }, testInfo) => {
  const subject = `Browser inventory ${testInfo.project.name}`;
  const note = `Searchable workshop note ${testInfo.project.name}`;
  await signIn(page);
  await addCard(page, subject, true);
  const record = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
  await expect(record).toContainText("BGS 9.5");
  await expect(record).toContainText("#5 / 99");
  await expect(record).toContainText(/USD\s*20\.00/);
  await page.reload();
  await expect(record).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("collection.png"), fullPage: true });
  await record.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
  let editor = page.getByRole("dialog");
  await expect(editor.getByLabel("Player(s) or subject (required)")).toBeFocused();
  await expect(editor.getByLabel("Centering", { exact: true })).toHaveValue("9.5");
  expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("card-editor.png") });
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(record.getByRole("button", { name: `Open card for ${subject}`, exact: true })).toBeFocused();
  await record.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
  await editor.getByRole("textbox", { name: "Notes", exact: true }).fill(note);
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByLabel("Search collection").fill(note);
  await expect(page.getByText("1 card found", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Condition", exact: true }).selectOption("raw");
  await expect(page.getByRole("heading", { name: "No matching cards." })).toBeVisible();
  await page.getByRole("combobox", { name: "Condition", exact: true }).selectOption("graded");
  await expect(record).toBeVisible();
  await record.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
  editor = page.getByRole("dialog");
  await expect(editor.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue(note);
  await editor.getByRole("button", { name: "Archive card", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole("heading", { name: "No matching cards." })).toBeVisible();
  await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("archived");
  await expect(record).toContainText("ARCHIVED");
  await record.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
  await page.getByRole("button", { name: "Restore to collection", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("active");
  await expect(record).toBeVisible();
  await record.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete card…", exact: true }).click();
  await page.getByRole("button", { name: "Keep card", exact: true }).click();
  await expect(page.getByRole("button", { name: "Confirm permanent deletion" })).toBeHidden();
  await page.getByRole("button", { name: "Delete card…", exact: true }).click();
  await page.getByRole("button", { name: "Confirm permanent deletion", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(record).toBeHidden();
  await page.reload();
  await expect(page.getByRole("heading", { name: subject, exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a second browser sees saved cards and a stale form cannot overwrite newer edits", async ({ page, browser }, testInfo) => {
  const subject = `Browser conflict ${testInfo.project.name}`;
  await signIn(page);
  await addCard(page, subject);
  const other = await browser.newContext();
  const second = await other.newPage();
  try {
    await signIn(second);
    await second.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
    await page.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
    await page.getByRole("textbox", { name: "Notes", exact: true }).fill("The newer saved note");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await second.getByRole("textbox", { name: "Notes", exact: true }).fill("Stale browser note");
    await second.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(second.getByRole("dialog").getByRole("alert")).toContainText("changed in another session");
    await second.getByRole("button", { name: "Reload latest card (discard these edits)", exact: true }).click();
    await expect(second.getByRole("dialog").getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("The newer saved note");
    await second.getByRole("button", { name: "Close card editor", exact: true }).click();
    await second.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
    await second.getByRole("button", { name: "Delete card…", exact: true }).click();
    await second.getByRole("button", { name: "Confirm permanent deletion", exact: true }).click();
    await expect(second.getByRole("dialog")).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your collection", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: subject, exact: true })).toBeHidden();
  } finally { await other.close(); }
});

test("inventory storage failure offers a working retry", async ({ page }) => {
  await page.route("**/api/cards?**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "Storage is temporarily unavailable. Please retry." }) }));
  await signIn(page);
  const inventoryRegion = page.getByRole("region", { name: "Your collection", exact: true });
  await expect(inventoryRegion.getByRole("alert")).toContainText("Storage is temporarily unavailable");
  await page.unroute("**/api/cards?**");
  await page.getByRole("button", { name: "Retry loading cards", exact: true }).click();
  await expect(inventoryRegion.getByRole("alert")).toBeHidden();
  await expect(page.getByText(/cards? found/)).toBeVisible();
});

test("row thumbnail upload, larger preview, private access and removal", async ({ page, browser }, testInfo) => {
  const subject = `Browser photo ${testInfo.project.name}`;
  const fixture = process.env.SLABTRAK_TEST_PHOTO;
  if (!fixture) throw new Error("The browser helper must provide an isolated image fixture.");
  await signIn(page);
  await addCard(page, subject);
  const record = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
  await record.getByRole("button", { name: `Add photo for ${subject}`, exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Upload photo", { exact: true }).setInputFiles(fixture);
  await expect(editor.getByRole("img", { name: `${subject} card photo`, exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Close card editor" })).toBeEnabled();
  await editor.getByRole("button", { name: "Close card editor" }).click();
  const thumbnail = record.getByRole("img", { name: `${subject} card photo`, exact: true });
  await expect(thumbnail).toBeVisible();
  await expect.poll(() => thumbnail.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const photoUrl = await thumbnail.getAttribute("src");
  expect(photoUrl).toMatch(/^\/api\/cards\/.+\/photo\?v=/);
  const unauthenticated = await browser.newContext();
  try { expect((await unauthenticated.request.get(`http://localhost:3000${photoUrl}`)).status()).toBe(401); }
  finally { await unauthenticated.close(); }
  await record.getByRole("button", { name: `Preview image for ${subject}`, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
  await expect.poll(() => page.getByRole("dialog").getByRole("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Close image preview" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("image-preview.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(record.getByRole("button", { name: `Preview image for ${subject}`, exact: true })).toBeFocused();
  await page.reload();
  await expect(thumbnail).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("collection-rows.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await record.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toBeHidden();
  await expect(page.getByRole("button", { name: "Close card editor" })).toBeEnabled();
  await page.getByRole("button", { name: "Close card editor" }).click();
  await expect(record.getByRole("button", { name: `Add photo for ${subject}`, exact: true })).toBeVisible();
  await record.getByRole("button", { name: `Open card for ${subject}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete card…", exact: true }).click();
  await page.getByRole("button", { name: "Confirm permanent deletion", exact: true }).click();
  await expect(record).toBeHidden();
});
