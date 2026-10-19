"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Brand, { SlabMark, Wordmark } from "../../components/brand";
import "./design.css";

const colors = [
  ["Canvas", "--bg", "#000000"], ["Surface", "--panel", "#0a0a0a"],
  ["Primary text", "--ink", "#f5f5f3"], ["Secondary text", "--muted", "#a3a3a0"],
  ["Separator", "--line", "#262626"], ["Control border", "--control-border", "#616161"],
  ["Action", "--accent", "#c6e5b1"], ["Keyboard focus", "--focus", "#e5c17a"],
] as const;

export default function DesignSystem() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  function previewSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    timer.current = window.setTimeout(() => {
      setSaving(false); setMessage("Preview saved. Your actual collection is unchanged.");
    }, 650);
  }

  return <div className="app-shell design-shell">
    <header className="site-header"><Brand /><a className="ds-back" href="/">Open your collection <span aria-hidden="true">↗</span></a></header>
    <main className="design-guide" id="main">
      <div className="ds-intro"><p className="ds-kicker">SlabTrak / Design system v1</p><h1>Made for<br /><span>what you collect.</span></h1><p>Pitch black. Clear typography. A familiar card silhouette.<br />A common language for every part of SlabTrak.</p></div>
      <nav className="ds-nav" aria-label="Design system sections"><a href="#identity">Identity</a><a href="#color">Color</a><a href="#type">Typography</a><a href="#layout">Layout</a><a href="#components">Components</a></nav>

      <section className="ds-section" id="identity" aria-labelledby="identity-title"><div className="ds-section-heading"><span className="ds-number">01</span><div><h2 id="identity-title">Rooted in the hobby.</h2><p>The wordmark keeps its original lettering. The mark is a single graded slab: a clean holder, a small label, and an inset card.</p></div></div>
        <div className="ds-brand-stage"><div className="brand ds-lockup"><SlabMark size={64} /><Wordmark /></div><span className="ds-stage-note">One color. No initials, barcodes, or sports-specific symbols.</span></div>
        <div className="ds-brand-details"><div><h3>A mark that scales.</h3><div className="ds-mark-sizes">{[24, 32, 40, 56].map(size => <div key={size}><SlabMark size={size} /><span>{size}px</span></div>)}</div></div><div><h3>Keep it recognizable.</h3><p>Maintain the tall slab proportions and space around the mark. Use it in white on black; the wordmark’s mint period carries the accent. The silhouette works across basketball, football, and other trading cards.</p></div></div>
      </section>

      <section className="ds-section" id="color" aria-labelledby="color-title"><div className="ds-section-heading"><span className="ds-number">02</span><div><h2 id="color-title">Black is the foundation.</h2><p>Most of the interface is black, white, and quiet gray. Mint identifies the primary action. Color for warnings and errors carries a specific meaning.</p></div></div>
        <div className="ds-palette">{colors.map(([name, token, value]) => <div className="ds-swatch" key={token}><div className="ds-swatch-color" style={{ background: `var(${token})` }} /><strong>{name}</strong><code>{value}</code><span>{token}</span></div>)}</div>
        <p className="ds-note">Subtle separators group content. Stronger borders identify inputs and controls. Text and keyboard focus must remain easy to distinguish on black.</p>
      </section>

      <section className="ds-section" id="type" aria-labelledby="type-title"><div className="ds-section-heading"><span className="ds-number">03</span><div><h2 id="type-title">Type creates the hierarchy.</h2><p>Geist provides a clean, modern reading rhythm. The original Arial wordmark stays intact. Fonts are served by the app.</p></div></div>
        <div className="ds-type-sample"><span>Page heading · 32 / 26px</span><div className="ds-page-type">Your collection.</div></div>
        <div className="ds-type-sample"><span>Section heading · 24px</span><div className="ds-section-type">The details of every card.</div></div>
        <div className="ds-type-sample"><span>Body · 14–16px</span><p>A place for the cards you own, the records you keep, and the collection you’re building.</p></div>
        <div className="ds-type-sample"><span>Numbers · tabular spacing</span><div className="ds-numerals">0123456789 <span>USD 0.00</span></div></div>
        <p className="ds-note">Use regular and medium weights. Prefer sentence case and short labels. Keep secondary details readable; reserve the smallest labels for supporting metadata.</p>
      </section>

      <section className="ds-section" id="layout" aria-labelledby="layout-title"><div className="ds-section-heading"><span className="ds-number">04</span><div><h2 id="layout-title">Give the information room.</h2><p>Use space, alignment, and typography to organize the screen. Metrics sit directly on the canvas. Card records stay in rows with the image beside their details.</p></div></div>
        <div className="ds-layout-example"><span className="ds-example-label">Metric treatment · example labels</span><div className="stats-grid"><div className="stat"><span>Cards in collection</span><strong>—</strong></div><div className="stat"><span>Graded cards</span><strong>—</strong></div><div className="stat"><span>Raw cards</span><strong>—</strong></div></div></div>
        <div className="ds-spacing"><h3>A simple spacing rhythm.</h3><div>{[4, 8, 12, 16, 24, 32, 48, 64].map(space => <div className="ds-space" key={space}><span style={{ width: space }} /><code>{space}</code></div>)}</div></div>
        <p className="ds-note">Use borders for inputs, dialogs, and meaningful group boundaries. Rounded corners are modest: 4px for small elements, 8px for controls, 12px for dialogs. No enclosing tiles around the welcome metrics.</p>
      </section>

      <section className="ds-section" id="components" aria-labelledby="components-title"><div className="ds-section-heading"><span className="ds-number">05</span><div><h2 id="components-title">Consistent in every state.</h2><p>Buttons, fields, labels, and messages use the same shared values. This playground only demonstrates their appearance and interaction.</p></div></div>
        <div className="ds-components"><form className="ds-playground" onSubmit={previewSave} aria-busy={saving}><h3>Controls</h3><label htmlFor="example-collection">Collection name</label><input id="example-collection" name="example-collection" placeholder="My collection" maxLength={100} disabled={saving} /><div className="ds-button-examples"><button className="primary" disabled={saving} type="submit">{saving ? "Saving preview…" : "Save preview"}</button><button className="secondary" type="reset" disabled={saving} onClick={() => setMessage("")}>Reset</button><button className="secondary" type="button" disabled>Disabled</button></div>{message && <p className="success" role="status">{message}</p>}<p className="ds-note">Tab through the controls to see the visible focus ring. Touch targets are at least 44px where practical.</p></form>
          <div className="ds-states"><h3>Labels & messages</h3><div className="ds-badges"><span className="condition-badge">RAW</span><span className="condition-badge graded">GRADED</span><span className="ds-reference-badge">REFERENCE IMAGE</span></div><div className="ds-state-line ds-saved"><span aria-hidden="true">✓</span><div><strong>Saved</strong><p>Confirm a successful change.</p></div></div><div className="ds-state-line ds-warning"><span aria-hidden="true">!</span><div><strong>Review required</strong><p>Explain what needs attention and what to do next.</p></div></div><div className="ds-state-line ds-failure"><span aria-hidden="true">!</span><div><strong>Couldn’t save</strong><p>Keep the entered information and offer a retry.</p></div></div></div>
        </div>
      </section>
      <div className="ds-principle"><SlabMark size={32} /><p>The card is the object.<br /><span>The interface gives it space.</span></p></div>
    </main>
    <footer><span>SlabTrak · Design system v1</span><a href="/">Back to the collection ↗</a></footer>
  </div>;
}
