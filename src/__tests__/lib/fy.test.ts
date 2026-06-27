import { describe, it, expect } from "vitest";
import { fyForDate, billNoFor } from "@/lib/fy";

describe("fyForDate()", () => {
  it("April starts new FY", () => {
    expect(fyForDate("2026-04-01")).toBe("2026-27");
  });
  it("March is still old FY", () => {
    expect(fyForDate("2026-03-31")).toBe("2025-26");
  });
  it("mid-year returns correct FY", () => {
    expect(fyForDate("2026-06-27")).toBe("2026-27");
  });
  it("January is old FY", () => {
    expect(fyForDate("2026-01-15")).toBe("2025-26");
  });
  it("accepts Date objects", () => {
    expect(fyForDate(new Date("2025-04-01"))).toBe("2025-26");
  });
  it("last day of FY", () => {
    expect(fyForDate("2027-03-31")).toBe("2026-27");
  });
  it("first day of next FY", () => {
    expect(fyForDate("2027-04-01")).toBe("2027-28");
  });
});

describe("billNoFor()", () => {
  it("pads bill number to 4 digits", () => {
    expect(billNoFor("G22", "2026-27", 1)).toBe("G22/2026-27/0001");
  });
  it("handles 4-digit bill numbers", () => {
    expect(billNoFor("G22", "2026-27", 9999)).toBe("G22/2026-27/9999");
  });
  it("handles different series", () => {
    expect(billNoFor("S", "2025-26", 42)).toBe("S/2025-26/0042");
  });
  it("handles diamond series", () => {
    expect(billNoFor("D", "2026-27", 100)).toBe("D/2026-27/0100");
  });
});
