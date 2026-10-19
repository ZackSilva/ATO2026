"use client";

import { useEffect, useRef, useState } from "react";
import { cardSubtitle, type Card } from "../lib/cards";

export function Photo({ card, large = false }: { card: Card; large?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (card.photo_url && failed !== card.photo_url) {
    // A normal img sends the session cookie; a public image optimizer would not.
    return <img src={card.photo_url} alt={`${card.subject} card ${card.photo_kind === "reference" ? "reference image" : "photo"}`} width={large ? 600 : 72} height={large ? 840 : 100} loading={large ? "eager" : "lazy"} onError={() => setFailed(card.photo_url)} />;
  }
  return <span className="photo-placeholder"><svg viewBox="0 0 28 34" fill="none" aria-hidden="true"><rect x="2" y="2" width="24" height="30" rx="3" stroke="currentColor" strokeWidth="1.5" /><path d="M6 25l6-8 4 5 3-4 4 7M9 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4" stroke="currentColor" strokeWidth="1.5" /></svg><span>{failed ? "Image unavailable" : "Add photo"}</span></span>;
}

export default function CardPreview({ card, onClose }: { card: Card; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  const reference = card.photo_kind === "reference";
  const source = card.photo_source.startsWith("https://") ? card.photo_source : "";
  return <dialog ref={dialog} className="photo-dialog" aria-labelledby="preview-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="editor-heading"><div><span className="eyebrow">{reference ? "REFERENCE IMAGE" : "YOUR CARD PHOTO"}</span><h2 id="preview-title">{card.subject}</h2><p>{cardSubtitle(card)}</p></div><button className="icon-button" aria-label="Close image preview" onClick={onClose}>✕</button></div>
    <div className="large-card-photo"><Photo card={card} large /></div>
    {reference && <p className="photo-caption">Reference image of this card issue; the pictured copy’s grade, certification, and ownership are not assigned to your record. {source && <a href={source} target="_blank" rel="noreferrer">Image source ↗</a>}</p>}
  </dialog>;
}
