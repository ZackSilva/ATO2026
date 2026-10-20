import type { Page } from "@playwright/test";

export async function openCollectionFilters(page: Page) {
  const toggle = page.getByRole("button", { name: "Filters", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
}
