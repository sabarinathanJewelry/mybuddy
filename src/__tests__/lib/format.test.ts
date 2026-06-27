import { describe, it, expect } from "vitest";
import { inr, grams, pct, pureWeight, purityToFraction, shortDate } from "@/lib/format";

describe("inr()", () => {
  it("formats zero", () => expect(inr(0)).toContain("0.00"));
  it("formats positive integer", () => {
    const result = inr(1000);
    expect(result).toContain("1,000.00");
  });
  it("formats lakhs in Indian style", () => {
    const result = inr(100000);
    expect(result).toContain("1,00,000.00");
  });
  it("formats with two decimal places", () => {
    const result = inr(1234.5);
    expect(result).toContain("1,234.50");
  });
  it("formats negative values", () => {
    const result = inr(-500);
    expect(result).toContain("500.00");
  });
});

describe("grams()", () => {
  it("formats with 3 decimal places by default", () => {
    expect(grams(10)).toBe("10.000g");
  });
  it("respects custom fraction digits", () => {
    expect(grams(10.5678, 2)).toBe("10.57g");
  });
  it("formats zero", () => {
    expect(grams(0)).toBe("0.000g");
  });
});

describe("pct()", () => {
  it("formats percentage with 2 decimal places", () => {
    expect(pct(7)).toBe("7.00%");
    expect(pct(91.6)).toBe("91.60%");
  });
});

describe("pureWeight()", () => {
  it("calculates pure weight from gross weight and purity", () => {
    expect(pureWeight(10, 91.6)).toBeCloseTo(9.16, 3);
  });
  it("returns 0 for 0 weight", () => {
    expect(pureWeight(0, 91.6)).toBe(0);
  });
  it("returns full weight at 100% purity", () => {
    expect(pureWeight(10, 100)).toBe(10);
  });
});

describe("purityToFraction()", () => {
  it("converts percentage to fraction", () => {
    expect(purityToFraction(91.6)).toBeCloseTo(0.916, 4);
    expect(purityToFraction(100)).toBe(1);
    expect(purityToFraction(0)).toBe(0);
  });
});

describe("shortDate()", () => {
  it("converts ISO to DD/MM/YYYY", () => {
    expect(shortDate("2026-06-27")).toBe("27/06/2026");
  });
  it("returns empty string for empty input", () => {
    expect(shortDate("")).toBe("");
  });
  it("handles year-end dates", () => {
    expect(shortDate("2026-12-31")).toBe("31/12/2026");
  });
  it("handles month start dates", () => {
    expect(shortDate("2026-01-01")).toBe("01/01/2026");
  });
});
