"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { estimateSubtotal } from "../lib/estimates";
import { financeMoney } from "../lib/finances";
import { useEstimates } from "../lib/use-estimates";
import "./market.css";

export default function MarketOverview({ onExpired, title = "Collection estimates", caption }: { onExpired: () => void; title?: string; caption?: string }) {
  const headingId = useId();
  const { data, pending, error, retry } = useEstimates(0, onExpired);
  const [currency, setCurrency] = useState("USD");
  const currencies = [...new Set(data?.items.map(item => item.currency) ?? [])].sort();
  const selected = currencies.includes(currency) ? currency : currencies.includes("USD") ? "USD" : currencies[0];
  const items = data?.items.filter(item => item.currency === selected) ?? [];
  const subtotal = estimateSubtotal(items);
  const covered = items.filter(item => item.amount !== null);
  const stale = covered.filter(item => item.stale).length;
  const live = items.filter(item => item.pricing_status === "live").length;
  const saved = items.filter(item => !item.source || item.source === "saved").length;
  const refreshing = items.filter(item => item.pricing_status === "pending").length;
  const unavailable = items.length - live - saved - refreshing;
  return <section className="workspace-section market-overview" aria-labelledby={headingId} aria-busy={pending}>
    <div className="workspace-section-heading"><h2 id={headingId}>{title}</h2><span className="workspace-status">{live > 0 ? `${live} automatic` : "Collection market evidence"}</span></div>
    {caption && <p className="market-snapshot-note">{caption}</p>}
    {pending ? <p role="status">Loading market coverage…</p> : error ? <p role="alert" className="error">Couldn’t load market estimates. <button type="button" className="text-button" onClick={retry}>Retry market estimates</button></p> : <>
      <div className="market-summary">
        <div className="market-headline"><span>Known estimate subtotal</span><strong>{subtotal === null ? "Insufficient market data" : financeMoney(subtotal, selected)}</strong><p className="market-source-note">{[live > 0 && `${live} live-priced`, saved > 0 && `${saved} using saved evidence`, refreshing > 0 && `${refreshing} refreshing`, unavailable > 0 && `${unavailable} awaiting usable sales`].filter(Boolean).join(" · ") || "No cards to value yet"}</p></div>
        <div className="market-coverage">
          {currencies.length > 1 && <label className="market-currency">Estimate currency<select aria-label="Estimate currency" value={selected} onChange={event => setCurrency(event.target.value)}>{currencies.map(code => <option key={code}>{code}</option>)}</select></label>}
          <p><strong>{covered.length} of {items.length}</strong> unsold cards have estimates{selected ? ` in ${selected}` : ""}.</p>
          <progress aria-label="Cards with market estimates" max={Math.max(1, items.length)} value={covered.length} />
          <span>Missing estimates stay unknown.</span>
          {stale > 0 && <span>{stale} estimated {stale === 1 ? "card needs" : "cards need"} fresher sales evidence.</span>}
        </div>
      </div>
      <details className="market-method-details"><summary>How estimates work</summary><p>Confirm an exact card match from its sold comparables page to enable automatic auction pricing. At least three matching completed sales from the past 180 days are required. Graded cards match the same grader and grade. Raw cards require compatible condition evidence; unassessed sales do not establish a higher condition. Evidence older than 90 days is flagged for review.</p><p>Unlinked cards retain their saved evidence. Includes archived cards. Currencies are never combined. Prices exclude selling fees. Sources and reported conditions are not independently verified.</p><Link className="workspace-text-link" href="/discover">Search auction sales ↗</Link></details>
    </>}
    <div className="market-links"><Link className="workspace-text-link" href="/collection">Review cards and sold comparables ↗</Link></div>
  </section>;
}
