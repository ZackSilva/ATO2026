"use client";

import { useSyncExternalStore } from "react";

const query = "(max-width: 680px)";
function subscribe(notify: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}

/** Match the CSS breakpoint without reading browser state during server rendering. */
export function useCompactLayout() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
