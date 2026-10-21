export type MarketLink = {
  card_id: string; parallel_id: string | null; grade_id: string | null;
  confirmed_at: string; valid: boolean;
};
export type MarketLinkStatus = { configured: boolean; link: MarketLink | null };
export type MarketCandidate = {
  id: string; name: string; number: string | null; release_name: string;
  year: string | null; set_name: string; parallel_id: string | null;
  parallel_name: string | null; eligible: boolean; reason: string;
};
export type MarketCandidates = {
  definition_id: string; candidates: MarketCandidate[];
  grade_options: { id: string; label: string }[]; note: string;
};
