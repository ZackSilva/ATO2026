"use client";

import { useId, useState } from "react";
import type { Card } from "../lib/cards";
import { money } from "../lib/cards";
import { demoCard, demoMoney, periodChange, pointsPath, valueSeries, VALUE_RANGES, type ValueRange } from "../lib/demo-values";

export default function CardValues({ card, range, compact }: { card: Card; range: ValueRange; compact: boolean }) {
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
  const demo = demoCard(card);
  const trend = valueSeries([card], range, "value");
  const movement = periodChange(trend);
  const gain = demo.current - demo.purchase;
  const period = VALUE_RANGES.find(item => item.value === range)!;
  const signedPercent = movement.percent === null ? "—" : `${movement.percent >= 0 ? "+" : ""}${movement.percent.toFixed(1)}%`;
  const signedGain = `${gain >= 0 ? "+" : "−"}${demoMoney(Math.abs(gain))}`;

  return <>
    <div className="row-value"><span className="mobile-cell-label" aria-hidden="true">Demo value</span><strong><span className="sr-only">Demo current value: </span>{demoMoney(demo.current)}</strong><span className={`row-primary-gain ${gain < 0 ? "value-down" : "value-up"}`}>{signedGain}<span className="value-comparison"> vs purchase</span></span></div>
    <button type="button" className="row-details-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>{expanded ? "Fewer card details" : "More card details"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    <div className="row-secondary" id={detailsId} hidden={compact && !expanded}>
      <div className="row-trend"><span className="mobile-cell-label">Trend · {period.shortLabel}</span><svg viewBox="0 0 124 36" role="img" aria-label={`Demo value trend for ${card.subject}: ${signedPercent} over ${period.label.toLowerCase()}`} className={movement.amount < 0 ? "sparkline value-down" : "sparkline value-up"}><polyline points={pointsPath(trend, 124, 36, 3)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /></svg><span className={movement.amount < 0 ? "trend-change value-down" : "trend-change value-up"}>{signedPercent}<span className="trend-period"> / {period.shortLabel}</span></span></div>
      <div className="row-purchase"><span className="mobile-cell-label" aria-hidden="true">Demo purchase</span><strong><span className="sr-only">Demo purchase price: </span>{demoMoney(demo.purchase)}</strong><span className="cost-detail">{card.recorded_cost !== null ? `Recorded cost ${money(card.total_cost ?? card.recorded_cost, card.currency)}${card.total_cost === null ? " · incomplete" : ""}` : "Fictional purchase price"}</span></div>
      <div className="row-gain-detail"><span>Demo gain / loss</span><strong className={gain < 0 ? "value-down" : "value-up"}>{signedGain}</strong></div>
    </div>
  </>;
}
