"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { Inventory } from "../../lib/cards";
import type { ValueRange } from "../../lib/collection-values";
import CollectionValueChart from "../value-chart";
import { useWorkspace } from "../workspace-shell";
import MarketOverview from "../market-overview";

export default function HomePage() {
  const { session, onExpired } = useWorkspace();
  const [summary, setSummary] = useState<Inventory["summary"] | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [range, setRange] = useState<ValueRange>("1m");

  useEffect(() => {
    let request: AbortController;
    async function load() {
      request?.abort();
      const controller = new AbortController(); request = controller;
      setPending(true);
      try {
        const inventory = await api<Inventory>("/cards?limit=1", { signal: controller.signal });
        if (!controller.signal.aborted) { setSummary(inventory.summary); setError(false); }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError(true);
      } finally { if (!controller.signal.aborted) setPending(false); }
    }
    const timer = window.setTimeout(() => void load(), 0);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { window.clearTimeout(timer); request?.abort(); window.removeEventListener("focus", focus); };
  }, [onExpired, retry]);

  return <main className="workspace-page home-page" id="main">
    <div className="workspace-heading"><div><h1>Home</h1><p>Welcome, {session.username}. Here’s your collection at a glance.</p></div><Link className="primary workspace-link-button" href="/collection">Manage collection <span aria-hidden="true">↗</span></Link></div>
    <CollectionValueChart range={range} onRangeChange={setRange} refreshKey={0} onExpired={onExpired} />
    <section className="home-summary" aria-label="Collection summary" aria-busy={pending}>
      <div className="stats-grid">
        {[["Cards in collection", summary?.active], ["Graded cards", summary?.graded], ["Raw cards", summary?.raw], ["Cards sold", summary?.sold]].map(([label, value]) => <div className="stat" key={label}><span>{label}</span><strong>{pending || error ? "—" : value ?? "—"}</strong></div>)}
      </div>
      {error && <p className="error" role="alert">Couldn’t load your collection summary. <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry collection summary</button></p>}
      <p className="home-summary-note">Collection counts include active cards; sold cards are shown separately. <Link href="/reports">Open Reports for recorded spending and profit.</Link></p>
    </section>
    <MarketOverview onExpired={onExpired} />
  </main>;
}
