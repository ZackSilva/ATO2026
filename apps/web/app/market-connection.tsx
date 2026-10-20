"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { MarketStatus } from "../lib/market-search";
import { useWorkspace } from "./workspace-shell";

export default function MarketConnection() {
  const { onExpired } = useWorkspace();
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try { setStatus(await api<MarketStatus>("/market/status", { signal: controller.signal })); }
      catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError(true);
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [onExpired]);
  return <div className="settings-row"><dt><span className="settings-label">Automatic auction search</span><span className="settings-hint">CardSight · raw and graded cards.</span></dt><dd><span className="settings-state">{error ? "Status unavailable" : !status ? "Checking…" : status.configured ? "Key configured" : "Setup needed"}</span><Link className="settings-action" href="/discover">Search sales <span aria-hidden="true">→</span></Link></dd></div>;
}
