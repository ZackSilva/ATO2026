"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Session } from "../lib/api";
import { cardSubtitle, type Card, type CardInput, type Inventory, type PhotoSide } from "../lib/cards";
import CardEditor from "./card-editor";
import CardDetail from "./card-detail";
import CardPreview, { Photo } from "./card-preview";
import CollectionValueChart from "./value-chart";
import CardValues from "./card-values";
import { useCompactLayout } from "../lib/use-compact-layout";
import { VALUE_RANGES, type ValueRange } from "../lib/demo-values";

type Props = { session: Session; onExpired: () => void };
const PAGE_SIZE = 24;

export default function Collection({ session, onExpired }: Props) {
  const compact = useCompactLayout();
  const [range, setRange] = useState<ValueRange>("1m");
  const [overviewVersion, setOverviewVersion] = useState(0);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [search, setSearch] = useState("");
  const [condition, setCondition] = useState("all");
  const [status, setStatus] = useState("active");
  const [sort, setSort] = useState("newest");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Card | null | undefined>(undefined);
  const [editorVersion, setEditorVersion] = useState(0);
  const [preview, setPreview] = useState<{ card: Card; side: PhotoSide } | null>(null);
  const [viewing, setViewing] = useState<Card | null>(null);
  const viewOpener = useRef<HTMLElement | null>(null);
  const requestId = useRef(0);
  const invalidateRequests = useCallback(() => { requestId.current += 1; }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ q: search, condition, status, sort, offset: String(offset), limit: String(PAGE_SIZE) });
      const result = await api<Inventory>(`/cards?${query}`);
      if (id === requestId.current) {
        setInventory(result); setError("");
        if (offset > 0 && offset >= result.total) setOffset(Math.max(0, Math.floor((result.total - 1) / PAGE_SIZE) * PAGE_SIZE));
      }
    } catch (failure) {
      if (id !== requestId.current) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setError((failure as Error).message);
    } finally { if (id === requestId.current) setLoading(false); }
  }, [search, condition, status, sort, offset, onExpired]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { window.clearTimeout(timer); invalidateRequests(); window.removeEventListener("focus", focus); };
  }, [load, invalidateRequests]);

  function closeEditor() {
    setEditing(undefined);
    // Native dialogs restore their opener; retain a target if a row was removed.
    window.setTimeout(() => { if (document.activeElement === document.body) heading.current?.focus(); }, 0);
  }

  function openView(card: Card, opener: HTMLElement) {
    if (loading) return;
    opener.focus();
    viewOpener.current = opener;
    setViewing(card);
    setNotice("");
  }

  function closeView() {
    setViewing(null);
    // The original row remains the return target after preview/edit transitions.
    window.setTimeout(() => {
      if (viewOpener.current?.isConnected) viewOpener.current.focus();
      else heading.current?.focus();
    }, 0);
  }

  async function save(values: CardInput) {
    const saved = await api<Card>(editing ? `/cards/${editing.id}` : "/cards", {
      method: editing ? "PUT" : "POST",
      headers: { "X-CSRF-Token": session.csrf_token },
      body: JSON.stringify(editing ? { ...values, revision: editing.revision } : values),
    });
    if (viewing?.id === saved.id) setViewing(saved);
    setOverviewVersion(version => version + 1);
    closeEditor(); setNotice(values.archived ? "Card saved in your archive." : "Card saved to your collection.");
    await load();
  }

  async function remove() {
    if (!editing) return;
    await api<void>(`/cards/${editing.id}?revision=${editing.revision}`, { method: "DELETE", headers: { "X-CSRF-Token": session.csrf_token } });
    setViewing(null);
    setOverviewVersion(version => version + 1);
    closeEditor(); setNotice("Card permanently deleted.");
    if (inventory?.items.length === 1 && offset > 0) setOffset(Math.max(0, offset - PAGE_SIZE));
    else await load();
  }

  async function reloadCard() {
    if (!editing) return;
    const latest = await api<Card>(`/cards/${editing.id}`);
    if (viewing?.id === latest.id) setViewing(latest);
    await load();
    setEditing(latest); setEditorVersion(version => version + 1);
  }

  async function changePhoto(file: File | null, side: PhotoSide) {
    if (!editing) return;
    if (file && file.size > 4 * 1024 * 1024) throw new Error("Choose an image smaller than 4 MB.");
    const latest = await api<Card>(`/cards/${editing.id}/photo?side=${side}&revision=${editing.revision}`, {
      method: file ? "PUT" : "DELETE",
      headers: { "X-CSRF-Token": session.csrf_token, "Content-Type": "application/octet-stream" },
      ...(file ? { body: file } : {}),
    });
    setEditing(latest);
    if (viewing?.id === latest.id) setViewing(latest);
    await load();
  }

  const summary = inventory?.summary;
  return <main className="collection-workspace" id="main">
    <div className="workspace-heading"><div><h1>Welcome, {session.username}.</h1><p>Your collection, one card at a time.</p></div><button className="primary" onClick={() => { setEditing(null); setNotice(""); }}>+ Add card</button></div>
    <CollectionValueChart range={range} onRangeChange={setRange} refreshKey={overviewVersion} onExpired={onExpired} />
    <div className="stats-grid" aria-label="Collection summary">
      {[["Cards in collection", summary?.active], ["Graded cards", summary?.graded], ["Raw cards", summary?.raw]].map(([label, value]) => <div className="stat" key={label}><span>{label}</span><strong>{value ?? "—"}</strong></div>)}
    </div>
    <section className="inventory-section" aria-labelledby="collection-title">
      <div className="inventory-heading"><div><h2 id="collection-title" ref={heading} tabIndex={-1}>Your collection</h2><p>{summary ? `${summary.active} active · ${summary.archived} archived` : "Loading your records…"}</p></div><label className="row-period-picker">Card trend period<select aria-label="Card trend period" value={range} onChange={event => setRange(event.target.value as ValueRange)}>{VALUE_RANGES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
      <div className="collection-tools">
        <label className="search-label">Search collection<input type="search" value={search} placeholder="Player, set, card number, notes…" onChange={event => { setLoading(true); setSearch(event.target.value); setOffset(0); }} maxLength={200} /></label>
        <label>Condition<select value={condition} onChange={event => { setLoading(true); setCondition(event.target.value); setOffset(0); }}><option value="all">All conditions</option><option value="raw">Raw</option><option value="graded">Graded</option></select></label>
        <label>Show<select value={status} onChange={event => { setLoading(true); setStatus(event.target.value); setOffset(0); }}><option value="active">Active collection</option><option value="archived">Archive</option><option value="all">All cards</option></select></label>
        <label>Sort<select value={sort} onChange={event => { setLoading(true); setSort(event.target.value); setOffset(0); }}><option value="newest">Recently added</option><option value="subject">Player / subject A–Z</option><option value="year">Newest card year</option></select></label>
      </div>
      {notice && <p className="success" role="status">{notice}</p>}
      {error && <div className="error" role="alert"><p>{error} {inventory ? "Showing the last loaded records." : "Your records could not be loaded."}</p><button className="secondary" onClick={() => void load()}>Retry loading cards</button></div>}
      <div className="results-meta" role="status">{loading ? "Loading cards…" : inventory ? `${inventory.total} ${inventory.total === 1 ? "card" : "cards"} found` : "Collection unavailable"}</div>
      <p className="row-demo-note">Values and trends are fictional USD examples. Your recorded costs stay separate.</p>
      <div aria-busy={loading}>
        {inventory && inventory.items.length === 0 ? <div className="empty-collection"><div className="empty-card" aria-hidden="true">＋</div><h3>{search || condition !== "all" || status !== "active" ? "No matching cards." : "Your collection starts here."}</h3><p>{search || condition !== "all" || status !== "active" ? "Try a different search or change the filters above." : "Add your first card to keep its details, grading, and costs together."}</p>{!search && condition === "all" && status === "active" && <button className="primary" onClick={() => setEditing(null)}>Add your first card</button>}</div>
          : <div className="inventory-list">
            {!!inventory?.items.length && <div className="inventory-list-heading" aria-hidden="true"><span>Card / condition</span><span>Trend · {VALUE_RANGES.find(item => item.value === range)!.shortLabel}</span><span>Current value · demo</span><span>Purchase price · demo</span><span /></div>}
            <ul>{inventory?.items.map(card => <li key={card.id}><article className={`inventory-row${loading ? " row-loading" : ""}`} onClick={event => {
              // Preserve independent controls while making the rest of the row open details.
              if ((event.target as Element).closest("button, a, input, select, textarea, summary")) return;
              const opener = event.currentTarget.querySelector<HTMLButtonElement>(".row-view");
              if (opener) openView(card, opener);
            }}>
              <button className="card-thumbnail" disabled={loading} aria-label={`View details for ${card.subject}`} onClick={event => openView(card, event.currentTarget)}><Photo card={card} side={card.photo_url || !card.back_photo_url ? "front" : "back"} />{(card.photo_url ? card.photo_kind === "reference" : card.back_photo_url && card.back_photo_kind === "reference") && <span className="reference-label">REFERENCE</span>}</button>
              <div className="row-identity"><h3 aria-label={card.subject}><button className="row-view" disabled={loading} aria-label={`View card for ${card.subject}`} onClick={event => openView(card, event.currentTarget)}>{card.subject}</button></h3>{(card.photo_url ? card.photo_kind === "reference" : card.back_photo_url && card.back_photo_kind === "reference") && <span className="reference-context">Reference photo · condition not verified</span>}<p className="card-subtitle">{cardSubtitle(card)}</p><div className="card-tags"><span className={`condition-badge ${card.condition}`}>{card.condition === "graded" ? `${card.grader} ${card.grade}`.trim() : "RAW"}</span>{card.sport && <span>{card.sport}</span>}{card.parallel && <span>{card.parallel}</span>}{card.autograph && <span>Auto</span>}{card.memorabilia && <span>Relic</span>}{card.serial_number !== null && <span>#{card.serial_number}{card.print_run !== null ? ` / ${card.print_run}` : ""}</span>}{card.archived && <span className="archive-badge">ARCHIVED</span>}</div></div>
              <CardValues card={card} range={range} compact={compact} />
              <button className="row-edit" disabled={loading} aria-label={`Edit card for ${card.subject}`} onClick={() => { setViewing(null); setEditing(card); setNotice(""); }}>Edit</button>
            </article></li>)}</ul>
          </div>}
      </div>
      {inventory && inventory.total > PAGE_SIZE && <nav className="pagination" aria-label="Collection pages"><button className="secondary" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button><span>{offset + 1}–{Math.min(offset + PAGE_SIZE, inventory.total)} of {inventory.total}</span><button className="secondary" disabled={offset + PAGE_SIZE >= inventory.total || loading} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button></nav>}
      <p className="collection-footnote">Demo values and trends are fictional, not market estimates. Recorded acquisition costs remain in your card editor. Reference images show the card issue; upload your own photo to show your copy.</p>
    </section>
    {viewing && <CardDetail card={viewing} active={editing === undefined && !preview} onClose={closeView} onEdit={() => setEditing(viewing)} onPreview={side => setPreview({ card: viewing, side })} />}
    {editing !== undefined && <CardEditor key={`${editing?.id ?? "new"}-${editorVersion}`} card={editing} onClose={closeEditor} onSave={save} onDelete={remove} onReload={reloadCard} onPhotoChange={changePhoto} />}
    {preview && <CardPreview card={preview.card} initialSide={preview.side} onClose={() => setPreview(null)} />}
  </main>;
}
