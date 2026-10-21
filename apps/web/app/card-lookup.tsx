"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { useWorkspace } from "./workspace-shell";
import "./card-lookup.css";

export type CatalogDraft = {
  subject: string;
  year: number | null;
  sport: string;
  manufacturer: string;
  set_name: string;
  card_number: string;
  parallel: string;
};

type CatalogItem = CatalogDraft & { id: string };
type SearchResults = { items: CatalogItem[]; truncated: boolean; note?: string };

export default function CardLookup({ onSelect }: { onSelect: (draft: CatalogDraft) => void }) {
  const { session, onExpired } = useWorkspace();
  const id = useId();
  const pending = useRef<AbortController | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState<"search" | "select" | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(false);

  useEffect(() => () => { pending.current?.abort(); }, []);

  function beginRequest() {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setError("");
    setSelected(false);
    return controller;
  }

  function isCurrent(controller: AbortController) {
    return pending.current === controller && !controller.signal.aborted;
  }

  function reportFailure(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401) onExpired();
    else setError(`${failure instanceof Error ? failure.message : "Card lookup is unavailable."} You can enter the details below; your draft is unchanged.`);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    if (value.length < 4 || value.length > 200) {
      setError("Enter 4–200 characters, including a player, year, set, or card number.");
      return;
    }
    const controller = beginRequest();
    setResults(null);
    setBusy("search");
    try {
      const response = await api<SearchResults>("/market/catalog/search", {
        method: "POST",
        headers: { "X-CSRF-Token": session.csrf_token },
        body: JSON.stringify({ query: value }),
        signal: controller.signal,
      });
      if (isCurrent(controller)) setResults({ ...response, items: response.items.slice(0, 20), truncated: response.truncated || response.items.length > 20 });
    } catch (failure) {
      if (isCurrent(controller)) reportFailure(failure);
    } finally {
      if (isCurrent(controller)) { pending.current = null; setBusy(null); }
    }
  }

  async function select(item: CatalogItem) {
    const controller = beginRequest();
    setBusy("select");
    try {
      const response = await api<{ item: CatalogDraft; note?: string }>("/market/catalog/card", {
        method: "POST",
        headers: { "X-CSRF-Token": session.csrf_token },
        body: JSON.stringify({ card_id: item.id }),
        signal: controller.signal,
      });
      if (isCurrent(controller)) {
        const detail = response.item;
        // Search-only labels remain suggestions for the user to review in the draft.
        onSelect({
          subject: detail.subject || item.subject,
          year: detail.year ?? item.year,
          sport: detail.sport || item.sport,
          manufacturer: detail.manufacturer || item.manufacturer,
          set_name: item.set_name || detail.set_name,
          card_number: detail.card_number || item.card_number,
          parallel: detail.parallel || item.parallel,
        });
        if (response.note) setResults(current => current ? { ...current, note: response.note } : current);
        setSelected(true);
      }
    } catch (failure) {
      if (isCurrent(controller)) reportFailure(failure);
    } finally {
      if (isCurrent(controller)) { pending.current = null; setBusy(null); }
    }
  }

  return <section className="card-lookup" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Find your card</h3>
    <p className="card-lookup-help" id={`${id}-help`}>Search first, or enter the details below.</p>
    <form onSubmit={search} className="card-lookup-form" aria-label="Find your card">
      <label htmlFor={`${id}-query`}>Player, year, set, or card number</label>
      <div className="card-lookup-controls">
        <input id={`${id}-query`} value={query} minLength={4} maxLength={200} required aria-describedby={`${id}-help`} placeholder="e.g. 1989 Upper Deck Ken Griffey Jr. 1" onChange={event => {
          pending.current?.abort();
          pending.current = null;
          setQuery(event.target.value);
          setBusy(null);
          setResults(null);
          setError("");
          setSelected(false);
        }} />
        <button type="submit" className="primary" disabled={busy !== null}>{busy === "search" ? "Searching…" : "Search cards"}</button>
      </div>
    </form>
    <div role="status" className="card-lookup-status">
      {busy === "search" ? "Searching the card catalog…" : busy === "select" ? "Loading card details…" : selected ? "Card details filled in below. Review them before saving." : results ? results.items.length ? `${results.items.length} ${results.items.length === 1 ? "card" : "cards"} found. Choose the matching card.` : "No matching cards found. Try a different search or enter the details below." : ""}
    </div>
    {error && <p className="error card-lookup-error" role="alert">{error}</p>}
    {results?.note && <p className="card-lookup-note">{results.note}</p>}
    {results && results.items.length > 0 && <ul className="card-lookup-results" aria-label="Card search results" aria-busy={busy === "select"}>
      {results.items.map(item => <li key={item.id}>
        <div><strong>{item.subject}</strong><p>{[item.year, item.manufacturer, item.set_name, item.card_number ? `#${item.card_number}` : ""].filter(value => value !== null && value !== "").join(" · ")}</p>{item.parallel && <span className="card-lookup-parallel">{item.parallel}</span>}</div>
        <button type="button" className="secondary" disabled={busy !== null} onClick={() => void select(item)}>Use card details<span className="sr-only"> for {item.subject}{item.year ? `, ${item.year}` : ""}, {item.set_name}{item.card_number ? `, #${item.card_number}` : ""}{item.parallel ? `, ${item.parallel}` : ""}</span></button>
      </li>)}
    </ul>}
    {results?.truncated && <p className="card-lookup-note">More cards match. Add a year, set, or card number to narrow your search.</p>}
  </section>;
}
