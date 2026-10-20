"use client";

import { useEffect, useRef, useState } from "react";
import { cardSubtitle, type Card, type PhotoSide } from "../lib/cards";
import "./card-photos.css";

export function PhotoSides({ side, onChange, disabled = false }: { side: PhotoSide; onChange: (side: PhotoSide) => void; disabled?: boolean }) {
  return <div className="photo-side-switch" role="group" aria-label="Photo side">
    {(["front", "back"] as const).map(value => <button key={value} type="button" aria-pressed={side === value} disabled={disabled} onClick={() => onChange(value)}>{value === "front" ? "Front" : "Back"}</button>)}
  </div>;
}

export function Photo({ card, large = false, side = "front" }: { card: Card; large?: boolean; side?: PhotoSide }) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = side === "back" ? card.back_photo_url : card.photo_url;
  const kind = side === "back" ? card.back_photo_kind : card.photo_kind;
  if (url && failed !== url) {
    // A normal img sends the session cookie; a public image optimizer would not.
    return <img src={url} alt={`${card.subject} card ${side === "back" ? "back " : ""}${kind === "reference" ? "reference image" : "photo"}`} width={large ? 600 : 72} height={large ? 840 : 100} loading={large ? "eager" : "lazy"} onError={() => setFailed(url)} />;
  }
  return <span className="photo-placeholder"><svg viewBox="0 0 28 34" fill="none" aria-hidden="true"><rect x="2" y="2" width="24" height="30" rx="3" stroke="currentColor" strokeWidth="1.5" /><path d="M6 25l6-8 4 5 3-4 4 7M9 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4" stroke="currentColor" strokeWidth="1.5" /></svg><span>{url && failed === url ? "Image unavailable" : side === "back" ? "No back photo" : "No front photo"}</span></span>;
}

export default function CardPreview({ card, onClose, initialSide }: { card: Card; onClose: () => void; initialSide?: PhotoSide }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [side, setSide] = useState<PhotoSide>(initialSide ?? (card.photo_url ? "front" : card.back_photo_url ? "back" : "front"));
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  const url = side === "back" ? card.back_photo_url : card.photo_url;
  const reference = (side === "back" ? card.back_photo_kind : card.photo_kind) === "reference";
  const photoSource = side === "back" ? card.back_photo_source : card.photo_source;
  const source = photoSource?.startsWith("https://") ? photoSource : "";
  return <dialog ref={dialog} className="photo-dialog" aria-labelledby="preview-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="editor-heading"><div><span className="eyebrow">{!url ? "CARD PHOTOS" : reference ? "REFERENCE IMAGE" : "YOUR CARD PHOTO"}</span><h2 id="preview-title">{card.subject}</h2><p>{cardSubtitle(card)}</p></div><button className="icon-button" aria-label="Close image preview" onClick={onClose}>✕</button></div>
    <PhotoSides side={side} onChange={setSide} />
    <div className="large-card-photo" aria-label={`${side === "front" ? "Front" : "Back"} photo`}><Photo card={card} side={side} large /></div>
    {!url && <p className="photo-caption">No {side} photo yet. Open Edit card to add one.</p>}
    {url && reference && <p className="photo-caption">Reference image of this card issue; the pictured copy’s grade, certification, and ownership are not assigned to your record. {source && <a href={source} target="_blank" rel="noreferrer">Image source ↗</a>}</p>}
  </dialog>;
}
