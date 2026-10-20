import { expect, test, type Page } from "@playwright/test";

const username = process.env.SLABTRAK_TEST_USERNAME;
const password = process.env.SLABTRAK_TEST_PASSWORD;
if (!username || !password) throw new Error("Run scripts/check_browser.py with isolated credentials.");

async function signIn(page: Page) {
  await page.goto("/collection");
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
  await expect(record.locator(".row-purchase")).toContainText(/USD\s*19\.99/);
  await page.reload();
  await expect(record).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("collection.png"), fullPage: true });
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  let editor = page.getByRole("dialog");
  await expect(editor.getByLabel("Player(s) or subject (required)")).toBeFocused();
  await expect(editor.getByLabel("Centering", { exact: true })).toHaveValue("9.5");
  expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("card-editor.png") });
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(record.getByRole("button", { name: `Edit card for ${subject}`, exact: true })).toBeFocused();
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  await editor.getByRole("textbox", { name: "Notes", exact: true }).fill(note);
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByLabel("Search collection").fill(note);
  await expect(page.getByText("1 card found", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Condition", exact: true }).selectOption("raw");
  await expect(page.getByRole("heading", { name: "No matching cards." })).toBeVisible();
  await page.getByRole("combobox", { name: "Condition", exact: true }).selectOption("graded");
  await expect(record).toBeVisible();
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  editor = page.getByRole("dialog");
  await expect(editor.getByRole("textbox", { name: "Notes", exact: true })).toHaveValue(note);
  await editor.getByRole("button", { name: "Archive card", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(page.getByRole("heading", { name: "No matching cards." })).toBeVisible();
  await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("archived");
  await expect(record).toContainText("ARCHIVED");
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  await page.getByRole("button", { name: "Restore to collection", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("combobox", { name: "Show", exact: true }).selectOption("active");
  await expect(record).toBeVisible();
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
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

test("row clicks open read-only details, with explicit editing and keyboard focus restoration", async ({ page }, testInfo) => {
  const subject = `Browser read-only ${testInfo.project.name}`;
  const note = "A recorded note, with zero costs kept distinct from unknown amounts.";
  await signIn(page);
  await addCard(page, subject, true);
  const record = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
  const directEdit = record.getByRole("button", { name: `Edit card for ${subject}`, exact: true });
  await expect(directEdit).toHaveText("Edit");
  await directEdit.click();
  const editor = page.getByRole("dialog", { name: "Edit card", exact: true });
  await editor.getByLabel("Purchase price", { exact: true }).fill("0");
  await editor.getByLabel("Shipping", { exact: true }).fill("");
  await editor.getByLabel("Other costs", { exact: true }).fill("");
  await editor.getByLabel("Sport / category", { exact: true }).fill("Basketball");
  await editor.getByLabel("Certification number", { exact: true }).fill("DEMO-1234");
  await editor.getByLabel("Notes", { exact: true }).fill(note);
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).toBeHidden();

  const mutations: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/cards") && !["GET", "HEAD"].includes(request.method())) {
      mutations.push(request.method());
    }
  });
  const details = page.getByRole("dialog", { name: subject, exact: true });
  const view = record.getByRole("button", { name: `View card for ${subject}`, exact: true });
  const thumbnail = record.getByRole("button", { name: `View details for ${subject}`, exact: true });
  const field = (label: string) => details.locator(".card-detail-fields > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd");

  await view.focus();
  await page.keyboard.press("Enter");
  await expect(details).toBeVisible();
  await expect(details.getByRole("button", { name: "Close card details", exact: true })).toBeFocused();
  await expect(details.locator("input, select, textarea, form, [contenteditable=true]")).toHaveCount(0);
  await expect(details.getByRole("button", { name: /save|upload|remove|delete|archive/i })).toHaveCount(0);
  await expect(field("Grading company")).toHaveText("BGS");
  await expect(field("Grade")).toHaveText("9.5");
  await expect(field("Centering")).toHaveText("9.5");
  await expect(field("Corners")).toHaveText("Not recorded");
  await expect(field("Certification number")).toHaveText("DEMO-1234");
  await expect(field("Serial number")).toHaveText("5");
  await expect(field("Print run")).toHaveText("99");
  await expect(field("Purchase price")).toHaveText(/(?:USD|\$)\s*0\.00/);
  await expect(field("Tax")).toHaveText(/(?:USD|\$)\s*0\.00/);
  await expect(field("Shipping")).toHaveText("Unknown");
  await expect(field("Other costs")).toHaveText("Unknown");
  await expect(field("Total acquisition cost")).toHaveText("Unknown");
  await expect(details.locator(".card-detail-notes")).toHaveText(note);
  await expect(details).toContainText("No front photo yet.");
  expect(await details.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await testInfo.attach("Read-only card details", { body: await page.screenshot({ path: testInfo.outputPath("card-read-only-details.png") }), contentType: "image/png" });
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(view).toBeFocused();

  // The heading remains a native button usable with Space as well as Enter.
  await page.keyboard.press("Space");
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Close card details", exact: true }).click();
  for (const target of [record.locator(".card-subtitle"), record.locator(".row-value"), thumbnail]) {
    await target.click();
    await expect(details).toBeVisible();
    await details.getByRole("button", { name: "Close card details", exact: true }).click();
  }
  await expect(thumbnail).toBeFocused();
  const bounds = await record.boundingBox();
  if (!bounds) throw new Error("Card row must have visible bounds.");
  await record.click({ position: { x: bounds.width - 3, y: bounds.height - 3 } });
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Close card details", exact: true }).click();
  expect(mutations).toEqual([]);

  const more = record.getByRole("button", { name: "More card details", exact: true });
  if (await more.isVisible()) {
    await more.click();
    await expect(record.getByRole("button", { name: "Fewer card details", exact: true })).toHaveAttribute("aria-expanded", "true");
    await expect(details).toBeHidden();
  }
  await view.click();
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editor).toBeVisible();
  await editor.getByRole("textbox", { name: "Notes", exact: true }).fill("Discard this draft");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(details).toBeVisible();
  await expect(details.locator(".card-detail-notes")).toHaveText(note);
  expect(mutations).toEqual([]);
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await editor.getByRole("textbox", { name: "Notes", exact: true }).fill("Updated through explicit Edit");
  await editor.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(editor).toBeHidden();
  await expect(details.locator(".card-detail-notes")).toHaveText("Updated through explicit Edit");
  expect(mutations).toEqual(["PUT"]);
  await details.getByRole("button", { name: "Close card details", exact: true }).click();
  await directEdit.click();
  await editor.getByRole("button", { name: "Delete card…", exact: true }).click();
  await editor.getByRole("button", { name: "Confirm permanent deletion", exact: true }).click();
  await expect(record).toBeHidden();
});

test("a second browser sees saved cards and a stale form cannot overwrite newer edits", async ({ page, browser }, testInfo) => {
  const subject = `Browser conflict ${testInfo.project.name}`;
  await signIn(page);
  await addCard(page, subject);
  const other = await browser.newContext();
  const second = await other.newPage();
  try {
    await signIn(second);
    await second.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await page.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
    await page.getByRole("textbox", { name: "Notes", exact: true }).fill("The newer saved note");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await second.getByRole("textbox", { name: "Notes", exact: true }).fill("Stale browser note");
    await second.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(second.getByRole("dialog").getByRole("alert")).toContainText("changed in another session");
    await second.getByRole("button", { name: "Reload latest card (discard these edits)", exact: true }).click();
    await expect(second.getByRole("dialog").getByRole("textbox", { name: "Notes", exact: true })).toHaveValue("The newer saved note");
    await second.getByRole("button", { name: "Close card editor", exact: true }).click();
    await second.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
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

test("front and back photos remain independent through preview, replacement, reload and removal", async ({ page, browser }, testInfo) => {
  test.setTimeout(60_000);
  const subject = `Browser photo ${testInfo.project.name}`;
  const fixture = process.env.SLABTRAK_TEST_PHOTO;
  if (!fixture) throw new Error("The browser helper must provide an isolated image fixture.");
  await signIn(page);
  await addCard(page, subject);
  const record = page.getByRole("article").filter({ has: page.getByRole("heading", { name: subject, exact: true }) });
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  const editor = page.getByRole("dialog");
  await editor.getByLabel("Notes", { exact: true }).fill("Unsaved details survive photo updates");
  await editor.getByLabel("Upload photo", { exact: true }).setInputFiles(fixture);
  await expect(editor.getByRole("img", { name: `${subject} card photo`, exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "Close card editor" })).toBeEnabled();
  const frontPhotoUrl = await editor.getByRole("img", { name: `${subject} card photo`, exact: true }).getAttribute("src");
  expect(frontPhotoUrl).toMatch(/^\/api\/cards\/.+\/photo\?v=/);

  await editor.getByRole("button", { name: "Back", exact: true }).click();
  await expect(editor.getByRole("button", { name: "Back", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(editor.getByRole("img")).toBeHidden();
  await editor.getByLabel("Upload back photo", { exact: true }).setInputFiles(fixture);
  const backPhoto = editor.getByRole("img", { name: `${subject} card back photo`, exact: true });
  await expect(backPhoto).toBeVisible();
  await expect(editor.getByLabel("Notes", { exact: true })).toHaveValue("Unsaved details survive photo updates");
  await expect(editor.getByRole("button", { name: "Close card editor" })).toBeEnabled();
  const originalBackUrl = await backPhoto.getAttribute("src");
  expect(originalBackUrl).toMatch(/^\/api\/cards\/.+\/photo\?side=back&v=/);
  expect(originalBackUrl).not.toBe(frontPhotoUrl);
  await editor.getByRole("button", { name: "Front", exact: true }).click();
  await expect(editor.getByRole("img")).toHaveAttribute("src", frontPhotoUrl!);
  await editor.getByRole("button", { name: "Close card editor" }).click();
  const thumbnail = record.getByRole("img", { name: `${subject} card photo`, exact: true });
  await expect(thumbnail).toBeVisible();
  await expect.poll(() => thumbnail.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(thumbnail).toHaveAttribute("src", frontPhotoUrl!);
  const unauthenticated = await browser.newContext();
  try {
    expect((await unauthenticated.request.get(`http://localhost:3000${frontPhotoUrl}`)).status()).toBe(401);
    expect((await unauthenticated.request.get(`http://localhost:3000${originalBackUrl}`)).status()).toBe(401);
  }
  finally { await unauthenticated.close(); }
  await record.getByRole("button", { name: `View details for ${subject}`, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Back", exact: true }).click();
  await testInfo.attach("Card details with back photo", { body: await page.screenshot({ path: testInfo.outputPath("card-details-with-photo.png") }), contentType: "image/png" });
  await page.getByRole("button", { name: "Enlarge photos", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Back", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog").getByRole("img")).toBeVisible();
  await expect.poll(() => page.getByRole("dialog").getByRole("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Close image preview" })).toBeFocused();
  await page.getByRole("dialog").getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("img", { name: `${subject} card back photo`, exact: true })).toHaveAttribute("src", originalBackUrl!);
  await expect.poll(() => page.getByRole("dialog").getByRole("img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("dialog").getByRole("button", { name: "Front", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toHaveAttribute("src", frontPhotoUrl!);
  await testInfo.attach("Enlarged card photo", { body: await page.screenshot({ path: testInfo.outputPath("image-preview.png") }), contentType: "image/png" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Close image preview", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Enlarge photos", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Close card details", exact: true }).click();
  await expect(record.getByRole("button", { name: `View details for ${subject}`, exact: true })).toBeFocused();
  await page.reload();
  await expect(thumbnail).toBeVisible();
  await expect(thumbnail).toHaveAttribute("src", frontPhotoUrl!);
  await page.screenshot({ path: testInfo.outputPath("collection-rows.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  await editor.getByRole("button", { name: "Back", exact: true }).click();
  await expect(backPhoto).toHaveAttribute("src", originalBackUrl!);
  await editor.getByLabel("Replace back photo", { exact: true }).setInputFiles(fixture);
  await expect(backPhoto).not.toHaveAttribute("src", originalBackUrl!);
  await expect(editor.getByRole("button", { name: "Close card editor" })).toBeEnabled();
  const replacedBackUrl = await backPhoto.getAttribute("src");
  await editor.getByRole("button", { name: "Front", exact: true }).click();
  await expect(editor.getByRole("img")).toHaveAttribute("src", frontPhotoUrl!);
  await editor.getByLabel("Replace photo", { exact: true }).setInputFiles(fixture);
  await expect(editor.getByRole("img")).not.toHaveAttribute("src", frontPhotoUrl!);
  await expect(editor.getByRole("button", { name: "Close card editor" })).toBeEnabled();
  const replacedFrontUrl = await editor.getByRole("img").getAttribute("src");
  await editor.getByRole("button", { name: "Back", exact: true }).click();
  await expect(backPhoto).toHaveAttribute("src", replacedBackUrl!);
  await editor.getByRole("button", { name: "Close card editor" }).click();
  await page.reload();
  await expect(thumbnail).toHaveAttribute("src", replacedFrontUrl!);
  await record.getByRole("button", { name: `View details for ${subject}`, exact: true }).click();
  await page.getByRole("button", { name: "Enlarge photos", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toHaveAttribute("src", replacedBackUrl!);
  await page.getByRole("button", { name: "Close image preview", exact: true }).click();
  await page.getByRole("button", { name: "Close card details", exact: true }).click();
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  await page.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toBeHidden();
  await expect(page.getByRole("button", { name: "Close card editor" })).toBeEnabled();
  await page.getByRole("button", { name: "Close card editor" }).click();
  expect((await page.request.get(replacedFrontUrl!)).status()).toBe(404);
  expect((await page.request.get(replacedBackUrl!)).status()).toBe(200);
  // A card with only a back photo still has a useful thumbnail and preview.
  await expect(record.getByRole("img", { name: `${subject} card back photo`, exact: true })).toHaveAttribute("src", replacedBackUrl!);
  await record.getByRole("button", { name: `View details for ${subject}`, exact: true }).click();
  await page.getByRole("button", { name: "Enlarge photos", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Back", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog").getByRole("img")).toHaveAttribute("src", replacedBackUrl!);
  await page.getByRole("dialog").getByRole("button", { name: "Front", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("img")).toBeHidden();
  await expect(page.getByRole("dialog")).toContainText("No front photo yet");
  await page.getByRole("button", { name: "Close image preview", exact: true }).click();
  await page.getByRole("button", { name: "Close card details", exact: true }).click();
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  await editor.getByRole("button", { name: "Back", exact: true }).click();
  await expect(backPhoto).toHaveAttribute("src", replacedBackUrl!);
  await editor.getByRole("button", { name: "Remove back photo", exact: true }).click();
  await expect(editor.getByRole("img")).toBeHidden();
  await expect(editor.getByRole("button", { name: "Close card editor" })).toBeEnabled();
  await editor.getByRole("button", { name: "Close card editor" }).click();
  await page.reload();
  expect((await page.request.get(replacedBackUrl!)).status()).toBe(404);
  await expect(record.getByRole("button", { name: `View details for ${subject}`, exact: true })).toBeVisible();
  await record.getByRole("button", { name: `Edit card for ${subject}`, exact: true }).click();
  await page.getByRole("button", { name: "Delete card…", exact: true }).click();
  await page.getByRole("button", { name: "Confirm permanent deletion", exact: true }).click();
  await expect(record).toBeHidden();
});
