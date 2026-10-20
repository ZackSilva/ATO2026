"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { api, ApiError } from "../lib/api";
import type { MarketSearch, MarketStatus } from "../lib/market-search";
import { useWorkspace } from "./workspace-shell";
import AuctionSales from "./auction-sales";
import "./market.css";

export default function AuctionSearch() {
  const params = useSearchParams();
  const { session, onExpired } = useWorkspace();
  const [query, setQuery] = useState(() => (params.get("q") ?? "").slice(0, 200));
  const [condition, setCondition] = useState("all");
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [statusVersion, setStatusVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<MarketSearch | null>(null);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatusError("");
      try { setStatus(await api<MarketStatus>("/market/status", { signal: controller.signal })); }
      catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setStatusError((failure as Error).message);
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [onExpired, statusVersion]);
  useEffect(() => () => request.current?.abort(), []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError(""); setResult(null);
    try {
      const found = await api<MarketSearch>("/market/search", {
        method: "POST", signal: controller.signal, headers: { "X-CSRF-Token": session.csrf_token },
        body: JSON.stringify({ query: query.trim(), period: String(fields.get("period")), condition,
          grader: condition === "graded" ? String(fields.get("grader") ?? "").trim() : "",
          grade: condition === "graded" ? String(fields.get("grade") ?? "").trim() : "" }),
      });
      if (controller.signal.aborted) return;
      setResult(found);
      window.requestAnimationFrame(() => heading.current?.focus());
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setError((failure as Error).message);
    } finally { if (!controller.signal.aborted) setPending(false); }
  }

  return <>
    {!status && !statusError && <p role="status">Checking sales search…</p>}
    {statusError && <p role="alert" className="error">{statusError} <button className="text-button" type="button" onClick={() => setStatusVersion(value => value + 1)}>Retry search connection</button></p>}
    {status && !status.configured && <section className="market-search-setup" aria-labelledby="search-setup"><h2 id="search-setup">Connect CardSight to search sales</h2><p>The account owner needs to connect a CardSight account before automatic search is available. No sales files or manual entry are needed.</p></section>}
    <form className="market-search-form market-form" aria-label="Search auction sales" onSubmit={search}>
      <fieldset disabled={pending || !status?.configured}>
        <label>Card search<input name="query" aria-label="Card search" type="search" minLength={4} maxLength={200} required placeholder="1986 Fleer Michael Jordan #57" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <details className="market-search-filters"><summary>Search filters</summary><div className="market-form-grid">
          <label>Sale period<select name="period" aria-label="Sale period" defaultValue="6m"><option value="all">All available history</option><option value="1y">Last year</option><option value="6m">Last six months</option><option value="3m">Last three months</option><option value="1m">Last month</option><option value="1w">Last week</option></select></label>
          <label>Sale condition<select name="condition" aria-label="Sale condition" value={condition} onChange={event => setCondition(event.target.value)}><option value="all">All conditions</option><option value="raw">Raw (ungraded)</option><option value="graded">Graded</option></select></label>
          {condition === "graded" && <><label>Grading company<input name="grader" aria-label="Grading company" maxLength={50} placeholder="PSA" /></label><label>Grade<input name="grade" aria-label="Grade" maxLength={20} placeholder="9" /></label></>}
        </div></details>
        <button className="primary" type="submit">{pending ? "Searching auctions…" : "Search sales"}</button>
      </fieldset>
    </form>
    <p className="market-method">Completed auctions only · provided by <a href="https://cardsight.ai" target="_blank" rel="noreferrer">CardSight AI ↗</a>. Buy It Now asking prices are excluded.</p>
    {pending && <p role="status">Finding completed auction sales…</p>}
    {error && <p role="alert" className="error">{error} Try your search again.</p>}
    {result && <section className="market-search-results" aria-labelledby="search-results">
      <h2 id="search-results" ref={heading} tabIndex={-1}>{result.returned_count} auction {result.returned_count === 1 ? "sale" : "sales"} found</h2>
      <p className="market-method">Results for “{result.query}”. {result.notice}</p>
      {result.truncated && <p className="market-method">The provider returned its search limit. Narrow your query or time range to explore more relevant sales.</p>}
      {result.discarded_count > 0 && <p className="market-method">{result.discarded_count} {result.discarded_count === 1 ? "record was" : "records were"} omitted by filters or validation.</p>}
      {!result.items.length ? <p>No completed auctions matched these filters. Try another card description or a wider period.</p> : <AuctionSales key={result.fetched_at} items={result.items} />}
    </section>}
  </>;
}
