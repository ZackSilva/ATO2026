import Link from "next/link";

export default function DiscoverPage() {
  return <main className="workspace-page" id="main">
    <div className="workspace-heading"><div><h1>Discover</h1><p>A place to explore the market and find your next card.</p></div></div>
    <section className="workspace-section" aria-labelledby="discover-status"><span className="eyebrow">COMING LATER</span><h2 id="discover-status">Market discovery, with context.</h2><p>Market search and AI-assisted discovery are planned. No marketplace feed or AI recommendations are connected yet.</p></section>
    <section className="workspace-section" aria-labelledby="estimate-roadmap"><h2 id="estimate-roadmap">Price estimates for every collection.</h2><p>Both raw and graded cards can now receive automatic estimates from sold comparables you record. Open a card and choose View and manage sold comparables to add actual researched sales and see the supporting evidence.</p><p>Raw estimates use raw sales, with condition explicitly unverified. Graded estimates use the same grader and grade; sales at other grades stay visible as research context. Cross-grade calculations need a defensible evidence-based model before we enable them.</p><p>A reliable live sales-data feed, condition-specific raw matching, market search, and AI recommendations remain planned. Missing evidence shows Insufficient Market Data.</p><Link className="workspace-text-link" href="/collection">Review cards and market evidence <span aria-hidden="true">↗</span></Link></section>
  </main>;
}
