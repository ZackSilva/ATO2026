"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { Estimates } from "./estimates";

export function useEstimates(refreshKey: number, onExpired: () => void) {
  const [data, setData] = useState<Estimates | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let request: AbortController;
    async function load() {
      request?.abort();
      const controller = new AbortController(); request = controller;
      setPending(true); setError(false);
      try {
        const result = await api<Estimates>("/estimates", { signal: controller.signal });
        if (!controller.signal.aborted) setData(result);
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
  }, [refreshKey, retry, onExpired]);
  return { data: pending || error ? null : data, pending, error, retry: () => setRetry(value => value + 1) };
}
