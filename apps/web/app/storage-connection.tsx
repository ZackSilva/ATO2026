"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useWorkspace } from "./workspace-shell";

type StorageStatus = { photos: "local" | "supabase" };

export default function StorageConnection() {
  const { onExpired } = useWorkspace();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try { setStatus(await api<StorageStatus>("/storage/status", { signal: controller.signal })); }
      catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError(true);
      }
    }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [onExpired]);
  return <div className="settings-row">
    <dt><span className="settings-label">Card photos</span><span className="settings-hint">Private access through your account.</span></dt>
    <dd><span className="settings-state">{error ? "Status unavailable" : !status ? "Checking…" : status.photos === "supabase" ? "Cloud storage configured" : "Local photo storage"}</span></dd>
  </div>;
}
