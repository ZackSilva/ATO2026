"use client";

import { useEffect, useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Card } from "../lib/cards";
import type { ComparableReport } from "../lib/estimates";
import { VALUE_RANGES, type ValueRange } from "../lib/collection-values";
import { eventPosition, financeDate, financeMoney } from "../lib/finances";
import { saleHistoryWindow, type SaleObservation } from "../lib/sale-history";
import "./card-sales-history.css";

export function SalesHistoryChart({ history, currency, headingLevel = 3 }: { history: SaleObservation[]; currency: string; headingLevel?: 2 | 3 }) {
  const [range, setRange] = useState<ValueRange>("all");
  const [cursor, setCursor] = useState<number | null>(null);
  const headingId = useId();
  const today = new Date().toISOString().slice(0, 10);
  const { start, end, sales } = saleHistoryWindow(history, range, today);
  const index = Math.min(cursor ?? Math.max(0, sales.length - 1), Math.max(0, sales.length - 1));
  const selected = sales[index];
  const amounts = sales.map(sale => Number(sale.price));
  const low = Math.min(...amounts), high = Math.max(...amounts);
  const x = (date: string) => 8 + eventPosition(date, start, end) * 984;
  const y = (price: string) => high === low ? 100 : 184 - (Number(price) - low) / (high - low) * 168;
  const describe = selected ? `${financeDate(selected.sold_on)}: ${financeMoney(selected.price, currency)}. Sale ${index + 1} of ${sales.length}.` : "No matching sales in this range.";
  const Heading = headingLevel === 2 ? "h2" : "h3";

  function explore(event: KeyboardEvent<HTMLDivElement>) {
    const positions: Record<string, number> = { ArrowLeft: index - 1, ArrowDown: index - 1, ArrowRight: index + 1, ArrowUp: index + 1, Home: 0, End: sales.length - 1 };
    if (!(event.key in positions)) return;
    event.preventDefault(); setCursor(Math.max(0, Math.min(sales.length - 1, positions[event.key])));
  }
  function inspect(event: PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const target = (event.clientX - box.left) / box.width * 1000;
    let nearest = 0;
    sales.forEach((sale, position) => { if (Math.abs(x(sale.sold_on) - target) < Math.abs(x(sales[nearest].sold_on) - target)) nearest = position; });
    setCursor(nearest);
  }

  return <section className="card-sales-history" aria-labelledby={headingId}>
    <Heading id={headingId}>Sales history</Heading>
    <p className="sales-history-caption">Recorded comparable sale prices · {currency}</p>
    <div className="sales-history-ranges" role="group" aria-label="Sales history period">{VALUE_RANGES.map(item => <button type="button" key={item.value} aria-label={item.label} aria-pressed={range === item.value} onClick={() => { setRange(item.value); setCursor(null); }}>{item.shortLabel}</button>)}</div>
    {selected ? <>
      <p className="sales-history-inspection" aria-live="polite">{describe}</p>
      <div className="sales-history-plot" role="slider" tabIndex={0} aria-label="Explore card sales history" aria-valuemin={0} aria-valuemax={sales.length - 1} aria-valuenow={index} aria-valuetext={describe} onKeyDown={explore}>
        <svg viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true" onPointerMove={inspect} onPointerDown={event => { event.currentTarget.parentElement?.focus(); inspect(event); }}>
          {[16, 100, 184].map(position => <line key={position} x1="0" x2="1000" y1={position} y2={position} className="sales-history-grid" vectorEffect="non-scaling-stroke" />)}
          {sales.length > 1 && <polyline className="sales-history-line" points={sales.map(sale => `${x(sale.sold_on)},${y(sale.price)}`).join(" ")} vectorEffect="non-scaling-stroke" />}
          {sales.map((sale, position) => <circle key={position} cx={x(sale.sold_on)} cy={y(sale.price)} r={position === index ? 4 : 2.5} className="sales-history-point"><title>{financeDate(sale.sold_on)}: {financeMoney(sale.price, currency)}</title></circle>)}
          <line x1={x(selected.sold_on)} x2={x(selected.sold_on)} y1="8" y2="192" className="sales-history-cursor" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="sales-history-dates"><span>{financeDate(start)}</span><span>{financeDate(end)}</span></div>
      <p className="sales-history-help">{sales.length} matching {sales.length === 1 ? "sale" : "sales"}. Use arrow keys or touch to inspect each price. Lines connect recorded sales; they do not supply prices between dates.</p>
    </> : <p className="sales-history-empty">No matching sales in this range.{history.length > 0 ? " Choose All time to see older sales." : " Record sold comparables to build this history."}</p>}
    <p className="sales-history-note">Same card, currency, condition and grade. Sources and raw condition are unverified. These are market sales, separate from your purchase and sale records.</p>
  </section>;
}

export default function CardSalesHistory({ card, active, onExpired }: { card: Card; active: boolean; onExpired: () => void }) {
  const [report, setReport] = useState<ComparableReport | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!active) return;
    let request: AbortController;
    async function load() {
      request?.abort();
      const controller = new AbortController(); request = controller;
      setPending(true); setError(false);
      try {
        const result = await api<ComparableReport>(`/cards/${card.id}/comparables`, { signal: controller.signal });
        if (!controller.signal.aborted) setReport(result);
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
  }, [card.id, card.revision, active, retry, onExpired]);
  if (pending) return <section aria-label="Sales history" aria-busy="true"><p role="status">Loading card sales history…</p></section>;
  if (error) return <section aria-label="Sales history"><p role="alert" className="error">Couldn’t load card sales history. <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry card sales history</button></p></section>;
  return <SalesHistoryChart history={report?.estimate.history ?? []} currency={card.currency} />;
}
