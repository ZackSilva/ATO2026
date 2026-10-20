"use client";

import { useId, useRef, useState } from "react";
import "./collection-search.css";

type Props = {
  search: string; condition: string; status: string; sort: string;
  onSearch: (value: string) => void;
  onCondition: (value: string) => void;
  onStatus: (value: string) => void;
  onSort: (value: string) => void;
};

export default function CollectionSearch({ search, condition, status, sort, onSearch, onCondition, onStatus, onSort }: Props) {
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const filters = [
    ...(condition !== "all" ? [{ label: condition === "graded" ? "Graded" : "Raw", reset: () => onCondition("all") }] : []),
    ...(status !== "active" ? [{ label: status === "archived" ? "Archive" : status === "sold" ? "Sold" : "All cards", reset: () => onStatus("active") }] : []),
    ...(sort !== "newest" ? [{ label: sort === "subject" ? "Player A–Z" : "Newest year", reset: () => onSort("newest") }] : []),
  ];
  return <div className="collection-search-tools">
    <div className="collection-search-bar">
      <div className="collection-search-input">
        <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <label className="sr-only" htmlFor={`${panelId}-search`}>Search collection</label>
        <input ref={input} id={`${panelId}-search`} type="search" value={search} placeholder="Search player, set, card number…" onChange={event => onSearch(event.target.value)} maxLength={200} />
        {!!search && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { onSearch(""); input.current?.focus(); }}>×</button>}
      </div>
      <button ref={toggle} type="button" className="filter-toggle" aria-label="Filters" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="var(--bg)" /><circle cx="15" cy="17" r="3" fill="var(--bg)" /></svg>
        Filters {!!filters.length && <span className="filter-count" aria-label={`${filters.length} active filters`}>{filters.length}</span>}
      </button>
    </div>
    <div className="collection-filter-panel" id={panelId} hidden={!expanded} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); setExpanded(false); toggle.current?.focus(); } }}>
      <label>Condition<select value={condition} onChange={event => onCondition(event.target.value)}><option value="all">All conditions</option><option value="raw">Raw</option><option value="graded">Graded</option></select></label>
      <label>Show<select value={status} onChange={event => onStatus(event.target.value)}><option value="active">Active collection</option><option value="archived">Archive</option><option value="sold">Sold</option><option value="all">All cards</option></select></label>
      <label>Sort<select value={sort} onChange={event => onSort(event.target.value)}><option value="newest">Recently added</option><option value="subject">Player / subject A–Z</option><option value="year">Newest card year</option></select></label>
    </div>
    {!!filters.length && <div className="collection-filter-tags" aria-label="Active collection filters">
      {filters.map(filter => <button type="button" key={filter.label} onClick={() => { filter.reset(); toggle.current?.focus(); }} aria-label={`Remove ${filter.label} filter`}>{filter.label}<span aria-hidden="true">×</span></button>)}
      <button type="button" className="filter-reset" onClick={() => { onCondition("all"); onStatus("active"); onSort("newest"); toggle.current?.focus(); }}>Reset filters</button>
    </div>}
  </div>;
}
