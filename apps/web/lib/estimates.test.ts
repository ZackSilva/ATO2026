import { expect, test } from "vitest";
import { estimateSubtotal, type MarketEstimate } from "./estimates";

test("known market subtotal preserves large exact cents and does not turn missing evidence into zero", () => {
  const item = (amount: string | null) => ({ amount }) as MarketEstimate;
  expect(estimateSubtotal([item("100000000000000.01"), item("0.09"), item(null)])).toBe("100000000000000.10");
  expect(estimateSubtotal([item(null)])).toBeNull();
  expect(estimateSubtotal([])).toBeNull();
});
