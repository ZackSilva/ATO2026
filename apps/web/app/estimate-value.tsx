"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { cardSubtitle, type Card } from "../lib/cards";
import type { ComparableReport } from "../lib/estimates";
import type { MarketSearch } from "../lib/market-search";
import { financeMoney } from "../lib/finances";
import { useWorkspace } from "./workspace-shell";
import MarketLink from "./market-link";
import AuctionSales from "./auction-sales";
import { SavedSalesHistory } from "./card-sales-history";
import "./card-detail.css";

export default function EstimateValue({ card, onClose, onChange, onExpired, onQuerySaved }: {
  card: Card; onClose: () => void; onChange: () => void; onExpired: () => void; onQuerySaved: (saved: Card) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const saveRequest = useRef<AbortController | null>(null);
  const { session } = useWorkspace();
  const [report, setReport] = useState<ComparableReport | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [savedCard, setSavedCard] = useState(card);
  const [query, setQuery] = useState(card.market_query || "");
  const [period, setPeriod] = useState("6m");
  const [searchResults, setSearchResults] = useState<MarketSearch | null>(null);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal(); close.current?.focus();
    return () => {
      searchRequest.current?.abort(); saveRequest.current?.abort();
      element.close(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
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

  async function researchSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    searchRequest.current?.abort();
    const controller = new AbortController(); searchRequest.current = controller;
    setSearchPending(true); setSearchError(""); setSearchResults(null);
    try {
      const result = await api<MarketSearch>("/market/search", {
        method: "POST", signal: controller.signal, headers: { "X-CSRF-Token": session.csrf_token },
        body: JSON.stringify({ query: query.trim(), period }),
      });
      if (!controller.signal.aborted) setSearchResults(result);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setSearchError((failure as Error).message);
    } finally { if (!controller.signal.aborted) setSearchPending(false); }
  }

  async function saveQuery() {
    const controller = new AbortController(); saveRequest.current = controller;
    setSavePending(true); setSaveError(""); setNotice("");
    try {
      const updated = await api<Card>(`/cards/${card.id}/market-query`, {
        method: "PUT", signal: controller.signal, headers: { "X-CSRF-Token": session.csrf_token },
        body: JSON.stringify({ market_query: query.trim(), revision: savedCard.revision }),
      });
      if (!controller.signal.aborted) {
        setSavedCard(updated); setQuery(updated.market_query || ""); onQuerySaved(updated);
        setNotice(updated.market_query ? "Research query saved. Search sales whenever you want updated results." : "Saved research query removed.");
        onChange();
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setSaveError((failure as Error).message);
    } finally { if (!controller.signal.aborted) setSavePending(false); }
  }
  const estimate = report?.estimate;
  const queryValid = !query.trim() || query.trim().length >= 4;
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
    <section className="research-query" aria-labelledby="research-query-title">
      <h3 id="research-query-title">Research auction sales</h3>
      <p className="research-guide">Search a description or save it for next time. Results may include different issues, variants or grades. Research searches do not change your card’s confirmed match, estimate or saved comparables.</p>
      <form className="market-search-form market-form" aria-label="Custom auction search" onSubmit={researchSearch}>
        <fieldset disabled={searchPending || savePending}>
          <label>Card search<input name="query" type="search" minLength={4} maxLength={200} required placeholder="1986 Fleer Michael Jordan #57 PSA 9" value={query} onChange={event => { setQuery(event.target.value); setNotice(""); }} /></label>
          <label>Sale period<select name="period" value={period} onChange={event => setPeriod(event.target.value)}><option value="all">All available history</option><option value="6m">Last six months</option><option value="3m">Last three months</option><option value="1m">Last month</option></select></label>
          <button className="primary" type="submit">{searchPending ? "Searching auctions…" : "Search sales"}</button>
        </fieldset>
      </form>
      <div className="research-query-actions"><button type="button" className="secondary" disabled={savePending || searchPending || !queryValid || query.trim() === (savedCard.market_query || "")} onClick={() => void saveQuery()}>{savePending ? "Saving query…" : query.trim() ? "Save research query" : "Remove saved query"}</button></div>
      {notice && <p role="status">{notice}</p>}
      {saveError && <p className="error" role="alert">{saveError}</p>}
      {searchError && <p className="error" role="alert">{searchError}</p>}
      {searchPending && <p role="status">Finding completed auction sales…</p>}
      {searchResults && <>
        <p className="research-results-count">{searchResults.returned_count} auction {searchResults.returned_count === 1 ? "sale" : "sales"} found for “{searchResults.query}”.</p>
        {searchResults.truncated && <p className="research-guide">The provider returned its search limit. Narrow your query or time range to explore more relevant sales.</p>}
        {searchResults.items.length ? <AuctionSales key={searchResults.fetched_at} items={searchResults.items} /> : <p>No completed auctions matched. Try another description or a wider period.</p>}
      </>}
    </section>
    <div className="editor-actions"><button type="button" className="secondary" onClick={onClose}>Done</button></div>
  </dialog>;
}
