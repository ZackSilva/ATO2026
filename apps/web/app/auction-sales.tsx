"use client";

import { useState } from "react";
import type { AuctionSale } from "../lib/market-search";
import { financeDate, financeMoney } from "../lib/finances";
import { saleHistoryWindow } from "../lib/sale-history";
import { SalesHistoryChart } from "./card-sales-history";
import ListingImage from "./listing-image";

const sourceName = (sale: AuctionSale) => sale.source.toLowerCase() === "ebay" ? "eBay" : sale.source;
const condition = (sale: AuctionSale) => sale.condition === "graded" ? `${sale.grader} ${sale.grade}` : sale.condition === "raw" ? "Raw · condition not assessed" : "Grading not identified";

export default function AuctionSales({ items }: { items: AuctionSale[] }) {
  const chronological = saleHistoryWindow(items, "all", new Date().toISOString().slice(0, 10)).sales;
  const [selectedId, setSelectedId] = useState<string | null>(() => chronological.at(-1)?.id ?? null);
  return <>
    <SalesHistoryChart history={items} currency="USD" headingLevel={3} searchResults onInspect={sale => setSelectedId(sale?.id ?? null)} renderSale={sale => <div className="selected-auction-sale" role="region" aria-label="Selected auction sale">
      <ListingImage sale={sale} />
      <div><span className="eyebrow">SELECTED SALE</span><h4>{sale.title}</h4><p>{condition(sale)}{sale.parallel ? ` · ${sale.parallel}` : ""}</p><p>{financeDate(sale.sold_on)} · {sourceName(sale)}</p><strong>{financeMoney(sale.price, sale.currency)}</strong>{sale.source_url ? <a className="workspace-text-link" href={sale.source_url} target="_blank" rel="noreferrer">View selected auction source ↗</a> : <p>Source link unavailable</p>}</div>
    </div>} />
    <details className="sales-dropdown"><summary>Sales · {chronological.length}</summary>
    <ul className="auction-sales" aria-label="Auction sales">{[...chronological].reverse().map(sale => <li key={sale.id} data-sale-id={sale.id} data-selected={sale.id === selectedId}>
      <ListingImage sale={sale} />
      <div className="auction-sale-identity"><h3>{sale.title}</h3><p>{condition(sale)}{sale.parallel ? ` · ${sale.parallel}` : ""}</p><p>{financeDate(sale.sold_on)} · {sourceName(sale)} · Reported by CardSight</p>{sale.source_url ? <a className="workspace-text-link" href={sale.source_url} target="_blank" rel="noreferrer">View auction source ↗</a> : <p>Source link unavailable</p>}</div><strong className="auction-sale-price">{financeMoney(sale.price, sale.currency)}</strong>
    </li>)}</ul></details>
  </>;
}
