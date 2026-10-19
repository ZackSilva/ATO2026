import { expect, test } from "vitest";
import { demoCard, demoMoney, periodChange, pointsPath, valueSeries, VALUE_RANGES } from "./demo-values";

const cards = [
  { id: "jordan-card", subject: "Michael Jordan" },
  { id: "barkley-card", subject: "Charles Barkley" },
  { id: "brady-card", subject: "Tom Brady" },
  { id: "sanders-card", subject: "Barry Sanders" },
];
const now = new Date("2026-10-19T18:45:00Z");

test("synthetic values are stable by card ID and include gains and losses", () => {
  expect(demoCard(cards[0])).toEqual(demoCard({ ...cards[0] }));
  expect(demoCard(cards[0])).not.toEqual(demoCard({ ...cards[0], id: "another-copy" }));
  expect(demoCard(cards[0]).current).toBeGreaterThan(demoCard(cards[0]).purchase);
  expect(demoCard(cards[1]).current).toBeLessThan(demoCard(cards[1]).purchase);
  expect(demoCard(cards[2]).current).toBeGreaterThan(demoCard(cards[2]).purchase);
  expect(demoCard(cards[3]).current).toBeLessThan(demoCard(cards[3]).purchase);
});

test("every range and metric ends at exactly the sum displayed in rows", () => {
  const total = cards.reduce((sum, card) => {
    const example = demoCard(card);
    return { current: sum.current + example.current, purchase: sum.purchase + example.purchase };
  }, { current: 0, purchase: 0 });
  for (const { value: range } of VALUE_RANGES) {
    expect(valueSeries(cards, range, "value", now).at(-1)?.value).toBe(total.current);
    expect(valueSeries(cards, range, "purchase", now).at(-1)?.value).toBe(total.purchase);
    expect(valueSeries(cards, range, "gain", now).at(-1)?.value).toBe(total.current - total.purchase);
  }
});

test("all-time gain is value minus the fixed synthetic purchase baseline on every day", () => {
  const values = valueSeries(cards, "all", "value", now);
  const purchases = valueSeries(cards, "all", "purchase", now);
  const gains = valueSeries(cards, "all", "gain", now);
  expect(values[0].date).toBe("2024-10-19");
  expect(values.at(-1)?.date).toBe("2026-10-19");
  expect(values).toHaveLength(731);
  for (let index = 0; index < values.length; index++) {
    expect(gains[index].value).toBe(values[index].value - purchases[index].value);
    expect(Number.isInteger(values[index].value)).toBe(true);
  }
});

test("collection curves equal the sum of the individual card curves", () => {
  const total = valueSeries(cards, "1m", "value", now);
  const individual = cards.map((card) => valueSeries([card], "1m", "value", now));
  total.forEach((point, index) => expect(point.value).toBe(individual.reduce((sum, series) => sum + series[index].value, 0)));
});

test("daily demo movement includes short-term dips without changing values across ranges", () => {
  const month = valueSeries([cards[0]], "1m", "value", now);
  const all = new Map(valueSeries([cards[0]], "all", "value", now).map((point) => [point.date, point.value]));
  const movements = month.slice(1).map((point, index) => point.value - month[index].value);
  expect(movements.some((change) => change > 0)).toBe(true);
  expect(movements.some((change) => change < 0)).toBe(true);
  expect(month.every((point) => point.value >= 0 && point.value === all.get(point.date))).toBe(true);
  expect(month.at(-1)?.value).toBe(demoCard(cards[0]).current);
});

test.each([
  ["all", "2024-10-19"], ["1y", "2025-10-19"], ["6m", "2026-04-19"],
  ["3m", "2026-07-19"], ["1m", "2026-09-19"], ["1w", "2026-10-12"],
] as const)("%s starts at its calendar boundary", (range, expected) => {
  const series = valueSeries(cards, range, "value", now);
  expect(series[0].date).toBe(expected);
  expect(series.at(-1)?.date).toBe("2026-10-19");
});

test("calendar windows clamp end-of-month and leap-year dates", () => {
  expect(valueSeries(cards, "1m", "value", new Date("2024-03-31T22:00:00Z"))[0].date).toBe("2024-02-29");
  expect(valueSeries(cards, "1m", "value", new Date("2025-03-31T00:00:00Z"))[0].date).toBe("2025-02-28");
  expect(valueSeries(cards, "1y", "value", new Date("2024-02-29T00:00:00Z"))[0].date).toBe("2023-02-28");
  expect(valueSeries(cards, "all", "value", new Date("2024-02-29T00:00:00Z"))[0].date).toBe("2022-02-28");
  expect(valueSeries(cards, "6m", "value", new Date("2026-08-31T00:00:00Z"))[0].date).toBe("2026-02-28");
});

test("empty collections produce a zero-valued window", () => {
  const points = valueSeries([], "1w", "gain", now);
  expect(points).toHaveLength(8);
  expect(points.every((point) => point.value === 0)).toBe(true);
  expect(periodChange(points)).toEqual({ amount: 0, percent: null });
});

test("period changes use an absolute baseline and never divide by zero", () => {
  const points = (start: number, end: number) => [{ date: "2026-01-01", value: start }, { date: "2026-01-02", value: end }];
  expect(periodChange(points(-100, -50))).toEqual({ amount: 50, percent: 50 });
  expect(periodChange(points(100, 80))).toEqual({ amount: -20, percent: -20 });
  expect(periodChange(points(0, 80))).toEqual({ amount: 80, percent: null });
  expect(periodChange([])).toEqual({ amount: 0, percent: null });
});

test("chart geometry supports empty, flat, single-point, and negative histories", () => {
  expect(pointsPath([], 100, 30)).toBe("");
  expect(pointsPath([{ date: "a", value: 1 }], 100, 30)).toBe("50.00,15.00");
  expect(pointsPath([{ date: "a", value: 1 }, { date: "b", value: 1 }], 100, 30, 2)).toBe("2.00,15.00 98.00,15.00");
  expect(pointsPath([{ date: "a", value: -20 }, { date: "b", value: -10 }], 100, 30, 2)).toBe("2.00,28.00 98.00,2.00");
});

test("demo currency formatting treats all numeric values as USD cents", () => {
  expect(demoMoney(123456)).toBe("$1,234.56");
  expect(demoMoney(-123)).toBe("-$1.23");
  expect(demoMoney(123456, true)).toBe("$1.2K");
});
