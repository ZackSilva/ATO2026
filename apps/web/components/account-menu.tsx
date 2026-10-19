"use client";

import { useEffect, useId, useRef, useState } from "react";
import "./account-menu.css";

type Props = { username: string; busy: boolean; onSignOut: () => void };

export default function AccountMenu({ username, busy, onSignOut }: Props) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const contentId = useId();

  useEffect(() => {
    const element = menu.current!;
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !element.contains(event.target)) element.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && element.open) {
        event.preventDefault(); element.open = false; trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  return <details className="account-menu" ref={menu} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary ref={trigger} className="account-trigger" role="button" aria-label="Account menu" aria-expanded={open} aria-controls={contentId} title={`Account menu for ${username}`}>
      <span className="account-avatar" aria-hidden="true">{username.slice(0, 1).toUpperCase()}</span>
      <span className="account-name" aria-hidden="true">{username}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.3" /></svg>
    </summary>
    <div className="account-dropdown" id={contentId} aria-busy={busy}>
      <p>Signed in as<strong>{username}</strong></p>
      <button type="button" className="account-sign-out" disabled={busy} onClick={onSignOut}><svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 3H4v14h4m4-11 4 4-4 4m-5-4h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>{busy ? "Signing out…" : "Sign out"}</button>
    </div>
  </details>;
}
