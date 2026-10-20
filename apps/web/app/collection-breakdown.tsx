"use client";

import { useState } from "react";
import { estimateSubtotal } from "../lib/estimates";
import { valueCents } from "../lib/collection-values";
import { financeMoney } from "../lib/finances";
import { useEstimates } from "../lib/use-estimates";

export default function CollectionBreakdown({ onExpired }: { onExpired: () => void }) {
  const { data, pending, error, retry } = useEstimates(0, onExpired);
  const [currency, setCurrency] = useState("USD");
  const currencies = [...new Set(data?.items.map(item => item.currency) ?? [])].sort();
  const selected = currencies.includes(currency) ? currency : currencies[0] ?? "USD";
  const items = data?.items.filter(item => item.currency === selected) ?? [];
  const total = estimateSubtotal(items);
  const totalCents = total === null ? 0n : valueCents(total);
  const groups = (["raw", "graded"] as const).map(condition => {
    const cards = items.filter(item => item.condition === condition);
    const amount = estimateSubtotal(cards);
    return { condition, label: condition === "raw" ? "Raw cards" : "Graded cards", count: cards.length,
      known: cards.filter(item => item.amount !== null).length, amount,
      width: amount === null || totalCents === 0n ? 0 : Number(valueCents(amount) * 10000n / totalCents) / 100 };
  });
  const describe = (group: typeof groups[number]) => !group.count ? "No cards" : group.amount === null ? "Unknown" : financeMoney(group.amount, selected);

  return <section className="collection-breakdown" aria-label="Collection breakdown" aria-busy={pending}>
    <div className="breakdown-heading"><h2>Value by condition</h2>{currencies.length > 1 && <label>Currency<select aria-label="Breakdown currency" value={selected} onChange={event => setCurrency(event.target.value)}>{currencies.map(code => <option key={code}>{code}</option>)}</select></label>}</div>
    <p className="breakdown-caption">Current estimates · {selected}</p>
    {pending ? <p role="status">Loading collection breakdown…</p> : error ? <p className="error" role="alert">Couldn’t load the collection breakdown. <button className="text-button" type="button" onClick={retry}>Retry collection breakdown</button></p> : !items.length ? <p>Add cards to see your collection breakdown.</p> : <>
      <figure role="img" aria-label={`Estimated value by condition. ${groups.map(group => `${group.label}: ${describe(group)}; ${group.known} of ${group.count} cards estimated`).join(". ")}`}>
        {groups.map(group => <div className="breakdown-group" data-condition={group.condition} key={group.condition}>
          <div className="breakdown-label"><span>{group.label}</span><strong>{describe(group)}</strong></div>
          <div className="report-bar-track">{group.amount !== null && <span className="report-value-bar" style={{ width: `${group.width}%` }} />}</div>
          <p>{group.known} of {group.count} cards estimated{group.known < group.count ? ` · ${group.count - group.known} unknown` : ""}</p>
        </div>)}
      </figure>
      <p className="breakdown-note">Known estimates only. Missing values stay unknown; archived cards are included.</p>
    </>}
  </section>;
}
