import { describe, it, expect } from "vitest";
import { computeLine, rateForMetal, distributeTotalByVa } from "@/lib/sales-calc";
import type { LineInput, BoardRate } from "@/lib/sales-calc";

const BOARD: BoardRate = {
  gold_22k: 7000,
  gold_24k: 7600,
  gold_18k: 5800,
  silver: 100,
  silver_pure: 95,
};

function baseItem(overrides: Partial<LineInput> = {}): LineInput {
  return {
    metal: "gold_22k",
    gross_wt: 10,
    stone_wt: 0,
    purity_pct: 91.6,
    rate: 7000,
    va_pct: 8,
    making_amt: 0,
    show_stone: false,
    stone_amt: 0,
    show_diamond: false,
    diamond_amt: 0,
    diamond_carat_rate: 0,
    diamond_cents: 0,
    gst_enabled: false,
    gst_pct: 3,
    ...overrides,
  };
}

describe("rateForMetal()", () => {
  it("returns gold 22k rate", () => {
    expect(rateForMetal(BOARD, "gold_22k")).toBe(7000);
  });
  it("returns silver rate", () => {
    expect(rateForMetal(BOARD, "silver")).toBe(100);
  });
  it("returns 0 for misc", () => {
    expect(rateForMetal(BOARD, "misc")).toBe(0);
  });
  it("returns 0 for null metal", () => {
    expect(rateForMetal(BOARD, null)).toBe(0);
  });
  it("uses silver rate for silver_mpr", () => {
    expect(rateForMetal(BOARD, "silver_mpr")).toBe(100);
  });
});

describe("computeLine()", () => {
  it("calculates net weight by subtracting stone weight", () => {
    const result = computeLine(baseItem({ gross_wt: 10, stone_wt: 1, show_stone: true }));
    expect(result.net_wt).toBe(9);
  });

  it("ignores stone weight when show_stone is false", () => {
    const result = computeLine(baseItem({ gross_wt: 10, stone_wt: 2, show_stone: false }));
    expect(result.net_wt).toBe(10);
  });

  it("calculates metal value: net_wt × rate", () => {
    const result = computeLine(baseItem({ gross_wt: 10, rate: 7000 }));
    expect(result.metal_value).toBe(70000);
  });

  it("calculates VA amount: metal_value × va_pct / 100", () => {
    const result = computeLine(baseItem({ gross_wt: 10, rate: 7000, va_pct: 8 }));
    expect(result.va_amt).toBeCloseTo(5600, 2); // 70000 × 8%
  });

  it("adds GST when enabled", () => {
    const result = computeLine(baseItem({ gross_wt: 10, rate: 7000, va_pct: 8, gst_enabled: true, gst_pct: 3 }));
    const beforeGst = 70000 + 5600; // metal + VA
    const gstAmt = beforeGst * 0.03;
    expect(result.gst_amt).toBeCloseTo(gstAmt, 1);
    expect(result.line_total).toBeCloseTo(beforeGst + gstAmt, 1);
  });

  it("no GST when disabled", () => {
    const result = computeLine(baseItem({ gross_wt: 10, rate: 7000, va_pct: 8, gst_enabled: false }));
    expect(result.gst_amt).toBe(0);
    expect(result.line_total).toBe(result.line_before_gst);
  });

  it("includes making amount in line total", () => {
    const result = computeLine(baseItem({ gross_wt: 10, rate: 7000, va_pct: 0, making_amt: 500 }));
    expect(result.line_total).toBe(70500); // 70000 + 0 VA + 500 making
  });

  it("adds stone amount when show_stone is true", () => {
    const result = computeLine(baseItem({ gross_wt: 10, show_stone: true, stone_amt: 1000 }));
    expect(result.line_total).toBeGreaterThan(result.metal_value + result.va_amt);
  });

  it("computes diamond amount from cents when cents > 0", () => {
    // 50 cents at rate 500000/carat = 50/100 * 500000 = 250000
    const result = computeLine(baseItem({
      show_diamond: true, diamond_cents: 50, diamond_carat_rate: 500000, diamond_amt: 0,
    }));
    expect(result.line_total).toBeGreaterThan(result.metal_value);
  });

  it("net_wt is never negative", () => {
    const result = computeLine(baseItem({ gross_wt: 1, stone_wt: 5, show_stone: true }));
    expect(result.net_wt).toBe(0);
  });

  it("calculates pure_wt: net_wt × purity_pct / 100", () => {
    const result = computeLine(baseItem({ gross_wt: 10, purity_pct: 91.6 }));
    expect(result.pure_wt).toBeCloseTo(9.16, 2);
  });
});

describe("distributeTotalByVa()", () => {
  it("returns original lines when current total is 0", () => {
    const line = { ...baseItem(), ...computeLine(baseItem({ rate: 0, va_pct: 0 })) };
    const result = distributeTotalByVa([line], 50000);
    expect(result).toHaveLength(1);
  });

  it("adjusts VA% to reach desired total", () => {
    const item = baseItem({ gross_wt: 10, rate: 7000, va_pct: 8 });
    const computed = computeLine(item);
    const line = { ...item, ...computed };
    const currentTotal = computed.line_total;
    const desiredTotal = currentTotal * 1.1; // 10% more

    const result = distributeTotalByVa([line], desiredTotal);
    const newComputed = computeLine(result[0]);
    expect(newComputed.line_total).toBeCloseTo(desiredTotal, 0);
  });
});
