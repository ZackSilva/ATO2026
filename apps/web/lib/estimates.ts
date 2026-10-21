import type { RawCondition } from "./cards";

export type MarketEstimate = {
  card_id: string; currency: string; condition: "raw" | "graded";
  grader: string; grade: string; amount: string | null; low: string | null;
  high: string | null; sample_count: number; latest_sale: string | null;
  confidence: "insufficient" | "low" | "medium"; reason: string;
  history?: { sold_on: string; price: string }[];
  source?: "saved" | "cardsight"; pricing_status?: "saved" | "live" | "insufficient" | "unavailable" | "pending" | "mismatch";
  fetched_at?: string | null; refresh_after?: string | null; pricing_note?: string | null;
  raw_condition?: RawCondition; latest_matching_sale?: string | null;
  days_since_latest_sale?: number | null; stale?: boolean;
};
export type Estimates = { as_of: string; window_days: number; minimum_sales: number; items: MarketEstimate[] };
export type Comparable = {
  id: string; definition_id: string; sold_on: string; price: string;
  currency: string; condition: "raw" | "graded"; grader: string; grade: string;
  source: string; source_url: string; created_at: string; image_url?: string | null;
  raw_condition?: RawCondition;
};
export type SavedEvidence = { items: Comparable[]; matching_sale_ids: string[]; estimate: MarketEstimate };
export type ComparableReport = SavedEvidence & { saved_history?: SavedEvidence | null };

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
