import { rangeStart, type ValueRange } from "./collection-values";

export type SaleObservation = { sold_on: string; price: string };

export function saleHistoryWindow<T extends SaleObservation>(history: T[], range: ValueRange, asOf: string) {
  const saved = history.filter(sale => sale.sold_on <= asOf).sort((a, b) => a.sold_on.localeCompare(b.sold_on) || Number(a.price) - Number(b.price));
  const start = rangeStart(asOf, range, saved[0]?.sold_on ?? asOf);
  return { start, end: asOf, sales: saved.filter(sale => sale.sold_on >= start) };
}
