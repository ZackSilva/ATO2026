"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../../../../lib/api";
import { cardSubtitle, type Card } from "../../../../../lib/cards";
import type { ComparableReport } from "../../../../../lib/estimates";
import { financeDate, financeMoney } from "../../../../../lib/finances";
import { useWorkspace } from "../../../../workspace-shell";
import "../../../../market.css";

export default function CardMarketPage() {
  const { id } = useParams<{ id: string }>();
  const { session, onExpired } = useWorkspace();
  const [card, setCard] = useState<Card | null>(null);
  const [report, setReport] = useState<ComparableReport | null>(null);
  const [pending, setPending] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const [condition, setCondition] = useState("raw");
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPending(true); setError("");
      try {
        const [copy, sales] = await Promise.all([
          api<Card>(`/cards/${id}`, { signal: controller.signal }),
          api<ComparableReport>(`/cards/${id}/comparables`, { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) { setCard(copy); setReport(sales); setCondition(copy.condition); }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError((failure as Error).message);
      } finally { if (!controller.signal.aborted) setPending(false); }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [id, version, onExpired]);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const value = (name: string) => String(fields.get(name) ?? "").trim();
    setBusy(true); setActionError(""); setNotice("");
    try {
      await api(`/cards/${id}/comparables`, { method: "POST", headers: { "X-CSRF-Token": session.csrf_token }, body: JSON.stringify({
        expected_definition_id: card!.definition_id,
        sold_on: value("sold_on"), price: value("price"), currency: value("currency").toUpperCase(),
        condition, grader: condition === "graded" ? value("grader") : "", grade: condition === "graded" ? value("grade") : "",
        source: value("source"), source_url: value("source_url"),
      }) });
      form.reset(); setPending(true); setVersion(value => value + 1); setNotice("Sold comparable recorded. Estimates will recalculate from the saved evidence.");
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setActionError((failure as Error).message);
    } finally { setBusy(false); }
  }

  async function remove(saleId: string) {
    setBusy(true); setActionError(""); setNotice("");
    try {
      await api(`/cards/${id}/comparables/${saleId}`, { method: "DELETE", headers: { "X-CSRF-Token": session.csrf_token } });
      setDeleting(null); setPending(true); setVersion(value => value + 1); setNotice("Sold comparable removed. Estimates will recalculate.");
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setActionError((failure as Error).message);
    } finally { setBusy(false); }
  }

  const estimate = report?.estimate;
  const today = new Date().toISOString().slice(0, 10);
  return <main className="workspace-page" id="main">
    <Link className="workspace-text-link" href="/collection">← My Collection</Link>
    <div className="workspace-heading market-data-heading"><div><h1>Sold comparables</h1><p>{card ? `${card.subject} · ${cardSubtitle(card)}` : "Your card’s market evidence."}</p></div></div>
    {pending ? <p role="status">Loading sold comparables…</p> : error ? <p role="alert" className="error">{error} <button type="button" className="text-button" onClick={() => setVersion(value => value + 1)}>Retry sold comparables</button></p> : card && report && <>
      <section className="workspace-section" aria-labelledby="current-estimate">
        <h2 id="current-estimate">Current estimate</h2>
        <div className="market-headline"><strong data-testid="card-market-estimate">{estimate?.amount ? financeMoney(estimate.amount, card.currency) : "Insufficient Market Data"}</strong></div>
        {estimate?.amount && <p>{estimate.confidence} confidence · {estimate.sample_count} matching sales · Observed range {financeMoney(estimate.low!, card.currency)} – {financeMoney(estimate.high!, card.currency)}</p>}
        <p className="market-method">{estimate?.reason}</p>
        <p className="market-method">Same card identity and currency; at least three sold comparables from the past 180 days. Raw cards use raw sales. Graded cards use the same grading company and grade. Other grades and older sales remain listed below as context. Prices exclude shipping and taxes; they do not include selling fees.</p>
      </section>
      <section className="workspace-section" aria-labelledby="record-comparable">
        <h2 id="record-comparable">Record a sold comparable</h2>
        <p className="market-method">Record an actual completed sale you researched, including the accepted price for a Best Offer. Asking prices and unsold listings do not belong here. Sources are not automatically fetched or verified. No live price feed is connected.</p>
        <p className="market-method">Comparables are shared by your copies with this exact card identity. Check the year, set, card number, parallel, autograph, and other details before recording a sale. They never change your card’s grading or purchase records.</p>
        <form className="market-form" onSubmit={add} aria-label="Record sold comparable">
          <fieldset disabled={busy || pending} aria-label="Completed sale details">
            <div className="market-form-grid">
              <label>Sold price<input name="price" type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" required /></label>
              <label>Sale currency<input name="currency" defaultValue={card.currency} pattern="[A-Za-z]{3}" maxLength={3} required autoCapitalize="characters" /></label>
              <label>Sale date<input name="sold_on" type="date" defaultValue={today} max={today} required /></label>
              <label>Comparable condition<select name="condition" aria-label="Comparable condition" value={condition} onChange={event => setCondition(event.target.value)}><option value="raw">Raw (ungraded)</option><option value="graded">Graded</option></select></label>
              {condition === "graded" && <><label>Comparable grading company<input name="grader" maxLength={50} defaultValue={card.grader || "PSA"} required /></label><label>Comparable grade<input name="grade" maxLength={20} defaultValue={card.grade} required /></label></>}
              <label className="market-form-wide">Sale source<input name="source" placeholder="eBay Product Research, auction house, private sale…" maxLength={120} required /></label>
              <label className="market-form-wide">Sale source URL (optional)<input name="source_url" type="url" maxLength={2048} placeholder="https://…" /></label>
            </div>
            <button className="primary" type="submit">{busy ? "Saving…" : "Record sold comparable"}</button>
          </fieldset>
        </form>
      </section>
      <section className="workspace-section" aria-labelledby="recorded-comparables">
        <h2 id="recorded-comparables">Recorded sales · {report.items.length}</h2>
        {!report.items.length ? <p>No sold comparables yet. Missing market evidence is never replaced with a fictional value.</p> : <ul className="market-comparables">{report.items.map(sale => <li key={sale.id}>
          <div><h3>{financeMoney(sale.price, sale.currency)} · {sale.condition === "raw" ? "Raw" : `${sale.grader} ${sale.grade}`}</h3><p>{financeDate(sale.sold_on)} · {sale.source} · User recorded, unverified</p>{sale.source_url && <p><a href={sale.source_url} target="_blank" rel="noreferrer">View sale source ↗</a></p>}</div>
          {deleting === sale.id ? <div><p>Remove this sale from the evidence for all matching copies?</p><button type="button" className="secondary" disabled={busy} onClick={() => void remove(sale.id)}>Confirm removal</button><button type="button" className="text-button" disabled={busy} onClick={() => setDeleting(null)}>Cancel</button></div> : <button type="button" className="secondary" disabled={busy} onClick={() => setDeleting(sale.id)}>Remove sale</button>}
        </li>)}</ul>}
      </section>
    </>}
    {notice && <p role="status" className="success">{notice}</p>}
    {actionError && <p role="alert" className="error">{actionError}</p>}
  </main>;
}
