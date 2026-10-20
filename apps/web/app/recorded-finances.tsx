"use client";

import Link from "next/link";
import { useEffect, useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { api, ApiError } from "../lib/api";
import { coverage, eventPosition, financeDate, financeMoney, FINANCE_METRICS, FINANCE_RANGES, type CurrencyFinances, type FinanceMetric, type FinanceMetricKey, type FinanceRange, type Finances, type RecordedAmount } from "../lib/finances";
import "./recorded-finances.css";

type Props = { refreshKey: number; onExpired: () => void };

function Amount({ metric, label, value, currency, note }: { metric: FinanceMetricKey; label: string; value: RecordedAmount; currency: string; note?: string }) {
  const partial = value.known_count < value.total_count || value.complete_count < value.total_count;
  return <div className={`finance-stat ${metric === "realized_profit" ? "finance-profit" : ""}`} data-metric={metric}>
    <dt>{label}{note && <span className="finance-stat-note">{note}</span>}</dt>
    <dd className={`finance-amount ${value.amount !== null && value.amount.startsWith("-") ? "finance-loss" : ""}`}>{value.amount === null ? "Unknown" : financeMoney(value.amount, currency)}</dd>
    <dd className="finance-coverage">{coverage(metric, value)}{partial && value.amount !== null ? " · partial total" : ""}</dd>
  </div>;
}

function ActivityChart({ group, data, metric, onMetricChange, expanded, onToggle }: { group: CurrencyFinances; data: Finances; metric: FinanceMetric; onMetricChange: (metric: FinanceMetric) => void; expanded: boolean; onToggle: () => void }) {
  const [cursor, setCursor] = useState<number | null>(null);
  const chartId = useId();
  const points = group.series.filter(point => point.metrics[metric].total_count > 0);
  const index = Math.min(cursor ?? Math.max(0, points.length - 1), Math.max(0, points.length - 1));
  const selected = points[index];
  const total = group.metrics[metric];
  const label = FINANCE_METRICS.find(item => item.value === metric)!.label;
  const start = data.start_date ?? points[0]?.date ?? data.end_date;
  const end = data.end_date;
  const numbers = points.flatMap(point => point.metrics[metric].amount === null ? [] : [Number(point.metrics[metric].amount)]);
  const min = Math.min(0, ...numbers); const max = Math.max(0, ...numbers);
  const span = max - min || 1;
  const y = (value: number) => 184 - (value - min) / span * 168;
  const x = (date: string) => 16 + eventPosition(date, start, end) * 968;
  const describe = (position: number) => {
    const point = points[position];
    return point ? `${financeDate(point.date)}: ${point.metrics[metric].amount === null ? "Unknown" : financeMoney(point.metrics[metric].amount!, group.currency)}. ${coverage(metric, point.metrics[metric])}` : "No dated activity";
  };
  function explore(event: KeyboardEvent<HTMLDivElement>) {
    const positions: Record<string, number> = { ArrowLeft: index - 1, ArrowDown: index - 1, ArrowRight: index + 1, ArrowUp: index + 1, Home: 0, End: points.length - 1 };
    if (!(event.key in positions)) return;
    event.preventDefault(); setCursor(Math.max(0, Math.min(points.length - 1, positions[event.key])));
  }
  function inspect(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const target = (event.clientX - box.left) / box.width * 1000;
    let closest = 0;
    points.forEach((point, position) => { if (Math.abs(x(point.date) - target) < Math.abs(x(points[closest].date) - target)) closest = position; });
    setCursor(closest);
  }
  return <div className={`finance-activity ${expanded ? "finance-chart-expanded" : ""}`}>
    <button type="button" className="finance-chart-toggle" aria-expanded={expanded} aria-controls={chartId} onClick={onToggle}>{expanded ? "Hide financial chart" : "Show financial chart"}<span aria-hidden="true">{expanded ? "−" : "+"}</span></button>
    <div className="finance-chart-content" id={chartId}>
      <div className="finance-chart-heading"><div><h3>Activity over time</h3><p className="finance-chart-total">{total.amount === null ? "Unknown" : financeMoney(total.amount, group.currency)}</p><p className="finance-chart-caption">{label} · selected period{total.known_count < total.total_count || total.complete_count < total.total_count ? " · incomplete" : ""}</p></div><label>Show<select aria-label="Financial chart metric" value={metric} onChange={event => { onMetricChange(event.target.value as FinanceMetric); setCursor(null); }}>{FINANCE_METRICS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label></div>
      {selected ? <>
        <p className="finance-inspection" aria-live="polite">{describe(index)}</p>
        <div className="finance-plot" role="slider" tabIndex={0} aria-label="Explore recorded financial activity" aria-valuemin={0} aria-valuemax={points.length - 1} aria-valuenow={index} aria-valuetext={`${label}. ${describe(index)}`} onKeyDown={explore}>
          <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true" onPointerMove={inspect} onPointerDown={event => { event.currentTarget.parentElement?.focus(); inspect(event); }}>
            <line x1="0" x2="1000" y1="16" y2="16" className="finance-grid" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2="1000" y1="100" y2="100" className="finance-grid" vectorEffect="non-scaling-stroke" />
            <line x1="0" x2="1000" y1={y(0)} y2={y(0)} className="finance-zero" vectorEffect="non-scaling-stroke" />
            {points.map((point, position) => {
              const amount = point.metrics[metric].amount;
              const positionX = x(point.date);
              if (amount === null) return <path key={point.date} d={`M${positionX - 4},${y(0) - 8}l8,8m-8,0l8,-8`} className="finance-unknown-point" vectorEffect="non-scaling-stroke" />;
              const top = Math.min(y(Number(amount)), y(0));
              const width = Math.max(6, Math.min(16, 500 / points.length));
              return <rect key={point.date} x={positionX - width / 2} width={width} y={Number(amount) === 0 ? y(0) - 2 : top} height={Math.max(2, Math.abs(y(Number(amount)) - y(0)))} className={`${Number(amount) < 0 ? "finance-bar-loss" : "finance-bar"} ${position === index ? "finance-bar-selected" : ""}`} />;
            })}
            <line x1={x(selected.date)} x2={x(selected.date)} y1="8" y2="192" className="finance-cursor" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div className="finance-chart-dates"><span>{financeDate(start)}</span><span>{financeDate(end)}</span></div>
        <p className="finance-chart-help">Daily recorded amounts; calendar spacing. Use arrow keys or touch to inspect. × means unknown.</p>
      </> : <div className="finance-empty-activity"><p className="finance-no-activity">No dated {label.toLowerCase()} activity in this period.</p><p>Add purchase or sale dates to see activity here. Collection estimates are a current snapshot, not transaction history.</p><Link className="workspace-text-link" href="/collection">Review card records →</Link></div>}
    </div>
  </div>;
}

export default function RecordedFinances({ refreshKey, onExpired }: Props) {
  const [range, setRange] = useState<FinanceRange>("all");
  const [currency, setCurrency] = useState("USD");
  const [chartMetric, setChartMetric] = useState<FinanceMetric>("net_sales");
  const [chartExpanded, setChartExpanded] = useState(true);
  const [data, setData] = useState<Finances | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let request: AbortController;
    async function load() {
      request?.abort();
      const controller = new AbortController(); request = controller;
      setPending(true); setError(false);
      try {
        const response = await api<Finances>(`/finances?range=${range}`, { signal: controller.signal });
        if (!controller.signal.aborted) setData(response);
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
  }, [range, refreshKey, retry, onExpired]);
  const current = data?.range === range ? data : null;
  const group = current?.currencies.find(item => item.currency === currency) ?? current?.currencies.find(item => item.currency === "USD") ?? current?.currencies[0];
  const missingCostCount = group ? group.metrics.owned_cost.total_count - group.metrics.owned_cost.complete_count : 0;
  const ready = !pending && !error && current;
  return <section className="recorded-finances" aria-label="Recorded finances" aria-busy={pending || !current && !error}>
    <div className="finance-heading"><div><h2>Spending & sales</h2><p>From your saved purchase and sale records.</p></div><div className="finance-controls">
      <label>Period<select aria-label="Finance period" value={range} onChange={event => setRange(event.target.value as FinanceRange)}>{FINANCE_RANGES.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      {!!current?.currencies.length && <label>Currency<select aria-label="Financial currency" value={group?.currency ?? "USD"} onChange={event => setCurrency(event.target.value)}>{current.currencies.map(item => <option key={item.currency} value={item.currency}>{item.currency}</option>)}</select></label>}
    </div></div>
    {error ? <p role="alert" className="finance-error">Couldn’t load the financial summary. <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry financial summary</button></p> : !ready ? <p role="status" className="finance-status">Loading recorded finances…</p> : !group ? <p className="finance-status">Add a card to start recording purchases and sales. Missing amounts stay unknown.</p> : <>
      <dl className="finance-summary">
        <Amount metric="acquisition_spending" label="Recorded spending" note="Purchase price and other costs" value={group.metrics.acquisition_spending} currency={group.currency} />
        <Amount metric="net_sales" label="Sales after fees" value={group.metrics.net_sales} currency={group.currency} />
        <Amount metric="realized_profit" label="Profit after costs" note="From sold cards only" value={group.metrics.realized_profit} currency={group.currency} />
      </dl>
      {missingCostCount > 0 && <div className="finance-data-gap"><p>{missingCostCount} owned {missingCostCount === 1 ? "card needs" : "cards need"} cost details. Estimates are not purchase prices.</p><Link className="workspace-text-link" href="/collection">Update card costs →</Link></div>}
      <details className="finance-breakdown"><summary>Sales and cost breakdown</summary><dl className="finance-breakdown-values">
        <Amount metric="owned_cost" label="Cost of cards still owned" note="Current snapshot · all dates" value={group.metrics.owned_cost} currency={group.currency} />
        <Amount metric="gross_sales" label="Gross sales" value={group.metrics.gross_sales} currency={group.currency} />
        <Amount metric="sale_fees" label="Selling fees" value={group.metrics.sale_fees} currency={group.currency} />
        <Amount metric="profit_vs_purchase" label="Profit vs. purchase price" note="Excludes shipping, tax and other acquisition costs" value={group.metrics.profit_vs_purchase} currency={group.currency} />
      </dl></details>
      <ActivityChart key={`${group.currency}-${range}`} group={group} data={current} metric={chartMetric} onMetricChange={setChartMetric} expanded={chartExpanded} onToggle={() => setChartExpanded(value => !value)} />
      <details className="finance-methodology"><summary>How these figures work</summary><p className="finance-scope">Includes archived cards and every saved record, independent of collection filters. Unknown costs are never counted as zero. Partial totals include only supported amounts. Realized profit subtracts selling fees and all acquisition costs; profit vs. purchase price excludes shipping, tax and other acquisition costs. Current owned cost is an all-date snapshot, independent of the selected period.</p></details>
      {(group.undated_acquisitions > 0 || group.undated_sales > 0) && <p className="finance-date-note">Undated records: {group.undated_acquisitions} acquisitions and {group.undated_sales} sales. Included in all-time totals; excluded from dated ranges and charts.</p>}
      {(group.future_acquisitions > 0 || group.future_sales > 0) && <p className="finance-date-note">Future-dated records: {group.future_acquisitions} acquisitions and {group.future_sales} sales. Excluded from spending and sales totals and charts until their date. Current owned cost includes all owned cards.</p>}
      <p className="finance-asof">Through {financeDate(current.as_of)} · UTC dates · {group.currency} only</p>
    </>}
  </section>;
}
