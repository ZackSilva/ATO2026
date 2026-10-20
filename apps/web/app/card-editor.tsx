"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "../lib/api";
import { calculateSale, formCard, money, rawConditions, type Card, type CardInput, type PhotoSide } from "../lib/cards";
import { Photo, PhotoSides } from "./card-preview";
import "./card-detail.css";

type Props = {
  card: Card | null;
  onClose: () => void;
  onSave: (values: CardInput) => Promise<void>;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
  onPhotoChange: (file: File | null, side: PhotoSide) => Promise<void>;
};

export default function CardEditor({ card, onClose, onSave, onDelete, onReload, onPhotoChange }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const subject = useRef<HTMLInputElement>(null);
  const [condition, setCondition] = useState(card?.condition ?? "raw");
  const [grader, setGrader] = useState(card?.grader || "PSA");
  const [sold, setSold] = useState(card?.sold ?? false);
  const [salePrice, setSalePrice] = useState(card?.sale_price ?? "");
  const [saleFees, setSaleFees] = useState(card?.sale_fees ?? "");
  const [currency, setCurrency] = useState(card?.currency ?? "USD");
  const [costs, setCosts] = useState({ purchase_price: card?.purchase_price ?? null, shipping: card?.shipping ?? null, tax: card?.tax ?? null, other_cost: card?.other_cost ?? null });
  const sale = calculateSale({ ...costs, sold, sale_price: salePrice || null, sale_fees: saleFees || null });
  const saleMoney = (value: string | null) => value === null ? "Unknown" : /^[A-Za-z]{3}$/.test(currency) ? money(value, currency.toUpperCase()) : `${value} (choose a currency)`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photoSide, setPhotoSide] = useState<PhotoSide>("front");
  const photoUrl = photoSide === "back" ? card?.back_photo_url : card?.photo_url;
  const photoKind = photoSide === "back" ? card?.back_photo_kind : card?.photo_kind;
  const sideName = photoSide === "back" ? "Back" : "Front";
  const actionSide = photoSide === "back" ? " back" : "";

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
    {card && <PhotoSides side={photoSide} onChange={setPhotoSide} disabled={busy} />}
    <section className="editor-photo-section" aria-label="Card preview photo">
      {card ? <><div className="editor-photo"><Photo card={card} side={photoSide} /></div><div className="editor-photo-controls"><strong>{sideName} · {photoUrl ? photoKind === "reference" ? "Reference image" : "Your card photo" : "Add a photo"}</strong><p>JPEG, PNG, or WebP · up to 4 MB and 16 megapixels. Each side is saved separately and is private to your account.</p>{photoUrl && photoKind === "reference" && <p className="photo-reference-note">Reference only: this is not a verified photo of your copy. Uploading replaces this side’s reference image.</p>}<label className="upload-label">{photoUrl ? `Replace${actionSide} photo` : `Upload${actionSide} photo`}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void perform(() => onPhotoChange(file, photoSide)); }} /></label>{photoUrl && <button className="text-button danger-text" disabled={busy} onClick={() => void perform(() => onPhotoChange(null, photoSide))}>Remove{actionSide} photo</button>}{busy && <span role="status">Saving changes…</span>}</div></> : <p>Save this card first, then open it to add front and back photos.</p>}
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
          {condition === "raw" && <><label>Raw condition<select name="raw_condition" aria-label="Raw condition" defaultValue={card?.raw_condition ?? "unspecified"}>{Object.entries(rawConditions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><p className="field-help wide">Your assessment, not a professional grade. Estimates use sales with the same recorded condition; unassessed sales stay separate.</p></>}
          {condition === "graded" && <>
            <label>Grading company<input name="grader" list="graders" value={grader} required maxLength={50} onChange={event => setGrader(event.target.value)} /><datalist id="graders"><option value="PSA" /><option value="BGS" /><option value="SGC" /><option value="CGC" /></datalist></label>
            <label>Grade<input name="grade" maxLength={20} defaultValue={card?.grade} placeholder="e.g. 9 for PSA 9" /></label>
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
          <label>Purchase price<input name="purchase_price" type="number" min={0} max="9999999999.99" step="0.01" defaultValue={card?.purchase_price ?? ""} onChange={event => setCosts(value => ({ ...value, purchase_price: event.target.value || null }))} /></label>
          <label>Currency<input name="currency" required pattern="[A-Za-z]{3}" maxLength={3} value={currency} onChange={event => setCurrency(event.target.value)} list="currencies" /><datalist id="currencies"><option value="USD" /><option value="CAD" /><option value="EUR" /><option value="GBP" /><option value="JPY" /><option value="AUD" /></datalist></label>
          <label>Shipping<input name="shipping" type="number" min={0} max="9999999999.99" step="0.01" defaultValue={card?.shipping ?? ""} onChange={event => setCosts(value => ({ ...value, shipping: event.target.value || null }))} /></label>
          <label>Tax<input name="tax" type="number" min={0} max="9999999999.99" step="0.01" defaultValue={card?.tax ?? ""} onChange={event => setCosts(value => ({ ...value, tax: event.target.value || null }))} /></label>
          <label>Other costs<input name="other_cost" type="number" min={0} max="9999999999.99" step="0.01" defaultValue={card?.other_cost ?? ""} onChange={event => setCosts(value => ({ ...value, other_cost: event.target.value || null }))} /></label>
          <label>Acquired on<input name="acquired_on" type="date" defaultValue={card?.acquired_on ?? ""} /></label>
          <label className="wide">Seller / source<input name="seller" maxLength={200} defaultValue={card?.seller} /></label>
          <label className="wide">Notes<textarea name="notes" maxLength={2000} rows={3} defaultValue={card?.notes} /></label>
        </div>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>Sale</legend>
        <div className="form-grid">
          <label className="wide">Ownership status<select name="ownership" value={sold ? "sold" : "owned"} onChange={event => setSold(event.target.value === "sold")}><option value="owned">In collection</option><option value="sold">Sold</option></select></label>
          {sold && <>
            <p className="field-help wide">Enter the sale price before fees and the total fees deducted, in {currency.toUpperCase() || "the card’s currency"}. Enter 0 if no fees were charged.</p>
            <label>Sale price<input name="sale_price" type="number" required min={0} max="9999999999.99" step="0.01" value={salePrice} onChange={event => setSalePrice(event.target.value)} /></label>
            <label>Sale fees<input name="sale_fees" type="number" required min={0} max="9999999999.99" step="0.01" value={saleFees} onChange={event => setSaleFees(event.target.value)} /></label>
            <label>Sold on<input name="sold_on" type="date" defaultValue={card?.sold_on ?? ""} /></label>
            <dl className="card-detail-fields sale-preview wide" aria-label="Sale calculation preview" aria-live="polite">
              <div><dt>Net sale</dt><dd>{saleMoney(sale.sale_net)}</dd></div>
              <div><dt>Profit vs purchase price</dt><dd>{saleMoney(sale.net_profit)}</dd></div>
              <div><dt>Profit after all acquisition costs</dt><dd>{saleMoney(sale.profit_after_costs)}</dd></div>
            </dl>
            <p className="field-help wide">Net sale = sale price − fees. Profit vs purchase price subtracts only your purchase price. Profit after all acquisition costs also subtracts shipping, tax, and other costs; it stays unknown until every cost is recorded. Negative amounts are losses.</p>
          </>}
          {!sold && card?.sold && <p className="field-help wide">Saving as in collection clears this sale’s price, fees, and date. Cancel keeps the existing sale record.</p>}
          {!sold && card?.archived && <p className="field-help wide">This card remains archived until you restore it. Marking it sold removes its archived status.</p>}
        </div>
      </fieldset>
      {error && <div role="alert" className="error"><p>{error}</p>{conflict && <button type="button" className="secondary" disabled={busy} onClick={() => void perform(onReload)}>Reload latest card (discard these edits)</button>}</div>}
      <div className="editor-actions"><button type="submit" className="primary" disabled={busy}>{busy ? "Saving…" : card ? "Save changes" : "Save card"}</button><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button>{card && !sold && <button type="submit" name="action" value="archive" className="secondary" disabled={busy}>{card.archived ? "Restore to collection" : "Archive card"}</button>}</div>
    </form>
    {card && <div className="delete-area">{deleting ? <><p>Permanently delete this physical card and its acquisition record? This cannot be undone. Archiving keeps the record.</p><div className="delete-actions"><button className="danger" disabled={busy} onClick={() => void perform(onDelete)}>Confirm permanent deletion</button><button className="secondary" disabled={busy} onClick={() => setDeleting(false)}>Keep card</button></div></> : <button className="text-button danger-text" disabled={busy} onClick={() => setDeleting(true)}>Delete card…</button>}</div>}
  </dialog>;
}
