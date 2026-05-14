export type Metal = "gold_22k" | "gold_24k" | "gold_18k" | "silver" | "silver_pure";

export interface BoardRate {
  gold_22k: number;
  gold_24k: number;
  gold_18k: number;
  silver: number;
  silver_pure: number;
}

export interface LineInput {
  metal: Metal | null;
  gross_wt: number;
  stone_wt: number;
  purity_pct: number;
  rate: number;
  va_pct: number;
  making_amt: number;
  stone_amt: number;
  diamond_amt: number;
  gst_pct: number;
}

export interface LineComputed {
  net_wt: number;
  pure_wt: number;
  metal_value: number;
  va_amt: number;
  line_before_gst: number;
  gst_amt: number;
  line_total: number;
}

export function rateForMetal(board: BoardRate, metal: Metal | null): number {
  if (!metal) return 0;
  return board[metal] ?? 0;
}

export function computeLine(i: LineInput): LineComputed {
  const net_wt = Math.max(0, i.gross_wt - i.stone_wt);
  const pure_wt = net_wt * (i.purity_pct / 100);
  const metal_value = pure_wt * i.rate;
  const va_amt = metal_value * (i.va_pct / 100);
  const line_before_gst =
    metal_value + va_amt + i.making_amt + i.stone_amt + i.diamond_amt;
  const gst_amt = line_before_gst * (i.gst_pct / 100);
  const line_total = line_before_gst + gst_amt;
  return { net_wt, pure_wt, metal_value, va_amt, line_before_gst, gst_amt, line_total };
}

/**
 * Adjusts va_pct on each line proportionally so the grand total matches
 * a desired total entered by the user ("Distribute via VA").
 */
export function distributeTotalByVa(
  lines: (LineInput & LineComputed)[],
  desiredTotal: number
): LineInput[] {
  const currentTotal = lines.reduce((s, l) => s + l.line_total, 0);
  if (currentTotal === 0) return lines;
  const ratio = desiredTotal / currentTotal;

  return lines.map((l) => {
    const newTotal = l.line_total * ratio;
    // Back-calculate va_pct from newTotal
    // newTotal = (metal_value + va_amt + making + stone + diamond) * (1 + gst/100)
    const base_excl_va = l.metal_value + l.making_amt + l.stone_amt + l.diamond_amt;
    const target_before_gst = newTotal / (1 + l.gst_pct / 100);
    const new_va_amt = target_before_gst - base_excl_va;
    const new_va_pct = l.metal_value > 0 ? (new_va_amt / l.metal_value) * 100 : 0;
    return { ...l, va_pct: Math.max(0, new_va_pct) };
  });
}
