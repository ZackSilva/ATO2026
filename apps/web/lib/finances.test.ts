import { expect, test } from "vitest";
import { coverage, eventPosition, financeDate, financeMoney } from "./finances";

test("aggregate currency formatting keeps cents beyond Number's exact range", () => {
  expect(financeMoney("100000000000000.01", "USD")).toMatch(/100,000,000,000,000\.01/);
  expect(financeMoney("-0.01", "USD")).toMatch(/-.*0\.01/);
  expect(financeMoney("-123456789012345678.99", "USD")).toMatch(/-.*123,456,789,012,345,678\.99/);
  expect(financeMoney("0.00", "CAD")).toMatch(/CAD.*0\.00/);
});

test("financial activity uses real calendar spacing, including a single event day", () => {
  expect(eventPosition("2026-10-02", "2026-10-01", "2026-10-11")).toBe(.1);
  expect(eventPosition("2026-10-10", "2026-10-01", "2026-10-11")).toBe(.9);
  expect(eventPosition("2026-10-01", "2026-10-01", "2026-10-01")).toBe(.5);
});

test("coverage distinguishes known costs from complete costs and complete sale profit", () => {
  const partial = { amount: "12.00", known_count: 2, complete_count: 1, total_count: 3 };
  expect(coverage("acquisition_spending", partial)).toBe("2 of 3 cards have known costs · 1 fully recorded");
  expect(coverage("realized_profit", { ...partial, known_count: 1 })).toBe("1 of 3 sales have sale details and all acquisition costs");
  expect(coverage("gross_sales", { amount: "0.00", known_count: 0, complete_count: 0, total_count: 0 })).toBe("No sales in this period");
});

test("financial date labels stay on the server's UTC calendar day", () => {
  expect(financeDate("2026-01-01")).toBe("Jan 1, 2026");
});
