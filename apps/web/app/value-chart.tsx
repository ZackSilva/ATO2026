"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Card, Inventory } from "../lib/cards";
import { demoMoney, periodChange, valueSeries, VALUE_METRICS, VALUE_RANGES, type ValueRange, type ValueMetric } from "../lib/demo-values";
import "./values.css";

type Props = { range: ValueRange; onRangeChange: (range: ValueRange) => void; refreshKey: number; onExpired: () => void };
const dateLabel = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

export default function CollectionValueChart({ range, onRangeChange, refreshKey, onExpired }: Props) {
  const [expanded, setExpanded] = useState(false);
  const chartId = useId();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [metric, setMetric] = useState<ValueMetric>("value");
  const [cursor, setCursor] = useState<number | null>(null);
  const [asOf, setAsOf] = useState(() => new Date());

  useEffect(() => {
    let request: AbortController;
    async function load() {
      request?.abort();
      const controller = new AbortController(); request = controller;
      setPending(true);
      try {
        // The overview includes every active card, independent of row filters or pagination.
        const active: Card[] = [];
        let total = 1;
        while (active.length < total) {
          const page = await api<Inventory>(`/cards?status=active&sort=subject&limit=100&offset=${active.length}`, { signal: controller.signal });
          active.push(...page.items); total = page.total;
          if (page.items.length === 0) break;
        }
        if (!controller.signal.aborted) { setCards(active); setAsOf(new Date()); setError(false); setCursor(null); }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError(true);
      } finally { if (!controller.signal.aborted) setPending(false); }
    }
    const timer = window.setTimeout(() => void load(), 0);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { window.clearTimeout(timer); request?.abort(); window.removeEventListener("focus", focus); };
  }, [refreshKey, retry, onExpired]);

  const series = useMemo(() => valueSeries(cards ?? [], range, metric, asOf), [cards, range, metric, asOf]);
  const change = periodChange(series);
  const last = series.at(-1);
  const index = Math.min(cursor ?? Math.max(0, series.length - 1), Math.max(0, series.length - 1));
  const selected = series[index];
  const selectedRange = VALUE_RANGES.find(item => item.value === range)!;
  const metricLabel = VALUE_METRICS.find(item => item.value === metric)!.label;
  const available = !!cards?.length && !!last;
  const rawMin = series.length ? Math.min(...series.map(point => point.value)) : 0;
  const rawMax = series.length ? Math.max(...series.map(point => point.value)) : 0;
  const padding = Math.max((rawMax - rawMin) * .16, 100);
  const min = rawMin - padding; const max = rawMax + padding;
  const y = (value: number) => 240 - (value - min) / (max - min) * 240;
  const x = (position: number) => position / Math.max(1, series.length - 1) * 1000;
  const line = series.map((point, position) => `${x(position)},${y(point.value)}`).join(" ");
  const axisLabel = (value: number) => demoMoney(value, max - min >= 10000);

  function explore(event: KeyboardEvent<HTMLDivElement>) {
    const keys: Record<string, number> = { ArrowLeft: index - 1, ArrowDown: index - 1, ArrowRight: index + 1, ArrowUp: index + 1, Home: 0, End: series.length - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault(); setCursor(Math.min(series.length - 1, Math.max(0, keys[event.key])));
  }

  function inspectPosition(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    setCursor(Math.max(0, Math.min(series.length - 1, Math.round((event.clientX - box.left) / box.width * (series.length - 1)))));
  }

  return <section className={`value-overview ${expanded ? "chart-expanded" : ""}`} aria-label="Collection value overview" aria-busy={pending}>
    <div className="value-toolbar"><label className="metric-picker">Chart metric<select aria-label="Chart metric" value={metric} onChange={event => { setMetric(event.target.value as ValueMetric); setCursor(null); }}>{VALUE_METRICS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
    <div className="value-headline"><div><div className="metric-heading"><h2>{metricLabel}</h2><span className="demo-label">Demo · USD</span></div><strong className="overview-amount value-overview-amount">{available && selected ? demoMoney(selected.value) : "—"}</strong></div><div className="period-summary">{available && <><span className={change.amount < 0 ? "value-down" : "value-up"}>{change.amount >= 0 ? "+" : "−"}{demoMoney(Math.abs(change.amount))}{change.percent !== null ? ` (${change.percent >= 0 ? "+" : ""}${change.percent.toFixed(1)}%)` : ""}</span><span>{selectedRange.label.toLowerCase()} change</span></>}</div></div>
    <button type="button" className="chart-expand-toggle" aria-expanded={expanded} aria-controls={chartId} onClick={() => { setExpanded(value => !value); setCursor(null); }}>{expanded ? "Hide value chart" : "Show value chart"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    <div className="value-history" id={chartId}>
    <div className="chart-inspection">{available && selected ? <span>{cursor === null ? "Latest" : "Viewing"} · {dateLabel(selected.date)}</span> : <span>{pending ? "Preparing demo history…" : error ? "Chart unavailable" : "Add a card to explore its value history."}</span>}<span className="chart-hint"><span className="chart-desktop-hint">Hover or use arrow keys to explore</span><span className="chart-touch-hint">Touch chart to inspect</span></span></div>
    {available ? <>
      <div className="value-plot" role="slider" tabIndex={0} aria-label="Explore demo value history" aria-valuemin={0} aria-valuemax={series.length - 1} aria-valuenow={index} aria-valuetext={selected ? `${dateLabel(selected.date)}: ${demoMoney(selected.value)}` : "No values"} onKeyDown={explore} onFocus={() => setCursor(index)} onBlur={() => setCursor(null)} onPointerLeave={event => { if (document.activeElement !== event.currentTarget) setCursor(null); }}>
        <svg className="overview-chart" viewBox="0 0 1000 240" preserveAspectRatio="none" aria-hidden="true" onPointerMove={inspectPosition} onPointerDown={event => { event.currentTarget.parentElement?.focus(); inspectPosition(event); }}>
          {[0, 120, 240].map(position => <line key={position} x1="0" x2="1000" y1={position} y2={position} className="chart-grid-line" vectorEffect="non-scaling-stroke" />)}
          {min < 0 && max > 0 && <line x1="0" x2="1000" y1={y(0)} y2={y(0)} className="chart-zero-line" vectorEffect="non-scaling-stroke" />}
          <polygon points={`0,240 ${line} 1000,240`} className="chart-area" />
          <polyline points={line} className="chart-value-line value-history-line" vectorEffect="non-scaling-stroke" />
          {cursor !== null && selected && <line x1={x(index)} x2={x(index)} y1="0" y2="240" className="chart-cursor" vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="chart-y-axis" aria-hidden="true"><span>{axisLabel(max)}</span><span>{axisLabel((max + min) / 2)}</span><span>{axisLabel(min)}</span></div>
        {selected && cursor !== null && <span className="chart-dot" style={{ left: `calc((100% - 70px) * ${x(index) / 1000})`, top: `${y(selected.value) / 240 * 100}%` }} />}
      </div>
      <div className="chart-x-axis"><span>{dateLabel(series[0].date)}</span><span>{dateLabel(last.date)}</span></div>
    </> : <div className="chart-placeholder" aria-hidden="true"><span /></div>}
    </div>
    <div className="chart-bottom"><div className="chart-ranges" role="group" aria-label="Chart time range">{VALUE_RANGES.map(item => <button type="button" key={item.value} aria-label={item.label} title={item.label} aria-pressed={range === item.value} onClick={() => { onRangeChange(item.value); setCursor(null); }}>{item.shortLabel}</button>)}</div><span className="chart-scope">{cards ? `${cards.length} active ${cards.length === 1 ? "card" : "cards"}` : "Active collection"}</span></div>
    <p className="value-demo-note">Fictional values for your active cards; saved purchase records stay separate.{range === "all" ? " All time shows two years of sample history." : ""}</p>
    {error && <p className="chart-error" role="alert">{cards ? "Couldn’t refresh the chart. Showing the previous demo." : "Couldn’t load the chart."} <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry chart</button></p>}
  </section>;
}
