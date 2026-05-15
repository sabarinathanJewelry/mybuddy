export type Metal = "gold_22k" | "gold_24k" | "gold_18k" | "silver" | "silver_pure" | "silver_mpr";

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
  show_stone: boolean;
  stone_amt: number;
  show_diamond: boolean;
  diamond_amt: number;
  diamond_carat_rate: number;
  diamond_cents: number;
  gst_enabled: boolean;
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
  if (metal === "silver_mpr") return board.silver ?? 0;
  return board[metal as keyof BoardRate] ?? 0;
}

export function computeLine(i: LineInput): LineComputed {
  const stone_wt_eff = i.show_stone ? i.stone_wt : 0;
  const stone_amt_eff = i.show_stone ? i.stone_amt : 0;
  // Diamond: compute from cents if cents > 0, else use direct diamond_amt
  const diamond_amt_eff = i.show_diamond
    ? (i.diamond_cents > 0 ? (i.diamond_cents / 100) * i.diamond_carat_rate : i.diamond_amt)
    : 0;
  const net_wt = Math.max(0, i.gross_wt - stone_wt_eff);
  const pure_wt = net_wt * (i.purity_pct / 100); // informational only — for stock tracking
  const metal_value = net_wt * i.rate; // rate is karat-specific, no purity conversion
  const va_amt = metal_value * (i.va_pct / 100);
  const gst_pct_eff = i.gst_enabled ? (i.gst_pct || 3) : 0;
  const line_before_gst = metal_value + va_amt + i.making_amt + stone_amt_eff + diamond_amt_eff;
  const gst_amt = line_before_gst * (gst_pct_eff / 100);
  const line_total = line_before_gst + gst_amt;
  return { net_wt, pure_wt, metal_value, va_amt, line_before_gst, gst_amt, line_total };
}

export function distributeTotalByVa(
  lines: (LineInput & LineComputed)[],
  desiredTotal: number
): LineInput[] {
  const currentTotal = lines.reduce((s, l) => s + l.line_total, 0);
  if (currentTotal === 0) return lines;
  const ratio = desiredTotal / currentTotal;
  return lines.map((l) => {
    const newTotal = l.line_total * ratio;
    const stone_amt_eff = l.show_stone ? l.stone_amt : 0;
    const diamond_amt_eff = l.show_diamond
      ? (l.diamond_cents > 0 ? (l.diamond_cents / 100) * l.diamond_carat_rate : l.diamond_amt)
      : 0;
    const base_excl_va = l.metal_value + l.making_amt + stone_amt_eff + diamond_amt_eff;
    const gst_pct_eff = l.gst_enabled ? (l.gst_pct || 3) : 0;
    const target_before_gst = newTotal / (1 + gst_pct_eff / 100);
    const new_va_amt = target_before_gst - base_excl_va;
    const new_va_pct = l.metal_value > 0 ? (new_va_amt / l.metal_value) * 100 : 0;
    return { ...l, va_pct: Math.max(0, new_va_pct) }; // full precision so computed total hits target exactly
  });
}
