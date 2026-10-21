"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { cardSubtitle, rawConditions, type Card } from "../../../../../lib/cards";
import type { ComparableReport } from "../../../../../lib/estimates";
import { financeDate, financeMoney } from "../../../../../lib/finances";
import { useWorkspace } from "../../../../workspace-shell";
import { SavedHistoricalEvidence, SavedSalesHistory } from "../../../../card-sales-history";
import MarketLink from "../../../../market-link";
import "../../../../market.css";
import ListingImage from "../../../../listing-image";

export default function CardMarketPage() {
  const { id } = useParams<{ id: string }>();
  const { onExpired } = useWorkspace();
  const [card, setCard] = useState<Card | null>(null);
  const [report, setReport] = useState<ComparableReport | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let poll: number | undefined;
    async function load(round = 0) {
      if (round === 0) setPending(true);
      setError("");
      try {
        const [copy, sales] = await Promise.all([
          api<Card>(`/cards/${id}`, { signal: controller.signal }),
          api<ComparableReport>(`/cards/${id}/comparables`, { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) {
          setCard(copy); setReport(sales);
          if (sales.estimate.pricing_status === "pending" && round < 10) poll = window.setTimeout(() => void load(round + 1), 2000);
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError((failure as Error).message);
      } finally { if (!controller.signal.aborted) setPending(false); }
    }
    const timer = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(timer); window.clearTimeout(poll); controller.abort(); };
  }, [id, version, onExpired]);

  const estimate = report?.estimate;
  return <main className="workspace-page" id="main">
    <Link className="workspace-text-link" href="/collection">← My Collection</Link>
    <div className="workspace-heading market-data-heading"><div><h1>Sold comparables</h1><p>{card ? `${card.subject} · ${cardSubtitle(card)}` : "Your card’s market evidence."}</p></div></div>
    <p className="market-method">Match your exact card for automatic auction pricing. Review the supporting sales and saved historical evidence below.</p>
    {card && <p><Link className="workspace-text-link" href={`/discover?${new URLSearchParams({ q: [card.year, card.set_name, card.subject, card.card_number ? `#${card.card_number}` : "", card.parallel, card.condition === "graded" ? `${card.grader} ${card.grade}` : "raw"].filter(Boolean).join(" ") }).toString()}`}>Find recent auction sales ↗</Link></p>}
    {pending ? <p role="status">Loading sold comparables…</p> : error ? <p role="alert" className="error">{error} <button type="button" className="text-button" onClick={() => setVersion(value => value + 1)}>Retry sold comparables</button></p> : card && report && <>
      <section className="workspace-section" aria-labelledby="current-estimate">
        <h2 id="current-estimate">Current estimate</h2>
        <div className="market-headline"><strong data-testid="card-market-estimate">{estimate?.amount ? financeMoney(estimate.amount, card.currency) : "Insufficient Market Data"}</strong></div>
        {estimate?.amount && <p>{estimate.confidence} confidence · {estimate.sample_count} matching sales · Observed range {financeMoney(estimate.low!, card.currency)} – {financeMoney(estimate.high!, card.currency)}</p>}
        {estimate?.stale && <p role="status" className="market-freshness">Evidence needs a refresh · {estimate.latest_matching_sale ? `Latest matching sale ${financeDate(estimate.latest_matching_sale)} (${estimate.days_since_latest_sale} days ago).` : "No matching sales recorded."}</p>}
        {estimate?.source === "cardsight" && <p className="market-method">CardSight auction sales{estimate.fetched_at ? ` · Last refreshed ${new Date(estimate.fetched_at).toLocaleString()}` : ""}</p>}
        {estimate?.pricing_status === "pending" && <p role="status" className="market-method">Retrieving matching auction sales…</p>}
        {estimate?.pricing_note && <p className="market-method">{estimate.pricing_note}</p>}
        <p className="market-method">{estimate?.reason}</p>
        <details className="market-method-details"><summary>Matching and freshness rules</summary><p>Same card identity and currency; at least three sold comparables from the past 180 days. Raw cards require compatible condition evidence. Graded cards use the same grading company and grade. Other conditions, grades and older sales remain context. Evidence older than 90 days is flagged for review; it can still support an estimate within the 180-day window. Prices exclude shipping and taxes; they do not include selling fees.</p></details>
      </section>
      <MarketLink key={`${card.id}:${card.revision}`} card={card} onChange={() => setVersion(value => value + 1)} />
      <SavedSalesHistory key={report.estimate.fetched_at ?? "saved"} report={report} currency={card.currency} headingLevel={2} />
      <SavedHistoricalEvidence report={report} currency={card.currency} />
      <details className="workspace-section sales-dropdown">
        <summary><h2 id="recorded-comparables">Recorded sales · {report.items.length}</h2></summary>
        {!report.items.length ? <p>No completed sales are available for this card yet.</p> : <ul className="market-comparables">{report.items.map(sale => <li key={sale.id}>
          <ListingImage sale={{ image_url: sale.image_url, title: `${sale.source} · ${sale.sold_on}` }} /><div><h3>{financeMoney(sale.price, sale.currency)} · {sale.condition === "raw" ? `Raw · ${rawConditions[sale.raw_condition ?? "unspecified"]}` : `${sale.grader} ${sale.grade}`}</h3><p>{financeDate(sale.sold_on)} · {sale.source} · Source reported, unverified</p>{sale.source_url && <p><a href={sale.source_url} target="_blank" rel="noreferrer">View sale source ↗</a></p>}</div>
        </li>)}</ul>}
      </details>
    </>}
  </main>;
}
