import { expect, test } from "vitest";
import { saleHistoryWindow } from "./sale-history";

const history = [
  { sold_on: "2026-10-20", price: "140.01" },
  { sold_on: "2024-10-20", price: "100.05" },
  { sold_on: "2026-10-14", price: "130.10" },
  { sold_on: "2026-10-21", price: "999.00" },
  { sold_on: "2026-09-20", price: "125.00" },
];

test("all-time sale history retains authentic dates and cents over two years without future observations or resampling", () => {
  const result = saleHistoryWindow(history, "all", "2026-10-20");
  expect(result.start).toBe("2024-10-20");
  expect(result.sales).toEqual([history[1], history[4], history[2], history[0]]);
  expect(history[0].sold_on).toBe("2026-10-20");
});

test("card sale ranges use seven inclusive UTC days and retain the exact calendar month boundary", () => {
  expect(saleHistoryWindow(history, "1w", "2026-10-20").sales).toEqual([history[2], history[0]]);
  expect(saleHistoryWindow(history, "1m", "2026-10-20").sales).toEqual([history[4], history[2], history[0]]);
});

test("ranges without observations remain empty and same-day sales remain separate", () => {
  expect(saleHistoryWindow([history[1]], "1m", "2026-10-20").sales).toEqual([]);
  expect(saleHistoryWindow([], "all", "2026-10-20")).toEqual({ start: "2026-10-20", end: "2026-10-20", sales: [] });
  const sameDay = [{ sold_on: "2026-10-20", price: "150.00" }, history[0]];
  expect(saleHistoryWindow(sameDay, "all", "2026-10-20").sales).toEqual([history[0], sameDay[0]]);
});
