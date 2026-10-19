import type { Card } from "./cards";

export type ValueRange = "all" | "1y" | "6m" | "3m" | "1m" | "1w";
export type ValueMetric = "value" | "gain" | "purchase";
export type ValuePoint = { date: string; value: number };
export type DemoCard = { purchase: number; current: number };
type DemoInput = Pick<Card, "id" | "subject">;

export const VALUE_RANGES: { value: ValueRange; label: string; shortLabel: string }[] = [
  { value: "all", label: "All time", shortLabel: "All" },
  { value: "1y", label: "Last year", shortLabel: "1Y" },
  { value: "6m", label: "Last six months", shortLabel: "6M" },
  { value: "3m", label: "Last three months", shortLabel: "3M" },
  { value: "1m", label: "Last month", shortLabel: "1M" },
  { value: "1w", label: "Last week", shortLabel: "1W" },
];

export const VALUE_METRICS: { value: ValueMetric; label: string }[] = [
  { value: "value", label: "Collection value" },
  { value: "gain", label: "Unrealized gain / loss" },
  { value: "purchase", label: "Purchase total" },
];

// Illustrative USD cents only. These are invented display examples, never market
// estimates, recorded costs, acquisition dates, or historical portfolio holdings.
const profiles = [
  { subject: "jordan", purchase: 125000, current: 180000, startOffset: -0.36 },
  { subject: "barkley", purchase: 11000, current: 8500, startOffset: 0.32 },
  { subject: "brady", purchase: 32000, current: 38500, startOffset: -0.23 },
  { subject: "sanders", purchase: 14500, current: 12000, startOffset: 0.24 },
];

function seed(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function profile(card: DemoInput) {
  return profiles.find((item) => card.subject.toLowerCase().includes(item.subject)) ?? {
    purchase: 10000 + Math.round(seed(card.id) * 35000),
    current: 12000 + Math.round(seed(card.id) * 43000),
    startOffset: -0.2,
  };
}

export function demoCard(card: DemoInput): DemoCard {
  const example = profile(card);
  const variation = 0.92 + seed(card.id) * 0.16;
  return {
    purchase: Math.round(example.purchase * variation),
    current: Math.round(example.current * variation),
  };
}

const DAY = 86400000;

function calendarMonthsBefore(date: Date, months: number): Date {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return first;
}

export function valueSeries(cards: readonly DemoInput[], range: ValueRange, metric: ValueMetric, now = new Date()): ValuePoint[] {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const historyStart = calendarMonthsBefore(end, 24);
  const start = range === "1w" ? new Date(end.getTime() - 7 * DAY)
    : calendarMonthsBefore(end, { all: 24, "1y": 12, "6m": 6, "3m": 3, "1m": 1 }[range]);
  const examples = cards.map((card) => ({ ...demoCard(card), startOffset: profile(card).startOffset, seed: seed(card.id) }));
  const points: ValuePoint[] = [];
  for (let day = start.getTime(); day <= end.getTime(); day += DAY) {
    const progress = (day - historyStart.getTime()) / (end.getTime() - historyStart.getTime());
    let value = 0;
    for (const example of examples) {
      // A fixed purchase baseline and a synthetic curve for the same card set.
      // Envelope reaches zero at both ends, so the latest point matches rows.
      const wave = Math.sin(Math.PI * progress) * (
        Math.sin(progress * 4 * Math.PI + example.seed * Math.PI) * 0.025
        + Math.sin(progress * 11 * Math.PI + example.seed) * 0.008
      );
      const dayIndex = (day - historyStart.getTime()) / DAY;
      const daysRemaining = (end.getTime() - day) / DAY;
      // Small daily movement uses the full-history day index, so selecting a
      // different range never changes a date's value. Ease into today's total.
      const dailyMovement = (
        Math.sin(dayIndex * 1.13 + example.seed * 2 * Math.PI) * 0.0045
        + Math.sin(dayIndex * 2.21 + example.seed * Math.PI) * 0.0018
      ) * Math.min(1, daysRemaining / 2);
      const current = day === end.getTime() ? example.current
        : Math.max(0, Math.round(example.current * (1 + example.startOffset * (1 - progress) + wave + dailyMovement)));
      value += metric === "purchase" ? example.purchase : metric === "gain" ? current - example.purchase : current;
    }
    points.push({ date: new Date(day).toISOString().slice(0, 10), value });
  }
  return points;
}

export function periodChange(points: readonly ValuePoint[]): { amount: number; percent: number | null } {
  if (!points.length) return { amount: 0, percent: null };
  const start = points[0].value;
  const amount = points[points.length - 1].value - start;
  return { amount, percent: start === 0 ? null : amount / Math.abs(start) * 100 };
}

/** SVG polyline coordinates. Flat histories sit in the vertical center. */
export function pointsPath(points: readonly ValuePoint[], width: number, height: number, padding = 0): string {
  if (!points.length) return "";
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(0, height - padding * 2);
  return points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : padding + index / (points.length - 1) * innerWidth;
    const y = max === min ? height / 2 : padding + (max - point.value) / (max - min) * innerHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function demoMoney(cents: number, compact = false): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", notation: compact ? "compact" : "standard",
    minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: compact ? 1 : 2,
  }).format(cents / 100);
}
