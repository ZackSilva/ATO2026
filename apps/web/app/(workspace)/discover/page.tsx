import { Suspense } from "react";
import AuctionSearch from "../../auction-search";

export default function DiscoverPage() {
  return <main className="workspace-page" id="main">
    <div className="workspace-heading"><div><h1>Discover</h1><p>Search completed card auctions and explore the sales behind the price.</p></div></div>
    <Suspense fallback={<p role="status">Preparing sales search…</p>}><AuctionSearch /></Suspense>
  </main>;
}
