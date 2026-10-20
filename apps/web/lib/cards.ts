export const rawConditions = {
  unspecified: "Not assessed", near_mint: "Near mint", excellent: "Excellent",
  good: "Good", fair: "Fair", poor: "Poor",
} as const;
export type RawCondition = keyof typeof rawConditions;

export type CardInput = {
  subject: string; year: number | null; sport: string; manufacturer: string;
  set_name: string; card_number: string; parallel: string; autograph: boolean;
  memorabilia: boolean; print_run: number | null; condition: "raw" | "graded";
  raw_condition?: RawCondition;
  grader: string; grade: string; certification: string; centering: string | null;
  corners: string | null; edges: string | null; surface: string | null;
  serial_number: number | null; purchase_price: string | null; shipping: string | null;
  tax: string | null; other_cost: string | null; currency: string;
  acquired_on: string | null; seller: string; notes: string; archived: boolean;
  sold: boolean; sale_price: string | null; sale_fees: string | null; sold_on: string | null;
};

export type PhotoSide = "front" | "back";

export type Card = CardInput & {
  id: string; definition_id: string; revision: number; created_at: string; updated_at: string;
  recorded_cost: string | null; total_cost: string | null;
  sale_net: string | null; net_profit: string | null; profit_after_costs: string | null;
  photo_url: string | null; photo_kind: "upload" | "reference"; photo_source: string;
  back_photo_url: string | null; back_photo_kind: "upload" | "reference"; back_photo_source: string;
};

export type Inventory = {
  items: Card[]; total: number;
  summary: { active: number; raw: number; graded: number; archived: number; sold: number; missing_price: number };
};

export function money(value: string, currency: string): string {
  // Formatting only; persisted calculations use server-side decimals.
  return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
}

type SaleInputs = Pick<CardInput, "sold" | "sale_price" | "sale_fees" | "purchase_price" | "shipping" | "tax" | "other_cost">;

export function calculateSale(values: SaleInputs): Pick<Card, "sale_net" | "net_profit" | "profit_after_costs"> {
  // Integer cents keep the live preview exact, including losses and explicit zero costs.
  const cents = (value: string | null): number | null => {
    if (value === null || !/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
    const [whole, fraction = ""] = value.split(".");
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(amount) && amount <= 999999999999 ? amount : null;
  };
  const decimal = (value: number) => `${value < 0 ? "-" : ""}${Math.floor(Math.abs(value) / 100)}.${String(Math.abs(value) % 100).padStart(2, "0")}`;
  const price = cents(values.sale_price);
  const fees = cents(values.sale_fees);
  if (!values.sold || price === null || fees === null) return { sale_net: null, net_profit: null, profit_after_costs: null };
  const net = price - fees;
  const purchase = cents(values.purchase_price);
  const costs = [purchase, cents(values.shipping), cents(values.tax), cents(values.other_cost)];
  return {
    sale_net: decimal(net),
    net_profit: purchase === null ? null : decimal(net - purchase),
    profit_after_costs: costs.some(cost => cost === null) ? null : decimal(net - costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0)),
  };
}

export function cardSubtitle(card: Card): string {
  const set = card.set_name.toLowerCase() === card.manufacturer.toLowerCase() ? "" : card.set_name;
  return [card.year, card.manufacturer, set, card.card_number && `#${card.card_number}`].filter(Boolean).join(" · ") || "Card details not added";
}

export function formCard(form: HTMLFormElement, archived: boolean): CardInput {
  const data = new FormData(form);
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const number = (name: string) => text(name) === "" ? null : Number(text(name));
  const decimal = (name: string) => text(name) || null;
  const graded = text("condition") === "graded";
  const bgs = graded && text("grader").toUpperCase() === "BGS";
  const sold = text("ownership") === "sold";
  return {
    subject: text("subject"), year: number("year"), sport: text("sport"),
    manufacturer: text("manufacturer"), set_name: text("set_name"),
    card_number: text("card_number"), parallel: text("parallel"),
    autograph: data.has("autograph"), memorabilia: data.has("memorabilia"),
    print_run: number("print_run"), serial_number: number("serial_number"),
    condition: graded ? "graded" : "raw", grader: graded ? text("grader") : "",
    raw_condition: graded ? "unspecified" : (text("raw_condition") || "unspecified") as RawCondition,
    grade: graded ? text("grade") : "", certification: graded ? text("certification") : "",
    centering: bgs ? decimal("centering") : null, corners: bgs ? decimal("corners") : null,
    edges: bgs ? decimal("edges") : null, surface: bgs ? decimal("surface") : null,
    purchase_price: decimal("purchase_price"), shipping: decimal("shipping"),
    tax: decimal("tax"), other_cost: decimal("other_cost"), currency: text("currency").toUpperCase(),
    acquired_on: text("acquired_on") || null, seller: text("seller"), notes: text("notes"), archived: sold ? false : archived,
    sold, sale_price: sold ? decimal("sale_price") : null, sale_fees: sold ? decimal("sale_fees") : null, sold_on: sold ? text("sold_on") || null : null,
  };
}
