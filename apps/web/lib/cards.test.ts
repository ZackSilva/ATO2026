import { expect, test } from "vitest";
import { calculateSale } from "./cards";

const sale = {
  sold: true, sale_price: "150.00", sale_fees: "15.00", purchase_price: "100.00",
  shipping: "5.00", tax: "0", other_cost: "0",
};

test("sale proceeds distinguish purchase-price profit from all acquisition costs", () => {
  expect(calculateSale(sale)).toEqual({ sale_net: "135.00", net_profit: "35.00", profit_after_costs: "30.00" });
});

test("cent calculations avoid floating-point drift", () => {
  expect(calculateSale({ ...sale, sale_price: "0.30", sale_fees: "0.10", purchase_price: "0.20", shipping: "0" }))
    .toEqual({ sale_net: "0.20", net_profit: "0.00", profit_after_costs: "0.00" });
});

test("unknown purchase price does not become zero", () => {
  expect(calculateSale({ ...sale, purchase_price: null })).toEqual({ sale_net: "135.00", net_profit: null, profit_after_costs: null });
  expect(calculateSale({ ...sale, purchase_price: "0" }).net_profit).toBe("135.00");
});

test("incomplete acquisition costs still allow comparison with a known purchase price", () => {
  expect(calculateSale({ ...sale, shipping: null })).toEqual({ sale_net: "135.00", net_profit: "35.00", profit_after_costs: null });
});

test("explicit zero prices and fees remain known", () => {
  expect(calculateSale({ ...sale, sale_price: "0", sale_fees: "0", purchase_price: "0", shipping: "0" }))
    .toEqual({ sale_net: "0.00", net_profit: "0.00", profit_after_costs: "0.00" });
});

test("fees can exceed the sale price and show a loss", () => {
  expect(calculateSale({ ...sale, sale_price: "10", sale_fees: "20" }))
    .toEqual({ sale_net: "-10.00", net_profit: "-110.00", profit_after_costs: "-115.00" });
});

test.each([null, "", "-1", "1.001", "Infinity", "10000000000.00"])("incomplete or invalid fees (%s) do not display a misleading result", sale_fees => {
  expect(calculateSale({ ...sale, sale_fees })).toEqual({ sale_net: null, net_profit: null, profit_after_costs: null });
});

test("unsold cards do not report realized proceeds", () => {
  expect(calculateSale({ ...sale, sold: false })).toEqual({ sale_net: null, net_profit: null, profit_after_costs: null });
});

test("maximum supported costs retain cent precision in larger computed losses", () => {
  const maximum = "9999999999.99";
  expect(calculateSale({ sold: true, sale_price: maximum, sale_fees: maximum, purchase_price: maximum, shipping: maximum, tax: maximum, other_cost: maximum }))
    .toEqual({ sale_net: "0.00", net_profit: "-9999999999.99", profit_after_costs: "-39999999999.96" });
});
