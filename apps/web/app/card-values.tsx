"use client";

import { useId, useState } from "react";
import type { Card } from "../lib/cards";
import { money } from "../lib/cards";
import type { MarketEstimate } from "../lib/estimates";
import { financeMoney } from "../lib/finances";
import { demoCard, demoMoney, periodChange, pointsPath, valueSeries, VALUE_RANGES, type ValueRange } from "../lib/demo-values";

export default function CardValues({ card, compact, estimate, pending, unavailable, mode, range }: { card: Card; compact: boolean; estimate?: MarketEstimate; pending: boolean; unavailable: boolean; mode: "demo" | "market"; range: ValueRange }) {
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
  if (mode === "demo") {
    const demo = demoCard(card);
    const trend = valueSeries([card], range, "value");
    const movement = periodChange(trend);
    const gain = demo.current - demo.purchase;
    const period = VALUE_RANGES.find(item => item.value === range)!;
    const percent = movement.percent === null ? "—" : `${movement.percent >= 0 ? "+" : ""}${movement.percent.toFixed(1)}%`;
    return <>
      <div className="row-value"><span className="demo-label">Demo · USD</span><strong><span className="sr-only">Demo current value: </span>{demoMoney(demo.current)}</strong><span className={gain < 0 ? "value-down" : "value-up"}>{gain >= 0 ? "+" : "−"}{demoMoney(Math.abs(gain))}<span className="value-comparison"> vs demo purchase</span></span></div>
      <div className="row-trend demo-row-trend"><span className="mobile-cell-label">Demo · {period.shortLabel}</span><svg viewBox="0 0 124 36" role="img" aria-label={`Demo value trend for ${card.subject}: ${percent} over ${period.label.toLowerCase()}`} className={movement.amount < 0 ? "sparkline value-down" : "sparkline value-up"}><polyline points={pointsPath(trend, 124, 36, 3)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /></svg><span className={movement.amount < 0 ? "trend-change value-down" : "trend-change value-up"}>{percent}<span className="trend-period"> / {period.shortLabel}</span></span></div>
      <button type="button" className="row-details-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{expanded ? "Fewer card details" : "More card details"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
      <div className="row-secondary" id={detailsId} hidden={compact && !expanded}>
        <div className="row-purchase"><span className="mobile-cell-label" aria-hidden="true">Purchase price</span><strong><span className="sr-only">Recorded purchase price: </span>{card.purchase_price === null ? "Unknown" : money(card.purchase_price, card.currency)}</strong><span className="cost-detail">Demo purchase {demoMoney(demo.purchase)} · fictional USD</span></div>
        <div className="row-gain-detail"><span>Demo gain / loss · fictional USD</span><strong className={gain < 0 ? "value-down" : "value-up"}>{gain >= 0 ? "+" : "−"}{demoMoney(Math.abs(gain))}</strong></div>
      </div>
    </>;
  }
  const supported = estimate?.amount !== null && estimate?.amount !== undefined;
  const label = pending ? "Loading estimate…" : unavailable ? "Estimate unavailable" : supported ? financeMoney(estimate!.amount!, card.currency) : "Insufficient Market Data";
  return <>
    <div className="row-value"><span className="mobile-cell-label" aria-hidden="true">Market estimate</span><strong className={supported ? "" : "market-unavailable"}><span className="sr-only">Market estimate: </span>{label}</strong><span className="row-estimate-context">{supported ? `${estimate!.confidence} confidence · ${estimate!.sample_count} sales` : "Sold comparables required"}</span></div>
    <button type="button" className="row-details-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{expanded ? "Fewer card details" : "More card details"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    <div className="row-secondary" id={detailsId} hidden={compact && !expanded}>
      <div className="row-trend"><span className="mobile-cell-label">Sold comparables</span><span className="row-estimate-context">{pending ? "Loading…" : unavailable ? "Unavailable" : `${estimate?.sample_count ?? 0} matches · last 180 days`}</span>{estimate?.latest_sale && <span className="cost-detail">Latest {estimate.latest_sale}</span>}</div>
      <div className="row-purchase"><span className="mobile-cell-label" aria-hidden="true">Purchase price</span><strong><span className="sr-only">Recorded purchase price: </span>{card.purchase_price === null ? "Unknown" : money(card.purchase_price, card.currency)}</strong><span className="cost-detail">{card.recorded_cost !== null ? `Recorded cost ${money(card.total_cost ?? card.recorded_cost, card.currency)}${card.total_cost === null ? " · incomplete" : ""}` : "Acquisition costs not recorded"}</span></div>
      {supported && <div className="row-gain-detail"><span>Observed sale range</span><strong>{financeMoney(estimate!.low!, card.currency)} – {financeMoney(estimate!.high!, card.currency)}</strong></div>}
    </div>
  </>;
}
