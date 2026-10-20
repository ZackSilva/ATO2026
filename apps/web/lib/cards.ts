export type CardInput = {
  subject: string; year: number | null; sport: string; manufacturer: string;
  set_name: string; card_number: string; parallel: string; autograph: boolean;
  memorabilia: boolean; print_run: number | null; condition: "raw" | "graded";
  grader: string; grade: string; certification: string; centering: string | null;
  corners: string | null; edges: string | null; surface: string | null;
  serial_number: number | null; purchase_price: string | null; shipping: string | null;
  tax: string | null; other_cost: string | null; currency: string;
  acquired_on: string | null; seller: string; notes: string; archived: boolean;
};

export type PhotoSide = "front" | "back";

export type Card = CardInput & {
  id: string; definition_id: string; revision: number; created_at: string; updated_at: string;
  recorded_cost: string | null; total_cost: string | null;
  photo_url: string | null; photo_kind: "upload" | "reference"; photo_source: string;
  back_photo_url: string | null; back_photo_kind: "upload" | "reference"; back_photo_source: string;
};

export type Inventory = {
  items: Card[]; total: number;
  summary: { active: number; raw: number; graded: number; archived: number; missing_price: number };
};

export function money(value: string, currency: string): string {
  // Formatting only; all stored cost arithmetic happens with server-side decimals.
  return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
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
  return {
    subject: text("subject"), year: number("year"), sport: text("sport"),
    manufacturer: text("manufacturer"), set_name: text("set_name"),
    card_number: text("card_number"), parallel: text("parallel"),
    autograph: data.has("autograph"), memorabilia: data.has("memorabilia"),
    print_run: number("print_run"), serial_number: number("serial_number"),
    condition: graded ? "graded" : "raw", grader: graded ? text("grader") : "",
    grade: graded ? text("grade") : "", certification: graded ? text("certification") : "",
    centering: bgs ? decimal("centering") : null, corners: bgs ? decimal("corners") : null,
    edges: bgs ? decimal("edges") : null, surface: bgs ? decimal("surface") : null,
    purchase_price: decimal("purchase_price"), shipping: decimal("shipping"),
    tax: decimal("tax"), other_cost: decimal("other_cost"), currency: text("currency").toUpperCase(),
    acquired_on: text("acquired_on") || null, seller: text("seller"), notes: text("notes"), archived,
  };
}
