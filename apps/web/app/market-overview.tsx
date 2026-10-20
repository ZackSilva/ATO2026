"use client";

import Link from "next/link";
import { useState } from "react";
import { estimateSubtotal } from "../lib/estimates";
import { financeMoney } from "../lib/finances";
import { useEstimates } from "../lib/use-estimates";
import "./market.css";

export default function MarketOverview({ onExpired }: { onExpired: () => void }) {
  const { data, pending, error, retry } = useEstimates(0, onExpired);
  const [currency, setCurrency] = useState("USD");
  const currencies = [...new Set(data?.items.map(item => item.currency) ?? [])].sort();
  const selected = currencies.includes(currency) ? currency : currencies.includes("USD") ? "USD" : currencies[0];
  const items = data?.items.filter(item => item.currency === selected) ?? [];
  const subtotal = estimateSubtotal(items);
  const covered = items.filter(item => item.amount !== null);
  return <section className="workspace-section market-overview" aria-labelledby="home-market" aria-busy={pending}>
    <div className="workspace-section-heading"><h2 id="home-market">Collection estimates</h2><span className="workspace-status">Based on recorded sold comparables</span></div>
    {pending ? <p role="status">Loading market coverage…</p> : error ? <p role="alert" className="error">Couldn’t load market estimates. <button type="button" className="text-button" onClick={retry}>Retry market estimates</button></p> : <>
      {!!currencies.length && <label className="market-currency">Estimate currency<select aria-label="Estimate currency" value={selected} onChange={event => setCurrency(event.target.value)}>{currencies.map(code => <option key={code}>{code}</option>)}</select></label>}
      <div className="market-headline"><span>Known estimate subtotal</span><strong>{subtotal === null ? "Insufficient market data" : financeMoney(subtotal, selected)}</strong><p>{covered.length} of {items.length} unsold cards have enough matching sales{selected ? ` in ${selected}` : ""}. Includes archived cards. Missing estimates are not zero.</p></div>
      <p className="market-explanation">Estimates calculate automatically from at least three matching sold comparables in the past 180 days. Raw cards use raw sales; graded cards use the same grader and grade. Other grades remain visible for research.</p>
      <p className="market-explanation">Live market feed: not connected. This is your recorded evidence, not a market-wide index. Shipping and taxes are excluded; raw condition and reported sales are unverified.</p>
    </>}
    <div className="market-links"><Link className="workspace-text-link" href="/collection">Review cards and sold comparables ↗</Link><Link className="workspace-text-link" href="/discover">Market discovery roadmap ↗</Link></div>
  </section>;
}
