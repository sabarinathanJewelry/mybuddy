import { describe, it, expect } from "vitest";
import { calcItemIncentive, MASTER_RATES, PRODUCT_MAPPER } from "@/modules/kpi/incentive-master";

describe("MASTER_RATES", () => {
  it("has entries for key product categories", () => {
    const codes = MASTER_RATES.map(m => m.code);
    expect(codes).toContain("FANCY BANGLES");
    expect(codes).toContain("MACHINE CHAIN");
    expect(codes).toContain("CASTING RING");
    expect(codes).toContain("S");           // silver
    expect(codes).toContain("DIAMOND RING");
    expect(codes).toContain("COINS");
  });

  it("coins have zero rate", () => {
    const coins = MASTER_RATES.find(m => m.code === "COINS");
    expect(coins?.rate).toBe(0);
  });

  it("diamond items have high rates", () => {
    const diamond = MASTER_RATES.find(m => m.code === "DIAMOND RING");
    expect(diamond?.rate).toBeGreaterThanOrEqual(100);
  });
});

describe("PRODUCT_MAPPER", () => {
  it("maps ERP names to incentive codes", () => {
    const entry = PRODUCT_MAPPER.find(m => m.erpName === "VALAIYAM");
    expect(entry?.incentiveCode).toBe("FANCY BANGLES");
  });

  it("maps typo variants to correct code", () => {
    const entry = PRODUCT_MAPPER.find(m => m.erpName === "SUNDRI CHAIN");
    expect(entry?.incentiveCode).toBe("K SUNDARI CHAIN");
  });

  it("maps silver products to S code", () => {
    const chainEntry = PRODUCT_MAPPER.find(m => m.erpName === "SILVER CHAIN");
    expect(chainEntry?.incentiveCode).toBe("S");
  });
});

describe("calcItemIncentive()", () => {
  // FANCY BANGLES: rate=4, minWastage=7
  it("returns incentive when VA% meets minimum", () => {
    const result = calcItemIncentive("FANCY BANGLES", 8, 10, 1.0);
    expect(result).toBeCloseTo(40, 2); // 4 × 10 × 1.0
  });

  it("returns 0 when VA% is below minimum", () => {
    const result = calcItemIncentive("FANCY BANGLES", 6, 10, 1.0);
    expect(result).toBe(0); // 6 < minWastage 7
  });

  it("returns incentive at exact minimum VA%", () => {
    const result = calcItemIncentive("FANCY BANGLES", 7, 10, 1.0);
    expect(result).toBeCloseTo(40, 2); // 7 === 7, eligible
  });

  // MACHINE CHAIN: rate=3, minWastage=5
  it("applies 70% share for SP1 with partner", () => {
    const result = calcItemIncentive("MACHINE CHAIN", 5, 10, 0.7);
    expect(result).toBeCloseTo(21, 2); // 3 × 10 × 0.7
  });

  it("applies 30% share for SP2", () => {
    const result = calcItemIncentive("MACHINE CHAIN", 5, 10, 0.3);
    expect(result).toBeCloseTo(9, 2); // 3 × 10 × 0.3
  });

  it("applies 100% share for sole salesperson", () => {
    const result = calcItemIncentive("MACHINE CHAIN", 5, 10, 1.0);
    expect(result).toBeCloseTo(30, 2); // 3 × 10 × 1.0
  });

  it("returns 0 for unmapped/unknown product", () => {
    const result = calcItemIncentive("TOTALLY_UNKNOWN_PRODUCT_XYZ", 10, 10, 1.0);
    expect(result).toBe(0);
  });

  it("returns 0 for COINS (zero rate)", () => {
    const result = calcItemIncentive("COINS", 10, 10, 1.0);
    expect(result).toBe(0);
  });

  it("handles mapped product name (via PRODUCT_MAPPER)", () => {
    // VALAIYAM maps to FANCY BANGLES (rate=4, minWastage=7)
    const result = calcItemIncentive("VALAIYAM", 8, 10, 1.0);
    expect(result).toBeCloseTo(40, 2);
  });

  it("handles case-insensitive product name", () => {
    const result = calcItemIncentive("fancy bangles", 8, 10, 1.0);
    expect(result).toBeCloseTo(40, 2);
  });

  it("92.5-S upgrades to 92.5-L when net_wt >= 20g", () => {
    // 92.5-S: rate=5, 92.5-L: rate=3
    const small = calcItemIncentive("92.5-S", 1, 10, 1.0); // < 20g → rate 5
    const large = calcItemIncentive("92.5-S", 1, 25, 1.0); // >= 20g → rate 3
    expect(small).toBeCloseTo(50, 2); // 5 × 10
    expect(large).toBeCloseTo(75, 2); // 3 × 25
  });

  it("returns 0 for zero net weight", () => {
    const result = calcItemIncentive("FANCY BANGLES", 8, 0, 1.0);
    expect(result).toBe(0);
  });

  // DIAMOND STUD: rate=200, minWastage=1
  it("calculates high incentive for diamond items", () => {
    const result = calcItemIncentive("DIAMOND STUD", 2, 0.5, 1.0);
    expect(result).toBeCloseTo(100, 2); // 200 × 0.5 × 1.0
  });
});
