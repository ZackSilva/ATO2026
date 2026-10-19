"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../lib/api";
import { formCard, type Card, type CardInput } from "../lib/cards";
import { Photo } from "./card-preview";

type Props = {
  card: Card | null;
  onClose: () => void;
  onSave: (values: CardInput) => Promise<void>;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
  onPhotoChange: (file: File | null) => Promise<void>;
};

export default function CardEditor({ card, onClose, onSave, onDelete, onReload, onPhotoChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const subject = useRef<HTMLInputElement>(null);
  const [condition, setCondition] = useState(card?.condition ?? "raw");
  const [grader, setGrader] = useState(card?.grader ?? "PSA");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    subject.current?.focus();
    return () => {
      element.close();
      // React removes the dialog before cleanup, so restore its opener explicitly.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  async function perform(action: () => Promise<void>) {
    setBusy(true); setError(""); setConflict(false);
    try { await action(); }
    catch (failure) {
      setError((failure as Error).message);
      setConflict(failure instanceof ApiError && failure.status === 409);
    } finally { setBusy(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const archived = submitter?.value === "archive" ? !card?.archived : card?.archived ?? false;
    const values = formCard(form, archived);
    if (values.serial_number !== null && values.print_run !== null && values.serial_number > values.print_run) {
      setError("Serial number must not exceed the print run."); return;
    }
    void perform(() => onSave(values));
  }

  return <dialog className="card-dialog" ref={dialog} aria-labelledby="editor-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="editor-heading"><div><span className="eyebrow">{card ? "YOUR CARD RECORD" : "GROW YOUR COLLECTION"}</span><h2 id="editor-title">{card ? "Edit card" : "Add a card"}</h2></div><button className="icon-button" aria-label="Close card editor" disabled={busy} onClick={onClose}>✕</button></div>
    <p>Each entry is one physical card. Add another entry for another copy.</p>
    <section className="editor-photo-section" aria-label="Card preview photo">
      {card ? <><div className="editor-photo"><Photo card={card} /></div><div className="editor-photo-controls"><strong>{card.photo_url ? card.photo_kind === "reference" ? "Reference image" : "Your card photo" : "Add a card photo"}</strong><p>JPEG, PNG, or WebP · up to 4 MB and 16 megapixels. Photos are private to your account.</p><label className="upload-label">{card.photo_url ? "Replace photo" : "Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void perform(() => onPhotoChange(file)); }} /></label>{card.photo_url && <button className="text-button danger-text" disabled={busy} onClick={() => void perform(() => onPhotoChange(null))}>Remove photo</button>}{busy && <span role="status">Saving changes…</span>}</div></> : <p>Save this card first, then open it to add a preview photo.</p>}
    </section>
    <form onSubmit={save}>
      <fieldset disabled={busy}>
        <legend>Card identity</legend>
        <div className="form-grid">
          <label className="wide">Player(s) or subject (required)<input ref={subject} name="subject" required maxLength={200} defaultValue={card?.subject} /></label>
          <label>Year<input name="year" type="number" min={1800} max={2200} step={1} defaultValue={card?.year ?? ""} /></label>
          <label>Sport / category<input name="sport" maxLength={100} defaultValue={card?.sport} placeholder="e.g. Basketball, Pokémon" /></label>
          <label>Manufacturer<input name="manufacturer" maxLength={100} defaultValue={card?.manufacturer} /></label>
          <label>Set<input name="set_name" maxLength={150} defaultValue={card?.set_name} /></label>
          <label>Card number<input name="card_number" maxLength={50} defaultValue={card?.card_number} /></label>
          <label>Parallel / variation<input name="parallel" maxLength={150} defaultValue={card?.parallel} /></label>
          <label>Serial number<input name="serial_number" type="number" min={1} max={2147483647} step={1} defaultValue={card?.serial_number ?? ""} /></label>
          <label>Print run (out of)<input name="print_run" type="number" min={1} max={2147483647} step={1} defaultValue={card?.print_run ?? ""} /></label>
          <div className="checkboxes wide"><label><input type="checkbox" name="autograph" defaultChecked={card?.autograph} /> Autograph</label><label><input type="checkbox" name="memorabilia" defaultChecked={card?.memorabilia} /> Memorabilia / relic</label></div>
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Condition & grading</legend>
        <div className="form-grid">
          <label>Condition<select name="condition" value={condition} onChange={event => setCondition(event.target.value as "raw" | "graded")}><option value="raw">Raw (ungraded)</option><option value="graded">Graded</option></select></label>
          {condition === "graded" && <>
            <label>Grading company<input name="grader" list="graders" value={grader} required maxLength={50} onChange={event => setGrader(event.target.value)} /><datalist id="graders"><option value="PSA" /><option value="BGS" /><option value="SGC" /><option value="CGC" /></datalist></label>
            <label>Grade<input name="grade" maxLength={20} defaultValue={card?.grade} placeholder="e.g. 9.5 or Authentic" /></label>
            <label>Certification number<input name="certification" maxLength={100} defaultValue={card?.certification} /></label>
            {grader.toUpperCase() === "BGS" && (["centering", "corners", "edges", "surface"] as const).map(name => <label key={name}>{name[0].toUpperCase() + name.slice(1)}<input name={name} type="number" min={0} max={10} step="0.1" defaultValue={card?.[name] ?? ""} /></label>)}
            <p className="field-help wide">Grading details are your records; certification is not verified with a grading company.</p>
          </>}
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Acquisition</legend>
        <p className="field-help">Leave unknown costs blank. Enter 0 when you know a cost was zero. These are your costs, not market values.</p>
        <div className="form-grid">
          <label>Purchase price<input name="purchase_price" type="number" min={0} max="9999999999.99" step="0.01" defaultValue={card?.purchase_price ?? ""} /></label>
          <label>Currency<input name="currency" required pattern="[A-Za-z]{3}" maxLength={3} defaultValue={card?.currency ?? "USD"} list="currencies" /><datalist id="currencies"><option value="USD" /><option value="CAD" /><option value="EUR" /><option value="GBP" /><option value="JPY" /><option value="AUD" /></datalist></label>
          <label>Shipping<input name="shipping" type="number" min={0} max="9999999999.99" step="0.01" defaultValue={card?.shipping ?? ""} /></label>
          <label>Tax<input name="tax" type="number" min={0} max="9999999999.99" step="0.01" defaultValue={card?.tax ?? ""} /></label>
          <label>Other costs<input name="other_cost" type="number" min={0} max="9999999999.99" step="0.01" defaultValue={card?.other_cost ?? ""} /></label>
          <label>Acquired on<input name="acquired_on" type="date" defaultValue={card?.acquired_on ?? ""} /></label>
          <label className="wide">Seller / source<input name="seller" maxLength={200} defaultValue={card?.seller} /></label>
          <label className="wide">Notes<textarea name="notes" maxLength={2000} rows={3} defaultValue={card?.notes} /></label>
        </div>
      </fieldset>
      {error && <div role="alert" className="error"><p>{error}</p>{conflict && <button type="button" className="secondary" disabled={busy} onClick={() => void perform(onReload)}>Reload latest card (discard these edits)</button>}</div>}
      <div className="editor-actions"><button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : card ? "Save changes" : "Save card"}</button><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button>{card && <button type="submit" name="action" value="archive" className="secondary" disabled={busy}>{card.archived ? "Restore to collection" : "Archive card"}</button>}</div>
    </form>
    {card && <div className="delete-area">{deleting ? <><p>Permanently delete this physical card and its acquisition record? This cannot be undone. Archiving keeps the record.</p><div className="delete-actions"><button className="danger" disabled={busy} onClick={() => void perform(onDelete)}>Confirm permanent deletion</button><button className="secondary" disabled={busy} onClick={() => setDeleting(false)}>Keep card</button></div></> : <button className="text-button danger-text" disabled={busy} onClick={() => setDeleting(true)}>Delete card…</button>}</div>}
  </dialog>;
}
