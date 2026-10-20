"use client";

import { useId, useState } from "react";
import type { Card } from "../lib/cards";
import { money } from "../lib/cards";
import type { MarketEstimate } from "../lib/estimates";
import { financeMoney } from "../lib/finances";

export default function CardValues({ card, compact, estimate, pending, unavailable }: { card: Card; compact: boolean; estimate?: MarketEstimate; pending: boolean; unavailable: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  if (card.sold) {
    const amount = (value: string | null) => value === null ? "Unknown" : money(value, card.currency);
    const profitClass = card.net_profit === null ? "" : card.net_profit.startsWith("-") ? "value-down" : "value-up";
    return <>
      <div className="row-value"><span className="mobile-cell-label" aria-hidden="true">Net sale</span><strong><span className="sr-only">Net sale: </span>{amount(card.sale_net)}</strong><span className="cost-detail">Recorded sale · {card.currency}</span></div>
      <button type="button" className="row-details-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{expanded ? "Fewer card details" : "More card details"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
      <div className="row-secondary" id={detailsId} hidden={compact && !expanded}>
        <div className="row-trend"><span className="mobile-cell-label" aria-hidden="true">Profit vs purchase price</span><strong className={profitClass}><span className="sr-only">Profit vs purchase price: </span>{amount(card.net_profit)}</strong><span className="cost-detail">After sale fees</span></div>
        <div className="row-purchase"><span className="mobile-cell-label" aria-hidden="true">Purchase price</span><strong><span className="sr-only">Recorded purchase price: </span>{amount(card.purchase_price)}</strong><span className="cost-detail">{card.sold_on ? `Sold ${card.sold_on}` : "Sale date not recorded"}</span></div>
        <div className="row-gain-detail"><span>Profit after all acquisition costs</span><strong>{amount(card.profit_after_costs)}</strong></div>
      </div>
    </>;
  }
  const supported = !pending && !unavailable && estimate?.amount !== null && estimate?.amount !== undefined;
  const label = pending ? "Loading estimate…" : unavailable ? "Estimate unavailable" : supported ? financeMoney(estimate!.amount!, card.currency) : "Insufficient Market Data";
  return <>
    <div className="row-value"><span className="mobile-cell-label" aria-hidden="true">Market estimate</span><strong className={supported ? "" : "market-unavailable"}><span className="sr-only">Market estimate: </span>{label}</strong><span className="row-estimate-context">{supported ? `${estimate!.confidence} confidence · ${estimate!.sample_count} sales` : "Sold comparables required"}</span></div>
    <SaleHistory card={card} estimate={estimate} pending={pending} unavailable={unavailable} />
    <button type="button" className="row-details-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{expanded ? "Fewer card details" : "More card details"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    <div className="row-secondary" id={detailsId} hidden={compact && !expanded}>
      <div className="row-purchase"><span className="mobile-cell-label" aria-hidden="true">Purchase price</span><strong><span className="sr-only">Recorded purchase price: </span>{card.purchase_price === null ? "Unknown" : money(card.purchase_price, card.currency)}</strong><span className="cost-detail">{card.recorded_cost !== null ? `Recorded cost ${money(card.total_cost ?? card.recorded_cost, card.currency)}${card.total_cost === null ? " · incomplete" : ""}` : "Acquisition costs not recorded"}</span></div>
      {supported && <div className="row-gain-detail"><span>Observed sale range</span><strong>{financeMoney(estimate!.low!, card.currency)} – {financeMoney(estimate!.high!, card.currency)}</strong></div>}
    </div>
  </>;
}

// Place each real sale on its recorded date; gaps do not add synthetic observations.
function SaleHistory({ card, estimate, pending, unavailable }: { card: Card; estimate?: MarketEstimate; pending: boolean; unavailable: boolean }) {
  const history = pending || unavailable ? [] : estimate?.history ?? [];
  if (history.length < 2) return <div className="row-trend row-sale-history"><span className="sale-history-label">Comparable sales</span><span className="row-estimate-context">{pending ? "Loading sale history…" : unavailable ? "Sale history unavailable" : "Not enough sale history"}</span></div>;

  const dates = history.map(sale => Date.parse(`${sale.sold_on}T00:00:00Z`));
  const prices = history.map(sale => Number(sale.price));
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const points = history.map((sale, index) => ({
    x: lastDate === firstDate ? 62 : 4 + (dates[index] - firstDate) / (lastDate - firstDate) * 116,
    y: high === low ? 18 : 32 - (prices[index] - low) / (high - low) * 28,
    description: `${sale.sold_on}: ${financeMoney(sale.price, card.currency)}`,
  }));
  return <div className="row-trend row-sale-history">
    <span className="sale-history-label">Comparable sales</span>
    <svg viewBox="0 0 124 36" className="sale-history-sparkline" role="img" aria-label={`Sale price history for ${card.subject}: ${history.length} recorded comparable sales, ${history[0].sold_on} to ${history[history.length - 1].sold_on}`}>
      <desc>{points.map(point => point.description).join("; ")}</desc>
      <polyline points={points.map(point => `${point.x},${point.y}`).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="2" fill="currentColor"><title>{point.description}</title></circle>)}
    </svg>
    <span className="sale-history-range">{history[0].sold_on} – {history[history.length - 1].sold_on}</span>
  </div>;
}
