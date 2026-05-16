export type Metal = "gold_22k" | "gold_24k" | "gold_18k" | "silver" | "silver_pure" | "silver_mpr";
export type PaymentMode = "cash" | "upi" | "bank" | "old_gold" | "old_silver" | "advance";
export type SaleSeries = "G22" | "G18" | "G24" | "S" | "D";

export interface SaleItemDraft {
  id: string;
  description: string;
  metal: Metal | null;
  gross_wt: number;
  stone_wt: number;
  purity_pct: number;
  rate: number;
  va_pct: number;
  making_amt: number;
  // Stone section (togglable)
  show_stone: boolean;
  stone_amt: number;
  // Diamond section (togglable)
  show_diamond: boolean;
  diamond_amt: number;
  diamond_carat_rate: number;
  diamond_cents: number;
  // GST
  gst_enabled: boolean;
  gst_pct: number;
  // Silver MPR — value entered directly, weight optional
  is_value_entry: boolean;
  // Suspense
  is_suspense: boolean;
  supplier_id: string | null;
  supplier_name: string | null;
  // Computed
  net_wt: number;
  pure_wt: number;
  line_total: number;
}

export interface SalePaymentDraft {
  id: string;
  mode: PaymentMode;
  amount: number;
  metal_wt: number;
  metal_purity: number;
  is_advance: boolean;
}

export interface SaleDraft {
  series: SaleSeries;
  customer_id: string | null;
  bill_date: string;
  notes: string;
  items: SaleItemDraft[];
  payments: SalePaymentDraft[];
  // When payments exceed sale total (e.g. old gold > bill amount)
  change_due?: number;
  change_mode?: "cash_back" | "advance" | null;
  change_payout_mode?: "cash" | "bank";
}
