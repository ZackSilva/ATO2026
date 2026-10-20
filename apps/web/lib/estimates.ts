export type MarketEstimate = {
  card_id: string; currency: string; condition: "raw" | "graded";
  grader: string; grade: string; amount: string | null; low: string | null;
  high: string | null; sample_count: number; latest_sale: string | null;
  confidence: "insufficient" | "low" | "medium"; reason: string;
  history?: { sold_on: string; price: string }[];
};
export type Estimates = { as_of: string; window_days: number; minimum_sales: number; items: MarketEstimate[] };
export type Comparable = {
  id: string; definition_id: string; sold_on: string; price: string;
  currency: string; condition: "raw" | "graded"; grader: string; grade: string;
  source: string; source_url: string; created_at: string;
};
export type ComparableReport = { items: Comparable[]; estimate: MarketEstimate };

// Sum only supported estimates in one currency, without losing integer cents.
export function estimateSubtotal(items: MarketEstimate[]): string | null {
  const amounts = items.filter(item => item.amount !== null);
  if (!amounts.length) return null;
  const cents = amounts.reduce((sum, item) => {
    const [whole, fraction = ""] = item.amount!.split(".");
    return sum + BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  }, 0n);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
