"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { Card } from "../lib/cards";
import type { MarketCandidates, MarketLinkStatus } from "../lib/market-link";
import { useWorkspace } from "./workspace-shell";

export default function MarketLink({ card, onChange }: { card: Card; onChange: () => void }) {
  const { session, onExpired } = useWorkspace();
  const [status, setStatus] = useState<MarketLinkStatus | null>(null);
  const [candidates, setCandidates] = useState<MarketCandidates | null>(null);
  const [grade, setGrade] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  const path = `/cards/${card.id}/market-link`;

  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(""); setCandidates(null);
      try {
        const result = await api<MarketLinkStatus>(path, { signal: controller.signal });
        if (!controller.signal.aborted) setStatus(result);
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError((failure as Error).message);
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 0);
    return () => { window.clearTimeout(timer); request.current?.abort(); };
  }, [path, card.revision, retry, onExpired]);

  async function act(action: "find" | "link" | "remove" | "refresh", candidateId?: string) {
    if (pending) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setPending(action); setError("");
    const headers = { "X-CSRF-Token": session.csrf_token };
    const expected = { expected_definition_id: card.definition_id, expected_card_id: status?.link?.card_id ?? null, expected_confirmed_at: status?.link?.confirmed_at ?? null };
    try {
      if (action === "find") {
        const result = await api<MarketCandidates>(`${path}/candidates`, {
          method: "POST", headers, signal: controller.signal,
          body: JSON.stringify({ expected_definition_id: card.definition_id }),
        });
        if (!controller.signal.aborted) {
          setCandidates(result); setGrade(result.grade_options.length === 1 ? result.grade_options[0].id : "");
        }
      } else {
        await api<unknown>(action === "refresh" ? `${path}/refresh` : path, {
          method: action === "remove" ? "DELETE" : "POST", headers, signal: controller.signal,
          body: JSON.stringify(action === "refresh" ? {} : action === "link" ? { ...expected, card_id: candidateId, grade_id: grade || null } : expected),
        });
        const result = await api<MarketLinkStatus>(path, { signal: controller.signal });
        if (!controller.signal.aborted) { setStatus(result); setCandidates(null); onChange(); }
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) onExpired();
      else setError((failure as Error).message);
    } finally { if (!controller.signal.aborted) setPending(""); }
  }

  return <section className="workspace-section market-link" aria-labelledby="market-link-title" aria-busy={loading || !!pending}>
    <h2 id="market-link-title">Automatic pricing</h2>
    {loading ? <p role="status">Checking card match…</p> : <>
      {error && <p className="error" role="alert">{error}</p>}
      {!status ? <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>Retry card match</button> : !status.configured ? <p>Automatic pricing is unavailable until a CardSight connection is configured.</p> : <>
        {status.link ? <>
          <p>{status.link.valid ? "Exact card matched. Completed sales for this card support automatic estimates." : "Card details have changed. Confirm a new match before automatic pricing can resume."}</p>
          <div className="market-link-actions">
            {status.link.valid && <button type="button" className="text-button" disabled={!!pending} onClick={() => void act("refresh")}>{pending === "refresh" ? "Refreshing estimate…" : "Refresh estimate"}</button>}
            <button type="button" className="text-button" disabled={!!pending} onClick={() => void act("find")}>{pending === "find" ? "Finding exact cards…" : "Change match"}</button>
            <button type="button" className="text-button" disabled={!!pending} onClick={() => void act("remove")}>{pending === "remove" ? "Removing match…" : "Remove match"}</button>
          </div>
        </> : <>
          <p>Confirm this card’s exact issue once to use matching auction sales for its estimate. Your purchase costs stay unchanged.</p>
          <button type="button" className="text-button" disabled={!!pending} onClick={() => void act("find")}>{pending === "find" ? "Finding exact cards…" : "Find exact card"}</button>
        </>}
        {candidates && <div className="market-link-candidates">
          {candidates.note && <p className="market-method">{candidates.note}</p>}
          {candidates.grade_options.length > 1 && <label className="market-grade-choice">Grading label<select value={grade} disabled={!!pending} onChange={event => setGrade(event.target.value)}><option value="">Choose matching grading label</option>{candidates.grade_options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
          {candidates.grade_options.length === 1 && <p className="market-method">Grading label: {candidates.grade_options[0].label}</p>}
          {card.condition === "graded" && candidates.grade_options.length === 0 && <p className="market-method">No matching grading label is available. This card cannot be linked until its grading details can be matched exactly.</p>}
          {!candidates.candidates.length ? <p>No exact candidates found. Review this card’s year, set, number and variant before trying again.</p> : <ul aria-label="Exact card candidates">{candidates.candidates.map(candidate => <li key={`${candidate.id}:${candidate.parallel_id ?? "base"}`}>
            <div><h3>{candidate.name}</h3><p>{[candidate.year, candidate.release_name, candidate.set_name, candidate.number ? `#${candidate.number}` : null].filter(Boolean).join(" · ")}</p><p>{candidate.parallel_name || "Base card"}</p>{candidate.reason && <p className="market-method">{candidate.reason}</p>}</div>
            <button type="button" className="text-button" disabled={!!pending || !candidate.eligible || (card.condition === "graded" && !grade)} onClick={() => void act("link", candidate.id)}>{pending === "link" ? "Saving match…" : "Use this match"}<span className="sr-only"> · {[candidate.year, candidate.release_name, candidate.name, candidate.number && `#${candidate.number}`, candidate.parallel_name].filter(Boolean).join(" · ")}</span></button>
          </li>)}</ul>}
        </div>}
      </>}
    </>}
  </section>;
}
