import type { Estimates } from "./estimates";

export type ValueRange = "all" | "1y" | "6m" | "3m" | "1m" | "1w";
export type ValuePoint = { date: string; amount: string | null };
export const VALUE_RANGES: { value: ValueRange; label: string; shortLabel: string }[] = [
  { value: "all", label: "All time", shortLabel: "All" },
  { value: "1y", label: "Last year", shortLabel: "1Y" },
  { value: "6m", label: "Last six months", shortLabel: "6M" },
  { value: "3m", label: "Last three months", shortLabel: "3M" },
  { value: "1m", label: "Last month", shortLabel: "1M" },
  { value: "1w", label: "Last week", shortLabel: "1W" },
];
const DAY = 86400000;
const timestamp = (date: string) => Date.parse(`${date}T00:00:00Z`);
const dateString = (stamp: number) => new Date(stamp).toISOString().slice(0, 10);

export function valueCents(amount: string): bigint {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function valueAmount(cents: bigint): string {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export function rangeStart(asOf: string, range: ValueRange, earliest: string): string {
  if (range === "all") return earliest;
  const end = new Date(timestamp(asOf));
  if (range === "1w") return dateString(end.getTime() - 6 * DAY);
  const months = { "1y": 12, "6m": 6, "3m": 3, "1m": 1 }[range];
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
  start.setUTCDate(Math.min(end.getUTCDate(), lastDay));
  return dateString(start.getTime());
}

/** Revalue the same currently supported cards at each evidence event. Missing
 * evidence stays unknown: adding newly supported cards cannot create growth. */
export function collectionValueSeries(data: Estimates, currency: string, range: ValueRange): ValuePoint[] {
  const cohort = data.items.filter(item => item.currency === currency && item.amount !== null);
  const histories = cohort.map(item => (item.history ?? []).filter(sale => sale.sold_on <= data.as_of));
  const saleDates = histories.flatMap(history => history.map(sale => sale.sold_on));
  const earliest = saleDates.reduce((first, date) => date < first ? date : first, data.as_of);
  const start = rangeStart(data.as_of, range, earliest);
  const dates = new Set([start, data.as_of]);
  for (const date of saleDates) {
    // Sales leave the rolling window on this exact date, even without new sales.
    for (const event of [date, dateString(timestamp(date) + data.window_days * DAY)]) {
      if (event >= start && event <= data.as_of) dates.add(event);
    }
  }
  return [...dates].sort().map(date => {
    let total = 0n;
    for (const history of histories) {
      const cutoff = timestamp(date) - data.window_days * DAY;
      const prices = history.filter(sale => sale.sold_on <= date && timestamp(sale.sold_on) > cutoff)
        .map(sale => valueCents(sale.price)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      if (prices.length < data.minimum_sales) return { date, amount: null };
      const middle = Math.floor(prices.length / 2);
      // Exact integer cents, with the same half-up rounding as the API median.
      total += prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle] + 1n) / 2n;
    }
    return { date, amount: cohort.length ? valueAmount(total) : null };
  });
}
