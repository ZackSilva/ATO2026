"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { cardSubtitle, money, rawConditions, type Card, type PhotoSide } from "../lib/cards";
import type { MarketEstimate } from "../lib/estimates";
import { financeMoney } from "../lib/finances";
import { Photo, PhotoSides } from "./card-preview";
import CardSalesHistory from "./card-sales-history";
import "./card-detail.css";

type Props = {
  card: Card;
  estimate?: MarketEstimate;
  estimatePending: boolean;
  estimateUnavailable: boolean;
  active: boolean;
  onClose: () => void;
  onEdit: () => void;
  onEstimate: () => void;
  onPreview: (side: PhotoSide) => void;
  onExpired: () => void;
};

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children === null || children === undefined || children === "" ? <span className="card-detail-unknown">Not recorded</span> : children}</dd></div>;
}

export default function CardDetail({ card, estimate, estimatePending, estimateUnavailable, active, onClose, onEdit, onEstimate, onPreview, onExpired }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [side, setSide] = useState<PhotoSide>(card.photo_url ? "front" : card.back_photo_url ? "back" : "front");
  const photoUrl = side === "back" ? card.back_photo_url : card.photo_url;
  const photoKind = side === "back" ? card.back_photo_kind : card.photo_kind;
  const photoSource = side === "back" ? card.back_photo_source : card.photo_source;
  const source = photoSource?.startsWith("https://") ? photoSource : "";
  const cost = (value: string | null) => value === null ? <span className="card-detail-unknown">Unknown</span> : money(value, card.currency);

  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    return () => {
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    const element = dialog.current!;
    if (active) {
      element.showModal();
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
      else closeButton.current?.focus();
    } else {
      // Keep the selected side and scroll position while another dialog is open.
      if (document.activeElement instanceof HTMLElement && element.contains(document.activeElement)) {
        returnFocus.current = document.activeElement;
      }
      element.close();
    }
  }, [active]);

  return <dialog ref={dialog} className="card-dialog card-detail-dialog" aria-labelledby="card-detail-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="editor-heading card-detail-heading">
      <div><span className="eyebrow">YOUR CARD RECORD</span><h2 id="card-detail-title">{card.subject}</h2><p>{cardSubtitle(card)}</p><span className={card.archived ? "archive-badge" : "condition-badge"}>{card.sold ? "Sold" : card.archived ? "Archived" : "In collection"}</span></div>
      <div className="card-detail-actions"><button type="button" className="primary" onClick={onEstimate}>Estimate Value</button><button type="button" className="secondary" onClick={onEdit}>Edit</button><button ref={closeButton} type="button" className="icon-button" aria-label="Close card details" onClick={onClose}>✕</button></div>
    </div>
    <div className="card-detail-layout">
      <section className="card-detail-photos" aria-labelledby="card-detail-photos-title">
        <h3 id="card-detail-photos-title">Photos</h3>
        <PhotoSides side={side} onChange={setSide} />
        <div className="card-detail-photo" aria-label={`${side === "front" ? "Front" : "Back"} photo`}>
          {photoUrl ? <Photo card={card} side={side} large /> : <p>No {side} photo yet.</p>}
        </div>
        {photoUrl && <button type="button" className="secondary card-detail-preview" onClick={() => onPreview(side)}>Enlarge photos</button>}
        {photoUrl && <p className="card-detail-caption">{photoKind === "reference" ? <>Reference image of this card issue. The pictured copy’s condition, grade, certification, and ownership are not verified for your card. {source && <a href={source} target="_blank" rel="noreferrer">Image source ↗</a>}</> : "Your private card photo."}</p>}
      </section>
      <div className="card-detail-record">
        <CardSalesHistory card={card} active={active} onExpired={onExpired} />
        <section aria-labelledby="card-detail-identity-title">
          <h3 id="card-detail-identity-title">Card identity</h3>
          <dl className="card-detail-fields">
            <Detail label="Year">{card.year}</Detail><Detail label="Sport / category">{card.sport}</Detail>
            <Detail label="Manufacturer">{card.manufacturer}</Detail><Detail label="Set">{card.set_name}</Detail>
            <Detail label="Card number">{card.card_number}</Detail><Detail label="Parallel / variation">{card.parallel}</Detail>
            <Detail label="Serial number">{card.serial_number}</Detail><Detail label="Print run">{card.print_run}</Detail>
            <Detail label="Autograph">{card.autograph ? "Yes" : "No"}</Detail><Detail label="Memorabilia / relic">{card.memorabilia ? "Yes" : "No"}</Detail>
          </dl>
        </section>
        <section aria-labelledby="card-detail-grading-title">
          <h3 id="card-detail-grading-title">Condition &amp; grading</h3>
          <dl className="card-detail-fields">
            <Detail label="Condition">{card.condition === "graded" ? "Graded" : "Raw (ungraded)"}</Detail>
            {card.condition === "raw" && <Detail label="Raw condition">{rawConditions[card.raw_condition ?? "unspecified"]}</Detail>}
            {card.condition === "graded" && <>
              <Detail label="Grading company">{card.grader}</Detail><Detail label="Grade">{card.grade}</Detail><Detail label="Certification number">{card.certification}</Detail>
              {card.grader.toUpperCase() === "BGS" && (["centering", "corners", "edges", "surface"] as const).map(name => <Detail key={name} label={name[0].toUpperCase() + name.slice(1)}>{card[name]}</Detail>)}
            </>}
          </dl>
          {card.condition === "graded" && <p className="card-detail-caption">Your recorded grading details; certification has not been verified with a grading company.</p>}
        </section>
        <section aria-labelledby="card-detail-market-title">
          <h3 id="card-detail-market-title">Market estimate</h3>
          <p className="market-detail-note">{card.sold ? "This card is sold. Review sold comparables for market context." : estimatePending ? "Loading estimate…" : estimateUnavailable ? "Estimate unavailable. Retry market estimates in your collection." : estimate?.amount ? `${financeMoney(estimate.amount, card.currency)} · ${estimate.confidence} confidence · ${estimate.sample_count} matching sales` : "Insufficient Market Data"}</p>
          {estimate?.amount && <p className="market-detail-note">Observed sale range: {financeMoney(estimate.low!, card.currency)} – {financeMoney(estimate.high!, card.currency)}. Latest sale: {estimate.latest_sale}.</p>}
          {estimate?.source === "cardsight" && <p className="market-detail-note">Automatic auction estimate{estimate.fetched_at ? ` · Refreshed ${new Date(estimate.fetched_at).toLocaleString()}` : ""}</p>}
          {estimate?.pricing_note && <p className="market-detail-note">{estimate.pricing_note}</p>}
          {estimate?.stale && <p className="market-detail-note">Evidence needs a refresh · {estimate.latest_matching_sale ? `Latest matching sale ${estimate.latest_matching_sale}.` : "No matching sales recorded."}</p>}
          <p className="card-detail-caption">{estimate?.reason ?? "At least three recent matching sold comparables are required. Raw cards use raw sales; other grades remain research context. Sources are not independently verified."}</p>
          <Link className="workspace-text-link" href={`/collection/${card.id}/market`}>View sold comparables ↗</Link>
        </section>
        <section aria-labelledby="card-detail-acquisition-title">
          <h3 id="card-detail-acquisition-title">Acquisition</h3>
          <p className="card-detail-caption">Recorded costs in {card.currency}, separate from market estimates. Unknown amounts are not zero.</p>
          <dl className="card-detail-fields">
            <Detail label="Purchase price">{cost(card.purchase_price)}</Detail><Detail label="Shipping">{cost(card.shipping)}</Detail>
            <Detail label="Tax">{cost(card.tax)}</Detail><Detail label="Other costs">{cost(card.other_cost)}</Detail>
            <Detail label="Known cost subtotal">{cost(card.recorded_cost)}</Detail><Detail label="Total acquisition cost">{cost(card.total_cost)}</Detail>
            <Detail label="Acquired on">{card.acquired_on}</Detail><Detail label="Seller / source">{card.seller}</Detail>
          </dl>
          {card.total_cost === null && <p className="card-detail-caption">Total acquisition cost is unknown until all four cost amounts are recorded.</p>}
        </section>
        {card.sold && <section aria-labelledby="card-detail-sale-title">
          <h3 id="card-detail-sale-title">Sale</h3>
          <p className="card-detail-caption">Your recorded sale in {card.currency}; separate from market estimates.</p>
          <dl className="card-detail-fields">
            <Detail label="Sale price">{cost(card.sale_price)}</Detail><Detail label="Sale fees">{cost(card.sale_fees)}</Detail>
            <Detail label="Net sale">{cost(card.sale_net)}</Detail><Detail label="Profit vs purchase price">{cost(card.net_profit)}</Detail>
            <Detail label="Profit after all acquisition costs">{cost(card.profit_after_costs)}</Detail><Detail label="Sold on">{card.sold_on}</Detail>
          </dl>
          <p className="card-detail-caption">Net sale = sale price − fees. Profit vs purchase price subtracts your purchase price. Profit after all acquisition costs also subtracts shipping, tax, and other costs. Unknown costs remain unknown; negative amounts are losses.</p>
        </section>}
        <section aria-labelledby="card-detail-notes-title"><h3 id="card-detail-notes-title">Notes</h3><p className="card-detail-notes">{card.notes || "No notes recorded."}</p></section>
      </div>
    </div>
  </dialog>;
}
