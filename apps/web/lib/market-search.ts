export type MarketStatus = { provider: "cardsight"; configured: boolean };
export type AuctionSale = {
  id: string; title: string; price: string; currency: "USD"; sold_on: string;
  source: string; source_url: string; image_url: string | null; condition: "raw" | "graded" | "unknown";
  grader: string; grade: string; parallel: string | null;
  matched_card: { name: string; number: string | null; set_name: string; year: string } | null;
};
export type MarketSearch = {
  query: string; provider: "cardsight"; fetched_at: string; items: AuctionSale[];
  discarded_count: number; returned_count: number; truncated: boolean; notice: string;
};
