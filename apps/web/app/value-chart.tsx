"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { collectionValueSeries, valueAmount, valueCents, VALUE_RANGES, type ValueRange } from "../lib/collection-values";
import { estimateSubtotal } from "../lib/estimates";
import { eventPosition, financeDate, financeMoney } from "../lib/finances";
import { useEstimates } from "../lib/use-estimates";
import "./values.css";

type Props = { range: ValueRange; onRangeChange: (range: ValueRange) => void; refreshKey: number; onExpired: () => void; showSummary?: boolean };

export default function CollectionValueChart({ range, onRangeChange, refreshKey, onExpired, showSummary = true }: Props) {
  const [expanded, setExpanded] = useState(true);
  const [currency, setCurrency] = useState("USD");
  const [cursor, setCursor] = useState<number | null>(null);
  const chartId = useId();
  const noteId = useId();
  const { data, pending, error, retry } = useEstimates(refreshKey, onExpired);
  const currencies = [...new Set(data?.items.map(item => item.currency) ?? [])].sort();
  const selectedCurrency = currencies.includes(currency) ? currency : currencies[0] ?? "USD";
  const items = data?.items.filter(item => item.currency === selectedCurrency) ?? [];
  const supported = items.filter(item => item.amount !== null).length;
  const subtotal = estimateSubtotal(items);
  const series = data ? collectionValueSeries(data, selectedCurrency, range) : [];
  const index = Math.min(cursor ?? Math.max(0, series.length - 1), Math.max(0, series.length - 1));
  const selected = series[index];
  const last = series.at(-1);
  const known = series.filter(point => point.amount !== null);
  const available = known.length > 0;
  const amounts = known.map(point => valueCents(point.amount!));
  const rawMin = amounts.reduce((min, amount) => amount < min ? amount : min, amounts[0] ?? 0n);
  const rawMax = amounts.reduce((max, amount) => amount > max ? amount : max, amounts[0] ?? 0n);
  const padding = (rawMax - rawMin) / 6n > 100n ? (rawMax - rawMin) / 6n : 100n;
  const min = rawMin > padding ? rawMin - padding : 0n;
  const max = rawMax + padding;
  // Only SVG coordinates become Number; totals, medians and axis labels stay exact.
  const y = (amount: string) => 240 - Number((valueCents(amount) - min) * 2400000n / (max - min)) / 10000;
  const x = (date: string) => eventPosition(date, series[0].date, last!.date) * 1000;
  let line = "";
  series.forEach((point, position) => {
    const previous = series[position - 1];
    if (previous?.amount !== null && previous?.amount !== undefined) line += ` H${x(point.date)}`;
    if (point.amount !== null) line += previous?.amount !== null && previous?.amount !== undefined ? ` V${y(point.amount)}` : ` M${x(point.date)},${y(point.amount)}`;
  });
  const selectedText = selected ? `${financeDate(selected.date)}: ${selected.amount === null ? "Unknown — insufficient matching sales" : financeMoney(selected.amount, selectedCurrency)}` : "No supported history";

  function explore(event: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, number> = { ArrowLeft: index - 1, ArrowDown: index - 1, ArrowRight: index + 1, ArrowUp: index + 1, Home: 0, End: series.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault(); setCursor(Math.min(series.length - 1, Math.max(0, keys[event.key])));
  }
  function inspectPosition(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
    let nearest = 0;
    series.forEach((point, position) => { if (Math.abs(x(point.date) / 1000 - fraction) < Math.abs(x(series[nearest].date) / 1000 - fraction)) nearest = position; });
    setCursor(nearest);
  }

  return <section className={`value-overview ${expanded ? "chart-expanded" : ""}`} aria-label="Collection estimate overview" aria-busy={pending}>
    {currencies.length > 1 && <div className="value-toolbar"><label className="metric-picker">Estimate currency<select aria-label="Estimate currency" value={selectedCurrency} onChange={event => { setCurrency(event.target.value); setCursor(null); }}>{currencies.map(item => <option key={item} value={item}>{item}</option>)}</select></label></div>}
    {showSummary && <div className="value-headline"><div><div className="metric-heading"><h2>Collection estimate</h2></div><strong className="overview-amount value-overview-amount" data-testid="collection-estimate">{pending || error ? "—" : subtotal === null ? "Unknown" : financeMoney(subtotal, selectedCurrency)}</strong></div><div className="period-summary"><span>Known subtotal · {selectedCurrency}</span>{data && <span>As of {financeDate(data.as_of)}</span>}</div></div>}
    {data && <p className="estimate-coverage">{supported} of {items.length} {selectedCurrency} unsold cards estimated; includes archived cards. {supported < items.length ? `${items.length - supported} unknown; excluded from this subtotal.` : ""}</p>}
    <button type="button" className="chart-expand-toggle" aria-expanded={expanded} aria-controls={chartId} onClick={() => { setExpanded(value => !value); setCursor(null); }}>{expanded ? "Hide value chart" : "Show value chart"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    <div className="value-history" id={chartId}>
      <h3 className="estimate-history-title">Estimate history for current cards</h3>
      <div className="chart-inspection"><span>{pending ? "Loading estimate history…" : error ? "Chart unavailable" : available ? selectedText : "No supported estimate history yet."}</span>{available && <span className="chart-hint"><span className="chart-desktop-hint">Hover or use arrow keys to explore</span><span className="chart-touch-hint">Touch chart to inspect</span></span>}</div>
      {available ? <>
        <div className="value-plot" role="slider" tabIndex={0} aria-label="Explore collection estimate history" aria-describedby={noteId} aria-valuemin={0} aria-valuemax={series.length - 1} aria-valuenow={index} aria-valuetext={selectedText} onKeyDown={explore} onFocus={() => setCursor(index)} onBlur={() => setCursor(null)} onPointerLeave={event => { if (document.activeElement !== event.currentTarget) setCursor(null); }}>
          <svg className="overview-chart" viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true" onPointerMove={inspectPosition} onPointerDown={event => { event.currentTarget.parentElement?.focus(); inspectPosition(event); }}>
            {[0, 120, 240].map(position => <line key={position} x1="0" x2="1000" y1={position} y2={position} className="chart-grid-line" vectorEffect="non-scaling-stroke" />)}
            <path d={line} className="chart-value-line value-history-line" vectorEffect="non-scaling-stroke" />
            {known.map(point => <circle key={point.date} cx={x(point.date)} cy={y(point.amount!)} r="2.5" fill="currentColor" className="chart-history-point" />)}
            {cursor !== null && selected && <line x1={x(selected.date)} x2={x(selected.date)} y1="0" y2="240" className="chart-cursor" vectorEffect="non-scaling-stroke" />}
          </svg>
          <div className="chart-y-axis" aria-hidden="true"><span>{financeMoney(valueAmount(max), selectedCurrency)}</span><span>{financeMoney(valueAmount((max + min) / 2n), selectedCurrency)}</span><span>{financeMoney(valueAmount(min), selectedCurrency)}</span></div>
          {selected?.amount !== null && selected?.amount !== undefined && cursor !== null && <span className="chart-dot" style={{ left: `calc((100% - var(--value-axis-space)) * ${x(selected.date) / 1000})`, top: `${y(selected.amount) / 240 * 100}%` }} />}
        </div>
        <div className="chart-x-axis"><span>{financeDate(series[0].date)}</span><span>{financeDate(last!.date)}</span></div>
      </> : <div className="chart-placeholder chart-empty-state"><p>{pending ? "Preparing saved sales…" : error ? "Retry to load your saved evidence." : `History needs at least ${data?.minimum_sales ?? 3} matching sales within ${data?.window_days ?? 180} days for every currently estimated card. Missing evidence remains unknown.`}</p></div>}
    </div>
    <div className="chart-bottom"><div className="chart-ranges" role="group" aria-label="Chart time range">{VALUE_RANGES.map(item => <button type="button" key={item.value} aria-label={item.label} title={item.label} aria-pressed={range === item.value} onClick={() => { onRangeChange(item.value); setCursor(null); }}>{item.shortLabel}</button>)}</div><span className="chart-scope">{supported} current {supported === 1 ? "card" : "cards"} with estimates</span></div>
    <p className="value-evidence-note" id={noteId}>Based on saved comparable sales; not historical holdings. Each date uses the same currently estimated cards and their current grades. Gaps are unknown. Sources and raw condition are unverified.</p>
    {error && <p className="chart-error" role="alert">Couldn’t load collection estimates. <button type="button" className="text-button" onClick={retry}>Retry chart</button></p>}
  </section>;
}
