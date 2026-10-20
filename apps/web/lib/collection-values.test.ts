import { expect, test } from "vitest";
import type { Estimates, MarketEstimate } from "./estimates";
import { collectionValueSeries, VALUE_RANGES } from "./collection-values";

const item = (card_id: string, history: { sold_on: string; price: string }[], amount: string | null = "20.00", currency = "USD"): MarketEstimate => ({
  card_id, history, amount, currency, condition: "raw", grader: "", grade: "", low: null, high: null,
  sample_count: history.length, latest_sale: history.at(-1)?.sold_on ?? null, confidence: "low", reason: "",
});
const report = (items: MarketEstimate[], as_of = "2026-10-20"): Estimates => ({ as_of, window_days: 180, minimum_sales: 3, items });
const sales = (dates: string[], price = "20.00") => dates.map(sold_on => ({ sold_on, price }));

test("history stays unknown until every card in today's supported cohort has enough sales", () => {
  const data = report([
    item("early", sales(["2026-08-01", "2026-08-02", "2026-08-03"])),
    item("late", sales(["2026-09-01", "2026-09-02", "2026-09-03"])),
    item("unknown", sales(["2026-10-01"], "900.00"), null),
    item("canadian", sales(["2026-10-01"], "999.00"), "999.00", "CAD"),
  ]);
  const points = collectionValueSeries(data, "USD", "all");
  expect(points.find(point => point.date === "2026-08-03")?.amount).toBeNull();
  expect(points.find(point => point.date === "2026-09-03")?.amount).toBe("40.00");
  expect(points.at(-1)?.amount).toBe("40.00");
  expect(points.some(point => point.date === "2026-10-01")).toBe(false);
});

test("sales expire after 180 days, leaving explicit gaps until new evidence supports the cohort", () => {
  const points = collectionValueSeries(report([item("one", sales([
    "2026-01-01", "2026-01-02", "2026-01-03", "2026-10-01", "2026-10-02", "2026-10-03",
  ]))]), "USD", "all");
  expect(points.find(point => point.date === "2026-01-03")?.amount).toBe("20.00");
  expect(points.find(point => point.date === "2026-06-30")?.amount).toBeNull();
  expect(points.find(point => point.date === "2026-10-02")?.amount).toBeNull();
  expect(points.find(point => point.date === "2026-10-03")?.amount).toBe("20.00");
  const boundary = report([item("one", sales(["2026-01-01", "2026-01-02", "2026-01-03"]))], "2026-06-29");
  expect(collectionValueSeries(boundary, "USD", "1w").at(-1)?.amount).toBe("20.00");
});

test("medians round half-up in integer cents before summing and preserve large amounts", () => {
  const data = report([
    item("large", ["100000000000000.01", "100000000000000.02", "100000000000000.03", "100000000000000.04"].map(price => ({ sold_on: "2026-10-10", price }))),
    item("small", ["0.01", "0.02", "0.03", "0.04"].map(price => ({ sold_on: "2026-10-10", price }))),
  ]);
  expect(collectionValueSeries(data, "USD", "1m").at(-1)?.amount).toBe("100000000000000.06");
});

test("six ranges retain actual calendar starts and the API as-of endpoint", () => {
  const data = report([item("one", sales(["2024-01-01", "2026-10-01", "2026-10-02", "2026-10-03"]))], "2026-03-31");
  const starts = VALUE_RANGES.map(range => collectionValueSeries(data, "USD", range.value)[0].date);
  expect(starts).toEqual(["2024-01-01", "2025-03-31", "2025-09-30", "2025-12-31", "2026-02-28", "2026-03-25"]);
  for (const range of VALUE_RANGES) expect(collectionValueSeries(data, "USD", range.value).at(-1)?.date).toBe("2026-03-31");
});

test("range changes retain earlier sales while absent history stays unknown", () => {
  const data = report([item("one", sales(["2026-08-01", "2026-08-02", "2026-08-03"]))]);
  expect(collectionValueSeries(data, "USD", "1w")).toEqual([{ date: "2026-10-14", amount: "20.00" }, { date: "2026-10-20", amount: "20.00" }]);
  expect(collectionValueSeries(report([]), "USD", "all")).toEqual([{ date: "2026-10-20", amount: null }]);
  expect(collectionValueSeries(report([item("legacy", [])]), "USD", "1w").every(point => point.amount === null)).toBe(true);
});
