import type { Card } from "../lib/cards";
import { money } from "../lib/cards";
import { demoCard, demoMoney, periodChange, pointsPath, valueSeries, VALUE_RANGES, type ValueRange } from "../lib/demo-values";

export default function CardValues({ card, range }: { card: Card; range: ValueRange }) {
  const demo = demoCard(card);
  const trend = valueSeries([card], range, "value");
  const movement = periodChange(trend);
  const gain = demo.current - demo.purchase;
  const period = VALUE_RANGES.find(item => item.value === range)!;
  const signedPercent = movement.percent === null ? "—" : `${movement.percent >= 0 ? "+" : ""}${movement.percent.toFixed(1)}%`;

  return <>
    <div className="row-trend"><span className="mobile-cell-label">Trend · {period.shortLabel}</span><svg viewBox="0 0 124 36" role="img" aria-label={`Demo value trend for ${card.subject}: ${signedPercent} over ${period.label.toLowerCase()}`} className={movement.amount < 0 ? "sparkline value-down" : "sparkline value-up"}><polyline points={pointsPath(trend, 124, 36, 3)} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" /></svg><span className={movement.amount < 0 ? "trend-change value-down" : "trend-change value-up"}>{signedPercent}<span className="trend-period"> / {period.shortLabel}</span></span></div>
    <div className="row-value"><span className="mobile-cell-label" aria-hidden="true">Current value · demo</span><strong><span className="sr-only">Demo current value: </span>{demoMoney(demo.current)}</strong><span className={gain < 0 ? "value-down" : "value-up"}>{gain >= 0 ? "+" : "−"}{demoMoney(Math.abs(gain))}<span className="value-comparison"> vs purchase</span></span></div>
    <div className="row-purchase"><span className="mobile-cell-label" aria-hidden="true">Purchase price · demo</span><strong><span className="sr-only">Demo purchase price: </span>{demoMoney(demo.purchase)}</strong><span className="cost-detail">{card.recorded_cost !== null ? `Recorded cost ${money(card.total_cost ?? card.recorded_cost, card.currency)}${card.total_cost === null ? " · incomplete" : ""}` : "Demo purchase"}</span></div>
  </>;
}
