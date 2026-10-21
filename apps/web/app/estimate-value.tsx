"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import { cardSubtitle, type Card } from "../lib/cards";
import type { ComparableReport } from "../lib/estimates";
import { financeMoney } from "../lib/finances";
import MarketLink from "./market-link";
import { SavedSalesHistory } from "./card-sales-history";
import "./card-detail.css";

export default function EstimateValue({ card, onClose, onChange, onExpired }: {
  card: Card; onClose: () => void; onChange: () => void; onExpired: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [report, setReport] = useState<ComparableReport | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal(); close.current?.focus();
    return () => { element.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const value = await api<ComparableReport>(`/cards/${card.id}/comparables`, { signal: controller.signal });
        if (!controller.signal.aborted) { setReport(value); setError(""); }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError((failure as Error).message);
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [card.id, version, onExpired]);
  const estimate = report?.estimate;
  return <dialog className="card-dialog estimate-dialog" ref={dialog} aria-labelledby="estimate-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="editor-heading"><div><span className="eyebrow">YOUR CARD’S MARKET VALUE</span><h2 id="estimate-dialog-title">Estimate Value</h2><p>{card.subject} · {cardSubtitle(card)}</p></div><button type="button" ref={close} className="icon-button" aria-label="Close value estimate" onClick={onClose}>✕</button></div>
    <p>Review the exact card and grading label before using its completed sales. Your purchase costs stay unchanged.</p>
    <div className="estimate-result" aria-live="polite">
      {error ? <p className="error" role="alert">{error}</p> : !report ? <p role="status">Checking current estimate…</p> : <>
        <strong>{estimate?.amount ? financeMoney(estimate.amount, card.currency) : "Not enough sales data"}</strong>
        <p>{estimate?.amount ? `${estimate.sample_count} matching sales · ${estimate.confidence} confidence` : estimate?.reason}</p>
        {estimate?.pricing_note && <p>{estimate.pricing_note}</p>}
      </>}
    </div>
    <MarketLink card={card} autoFind onChange={() => { setVersion(value => value + 1); onChange(); }} />
    {report && <SavedSalesHistory report={report} currency={card.currency} headingLevel={3} />}
    <div className="editor-actions"><button type="button" className="secondary" onClick={onClose}>Done</button></div>
  </dialog>;
}
