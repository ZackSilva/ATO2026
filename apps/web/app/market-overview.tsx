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
  return <section className="workspace-section market-overview" aria-labelledby={headingId} aria-busy={pending}>
    <div className="workspace-section-heading"><h2 id={headingId}>{title}</h2><span className="workspace-status">Recorded sales · no live feed</span></div>
    {caption && <p className="market-snapshot-note">{caption}</p>}
    {pending ? <p role="status">Loading market coverage…</p> : error ? <p role="alert" className="error">Couldn’t load market estimates. <button type="button" className="text-button" onClick={retry}>Retry market estimates</button></p> : <>
      <div className="market-summary">
        <div className="market-headline"><span>Known estimate subtotal</span><strong>{subtotal === null ? "Insufficient market data" : financeMoney(subtotal, selected)}</strong><p className="market-source-note">Reported sales · not independently verified</p></div>
        <div className="market-coverage">
          {currencies.length > 1 && <label className="market-currency">Estimate currency<select aria-label="Estimate currency" value={selected} onChange={event => setCurrency(event.target.value)}>{currencies.map(code => <option key={code}>{code}</option>)}</select></label>}
          <p><strong>{covered.length} of {items.length}</strong> unsold cards have estimates{selected ? ` in ${selected}` : ""}.</p>
          <progress aria-label="Cards with market estimates" max={Math.max(1, items.length)} value={covered.length} />
          <span>Missing estimates stay unknown.</span>
        </div>
      </div>
      <details className="market-method-details"><summary>How estimates work</summary><p>At least three matching sold comparables from the past 180 days. Graded cards match the same grader and grade; raw cards use raw sales with unverified physical condition. Other grades stay separate.</p><p>Includes archived cards. Currencies are never combined. These are recorded observations, not a market-wide index. Prices are recorded before selling fees; transaction details and sources are unverified.</p><Link className="workspace-text-link" href="/discover">Market discovery roadmap ↗</Link></details>
    </>}
    <div className="market-links"><Link className="workspace-text-link" href="/collection">Review cards and sold comparables ↗</Link></div>
  </section>;
}
