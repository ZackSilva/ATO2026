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
    let poll: number | undefined;
    async function load(round = 0) {
      window.clearTimeout(poll);
      request?.abort();
      const controller = new AbortController(); request = controller;
      if (round === 0) setPending(true);
      setError(false);
      try {
        const result = await api<Estimates>("/estimates", { signal: controller.signal });
        if (!controller.signal.aborted) {
          setData(result);
          if (round < 10 && result.items.some(item => item.pricing_status === "pending")) {
            poll = window.setTimeout(() => void load(round + 1), 2000);
          }
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) onExpired();
        else setError(true);
      } finally { if (!controller.signal.aborted) setPending(false); }
    }
    const timer = window.setTimeout(() => void load(), 0);
    const focus = () => void load();
    window.addEventListener("focus", focus);
    return () => { window.clearTimeout(timer); window.clearTimeout(poll); request?.abort(); window.removeEventListener("focus", focus); };
  }, [refreshKey, retry, onExpired]);
  return { data: pending || error ? null : data, pending, error, retry: () => setRetry(value => value + 1) };
}
