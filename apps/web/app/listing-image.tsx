"use client";

import { useState } from "react";
import "./listing-image.css";

export default function ListingImage({ sale }: { sale: { image_url?: string | null; title: string } }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <div className="listing-preview">{sale.image_url && failed !== sale.image_url ? <img src={sale.image_url} alt={`Listing preview for ${sale.title}`} width={72} height={100} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(sale.image_url ?? null)} /> : <span role="img" aria-label={`Listing image unavailable for ${sale.title}`}>No preview</span>}</div>;
}

