export type FinanceRange = "all" | "1y" | "6m" | "3m" | "1m" | "1w";
export type FinanceMetric = "acquisition_spending" | "gross_sales" | "sale_fees" | "net_sales" | "profit_vs_purchase" | "realized_profit";
export type FinanceMetricKey = FinanceMetric | "owned_cost";
export type RecordedAmount = { amount: string | null; known_count: number; complete_count: number; total_count: number };
export type FinancePoint = { date: string; metrics: Record<FinanceMetric, RecordedAmount> };
export type CurrencyFinances = {
  currency: string;
  metrics: Record<FinanceMetricKey, RecordedAmount>;
  undated_acquisitions: number; undated_sales: number;
  future_acquisitions: number; future_sales: number;
  series: FinancePoint[];
};
export type Finances = {
  range: FinanceRange; as_of: string; start_date: string | null; end_date: string;
  currencies: CurrencyFinances[];
};

export const FINANCE_RANGES: { value: FinanceRange; label: string }[] = [
  { value: "all", label: "All time" }, { value: "1y", label: "Last year" },
  { value: "6m", label: "Last six months" }, { value: "3m", label: "Last three months" },
  { value: "1m", label: "Last month" }, { value: "1w", label: "Last week" },
];
export const FINANCE_METRICS: { value: FinanceMetric; label: string }[] = [
  { value: "acquisition_spending", label: "Acquisition spending" },
  { value: "gross_sales", label: "Gross sales" },
  { value: "sale_fees", label: "Selling fees" },
  { value: "net_sales", label: "Net sale proceeds" },
  { value: "realized_profit", label: "Realized profit" },
  { value: "profit_vs_purchase", label: "Profit vs. purchase price" },
];

export function financeMoney(amount: string, currency: string): string {
  // Aggregate totals may exceed Number's exact range. Keep whole dollars as BigInt
  // and insert the two recorded cents into Intl's localized currency pattern.
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return "Unknown";
  const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(BigInt(match[2]));
  const fraction = new Intl.NumberFormat(undefined, { useGrouping: false, minimumIntegerDigits: 2, maximumFractionDigits: 0 }).format(Number((match[3] ?? "").padEnd(2, "0")));
  const format = new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return format.formatToParts(match[1] ? -1n : 1n).map(part => part.type === "integer" ? whole : part.type === "fraction" ? fraction : part.value).join("");
}

export function financeDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function coverage(metric: FinanceMetricKey, value: RecordedAmount): string {
  const { total_count: total, known_count: known, complete_count: complete } = value;
  if (metric === "acquisition_spending" || metric === "owned_cost") {
    if (total === 0) return "No eligible cards";
    return `${known} of ${total} cards have known costs · ${complete} fully recorded`;
  }
  if (total === 0) return "No sales in this period";
  const requirement: Record<FinanceMetric, string> = {
    acquisition_spending: "known costs", gross_sales: "a sale price", sale_fees: "recorded fees",
    net_sales: "a sale price and fees", profit_vs_purchase: "sale details and a purchase price",
    realized_profit: "sale details and all acquisition costs",
  };
  return `${known} of ${total} sales have ${requirement[metric]}`;
}

// Position event days in real calendar time; visual scaling never calculates financial totals.
export function eventPosition(date: string, start: string, end: string): number {
  const stamp = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const duration = stamp(end) - stamp(start);
  return duration === 0 ? .5 : Math.max(0, Math.min(1, (stamp(date) - stamp(start)) / duration));
}
